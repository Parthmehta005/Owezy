-- Group RPCs: create_group, invite_preview, join_group.
--
-- These are security definer because they do things RLS deliberately forbids
-- for direct writes (creating a group, linking a member to a user). Each one
-- checks the caller itself. Errors use SQLSTATE codes the app can branch on:
--   42501 not signed in / not allowed     22023 invalid input
--   23505 duplicate name / already taken  P0002 invite code not found
-- Messages match core/names.ts where the rule is the same.

-- ------------------------------------------------------------ helpers
create function private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- Trim a member name and check it like the members table does, but with
-- messages a person can act on.
create function private.clean_member_name(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  name text := btrim(coalesce(raw, ''));
begin
  if name = '' then
    raise exception 'Names cannot be empty.' using errcode = '22023';
  end if;
  if char_length(name) > 40 then
    raise exception 'Names can be at most 40 characters.' using errcode = '22023';
  end if;
  return name;
end;
$$;

revoke execute on function private.require_user() from public, anon;
revoke execute on function private.clean_member_name(text) from public, anon;
grant execute on function private.require_user() to authenticated;
grant execute on function private.clean_member_name(text) to authenticated;

-- ------------------------------------------------------------ create_group
-- Creates a group with the caller as its first member (named my_name) and
-- other_names as placeholders, in that order. Sets it as the caller's last
-- group. Returns the new group's id.
create function public.create_group(group_name text, my_name text, other_names text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  gname text := btrim(coalesce(group_name, ''));
  names text[];
  seen text[] := '{}';
  n text;
  gid uuid;
begin
  if gname = '' then
    raise exception 'Enter a group name.' using errcode = '22023';
  end if;
  if char_length(gname) > 60 then
    raise exception 'Group names can be at most 60 characters.' using errcode = '22023';
  end if;

  names := array[private.clean_member_name(my_name)];
  foreach n in array coalesce(other_names, '{}') loop
    names := names || private.clean_member_name(n);
  end loop;
  foreach n in array names loop
    if lower(n) = any(seen) then
      raise exception 'Duplicate name: %', n using errcode = '23505';
    end if;
    seen := seen || lower(n);
  end loop;

  insert into public.groups (name, created_by) values (gname, uid) returning id into gid;
  insert into public.members (group_id, display_name, user_id) values (gid, names[1], uid);
  -- One row at a time so sort_order follows the order the names were given.
  foreach n in array names[2:] loop
    insert into public.members (group_id, display_name) values (gid, n);
  end loop;

  update public.profiles set last_group_id = gid where id = uid;
  return gid;
end;
$$;

-- ------------------------------------------------------------ invite_preview
-- What the join screen shows before the caller is a member:
-- { group_id, group_name, already_member, unclaimed: [{ id, display_name }] }
-- in member order. Knowing the invite code is what grants this view.
create function public.invite_preview(code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  g public.groups;
begin
  select * into g from public.groups where invite_code = btrim(coalesce(code, ''));
  if not found then
    raise exception 'This invite link is not valid.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'group_id', g.id,
    'group_name', g.name,
    'already_member', exists (select 1 from public.members where group_id = g.id and user_id = uid),
    'unclaimed', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name) order by m.sort_order)
      from public.members m
      where m.group_id = g.id and m.user_id is null
    ), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------ join_group
-- Join through an invite code, either by claiming a placeholder
-- (claim_member_id) or as a new member (new_name); exactly one must be given.
-- Already a member: returns the group id and changes nothing. Sets the group
-- as the caller's last group. Returns the group's id.
create function public.join_group(code text, claim_member_id uuid default null, new_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  gid uuid;
  name text;
begin
  select id into gid from public.groups where invite_code = btrim(coalesce(code, ''));
  if gid is null then
    raise exception 'This invite link is not valid.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.members where group_id = gid and user_id = uid) then
    update public.profiles set last_group_id = gid where id = uid;
    return gid;
  end if;

  if (claim_member_id is null) = (new_name is null) then
    raise exception 'Choose an existing name or enter a new one.' using errcode = '22023';
  end if;

  if claim_member_id is not null then
    -- Atomic: of two people claiming the same name at once, only one wins.
    update public.members set user_id = uid
    where id = claim_member_id and group_id = gid and user_id is null;
    if not found then
      if exists (select 1 from public.members where id = claim_member_id and group_id = gid) then
        raise exception 'That name has already been claimed.' using errcode = '23505';
      end if;
      raise exception 'That name is not in this group.' using errcode = '22023';
    end if;
  else
    name := private.clean_member_name(new_name);
    if exists (select 1 from public.members where group_id = gid and lower(display_name) = lower(name)) then
      raise exception 'Duplicate name: %', name using errcode = '23505';
    end if;
    insert into public.members (group_id, display_name, user_id) values (gid, name, uid);
  end if;

  update public.profiles set last_group_id = gid where id = uid;
  return gid;
end;
$$;

-- ------------------------------------------------------------ who may call them
revoke execute on function public.create_group(text, text, text[]) from public, anon;
revoke execute on function public.invite_preview(text) from public, anon;
revoke execute on function public.join_group(text, uuid, text) from public, anon;
grant execute on function public.create_group(text, text, text[]) to authenticated;
grant execute on function public.invite_preview(text) to authenticated;
grant execute on function public.join_group(text, uuid, text) to authenticated;

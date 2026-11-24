-- M8: members' profile photos.
--
-- A member who has signed in shows their Google profile photo to fellow
-- members. It lives on the member row (fellow members can read members, but
-- not each other's profiles) and is kept in sync by triggers, so no RPC or
-- client ever writes it: users have no column grant on it.

alter table public.members
  add column avatar_url text
    check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 2048));

comment on column public.members.avatar_url is
  'Photo of the signed-in user behind this member (from their sign-in provider), or null. Set by triggers only.';

-- The photo a user's sign-in provider gave us, if it is an https URL.
create function private.user_avatar(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select url from (
    select coalesce(
      nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(u.raw_user_meta_data ->> 'picture', '')
    ) as url
    from auth.users u
    where u.id = target_user_id
  ) s
  where url ~ '^https://' and char_length(url) <= 2048;
$$;
revoke execute on function private.user_avatar(uuid) from public, anon, authenticated;

-- Whenever a member row gains, changes or loses its user (create group,
-- join as new, claim a name, leave), its photo follows.
create function private.sync_member_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.avatar_url := case when new.user_id is null then null else private.user_avatar(new.user_id) end;
  return new;
end;
$$;
revoke execute on function private.sync_member_avatar() from public, anon, authenticated;

create trigger members_sync_avatar
  before insert or update of user_id on public.members
  for each row execute function private.sync_member_avatar();

-- When a user's photo changes at the provider (it arrives on their next sign-in),
-- update it in every group they're in.
create function private.sync_user_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.members set avatar_url = private.user_avatar(new.id) where user_id = new.id;
  return new;
end;
$$;
revoke execute on function private.sync_user_avatar() from public, anon, authenticated;

create trigger on_auth_user_metadata_changed
  after update of raw_user_meta_data on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function private.sync_user_avatar();

-- Existing members.
update public.members set avatar_url = private.user_avatar(user_id) where user_id is not null;

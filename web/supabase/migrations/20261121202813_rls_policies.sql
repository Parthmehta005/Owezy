-- Row Level Security: who can read and change what through the API.
--
-- Rule of thumb: you can see a group and everything in it only if you are
-- one of its members (members.user_id = you). Expenses and shares are never
-- written directly; that goes through the RPCs, which validate the money.
-- Direct writes allowed here are limited to what the settings screen needs:
-- rename a group, add/remove placeholder names, leave a group, and edit
-- your own profile. Column grants stop other columns being changed.

-- ------------------------------------------------------------ helper
-- In a schema the API does not expose, so it can't be called as an RPC.
create schema if not exists private;
grant usage on schema private to authenticated;

-- security definer: reads members without going through members' own
-- policy (which calls this function), avoiding infinite recursion.
create function private.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members
    where group_id = target_group_id and user_id = (select auth.uid())
  );
$$;
revoke execute on function private.is_group_member(uuid) from public, anon;
grant execute on function private.is_group_member(uuid) to authenticated;

-- ------------------------------------------------------------ table privileges
-- Signed-out visitors get nothing. Signed-in users start from read-only and
-- get back only the specific writes below; RLS then limits which rows.
revoke all on public.profiles, public.groups, public.members, public.expenses, public.expense_shares from anon;
revoke insert, update, delete, truncate on public.profiles, public.groups, public.members, public.expenses, public.expense_shares from authenticated;
grant select on public.profiles, public.groups, public.members, public.expenses, public.expense_shares to authenticated;

grant update (display_name, last_group_id) on public.profiles to authenticated;
grant update (name) on public.groups to authenticated;
grant insert (group_id, display_name) on public.members to authenticated;
grant update (user_id) on public.members to authenticated;
grant delete on public.members to authenticated;

-- ------------------------------------------------------------ profiles
create policy "read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "update own profile, last group must be one of mine" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (last_group_id is null or private.is_group_member(last_group_id))
  );

-- ------------------------------------------------------------ groups
create policy "members read their groups" on public.groups
  for select to authenticated
  using (private.is_group_member(id));

create policy "members rename their groups" on public.groups
  for update to authenticated
  using (private.is_group_member(id))
  with check (private.is_group_member(id));

-- ------------------------------------------------------------ members
create policy "members read fellow members" on public.members
  for select to authenticated
  using (private.is_group_member(group_id));

-- Only placeholders (user_id null; the column grant excludes user_id anyway).
create policy "members add placeholders" on public.members
  for insert to authenticated
  with check (private.is_group_member(group_id) and user_id is null);

-- Only placeholders. Ones used by an expense are still protected by the FKs.
create policy "members remove placeholders" on public.members
  for delete to authenticated
  using (private.is_group_member(group_id) and user_id is null);

-- Leaving a group: clear your own user_id, turning your row into a
-- placeholder so expense history stays intact. Claiming a placeholder goes
-- through join_group instead, never through this policy.
create policy "members leave groups" on public.members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id is null);

-- ------------------------------------------------------------ expenses and shares (read-only)
create policy "members read expenses" on public.expenses
  for select to authenticated
  using (private.is_group_member(group_id));

create policy "members read shares" on public.expense_shares
  for select to authenticated
  using (private.is_group_member(group_id));

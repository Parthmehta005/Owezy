-- Row Level Security: members see only their groups; writes are limited.
-- Setup runs as the owner; each check switches to the `authenticated` role
-- with a JWT for one user, as the Supabase API would.
begin;
select plan(29);

-- A and D are in group 1, B is in group 2, C is in no group.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com');
insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Goa trip'),
  ('10000000-0000-0000-0000-000000000002', 'Flatmates');
insert into public.members (id, group_id, display_name, user_id) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'A', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', 'D', '00000000-0000-0000-0000-00000000000d'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Rahul', null),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Unused', null),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000002', 'B', '00000000-0000-0000-0000-00000000000b');
insert into public.expenses (id, group_id, description, payer_member_id, total_paise, split_type) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Dinner', '20000000-0000-0000-0000-00000000000a', 2000, 'equal'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Rent', '20000000-0000-0000-0000-00000000000b', 5000, 'equal');
insert into public.expense_shares (expense_id, group_id, member_id, share_paise) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 1000),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1000),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000b', 5000);

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- ------------------------------------------------ reading, as A
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

select results_eq('select name from public.groups', $$values ('Goa trip')$$, 'A sees only their group');
select is((select count(*)::int from public.members), 4, 'A sees the 4 members of their group only');
select results_eq('select description from public.expenses', $$values ('Dinner')$$, 'A sees only their group''s expenses');
select is((select count(*)::int from public.expense_shares), 2, 'A sees only their group''s shares');
select results_eq('select id from public.profiles', $$values ('00000000-0000-0000-0000-00000000000a'::uuid)$$, 'A sees only their own profile');

-- ------------------------------------------------ reading, as C (in no group)
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.groups), 0, 'non-member sees no groups');
select is((select count(*)::int from public.members), 0, 'non-member sees no members');
select is((select count(*)::int from public.expenses), 0, 'non-member sees no expenses');
select is((select count(*)::int from public.expense_shares), 0, 'non-member sees no shares');

-- ------------------------------------------------ writes C must not be able to make
select throws_ok($$insert into public.members (group_id, display_name) values ('10000000-0000-0000-0000-000000000001', 'Sneaky')$$,
  '42501', null, 'non-member cannot add a member');
update public.groups set name = 'Hacked' where id = '10000000-0000-0000-0000-000000000001';
delete from public.members where id = '20000000-0000-0000-0000-000000000002';

-- ------------------------------------------------ expenses are never written directly, as A
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select throws_ok($$insert into public.expenses (group_id, description, payer_member_id, total_paise, split_type)
  values ('10000000-0000-0000-0000-000000000001', 'Direct', '20000000-0000-0000-0000-00000000000a', 100, 'equal')$$,
  '42501', null, 'member cannot insert an expense directly');
select throws_ok($$update public.expenses set total_paise = 1 where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'member cannot update an expense directly');
select throws_ok($$delete from public.expenses where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'member cannot delete an expense directly');
select throws_ok($$update public.expense_shares set share_paise = 0 where expense_id = '30000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'member cannot change shares directly');
select throws_ok($$update public.groups set invite_code = 'chosen-code1' where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'member cannot change the invite code');

-- ------------------------------------------------ allowed writes, as A
select lives_ok($$update public.groups set name = 'Goa 2026' where id = '10000000-0000-0000-0000-000000000001'$$,
  'member can rename their group');
update public.groups set name = 'Hacked' where id = '10000000-0000-0000-0000-000000000002';  -- not A's: no rows
select lives_ok($$insert into public.members (group_id, display_name) values ('10000000-0000-0000-0000-000000000001', 'Neha')$$,
  'member can add a placeholder');
select throws_ok($$insert into public.members (group_id, display_name) values ('10000000-0000-0000-0000-000000000002', 'Neha')$$,
  '42501', null, 'member cannot add people to another group');
select throws_ok($$insert into public.members (group_id, display_name, user_id) values ('10000000-0000-0000-0000-000000000001', 'Me2', '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'member cannot insert a member linked to a user');
delete from public.members where id = '20000000-0000-0000-0000-000000000002';  -- unused placeholder: allowed
delete from public.members where id = '20000000-0000-0000-0000-00000000000d';  -- joined member: no rows
update public.members set user_id = null where id = '20000000-0000-0000-0000-00000000000d';  -- not A's row: no rows
update public.members set user_id = '00000000-0000-0000-0000-00000000000a' where id = '20000000-0000-0000-0000-000000000001';  -- claim attempt: no rows
select throws_ok($$update public.profiles set last_group_id = '10000000-0000-0000-0000-000000000002' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'last_group_id must be a group the user is in');
select lives_ok($$update public.profiles set last_group_id = '10000000-0000-0000-0000-000000000001' where id = '00000000-0000-0000-0000-00000000000a'$$,
  'user can set last_group_id to their own group');

-- ------------------------------------------------ check what actually changed, as owner
reset role;
select is((select name from public.groups where id = '10000000-0000-0000-0000-000000000001'), 'Goa 2026', 'only the member''s rename took effect');
select is((select name from public.groups where id = '10000000-0000-0000-0000-000000000002'), 'Flatmates', 'renaming another group changed nothing');
select ok(not exists (select 1 from public.members where id = '20000000-0000-0000-0000-000000000002'), 'unused placeholder was removed');
select is((select user_id from public.members where id = '20000000-0000-0000-0000-00000000000d'),
  '00000000-0000-0000-0000-00000000000d'::uuid, 'another joined member could not be removed or unlinked');
select is((select user_id from public.members where id = '20000000-0000-0000-0000-000000000001'),
  null, 'a placeholder cannot be claimed by direct update');

-- ------------------------------------------------ leaving, as A
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.members set user_id = null where user_id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.groups), 0, 'after leaving, A no longer sees the group');

-- ------------------------------------------------ signed-out visitors
reset role;
set local role anon;
select throws_ok('select count(*) from public.groups', '42501', null, 'signed-out visitors cannot read groups');
reset role;
select is((select display_name from public.members where id = '20000000-0000-0000-0000-00000000000a'), 'A',
  'leaving keeps the member row as a placeholder for expense history');

select * from finish();
rollback;

-- Schema rules: constraints, keys, cascades and the sign-up trigger.
-- Runs as the table owner, so RLS does not apply here (see the RLS tests).
begin;
select plan(23);

-- Users (the trigger should create their profiles).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'asha@example.com', '{"full_name": "Asha Rao"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bilal@example.com', '{}');

-- 1-5: RLS is enabled on every table.
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.groups'::regclass), 'RLS on groups');
select ok((select relrowsecurity from pg_class where oid = 'public.members'::regclass), 'RLS on members');
select ok((select relrowsecurity from pg_class where oid = 'public.expenses'::regclass), 'RLS on expenses');
select ok((select relrowsecurity from pg_class where oid = 'public.expense_shares'::regclass), 'RLS on expense_shares');

-- 6-7: profile trigger.
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Asha Rao', 'profile takes full_name from sign-up metadata');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'bilal', 'profile falls back to the email name');

-- Two groups with members.
insert into public.groups (id, name, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'Goa trip', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000002', 'Flatmates', '00000000-0000-0000-0000-00000000000b');
insert into public.members (id, group_id, display_name, user_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Asha', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Rahul', null),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Neha', null),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'Bilal', '00000000-0000-0000-0000-00000000000b');

-- 8: invite codes are 12 URL-safe characters.
select ok((select bool_and(invite_code ~ '^[A-Za-z0-9_-]{12}$') from public.groups), 'invite codes are 12 URL-safe chars');

-- 9: member order is strictly increasing even within one transaction.
select ok((
  select bool_and(sort_order > prev) from (
    select sort_order, lag(sort_order) over (order by sort_order) as prev
    from public.members where group_id = '10000000-0000-0000-0000-000000000001'
  ) t where prev is not null
), 'sort_order strictly increases');

-- 10: duplicate names are rejected regardless of capitals.
select throws_ok(
  $$insert into public.members (group_id, display_name) values ('10000000-0000-0000-0000-000000000001', 'rAHUL')$$,
  '23505', null, 'duplicate member name (different case) is rejected');

-- 11: the same name is fine in a different group.
select lives_ok(
  $$insert into public.members (group_id, display_name) values ('10000000-0000-0000-0000-000000000002', 'Rahul')$$,
  'same name in another group is allowed');

-- 12: a user can be in a group only once.
select throws_ok(
  $$insert into public.members (group_id, display_name, user_id) values ('10000000-0000-0000-0000-000000000001', 'Asha2', '00000000-0000-0000-0000-00000000000a')$$,
  '23505', null, 'a user cannot join the same group twice');

-- 13: names must be trimmed and non-empty.
select throws_ok(
  $$insert into public.members (group_id, display_name) values ('10000000-0000-0000-0000-000000000001', ' Zoya')$$,
  '23514', null, 'untrimmed member name is rejected');

-- An expense in group 1: Asha paid 900.00 for Asha + Rahul + Neha.
insert into public.expenses (id, group_id, description, payer_member_id, total_paise, split_type) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Dinner',
   '20000000-0000-0000-0000-000000000001', 90000, 'equal');
insert into public.expense_shares (expense_id, group_id, member_id, share_paise) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 30000),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 30000),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 30000);

-- 14: payer must belong to the expense's group.
select throws_ok(
  $$insert into public.expenses (group_id, description, payer_member_id, total_paise, split_type)
    values ('10000000-0000-0000-0000-000000000001', 'Cab', '20000000-0000-0000-0000-000000000009', 100, 'equal')$$,
  '23503', null, 'payer from another group is rejected');

-- 15: a share's member must belong to the expense's group.
select throws_ok(
  $$insert into public.expense_shares (expense_id, group_id, member_id, share_paise)
    values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000009', 0)$$,
  '23503', null, 'share for a member of another group is rejected');

-- 16: a share cannot claim a different group than its expense.
select throws_ok(
  $$insert into public.expense_shares (expense_id, group_id, member_id, share_paise)
    values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000009', 0)$$,
  '23503', null, 'share pointing at an expense of another group is rejected');

-- 17-18: money checks.
select throws_ok(
  $$insert into public.expenses (group_id, description, payer_member_id, total_paise, split_type)
    values ('10000000-0000-0000-0000-000000000001', 'Free', '20000000-0000-0000-0000-000000000001', 0, 'equal')$$,
  '23514', null, 'zero total is rejected');
select throws_ok(
  $$update public.expense_shares set share_paise = -1 where member_id = '20000000-0000-0000-0000-000000000002'$$,
  '23514', null, 'negative share is rejected');

-- 19: a member used by an expense cannot be deleted.
select throws_ok(
  $$delete from public.members where id = '20000000-0000-0000-0000-000000000002'$$,
  '23503', null, 'deleting a member used by an expense is blocked');

-- 20: a group with members or expenses cannot be deleted directly.
select throws_ok(
  $$delete from public.groups where id = '10000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'deleting a group that still has members/expenses is blocked');

-- 21: an empty group can be deleted.
insert into public.groups (id, name) values ('10000000-0000-0000-0000-000000000003', 'Empty');
select lives_ok(
  $$delete from public.groups where id = '10000000-0000-0000-0000-000000000003'$$,
  'an empty group can be deleted');

-- 22: deleting an expense removes its shares.
delete from public.expenses where id = '30000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.expense_shares where expense_id = '30000000-0000-0000-0000-000000000001'),
  0, 'deleting an expense cascades to its shares');

-- 23: deleting a user keeps their member row as a placeholder.
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
select is((select user_id from public.members where id = '20000000-0000-0000-0000-000000000009'),
  null, 'deleting a user turns their member into a placeholder');

select * from finish();
rollback;

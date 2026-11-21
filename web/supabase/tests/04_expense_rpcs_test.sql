-- create_expense, update_expense, delete_expense, restore_expense.
begin;
select plan(37);

-- Asha is in group 1 (with placeholders Rahul and Neha); Bilal is in group 2.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'asha@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bilal@example.com');
insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Goa trip'),
  ('10000000-0000-0000-0000-000000000002', 'Flatmates');
insert into public.members (id, group_id, display_name, user_id) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Asha', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Rahul', null),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Neha', null),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000002', 'Bilal', '00000000-0000-0000-0000-00000000000b');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

-- Shorthands for the ids used below.
create function pg_temp.g1() returns uuid language sql as $$ select '10000000-0000-0000-0000-000000000001'::uuid $$;
create function pg_temp.asha() returns uuid language sql as $$ select '20000000-0000-0000-0000-00000000000a'::uuid $$;
create function pg_temp.rahul() returns uuid language sql as $$ select '20000000-0000-0000-0000-000000000001'::uuid $$;
create function pg_temp.neha() returns uuid language sql as $$ select '20000000-0000-0000-0000-000000000002'::uuid $$;
create function pg_temp.bilal() returns uuid language sql as $$ select '20000000-0000-0000-0000-00000000000b'::uuid $$;
create function pg_temp.equal900() returns jsonb language sql as $$
  select jsonb_build_object(pg_temp.asha(), 30000, pg_temp.rahul(), 30000, pg_temp.neha(), 30000)
$$;
create function pg_temp.e() returns uuid language sql as $$ select v::uuid from ctx where k = 'e' $$;

set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

-- ------------------------------------------------ create_expense
select lives_ok($$insert into ctx select 'e', (public.create_expense(pg_temp.g1(), ' Dinner ', pg_temp.asha(), 90000, 'equal', pg_temp.equal900())).id$$,
  'create_expense succeeds');
select results_eq($$select description, total_paise, split_type, version, created_by from public.expenses where id = pg_temp.e()$$,
  $$values ('Dinner', 90000::bigint, 'equal', 1, '00000000-0000-0000-0000-00000000000a'::uuid)$$,
  'expense is stored with a trimmed description, version 1 and the caller as creator');
select results_eq($$select member_id, share_paise from public.expense_shares where expense_id = pg_temp.e() order by share_paise, member_id$$,
  $$values (pg_temp.rahul(), 30000::bigint), (pg_temp.neha(), 30000::bigint), (pg_temp.asha(), 30000::bigint)$$,
  'shares are stored');
select lives_ok($$select public.create_expense(pg_temp.g1(), 'Gift', pg_temp.asha(), 1000, 'unequal',
    jsonb_build_object(pg_temp.rahul(), 1000, pg_temp.neha(), 0))$$,
  'zero shares and a payer who is not sharing are allowed');

-- Every money rule.
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', jsonb_build_object(pg_temp.asha(), 400, pg_temp.rahul(), 500))$$,
  '22023', 'Shares must add up exactly to the total.', 'shares that are short are rejected');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', jsonb_build_object(pg_temp.asha(), 600, pg_temp.rahul(), 500))$$,
  '22023', 'Shares must add up exactly to the total.', 'shares that are over are rejected');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', '{}')$$,
  '22023', 'Select at least one participant.', 'no shares is rejected');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', jsonb_build_object(pg_temp.asha(), 1500, pg_temp.rahul(), -500))$$,
  '22023', null, 'a negative share is rejected even if the sum is right');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', jsonb_build_object(pg_temp.asha(), 500.5, pg_temp.rahul(), 499.5))$$,
  '22023', null, 'fractional paise are rejected');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', jsonb_build_object(pg_temp.asha(), '1000'))$$,
  '22023', 'Each share must be a number of paise.', 'a share given as a string is rejected');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', '{"not-a-uuid": 1000}')$$,
  '22023', 'A share has an invalid member id.', 'an invalid member id is rejected');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', '[1000]')$$,
  '22023', null, 'shares that are not an object are rejected');

-- Members of another group.
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', jsonb_build_object(pg_temp.asha(), 500, pg_temp.bilal(), 500))$$,
  '22023', 'A share is for someone who is not in this group.', 'a share for a member of another group is rejected');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.bilal(), 1000, 'unequal', jsonb_build_object(pg_temp.asha(), 1000))$$,
  '22023', 'The payer is not in this group.', 'a payer from another group is rejected');

-- Other fields.
select throws_ok($$select public.create_expense(pg_temp.g1(), '  ', pg_temp.asha(), 1000, 'unequal', jsonb_build_object(pg_temp.asha(), 1000))$$,
  '22023', 'Enter a description.', 'blank description is rejected');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 0, 'unequal', '{}')$$,
  '22023', 'Amount must be greater than 0.', 'zero total is rejected');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'halves', jsonb_build_object(pg_temp.asha(), 1000))$$,
  '22023', null, 'an unknown split type is rejected');
select is((select count(*)::int from public.expenses), 2, 'no rejected call left an expense behind');

-- ------------------------------------------------ update_expense
select is(
  (public.update_expense(pg_temp.e(), 1, 'Dinner at Toit', pg_temp.rahul(), 90000, 'unequal',
     jsonb_build_object(pg_temp.asha(), 60000, pg_temp.rahul(), 30000))).version,
  2, 'update with the current version succeeds and bumps the version');
select results_eq($$select description, payer_member_id, split_type from public.expenses where id = pg_temp.e()$$,
  $$values ('Dinner at Toit', pg_temp.rahul(), 'unequal')$$, 'update changes the fields');
select results_eq($$select member_id, share_paise from public.expense_shares where expense_id = pg_temp.e() order by share_paise$$,
  $$values (pg_temp.rahul(), 30000::bigint), (pg_temp.asha(), 60000::bigint)$$, 'update replaces the shares (Neha''s is gone)');
select ok((select updated_at >= created_at from public.expenses where id = pg_temp.e()), 'updated_at is set');

select throws_ok($$select public.update_expense(pg_temp.e(), 1, 'Stale', pg_temp.asha(), 90000, 'equal', pg_temp.equal900())$$,
  'PT409', 'This was changed by someone else.', 'an update based on an old version is rejected');
select throws_ok($$select public.update_expense(pg_temp.e(), 2, 'Bad', pg_temp.asha(), 90000, 'unequal', jsonb_build_object(pg_temp.asha(), 1))$$,
  '22023', null, 'an update with bad shares is rejected');
select results_eq($$select description, version from public.expenses where id = pg_temp.e()$$,
  $$values ('Dinner at Toit', 2)$$, 'rejected updates changed nothing');
select is((select count(*)::int from public.expense_shares where expense_id = pg_temp.e()), 2, 'rejected updates kept the old shares');
select throws_ok($$select public.update_expense('30000000-0000-0000-0000-00000000ffff', 1, 'X', pg_temp.asha(), 100, 'unequal', '{}')$$,
  'P0002', null, 'updating an unknown expense is rejected');

-- ------------------------------------------------ someone outside the group, as Bilal
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', jsonb_build_object(pg_temp.asha(), 1000))$$,
  '42501', null, 'a non-member cannot add an expense');
select throws_ok($$select public.update_expense(pg_temp.e(), 2, 'X', pg_temp.asha(), 90000, 'equal', pg_temp.equal900())$$,
  '42501', null, 'a non-member cannot update an expense');
select throws_ok($$select public.delete_expense(pg_temp.e())$$, '42501', null, 'a non-member cannot delete an expense');

-- ------------------------------------------------ delete / restore, as Asha
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select ok((public.delete_expense(pg_temp.e())).deleted_at is not null, 'delete marks the expense deleted');
select is((public.delete_expense(pg_temp.e())).version, 3, 'deleting again changes nothing');
select throws_ok($$select public.update_expense(pg_temp.e(), 3, 'X', pg_temp.asha(), 90000, 'equal', pg_temp.equal900())$$,
  'P0002', 'This expense no longer exists.', 'a deleted expense cannot be updated');
select results_eq($$select (public.restore_expense(pg_temp.e())).deleted_at is null, (select count(*)::int from public.expense_shares where expense_id = pg_temp.e())$$,
  $$values (true, 2)$$, 'restore brings the expense back with its shares');
select is((select version from public.expenses where id = pg_temp.e()), 4, 'delete and restore each bump the version');

-- ------------------------------------------------ signed out
reset role;
set local role anon;
select throws_ok($$select public.create_expense(pg_temp.g1(), 'X', pg_temp.asha(), 1000, 'unequal', '{}')$$,
  '42501', null, 'signed-out visitors cannot call create_expense');
reset role;
select throws_ok($$set local role authenticated; select private.write_shares(null, null, null, 0, null)$$,
  '42501', null, 'the private helpers cannot be called directly');

select * from finish();
rollback;

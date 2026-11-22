-- expense_date and retry-safe create_expense (client-supplied ids).
begin;
select plan(18);

-- Asha and Bilal are in group 1; Zed is in group 2.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'asha@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bilal@example.com'),
  ('00000000-0000-0000-0000-00000000000f', 'zed@example.com');
insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Goa trip'),
  ('10000000-0000-0000-0000-000000000002', 'Flatmates');
insert into public.members (id, group_id, display_name, user_id) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Asha', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'Bilal', '00000000-0000-0000-0000-00000000000b'),
  ('20000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000002', 'Zed', '00000000-0000-0000-0000-00000000000f');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.g1() returns uuid language sql as $$ select '10000000-0000-0000-0000-000000000001'::uuid $$;
create function pg_temp.asha() returns uuid language sql as $$ select '20000000-0000-0000-0000-00000000000a'::uuid $$;
create function pg_temp.bilal() returns uuid language sql as $$ select '20000000-0000-0000-0000-00000000000b'::uuid $$;
create function pg_temp.half(total bigint) returns jsonb language sql as $$
  select jsonb_build_object(pg_temp.asha(), total / 2, pg_temp.bilal(), total - total / 2)
$$;
create function pg_temp.india_today() returns date language sql as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
-- A fixed id the "phone" generated.
create function pg_temp.eid() returns uuid language sql as $$ select '30000000-0000-0000-0000-0000000000e1'::uuid $$;

set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

-- ------------------------------------------------ dates
select is((public.create_expense(pg_temp.g1(), 'No date', pg_temp.asha(), 1000, 'equal', pg_temp.half(1000))).expense_date,
  pg_temp.india_today(), 'expense_date defaults to today in India time');
select is((public.create_expense(pg_temp.g1(), 'Yesterday', pg_temp.asha(), 1000, 'equal', pg_temp.half(1000), null, pg_temp.india_today() - 1)).expense_date,
  pg_temp.india_today() - 1, 'an explicit date is stored');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'Old', pg_temp.asha(), 1000, 'equal', pg_temp.half(1000), null, date '1999-12-31')$$,
  '22023', 'Choose a date between 2000 and one year from today.', 'a date before 2000 is rejected');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'Far', pg_temp.asha(), 1000, 'equal', pg_temp.half(1000), null, pg_temp.india_today() + 400)$$,
  '22023', null, 'a date more than a year ahead is rejected');

-- ------------------------------------------------ retries with a client id
select is((public.create_expense(pg_temp.g1(), 'Dinner', pg_temp.asha(), 9000, 'equal', pg_temp.half(9000), pg_temp.eid())).id,
  pg_temp.eid(), 'the phone-generated id is used');
select is((public.create_expense(pg_temp.g1(), 'Dinner', pg_temp.asha(), 9000, 'equal', pg_temp.half(9000), pg_temp.eid())).id,
  pg_temp.eid(), 'a retry with the same id returns the same expense');
select is((select count(*)::int from public.expenses where id = pg_temp.eid()), 1, 'the retry did not create a second expense');
select is((select count(*)::int from public.expense_shares where expense_id = pg_temp.eid()), 2, 'the retry did not duplicate the shares');
select is((public.create_expense(pg_temp.g1(), 'Different text', pg_temp.asha(), 1, 'equal', pg_temp.half(1), pg_temp.eid())).description,
  'Dinner', 'a retry never overwrites the saved expense');
select is((select version from public.expenses where id = pg_temp.eid()), 1, 'retries do not bump the version');

-- Someone else reusing that id is refused (whether or not they can see it).
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'Mine', pg_temp.bilal(), 1000, 'equal', pg_temp.half(1000), pg_temp.eid())$$,
  '23505', 'That expense id is already in use.', 'another member cannot reuse an existing id');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select throws_ok($$select public.create_expense('10000000-0000-0000-0000-000000000002', 'Mine', '20000000-0000-0000-0000-00000000000f', 1000, 'equal',
    jsonb_build_object('20000000-0000-0000-0000-00000000000f', 1000), pg_temp.eid())$$,
  '23505', null, 'an id from another group cannot be reused');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select public.create_expense(pg_temp.g1(), 'Bad retry', pg_temp.asha(), 1000, 'equal', pg_temp.half(999), '30000000-0000-0000-0000-0000000000e2')$$,
  '22023', null, 'a new id still goes through every money check');
select is((select count(*)::int from public.expenses where id = '30000000-0000-0000-0000-0000000000e2'), 0, 'and leaves nothing behind when rejected');

-- ------------------------------------------------ update_expense and the date
select is((public.update_expense(pg_temp.eid(), 1, 'Dinner', pg_temp.asha(), 9000, 'equal', pg_temp.half(9000), pg_temp.india_today() - 3)).expense_date,
  pg_temp.india_today() - 3, 'update can change the date');
select is((public.update_expense(pg_temp.eid(), 2, 'Dinner!', pg_temp.asha(), 9000, 'equal', pg_temp.half(9000))).expense_date,
  pg_temp.india_today() - 3, 'update without a date keeps it');
select throws_ok($$select public.update_expense(pg_temp.eid(), 3, 'Dinner', pg_temp.asha(), 9000, 'equal', pg_temp.half(9000), date '1990-01-01')$$,
  '22023', null, 'update rejects an invalid date');
select is((select version from public.expenses where id = pg_temp.eid()), 3, 'the rejected update changed nothing');

select * from finish();
rollback;

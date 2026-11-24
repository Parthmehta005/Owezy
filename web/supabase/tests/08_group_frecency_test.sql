-- record_group_open: the "most used, weighted to recent" score behind the default group.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'asha@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bilal@example.com');
insert into public.groups (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Goa trip'),
  ('10000000-0000-0000-0000-000000000002', 'Flatmates');
insert into public.members (id, group_id, display_name, user_id) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'Asha', '00000000-0000-0000-0000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'Bilal', '00000000-0000-0000-0000-00000000000b'),
  ('20000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', 'Asha', '00000000-0000-0000-0000-00000000000a');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.score(member uuid) returns double precision language sql as $$
  select open_score from public.members where id = member
$$;

set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

select lives_ok($$select public.record_group_open('10000000-0000-0000-0000-000000000001')$$, 'a member can record opening their group');
select is(pg_temp.score('20000000-0000-0000-0000-00000000000a'), 1::double precision, 'the first open scores 1');
select is(pg_temp.score('20000000-0000-0000-0000-00000000000b'), 0::double precision, 'only the opener''s own row changes');

select public.record_group_open('10000000-0000-0000-0000-000000000001');
select ok(pg_temp.score('20000000-0000-0000-0000-00000000000a') between 0.999 and 1.0, 're-opening within 30 minutes does not add another point');

-- Pretend the last open was 7 days ago with a score of 4: it decays to 2, plus 1.
reset role;
update public.members set open_score = 4, opened_at = now() - interval '7 days' where id = '20000000-0000-0000-0000-00000000000a';
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.record_group_open('10000000-0000-0000-0000-000000000001');
select ok(abs(pg_temp.score('20000000-0000-0000-0000-00000000000a') - 3) < 0.001, 'a week-old score halves before the new open adds 1');

-- Not a member: refused.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select throws_ok($$select public.record_group_open('10000000-0000-0000-0000-000000000002')$$,
  '42501', 'You are not in this group.', 'a non-member cannot record an open');
select is((select opened_at from public.members where id = '20000000-0000-0000-0000-0000000000a2'), null::timestamptz,
  'and nothing changed in that group');

-- Scores can't be set directly.
select throws_ok($$update public.members set open_score = 1000 where id = '20000000-0000-0000-0000-00000000000b'$$,
  '42501', null, 'users cannot write their score directly');

select ok(not has_function_privilege('anon', 'public.record_group_open(uuid)', 'execute'), 'signed-out visitors cannot call it');

select * from finish();
rollback;

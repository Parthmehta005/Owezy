-- create_group, invite_preview and join_group, called as real users.
begin;
select plan(35);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'asha@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bilal@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'chitra@example.com');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
-- Scratch space shared between roles (pg_temp tables are per session).
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

set local role authenticated;

-- ------------------------------------------------ create_group, as Asha
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select lives_ok($$insert into ctx values ('g', public.create_group(' Goa trip ', 'Asha', array['Rahul', ' Neha ']))$$,
  'create_group succeeds');

select results_eq($$select name from public.groups$$, $$values ('Goa trip')$$, 'group name is trimmed and visible to its creator');
select results_eq(
  $$select display_name, user_id from public.members order by sort_order$$,
  $$values ('Asha', '00000000-0000-0000-0000-00000000000a'::uuid), ('Rahul', null::uuid), ('Neha', null::uuid)$$,
  'creator first and linked; others are placeholders, in the order given');
select is((select last_group_id::text from public.profiles), (select v from ctx where k = 'g'), 'new group becomes the creator''s last group');
select is((select created_by from public.groups), '00000000-0000-0000-0000-00000000000a'::uuid, 'created_by is the caller');

select lives_ok($$select public.create_group('Solo', 'Asha')$$, 'a group with just the creator is allowed');

select throws_ok($$select public.create_group('X', 'Asha', array['Rahul', 'rahul'])$$, '23505', 'Duplicate name: rahul', 'duplicate placeholder names are rejected ignoring case');
select throws_ok($$select public.create_group('X', 'Asha', array['ASHA'])$$, '23505', 'Duplicate name: ASHA', 'a placeholder cannot reuse the creator''s name');
select throws_ok($$select public.create_group('  ', 'Asha')$$, '22023', 'Enter a group name.', 'blank group name is rejected');
select throws_ok($$select public.create_group('X', 'Asha', array['  '])$$, '22023', 'Names cannot be empty.', 'blank member name is rejected');
select throws_ok($$select public.create_group('X', '')$$, '22023', 'Names cannot be empty.', 'blank creator name is rejected');
select throws_ok($$select public.create_group(repeat('g', 61), 'Asha')$$, '22023', null, 'over-long group name is rejected');
select throws_ok($$select public.create_group('X', repeat('n', 41))$$, '22023', null, 'over-long member name is rejected');

-- Remember the invite code and the member ids, as the owner.
reset role;
insert into ctx select 'code', invite_code from public.groups where id = (select v::uuid from ctx where k = 'g');
insert into ctx select 'rahul', id::text from public.members where display_name = 'Rahul' and group_id = (select v::uuid from ctx where k = 'g');
insert into ctx select 'solo_member', m.id::text from public.members m join public.groups g on g.id = m.group_id where g.name = 'Solo' and g.created_by = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;

-- ------------------------------------------------ invite_preview, as Bilal (not a member yet)
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.groups), 0, 'Bilal cannot see the group before joining');
insert into ctx select 'preview', public.invite_preview((select v from ctx where k = 'code'))::text;
select is((select v::jsonb ->> 'group_name' from ctx where k = 'preview'), 'Goa trip', 'preview shows the group name');
select is((select v::jsonb ->> 'group_id' from ctx where k = 'preview'), (select v from ctx where k = 'g'), 'preview shows the group id');
select is((select (v::jsonb ->> 'already_member')::boolean from ctx where k = 'preview'), false, 'preview says Bilal is not a member yet');
select is(
  (select array(select x ->> 'display_name' from jsonb_array_elements(v::jsonb -> 'unclaimed') x) from ctx where k = 'preview'),
  array['Rahul', 'Neha'], 'preview lists unclaimed names in member order, not the creator');
select is((select v::jsonb -> 'unclaimed' -> 0 ->> 'id' from ctx where k = 'preview'), (select v from ctx where k = 'rahul'),
  'preview gives the placeholder ids to claim');
select throws_ok($$select public.invite_preview('not-a-code')$$, 'P0002', 'This invite link is not valid.', 'unknown invite code is rejected');

-- ------------------------------------------------ join_group
select throws_ok($$select public.join_group((select v from ctx where k = 'code'))$$, '22023', null, 'must choose a name to claim or a new name');
select throws_ok($$select public.join_group((select v from ctx where k = 'code'), (select v::uuid from ctx where k = 'rahul'), 'Bilal')$$, '22023', null, 'cannot give both a claim and a new name');
select throws_ok($$select public.join_group((select v from ctx where k = 'code'), (select v::uuid from ctx where k = 'solo_member'))$$,
  '22023', 'That name is not in this group.', 'cannot claim a member of a different group');
select throws_ok($$select public.join_group('not-a-code', null, 'Bilal')$$, 'P0002', null, 'join with unknown code is rejected');

select is(public.join_group((select v from ctx where k = 'code'), (select v::uuid from ctx where k = 'rahul')),
  (select v::uuid from ctx where k = 'g'), 'Bilal claims Rahul and gets the group id back');
select is((select user_id from public.members where display_name = 'Rahul'), '00000000-0000-0000-0000-00000000000b'::uuid, 'the claimed placeholder is now linked to Bilal');
select is((select count(*)::int from public.members), 3, 'Bilal now sees the group''s members');
select is((select last_group_id::text from public.profiles), (select v from ctx where k = 'g'), 'joined group becomes Bilal''s last group');
select is(public.join_group((select v from ctx where k = 'code'), null, 'Someone else'), (select v::uuid from ctx where k = 'g'),
  'joining again as a member is a no-op');
select is((select count(*)::int from public.members), 3, 'the repeat join added nobody');

-- ------------------------------------------------ as Chitra
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select public.join_group((select v from ctx where k = 'code'), (select v::uuid from ctx where k = 'rahul'))$$,
  '23505', 'That name has already been claimed.', 'a claimed name cannot be claimed again');
select throws_ok($$select public.join_group((select v from ctx where k = 'code'), null, ' neha ')$$,
  '23505', 'Duplicate name: neha', 'a new name cannot duplicate an existing member ignoring case');
select lives_ok($$select public.join_group((select v from ctx where k = 'code'), null, ' Chitra ')$$, 'Chitra joins under a new name');
select results_eq($$select display_name from public.members where user_id = '00000000-0000-0000-0000-00000000000c'$$,
  $$values ('Chitra')$$, 'the new member is trimmed and linked to Chitra');

-- ------------------------------------------------ signed out
reset role;
set local role anon;
select throws_ok($$select public.create_group('X', 'Y')$$, '42501', null, 'signed-out visitors cannot call create_group');

select * from finish();
rollback;

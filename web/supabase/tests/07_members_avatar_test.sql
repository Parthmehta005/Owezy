-- Members' profile photos (members.avatar_url), kept in sync by triggers.
begin;
select plan(11);

-- Asha signed in with Google (has a photo); Bilal used an email link (no
-- photo); Zed's provider sent a non-https value; Eve is in another group.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'asha@example.com', '{"avatar_url": "https://lh3.googleusercontent.com/a/asha"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bilal@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'zed@example.com', '{"picture": "javascript:alert(1)"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@example.com', '{"picture": "https://lh3.googleusercontent.com/a/eve"}');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.avatar(gid uuid, name text) returns text language sql as $$
  select avatar_url from public.members where group_id = gid and display_name = name
$$;

set local role authenticated;

-- Asha creates a group with placeholders.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temporary table g on commit drop as
  select public.create_group('Goa trip', 'Asha', array['Rahul', 'Neha']) as id;
-- Read what the others need while still Asha (non-members can't see the group).
alter table g add column code text, add column rahul uuid;
update g set code = (select invite_code from public.groups where groups.id = g.id),
             rahul = (select m.id from public.members m where m.group_id = g.id and m.display_name = 'Rahul');

select is(pg_temp.avatar((select id from g), 'Asha'), 'https://lh3.googleusercontent.com/a/asha',
  'creating a group stores the creator''s photo');
select is(pg_temp.avatar((select id from g), 'Rahul'), null, 'placeholders have no photo');

-- Bilal (no photo) joins by claiming Rahul; Zed (bad URL) joins as new.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select lives_ok(format($$select public.join_group(%L, %L::uuid)$$, (select code from g), (select rahul from g)), 'Bilal claims Rahul');
select is(pg_temp.avatar((select id from g), 'Rahul'), null, 'a user without a photo stays a letter');

reset role;
update auth.users set raw_user_meta_data = '{"avatar_url": "https://lh3.googleusercontent.com/a/bilal-new"}'
  where id = '00000000-0000-0000-0000-00000000000b';
set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is(pg_temp.avatar((select id from g), 'Rahul'), 'https://lh3.googleusercontent.com/a/bilal-new',
  'a new photo at sign-in reaches every group the user is in');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select lives_ok(format($$select public.join_group(%L, null, 'Zed')$$, (select code from g)), 'Zed joins as new');
select is(pg_temp.avatar((select id from g), 'Zed'), null, 'a non-https "photo" is ignored');

-- Members can't set a photo themselves.
select throws_ok($$update public.members set avatar_url = 'https://evil.example/x' where display_name = 'Zed'$$,
  '42501', null, 'users cannot write avatar_url directly');

-- Leaving clears the photo (the name stays as a placeholder).
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update public.members set user_id = null where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is(pg_temp.avatar((select id from g), 'Rahul'), null, 'leaving removes the photo from the group');

-- Photos are only visible to fellow members.
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select is((select count(*)::int from public.members where avatar_url is not null and group_id = (select id from g)), 0,
  'a non-member sees no photos from the group');

-- The helper isn't callable through the API.
select ok(not has_function_privilege('authenticated', 'private.user_avatar(uuid)', 'execute'),
  'signed-in users cannot call the photo lookup directly');

select * from finish();
rollback;

-- Walkthrough: watch the database rules work with two pretend users.
--
-- DEV PROJECT ONLY. Paste into Supabase dashboard -> SQL Editor -> Run.
-- It creates demo users Asha and Bilal and a "Goa trip (demo)" group, acts
-- as each user in turn exactly like the app will, and finishes with a table
-- of what happened. The data stays so you can browse it in Table Editor;
-- remove it afterwards with walkthrough_cleanup.sql.

create temp table if not exists demo_log (n serial, step text, result text);
truncate demo_log;
grant all on demo_log to authenticated;
grant usage on sequence demo_log_n_seq to authenticated;

-- Two pretend users (signing up normally creates their profiles via trigger).
insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000a', 'asha.demo@example.com', '{"full_name": "Asha"}'),
  ('d0000000-0000-0000-0000-00000000000b', 'bilal.demo@example.com', '{"full_name": "Bilal"}')
on conflict (id) do nothing;

-- Act as a user, the way the API does after sign-in.
create or replace function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

do $$
declare
  asha uuid := 'd0000000-0000-0000-0000-00000000000a';
  bilal uuid := 'd0000000-0000-0000-0000-00000000000b';
  g uuid; code text; rahul uuid; neha uuid; asha_m uuid; bilal_m uuid; e public.expenses;
begin
  -- 1. Asha creates a group with two placeholder names.
  perform pg_temp.act_as(asha);
  g := public.create_group('Goa trip (demo)', 'Asha', array['Rahul', 'Neha']);
  insert into demo_log (step, result) values ('Asha creates "Goa trip (demo)" with Rahul and Neha',
    (select string_agg(display_name || case when user_id is null then ' (placeholder)' else ' (Asha)' end, ', ' order by sort_order)
     from public.members where group_id = g));

  select id into asha_m from public.members where group_id = g and display_name = 'Asha';
  select id into rahul from public.members where group_id = g and display_name = 'Rahul';
  select id into neha from public.members where group_id = g and display_name = 'Neha';
  select invite_code into code from public.groups where id = g;

  -- 2. Asha adds an expense: Rs 900 dinner split equally between all three.
  e := public.create_expense(g, 'Dinner', asha_m, 90000, 'equal',
         jsonb_build_object(asha_m, 30000, rahul, 30000, neha, 30000));
  insert into demo_log (step, result) values ('Asha adds "Dinner" Rs 900, split equally', 'saved, version ' || e.version);

  -- 3. A share that does not add up is refused.
  begin
    perform public.create_expense(g, 'Bad', asha_m, 1000, 'unequal', jsonb_build_object(asha_m, 400, rahul, 500));
  exception when others then
    insert into demo_log (step, result) values ('Asha tries Rs 10 with shares Rs 4 + Rs 5', 'refused: ' || sqlerrm);
  end;

  -- 4. Bilal, not in the group yet, sees nothing.
  execute 'reset role';
  perform pg_temp.act_as(bilal);
  insert into demo_log (step, result) values ('Bilal (not a member) looks for groups',
    (select count(*) from public.groups) || ' groups, ' || (select count(*) from public.expenses) || ' expenses visible');

  -- 5. With the invite code he can preview, then claim "Rahul".
  insert into demo_log (step, result) values ('Bilal opens the invite link (preview)',
    (select (p ->> 'group_name') || ', unclaimed: ' || (select string_agg(x ->> 'display_name', ', ') from jsonb_array_elements(p -> 'unclaimed') x)
     from (select public.invite_preview(code) p) t));
  perform public.join_group(code, rahul);
  bilal_m := rahul;
  insert into demo_log (step, result) values ('Bilal joins, claiming "Rahul"',
    'now sees ' || (select count(*) from public.groups) || ' group, ' || (select count(*) from public.expenses) || ' expense');

  -- 6. Both try to edit the dinner. Bilal saves first; Asha's stale edit is refused.
  e := public.update_expense(e.id, 1, 'Dinner at Toit', asha_m, 90000, 'equal',
         jsonb_build_object(asha_m, 30000, rahul, 30000, neha, 30000));
  insert into demo_log (step, result) values ('Bilal renames it to "Dinner at Toit" (based on version 1)', 'saved, version ' || e.version);

  execute 'reset role';
  perform pg_temp.act_as(asha);
  begin
    perform public.update_expense(e.id, 1, 'Dinner!!', asha_m, 90000, 'equal',
              jsonb_build_object(asha_m, 30000, rahul, 30000, neha, 30000));
  exception when others then
    insert into demo_log (step, result) values ('Asha saves her own edit, also based on version 1', 'refused: ' || sqlerrm);
  end;

  -- 7. Bilal adds a cab paid by him, only for him and Neha.
  execute 'reset role';
  perform pg_temp.act_as(bilal);
  e := public.create_expense(g, 'Cab', bilal_m, 30000, 'unequal', jsonb_build_object(bilal_m, 10000, neha, 20000));
  insert into demo_log (step, result) values ('Bilal adds "Cab" Rs 300: him Rs 100, Neha Rs 200', 'saved');

  -- 8. Anyone trying to edit shares directly, skipping the checks, is blocked.
  begin
    update public.expense_shares set share_paise = 0 where expense_id = e.id;
  exception when others then
    insert into demo_log (step, result) values ('Bilal tries to change shares directly', 'refused: ' || sqlerrm);
  end;

  execute 'reset role';
end $$;

reset role;
select n as "#", step as "What was tried", result as "What happened" from demo_log order by n;

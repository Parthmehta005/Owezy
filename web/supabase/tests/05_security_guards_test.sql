-- Schema-wide security guards. Unlike the other files, these check every
-- table and function in the exposed schema, so they also fail if a FUTURE
-- migration adds something that breaks the rules.
begin;
select plan(7);

-- 1. Every table in public has Row Level Security on.
select is(
  array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1),
  '{}'::text[], 'every public table has RLS enabled');

-- 2. Every table in public has at least one policy (RLS without one means
--    nobody can read it, which is almost always a mistake).
select is(
  array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and not exists (select 1 from pg_policy p where p.polrelid = c.oid) order by 1),
  '{}'::text[], 'every public table has at least one policy');

-- 3. Signed-out visitors (anon) have no privileges on any public table.
select is(
  array(select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
          and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
               or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))
        order by 1),
  '{}'::text[], 'anon has no privileges on public tables');

-- 4. Signed-out visitors cannot execute any function in public or private.
select is(
  array(select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute') order by 1),
  '{}'::text[], 'anon cannot execute any public or private function');

-- 5. Every security definer function pins its search_path (otherwise a
--    caller could hijack unqualified names).
select is(
  array(select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
        order by 1),
  '{}'::text[], 'every security definer function sets search_path');

-- 6. Signed-in users cannot write expenses or shares directly (RPCs only).
select is(
  array(select t || ':' || priv from unnest(array['public.expenses', 'public.expense_shares']) t,
               unnest(array['insert', 'update', 'delete', 'truncate']) priv
        where has_table_privilege('authenticated', t, priv) order by 1),
  '{}'::text[], 'authenticated has no direct write privileges on expenses or shares');

-- 7. The private helpers are not exposed as RPCs: nothing in the API's
--    public schema wraps them, and the schema itself is not public.
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'is_group_member%'), 0,
  'membership helper lives only in the private schema');

select * from finish();
rollback;

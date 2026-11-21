-- Remove everything walkthrough.sql created. DEV PROJECT ONLY.
-- Order matters: shares, expenses and members before their group.
delete from public.expense_shares where group_id in (select id from public.groups where name = 'Goa trip (demo)');
delete from public.expenses where group_id in (select id from public.groups where name = 'Goa trip (demo)');
update public.profiles set last_group_id = null where last_group_id in (select id from public.groups where name = 'Goa trip (demo)');
delete from public.members where group_id in (select id from public.groups where name = 'Goa trip (demo)');
delete from public.groups where name = 'Goa trip (demo)';
delete from auth.users where id in ('d0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000b');
select 'Demo data removed' as result;

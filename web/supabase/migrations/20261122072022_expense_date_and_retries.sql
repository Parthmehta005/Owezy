-- Expense dates and safe retries (M5, mobile-first).
--
-- * expenses.expense_date: the day the expense happened, which can differ
--   from when it was typed in. Defaults to today in India time (the app is
--   INR-only; UTC "today" would be yesterday until 05:30 IST). Must be
--   between 2000-01-01 and one year from today.
-- * Client-supplied ids: phones on flaky networks retry, and people tap Save
--   twice. create_expense accepts the id the phone generated; if that id
--   already exists as the caller's own expense in the same group, the
--   existing row is returned unchanged instead of creating a duplicate. This
--   holds even when two copies arrive at the same moment (ON CONFLICT waits
--   for the first transaction). Any other reuse of an id is rejected (23505).
-- * update_expense can change the date; passing null keeps it.
--
-- Signatures change, so the old functions are dropped and recreated (new
-- parameters are last and optional, so existing positional calls still work).

create function private.today_in_india()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;
revoke execute on function private.today_in_india() from public, anon, authenticated;

alter table public.expenses
  add column expense_date date not null default private.today_in_india();
create index expenses_group_id_expense_date_idx on public.expenses (group_id, expense_date desc, created_at desc);

create function private.check_expense_date(d date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if d < date '2000-01-01' or d > private.today_in_india() + 366 then
    raise exception 'Choose a date between 2000 and one year from today.' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function private.check_expense_date(date) from public, anon, authenticated;

-- ------------------------------------------------------------ create_expense
drop function public.create_expense(uuid, text, uuid, bigint, text, jsonb);

create function public.create_expense(
  group_id uuid, description text, payer_member_id uuid, total_paise bigint, split_type text, shares jsonb,
  expense_id uuid default null, expense_date date default null
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  d text;
  day date := coalesce(create_expense.expense_date, private.today_in_india());
  e public.expenses;
begin
  if not private.is_group_member(create_expense.group_id) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;
  d := private.check_expense_fields(description, total_paise, split_type);
  perform private.check_expense_date(day);
  if not exists (select 1 from public.members m where m.id = payer_member_id and m.group_id = create_expense.group_id) then
    raise exception 'The payer is not in this group.' using errcode = '22023';
  end if;

  insert into public.expenses (id, group_id, description, payer_member_id, total_paise, split_type, created_by, expense_date)
  values (coalesce(create_expense.expense_id, gen_random_uuid()), create_expense.group_id, d, payer_member_id,
          total_paise, split_type, uid, day)
  on conflict (id) do nothing
  returning * into e;

  if e.id is null then
    -- That id exists already: a retry of the caller's own save, or misuse.
    select * into e from public.expenses x where x.id = create_expense.expense_id;
    if e.created_by is distinct from uid or e.group_id <> create_expense.group_id then
      raise exception 'That expense id is already in use.' using errcode = '23505';
    end if;
    return e;
  end if;

  perform private.write_shares(e.id, e.group_id, payer_member_id, total_paise, shares);
  return e;
end;
$$;

-- ------------------------------------------------------------ update_expense
drop function public.update_expense(uuid, integer, text, uuid, bigint, text, jsonb);

create function public.update_expense(
  expense_id uuid, expected_version integer,
  description text, payer_member_id uuid, total_paise bigint, split_type text, shares jsonb,
  expense_date date default null
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.expenses;
  d text;
begin
  perform private.require_user();
  e := private.expense_for_change(update_expense.expense_id);
  if e.version <> expected_version then
    raise exception 'This was changed by someone else.'
      using errcode = 'PT409', detail = format('current version %s', e.version);
  end if;
  d := private.check_expense_fields(description, total_paise, split_type);
  if update_expense.expense_date is not null then
    perform private.check_expense_date(update_expense.expense_date);
  end if;

  update public.expenses x
  set description = d,
      payer_member_id = update_expense.payer_member_id,
      total_paise = update_expense.total_paise,
      split_type = update_expense.split_type,
      expense_date = coalesce(update_expense.expense_date, x.expense_date),
      version = x.version + 1,
      updated_at = now()
  where x.id = e.id
  returning * into e;

  perform private.write_shares(e.id, e.group_id, e.payer_member_id, e.total_paise, shares);
  return e;
end;
$$;

-- ------------------------------------------------------------ who may call them
revoke execute on function public.create_expense(uuid, text, uuid, bigint, text, jsonb, uuid, date) from public, anon;
revoke execute on function public.update_expense(uuid, integer, text, uuid, bigint, text, jsonb, date) from public, anon;
grant execute on function public.create_expense(uuid, text, uuid, bigint, text, jsonb, uuid, date) to authenticated;
grant execute on function public.update_expense(uuid, integer, text, uuid, bigint, text, jsonb, date) to authenticated;

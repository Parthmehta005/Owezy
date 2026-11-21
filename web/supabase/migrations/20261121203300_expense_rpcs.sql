-- Expense RPCs: create_expense, update_expense, delete_expense, restore_expense.
--
-- These are the only way to write expenses and shares (RLS makes both
-- read-only). Every write checks that the caller is in the group, that the
-- payer and every sharer belong to it, and that the shares are whole,
-- non-negative paise adding up exactly to the total.
--
-- The client computes the shares with core/splits.ts. split_type ('equal' or
-- 'unequal') is recorded so the edit screen reopens in the right mode; the
-- server does not recompute equal splits, since any member may save any
-- valid unequal split anyway.
--
-- Concurrent edits: each expense has an integer `version`, bumped on every
-- change. update_expense must be given the version the client last saw and
-- fails with SQLSTATE PT409 (PostgREST turns it into HTTP 409) if someone
-- changed it in between. An integer is used rather than updated_at because
-- JavaScript dates keep milliseconds, not Postgres's microseconds.
--
-- Shares are passed as a JSON object { "<member uuid>": <paise>, ... }, the
-- same shape as core's Shares type.

alter table public.expenses add column version integer not null default 1 check (version >= 1);

-- ------------------------------------------------------------ helpers
create function private.check_expense_fields(description text, total_paise bigint, split_type text)
returns text  -- the trimmed description
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := btrim(coalesce(description, ''));
begin
  if d = '' then
    raise exception 'Enter a description.' using errcode = '22023';
  end if;
  if char_length(d) > 100 then
    raise exception 'Descriptions can be at most 100 characters.' using errcode = '22023';
  end if;
  if total_paise is null or total_paise <= 0 or total_paise > 9007199254740991 then
    raise exception 'Amount must be greater than 0.' using errcode = '22023';
  end if;
  if split_type is null or split_type not in ('equal', 'unequal') then
    raise exception 'Split type must be equal or unequal.' using errcode = '22023';
  end if;
  return d;
end;
$$;

-- Validate the payer and shares for an expense in target_group, then replace
-- the expense's shares with them.
create function private.write_shares(
  target_expense uuid, target_group uuid, payer uuid, total_paise bigint, shares jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  share record;
  member uuid;
  amount numeric;
  total numeric := 0;
  count integer := 0;
begin
  if not exists (select 1 from public.members where id = payer and group_id = target_group) then
    raise exception 'The payer is not in this group.' using errcode = '22023';
  end if;
  if shares is null or jsonb_typeof(shares) <> 'object' then
    raise exception 'Shares must be an object of member id to paise.' using errcode = '22023';
  end if;

  delete from public.expense_shares where expense_id = target_expense;

  for share in select key, value from jsonb_each(shares) loop
    begin
      member := share.key::uuid;
    exception when invalid_text_representation then
      raise exception 'A share has an invalid member id.' using errcode = '22023';
    end;
    if jsonb_typeof(share.value) <> 'number' then
      raise exception 'Each share must be a number of paise.' using errcode = '22023';
    end if;
    amount := share.value::text::numeric;
    if amount <> trunc(amount) or amount < 0 or amount > 9007199254740991 then
      raise exception 'Each share must be a whole, non-negative number of paise.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.members where id = member and group_id = target_group) then
      raise exception 'A share is for someone who is not in this group.' using errcode = '22023';
    end if;

    insert into public.expense_shares (expense_id, group_id, member_id, share_paise)
    values (target_expense, target_group, member, amount::bigint);
    total := total + amount;
    count := count + 1;
  end loop;

  if count = 0 then
    raise exception 'Select at least one participant.' using errcode = '22023';
  end if;
  if total <> total_paise then
    raise exception 'Shares must add up exactly to the total.' using errcode = '22023';
  end if;
end;
$$;

-- Lock and return a live expense the caller may change.
create function private.expense_for_change(target_expense uuid, include_deleted boolean default false)
returns public.expenses
language plpgsql
set search_path = ''
as $$
declare
  e public.expenses;
begin
  select * into e from public.expenses where id = target_expense for update;
  if not found or (e.deleted_at is not null and not include_deleted) then
    raise exception 'This expense no longer exists.' using errcode = 'P0002';
  end if;
  if not private.is_group_member(e.group_id) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;
  return e;
end;
$$;

revoke execute on function private.check_expense_fields(text, bigint, text) from public, anon, authenticated;
revoke execute on function private.write_shares(uuid, uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke execute on function private.expense_for_change(uuid, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------ create_expense
create function public.create_expense(
  group_id uuid, description text, payer_member_id uuid, total_paise bigint, split_type text, shares jsonb
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  d text;
  e public.expenses;
begin
  if not private.is_group_member(create_expense.group_id) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;
  d := private.check_expense_fields(description, total_paise, split_type);
  if not exists (select 1 from public.members m where m.id = payer_member_id and m.group_id = create_expense.group_id) then
    raise exception 'The payer is not in this group.' using errcode = '22023';
  end if;

  insert into public.expenses (group_id, description, payer_member_id, total_paise, split_type, created_by)
  values (create_expense.group_id, d, payer_member_id, total_paise, split_type, uid)
  returning * into e;

  perform private.write_shares(e.id, e.group_id, payer_member_id, total_paise, shares);
  return e;
end;
$$;

-- ------------------------------------------------------------ update_expense
create function public.update_expense(
  expense_id uuid, expected_version integer,
  description text, payer_member_id uuid, total_paise bigint, split_type text, shares jsonb
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
  e := private.expense_for_change(expense_id);
  if e.version <> expected_version then
    raise exception 'This was changed by someone else.'
      using errcode = 'PT409', detail = format('current version %s', e.version);
  end if;
  d := private.check_expense_fields(description, total_paise, split_type);

  update public.expenses x
  set description = d,
      payer_member_id = update_expense.payer_member_id,
      total_paise = update_expense.total_paise,
      split_type = update_expense.split_type,
      version = x.version + 1,
      updated_at = now()
  where x.id = e.id
  returning * into e;

  perform private.write_shares(e.id, e.group_id, e.payer_member_id, e.total_paise, shares);
  return e;
end;
$$;

-- ------------------------------------------------------------ delete / restore (soft)
-- Deleting an already-deleted expense, or restoring a live one, changes nothing.
create function public.delete_expense(expense_id uuid)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.expenses;
begin
  perform private.require_user();
  e := private.expense_for_change(expense_id, include_deleted => true);
  if e.deleted_at is null then
    update public.expenses x set deleted_at = now(), version = x.version + 1
    where x.id = e.id returning * into e;
  end if;
  return e;
end;
$$;

create function public.restore_expense(expense_id uuid)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.expenses;
begin
  perform private.require_user();
  e := private.expense_for_change(expense_id, include_deleted => true);
  if e.deleted_at is not null then
    update public.expenses x set deleted_at = null, version = x.version + 1
    where x.id = e.id returning * into e;
  end if;
  return e;
end;
$$;

-- ------------------------------------------------------------ who may call them
revoke execute on function public.create_expense(uuid, text, uuid, bigint, text, jsonb) from public, anon;
revoke execute on function public.update_expense(uuid, integer, text, uuid, bigint, text, jsonb) from public, anon;
revoke execute on function public.delete_expense(uuid) from public, anon;
revoke execute on function public.restore_expense(uuid) from public, anon;
grant execute on function public.create_expense(uuid, text, uuid, bigint, text, jsonb) to authenticated;
grant execute on function public.update_expense(uuid, integer, text, uuid, bigint, text, jsonb) to authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;
grant execute on function public.restore_expense(uuid) to authenticated;

-- Core schema: profiles, groups, members, expenses, expense_shares.
--
-- Design notes
-- * Money is integer paise in bigint, capped at JS Number.MAX_SAFE_INTEGER so
--   the app's core/ logic can hold every value exactly.
-- * "A member from another group" is impossible by construction: expenses and
--   shares reference members through composite (group_id, id) foreign keys.
-- * Member order (used for equal-split leftover paise and tie-breaks) is
--   members.sort_order, an identity column, so it is strictly increasing even
--   for members inserted in the same transaction.
-- * Deleting a member that any expense or share uses is blocked by those
--   foreign keys (NO ACTION).
-- * A group that still has members or expenses cannot be deleted directly.
--   (A cascade would fail anyway: Postgres checks the member foreign keys
--   while the cascade is still running, before the shares are removed.)
--   Deleting groups is not in v1; a future delete_group RPC must delete
--   shares, expenses and members first, in that order.
-- * Expenses are soft-deleted (deleted_at) so they can be restored (Undo).
-- * Row Level Security is enabled on every table here, with no policies yet,
--   so nothing is readable or writable through the API until the next
--   migration adds them. Writes to expenses/shares will only go through RPCs.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default ''
    check (char_length(display_name) <= 50),
  last_group_id uuid,  -- FK added after groups exists
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per signed-in user, created by trigger on sign-up.';

-- ---------------------------------------------------------------- groups
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (name = btrim(name) and char_length(name) between 1 and 60),
  -- 12 URL-safe characters (72 random bits) used in /join/<code>.
  invite_code text not null unique
    default translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_last_group_id_fkey
  foreign key (last_group_id) references public.groups (id) on delete set null;

-- ---------------------------------------------------------------- members
create table public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  display_name text not null
    check (display_name = btrim(display_name) and char_length(display_name) between 1 and 40),
  -- null = placeholder added by name who has not joined yet.
  user_id uuid references auth.users (id) on delete set null,
  sort_order bigint generated always as identity,
  created_at timestamptz not null default now(),
  unique (group_id, id),       -- target for composite FKs below
  unique (group_id, user_id)   -- a user is in a group at most once (nulls allowed)
);
-- Same rule as core/names.ts: names are unique per group ignoring case.
create unique index members_group_id_lower_name_key on public.members (group_id, lower(display_name));
create index members_user_id_idx on public.members (user_id);

-- ---------------------------------------------------------------- expenses
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  description text not null
    check (description = btrim(description) and char_length(description) between 1 and 100),
  payer_member_id uuid not null,
  total_paise bigint not null
    check (total_paise > 0 and total_paise <= 9007199254740991),
  split_type text not null check (split_type in ('equal', 'unequal')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, group_id),  -- target for the shares FK
  foreign key (group_id, payer_member_id) references public.members (group_id, id)
);
create index expenses_group_id_created_at_idx on public.expenses (group_id, created_at desc);
create index expenses_payer_idx on public.expenses (group_id, payer_member_id);

-- ---------------------------------------------------------------- expense_shares
create table public.expense_shares (
  expense_id uuid not null,
  group_id uuid not null,
  member_id uuid not null,
  share_paise bigint not null
    check (share_paise >= 0 and share_paise <= 9007199254740991),
  primary key (expense_id, member_id),
  foreign key (expense_id, group_id) references public.expenses (id, group_id) on delete cascade,
  foreign key (group_id, member_id) references public.members (group_id, id)
);
create index expense_shares_member_idx on public.expense_shares (group_id, member_id);

-- ---------------------------------------------------------------- RLS on, no policies yet
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;

-- ---------------------------------------------------------------- profile on sign-up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(btrim(coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )), 50)
  );
  return new;
end;
$$;

-- Only the trigger should run this.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

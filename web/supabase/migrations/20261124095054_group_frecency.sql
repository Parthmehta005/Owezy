-- M8: open the group you use most, weighted toward recent use ("frecency").
--
-- Each member row holds its user's score for that group. Opening a group
-- decays the score (half-life 7 days) and adds 1, except that re-opens within
-- 30 minutes only decay it. Mirrors recordOpen in web/src/core/frecency.ts,
-- which also ranks the stored values. Replaces profiles.last_group_id as
-- the way "/" picks a group (the column stays, unused).

alter table public.members
  add column open_score double precision not null default 0 check (open_score >= 0),
  add column opened_at timestamptz;

comment on column public.members.open_score is
  'How much this member''s user uses the group, decayed to opened_at. Written only by record_group_open.';

create function public.record_group_open(group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_ts constant timestamptz := now();
begin
  update public.members m
  set open_score =
        case when m.opened_at is null then 0
             else m.open_score * power(0.5, greatest(extract(epoch from now_ts - m.opened_at), 0) / (7 * 86400.0))
        end
        + case when m.opened_at is not null and now_ts - m.opened_at < interval '30 minutes' then 0 else 1 end,
      opened_at = now_ts
  where m.group_id = record_group_open.group_id
    and m.user_id = (select auth.uid());

  if not found then
    raise exception 'You are not in this group.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.record_group_open(uuid) from public, anon;
grant execute on function public.record_group_open(uuid) to authenticated;

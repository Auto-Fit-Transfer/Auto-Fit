-- G5 totals use the complete ledger, not the paginated activity feed.
create function public.community_mileage_monthly(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select date_trunc('month', now() at time zone 'Asia/Seoul')::date as this_month
  ), totals as (
    select
      coalesce(sum(l.amount) filter (where l.amount > 0 and d.day >= b.this_month), 0)::integer as earned_this_month,
      coalesce(sum(l.amount) filter (where l.amount > 0 and d.day >= (b.this_month - interval '1 month')::date and d.day < b.this_month), 0)::integer as earned_last_month,
      coalesce(-sum(l.amount) filter (where l.amount < 0 and d.day >= b.this_month), 0)::integer as spent_this_month
    from public.community_mileage_ledger l
    cross join bounds b
    cross join lateral (select coalesce(l.earned_on, (l.created_at at time zone 'Asia/Seoul')::date) as day) d
    where l.user_id = p_user_id
      and coalesce(l.earned_on, (l.created_at at time zone 'Asia/Seoul')::date) >= (b.this_month - interval '1 month')::date
  )
  select to_jsonb(totals) from totals;
$$;
revoke all on function public.community_mileage_monthly(uuid) from public, anon, authenticated;
grant execute on function public.community_mileage_monthly(uuid) to service_role;

-- Rollback: drop function public.community_mileage_monthly(uuid);

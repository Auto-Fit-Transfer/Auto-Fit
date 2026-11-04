-- Keep historical rules_v1 rows readable and updatable, but forbid new non-AI plans.
alter table public.exercise_recommendations
  alter column generator drop default;

create function public.require_ai_exercise_recommendation_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.generator is distinct from 'auto-fit-ai' then
    raise exception 'New exercise recommendations require auto-fit-ai'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.require_ai_exercise_recommendation_insert()
  from public, anon, authenticated;

create trigger require_ai_exercise_recommendation_insert
before insert on public.exercise_recommendations
for each row execute function public.require_ai_exercise_recommendation_insert();

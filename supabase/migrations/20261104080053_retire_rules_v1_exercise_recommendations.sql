-- Keep historical rows readable/completable, but forbid new non-AI plans or relabeling.
alter table public.exercise_recommendations
  alter column generator drop default;

create or replace function public.require_ai_exercise_recommendation_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.generator is distinct from old.generator then
      raise exception 'Exercise recommendation generator is immutable'
        using errcode = '22023';
    end if;
    return new;
  end if;
  if new.generator is distinct from 'auto-fit-ai' then
    raise exception 'New exercise recommendations require auto-fit-ai'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.require_ai_exercise_recommendation_insert()
  from public, anon, authenticated;

create or replace trigger require_ai_exercise_recommendation_insert
before insert or update of generator on public.exercise_recommendations
for each row execute function public.require_ai_exercise_recommendation_insert();

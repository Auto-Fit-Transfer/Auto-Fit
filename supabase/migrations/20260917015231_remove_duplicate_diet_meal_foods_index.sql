-- Keep the original diet_meal_id index; remove only its verified duplicate.
set local lock_timeout = '3s';
set local statement_timeout = '15s';
do $$
begin
  if not exists(
    select 1 from pg_index a join pg_index b on a.indrelid=b.indrelid
    join pg_class ac on ac.oid=a.indexrelid join pg_class bc on bc.oid=b.indexrelid
    where a.indexrelid='public.diet_meal_foods_meal_id_idx'::regclass
      and b.indexrelid='public.idx_diet_meal_foods_meal'::regclass
      and a.indrelid='public.diet_meal_foods'::regclass
      and a.indisvalid and b.indisvalid
      and not a.indisunique and not b.indisunique
      and not a.indisprimary and not b.indisprimary
      and ac.relam=bc.relam and a.indkey=b.indkey
      and a.indclass=b.indclass and a.indcollation=b.indcollation
      and a.indoption=b.indoption and a.indnatts=b.indnatts
      and a.indnkeyatts=b.indnkeyatts
      and a.indpred is null and b.indpred is null
      and a.indexprs is null and b.indexprs is null
      and not exists(select 1 from pg_constraint c where c.conindid=b.indexrelid)
  ) then
    raise exception 'Expected equivalent standalone diet_meal_foods indexes are absent or changed';
  end if;
end $$;
drop index public.idx_diet_meal_foods_meal;

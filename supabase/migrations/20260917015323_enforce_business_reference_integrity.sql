-- Logical references only. Preserve children by restricting parent removal.
create table autofit_integrity.business_references(
  child_table text not null,
  child_column text not null,
  parent_table text not null,
  parent_column text not null,
  primary key(child_table, child_column)
);
revoke all on autofit_integrity.business_references from public,anon,authenticated,service_role;
insert into autofit_integrity.business_references values
('body_compositions','uploaded_file_id','upload_files','uploaded_file_id'),
('health_checkups','uploaded_file_id','upload_files','uploaded_file_id'),
('chat_messages','chat_id','chats','chat_id'),
('diet_feedback','diet_meal_id','diet_meals','diet_meal_id'),
('diet_feedback','meal_log_id','meal_logs','meal_log_id'),
('diet_meal_foods','diet_meal_id','diet_meals','diet_meal_id'),
('diet_meal_foods','food_item_id','food_items','food_item_id'),
('diet_meals','diet_recommendation_id','diet_recommendations','diet_recommendation_id'),
('disease_risk_details','disease_risk_id','disease_risk','disease_risk_id'),
('exercise_discomfort_logs','exercise_session_id','exercise_sessions','exercise_session_id'),
('exercise_discomfort_logs','exercise_item_id','exercise_items','exercise_item_id'),
('exercise_items','exercise_recommendation_id','exercise_recommendations','exercise_recommendation_id'),
('exercise_items','exercise_type_id','exercise_types','exercise_type_id'),
('exercise_logs','exercise_item_id','exercise_items','exercise_item_id'),
('exercise_logs','exercise_session_id','exercise_sessions','exercise_session_id'),
('exercise_preferences','exercise_type_id','exercise_types','exercise_type_id'),
('exercise_recommendation_contexts','exercise_recommendation_id','exercise_recommendations','exercise_recommendation_id'),
('exercise_session_feedback','exercise_session_id','exercise_sessions','exercise_session_id'),
('exercise_sessions','exercise_recommendation_id','exercise_recommendations','exercise_recommendation_id'),
('health_assessment_items','health_assessment_id','health_assessments','health_assessment_id'),
('health_assessments','health_checkup_id','health_checkups','health_checkup_id'),
('health_assessments','body_composition_id','body_compositions','body_composition_id'),
('meal_log_items','meal_log_id','meal_logs','meal_log_id'),
('meal_log_items','food_item_id','food_items','food_item_id'),
('meal_logs','diet_meal_id','diet_meals','diet_meal_id'),
('ocr_results','uploaded_file_id','upload_files','uploaded_file_id'),
('report_body_compositions','report_id','reports','report_id'),
('report_disease_risk','report_id','reports','report_id'),
('report_evaluations','report_id','reports','report_id'),
('report_health_scores','report_id','reports','report_id'),
('report_health_scores','health_assessment_id','health_assessments','health_assessment_id'),
('report_lifestyle_metrics','report_id','reports','report_id'),
('user_allergies','allergy_type_id','allergy_types','allergy_type_id'),
('user_food_inventory','food_item_id','food_items','food_item_id'),
('user_term_agreements','terms_version_id','terms_versions','terms_version_id');

create function autofit_integrity.business_owner(tbl text, row_data jsonb, depth integer default 0)
returns uuid language plpgsql security definer set search_path='' as $$
declare dep record; parent_data jsonb; owner_id uuid; ref uuid;
begin
  if depth > 8 then raise exception 'Unexpected ownership reference depth'; end if;
  if row_data->>'user_id' is not null then return (row_data->>'user_id')::uuid; end if;
  for dep in select * from autofit_integrity.business_references where child_table=tbl order by child_column
  loop
    ref := (row_data->>dep.child_column)::uuid;
    if ref is null then continue; end if;
    execute format('select to_jsonb(p) from public.%I p where %I=$1 for share',dep.parent_table,dep.parent_column)
      into parent_data using ref;
    if parent_data is null then
      raise exception 'Missing parent %.%',dep.parent_table,dep.parent_column using errcode='23503';
    end if;
    owner_id := autofit_integrity.business_owner(dep.parent_table,parent_data,depth+1);
    if owner_id is not null then return owner_id; end if;
  end loop;
  return null;
end $$;

create function autofit_integrity.check_business_references()
returns trigger language plpgsql security definer set search_path='' as $$
declare dep record; parent_data jsonb; ref uuid; owner_id uuid; expected_owner uuid;
begin
  expected_owner := (to_jsonb(new)->>'user_id')::uuid;
  for dep in select * from autofit_integrity.business_references where child_table=tg_table_name order by child_column
  loop
    ref := (to_jsonb(new)->>dep.child_column)::uuid;
    if ref is null then continue; end if; -- Optional references remain optional.
    execute format('select to_jsonb(p) from public.%I p where %I=$1 for share',dep.parent_table,dep.parent_column)
      into parent_data using ref;
    if parent_data is null then
      raise exception '%.% requires an existing %',tg_table_name,dep.child_column,dep.parent_table
        using errcode='23503';
    end if;
    owner_id := autofit_integrity.business_owner(dep.parent_table,parent_data);
    if expected_owner is null then expected_owner := owner_id; end if;
    if owner_id is not null and expected_owner is distinct from owner_id then
      raise exception 'Owner mismatch for %.%',tg_table_name,dep.child_column using errcode='23503';
    end if;
  end loop;
  return new;
end $$;

create function autofit_integrity.protect_business_parent()
returns trigger language plpgsql security definer set search_path='' as $$
declare dep record; has_children boolean; changed_link boolean := false; ref uuid;
begin
  if tg_op='UPDATE' then
    for dep in select distinct parent_column from autofit_integrity.business_references where parent_table=tg_table_name
    loop
      if (to_jsonb(old)->>dep.parent_column) is distinct from (to_jsonb(new)->>dep.parent_column) then
        raise exception 'Referenced key %.% is immutable',tg_table_name,dep.parent_column using errcode='23514';
      end if;
    end loop;
    changed_link := (to_jsonb(old)->>'user_id') is distinct from (to_jsonb(new)->>'user_id');
    for dep in select child_column from autofit_integrity.business_references where child_table=tg_table_name
    loop
      changed_link := changed_link or (to_jsonb(old)->>dep.child_column) is distinct from (to_jsonb(new)->>dep.child_column);
    end loop;
    if not changed_link then return new; end if;
  end if;
  if current_setting('transaction_isolation') not in ('read committed','read uncommitted') then
    raise exception 'Business parent removal or reassignment requires READ COMMITTED isolation'
      using errcode='0A000';
  end if;
  for dep in select * from autofit_integrity.business_references where parent_table=tg_table_name
  loop
    ref := (to_jsonb(old)->>dep.parent_column)::uuid;
    execute format('select exists(select 1 from public.%I where %I=$1)',dep.child_table,dep.child_column)
      into has_children using ref;
    if has_children then
      raise exception 'Remove references from %.% before removing or reassigning %',dep.child_table,dep.child_column,tg_table_name
        using errcode='23503';
    end if;
  end loop;
  if tg_op='UPDATE' then return new; end if;
  return old;
end $$;

revoke all on function autofit_integrity.business_owner(text,jsonb,integer),
  autofit_integrity.check_business_references(),autofit_integrity.protect_business_parent()
  from public,anon,authenticated,service_role;

do $$ declare dep record; begin
  for dep in select distinct child_table from autofit_integrity.business_references loop
    execute format('create trigger z_check_business_references before insert or update on public.%I for each row execute function autofit_integrity.check_business_references()',dep.child_table);
  end loop;
  for dep in select distinct parent_table from autofit_integrity.business_references loop
    execute format('create trigger protect_business_parent before delete or update on public.%I for each row execute function autofit_integrity.protect_business_parent()',dep.parent_table);
    execute format('create trigger business_parent_block_truncate before truncate on public.%I for each statement execute function autofit_integrity.block_parent_truncate()',dep.parent_table);
  end loop;
end $$;

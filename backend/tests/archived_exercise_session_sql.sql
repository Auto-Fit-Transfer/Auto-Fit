-- Run only on an isolated local Supabase database as postgres.
-- Archived recommendations are visible as history but cannot be used as sessions.
begin;
insert into auth.users (id) values ('00000000-0000-4000-8000-000000000100');

set local session_replication_role = replica;

insert into public.exercise_recommendations (
  exercise_recommendation_id, user_id, recommendation_date, generator, status
) values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000100',
  current_date, 'legacy', 'cancelled'
);
insert into public.exercise_recommendations (
  exercise_recommendation_id, user_id, recommendation_date, generator, status
) values (
  '00000000-0000-4000-8000-000000000104',
  '00000000-0000-4000-8000-000000000100',
  current_date, 'legacy', 'completed'
);

set local session_replication_role = origin;

insert into public.exercise_items (
  exercise_item_id, exercise_recommendation_id, exercise_name, sequence_order,
  duration_minutes
) values (
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000101',
  '이전 운동', 1, 10
);

insert into public.exercise_sessions (
  exercise_session_id, user_id, exercise_recommendation_id,
  plan_session_id, planned_item_count, status
) values (
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000100',
  '00000000-0000-4000-8000-000000000101',
  null, 1, 'stopped'
);
insert into public.exercise_sessions (
  exercise_session_id, user_id, exercise_recommendation_id,
  plan_session_id, planned_item_count, status, completed_at
) values (
  '00000000-0000-4000-8000-000000000105',
  '00000000-0000-4000-8000-000000000100',
  '00000000-0000-4000-8000-000000000104',
  null, 1, 'completed', now()
);
insert into public.community_ranking_participants (user_id)
values ('00000000-0000-4000-8000-000000000100');

do $$
declare
  v_generator text;
  v_recommendation_status text;
  v_session_status text;
  v_challenge public.community_challenges;
  v_ranking jsonb;
begin
  select generator, status into v_generator, v_recommendation_status
  from public.exercise_recommendations
  where exercise_recommendation_id = '00000000-0000-4000-8000-000000000101';
  select status into v_session_status
  from public.exercise_sessions
  where exercise_session_id = '00000000-0000-4000-8000-000000000103';

  if v_generator <> 'legacy' or v_recommendation_status <> 'cancelled'
     or v_session_status <> 'stopped' then
    raise exception 'Archived exercise records changed unexpectedly';
  end if;

  begin
    perform public.record_exercise_item_result(
      '00000000-0000-4000-8000-000000000100',
      '00000000-0000-4000-8000-000000000103',
      '00000000-0000-4000-8000-000000000102',
      true, false
    );
    raise exception 'Archived exercise item recording was accepted';
  exception when others then
    if sqlerrm not like '%In-progress exercise session not found%' then
      raise;
    end if;
  end;

  begin
    perform public.complete_exercise_session(
      '00000000-0000-4000-8000-000000000100',
      '00000000-0000-4000-8000-000000000103'
    );
    raise exception 'Archived exercise completion was accepted';
  exception when others then
    if sqlerrm not like '%In-progress exercise session not found%' then
      raise;
    end if;
  end;

  begin
    perform public.save_exercise_session_feedback(
      '00000000-0000-4000-8000-000000000100',
      '00000000-0000-4000-8000-000000000103',
      3::smallint, 'normal', '[]'::jsonb, null
    );
    raise exception 'Archived exercise feedback was accepted';
  exception when others then
    if sqlerrm <> 'Archived exercise records are read-only' then
      raise;
    end if;
  end;

  begin
    insert into public.exercise_session_analyses (
      exercise_session_id, user_id, input_hash, analysis
    ) values (
      '00000000-0000-4000-8000-000000000103',
      '00000000-0000-4000-8000-000000000100',
      repeat('a', 64), '{}'::jsonb
    );
    raise exception 'Archived exercise analysis was accepted';
  exception when others then
    if sqlerrm <> 'Archived exercise records are read-only' then
      raise;
    end if;
  end;

  begin
    insert into public.user_workout_routines (
      user_id, source_recommendation_id, source_type, name
    ) values (
      '00000000-0000-4000-8000-000000000100',
      '00000000-0000-4000-8000-000000000101',
      'recommendation', '이전 추천 복제'
    );
    raise exception 'Archived recommendation was saved as a routine';
  exception when others then
    if sqlerrm <> 'Archived exercise records are read-only' then
      raise;
    end if;
  end;

  begin
    insert into public.posture_analysis_jobs (
      user_id, exercise_session_id
    ) values (
      '00000000-0000-4000-8000-000000000100',
      '00000000-0000-4000-8000-000000000103'
    );
    raise exception 'Archived exercise was used for a posture analysis job';
  exception when others then
    if sqlerrm <> 'Archived exercise records are read-only' then
      raise;
    end if;
  end;

  begin
    insert into public.community_posts (
      user_id, content, category, exercise_session_id
    ) values (
      '00000000-0000-4000-8000-000000000100',
      '이전 운동 게시', 'workout',
      '00000000-0000-4000-8000-000000000105'
    );
    raise exception 'Archived exercise was posted to the community';
  exception when others then
    if sqlerrm <> 'Archived exercise records are read-only' then
      raise;
    end if;
  end;

  begin
    perform public.community_activity_snapshot(
      '00000000-0000-4000-8000-000000000100',
      '00000000-0000-4000-8000-000000000105'
    );
    raise exception 'Archived exercise was available as an activity snapshot';
  exception when others then
    if sqlerrm <> 'COMMUNITY_ACTIVITY_NOT_FOUND' then
      raise;
    end if;
  end;

  if public.community_my_activities(
    '00000000-0000-4000-8000-000000000100', 20
  ) <> '[]'::jsonb then
    raise exception 'Archived exercise appeared in selectable activities';
  end if;

  select * into v_challenge from public.community_challenges
  where metric = 'workout_days'
    and (now() at time zone 'Asia/Seoul')::date between starts_on and ends_on
  limit 1;
  if not found or public.community_challenge_progress(
    '00000000-0000-4000-8000-000000000100', v_challenge
  ) <> 0 then
    raise exception 'Archived exercise counted toward a new challenge';
  end if;

  v_ranking := public.community_ranking(
    '00000000-0000-4000-8000-000000000100', 'workout', 'all', null, 20
  );
  if v_ranking->'items' <> '[]'::jsonb then
    raise exception 'Archived exercise counted toward workout ranking';
  end if;

  perform public.community_sync_mileage(
    '00000000-0000-4000-8000-000000000100'
  );
  if exists (
    select 1 from public.community_mileage_ledger
    where user_id = '00000000-0000-4000-8000-000000000100'
      and reason in (
        'workout', 'workout_high_adjustment',
        'workout_streak_5', 'workout_streak_30'
      )
  ) then
    raise exception 'Archived exercise earned new mileage';
  end if;

  insert into public.community_mileage_ledger (
    user_id, amount, reason, source_id, earned_on
  ) values (
    '00000000-0000-4000-8000-000000000100',
    10, 'workout',
    '00000000-0000-4000-8000-000000000105',
    (now() at time zone 'Asia/Seoul')::date
  );
  if (public.community_mileage_summary(
    '00000000-0000-4000-8000-000000000100'
  )->>'balance')::integer <> 10 then
    raise exception 'Existing mileage credit was lost';
  end if;
  v_ranking := public.community_ranking(
    '00000000-0000-4000-8000-000000000100', 'mileage', 'all', null, 20
  );
  if v_ranking->'items' <> '[]'::jsonb then
    raise exception 'Archived exercise credit counted toward current mileage ranking';
  end if;
end;
$$;

rollback;

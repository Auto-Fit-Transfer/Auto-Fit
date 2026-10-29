SET local check_function_bodies = off;

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM "service_role";

CREATE TABLE "public"."allergy_types" (
  "allergy_type_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"            text                     NOT NULL,
  "description"     text,
  "is_active"       boolean                  NOT NULL DEFAULT true,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "allergy_types_name_key" UNIQUE (name),
  CONSTRAINT "allergy_types_pkey" PRIMARY KEY (allergy_type_id)
);

ALTER TABLE "public"."allergy_types"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."body_compositions" (
  "body_composition_id"     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                 uuid                     NOT NULL,
  "uploaded_file_id"        uuid,
  "measured_at"             timestamp with time zone NOT NULL,
  "height_cm"               numeric(5,2),
  "weight_kg"               numeric(5,2),
  "skeletal_muscle_mass_kg" numeric(6,2),
  "body_fat_mass_kg"        numeric(6,2),
  "body_fat_percentage"     numeric(5,2),
  "bmi"                     numeric(5,2),
  "basal_metabolic_rate"    numeric(7,2),
  "visceral_fat_level"      numeric(5,2),
  "body_water_percentage"   numeric(5,2),
  "protein_percentage"      numeric(5,2),
  "raw_data"                jsonb,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "device_name"             text,
  "body_water_liters"       numeric,
  "source_type"             text                     NOT NULL DEFAULT 'ocr'::text,
  CONSTRAINT "body_compositions_pkey" PRIMARY KEY (body_composition_id)
);

ALTER TABLE "public"."body_compositions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."chat_messages" (
  "message_id"  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "chat_id"     uuid                     NOT NULL,
  "user_id"     uuid                     NOT NULL,
  "sender_type" text                     NOT NULL,
  "content"     text                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY (message_id),
  CONSTRAINT "chat_messages_sender_type_check" CHECK ((sender_type = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);

ALTER TABLE "public"."chat_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."chats" (
  "chat_id"    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "title"      text,
  "status"     text                     NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "chats_pkey" PRIMARY KEY (chat_id),
  CONSTRAINT "chats_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);

ALTER TABLE "public"."chats"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."diet_feedback" (
  "diet_feedback_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          uuid                     NOT NULL,
  "diet_meal_id"     uuid                     NOT NULL,
  "feedback_type"    text                     NOT NULL,
  "actual_food_name" text,
  "feedback_note"    text,
  "recorded_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "meal_log_id"      uuid,
  CONSTRAINT "diet_feedback_feedback_type_check" CHECK ((feedback_type = ANY (ARRAY['eaten'::text, 'different_food'::text, 'skipped'::text]))),
  CONSTRAINT "diet_feedback_pkey" PRIMARY KEY (diet_feedback_id)
);

ALTER TABLE "public"."diet_feedback"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."diet_meal_foods" (
  "diet_meal_food_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "diet_meal_id"      uuid                     NOT NULL,
  "food_item_id"      uuid,
  "food_name"         text,
  "quantity"          numeric(7,2),
  "unit"              text,
  "calories"          numeric(7,2),
  "carbohydrates"     numeric(7,2),
  "protein"           numeric(7,2),
  "fat"               numeric(7,2),
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "diet_meal_foods_pkey" PRIMARY KEY (diet_meal_food_id)
);

ALTER TABLE "public"."diet_meal_foods"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."diet_meals" (
  "diet_meal_id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "diet_recommendation_id" uuid                     NOT NULL,
  "meal_type"              text                     NOT NULL,
  "meal_order"             integer                  NOT NULL DEFAULT 1,
  "recommended_calories"   numeric(7,2),
  "recommendation_note"    text,
  "status"                 text                     NOT NULL DEFAULT 'recommended'::text,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "diet_meals_meal_type_check" CHECK ((meal_type = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text]))),
  CONSTRAINT "diet_meals_pkey" PRIMARY KEY (diet_meal_id),
  CONSTRAINT "diet_meals_status_check" CHECK ((status = ANY (ARRAY['recommended'::text, 'completed'::text, 'skipped'::text, 'changed'::text])))
);

ALTER TABLE "public"."diet_meals"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."diet_recommendations" (
  "diet_recommendation_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                uuid                     NOT NULL,
  "recommendation_date"    date                     NOT NULL,
  "target_calories"        numeric(7,2),
  "target_carbohydrates"   numeric(7,2),
  "target_protein"         numeric(7,2),
  "target_fat"             numeric(7,2),
  "recommendation_summary" text,
  "ai_reason"              text,
  "status"                 text                     NOT NULL DEFAULT 'active'::text,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "diet_recommendations_pkey" PRIMARY KEY (diet_recommendation_id),
  CONSTRAINT "diet_recommendations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])))
);

ALTER TABLE "public"."diet_recommendations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."disease_risk_details" (
  "disease_risk_detail_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "disease_risk_id"        uuid                     NOT NULL,
  "disease_name"           text                     NOT NULL,
  "risk_level"             text,
  "risk_score"             numeric(7,4),
  "probability"            numeric(7,4),
  "explanation"            text,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "disease_risk_details_pkey" PRIMARY KEY (disease_risk_detail_id),
  CONSTRAINT "disease_risk_details_risk_level_check" CHECK ((risk_level = ANY (ARRAY['low'::text, 'moderate'::text, 'high'::text])))
);

ALTER TABLE "public"."disease_risk_details"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."disease_risk" (
  "disease_risk_id"    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"            uuid                     NOT NULL,
  "prediction_date"    timestamp with time zone NOT NULL DEFAULT now(),
  "model_name"         text,
  "model_version"      text,
  "overall_risk_level" text,
  "overall_score"      numeric(7,4),
  "summary"            text,
  "raw_result"         jsonb,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "disease_risk_overall_risk_level_check" CHECK ((overall_risk_level = ANY (ARRAY['low'::text, 'moderate'::text, 'high'::text]))),
  CONSTRAINT "disease_risk_pkey" PRIMARY KEY (disease_risk_id)
);

ALTER TABLE "public"."disease_risk"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercise_discomfort_logs" (
  "exercise_discomfort_log_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "exercise_session_id"        uuid                     NOT NULL,
  "exercise_item_id"           uuid,
  "user_id"                    uuid                     NOT NULL,
  "symptom_type"               text                     NOT NULL,
  "severity"                   smallint,
  "body_areas"                 jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "detail"                     text,
  "action_taken"               text,
  "occurred_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_exercise_discomfort_logs_action" CHECK (((action_taken IS NULL) OR (action_taken = ANY (ARRAY['adjust'::text, 'stop'::text, 'continue'::text])))),
  CONSTRAINT "ck_exercise_discomfort_logs_body_areas_array" CHECK ((jsonb_typeof(body_areas) = 'array'::text)),
  CONSTRAINT "ck_exercise_discomfort_logs_severity" CHECK (((severity IS NULL) OR ((severity >= 0) AND (severity <= 10)))),
  CONSTRAINT "ck_exercise_discomfort_logs_symptom" CHECK ((symptom_type = ANY (ARRAY['pain'::text, 'fatigue'::text, 'dizziness'::text, 'breathing'::text, 'other'::text]))),
  CONSTRAINT "exercise_discomfort_logs_pkey" PRIMARY KEY (exercise_discomfort_log_id)
);

ALTER TABLE "public"."exercise_discomfort_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercise_goals" (
  "exercise_goal_id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                 uuid                     NOT NULL,
  "goal_type"               text                     NOT NULL,
  "weekly_frequency"        integer                  NOT NULL,
  "weekly_duration_minutes" integer                  NOT NULL,
  "goal_period_weeks"       integer                  NOT NULL,
  "starts_on"               date                     NOT NULL DEFAULT CURRENT_DATE,
  "ends_on"                 date,
  "status"                  text                     NOT NULL DEFAULT 'active'::text,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_exercise_goals_date_order" CHECK (((ends_on IS NULL) OR (ends_on >= starts_on))),
  CONSTRAINT "ck_exercise_goals_period" CHECK ((goal_period_weeks > 0)),
  CONSTRAINT "ck_exercise_goals_status" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'paused'::text, 'cancelled'::text]))),
  CONSTRAINT "ck_exercise_goals_weekly_duration" CHECK ((weekly_duration_minutes > 0)),
  CONSTRAINT "ck_exercise_goals_weekly_frequency" CHECK (((weekly_frequency >= 1) AND (weekly_frequency <= 7))),
  CONSTRAINT "exercise_goals_pkey" PRIMARY KEY (exercise_goal_id)
);

ALTER TABLE "public"."exercise_goals"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercise_items" (
  "exercise_item_id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "exercise_recommendation_id" uuid                     NOT NULL,
  "exercise_type_id"           uuid,
  "exercise_name"              text                     NOT NULL,
  "sequence_order"             integer                  NOT NULL DEFAULT 1,
  "duration_minutes"           integer,
  "sets"                       integer,
  "repetitions"                integer,
  "calories_burned"            numeric(7,2),
  "intensity"                  text,
  "instruction"                text,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "execution_type"             text,
  "target_duration_seconds"    integer,
  "target_weight_kg"           numeric,
  "rest_seconds"               integer,
  "demo_video_url"             text,
  "thumbnail_url"              text,
  CONSTRAINT "exercise_items_pkey" PRIMARY KEY (exercise_item_id)
);

ALTER TABLE "public"."exercise_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercise_logs" (
  "exercise_log_id"       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"               uuid                     NOT NULL,
  "exercise_item_id"      uuid,
  "exercise_name"         text                     NOT NULL,
  "performed_at"          timestamp with time zone NOT NULL,
  "duration_minutes"      integer,
  "calories_burned"       numeric(7,2),
  "intensity"             text,
  "completed"             boolean                  NOT NULL DEFAULT true,
  "note"                  text,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "exercise_session_id"   uuid,
  "completed_sets"        integer,
  "performed_repetitions" integer,
  "performed_weight_kg"   numeric,
  "skipped"               boolean                  NOT NULL DEFAULT false,
  "skip_reason"           text,
  CONSTRAINT "exercise_logs_pkey" PRIMARY KEY (exercise_log_id)
);

ALTER TABLE "public"."exercise_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercise_preferences" (
  "exercise_preference_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                uuid                     NOT NULL,
  "exercise_type_id"       uuid,
  "preference_level"       text,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "exercise_preferences_pkey" PRIMARY KEY (exercise_preference_id),
  CONSTRAINT "exercise_preferences_preference_level_check" CHECK ((preference_level = ANY (ARRAY['preferred'::text, 'neutral'::text, 'avoid'::text])))
);

ALTER TABLE "public"."exercise_preferences"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercise_recommendation_contexts" (
  "exercise_recommendation_context_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "exercise_recommendation_id"         uuid                     NOT NULL,
  "user_id"                            uuid                     NOT NULL,
  "available_minutes"                  integer                  NOT NULL,
  "location"                           text,
  "available_equipment"                jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "condition_level"                    text,
  "discomfort_areas"                   jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "condition_note"                     text,
  "created_at"                         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_exercise_recommendation_contexts_areas_array" CHECK ((jsonb_typeof(discomfort_areas) = 'array'::text)),
  CONSTRAINT "ck_exercise_recommendation_contexts_equipment_array" CHECK ((jsonb_typeof(available_equipment) = 'array'::text)),
  CONSTRAINT "ck_exercise_recommendation_contexts_minutes" CHECK ((available_minutes > 0)),
  CONSTRAINT "exercise_recommendation_contexts_pkey" PRIMARY KEY (exercise_recommendation_context_id),
  CONSTRAINT "uk_exercise_recommendation_contexts_recommendation" UNIQUE (exercise_recommendation_id)
);

ALTER TABLE "public"."exercise_recommendation_contexts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercise_recommendations" (
  "exercise_recommendation_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                    uuid                     NOT NULL,
  "recommendation_date"        date                     NOT NULL,
  "goal"                       text,
  "total_duration_minutes"     integer,
  "intensity"                  text,
  "recommendation_summary"     text,
  "ai_reason"                  text,
  "status"                     text                     NOT NULL DEFAULT 'active'::text,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "exercise_recommendations_intensity_check" CHECK ((intensity = ANY (ARRAY['low'::text, 'moderate'::text, 'high'::text]))),
  CONSTRAINT "exercise_recommendations_pkey" PRIMARY KEY (exercise_recommendation_id),
  CONSTRAINT "exercise_recommendations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])))
);

ALTER TABLE "public"."exercise_recommendations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercise_session_feedback" (
  "exercise_session_feedback_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "exercise_session_id"          uuid                     NOT NULL,
  "user_id"                      uuid                     NOT NULL,
  "perceived_difficulty"         smallint,
  "post_condition"               text,
  "uncomfortable_areas"          jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "note"                         text,
  "created_at"                   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_exercise_session_feedback_areas_array" CHECK ((jsonb_typeof(uncomfortable_areas) = 'array'::text)),
  CONSTRAINT "ck_exercise_session_feedback_condition"
    CHECK (((post_condition IS NULL) OR (post_condition = ANY (ARRAY['very_bad'::text, 'bad'::text, 'normal'::text, 'good'::text, 'very_good'::text])))),
  CONSTRAINT "ck_exercise_session_feedback_difficulty" CHECK (((perceived_difficulty IS NULL) OR ((perceived_difficulty >= 1) AND (perceived_difficulty <= 5)))),
  CONSTRAINT "exercise_session_feedback_pkey" PRIMARY KEY (exercise_session_feedback_id),
  CONSTRAINT "uk_exercise_session_feedback_session" UNIQUE (exercise_session_id)
);

ALTER TABLE "public"."exercise_session_feedback"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercise_sessions" (
  "exercise_session_id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                    uuid                     NOT NULL,
  "exercise_recommendation_id" uuid,
  "status"                     text                     NOT NULL DEFAULT 'in_progress'::text,
  "started_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at"               timestamp with time zone,
  "planned_item_count"         integer                  NOT NULL DEFAULT 0,
  "completed_item_count"       integer                  NOT NULL DEFAULT 0,
  "skipped_item_count"         integer                  NOT NULL DEFAULT 0,
  "total_duration_seconds"     integer                  NOT NULL DEFAULT 0,
  "total_calories_burned"      numeric                  NOT NULL DEFAULT 0,
  "completion_rate"            numeric(5,2)             NOT NULL DEFAULT 0,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_exercise_sessions_completion_rate" CHECK (((completion_rate >= (0)::numeric) AND (completion_rate <= (100)::numeric))),
  CONSTRAINT "ck_exercise_sessions_counts_nonnegative" CHECK (((planned_item_count >= 0) AND (completed_item_count >= 0) AND (skipped_item_count >= 0))),
  CONSTRAINT "ck_exercise_sessions_status" CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'stopped'::text, 'skipped'::text]))),
  CONSTRAINT "ck_exercise_sessions_time_order" CHECK (((completed_at IS NULL) OR (completed_at >= started_at))),
  CONSTRAINT "ck_exercise_sessions_totals_nonnegative" CHECK (((total_duration_seconds >= 0) AND (total_calories_burned >= (0)::numeric))),
  CONSTRAINT "exercise_sessions_pkey" PRIMARY KEY (exercise_session_id)
);

ALTER TABLE "public"."exercise_sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercise_types" (
  "exercise_type_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"             text                     NOT NULL,
  "category"         text,
  "description"      text,
  "is_active"        boolean                  NOT NULL DEFAULT true,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "exercise_types_name_key" UNIQUE (name),
  CONSTRAINT "exercise_types_pkey" PRIMARY KEY (exercise_type_id)
);

ALTER TABLE "public"."exercise_types"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."food_items" (
  "food_item_id"  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"          text                     NOT NULL,
  "serving_size"  numeric(7,2),
  "serving_unit"  text,
  "calories"      numeric(7,2),
  "carbohydrates" numeric(7,2),
  "protein"       numeric(7,2),
  "fat"           numeric(7,2),
  "sugar"         numeric(7,2),
  "sodium"        numeric(7,2),
  "fiber"         numeric(7,2),
  "description"   text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "brand_name"    text,
  "source_type"   text                     NOT NULL DEFAULT 'reference'::text,
  CONSTRAINT "food_items_pkey" PRIMARY KEY (food_item_id)
);

ALTER TABLE "public"."food_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."health_assessment_items" (
  "health_assessment_item_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "health_assessment_id"      uuid                     NOT NULL,
  "metric_type"               text                     NOT NULL,
  "metric_name"               text                     NOT NULL,
  "metric_value"              numeric,
  "metric_unit"               text,
  "metric_score"              numeric(5,2),
  "evaluation_status"         text,
  "evaluation"                text,
  "sequence_order"            integer                  NOT NULL DEFAULT 0,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_health_assessment_items_score_range" CHECK (((metric_score IS NULL) OR ((metric_score >= (0)::numeric) AND (metric_score <= (100)::numeric)))),
  CONSTRAINT "ck_health_assessment_items_sequence_nonnegative" CHECK ((sequence_order >= 0)),
  CONSTRAINT "health_assessment_items_pkey" PRIMARY KEY (health_assessment_item_id)
);

ALTER TABLE "public"."health_assessment_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."health_assessments" (
  "health_assessment_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"              uuid                     NOT NULL,
  "health_checkup_id"    uuid,
  "body_composition_id"  uuid,
  "assessed_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "overall_score"        numeric(5,2)             NOT NULL,
  "overall_status"       text                     NOT NULL,
  "summary"              text,
  "ai_comment"           text,
  "model_name"           text,
  "model_version"        text,
  "input_snapshot"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "raw_result"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_health_assessments_input_object" CHECK ((jsonb_typeof(input_snapshot) = 'object'::text)),
  CONSTRAINT "ck_health_assessments_result_object" CHECK ((jsonb_typeof(raw_result) = 'object'::text)),
  CONSTRAINT "ck_health_assessments_score_range" CHECK (((overall_score >= (0)::numeric) AND (overall_score <= (100)::numeric))),
  CONSTRAINT "ck_health_assessments_status_not_blank" CHECK ((btrim(overall_status) <> ''::text)),
  CONSTRAINT "health_assessments_pkey" PRIMARY KEY (health_assessment_id)
);

ALTER TABLE "public"."health_assessments"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."health_checkups" (
  "health_checkup_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"           uuid                     NOT NULL,
  "uploaded_file_id"  uuid,
  "checkup_date"      date                     NOT NULL,
  "height_cm"         numeric(5,2),
  "weight_kg"         numeric(5,2),
  "bmi"               numeric(5,2),
  "systolic_bp"       integer,
  "diastolic_bp"      integer,
  "fasting_glucose"   numeric(7,2),
  "total_cholesterol" numeric(7,2),
  "hdl_cholesterol"   numeric(7,2),
  "ldl_cholesterol"   numeric(7,2),
  "triglycerides"     numeric(7,2),
  "ast"               numeric(7,2),
  "alt"               numeric(7,2),
  "gamma_gtp"         numeric(7,2),
  "hemoglobin"        numeric(7,2),
  "raw_data"          jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "institution_name"  text,
  "checkup_type"      text,
  "creatinine"        numeric,
  "source_type"       text                     NOT NULL DEFAULT 'ocr'::text,
  CONSTRAINT "health_checkups_pkey" PRIMARY KEY (health_checkup_id)
);

ALTER TABLE "public"."health_checkups"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."meal_log_items" (
  "meal_log_item_id"       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "meal_log_id"            uuid                     NOT NULL,
  "food_item_id"           uuid,
  "food_name"              text                     NOT NULL,
  "brand_name"             text,
  "quantity"               numeric                  NOT NULL,
  "unit"                   text                     NOT NULL,
  "calories"               numeric,
  "carbohydrates"          numeric,
  "protein"                numeric,
  "fat"                    numeric,
  "sugar"                  numeric,
  "sodium"                 numeric,
  "fiber"                  numeric,
  "recognition_confidence" numeric(5,4),
  "sequence_order"         integer                  NOT NULL DEFAULT 0,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_meal_log_items_confidence_range"
    CHECK (((recognition_confidence IS NULL) OR ((recognition_confidence >= (0)::numeric) AND (recognition_confidence <= (1)::numeric)))),
  CONSTRAINT "ck_meal_log_items_food_name_not_blank" CHECK ((btrim(food_name) <> ''::text)),
  CONSTRAINT "ck_meal_log_items_nutrients_nonnegative"
    CHECK
    ((((calories IS NULL) OR (calories >= (0)::numeric)) AND ((carbohydrates IS NULL) OR (carbohydrates >= (0)::numeric)) AND ((protein IS NULL) OR (protein >= (0)::numeric)) AND
    ((fat IS NULL) OR (fat >= (0)::numeric)) AND ((sugar IS NULL) OR (sugar >= (0)::numeric)) AND ((sodium IS NULL) OR (sodium >= (0)::numeric)) AND
    ((fiber IS NULL) OR (fiber >= (0)::numeric)))),
  CONSTRAINT "ck_meal_log_items_quantity_positive" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "ck_meal_log_items_sequence_nonnegative" CHECK ((sequence_order >= 0)),
  CONSTRAINT "meal_log_items_pkey" PRIMARY KEY (meal_log_item_id)
);

ALTER TABLE "public"."meal_log_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."meal_logs" (
  "meal_log_id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"            uuid                     NOT NULL,
  "diet_meal_id"       uuid,
  "meal_type"          text                     NOT NULL,
  "source_type"        text                     NOT NULL DEFAULT 'manual'::text,
  "eaten_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "photo_storage_path" text,
  "status"             text                     NOT NULL DEFAULT 'recorded'::text,
  "note"               text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_meal_logs_source_type" CHECK ((source_type = ANY (ARRAY['recommendation'::text, 'photo_recognition'::text, 'manual'::text]))),
  CONSTRAINT "ck_meal_logs_status" CHECK ((status = ANY (ARRAY['draft'::text, 'recorded'::text, 'deleted'::text]))),
  CONSTRAINT "meal_logs_pkey" PRIMARY KEY (meal_log_id)
);

ALTER TABLE "public"."meal_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."notification_settings" (
  "notification_setting_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                 uuid                     NOT NULL,
  "diet_enabled"            boolean                  NOT NULL DEFAULT true,
  "exercise_enabled"        boolean                  NOT NULL DEFAULT true,
  "health_report_enabled"   boolean                  NOT NULL DEFAULT true,
  "push_enabled"            boolean                  NOT NULL DEFAULT true,
  "quiet_hours_enabled"     boolean                  NOT NULL DEFAULT false,
  "quiet_hours_start"       time without time zone,
  "quiet_hours_end"         time without time zone,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "notification_settings_pkey" PRIMARY KEY (notification_setting_id),
  CONSTRAINT "notification_settings_user_id_key" UNIQUE (user_id)
);

ALTER TABLE "public"."notification_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."notifications" (
  "notification_id"   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"           uuid                     NOT NULL,
  "notification_type" text                     NOT NULL,
  "title"             text                     NOT NULL,
  "message"           text                     NOT NULL,
  "related_id"        uuid,
  "is_read"           boolean                  NOT NULL DEFAULT false,
  "read_at"           timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "related_type"      text,
  CONSTRAINT "notifications_notification_type_check"
    CHECK ((notification_type = ANY (ARRAY['diet'::text, 'exercise'::text, 'health_report'::text, 'health_data'::text, 'system'::text]))),
  CONSTRAINT "notifications_pkey" PRIMARY KEY (notification_id)
);

ALTER TABLE "public"."notifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."ocr_results" (
  "ocr_result_id"    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "uploaded_file_id" uuid                     NOT NULL,
  "status"           text                     NOT NULL DEFAULT 'pending'::text,
  "raw_text"         text,
  "extracted_data"   jsonb,
  "error_message"    text,
  "started_at"       timestamp with time zone,
  "completed_at"     timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ocr_results_pkey" PRIMARY KEY (ocr_result_id),
  CONSTRAINT "ocr_results_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text]))),
  CONSTRAINT "ocr_results_uploaded_file_id_key" UNIQUE (uploaded_file_id)
);

ALTER TABLE "public"."ocr_results"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "user_id"                 uuid                     NOT NULL,
  "name"                    text                     NOT NULL,
  "nickname"                text,
  "birth_date"              date,
  "gender"                  text,
  "profile_image_url"       text,
  "target_weight"           numeric(5,2),
  "activity_level"          text,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "onboarding_completed_at" timestamp with time zone,
  CONSTRAINT "profiles_activity_level_check" CHECK ((activity_level = ANY (ARRAY['sedentary'::text, 'light'::text, 'moderate'::text, 'active'::text, 'very_active'::text]))),
  CONSTRAINT "profiles_gender_check" CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text]))),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."report_body_compositions" (
  "report_body_composition_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "report_id"                  uuid                     NOT NULL,
  "weight_change"              numeric(6,2),
  "skeletal_muscle_change"     numeric(6,2),
  "body_fat_mass_change"       numeric(6,2),
  "body_fat_percentage_change" numeric(6,2),
  "bmi_change"                 numeric(6,2),
  "evaluation"                 text,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "report_body_compositions_pkey" PRIMARY KEY (report_body_composition_id)
);

ALTER TABLE "public"."report_body_compositions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."report_disease_risk" (
  "report_disease_risk_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "report_id"              uuid                     NOT NULL,
  "disease_name"           text                     NOT NULL,
  "previous_risk_score"    numeric(7,4),
  "current_risk_score"     numeric(7,4),
  "score_change"           numeric(7,4),
  "evaluation"             text,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "report_disease_risk_pkey" PRIMARY KEY (report_disease_risk_id)
);

ALTER TABLE "public"."report_disease_risk"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."report_evaluations" (
  "report_evaluation_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "report_id"            uuid                     NOT NULL,
  "evaluation_type"      text,
  "content"              text                     NOT NULL,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "report_evaluations_evaluation_type_check"
    CHECK ((evaluation_type = ANY (ARRAY['ai_summary'::text, 'health'::text, 'diet'::text, 'exercise'::text, 'lifestyle'::text]))),
  CONSTRAINT "report_evaluations_pkey" PRIMARY KEY (report_evaluation_id)
);

ALTER TABLE "public"."report_evaluations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."report_health_scores" (
  "report_health_score_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "report_id"              uuid                     NOT NULL,
  "health_score"           numeric(5,2),
  "previous_score"         numeric(5,2),
  "score_change"           numeric(5,2),
  "evaluation"             text,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "health_assessment_id"   uuid,
  CONSTRAINT "report_health_scores_pkey" PRIMARY KEY (report_health_score_id)
);

ALTER TABLE "public"."report_health_scores"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."report_lifestyle_metrics" (
  "report_lifestyle_metric_id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "report_id"                         uuid                     NOT NULL,
  "user_id"                           uuid                     NOT NULL,
  "diet_management_rate"              numeric(5,2),
  "exercise_management_rate"          numeric(5,2),
  "overall_achievement_rate"          numeric(5,2),
  "previous_diet_management_rate"     numeric(5,2),
  "previous_exercise_management_rate" numeric(5,2),
  "previous_overall_achievement_rate" numeric(5,2),
  "evaluation"                        text,
  "created_at"                        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_report_lifestyle_metrics_rates"
    CHECK
    ((((diet_management_rate IS NULL) OR ((diet_management_rate >= (0)::numeric) AND (diet_management_rate <= (100)::numeric))) AND ((exercise_management_rate IS NULL) OR
    ((exercise_management_rate >= (0)::numeric) AND (exercise_management_rate <= (100)::numeric))) AND
    ((overall_achievement_rate IS NULL) OR ((overall_achievement_rate >= (0)::numeric) AND (overall_achievement_rate <= (100)::numeric))) AND
    ((previous_diet_management_rate IS NULL) OR ((previous_diet_management_rate >= (0)::numeric) AND (previous_diet_management_rate <= (100)::numeric))) AND
    ((previous_exercise_management_rate IS NULL) OR ((previous_exercise_management_rate >= (0)::numeric) AND (previous_exercise_management_rate <= (100)::numeric))) AND
    ((previous_overall_achievement_rate IS NULL) OR ((previous_overall_achievement_rate >= (0)::numeric) AND (previous_overall_achievement_rate <= (100)::numeric))))),
  CONSTRAINT "report_lifestyle_metrics_pkey" PRIMARY KEY (report_lifestyle_metric_id),
  CONSTRAINT "uk_report_lifestyle_metrics_report" UNIQUE (report_id)
);

ALTER TABLE "public"."report_lifestyle_metrics"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."reports" (
  "report_id"    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "report_type"  text                     NOT NULL,
  "period_start" date                     NOT NULL,
  "period_end"   date                     NOT NULL,
  "title"        text,
  "summary"      text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reports_pkey" PRIMARY KEY (report_id),
  CONSTRAINT "reports_report_type_check" CHECK ((report_type = ANY (ARRAY['weekly'::text, 'monthly'::text, 'custom'::text])))
);

ALTER TABLE "public"."reports"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."terms_versions" (
  "terms_version_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "term_type"        text                     NOT NULL,
  "version"          text                     NOT NULL,
  "title"            text                     NOT NULL,
  "content_url"      text,
  "content_hash"     text,
  "is_required"      boolean                  NOT NULL DEFAULT true,
  "is_active"        boolean                  NOT NULL DEFAULT true,
  "effective_at"     timestamp with time zone NOT NULL,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_terms_versions_term_type_not_blank" CHECK ((btrim(term_type) <> ''::text)),
  CONSTRAINT "ck_terms_versions_version_not_blank" CHECK ((btrim(version) <> ''::text)),
  CONSTRAINT "terms_versions_pkey" PRIMARY KEY (terms_version_id),
  CONSTRAINT "uk_terms_versions_type_version" UNIQUE (term_type, VERSION)
);

ALTER TABLE "public"."terms_versions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."upload_files" (
  "uploaded_file_id"   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"            uuid                     NOT NULL,
  "file_name"          text                     NOT NULL,
  "original_file_name" text,
  "storage_path"       text                     NOT NULL,
  "file_type"          text,
  "mime_type"          text,
  "file_size"          bigint,
  "document_type"      text,
  "upload_status"      text                     NOT NULL DEFAULT 'uploaded'::text,
  "uploaded_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "source_type"        text                     NOT NULL DEFAULT 'file'::text,
  "processing_type"    text                     NOT NULL DEFAULT 'ocr'::text,
  "processing_status"  text,
  CONSTRAINT "upload_files_document_type_check" CHECK ((document_type = ANY (ARRAY['health_checkup'::text, 'body_composition'::text, 'other'::text]))),
  CONSTRAINT "upload_files_pkey" PRIMARY KEY (uploaded_file_id),
  CONSTRAINT "upload_files_upload_status_check" CHECK ((upload_status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);

ALTER TABLE "public"."upload_files"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_allergies" (
  "user_allergy_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "allergy_type_id" uuid,
  "custom_name"     text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_allergies_check" CHECK (((allergy_type_id IS NOT NULL) OR (custom_name IS NOT NULL))),
  CONSTRAINT "user_allergies_pkey" PRIMARY KEY (user_allergy_id)
);

ALTER TABLE "public"."user_allergies"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_food_inventory" (
  "user_food_inventory_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                uuid                     NOT NULL,
  "food_item_id"           uuid,
  "custom_name"            text,
  "quantity"               numeric,
  "unit"                   text,
  "purchased_on"           date,
  "expires_on"             date,
  "freshness_status"       text                     NOT NULL DEFAULT 'fresh'::text,
  "is_available"           boolean                  NOT NULL DEFAULT true,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_user_food_inventory_expiry_order" CHECK (((expires_on IS NULL) OR (purchased_on IS NULL) OR (expires_on >= purchased_on))),
  CONSTRAINT "ck_user_food_inventory_food_reference" CHECK (((food_item_id IS NOT NULL) OR (NULLIF(btrim(custom_name), ''::text) IS NOT NULL))),
  CONSTRAINT "ck_user_food_inventory_freshness_status" CHECK ((freshness_status = ANY (ARRAY['fresh'::text, 'expiring_soon'::text, 'expired'::text, 'unknown'::text]))),
  CONSTRAINT "ck_user_food_inventory_quantity_nonnegative" CHECK (((quantity IS NULL) OR (quantity >= (0)::numeric))),
  CONSTRAINT "user_food_inventory_pkey" PRIMARY KEY (user_food_inventory_id)
);

ALTER TABLE "public"."user_food_inventory"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."user_term_agreements" (
  "user_term_agreement_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                uuid                     NOT NULL,
  "terms_version_id"       uuid                     NOT NULL,
  "agreed"                 boolean                  NOT NULL DEFAULT true,
  "agreed_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "withdrawn_at"           timestamp with time zone,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ck_user_term_agreements_withdrawn_after_agreed" CHECK (((withdrawn_at IS NULL) OR (withdrawn_at >= agreed_at))),
  CONSTRAINT "uk_user_term_agreements_user_version" UNIQUE (user_id, terms_version_id),
  CONSTRAINT "user_term_agreements_pkey" PRIMARY KEY (user_term_agreement_id)
);

ALTER TABLE "public"."user_term_agreements"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.auto_fit_touch_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin

    insert into public.profiles (
        user_id,
        name
    )
    values (
        new.id,
        coalesce(
            new.raw_user_meta_data ->> 'name',
            ''
        )
    )
    on conflict (user_id) do nothing;

    insert into public.notification_settings (
        user_id
    )
    values (
        new.id
    )
    on conflict (user_id) do nothing;

    return new;

end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
    new.updated_at = now();
    return new;
end;
$function$;

CREATE INDEX body_compositions_measured_at_idx ON public.body_compositions USING btree (measured_at DESC);

CREATE INDEX body_compositions_user_id_idx ON public.body_compositions USING btree (user_id);

CREATE INDEX chat_messages_chat_id_idx ON public.chat_messages USING btree (chat_id);

CREATE INDEX chat_messages_created_at_idx ON public.chat_messages USING btree (created_at);

CREATE INDEX chat_messages_user_id_idx ON public.chat_messages USING btree (user_id);

CREATE INDEX chats_updated_at_idx ON public.chats USING btree (updated_at DESC);

CREATE INDEX chats_user_id_idx ON public.chats USING btree (user_id);

CREATE INDEX diet_feedback_meal_id_idx ON public.diet_feedback USING btree (diet_meal_id);

CREATE INDEX diet_feedback_user_id_idx ON public.diet_feedback USING btree (user_id);

CREATE INDEX diet_meal_foods_food_id_idx ON public.diet_meal_foods USING btree (food_item_id);

CREATE INDEX diet_meal_foods_meal_id_idx ON public.diet_meal_foods USING btree (diet_meal_id);

CREATE INDEX diet_meals_recommendation_id_idx ON public.diet_meals USING btree (diet_recommendation_id);

CREATE INDEX diet_recommendations_date_idx ON public.diet_recommendations USING btree (recommendation_date DESC);

CREATE INDEX diet_recommendations_user_id_idx ON public.diet_recommendations USING btree (user_id);

CREATE INDEX disease_risk_details_risk_id_idx ON public.disease_risk_details USING btree (disease_risk_id);

CREATE INDEX disease_risk_prediction_date_idx ON public.disease_risk USING btree (prediction_date DESC);

CREATE INDEX disease_risk_user_id_idx ON public.disease_risk USING btree (user_id);

CREATE INDEX exercise_items_recommendation_id_idx ON public.exercise_items USING btree (exercise_recommendation_id);

CREATE INDEX exercise_logs_performed_at_idx ON public.exercise_logs USING btree (performed_at DESC);

CREATE INDEX exercise_logs_user_id_idx ON public.exercise_logs USING btree (user_id);

CREATE INDEX exercise_preferences_user_id_idx ON public.exercise_preferences USING btree (user_id);

CREATE INDEX exercise_recommendations_date_idx ON public.exercise_recommendations USING btree (recommendation_date DESC);

CREATE INDEX exercise_recommendations_user_id_idx ON public.exercise_recommendations USING btree (user_id);

CREATE INDEX food_items_name_idx ON public.food_items USING btree (name);

CREATE INDEX health_checkups_checkup_date_idx ON public.health_checkups USING btree (checkup_date DESC);

CREATE INDEX health_checkups_user_id_idx ON public.health_checkups USING btree (user_id);

CREATE INDEX idx_diet_feedback_meal_log ON public.diet_feedback USING btree (meal_log_id);

CREATE INDEX idx_exercise_discomfort_logs_session_occurred ON public.exercise_discomfort_logs USING btree (exercise_session_id, occurred_at);

CREATE INDEX idx_exercise_discomfort_logs_user_occurred ON public.exercise_discomfort_logs USING btree (user_id, occurred_at DESC);

CREATE INDEX idx_exercise_goals_user_status ON public.exercise_goals USING btree (user_id, status, starts_on DESC);

CREATE INDEX idx_exercise_logs_session ON public.exercise_logs USING btree (exercise_session_id);

CREATE INDEX idx_exercise_recommendation_contexts_user_created ON public.exercise_recommendation_contexts USING btree (user_id, created_at DESC);

CREATE INDEX idx_exercise_session_feedback_user_created ON public.exercise_session_feedback USING btree (user_id, created_at DESC);

CREATE INDEX idx_exercise_sessions_recommendation ON public.exercise_sessions USING btree (exercise_recommendation_id);

CREATE INDEX idx_exercise_sessions_user_started ON public.exercise_sessions USING btree (user_id, started_at DESC);

CREATE INDEX idx_health_assessment_items_assessment_order ON public.health_assessment_items USING btree (health_assessment_id, sequence_order);

CREATE INDEX idx_health_assessments_body_composition ON public.health_assessments USING btree (body_composition_id);

CREATE INDEX idx_health_assessments_health_checkup ON public.health_assessments USING btree (health_checkup_id);

CREATE INDEX idx_health_assessments_user_assessed ON public.health_assessments USING btree (user_id, assessed_at DESC);

CREATE INDEX idx_meal_log_items_food_item ON public.meal_log_items USING btree (food_item_id);

CREATE INDEX idx_meal_log_items_log_order ON public.meal_log_items USING btree (meal_log_id, sequence_order);

CREATE INDEX idx_meal_logs_diet_meal ON public.meal_logs USING btree (diet_meal_id);

CREATE INDEX idx_meal_logs_user_eaten ON public.meal_logs USING btree (user_id, eaten_at DESC);

CREATE INDEX idx_notifications_user_related ON public.notifications USING btree (user_id, related_type, related_id);

CREATE INDEX idx_report_health_scores_assessment ON public.report_health_scores USING btree (health_assessment_id);

CREATE INDEX idx_report_lifestyle_metrics_user_created ON public.report_lifestyle_metrics USING btree (user_id, created_at DESC);

CREATE INDEX idx_terms_versions_active_effective ON public.terms_versions USING btree (is_active, effective_at DESC);

CREATE INDEX idx_user_food_inventory_food_item ON public.user_food_inventory USING btree (food_item_id);

CREATE INDEX idx_user_food_inventory_user_available_expiry ON public.user_food_inventory USING btree (user_id, is_available, expires_on);

CREATE INDEX idx_user_term_agreements_terms_version ON public.user_term_agreements USING btree (terms_version_id);

CREATE INDEX idx_user_term_agreements_user_agreed ON public.user_term_agreements USING btree (user_id, agreed_at DESC);

CREATE INDEX notification_settings_user_id_idx ON public.notification_settings USING btree (user_id);

CREATE INDEX notifications_created_at_idx ON public.notifications USING btree (created_at DESC);

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (user_id, is_read);

CREATE INDEX notifications_user_id_idx ON public.notifications USING btree (user_id);

CREATE INDEX ocr_results_uploaded_file_id_idx ON public.ocr_results USING btree (uploaded_file_id);

CREATE INDEX profiles_user_id_idx ON public.profiles USING btree (user_id);

CREATE INDEX report_body_compositions_report_id_idx ON public.report_body_compositions USING btree (report_id);

CREATE INDEX report_disease_risk_report_id_idx ON public.report_disease_risk USING btree (report_id);

CREATE INDEX report_evaluations_report_id_idx ON public.report_evaluations USING btree (report_id);

CREATE INDEX report_health_scores_report_id_idx ON public.report_health_scores USING btree (report_id);

CREATE INDEX reports_period_idx ON public.reports USING btree (period_start, period_end);

CREATE INDEX reports_user_id_idx ON public.reports USING btree (user_id);

CREATE UNIQUE INDEX uk_exercise_goals_user_active_type ON public.exercise_goals USING btree (user_id, goal_type)
  WHERE (status = 'active'::text);

CREATE INDEX upload_files_document_type_idx ON public.upload_files USING btree (document_type);

CREATE INDEX upload_files_uploaded_at_idx ON public.upload_files USING btree (uploaded_at DESC);

CREATE INDEX upload_files_user_id_idx ON public.upload_files USING btree (user_id);

CREATE INDEX user_allergies_allergy_type_id_idx ON public.user_allergies USING btree (allergy_type_id);

CREATE INDEX user_allergies_user_id_idx ON public.user_allergies USING btree (user_id);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER body_compositions_updated_at
  BEFORE UPDATE ON public.body_compositions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER chats_updated_at
  BEFORE UPDATE ON public.chats
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_exercise_goals_updated_at
  BEFORE UPDATE ON public.exercise_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fit_touch_updated_at();

CREATE TRIGGER trg_exercise_session_feedback_updated_at
  BEFORE UPDATE ON public.exercise_session_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fit_touch_updated_at();

CREATE TRIGGER trg_exercise_sessions_updated_at
  BEFORE UPDATE ON public.exercise_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fit_touch_updated_at();

CREATE TRIGGER food_items_updated_at
  BEFORE UPDATE ON public.food_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER health_checkups_updated_at
  BEFORE UPDATE ON public.health_checkups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_meal_log_items_updated_at
  BEFORE UPDATE ON public.meal_log_items
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fit_touch_updated_at();

CREATE TRIGGER trg_meal_logs_updated_at
  BEFORE UPDATE ON public.meal_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fit_touch_updated_at();

CREATE TRIGGER notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_user_food_inventory_updated_at
  BEFORE UPDATE ON public.user_food_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fit_touch_updated_at();

CREATE TRIGGER trg_user_term_agreements_updated_at
  BEFORE UPDATE ON public.user_term_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fit_touch_updated_at();

CREATE POLICY "body_compositions_delete_own" ON "public"."body_compositions"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "body_compositions_insert_own" ON "public"."body_compositions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "body_compositions_select_own" ON "public"."body_compositions"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "body_compositions_update_own" ON "public"."body_compositions"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "chat_messages_delete_own" ON "public"."chat_messages"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "chat_messages_insert_own" ON "public"."chat_messages"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "chat_messages_select_own" ON "public"."chat_messages"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "chat_messages_update_own" ON "public"."chat_messages"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "chats_delete_own" ON "public"."chats"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "chats_insert_own" ON "public"."chats"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "chats_select_own" ON "public"."chats"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "chats_update_own" ON "public"."chats"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "diet_feedback_delete_own" ON "public"."diet_feedback"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "diet_feedback_insert_own" ON "public"."diet_feedback"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "diet_feedback_select_own" ON "public"."diet_feedback"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "diet_feedback_update_own" ON "public"."diet_feedback"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "diet_recommendations_delete_own" ON "public"."diet_recommendations"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "diet_recommendations_insert_own" ON "public"."diet_recommendations"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "diet_recommendations_select_own" ON "public"."diet_recommendations"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "diet_recommendations_update_own" ON "public"."diet_recommendations"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "disease_risk_delete_own" ON "public"."disease_risk"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "disease_risk_insert_own" ON "public"."disease_risk"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "disease_risk_select_own" ON "public"."disease_risk"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "disease_risk_update_own" ON "public"."disease_risk"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_discomfort_logs_own_all" ON "public"."exercise_discomfort_logs"
  FOR ALL
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "exercise_goals_own_all" ON "public"."exercise_goals"
  FOR ALL
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "exercise_logs_delete_own" ON "public"."exercise_logs"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_logs_insert_own" ON "public"."exercise_logs"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_logs_select_own" ON "public"."exercise_logs"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_logs_update_own" ON "public"."exercise_logs"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_preferences_delete_own" ON "public"."exercise_preferences"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_preferences_insert_own" ON "public"."exercise_preferences"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_preferences_select_own" ON "public"."exercise_preferences"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_preferences_update_own" ON "public"."exercise_preferences"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_recommendation_contexts_own_all" ON "public"."exercise_recommendation_contexts"
  FOR ALL
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "exercise_recommendations_delete_own" ON "public"."exercise_recommendations"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_recommendations_insert_own" ON "public"."exercise_recommendations"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_recommendations_select_own" ON "public"."exercise_recommendations"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_recommendations_update_own" ON "public"."exercise_recommendations"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "exercise_session_feedback_own_all" ON "public"."exercise_session_feedback"
  FOR ALL
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "exercise_sessions_own_all" ON "public"."exercise_sessions"
  FOR ALL
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "health_assessment_items_parent_read" ON "public"."health_assessment_items"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.health_assessments ha
  WHERE ((ha.health_assessment_id = health_assessment_items.health_assessment_id) AND (ha.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "health_assessments_own_read" ON "public"."health_assessments"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "health_checkups_delete_own" ON "public"."health_checkups"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "health_checkups_insert_own" ON "public"."health_checkups"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "health_checkups_select_own" ON "public"."health_checkups"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "health_checkups_update_own" ON "public"."health_checkups"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "meal_log_items_parent_all" ON "public"."meal_log_items"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.meal_logs ml
  WHERE ((ml.meal_log_id = meal_log_items.meal_log_id) AND (ml.user_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.meal_logs ml
  WHERE ((ml.meal_log_id = meal_log_items.meal_log_id) AND (ml.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "meal_logs_own_all" ON "public"."meal_logs"
  FOR ALL
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "notification_settings_delete_own" ON "public"."notification_settings"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "notification_settings_insert_own" ON "public"."notification_settings"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "notification_settings_select_own" ON "public"."notification_settings"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "notification_settings_update_own" ON "public"."notification_settings"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "notifications_delete_own" ON "public"."notifications"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "notifications_insert_own" ON "public"."notifications"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "notifications_select_own" ON "public"."notifications"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "notifications_update_own" ON "public"."notifications"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "profiles_delete_own" ON "public"."profiles"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "profiles_insert_own" ON "public"."profiles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "profiles_select_own" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "profiles_update_own" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "report_lifestyle_metrics_own_read" ON "public"."report_lifestyle_metrics"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "reports_delete_own" ON "public"."reports"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "reports_insert_own" ON "public"."reports"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "reports_select_own" ON "public"."reports"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "reports_update_own" ON "public"."reports"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "terms_versions_authenticated_read" ON "public"."terms_versions"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "upload_files_delete_own" ON "public"."upload_files"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "upload_files_insert_own" ON "public"."upload_files"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "upload_files_select_own" ON "public"."upload_files"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "upload_files_update_own" ON "public"."upload_files"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "user_allergies_delete_own" ON "public"."user_allergies"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "user_allergies_insert_own" ON "public"."user_allergies"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "user_allergies_select_own" ON "public"."user_allergies"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "user_allergies_update_own" ON "public"."user_allergies"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "user_food_inventory_own_all" ON "public"."user_food_inventory"
  FOR ALL
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "user_term_agreements_own_insert" ON "public"."user_term_agreements"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "user_term_agreements_own_read" ON "public"."user_term_agreements"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "user_term_agreements_own_update" ON "public"."user_term_agreements"
  FOR UPDATE
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

COMMENT ON TABLE "public"."exercise_discomfort_logs" IS 'Symptoms and body areas reported during an exercise session.';

COMMENT ON TABLE "public"."exercise_goals" IS 'Versioned user exercise goals and target periods.';

COMMENT ON TABLE "public"."exercise_recommendation_contexts" IS 'Input snapshot used to generate an exercise recommendation.';

COMMENT ON TABLE "public"."exercise_session_feedback" IS 'Post-session difficulty, condition, and discomfort feedback.';

COMMENT ON TABLE "public"."exercise_sessions" IS 'One execution session of a recommended exercise program.';

COMMENT ON TABLE "public"."health_assessment_items" IS 'Metric-level details belonging to an overall health assessment.';

COMMENT ON TABLE "public"."health_assessments" IS 'Overall AI health assessment, separate from disease-risk prediction.';

COMMENT ON TABLE "public"."meal_log_items" IS 'Food and nutrient snapshots belonging to an actual meal.';

COMMENT ON TABLE "public"."meal_logs" IS 'Header for an actual meal recorded by the user.';

COMMENT ON TABLE "public"."report_lifestyle_metrics" IS 'Structured diet, exercise, and overall achievement metrics for a report.';

COMMENT ON TABLE "public"."terms_versions" IS 'Versioned legal terms shown during onboarding.';

COMMENT ON TABLE "public"."user_food_inventory" IS 'User refrigerator or pantry inventory with expiration data.';

COMMENT ON TABLE "public"."user_term_agreements" IS 'User consent history for a specific terms version.';

GRANT EXECUTE ON FUNCTION "public"."auto_fit_touch_updated_at"() TO PUBLIC, "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC, "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."allergy_types" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."allergy_types" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."allergy_types" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."body_compositions" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."body_compositions" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."body_compositions" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."chat_messages" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."chat_messages" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."chat_messages" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."chats" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."chats" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."chats" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."diet_feedback" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."diet_feedback" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."diet_feedback" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."diet_meal_foods" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."diet_meal_foods" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."diet_meal_foods" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."diet_meals" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."diet_meals" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."diet_meals" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."diet_recommendations" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."diet_recommendations" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."diet_recommendations" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."disease_risk" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."disease_risk" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."disease_risk" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."disease_risk_details" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."disease_risk_details" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."disease_risk_details" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercise_discomfort_logs" TO "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercise_goals" TO "authenticated", "postgres", "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exercise_items" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercise_items" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exercise_items" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exercise_logs" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercise_logs" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exercise_logs" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exercise_preferences" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercise_preferences" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exercise_preferences" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercise_recommendation_contexts" TO "authenticated", "postgres", "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exercise_recommendations" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercise_recommendations" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exercise_recommendations" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercise_session_feedback" TO "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercise_sessions" TO "authenticated", "postgres", "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exercise_types" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercise_types" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."exercise_types" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."food_items" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."food_items" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."food_items" TO "service_role";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."health_assessment_items" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."health_assessment_items" TO "postgres", "service_role";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."health_assessments" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."health_assessments" TO "postgres", "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."health_checkups" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."health_checkups" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."health_checkups" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."meal_log_items" TO "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."meal_logs" TO "authenticated", "postgres", "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."notification_settings" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notification_settings" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."notification_settings" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."notifications" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notifications" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."notifications" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."ocr_results" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ocr_results" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."ocr_results" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."profiles" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."profiles" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."report_body_compositions" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."report_body_compositions" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."report_body_compositions" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."report_disease_risk" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."report_disease_risk" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."report_disease_risk" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."report_evaluations" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."report_evaluations" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."report_evaluations" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."report_health_scores" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."report_health_scores" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."report_health_scores" TO "service_role";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."report_lifestyle_metrics" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."report_lifestyle_metrics" TO "postgres", "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."reports" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reports" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."reports" TO "service_role";

GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."terms_versions" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."terms_versions" TO "postgres", "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."upload_files" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."upload_files" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."upload_files" TO "service_role";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."user_allergies" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_allergies" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."user_allergies" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_food_inventory" TO "authenticated", "postgres", "service_role";

GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_term_agreements" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_term_agreements" TO "postgres", "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES TO "service_role";

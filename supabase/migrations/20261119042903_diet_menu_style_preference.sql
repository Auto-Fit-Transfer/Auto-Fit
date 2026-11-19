-- Keep the choice nullable so existing users retain the balanced AI default.
alter table public.user_app_preferences
  add column menu_style_preference text
    constraint ck_user_app_preferences_menu_style
    check (menu_style_preference in ('everyday', 'health_focused'));

comment on column public.user_app_preferences.menu_style_preference is
  'Explicit diet menu style; null means the AI balanced default.';

-- Rollback after clients stop using GET/PUT /api/diet/preferences:
-- alter table public.user_app_preferences drop column menu_style_preference;

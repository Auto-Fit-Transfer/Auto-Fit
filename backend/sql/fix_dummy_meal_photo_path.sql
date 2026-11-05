-- The dummy recommendation image is not a persisted meal photo.
-- Previous value: menu-images/menus/01.png. No Storage object is deleted.
-- Exact row/value guards preserve any subsequently uploaded real photo.
update public.meal_logs
set photo_storage_path = null
where meal_log_id = '20260916-0000-4000-8000-000000000013'
  and user_id = '3388350b-2b51-4784-a258-7d7f505fa311'
  and note = '[DUMMY 20260916]'
  and photo_storage_path = 'menu-images/menus/01.png'
returning meal_log_id, photo_storage_path;

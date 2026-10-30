create table public.menu_images (
  menu_image_id uuid primary key default gen_random_uuid(),
  image_key text not null unique check (btrim(image_key) <> ''),
  menu_name text not null check (btrim(menu_name) <> ''),
  storage_path text unique,
  source_type text not null check (source_type in ('uploaded', 'generated')),
  generation_status text not null default 'pending'
    check (generation_status in ('pending', 'generating', 'completed', 'failed')),
  model_name text,
  generation_prompt text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_images_completed_has_storage check (
    generation_status <> 'completed' or nullif(btrim(storage_path), '') is not null
  )
);

comment on table public.menu_images is
  'Reusable menu image cache. Generated images transition pending -> generating -> completed or failed.';

create trigger menu_images_updated_at
  before update on public.menu_images
  for each row execute function public.set_updated_at();

alter table public.menu_images enable row level security;
revoke all on table public.menu_images from public, anon, authenticated;
grant select, insert, update, delete on table public.menu_images to service_role;

insert into public.menu_images (
  image_key, menu_name, storage_path, source_type, generation_status, metadata
) values
  ('catalog:01', '닭가슴살 현미밥 도시락', 'menus/01.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '01', 'sha256', 'cd7c2a8ca82ed648ed6f7928d9ef00ee988030650070e97eb529f333aa7f658d')),
  ('catalog:02', '닭다리살 잡곡밥 도시락', 'menus/02.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '02', 'sha256', 'beec71b97ac0e1e0afad63990e5cff440c2bd2e20d2cacabe24f28a0dc0b152d')),
  ('catalog:03', '소고기 채소볶음 덮밥', 'menus/03.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '03', 'sha256', '04bb59a046412c4a01d9cb7b0d87b1a5b77a5501468be471c8a557d8341b19da')),
  ('catalog:04', '돼지고기 제육볶음 덮밥', 'menus/04.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '04', 'sha256', 'a57af3de90847a824c4cef17c94c9f1e1042347705aea4f033a0948512cd13f3')),
  ('catalog:05', '연어구이 현미밥 도시락', 'menus/05.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '05', 'sha256', '62d0c7d3dc115517b9d0fc69e5a86e5d0c58d5c69f7abd1fdf7e70798a0500b5')),
  ('catalog:06', '흰살생선 잡곡밥 도시락', 'menus/06.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '06', 'sha256', '074c6f9eb286a04bd5c50d69f6f84af4b649ae73b63a22afdd427fac18d595b7')),
  ('catalog:07', '두부구이 채소 도시락', 'menus/07.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '07', 'sha256', '962e3a434deabca77824b7d28504dbd4864e5858438fbed8b8c7172fb5134e95')),
  ('catalog:08', '새우 채소볶음밥', 'menus/08.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '08', 'sha256', '588221678d9a8d3c3ec4f6129fe084b4d8a8d355ba59dc5231d9be8f2286a647')),
  ('catalog:09', '닭가슴살 볶음밥', 'menus/09.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '09', 'sha256', '809175cdf7a98f06d7ffef6dd5ba514260d2a42ad78cea21fa4fffb60d153d40')),
  ('catalog:10', '소고기 비빔밥', 'menus/10.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '10', 'sha256', '73c5370ed206abe7045289738d5af31ecd19efde0d571e4f3d181e24566328bc')),
  ('catalog:11', '닭가슴살 샐러드', 'menus/11.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '11', 'sha256', '4480ec5139b1b61de8da31352d66043a72f6b26050fbbabeb4c08918b5109fc2')),
  ('catalog:12', '연어 아보카도 샐러드', 'menus/12.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '12', 'sha256', '3c1946faede7b017123996e407432814bb8bccd004366a5fd874ffd93c7447e2')),
  ('catalog:13', '새우 샐러드', 'menus/13.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '13', 'sha256', 'df5776171bd3239a35c3a10039ea7cb26734937e51cf1ddc231e6e40c9478dc6')),
  ('catalog:14', '달걀 샐러드', 'menus/14.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '14', 'sha256', '1a62d5fa9313c953fa13aeae70e449a0bb1fe51345aa8f7d5ddd9aeecd7cfc8a')),
  ('catalog:15', '두부 버섯 샐러드', 'menus/15.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '15', 'sha256', '140cf25fe0af36683be89807216363cf62a21f59359e83855efb2943fb1e5a8c')),
  ('catalog:16', '리코타치즈 샐러드', 'menus/16.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '16', 'sha256', '3af38d600aa311f8ad1bdc4fa7cce5990f5a0f7f3cf76399152e74cc8de49a09')),
  ('catalog:17', '닭가슴살 포케', 'menus/17.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '17', 'sha256', 'b1aee166b583fcaf59a39837d142023f5a9703a8684ab45919bf2fb856b2dadb')),
  ('catalog:18', '연어 포케', 'menus/18.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '18', 'sha256', 'c72dc2f99c602ccc0edc73f50da9cb3c0ce1e90b8ff02d9cf72073f9f3145f42')),
  ('catalog:19', '소고기 곡물 볼', 'menus/19.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '19', 'sha256', 'cbce66726cbead0e4563e768c67ddf485b155e4732f4d5cd819352a7f27f4360')),
  ('catalog:20', '병아리콩 채소 볼', 'menus/20.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '20', 'sha256', '372aa494ba085f8c6e53ede6e9ad2a86e4f15b9efefc8c5d49164a1cca6b1cef')),
  ('catalog:21', '소고기 불고기 정식', 'menus/21.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '21', 'sha256', '2320f1b168c1fa00b1901d8c0bcd96128020914a5e74256b8bbbcea7af009062')),
  ('catalog:22', '돼지고기 수육 정식', 'menus/22.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '22', 'sha256', '8ab8d48abbb624c3751abf660dc895529733b8374437a1d2a2c4b8ebf6d24cac')),
  ('catalog:23', '닭볶음탕 정식', 'menus/23.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '23', 'sha256', '885cc38d3d25c532d7c5adb0912a3c4a73919bacb00ae2f25ffe2631b0590769')),
  ('catalog:24', '고등어구이 정식', 'menus/24.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '24', 'sha256', 'd3637544f9ce8f49582c87e5fcf43bb1bb54a5dcf9147d4dc9a1871be1b3809b')),
  ('catalog:25', '두부조림 정식', 'menus/25.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '25', 'sha256', '189cf6b402960d69c0c33b871258b12d7012ad33334497184a51fb6c9d58aefe')),
  ('catalog:26', '순두부찌개와 잡곡밥', 'menus/26.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '26', 'sha256', '271eb317642c289101791c4fdd8f1ccc1f4833d34905358b599d29a31d98d7f8')),
  ('catalog:27', '된장찌개와 현미밥', 'menus/27.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '27', 'sha256', 'eb146d325a6fededc9e951e3b2c9abab2ea4afa046dd210fe3bc389decabb3ba')),
  ('catalog:28', '소고기 미역국과 잡곡밥', 'menus/28.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '28', 'sha256', '4333e17c4999dbb29c961aba9937686dc1e9084a0ab6feee69ad2c4430036144')),
  ('catalog:29', '닭개장과 현미밥', 'menus/29.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '29', 'sha256', '8b7039fcb309292ee59379773e4224213e99bc0a9ada9cff3d67b2a0269ac982')),
  ('catalog:30', '계란찜 한식 정식', 'menus/30.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '30', 'sha256', '5dbdd0c10fb26815389030f91a3292e3c8f3b5fab8d0d274f3793c3aefcc02ac')),
  ('catalog:31', '닭가슴살 통밀 샌드위치', 'menus/31.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '31', 'sha256', '0ae003a83b9ee1a7abb60547450c832905bbace982da227e9f6031665e9ceaf0')),
  ('catalog:32', '달걀 아보카도 토스트', 'menus/32.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '32', 'sha256', 'd51c590e49c8f6a2c58a3c0707d499647708e19122e5200090c265e54e2cb674')),
  ('catalog:33', '닭가슴살 토마토 파스타', 'menus/33.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '33', 'sha256', 'd8bf41aceee2e0f11899072d5c214546d6c1e03c392245a4bef031a6b1236e86')),
  ('catalog:34', '새우 오일 파스타', 'menus/34.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '34', 'sha256', 'ef454fda997a1bd542e96cfe4d8c320682e4bf09bc3ebbf75d4b183896780eee')),
  ('catalog:35', '닭가슴살 메밀면', 'menus/35.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '35', 'sha256', '7ea09c59b2b50b1e2d358669251a2e3f6d54be420491cd9ef3ce6a80bcfa9329')),
  ('catalog:36', '소고기 또띠아 랩', 'menus/36.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '36', 'sha256', 'a405706c93652bed80498a5d2dc5a7c3e8891d7b331f05d3ad6b7680e2302915')),
  ('catalog:37', '그릭요거트 과일 볼', 'menus/37.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '37', 'sha256', '0c7166a202a9ca08a286dcb5d0e519de25b24995be9e335d3e26a25e3b28349f')),
  ('catalog:38', '오트밀 바나나 볼', 'menus/38.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '38', 'sha256', 'a5b9a4bc7c205f2cc185c1832698a51dab8fd042ec4961a87bf8c342e930cd17')),
  ('catalog:39', '고구마·삶은 달걀 플레이트', 'menus/39.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '39', 'sha256', 'e0d6ab4aac485d5f5145ba7a9f9b87cc28d8183f9d5f47bb8e6444c04eb493e1')),
  ('catalog:40', '단백질 쉐이크와 과일', 'menus/40.png', 'uploaded', 'completed', jsonb_build_object('catalog_id', '40', 'sha256', 'ec21ba372f41a2dc1971a504888e39e68a2e4cbf7959c5e10a794ec09f50f227'))
on conflict (image_key) do update set
  menu_name = excluded.menu_name,
  storage_path = excluded.storage_path,
  metadata = excluded.metadata,
  updated_at = now();

alter table public.diet_meals
  add column if not exists menu_image_key text;

update public.diet_meals dm
set menu_image_key = mi.image_key
from public.menu_images mi
where dm.image_storage_path = mi.storage_path
  and dm.menu_image_key is null;

comment on column public.diet_meals.menu_image_key is
  'Stable cache key resolved through public.menu_images before any image generation fallback.';

create or replace function public.create_diet_recommendation(
  p_user_id uuid,
  p_recommendation jsonb,
  p_meals jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recommendation public.diet_recommendations%rowtype;
  v_meal public.diet_meals%rowtype;
  v_meal_input jsonb;
  v_food_input jsonb;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;
  if jsonb_typeof(p_recommendation) <> 'object' then
    raise exception 'recommendation must be an object';
  end if;
  if jsonb_typeof(p_meals) <> 'array' or jsonb_array_length(p_meals) not between 1 and 4 then
    raise exception 'meals must contain between 1 and 4 items';
  end if;
  if coalesce((p_recommendation ->> 'target_calories')::numeric, 0) <= 0 then
    raise exception 'target_calories must be positive';
  end if;

  update public.diet_recommendations
  set status = 'cancelled'
  where user_id = p_user_id
    and recommendation_date = (p_recommendation ->> 'recommendation_date')::date
    and status = 'active';

  insert into public.diet_recommendations (
    user_id,
    recommendation_date,
    target_calories,
    target_carbohydrates,
    target_protein,
    target_fat,
    recommendation_summary,
    ai_reason,
    status
  ) values (
    p_user_id,
    (p_recommendation ->> 'recommendation_date')::date,
    (p_recommendation ->> 'target_calories')::numeric,
    (p_recommendation ->> 'target_carbohydrates')::numeric,
    (p_recommendation ->> 'target_protein')::numeric,
    (p_recommendation ->> 'target_fat')::numeric,
    nullif(btrim(p_recommendation ->> 'recommendation_summary'), ''),
    nullif(btrim(p_recommendation ->> 'ai_reason'), ''),
    'active'
  ) returning * into v_recommendation;

  for v_meal_input in select value from jsonb_array_elements(p_meals)
  loop
    if v_meal_input ->> 'meal_type' not in ('breakfast', 'lunch', 'dinner', 'snack') then
      raise exception 'invalid meal_type';
    end if;
    if jsonb_typeof(v_meal_input -> 'foods') <> 'array'
       or jsonb_array_length(v_meal_input -> 'foods') = 0 then
      raise exception 'each meal must contain foods';
    end if;

    insert into public.diet_meals (
      diet_recommendation_id,
      meal_type,
      meal_order,
      recommended_calories,
      recommendation_note,
      image_storage_path,
      menu_image_key,
      status
    ) values (
      v_recommendation.diet_recommendation_id,
      v_meal_input ->> 'meal_type',
      (v_meal_input ->> 'meal_order')::integer,
      (v_meal_input ->> 'recommended_calories')::numeric,
      nullif(btrim(v_meal_input ->> 'recommendation_note'), ''),
      nullif(btrim(v_meal_input ->> 'image_storage_path'), ''),
      nullif(btrim(v_meal_input ->> 'menu_image_key'), ''),
      'recommended'
    ) returning * into v_meal;

    for v_food_input in select value from jsonb_array_elements(v_meal_input -> 'foods')
    loop
      if nullif(btrim(v_food_input ->> 'food_name'), '') is null then
        raise exception 'food_name is required';
      end if;
      insert into public.diet_meal_foods (
        diet_meal_id,
        food_name,
        quantity,
        unit,
        calories,
        carbohydrates,
        protein,
        fat
      ) values (
        v_meal.diet_meal_id,
        btrim(v_food_input ->> 'food_name'),
        (v_food_input ->> 'quantity')::numeric,
        nullif(btrim(v_food_input ->> 'unit'), ''),
        (v_food_input ->> 'calories')::numeric,
        (v_food_input ->> 'carbohydrates')::numeric,
        (v_food_input ->> 'protein')::numeric,
        (v_food_input ->> 'fat')::numeric
      );
    end loop;
  end loop;

  return to_jsonb(v_recommendation);
end;
$$;

create or replace function public.replace_diet_meal(
  p_user_id uuid,
  p_diet_meal_id uuid,
  p_meal jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recommendation public.diet_recommendations%rowtype;
  v_meal public.diet_meals%rowtype;
  v_food_input jsonb;
  v_old_representative text;
  v_new_representative text;
  v_new_calories numeric;
  v_foods jsonb;
begin
  if p_user_id is null or p_diet_meal_id is null then
    raise exception 'user_id and diet_meal_id are required';
  end if;
  if jsonb_typeof(p_meal) <> 'object' then
    raise exception 'meal must be an object';
  end if;
  if jsonb_typeof(p_meal -> 'foods') <> 'array'
     or jsonb_array_length(p_meal -> 'foods') not between 1 and 20 then
    raise exception 'meal foods must contain between 1 and 20 items';
  end if;

  select dr.* into v_recommendation
  from public.diet_recommendations dr
  join public.diet_meals dm
    on dm.diet_recommendation_id = dr.diet_recommendation_id
  where dm.diet_meal_id = p_diet_meal_id
    and dr.user_id = p_user_id
  for update of dr;

  if not found then
    raise exception 'diet meal not found for user';
  end if;

  select dm.* into v_meal
  from public.diet_meals dm
  where dm.diet_meal_id = p_diet_meal_id
    and dm.diet_recommendation_id = v_recommendation.diet_recommendation_id
  for update;

  if v_recommendation.status <> 'active' or v_meal.status <> 'recommended' then
    raise exception 'diet meal cannot be regenerated in its current state';
  end if;
  if p_meal ->> 'meal_type' <> v_meal.meal_type then
    raise exception 'meal_type cannot be changed';
  end if;
  if coalesce((p_meal ->> 'meal_order')::integer, -1) <> v_meal.meal_order then
    raise exception 'meal_order cannot be changed';
  end if;

  v_new_calories := (p_meal ->> 'recommended_calories')::numeric;
  if coalesce(v_new_calories, 0) <= 0 then
    raise exception 'recommended_calories must be positive';
  end if;
  if v_meal.recommended_calories is not null
     and (
       v_new_calories < v_meal.recommended_calories * 0.85
       or v_new_calories > v_meal.recommended_calories * 1.15
     ) then
    raise exception 'replacement calories must be within 15 percent';
  end if;

  select coalesce(dmf.food_name, fi.name) into v_old_representative
  from public.diet_meal_foods dmf
  left join public.food_items fi on fi.food_item_id = dmf.food_item_id
  where dmf.diet_meal_id = p_diet_meal_id
  order by dmf.created_at, dmf.diet_meal_food_id
  limit 1;

  v_new_representative := nullif(btrim(p_meal -> 'foods' -> 0 ->> 'food_name'), '');
  if v_new_representative is null then
    raise exception 'representative food_name is required';
  end if;
  if v_old_representative is not null
     and lower(btrim(v_old_representative)) = lower(v_new_representative) then
    raise exception 'representative food must be changed';
  end if;

  for v_food_input in select value from jsonb_array_elements(p_meal -> 'foods')
  loop
    if nullif(btrim(v_food_input ->> 'food_name'), '') is null then
      raise exception 'food_name is required';
    end if;
    if coalesce((v_food_input ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'food quantity must be positive';
    end if;
    if nullif(btrim(v_food_input ->> 'unit'), '') is null then
      raise exception 'food unit is required';
    end if;
    if coalesce((v_food_input ->> 'calories')::numeric, 0) < 0
       or coalesce((v_food_input ->> 'carbohydrates')::numeric, 0) < 0
       or coalesce((v_food_input ->> 'protein')::numeric, 0) < 0
       or coalesce((v_food_input ->> 'fat')::numeric, 0) < 0 then
      raise exception 'food nutrients must be nonnegative';
    end if;
  end loop;

  delete from public.diet_meal_foods
  where diet_meal_id = p_diet_meal_id;

  update public.diet_meals
  set recommended_calories = v_new_calories,
      recommendation_note = nullif(btrim(p_meal ->> 'recommendation_note'), ''),
      image_storage_path = nullif(btrim(p_meal ->> 'image_storage_path'), ''),
      menu_image_key = nullif(btrim(p_meal ->> 'menu_image_key'), ''),
      status = 'recommended'
  where diet_meal_id = p_diet_meal_id
  returning * into v_meal;

  for v_food_input in select value from jsonb_array_elements(p_meal -> 'foods')
  loop
    insert into public.diet_meal_foods (
      diet_meal_id,
      food_name,
      quantity,
      unit,
      calories,
      carbohydrates,
      protein,
      fat
    ) values (
      p_diet_meal_id,
      btrim(v_food_input ->> 'food_name'),
      (v_food_input ->> 'quantity')::numeric,
      btrim(v_food_input ->> 'unit'),
      (v_food_input ->> 'calories')::numeric,
      (v_food_input ->> 'carbohydrates')::numeric,
      (v_food_input ->> 'protein')::numeric,
      (v_food_input ->> 'fat')::numeric
    );
  end loop;

  select coalesce(
    jsonb_agg(to_jsonb(dmf) order by dmf.created_at, dmf.diet_meal_food_id),
    '[]'::jsonb
  ) into v_foods
  from public.diet_meal_foods dmf
  where dmf.diet_meal_id = p_diet_meal_id;

  return to_jsonb(v_meal) || jsonb_build_object('foods', v_foods);
end;
$$;

revoke all on function public.replace_diet_meal(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_diet_meal(uuid, uuid, jsonb)
  to service_role;

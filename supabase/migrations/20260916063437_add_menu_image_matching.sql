alter table public.menu_images
  add column if not exists food_tags text[] not null default '{}'::text[];

update public.menu_images
set food_tags = case image_key
  when 'catalog:01' then array['닭가슴살','현미밥','도시락']::text[]
  when 'catalog:02' then array['닭다리살','잡곡밥','도시락']::text[]
  when 'catalog:03' then array['소고기','채소','덮밥']::text[]
  when 'catalog:04' then array['돼지고기','덮밥']::text[]
  when 'catalog:05' then array['연어','현미밥','도시락']::text[]
  when 'catalog:06' then array['흰살생선','잡곡밥','도시락']::text[]
  when 'catalog:07' then array['두부','채소','도시락']::text[]
  when 'catalog:08' then array['새우','볶음밥','채소']::text[]
  when 'catalog:09' then array['닭가슴살','볶음밥']::text[]
  when 'catalog:10' then array['소고기','비빔밥']::text[]
  when 'catalog:11' then array['닭가슴살','샐러드']::text[]
  when 'catalog:12' then array['연어','샐러드','아보카도']::text[]
  when 'catalog:13' then array['새우','샐러드']::text[]
  when 'catalog:14' then array['달걀','샐러드']::text[]
  when 'catalog:15' then array['두부','샐러드','버섯']::text[]
  when 'catalog:16' then array['리코타치즈','샐러드']::text[]
  when 'catalog:17' then array['닭가슴살','포케']::text[]
  when 'catalog:18' then array['연어','포케']::text[]
  when 'catalog:19' then array['소고기','볼']::text[]
  when 'catalog:20' then array['병아리콩','채소','볼']::text[]
  when 'catalog:21' then array['소고기','정식']::text[]
  when 'catalog:22' then array['돼지고기','정식']::text[]
  when 'catalog:23' then array['닭고기','정식']::text[]
  when 'catalog:24' then array['고등어','정식']::text[]
  when 'catalog:25' then array['두부','정식']::text[]
  when 'catalog:26' then array['두부','잡곡밥','찌개']::text[]
  when 'catalog:27' then array['현미밥','찌개']::text[]
  when 'catalog:28' then array['소고기','잡곡밥','국']::text[]
  when 'catalog:29' then array['닭고기','현미밥','국']::text[]
  when 'catalog:30' then array['달걀','정식']::text[]
  when 'catalog:31' then array['닭가슴살','통밀빵']::text[]
  when 'catalog:32' then array['달걀','통밀빵','아보카도']::text[]
  when 'catalog:33' then array['닭가슴살','파스타']::text[]
  when 'catalog:34' then array['새우','파스타']::text[]
  when 'catalog:35' then array['닭가슴살','메밀면']::text[]
  when 'catalog:36' then array['소고기','또띠아','랩']::text[]
  when 'catalog:37' then array['그릭요거트','과일','볼']::text[]
  when 'catalog:38' then array['오트밀','과일','볼']::text[]
  when 'catalog:39' then array['달걀','고구마']::text[]
  when 'catalog:40' then array['단백질쉐이크','과일']::text[]
  else food_tags
end
where image_key like 'catalog:%';

create index if not exists menu_images_food_tags_gin_idx
  on public.menu_images using gin (food_tags);

comment on column public.menu_images.food_tags is
  'Canonical food and presentation tags used by backend image matching.';

create or replace function public.claim_menu_image(
  p_image_key text,
  p_menu_name text,
  p_food_tags text[]
)
returns public.menu_images
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_image public.menu_images%rowtype;
begin
  if nullif(btrim(p_image_key), '') is null then
    raise exception 'image_key is required';
  end if;
  if nullif(btrim(p_menu_name), '') is null then
    raise exception 'menu_name is required';
  end if;
  if coalesce(cardinality(p_food_tags), 0) = 0 then
    raise exception 'food_tags are required';
  end if;

  insert into public.menu_images (
    image_key,
    menu_name,
    food_tags,
    source_type,
    generation_status
  ) values (
    btrim(p_image_key),
    btrim(p_menu_name),
    p_food_tags,
    'generated',
    'pending'
  )
  on conflict (image_key) do nothing;

  select mi.* into v_image
  from public.menu_images mi
  where mi.image_key = btrim(p_image_key);

  return v_image;
end;
$$;

revoke all on function public.claim_menu_image(text,text,text[])
  from public, anon, authenticated;
grant execute on function public.claim_menu_image(text,text,text[])
  to service_role;

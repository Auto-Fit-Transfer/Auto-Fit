-- The current measurements entered during signup are separate from the
-- target weight and from dated health-document measurements.
alter table public.profiles
  add column height_cm numeric(5,2),
  add column weight_kg numeric(5,2),
  add constraint profiles_height_cm_range check (
    height_cm is null or height_cm between 100 and 250
  ),
  add constraint profiles_weight_kg_range check (
    weight_kg is null or weight_kg between 20 and 500
  );

comment on column public.profiles.height_cm is
  'Current height in centimeters entered by the account holder; nullable for existing profiles.';
comment on column public.profiles.weight_kg is
  'Current weight in kilograms entered by the account holder; separate from target_weight.';

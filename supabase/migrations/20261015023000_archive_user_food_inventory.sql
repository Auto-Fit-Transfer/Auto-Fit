-- The refrigerator feature was removed from the Main mobile experience.
-- Preserve existing rows outside the public API schema so the change stays reversible.
create schema if not exists archive;

revoke all on schema archive from public, anon, authenticated;

alter table public.user_food_inventory set schema archive;

comment on table archive.user_food_inventory is
  'Archived refrigerator inventory. The mobile refrigerator feature was retired on 2026-10-15.';

revoke all on table archive.user_food_inventory from anon, authenticated;
grant usage on schema archive to service_role;
grant select on table archive.user_food_inventory to service_role;

-- The currently deployed backend still performs read-only inventory lookups while
-- recommendations and reports are being generated. Return an empty set so those
-- requests remain healthy without using archived refrigerator data.
create view public.user_food_inventory
with (security_invoker = true)
as
select *
from archive.user_food_inventory
where false;

comment on view public.user_food_inventory is
  'Compatibility view for the retired refrigerator feature. Always returns no rows.';

revoke all on table public.user_food_inventory from public, anon, authenticated;
grant select on table public.user_food_inventory to service_role;

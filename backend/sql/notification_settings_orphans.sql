-- Read-only audit. No rows are deleted; review provenance before cleanup.
select n.notification_setting_id, n.user_id, n.created_at,
       (p.user_id is not null) as has_profile,
       (u.id is not null) as has_auth_user
from public.notification_settings n
left join public.profiles p on p.user_id = n.user_id
left join auth.users u on u.id = n.user_id
where p.user_id is null or u.id is null
order by n.created_at, n.notification_setting_id;

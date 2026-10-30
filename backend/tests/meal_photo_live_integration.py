"""Verify photo persistence against dev Supabase, locally or on deployed API."""
import argparse
import asyncio
import base64
import secrets
from datetime import datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
from dotenv import dotenv_values
from backend.app import main
from backend.tests.live_test_cleanup import cleanup_user_defaults

PROJECT = "eeeqibyssajykrhvecbv"
API_BASE = "https://auto-fit-api-dev.onrender.com"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")


async def run(local: bool) -> None:
    config = dotenv_values("backend/.env")
    assert config["SUPABASE_URL"].rstrip('/') == f"https://{PROJECT}.supabase.co"
    settings = main.Settings(config["SUPABASE_URL"], config["SUPABASE_PUBLISHABLE_KEY"],
                             config["SUPABASE_SERVICE_ROLE_KEY"], "http://localhost:3000")
    admin = main.service_headers(settings)
    user_ids, tokens, paths = [], [], []
    log_id = str(uuid4())
    today = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
    checks = 0

    def check(ok, label):
        nonlocal checks
        assert ok, label
        checks += 1
        print(f"PASS {label}", flush=True)

    if local:
        main.app.dependency_overrides[main.get_settings] = lambda: settings
    async with httpx.AsyncClient(base_url=settings.supabase_url, timeout=30, trust_env=False) as db:
        try:
            for _ in range(2):
                email, password = f"autofit-photo-test-{uuid4().hex}@example.invalid", "Af9!" + secrets.token_urlsafe(32)
                created = await db.post('/auth/v1/admin/users', headers=admin,
                                       json={"email": email, "password": password, "email_confirm": True,
                                             "app_metadata": {"autofit_integration_test": True}})
                check(created.status_code in (200, 201), 'create disposable test user')
                user_ids.append(created.json()['id'])
                login = await db.post('/auth/v1/token?grant_type=password',
                                     headers={"apikey": settings.supabase_publishable_key},
                                     json={"email": email, "password": password})
                check(login.status_code == 200, 'authenticate test user')
                tokens.append(login.json()['access_token'])
            created = await db.post('/rest/v1/meal_logs', headers=admin,
                                   json={"meal_log_id": log_id, "user_id": user_ids[0],
                                         "meal_type": "lunch", "source_type": "manual"})
            check(created.status_code == 201, 'create persisted test meal log')
            transport = httpx.ASGITransport(app=main.app) if local else None
            async with httpx.AsyncClient(base_url='http://localhost' if local else API_BASE,
                                         transport=transport, timeout=90, trust_env=False) as api:
                owner, other = [{"Authorization": f"Bearer {token}"} for token in tokens]
                route = f'/api/diet/meal-logs/{log_id}/photo'
                denied = await api.post(route, headers=other, files={"file": ('meal.png', PNG, 'image/png')})
                check(denied.status_code == 404, 'block foreign upload')
                uploaded = await api.post(route, headers=owner, files={"file": ('meal.png', PNG, 'image/png')})
                check(uploaded.status_code == 201, 'upload photo through authenticated API')
                paths.append(uploaded.json()['image_storage_path'])
                again = await api.post(route, headers=owner, files={"file": ('meal.png', PNG, 'image/png')})
                check(again.status_code == 409, 'prevent duplicate photo overwrite')
                # A new HTTP client represents re-entry without any local photo URI.
            async with httpx.AsyncClient(base_url='http://localhost' if local else API_BASE,
                                         transport=transport, timeout=90, trust_env=False) as api:
                listed = await api.get('/api/diet/meal-logs', headers=owner,
                                       params={"from_date": today, "to_date": today})
                check(listed.status_code == 200, 'reload meal logs on new client')
                photo = next(log for log in listed.json()['logs'] if log['meal_log_id'] == log_id)
                check(photo['image_storage_path'] == paths[0] and photo['image_url_expires_in'] == 3600,
                      'restore persisted photo path and temporary URL')
                hidden = await api.get('/api/diet/meal-logs', headers=other,
                                       params={"from_date": today, "to_date": today})
                check(hidden.status_code == 200 and not hidden.json()['logs'], 'isolate photo records by owner')
                downloaded = await db.get(photo['image_url'])
                check(downloaded.status_code == 200 and downloaded.content == PNG, 'download original bytes using restored URL')
                public = await db.get(f'/storage/v1/object/public/meal-photos/{paths[0]}')
                check(public.status_code != 200, 'deny public access to private photo')
            print(f'COMPLETE {checks} checks ({"local API + remote DB" if local else "deployed API"})')
        finally:
            # Discover committed paths even if an upload response was lost.
            found = await db.get('/rest/v1/meal_logs', headers=admin,
                                 params={"meal_log_id": f"eq.{log_id}", "select": "photo_storage_path"})
            if found.is_success:
                paths.extend(row['photo_storage_path'] for row in found.json() if row.get('photo_storage_path'))
            errors = []
            for path in set(paths):
                removed = await db.delete(f'/storage/v1/object/meal-photos/{path}', headers=admin)
                if not removed.is_success:
                    errors.append('photo cleanup')
            removed = await db.delete('/rest/v1/meal_logs', headers=admin, params={"meal_log_id": f"eq.{log_id}"})
            if not removed.is_success:
                errors.append('meal log cleanup')
            for token in tokens:
                await db.post('/auth/v1/logout?scope=global', headers={"apikey": settings.supabase_publishable_key,
                              "Authorization": f"Bearer {token}"})
            for user_id in user_ids:
                errors.extend(await cleanup_user_defaults(db, admin, user_id))
                removed = await db.delete(f'/auth/v1/admin/users/{user_id}', headers=admin)
                if not removed.is_success:
                    errors.append('test user cleanup')
            main.app.dependency_overrides.clear()
            if errors:
                raise RuntimeError(', '.join(errors))
            print('PASS cleanup disposable test resources')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--local', action='store_true')
    asyncio.run(run(parser.parse_args().local))

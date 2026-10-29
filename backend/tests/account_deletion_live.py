"""Opt-in: delete only the synthetic account and files created by this run.

Uses the local backend route with real Supabase authentication and services.
Never prints credentials, tokens, private paths, or response bodies.
"""
import argparse
import asyncio
import base64
import secrets
from uuid import uuid4

import httpx
from dotenv import dotenv_values

from backend.app import main
from backend.app.account_deletion import service_headers

PROJECT = "eeeqibyssajykrhvecbv"


async def run(api_base=None):
    if api_base not in (None, "https://auto-fit-api-dev.onrender.com"):
        raise ValueError("Unapproved API target")
    config = dotenv_values("backend/.env")
    assert config["SUPABASE_URL"].rstrip("/") == f"https://{PROJECT}.supabase.co"
    settings = main.Settings(config["SUPABASE_URL"].rstrip("/"), config["SUPABASE_PUBLISHABLE_KEY"],
                             config["SUPABASE_SERVICE_ROLE_KEY"], "http://localhost:3000")
    headers = service_headers(settings)
    uid = None
    files = []
    deleted = False
    checks = 0

    def check(condition, label):
        nonlocal checks
        assert condition, label
        checks += 1
        print(f"PASS {label}", flush=True)

    async with httpx.AsyncClient(base_url=settings.supabase_url, timeout=30, trust_env=False) as remote:
        try:
            password = "Af9!" + secrets.token_urlsafe(32)
            email = f"autofit-delete-test-{uuid4().hex}@example.com"
            response = await remote.post("/auth/v1/admin/users", headers=headers, json={
                "email": email, "password": password, "email_confirm": True,
                "app_metadata": {"autofit_integration_test": True},
            })
            if response.status_code not in (200, 201):
                code = response.json().get("error_code", response.json().get("code", "unknown"))
                print(f"Auth fixture creation failed: HTTP {response.status_code}, code={code}", flush=True)
            check(response.status_code in (200, 201), "create this run's synthetic account")
            uid = response.json()["id"]
            response = await remote.post("/auth/v1/token?grant_type=password",
                headers={"apikey": settings.supabase_publishable_key}, json={"email": email, "password": password})
            check(response.status_code == 200, "real Supabase password login")
            token = response.json()["access_token"]
            chat = str(uuid4())
            upload = str(uuid4())
            response = await remote.patch("/rest/v1/profiles", headers=headers,
                params={"user_id": f"eq.{uid}"}, json={"name": "Synthetic deletion test"})
            check(response.is_success, "populate profile")
            for table, row in [
                ("chats", {"chat_id": chat, "user_id": uid}),
                ("chat_messages", {"chat_id": chat, "user_id": uid, "sender_type": "user", "content": "Deletion test"}),
                ("upload_files", {"uploaded_file_id": upload, "user_id": uid, "file_name": "test.pdf", "storage_path": f"{uid}/deletion-test.pdf"}),
                ("ocr_results", {"uploaded_file_id": upload}),
            ]:
                response = await remote.post(f"/rest/v1/{table}", headers=headers, json=row)
                check(response.is_success, f"create synthetic {table}")
            for bucket, path, mime, content in [
                ("health-documents", f"{uid}/deletion-test.pdf", "application/pdf", b"%PDF-1.4\n% synthetic deletion fixture\n%%EOF"),
                ("meal-photos", f"{uid}/deletion-test.png", "image/png", base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=")),
            ]:
                files.append((bucket, path))
                response = await remote.post(f"/storage/v1/object/{bucket}/{path}",
                    headers={**headers, "Content-Type": mime}, content=content)
                check(response.is_success, f"upload real synthetic object in {bucket}")
            if api_base is None:
                main.app.dependency_overrides[main.get_settings] = lambda: settings
            api_options = {"base_url": api_base, "trust_env": False, "timeout": 60} if api_base else {
                "transport": httpx.ASGITransport(app=main.app), "base_url": "http://localhost"}
            async with httpx.AsyncClient(**api_options) as api:
                response = await api.delete("/api/account", headers={"Authorization": f"Bearer {token}"})
                if response.status_code != 204:
                    known_details = {"Account deletion could not be started", "Account file listing failed; retry account deletion",
                                     "Account files remain; retry account deletion", "Account file deletion failed; retry account deletion",
                                     "Account deletion failed; retry account deletion", "Account deletion service unavailable; retry account deletion",
                                     "Invalid or expired Supabase session"}
                    try:
                        detail = response.json().get("detail")
                    except ValueError:
                        detail = None
                    print(f"Deletion route failed: HTTP {response.status_code}, step={detail if detail in known_details else 'unknown'}", flush=True)
                check(response.status_code == 204, "authenticated DELETE account route")
                deleted = True
                response = await api.get("/api/profile", headers={"Authorization": f"Bearer {token}"})
                check(response.status_code == 401, "deleted account token denied")
            response = await remote.get(f"/auth/v1/admin/users/{uid}", headers=headers)
            check(response.status_code == 404, "auth account removed")
            for table, column, value in [
                ("profiles", "user_id", uid), ("notification_settings", "user_id", uid),
                ("chats", "user_id", uid), ("chat_messages", "chat_id", chat),
                ("upload_files", "user_id", uid), ("ocr_results", "uploaded_file_id", upload),
            ]:
                response = await remote.get(f"/rest/v1/{table}", headers=headers,
                    params={column: f"eq.{value}", "limit": "1"})
                check(response.is_success and response.json() == [], f"no remaining synthetic {table}")
            for bucket, path in files:
                response = await remote.get(f"/storage/v1/object/{bucket}/{path}", headers=headers)
                check(response.status_code in (400, 404), f"real file removed from {bucket}")
            print(f"Completed {checks} account deletion checks.", flush=True)
        finally:
            main.app.dependency_overrides.pop(main.get_settings, None)
            if uid and not deleted:
                for bucket, path in files:
                    response = await remote.request("DELETE", f"/storage/v1/object/{bucket}",
                        headers=headers, json={"prefixes": [path]})
                    assert response.is_success, "Synthetic file cleanup failed"
                response = await remote.delete(f"/auth/v1/admin/users/{uid}", headers=headers)
                assert response.is_success or response.status_code == 404, "Synthetic account cleanup failed"
            print("This run's synthetic account cleanup completed.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-base")
    asyncio.run(run(parser.parse_args().api_base))

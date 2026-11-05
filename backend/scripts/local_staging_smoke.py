"""Exercise real local Auth -> API -> Supabase reads without remote credentials.

The script creates one disposable user in the local Supabase Auth stack and
deletes it in a finally block. It refuses non-loopback Supabase and API URLs.
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta
import json
import secrets
import subprocess
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import uuid4


def require_loopback(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("Local staging smoke requires an HTTP loopback URL")
    return url.rstrip("/")


def send(method: str, url: str, *, headers: dict[str, str] | None = None,
         body: dict | None = None) -> tuple[int, dict | list | None]:
    data = json.dumps(body).encode() if body is not None else None
    request = Request(url, data=data, method=method, headers={
        **(headers or {}),
        **({"Content-Type": "application/json"} if data is not None else {}),
    })
    try:
        with urlopen(request, timeout=15) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as error:
        raw = error.read()
        try:
            payload = json.loads(raw) if raw else None
        except ValueError:
            payload = None
        return error.code, payload


def local_supabase_status() -> dict:
    completed = subprocess.run(
        ["supabase", "status", "-o", "json"],
        capture_output=True, text=True, check=True,
    )
    status = json.loads(completed.stdout)
    require_loopback(status["API_URL"])
    return status


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://127.0.0.1:18080")
    args = parser.parse_args()
    api_url = require_loopback(args.api_url)
    local = local_supabase_status()
    auth_url = require_loopback(local["API_URL"])
    service_key = local["SERVICE_ROLE_KEY"]
    publishable_key = local["PUBLISHABLE_KEY"]
    admin_headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    email = f"autofit-stage-{uuid4().hex}@example.invalid"
    password = f"{secrets.token_urlsafe(24)}Aa1!"
    user_id = None
    failed = []
    try:
        status, created = send("POST", f"{auth_url}/auth/v1/admin/users",
                               headers=admin_headers,
                               body={"email": email, "password": password,
                                     "email_confirm": True})
        if status not in (200, 201) or not isinstance(created, dict):
            raise RuntimeError(f"Local Auth user creation failed: HTTP {status}")
        user = created.get("user", created)
        user_id = user.get("id")
        if not user_id:
            raise RuntimeError("Local Auth did not return a user ID")
        status, signed_in = send("POST", f"{auth_url}/auth/v1/token?grant_type=password",
                                 headers={"apikey": publishable_key},
                                 body={"email": email, "password": password})
        if status != 200 or not isinstance(signed_in, dict) or not signed_in.get("access_token"):
            raise RuntimeError(f"Local Auth sign-in failed: HTTP {status}")
        token = signed_in["access_token"]
        print("PASS local Supabase Auth user creation and sign-in")

        today = date.today()
        start = today - timedelta(days=7)
        cases = [
            ("health", "/health", 200, False),
            ("auth boundary", "/api/profile", 401, False),
            ("home", "/api/home", 200, True),
            ("profile", "/api/profile", 200, True),
            ("diet recommendation", f"/api/diet/recommendations?date={today}", 200, True),
            ("diet nutrition", f"/api/diet/nutrition-summary?date={today}", 200, True),
            ("exercise history", f"/api/exercise/history?from_date={start}&to_date={today}", 200, True),
            ("exercise summary", "/api/exercise/summary", 200, True),
            ("community feed", "/api/community/feed", 200, True),
            ("chat list", "/api/chats", 200, True),
            ("my settings", "/api/app/preferences", 200, True),
        ]
        for name, path, expected, authenticated in cases:
            headers = {"Authorization": f"Bearer {token}"} if authenticated else {}
            response_status, _ = send("GET", f"{api_url}{path}", headers=headers)
            passed = response_status == expected
            print(f"{'PASS' if passed else 'FAIL'} {name}: HTTP {response_status}"
                  + (f" (expected {expected})" if not passed else ""))
            if not passed:
                failed.append(name)
    finally:
        if user_id:
            cleanup_status, _ = send(
                "DELETE", f"{auth_url}/auth/v1/admin/users/{user_id}",
                headers=admin_headers,
            )
            cleanup_ok = cleanup_status in (200, 204)
            print(f"{'PASS' if cleanup_ok else 'FAIL'} local test user cleanup: HTTP {cleanup_status}")
            if not cleanup_ok:
                failed.append("local test user cleanup")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

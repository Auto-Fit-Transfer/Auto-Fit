import asyncio

import httpx
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.security import parse_allowed_hosts, parse_request_body_limit
from backend.tests.test_main import TEST_SETTINGS


def test_security_headers_are_applied_to_api_responses() -> None:
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).get("/api/profile")
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 401
    assert response.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["content-security-policy"] == (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    )


def test_untrusted_host_is_rejected() -> None:
    response = TestClient(main.app).get(
        "/health",
        headers={"Host": "attacker.example"},
    )
    assert response.status_code == 400
    assert response.headers["x-content-type-options"] == "nosniff"


def test_large_declared_request_body_is_rejected_before_auth() -> None:
    response = TestClient(main.app).post(
        "/api/profile",
        content=b"x",
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(12 * 1024 * 1024 + 1),
        },
    )
    assert response.status_code == 413
    assert response.json() == {"detail": "Request body is too large"}


def test_roundtrip_rejects_unexpected_identity_field() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).post(
            "/api/test/roundtrip",
            json={"message": "hello", "user_id": "another-user"},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422
    assert response.json()["detail"]["fields"] == ["body.user_id"]


def test_validation_error_does_not_echo_sensitive_input() -> None:
    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    secret_marker = "token-secret-marker"
    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).patch(
            "/api/profile",
            json={"nickname": secret_marker, "unexpected": secret_marker},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 422
    assert secret_marker not in response.text
    assert response.json()["detail"]["fields"] == ["body.unexpected"]


def test_sql_injection_text_is_data_not_a_query_fragment(monkeypatch) -> None:
    injection_text = "' OR 1=1;--"

    async def fake_user() -> main.AuthenticatedUser:
        return main.AuthenticatedUser(id="authenticated-user")

    async def fake_update(user_id: str, updates: dict, settings: main.Settings):
        assert user_id == "authenticated-user"
        assert updates == {"nickname": injection_text}
        return {"user_id": user_id, **updates}

    main.app.dependency_overrides[main.get_current_user] = fake_user
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    monkeypatch.setattr(main, "update_profile", fake_update)
    try:
        response = TestClient(main.app).patch(
            "/api/profile",
            json={"nickname": injection_text},
        )
    finally:
        main.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["profile"]["nickname"] == injection_text


def test_security_environment_parsers_fail_closed() -> None:
    assert parse_allowed_hosts("api.example.com, localhost") == [
        "api.example.com",
        "localhost",
    ]
    assert parse_request_body_limit("2048") == 2048

    for invalid in ("", " , "):
        try:
            parse_allowed_hosts(invalid)
        except RuntimeError:
            pass
        else:
            raise AssertionError("empty explicit host allowlist must fail")

    for invalid in ("not-a-number", "1023"):
        try:
            parse_request_body_limit(invalid)
        except RuntimeError:
            pass
        else:
            raise AssertionError("invalid request limit must fail")


def test_auth_verification_does_not_trust_proxy_environment(monkeypatch) -> None:
    client_options = {}

    class FakeClient:
        def __init__(self, **options):
            client_options.update(options)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, headers):
            assert url == "https://example.supabase.co/auth/v1/user"
            assert headers["Authorization"] == "Bearer access-token"
            return httpx.Response(200, json={"id": "authenticated-user"})

    monkeypatch.setattr(main.httpx, "AsyncClient", FakeClient)
    user = asyncio.run(main.get_current_user("Bearer access-token", TEST_SETTINGS))

    assert user.id == "authenticated-user"
    assert client_options["trust_env"] is False

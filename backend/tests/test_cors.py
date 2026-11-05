import pytest
from fastapi.testclient import TestClient

from backend.app.main import app, get_settings
from backend.tests.test_main import TEST_SETTINGS


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://localhost:8081"])
@pytest.mark.parametrize("method", ["GET", "POST", "PATCH", "DELETE"])
def test_approved_frontend_preflight(origin, method):
    response = TestClient(app).options("/api/chats", headers={
        "Origin": origin, "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"


@pytest.mark.parametrize("origin", ["http://localhost:8082", "http://127.0.0.1:8081", "https://unapproved.example"])
def test_other_origins_remain_blocked(origin):
    response = TestClient(app).options("/api/chats", headers={
        "Origin": origin, "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://localhost:8081"])
def test_auth_error_is_readable_without_bypassing_auth(origin, monkeypatch):
    monkeypatch.setitem(app.dependency_overrides, get_settings, lambda: TEST_SETTINGS)
    response = TestClient(app).get("/api/chats", headers={"Origin": origin})
    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == origin

import asyncio
import json

import httpx
import pytest

from backend.app import ai_server


KEY = "synthetic-test-key-" + "x" * 32


def test_config_defaults_to_disabled(monkeypatch):
    monkeypatch.delenv("AI_SERVER_ENABLED", raising=False)
    assert ai_server.get_ai_server_config() is None


def test_config_reads_dedicated_server_settings(monkeypatch):
    monkeypatch.setenv("AI_SERVER_ENABLED", "true")
    monkeypatch.setenv("AI_SERVER_BASE_URL", "https://ai.example.invalid/")
    monkeypatch.setenv("AI_SERVER_API_KEY", KEY)
    config = ai_server.get_ai_server_config()
    assert config.base_url == "https://ai.example.invalid/"
    assert KEY not in repr(config)


@pytest.mark.parametrize("url", [
    "http://ai.example.invalid", "https://ai.example.invalid/chat",
    "https://user:password@ai.example.invalid", "https://ai.example.invalid?key=x",
    "https://ai.example.invalid#fragment", "https://ai.example.invalid?",
    "https://ai.example.invalid:invalid", "https://ai.example.invalid:0",
    "https://ai.example.invalid\n", "",
])
def test_config_rejects_unsafe_origins(url):
    with pytest.raises(ValueError):
        ai_server.AIServerConfig(url, KEY)


@pytest.mark.parametrize("key", ["", "short", "x" * 32 + "\n", "x" * 32 + "\x00", "한" * 32])
def test_config_rejects_invalid_keys(key):
    with pytest.raises(ValueError):
        ai_server.AIServerConfig("https://ai.example.invalid", key)


def test_config_rejects_misspelled_enable_flag(monkeypatch):
    monkeypatch.setenv("AI_SERVER_ENABLED", "yes")
    with pytest.raises(ValueError):
        ai_server.get_ai_server_config()


def make_client(handler):
    return ai_server.AIServerClient(
        ai_server.AIServerConfig("https://ai.example.invalid/", KEY),
        transport=httpx.MockTransport(handler),
    )


@pytest.mark.parametrize("endpoint", list(ai_server.AIEndpoint))
def test_posts_to_allowlisted_endpoint_with_server_credentials(endpoint):
    def handler(request):
        assert str(request.url) == "https://ai.example.invalid" + endpoint.value
        assert request.method == "POST"
        assert request.headers["authorization"] == f"Bearer {KEY}"
        assert request.headers["content-type"] == "application/json"
        assert "apikey" not in request.headers
        assert json.loads(request.content) == {"food_allergens": ["땅콩"]}
        return httpx.Response(200, json={"ok": True, "nested": {"items": []}})

    result = asyncio.run(make_client(handler).post(endpoint, {"food_allergens": ["땅콩"]}))
    assert result == {"ok": True, "nested": {"items": []}}


@pytest.mark.parametrize("status,code", [
    (401, "AI_AUTH_FAILED"), (422, "AI_INPUT_REJECTED"),
    (500, "AI_INTERNAL_ERROR"), (503, "AI_UNAVAILABLE"),
    (302, "AI_HTTP_ERROR"), (429, "AI_HTTP_ERROR"), (204, "AI_HTTP_ERROR"),
])
def test_http_errors_do_not_retry_redirect_or_expose_upstream_body(status, code):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, text=f"private data {KEY}", headers={"Location": "https://other.invalid"})

    with pytest.raises(ai_server.AIServerError) as error:
        asyncio.run(make_client(handler).post(ai_server.AIEndpoint.DIET, {}))
    assert error.value.code == code
    assert error.value.upstream_status == status
    assert len(calls) == 1
    assert "private" not in str(error.value)
    assert KEY not in str(error.value)


@pytest.mark.parametrize("body", [
    b"[]", b"null", b"not JSON", b'{"x": NaN}', b'{"x": Infinity}', b'{"x": 1e400}',
    b'{"x": 1, "x": 2}', b'{"nested": {"x": 1, "x": 2}}', b"\xff",
])
def test_rejects_malformed_or_ambiguous_response(body):
    with pytest.raises(ai_server.AIServerError, match="AI_INVALID_RESPONSE"):
        asyncio.run(make_client(lambda _: httpx.Response(200, content=body)).post(ai_server.AIEndpoint.DIET, {}))


def test_response_size_limit(monkeypatch):
    monkeypatch.setattr(ai_server, "MAX_RESPONSE_BYTES", 10)
    with pytest.raises(ai_server.AIServerError, match="AI_RESPONSE_TOO_LARGE"):
        asyncio.run(make_client(lambda _: httpx.Response(200, content=b'{"long": "value"}')).post(ai_server.AIEndpoint.DIET, {}))


@pytest.mark.parametrize("exception,code", [
    (httpx.ReadTimeout, "AI_TIMEOUT"), (httpx.ConnectError, "AI_CONNECTION_ERROR"),
])
def test_transport_errors_are_sanitized(exception, code):
    def handler(request):
        raise exception(f"private data {KEY}", request=request)

    with pytest.raises(ai_server.AIServerError, match=code) as error:
        asyncio.run(make_client(handler).post(ai_server.AIEndpoint.DIET, {}))
    assert KEY not in str(error.value)


def test_wall_clock_budget(monkeypatch):
    monkeypatch.setattr(ai_server, "WALL_TIMEOUT_SECONDS", 0.01)

    async def handler(request):
        await asyncio.sleep(1)
        return httpx.Response(200, json={})

    with pytest.raises(ai_server.AIServerError, match="AI_TIMEOUT"):
        asyncio.run(make_client(handler).post(ai_server.AIEndpoint.DIET, {}))


@pytest.mark.parametrize("endpoint,payload", [
    ("https://other.invalid", {}), (ai_server.AIEndpoint.DIET, []),
    (ai_server.AIEndpoint.DIET, {"number": float("nan")}),
])
def test_invalid_request_fails_before_network(endpoint, payload):
    def handler(request):
        pytest.fail("Invalid input must never reach the network")

    with pytest.raises(ValueError):
        asyncio.run(make_client(handler).post(endpoint, payload))

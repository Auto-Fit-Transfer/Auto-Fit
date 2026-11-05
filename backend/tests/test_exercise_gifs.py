import asyncio
from urllib.parse import parse_qs, unquote, urlsplit

import pytest

from backend.app import exercise_ai, exercise_gifs, main


@pytest.fixture
def private_config(monkeypatch):
    monkeypatch.setenv("EXERCISE_GIF_BUCKET", "private-exercise-test")
    monkeypatch.setenv("EXERCISE_GIF_PREFIX", "catalog-v1")
    monkeypatch.setenv("NCP_ACCESS_KEY_ID", "test-access-key")
    monkeypatch.setenv("NCP_SECRET_ACCESS_KEY", "test-secret-key")
    monkeypatch.setenv("EXERCISE_GIF_URL_TTL_SECONDS", "14400")


def test_private_link_uses_catalog_path_and_bounded_get_signature(private_config, monkeypatch):
    monkeypatch.setattr(exercise_gifs, "gif_path_for_exercise", lambda key, *_: "Male/운동.gif" if key == "known" else None)
    urls = exercise_gifs.private_gif_urls({"known", "../secret"}, "home", "male")
    assert urls["../secret"] is None
    parsed = urlsplit(urls["known"])
    assert parsed.scheme == "https"
    assert parsed.netloc == "kr.object.ncloudstorage.com"
    assert unquote(parsed.path) == "/private-exercise-test/catalog-v1/Male/운동.gif"
    query = parse_qs(parsed.query)
    assert query["X-Amz-Expires"] == ["14400"]
    assert query["X-Amz-Algorithm"] == ["AWS4-HMAC-SHA256"]
    assert "X-Amz-Signature" in query
    assert "test-secret-key" not in urls["known"]


@pytest.mark.parametrize("name,value", [
    ("EXERCISE_GIF_PREFIX", "../other"), ("EXERCISE_GIF_PREFIX", "/absolute"),
    ("EXERCISE_GIF_URL_TTL_SECONDS", "14401"), ("EXERCISE_GIF_URL_TTL_SECONDS", "bad"),
    ("NCP_SECRET_ACCESS_KEY", ""), ("EXERCISE_GIF_BUCKET", "bucket/other"),
])
def test_invalid_signing_configuration_fails_closed(private_config, monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(exercise_ai.ExerciseAIError):
        exercise_gifs.private_gif_urls({"known"}, "home", "male")


@pytest.mark.parametrize("path", ["../private.gif", "/private.gif", "male/./one.gif", "male//one.gif", "male\\one.gif", "male/one.txt"])
def test_catalog_cannot_escape_gif_namespace(monkeypatch, path):
    from types import SimpleNamespace
    monkeypatch.setattr(exercise_ai, "load_catalog", lambda: ("v1", {
        "known": SimpleNamespace(asset_paths=(("home_training", "male", path),)),
    }))
    with pytest.raises(exercise_ai.ExerciseAIError):
        exercise_ai.gif_path_for_exercise("known", "home", "male")


def test_private_bucket_takes_precedence_without_public_head_request(private_config, monkeypatch):
    monkeypatch.setenv("EXERCISE_GIF_BASE_URL", "https://legacy.invalid")
    monkeypatch.setattr(main, "private_gif_urls", lambda *_: {"known": "https://signed.invalid/?token=short-lived"})
    def unexpected_client(*args, **kwargs):
        raise AssertionError("Private GET signature must not be checked with public HEAD")
    monkeypatch.setattr(main.httpx, "AsyncClient", unexpected_client)
    result = asyncio.run(main.attach_exercise_gif_urls(
        {"items": [{"exercise_key": "known"}]}, {"location": "home"}, {"gender": "male"},
    ))
    assert result["items"][0]["demo_gif_url"].startswith("https://signed.invalid/")

"""Reviewed voice guides must match the selected catalog GIF exactly."""

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import UUID

import httpx
import pytest
from fastapi import HTTPException

from backend.app import exercise_guides as guides, main


def test_v4_source_matches_catalog_and_preserves_exclusions():
    version, entries, excluded = guides.load_exercise_guides()
    assert version == "sha256:4373062124f613851a35cf6c1944ee170653794587d40e3479c539c0523ee536"
    assert len(entries) == 3080
    assert len(excluded) == 26
    assert sum(item["status"] == "visual_reviewed" for item in entries.values()) == 3071
    assert sum(item["status"] == "asset_specific_guides" for item in entries.values()) == 3
    assert sum(item["status"] == "blocked_audio" for item in entries.values()) == 6
    assert not excluded.intersection(entries)


def test_common_guide_requires_the_reviewed_asset():
    key = "ex_a19814aeecf8c0"
    actual = guides.select_exercise_guide(key, "asset_74672fa16ca33ab1")
    assert actual["status"] == "ready"
    assert all(actual["guide"][part] for part in ("method", "caution", "focus"))
    assert guides.select_exercise_guide(key, None)["status"] == "unavailable"
    assert guides.select_exercise_guide(key, "asset_not_reviewed")["guide"] is None


def test_asset_specific_guide_never_uses_another_gif_text():
    key = "ex_34c291477983bb"
    male = guides.select_exercise_guide(key, "asset_9c5bf5a2555aea07")
    female = guides.select_exercise_guide(key, "asset_730fbce7180066d7")
    assert male["status"] == female["status"] == "ready"
    assert male["guide"]["method"] != female["guide"]["method"]
    assert guides.select_exercise_guide(key, None)["status"] == "unavailable"
    assert guides.select_exercise_guide(key, "asset_other")["guide"] is None


def test_displayed_gif_path_selects_the_corresponding_variant():
    key = "ex_34c291477983bb"
    male = guides.select_exercise_guide_for_gif(key, "home", "male")
    female = guides.select_exercise_guide_for_gif(key, "home", "female")
    assert male["status"] == female["status"] == "ready"
    assert male["guide"] != female["guide"]
    # This reviewed key has a female GIF only; a male recommendation cannot
    # inherit its guide without that GIF.
    assert guides.select_exercise_guide_for_gif("ex_a19814aeecf8c0", "home", "male")["status"] == "unavailable"
    assert guides.select_exercise_guide_for_gif("ex_a19814aeecf8c0", "home", "female")["status"] == "ready"


def test_blocked_and_untouched_keys_are_distinct():
    assert guides.select_exercise_guide("ex_47d3ee547cf2ac", None)["status"] == "blocked_audio"
    assert guides.select_exercise_guide("ex_7ebac67d54c7b7", None)["status"] == "blocked_audio"
    assert guides.select_exercise_guide("ex_46617a2241bf6d", None)["status"] == "legacy"
    assert guides.select_exercise_guide("ex_unknown", None)["status"] == "unavailable"
    assert guides.select_exercise_guide(None, None)["status"] == "unavailable"


def test_mismatched_catalog_version_fails_closed(monkeypatch):
    original = guides.load_catalog
    monkeypatch.setattr(guides, "load_catalog", lambda: ("sha256:wrong", original()[1]))
    guides.load_exercise_guides.cache_clear()
    try:
        with pytest.raises(guides.ExerciseGuideError, match="catalog version"):
            guides.load_exercise_guides()
    finally:
        guides.load_exercise_guides.cache_clear()


def test_recommendation_fields_follow_the_selected_asset(monkeypatch):
    monkeypatch.setenv("EXERCISE_GIF_BUCKET", "private-exercise-test")
    monkeypatch.setattr(main, "private_gif_urls", lambda keys, *_: {
        key: f"https://signed.invalid/{key}" for key in keys
    })
    keys = ["ex_34c291477983bb", "ex_a19814aeecf8c0",
            "ex_47d3ee547cf2ac", "ex_46617a2241bf6d"]
    result = asyncio.run(main.attach_exercise_gif_urls(
        {"items": [{"exercise_key": key} for key in keys]},
        {"location": "home"}, {"gender": "male"},
    ))
    matching, no_male_asset, blocked, legacy = result["items"]
    assert matching["voice_guide_status"] == "ready"
    assert matching["demo_asset_id"] == "asset_9c5bf5a2555aea07"
    assert set(matching["voice_guide"]) == {"method", "caution", "focus"}
    assert no_male_asset["voice_guide_status"] == "unavailable"
    assert no_male_asset["voice_guide"] is None
    assert blocked["voice_guide_status"] == "blocked_audio"
    assert blocked["voice_guide"] is None
    assert legacy["voice_guide_status"] == "legacy"
    assert legacy["voice_guide"] is None


def test_missing_gif_url_never_serves_reviewed_voice_text(monkeypatch):
    monkeypatch.setenv("EXERCISE_GIF_BUCKET", "private-exercise-test")
    monkeypatch.setattr(main, "private_gif_urls", lambda keys, *_: {key: None for key in keys})
    result = asyncio.run(main.attach_exercise_gif_urls(
        {"items": [{"exercise_key": "ex_34c291477983bb"}]},
        {"location": "home"}, {"gender": "male"},
    ))
    item = result["items"][0]
    assert item["demo_gif_url"] is None
    assert item["demo_asset_id"] is None
    assert item["voice_guide_status"] == "unavailable"
    assert item["voice_guide"] is None


def test_saved_routine_start_uses_source_context_and_actual_gif(monkeypatch):
    key = "ex_34c291477983bb"
    routine_id = "00000000-0000-4000-8000-000000000020"
    source_id = "00000000-0000-4000-8000-000000000010"

    @asynccontextmanager
    async def scope():
        class Client:
            async def get(self, url, *, headers, params):
                assert url.endswith("/user_workout_routines")
                assert params["user_id"] == "eq.owner"
                assert params["user_workout_routine_id"] == f"eq.{routine_id}"
                return httpx.Response(200, json=[{"source_recommendation_id": source_id}])
        yield Client()

    async def context(user_id, recommendation_id, settings):
        assert recommendation_id == source_id
        return {"location": "home"}

    async def profile(user_id, settings):
        return {"gender": "female"}

    monkeypatch.setattr(main, "client_scope", scope)
    monkeypatch.setattr(main, "fetch_exercise_context_for_recommendation", context)
    monkeypatch.setattr(main, "fetch_profile", profile)
    monkeypatch.setenv("EXERCISE_GIF_BUCKET", "private-exercise-test")
    monkeypatch.setattr(main, "private_gif_urls", lambda keys, *_: {
        key: f"https://signed.invalid/{key}" for key in keys
    })
    result = {"session": {"user_workout_routine_id": routine_id},
              "items": [{"exercise_key": key}]}
    asyncio.run(main.enrich_saved_routine_items(
        "owner", SimpleNamespace(supabase_url="https://db.invalid",
                                 supabase_service_role_key="test-key"), result, True,
    ))
    item = result["items"][0]
    assert item["demo_asset_id"] == "asset_730fbce7180066d7"
    assert item["voice_guide_status"] == "ready"
    assert item["voice_guide"] == guides.select_exercise_guide(
        key, "asset_730fbce7180066d7",
    )["guide"]


def test_saved_routine_list_has_no_unselected_reviewed_guide():
    result = {"items": [{"exercise_key": "ex_34c291477983bb"},
                        {"exercise_key": "ex_46617a2241bf6d"}]}
    asyncio.run(main.enrich_saved_routine_items("owner", None, result, False))
    reviewed, legacy = result["items"]
    assert reviewed["voice_guide_status"] == "unavailable"
    assert reviewed["voice_guide"] is None
    assert legacy["voice_guide_status"] == "legacy"


def test_ai_start_returns_voice_for_its_selected_session_items(monkeypatch):
    key = "ex_34c291477983bb"
    plan_id = "10000000-0000-4000-8000-000000000002"

    async def latest(user_id, settings):
        return {"recommendation": {"exercise_recommendation_id": "rec",
                                    "generator": "auto-fit-ai", "status": "active"},
                "plan_sessions": [{"exercise_plan_session_id": plan_id, "status": "planned"}]}

    async def rpc(name, payload, settings):
        assert payload["p_plan_session_id"] == plan_id
        return {"session": {"plan_session_id": plan_id}, "items": [{"exercise_key": key}]}

    async def context(*args):
        return {"location": "home"}

    async def profile(*args):
        return {"gender": "male"}

    monkeypatch.setattr(main, "fetch_latest_exercise_recommendation", latest)
    monkeypatch.setattr(main, "call_exercise_session_rpc", rpc)
    monkeypatch.setattr(main, "fetch_exercise_context_for_recommendation", context)
    monkeypatch.setattr(main, "fetch_profile", profile)
    monkeypatch.setenv("EXERCISE_GIF_BUCKET", "private-exercise-test")
    monkeypatch.setattr(main, "private_gif_urls", lambda keys, *_: {
        key: f"https://signed.invalid/{key}" for key in keys
    })
    response = asyncio.run(main.start_ai_exercise_session(
        main.StartExerciseSessionRequest(plan_session_id=UUID(plan_id)),
        SimpleNamespace(id="owner"), SimpleNamespace(),
    ))
    assert response["result"]["items"][0]["voice_guide_status"] == "ready"


@pytest.mark.parametrize("failure", [
    HTTPException(502, detail="temporary failure"), AttributeError("bad profile"),
    TypeError("bad context"),
])
def test_ai_start_keeps_started_session_if_voice_lookup_fails(monkeypatch, failure):
    plan_id = "10000000-0000-4000-8000-000000000002"

    async def latest(*args):
        return {"recommendation": {"exercise_recommendation_id": "rec",
                                    "generator": "auto-fit-ai", "status": "active"},
                "plan_sessions": [{"exercise_plan_session_id": plan_id, "status": "planned"}]}

    async def rpc(*args):
        return {"session": {"plan_session_id": plan_id},
                "items": [{"exercise_key": "ex_34c291477983bb"}]}

    async def failed(*args):
        raise failure

    monkeypatch.setattr(main, "fetch_latest_exercise_recommendation", latest)
    monkeypatch.setattr(main, "call_exercise_session_rpc", rpc)
    monkeypatch.setattr(main, "fetch_exercise_context_for_recommendation", failed)
    monkeypatch.setattr(main, "fetch_profile", failed)
    response = asyncio.run(main.start_ai_exercise_session(
        main.StartExerciseSessionRequest(plan_session_id=UUID(plan_id)),
        SimpleNamespace(id="owner"), SimpleNamespace(),
    ))
    assert response["ok"] is True
    assert response["result"]["items"][0]["voice_guide_status"] == "unavailable"


def test_saved_routine_start_keeps_session_on_malformed_profile(monkeypatch):
    @asynccontextmanager
    async def scope():
        class Client:
            async def get(self, url, *, headers, params):
                return httpx.Response(200, json=[{"source_recommendation_id": "rec"}])
        yield Client()

    async def context(*args):
        return {"location": "home"}

    async def profile(*args):
        return "not-a-profile"

    monkeypatch.setattr(main, "client_scope", scope)
    monkeypatch.setattr(main, "fetch_exercise_context_for_recommendation", context)
    monkeypatch.setattr(main, "fetch_profile", profile)
    result = {"session": {"user_workout_routine_id": "routine"},
              "items": [{"exercise_key": "ex_34c291477983bb"}]}
    asyncio.run(main.enrich_saved_routine_items(
        "owner", SimpleNamespace(supabase_url="https://db.invalid",
                                 supabase_service_role_key="test-key"), result, True,
    ))
    assert result["items"][0]["voice_guide_status"] == "unavailable"


def test_broken_guide_source_is_parsed_only_once_until_restart(monkeypatch):
    calls = 0

    def broken_source():
        nonlocal calls
        calls += 1
        raise guides.ExerciseGuideError("bad reviewed source")

    monkeypatch.setattr(guides, "load_exercise_guides", broken_source)
    guides.voice_guide_source_available.cache_clear()
    try:
        for _ in range(2):
            items = [{"exercise_key": "ex_34c291477983bb", "demo_gif_url": "https://signed.invalid"}]
            main.attach_exercise_voice_guides(items, "home", "male")
            assert items[0]["voice_guide_status"] == "unavailable"
            assert items[0]["voice_guide"] is None
        assert calls == 1
    finally:
        guides.voice_guide_source_available.cache_clear()

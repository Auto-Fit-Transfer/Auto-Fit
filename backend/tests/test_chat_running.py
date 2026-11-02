import asyncio

from backend.app import main
from backend.app.chat_running import answer_running_course, running_course_request
from backend.app import chat_running
from backend.tests.test_chat_answers import preview


def test_running_course_query_recognizes_colloquial_spelling_and_region():
    assert running_course_request("풍암동 런닝코스를 알려줘") == ("풍암동", "5km")
    assert running_course_request("아니 풍암동 런닝코스를 알려줘") == ("풍암동", "5km")
    assert running_course_request("서초구 10km 러닝 경로 추천") == ("서초구", "10km")
    assert running_course_request("광주광역시 풍암동에서 5km 런닝 코스") == ("풍암동", "5km")
    assert running_course_request("오늘 러닝 기록 보여줘") is None


def test_running_course_result_is_shown_without_off_topic_refusal():
    calls = []

    async def lookup(region, distance):
        calls.append((region, distance))
        return ([{"name": "풍암호수공원", "region_name": "풍암동", "distance_km": 5.2}], "general_ai")

    answer = asyncio.run(answer_running_course("풍암동 런닝코스를 알려줘", lookup))
    assert calls == [("풍암동", "5km")]
    assert answer["intent"] == "running_course"
    assert "풍암호수공원" in answer["content"]
    assert not answer["needs_more_data"]


def test_running_course_without_place_asks_for_location_without_lookup():
    async def forbidden(*args):
        raise AssertionError("location is required")

    answer = asyncio.run(answer_running_course("러닝 코스 알려줘", forbidden))
    assert answer["required_data"] == ["running_region"]


def test_preview_routes_running_course_to_existing_search(preview, monkeypatch):
    client, scores, _ = preview
    calls = []

    async def lookup(region, distance, settings, user_id):
        calls.append((region, distance, user_id))
        return ([{"name": "풍암호수공원", "region_name": "풍암동", "distance_km": 5}], "general_ai")

    monkeypatch.setattr(main, "search_running_courses", lookup)
    response = client.post("/api/chats/answer-preview", json={"content": "풍암동 런닝코스를 알려줘"})
    assert response.status_code == 200
    assert "풍암호수공원" in response.json()["answer"]["content"]
    assert calls == [("풍암동", "5km", "owner")]
    assert scores == []


def test_running_search_uses_active_local_catalogue_when_provider_is_off(monkeypatch):
    calls = []

    class FakeStore:
        def __init__(self, settings, user_id):
            assert user_id == "owner"

        async def request(self, method, path, *, params):
            calls.append((method, path, params))
            return [{"name": "풍암호수공원", "region_name": "풍암동", "distance_meters": 5000}]

    monkeypatch.setattr(chat_running, "get_ai_server_config", lambda: None)
    monkeypatch.setattr(chat_running, "RunningStore", FakeStore)
    courses, source = asyncio.run(chat_running.search_running_courses("풍암동", "5km", object(), "owner"))
    assert source == "database" and courses[0]["name"] == "풍암호수공원"
    assert calls[0][1] == "running_courses"
    assert calls[0][2]["region_name"] == "ilike.*풍암동*"

"""Opt-in live test. Creates and removes only this run's synthetic users/data.

Run: python -m backend.tests.chat_live_integration --project eeeqibyssajykrhvecbv
Never emits credentials, tokens, or response bodies.
"""
import argparse
import asyncio
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
from dotenv import dotenv_values

from backend.app import main
from backend.tests.live_test_cleanup import cleanup_user_defaults


async def run(
    project, api_base=None, rate_limits=False, routing=False, presentation=False
):
    # Never forward real login tokens to an arbitrary host.
    if api_base not in (None, "https://auto-fit-api-dev.onrender.com"):
        raise ValueError("Unapproved API target")
    config = dotenv_values("backend/.env")
    assert config["SUPABASE_URL"].rstrip("/") == f"https://{project}.supabase.co", "Wrong target"
    settings = main.Settings(config["SUPABASE_URL"].rstrip("/"), config["SUPABASE_PUBLISHABLE_KEY"], config["SUPABASE_SERVICE_ROLE_KEY"], "http://localhost:3000")
    admin_headers = main.service_headers(settings)
    created_users = []
    created_recommendations = []
    created_assessments = []
    cleanup_errors = []
    checks = 0

    def check(condition, label):
        nonlocal checks
        assert condition, label
        checks += 1
        print(f"PASS {label}", flush=True)

    async with httpx.AsyncClient(base_url=settings.supabase_url, timeout=20) as remote:
        try:
            tokens = []
            for _ in range(2):
                email = f"autofit-chat-test-{uuid4().hex}@example.invalid"
                password = "Af9!" + secrets.token_urlsafe(32)
                response = await remote.post("/auth/v1/admin/users", headers=admin_headers, json={
                    "email": email, "password": password, "email_confirm": True,
                    "app_metadata": {"autofit_integration_test": True},
                })
                check(response.status_code in (200, 201), "create synthetic auth user")
                user_id = response.json()["id"]
                created_users.append(user_id)
                response = await remote.post("/auth/v1/token?grant_type=password", headers={"apikey": settings.supabase_publishable_key}, json={"email": email, "password": password})
                check(response.status_code == 200, "real Supabase password login")
                tokens.append(response.json()["access_token"])

            # Controlled source data for the owner only.
            for offset, score in ((2, 91), (1, 86)):
                assessment_id = str(uuid4())
                created_assessments.append(assessment_id)
                response = await remote.post("/rest/v1/health_assessments", headers=admin_headers, json={
                    "health_assessment_id": assessment_id,
                    "user_id": created_users[0], "assessed_at": (datetime.now(UTC) - timedelta(days=offset)).isoformat(),
                    "overall_score": score, "overall_status": "test",
                })
                check(response.status_code == 201, "seed synthetic health score")
            response = await remote.post(
                "/rest/v1/health_assessment_items",
                headers=admin_headers,
                json=[
                    {
                        "health_assessment_id": created_assessments[0],
                        "metric_type": "blood_pressure",
                        "metric_name": "혈압",
                        "metric_score": 90,
                        "evaluation_status": "normal",
                        "sequence_order": 1,
                    },
                    {
                        "health_assessment_id": created_assessments[1],
                        "metric_type": "blood_pressure",
                        "metric_name": "혈압",
                        "metric_score": 70,
                        "evaluation_status": "attention",
                        "sequence_order": 1,
                    },
                ],
            )
            check(response.status_code == 201, "seed synthetic health assessment evidence")

            if api_base is None:
                main.app.dependency_overrides[main.get_settings] = lambda: settings
            transport = httpx.ASGITransport(app=main.app) if api_base is None else None
            async with httpx.AsyncClient(transport=transport, base_url=api_base or "http://test", timeout=90) as api:
                owner = {"Authorization": f"Bearer {tokens[0]}"}
                other = {"Authorization": f"Bearer {tokens[1]}"}
                check((await api.get("/api/chats")).status_code == 401, "unauthenticated access rejected")
                response = await api.post("/api/chats", headers=owner, json={})
                check(response.status_code == 201, "create chat through authenticated API")
                chat = response.json()["chat"]["chat_id"]
                path = f"/api/chats/{chat}/messages"
                check((await api.get(path, headers=other)).status_code == 404, "other user cannot read chat")
                check((await api.patch(f"/api/chats/{chat}", headers=other, json={"title":"denied"})).status_code == 404, "other user cannot update chat")
                check((await api.post(path, headers=other, json={"client_message_id":str(uuid4()),"content":"건강 점수"})).status_code == 404, "other user cannot send to chat")
                body = {"client_message_id":str(uuid4()),"content":"건강 점수가 이전보다 얼마나 변했어?"}
                # Concurrent HTTP calls use independent remote DB transactions.
                responses = await asyncio.gather(*(api.post(path, headers=owner, json=body) for _ in range(6)))
                check(sorted(r.status_code for r in responses) == [200]*5+[201], "six concurrent duplicates persist once")
                ids = {r.json()["assistant_message"]["message_id"] for r in responses}
                check(len(ids) == 1, "all duplicate responses return the same message")
                answer = responses[0].json()["assistant_message"]
                check(answer["response_source"] == "database" and answer["evidence"][0]["current_value"] == 86 and answer["evidence"][0]["previous_value"] == 91, "real DB score comparison answer")
                check((await api.post(path, headers=owner, json={**body,"content":"different"})).status_code == 409, "same ID different content conflicts")
                conflict_id = str(uuid4())
                conflicts = await asyncio.gather(*(api.post(path, headers=owner, json={"client_message_id":conflict_id,"content":q}) for q in ("안녕", "다른 질문")))
                check(sorted(r.status_code for r in conflicts) == [201,409], "concurrent different content chooses one winner")
                page = (await api.get(path, headers=owner, params={"limit":2})).json()
                check(page["has_more"] and len(page["messages"])==2, "message pagination first page")
                older = (await api.get(path, headers=owner, params={"limit":2,"before":page["next_cursor"]})).json()
                check(not older["has_more"] and len({m["message_id"] for m in page["messages"]+older["messages"]})==4, "message pagination no duplicates or omissions")
                check(page["messages"][0]["sender_type"] == "user" and page["messages"][1]["sender_type"] == "assistant", "user then assistant order")
                response = await api.patch(f"/api/chats/{chat}", headers=owner, json={"status":"archived"})
                check(response.status_code == 200, "archive chat")
                check((await api.post(path, headers=owner, json=body)).status_code == 200, "replay still works after archive")
                check((await api.post(path, headers=owner, json={"client_message_id":str(uuid4()),"content":"안녕"})).status_code == 409, "new message to archived chat rejected")
                listing = (await api.get("/api/chats", headers=owner, params={"status":"archived"})).json()
                check(any(c["chat_id"]==chat for c in listing["chats"]), "archived list contains chat")
                # Authenticated clients must not call the service-only RPC directly.
                direct = await remote.post("/rest/v1/rpc/save_chat_exchange", headers={"apikey": settings.supabase_publishable_key, **owner}, json={"p_user_id":created_users[0],"p_chat_id":chat,"p_client_message_id":str(uuid4()),"p_content":"denied","p_answer":None})
                check(direct.status_code in (401,403,404), "direct client RPC denied")
                if routing:
                    reset = await remote.delete("/rest/v1/chat_rate_limit_events", headers=admin_headers, params={"user_id": f"eq.{created_users[0]}"})
                    assert reset.status_code == 204, "reset synthetic routing quota"
                    seed = await remote.post("/rest/v1/exercise_sessions", headers=admin_headers, json={
                        "user_id": created_users[0], "status": "completed",
                        "started_at": datetime.now(UTC).isoformat(),
                        "planned_item_count": 1, "completed_item_count": 1,
                        "total_duration_seconds": 600, "total_calories_burned": 50,
                        "completion_rate": 100,
                    })
                    check(seed.status_code == 201, "seed synthetic exercise summary")
                    for question, auth, source, required, notice in (
                        ("그건 왜 그래?", owner, "need_more_data", "autofit_topic_question", False),
                        ("이번 주 운동 몇 번 했어?", owner, "database", None, False),
                        ("이번 주 운동 기록 설명해줘", owner, "database", None, True),
                        ("이번 주 운동 기록 설명해줘", other, "need_more_data", "exercise_record", False),
                        ("최근 건강 점수가 낮아진 이유는?", owner, "database", None, False),
                    ):
                        result = await api.post("/api/chats/answer-preview", headers=auth, json={"content": question})
                        check(result.status_code == 200, "routing preview responds")
                        answer = result.json()["answer"]
                        check(answer["response_source"] == source and (not required or required in answer["required_data"]) and ("AI 설명을 현재 제공할 수 없어" in answer["content"]) == notice, "routing source and fallback match evidence")
                        if question == "최근 건강 점수가 낮아진 이유는?":
                            check(
                                any(
                                    row.get("metric") == "health_assessment_item"
                                    and row.get("label") == "혈압"
                                    and row.get("current_value") == 70
                                    and row.get("previous_value") == 90
                                    for row in answer["evidence"]
                                ),
                                "health score explanation uses owned assessment items",
                            )
                    new_chat = await api.post("/api/chats", headers=owner, json={})
                    check(new_chat.status_code == 201, "create routing test chat")
                    route_path = f"/api/chats/{new_chat.json()['chat']['chat_id']}/messages"
                    route_body = {"client_message_id": str(uuid4()), "content": "이번 주 운동 기록 설명해줘"}
                    saved = await api.post(route_path, headers=owner, json=route_body)
                    check(saved.status_code == 201, "persist DB fallback answer")
                    saved_answer = saved.json()["assistant_message"]
                    check(saved_answer["response_source"] == "database" and "AI 설명을 현재 제공할 수 없어" in saved_answer["content"], "stored fallback does not claim AI source")
                    replay = await api.post(route_path, headers=owner, json=route_body)
                    check(replay.status_code == 200 and replay.json()["assistant_message"]["message_id"] == saved_answer["message_id"], "routing replay remains idempotent")
                if presentation:
                    profile = await api.patch("/api/profile", headers=owner, json={
                        "name": "Auto-Fit 발표 테스트",
                        "birth_date": "1995-01-01",
                        "gender": "other",
                        "activity_level": "light",
                        "target_weight": 65,
                    })
                    check(profile.status_code == 200, "save presentation profile")
                    preferences = await api.put(
                        "/api/exercise/preferences",
                        headers=owner,
                        json={"goal_type": "maintenance", "experience_level": "beginner"},
                    )
                    check(preferences.status_code == 200, "save exercise preferences")
                    onboarding = await api.post(
                        "/api/onboarding/complete", headers=owner, json={}
                    )
                    check(onboarding.status_code == 200, "complete presentation onboarding")
                    context = await api.post(
                        "/api/exercise/recommendation-contexts",
                        headers=owner,
                        json={
                            "available_minutes": 30,
                            "location": "home",
                            "available_equipment": ["mat"],
                            "condition_level": "좋음",
                            "discomfort_areas": [],
                            "condition_note": "합성 발표 테스트",
                        },
                    )
                    check(context.status_code == 200, "save recommendation context")
                    presentation_chat = await api.post(
                        "/api/chats", headers=owner, json={"title": "발표 루틴 테스트"}
                    )
                    check(presentation_chat.status_code == 201, "create presentation chat")
                    presentation_path = (
                        f"/api/chats/{presentation_chat.json()['chat']['chat_id']}/messages"
                    )
                    generated = await api.post(
                        presentation_path,
                        headers=owner,
                        json={
                            "client_message_id": str(uuid4()),
                            "content": "오늘 운동 루틴 만들어줘",
                        },
                    )
                    check(generated.status_code == 201, "generate routine through chatbot")
                    generated_answer = generated.json()["assistant_message"]
                    recommendation_id = generated_answer["evidence"][0][
                        "exercise_recommendation_id"
                    ]
                    check(bool(recommendation_id), "chat answer returns recommendation id")
                    created_recommendations.append(recommendation_id)
                    routine = await api.get(
                        "/api/exercise/recommendations/latest", headers=owner
                    )
                    check(
                        routine.status_code == 200
                        and routine.json()["result"]["recommendation"][
                            "exercise_recommendation_id"
                        ] == recommendation_id,
                        "read stored generated routine",
                    )
                    started = await api.post(
                        "/api/exercise/sessions/start", headers=owner, json={}
                    )
                    check(started.status_code == 200, "start generated exercise session")
                    started_result = started.json()["result"]
                    session_id = started_result["session"]["exercise_session_id"]
                    for item in started_result["items"]:
                        recorded = await api.post(
                            f"/api/exercise/sessions/{session_id}/items/"
                            f"{item['exercise_item_id']}",
                            headers=owner,
                            json={
                                "completed": True,
                                "skipped": False,
                                "duration_minutes": item["duration_minutes"],
                            },
                        )
                        check(recorded.status_code == 200, "record routine exercise item")
                    completed = await api.post(
                        f"/api/exercise/sessions/{session_id}/complete",
                        headers=owner,
                        json={},
                    )
                    check(
                        completed.status_code == 200
                        and completed.json()["result"]["session"]["status"]
                        == "completed",
                        "complete generated exercise session",
                    )
                    summary = await api.get("/api/exercise/summary", headers=owner)
                    check(
                        summary.status_code == 200
                        and summary.json()["summary"]["recent_7_days"][
                            "workout_count"
                        ] >= 1,
                        "read seven-day and cumulative exercise summary",
                    )
                if rate_limits:
                    async def reset_test_quota():
                        reset = await remote.delete("/rest/v1/chat_rate_limit_events", headers=admin_headers, params={"user_id": f"eq.{created_users[0]}"})
                        assert reset.status_code == 204, "reset own synthetic quota"

                    async def preview():
                        return await api.post("/api/chats/answer-preview", headers=owner, json={"content": "안녕"})

                    await reset_test_quota()
                    for _ in range(10):
                        check((await preview()).status_code == 200, "answer within ten-request quota")
                    blocked = await preview()
                    check(blocked.status_code == 429, "eleventh answer rejected")
                    detail = blocked.json()["detail"]
                    retry = detail["retry_after"]
                    check(detail["code"] == "RATE_LIMITED" and 1 <= retry <= 60 and blocked.headers["Retry-After"] == str(retry), "rate-limit retry contract")
                    check((await api.post(path, headers=owner, json=body)).status_code == 200, "saved replay allowed with exhausted answer quota")
                    check((await api.get(path, headers=owner)).status_code == 200, "history allowed with exhausted answer quota")
                    check((await api.post("/api/chats/answer-preview", headers=other, json={"content": "안녕"})).status_code == 200, "another user has independent quota")
                    print(f"Waiting {retry + 1}s for the real rolling window to expire.", flush=True)
                    await asyncio.sleep(retry + 1)
                    check((await preview()).status_code == 200, "answer allowed after natural window expiry")
                    await reset_test_quota()
                    concurrent = await asyncio.gather(*(preview() for _ in range(20)))
                    check(sorted(r.status_code for r in concurrent) == [200] * 10 + [429] * 10, "twenty concurrent answers allow exactly ten")
                    await reset_test_quota()
                    seed = await remote.post("/rest/v1/chat_rate_limit_events", headers=admin_headers, json=[{"user_id": created_users[0], "bucket": "requests"} for _ in range(59)])
                    check(seed.status_code == 201, "seed synthetic general-quota boundary")
                    check((await api.get("/api/chats", headers=owner)).status_code == 200, "sixtieth general request allowed")
                    check((await api.get("/api/chats", headers=owner)).status_code == 429, "sixty-first general request rejected")
                    direct = await remote.post("/rest/v1/rpc/consume_chat_rate_limit", headers={"apikey": settings.supabase_publishable_key, **owner}, json={"p_user_id": created_users[0], "p_bucket": "answers"})
                    check(direct.status_code in (401,403,404), "client cannot mutate quota directly")
        finally:
            main.app.dependency_overrides.clear()
            for assessment_id in created_assessments:
                response = await remote.delete(
                    "/rest/v1/health_assessment_items",
                    headers=admin_headers,
                    params={"health_assessment_id": f"eq.{assessment_id}"},
                )
                if response.status_code not in (200, 204):
                    cleanup_errors.append(f"health_assessment_items:{assessment_id}")
                verify = await remote.get(
                    "/rest/v1/health_assessment_items",
                    headers=admin_headers,
                    params={
                        "health_assessment_id": f"eq.{assessment_id}",
                        "select": "health_assessment_item_id",
                        "limit": 1,
                    },
                )
                if verify.status_code != 200 or verify.json() != []:
                    cleanup_errors.append(
                        f"remaining:health_assessment_items:{assessment_id}"
                    )
            for user_id in created_users:
                # Remove item/session children before exercise_items and sessions.
                for table in ("exercise_discomfort_logs", "exercise_session_feedback", "exercise_logs"):
                    response = await remote.delete(f"/rest/v1/{table}", headers=admin_headers, params={"user_id": f"eq.{user_id}"})
                    if response.status_code not in (200, 204):
                        cleanup_errors.append(f"{table}:{user_id}")
                for recommendation_id in created_recommendations:
                    response = await remote.delete(
                        "/rest/v1/exercise_items",
                        headers=admin_headers,
                        params={"exercise_recommendation_id": f"eq.{recommendation_id}"},
                    )
                    if response.status_code not in (200, 204):
                        cleanup_errors.append(f"exercise_items:{recommendation_id}")
                    verify = await remote.get(
                        "/rest/v1/exercise_items",
                        headers=admin_headers,
                        params={
                            "exercise_recommendation_id": f"eq.{recommendation_id}",
                            "select": "exercise_item_id",
                            "limit": 1,
                        },
                    )
                    if verify.status_code != 200 or verify.json() != []:
                        cleanup_errors.append(
                            f"remaining:exercise_items:{recommendation_id}"
                        )
                for table in (
                    "chat_rate_limit_events", "chat_messages", "chats",
                    "exercise_discomfort_logs", "exercise_session_feedback",
                    "exercise_logs", "exercise_sessions",
                    "exercise_recommendation_contexts", "exercise_recommendations",
                    "user_exercise_profiles", "health_assessments",
                ):
                    response = await remote.delete(f"/rest/v1/{table}", headers=admin_headers, params={"user_id":f"eq.{user_id}"})
                    if response.status_code not in (200,204):
                        cleanup_errors.append(f"{table}:{user_id}")
                    verify = await remote.get(f"/rest/v1/{table}", headers=admin_headers, params={"user_id":f"eq.{user_id}", "select":"user_id", "limit":1})
                    if verify.status_code != 200 or verify.json() != []:
                        cleanup_errors.append(f"remaining:{table}:{user_id}")
                cleanup_errors.extend(await cleanup_user_defaults(remote, admin_headers, user_id))
                response = await remote.delete(f"/auth/v1/admin/users/{user_id}", headers=admin_headers)
                if response.status_code not in (200,204):
                    cleanup_errors.append(f"auth:{user_id}")
                verify = await remote.get(f"/auth/v1/admin/users/{user_id}", headers=admin_headers)
                if verify.status_code != 404:
                    cleanup_errors.append(f"remaining:auth:{user_id}")
            if cleanup_errors:
                raise RuntimeError("Test resource cleanup required: " + ",".join(cleanup_errors))
            print(f"Cleaned up {len(created_users)} synthetic users and their test records.", flush=True)
    print(f"Completed {checks} live integration checks.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--api-base", choices=["https://auto-fit-api-dev.onrender.com"])
    parser.add_argument("--rate-limits", action="store_true")
    parser.add_argument("--routing", action="store_true")
    parser.add_argument("--presentation", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(
        args.project,
        args.api_base,
        args.rate_limits,
        args.routing,
        args.presentation,
    ))

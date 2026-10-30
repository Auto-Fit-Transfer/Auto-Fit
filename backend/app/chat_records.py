"""Bounded, owner-scoped meal/exercise summaries in Asia/Seoul time."""

import re
from datetime import datetime, time, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from pydantic import BaseModel, Field, ValidationError

from backend.app.chat_storage import fail
from backend.app.http_client import client_scope

KST = ZoneInfo("Asia/Seoul")


def record_period(text, now=None):
    now = (now or datetime.now(KST)).astimezone(KST)
    today = now.date()
    monday = today - timedelta(days=today.weekday())
    candidates = [
        ("오늘", today, today), ("어제", today - timedelta(days=1), today - timedelta(days=1)),
        ("이번주", monday, today), ("지난주", monday - timedelta(days=7), monday - timedelta(days=1)),
        ("최근7일", today - timedelta(days=6), today),
    ]
    normalized = "".join(text.split()).replace("최근일주일", "최근7일")
    matches = [entry for entry in candidates if entry[0] in normalized]
    if len(matches) != 1:
        return None
    label, start, end = matches[0]
    rest = normalized.replace(label, "")
    if re.search(r"\d|달|개월|작년|올해|내일|모레|매주|매일|주말|평균|비교|추이|아침|점심|저녁|간식|오전|오후", rest):
        return None
    return (
        datetime.combine(start, time.min, KST),
        min(datetime.combine(end + timedelta(days=1), time.min, KST), now),
        f"{start.isoformat()}~{end.isoformat()} (한국 시간, 조회 시점까지)",
    )


class Meal(BaseModel):
    meal_log_id: UUID
    eaten_at: datetime


class Food(BaseModel):
    meal_log_id: UUID
    food_name: str
    calories: Decimal | None = Field(default=None, ge=0)


class Exercise(BaseModel):
    exercise_session_id: UUID
    started_at: datetime
    total_duration_seconds: int = Field(ge=0)
    total_calories_burned: Decimal = Field(ge=0)
    completed_item_count: int = Field(gt=0)


async def read_rows(client, url, headers, table, params, model):
    try:
        response = await client.get(f"{url}/rest/v1/{table}", headers=headers, params={**params, "limit": "101"})
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list):
            raise ValueError()
        if len(rows) > 100:
            return None  # Never present a truncated aggregate as a complete total.
        return [model.model_validate(row) for row in rows]
    except (httpx.HTTPError, ValueError, ValidationError):
        fail("DATA_SOURCE_ERROR")


def evidence(metric, label, value, unit):
    return {"metric": metric, "label": label, "current_value": value,
            "previous_value": None, "unit": unit, "measured_at": None}


async def answer_records(intent, period, url, headers, user_id):
    start, end, label = period
    answer = {"intent": intent, "content": "", "response_source": "database",
              "needs_more_data": False, "evidence": [], "required_data": []}

    def missing(message, required):
        answer.update(content=message, response_source="need_more_data", needs_more_data=True, required_data=[required])
        return answer

    async with client_scope() as client:
        if intent == "exercise_history":
            rows = await read_rows(client, url, headers, "exercise_sessions", {
                "select": "exercise_session_id,started_at,total_duration_seconds,total_calories_burned,completed_item_count",
                "user_id": f"eq.{user_id}", "status": "in.(completed,stopped)",
                "completed_item_count": "gt.0", "started_at": f"gte.{start.isoformat()}",
                "and": f"(started_at.lt.{end.isoformat()})", "order": "started_at.asc,exercise_session_id.asc",
            }, Exercise)
            if rows is None:
                return missing("기록이 많아 전체 합계를 계산하지 않았습니다. 하루 단위로 질문해 주세요.", "shorter_period")
            if not rows:
                return missing(f"{label}에 완료한 동작이 있는 종료 운동 기록이 없습니다. 운동을 안 했다는 의미는 아닙니다.", "exercise_record")
            minutes = round(sum(row.total_duration_seconds for row in rows) / 60, 1)
            calories = float(sum(row.total_calories_burned for row in rows))
            answer["content"] = f"{label} 기록 기준 운동은 {len(rows)}회, 총 {minutes:g}분이며 예상 소모 열량은 {calories:g}kcal입니다. 완료한 동작이 있는 완료·중단 세션만 집계했습니다."
            answer["evidence"] = [evidence("exercise_sessions", "운동 횟수", len(rows), "회"), evidence("exercise_minutes", "기록된 운동 시간", minutes, "분"), evidence("exercise_calories", "예상 소모 열량", calories, "kcal")]
            return answer

        meals = await read_rows(client, url, headers, "meal_logs", {
            "select": "meal_log_id,eaten_at", "user_id": f"eq.{user_id}", "status": "eq.recorded",
            "eaten_at": f"gte.{start.isoformat()}", "and": f"(eaten_at.lt.{end.isoformat()})",
            "order": "eaten_at.asc,meal_log_id.asc",
        }, Meal)
        if meals is None:
            return missing("식사 기록이 많아 전체 합계를 계산하지 않았습니다. 하루 단위로 질문해 주세요.", "shorter_period")
        if not meals:
            return missing(f"{label}에 저장된 식사 기록이 없습니다. 식사를 안 했다는 의미는 아닙니다.", "meal_record")
        ids = {row.meal_log_id for row in meals}
        foods = await read_rows(client, url, headers, "meal_log_items", {
            "select": "meal_log_id,food_name,calories",
            "meal_log_id": f"in.({','.join(sorted(str(value) for value in ids))})",
            "order": "meal_log_id.asc,sequence_order.asc,meal_log_item_id.asc",
        }, Food)
        if foods is None:
            return missing("음식 기록이 많아 전체 합계를 계산하지 않았습니다. 하루 단위로 질문해 주세요.", "shorter_period")
        if any(row.meal_log_id not in ids for row in foods):
            fail("DATA_SOURCE_ERROR")
        names = list(dict.fromkeys(row.food_name for row in foods))
        summary = ", ".join(names[:10])
        if len(names) > 10:
            summary += f" 외 {len(names) - 10}종"
        answer["content"] = f"{label}에 기록된 식사는 {len(meals)}건입니다."
        if names:
            answer["content"] += f" 기록된 음식: {summary}."
        answer["evidence"] = [evidence("meal_count", "기록된 식사", len(meals), "건")]
        if {row.meal_log_id for row in foods} != ids or any(row.calories is None for row in foods):
            return missing(answer["content"] + " 일부 음식·열량 정보가 없어 총 섭취 열량은 계산하지 않았습니다.", "meal_nutrition_details")
        calories = float(sum(row.calories for row in foods))
        answer["content"] += f" 기록된 음식의 예상 섭취 열량 합계는 {calories:g}kcal입니다."
        answer["evidence"].append(evidence("meal_calories", "기록된 섭취 열량", calories, "kcal"))
        return answer

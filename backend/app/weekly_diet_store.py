"""Owner-scoped persistence for the complete AI diet result."""

import json
import logging
from datetime import date
from uuid import UUID

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from backend.app.http_client import client_scope
from backend.app.chat_rate_limit import ChatRateLimiter
from backend.app.weekly_diet_contract import DietRequestContext, WeeklyResult, WeeklyGenerateRequest, dated_result
from backend.app.weekly_recipe_contract import has_unavailable_recipe


FIELDS = "weekly_diet_plan_id,user_id,week_start_date,generator,result,request_context,last_replacement,version,created_at,updated_at"
logger = logging.getLogger("uvicorn.error")


def fail(code: str, status: int = 502):
    raise HTTPException(status, detail={"code": code, "message": {
        "WEEKLY_DIET_NOT_FOUND": "주간 식단을 찾을 수 없습니다.",
        "WEEKLY_DIET_EXISTS": "해당 주의 식단이 이미 있습니다.",
        "WEEKLY_DIET_VERSION_CONFLICT": "식단이 변경되었습니다. 새로 조회한 뒤 다시 시도해 주세요.",
        "WEEKLY_FEEDBACK_NOT_FOUND": "해당 끼니의 기록을 찾을 수 없습니다.",
        "WEEKLY_FEEDBACK_EXISTS": "해당 끼니는 이미 기록됐습니다. 수정 요청을 사용해 주세요.",
        "WEEKLY_FEEDBACK_LEGACY_EXISTS": "기존 테스트 앱에서 이미 기록한 끼니입니다.",
        "WEEKLY_FEEDBACK_INVALID": "끼니 기록의 입력값이 올바르지 않습니다.",
        "WEEKLY_FEEDBACK_DATE_MISMATCH": "기록 날짜가 주간 식단의 요일과 다릅니다.",
        "DIET_REBALANCE_ALREADY_DECIDED": "오늘 식단 조절 방법을 이미 선택했습니다.",
        "DIET_REBALANCE_DATE_CHANGED": "날짜가 바뀌었습니다. 오늘 기록을 다시 조회해 주세요.",
        "DIET_REBALANCE_STATUS_CHANGED": "오늘 식사·운동 기록이 바뀌었습니다. 새 미리보기를 만들어 주세요.",
        "DIET_REBALANCE_PREVIEW_NOT_FOUND": "미리보기를 찾을 수 없습니다.",
        "DIET_REBALANCE_PREVIEW_EXPIRED": "미리보기가 만료됐습니다. 다시 만들어 주세요.",
        "DIET_DAILY_FLOOR_REACHED": "하루 목표의 85% 아래로 줄일 수 없습니다.",
    }.get(code, "주간 식단을 처리하지 못했습니다.")})


class WeeklyDietStore:
    def __init__(self, settings, user_id: str):
        self.url = settings.supabase_url
        self.user_id = user_id
        key = settings.supabase_service_role_key
        self.headers = {"apikey": key, "Prefer": "return=representation"}
        if not key.startswith("sb_secret_"):
            self.headers["Authorization"] = f"Bearer {key}"

    async def consume_generation_quota(self):
        # Reuse the persistent per-user AI answer quota across all worker processes.
        await ChatRateLimiter(self.url, self.headers, self.user_id).check("answers")

    async def request(self, method, path, *, params=None, body=None):
        try:
            async with client_scope() as client:
                response = await client.request(
                    method, f"{self.url}/rest/v1/{path}", headers=self.headers,
                    params=params, json=body,
                )
            data = response.json()
            if response.is_error:
                error = data if isinstance(data, dict) else {}
                code = error.get("message")
                if code == "WEEKLY_DIET_NOT_FOUND":
                    fail(code, 404)
                if code == "WEEKLY_FEEDBACK_NOT_FOUND":
                    fail(code, 404)
                if code == "DIET_REBALANCE_PREVIEW_NOT_FOUND":
                    fail(code, 404)
                if code in {"WEEKLY_FEEDBACK_EXISTS", "WEEKLY_FEEDBACK_LEGACY_EXISTS"}:
                    fail(code, 409)
                if code in {"WEEKLY_FEEDBACK_INVALID", "WEEKLY_FEEDBACK_DATE_MISMATCH"}:
                    fail(code, 422)
                if code == "DIET_REBALANCE_INVALID_PREVIEW":
                    fail(code, 422)
                if code in {"WEEKLY_DIET_VERSION_CONFLICT", "WEEKLY_DIET_CONTEXT_CHANGED",
                            "DIET_REBALANCE_ALREADY_DECIDED", "DIET_REBALANCE_DATE_CHANGED",
                            "DIET_REBALANCE_STATUS_CHANGED",
                            "DIET_REBALANCE_PREVIEW_EXPIRED", "DIET_DAILY_FLOOR_REACHED"}:
                    fail(code, 409)
                if error.get("code") == "23505":
                    fail("WEEKLY_DIET_EXISTS", 409)
                fail("WEEKLY_DIET_STORAGE_ERROR")
            return data
        except (httpx.HTTPError, ValueError):
            fail("WEEKLY_DIET_STORAGE_ERROR")

    def validate(self, row):
        try:
            if not isinstance(row, dict) or row.get("user_id") != self.user_id:
                raise ValueError()
            UUID(row["weekly_diet_plan_id"])
            WeeklyGenerateRequest(week_start_date=row["week_start_date"])
            if type(row["version"]) is not int or row["version"] < 1:
                raise ValueError()
            DietRequestContext.model_validate(row["request_context"])
            WeeklyResult.model_validate(row["result"])
        except (KeyError, ValueError, TypeError, ValidationError):
            fail("WEEKLY_DIET_STORAGE_ERROR")
        return row

    async def get(self, *, plan_id: UUID | None = None, week_start: date | None = None):
        params = {"select": FIELDS, "user_id": f"eq.{self.user_id}",
                  "order": "week_start_date.desc", "limit": "1"}
        if plan_id is not None:
            params["weekly_diet_plan_id"] = f"eq.{plan_id}"
        if week_start is not None:
            params["week_start_date"] = f"eq.{week_start.isoformat()}"
        rows = await self.request("GET", "weekly_diet_plans", params=params)
        if not isinstance(rows, list) or len(rows) > 1:
            fail("WEEKLY_DIET_STORAGE_ERROR")
        return self.validate(rows[0]) if rows else None

    async def get_recipe(self, plan_id: UUID, version: int, day: str,
                         meal_type: str, servings: int):
        rows = await self.request("GET", "diet_recipe_snapshots", params={
            "select": "recipe_response", "user_id": f"eq.{self.user_id}",
            "weekly_diet_plan_id": f"eq.{plan_id}",
            "weekly_plan_version": f"eq.{version}", "plan_day": f"eq.{day}",
            "meal_type": f"eq.{meal_type}", "servings": f"eq.{servings}",
            "limit": "1",
        })
        if not isinstance(rows, list) or len(rows) > 1:
            fail("WEEKLY_DIET_STORAGE_ERROR")
        if rows and rows[0].get("recipe_response") is None:
            fail("WEEKLY_DIET_STORAGE_ERROR")
        return rows[0]["recipe_response"] if rows else None

    async def save_recipe(self, plan_id: UUID, version: int, day: str,
                          meal_type: str, reply: dict):
        meal = reply["meal"]
        details = [(item["food_name"], item["recipe"])
                   for item in meal["items"] if item["recipe"] is not None]
        body = {
            "user_id": self.user_id, "weekly_diet_plan_id": str(plan_id),
            "weekly_plan_version": version, "plan_day": day,
            "meal_type": meal_type, "title": meal["menu_name"][:120],
            "description": meal["menu_description"][:2000],
            "servings": meal["servings"],
            "prep_minutes": (round(meal["estimated_duration_minutes"])
                             if meal["estimated_duration_minutes"] is not None else None),
            "ingredients": [
                {"name": ingredient["name"], "amount_g": ingredient.get("amount_g")}
                for _, recipe in details for ingredient in (recipe.get("ingredients") or [])
            ][:50],
            "steps": [
                f"{food_name}: {step}"
                for food_name, recipe in details for step in recipe["steps"]
            ][:50],
            "generator": reply["generator"][:80], "recipe_response": reply,
        }
        try:
            rows = await self.request("POST", "diet_recipe_snapshots", body=body)
        except HTTPException as exc:
            if not isinstance(exc.detail, dict) or exc.detail.get("code") != "WEEKLY_DIET_EXISTS":
                raise
            # A concurrent request saved this exact slot and serving count first.
            cached = await self.get_recipe(plan_id, version, day, meal_type, meal["servings"])
            if cached is None:
                fail("WEEKLY_DIET_STORAGE_ERROR")
            if has_unavailable_recipe(cached):
                rows = await self.request("PATCH", "diet_recipe_snapshots", params={
                    "user_id": f"eq.{self.user_id}",
                    "weekly_diet_plan_id": f"eq.{plan_id}",
                    "weekly_plan_version": f"eq.{version}",
                    "plan_day": f"eq.{day}", "meal_type": f"eq.{meal_type}",
                    "servings": f"eq.{meal['servings']}",
                }, body=body)
                if not isinstance(rows, list) or len(rows) != 1:
                    fail("WEEKLY_DIET_STORAGE_ERROR")
                return reply
            return cached
        if not isinstance(rows, list) or len(rows) != 1:
            fail("WEEKLY_DIET_STORAGE_ERROR")
        return reply

    async def create(self, week_start: date, reply: dict, context: dict):
        rows = await self.request("POST", "weekly_diet_plans", body={
            "user_id": self.user_id, "week_start_date": week_start.isoformat(),
            "generator": reply["generator"], "result": reply["result"], "request_context": context,
        })
        if not isinstance(rows, list) or len(rows) != 1:
            fail("WEEKLY_DIET_STORAGE_ERROR")
        row = self.validate(rows[0])
        logger.info("[weekly-diet-save] %s", json.dumps({"operation": "create", "outcome": "saved"}))
        return row

    async def replace(self, plan_id, version, day, meal_type, replacement, context):
        row = await self.request("POST", "rpc/replace_weekly_diet_meal", body={
            "p_user_id": self.user_id, "p_plan_id": str(plan_id), "p_expected_version": version,
            "p_day": day, "p_meal_type": meal_type,
            "p_replacement": replacement, "p_request_context": context,
        })
        row = self.validate(row)
        logger.info("[weekly-diet-save] %s", json.dumps({"operation": "replace", "outcome": "saved"}))
        return row

    async def refresh(self, plan_id, version, reply, context):
        row = await self.request("POST", "rpc/refresh_weekly_diet_plan", body={
            "p_user_id": self.user_id, "p_plan_id": str(plan_id), "p_expected_version": version,
            "p_reply": reply, "p_request_context": context,
        })
        row = self.validate(row)
        logger.info("[weekly-diet-save] %s", json.dumps({"operation": "refresh", "outcome": "saved"}))
        return row


def public_plan(row: dict) -> dict:
    return {
        "ok": True, "weekly_diet_plan_id": row["weekly_diet_plan_id"],
        "week_start_date": row["week_start_date"], "timezone": "Asia/Seoul",
        "version": row["version"], "generator": row["generator"],
        "result": dated_result(row["result"], date.fromisoformat(row["week_start_date"])),
        "daily_target": row["result"].get("daily_target"),
        "last_replacement": row.get("last_replacement"),
    }

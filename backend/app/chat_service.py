"""Allowlisted, read-only service lookups and app navigation for chat."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from backend.app.chat_records import record_period


KST = ZoneInfo("Asia/Seoul")


@dataclass(frozen=True)
class ServiceQuery:
    intent: str
    path: str
    title: str
    route: str
    key: str
    params: tuple[tuple[str, str], ...] = ()
    secondary_path: str | None = None


def _navigation(route: str, title: str) -> dict:
    return {"type": "navigation", "route": route, "label": f"{title} 화면 열기"}


def _query(intent: str, path: str, title: str, route: str, key: str,
           **params: str) -> ServiceQuery:
    return ServiceQuery(intent, path, title, route, key, tuple(params.items()))


def match_service_query(content: str, now: datetime | None = None) -> ServiceQuery | None:
    text = "".join(content.casefold().split())
    today = (now or datetime.now(KST)).astimezone(KST).date()
    start = today - timedelta(days=6)
    if any(word in text for word in ("삭제", "수정", "변경", "바꿔", "업로드해", "등록해", "저장해", "시작해", "완료해", "생성해", "만들어")):
        return None
    if any(word in text for word in ("건강점수", "건강점", "종합점수")) and any(
        word in text for word in ("체중", "몸무게", "체성분", "인바디", "혈압", "혈당")
    ):
        return ServiceQuery("health_overview", "/api/home", "건강 점수와 측정 기록",
                            "/health-report", "", secondary_path="/api/health-report")
    if any(word in text for word in ("마일리지", "포인트내역")):
        if any(word in text for word in ("내역", "기록", "언제", "적립")):
            return _query("mileage_history", "/api/community/mileage/history", "마일리지 내역", "/community/mileage", "items", limit="5")
        return _query("mileage", "/api/community/mileage", "마일리지", "/community/mileage", "")
    if any(word in text for word in ("티어", "등급", "레벨")):
        return _query("habit_tier", "/api/tier/progress", "활동 등급", "/profile", "progress")
    if any(word in text for word in ("러닝", "런닝", "달리기", "조깅")):
        if any(word in text for word in ("저장", "즐겨찾기", "찜")):
            return _query("running_saved_courses", "/api/running/saved-courses", "저장한 러닝 코스", "/exercise/running", "courses")
        if any(word in text for word in ("기록", "내역", "뛰었", "달렸")):
            return _query("running_history", "/api/running/sessions/history", "최근 러닝 기록", "/exercise/running", "sessions", limit="5")
        if any(word in text for word in ("진행중", "달리는중", "뛰는중")):
            return _query("running_active", "/api/running/sessions/active", "진행 중인 러닝", "/exercise/running", "session")
        if "페이스" in text:
            return _query("running_pace", "/api/running/pace", "저장한 러닝 페이스", "/exercise/running", "")
        return None
    if "알레르기" in text or "알러지" in text:
        return _query("allergies", "/api/allergies", "알레르기", "/profile", "selected")
    if any(word in text for word in ("냉장고", "보유재료", "식재료")):
        return _query("food_inventory", "/api/diet/inventory", "보유 식재료", "/diet", "inventory")
    if any(word in text for word in ("식단", "식사", "먹은", "먹었", "영양")):
        if "영양" in text:
            return _query("nutrition_summary", "/api/diet/nutrition-summary", "오늘 영양 요약", "/diet", "summary", date=today.isoformat())
        if any(word in text for word in ("기록", "내역", "먹은", "먹었")):
            return _query("meal_logs", "/api/diet/meal-logs", "최근 7일 식사 기록", "/diet", "logs", from_date=start.isoformat(), to_date=today.isoformat())
        if any(word in text for word in ("주간", "이번주", "일주일")):
            return _query("weekly_diet", "/api/diet/weekly-recommendations", "이번 주 식단", "/diet", "")
        if "오늘" in text:
            return _query("diet_recommendation", "/api/diet/recommendations", "오늘 식단 추천", "/diet", "result", date=today.isoformat())
        if any(word in text for word in ("추천", "최근", "현재")):
            return _query("diet_recommendation", "/api/diet/recommendations/latest", "최근 식단 추천", "/diet", "result")
        return None
    if any(word in text for word in ("운동", "헬스", "홈트")):
        if any(word in text for word in ("저장", "루틴")):
            return _query("saved_workout_routines", "/api/exercise/saved-routines", "저장한 운동", "/exercise/saved-routines", "routines")
        if any(word in text for word in ("기록", "내역", "했어", "했지")):
            if record_period(content) is not None:
                return None
            return _query("exercise_history", "/api/exercise/history", "최근 7일 운동 기록", "/exercise/history", "history", from_date=start.isoformat(), to_date=today.isoformat())
        if any(word in text for word in ("진행", "달성")):
            return _query("exercise_progress", "/api/exercise/progress", "운동 진행 상황", "/exercise/goal-progress", "progress")
        if "목표" in text:
            return _query("exercise_goal", "/api/exercise/goals/active", "운동 목표", "/exercise/goal", "goal")
        if "추천" in text:
            return _query("exercise_recommendation", "/api/exercise/recommendations/latest", "최근 운동 추천", "/exercise", "result")
        return _query("exercise_summary", "/api/exercise/summary", "운동 요약", "/exercise/summary", "summary")
    for word, intent, title in (
        ("혈압", "health_blood_pressure", "최근 혈압"),
        ("혈당", "health_glucose", "최근 혈당"),
        ("체중", "health_weight", "최근 체중"),
        ("몸무게", "health_weight", "최근 체중"),
        ("체성분", "health_body_composition", "최근 체성분"),
        ("인바디", "health_body_composition", "최근 체성분"),
        ("건강검진", "health_checkup", "최근 건강검진"),
        ("검진결과", "health_checkup", "최근 건강검진"),
    ):
        if word in text:
            return _query(intent, "/api/health-report", title, "/health-report", "")
    if any(word in text for word in ("건강문서", "검진표", "업로드한문서")):
        return _query("health_documents", "/api/health-documents", "건강 문서", "/health-data-management", "items", limit="5")
    if any(word in text for word in ("건강분석", "종합분석", "분석결과")):
        return _query("health_analysis", "/api/health-assessments/latest", "건강 분석", "/health-report", "")
    if any(word in text for word in ("내정보", "프로필", "내계정")):
        return _query("profile", "/api/profile", "프로필", "/profile", "profile")
    if any(word in text for word in ("건강목표", "나의목표")):
        return _query("health_goal", "/api/health/goals/active", "건강 목표", "/profile", "goal")
    if any(word in text for word in ("화면설정", "글자크기", "간편모드", "다크모드")):
        return _query("display_settings", "/api/app/preferences", "화면 설정", "/display-settings", "preferences")
    return None


LABELS = {
    "name": "이름", "custom_name": "이름", "original_file_name": "파일", "course_name": "코스", "region_name": "지역",
    "distance_meters": "거리(m)", "elapsed_seconds": "시간(초)",
    "started_at": "시작", "ended_at": "종료", "status": "상태",
    "food_name": "식품", "quantity": "수량", "calories": "열량(kcal)",
    "balance": "잔액", "earned_today": "오늘 적립", "points": "점수",
    "tier_name": "등급", "pace_minutes_per_km": "페이스(분/km)",
    "weight_kg": "체중(kg)", "systolic_bp": "수축기 혈압", "eaten_at": "식사 시각",
    "meal_type": "식사", "weekly_frequency": "주간 운동 횟수", "weekly_duration_minutes": "주간 목표(분)",
}
VISIBLE = set(LABELS) | {"title", "created_at", "measured_at", "checkup_date", "goal_type", "target_distance_meters", "total_duration_seconds", "total_calories_burned", "theme_mode", "font_size_step", "simple_mode_enabled"}


def _short(value: Any) -> str:
    if isinstance(value, bool):
        return "예" if value else "아니요"
    return str(value)[:80]


def _display(value: Any) -> list[str]:
    if isinstance(value, list):
        if not value:
            return ["저장된 항목이 없습니다."]
        return [f"{index}번 · {', '.join(f'{LABELS.get(k, k)}: {_short(v)}' for k, v in row.items() if k in VISIBLE and v is not None) or '항목 있음'}"
                for index, row in enumerate(value[:5], 1) if isinstance(row, dict)]
    if isinstance(value, dict):
        fields = [f"{LABELS.get(k, k)}: {_short(v)}" for k, v in value.items()
                  if k in VISIBLE and v is not None and not isinstance(v, (dict, list))]
        if fields:
            return fields[:8]
        for key in ("sessions", "courses", "items", "history", "logs", "routines", "body_compositions", "health_checkups"):
            if isinstance(value.get(key), list):
                return _display(value[key])
    return ["표시할 기록이 아직 없습니다."]


def _specific_lines(intent: str, value: Any) -> list[str] | None:
    if intent == "exercise_history" and isinstance(value, list):
        return [f"{index}번 · {row['session'].get('started_at', '운동')} · "
                f"{round(float(row['session'].get('total_duration_seconds') or 0) / 60, 1):g}분"
                for index, row in enumerate(value[:5], 1)
                if isinstance(row, dict) and isinstance(row.get("session"), dict)]
    if intent == "meal_logs" and isinstance(value, list):
        return [f"{index}번 · {row.get('eaten_at', '식사 기록')} · "
                f"{', '.join(str(item.get('food_name')) for item in (row.get('items') or [])[:3] if item.get('food_name'))}"
                for index, row in enumerate(value[:5], 1) if isinstance(row, dict)]
    if not isinstance(value, dict):
        return None
    if intent == "diet_recommendation":
        meals = value.get("meals") or []
        lines = []
        for row in meals[:5]:
            if not isinstance(row, dict):
                continue
            foods = [str(food["food_name"]) for food in (row.get("foods") or [])[:3]
                     if isinstance(food, dict) and food.get("food_name")]
            title = row.get("menu_name") or ", ".join(foods)
            if title:
                lines.append(f"- {row.get('meal_type', '식사')}: {title}")
        if not lines and (value.get("recommendation") or {}).get("recommendation_summary"):
            lines.append(str(value["recommendation"]["recommendation_summary"]))
        return lines
    if intent == "exercise_recommendation":
        recommendation = value.get("recommendation") or {}
        lines = [str(recommendation["recommendation_summary"])] if recommendation.get("recommendation_summary") else []
        lines.extend(f"- {row['exercise_name']}" for row in (value.get("items") or [])[:5]
                     if isinstance(row, dict) and row.get("exercise_name"))
        return lines
    if intent == "weekly_diet":
        result = value.get("result") or {}
        lines = [str(result["summary"])] if result.get("summary") else []
        for day in (result.get("weekly_plan") or [])[:7]:
            if not isinstance(day, dict):
                continue
            menus = [meal.get("menu_name") for meal in (day.get("meals") or {}).values()
                     if isinstance(meal, dict) and meal.get("menu_name")]
            if menus:
                lines.append(f"- {day.get('date') or day.get('day')}: {', '.join(menus[:4])}")
        return lines
    if intent == "nutrition_summary":
        lines = []
        for key, label in (("calories", "열량"), ("protein", "단백질"),
                           ("carbohydrates", "탄수화물"), ("fat", "지방")):
            metric = value.get(key)
            if isinstance(metric, dict) and metric.get("consumed") is not None:
                target = f" / 목표 {metric['target']}" if metric.get("target") is not None else ""
                lines.append(f"{label}: {metric['consumed']}{target} {metric.get('unit', '')}")
        return lines
    if intent == "exercise_summary":
        recent = value.get("recent_7_days") or {}
        if not recent:
            return []
        return [f"최근 7일 운동 {recent.get('workout_count', 0)}회, "
                f"{recent.get('duration_minutes', 0)}분, 예상 소모 열량 "
                f"{recent.get('calories_burned', 0)}kcal"]
    if intent == "exercise_progress":
        summary = value.get("summary") or {}
        if not summary:
            return []
        lines = [f"운동 {summary.get('workout_count', 0)}회, "
                 f"{summary.get('duration_minutes', 0)}분"]
        if summary.get("goal_achievement_rate") is not None:
            lines.append(f"목표 달성률: {summary['goal_achievement_rate']}%")
        return lines
    if intent == "habit_tier":
        if value.get("tier_name") is None:
            return []
        return [f"현재 등급: {value['tier_name']}", f"누적 점수: {value.get('points', 0)}점"]
    if intent == "mileage":
        if value.get("balance") is None:
            return []
        return [f"현재 마일리지: {value['balance']}",
                f"오늘 적립: {value.get('earned_today', 0)}"]
    if intent == "health_analysis":
        headline, summary = value.get("headline") or {}, value.get("summary") or {}
        return [str(item) for item in (headline.get("title"), summary.get("description")) if item]
    if intent == "health_report":
        rows = (value.get("body_compositions") or []) + (value.get("health_checkups") or [])
        return _display(rows[:3]) if rows else []
    if intent in {"health_blood_pressure", "health_glucose", "health_weight",
                  "health_body_composition", "health_checkup"}:
        body, checkups = value.get("body_compositions") or [], value.get("health_checkups") or []
        if intent == "health_blood_pressure":
            row = next((row for row in checkups if row.get("systolic_bp") is not None), None)
            return [f"{row.get('checkup_date', '최근 검진')}: {row['systolic_bp']}/{row.get('diastolic_bp', '?')} mmHg"] if row else []
        if intent == "health_glucose":
            row = next((row for row in checkups if row.get("fasting_glucose") is not None), None)
            return [f"{row.get('checkup_date', '최근 검진')}: 공복혈당 {row['fasting_glucose']} mg/dL"] if row else []
        if intent == "health_weight":
            rows = sorted((body + checkups), key=lambda row: row.get("measured_at") or row.get("checkup_date") or "", reverse=True)
            row = next((row for row in rows if row.get("weight_kg") is not None), None)
            return [f"{row.get('measured_at') or row.get('checkup_date')}: {row['weight_kg']}kg"] if row else []
        return _display((body if intent == "health_body_composition" else checkups)[:3]) if (
            body if intent == "health_body_composition" else checkups
        ) else []
    return None


def service_answer(query: ServiceQuery, payload: dict | None) -> dict:
    if query.intent == "health_overview" and isinstance(payload, dict):
        home, report = payload.get("home") or {}, payload.get("report") or {}
        score = (home.get("health_score") or {}).get("score")
        body = report.get("body_compositions") or []
        checkups = report.get("health_checkups") or []
        latest = body[0] if body else checkups[0] if checkups else {}
        lines = []
        if score is not None:
            lines.append(f"건강 점수: {score:g}점" if isinstance(score, (int, float)) else f"건강 점수: {score}점")
        for key in ("weight_kg", "systolic_bp"):
            if latest.get(key) is not None:
                lines.append(f"{LABELS[key]}: {latest[key]}")
        if not lines:
            lines = ["표시할 기록이 아직 없습니다."]
        return {
            "intent": query.intent, "content": "건강 점수와 최근 측정 기록\n" + "\n".join(lines),
            "response_source": "database" if score is not None or latest else "need_more_data",
            "needs_more_data": score is None and not latest,
            "evidence": [_navigation(query.route, query.title)],
            "required_data": [] if score is not None or latest else [query.intent],
        }
    value = payload.get(query.key) if payload and query.key else payload
    specific = _specific_lines(query.intent, value)
    lines = specific if specific is not None else _display(value)
    no_data = payload is None or not lines or lines == ["저장된 항목이 없습니다."] or lines == ["표시할 기록이 아직 없습니다."]
    if no_data and not lines:
        lines = [{"diet_recommendation": "저장된 식단 추천이 없습니다. 식단 화면에서 새 추천을 생성해 주세요.",
                  "weekly_diet": "이번 주 식단이 없습니다. 식단 화면에서 주간 추천을 생성해 주세요.",
                  "exercise_recommendation": "저장된 운동 추천이 없습니다. 운동 화면에서 추천을 만들어 주세요."}
                 .get(query.intent, "표시할 기록이 아직 없습니다.")]
    evidence = [_navigation(query.route, query.title)]
    id_key = {"food_inventory": "user_food_inventory_id",
              "health_documents": "uploaded_file_id"}.get(query.intent)
    if id_key and isinstance(value, list):
        for index, row in enumerate(value[:5], 1):
            if isinstance(row, dict) and isinstance(row.get(id_key), str):
                evidence.append({"type": "record_ref", "kind": query.intent,
                                 "ordinal": index, "id": row[id_key],
                                 "label": str(row.get("custom_name") or row.get("original_file_name") or index)[:100]})
    return {
        "intent": query.intent,
        "content": f"{query.title}\n" + "\n".join(lines[:6]),
        "response_source": "need_more_data" if no_data else "database",
        "needs_more_data": no_data,
        "evidence": evidence,
        "required_data": [query.intent] if no_data else [],
    }


def navigation_answer(content: str) -> dict | None:
    text = "".join(content.casefold().split())
    if any(word in text for word in ("러닝", "런닝", "달리기")) and "코스" in text and any(
        word in text for word in ("생성", "만들", "짜줘")
    ):
        return {"intent": "service_navigation",
                "content": "러닝 코스 생성에는 출발 위치와 원하는 거리가 필요해요. 러닝 화면에서 위치를 지정해 이어서 진행해 주세요.",
                "response_source": "database", "needs_more_data": False,
                "evidence": [_navigation("/exercise/running", "러닝 코스")], "required_data": []}
    routes = (
        (("자세분석", "동작분석", "자세확인"), "/exercise/posture-check", "자세 분석"),
        (("커뮤니티검색", "게시글검색", "게시글찾"), "/community/search", "커뮤니티 검색"),
        (("글쓰기", "게시글작성", "게시글올리"), "/community/compose", "게시글 작성"),
        (("화면설정", "글자크기", "다크모드", "간편모드"), "/display-settings", "화면 설정"),
        (("건강문서", "검진표", "업로드한문서"), "/health-data-management", "건강 문서"),
        (("운동목표",), "/exercise/goal", "운동 목표"),
        (("계정",), "/account", "계정"),
        (("러닝", "런닝", "달리기", "조깅"), "/exercise/running", "러닝"),
        (("식단", "식사", "레시피", "냉장고"), "/diet", "식단"),
        (("운동", "루틴", "자세"), "/exercise", "운동"),
        (("건강", "검진", "체성분"), "/health-report", "건강"),
        (("커뮤니티", "게시글", "모임", "챌린지"), "/community", "커뮤니티"),
        (("프로필", "설정", "계정"), "/profile", "프로필"),
    )
    for words, route, label in routes:
        if any(word in text for word in words):
            return {
                "intent": "service_navigation", "content": f"{label} 기능은 앱에서 이용할 수 있어요. {label} 화면을 열어 이어서 진행해 주세요.",
                "response_source": "database", "needs_more_data": False,
                "evidence": [_navigation(route, label)], "required_data": [],
            }
    return None

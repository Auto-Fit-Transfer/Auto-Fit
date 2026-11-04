"""Read-only running course answers for the chat surface."""

import asyncio
import re
from typing import Any

from backend.app.running import RunningStore
from backend.app.running_ai import AIServerError, RunningAIClient, get_ai_server_config


RUNNING_WORDS = ("러닝", "런닝", "달리기", "조깅")
COURSE_WORDS = ("코스", "경로", "달릴 곳", "뛸 곳")
PLACE = re.compile(r"[가-힣]{2,20}(?:동|구|시|군|읍|면)")


def running_course_request(content: str) -> tuple[str | None, str] | None:
    text = "".join(content.casefold().split())
    if not any(word in text for word in RUNNING_WORDS) or not any(
        word.replace(" ", "") in text for word in COURSE_WORDS
    ):
        return None
    if any(word in text for word in ("생성", "만들", "짜줘")):
        return None
    places = PLACE.findall(content.casefold())
    region = next((place for place in reversed(places) if place.endswith(("동", "읍", "면"))),
                  places[-1] if places else None)
    distance = next((f"{km}km" for km in (3, 5, 10)
                     if re.search(rf"(?<!\d){km}(?:km|킬로|키로)(?!\d)", text)), "5km")
    return region, distance


def _course_line(course: dict[str, Any]) -> str | None:
    name = course.get("name") or course.get("course_name")
    if not isinstance(name, str) or not name.strip():
        return None
    details = []
    region = course.get("region_name") or course.get("region")
    if isinstance(region, str) and region.strip():
        details.append(region.strip())
    distance = course.get("distance_km")
    if distance is None and isinstance(course.get("distance_meters"), (int, float)):
        distance = round(course["distance_meters"] / 1000, 1)
    if isinstance(distance, (int, float)) and 0 < distance <= 100:
        details.append(f"{distance:g}km")
    return f"- {name.strip()}" + (f" · {' · '.join(details)}" if details else "")


async def search_running_courses(region: str, distance: str, settings: Any,
                                 user_id: str) -> tuple[list[dict], str]:
    """Use the running provider when configured, then the active local catalogue."""
    try:
        config = get_ai_server_config()
    except ValueError:
        config = None
    if config is not None:
        try:
            async with asyncio.timeout(15):
                result = await RunningAIClient(config).request("recommend", params={
                    "region": region, "distance_option": distance, "limit": 3,
                })
            if result.get("status") == "matched" and isinstance(result.get("courses"), list):
                courses = [row for row in result["courses"][:3]
                           if isinstance(row, dict)
                           and isinstance(row.get("name") or row.get("course_name"), str)
                           and 1 <= len((row.get("name") or row.get("course_name")).strip()) <= 200
                           and isinstance(row.get("course_id"), str)]
                if courses:
                    return courses, "general_ai"
        except (AIServerError, TimeoutError):
            pass
    rows = await RunningStore(settings, user_id).request("GET", "running_courses", params={
        "select": "name,region_name,distance_meters,estimated_duration_seconds,difficulty",
        "is_active": "eq.true", "region_name": f"ilike.*{region}*", "limit": "3",
    })
    if not isinstance(rows, list):
        return [], "database"
    return [row for row in rows if isinstance(row, dict)], "database"


async def answer_running_course(content: str, lookup) -> dict | None:
    request = running_course_request(content)
    if request is None:
        return None
    region, distance = request
    if region is None:
        return {
            "intent": "running_course", "content": "어느 지역의 러닝 코스를 찾을까요? 동·구·시 이름을 알려주세요.",
            "response_source": "need_more_data", "needs_more_data": True,
            "evidence": [{"type": "navigation", "route": "/exercise/running",
                          "label": "러닝 화면 열기"}], "required_data": ["running_region"],
        }
    courses, source = await lookup(region, distance)
    lines = [line for course in courses[:3] if (line := _course_line(course))]
    if lines:
        message = f"{region}에서 확인된 러닝 코스입니다.\n" + "\n".join(lines)
        message += "\n경로·거리와 현재 이용 가능 여부는 러닝 화면에서 확인해 주세요."
    else:
        message = (f"{region}에서 확인된 러닝 코스가 아직 없습니다. "
                   "러닝 화면에서 지역을 검색하거나 출발지를 지정해 코스를 생성해 보세요.")
    return {
        "intent": "running_course", "content": message,
        "response_source": source if lines else "need_more_data",
        "needs_more_data": not bool(lines),
        "evidence": [{"type": "navigation", "route": "/exercise/running",
                      "label": "러닝 코스 화면 열기"}] + [
                     {"type": "running_course", "name": row.get("name") or row.get("course_name"),
                      "region": region} for row in courses[:3] if _course_line(row)],
        "required_data": [] if lines else ["running_course_search"],
    }

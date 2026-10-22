import re

from app.schemas.chat import (
    ChatIntentResult,
    ChatPendingAction,
    ChatRequest,
    ChatResponse,
)

from app.schemas.recommendation import (
    ReplaceMealRequest,
)
from app.schemas.running import (
    RunningCourseRecommendationRequest,
    RunningLoopGenerationRequest,
)

from app.services.chat_intent_service import (
    classify_chat_intent,
)

from app.services.chat_answer_service import (
    answer_diet_question,
    answer_exercise_question,
    answer_general_chat,
    answer_health_question_with_sources,
)

from app.services.diet_recommendation_service import (
    generate_replacement_meal,
)
from app.services.durunubi_course_service import (
    DurunubiConfigurationError,
    DurunubiProviderError,
)
from app.services.kakao_map_service import (
    KakaoMapConfigurationError,
    KakaoMapProviderError,
)
from app.services.public_running_course_service import (
    PublicRunningCourseConfigurationError,
    PublicRunningCourseProviderError,
)
from app.services.running_route_service import (
    generate_running_loop_routes,
    recommend_running_courses,
)


# =========================================================
# Utility
# =========================================================


CONFIRM_ACTION_MESSAGES = {
    "네",
    "예",
    "응",
    "좋아",
    "확인",
    "진행해",
    "진행해줘",
    "바꿔줘",
    "변경해줘",
    "그렇게해줘",
}

CANCEL_ACTION_MESSAGES = {
    "아니",
    "아니요",
    "취소",
    "취소해줘",
    "그만",
    "바꾸지마",
    "변경하지마",
}


RUNNING_SERVICE_ERRORS = (
    PublicRunningCourseConfigurationError,
    PublicRunningCourseProviderError,
    DurunubiConfigurationError,
    DurunubiProviderError,
    KakaoMapConfigurationError,
    KakaoMapProviderError,
)


def _normalize_action_reply(message: str) -> str:
    return "".join(
        character
        for character in message.strip().lower()
        if character.isalnum()
    )


def _matches_action_reply(
    message: str,
    candidates: set[str],
) -> bool:
    normalized = _normalize_action_reply(message)
    tokens = {
        token
        for token in re.sub(
            r"[^0-9A-Za-z가-힣]+",
            " ",
            message.strip().lower(),
        ).split()
        if token
    }

    for candidate in candidates:
        candidate_normalized = _normalize_action_reply(candidate)
        if len(candidate_normalized) == 1:
            if candidate_normalized in tokens:
                return True
        elif candidate_normalized in normalized:
            return True

    return False


def _resolve_running_conditions(
    request: ChatRequest,
    intent_result: ChatIntentResult,
) -> dict[str, object | None]:
    """현재 메시지 조건을 우선하고 Backend context를 보완값으로 쓴다."""

    running_context = (
        request.context.running
        if request.context is not None
        else None
    )

    if intent_result.running_distance_option is not None:
        distance_option = intent_result.running_distance_option
        custom_distance_km = (
            intent_result.running_custom_distance_km
        )
    else:
        distance_option = (
            running_context.distance_option
            if running_context is not None
            else None
        )
        custom_distance_km = (
            running_context.custom_distance_km
            if running_context is not None
            else None
        )

    # 사용자가 메시지에서 다른 지역을 명시하면 이전 GPS를 섞지 않는다.
    # 명시 지역이 없고 최신 GPS가 있으면 저장된 region보다 GPS를
    # 우선하여 Running Service가 역지오코딩한 현재 지역을 사용한다.
    if intent_result.running_region is not None:
        region = intent_result.running_region
        latitude = None
        longitude = None
    else:
        latitude = (
            running_context.latitude
            if running_context is not None
            else None
        )
        longitude = (
            running_context.longitude
            if running_context is not None
            else None
        )
        region = (
            None
            if latitude is not None
            else (
                running_context.region
                if running_context is not None
                else None
            )
        )

    return {
        "distance_option": distance_option,
        "custom_distance_km": custom_distance_km,
        "region": region,
        "latitude": latitude,
        "longitude": longitude,
        "pace_minutes_per_km": (
            running_context.pace_minutes_per_km
            if running_context is not None
            else None
        ),
        "desired_difficulty": (
            intent_result.running_difficulty
            or (
                running_context.desired_difficulty
                if running_context is not None
                else None
            )
        ),
        "candidate_count": (
            running_context.candidate_count
            if running_context is not None
            else 3
        ),
        "seed": (
            running_context.seed
            if running_context is not None
            else None
        ),
    }


def _is_action_confirmation(message: str) -> bool:
    return _matches_action_reply(
        message,
        CONFIRM_ACTION_MESSAGES,
    )


def _is_action_cancellation(message: str) -> bool:
    return _matches_action_reply(
        message,
        CANCEL_ACTION_MESSAGES,
    )


def _extract_current_meal(
    diet_summary: dict | None,
    target_day: str,
    target_meal: str,
) -> tuple[str | None, list[str]]:
    """
    Backend가 전달한 주간 식단에서
    지정된 요일/식사 메뉴를 찾는다.
    """

    if not diet_summary:
        return None, []

    weekly_plan = diet_summary.get(
        "weekly_plan",
        [],
    )

    if not isinstance(
        weekly_plan,
        list,
    ):
        return None, []

    for day_item in weekly_plan:

        if not isinstance(
            day_item,
            dict,
        ):
            continue

        if day_item.get(
            "day"
        ) != target_day:
            continue

        meals = day_item.get(
            "meals",
            {},
        )

        if not isinstance(
            meals,
            dict,
        ):
            return None, []

        meal = meals.get(
            target_meal
        )

        if not isinstance(
            meal,
            dict,
        ):
            return None, []

        menu_name = meal.get(
            "menu_name"
        )

        current_food_names: list[str] = []
        seen_food_names: set[str] = set()

        items = meal.get("items", [])
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                food_name = str(
                    item.get("food_name") or ""
                ).strip()
                normalized = food_name.lower().replace(" ", "")
                if not normalized or normalized in seen_food_names:
                    continue
                seen_food_names.add(normalized)
                current_food_names.append(food_name)

        # 이전 식단 응답과의 호환성을 위한 fallback이다.
        if not current_food_names:
            ingredients = meal.get("ingredients", [])
            if isinstance(ingredients, list):
                for ingredient in ingredients:
                    if isinstance(ingredient, dict):
                        name = str(
                            ingredient.get("name") or ""
                        ).strip()
                    else:
                        name = str(ingredient or "").strip()

                    normalized = name.lower().replace(" ", "")
                    if not normalized or normalized in seen_food_names:
                        continue
                    seen_food_names.add(normalized)
                    current_food_names.append(name)

        return (
            menu_name,
            current_food_names,
        )

    return None, []


def _extract_weekly_menu_names(
    diet_summary: dict | None,
) -> list[str]:
    """
    재추천 메뉴가 현재 주간 식단의 다른 슬롯과도 겹치지 않도록
    기존 menu_name 목록을 추출한다.
    """

    if not diet_summary:
        return []

    weekly_plan = diet_summary.get(
        "weekly_plan",
        [],
    )

    if not isinstance(
        weekly_plan,
        list,
    ):
        return []

    result: list[str] = []
    seen: set[str] = set()

    for day_item in weekly_plan:
        if not isinstance(
            day_item,
            dict,
        ):
            continue

        meals = day_item.get(
            "meals",
            {},
        )

        if not isinstance(
            meals,
            dict,
        ):
            continue

        for meal in meals.values():
            if not isinstance(
                meal,
                dict,
            ):
                continue

            menu_name = str(
                meal.get(
                    "menu_name"
                )
                or ""
            ).strip()

            normalized = (
                menu_name
                .lower()
                .replace(" ", "")
            )

            if (
                not normalized
                or normalized in seen
            ):
                continue

            seen.add(
                normalized
            )
            result.append(
                menu_name
            )

    return result


# =========================================================
# Chat Orchestrator
# =========================================================


async def process_chat(
    request: ChatRequest,
) -> ChatResponse:
    """
    Auto-Fit Chat Orchestrator.

    Backend에서 전달한:
    - 현재 사용자 메시지
    - 최근 대화 history
    - 건강/운동/식단 context

    를 이용하여 적절한 기능으로 라우팅한다.
    """

    # =====================================================
    # 1. Intent Classification
    #
    # 현재 메시지뿐 아니라 최근 history도 함께 사용한다.
    # =====================================================

    pending_action = request.pending_action
    confirmed_pending_action = False

    if (
        pending_action is not None
        and _is_action_cancellation(request.content)
    ):
        return ChatResponse(
            intent="diet_replace_request",
            message="식단 변경 요청을 취소했어요.",
            action="diet_replace_cancelled",
            action_status="completed",
            target_day=pending_action.target_day,
            target_meal=pending_action.target_meal,
        )

    if pending_action is not None:
        if not _is_action_confirmation(request.content):
            return ChatResponse(
                intent="diet_replace_request",
                message=(
                    "식단 변경을 진행하려면 '네'라고 답하고, "
                    "원하지 않으면 '취소'라고 답해주세요."
                ),
                action="confirm_diet_replace",
                action_status="awaiting_confirmation",
                target_day=pending_action.target_day,
                target_meal=pending_action.target_meal,
                pending_action=pending_action,
            )

        intent_result = ChatIntentResult(
            intent="diet_replace_request",
            confidence=1.0,
            target_day=pending_action.target_day,
            target_meal=pending_action.target_meal,
        )
        confirmed_pending_action = True
    else:
        intent_result = await classify_chat_intent(
            message=request.content,
            history=request.history,
        )

    intent = intent_result.intent

    context = request.context

    # =====================================================
    # 2. Safe Context
    # =====================================================

    metric_statuses = (
        context.metric_statuses
        if context is not None
        else {}
    )

    # =====================================================
    # 3. Health Question
    # =====================================================

    if intent == "health_question":

        answer, sources = await answer_health_question_with_sources(
            message=request.content,
            metric_statuses=metric_statuses,
            history=request.history,
        )

        return ChatResponse(
            intent=intent,
            message=answer,
            action="health_rag",
            sources=sources,
        )

    # =====================================================
    # 4. Running Course Recommendation
    # =====================================================

    if intent == "running_recommend_request":
        running = _resolve_running_conditions(
            request,
            intent_result,
        )

        if running["distance_option"] is None:
            return ChatResponse(
                intent=intent,
                message=(
                    "3km, 5km, 10km 또는 원하는 러닝 거리를 "
                    "알려주세요."
                ),
                action="need_running_distance",
                action_status="needs_input",
            )

        if (
            running["region"] is None
            and running["latitude"] is None
        ):
            return ChatResponse(
                intent=intent,
                message=(
                    "코스를 추천하려면 현재 위치를 허용하거나 "
                    "시·군·구 지역을 알려주세요."
                ),
                action="need_running_location",
                action_status="needs_input",
            )

        try:
            recommendation = await recommend_running_courses(
                RunningCourseRecommendationRequest(
                    distance_option=running["distance_option"],
                    custom_distance_km=running[
                        "custom_distance_km"
                    ],
                    region=running["region"],
                    latitude=running["latitude"],
                    longitude=running["longitude"],
                    pace_minutes_per_km=running[
                        "pace_minutes_per_km"
                    ],
                    desired_difficulty=running[
                        "desired_difficulty"
                    ],
                    limit=3,
                )
            )
        except (*RUNNING_SERVICE_ERRORS, ValueError):
            return ChatResponse(
                intent=intent,
                message=(
                    "현재 러닝 코스를 조회하지 못했습니다. "
                    "위치와 거리를 확인한 뒤 다시 시도해주세요."
                ),
                action="running_unavailable",
                action_status="unable_to_apply",
            )

        recommendation_data = recommendation.model_dump(
            mode="json"
        )
        if recommendation.status == "generation_required":
            return ChatResponse(
                intent=intent,
                message=(
                    f"{recommendation.resolved_region}에서 "
                    f"약 {recommendation.target_distance_km:g}km에 맞는 "
                    "공식 코스를 찾지 못했습니다. 현재 위치를 "
                    "출발지로 순환 코스를 생성할 수 있어요."
                ),
                action="running_generation_required",
                action_status="completed",
                data=recommendation_data,
            )

        return ChatResponse(
            intent=intent,
            message=(
                f"{recommendation.resolved_region}에서 "
                f"약 {recommendation.target_distance_km:g}km인 "
                f"러닝 코스 {len(recommendation.courses)}개를 찾았어요."
            ),
            action="running_courses_recommended",
            action_status="completed",
            data=recommendation_data,
        )

    # =====================================================
    # 5. Running Loop Generation
    # =====================================================

    if intent == "running_generate_request":
        running = _resolve_running_conditions(
            request,
            intent_result,
        )

        if running["distance_option"] is None:
            return ChatResponse(
                intent=intent,
                message=(
                    "3km, 5km, 10km 또는 원하는 러닝 거리를 "
                    "알려주세요."
                ),
                action="need_running_distance",
                action_status="needs_input",
            )

        if (
            running["latitude"] is None
            or running["longitude"] is None
        ):
            return ChatResponse(
                intent=intent,
                message=(
                    "순환 코스를 만들려면 현재 GPS 위치 또는 "
                    "지도에서 선택한 정확한 출발지가 필요합니다."
                ),
                action="need_running_location",
                action_status="needs_input",
            )

        try:
            generated = await generate_running_loop_routes(
                RunningLoopGenerationRequest(
                    start={
                        "latitude": running["latitude"],
                        "longitude": running["longitude"],
                    },
                    distance_option=running["distance_option"],
                    custom_distance_km=running[
                        "custom_distance_km"
                    ],
                    pace_minutes_per_km=running[
                        "pace_minutes_per_km"
                    ],
                    candidate_count=running["candidate_count"],
                    seed=running["seed"],
                )
            )
        except (*RUNNING_SERVICE_ERRORS, ValueError):
            return ChatResponse(
                intent=intent,
                message=(
                    "현재 위치에서 순환 코스를 생성하지 못했습니다. "
                    "출발지나 거리를 변경해 다시 시도해주세요."
                ),
                action="running_unavailable",
                action_status="unable_to_apply",
            )

        generated_data = generated.model_dump(mode="json")
        if generated.status == "unavailable":
            return ChatResponse(
                intent=intent,
                message=(
                    generated.message
                    or "제한된 시도 안에 적절한 코스를 만들지 못했습니다."
                ),
                action="running_unavailable",
                action_status="unable_to_apply",
                data=generated_data,
            )

        if generated.status == "best_effort":
            message = (
                "요청 거리의 ±10% 범위에는 들지 않지만 가장 가까운 "
                "순환 코스 후보를 찾았습니다. 실제 거리와 오차를 "
                "확인한 뒤 선택해주세요."
            )
        else:
            message = (
                f"약 {generated.target_distance_km:g}km인 순환 코스 "
                f"{len(generated.candidates)}개를 만들었어요."
            )

        return ChatResponse(
            intent=intent,
            message=message,
            action="running_loops_generated",
            action_status="completed",
            data=generated_data,
        )

    # =====================================================
    # 6. Running Question
    # =====================================================

    if intent == "running_question":
        exercise_summary = (
            context.exercise_summary
            if context is not None
            else None
        )
        safe_running_context = (
            context.running.model_dump(
                mode="json",
                exclude={"latitude", "longitude"},
                exclude_none=True,
            )
            if context is not None and context.running is not None
            else None
        )
        combined_summary = {
            "exercise": exercise_summary or {},
            "running": safe_running_context or {},
        }

        answer = await answer_exercise_question(
            message=request.content,
            metric_statuses=metric_statuses,
            exercise_summary=combined_summary,
            history=request.history,
        )

        return ChatResponse(
            intent=intent,
            message=answer,
            action="running_context",
        )

    # =====================================================
    # 7. Exercise Replace (운동 API 연결 전 미지원)
    # =====================================================

    if intent == "exercise_replace_request":
        return ChatResponse(
            intent=intent,
            message=(
                "현재는 운동 계획 변경 기능을 지원하지 않습니다. "
                "저장된 운동 계획에 대한 설명과 안전 안내는 도와드릴 수 있어요."
            ),
            action="exercise_replace_unavailable",
            action_status="unable_to_apply",
            requires_backend_apply=False,
        )

    # =====================================================
    # 8. Exercise Question
    # =====================================================

    if intent == "exercise_question":

        exercise_summary = (
            context.exercise_summary
            if context is not None
            else None
        )

        answer = await answer_exercise_question(
            message=request.content,
            metric_statuses=metric_statuses,
            exercise_summary=exercise_summary,
            history=request.history,
        )

        return ChatResponse(
            intent=intent,
            message=answer,
            action="exercise_context",
        )

    # =====================================================
    # 9. Diet Question
    # =====================================================

    if intent == "diet_question":

        diet_summary = (
            context.diet_summary
            if context is not None
            else None
        )

        answer = await answer_diet_question(
            message=request.content,
            metric_statuses=metric_statuses,
            diet_summary=diet_summary,
            history=request.history,
        )

        return ChatResponse(
            intent=intent,
            message=answer,
            action="diet_context",
            target_day=(
                intent_result.target_day
            ),
            target_meal=(
                intent_result.target_meal
            ),
        )

    # =====================================================
    # 10. Diet Replace
    # =====================================================

    if intent == "diet_replace_request":

        target_day = (
            intent_result.target_day
        )

        target_meal = (
            intent_result.target_meal
        )

        # -------------------------------------------------
        # 요일이 아직 없음
        # -------------------------------------------------

        if not target_day:
            return ChatResponse(
                intent=intent,
                message=(
                    "어느 요일의 식사를 변경할지 알려주세요."
                ),
                action="need_target_day",
                action_status="needs_input",
                target_day=None,
                target_meal=target_meal,
            )

        # -------------------------------------------------
        # 식사 종류가 아직 없음
        # -------------------------------------------------

        if not target_meal:
            return ChatResponse(
                intent=intent,
                message=(
                    "아침, 점심, 저녁, 간식 중 "
                    "어떤 식사를 변경할지 알려주세요."
                ),
                action="need_target_meal",
                action_status="needs_input",
                target_day=target_day,
                target_meal=None,
            )

        # -------------------------------------------------
        # Backend context 없음
        # -------------------------------------------------

        if (
            context is None
            or not context.diet_summary
        ):
            return ChatResponse(
                intent=intent,
                message=(
                    "현재 저장된 식단 정보가 필요합니다."
                ),
                action="need_diet_context",
                action_status="needs_input",
                target_day=target_day,
                target_meal=target_meal,
                pending_action=pending_action,
            )

        # -------------------------------------------------
        # 기존 메뉴 확인
        # -------------------------------------------------

        current_menu_name, current_ingredients = (
            _extract_current_meal(
                diet_summary=context.diet_summary,
                target_day=target_day,
                target_meal=target_meal,
            )
        )

        if current_menu_name is None:
            return ChatResponse(
                intent=intent,
                message=(
                    "변경하려는 기존 식단을 찾지 못했습니다."
                ),
                action="meal_not_found",
                action_status="unable_to_apply",
                target_day=target_day,
                target_meal=target_meal,
            )

        # -------------------------------------------------
        # 최초 요청에서는 실행하지 않고 명시적 확인을 받는다.
        # Backend는 pending_action을 다음 ChatRequest에 그대로 전달한다.
        # -------------------------------------------------

        if not confirmed_pending_action:
            pending = ChatPendingAction(
                action="diet_replace",
                target_day=target_day,
                target_meal=target_meal,
            )
            return ChatResponse(
                intent=intent,
                message=(
                    f"{target_day} {target_meal}의 "
                    f"'{current_menu_name}' 메뉴를 변경할까요?"
                ),
                action="confirm_diet_replace",
                action_status="awaiting_confirmation",
                target_day=target_day,
                target_meal=target_meal,
                pending_action=pending,
            )

        # -------------------------------------------------
        # 기존 식단 교체 서비스 재사용
        # -------------------------------------------------

        replacement_request = ReplaceMealRequest(
            metric_statuses=(
                context.metric_statuses
            ),

            target_day=target_day,

            target_meal=target_meal,

            current_menu_name=(
                current_menu_name
            ),

            excluded_menu_names=(
                _extract_weekly_menu_names(
                    context.diet_summary
                )
            ),

            current_ingredients=(
                current_ingredients
            ),

            food_allergens=(
                context.food_allergens
                or []
            ),

            disliked_foods=(
                context.disliked_foods
                or []
            ),

            goal_type=(
                context.goal_type
            ),

            additional_input=(
                context.additional_input
            ),

            sido=(
                context.sido
            ),

            sigungu=(
                context.sigungu
            ),

            nearby_regions=(
                context.nearby_regions
                or []
            ),

            meal_target=(
                context.meal_target
            ),
        )

        replacement = (
            await generate_replacement_meal(
                replacement_request
            )
        )

        new_menu_name = (
            replacement.meal.menu_name
        )

        return ChatResponse(
            intent=intent,

            message=(
                f"{target_day} {target_meal} 메뉴를 "
                f"'{new_menu_name}'으로 변경할 준비가 됐어요."
            ),

            action="diet_replace",

            action_status="ready_for_backend_apply",

            requires_backend_apply=True,

            target_day=target_day,

            target_meal=target_meal,

            # Backend에서 해당 식단 슬롯 갱신에 사용
            data=replacement.model_dump(),
        )

    # =====================================================
    # 11. General Chat
    # =====================================================

    answer = await answer_general_chat(
        request.content,
        history=request.history,
    )

    return ChatResponse(
        intent="general_chat",
        message=answer,
        action="general_chat",
    )

"""DB-first orchestration shared by preview and persisted chat messages."""

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal

from backend.app.chat_health_scores import Assessment, build_score_answer
from backend.app.chat_intents import classify_question, is_off_topic_question
from backend.app.chat_records import record_period
from backend.app.chat_model import explain_records, general_information
from backend.app.chat_exercise_info import information_topic, needs_safety_guidance, answer_exercise_information


def clarification(message: str, required: str) -> dict:
    return {
        "intent": "clarification", "content": message,
        "response_source": "need_more_data", "needs_more_data": True,
        "evidence": [], "required_data": [required],
    }


def is_routine_generation_request(content: str) -> bool:
    text = "".join(content.casefold().split())
    if "루틴" in text:
        return any(word in text for word in ("추천", "만들", "짜", "생성"))
    return any(
        phrase in text
        for phrase in ("운동추천해줘", "운동추천해주세요", "오늘운동뭐해", "오늘운동계획짜")
    )


def routine_answer(outcome: dict) -> dict:
    missing = outcome.get("missing") or []
    if missing:
        labels = {
            "exercise_preferences": "운동 목표와 경험 수준",
            "recommendation_context": "운동 가능 시간·장소·장비와 현재 컨디션",
        }
        missing_labels = ", ".join(labels.get(item, item) for item in missing)
        return {
            "intent": "exercise_routine_generation",
            "content": f"맞춤 루틴을 만들려면 {missing_labels} 정보가 필요합니다.",
            "response_source": "need_more_data",
            "needs_more_data": True,
            "evidence": [],
            "required_data": missing,
        }

    recommendation = (outcome.get("result") or {}).get("recommendation") or {}
    generated = bool(outcome.get("generated"))
    evidence = [{
        "type": "exercise_routine",
        "ready": True,
        "generated": generated,
        "exercise_recommendation_id": recommendation.get("exercise_recommendation_id"),
        "next_endpoint": "/api/exercise/sessions/start" if generated
        else "/api/exercise/recommendations/generate",
    }]
    return {
        "intent": "exercise_routine_generation",
        "content": (
            "프로필과 오늘의 컨디션을 반영한 맞춤 루틴을 생성해 저장했습니다. "
            "운동 시작 화면에서 바로 시작할 수 있어요."
            if generated else
            "맞춤 루틴을 만들 준비가 됐습니다. 실제 채팅에서 생성 요청을 보내면 저장까지 진행됩니다."
        ),
        "response_source": "database",
        "needs_more_data": False,
        "evidence": evidence,
        "required_data": [],
    }


@dataclass(frozen=True)
class AnswerDecision:
    # Internal routing metadata, not a new client response or stored DB column.
    route: Literal["database", "clarification", "need_more_data", "ai_required"]
    answer: dict


async def decide_answer(
    content: str, load_scores: Callable[[], Awaitable[list[Assessment]]], load_records=None,
    load_score_items=None,
) -> AnswerDecision:
    """Inspect supported DB evidence before considering AI; never call a model.

    Insufficient evidence and unsupported queries must not become AI requests.
    DB failures propagate unchanged instead of triggering a model fallback.
    """
    plan = classify_question(content)
    answer = await _database_answer(
        content, plan, load_scores, load_records, load_score_items,
    )
    if answer["intent"] == "clarification":
        route = "clarification"
    elif answer.get("needs_more_data", False):
        route = "need_more_data"
    elif (
        plan.intent in {"meal_history", "exercise_history"}
        and plan.requires_explanation
        and answer.get("evidence")
    ):
        route = "ai_required"
    else:
        route = "database"
    return AnswerDecision(route, answer)


async def answer_question(
    content: str, load_scores: Callable[[], Awaitable[list[Assessment]]], load_records=None,
    load_catalog=None, allow_general=False, prepare_routine=None,
    load_score_items=None,
) -> dict:
    if is_routine_generation_request(content):
        if prepare_routine is None:
            return clarification(
                "맞춤 루틴 생성은 운동 프로필과 오늘의 컨디션 확인이 필요합니다.",
                "exercise_preferences",
            )
        return routine_answer(await prepare_routine())
    topic = information_topic(content)
    if topic is not None and load_catalog is not None:
        if needs_safety_guidance(content):
            return clarification('통증·질환 등이 언급된 질문에는 일반 운동 목록을 개인에게 적합한 운동으로 안내할 수 없습니다. 운동 가능 여부는 의료 전문가와 상담해 주세요.', 'professional_exercise_guidance')
        return await answer_exercise_information(topic, load_catalog)
    if is_off_topic_question(content):
        if not allow_general:
            return clarification(
                '궁금하신 마음은 이해하지만 Auto-Fit은 운동·식단·건강 관리에 집중하고 있어요. 이 대화에서는 이미 관련 없는 질문을 한 번 도와드렸기 때문에, 이제부터는 건강한 변화를 위한 질문을 부탁드릴게요. 운동 기록, 식단, 건강 점수에 관해서라면 기꺼이 도와드릴게요.',
                'autofit_topic_question',
            )
        response = await general_information(content)
        if response is None:
            return clarification(
                '이번 질문은 Auto-Fit의 운동·식단·건강 관리 범위와 조금 거리가 있고 현재 답변을 준비하지 못했어요. 다음 질문은 건강한 변화를 위한 주제로 부탁드릴게요.',
                'autofit_topic_question',
            )
        return {
            'intent': 'general_information',
            'content': response + '\n\n이번 질문은 Auto-Fit의 운동·식단·건강 관리 범위와 조금 거리가 있지만, 이번에는 간단히 도와드렸어요. 다음부터는 더 알맞은 도움을 드릴 수 있도록 건강한 변화를 위한 질문으로 부탁드릴게요.',
            'response_source': 'general_ai', 'needs_more_data': False,
            'evidence': [], 'required_data': [],
        }
    decision = await decide_answer(
        content, load_scores, load_records, load_score_items,
    )
    if decision.route == "ai_required":
        explanation = await explain_records(content, decision.answer)
        if explanation is not None:
            return {**decision.answer, "content": explanation,
                    "response_source": "database_ai"}
        return {**decision.answer, "content": decision.answer["content"] +
                " AI 설명을 현재 제공할 수 없어 확인된 기록 요약만 안내합니다."}
    return decision.answer


async def _database_answer(
    content, plan, load_scores, load_records, load_score_items,
):
    text = "".join(content.split())
    if plan.intent in {"meal_history", "exercise_history"} and load_records is not None:
        if any(word in text for word in ("왜", "이유", "원인", "추천", "어떻게", "괜찮", "뜻", "개선", "삭제", "수정", "변경", "저장", "다른사용자", "다른사람", "계획", "목표", "루틴", "종류", "무슨운동", "단백질", "탄수화물", "지방")):
            return clarification("현재는 본인의 기록 횟수·시간·열량 요약을 조회할 수 있습니다. 추천이나 원인 분석은 아직 지원하지 않습니다.", "record_summary_question")
        period = record_period(content)
        if period is None:
            return clarification("조회 기간을 오늘·어제·이번 주·지난주·최근 7일 중 하나로 알려주세요. 현재는 기간 전체 요약만 지원합니다.", "record_period")
        return await load_records(plan.intent, period)
    if plan.requires_clarification or plan.intent not in {
        "health_score_latest", "health_score_change",
    }:
        return clarification(
            "최근 건강 점수 비교 또는 기간을 지정한 식사·운동 기록 요약에 대해 질문해 주세요.",
            "supported_health_score_question",
        )
    # Do not silently reinterpret a dated or aggregate query as the latest pair.
    if re.search(
        r"\d|오늘|어제|그제|내일|모레|주간|월간|연간|이번|지난주|지난달|작년|올해|작월|"
        r"저번주|저번달|개월|일주일|한달|일년|일주|평균|최고|최저|전체|추이|처음|최초|예측|다음",
        text,
    ):
        return clarification(
            "특정 기간·통계 조회는 아직 지원하지 않습니다. 최근 점수 또는 바로 이전 평가와의 비교로 질문해 주세요.",
            "latest_or_previous_assessment_scope",
        )
    if any(word in text for word in ("삭제", "수정", "바꿔", "변경", "저장", "다른사람", "다른사용자")):
        return clarification(
            "로그인한 본인의 건강 점수 조회만 지원합니다.", "own_score_read_question",
        )
    if any(word in text for word in ("뜻", "정의", "무엇", "뭐야", "계산법", "산출법")):
        return clarification(
            "건강 점수의 정의나 산출 방식 안내는 아직 준비 중입니다. 최근 평가 점수는 조회할 수 있습니다.",
            "score_definition_support",
        )
    rows = await load_scores()
    mode = "change" if plan.intent == "health_score_change" else "latest"
    items = {}
    if plan.requires_explanation and load_score_items is not None:
        items = await load_score_items(rows)
    return build_score_answer(rows, mode, plan.requires_explanation, items)

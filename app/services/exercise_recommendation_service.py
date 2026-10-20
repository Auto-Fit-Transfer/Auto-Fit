import json

from openai import AsyncOpenAI

from app.core.config import get_settings
from app.graphs.nodes.rag_node import rag_node
from app.schemas.recommendation import (
    ExerciseRecommendationRequest,
    ExerciseRecommendationResponse,
)
from app.services.exercise_context_service import (
    build_exercise_safety_tags,
)


SYSTEM_INSTRUCTIONS = """
너는 Auto-Fit 헬스케어 애플리케이션의 운동 추천 AI다.

반드시 제공된 운동 조건과 검증된 공식 RAG 근거를 이용하여
사용자에게 일반적인 건강관리 목적의 운동 계획을 제공한다.

규칙:
- 의료 진단을 하지 않는다.
- 특정 질병이 있다고 단정하지 않는다.
- 약물 복용이나 의료 치료 변경을 권고하지 않는다.
- 사용자에게 제공되지 않은 원본 건강 수치를 추측하지 않는다.
- 개인정보나 사용자 식별정보를 추론하거나 출력하지 않는다.
- 운동 추천은 일반적인 건강관리 목적의 범위에서 제공한다.
- 건강 안전 tag가 있는 경우 운동 강도와 구성에 이를 반영한다.
- 사용자 선호와 건강 안전 조건이 충돌하면 건강 안전 조건을 우선한다.
- 무조건적인 고강도 운동을 권장하지 않는다.
- 사용자가 선택한 preferred_training_types를 우선적으로 반영한다.
- preferred_training_types에 없는 운동 방식을 주 운동 방식으로 임의 선택하지 않는다.
- exercise_mode와 모드별 설정이 있으면 해당 설정을 우선 반영한다.
- daily_condition이 tired이면 회복 가능한 낮은 강도를 우선한다.
- has_discomfort가 true이면 불편 부위에 직접 부담되는 동작을 피하고 주의사항을 제공한다.
- 제공된 장비만 사용할 수 있는 것으로 간주하고 없는 장비를 가정하지 않는다.
- 특정 전문 장비가 필요한 운동만으로 운동 계획을 구성하지 않는다.
- 운동 장소 조건이 제공되면 해당 장소에서 현실적으로 수행 가능한 운동을 우선한다.
- 검증된 RAG 근거가 없는 의학적 내용을 임의로 생성하지 않는다.
- sources에는 실제 rag_context에 존재하는 출처만 포함한다.
- 사용자에게 "원본 검사 수치가 없다"고 표현하지 않는다.
- 외부 LLM 입력에는 개인정보 보호를 위해 원본 건강 수치 대신 상태 분류만 제공된 것으로 이해한다.
- 수치 기반 세부 판단이 필요한 경우
  "현재 AI 분석에는 상태 분류를 사용했으므로 세부 수치 평가는 의료진과 확인하세요."
  정도로 표현한다.
""".strip()


def _get_openai_client() -> AsyncOpenAI:
    settings = get_settings()

    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not configured."
        )

    return AsyncOpenAI(
        api_key=settings.openai_api_key
    )


def _build_safe_rag_context(
    rag_context: list[dict],
) -> list[dict]:
    """
    외부 LLM에 전달할 RAG 데이터를 최소화한다.

    개인정보는 포함하지 않고,
    검증된 문서의 내용과 출처 정보만 전달한다.
    """

    safe_rag_context: list[dict] = []

    for item in rag_context:
        content = str(
            item.get(
                "content",
                "",
            )
        )

        safe_rag_context.append(
            {
                "content": content[:2000],
                "source_org": item.get(
                    "source_org"
                ),
                "title": item.get(
                    "title"
                ),
                "topic": item.get(
                    "topic"
                ),
            }
        )

    return safe_rag_context


async def generate_exercise_recommendation(
    request: ExerciseRecommendationRequest,
) -> ExerciseRecommendationResponse:
    settings = get_settings()

    # -----------------------------------------------------
    # 1. 건강 상태 분류
    # -----------------------------------------------------

    metric_statuses = request.metric_statuses

    # -----------------------------------------------------
    # 2. 건강 상태 → 운동 안전 tag
    #
    # raw health value는 외부 LLM으로 보내지 않는다.
    # -----------------------------------------------------

    safety_tags = build_exercise_safety_tags(
        metric_statuses
    )

    if request.daily_condition == "tired":
        safety_tags.append(
            "recovery_priority"
        )

    if request.has_discomfort:
        safety_tags.append(
            "discomfort_reported"
        )

    safety_tags = sorted(set(safety_tags))

    # -----------------------------------------------------
    # 3. 기존 RAG 파이프라인 재사용
    #
    # metric_statuses는 AI 서버 내부에서만 사용한다.
    # -----------------------------------------------------

    rag_result = await rag_node(
        {
            "merged_analysis": {
                "metric_statuses": (
                    metric_statuses
                )
            },
            "warnings": [],
        }
    )

    rag_context = rag_result.get(
        "rag_context",
        [],
    )

    # -----------------------------------------------------
    # 4. 외부 LLM용 RAG 데이터 최소화
    # -----------------------------------------------------

    safe_rag_context = (
        _build_safe_rag_context(
            rag_context
        )
    )

    # -----------------------------------------------------
    # 5. OpenAI에 전달할 안전한 payload
    #
    # 중요:
    # metric_statuses 자체는 외부 LLM에 보내지 않는다.
    # -----------------------------------------------------

    payload = {
        "exercise_safety_tags": (
            safety_tags
        ),
        "exercise_preferences": {
            "exercise_mode": (
                request.exercise_mode
            ),
            "goal_type": (
                request.goal_type
            ),
            "experience_level": (
                request.experience_level
            ),
            "available_minutes": (
                request.available_minutes
            ),
            "location": (
                request.location
            ),
            "preferred_training_types": (
                request.preferred_training_types
            ),
            "daily_condition": (
                request.daily_condition
            ),
            "has_discomfort": (
                request.has_discomfort
            ),
            "discomfort_areas": (
                request.discomfort_areas
            ),
            "gym_preferences": (
                request.gym_preferences.model_dump()
                if request.gym_preferences is not None
                else None
            ),
            "home_training_preferences": (
                request.home_training_preferences.model_dump()
                if request.home_training_preferences is not None
                else None
            ),
        },
        "rag_context": (
            safe_rag_context
        ),
    }

    # -----------------------------------------------------
    # 6. OpenAI 호출
    # -----------------------------------------------------

    client = _get_openai_client()

    response = await client.responses.parse(
        model=settings.openai_model,
        instructions=SYSTEM_INSTRUCTIONS,
        input=f"""
아래 정보를 기반으로 사용자가 실제로 수행할 수 있는
개인 맞춤형 운동 계획을 작성하세요.

exercise_safety_tags는 사용자의 건강 상태에서 파생된
일반화된 운동 안전 조건입니다.

preferred_training_types는 사용자가 프론트엔드에서 직접 선택한
선호 운동 방식입니다.

exercise_mode, daily_condition, 모드별 설정은 사용자가
"오늘의 운동 설정" 화면에서 직접 선택한 값입니다.

반드시 다음 규칙을 따르세요.

운동 방식:
- preferred_training_types가 비어 있지 않으면 해당 운동 방식을 우선하세요.
- 사용자가 선택하지 않은 운동 방식을 주 운동 방식으로 임의 추천하지 마세요.
- 여러 운동 방식이 선택되었다면 자연스럽게 조합할 수 있습니다.
- weight_training이 선택되면 근력 및 저항운동 중심으로 구성하세요.
- home_training이 선택되면 집에서 수행 가능한 운동을 중심으로 구성하세요.
- bodyweight가 선택되면 맨몸운동을 중심으로 구성하세요.
- cardio가 선택되면 걷기, 실내 유산소 등 유산소 운동을 중심으로 구성하세요.
- stretching이 선택되면 유연성 및 스트레칭 운동을 중심으로 구성하세요.
- functional_training이 선택되면 일상 동작과 연결되는 전신 운동을 중심으로 구성하세요.

장비:
- gym_preferences 또는 home_training_preferences에 장비/운동 방식이
  제공되면 그 선택을 정확히 반영하세요.
- 장비 선택이 제공되지 않은 기존 요청에서만 특정 장비를 가정하지 마세요.
- 전문적인 특정 기구가 필요한 운동만으로 구성하지 마세요.
- weight_training이 선택되더라도 일반적인 저항운동이나
  기본적인 헬스장 운동 수준에서 제안하세요.
- 운동 이름에 반드시 특정 머신이나 특정 장비가 필요하지 않도록
  가능한 범위에서 대체 가능한 운동을 선택하세요.

안전:
- exercise_safety_tags는 안전 제약조건입니다.
- 사용자 선호보다 건강 안전 조건을 우선하세요.
- 원본 건강 수치를 추측하지 마세요.
- 질병을 확정적으로 진단하지 마세요.
- 약물이나 의료 처방을 하지 마세요.
- 과도한 고강도 운동을 새롭게 시작하도록 권하지 마세요.

개인화:
- available_minutes를 고려하여 한 세션의 전체 운동 시간을 구성하세요.
- experience_level에 맞는 난이도로 구성하세요.
- location이 제공되면 해당 장소에서 수행 가능한 운동을 우선하세요.
- goal_type이 제공되면 운동 구성에 반영하세요.
- exercise_mode가 gym이면 gym_preferences의 training_style과
  focus_area를 우선 반영하세요.
- exercise_mode가 home_training이면 home_training_preferences의
  equipment와 workout_style을 우선 반영하세요.
- workout_style이 quiet이면 점프처럼 충격과 소음이 큰 동작을 피하세요.
- daily_condition이 tired이면 강도와 운동량을 낮추고 회복을 우선하세요.
- has_discomfort가 true이면 discomfort_areas에 직접 부담을 주는 운동을
  제외하고 cautions에 중단 기준을 포함하세요.

출력:
- weekly_frequency는 일반적으로 2~5회 범위에서 결정하세요.
- sessions는 최대 3개까지만 생성하세요.
- 각 session의 exercises는 최대 4개까지만 생성하세요.
- 각 exercise의 instructions는 최대 3개까지만 작성하세요.
- instructions 한 항목은 한 문장으로 간결하게 작성하세요.
- cautions는 최대 4개까지만 작성하세요.
- 같은 내용을 반복하지 마세요.
- sources에는 실제 rag_context에 포함된 출처만 사용하세요.
- 사용자에게 "원본 검사 수치가 없다"는 표현을 사용하지 마세요.

입력 데이터:

{json.dumps(
    payload,
    ensure_ascii=False,
)}
""".strip(),
        reasoning={
            "effort": "minimal"
        },
        text_format=(
            ExerciseRecommendationResponse
        ),
        max_output_tokens=3000,
    )

    parsed = response.output_parsed

    if parsed is None:
        raise RuntimeError(
            "운동 추천 구조화 응답을 생성하지 못했습니다."
        )

    return parsed

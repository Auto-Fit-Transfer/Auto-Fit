from fastapi import APIRouter

from app.services.diet_recommendation_service import (
    get_diet_candidate_cache_stats,
    get_diet_llm_cache_stats,
    get_diet_llm_resilience_stats,
    get_diet_rag_cache_stats,
)
from app.services.chat_answer_service import (
    get_chat_answer_resilience_stats,
)
from app.services.llm_service import (
    get_backend_chat_resilience_stats,
)
from app.services.local_specialty_service import (
    LocalSpecialtyService,
)
from app.services.health_analysis_service import (
    get_health_analysis_resilience_stats,
)
from app.services.diet_refresh_service import (
    get_diet_refresh_resilience_stats,
)
from app.services.meal_recipe_service import (
    MealRecipeService,
)

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "healthcare-ai-server"}


@router.get("/health/recipe")
async def recipe_health_check():
    """외부 호출 없이 Recipe Pipeline의 메모리 상태를 반환한다."""

    pipeline = MealRecipeService.get_operational_stats()

    return {
        "status": pipeline["status"],
        "service": "healthcare-ai-server",
        "recipe_pipeline": pipeline,
    }


@router.get("/health/diet")
async def diet_health_check():
    """외부 호출 없이 Diet 캐시와 LLM fallback 상태를 반환한다."""

    return {
        "status": "ok",
        "service": "healthcare-ai-server",
        "diet_candidate_cache": get_diet_candidate_cache_stats(),
        "diet_llm_cache": get_diet_llm_cache_stats(),
        "diet_llm_resilience": get_diet_llm_resilience_stats(),
        "diet_rag_cache": get_diet_rag_cache_stats(),
        "local_specialty_cache": (
            LocalSpecialtyService.get_cache_stats()
        ),
    }


@router.get("/health/chat")
async def chat_health_check():
    """외부 호출 없이 Chat 답변 fallback 상태를 반환한다."""

    return {
        "status": "ok",
        "service": "healthcare-ai-server",
        "chat_answer_resilience": (
            get_chat_answer_resilience_stats()
        ),
        "backend_chat_resilience": (
            get_backend_chat_resilience_stats()
        ),
    }


@router.get("/health/analysis")
async def health_analysis_health_check():
    """건강분석의 LLM 성공·fallback 상태만 반환한다."""

    return {
        "status": "ok",
        "service": "healthcare-ai-server",
        "health_analysis_resilience": (
            get_health_analysis_resilience_stats()
        ),
        "diet_refresh_resilience": (
            get_diet_refresh_resilience_stats()
        ),
    }

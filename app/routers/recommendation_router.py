import logging
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from fastapi.security import (
    HTTPAuthorizationCredentials,
)

from app.core.security import (
    security,
    verify_api_key,
)

from app.schemas.recommendation import (
    DietGenerateResponse,
    DietMealRegenerateResponse,
    DietRecipeRequest,
    DietRecipeResponse,
    DietRecommendationRequest,
    ExerciseGenerateResponse,
    ExerciseRecommendationRequest,
    ReplaceMealRequest,
)

from app.services.diet_recommendation_service import (
    generate_diet_recommendation,
    generate_replacement_meal,
)

from app.services.exercise_recommendation_service import (
    generate_exercise_recommendation,
)

from app.services.meal_recipe_service import (
    MealRecipeService,
)


logger = logging.getLogger(
    __name__
)


router = APIRouter(
    prefix="/recommend",
    tags=[
        "recommendation",
    ],
)


GENERATOR_NAME = (
    "auto-fit-ai"
)


# =========================================================
# Exercise Recommendation
# =========================================================


@router.post(
    "/exercise",
    response_model=ExerciseGenerateResponse,
)
async def recommend_exercise(
    request: ExerciseRecommendationRequest,
    credentials: (
        HTTPAuthorizationCredentials
        | None
    ) = Depends(
        security
    ),
) -> ExerciseGenerateResponse:
    """
    사용자 건강 상태 및 운동 선호 조건을 기반으로
    상세 운동 추천을 생성한다.
    """

    verify_api_key(
        credentials
    )

    try:

        result = (
            await generate_exercise_recommendation(
                request
            )
        )

        return ExerciseGenerateResponse(
            ok=True,
            generator=(
                GENERATOR_NAME
            ),
            result=result,
        )

    except RuntimeError:

        logger.exception(
            "Exercise recommendation "
            "service unavailable."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Exercise recommendation "
                "service is temporarily unavailable."
            ),
        )

    except Exception:

        logger.exception(
            "Exercise recommendation failed."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Exercise recommendation failed."
            ),
        )


# =========================================================
# Diet Recommendation
# =========================================================


@router.post(
    "/diet",
    response_model=DietGenerateResponse,
)
async def recommend_diet(
    request: DietRecommendationRequest,
    credentials: (
        HTTPAuthorizationCredentials
        | None
    ) = Depends(
        security
    ),
) -> DietGenerateResponse:
    """
    건강 상태, 사용자 목표, 알레르기,
    기피 음식, 지역 정보 등을 기반으로
    7일 개인 맞춤 식단을 생성한다.

    냉장고 재료 기능은 사용하지 않는다.
    """

    verify_api_key(
        credentials
    )

    try:

        result = (
            await generate_diet_recommendation(
                request
            )
        )

        return DietGenerateResponse(
            ok=True,
            generator=(
                GENERATOR_NAME
            ),
            result=result,
        )

    except RuntimeError:

        logger.exception(
            "Diet recommendation "
            "service unavailable."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Diet recommendation service "
                "is temporarily unavailable."
            ),
        )

    except Exception:

        logger.exception(
            "Diet recommendation failed."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Diet recommendation failed."
            ),
        )


# =========================================================
# Diet Recipe
#
# 사용자가 특정 한 끼의
# "레시피 보기"를 눌렀을 때 호출한다.
#
# 처리 순서:
#
# 1. 공식 식품안전나라 레시피 exact
# 2. 공식 유사 레시피
# 3. Auto-Fit AI 레시피 fallback
#
# 각 음식은 MealRecipeService에서
# 알레르기/기피 음식 검증까지 수행한다.
# =========================================================


@router.post(
    "/diet/recipe",
    response_model=DietRecipeResponse,
)
async def recommend_diet_recipe(
    request: DietRecipeRequest,
    credentials: (
        HTTPAuthorizationCredentials
        | None
    ) = Depends(
        security
    ),
) -> DietRecipeResponse:
    """
    특정 한 끼를 구성하는 음식들의
    조리법을 조회한다.

    식단 생성과 레시피 생성을 분리하여
    초기 식단 생성 속도와 LLM 비용을 줄인다.
    """

    verify_api_key(
        credentials
    )

    try:

        # =================================================
        # 기존 MealRecipeService 재사용
        # =================================================

        async with MealRecipeService() as recipe_service:

            # =============================================
            # Pydantic Request
            # → 기존 MealRecipeService 입력 dict 구조
            # =============================================

            meal_payload = {
                "items": [
                    item.model_dump()
                    for item
                    in request.items
                ]
            }

            # =============================================
            # 한 끼 구성 음식의 레시피를 병렬 조회
            #
            # MealRecipeService 내부:
            #
            # official_exact
            # → official_similar
            # → llm_generated
            #
            # 순으로 처리된다.
            # =============================================

            enriched_meal = (
                await recipe_service.enrich_meal(
                    meal=(
                        meal_payload
                    ),
                    allergies=(
                        request.food_allergens
                    ),
                    disliked_foods=(
                        request.disliked_foods
                    ),
                )
            )

        return DietRecipeResponse(
            ok=True,
            generator=(
                GENERATOR_NAME
            ),
            meal=(
                enriched_meal
            ),
        )

    except RuntimeError:

        logger.exception(
            "Diet recipe service unavailable."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Diet recipe service "
                "is temporarily unavailable."
            ),
        )

    except Exception:

        logger.exception(
            "Diet recipe generation failed."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Diet recipe generation failed."
            ),
        )


# =========================================================
# Replace Meal
# =========================================================


@router.post(
    "/diet/replace-meal",
    response_model=(
        DietMealRegenerateResponse
    ),
)
async def replace_diet_meal(
    request: ReplaceMealRequest,
    credentials: (
        HTTPAuthorizationCredentials
        | None
    ) = Depends(
        security
    ),
) -> DietMealRegenerateResponse:
    """
    특정 요일/식사 슬롯의 메뉴 하나만
    새 메뉴로 교체한다.
    """

    verify_api_key(
        credentials
    )

    try:

        result = (
            await generate_replacement_meal(
                request
            )
        )

        return (
            DietMealRegenerateResponse(
                ok=True,
                generator=(
                    GENERATOR_NAME
                ),
                meal=result,
            )
        )

    except RuntimeError:

        logger.exception(
            "Diet meal replacement "
            "service unavailable."
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Diet meal replacement service "
                "is temporarily unavailable."
            ),
        )

    except Exception:

        logger.exception(
            "Diet meal replacement failed."
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Diet meal replacement failed."
            ),
        )

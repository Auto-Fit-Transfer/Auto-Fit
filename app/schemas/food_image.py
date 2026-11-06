from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


FoodAnalysisStatus = Literal[
    "completed",
    "partial",
    "unavailable",
]

FoodRecognitionSource = Literal[
    "openai_vision",
    "user_input",
]


class VisionDetectedFood(BaseModel):
    """OpenAI Vision이 반환하는 음식 후보 하나다."""

    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
    )

    name: str = Field(min_length=1, max_length=100)
    estimated_amount_g: float | None = Field(
        ge=1,
        le=5000,
    )
    confidence: float = Field(ge=0, le=1)
    alternative_names: list[str] = Field(
        max_length=5,
    )


class VisionFoodRecognition(BaseModel):
    """OpenAI Structured Output 전용 내부 Schema다."""

    model_config = ConfigDict(extra="forbid")

    image_is_food: bool
    foods: list[VisionDetectedFood] = Field(
        max_length=12,
    )
    analysis_note: str = Field(max_length=300)


class FoodAnalysisRecalculateItem(BaseModel):
    """사용자가 확인하거나 수정한 음식과 중량이다."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        allow_inf_nan=False,
    )

    name: str = Field(min_length=1, max_length=100)
    amount_g: float = Field(gt=0, le=5000)


class FoodAnalysisRecalculateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[FoodAnalysisRecalculateItem] = Field(
        min_length=1,
        max_length=12,
    )


class FoodAnalysisNutrition(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    calories_kcal: float = Field(ge=0)
    carbohydrate_g: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)


class FoodAnalysisItem(BaseModel):
    """화면에서 사용자가 확인하거나 수정할 음식 한 항목이다."""

    model_config = ConfigDict(allow_inf_nan=False)

    name: str = Field(min_length=1, max_length=100)
    amount_g: float | None = Field(
        default=None,
        gt=0,
        le=5000,
    )
    amount_estimated: bool
    confidence: float | None = Field(
        default=None,
        ge=0,
        le=1,
    )
    alternative_names: list[str] = Field(
        default_factory=list,
        max_length=5,
    )
    catalog_matched: bool
    matched_food_code: str | None = None
    matched_food_name: str | None = None
    match_score: float | None = Field(
        default=None,
        ge=0,
        le=1,
    )
    calories_kcal: float | None = Field(default=None, ge=0)
    carbohydrate_g: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    nutrition_source: str | None = None
    requires_user_confirmation: bool = True
    warnings: list[str] = Field(default_factory=list)


class FoodAnalysisResponse(BaseModel):
    """이미지 분석과 사용자 수정 재계산이 공유하는 응답이다."""

    ok: bool = True
    generator: str = "auto-fit-ai"
    status: FoodAnalysisStatus
    recognition_source: FoodRecognitionSource
    nutrition_source: str = "official_food_catalog"
    items: list[FoodAnalysisItem] = Field(max_length=12)
    total_nutrition: FoodAnalysisNutrition
    nutrition_complete: bool
    requires_user_confirmation: bool = True
    message: str = Field(max_length=300)

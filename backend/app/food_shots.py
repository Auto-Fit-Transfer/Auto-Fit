"""Authenticated, transient FoodShot analysis and nutrition recalculation."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from backend.app.ai_server import AIEndpoint, AIServerClient, AIServerError, get_ai_server_config
from backend.app.chat_rate_limit import ChatRateLimiter


MAX_IMAGE_BYTES = 10 * 1024 * 1024


def service_headers(settings: Any) -> dict[str, str]:
    key = settings.supabase_service_role_key
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


class RecalculateItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)

    name: str = Field(min_length=1, max_length=100)
    amount_g: float = Field(gt=0, le=5000)
    matched_food_code: str | None = Field(default=None, min_length=1, max_length=100)


class RecalculateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[RecalculateItem] = Field(min_length=1, max_length=20)


class Nutrition(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    calories_kcal: float = Field(ge=0)
    carbohydrate_g: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)


class FoodShotItem(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    name: str = Field(min_length=1, max_length=100)
    amount_g: float | None = Field(default=None, gt=0, le=5000)
    amount_estimated: bool
    confidence: float | None = Field(default=None, ge=0, le=1)
    alternative_names: list[str] = Field(default_factory=list, max_length=5)
    catalog_matched: bool
    matched_food_code: str | None = None
    matched_food_name: str | None = None
    match_score: float | None = Field(default=None, ge=0, le=1)
    calories_kcal: float | None = Field(default=None, ge=0)
    carbohydrate_g: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    nutrition_source: str | None = None
    requires_user_confirmation: Literal[True] = True
    warnings: list[str] = Field(default_factory=list)


class FoodShotResponse(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    ok: Literal[True]
    generator: str
    status: Literal["completed", "partial", "unavailable"]
    recognition_source: Literal["openai_vision", "user_input"]
    nutrition_source: str
    items: list[FoodShotItem] = Field(max_length=20)
    total_nutrition: Nutrition
    nutrition_complete: bool
    requires_user_confirmation: Literal[True]
    message: str = Field(max_length=300)

    @model_validator(mode="after")
    def completed_has_full_nutrition(self) -> "FoodShotResponse":
        if self.status == "completed" and (
            not self.nutrition_complete or not self.items or any(
                item.amount_g is None or not item.catalog_matched or any(
                    getattr(item, field) is None for field in (
                        "calories_kcal", "carbohydrate_g", "protein_g", "fat_g"
                    )
                ) for item in self.items
            )
        ):
            raise ValueError("Completed FoodShot response lacks confirmed nutrition")
        return self


def image_type(content: bytes) -> str:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    raise HTTPException(415, detail={"code": "UNSUPPORTED_IMAGE_TYPE"})


def ai_config():
    try:
        config = get_ai_server_config()
    except ValueError:
        raise HTTPException(503, detail={"code": "AI_CONFIGURATION_ERROR"}) from None
    if config is None:
        raise HTTPException(503, detail={"code": "AI_DISABLED"})
    return config


def ai_failure(error: AIServerError) -> HTTPException:
    if error.upstream_status == 413:
        return HTTPException(413, detail={"code": "FOOD_SHOT_TOO_LARGE"})
    if error.upstream_status == 415:
        return HTTPException(415, detail={"code": "UNSUPPORTED_IMAGE_TYPE"})
    if error.upstream_status == 422:
        return HTTPException(422, detail={"code": "FOOD_SHOT_INPUT_REJECTED"})
    if error.code in {"AI_UNAVAILABLE", "AI_TIMEOUT", "AI_CONNECTION_ERROR"}:
        return HTTPException(503, detail={"code": error.code},
                             headers={"Retry-After": str(error.retry_after or 30)})
    return HTTPException(502, detail={"code": error.code})


def validate_ai_result(result: dict, expected_source: str) -> FoodShotResponse:
    try:
        answer = FoodShotResponse.model_validate(result)
    except ValidationError:
        raise HTTPException(502, detail={"code": "FOOD_SHOT_INVALID_RESPONSE"}) from None
    if answer.recognition_source != expected_source or (
        expected_source == "user_input" and any(
            item.amount_estimated or item.confidence is not None for item in answer.items
        )
    ):
        raise HTTPException(502, detail={"code": "FOOD_SHOT_INVALID_RESPONSE"})
    return answer


def create_food_shots_router(current_user_dependency: Any, settings_dependency: Any) -> APIRouter:
    router = APIRouter(prefix="/api/diet/food-shots", tags=["Diet"])

    @router.post("/analyze", response_model=FoodShotResponse,
                 summary="Analyze a food photo without saving it")
    async def analyze(
        response: Response,
        file: UploadFile = File(...),
        user: Any = Depends(current_user_dependency),
        settings: Any = Depends(settings_dependency),
    ) -> FoodShotResponse:
        try:
            config = ai_config()
            content = await file.read(MAX_IMAGE_BYTES + 1)
            if len(content) > MAX_IMAGE_BYTES:
                raise HTTPException(413, detail={"code": "FOOD_SHOT_TOO_LARGE"})
            mime = image_type(content)
            await ChatRateLimiter(
                settings.supabase_url, service_headers(settings), user.id
            ).check("answers")
            try:
                result = await AIServerClient(config).analyze_food_image(content, mime)
            except AIServerError as error:
                raise ai_failure(error) from None
            response.headers["Cache-Control"] = "no-store"
            return validate_ai_result(result, "openai_vision")
        finally:
            await file.close()

    @router.post("/recalculate", response_model=FoodShotResponse,
                 summary="Recalculate nutrition for user-confirmed foods")
    async def recalculate(
        response: Response,
        body: RecalculateRequest,
        user: Any = Depends(current_user_dependency),
        settings: Any = Depends(settings_dependency),
    ) -> FoodShotResponse:
        config = ai_config()
        await ChatRateLimiter(
            settings.supabase_url, service_headers(settings), user.id
        ).check("requests")
        try:
            result = await AIServerClient(config).post(
                AIEndpoint.FOOD_SHOT_RECALCULATE, body.model_dump(exclude_none=True)
            )
        except AIServerError as error:
            raise ai_failure(error) from None
        response.headers["Cache-Control"] = "no-store"
        return validate_ai_result(result, "user_input")

    return router

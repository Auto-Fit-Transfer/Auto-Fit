from functools import lru_cache

from pydantic import Field
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    # AI Server -> OpenAI 인증
    openai_api_key: str | None = None

    # 주간 식단 / 운동 등 기본 모델
    openai_model: str = "gpt-5"

    # 주간 식단 설명/guidance 전용 빠른 모델
    openai_diet_model: str = "gpt-5"

    # 한 끼 식단 재추천 전용 빠른 모델
    openai_replace_meal_model: str = "gpt-5-mini"

    # OpenAI가 지연되더라도 공식 Food DB 기반 식단은 반환한다.
    diet_openai_timeout_seconds: float = Field(
        default=45.0,
        gt=0,
        le=300,
    )
    replace_meal_openai_timeout_seconds: float = Field(
        default=30.0,
        gt=0,
        le=300,
    )

    # Chat orchestration 답변 생성 제한 시간
    chat_openai_timeout_seconds: float = Field(
        default=30.0,
        gt=0,
        le=300,
    )

    # 음식 사진 인식 / 공식 Food DB 매칭
    openai_food_image_model: str = "gpt-5-mini"
    food_image_openai_timeout_seconds: float = Field(
        default=45.0,
        gt=0,
        le=300,
    )
    food_image_max_bytes: int = Field(
        default=10_000_000,
        ge=100_000,
        le=20_000_000,
    )
    food_image_max_items: int = Field(
        default=12,
        ge=1,
        le=20,
    )
    food_catalog_match_threshold: float = Field(
        default=0.78,
        ge=0.5,
        le=1.0,
    )

    # Diet LLM 설명/메타데이터 캐시
    diet_llm_cache_ttl_seconds: float = Field(
        default=900.0,
        gt=0,
        le=86400,
    )
    diet_llm_cache_max_entries: int = Field(
        default=256,
        ge=1,
        le=10000,
    )

    # 농사로 전체 지역 특산물 프로세스 공유 캐시
    local_specialty_cache_ttl_seconds: float = Field(
        default=21600.0,
        gt=0,
        le=604800,
    )

    # 검증된 Diet RAG context 캐시
    diet_rag_cache_ttl_seconds: float = Field(
        default=600.0,
        gt=0,
        le=86400,
    )
    diet_rag_cache_max_entries: int = Field(
        default=128,
        ge=1,
        le=10000,
    )

    # 사용자 조건별 공식 Food DB 검증 후보 캐시
    diet_candidate_cache_ttl_seconds: float = Field(
        default=600.0,
        gt=0,
        le=86400,
    )
    diet_candidate_cache_max_entries: int = Field(
        default=128,
        ge=1,
        le=10000,
    )

    # 공공기관 음식 API
    public_data_service_key: str | None = None

    # 식품나라 조리식품 레시피 DB
    food_safety_recipe_api_key: str | None = None

    # Recipe Pipeline 운영 설정
    recipe_api_timeout_seconds: float = Field(
        default=30.0,
        gt=0,
        le=120,
    )
    recipe_api_max_attempts: int = Field(
        default=3,
        ge=1,
        le=5,
    )
    recipe_api_retry_backoff_seconds: float = Field(
        default=0.25,
        ge=0,
        le=10,
    )
    recipe_api_circuit_failure_threshold: int = Field(
        default=3,
        ge=1,
        le=20,
    )
    recipe_api_circuit_recovery_seconds: float = Field(
        default=30.0,
        gt=0,
        le=600,
    )
    recipe_openai_timeout_seconds: float = Field(
        default=60.0,
        gt=0,
        le=300,
    )
    recipe_cache_ttl_seconds: float = Field(
        default=1800.0,
        gt=0,
        le=86400,
    )
    recipe_cache_max_entries: int = Field(
        default=512,
        ge=1,
        le=10000,
    )

    # 농촌진흥청 지역특산물 API
    nongsaro_api_key: str | None = None

    # Kakao Maps REST API / Running Route
    kakao_rest_api_key: str | None = None
    kakao_api_timeout_seconds: float = Field(
        default=20.0,
        gt=0,
        le=120,
    )
    running_default_pace_minutes_per_km: float = Field(
        default=7.0,
        ge=2.0,
        le=20.0,
    )
    running_public_data_timeout_seconds: float = Field(
        default=30.0,
        gt=0,
        le=120,
    )
    running_course_catalog_cache_ttl_seconds: float = Field(
        default=21600.0,
        gt=0,
        le=604800,
    )
    running_course_geocode_limit: int = Field(
        default=20,
        ge=1,
        le=50,
    )
    running_durunubi_enabled: bool = False
    running_durunubi_cache_ttl_seconds: float = Field(
        default=21600.0,
        gt=0,
        le=604800,
    )
    running_durunubi_geometry_limit: int = Field(
        default=10,
        ge=1,
        le=30,
    )
    running_gpx_max_bytes: int = Field(
        default=5_000_000,
        ge=100_000,
        le=20_000_000,
    )
    running_gpx_max_points: int = Field(
        default=2000,
        ge=100,
        le=10000,
    )
    running_loop_tolerance_ratio: float = Field(
        default=0.10,
        gt=0,
        le=0.25,
    )
    running_loop_attempts_per_candidate: int = Field(
        default=2,
        ge=1,
        le=3,
    )

    # Backend -> AI Server 인증
    ai_server_api_key: str | None = None

    app_name: str = (
        "Healthcare AI Server"
    )


    model_config = (
        SettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            case_sensitive=False,
            extra="ignore",
        )
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()

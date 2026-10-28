import json
import os
from time import perf_counter

import httpx
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent
# =========================================================
# 환경변수 로드
# =========================================================


load_dotenv(
    PROJECT_ROOT / ".env"
)


# =========================================================
# 테스트 대상
#
# 로컬 FastAPI 실행 기준:
#   http://127.0.0.1:8000
#
# 다른 주소를 쓰고 싶으면 .env에:
#   AI_SERVER_BASE_URL=http://...
# =========================================================

BASE_URL = (
    os.getenv(
        "AI_SERVER_BASE_URL"
    )
    or "http://127.0.0.1:8001"
).rstrip("/")


ENDPOINT = "/recommend/diet"

REPLACE_ENDPOINT = (
    "/recommend/diet/replace-meal"
)

RECIPE_ENDPOINT = (
    "/recommend/diet/recipe"
)

RECIPE_HEALTH_ENDPOINT = (
    "/health/recipe"
)


# =========================================================
# 인증키
# =========================================================

AI_SERVER_API_KEY = os.getenv(
    "AI_SERVER_API_KEY"
)


# =========================================================
# E2E 테스트 요청
# =========================================================

REQUEST_BODY = {
    "metric_statuses": {
        "blood_pressure": "high",
        "glucose": "normal",
        "lipid": "caution",
        "obesity": "normal",
    },
    "food_allergens": [],
    "disliked_foods": [
        "버섯",
    ],
    "goal_type": "general_health",
    "additional_input": None,
    "sido": "경상북도",
    "sigungu": "영양군",
    "nearby_regions": [
        {
            "sido": "경상북도",
            "sigungu": "청송군",
            "distance_km": 28.5,
        }
    ],
    "meal_target": {
        "calories_kcal": 500,
        "protein_g": 30,
        "fat_g": 15,
        "carbohydrate_g": 60,
    },
}


# =========================================================
# 응답에서 실제 DietRecommendationResponse 꺼내기
#
# API가 직접 응답을 반환해도 되고,
# {"result": {...}} wrapper를 사용해도 테스트 가능
# =========================================================

def extract_result(
    payload: dict,
) -> dict:

    result = payload.get(
        "result"
    )

    if isinstance(
        result,
        dict,
    ):
        return result

    return payload


# =========================================================
# E2E 검증
# =========================================================

def validate_diet_response(
    result: dict,
) -> list[str]:

    weekly_plan = result.get(
        "weekly_plan"
    )

    if not isinstance(
        weekly_plan,
        list,
    ):
        raise RuntimeError(
            "weekly_plan이 list가 아닙니다."
        )

    if len(
        weekly_plan
    ) != 7:
        raise RuntimeError(
            f"weekly_plan이 7일이 아닙니다: {len(weekly_plan)}"
        )

    expected_days = {
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    }

    actual_days = {
        day.get(
            "day"
        )
        for day in weekly_plan
    }

    if (
        actual_days
        != expected_days
    ):
        raise RuntimeError(
            f"요일 구성이 잘못되었습니다: {actual_days}"
        )

    meal_types = [
        "breakfast",
        "lunch",
        "dinner",
        "snack",
    ]

    menu_names = []

    # =====================================================
    # 7일 × 4끼 검증
    # =====================================================

    for day in weekly_plan:

        day_name = day[
            "day"
        ]

        meals = day.get(
            "meals"
        )

        if not isinstance(
            meals,
            dict,
        ):
            raise RuntimeError(
                f"{day_name}: meals가 dict가 아닙니다."
            )

        for meal_type in meal_types:

            meal = meals.get(
                meal_type
            )

            if not isinstance(
                meal,
                dict,
            ):
                raise RuntimeError(
                    f"{day_name} {meal_type}: 식사 데이터가 없습니다."
                )

            menu_name = str(
                meal.get(
                    "menu_name"
                )
                or ""
            ).strip()

            if not menu_name:
                raise RuntimeError(
                    f"{day_name} {meal_type}: menu_name이 비어 있습니다."
                )

            menu_names.append(
                menu_name
            )

            # -------------------------------------------------
            # 냉장고 기능 제거 확인
            # -------------------------------------------------

            if meal.get(
                "ingredients"
            ) is not None:
                raise RuntimeError(
                    f"{day_name} {meal_type}: ingredients가 null이 아닙니다."
                )

            items = meal.get(
                "items"
            )

            if (
                not isinstance(
                    items,
                    list,
                )
                or not items
            ):
                raise RuntimeError(
                    f"{day_name} {meal_type}: Food item이 없습니다."
                )

            for item in items:
                if not isinstance(
                    item,
                    dict,
                ):
                    raise RuntimeError(
                        f"{day_name} {meal_type}: Food item 형식이 잘못되었습니다."
                    )

                if not str(
                    item.get(
                        "food_name"
                    )
                    or ""
                ).strip():
                    raise RuntimeError(
                        f"{day_name} {meal_type}: food_name이 비어 있습니다."
                    )

                for item_key in (
                    "portion_g",
                    "calories_kcal",
                    "carbohydrate_g",
                    "protein_g",
                    "fat_g",
                ):
                    value = item.get(
                        item_key
                    )

                    if (
                        value is not None
                        and (
                            not isinstance(
                                value,
                                (
                                    int,
                                    float,
                                ),
                            )
                            or value < 0
                        )
                    ):
                        raise RuntimeError(
                            f"{day_name} {meal_type}: {item_key} 값이 잘못되었습니다."
                        )

            calories = meal.get(
                "estimated_calories_kcal"
            )

            if (
                not isinstance(
                    calories,
                    (
                        int,
                        float,
                    ),
                )
                or calories < 0
            ):
                raise RuntimeError(
                    f"{day_name} {meal_type}: calories 값이 잘못되었습니다."
                )

            nutrition = meal.get(
                "nutrition"
            )

            if not isinstance(
                nutrition,
                dict,
            ):
                raise RuntimeError(
                    f"{day_name} {meal_type}: nutrition이 없습니다."
                )

            for key in (
                "carbohydrate_g",
                "protein_g",
                "fat_g",
            ):

                value = nutrition.get(
                    key
                )

                if (
                    not isinstance(
                        value,
                        (
                            int,
                            float,
                        ),
                    )
                    or value < 0
                ):
                    raise RuntimeError(
                        f"{day_name} {meal_type}: {key} 값이 잘못되었습니다."
                    )

    # =====================================================
    # 메뉴 중복 확인
    # =====================================================

    duplicate_count = (
        len(menu_names)
        - len(
            set(
                menu_names
            )
        )
    )

    print(
        "총 식사 슬롯:",
        len(menu_names),
    )

    print(
        "고유 메뉴 수:",
        len(
            set(
                menu_names
            )
        ),
    )

    print(
        "중복 메뉴 수:",
        duplicate_count,
    )

    if duplicate_count > 0:
        print(
            "주의: 메뉴 이름 중복이 존재합니다."
        )

    return menu_names


def validate_replacement_response(
    *,
    payload: dict,
    excluded_menu_names: list[str],
) -> dict:
    replacement = payload.get(
        "meal"
    )

    if not isinstance(
        replacement,
        dict,
    ):
        raise RuntimeError(
            "재추천 응답의 meal wrapper가 없습니다."
        )

    if replacement.get("day") != "monday":
        raise RuntimeError(
            "재추천 요일이 요청과 다릅니다."
        )

    if replacement.get("meal_type") != "lunch":
        raise RuntimeError(
            "재추천 식사 유형이 요청과 다릅니다."
        )

    meal = replacement.get(
        "meal"
    )

    if not isinstance(
        meal,
        dict,
    ):
        raise RuntimeError(
            "재추천 DietMeal이 없습니다."
        )

    menu_name = str(
        meal.get(
            "menu_name"
        )
        or ""
    ).strip()

    normalized_excluded = {
        str(name).lower().replace(" ", "")
        for name in excluded_menu_names
    }

    if (
        not menu_name
        or menu_name.lower().replace(" ", "")
        in normalized_excluded
    ):
        raise RuntimeError(
            "재추천 메뉴가 비어 있거나 기존 주간 메뉴와 중복됩니다."
        )

    if meal.get("ingredients") is not None:
        raise RuntimeError(
            "재추천 식단에 Recipe ingredients가 포함되었습니다."
        )

    if meal.get("image_prompt") is not None:
        raise RuntimeError(
            "재추천 식단에 image_prompt가 포함되었습니다."
        )

    items = meal.get(
        "items"
    )

    if (
        not isinstance(
            items,
            list,
        )
        or not items
    ):
        raise RuntimeError(
            "재추천 응답에 공식 Food item이 없습니다."
        )

    nutrition = meal.get(
        "nutrition"
    )

    if not isinstance(
        nutrition,
        dict,
    ):
        raise RuntimeError(
            "재추천 응답에 nutrition이 없습니다."
        )

    expected_values = {
        "calories_kcal": meal.get(
            "estimated_calories_kcal"
        ),
        "carbohydrate_g": nutrition.get(
            "carbohydrate_g"
        ),
        "protein_g": nutrition.get(
            "protein_g"
        ),
        "fat_g": nutrition.get(
            "fat_g"
        ),
    }

    for key, expected in expected_values.items():
        total = round(
            sum(
                float(
                    item.get(key)
                    or 0
                )
                for item in items
            ),
            2,
        )

        if (
            not isinstance(expected, (int, float))
            or abs(total - float(expected)) > 0.01
        ):
            raise RuntimeError(
                f"재추천 {key}가 공식 item 합계와 다릅니다: "
                f"expected={expected}, actual={total}"
            )

    return meal


def validate_recipe_response(
    *,
    payload: dict,
    requested_items: list[dict],
) -> list[dict]:
    meal = payload.get(
        "meal"
    )

    if not isinstance(
        meal,
        dict,
    ):
        raise RuntimeError(
            "Recipe 응답의 meal wrapper가 없습니다."
        )

    items = meal.get(
        "items"
    )

    if (
        not isinstance(
            items,
            list,
        )
        or len(items)
        != len(requested_items)
    ):
        raise RuntimeError(
            "Recipe 응답 item 수가 요청과 다릅니다."
        )

    allowed_sources = {
        "official_exact",
        "official_similar",
        "llm_generated",
        "unavailable",
    }

    for requested, result in zip(
        requested_items,
        items,
        strict=True,
    ):
        for key in (
            "food_name",
            "portion_g",
            "calories_kcal",
            "carbohydrate_g",
            "protein_g",
            "fat_g",
        ):
            if result.get(key) != requested.get(key):
                raise RuntimeError(
                    f"Recipe 응답에서 {key}가 손상되었습니다: "
                    f"requested={requested.get(key)}, result={result.get(key)}"
                )

        source = result.get(
            "recipe_source"
        )

        if source not in allowed_sources:
            raise RuntimeError(
                f"알 수 없는 recipe_source입니다: {source}"
            )

        if result.get(
            "safety_checked"
        ) is not True:
            raise RuntimeError(
                "Recipe 안전검사가 완료되지 않았습니다."
            )

        recipe_available = result.get(
            "recipe_available"
        )
        recipe = result.get(
            "recipe"
        )

        if source == "unavailable":
            if recipe_available or recipe is not None:
                raise RuntimeError(
                    "unavailable Recipe 상태가 일관되지 않습니다."
                )
            continue

        if (
            recipe_available is not True
            or not isinstance(
                recipe,
                dict,
            )
        ):
            raise RuntimeError(
                "사용 가능한 Recipe 상세정보가 없습니다."
            )

        if result.get(
            "restriction_matches"
        ):
            raise RuntimeError(
                "사용 가능한 Recipe에 알레르기/기피 음식 충돌이 남아 있습니다."
            )

        ingredients = recipe.get(
            "ingredients"
        )

        if (
            not isinstance(
                ingredients,
                list,
            )
            or not ingredients
        ):
            raise RuntimeError(
                "구조화된 Recipe ingredients가 없습니다."
            )

        for ingredient in ingredients:
            if set(ingredient) != {
                "name",
                "amount_g",
            }:
                raise RuntimeError(
                    "Recipe ingredient가 name + amount_g 구조가 아닙니다."
                )

            if not str(
                ingredient.get(
                    "name"
                )
                or ""
            ).strip():
                raise RuntimeError(
                    "Recipe ingredient name이 비어 있습니다."
                )

            amount_g = ingredient.get(
                "amount_g"
            )

            if (
                amount_g is not None
                and (
                    not isinstance(
                        amount_g,
                        (
                            int,
                            float,
                        ),
                    )
                    or amount_g < 0
                )
            ):
                raise RuntimeError(
                    "Recipe ingredient amount_g 값이 잘못되었습니다."
                )

        if source.startswith("official_"):
            if (
                result.get(
                    "official_recipe"
                ) is not True
                or not result.get(
                    "matched_recipe_name"
                )
                or result.get(
                    "match_score"
                ) is None
            ):
                raise RuntimeError(
                    "공식 Recipe match 정보가 누락되었습니다."
                )

            if (
                requested.get(
                    "portion_g"
                ) is not None
                and recipe.get(
                    "serving_weight"
                ) != requested.get(
                    "portion_g"
                )
            ):
                raise RuntimeError(
                    "공식 Recipe에 추천 portion scaling이 반영되지 않았습니다."
                )
        elif source == "llm_generated":
            if (
                result.get(
                    "official_recipe"
                ) is not False
                or result.get(
                    "matched_recipe_name"
                ) is not None
                or result.get(
                    "match_score"
                ) is not None
            ):
                raise RuntimeError(
                    "LLM Recipe match 상태가 잘못되었습니다."
                )

    return items


def validate_tot_scaling(
    item: dict,
) -> None:
    if item.get(
        "recipe_source"
    ) != "official_similar":
        raise RuntimeError(
            "톳나물_두부가 official_similar로 반환되지 않았습니다."
        )

    if item.get(
        "matched_recipe_name"
    ) != "톳나물 두부무침":
        raise RuntimeError(
            "톳나물_두부 공식 매칭 메뉴가 변경되었습니다."
        )

    if item.get(
        "match_score"
    ) != 0.9157:
        raise RuntimeError(
            "톳나물_두부 유사도 0.9157 regression입니다."
        )

    recipe = item[
        "recipe"
    ]

    if recipe.get(
        "serving_weight"
    ) != 70.0:
        raise RuntimeError(
            "추천 portion 70g이 Recipe serving_weight에 반영되지 않았습니다."
        )

    amounts = {
        ingredient["name"]: (
            ingredient["amount_g"]
        )
        for ingredient in recipe[
            "ingredients"
        ]
    }

    expected_amounts = {
        "톳나물": 21.0,
        "두부": 56.0,
        "천일염": 0.14,
    }

    for name, expected in expected_amounts.items():
        actual = amounts.get(
            name
        )

        if actual != expected:
            raise RuntimeError(
                f"{name} scaling 값이 잘못되었습니다: "
                f"expected={expected}, actual={actual}"
            )


# =========================================================
# 출력
# =========================================================

def print_weekly_plan(
    result: dict,
) -> None:

    print()
    print(
        "=" * 80
    )
    print(
        "7일 식단 결과"
    )

    for day in result[
        "weekly_plan"
    ]:

        print()
        print(
            "-" * 80
        )
        print(
            day[
                "day"
            ]
        )

        for meal_type in (
            "breakfast",
            "lunch",
            "dinner",
            "snack",
        ):

            meal = (
                day[
                    "meals"
                ][
                    meal_type
                ]
            )

            print(
                f"{meal_type}: "
                f"{meal['menu_name']} "
                f"({meal['estimated_calories_kcal']} kcal)"
            )


# =========================================================
# 실행
# =========================================================

def main():

    headers = {
        "Content-Type": (
            "application/json"
        ),
    }

    if AI_SERVER_API_KEY:

        headers[
            "Authorization"
        ] = (
            f"Bearer "
            f"{AI_SERVER_API_KEY}"
        )

    url = (
        BASE_URL
        + ENDPOINT
    )

    print(
        "=" * 80
    )
    print(
        "Auto-Fit Diet E2E Test"
    )
    print(
        "URL:",
        url,
    )
    print(
        "Authorization:",
        (
            "설정됨"
            if AI_SERVER_API_KEY
            else "없음"
        ),
    )

    start = perf_counter()

    with httpx.Client(
        timeout=180.0
    ) as client:

        response = client.post(
            url,
            headers=headers,
            json=REQUEST_BODY,
        )

    elapsed = (
        perf_counter()
        - start
    )

    print(
        "HTTP Status:",
        response.status_code,
    )

    print(
        "총 처리 시간:",
        round(
            elapsed,
            3,
        ),
        "초",
    )

    # =====================================================
    # HTTP 오류 시 본문 출력
    # =====================================================

    if response.status_code >= 400:

        print()
        print(
            "오류 응답:"
        )

        print(
            response.text
        )

        raise SystemExit(
            1
        )

    payload = response.json()

    result = extract_result(
        payload
    )

    # =====================================================
    # 응답 구조 검증
    # =====================================================

    menu_names = validate_diet_response(
        result
    )

    print_weekly_plan(
        result
    )

    monday = next(
        day
        for day in result["weekly_plan"]
        if day["day"] == "monday"
    )
    current_meal = monday[
        "meals"
    ][
        "lunch"
    ]

    replace_body = {
        **REQUEST_BODY,
        "target_day": "monday",
        "target_meal": "lunch",
        "current_menu_name": (
            current_meal["menu_name"]
        ),
        "excluded_menu_names": (
            menu_names
        ),
        "current_ingredients": [
            item["food_name"]
            for item in current_meal[
                "items"
            ]
        ],
    }

    replace_url = (
        BASE_URL
        + REPLACE_ENDPOINT
    )

    replace_start = perf_counter()

    with httpx.Client(
        timeout=180.0
    ) as client:
        replace_response = client.post(
            replace_url,
            headers=headers,
            json=replace_body,
        )

    replace_elapsed = (
        perf_counter()
        - replace_start
    )

    print()
    print(
        "재추천 HTTP Status:",
        replace_response.status_code,
    )
    print(
        "재추천 처리 시간:",
        round(
            replace_elapsed,
            3,
        ),
        "초",
    )

    if replace_response.status_code >= 400:
        print(
            replace_response.text
        )
        raise SystemExit(1)

    replacement_meal = (
        validate_replacement_response(
            payload=(
                replace_response.json()
            ),
            excluded_menu_names=(
                menu_names
            ),
        )
    )

    print(
        "재추천 메뉴:",
        replacement_meal[
            "menu_name"
        ],
    )

    recipe_url = (
        BASE_URL
        + RECIPE_ENDPOINT
    )
    selected_items = current_meal[
        "items"
    ]
    recipe_body = {
        "items": selected_items,
        "food_allergens": REQUEST_BODY[
            "food_allergens"
        ],
        "disliked_foods": REQUEST_BODY[
            "disliked_foods"
        ],
    }

    recipe_start = perf_counter()

    with httpx.Client(
        timeout=240.0
    ) as client:
        recipe_response = client.post(
            recipe_url,
            headers=headers,
            json=recipe_body,
        )

    recipe_elapsed = (
        perf_counter()
        - recipe_start
    )

    print()
    print(
        "Diet → Recipe HTTP Status:",
        recipe_response.status_code,
    )
    print(
        "Diet → Recipe 처리 시간:",
        round(
            recipe_elapsed,
            3,
        ),
        "초",
    )

    if recipe_response.status_code >= 400:
        print(
            recipe_response.text
        )
        raise SystemExit(1)

    recipe_items = validate_recipe_response(
        payload=(
            recipe_response.json()
        ),
        requested_items=(
            selected_items
        ),
    )

    print(
        "Diet → Recipe sources:",
        [
            item["recipe_source"]
            for item in recipe_items
        ],
    )

    tot_item = {
        "food_name": "톳나물_두부",
        "portion_g": 70.0,
        "calories_kcal": 55.0,
        "protein_g": 4.0,
        "fat_g": 2.0,
        "carbohydrate_g": 7.0,
    }
    tot_body = {
        "items": [
            tot_item
        ],
        "food_allergens": [],
        "disliked_foods": [],
    }

    with httpx.Client(
        timeout=180.0
    ) as client:
        tot_response = client.post(
            recipe_url,
            headers=headers,
            json=tot_body,
        )

    print(
        "톳나물 Recipe HTTP Status:",
        tot_response.status_code,
    )

    if tot_response.status_code >= 400:
        print(
            tot_response.text
        )
        raise SystemExit(1)

    tot_items = validate_recipe_response(
        payload=(
            tot_response.json()
        ),
        requested_items=[
            tot_item
        ],
    )
    validate_tot_scaling(
        tot_items[0]
    )

    print(
        "톳나물 official_similar/scaling: OK"
    )

    # =====================================================
    # 동일 요청 cache 재사용 및 운영 상태 확인
    # =====================================================

    with httpx.Client(
        timeout=30.0
    ) as client:
        cached_tot_response = client.post(
            recipe_url,
            headers=headers,
            json=tot_body,
        )

        recipe_health_response = client.get(
            BASE_URL
            + RECIPE_HEALTH_ENDPOINT
        )

    if cached_tot_response.status_code >= 400:
        print(cached_tot_response.text)
        raise SystemExit(1)

    cached_tot_items = validate_recipe_response(
        payload=cached_tot_response.json(),
        requested_items=[tot_item],
    )
    validate_tot_scaling(cached_tot_items[0])

    if recipe_health_response.status_code >= 400:
        print(recipe_health_response.text)
        raise SystemExit(1)

    recipe_health = recipe_health_response.json()
    pipeline_health = recipe_health.get(
        "recipe_pipeline",
        {},
    )
    cache_health = pipeline_health.get(
        "cache",
        {},
    )

    if cache_health.get("cache_hits", 0) < 1:
        raise RuntimeError(
            "동일 Recipe HTTP 요청이 cache를 사용하지 않았습니다."
        )

    if cache_health.get("cache_entries", 0) < 1:
        raise RuntimeError(
            "Recipe cache entry가 운영 상태에 반영되지 않았습니다."
        )

    print(
        "Recipe cache/health: OK",
        {
            "status": pipeline_health.get("status"),
            "cache_hits": cache_health.get("cache_hits"),
            "cache_entries": cache_health.get("cache_entries"),
        },
    )

    print()
    print(
        "=" * 80
    )
    print(
        "식단 추천 + 재추천 + Recipe HTTP E2E 테스트: OK"
    )


if __name__ == "__main__":
    main()

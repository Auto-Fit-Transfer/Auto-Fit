from collections import Counter

from app.services.diet_recommendation_service import (
    FIRST_DAY_GROUP,
    SECOND_DAY_GROUP,
    _build_fixed_partial_schedule,
    _calculate_feasible_family_limits,
    _candidate_family_signature,
)


def make_meal(
    name: str,
    primary: str,
    carb: str,
    side: str,
    score: float,
) -> dict:

    return {
        "menu_name": name,
        "final_score": score,
        "nutrition": {
            "calories_kcal": 500,
            "protein_g": 30,
            "fat_g": 15,
            "carbohydrate_g": 60,
        },
        "local_specialties": [],
        "items": [
            {
                "food_name": primary,
                "role": "main",
            },
            {
                "food_name": carb,
                "role": "carb",
            },
            {
                "food_name": side,
                "role": "side",
            },
        ],
    }


def make_snack(
    name: str,
) -> dict:

    return {
        "menu_name": name,
        "final_score": 70,
        "nutrition": {
            "calories_kcal": 120,
            "protein_g": 5,
            "fat_g": 3,
            "carbohydrate_g": 20,
        },
        "local_specialties": [],
        "items": [
            {
                "food_name": name,
                "role": "snack",
            }
        ],
    }


def main():

    primaries = [
        "황태구이",
        "닭고기냉채",
        "참치 샐러드",
        "임연수구이",
        "두부냉채",
        "홍합산적",
        "회덮밥_모듬",
        "샐러드_닭가슴살",
        "훈제오리",
        "해물 완자전",
        "샐러드_치킨콥 샐러드",
    ]

    carbs = [
        "현미밥",
        "혼합잡곡밥",
        "팥밥",
        "흑미밥",
    ]

    sides = [
        "톳나물_두부",
        "파래무침_액젓",
        "파무침",
        "시금치나물",
        "오이무침",
    ]

    meals = []

    # 모든 primary가 충분히 다양한 carb/side 조합을 가지도록 생성
    score = 100.0

    for p_index, primary in enumerate(
        primaries
    ):

        for variant in range(4):

            carb = carbs[
                (
                    p_index
                    + variant
                )
                % len(carbs)
            ]

            side = sides[
                (
                    p_index
                    + variant
                )
                % len(sides)
            ]

            meals.append(
                make_meal(
                    name=(
                        f"{primary} + {carb} + {side}"
                    ),
                    primary=primary,
                    carb=carb,
                    side=side,
                    score=score,
                )
            )

            score -= 0.25

    snacks = [
        make_snack(
            f"간식_{i}"
        )
        for i in range(
            1,
            8,
        )
    ]

    limits = (
        _calculate_feasible_family_limits(
            candidates=meals,
            total_meal_slots=21,
        )
    )

    print(
        "계산된 family limits:",
        limits,
    )

    used_menu_names = set()
    primary_counts = {}
    carb_counts = {}
    side_counts = {}

    (
        first,
        previous_primary,
    ) = (
        _build_fixed_partial_schedule(
            days=FIRST_DAY_GROUP,
            meal_candidates=meals,
            snack_candidates=snacks,
            used_menu_names=(
                used_menu_names
            ),
            primary_counts=(
                primary_counts
            ),
            carb_counts=(
                carb_counts
            ),
            side_counts=(
                side_counts
            ),
            max_primary_family_repeat=(
                limits[
                    "primary"
                ]
            ),
            max_carb_family_repeat=(
                limits[
                    "carb"
                ]
            ),
            max_side_family_repeat=(
                limits[
                    "side"
                ]
            ),
        )
    )

    (
        second,
        previous_primary,
    ) = (
        _build_fixed_partial_schedule(
            days=SECOND_DAY_GROUP,
            meal_candidates=meals,
            snack_candidates=snacks,
            used_menu_names=(
                used_menu_names
            ),
            primary_counts=(
                primary_counts
            ),
            carb_counts=(
                carb_counts
            ),
            side_counts=(
                side_counts
            ),
            previous_primary_family=(
                previous_primary
            ),
            max_primary_family_repeat=(
                limits[
                    "primary"
                ]
            ),
            max_carb_family_repeat=(
                limits[
                    "carb"
                ]
            ),
            max_side_family_repeat=(
                limits[
                    "side"
                ]
            ),
        )
    )

    combined = {
        **first,
        **second,
    }

    menu_names = []
    actual_primary = Counter()
    actual_carb = Counter()
    actual_side = Counter()

    for day, day_meals in (
        combined.items()
    ):

        print()
        print(day)

        day_primary = []

        for (
            meal_type,
            candidate
        ) in day_meals.items():

            print(
                meal_type,
                "->",
                candidate[
                    "menu_name"
                ],
            )

            menu_names.append(
                candidate[
                    "menu_name"
                ]
            )

            if meal_type == "snack":
                continue

            signature = (
                _candidate_family_signature(
                    candidate
                )
            )

            primary = str(
                signature[
                    "primary"
                ]
            )

            day_primary.append(
                primary
            )

            actual_primary[
                primary
            ] += 1

            for family in (
                signature[
                    "carbs"
                ]
            ):
                actual_carb[
                    family
                ] += 1

            for family in (
                signature[
                    "sides"
                ]
            ):
                actual_side[
                    family
                ] += 1

        if len(
            day_primary
        ) != len(
            set(
                day_primary
            )
        ):
            raise RuntimeError(
                f"{day}: 같은 primary family가 하루에 반복되었습니다."
            )

    if len(menu_names) != 28:
        raise RuntimeError(
            f"총 슬롯 수가 28이 아닙니다: {len(menu_names)}"
        )

    if len(set(menu_names)) != 28:
        raise RuntimeError(
            "menu_name 중복이 있습니다."
        )

    if max(
        actual_primary.values(),
        default=0,
    ) > limits["primary"]:
        raise RuntimeError(
            "primary family 반복 상한 초과"
        )

    if max(
        actual_carb.values(),
        default=0,
    ) > limits["carb"]:
        raise RuntimeError(
            "carb family 반복 상한 초과"
        )

    if max(
        actual_side.values(),
        default=0,
    ) > limits["side"]:
        raise RuntimeError(
            "side family 반복 상한 초과"
        )

    print()
    print("=" * 80)
    print(
        "primary family:",
        dict(actual_primary),
    )
    print(
        "carb family:",
        dict(actual_carb),
    )
    print(
        "side family:",
        dict(actual_side),
    )
    print(
        "주간 의미 다양성 스케줄 테스트: OK"
    )


if __name__ == "__main__":
    main()

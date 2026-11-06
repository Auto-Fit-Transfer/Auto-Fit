from app.services.diet_recommendation_service import (
    FIRST_DAY_GROUP,
    SECOND_DAY_GROUP,
    _build_fixed_partial_schedule,
)


def make_candidate(
    name: str,
    kcal: int,
) -> dict:

    return {
        "menu_name": name,
        "nutrition": {
            "calories_kcal": kcal,
            "protein_g": 30,
            "fat_g": 15,
            "carbohydrate_g": 60,
        },
        "local_specialties": [],
    }


def main():

    meal_candidates = [
        make_candidate(
            f"일반식_{index}",
            500 + index,
        )
        for index
        in range(
            1,
            22,
        )
    ]

    snack_candidates = [
        make_candidate(
            f"간식_{index}",
            100 + index,
        )
        for index
        in range(
            1,
            8,
        )
    ]

    first_meals = (
        meal_candidates[
            :12
        ]
    )

    second_meals = (
        meal_candidates[
            12:
        ]
    )

    first_snacks = (
        snack_candidates[
            :4
        ]
    )

    second_snacks = (
        snack_candidates[
            4:
        ]
    )

    (
        first,
        previous_primary_family,
    ) = (
        _build_fixed_partial_schedule(
            days=FIRST_DAY_GROUP,
            meal_candidates=(
                first_meals
            ),
            snack_candidates=(
                first_snacks
            ),
        )
    )

    (
        second,
        _,
    ) = (
        _build_fixed_partial_schedule(
            days=SECOND_DAY_GROUP,
            meal_candidates=(
                second_meals
            ),
            snack_candidates=(
                second_snacks
            ),
            previous_primary_family=(
                previous_primary_family
            ),
        )
    )

    combined = {
        **first,
        **second,
    }

    names = []

    for day, meals in (
        combined.items()
    ):

        print()
        print(day)

        for (
            meal_type,
            candidate
        ) in meals.items():

            name = (
                candidate[
                    "menu_name"
                ]
            )

            names.append(
                name
            )

            print(
                meal_type,
                "->",
                name,
            )

            if (
                meal_type
                == "snack"
                and not name.startswith(
                    "간식_"
                )
            ):
                raise RuntimeError(
                    "snack 슬롯에 일반식이 배치되었습니다."
                )

            if (
                meal_type
                != "snack"
                and not name.startswith(
                    "일반식_"
                )
            ):
                raise RuntimeError(
                    f"{meal_type} 슬롯에 간식이 배치되었습니다."
                )

    if len(
        names
    ) != 28:
        raise RuntimeError(
            f"총 슬롯 수가 28이 아닙니다: {len(names)}"
        )

    if len(
        set(
            names
        )
    ) != 28:
        raise RuntimeError(
            "고정 스케줄에 중복 메뉴가 있습니다."
        )

    print()
    print("=" * 80)
    print(
        "총 슬롯:",
        len(names),
    )
    print(
        "고유 메뉴:",
        len(
            set(
                names
            )
        ),
    )
    print(
        "고정 주간 스케줄 테스트: OK"
    )


if __name__ == "__main__":
    main()

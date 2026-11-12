from app.services.diet_recommendation_service import (
    FIRST_DAY_GROUP,
    SECOND_DAY_GROUP,
    _build_fixed_partial_schedule,
)


def make_candidate(
    *,
    menu_name: str,
    food_name: str,
    role: str,
    score: float,
) -> dict:
    return {
        "menu_name": menu_name,
        "final_score": score,
        "items": [
            {
                "food_name": food_name,
                "role": role,
            }
        ],
    }


def build_week(
    *,
    meals: list[dict],
    snacks: list[dict],
) -> dict[str, dict[str, dict]]:
    used_menu_names: set[str] = set()
    primary_counts: dict[str, int] = {}
    carb_counts: dict[str, int] = {}
    side_counts: dict[str, int] = {}

    first, previous_primary = _build_fixed_partial_schedule(
        days=FIRST_DAY_GROUP,
        meal_candidates=meals,
        snack_candidates=snacks,
        used_menu_names=used_menu_names,
        primary_counts=primary_counts,
        carb_counts=carb_counts,
        side_counts=side_counts,
    )
    second, _ = _build_fixed_partial_schedule(
        days=SECOND_DAY_GROUP,
        meal_candidates=meals,
        snack_candidates=snacks,
        used_menu_names=used_menu_names,
        primary_counts=primary_counts,
        carb_counts=carb_counts,
        side_counts=side_counts,
        previous_primary_family=previous_primary,
    )
    return {**first, **second}


def selected_menu_names(
    schedule: dict[str, dict[str, dict]],
) -> list[str]:
    return [
        meal["menu_name"]
        for day in schedule.values()
        for meal in day.values()
    ]


def test_weekly_schedule_keeps_unique_menus_when_pool_is_sufficient() -> None:
    meals = [
        make_candidate(
            menu_name=f"일반식_{index}",
            food_name=f"주식_{index}",
            role="main",
            score=100.0 - index,
        )
        for index in range(21)
    ]
    snacks = [
        make_candidate(
            menu_name=f"간식_{index}",
            food_name=f"간식_{index}",
            role="snack",
            score=80.0 - index,
        )
        for index in range(7)
    ]

    names = selected_menu_names(
        build_week(meals=meals, snacks=snacks)
    )

    assert len(names) == 28
    assert len(set(names)) == 28


def test_weekly_schedule_reuses_only_verified_candidates_when_pool_is_small(
) -> None:
    meals = [
        make_candidate(
            menu_name="검증 일반식 A",
            food_name="닭가슴살",
            role="main",
            score=100.0,
        ),
        make_candidate(
            menu_name="검증 일반식 B",
            food_name="두부",
            role="main",
            score=90.0,
        ),
    ]
    snacks = [
        make_candidate(
            menu_name="검증 간식",
            food_name="사과",
            role="snack",
            score=80.0,
        )
    ]

    schedule = build_week(meals=meals, snacks=snacks)
    names = selected_menu_names(schedule)
    allowed = {
        candidate["menu_name"]
        for candidate in [*meals, *snacks]
    }

    assert len(names) == 28
    assert set(names) <= allowed
    assert len(set(names)) == 3
    assert all(
        day["snack"]["menu_name"] == "검증 간식"
        for day in schedule.values()
    )

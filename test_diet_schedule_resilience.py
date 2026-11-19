from app.services.diet_recommendation_service import (
    FIRST_DAY_GROUP,
    MENU_STYLE_BALANCED,
    MENU_STYLE_EVERYDAY,
    MENU_STYLE_HEALTH_FOCUSED,
    SECOND_DAY_GROUP,
    WEEKLY_EVERYDAY_MAIN_MEAL_TARGET,
    WEEKLY_HEALTH_MAIN_MEAL_TARGET,
    _build_fixed_partial_schedule,
    _classify_meal_candidate_style,
    _prioritize_food_group_for_lifestyle,
)


def make_candidate(
    *,
    menu_name: str,
    food_name: str,
    role: str,
    score: float,
    menu_style: str = MENU_STYLE_EVERYDAY,
) -> dict:
    return {
        "menu_name": menu_name,
        "final_score": score,
        "menu_style": menu_style,
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
    menu_style_preference: str = MENU_STYLE_BALANCED,
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
        menu_style_preference=menu_style_preference,
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
        menu_style_preference=menu_style_preference,
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


def selected_main_meals(
    schedule: dict[str, dict[str, dict]],
) -> list[dict]:
    return [
        day[meal_type]
        for day in schedule.values()
        for meal_type in ("breakfast", "lunch", "dinner")
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


def test_weekly_schedule_targets_80_20_main_meal_distribution() -> None:
    everyday_meals = [
        make_candidate(
            menu_name=f"친숙한 일반식_{index}",
            food_name=f"일반식 주메뉴_{index}",
            role="main",
            score=100.0 - index,
            menu_style=MENU_STYLE_EVERYDAY,
        )
        for index in range(WEEKLY_EVERYDAY_MAIN_MEAL_TARGET)
    ]
    health_meals = [
        make_candidate(
            menu_name=f"건강식_{index}",
            food_name=f"건강식 주메뉴_{index}",
            role="main",
            score=95.0 - index,
            menu_style=MENU_STYLE_HEALTH_FOCUSED,
        )
        for index in range(WEEKLY_HEALTH_MAIN_MEAL_TARGET)
    ]
    snacks = [
        make_candidate(
            menu_name=f"안전 간식_{index}",
            food_name=f"과일_{index}",
            role="snack",
            score=80.0 - index,
        )
        for index in range(7)
    ]

    schedule = build_week(
        meals=[*everyday_meals, *health_meals],
        snacks=snacks,
    )
    main_meals = selected_main_meals(schedule)
    style_counts = {
        MENU_STYLE_EVERYDAY: sum(
            meal["menu_style"] == MENU_STYLE_EVERYDAY
            for meal in main_meals
        ),
        MENU_STYLE_HEALTH_FOCUSED: sum(
            meal["menu_style"] == MENU_STYLE_HEALTH_FOCUSED
            for meal in main_meals
        ),
    }

    assert len(main_meals) == 21
    assert style_counts == {
        MENU_STYLE_EVERYDAY: WEEKLY_EVERYDAY_MAIN_MEAL_TARGET,
        MENU_STYLE_HEALTH_FOCUSED: WEEKLY_HEALTH_MAIN_MEAL_TARGET,
    }
    assert sum(len(day) for day in schedule.values()) == 28
    assert all(
        day["snack"]["menu_name"].startswith("안전 간식_")
        for day in schedule.values()
    )


def test_weekly_schedule_relaxes_only_style_when_health_pool_is_short(
) -> None:
    everyday_meals = [
        make_candidate(
            menu_name=f"일반식_{index}",
            food_name=f"일반식 주메뉴_{index}",
            role="main",
            score=100.0 - index,
        )
        for index in range(20)
    ]
    health_meal = make_candidate(
        menu_name="유일한 건강식",
        food_name="닭가슴살 샐러드",
        role="main",
        score=99.0,
        menu_style=MENU_STYLE_HEALTH_FOCUSED,
    )
    snacks = [
        make_candidate(
            menu_name=f"간식_{index}",
            food_name=f"과일_{index}",
            role="snack",
            score=80.0 - index,
        )
        for index in range(7)
    ]

    schedule = build_week(
        meals=[*everyday_meals, health_meal],
        snacks=snacks,
    )
    main_meals = selected_main_meals(schedule)

    assert len(main_meals) == 21
    assert len({meal["menu_name"] for meal in main_meals}) == 21
    assert sum(
        meal["menu_style"] == MENU_STYLE_HEALTH_FOCUSED
        for meal in main_meals
    ) == 1


def test_explicit_everyday_style_keeps_all_main_meals_everyday() -> None:
    meals = [
        make_candidate(
            menu_name=f"일반식_{index}",
            food_name=f"일반식 주메뉴_{index}",
            role="main",
            score=100.0 - index,
            menu_style=MENU_STYLE_EVERYDAY,
        )
        for index in range(21)
    ] + [
        make_candidate(
            menu_name=f"건강식_{index}",
            food_name=f"건강식 주메뉴_{index}",
            role="main",
            score=200.0 - index,
            menu_style=MENU_STYLE_HEALTH_FOCUSED,
        )
        for index in range(4)
    ]
    snacks = [
        make_candidate(
            menu_name=f"간식_{index}",
            food_name=f"과일_{index}",
            role="snack",
            score=80.0 - index,
        )
        for index in range(7)
    ]

    schedule = build_week(
        meals=meals,
        snacks=snacks,
        menu_style_preference=MENU_STYLE_EVERYDAY,
    )

    assert all(
        meal["menu_style"] == MENU_STYLE_EVERYDAY
        for meal in selected_main_meals(schedule)
    )
    assert sum(len(day) for day in schedule.values()) == 28


def test_explicit_health_style_reuses_only_health_candidates() -> None:
    meals = [
        make_candidate(
            menu_name="건강식 A",
            food_name="닭가슴살 샐러드",
            role="main",
            score=100.0,
            menu_style=MENU_STYLE_HEALTH_FOCUSED,
        ),
        make_candidate(
            menu_name="건강식 B",
            food_name="두부면 샐러드",
            role="main",
            score=90.0,
            menu_style=MENU_STYLE_HEALTH_FOCUSED,
        ),
        make_candidate(
            menu_name="일반식 고득점",
            food_name="제육볶음",
            role="main",
            score=500.0,
            menu_style=MENU_STYLE_EVERYDAY,
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

    schedule = build_week(
        meals=meals,
        snacks=snacks,
        menu_style_preference=MENU_STYLE_HEALTH_FOCUSED,
    )
    main_meals = selected_main_meals(schedule)

    assert len(main_meals) == 21
    assert all(
        meal["menu_style"] == MENU_STYLE_HEALTH_FOCUSED
        for meal in main_meals
    )
    assert {
        meal["menu_name"]
        for meal in main_meals
    } <= {"건강식 A", "건강식 B"}


def test_explicit_style_does_not_fallback_to_opposite_style() -> None:
    meals = [
        make_candidate(
            menu_name="일반식만 있음",
            food_name="제육볶음",
            role="main",
            score=100.0,
            menu_style=MENU_STYLE_EVERYDAY,
        )
    ]
    snacks = [
        make_candidate(
            menu_name="검증 간식",
            food_name="사과",
            role="snack",
            score=80.0,
        )
    ]

    try:
        build_week(
            meals=meals,
            snacks=snacks,
            menu_style_preference=MENU_STYLE_HEALTH_FOCUSED,
        )
    except RuntimeError as exc:
        assert "health_focused" in str(exc)
    else:
        raise AssertionError("반대 스타일 후보로 조용히 fallback했습니다.")


def test_candidate_style_and_everyday_priority_are_deterministic() -> None:
    health_candidate = {
        "pattern": "protein_side_carb_side",
        "items": [{"food_name": "닭가슴살 샐러드"}],
    }
    everyday_candidate = {
        "pattern": "main_carb_side",
        "items": [
            {"food_name": "제육볶음"},
            {"food_name": "쌀밥"},
            {"food_name": "배추김치"},
        ],
    }

    assert (
        _classify_meal_candidate_style(health_candidate)
        == MENU_STYLE_HEALTH_FOCUSED
    )
    assert (
        _classify_meal_candidate_style(everyday_candidate)
        == MENU_STYLE_EVERYDAY
    )

    reordered = _prioritize_food_group_for_lifestyle(
        role="main",
        foods=[
            {"food_name": "황태구이"},
            {"food_name": "임연수구이"},
            {"food_name": "제육볶음_채소"},
            {"food_name": "제육볶음"},
            {"food_name": "소불고기"},
        ],
    )

    assert reordered[0]["food_name"] == "제육볶음"
    assert reordered[1]["food_name"] == "소불고기"

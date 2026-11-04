"""Unit tests isolate the new external quota dependency; live scripts do not use this."""
import pytest
from backend.app import main


@pytest.fixture(autouse=True)
def isolate_chat_quota(monkeypatch):
    # Unit tests must not contact a paid model even if the shell enables it.
    monkeypatch.setenv("CHAT_AI_ENABLED", "false")
    monkeypatch.setenv("AI_SERVER_ENABLED", "false")
    monkeypatch.setenv("FOOD_IMAGE_ENABLED", "false")
    monkeypatch.setenv(
        "FOOD_IMAGE_URL",
        "https://lee-com.tailb6e4ed.ts.net/generate-food-image",
    )
    monkeypatch.setenv("FOOD_IMAGE_FORMAT", "webp")
    class UnlimitedTestQuota:
        async def check(self, bucket):
            pass
    previous = main.app.dependency_overrides.get(main.get_chat_limiter)
    main.app.dependency_overrides[main.get_chat_limiter] = lambda: UnlimitedTestQuota()
    previous_analysis = main.app.dependency_overrides.get(main.get_exercise_analysis_limiter)
    main.app.dependency_overrides[main.get_exercise_analysis_limiter] = lambda: UnlimitedTestQuota()
    previous_generation = main.app.dependency_overrides.get(main.get_exercise_generation_limiter)
    main.app.dependency_overrides[main.get_exercise_generation_limiter] = lambda: UnlimitedTestQuota()
    yield
    if previous is None:
        main.app.dependency_overrides.pop(main.get_chat_limiter, None)
    else:
        main.app.dependency_overrides[main.get_chat_limiter] = previous
    if previous_analysis is None:
        main.app.dependency_overrides.pop(main.get_exercise_analysis_limiter, None)
    else:
        main.app.dependency_overrides[main.get_exercise_analysis_limiter] = previous_analysis
    if previous_generation is None:
        main.app.dependency_overrides.pop(main.get_exercise_generation_limiter, None)
    else:
        main.app.dependency_overrides[main.get_exercise_generation_limiter] = previous_generation

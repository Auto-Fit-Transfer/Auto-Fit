import json
from pathlib import Path

from app.schemas.recommendation import DietRecipeResponse


ROOT = Path(__file__).resolve().parent
EXAMPLES_PATH = ROOT / "docs" / "recipe_api_contract_examples.json"


def main() -> None:
    examples = json.loads(
        EXAMPLES_PATH.read_text(encoding="utf-8")
    )

    expected_names = {
        "official_exact",
        "official_similar",
        "llm_generated",
        "restriction_conflict",
        "unavailable",
    }

    if set(examples) != expected_names:
        raise RuntimeError(
            "Recipe 계약 예시 종류가 올바르지 않습니다."
        )

    for name, payload in examples.items():
        response = DietRecipeResponse.model_validate(payload)
        if not response.meal.items:
            raise RuntimeError(
                f"{name}: Recipe 결과 item이 없습니다."
            )

    print("Recipe API contract examples: OK")


if __name__ == "__main__":
    main()

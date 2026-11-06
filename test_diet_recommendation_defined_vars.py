from pathlib import Path
import ast

TARGET = Path("app/services/diet_recommendation_service.py")

text = TARGET.read_text(encoding="utf-8")
tree = ast.parse(text)

required = {
    "food_allergens",
    "goal_type",
    "additional_input",
    "current_ingredients",
}

found = set()

for node in ast.walk(tree):
    if isinstance(node, (ast.Assign, ast.AnnAssign)):
        targets = []
        if isinstance(node, ast.Assign):
            targets = node.targets
        else:
            targets = [node.target]

        for target in targets:
            if isinstance(target, ast.Name):
                if target.id in required:
                    found.add(target.id)

missing = sorted(required - found)

print("문법 검사: OK")
print("정의된 변수:", sorted(found))
print("누락 변수:", missing)

if missing:
    raise SystemExit(
        f"generate_replacement_meal 관련 변수 누락: {missing}"
    )

print("재추천 변수 정의 테스트: OK")

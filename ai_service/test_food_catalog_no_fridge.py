from pathlib import Path
import ast

TARGET = Path("app/services/food_catalog_service.py")

text = TARGET.read_text(encoding="utf-8")

# 1. Python 문법 검사
ast.parse(text)

# 2. 냉장고 관련 코드 완전 제거 확인
forbidden = [
    "refrigerator_ingredients",
    "refrigerator_score",
    "refrigerator_matches",
    "get_refrigerator_matches",
    "calculate_refrigerator_score",
]

found = [item for item in forbidden if item in text]

print("문법 검사: OK")
print("냉장고 관련 잔여 코드:", found)

if found:
    raise SystemExit("냉장고 관련 코드가 아직 남아 있습니다.")

# 3. 새 점수식 존재 확인
required_score_parts = [
    "nutrition_score * 0.65",
    "health_score * 0.275",
    "local_specialty_score * 0.075",
]

missing = [
    item
    for item in required_score_parts
    if item not in text
]

print("새 점수식 누락:", missing)

if missing:
    raise SystemExit("새 점수식이 정상 반영되지 않았습니다.")

print("food_catalog_service 냉장고 제거 테스트: OK")

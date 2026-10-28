from pathlib import Path
import py_compile

TARGET = Path("app/services/diet_recommendation_service.py")

# 1) 문법 검사
py_compile.compile(str(TARGET), doraise=True)

# 2) 냉장고 관련 런타임 코드가 남아있는지 확인
text = TARGET.read_text(encoding="utf-8")

forbidden_tokens = [
    "request.refrigerator_ingredients",
    "_normalize_refrigerator_ingredients(",
    "_build_refrigerator_instruction(",
    "_build_replace_refrigerator_instruction(",
    "_validate_weekly_plan_ingredients(",
    "_filter_used_refrigerator_ingredients(",
]

found = [token for token in forbidden_tokens if token in text]

print("문법 검사: OK")
print("냉장고 런타임 참조:", found)

if found:
    raise SystemExit("냉장고 관련 코드가 아직 남아 있습니다.")

print("냉장고 제거 테스트: OK")

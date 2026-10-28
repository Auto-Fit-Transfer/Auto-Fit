from pathlib import Path

TARGET = Path(
    "app/services/diet_recommendation_service.py"
)

text = TARGET.read_text(
    encoding="utf-8"
)

print(
    "minimal 남음:",
    '"effort": "minimal"' in text,
)

print(
    "low 개수:",
    text.count(
        '"effort": "low"'
    ),
)

if '"effort": "minimal"' in text:
    raise SystemExit(
        "reasoning effort=minimal 이 아직 남아 있습니다."
    )

if '"effort": "low"' not in text:
    raise SystemExit(
        "reasoning effort=low 가 없습니다."
    )

print(
    "reasoning effort 테스트: OK"
)

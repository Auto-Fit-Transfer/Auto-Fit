# 일일 식단 구조화 AI 계약 제안

작성일: 2026-11-03
상태: **협의안 — AI Server에 구현된 계약이 아님**

## 결정과 범위

일일 식단 생성·자정 자동 갱신·일일 한 끼 재추천은 유지한다. 주간 식단의 7일 28끼
계약과 저장소는 그대로 둔다. 일일 기능의 `/chat` 생성 호출을 제거하려면 AI Server에
별도 구조화 계약이 필요하다. 현재 `ai` 브랜치의 추천 router에는 주간 생성
`/recommend/diet`, 주간 한 끼 교체 `/recommend/diet/replace-meal`, Recipe만 있다.
`/health-analysis/diet-refresh`는 건강 분석의 식단 제안 영역을 갱신하는 경로이며
일일 4끼 생성 계약이 아니다.

## 제안할 서버 간 경로

| 용도 | 제안 경로 | 결과 |
|---|---|---|
| 특정 KST 날짜의 4끼 생성 | `POST /recommend/diet/daily` | 날짜와 정확히 4끼 |
| 그 날짜의 한 끼 교체 | `POST /recommend/diet/daily/replace-meal` | 날짜·끼니가 표시된 Meal 1개 |

경로 이름은 AI Server 담당자와 확정한다. 기존 `/chat`과 주간 endpoint의 응답 의미는
바꾸지 않는다. Backend만 서버 전용 Bearer 키로 호출한다.

## 생성 요청 제안

```json
{
  "target_date": "2026-11-03",
  "timezone": "Asia/Seoul",
  "metric_statuses": {"bmi": "high"},
  "food_allergens": ["땅콩"],
  "disliked_foods": ["가지"],
  "goal_type": "weight_loss",
  "additional_input": null,
  "sido": null,
  "sigungu": null,
  "nearby_regions": [],
  "meal_targets": null,
  "excluded_menu_names": []
}
```

`target_date`는 KST 달력 날짜다. `metric_statuses`는 저장된 건강 평가에서 검증된
판정만 보낸다. 알레르기와 기피 음식은 분리한다. `meal_targets`는 합의 전까지 `null`이며
현재 규칙 기반 식단의 고정 열량 400/480/480/290 kcal를 사용자별 영양 목표로
가장해 보내지 않는다. AI Server가 목표를 필요로 한다면, 계산 주체·네 영양소 값·
끼니별 적용 방식을 함께 확정한다. 사용자 ID, 이름, 연락처, 이메일, GPS 좌표는 보내지 않는다.
현재 일일 공개 API body는 `{}`이고 전역 기피 음식·지역 설정도 없다. 해당 값은
별도 저장 또는 요청 계약이 마련되기 전에는 `[]`/`null`로 보내며 실제 선호라고
주장하지 않는다.

## 생성 응답 제안

아래 음식명과 수치는 계약 형식 설명용 합성값이며 공식 Food DB 결과가 아니다.

```json
{
  "ok": true,
  "generator": "auto-fit-ai",
  "result": {
    "date": "2026-11-03",
    "summary": "예시 설명",
    "strategy": "예시 원칙",
    "meals": {
      "breakfast": {
        "menu_name": "현미밥과 두부",
        "menu_description": "예시 설명",
        "estimated_calories_kcal": 400.0,
        "nutrition": {"carbohydrate_g": 50.0, "protein_g": 25.0, "fat_g": 12.0},
        "items": [
          {"food_name": "현미밥", "portion_g": 100.0, "calories_kcal": 165.0,
           "carbohydrate_g": 35.0, "protein_g": 3.0, "fat_g": 1.0},
          {"food_name": "닭가슴살", "portion_g": 100.0, "calories_kcal": 165.0,
           "carbohydrate_g": 0.0, "protein_g": 22.0, "fat_g": 5.0},
          {"food_name": "채소무침", "portion_g": 100.0, "calories_kcal": 70.0,
           "carbohydrate_g": 15.0, "protein_g": 0.0, "fat_g": 6.0}
        ],
        "guidance": "예시 안내"
      },
      "lunch": {},
      "dinner": {},
      "snack": {}
    }
  }
}
```

`lunch/dinner/snack`의 `{}`는 문서 길이를 줄인 자리표시자다. 실제 응답에서는 네 끼가
모두 `breakfast`와 같은 Meal 구조이며 각 `items`에 최소 한 음식이 있어야 한다.
Food item은 주간 API와 같은 공식 Food DB 기반 표준 필드를 사용한다. 모든 수치는 유한해야
하며 `portion_g > 0`, 열량·탄단지는 0 이상이다. 요일을 추론하지 않고 응답 `date`가
요청 `target_date`와 일치하는지 검사한다. 메뉴명 중복 정책은 주간 계약과 맞춘다.

## 한 끼 교체 요청·응답 제안

생성 요청의 사용자 조건에 `target_meal`, `current_menu_name`, `excluded_menu_names`,
`current_ingredients`, 필요한 경우 해당 끼니의 `meal_target`을 추가한다. 제외 목록에는
현재 메뉴와 이미 사용한 일일 메뉴를 넣는다. `current_ingredients`는 저장된 명시적 재료명만
사용하고 음식 item 이름으로 조리 재료를 추정하지 않는다.

응답은 `{ok, generator, meal: {date, meal_type, meal}}`로 한다. Backend는 응답 날짜와
끼니를 확인하고 해당 일일 `diet_meal_id`의 한 슬롯만 transaction으로 교체한다. 다른
세 끼와 기존 식사 기록은 보존한다. 현재 일일 RPC의 **기존 대표 음식 변경** 및
**기존 한 끼 열량 대비 ±15%** 제약을 유지할지 AI Server와 함께 확정해야 한다.

## Backend 저장 변경 필요 범위

현재 `diet_meals`에는 `menu_name`, `menu_description`, `nutrition`, `guidance` 칸이 없다.
`diet_meal_foods`에는 음식별 수치를 저장하지만 숫자 컬럼이 소수 둘째 자리로 제한된다.
따라서 원본 Meal과 `items`의 정확도를 보존할 수 있는 JSONB snapshot을 `diet_meals`에
추가하고, 기존 화면·섭취 기록을 위한 `diet_meal_foods` 행도 같은 transaction에서
기록하는 방안을 제안한다. `portion_g → quantity`, `unit="g"`,
`calories_kcal → calories`, `carbohydrate_g → carbohydrates`는 호환 표시용 매핑이며
원본 snapshot을 대체하지 않는다. Food DB 이름과 Backend 카탈로그 이름이 다르다는
이유로 item을 임의 음식으로 바꾸지 않는다.

기존 일일 `create_diet_recommendation` 및 `replace_diet_meal` RPC, 조회 DTO, 자동 갱신
작업에서 snapshot의 생성·교체·조회 일관성을 함께 바꿔야 한다. 기존 일일 식사 기록과
이미 저장된 추천은 읽을 수 있어야 한다.

## 오류·재시도·검증

- AI 200이어도 Schema, 날짜·끼니, 음식 item, 알레르기·기피 음식, 중복 메뉴를 Backend에서 검사한다.
- 저장 전 실패는 원인별 Backend 코드로 반환하고 DB를 변경하지 않는다.
- AI 401/422 또는 동일 입력의 Schema·안전성 실패는 자동 재시도하지 않는다.
- timeout, 502/503 등 일시 오류만 제한적으로 재시도할 수 있다. 재시도 횟수와
  멱등 키 지원 여부는 합의한다.
- 운영 로그는 endpoint·오류 코드·단계·시간만 기록한다. 요청·응답 원문, 음식명,
  사용자 식별자, API Key는 기록하지 않는다.

## 합의가 필요한 항목

1. 두 경로 이름, 요청·응답 DTO와 `meal_targets`의 계산 주체·형식.
2. 일일 재추천에서 기존 열량 ±15%·대표 음식 변경 제약을 유지할지.
3. 일일 자동 갱신 시 이미 저장된 추천의 재생성·중복 요청·멱등 처리.
4. AI Server의 공식 Food DB item 식별자가 안정적으로 제공되는지. 없다면
   이름을 임의 매칭하지 않고 원본 이름과 수치를 보존한다.
5. 합성 fixture와 배포 AI Server의 계약 테스트. 이후 기존 88건 조건의
   endpoint 건수, 실패 분류, 최종 저장 성공, 평균·최대 응답 시간을 비교한다.

이 합의가 끝나기 전에는 기존 일일 기능을 중단하거나 `/chat` 응답 형식을 식단용으로
변경하지 않는다.

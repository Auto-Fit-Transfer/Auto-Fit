# Auto-Fit 내일 네 끼 변경안 Backend 연동 계약

- 작성일: 2026-11-19
- AI Server endpoint: `POST /recommend/diet/replace-day`
- 정책 버전: `gentle_rebalance_v1`
- 기준 Schema: 배포 AI Server의 `GET /openapi.json`

## 1. 결론

이 API는 내일 식단의 일부가 아니라 `breakfast`, `lunch`, `dinner`, `snack`
네 끼를 모두 새로 생성한다. AI Server는 변경안만 반환하며 DB를 수정하지
않는다. Backend는 사용자 확인 후 네 슬롯을 한 transaction으로 저장해야 한다.

오늘의 초과 열량을 내일에서 그대로 빼지 않는다. 기존 영양 목표를 유지하면서
목표의 약 85~100% 열량 후보를 우선하고, 알레르기·기피 음식·공식 Food DB
검증과 단백질 안전성을 우선한다.

이 문서의 API는 네 끼 전체 교체 전용이다. 사용자가 내일의 일부 끼니만 직접
고르는 화면은 각 슬롯을 `/recommend/diet/replace-meal`의 선택형
`gentle_rebalance_v1` 계약으로 미리보기하고, 사용자 승인 후 Backend가 선택
슬롯 전체를 원자적으로 저장한다. 이 API의 85~100%는 네 끼 고유 후보가
부족할 때 fallback을 허용하는 soft priority이고, 선택형 한 끼 API는 범위 밖
fallback을 금지하는 strict range다.

## 2. AI Server 요청

```http
POST /recommend/diet/replace-day
Authorization: Bearer <server-to-server-api-key>
Content-Type: application/json
```

```json
{
  "target_date": "2026-11-20",
  "target_day": "friday",
  "replacement_scope": "all_four_meals",
  "adjustment_reason": "over_target_intake",
  "today_nutrition": {
    "target": {
      "calories_kcal": 2000,
      "carbohydrate_g": 250,
      "protein_g": 100,
      "fat_g": 60
    },
    "actual": {
      "calories_kcal": 2300,
      "carbohydrate_g": 280,
      "protein_g": 110,
      "fat_g": 75
    }
  },
  "current_menu_names": {
    "breakfast": "기존 아침",
    "lunch": "기존 점심",
    "dinner": "기존 저녁",
    "snack": "기존 간식"
  },
  "excluded_menu_names": ["주간 중복 방지 메뉴"],
  "metric_statuses": {},
  "food_allergens": ["계란"],
  "disliked_foods": ["버섯"],
  "health_goal": {
    "goal_type": "maintenance",
    "goal_text": null
  },
  "meal_target": null,
  "nutrition_profile": {
    "profile_mode": "basic_profile",
    "age_years": 34,
    "sex": "male",
    "height_cm": 175,
    "weight_kg": 75,
    "data_sources": {
      "inbody_available": false,
      "health_checkup_available": false
    }
  },
  "reference_standard": "KDRI_2025",
  "menu_style_preference": "everyday",
  "sido": "서울특별시",
  "sigungu": "성동구",
  "nearby_regions": []
}
```

필수 검증:

- Backend는 사용자 시간대 기준 `target_date`가 실제 다음 날인지 먼저 검증한다.
  현재 앱 정책은 `Asia/Seoul` 기준이다. AI Server는 사용자 시간대를 보유하지
  않으므로 날짜와 `target_day` 요일 일치만 검증한다.
- `target_date`의 실제 요일과 `target_day`가 같아야 한다.
- `today_nutrition.actual`은 목표 네 항목 중 하나 이상을 초과해야 한다.
- `current_menu_names`에는 네 끼 메뉴명이 모두 있어야 한다.
- 알레르기와 기피 음식은 현재 사용자 최신값을 보낸다.
- 최초 식단 생성 당시의 `nutrition_profile`, `reference_standard`,
  `menu_style_preference`, `meal_target`, `health_goal` snapshot을 유지한다.

## 3. AI Server 응답

```json
{
  "ok": true,
  "generator": "auto-fit-ai",
  "result": {
    "target_date": "2026-11-20",
    "target_day": "friday",
    "replacement_scope": "all_four_meals",
    "adjustment_reason": "over_target_intake",
    "adjustment_policy": "gentle_rebalance_v1",
    "replaced_meal_types": [
      "breakfast",
      "lunch",
      "dinner",
      "snack"
    ],
    "day_plan": {
      "day": "friday",
      "meals": {
        "breakfast": {
          "menu_name": "새 아침",
          "menu_description": "...",
          "image_prompt": null,
          "estimated_calories_kcal": 450,
          "nutrition": {
            "carbohydrate_g": 50,
            "protein_g": 28,
            "fat_g": 13
          },
          "items": [
            {
              "food_name": "현미밥",
              "portion_g": 120,
              "calories_kcal": 198,
              "carbohydrate_g": 42,
              "protein_g": 4,
              "fat_g": 1.2,
              "food_code": "optional",
              "data_code": "optional",
              "source_name": "optional"
            }
          ],
          "ingredients": null,
          "guidance": "..."
        },
        "lunch": {},
        "dinner": {},
        "snack": {}
      }
    },
    "daily_nutrition": {
      "calories_kcal": 1600,
      "carbohydrate_g": 200,
      "protein_g": 100,
      "fat_g": 48
    },
    "cautions": [],
    "sources": []
  }
}
```

위 JSON의 빈 Meal 객체는 문서 축약 표현이다. 실제 응답에서는 네 Meal 모두
완전한 동일 구조를 가진다. Backend는 다음을 저장해야 한다.

- 각 Meal의 메뉴명·설명·guidance
- 메뉴 전체 `estimated_calories_kcal`과 `nutrition`
- 모든 `items`의 이름·중량·열량·탄단지
- 존재하는 경우 공식 DB 식별자 `food_code`, `data_code`, `source_name`
- 하루 합계 `daily_nutrition`
- 적용 정책과 생성 시각

레시피는 변경안 생성에 포함되지 않는다. 상세 화면 진입 시 기존
`POST /recommend/diet/recipe`에 선택 Meal의 `items`를 전달한다.

## 4. 최신 Backend에서 필요한 수정

최신 `origin/back-end` 비교 기준으로 현재는 주간 전체 생성과 한 끼 교체만
있다. 다음 작업이 필요하다.

1. AI endpoint registry에 `/recommend/diet/replace-day` 추가
2. AI 요청 DTO에 이 문서의 필드와 기존 KDRI·메뉴 스타일 필드 추가
3. Backend 공개 API에 내일 네 끼 변경안 생성/확인 흐름 추가
4. 현재 식단 version 또는 `expected_version`으로 동시 수정 충돌 방지
5. 응답 날짜·요일·네 Meal 존재·메뉴 중복·알레르기 재검증
6. 사용자 확인 전에는 변경안을 임시 상태로 유지
7. 확인 시 하루 네 슬롯을 원자적으로 교체하는
   `replace_weekly_diet_day` 형태의 transaction/RPC 추가
8. 한 슬롯이라도 실패하면 전체 rollback

한 끼만 바꾸는 기존 API와 RPC는 그대로 유지한다. 하루 변경을 네 번의
한 끼 교체 호출로 구현하면 중간 실패 시 일부만 바뀔 수 있으므로 사용하지
않는다.

## 5. Frontend 흐름

1. 사용자가 `내일 맞추기`를 선택한다.
2. Backend가 오늘 목표/실제 섭취량과 현재 내일 식단으로 변경안을 생성한다.
3. Frontend는 네 끼 변경안과 하루 영양 합계를 미리 보여 준다.
4. 사용자가 확인하면 Backend 저장 API를 호출한다.
5. 취소하면 기존 식단을 유지한다.

Frontend는 AI Server를 직접 호출하지 않는다.

## 6. 오류 처리

- `401`: 서버 간 인증 설정 확인
- `422`: 날짜/요일, 영양값, 프로필 또는 필수 메뉴명 오류
- `503`: 안전한 새 후보 부족 또는 AI 관련 일시 장애
- `500`: 예상하지 못한 AI Server 내부 오류
- Backend 저장 충돌: 최신 식단을 다시 조회하고 변경안을 재생성

AI Server가 `503`을 반환하면 기존 내일 식단은 그대로 유지한다. 세 끼만
저장하거나 기존 메뉴와 섞어 정상 결과처럼 처리하지 않는다.

## 7. 필수 통합 테스트

- 날짜와 요일 일치/불일치
- Backend의 `Asia/Seoul` 기준 실제 내일 날짜 검증
- 네 끼가 모두 완전한 Meal 구조인지 확인
- 네 끼가 기존 네 메뉴 및 제외 메뉴와 다른지 확인
- 새 네 메뉴끼리 중복되지 않는지 확인
- Food item 상세값과 공식 DB 식별자 보존
- 네 끼 합계와 `daily_nutrition` 일치
- 알레르기·기피 음식 재검증
- `balanced`, `everyday`, `health_focused` 유지
- 명시 `meal_target` 우선, 없으면 KDRI 목표 사용
- 사용자 승인 전 DB 미변경
- 승인 후 네 슬롯 원자적 교체
- version 충돌 시 전체 rollback
- Recipe API가 변경된 Meal의 `items`를 그대로 받는지 확인

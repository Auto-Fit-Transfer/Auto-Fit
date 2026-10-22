# Auto-Fit Backend AI Server Integration Specification

이 문서는 Auto-Fit Backend가 AI Server를 연결할 때 필요한 입력 데이터, AI Server 응답, 저장 책임과 연동 순서를 정의한다. 현재 코드에 구현된 Router와 Pydantic Schema를 기준으로 작성했으며, Backend API 명세를 받으면 필드 매핑과 최종 endpoint를 함께 확정한다.

## 가장 먼저 합의할 사항

Backend 담당자는 아래 항목을 먼저 제공해야 한다.

| 구분 | Backend에서 제공할 내용 | AI Server에서 필요한 이유 |
|---|---|---|
| 인증 | 서버 간 인증 헤더 구성 방식 | 모든 운영 후보 API의 Bearer 인증 검증 |
| 사용자 식별 | Backend 내부 사용자 ID와 요청 추적 ID 처리 방식 | 사용자별 상태와 응답 저장 대상을 Backend에서 구분 |
| 건강 데이터 | 체성분·건강검진 DTO와 단위 | 건강 상태 분류와 개인화 |
| 식단 저장 | 주간 식단, Meal, Food item DTO | 추천 결과 저장과 재추천 시 현재 상태 전달 |
| 대화 상태 | history와 pending action 저장 위치 | 식단 변경 확인·취소 상태 유지 |
| 오류 형식 | Backend 공통 오류 응답과 재시도 정책 | AI Server 오류를 Frontend 형식으로 변환 |
| 날짜 규칙 | 요일, 날짜, timezone 표현 | 식단 슬롯을 정확하게 식별 |

AI Server는 사용자 DB에 직접 접근하지 않는다. Backend가 사용자별 최신 데이터를 요청에 포함하고, AI Server가 반환한 구조화 결과를 검증한 후 Backend가 저장한다.

## 공통 연결 규칙

### 기본 요청

운영 후보 endpoint는 다음 헤더를 사용한다.

```http
Authorization: Bearer <AI_SERVER_API_KEY>
Content-Type: application/json
```

`POST /food-analysis/analyze`만 이미지 파일 전송을 위해 `multipart/form-data`를 사용한다. 나머지 현재 운영 후보 endpoint는 JSON을 사용한다.

`AI_SERVER_API_KEY`는 Frontend에 전달하지 않고 Backend와 AI Server 환경변수에만 보관한다. Frontend가 AI Server를 직접 호출하지 않는다.

### 사용자와 요청 식별

- `/health-analysis`는 `request_id`를 필수로 받는다.
- Chat, Diet, Recipe 요청 대부분은 현재 AI Schema에 `user_id`가 없다.
- 따라서 Backend가 인증된 사용자와 AI 요청의 관계를 관리하고, 다른 사용자의 `history`, `context`, `pending_action`, 식단을 섞지 않아야 한다.
- 주민등록번호, 전화번호, 이메일, 이름 등 분석에 필요하지 않은 개인정보는 AI Server로 전달하지 않는다.

### 공통 HTTP 처리

| HTTP 상태 | 의미 | Backend 처리 |
|---|---|---|
| `200` | 정상 응답 또는 endpoint가 정의한 안전한 fallback | 응답 Schema와 상태 필드 검증 후 사용 |
| `401` | 인증 누락 또는 API Key 불일치 | 자동 재시도하지 않고 서버 설정 확인 |
| `422` | 요청 Schema 또는 서비스 입력 검증 실패 | 필드 매핑과 값 범위를 수정 |
| `404` | 요청한 공식 러닝 코스를 찾을 수 없음 | 코스 목록을 새로 조회하고 선택 상태 갱신 |
| `502` | Kakao, 공공데이터 또는 이미지 분석 제공자 응답 실패 | 짧은 backoff 후 제한적으로 재시도 |
| `500` | AI Server 내부 오류 | 제한적으로 재시도하고 로그 확인 |
| `503` | OpenAI 또는 관련 서비스 일시 장애 | 짧은 backoff 후 제한적으로 재시도하거나 사용자에게 지연 안내 |

생성 endpoint의 재시도는 동일 결과를 보장하지 않는다. Backend는 응답 저장 전에 대상 사용자와 식단 슬롯을 다시 검증해야 한다.

## Endpoint 빠른 참조

| 우선순위 | Endpoint | Backend가 보내는 핵심 데이터 | AI Server가 반환하는 핵심 데이터 | 저장 주체 |
|---|---|---|---|---|
| 1 | `POST /recommend/diet` | 건강 상태, 알레르기, 기피 음식, 목표, 지역, 한 끼 영양 목표 | 7일 식단과 Food DB 기반 음식 item | Backend |
| 1 | `POST /recommend/diet/replace-meal` | 현재 식단 슬롯, 제외 메뉴, 사용자 조건 | 교체할 Meal 하나 | Backend |
| 1 | `POST /recommend/diet/recipe` | 선택한 Meal의 `items`, 알레르기, 기피 음식 | 음식별 공식 또는 LLM 레시피 | 필요 시 Backend cache |
| 1 | `POST /food-analysis/analyze` | 스마트폰 음식 이미지 파일 | 음식 후보·예상 중량·공식 DB 영양정보 | 확인 전 임시 결과 |
| 1 | `POST /food-analysis/recalculate` | 사용자가 확인·수정한 음식명과 중량 | 공식 DB로 재계산한 영양정보 | Backend 최종 저장 |
| 1 | `POST /chat/orchestrate` | 메시지, 대화 이력, 최신 사용자 context, pending action | 답변, action 상태, 저장 후보 데이터 | Backend |
| 2 | `POST /health-analysis` | 건강검진, 체성분, 목표, 냉장고 context | 종합 분석과 냉장고 맞춤 제안 | Backend |
| 2 | `POST /health-analysis/diet-refresh` | 기존 건강 입력과 최신 냉장고 context | 식단 제안 영역만 갱신 | Backend |
| 2 | `POST /recommend/exercise` | 건강 상태와 운동 선호 | AI 기반 운동 추천 | Backend |
| 2 | `GET /running/places/search` | 주소·장소명, 선택적 중심 좌표·반경 | 출발지 후보와 WGS84 좌표 | 저장하지 않음 |
| 2 | `GET /running/courses/recommend` | 지역 또는 GPS, 거리 옵션, 사용자 페이스 | 공식 코스 후보와 거리·근접도·검증 상태 | Backend 선택 저장 |
| 2 | `GET /running/courses/{course_id}` | 공식 코스 ID, 사용자 페이스 | 코스 상세와 출발·도착 위치 | Backend 선택 저장 |
| 2 | `POST /running/routes/preview` | 출발·도착·경유지 좌표, 사용자 페이스 | Kakao 실경로 거리·시간·Polyline | 저장 선택 |
| 2 | `POST /running/routes/generate-loop` | 출발 좌표, 거리 옵션, 페이스, 후보 수, seed | Kakao 기반 순환 코스 후보와 실제 거리·오차·Polyline | Backend 선택 저장 |
| 호환 | `POST /chat` | 기존 `question`, `user_info`, `chat_history` | 일반 답변과 model 이름 | Backend 선택 |

`POST /chat/intent-test`, `POST /analysis/debug-inputs`, RAG debug endpoint는 개발용이며 Backend 운영 기능에서 호출하지 않는다.

음식 사진 분석의 multipart 요청, 사용자 확인 흐름과 Backend 협의 대기 항목은 `food_image_backend_contract.md`를 따른다. OCR은 Backend 범위이며 AI Server는 업로드 이미지를 영구 저장하지 않는다.

## Backend가 AI Server에 제공할 데이터

### 건강 상태

| Field | 형식 | 설명 |
|---|---|---|
| `metric_statuses` | `object<string, string>` | Backend 또는 Rule Engine이 준비한 건강 지표 상태 |
| `goal_type` | `string \| null` | 체중 감량, 근육 증가 등 사용자 목표 |
| `additional_input` | `string \| string[] \| null` | 개인화에 필요한 추가 조건 |

`metric_statuses`에는 실제 입력으로 판정한 값만 포함한다. 제공하지 않은 건강 수치나 질환을 추정해 보내지 않는다.

### 식품 제한

| Field | 형식 | 처리 기준 |
|---|---|---|
| `food_allergens` | `string[]` | 안전성 우선 제외 조건 |
| `disliked_foods` | `string[]` | 사용자 선호 기반 제외 조건 |

두 목록을 합치지 않는다. Recipe와 재추천 요청에서도 최신 값을 다시 전달한다.

### 지역과 영양 목표

```json
{
  "sido": "전라남도",
  "sigungu": "완도군",
  "nearby_regions": [
    {
      "sido": "전라남도",
      "sigungu": "해남군",
      "distance_km": 42.5
    }
  ],
  "meal_target": {
    "calories_kcal": 550.0,
    "protein_g": 30.0,
    "fat_g": 18.0,
    "carbohydrate_g": 70.0
  }
}
```

`nearby_regions`는 최대 20개다. GPS 좌표를 AI Server로 보내지 않고 Backend에서 계산한 행정구역과 거리만 보낸다.

`meal_target`을 전달할 때는 열량과 탄수화물·단백질·지방 네 값을 모두 포함하고 모두 `0`보다 커야 한다. 목표를 계산하지 못했거나 사용하지 않는 경우 `0`으로 채우지 않고 `meal_target: null`을 전달한다. AI 후보 점수 계산은 양수 목표를 기준으로 하므로 `0`은 허용하지 않는다.

## 주간 식단 생성

### 요청

`POST /recommend/diet`

```json
{
  "metric_statuses": {
    "bmi": "high",
    "fasting_glucose": "normal"
  },
  "food_allergens": ["땅콩"],
  "disliked_foods": ["가지"],
  "goal_type": "weight_loss",
  "additional_input": "간이 강하지 않은 식단",
  "sido": "전라남도",
  "sigungu": "완도군",
  "nearby_regions": [],
  "meal_target": {
    "calories_kcal": 550.0,
    "protein_g": 30.0,
    "fat_g": 18.0,
    "carbohydrate_g": 70.0
  }
}
```

### 응답 핵심 구조

아래 JSON은 반복되는 요일과 식사를 생략한 필드 구조 예시다. 실제 응답 검증용 fixture로 사용하지 않는다.

```json
{
  "ok": true,
  "generator": "auto-fit-ai",
  "result": {
    "summary": "...",
    "strategy": "...",
    "nutrition_balance": {
      "energy_strategy": "...",
      "carbohydrate_strategy": "...",
      "protein_strategy": "...",
      "fat_strategy": "..."
    },
    "weekly_plan": [
      {
        "day": "monday",
        "meals": {
          "breakfast": {
            "menu_name": "메뉴명",
            "menu_description": "메뉴 설명",
            "image_prompt": null,
            "estimated_calories_kcal": 520,
            "nutrition": {
              "carbohydrate_g": 68,
              "protein_g": 31,
              "fat_g": 15
            },
            "items": [
              {
                "food_name": "현미밥",
                "portion_g": 100.0,
                "calories_kcal": 165.0,
                "protein_g": 3.0,
                "fat_g": 1.0,
                "carbohydrate_g": 35.0
              }
            ],
            "ingredients": null,
            "guidance": "..."
          }
        }
      }
    ],
    "dietary_principles": [],
    "foods_to_prioritize": [],
    "foods_to_limit": [],
    "cautions": [],
    "sources": []
  }
}
```

실제 `weekly_plan`은 `monday`부터 `sunday`까지 정확히 7개이며, 각 요일에는 `breakfast`, `lunch`, `dinner`, `snack`이 모두 포함된다. Backend는 `items`를 반드시 보존해야 Recipe API의 제공량 scaling과 영양정보 유지가 가능하다.

메뉴 전체 영양정보는 `estimated_calories_kcal`과 `nutrition`을 사용한다. `items`의 영양정보는 각 추천 음식 item 전체 기준이며, Recipe 재료별 영양정보를 의미하지 않는다.

## 한 끼 재추천

### 요청

`POST /recommend/diet/replace-meal`

```json
{
  "metric_statuses": {},
  "target_day": "monday",
  "target_meal": "lunch",
  "current_menu_name": "기존 점심",
  "excluded_menu_names": ["기존 점심", "이미 사용한 저녁"],
  "current_ingredients": ["현미", "닭가슴살"],
  "food_allergens": [],
  "disliked_foods": [],
  "goal_type": "weight_loss",
  "additional_input": null,
  "sido": null,
  "sigungu": null,
  "nearby_regions": [],
  "meal_target": null
}
```

요일은 `monday`부터 `sunday`, 식사 유형은 `breakfast`, `lunch`, `dinner`, `snack` 중 하나다. `excluded_menu_names`에는 현재 메뉴뿐 아니라 주간 식단에서 이미 사용한 메뉴를 함께 보내야 반복을 줄일 수 있다.

### 응답과 저장

```json
{
  "ok": true,
  "generator": "auto-fit-ai",
  "meal": {
    "day": "monday",
    "meal_type": "lunch",
    "meal": {
      "menu_name": "새 점심",
      "menu_description": "...",
      "image_prompt": null,
      "estimated_calories_kcal": 540,
      "nutrition": {
        "carbohydrate_g": 66,
        "protein_g": 32,
        "fat_g": 16
      },
      "items": [],
      "ingredients": null,
      "guidance": "..."
    },
    "cautions": [],
    "sources": []
  }
}
```

Backend는 응답의 `day`와 `meal_type`이 요청 대상과 같은지 확인한 뒤 해당 슬롯 하나만 transaction으로 교체한다. AI Server는 DB를 직접 변경하지 않는다.

## Recipe 조회

### 요청

`POST /recommend/diet/recipe`

주간 식단 또는 재추천 응답의 `meal.items`를 변형하지 않고 전달한다.

```json
{
  "items": [
    {
      "food_name": "톳나물 두부무침",
      "portion_g": 70.0,
      "calories_kcal": 95.0,
      "protein_g": 7.0,
      "fat_g": 4.0,
      "carbohydrate_g": 8.0
    }
  ],
  "food_allergens": [],
  "disliked_foods": []
}
```

### 응답에서 사용할 필드

| Field | 설명 |
|---|---|
| `recipe_source` | `official_exact`, `official_similar`, `llm_generated`, `unavailable` |
| `official_recipe` | 공식 레시피 여부 |
| `matched_recipe_name` | 공식 유사 매칭 이름 |
| `match_score` | 유사 매칭 점수, 해당하지 않으면 `null` |
| `safety_checked` | 알레르기·기피 음식 검사 수행 여부 |
| `restriction_matches` | 제한 식품과 충돌한 항목 |
| `recipe.ingredients` | `{name, amount_g}` 목록 |
| `recipe.steps` | 조리 순서 |

`amount_g`는 공식 원문 단위가 불명확하면 `null`일 수 있다. Backend와 Frontend는 임의로 값을 채우지 않는다. `portion_g`는 recipe scaling에 사용하지만 화면 표시 필수값은 아니다.

정상 exact/similar, LLM fallback, 제한 식품 충돌, unavailable의 전체 응답은 [Recipe API examples](recipe_api_contract_examples.json)를 사용한다.

## Chat 요청과 상태 보존

신규 기능은 `POST /chat/orchestrate`를 사용한다. 상세 action matrix와 전체 예제는 [Chat API Backend Contract](chat_api_contract.md)와 [Chat API examples](chat_api_contract_examples.json)를 따른다.

Backend가 매 요청에 제공할 context는 다음과 같다.

```json
{
  "content": "월요일 점심을 바꿔줘",
  "history": [],
  "context": {
    "metric_statuses": {},
    "goal_type": null,
    "food_allergens": [],
    "disliked_foods": [],
    "additional_input": null,
    "sido": null,
    "sigungu": null,
    "nearby_regions": [],
    "meal_target": null,
    "exercise_summary": null,
    "diet_summary": {
      "weekly_plan": []
    }
  },
  "pending_action": null
}
```

식단 변경은 다음 조건이 모두 충족될 때만 저장한다.

1. `action`이 `diet_replace`다.
2. `action_status`가 `ready_for_backend_apply`다.
3. `requires_backend_apply`가 `true`다.
4. 응답 대상 요일과 식사가 요청 및 `pending_action`과 일치한다.
5. 반환된 Meal이 Backend DTO 검증을 통과한다.

사용자 표시용 `message` 문자열을 비교해 로직을 분기하지 않는다.

## 건강 분석

### 현재 운영 후보

`POST /health-analysis`는 다음 구조를 사용한다.

```json
{
  "schema_version": "1.0",
  "request_id": "backend-generated-request-id",
  "goal": {
    "text": "건강한 체중 감량",
    "goal_type": "weight_loss",
    "short_term": false
  },
  "input": {
    "health_checkup": {},
    "body_composition": {},
    "diet_context": {
      "captured_at": "2026-10-14T10:00:00+09:00",
      "inventory": [],
      "allergies": []
    },
    "score_context": {
      "baseline_health_checkup": {},
      "baseline_body_composition": {},
      "weekly_diet": {
        "expected_days": 7,
        "days": []
      },
      "weekly_exercise": {
        "goal_type": "body_fat_loss",
        "target_minutes": 90,
        "completed_minutes": 0,
        "target_days": 3,
        "completed_days": 0,
        "goal_aligned_completed_days": 0
      }
    }
  }
}
```

`score_context`는 기존 호출과의 호환성을 위해 선택값이다. 생략하면
`analysis.health_score.status`는 `unavailable`이며 임의 점수를 만들지 않는다.

건강점수 정책 `health-score-v1`은 다음과 같다.

- 식단과 운동 영역은 각각 0점에서 시작한다.
- 식단은 메뉴 종류가 아니라 7일간 칼로리 30%, 단백질 30%, 탄수화물 20%, 지방 20%의 목표 준수율로 계산한다.
- 실제 섭취량이 목표의 ±10%이면 해당 항목을 100점으로 인정하고, 50% 이상 벗어나면 0점으로 계산한다.
- 기록되지 않은 식단 일자는 0점이다.
- 운동은 목표 시간 50%, 주간 횟수 30%, 선택한 운동 목적과 일치하는 추천 운동 수행도 20%로 계산한다.
- 건강데이터는 최초 인바디와 건강검진을 기준 80점으로 시작한다.
- 건강데이터는 현재와 최초 기준의 인바디·건강검진 데이터가 모두 있어야 계산한다.
- 건강데이터 개선은 최대 +20점, 악화는 최대 -80점으로 반영한다.
- 종합점수는 식단 30%, 운동 30%, 건강데이터 40%를 반영한다.
- 점수와 등급은 결정론적 코드로 계산하며 LLM이 생성하거나 수정하지 않는다.
- 최초 기준 데이터는 AI Server가 저장하지 않으며 Backend가 사용자별로 보존해 매 요청에 전달한다.

현재 날짜 필드는 Schema상 문자열이므로 Backend와 ISO 8601 사용 여부를 최종 합의해야 한다. 응답은 같은 `request_id`와 `schema_version`, `analysis`, `model`을 반환한다.

냉장고 정보만 바뀐 경우 `POST /health-analysis/diet-refresh`를 사용하며, 기존 `health_checkup`, `body_composition`, `goal`과 최신 `diet_context`를 전달한다. 응답의 `diet_suggestion`과 `refrigerator_context`만 기존 분석 결과에서 교체한다.

### Backend와 확정해야 하는 중복 경로

현재 repository에는 LangGraph 기반 `POST /analysis`도 존재한다. `/analysis`와 `/health-analysis`는 입력과 응답 구조가 서로 다르므로 Backend가 둘을 동시에 종합 분석 API로 사용하면 안 된다. Backend 명세를 받은 후 다음 중 하나를 공식 계약으로 확정한다.

- `/health-analysis`: `request_id`, 건강검진·체성분·냉장고·목표를 포함한 종합 분석
- `/analysis`: `body_data`, `health_data`를 받는 LangGraph 분석

확정 전에는 기존 endpoint를 삭제하거나 이름을 변경하지 않는다.

## 오늘의 운동 설정

Frontend의 헬스·홈트 선택값은 기존 `POST /recommend/exercise`에 전달한다. 기존 요청 필드는 그대로 유효하며, `exercise_mode`를 보내는 신규 요청만 해당 모드의 상세 설정을 함께 보내야 한다.

### 헬스 요청

```json
{
  "metric_statuses": {},
  "goal_type": "weight_loss",
  "experience_level": "beginner",
  "available_minutes": 30,
  "location": "gym",
  "preferred_training_types": ["weight_training"],
  "exercise_mode": "gym",
  "daily_condition": "good",
  "has_discomfort": false,
  "discomfort_areas": [],
  "gym_preferences": {
    "training_style": "machine",
    "focus_area": "upper_body"
  }
}
```

### 홈트 요청

```json
{
  "metric_statuses": {},
  "goal_type": "general_fitness",
  "experience_level": "beginner",
  "available_minutes": 15,
  "location": "home",
  "preferred_training_types": ["home_training", "bodyweight"],
  "exercise_mode": "home_training",
  "daily_condition": "normal",
  "has_discomfort": true,
  "discomfort_areas": ["knee"],
  "home_training_preferences": {
    "equipment": "none",
    "workout_style": "quiet"
  }
}
```

Frontend 표시값과 API enum은 다음처럼 매핑한다.

| 화면 | 표시값 | API 값 |
|---|---|---|
| 공통 컨디션 | 좋음 / 보통 / 피곤 | `good` / `normal` / `tired` |
| 헬스 운동 방식 | 머신 / 프리웨이트 / 상관없음 / 기타 | `machine` / `free_weight` / `any` / `other` |
| 헬스 집중 부위 | 상체 / 하체 / 전신 / 기타 | `upper_body` / `lower_body` / `full_body` / `other` |
| 홈트 도구 | 장비 없이 / 밴드 / 덤벨 / 기타 | `none` / `band` / `dumbbell` / `other` |
| 홈트 성향 | 조용한 운동 / 땀 나는 운동 / 기타 | `quiet` / `sweaty` / `other` |

`has_discomfort=false`이면 `discomfort_areas`는 빈 배열이어야 한다. `true`인데 상세 부위를 받지 않은 화면이라면 빈 배열도 허용한다. AI Server는 피곤함 또는 불편 부위가 있으면 강도·동작 선택에 안전 조건을 우선한다.

운동 방식·집중 부위·도구·운동 성향에서 `other`를 선택하면 각각 `other_training_style`, `other_focus_area`, `other_equipment`, `other_workout_style`에 사용자가 지정한 값을 함께 전달한다. 헬스·홈트 시간의 `기타`는 별도 enum이 아니라 실제 분 단위 숫자를 `available_minutes`에 전달한다.

## 러닝 코스 추천

Backend 운영 계약은 거리 선택을 코스 검색의 기준으로 사용한다.

- `3km`, `5km`, `10km`, 직접 입력 거리를 `distance_option`과 `custom_distance_km`로 전달한다.
- 기존 목표 시간은 AI Server 요청 조건이 아니라 코스의 `estimated_duration_minutes`와 비교하는 보조 목표로 유지한다.
- 사용자 저장 페이스가 있으면 `pace_minutes_per_km`로 전달한다.
- 강도 선택을 코스에 반영하려면 `light → easy`, `moderate → moderate`, `hard → hard`로 매핑해 `desired_difficulty`를 전달한다.
- `desired_difficulty`는 거리 허용 범위를 변경하거나 다른 거리 코스를 포함하지 않고, 같은 거리 후보의 보조 정렬에만 사용한다.

러닝 기능의 전체 상태 전이, Backend 저장 필드와 E2E 수용 시나리오는 [Running Backend E2E Contract](running_backend_e2e_contract.md)를 따른다. 검증 가능한 전체 요청·응답 fixture는 [Running API examples](running_api_contract_examples.json)를 사용한다.

### 공식 코스 목록

Backend는 다음과 같이 지역 또는 현재 위치와 거리 옵션을 전달한다.

```http
GET /running/courses/recommend?region=성남시&distance_option=5km&latitude=37.3948&longitude=127.1112&pace_minutes_per_km=6.5&desired_difficulty=easy&limit=10
```

- `distance_option`: `3km`, `5km`, `10km`, `custom`
- `custom`이면 `custom_distance_km`가 필수다.
- `region` 또는 `latitude`와 `longitude` 쌍 중 하나는 필수다.
- GPS만 제공하면 AI Server가 Kakao 행정구역 API로 지역을 결정한다.
- GPS가 있으면 공식 코스 출발지까지의 직선거리로 가까운 순서를 우선한다.
- 거리 필터는 초기 정책으로 목표 거리의 ±10%를 사용한다.
- `desired_difficulty`는 `easy`, `moderate`, `hard` 중 하나이며 선택 필드다.
- 사용자 페이스가 없으면 기본 페이스를 사용하고 `pace_assumed=true`로 표시한다.

기본 공식 데이터는 전국길관광정보표준데이터를 사용한다. 두루누비 정보 서비스가 활성화된 환경에서는 GPX 실제 경로가 검증된 코스를 같은 응답에 합친다. Backend는 응답의 다음 필드를 반드시 확인한다.

| Field | 의미 |
|---|---|
| `source.source_type=official_metadata` | 지자체 공식 코스 메타데이터 기반 후보 |
| `source.source_type=official_gpx` | 한국관광공사 두루누비 GPX 실제 경로가 검증된 후보 |
| `geometry_status=metadata_only` | 좌표가 아직 없는 상태 |
| `geometry_status=start_geocoded` | 출발지만 Kakao로 좌표화됨 |
| `geometry_status=endpoints_geocoded` | 출발·도착 좌표가 확보됨 |
| `geometry_status=verified_polyline` | 상세 endpoint에서 지도용 전체 경로를 받을 수 있음 |
| `geometry_distance_km` | GPX 좌표로 다시 계산한 실제 경로 길이 |
| `requires_route_validation=true` | 실제 보행 경로 Polyline 검증이 아직 필요함 |
| `requires_route_validation=false` | 공급자 GPX 경로 검증이 완료됨 |

`data_sources`에는 `official_metadata`와 `official_gpx`의 상태가 각각 `available`, `disabled`, `unavailable` 중 하나로 반환된다. 두루누비가 비활성 또는 일시 장애여도 전국길 메타데이터 추천은 계속 제공된다.

두루누비를 활성화하려면 다음 조건이 모두 필요하다.

- 공공데이터포털에서 `한국관광공사 두루누비 정보 서비스` 활용신청 승인
- 기존 `PUBLIC_DATA_SERVICE_KEY`에 해당 서비스 권한 반영
- AI Server 환경변수 `RUNNING_DURUNUBI_ENABLED=true`

권한 승인 전에는 활성화하지 않는다. GPX는 추천 후보 전체가 아니라 거리·지역 필터를 먼저 통과한 제한된 수의 코스에 대해서만 조회한다.

조건에 맞는 공식 코스가 없으면 HTTP 오류가 아니라 다음 상태를 반환한다.

```json
{
  "ok": true,
  "status": "generation_required",
  "courses": [],
  "generation_recommended": true
}
```

Backend는 이 상태를 `POST /running/routes/generate-loop` 자동 순환 코스 생성 화면으로 연결한다.

### 순환 코스 자동 생성

```http
POST /running/routes/generate-loop
```

```json
{
  "start": {
    "latitude": 37.3948,
    "longitude": 127.1112
  },
  "distance_option": "5km",
  "pace_minutes_per_km": 6.5,
  "candidate_count": 3,
  "seed": 0
}
```

- `candidate_count`는 1~3이다.
- `seed`를 바꾸면 경유점 방향이 달라져 다른 후보를 요청할 수 있다.
- AI Server는 방향이 다른 사각형 경유점 후보를 만들고 Kakao 도보 경로 API가 반환한 실제 도로 형상만 사용한다.
- 후보별 기본 2회까지만 호출한다. 첫 실제 거리의 비율로 경유점 반경을 한 번 보정하므로 후보 3개 기준 최대 6회다.
- 출발지와 도착지는 동일하며 경유점은 3개다.
- 경로가 목표 거리 ±10%이면 `status=matched`다.
- 도보 경로는 생성됐지만 모든 후보가 범위 밖이면 `status=best_effort`다. Backend는 `distance_error_percent`와 `within_tolerance=false`를 반드시 표시하고 정상 매칭으로 취급하지 않는다.
- 모든 제한된 시도가 실패하면 `status=unavailable`, 빈 `candidates`와 오류 안내 문구가 반환된다.
- 반환되는 `course_id`는 자동 생성 결과 식별자일 뿐 AI Server의 영구 저장 ID가 아니다.
- 실제 사용자 선택·즐겨찾기·저장은 기존 정책대로 Backend가 담당한다.

### 코스 상세와 실제 경로

- `GET /running/courses/{course_id}`: 공식 설명, 거리, 출발·도착, 경유지, 난이도 근거를 반환한다. `durunubi-` ID는 지도 표시용 `path`도 반환한다.
- `POST /running/routes/preview`: 좌표가 확정된 출발·도착·경유지를 Kakao 도보 경로로 검증하고 실제 Polyline을 반환한다.
- `POST /running/routes/generate-loop`: 출발지로 복귀하는 1~3개의 자동 생성 후보와 실제 거리 오차·Polyline을 반환한다.
- `GET /running/places/search`: 출발지 검색용이며 공식 추천 코스 DB로 사용하지 않는다.
- 즐겨찾기, 선택한 코스, 사용자별 페이스의 영구 저장은 Backend가 담당한다.
- AI Server의 코스 카탈로그·좌표 캐시는 외부 API 호출 최적화용이며 사용자 선택 저장소가 아니다.

## 아직 Backend 운영 연동에서 제외할 기능

| Endpoint | 현재 상태 | 연동 보류 이유 |
|---|---|---|
| `POST /ai/body-analysis` | 모델 파일이 없으면 fallback 반환 | 학습 모델과 인증 경계 미확정 |
| `POST /running/session/recommend` | 목표 시간 기반 세션 추천 구현 존재 | Backend는 거리 우선 5개 경로 계약을 사용 |
| Chat 운동 변경 action | `exercise_replace_unavailable` 반환 | 운동 변경 API와 저장 계약 미정 |

`POST /recommend/exercise`의 AI 운동 추천 자체는 존재하지만, 챗봇을 통한 기존 운동 계획 변경과 Backend 저장 흐름은 아직 연결되지 않았다.

## 데이터 소유권과 저장 책임

| 데이터 | 원본 소유자 | AI Server 처리 | 최종 저장 |
|---|---|---|---|
| 사용자 계정과 권한 | Backend | 사용하지 않음 | Backend |
| 건강검진·체성분 원본 | Backend | 요청 범위에서 분석 | Backend |
| 알레르기·기피 음식 | Backend | 필터링과 안전 검사 | Backend |
| 주간 식단 | Backend | 생성·재추천 결과 반환 | Backend |
| Recipe 공식 원문 | 외부 공식 API | 정규화·matching·scaling | 필요 시 Backend cache |
| 대화 이력·pending action | Backend | 현재 요청에서만 판단 | Backend |
| RAG 출처 | AI Server | 검색된 실제 출처만 반환 | Backend 선택 |
| 공식 러닝 코스 원문 | 공공데이터포털·지자체·한국관광공사 | 정규화·거리 필터·Kakao 좌표 보강·두루누비 GPX 검증 | AI Server cache |
| 사용자 러닝 페이스·즐겨찾기·선택 코스 | Backend | 요청 범위에서 시간 계산·추천 | Backend |

## Backend 구현 체크리스트

- [ ] AI Server base URL과 Bearer Key를 환경별로 분리했다.
- [ ] Frontend가 AI Server Key를 알 수 없고 Backend만 AI Server를 호출한다.
- [ ] 사용자별 AI 요청 context와 pending action이 분리된다.
- [ ] 식단 응답의 `weekly_plan.meals.*.items`를 누락하지 않고 저장한다.
- [ ] 알레르기와 기피 음식 필드를 구분해 모든 Diet·Recipe 요청에 전달한다.
- [ ] 식단 재추천 결과는 대상 슬롯 검증 후 transaction으로 반영한다.
- [ ] Chat의 `message`가 아니라 action과 status로 분기한다.
- [ ] `401`, `422`, `500`, `503` 처리와 timeout을 구현한다.
- [ ] 로그에 API Key와 원본 개인정보를 남기지 않는다.
- [ ] `/analysis`와 `/health-analysis` 중 공식 종합 분석 경로를 합의한다.
- [ ] Backend DTO가 확정되면 AI 요청·응답 매핑 테스트를 추가한다.

## Backend 명세를 받은 뒤 진행할 작업

1. Backend Controller와 DTO를 이 문서의 필드에 대응시킨다.
2. 이름, null 허용, enum, 단위, 날짜 형식 차이를 표로 정리한다.
3. 차이는 AI Server의 Router 또는 별도 경계 변환에서 흡수하고 핵심 Service는 보존한다.
4. 실제 Backend payload fixture로 계약 테스트를 추가한다.
5. Backend와 AI Server 통합 테스트를 실행한다.
6. 마지막으로 Frontend, Backend, AI Server E2E를 실행한다.

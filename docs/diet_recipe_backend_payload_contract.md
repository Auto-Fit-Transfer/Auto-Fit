# Auto-Fit Diet Recipe · Backend 전송값 계약

> 대상: Backend, Frontend, AI Server 담당자
> 기준 AI 브랜치: `ai`
> 기준 커밋: `d1ee2343612c9f46bae30ec4cc0201836bf48b5c`
> API: `POST /recommend/diet/recipe`

## 1. 호출 구조

```text
Frontend
  └─ 사용자가 주간 식단의 특정 메뉴 선택
       ↓
Backend
  ├─ 선택한 요일·식사 슬롯과 저장된 메뉴 정보를 조회
  ├─ 서버 간 Bearer API Key를 사용하여 AI Server 호출
  ↓
AI Server
  ├─ official_exact
  ├─ official_similar
  ├─ llm_generated
  └─ unavailable
       ↓
Backend
  └─ 응답을 검증하고 Frontend에 전달
```

- Frontend는 AI Server를 직접 호출하지 않는다.
- 주간 식단은 월요일부터 일요일까지 하루 4끼, 총 28개 슬롯이다.
- Recipe API는 28끼를 한 번에 생성하지 않는다. 사용자가 상세 화면을 연 한 끼만 호출한다.
- 28개 슬롯 모두 동일한 요청·응답 계약을 사용한다.
- 장보기 목록 추가는 이 AI API에 포함하지 않는다. Backend와 Frontend가 별도로 처리한다.

## 2. 인증 및 HTTP 정보

```http
POST {AI_SERVER_BASE_URL}/recommend/diet/recipe
Authorization: Bearer {AI_SERVER_API_KEY}
Content-Type: application/json
```

`AI_SERVER_API_KEY`는 서버 간 secret이다. Frontend, 앱 번들, 로그, API 응답에 노출하지 않는다.

## 3. Backend → AI Server 요청

### 전체 요청 예시

아래 값은 구조 설명용 예시다. Backend는 실제 저장된 주간 식단과 사용자 설정값을 전달한다.

```json
{
  "day": "monday",
  "meal_type": "snack",
  "menu_name": "그릭요거트 볼",
  "menu_description": "블루베리와 호두를 올린 간식입니다.",
  "guidance": "저장된 영양 목표를 기준으로 구성했습니다.",
  "tags": ["가벼운 간식", "불 없이"],
  "personalization_reasons": [
    "저장된 사용자 식단 목표를 반영했습니다."
  ],
  "servings": 1,
  "daily_nutrition_target": {
    "calories_kcal": 1800.0,
    "carbohydrate_g": 200.0,
    "protein_g": 100.0,
    "fat_g": 70.0
  },
  "related_menus": [
    {
      "menu_name": "닭가슴살 구이",
      "day": "tuesday",
      "meal_type": "lunch",
      "estimated_calories_kcal": 420.0
    }
  ],
  "items": [
    {
      "food_name": "그릭요거트(무가당)",
      "portion_g": 200.0,
      "calories_kcal": 240.0,
      "carbohydrate_g": 20.0,
      "protein_g": 20.0,
      "fat_g": 9.0
    },
    {
      "food_name": "그래놀라와 호두",
      "portion_g": 40.0,
      "calories_kcal": 210.0,
      "carbohydrate_g": 25.0,
      "protein_g": 5.0,
      "fat_g": 10.0
    }
  ],
  "food_allergens": [],
  "disliked_foods": ["건포도"]
}
```

### 요청 필드

| 필드 | 타입 | 필수 | 기본값/nullable | Backend 데이터 출처 및 용도 |
|---|---|---:|---|---|
| `items` | `array<DietRecipeItemRequest>` | 예 | 1~10개 | 주간 식단 또는 재추천 결과의 `meal.items`를 그대로 전달 |
| `day` | `monday`~`sunday` | 아니요 | `null` | 선택한 주간 식단 요일 |
| `meal_type` | `breakfast`, `lunch`, `dinner`, `snack` | 아니요 | `null` | 선택한 식사 슬롯 |
| `menu_name` | `string` | 아니요 | `null` | 저장된 추천 메뉴명 |
| `menu_description` | `string` | 아니요 | `""` | 저장된 추천 메뉴 설명 |
| `guidance` | `string` | 아니요 | `""` | 식단 생성 또는 재추천 시 받은 안내 문구 |
| `tags` | `array<string>` | 아니요 | `[]`, 최대 6개 | Frontend에 표시할 저장 태그 |
| `personalization_reasons` | `array<string>` | 아니요 | `[]`, 최대 5개 | Backend가 보유한 사용자 맞춤 사유 |
| `servings` | `integer` | 아니요 | `1`, 1~20 | 상세 화면의 인분 수 |
| `daily_nutrition_target` | `object` | 아니요 | `null` | 사용자 일일 목표 대비 비율 계산용 |
| `related_menus` | `array<object>` | 아니요 | `[]`, 최대 10개 | 같은 주간 식단의 다른 메뉴 링크 정보 |
| `food_allergens` | `array<string>` | 아니요 | `[]`, 최대 30개 | 사용자 알레르기 안전 검사 |
| `disliked_foods` | `array<string>` | 아니요 | `[]`, 최대 50개 | 사용자 기피 음식 검사 |

`items`만 Schema 필수값이지만, 상세 화면 전체 정보를 제공하려면 `day`, `meal_type`, `menu_name`, `menu_description`, `guidance`, `items`, 사용자 제한 정보를 함께 보내는 것을 권장한다.

### `items[]` 필드

| 필드 | 타입 | 필수 | 허용 범위 | 설명 |
|---|---|---:|---|---|
| `food_name` | `string` | 예 | 1~200자 | 레시피를 찾을 음식명 |
| `portion_g` | `number` | 예 | `> 0`, `≤ 5000` | 공식 재료량 scaling에 사용하는 추천 제공량 |
| `calories_kcal` | `number` | 예 | `0~10000` | 해당 추천 음식 item 전체 열량 |
| `carbohydrate_g` | `number` | 예 | `0~1000` | 해당 추천 음식 item 전체 탄수화물 |
| `protein_g` | `number` | 예 | `0~1000` | 해당 추천 음식 item 전체 단백질 |
| `fat_g` | `number` | 예 | `0~1000` | 해당 추천 음식 item 전체 지방 |

영양정보는 각 추천 음식 item 전체 기준이다. Recipe 재료 하나하나의 칼로리나 탄수화물·단백질·지방은 보내지 않는다.

### `daily_nutrition_target`

네 값이 모두 제공되어야 한다.

```json
{
  "calories_kcal": 1800.0,
  "carbohydrate_g": 200.0,
  "protein_g": 100.0,
  "fat_g": 70.0
}
```

이 필드가 없으면 AI Server는 `daily_target_percentages`를 `null`로 반환한다. 한 끼 목표인 `meal_target`과 일일 목표인 `daily_nutrition_target`을 혼동하지 않는다.

### `related_menus[]`

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `menu_name` | `string` | 예 | 관련 메뉴 이름 |
| `day` | 요일 enum | 아니요 | 관련 메뉴가 저장된 요일 |
| `meal_type` | 식사 enum | 아니요 | 관련 메뉴가 저장된 슬롯 |
| `estimated_calories_kcal` | `number` | 아니요 | 관련 메뉴 전체 예상 열량 |

## 4. AI Server → Backend 응답

### 성공 응답 예시

```json
{
  "ok": true,
  "generator": "auto-fit-ai",
  "meal": {
    "day": "monday",
    "meal_type": "snack",
    "menu_name": "그릭요거트 볼",
    "menu_description": "블루베리와 호두를 올린 간식입니다.",
    "tags": ["가벼운 간식", "불 없이", "간식", "고단백"],
    "servings": 1,
    "estimated_duration_minutes": 5.0,
    "estimated_calories_kcal": 450.0,
    "nutrition": {
      "carbohydrate_g": 45.0,
      "protein_g": 25.0,
      "fat_g": 19.0
    },
    "daily_target_percentages": {
      "calories_percent": 25.0,
      "carbohydrate_percent": 22.5,
      "protein_percent": 25.0,
      "fat_percent": 27.1
    },
    "personalization_reasons": [
      "저장된 사용자 식단 목표를 반영했습니다.",
      "저장된 영양 목표를 기준으로 구성했습니다."
    ],
    "allergen_notice": ["우유", "호두"],
    "items": [
      {
        "food_name": "그릭요거트(무가당)",
        "portion_g": 200.0,
        "calories_kcal": 240.0,
        "carbohydrate_g": 20.0,
        "protein_g": 20.0,
        "fat_g": 9.0,
        "recipe_available": true,
        "recipe_source": "official_exact",
        "official_recipe": true,
        "matched_recipe_name": "그릭요거트",
        "match_score": 1.0,
        "safety_checked": true,
        "restriction_matches": [],
        "recipe": {
          "recipe_id": "official-1",
          "menu_name": "그릭요거트",
          "cooking_method": null,
          "dish_type": null,
          "serving_weight": 200.0,
          "servings": 1,
          "estimated_duration_minutes": 3.0,
          "ingredients_text": "그릭요거트 200g, 블루베리 50g",
          "ingredients": [
            {"name": "그릭요거트", "amount_g": 200.0},
            {"name": "블루베리", "amount_g": 50.0}
          ],
          "steps": [
            "그릭요거트를 그릇에 담습니다."
          ],
          "step_details": [
            {
              "order": 1,
              "instruction": "그릭요거트를 그릇에 담습니다.",
              "duration_minutes": 3.0,
              "tip": null
            }
          ],
          "cooking_tip": null,
          "image_small": null,
          "image_large": null,
          "source": "식품의약품안전처 식품안전나라"
        }
      },
      {
        "food_name": "그래놀라와 호두",
        "portion_g": 40.0,
        "calories_kcal": 210.0,
        "carbohydrate_g": 25.0,
        "protein_g": 5.0,
        "fat_g": 10.0,
        "recipe_available": true,
        "recipe_source": "llm_generated",
        "official_recipe": false,
        "matched_recipe_name": null,
        "match_score": null,
        "safety_checked": true,
        "restriction_matches": [],
        "recipe": {
          "recipe_id": null,
          "menu_name": "그래놀라와 호두",
          "cooking_method": null,
          "dish_type": null,
          "serving_weight": 40.0,
          "servings": 1,
          "estimated_duration_minutes": 2.0,
          "ingredients_text": null,
          "ingredients": [
            {"name": "그래놀라", "amount_g": 30.0},
            {"name": "호두", "amount_g": 10.0}
          ],
          "steps": [
            "그래놀라와 호두를 올립니다."
          ],
          "step_details": [
            {
              "order": 1,
              "instruction": "그래놀라와 호두를 올립니다.",
              "duration_minutes": 2.0,
              "tip": "먹기 직전에 올립니다."
            }
          ],
          "cooking_tip": null,
          "image_small": null,
          "image_large": null,
          "source": "Auto-Fit AI 생성 조리법"
        }
      }
    ],
    "related_menus": [
      {
        "menu_name": "닭가슴살 구이",
        "day": "tuesday",
        "meal_type": "lunch",
        "estimated_calories_kcal": 420.0
      }
    ]
  }
}
```

### 한 끼 전체 응답 필드

| 필드 | 타입 | nullable | 설명 |
|---|---|---:|---|
| `ok` | `boolean` | 아니요 | 정상 응답이면 `true` |
| `generator` | `string` | 아니요 | 현재 `auto-fit-ai` |
| `meal.day` | 요일 enum | 예 | 요청에서 전달한 요일 |
| `meal.meal_type` | 식사 enum | 예 | 요청에서 전달한 식사 슬롯 |
| `meal.menu_name` | `string` | 예 | 요청 메뉴명 또는 item 이름 조합 |
| `meal.menu_description` | `string` | 아니요 | 상세 화면 한 줄 설명 |
| `meal.tags` | `array<string>` | 아니요 | 전달 태그와 식사 유형·고단백 파생 태그 |
| `meal.servings` | `integer` | 아니요 | 표시 인분 수 |
| `meal.estimated_duration_minutes` | `number` | 예 | 모든 사용 가능 Recipe에 시간이 있을 때 합산한 예상시간 |
| `meal.estimated_calories_kcal` | `number` | 아니요 | `items` 전체 열량 합계 |
| `meal.nutrition` | `object` | 아니요 | `items` 전체 탄수화물·단백질·지방 합계 |
| `meal.daily_target_percentages` | `object` | 예 | 일일 목표가 제공된 경우의 목표 대비 비율 |
| `meal.personalization_reasons` | `array<string>` | 아니요 | 전달한 맞춤 사유와 `guidance` |
| `meal.allergen_notice` | `array<string>` | 아니요 | 메뉴·재료명에서 감지된 알레르기 유발 가능 항목 |
| `meal.items` | `array<object>` | 아니요 | 음식 item별 Recipe 해결 결과 |
| `meal.related_menus` | `array<object>` | 아니요 | Backend가 전달한 관련 메뉴 정보 |

공식 Recipe 원본에 조리시간이 없으면 `estimated_duration_minutes`는 `null`이다. Backend와 Frontend는 근거 없는 기본 시간을 임의로 표시하지 않는다.

### `meal.items[]` 결과 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| 원본 음식·영양 필드 | 요청과 동일 | `food_name`, `portion_g`, 칼로리, 탄수화물, 단백질, 지방 |
| `recipe_available` | `boolean` | 화면에 표시할 안전한 Recipe가 있는지 여부 |
| `recipe_source` | enum | `official_exact`, `official_similar`, `llm_generated`, `unavailable` |
| `official_recipe` | `boolean` | 식품안전나라 공식 Recipe 여부 |
| `matched_recipe_name` | `string/null` | 공식 매칭 메뉴명 |
| `match_score` | `number/null` | 공식 유사 매칭 점수, 0~1 |
| `safety_checked` | `boolean` | 알레르기·기피 음식 검사를 완료했는지 여부 |
| `restriction_matches` | `array<string>` | 제한 조건과 충돌한 항목 |
| `recipe` | `object/null` | 사용 가능한 Recipe 상세. unavailable이면 `null` |

### `recipe` 상세 필드

| 필드 | 타입 | nullable | 설명 |
|---|---|---:|---|
| `recipe_id` | `string` | 예 | 공식 Recipe ID, LLM Recipe는 `null` |
| `menu_name` | `string` | 예 | 매칭 또는 생성된 Recipe 이름 |
| `cooking_method` | `string` | 예 | 공식 데이터의 조리 방법 |
| `dish_type` | `string` | 예 | 공식 데이터의 요리 종류 |
| `serving_weight` | `number` | 예 | Recipe scaling 후 완성 음식 중량 |
| `servings` | `integer` | 아니요 | Recipe 인분 수 |
| `estimated_duration_minutes` | `number` | 예 | 확인된 Recipe 예상 조리시간 |
| `ingredients_text` | `string` | 예 | 공식 Recipe 원문 재료 문자열 |
| `ingredients` | `array<{name, amount_g}>` | 예 | 구조화된 재료명과 g 중량 |
| `steps` | `array<string>` | 아니요 | 기존 Backend 호환용 조리 단계 문자열 |
| `step_details` | `array<object>` | 아니요 | 순서·단계 내용·시간·팁 구조 |
| `cooking_tip` | `string` | 예 | 공식 또는 LLM 조리 팁 |
| `image_small` | `string` | 예 | 공식 Recipe 작은 이미지 URL |
| `image_large` | `string` | 예 | 공식 Recipe 큰 이미지 URL |
| `source` | `string` | 예 | Recipe 출처 |

`ingredients[].amount_g`는 공식 원본 단위가 불명확하면 `null`일 수 있다. 임의로 g 값을 생성하지 않는다. 재료별 영양성분은 제공하지 않는다.

### `step_details[]`

```json
{
  "order": 1,
  "instruction": "재료를 손질합니다.",
  "duration_minutes": 5.0,
  "tip": "먹기 좋은 크기로 자릅니다."
}
```

`duration_minutes`와 `tip`은 근거가 없으면 `null`이다. 기존 Backend 호환을 위해 `steps` 문자열 배열도 유지한다.

## 5. Recipe 상태별 처리

| `recipe_source` | `recipe_available` | `official_recipe` | `recipe` | Backend 처리 |
|---|---:|---:|---|---|
| `official_exact` | `true` | `true` | object | 공식 정확 매칭으로 표시 |
| `official_similar` | `true` | `true` | object | `matched_recipe_name`, `match_score`와 함께 표시 |
| `llm_generated` | `true` | `false` | object | AI 생성 Recipe임을 구분하여 표시 |
| `unavailable` | `false` | `false` | `null` | Recipe 없음 또는 제한 충돌 안내 |

`restriction_matches`가 비어 있지 않으면 제한 식품과 충돌한 결과다. 안전하지 않은 Recipe 상세는 노출되지 않는다.

## 6. 오류 응답

| HTTP 상태 | 발생 조건 | Backend 처리 권장 |
|---:|---|---|
| `401` | Bearer 누락·형식 오류·API Key 불일치 | secret 설정 확인, Frontend에 key를 요청하지 않음 |
| `422` | 요청 Schema 오류 | Backend DTO와 저장 데이터 검증 |
| `500` | 예기치 않은 Recipe 처리 실패 | 일반 오류 처리 및 서버 로그 확인 |
| `503` | Recipe Service 일시 사용 불가 | 제한된 재시도 또는 잠시 후 다시 시도 안내 |

오류 응답 기본 형태:

```json
{
  "detail": "Diet recipe service is temporarily unavailable."
}
```

## 7. Backend 구현 체크리스트

- [ ] 주간 식단 28개 슬롯의 `menu_name`, `menu_description`, `guidance`, `items`를 저장한다.
- [ ] 재추천으로 슬롯을 교체할 때 위 필드도 함께 교체한다.
- [ ] Recipe 요청의 `items`를 이름만 남기지 않고 제공량과 영양값까지 전달한다.
- [ ] 현재 사용자의 `food_allergens`, `disliked_foods`를 전달한다.
- [ ] 일일 목표 대비 비율이 필요하면 `daily_nutrition_target`을 전달한다.
- [ ] AI Server 호출에 서버 간 Bearer Key를 사용한다.
- [ ] `recipe_source` 네 상태를 모두 처리한다.
- [ ] `amount_g`, 조리시간, 단계별 시간·팁의 `null`을 허용한다.
- [ ] 기존 `steps`와 신규 `step_details`를 모두 수용한다.
- [ ] 장보기 상태 변경은 별도의 Backend API로 처리한다.
- [ ] Frontend에 AI 서버 URL이나 서버 간 API Key를 노출하지 않는다.

## 8. 관련 자료

- [Backend-AI 전체 연동 명세](backend_ai_integration_spec.md)
- [Recipe 상태별 전체 응답 예시](recipe_api_contract_examples.json)
- [AI Server OpenAPI snapshot](ai-openapi.json)
- 실행 중인 AI Server: `GET {AI_SERVER_BASE_URL}/openapi.json`

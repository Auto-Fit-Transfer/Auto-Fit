# 식단 생성 사용자 알레르기 전달 보완 요청 — Backend 담당자용

> 작성일: 2026-11-03
> 대상: Backend 개발 담당자
> 범위: 기존 일일 식단 생성·자동 갱신 경로의 사용자 알레르기 전달
> 관련 문서: `docs/diet_generation_backend_action_request_2026-11-03.md`

## 1. 결론

현재 **주간 식단 경로는 사용자의 실제 알레르기를 AI Server에 정상 전달**하고 있습니다. 수정이 필요한 곳은 기존 일일 식단 및 자동 갱신의 다음 경로입니다.

```text
Backend diet_ai.py
→ chat_model.py
→ AI Server POST /chat
```

Backend는 이 경로에서도 사용자 알레르기를 조회하고 있으나, AI 요청을 만들 때 실제 알레르기 목록을 포함하지 않습니다. 따라서 AI가 알레르기 식품을 생성한 뒤 Backend의 사후 검사에서 탈락할 수 있습니다.

## 2. 경로별 현재 상태

| 기능 | AI Server 경로 | 사용자 알레르기 전달 | 조치 |
|---|---|---:|---|
| 7일 28끼 주간 식단 생성 | `POST /recommend/diet` | 정상 (`food_allergens`) | 변경 불필요 |
| 주간 식단 한 끼 재추천 | `POST /recommend/diet/replace-meal` | 정상 (`food_allergens`) | 변경 불필요 |
| 주간 식단 레시피 조회 | `POST /recommend/diet/recipe` | 정상 (`food_allergens`) | 변경 불필요 |
| 기존 일일 식단 생성 | `POST /chat` | AI 요청에는 미전달 | 수정 필요 |
| 기존 일일 식단 자동 갱신 | `POST /chat` | AI 요청에는 미전달 | 수정 필요 |
| 기존 일일 식단 한 끼 재추천 | `POST /chat` | AI 요청에는 미전달 | 수정 필요 |

## 3. 실제 코드에서 확인한 내용

### 정상 동작 중인 주간 식단

`backend/app/main.py`의 `load_weekly_diet_context()`는 다음 순서로 동작합니다.

1. `fetch_user_allergies()`로 사용자의 저장된 알레르기를 조회합니다.
2. 알레르기 유형 이름 또는 `custom_name`을 실제 이름으로 해석합니다.
3. `food_allergens` 배열로 정규화합니다.
4. `backend/app/weekly_diet.py`가 이를 `/recommend/diet` 요청에 포함합니다.
5. 한 끼 재추천 및 레시피 요청에서도 같은 알레르기 컨텍스트를 재사용합니다.

이 경로는 현재 방향과 일치하므로 유지합니다.

### 보완이 필요한 기존 일일 식단

다음 부분까지는 정상입니다.

- `backend/app/diet_refresh.py`가 사용자 알레르기를 조회합니다.
- `backend/app/main.py`의 `build_daily_diet_recommendation_plan()`이 `allergy_names`를 `generate_ai_meals()`에 전달합니다.
- `backend/app/diet_ai.py`가 냉장고 후보 필터링과 AI 응답 사후 검사에 `allergy_names`를 사용합니다.

하지만 `backend/app/diet_ai.py`가 AI에 보내는 JSON 데이터에는 다음 값만 들어갑니다.

- `slot`
- `attempt`
- `variation_token`
- `avoid_food_names`
- `avoid_meal_compositions`
- `available_ingredients`
- `retry_feedback`

실제 사용자 알레르기는 포함되지 않고, 프롬프트에는 일반적인 주요 알레르기 식품만 고정 문구로 들어갑니다.

또한 `backend/app/chat_model.py`의 `request_model()`은 AI Server `/chat`에 다음 형태로 요청합니다.

```json
{
  "question": "식단 생성 프롬프트",
  "user_info": {},
  "chat_history": []
}
```

따라서 Backend가 알레르기를 알고 있어도 AI Server는 사용자별 알레르기를 알 수 없습니다.

## 4. 권장 수정 순서

### 1순위 — 주간 구조화 식단 경로로 통합

최종 제품이 7일 28끼 주간 식단을 사용한다면 기존 일일 식단 생성과 자동 갱신도 `/chat`을 계속 확장하지 말고 주간 식단 구조로 통합하는 것을 권장합니다.

- 주간 생성: `POST /recommend/diet`
- 한 끼 재추천: `POST /recommend/diet/replace-meal`
- 레시피: `POST /recommend/diet/recipe`
- 일반 대화만 `POST /chat` 사용

이 방법은 알레르기뿐 아니라 응답 형식, 열량 범위, 음식 item 보존 문제도 함께 해결합니다.

기존 일일 식단 API가 더 이상 Frontend에서 사용되지 않는다면 삭제하지 말고 먼저 호출 여부와 자동 갱신 작업의 필요성을 확인한 후 비활성화 또는 이전 계획을 정합니다.

### 2순위 — 전환 전 임시 안전 보완

기존 `/chat` 기반 일일 식단 경로를 당분간 유지해야 한다면 `backend/app/diet_ai.py`의 `generate_ai_meals()`가 만드는 데이터 payload에 실제 알레르기를 추가합니다.

권장 필드명은 주간 식단 계약과 동일한 `food_allergens`입니다.

```json
{
  "slot": {
    "meal_type": "lunch",
    "meal_order": 2,
    "target_calories": 600,
    "minimum_calories": 510,
    "maximum_calories": 690
  },
  "food_allergens": ["우유", "대두"],
  "available_ingredients": ["현미", "닭가슴살"],
  "avoid_food_names": [],
  "avoid_meal_compositions": [],
  "retry_feedback": null
}
```

프롬프트에는 다음 조건을 명시합니다.

```text
food_allergens는 사용자에게 금지된 식품 목록이다.
해당 식품과 파생 식품을 모든 food_name에서 제외한다.
목록이 비어 있더라도 임의의 사용자 알레르기를 추측하지 않는다.
```

주의사항:

- `food_allergens`에는 알레르기명만 전달합니다.
- 사용자 ID, 이름, 이메일, 전화번호 등은 전달하지 않습니다.
- 단순히 `chat_model.py`의 빈 `user_info`에 개인정보 전체를 넣지 않습니다.
- Backend의 기존 사후 알레르기 검사는 제거하지 않습니다.
- 일반 주요 알레르기 고정 문구는 실제 `food_allergens`를 대신할 수 없습니다.

## 5. Backend 수정 대상

### 반드시 확인·수정할 파일

#### `backend/app/diet_ai.py`

- `generate_ai_meals()`의 AI 요청 데이터에 `food_allergens`를 추가합니다.
- 값은 기존 인자 `allergy_names`를 공백 제거·중복 제거한 결과로 사용합니다.
- 프롬프트가 실제 `food_allergens`를 최우선 제외 조건으로 사용하도록 변경합니다.
- 기존 `conflicts_allergy()` 사후 검사를 유지합니다.
- `generate_regenerated_meal()`도 같은 `generate_ai_meals()` 경로를 사용하므로 동일하게 적용되는지 확인합니다.

#### `backend/tests/test_diet_ai.py`

- 캡처한 `request_model` 입력에 실제 알레르기명이 포함되는지 검증합니다.
- 알레르기 및 파생 키워드가 포함된 AI 결과가 계속 거부되는지 검증합니다.
- 알레르기가 없는 경우 빈 배열로 전달되고 임의 값이 생기지 않는지 검증합니다.
- 요청 문자열에 사용자 식별정보가 포함되지 않는지 검증합니다.

#### `backend/tests/test_diet_refresh.py`

- 자동 갱신이 DB에서 조회한 사용자 알레르기를 식단 생성 함수까지 전달하는지 검증합니다.
- 서로 다른 사용자의 알레르기가 요청 간 섞이지 않는지 검증합니다.

#### `backend/tests/test_daily_diet_refresh_config.py`

- Cron/자동 갱신 설정에서 동일한 알레르기 전달 경로를 사용하는지 회귀 검증합니다.

### 구조 전환 시 추가로 확인할 파일

#### `backend/app/main.py`

- 기존 일일 생성 및 한 끼 재추천 API가 실제 Frontend에서 호출되는지 확인합니다.
- 주간 식단으로 통합할 경우 기존 일일 결과를 별도 생성하지 않도록 호출 흐름을 정리합니다.
- 사용자 알레르기 조회 실패 또는 이름 해석 실패를 빈 목록으로 조용히 처리하지 않습니다.

#### `backend/app/diet_refresh.py`

- 일일 자동 갱신을 계속 유지할지, 주간 식단 갱신으로 전환할지 결정합니다.
- 주간 식단으로 전환한다면 7일 28끼 저장·버전·재추천 정책을 우회하지 않습니다.

#### `backend/app/chat_model.py`

- 일반 채팅 어댑터이므로 식단 전용 DTO를 추가하는 방식은 권장하지 않습니다.
- 임시 보완 시에는 `diet_ai.py`가 만드는 비식별 JSON에 알레르기를 포함하고, `request_model()`의 범용 계약은 유지할 수 있습니다.
- 구조화 식단으로 전환하면 식단 생성에서 이 파일을 호출하지 않도록 합니다.

## 6. 변경하지 않아야 할 부분

- `backend/app/weekly_diet.py`의 `food_allergens` 전달은 이미 정상이라 제거하거나 우회하지 않습니다.
- AI Server의 `/recommend/diet`, `/recommend/diet/replace-meal`, `/recommend/diet/recipe` 계약을 `/chat` 형식에 맞춰 축소하지 않습니다.
- 알레르기 충돌 결과를 임의의 다른 음식으로 조용히 치환하지 않습니다.
- 알레르기 검사를 프롬프트에만 의존하지 않습니다.
- 실제 사용자 알레르기명이나 전체 요청·응답을 운영 로그에 남기지 않습니다.

## 7. 테스트 시나리오

### 단위 테스트

1. 사용자 알레르기 `우유`가 요청 데이터의 `food_allergens`에 포함됩니다.
2. `우유` 알레르기 사용자의 결과에 요거트·치즈·버터가 있으면 거부됩니다.
3. 사용자 알레르기 `대두`의 결과에 두부·콩·된장이 있으면 거부됩니다.
4. 커스텀 알레르기명이 그대로 전달됩니다.
5. 알레르기가 없으면 `food_allergens: []`가 전달됩니다.
6. 사용자 A와 사용자 B의 동시 요청에서 알레르기 값이 섞이지 않습니다.

### 회귀 테스트

- 주간 식단 요청에 기존 `food_allergens`가 계속 포함됩니다.
- 주간 한 끼 재추천에도 동일한 제한 조건이 유지됩니다.
- 알레르기와 기피 음식은 서로 다른 필드와 정책으로 처리됩니다.
- 냉장고 재료 중 알레르기 충돌 재료가 AI 요청 후보에서 제외됩니다.
- 알레르기 위반 응답이 저장되지 않습니다.

### 권장 실행 명령

```powershell
python -m pytest backend/tests/test_diet_ai.py -q
python -m pytest backend/tests/test_diet_refresh.py -q
python -m pytest backend/tests/test_daily_diet_refresh_config.py -q
python -m pytest backend/tests/test_weekly_diet.py -q
python -m pytest backend/tests/test_chat_model.py -q
```

## 8. 완료 기준

- [ ] 기존 일일 식단 AI 요청에 실제 `food_allergens`가 포함됩니다.
- [ ] 실제 알레르기명 외 개인정보는 AI Server에 전달되지 않습니다.
- [ ] Backend 사후 알레르기 검사가 유지됩니다.
- [ ] 일일 생성, 자동 갱신, 한 끼 재추천에 동일한 정책이 적용됩니다.
- [ ] 주간 식단의 기존 알레르기 전달에는 회귀가 없습니다.
- [ ] 알레르기 위반 결과가 저장되지 않습니다.
- [ ] 장기적으로 `/chat` 기반 식단 생성을 유지할지 주간 구조화 API로 통합할지 결정됩니다.

## 9. 담당자별 요청 사항

### Backend 담당자

1. 기존 일일 식단 API와 자동 갱신이 현재 Frontend/운영에서 실제 사용 중인지 확인해 주세요.
2. 사용 중이면 우선 `food_allergens` 전달을 보완해 주세요.
3. 최종적으로 주간 구조화 식단 API로 통합할 계획과 일정을 정해 주세요.
4. 위 테스트 결과와 수정된 실제 요청 예시를 개인정보 없이 공유해 주세요.

### AI Server 담당자

- 현재 주간 식단 API는 `food_allergens`를 이미 수용하고 있으므로 즉시 수정할 부분은 없습니다.
- Backend가 기존 `/chat` 경로를 유지하는 동안에는 질문에 포함된 비식별 `food_allergens`를 식단 생성 조건으로 처리합니다.
- 구조화 API 전환 후에는 `/chat`을 일반 대화 용도로만 유지합니다.

### Frontend 담당자

- 알레르기는 Backend가 인증된 사용자 데이터에서 조회하므로 식단 생성 요청마다 Frontend가 임의 문자열로 다시 보낼 필요는 없습니다.
- 사용자가 알레르기를 수정한 경우 저장 완료 후 식단을 새로 생성하도록 UX를 연결합니다.


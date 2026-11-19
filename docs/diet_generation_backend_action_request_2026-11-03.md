# 식단 생성 구조화 API 전환 요청 — Backend 담당자용

> 작성일: 2026-11-03
> 대상: Backend 개발 담당자
> 관련 기능: 주간 식단 생성, 한 끼 재추천, 자동 갱신
> 기준 명세: `docs/backend_ai_integration_spec.md`

## 1. 결론

식단 생성에 일반 채팅 API인 `POST /chat`을 사용하지 않고, 이미 구현된 식단 전용 API로 전환해야 합니다.

| 기능 | 사용해야 할 AI Server API |
|---|---|
| 7일 28끼 주간 식단 생성 | `POST /recommend/diet` |
| 한 끼 재추천 | `POST /recommend/diet/replace-meal` |
| 선택한 한 끼의 레시피 조회 | `POST /recommend/diet/recipe` |
| 일반 사용자 대화 | `POST /chat` |

`/chat`의 응답 형식을 식단 JSON에 맞게 변경하는 방식은 사용하지 않습니다. `/chat`은 일반 챗봇 호환 경로로 유지합니다.

## 2. 확인된 문제

2026-11-03 자동 갱신 시험에서 AI Server `/chat` 호출 88건은 모두 HTTP 200이었지만, Backend 검사에서 다음 23건이 탈락했습니다.

| 분류 | 건수 | 내용 |
|---|---:|---|
| 목표 열량 범위 이탈 | 10 | 음식별 열량 합계가 한 끼 목표의 85~115% 범위 밖 |
| 응답 형식 위반 | 9 | 허용하지 않은 `total_calories`, `quantity=0` 등 |
| 알레르기 위반 | 4 | 실제 사용자 알레르기가 AI 요청에 포함되지 않음 |

나머지 65건은 `/chat` 응답 이후 Backend 음식 목록 처리 단계에서 실패했습니다. AI Server 통신 장애와는 별개의 Backend 매핑 문제로 분리해서 확인해야 합니다.

## 3. 현재 흐름과 목표 흐름

### 현재 흐름

```text
Backend diet_ai.py
→ chat_model.py
→ AI Server POST /chat
→ 자유 형식 문자열 응답
→ JSON 문자열 추출
→ Backend Schema·열량·알레르기 검사
→ 저장 또는 탈락
```

### 목표 흐름

```text
Backend 주간 식단 요청
→ AI Server POST /recommend/diet
→ 공식 Food DB 기반 구조화 응답
→ Backend 계약 검증
→ 7일 28끼와 food item을 transaction으로 저장

Backend 한 끼 재추천 요청
→ AI Server POST /recommend/diet/replace-meal
→ 구조화된 한 끼 응답
→ 요청 슬롯 일치 여부 검증
→ 해당 슬롯만 transaction으로 교체
```

## 4. 필수 수정 사항

### 4.1 `/chat` 기반 식단 생성 제거

- `diet_ai.py → chat_model.py → /chat` 경로를 식단 생성에서 사용하지 않습니다.
- 문자열에서 JSON을 추출하는 식단 생성 로직을 최종 경로로 사용하지 않습니다.
- `/chat`은 일반 대화에만 사용합니다.
- 기존 일일 식단 자동 갱신 기능이 최종 제품에서 유지되는지 먼저 확인합니다.
- 주간 식단으로 완전히 대체된다면 일일 전용 API를 새로 만들지 않습니다.

### 4.2 실제 사용자 조건 전달

식단 전용 요청에는 다음 값을 구조화해 전달합니다.

- `metric_statuses`
- `food_allergens`
- `disliked_foods`
- `health_goal` 또는 기존 `goal_type`
- `sido`, `sigungu`, `nearby_regions`
- `meal_target.calories_kcal`
- `meal_target.carbohydrate_g`
- `meal_target.protein_g`
- `meal_target.fat_g`

사용자 이름, 이메일, 전화번호 등의 개인정보는 전달하지 않습니다. 알레르기명과 기피 음식명은 추천 안전성을 위해 필요한 최소 조건으로 전달합니다.

`meal_target`을 사용하는 경우 네 개 영양 목표를 모두 양수로 전달합니다. 계산하지 못한 경우 `0`으로 채우지 않고 `null`을 전달합니다.

### 4.3 Backend DTO 및 저장 매핑 변경

AI Server의 표준 음식 item 구조는 다음과 같습니다.

```json
{
  "food_name": "현미밥",
  "portion_g": 100.0,
  "calories_kcal": 165.0,
  "protein_g": 3.0,
  "fat_g": 1.0,
  "carbohydrate_g": 35.0
}
```

기존 `quantity`, `unit`, `calories`, `carbohydrates` 중심 DTO를 그대로 강제하지 말고 표준 필드를 수용하도록 매핑합니다.

특히 다음 값을 저장 과정에서 누락하지 않습니다.

- Meal의 `menu_name`
- `menu_description`
- `estimated_calories_kcal`
- `nutrition`
- `items`
- `guidance`
- 요일과 끼니 슬롯

`items`는 Recipe API의 제공량 scaling과 영양정보 보존에 필요하므로 메뉴명만 저장하면 안 됩니다.

### 4.4 한 끼 재추천 처리

`POST /recommend/diet/replace-meal` 요청 시 다음을 전달합니다.

- `target_day`
- `target_meal`
- `current_menu_name`
- `excluded_menu_names`
- `current_ingredients`
- 실제 사용자 조건
- 필요한 경우 `meal_target`

`excluded_menu_names`에는 현재 메뉴뿐 아니라 주간 식단에서 이미 사용한 메뉴도 포함합니다.

응답을 받은 뒤 다음을 확인합니다.

- 응답 `day`가 요청 `target_day`와 같은지
- 응답 `meal_type`이 요청 `target_meal`과 같은지
- 해당 슬롯 하나만 교체되는지
- 기존 다른 27끼 정보가 보존되는지

### 4.5 저장 전 최종 검증

Backend는 AI Server의 Food DB 계산을 다시 생성하지 않고 계약 검증과 저장 안전성 검사를 담당합니다.

- `portion_g > 0`
- 열량 및 탄단지가 음수가 아닌지
- 요청한 요일·끼니와 응답이 일치하는지
- `items`가 비어 있지 않은지
- 실제 사용자 알레르기와 충돌하지 않는지
- 주간 생성 응답이 7일 × 4끼인지
- 중복 메뉴 정책을 위반하지 않는지

검증 실패 결과를 조용히 버리지 말고 원인을 구분할 수 있는 Backend 오류 코드로 반환합니다.

### 4.6 음식 목록 실패 65건 점검

다음 항목을 로그와 실패 fixture로 확인합니다.

- 앞뒤 공백, 괄호, 구분자 등 음식명 정규화 차이
- AI Server 공식 Food DB 이름과 Backend 목록 이름의 차이
- 별칭 또는 동의어 처리 여부
- 목록에 없는 이름을 무조건 실패시키는지
- 동일 음식 식별을 이름 문자열에만 의존하는지

검증을 제거하거나 임의의 음식으로 치환하지 않습니다. 실패한 음식명과 매핑 단계만 개인정보 없이 기록해 정규화 또는 식별자 계약을 결정합니다.

### 4.7 재시도 정책 정리

구조화 API 전환 후 재시도는 다음과 같은 일시 오류에만 제한하는 것을 권장합니다.

- 연결 시간 초과
- AI Server 502/503
- 외부 서비스의 일시 장애

Schema 오류, 알레르기 위반 또는 동일한 잘못된 입력을 같은 조건으로 반복 요청하지 않습니다.

### 4.8 일반 `/chat` token usage 호환

AI Server의 일반 `/chat` 응답에는 OpenAI가 사용량을 제공한 경우 선택 필드 `usage`가 추가됩니다.

```json
{
  "answer": "일반 답변",
  "model": "configured-openai-model",
  "usage": {
    "input_tokens": 120,
    "cached_input_tokens": 20,
    "output_tokens": 80,
    "reasoning_tokens": 30,
    "total_tokens": 200
  }
}
```

Backend 응답 DTO가 엄격하다면 `usage`를 선택 필드로 허용합니다. 이 값은 비용 관측용이며 Frontend 사용자 화면에 전달할 필요가 없습니다. 식단 생성 자체는 계속 `/recommend/diet*`를 사용합니다.

## 5. Backend가 변경하지 않아야 하는 사항

- `/chat`을 식단 전용 응답으로 변경하지 않습니다.
- 열량 숫자만 수정하고 portion과 탄단지를 그대로 두지 않습니다.
- AI Server가 반환한 `items`를 메뉴명 하나로 축약하지 않습니다.
- 알레르기 목록을 일반적인 주요 알레르기 목록으로 대체하지 않습니다.
- AI Server API Key를 Frontend에 전달하지 않습니다.
- 응답 또는 요청 원문과 개인정보를 운영 로그에 남기지 않습니다.

## 6. 완료 조건

- [ ] 주간 식단 생성에서 `/chat` 호출이 0건이다.
- [ ] 주간 생성이 `/recommend/diet`를 호출한다.
- [ ] 한 끼 재추천이 `/recommend/diet/replace-meal`을 호출한다.
- [ ] 실제 `food_allergens`와 `disliked_foods`가 전달된다.
- [ ] 7일 28끼와 각 Meal의 `items`가 저장된다.
- [ ] 한 끼 재추천 시 대상 슬롯만 교체된다.
- [ ] `total_calories` extra field와 `quantity=0` 때문에 실패하지 않는다.
- [ ] 기존 음식 목록 실패 65건의 원인과 처리 결과가 확인된다.
- [ ] 실패 사유가 Backend 오류 코드로 구분된다.

## 7. 통합 재검증 요청

기존 88건 조건으로 다음 결과를 비교해 공유해 주세요.

- AI Server 호출 엔드포인트별 건수
- Backend Schema 탈락 건수
- 목표 열량 범위 탈락 건수
- 알레르기 탈락 건수
- 음식 목록 불일치 건수
- 최종 저장 성공 건수
- 평균 및 최대 응답 시간

AI Server의 전체 요청·응답 원문이나 실제 사용자 개인정보는 공유하지 않습니다.

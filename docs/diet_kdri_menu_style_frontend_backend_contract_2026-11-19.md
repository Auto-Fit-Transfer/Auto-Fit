# Auto-Fit KDRI 영양 목표·메뉴 스타일 연동 계약

- 작성일: 2026-11-19
- 적용 대상: Frontend `renewal-a`, Backend `back-end`, AI Server `ai`
- AI 기준 데이터: `data/nutrition_reference/kdri_2025_summary_ko.json`
- API 기준: AI Server 실행본의 `GET /openapi.json`

## 1. 변경 목적

이번 변경은 다음 두 기능을 기존 주간 식단·재추천 흐름에 추가한다.

1. 사용자 자료 보유 상태에 따라 `health_records` 또는 `basic_profile` 모드로 KDRI 2025 성인 기준을 적용한다.
2. 사용자가 선택한 메뉴 성향을 메인 식사 21끼에 반영한다.

기존 필드인 `health_goal`, `metric_statuses`, `food_allergens`, `disliked_foods`, `meal_target`은 그대로 재사용한다. 같은 의미의 새 필드를 만들지 않는다.

## 2. AI Server 반영 사항

### 2.1 신규 요청 필드

`POST /recommend/diet`와 `POST /recommend/diet/replace-meal`에 다음 필드가 추가되었다.

```json
{
  "nutrition_profile": {
    "profile_mode": "health_records",
    "age_years": 34,
    "sex": "male",
    "height_cm": 175.0,
    "weight_kg": 75.0,
    "data_sources": {
      "inbody_available": true,
      "health_checkup_available": true
    }
  },
  "reference_standard": "KDRI_2025",
  "menu_style_preference": "everyday"
}
```

허용값은 다음과 같다.

| 필드 | 허용값 |
|---|---|
| `profile_mode` | `health_records`, `basic_profile` |
| `sex` | `male`, `female` |
| `reference_standard` | `KDRI_2025` |
| `menu_style_preference` | `balanced`, `everyday`, `health_focused` |

현재 KDRI 식단 목표 기능은 만 19세 이상 120세 이하의 성인만 지원한다.

### 2.2 자료 모드 검증

- `health_records`
  - `inbody_available=true`
  - `health_checkup_available=true`
  - 두 조건을 모두 만족해야 한다.
- `basic_profile`
  - 두 자료가 모두 준비되지 않은 경우 사용한다.
  - 두 플래그가 모두 `true`이면 `health_records`를 사용해야 하므로 422가 발생한다.

원본 인바디·건강검진 문서 전체를 AI Server에 보내지 않는다. Backend가 정규화한 실제 측정 결과만 기존 `metric_statuses`로 전달한다.

### 2.3 영양 목표 우선순위

AI Server의 목표 결정 순서는 다음과 같다.

1. Backend가 보낸 유효한 `meal_target`
2. `nutrition_profile + KDRI_2025`로 산정한 목표
3. 기존 고정 기본 목표

기존 Backend가 신규 필드를 보내지 않으면 현재 기본 목표와 기존 식단 동작을 유지한다.

KDRI 요약표는 연령·성별 집단의 에너지 필요추정량과 영양 범위를 제공하며, 키·몸무게·활동량을 반영하는 개인 처방 공식은 아니다. 따라서 현재 AI Server는 다음과 같이 처리한다.

- 연령·성별: KDRI 성인 집단 선택에 사용
- 키·몸무게: 입력 출처 보존과 향후 확장용이며 현재 열량 계산에는 사용하지 않음
- 건강·체중 목표: 기존 `health_goal`을 후보 우선순위와 안내에 사용하며 임의의 열량 감량·증량값을 만들지 않음
- 개인별 처방 목표가 Backend에 이미 있으면 `meal_target`으로 보내며 이것이 최우선

단일 영양 목표가 필요한 현재 추천 엔진을 위해 다음 Auto-Fit MVP 정책을 사용한다. 이 값은 KDRI 원문 수치가 아니라 KDRI 성인 범위 안에서 선택한 프로젝트 정책이다.

| 항목 | Auto-Fit 정책 |
|---|---:|
| 탄수화물 에너지 비율 | 55% |
| 단백질 에너지 비율 | 20% |
| 지방 에너지 비율 | 25% |
| 아침·점심·저녁 각각 | 하루 목표의 30% |
| 간식 | 하루 목표의 10% |
| 정책 버전 | `autofit_kdri_balanced_v1` |

### 2.4 메뉴 스타일 규칙

스타일은 아침·점심·저녁 21끼에만 적용한다. 간식 7끼는 기존 알레르기·안전 간식 정책을 유지하며 스타일 비율에 포함하지 않는다.

| 요청값 | 일반식 | 건강식 | 간식 |
|---|---:|---:|---:|
| `balanced` | 17 | 4 | 7 |
| `everyday` | 21 | 0 | 7 |
| `health_focused` | 0 | 21 | 7 |

명시적으로 `everyday` 또는 `health_focused`를 선택하면 반대 스타일을 조용히 섞지 않는다. 후보가 적으면 같은 스타일 안에서 다양성 제한과 메뉴 중복 제한을 단계적으로 완화한다. 안전한 같은 스타일 후보가 하나도 없으면 503으로 실패한다.

우선순위는 항상 다음과 같다.

1. 알레르기와 건강 안전성
2. 사용자가 선택한 메뉴 스타일
3. 주간 다양성과 반복 제한
4. 같은 스타일 내 검증 메뉴 재사용
5. 후보가 없으면 실패

## 3. Backend 수정 계약

### 3.1 프로필 조립

Backend는 식단 생성 시 다음 우선순위로 최신 값을 조립한다.

- 나이·성별: 사용자 계정 프로필
- 키·몸무게: 최신 인바디 → 최신 건강검진 → 기본 프로필
- 건강목표: 기존 활성 `health_goal`
- 건강상태: 실제 자료에서 정규화한 `metric_statuses`

두 자료가 모두 있으면 `health_records`, 하나라도 없으면 `basic_profile`을 사용한다. 측정되지 않은 건강 수치는 정상으로 추정해서 보내지 않는다.

### 3.2 전체 주간 식단 요청

```json
{
  "nutrition_profile": {
    "profile_mode": "health_records",
    "age_years": 34,
    "sex": "male",
    "height_cm": 175.0,
    "weight_kg": 75.0,
    "data_sources": {
      "inbody_available": true,
      "health_checkup_available": true
    }
  },
  "reference_standard": "KDRI_2025",
  "menu_style_preference": "everyday",
  "metric_statuses": {
    "bmi": "high",
    "fasting_glucose": "normal"
  },
  "health_goal": {
    "goal_type": "fat_loss",
    "goal_text": null
  },
  "food_allergens": ["땅콩"],
  "disliked_foods": ["가지"],
  "meal_target": null,
  "sido": "서울특별시",
  "sigungu": "성동구",
  "nearby_regions": []
}
```

KDRI 계산을 사용하려면 `meal_target`을 생략하거나 `null`로 보낸다. Backend가 검증한 개인 목표가 있으면 완전한 네 가지 값으로 보낸다.

```json
{
  "meal_target": {
    "calories_kcal": 600.0,
    "protein_g": 35.0,
    "fat_g": 18.0,
    "carbohydrate_g": 75.0
  }
}
```

### 3.3 한 끼 재추천

`POST /recommend/diet/replace-meal`에도 최초 생성 당시의 다음 snapshot을 다시 전달해야 한다.

- `nutrition_profile`
- `reference_standard`
- `menu_style_preference`
- `metric_statuses`
- `health_goal`
- `food_allergens`
- `disliked_foods`
- `meal_target`

특히 `menu_style_preference`가 빠지면 기본값 `balanced`가 적용되어 최초 선택 스타일과 달라질 수 있다.

### 3.4 챗봇 식단 변경

`POST /chat/orchestrate`의 `context`에도 동일한 필드를 보낸다.

```json
{
  "context": {
    "nutrition_profile": {
      "profile_mode": "basic_profile",
      "age_years": 34,
      "sex": "male",
      "height_cm": 175.0,
      "weight_kg": 75.0,
      "data_sources": {
        "inbody_available": false,
        "health_checkup_available": false
      }
    },
    "reference_standard": "KDRI_2025",
    "menu_style_preference": "health_focused",
    "metric_statuses": {},
    "health_goal": {
      "goal_type": "maintenance",
      "goal_text": null
    },
    "food_allergens": [],
    "disliked_foods": [],
    "meal_target": null,
    "diet_summary": {}
  }
}
```

확인 대기 후 사용자가 승인하는 두 번째 요청에도 최신 `context`와 `pending_action`을 함께 보내야 한다. AI Orchestrator는 이 값을 기존 `ReplaceMealRequest`로 그대로 전달한다.

### 3.5 Backend 저장 권장 항목

주간 식단 생성 당시 다음 입력 snapshot을 함께 저장한다.

- `nutrition_profile`
- `reference_standard`
- `menu_style_preference`
- 실제 전달한 `meal_target` 또는 `null`
- `health_goal`
- 알레르기·기피 음식
- `metric_statuses`의 기준 시각
- 식단 생성 시각

프로필이나 알레르기, 건강목표가 바뀌어도 기존 식단을 조용히 수정하지 말고 재생성을 안내한다.

## 4. Frontend 수정 계약

### 4.1 선택 UI와 전송값

| 화면 선택 | Backend 전송값 |
|---|---|
| 일반식 | `everyday` |
| 건강식 | `health_focused` |

기존 사용자에게 저장값이 없으면 Backend 호환 기본값인 `balanced`를 사용한다. Frontend는 AI Server를 직접 호출하지 않고 Backend에 선택값만 전달한다.

### 4.2 화면 동작

- 선택값은 주간 식단을 다시 생성할 때까지 유지한다.
- 한 끼 재추천에서도 현재 식단의 스타일을 유지한다.
- 간식은 메뉴 스타일 선택과 무관하다는 점을 UI 문구에 반영할 수 있다.
- 422이면 입력값 또는 프로필 자료 상태를 다시 확인하도록 안내한다.
- 503이고 명시 스타일을 사용했다면 안전한 해당 스타일 후보가 부족할 수 있으므로 스타일 변경 또는 재시도를 안내한다.

## 5. 호환성

- 신규 필드는 모두 기존 호출을 깨지 않도록 optional 또는 기본값으로 추가되었다.
- `nutrition_profile` 없음: 기존 고정 영양 목표 사용
- `menu_style_preference` 없음: `balanced` 사용
- 기존 `goal_type`: 계속 지원하며 신규 `health_goal`이 우선
- Router와 Recipe Pipeline은 변경하지 않았다.
- 알레르기·기피 음식·공식 Food DB 영양 재검증 정책은 그대로 유지한다.

## 6. 배포 순서

1. AI Server 신규 Schema·Service 배포
2. 배포 서버 `GET /openapi.json` 확인
3. Backend 프로필 조립·선택값 저장·전달 배포
4. Frontend 선택 UI 배포
5. Backend → AI Server 통합 테스트
6. Frontend → Backend → AI Server E2E 테스트

## 7. 필수 통합 테스트

- 신규 필드가 없는 기존 요청이 기존 동작을 유지한다.
- 명시적 `meal_target`이 KDRI 계산보다 우선한다.
- `meal_target=null`과 유효한 프로필이면 연령·성별 KDRI 집단 목표를 사용한다.
- `health_records`인데 두 자료 중 하나라도 없으면 422다.
- `basic_profile`인데 두 자료가 모두 있다고 보내면 422다.
- `balanced` 메인 식사는 17:4다.
- `everyday` 메인 식사는 21:0이다.
- `health_focused` 메인 식사는 0:21이다.
- 모든 모드에서 간식은 7끼이며 총 28끼다.
- 직접 재추천과 챗봇 재추천이 최초 메뉴 스타일을 유지한다.
- 알레르기·기피 음식 필터가 메뉴 스타일보다 항상 우선한다.
- 잘못된 연령·성별·기준명·스타일은 422다.

## 8. 현재 제한

- 임신·수유 부가량은 KDRI JSON에 포함되어 있지만 요청 계약이 없으므로 현재 자동 적용하지 않는다.
- 활동량, 질환별 의료 처방, 키·몸무게 기반 개인 EER은 현재 산정하지 않는다.
- 실제 개인 처방 목표가 필요하면 Backend가 검증한 `meal_target`을 전달한다.
- 비용이 발생하는 OpenAI 실제 주간 생성 E2E는 별도 승인 후 수행한다.

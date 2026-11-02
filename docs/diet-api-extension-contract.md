# 식단·냉장고 API 확장 계약

상태: 로컬 구현·검증, 원격 Supabase 마이그레이션, 공유 서버 배포 완료
기준일: 2026-09-16

## 1. 범위

이번 확장은 다음 네 가지 화면 요구를 지원한다.

- 냉장고 재료 단건 수정과 삭제
- 추천 식단의 한 끼 재추천
- 특정 날짜의 추천 식단 조회
- 특정 날짜의 영양 목표와 실제 섭취량 조회

기존 `GET /api/diet/recommendations/latest`와 식사 피드백 API의 계약은 변경하지
않는다. 냉장고 다중 삭제와 추천 이력 버전 관리는 이번 범위에 포함하지 않는다.

## 2. 공통 정책

### 인증과 소유권

- 모든 API는 Supabase access token을 요구한다.
- `user_id`는 요청에서 받지 않고 검증된 JWT에서 결정한다.
- 다른 사용자 소유 리소스는 존재 여부를 노출하지 않고 `404`로 응답한다.
- 브라우저는 식단 테이블이나 RPC를 직접 호출하지 않고 FastAPI만 호출한다.

### 날짜와 시간대

- `date`와 `recommendation_date`는 `Asia/Seoul`의 달력 날짜로 해석한다.
- 서버의 오늘 날짜도 `Asia/Seoul`을 명시해 계산한다.
- `eaten_at`은 타임존이 포함된 ISO 8601 값으로 받고 DB에는 UTC로 저장한다.
- 일별 섭취량은 `[해당 날짜 00:00 KST, 다음 날 00:00 KST)` 범위를 UTC로
  변환해 조회한다.

### 공통 오류

기존 식단 API와 맞춰 FastAPI 기본 오류 형태인 `{"detail":"..."}`를 유지한다.

| HTTP | 의미 |
|---|---|
| 401 | 인증 정보가 없거나 유효하지 않음 |
| 404 | 리소스가 없거나 요청 사용자 소유가 아님 |
| 409 | 현재 리소스 상태에서는 요청을 처리할 수 없음 |
| 422 | UUID, 날짜, 요청 본문 등의 검증 실패 |
| 502 | Supabase 조회 또는 저장 실패 |

## 3. 냉장고 재료 수정

```http
PATCH /api/diet/inventory/{inventory_id}
```

요청 본문은 아래 필드 중 하나 이상을 포함한다. 전달하지 않은 필드는 유지하며,
명시적으로 `null`을 전달한 선택 필드는 비운다. `name`은 `null`로 변경할 수 없다.

```json
{
  "name": "두부",
  "quantity": 2,
  "unit": "모",
  "purchased_on": "2026-09-16",
  "expires_on": "2026-09-20"
}
```

성공 시 `200`과 수정된 항목을 반환한다.

```json
{
  "ok": true,
  "item": {
    "user_food_inventory_id": "00000000-0000-0000-0000-000000000000",
    "custom_name": "두부",
    "quantity": 2,
    "unit": "모",
    "purchased_on": "2026-09-16",
    "expires_on": "2026-09-20",
    "freshness_status": "fresh",
    "is_available": true
  }
}
```

- 구매일과 유통기한은 최종 저장 상태를 기준으로 검증한다.
- `freshness_status`는 서버가 KST 오늘 날짜를 기준으로 다시 계산한다.
- 삭제되었거나 존재하지 않거나 다른 사용자 소유인 항목은 `404`이다.

## 4. 냉장고 재료 삭제

```http
DELETE /api/diet/inventory/{inventory_id}
```

- 물리 삭제하지 않고 `is_available=false`로 변경한다.
- 삭제는 멱등하게 처리하며 성공 응답은 본문 없는 `204`이다.
- 이미 삭제된 ID, 존재하지 않는 ID, 다른 사용자 소유 ID도 `204`로 처리해 리소스
  존재 여부를 노출하지 않는다.
- 다중 삭제가 필요하면 프론트는 우선 단건 API를 병렬 호출한다. 별도 bulk API는
  실제 사용량과 실패 복구 요구가 확인된 뒤 추가한다.

## 5. 날짜별 추천 식단 조회

```http
GET /api/diet/recommendations?date=2026-09-16
```

- `date`는 필수이며 KST 달력 날짜이다.
- 같은 날짜에 추천이 여러 번 생성되었다면 `created_at`이 가장 최근인 추천을
  반환한다.
- 과거 화면 재현을 위해 추천 상태가 `active`, `completed`, `cancelled`인지와 관계없이
  가장 최근 버전을 조회한다.
- 각 끼니의 `used_ingredients[]`는 추천 생성 또는 재추천 당시 저장한 냉장고 재료
  스냅샷을 반환한다. 이후 현재 재고가 소진·수정·삭제되어도 과거 사용 재료는 유지된다.
- 스냅샷 도입 전 기존 끼니는 현재 사용 가능한 냉장고 재료와 음식명을 다시 매칭하는
  호환 로직을 사용한다.
- 추천이 없는 날짜는 `200`과 `{"result":null}`을 반환한다.
- 응답의 `result` 구조는 기존 `/recommendations/latest`와 동일하다.

## 6. 한 끼 재추천

```http
POST /api/diet/meals/{diet_meal_id}/regenerate
Content-Type: application/json

{}
```

### 처리 조건

- 요청 사용자 소유의 식사여야 한다.
- 상위 추천은 `active`, 해당 식사는 `recommended` 상태여야 한다.
- 이미 `completed`, `changed`, `skipped`가 된 식사는 `409`로 응답한다.
- 새 식단은 동일한 `meal_type`과 `meal_order`를 유지한다.
- 기존 `diet_meal_id`를 유지하고 음식 항목만 한 트랜잭션으로 교체한다.
- 새 식단은 기존 메뉴와 완전히 동일할 수 없으며 대표 음식이 달라야 한다.
- 새 식단의 열량은 기존 `recommended_calories`의 ±15% 범위를 목표로 한다.
- 사용 가능한 냉장고 재료가 있으면 재료명을 AI 입력의 `available_ingredients`로 전달하고,
  결과 음식명에서 실제 사용 여부를 다시 검증한다.
- 검증된 사용 재료는 해당 끼니의 `used_ingredients` 스냅샷으로 원자적으로 저장한다.
- 일일 영양 목표 값은 한 끼 재추천으로 변경하지 않는다.

성공 시 `200`과 갱신된 한 끼 전체를 반환한다.

```json
{
  "ok": true,
  "generator": "ai_v1",
  "meal": {
    "diet_meal_id": "00000000-0000-0000-0000-000000000000",
    "meal_type": "lunch",
    "meal_order": 2,
    "recommended_calories": 520,
    "recommendation_note": "냉장고 재료를 반영한 다른 점심 식단",
    "source_type": "ai_generated",
    "status": "recommended",
    "foods": []
  },
  "used_ingredients": [
    {
      "user_food_inventory_id": "00000000-0000-0000-0000-000000000000",
      "name": "두부",
      "matched_food_name": "두부구이",
      "quantity": 1,
      "unit": "모"
    }
  ]
}
```

AI가 비활성·응답 실패·계약 위반 상태이거나 사용 가능한 냉장고 재료를 결과에 반영하지
못하면 fallback 결과로 위장하지 않고 `503`으로 응답한다. DB 교체는 전용
`replace_diet_meal` RPC에서 수행하며, 부분 삭제나 부분 삽입이 남지 않도록 원자적으로
처리하고 `source_type`도 함께 갱신한다. 함수는 `security invoker`로 만들고
`PUBLIC`, `anon`, `authenticated`의 실행
권한을 회수한 뒤 `service_role`에만 실행 권한을 부여한다. 함수 내부에서도 JWT에서
확정된 `p_user_id`와 추천 소유권을 조건으로 확인한다.

## 7. 날짜별 영양 요약

```http
GET /api/diet/nutrition-summary?date=2026-09-16
```

- 목표량은 해당 날짜의 최신 식단 추천에서 가져온다.
- 섭취량은 해당 KST 날짜의 `recorded` 식사와 `meal_log_items`를 합산한다.
- `eaten`은 추천 음식의 복사본, `different_food`는 사용자가 입력한 실제 음식,
  `skipped`는 섭취량 0으로 반영한다.
- 추천이 없어도 섭취량은 계산하며 목표량은 `null`이다.
- 영양값이 비어 있는 식사 항목은 합계에서 제외하고 `has_unknown_items=true`로 알려
  프론트가 수치를 완전한 값으로 오인하지 않게 한다.

```json
{
  "summary": {
    "date": "2026-09-16",
    "has_recommendation": true,
    "has_unknown_items": false,
    "calories": {"consumed": 920, "target": 1650, "unit": "kcal"},
    "carbohydrates": {"consumed": 110, "target": 210, "unit": "g"},
    "protein": {"consumed": 52, "target": 85, "unit": "g"},
    "fat": {"consumed": 28, "target": 45, "unit": "g"}
  }
}
```

## 8. 구현 완료 조건

- 다섯 operation이 인증된 사용자 ID만 사용한다.
- KST 날짜 경계 테스트가 자정 전후와 UTC 날짜 변경 구간을 포함한다.
- 다른 사용자 UUID로 수정·조회·재추천할 수 없다.
- 재추천 RPC 실패 시 기존 식사와 음식 목록이 그대로 유지된다.
- OpenAPI, 입력 필드 참조, 프론트 인수인계 문서가 실제 구현과 일치한다.
- 백엔드 전체 테스트와 Supabase RPC 통합 검증을 통과한다.

## 9. 구현·배포 상태

| 항목 | 상태 |
|---|---|
| FastAPI 5개 operation 및 입력 검증 | 완료 |
| `replace_diet_meal` Supabase 마이그레이션 | 연결된 개발 Supabase 적용 완료 |
| 백엔드 회귀 테스트 | 원격 선행 변경 병합 후 296개 통과 |
| RPC 격리·권한·원자성 검증 | PGlite 기반 8개 통과 |
| OpenAPI·입력 참조·프론트 인수인계 문서 | 반영 완료 |
| 공유 서버 배포 | Render `dep-dal1u05bedkc73autnng`, 커밋 `007ea3d`, Live |
| 배포 API 스모크 검증 | `/health` 200, 신규 5개 경로 미인증 요청 401 확인 |
| 인증 사용자 실연동 | 25개 통과, 합성 사용자·데이터 정리 완료 |

`20260916042556_replace_diet_meal.sql`은 연결된 개발 Supabase에 적용됐고,
백엔드 코드는 `https://auto-fit-api-dev.onrender.com`에 배포됐다.
프론트엔드는 인증된 테스트 사용자로 성공 응답과 화면 상태를 최종 실연동한다.
백엔드 데이터 왕복 결과는 [배포 실연동 검증 결과](diet-integration-results.md)를 참고한다.
날짜별 조회·영양 요약·냉장고 수정/삭제는 새 RPC를 사용하지 않지만, 동일 릴리스로
배포해 API 계약 버전을 맞춘다.

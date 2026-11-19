# 운동 부위·건강점수 집계 Backend 인계

작성일: 2026-11-18
대상: Backend·Frontend·서버 운영 담당자

## 결론

AI Server 운동 추천 응답의 각 운동에 `body_regions`가 추가된다. Backend는 이 필드를 먼저 수용·검증·저장한 뒤 Frontend에 전달해야 한다. 건강점수 공식은 변경하지 않았으며, 원본 운동 세션의 주간 집계는 Backend 책임이다.

## 운동 추천 응답 변경

```json
{
  "exercise_key": "ex_846f603683467e",
  "name": "45도 바이시클 트위스트 크런치",
  "catalog_name_en": "45 Degree Bycicle Twisting Crunch",
  "exercise_modes": ["gym"],
  "body_regions": ["core"],
  "duration_minutes": 20,
  "intensity": "moderate",
  "instructions": ["복부에 힘을 유지하고 천천히 수행하세요."]
}
```

허용값:

- `upper_body`
- `core`
- `lower_body`
- `full_body`

정책:

- AI Server가 선택된 `exercise_key`의 CSV metadata로 결정하며 LLM이 생성하지 않는다.
- `focus_area_detail=Waist`는 `core`다.
- `full_body`는 독립 값이며 다른 부위에 중복 집계하지 않는다.
- 배열은 최소 1개다. 미분류 카탈로그 후보는 임의 값을 만들지 않고 추천을 실패 처리한다.
- 배열에 같은 값이 중복되거나 허용값 밖의 값이 있으면 계약 위반이다.

## Backend 반영 요청

1. AI 운동 추천 DTO에 `body_regions: string[]`를 추가한다.
2. 허용 enum과 중복 여부를 검증한다.
3. 운동 추천 항목 및 완료 기록과 연결될 수 있도록 저장한다.
4. 리포트용 응답에 원본 배열을 전달한다.
5. 기존 DTO가 추가 필드를 거부한다면 Backend를 AI Server보다 먼저 배포한다.
6. `full_body`를 상체·코어·하체에 자동 분산하지 않는다.

## 건강점수 주간 운동 집계

AI Server `/health-analysis`의 `input.score_context.weekly_exercise`에는 이미 다음 필드가 있다.

```json
{
  "goal_type": "body_fat_loss",
  "target_minutes": 90,
  "completed_minutes": 60,
  "target_days": 3,
  "completed_days": 2,
  "goal_aligned_completed_days": 2
}
```

AI Server는 원본 세션이나 항목을 집계하지 않는다. Backend가 아래 값을 계산해 전달한다.

- `completed_minutes`: 인정된 완료 운동 항목 시간 합계
- `completed_days`: 인정된 운동이 존재하는 Asia/Seoul 기준 고유 날짜 수
- `goal_aligned_completed_days`: 선택한 목표와 일치하는 완료 운동이 존재하는 날짜 수
- `goal_aligned_completed_days <= completed_days` 필수

권장 집계 기준:

- `completed`와 `stopped` 세션 모두에서 중단 전 실제 완료된 항목은 인정
- 미완료·건너뜀·0분 항목 제외
- 세트 기반 운동: `completed=true`, `completed_sets>=1`, `duration_minutes>=1`
- 시간 기반 운동: `completed=true`, `duration_minutes>=1`; 세트 수 불필요
- 중복 요청이나 같은 완료 기록을 두 번 합산하지 않음

세트 기반과 시간 기반을 구분하려면 Backend 카탈로그 또는 계획 항목에 `completion_metric=sets|duration`이나 동등한 metadata가 필요하다.

Backend 집계가 준비되지 않았으면 불완전한 `weekly_exercise`를 보내지 말고 객체 전체를 생략한다. 현재 하위 호환 기본값 때문에 일부 필드가 빠진 객체는 실제 0점으로 계산될 수 있다.

## 티어 +5점과의 구분

티어 +5점은 Backend 지급 정책이며 건강점수 집계와 별도다.

- 티어 지급: 완료 세션에서 같은 운동 항목이 Backend 지급 조건을 충족해야 함
- 건강점수: 주간 실제 수행량·수행일·목적 일치 수행일을 평가
- AI Server는 `409 TIER_SOURCE_INCOMPLETE`를 생성하거나 처리하지 않음

## 배포·E2E 순서

1. Backend DTO·DB·응답에 `body_regions` 추가
2. Backend 주간 운동 집계 구현
3. AI Server 배포
4. 운동 추천에서 `core/lower_body/full_body` 사례와 빈 배열 거부 확인
5. 완료 및 중도 종료 세션의 주간 집계 확인
6. `/health-analysis` 운동 점수 확인
7. Frontend 부위 리포트와 TestFlight 확인

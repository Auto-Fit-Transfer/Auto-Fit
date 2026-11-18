# A안 백엔드 연동 계약 및 남은 결정 (2026-11-18)

`back-end`의 +5점 검사 커밋 `8dbc61cf`는 원격에 푸시됐고 Backend CI #13이 통과했다. 운영 서버 배포 날짜와 반영 여부는 아직 확인되지 않았다. 아래 세 조회 API는 프론트엔드 제안을 사용자와 확정한 뒤 **로컬 `back-end` 작업 공간에만 구현**했다. `front-end`·`renewal-a`·`ai` 브랜치는 수정하지 않았다.

## +5점 응답

- `POST /api/tier/points/recommended_workout_completed/{session_id}`는 AI 추천 세션이 완료됐고, 같은 완료 운동 기록에 `completed_sets>=1`과 `duration_minutes>=1`이 있을 때만 적립한다. 기록 시간이 0분이면 기존 **HTTP 409 `TIER_SOURCE_INCOMPLETE`**를 반환한다. 새 거절 코드나 `awarded=false` 응답은 추가하지 않았다.
- `awarded=false`는 중복 `already_awarded`, 기간 한도 `period_limit`, 정책 기간 밖 `outside_policy_period`에 사용된다. 앱은 409 오류도 미지급 안내 대상으로 처리해야 한다. 이미 지급된 점수는 소급 취소하지 않는다.
- 앱의 운동 시간은 분 단위 반올림 값이므로 `duration_minutes>=1`은 실제 60초 이상을 뜻하지 않는다.

## 확정한 세 조회 API: 로컬 구현·미배포

### 티어 날짜·주간

`GET /api/tier/progress`는 기존 `progress` 객체를 유지하면서 `today_points: number`, `week: [{date: string, points: number}]`, `week_points: number`를 더한다. `week`는 한국 시간 월~일 순서의 7개 날짜이며 0점인 날도 포함한다. `week_points`는 그 7일의 합이다. 집계는 사용자 본인의 불변 점수 원장 `occurred_at`을 한국 시간으로 바꿔 수행한다. 과거에 잘못 적립된 +5점도 원장에 남으므로 집계에 포함된다.

날짜별 출처 합은 필드 이름과 분류를 더 맞춘 뒤 추가한다. 특히 `weekly_exercise_goal_met`와 `seven_day_logging_streak`를 네 요청 범주 중 어디에 넣을지 정해야 한다.

### 건강 점수 이력

`GET /api/health/scores/history?limit=12`는 본인의 평가를 최신순 배열로 반환한다. 기본 12건, 허용 범위 1~50건이다. 각 항목은 `health_assessment_id`, `assessed_at`, `measured_on`, `score`를 가진다. `measured_on`은 **원본 검진일이 아니라 평가 시각 `assessed_at`의 한국 시간 날짜**다. 같은 날 재평가가 여러 건일 수 있으므로 ID·평가 시각도 함께 제공한다. 기존 홈 응답의 최신·직전 점수는 유지한다.

### 주간 식단 요약

`GET /api/diet/summary/weekly?start=YYYY-MM-DD`의 `start`는 월요일이어야 한다. 응답은 `{"days": [...]}`이며 한국 시간 월~일 7개를 항상 반환한다. 각 원소는 현재 일일 `GET /api/diet/nutrition-summary`의 `summary`와 동일한 구조다. 즉 `date`, `has_recommendation`, `has_unknown_items`, `calories`, `carbohydrates`, `protein`, `fat`이며 영양소는 `{consumed, target, unit}` 형태다. 새 `recorded_meal_count`를 일일·주간 양쪽에 더했다. 월요일이 아닌 `start`는 422 `INVALID_WEEK_START`다.

프론트엔드 제안의 평면 `carbs`·`target_calories`는 실제 일일 응답에 없는 이름이므로 사용하지 않았다. 앱은 기존 `summary.calories.consumed`·`summary.protein.target` 접근을 `days[i]`에 그대로 적용할 수 있다.

## 퀘스트 정책: 확정, 구현 계약은 미정

- 물 6잔, 스트레칭 1회, 걸음 **6,000 이상** 달성 시 각각 한국 시간 기준 하루 한 번 +5점. 세 퀘스트 합계 하루 최대 +15점.
- 최근 14일 기기 기록을 서버에 옮기되 과거 날짜에 티어 점수는 소급 적립하지 않는다. 여러 기기의 걸음 기록은 그날의 최대값을 사용한다.
- 현재 운영 활성 티어 정책의 `challenge_completed`는 **이벤트당 +20점**이므로 그대로 퀘스트에 연결하면 위 규칙을 위반한다. 새 기록 테이블·중복 키·서버 측 점수 규칙과 앱 업로드 형식을 설계해야 한다. 앱이 신고한 걸음 수의 진위는 서버가 검증할 수 없으므로 그 신뢰 수준도 명시해야 한다.

## 다른 담당자와 맞출 사항

1. **이승현(프론트엔드·서버 운영)**: +5점 409 처리, 세 조회 API의 실제 일일 식단 구조 및 건강 `measured_on` 의미를 확인하고 앱 호출을 전환한다. `8dbc61cf` 운영 배포 날짜를 정해 공유한다. 퀘스트 업로드·14일 이관 요청/응답과 기기 간 병합 기준을 합의한다.
2. **이병희(AI)**: 운동별 부위 분류, 추천 운동 키와 구매 시범 영상 키의 매핑·배포 권리, 빈 자세 영상의 오류 코드를 확인한다.
3. **현호(백엔드)**: 세 조회 API를 검증한 뒤 `back-end` 커밋을 준비한다. 퀘스트 정책을 기존 +20점 규칙과 충돌하지 않게 별도 데이터·적립 계약으로 설계한다. 프로필 사진은 공개 범위와 교체·삭제 정책이 정해지면 전용 업로드 API를 만든다. 운동 영상은 권리·파일 목록 확정 뒤 비공개 만료 주소와 앱 내 재생 갱신 흐름을 연결한다.

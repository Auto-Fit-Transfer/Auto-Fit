# A안 주간 식단 기록·내일 맞추기 연동 (2026-11-19)

## 적용 범위와 선행 조건

- A안의 오늘 식단은 `GET /api/diet/weekly-recommendations?week_start_date=YYYY-MM-DD`의 주간 계획으로 통일한다. 계획이 없으면 앱에서 `이번 주 식단 짜기`를 안내한다. 기존 테스트 앱의 일일 추천·기록 API는 유지한다.
- 운영 AI의 주간 추천 응답에 생성 당시 실제 사용한 `daily_target`과 네 끼의 `slot_targets`가 있어야 한다. 각 객체에는 `calories_kcal`, `carbohydrate_g`, `protein_g`, `fat_g`가 필요하며 슬롯 네 개의 합은 하루 목표와 일치해야 한다. 현재 운영 AI에는 이 응답이 없으므로 `DIET_KDRI_ENABLED=false`를 유지한다. KDRI 생성에서 목표 응답이 빠지면 백엔드는 `AI_TARGET_MISSING`(502)으로 저장을 거절한다. 기존 계획에 목표가 없으면 내일 맞추기와 `source=weekly` 영양 목표 조회는 `DIET_TARGET_UNAVAILABLE`로 보류한다.
- `20261119042903_diet_menu_style_preference.sql`, `20261119055845_weekly_diet_feedback_and_rebalance.sql`, `20261119060843_diet_tomorrow_rebalance_preview.sql`을 순서대로 운영 DB에 적용한 뒤 새 백엔드를 배포한다. DB 적용과 서버 배포는 아직 하지 않았다. 서버 배포는 이승현 님 담당이다.

## 주간 끼니 기록

| 동작 | API | 주요 입력·출력 |
| --- | --- | --- |
| 전체 카드 기록 조회 | `GET /api/diet/weekly-recommendations/{plan_id}/feedback` | `feedback[]`에 A안 기록, `legacy_feedback[]`에 기존 일일 기록과 `diet_meal_id`·`meal_log_id` |
| 첫 기록 | `POST /api/diet/weekly-recommendations/{plan_id}/meals/{day}/{meal_type}/feedback` | `expected_version`, `feedback_type`, 선택적 `eaten_at`·`actual_items`; `201`과 `meal_log_id` |
| 기록 수정 | 같은 경로 `PATCH` | `expected_version`, `feedback_type`, 선택적 `eaten_at`·`actual_items`; 기존 기록 수정 |

`feedback_type`은 `eaten | different_food | skipped`이다. `different_food`에만 실제 음식 배열이 필요하다. `skipped`는 `meal_log_id=null`이고 섭취량에 더하지 않는다. 계획 버전이 바뀌면 `409 WEEKLY_DIET_VERSION_CONFLICT`가 난다. 사진은 기존 `POST /api/diet/meal-logs/{meal_log_id}/photo`를 재사용한다. 계획 소유권과 버전은 DB 트랜잭션 안에서도 검사한다.

`eaten_at`의 한국 날짜는 선택한 주간 계획의 `day`와 같아야 한다. 기본 시각은 현재 시각이므로 과거 날짜를 기록할 때는 앱이 실제 섭취 시각을 보낸다. 다르면 `422 WEEKLY_FEEDBACK_DATE_MISMATCH`다. 첫 기록 때의 메뉴를 `meal_snapshot`으로 보관하므로 이후 메뉴를 다시 추천해도 과거 식사 내용이 바뀌지 않는다. PATCH에는 현재 계획 버전을 넘기되, 응답의 `weekly_plan_version`은 처음 기록한 메뉴의 버전을 유지한다.

식단 탭의 영양 목표는 `GET /api/diet/nutrition-summary?date=YYYY-MM-DD&source=weekly`, 주간 막대는 `GET /api/diet/summary/weekly?start=YYYY-MM-DD&source=weekly`로 조회한다. `source` 생략 시 기존 일일 추천 목표를 유지한다. 주간 목표는 생성 시 저장한 값으로 고정되며 메뉴를 교체해도 변하지 않는다.

**전환기 중복 규칙:** 기존 일일 기록을 보존하고 A안의 `legacy_feedback[]`에서 같은 날짜·끼니를 `이미 기록됨`으로 표시한다. A안에서 다시 POST/PATCH 하면 `409 WEEKLY_FEEDBACK_LEGACY_EXISTS`다. 반대로 A안 기록이 먼저 있으면 기존 테스트 앱의 일일 피드백 POST/PATCH는 `409 DIET_WEEKLY_RECORD_EXISTS`로 막는다. DB의 사용자·날짜·끼니별 잠금으로 동시 요청도 직렬화한다. 기존 앱은 이 409 문구를 별도로 표시하지 않을 수 있으므로, 이승현 님이 기존 앱의 오류 안내 여부를 확인한다.

## 내일 맞추기

1. `GET /api/diet/tomorrow-rebalance/status`에서 한국 시간 오늘의 `consumed_kcal`, `exercise_burned_kcal`, `running_burned_kcal`, `total_burned_kcal`, `target_kcal`, `overage_kcal`, `decision`을 읽는다. `tomorrow_plan`은 다음 날의 주간 계획 ID와 버전을 따로 제공한다. 일요일에는 오늘과 내일의 계획 ID가 다를 수 있다.
2. 치팅 선택은 `POST /api/diet/tomorrow-rebalance/decision`에 `{ "decision": "cheat" }`를 보낸다. 서버가 한국 시간 오늘 날짜에 저장하고, 다른 기기에서도 다시 묻지 않는다.
3. 조절 선택은 `POST /api/diet/weekly-recommendations/{tomorrow_plan.weekly_diet_plan_id}/tomorrow-rebalance/preview`에 `{ "expected_version": 3, "meal_types": ["lunch", "dinner"] }`를 보낸다. 서버가 오늘의 `(섭취량 - 종료된 운동·러닝 소모량 - 저장된 하루 목표)` 중 양수만 초과량으로 계산한다. 고른 끼니에 초과량을 똑같이 나누되, 각 끼니 목표의 15%와 내일 하루 목표의 85% 하한 안에서만 AI에 감축을 요청한다.
4. 응답에는 내일 네 끼의 원래 메뉴·변경 메뉴·상태, 실제 감소량·미반영량, 하루 합계·목표·하한, `failed_meal_types`, `preview_id`, `expires_at`이 포함된다. AI 503인 끼니는 `unavailable`로 유지한다. 성공한 끼니가 하나도 없으면 `preview_id=null`이므로 확정 버튼을 비활성화하고 다시 시도한다.
5. 사용자가 확인한 뒤 `POST /api/diet/weekly-recommendations/{plan_id}/tomorrow-rebalance/confirm`에 `{ "preview_id": "..." }`를 보낸다. 유효한 10분 미리보기의 성공 끼니만 한 트랜잭션에서 반영하고 계획 버전을 올린다. 실패한 끼니는 그대로 둔다. 날짜·버전·소유권·하루 85% 하한을 DB에서 다시 확인한다. 미리보기 중 오늘 식사·운동 기록이나 목표가 바뀌면 저장·확정은 `409 DIET_REBALANCE_STATUS_CHANGED`로 거절하고 다시 조회한다.

오늘의 식사 항목 중 하나라도 열량이 없으면 `has_unknown_calories=true`, `overage_kcal=null`을 반환하고 치팅·미리보기를 `409 DIET_CALORIES_INCOMPLETE`로 보류한다. 목표가 없는 기존 주간 계획에도 임의의 목표를 만들지 않는다. 운동 소모량은 `completed`와 `stopped` 세션에 이미 기록된 열량을 합산하고, 러닝은 완료 세션의 열량을 합산한다.

## 담당자별 연동

- **이승현 님(프론트·운영):** 주간 계획을 오늘 식단 출처로 변경하고, 위 `source=weekly`와 피드백·상태·미리보기·확정 API에 연결한다. `legacy_feedback[]`가 있는 슬롯은 `이미 기록됨`으로 표시하고 중복 저장 버튼을 막는다. `tomorrow_plan`의 ID·버전을 사용한다. `preview_id=null`과 `DIET_TARGET_UNAVAILABLE`은 재시도/준비 중 상태로 표시한다. DB 적용 확인 후 백엔드를 배포한다.
- **이병희 님(AI):** 몸 상태가 회복된 뒤 주간 추천 응답에 실제 KDRI 하루 목표·끼니별 목표를 반환한다. 목표를 새로 계산하거나 메뉴 열량 합으로 대체하지 않는다. 현재 `replace-meal`의 `adjustment`와 15% 동작은 계약에 맞춰 사용한다.
- **김현호 님(백엔드·빌드):** 마이그레이션의 실제 PostgreSQL RPC 실행·권한·경합·롤백을 확인한다. 그 뒤 `back-end` 푸시와 운영 DB 적용 범위를 별도로 승인받아 진행한다.

## 검증 결과와 남은 확인

- 백엔드 시험 1,337개, Ruff, OpenAPI 스냅샷 검사를 통과했다.
- 실제 격리된 로컬 Supabase PostgreSQL 17에 기존 마이그레이션부터 위 신규 마이그레이션까지 순서대로 적용했다. 합성 계정으로 **일일→주간, 주간→일일** 동시 요청을 각각 선점시켜 한쪽만 성공하고 다른 쪽은 정해진 오류로 거절되는지 확인했다. 기존 일일 기록 조회, 30일 계획 삭제 뒤에도 주간 기록·실제 식사가 남고 중복 차단이 유지되는지, 미리보기만 지워지는지 확인했다.
- 같은 로컬 DB에서 중도 종료 운동 소모량, 열량 미확정 감지, 미리보기 뒤 오늘 식사 열량 변경 시 확정 롤백, 정상 확정의 계획 버전 상승, 인증 사용자 역할의 비공개 RPC 접근 거부, 합성 계정 삭제 연쇄를 확인했다. 계획의 메뉴를 바꾼 뒤 피드백을 수정해도 원래 식사 스냅샷과 기록 버전이 유지되고, 긴 소수 열량이 JSON/float를 거친 뒤 상태 확인에서 거짓 409를 만들지 않는 것도 확인했다. 임시 DB와 합성 데이터는 검증 뒤 제거했다.
- Python 시험에서 KST 일요일→월요일 계획 경계, AI 한 끼 503 시 성공 끼니만 저장, 버전 충돌과 타인 기록 차단을 확인했다. 실제 운영 DB 구조·운영 AI의 새 목표 응답·실기기 연결은 아직 확인하지 않았다. 운영 적용 뒤에도 같은 사례를 테스트 계정으로 재확인한다.

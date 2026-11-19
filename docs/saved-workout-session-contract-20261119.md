# A안 저장 루틴 운동 세션 연동 계약 (2026-11-19)

## 시작과 복구

- `POST /api/exercise/saved-routines/{routine_id}/start`는 로그인한 사용자의 활성 저장 루틴을 시작합니다. 요청 본문은 없습니다. 같은 루틴의 진행 중 세션이 있으면 그 세션과 시작 당시 고정한 항목을 반환합니다.
- 응답: `{ "ok": true, "result": { "session": { ... }, "items": [{ ... }] } }`.
- `GET /api/exercise/saved-routines/sessions/latest`는 `{ "result": null }` 또는 `{ "result": { "session": { ... }, "logs": [ ... ], "items": [ ... ] } }`입니다. `items`는 시작 당시의 항목이며, 루틴 원본을 나중에 수정해도 바뀌지 않습니다. 앱 재실행 시 이 응답만으로 진행 상태를 복구할 수 있습니다.
- `GET /api/exercise/sessions/latest`는 추천 운동 세션만 반환합니다. 기존 테스트 앱은 저장 루틴을 최근 추천 운동으로 오인하지 않습니다. 운동 결과·기록 목록에는 두 유형이 함께 남습니다.
- 계정당 진행 중인 운동은 한 번에 1개입니다. 같은 저장 루틴의 진행 중 세션은 재개할 수 있습니다. 다른 저장 루틴이 진행 중이면 409 `SAVED_ROUTINE_IN_PROGRESS`, AI 추천 운동과 저장 루틴이 겹치면 409 `EXERCISE_SESSION_IN_PROGRESS`를 반환합니다. 기존 테스트 앱이 폐기되기 전까지 두 앱에도 같은 규칙을 적용합니다. 이미 저장된 과거 기록은 수정하지 않습니다.

## 항목 ID와 기록

- `GET /api/exercise/saved-routines`의 `user_workout_routine_item_id`는 **루틴 원본 ID**입니다. 시작·복구 응답 `items[].exercise_item_id`는 세션별 복사본 ID이며 `items[].saved_routine_session_item_id`와 같습니다. 두 ID는 다릅니다.
- 항목 기록은 기존 `POST /api/exercise/sessions/{session_id}/items/{item_id}`를 사용합니다. `{item_id}`에는 반드시 시작·복구 응답의 `exercise_item_id`를 넣습니다. 원본 루틴 항목 ID를 넣으면 거절됩니다.
- 완료 기록에는 `completed=true`, `skipped=false`, 실제 경과 시간의 정수 `duration_minutes >= 1`을 보냅니다. 세트형은 `completed_sets >= 1`도 보내야 주간 건강 운동 집계에 포함됩니다. 세트형의 시작 항목 `duration_minutes`는 목표 시간이 없으므로 `null`일 수 있으며, 이를 완료 기록에 그대로 보내면 거절됩니다.
- 건너뛰기는 `completed=false`, `skipped=true`, `skip_reason`을 보냅니다. 모든 항목을 완료하거나 건너뛴 뒤 기존 `POST /api/exercise/sessions/{session_id}/complete`로 종료합니다.
- 운동 중 불편 기록의 `stop`·`continue`는 기존 주소를 재사용합니다. 저장 루틴에서 `adjust`는 409 `SAVED_ROUTINE_ADJUSTMENT_UNAVAILABLE`입니다.

## 점수와 표시

- 저장 루틴 세션의 `exercise_recommendation_id`는 `null`입니다. 추천 운동 전용 티어 +5점 요청을 보내지 않습니다. AI 운동 분석도 제공하지 않으며 요청 시 409 `SAVED_ROUTINE_ANALYSIS_UNAVAILABLE`입니다.
- 완료한 항목은 기존 운동 결과·주간 건강 운동 시간/일수에 포함됩니다. 세트형은 1세트 이상과 1분 이상, 시간형은 1분 이상 기록해야 집계됩니다. 추천을 저장한 루틴은 시작 당시 목표를 건강 목표 일치 여부에 사용하고, 직접 만든 루틴은 목표 일치 일수에 넣지 않습니다.
- 저장 루틴에는 검증된 소모 열량 계산이 없어 세션과 항목의 `calories_burned`는 0입니다. 측정값처럼 표시하지 않습니다. 시범 영상은 저장된 `demo_video_url`이 있을 때만 표시합니다.

## 적용 순서

1. 운영의 기존 `in_progress` 세션을 조회하고 실제 진행 중인지 확인합니다. 오래된 진행 중 세션도 새 시작을 막으므로, 필요하면 소유자 확인 뒤 별도 범위로 종료합니다. 이 마이그레이션은 기존 세션을 자동 변경하지 않습니다.
2. 운영 DB에 `20261119071137_saved_routine_sessions.sql` 적용.
3. 같은 커밋의 백엔드 배포. 마이그레이션 전에 새 코드를 배포하면 새 열·테이블 조회가 실패합니다.
4. 이승현 님이 A안에 시작·복구·항목 기록 연동, 저장 루틴의 +5점·AI 분석·`adjust` 숨김, 1분·1세트 안내를 적용한 뒤 실기기 확인.

이 문서는 연동 계약입니다. 운영 DB 적용·백엔드 배포·A안 화면 수정은 별도 작업입니다.

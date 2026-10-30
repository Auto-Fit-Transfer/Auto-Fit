# 네이버 공용 FastAPI 배포 인계 목록

기준일: 2026-10-30. 이 문서는 **배포 요청 자료**이며 네이버 서버를 변경하거나 담당자에게 전송한 기록이 아니다.

## 배포 대상과 비교 결과

- 배포 대상은 여러 FastAPI 서버가 아니라 **통합 앱 1개**인 `backend.app.main:app`과 그 라우터·의존성이다. 실행 예: `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT --no-server-header`.
- 로컬 `front_new` 작업본: 132개 경로, 169개 HTTP 동작. 네이버 공용 서버의 공개 `/openapi.json`(2026-10-30 조회): 104개 경로, 134개 동작. **네이버에 없는 동작 36개**다.
- 네이버에만 있는 `POST /api/diet/recommendations/generate-preview`는 로컬 통합 앱에 없다. 담당자는 이 경로의 실제 사용 여부를 확인하고 기존 동작이 사라지지 않도록 병합·유지해야 한다.
- 로컬 `front_new`의 `backend/`와 이 문서·전체 API 목록은 현재 **Git 미추적 파일**이다. `front_new`의 HEAD 커밋만 배포하면 아래 API가 포함되지 않는다. 코드와 마이그레이션을 검토해 **배포 가능한 커밋 또는 전달 패키지**를 먼저 확정해야 한다.
- [전체 API 목록](api-server-catalog-20261029.md)은 현재 로컬 앱의 경로·응답과 일치함을 다시 대조했다. 이 파일의 **서버 상태 설명과 Render 커밋 정보는 10월 29일 기준**이므로 배포 판단에는 사용하지 않는다. 중첩 필드 타입·필수 여부는 [OpenAPI JSON](api-server-openapi-20261029.json)을 사용한다.

## 네이버 서버에 없는 36개 동작과 성공 출력

`†`는 FastAPI `response_model`이 없어 OpenAPI가 중첩 응답을 보증하지 않는 동작이다. 표에는 현재 구현과 앱 타입에서 확인한 최상위 형식을 적었다. 경로 변수는 `{...}`로 표시한다.

| 영역 | 메서드와 경로 | 성공 코드·출력 형식 |
|---|---|---|
| 화면 설정 | `GET /api/app/preferences` | 200 `{preferences: {theme_mode, font_size_step, simple_mode_enabled}}` † |
| 화면 설정 | `PUT /api/app/preferences` | 200 `{preferences: {theme_mode, font_size_step, simple_mode_enabled}}` † |
| 알림 설정 | `GET /api/notifications/preferences` | 200 `{preferences: {diet_enabled, exercise_enabled, health_report_enabled, community_enabled, push_enabled, foreground_push_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end}}` † |
| 알림 설정 | `PUT /api/notifications/preferences` | 200, GET과 같은 `preferences` † |
| 건강 목표 | `GET /api/health/goals/active` | 200 `{goal: HealthGoal \| null}` † |
| 건강 목표 | `PUT /api/health/goals/active` | 200 `{goal: HealthGoal}` † |
| 건강 리포트 | `GET /api/health-report` | 200 `{period_start, target_weight_kg, body_compositions[], health_checkups[]}` † |
| 티어 | `GET /api/tier/progress` | 200 `{progress: {policy_version, points, tier_code, tier_name, sublevel, level_start_points, next_level_points}}` † |
| 티어 | `POST /api/tier/points/{event_code}/{source_id}` | 200 `{awarded: boolean, reason: string}` † |
| 건강 문서 | `DELETE /api/health-documents/{uploaded_file_id}` | 200 `DocumentDeletionResponse {uploaded_file_id, document_type, status, health_checkup_id, body_composition_id}` |
| 주간 식단 | `GET /api/diet/weekly-recommendations` | 200 `WeeklyPlanResponse {ok, weekly_diet_plan_id, week_start_date, timezone, version, generator, result, last_replacement}` |
| 주간 식단 | `GET /api/diet/weekly-recommendations/{plan_id}` | 200, 같은 `WeeklyPlanResponse` |
| 주간 식단 | `POST /api/diet/weekly-recommendations/generate` | 200, 같은 `WeeklyPlanResponse` |
| 주간 식단 | `POST /api/diet/weekly-recommendations/{plan_id}/meals/{day}/{meal_type}/regenerate` | 200, 같은 `WeeklyPlanResponse` |
| 레시피 | `GET /api/diet/meals/{diet_meal_id}/recipe` | 200 `{recipe: object \| null}` † |
| 저장 운동 | `GET /api/exercise/saved-routines` | 200 `{routines: SavedWorkoutRoutine[]}` † |
| 저장 운동 | `POST /api/exercise/saved-routines` | 201 `{routine: SavedWorkoutRoutine}` † |
| 자세 분석 | `GET /api/posture/jobs/{job_id}` | 200 `PostureJob {posture_analysis_job_id, status, analysis_stage, progress_percent, processed_frames, total_frames, detected_repetitions, ...}` † |
| 자세 분석 | `GET /api/posture/jobs/{job_id}/result` | 200 `PostureResult {job, assessment, repetitions[], findings[], routine_suggestions[]}` † |
| 러닝 기록 | `GET /api/running/sessions/active` | 200 `{session: RunningSession \| null}` † |
| 러닝 기록 | `GET /api/running/sessions/history` | 200 `{sessions: RunningSession[]}` † |
| 러닝 기록 | `POST /api/running/sessions` | 201 `{session: RunningSession}` † |
| 러닝 기록 | `POST /api/running/sessions/from-saved-course` | 201 `{session: RunningSession}` † |
| 러닝 기록 | `GET /api/running/sessions/{session_id}` | 200 `{session: RunningSession, points: RunningTrackPoint[], planned_course: RunningPlannedCourse \| null}` † |
| 러닝 기록 | `POST /api/running/sessions/{session_id}/points` | 200 `{accepted: boolean, reason?: string, session: RunningSession, point?: RunningTrackPoint}` † |
| 러닝 기록 | `POST /api/running/sessions/{session_id}/pause` | 200 `{session: RunningSession}` † |
| 러닝 기록 | `POST /api/running/sessions/{session_id}/resume` | 200 `{session: RunningSession}` † |
| 러닝 기록 | `POST /api/running/sessions/{session_id}/complete` | 200 `{session: RunningSession}` † |
| 커뮤니티 검색 | `GET /api/community/search` | 200 `CommunitySearchResult {posts[], routines[], users[], clubs[]}` |
| 내 활동 | `GET /api/community/my-activities` | 200 `{items[]}` † |
| 내 활동 | `GET /api/community/activity` | 200 `CommunityActivityPage {items[], next_cursor}` |
| 스크랩 | `GET /api/community/bookmarks` | 200 `CommunityFeedPage {items[], next_cursor}` |
| 스크랩 | `GET /api/community/posts/{post_id}/bookmark` | 200 `CommunityBookmarkState {post_id, bookmarked}` |
| 스크랩 | `PUT /api/community/posts/{post_id}/bookmark` | 200, 같은 `CommunityBookmarkState` |
| 스크랩 | `DELETE /api/community/posts/{post_id}/bookmark` | 200, 같은 `CommunityBookmarkState` |
| 마일리지 | `GET /api/community/mileage/monthly` | 200 `CommunityMileageMonthly {earned_this_month, earned_last_month, spent_this_month}` |

전체 169개 동작의 요청 본문, 성공 코드와 출력 형식은 [API 목록](api-server-catalog-20261029.md), 중첩 JSON Schema는 [OpenAPI JSON](api-server-openapi-20261029.json)에 있다. 현재 전체 동작 중 **78개는 OpenAPI 응답 스키마가 넓거나 비어 있어** 표의 `†`와 같은 구현 기반 설명이 필요하다.

## 기존 동작과 호환성

- 네이버와 로컬에 공통인 동작은 133개다. OpenAPI의 성공 응답 **최상위 선언**은 일치했지만, 공유 스키마 18개에는 필드·검증 차이가 있다. 특히 `CommunityPost`의 `category/tags/activity_snapshot`, `CommunityProfile`·`ProfileUpdateRequest`의 `bio`, 글쓰기 요청의 `category/exercise_session_id/tags`, 건강·식단 수치 입력 범위를 반영해야 한다.
- 요청은 대부분 `Authorization: Bearer <Supabase access_token>`이 필요하다. JSON은 `snake_case`; 사진·건강 문서 업로드는 `multipart/form-data`. `204` 응답에는 본문이 없다. 오류 형식은 현재 완전히 통일되지 않아 채팅·커뮤니티·건강 문서는 주로 `{detail: {code, message, fields}}`, 다른 경로는 `{detail: string | object}` 또는 FastAPI 검증 오류를 반환한다.
- 자세 분석은 현재 **저장된 작업·결과 조회 API만** 있다. 영상 업로드·AI 분석 작업 생성 API와 모델은 아직 없으므로 이 두 조회 경로만으로 자세 점검 전체 흐름이 동작한다고 안내하면 안 된다.
- `POST /internal/diet-refresh`는 OpenAPI에서 숨긴 운영 경로다. `X-Cron-Token`을 요구하며 성공 시 `{ok: true, succeeded: number, failed: number}`를 반환한다. 앱용 API가 아니다.

## 배포 전 담당자 확인 사항

1. 배포 커밋에 `backend/app/` 전체, `backend/requirements.txt`, 필요한 `supabase/migrations/`가 포함되었는지 확인한다. **기존 `backend` 브랜치나 `front_new` HEAD만으로는 이 통합 소스를 재현할 수 없다.**
2. 네이버가 사용하는 Supabase 프로젝트의 적용 이력을 조회하고, `supabase/migrations/`에서 **미적용분만** 순서대로 적용한다. 이미 적용된 마이그레이션을 재실행하지 않는다. 특히 주간 식단, 러닝 세션, 저장 운동, 티어, 자세 분석, 커뮤니티 검색·스크랩, 마이페이지 설정용 2026-10-20~29 마이그레이션을 대조한다.
3. 서버 전용 설정: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKEND_ALLOWED_HOSTS`, `FRONTEND_ORIGIN`; 기능별 `HEALTH_DOCUMENT_OCR_URL/TOKEN`, `AI_SERVER_ENABLED/BASE_URL/API_KEY`, `CHAT_AI_ENABLED/URL/API_KEY`, `FOOD_IMAGE_*`, `DIET_REFRESH_CRON_TOKEN`을 검토한다. 실제 값은 문서·Git에 적지 않는다. 운영 OCR에서는 샘플 응답 설정 `HEALTH_DOCUMENT_OCR_MOCK_ENABLED`를 확인한다.
4. `/health`, 운영 설정에 따라 `/openapi.json`, 인증 후 대표 경로의 응답·권한·DB 왕복을 확인한다. 네이버 전용 `generate-preview` 유지 여부도 확인한다.
5. 공용 앱의 기본 URL은 `https://211-233-206-193.sslip.io`다. Render 백업 API와 자동 전환은 별도 작업이다. 이 문서만으로 네이버 배포 완료나 두 서버 응답의 실호출 동등성이 입증되지는 않는다.

# Auto-Fit API 서버·응답 형식 목록 (2026-10-30)

이 문서는 GitHub `codex/render-backup-api` 브랜치의 `backend.app.main:app`에서 생성했다. 실제 서버별 데이터와 선택 기능은 환경변수·DB 마이그레이션 적용 상태에 따라 달라질 수 있다.

총 **132개 경로, 169개 HTTP 동작**. 전체 JSON Schema와 필드 타입·필수 여부는 [OpenAPI 원본](api-server-openapi-20261029.json)을 확인한다.

## 서버 역할

| 대상 | 역할 | 현재 확인된 연결/제약 |
|---|---|---|
| 네이버 공용 API | 앱 기본 API (`https://211-233-206-193.sslip.io`) | 서버 담당자 관리. 이 작업본은 아직 반영 여부 미확인. |
| Render `auto-fit-api-dev` | 백업·개발 API (`https://auto-fit-api-dev.onrender.com`) | 소스 브랜치 `codex/render-backup-api`; 배포 커밋과 상태는 Render Dashboard에서 확인한다. |
| Supabase | 두 API의 DB/Auth/Storage | 앱은 Supabase 로그인 토큰을 API에 전달한다. 마이그레이션 적용 상태는 별도 대조가 필요하다. |
| OCR 서버 | 건강 문서 판독 | `HEALTH_DOCUMENT_OCR_URL`로 연결. 연결 실패 또는 미설정 시 운영 응답 확인 필요. |
| AI 서버 | 식단·러닝 구조화 추천 | `AI_SERVER_ENABLED`/`AI_SERVER_BASE_URL`로 연결하는 선택적 외부 서버. 미설정 시 해당 기능 제한. |
| 채팅 AI | 건강 상담 답변 | `CHAT_AI_ENABLED`/`CHAT_AI_URL`로 연결하는 선택적 외부 서버. |
| 음식 이미지 생성기 | 레시피 이미지 | `FOOD_IMAGE_ENABLED=false`가 Render 기본값. |

## 공통 호출·응답 규칙

- 앱은 대부분의 `/api/*` 요청에 `Authorization: Bearer <Supabase access_token>`을 붙인다. 본문은 JSON이며 사진·문서 업로드만 `multipart/form-data`다.
- 성공 응답은 아래 표의 HTTP 상태와 JSON 형식이다. `204`는 본문이 없다. 목록의 `next_cursor`가 `null`이면 다음 페이지가 없다.
- 오류는 현재 완전히 통일되지 않았다. 채팅·커뮤니티·건강 문서는 대체로 `{'detail': {'code', 'message', 'fields'}}`, 그 외는 FastAPI 기본 `{'detail': string|object}` 또는 검증 오류 형식을 사용한다. 담당자는 기존 응답 모양을 유지해야 한다.
- **OpenAPI 미명세**는 실제 코드/프론트 타입에서 확인한 예상 키를 적은 것이다. JSON Schema로 보증되지 않으므로 서버 배포 전에 계약 테스트와 `response_model` 보강이 필요하다.

- OpenAPI에서 숨긴 운영 경로 `POST /internal/diet-refresh`는 `X-Cron-Token` 헤더를 사용하고 성공 시 `{ok: true, succeeded: number, failed: number}`를 반환한다. 일반 앱 호출용이 아니다. Render에서 별도 Cron 서비스를 만드는 설정은 현재 없다.
- `POST /api/test/roundtrip`은 Render 설정의 `ENABLE_TEST_ENDPOINTS=false`에서 사용할 수 없다.

## 엔드포인트별 출력 형식

### System (2)

| Method | Path | 요청 본문 | 성공 | 출력 형식 |
|---|---|---|---:|---|
| `GET` | `/health` | `없음` | 200 | JSON 객체 {status} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/test/roundtrip` | `RoundtripRequest` | 200 | JSON 객체 {message, ok, profile, received_at, user_id} **(OpenAPI 응답 필드 미명세)** |

### Profile (17)

| Method | Path | 요청 본문 | 성공 | 출력 형식 |
|---|---|---|---:|---|
| `DELETE` | `/api/account` | `없음` | 204 | 본문 없음 |
| `GET` | `/api/app/preferences` | `없음` | 200 | JSON 객체 **(OpenAPI 응답 필드 미명세)** |
| `PUT` | `/api/app/preferences` | `DisplayPreferencesInput` | 200 | JSON 객체 **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/notifications/preferences` | `없음` | 200 | JSON 객체 **(OpenAPI 응답 필드 미명세)** |
| `PUT` | `/api/notifications/preferences` | `NotificationPreferencesInput` | 200 | JSON 객체 **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/health/goals/active` | `없음` | 200 | JSON 객체 **(OpenAPI 응답 필드 미명세)** |
| `PUT` | `/api/health/goals/active` | `HealthGoalInput` | 200 | JSON 객체 **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/health-report` | `없음` | 200 | {period_start, body_compositions[], health_checkups[], target_weight_kg} **(OpenAPI 응답 미명세)** |
| `GET` | `/api/tier/progress` | `없음` | 200 | JSON 객체 **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/tier/points/{event_code}/{source_id}` | `없음` | 200 | {awarded: boolean, reason: string} **(OpenAPI 응답 미명세)** |
| `GET` | `/api/home` | `없음` | 200 | HomeResponse {user_name, health_score, score_change} |
| `GET` | `/api/profile` | `없음` | 200 | JSON 객체 {exercise_preferences, profile} **(OpenAPI 응답 필드 미명세)** |
| `PATCH` | `/api/profile` | `ProfileUpdateRequest` | 200 | JSON 객체 {ok, profile} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/allergies` | `없음` | 200 | JSON 객체 {catalog, selected} **(OpenAPI 응답 필드 미명세)** |
| `PUT` | `/api/allergies` | `AllergySelectionRequest` | 200 | JSON 객체 {ok, selected} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/onboarding/status` | `없음` | 200 | OnboardingStatusResponse {completed} |
| `POST` | `/api/onboarding/complete` | `CompleteOnboardingRequest` | 200 | JSON 객체 {already_completed, ok, profile} **(OpenAPI 응답 필드 미명세)** |

### health-documents (6)

| Method | Path | 요청 본문 | 성공 | 출력 형식 |
|---|---|---|---:|---|
| `POST` | `/api/health-documents` | `Body_upload_health_document_api_health_documents_post` | 201 | HealthCheckupDocumentResponse &#124; BodyCompositionDocumentResponse |
| `GET` | `/api/health-documents` | `없음` | 200 | DocumentListResponse {items, limit, offset, has_more} |
| `GET` | `/api/health-documents/{uploaded_file_id}` | `없음` | 200 | HealthCheckupDocumentResponse &#124; BodyCompositionDocumentResponse |
| `DELETE` | `/api/health-documents/{uploaded_file_id}` | `없음` | 200 | DocumentDeletionResponse {uploaded_file_id, document_type, status, health_checkup_id, body_composition_id} |
| `PATCH` | `/api/health-documents/{uploaded_file_id}/ocr-result` | `OCRResultUpdateRequest` | 200 | HealthCheckupDocumentResponse &#124; BodyCompositionDocumentResponse |
| `POST` | `/api/health-documents/{uploaded_file_id}/confirm` | `없음` | 200 | ConfirmationResponse {uploaded_file_id, document_type, status, health_checkup_id, body_composition_id, already_confirmed, file, health_data} |

### Health Analysis (5)

| Method | Path | 요청 본문 | 성공 | 출력 형식 |
|---|---|---|---:|---|
| `GET` | `/api/health-assessments/latest/popups` | `없음` | 200 | PopupResponse {assessment_id, calculation_version, body_composition_id, health_checkup_id, criteria_snapshot_available, metrics, interpretation, sources} |
| `GET` | `/api/health-assessments/{assessment_id}/popups` | `없음` | 200 | PopupResponse {assessment_id, calculation_version, body_composition_id, health_checkup_id, criteria_snapshot_available, metrics, interpretation, sources} |
| `GET` | `/api/health-assessments/input` | `없음` | 200 | AnalysisInputResponse {ready, missing, health_checkup, body_composition, diet_context} |
| `GET` | `/api/health-assessments/latest` | `없음` | 200 | MainAnalysisResponse {headline, summary, goal, strategy, key_metric_keys, recommendation_reasons, final_direction, diet_suggestion, refrigerator_context, assessment_id} |
| `POST` | `/api/health-assessments/{assessment_id}/diet-personalization/refresh` | `없음` | 200 | MainAnalysisResponse {headline, summary, goal, strategy, key_metric_keys, recommendation_reasons, final_direction, diet_suggestion, refrigerator_context, assessment_id} |

### Diet (18)

| Method | Path | 요청 본문 | 성공 | 출력 형식 |
|---|---|---|---:|---|
| `GET` | `/api/diet/weekly-recommendations` | `없음` | 200 | WeeklyPlanResponse {ok, weekly_diet_plan_id, week_start_date, timezone, version, generator, result, last_replacement} |
| `GET` | `/api/diet/weekly-recommendations/{plan_id}` | `없음` | 200 | WeeklyPlanResponse {ok, weekly_diet_plan_id, week_start_date, timezone, version, generator, result, last_replacement} |
| `POST` | `/api/diet/weekly-recommendations/generate` | `WeeklyGenerateRequest` | 200 | WeeklyPlanResponse {ok, weekly_diet_plan_id, week_start_date, timezone, version, generator, result, last_replacement} |
| `POST` | `/api/diet/weekly-recommendations/{plan_id}/meals/{day}/{meal_type}/regenerate` | `ReplaceWeeklyMealRequest` | 200 | WeeklyPlanResponse {ok, weekly_diet_plan_id, week_start_date, timezone, version, generator, result, last_replacement} |
| `POST` | `/api/diet/meal-logs/{meal_log_id}/photo` | `Body_post_photo_api_diet_meal_logs__meal_log_id__photo_post` | 201 | MealPhotoResponse {meal_log_id, image_storage_path, image_url, image_url_expires_in} |
| `GET` | `/api/diet/inventory` | `없음` | 200 | JSON 객체 {count, inventory} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/diet/inventory` | `FoodInventoryCreateRequest` | 201 | JSON 객체 {item, ok} **(OpenAPI 응답 필드 미명세)** |
| `PATCH` | `/api/diet/inventory/{inventory_id}` | `FoodInventoryUpdateRequest` | 200 | JSON 객체 {item, ok} **(OpenAPI 응답 필드 미명세)** |
| `DELETE` | `/api/diet/inventory/{inventory_id}` | `없음` | 204 | 본문 없음 |
| `GET` | `/api/diet/recommendations` | `없음` | 200 | JSON 객체 {result} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/diet/recommendations/latest` | `없음` | 200 | JSON 객체 {result} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/diet/meals/{diet_meal_id}/recipe` | `없음` | 200 | JSON 객체 {recipe} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/diet/nutrition-summary` | `없음` | 200 | JSON 객체 {summary} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/diet/recommendations/generate` | `GenerateDietRecommendationRequest` | 200 | JSON 객체 {generator, ok, result} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/diet/meals/{diet_meal_id}/regenerate` | `RegenerateDietMealRequest` | 200 | RegenerateDietMealResponse {ok, generator, meal, used_ingredients} |
| `POST` | `/api/diet/meals/{diet_meal_id}/feedback` | `DietMealFeedbackRequest` | 200 | JSON 객체 {ok, result} **(OpenAPI 응답 필드 미명세)** |
| `PATCH` | `/api/diet/meals/{diet_meal_id}/feedback` | `DietMealFeedbackUpdateRequest` | 200 | JSON 객체 {ok, result} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/diet/meal-logs` | `없음` | 200 | JSON 객체 {count, logs, period} **(OpenAPI 응답 필드 미명세)** |

### Exercise (22)

| Method | Path | 요청 본문 | 성공 | 출력 형식 |
|---|---|---|---:|---|
| `GET` | `/api/exercise/saved-routines` | `없음` | 200 | {routines: SavedWorkoutRoutine[]} **(OpenAPI 응답 미명세)** |
| `POST` | `/api/exercise/saved-routines` | `SaveRoutineInput` | 201 | {routine: SavedWorkoutRoutine} **(OpenAPI 응답 미명세)** |
| `GET` | `/api/exercise/preferences` | `없음` | 200 | JSON 객체 {preferences} **(OpenAPI 응답 필드 미명세)** |
| `PUT` | `/api/exercise/preferences` | `ExercisePreferencesRequest` | 200 | JSON 객체 {ok, preferences} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/exercise/recommendation-contexts/latest` | `없음` | 200 | JSON 객체 {context} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/exercise/recommendation-contexts` | `ExerciseRecommendationContextRequest` | 200 | JSON 객체 {context, ok} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/exercise/recommendations/latest` | `없음` | 200 | JSON 객체 {result} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/exercise/recommendations/generate` | `GenerateExerciseRecommendationRequest` | 200 | JSON 객체 {generator, ok, result} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/exercise/sessions/start` | `StartExerciseSessionRequest` | 200 | JSON 객체 {ok, result} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/exercise/sessions/{session_id}/items/{item_id}` | `ExerciseItemResultRequest` | 200 | JSON 객체 {ok, result} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/exercise/sessions/{session_id}/complete` | `CompleteExerciseSessionRequest` | 200 | JSON 객체 {ok, result} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/exercise/sessions/latest` | `없음` | 200 | JSON 객체 {result} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/exercise/sessions/{session_id}/discomfort` | `ExerciseDiscomfortRequest` | 200 | JSON 객체 {ok, result} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/exercise/sessions/{session_id}/discomfort` | `없음` | 200 | JSON 객체 {logs} **(OpenAPI 응답 필드 미명세)** |
| `PUT` | `/api/exercise/sessions/{session_id}/feedback` | `ExerciseSessionFeedbackRequest` | 200 | JSON 객체 {feedback, ok} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/exercise/sessions/{session_id}/feedback` | `없음` | 200 | JSON 객체 {feedback} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/exercise/sessions/{session_id}/analysis` | `없음` | 200 | JSON 객체 {analysis, result} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/exercise/goals/active` | `없음` | 200 | JSON 객체 {goal} **(OpenAPI 응답 필드 미명세)** |
| `PUT` | `/api/exercise/goals/active` | `ExerciseGoalRequest` | 200 | JSON 객체 {goal, ok} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/exercise/history` | `없음` | 200 | JSON 객체 {count, history, period} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/exercise/progress` | `없음` | 200 | JSON 객체 {progress} **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/exercise/summary` | `없음` | 200 | JSON 객체 {summary} **(OpenAPI 응답 필드 미명세)** |

### Posture Analysis (2)

| Method | Path | 요청 본문 | 성공 | 출력 형식 |
|---|---|---|---:|---|
| `GET` | `/api/posture/jobs/{job_id}` | `없음` | 200 | PostureJob: posture_analysis_job_id, status, analysis_stage, progress_percent, processed_frames, total_frames, detected_repetitions, ... **(OpenAPI 응답 미명세)** |
| `GET` | `/api/posture/jobs/{job_id}/result` | `없음` | 200 | PostureResult: job, assessment, repetitions[], findings[], routine_suggestions[] **(OpenAPI 응답 미명세)** |

### Running (19)

| Method | Path | 요청 본문 | 성공 | 출력 형식 |
|---|---|---|---:|---|
| `GET` | `/api/running/places/search` | `없음` | 200 | AI 원형 JSON 객체; AI 서버 응답 스키마 미확정 **(OpenAPI 응답 미명세)** |
| `GET` | `/api/running/courses/recommend` | `없음` | 200 | {status, courses[]}; 각 코스는 RunningCourse **(OpenAPI 응답 미명세)** |
| `GET` | `/api/running/courses/{course_id}` | `없음` | 200 | RunningCourse 또는 {course: RunningCourse}; selection_token 포함 **(OpenAPI 응답 미명세)** |
| `POST` | `/api/running/routes/preview` | `PreviewRequest` | 200 | {path: Coordinate[], distance_km, preview_token, ...AI 필드} **(OpenAPI 응답 미명세)** |
| `POST` | `/api/running/routes/generate-loop` | `GenerateRequest` | 200 | {status, candidates[]}; 후보에 selection_token 포함 **(OpenAPI 응답 미명세)** |
| `GET` | `/api/running/pace` | `없음` | 200 | {pace_minutes_per_km: number&#124;null, pace_source: string} **(OpenAPI 응답 미명세)** |
| `PUT` | `/api/running/pace` | `PaceRequest` | 200 | {pace_minutes_per_km: number, pace_source: 'user'} **(OpenAPI 응답 미명세)** |
| `GET` | `/api/running/saved-courses` | `없음` | 200 | {courses: RunningSavedCourse[]} **(OpenAPI 응답 미명세)** |
| `POST` | `/api/running/saved-courses` | `SaveCourseRequest` | 201 | RunningSavedCourse 객체 **(OpenAPI 응답 미명세)** |
| `PATCH` | `/api/running/saved-courses/{saved_id}/favorite` | `FavoriteRequest` | 200 | RunningSavedCourse 객체 **(OpenAPI 응답 미명세)** |
| `GET` | `/api/running/sessions/active` | `없음` | 200 | {session: RunningSession&#124;null} **(OpenAPI 응답 미명세)** |
| `GET` | `/api/running/sessions/history` | `없음` | 200 | {sessions: RunningSession[]} **(OpenAPI 응답 미명세)** |
| `POST` | `/api/running/sessions` | `StartFreeRun` | 201 | {session: RunningSession} **(OpenAPI 응답 미명세)** |
| `POST` | `/api/running/sessions/from-saved-course` | `StartSavedCourse` | 201 | {session: RunningSession} **(OpenAPI 응답 미명세)** |
| `GET` | `/api/running/sessions/{session_id}` | `없음` | 200 | {session: RunningSession, points: RunningTrackPoint[], planned_course: RunningPlannedCourse&#124;null} **(OpenAPI 응답 미명세)** |
| `POST` | `/api/running/sessions/{session_id}/points` | `TrackPointInput` | 200 | {accepted: boolean, reason?: string, session: RunningSession, point?: RunningTrackPoint} **(OpenAPI 응답 미명세)** |
| `POST` | `/api/running/sessions/{session_id}/pause` | `ElapsedInput` | 200 | {session: RunningSession} **(OpenAPI 응답 미명세)** |
| `POST` | `/api/running/sessions/{session_id}/resume` | `없음` | 200 | {session: RunningSession} **(OpenAPI 응답 미명세)** |
| `POST` | `/api/running/sessions/{session_id}/complete` | `ElapsedInput` | 200 | {session: RunningSession} **(OpenAPI 응답 미명세)** |

### Community (71)

| Method | Path | 요청 본문 | 성공 | 출력 형식 |
|---|---|---|---:|---|
| `GET` | `/api/community/search` | `없음` | 200 | CommunitySearchResult {posts, routines, users, clubs} |
| `GET` | `/api/community/feed` | `없음` | 200 | CommunityFeedPage {items, next_cursor} |
| `GET` | `/api/community/my-activities` | `없음` | 200 | JSON 객체 **(OpenAPI 응답 필드 미명세)** |
| `GET` | `/api/community/activity` | `없음` | 200 | CommunityActivityPage {items, next_cursor} |
| `GET` | `/api/community/bookmarks` | `없음` | 200 | CommunityFeedPage {items, next_cursor} |
| `POST` | `/api/community/images` | `Body_post_image_api_community_images_post` | 201 | CommunityUpload {upload_id, width, height} |
| `POST` | `/api/community/posts` | `CreatePostRequest` | 201 | CommunityPost {feed_item_id, feed_created_at, reposted_by, post_id, author, content, images, category, tags, activity_snapshot, like_count, comment_count, repost_count, liked_by_me, reposted_by_me, is_mine, created_at} |
| `GET` | `/api/community/posts/{post_id}` | `없음` | 200 | CommunityPost {feed_item_id, feed_created_at, reposted_by, post_id, author, content, images, category, tags, activity_snapshot, like_count, comment_count, repost_count, liked_by_me, reposted_by_me, is_mine, created_at} |
| `DELETE` | `/api/community/posts/{post_id}` | `없음` | 204 | 본문 없음 |
| `GET` | `/api/community/posts/{post_id}/bookmark` | `없음` | 200 | CommunityBookmarkState {post_id, bookmarked} |
| `PUT` | `/api/community/posts/{post_id}/bookmark` | `없음` | 200 | CommunityBookmarkState {post_id, bookmarked} |
| `DELETE` | `/api/community/posts/{post_id}/bookmark` | `없음` | 200 | CommunityBookmarkState {post_id, bookmarked} |
| `PUT` | `/api/community/posts/{post_id}/like` | `없음` | 200 | CommunityLikeState {post_id, liked, like_count} |
| `DELETE` | `/api/community/posts/{post_id}/like` | `없음` | 200 | CommunityLikeState {post_id, liked, like_count} |
| `PUT` | `/api/community/posts/{post_id}/repost` | `없음` | 200 | CommunityRepostState {post_id, reposted, repost_count} |
| `DELETE` | `/api/community/posts/{post_id}/repost` | `없음` | 200 | CommunityRepostState {post_id, reposted, repost_count} |
| `GET` | `/api/community/posts/{post_id}/comments` | `없음` | 200 | CommunityCommentPage {items, next_cursor} |
| `POST` | `/api/community/posts/{post_id}/comments` | `CreateCommentRequest` | 201 | CommunityComment {comment_id, post_id, author, content, created_at, is_mine, can_delete} |
| `DELETE` | `/api/community/comments/{comment_id}` | `없음` | 204 | 본문 없음 |
| `POST` | `/api/community/reports` | `ReportRequest` | 201 | CommunityReportResult {reported} |
| `GET` | `/api/community/blocks` | `없음` | 200 | CommunityBlockedUser[] |
| `PUT` | `/api/community/blocks/{user_id}` | `없음` | 200 | CommunityBlockState {user_id, blocked} |
| `DELETE` | `/api/community/blocks/{user_id}` | `없음` | 200 | CommunityBlockState {user_id, blocked} |
| `GET` | `/api/community/users/me` | `없음` | 200 | CommunityProfile {user_id, nickname, profile_image_url, bio, post_count, follower_count, following_count, is_me, followed_by_me, follows_me} |
| `GET` | `/api/community/users/{user_id}` | `없음` | 200 | CommunityProfile {user_id, nickname, profile_image_url, bio, post_count, follower_count, following_count, is_me, followed_by_me, follows_me} |
| `GET` | `/api/community/users/{user_id}/posts` | `없음` | 200 | CommunityFeedPage {items, next_cursor} |
| `GET` | `/api/community/users/{user_id}/followers` | `없음` | 200 | CommunityFollowPage {items, next_cursor} |
| `GET` | `/api/community/users/{user_id}/following` | `없음` | 200 | CommunityFollowPage {items, next_cursor} |
| `PUT` | `/api/community/follows/{user_id}` | `없음` | 200 | CommunityFollowState {user_id, following, follower_count} |
| `DELETE` | `/api/community/follows/{user_id}` | `없음` | 200 | CommunityFollowState {user_id, following, follower_count} |
| `GET` | `/api/community/notifications` | `없음` | 200 | CommunityNotificationPage {items, next_cursor} |
| `GET` | `/api/community/notifications/unread-count` | `없음` | 200 | CommunityUnreadCount {unread_count} |
| `POST` | `/api/community/notifications/read` | `없음` | 200 | CommunityUnreadCount {unread_count} |
| `GET` | `/api/community/mileage` | `없음` | 200 | CommunityMileage {balance, earned_today, rules} |
| `GET` | `/api/community/mileage/history` | `없음` | 200 | CommunityMileagePage {items, next_cursor} |
| `GET` | `/api/community/mileage/monthly` | `없음` | 200 | CommunityMileageMonthly {earned_this_month, earned_last_month, spent_this_month} |
| `GET` | `/api/community/membership` | `없음` | 200 | CommunityMembership {active, plan, source, expires_at, demo_available, demo_days} |
| `POST` | `/api/community/membership/demo` | `없음` | 200 | CommunityMembership {active, plan, source, expires_at, demo_available, demo_days} |
| `GET` | `/api/community/clubs` | `없음` | 200 | CommunityClubPage {items, next_cursor} |
| `POST` | `/api/community/clubs` | `CreateClubRequest` | 201 | CommunityCreatedClub {club_id, name, description, category, owner, member_count, post_count, is_member, is_owner, created_at, paid_with, mileage_spent} |
| `GET` | `/api/community/clubs/{club_id}` | `없음` | 200 | CommunityClub {club_id, name, description, category, owner, member_count, post_count, is_member, is_owner, created_at} |
| `PATCH` | `/api/community/clubs/{club_id}` | `CreateClubRequest` | 200 | CommunityClub {club_id, name, description, category, owner, member_count, post_count, is_member, is_owner, created_at} |
| `DELETE` | `/api/community/clubs/{club_id}` | `없음` | 204 | 본문 없음 |
| `PUT` | `/api/community/clubs/{club_id}/membership` | `없음` | 200 | CommunityClubMembershipState {club_id, joined, member_count} |
| `DELETE` | `/api/community/clubs/{club_id}/membership` | `없음` | 200 | CommunityClubMembershipState {club_id, joined, member_count} |
| `GET` | `/api/community/clubs/{club_id}/posts` | `없음` | 200 | CommunityFeedPage {items, next_cursor} |
| `POST` | `/api/community/clubs/{club_id}/posts` | `CreatePostRequest` | 201 | CommunityPost {feed_item_id, feed_created_at, reposted_by, post_id, author, content, images, category, tags, activity_snapshot, like_count, comment_count, repost_count, liked_by_me, reposted_by_me, is_mine, created_at} |
| `GET` | `/api/community/challenges` | `없음` | 200 | CommunityChallenge[] |
| `PUT` | `/api/community/challenges/{challenge_id}/participation` | `없음` | 200 | CommunityChallenge {challenge_id, title, description, metric, goal, starts_on, ends_on, reward_mileage, note, phase, participant_count, joined, progress, completed, rewarded, can_claim} |
| `DELETE` | `/api/community/challenges/{challenge_id}/participation` | `없음` | 200 | CommunityChallenge {challenge_id, title, description, metric, goal, starts_on, ends_on, reward_mileage, note, phase, participant_count, joined, progress, completed, rewarded, can_claim} |
| `POST` | `/api/community/challenges/{challenge_id}/claim` | `없음` | 200 | CommunityChallenge {challenge_id, title, description, metric, goal, starts_on, ends_on, reward_mileage, note, phase, participant_count, joined, progress, completed, rewarded, can_claim} |
| `GET` | `/api/community/rankings` | `없음` | 200 | CommunityRanking {metric, scope, week_start, week_end, participating, items, me} |
| `PUT` | `/api/community/rankings/participation` | `없음` | 200 | CommunityRankingParticipation {participating} |
| `DELETE` | `/api/community/rankings/participation` | `없음` | 200 | CommunityRankingParticipation {participating} |
| `GET` | `/api/community/clubs/{club_id}/members` | `없음` | 200 | CommunityClubMemberPage {items, next_cursor} |
| `DELETE` | `/api/community/clubs/{club_id}/members/{member_user_id}` | `없음` | 200 | CommunityClubMemberCount {club_id, member_count} |
| `GET` | `/api/community/moderation/status` | `없음` | 200 | CommunityModeratorStatus {is_moderator} |
| `GET` | `/api/community/moderation/reports` | `없음` | 200 | CommunityReportItem[] |
| `POST` | `/api/community/moderation/actions` | `ModerationRequest` | 200 | CommunityModerationResult {target_type, target_id, action} |
| `GET` | `/api/community/conversations` | `없음` | 200 | CommunityConversationPage {items, next_cursor} |
| `POST` | `/api/community/conversations` | `OpenConversationRequest` | 200 | CommunityConversation {conversation_id, other, last_message, last_message_at, unread_count, can_send} |
| `GET` | `/api/community/conversations/unread-count` | `없음` | 200 | CommunityUnreadCount {unread_count} |
| `GET` | `/api/community/conversations/{conversation_id}/messages` | `없음` | 200 | CommunityMessagePage {items, next_cursor} |
| `POST` | `/api/community/conversations/{conversation_id}/messages` | `SendMessageRequest` | 201 | CommunityMessage {message_id, conversation_id, content, created_at, is_mine} |
| `POST` | `/api/community/conversations/{conversation_id}/read` | `없음` | 200 | CommunityConversationRead {conversation_id, unread_count} |
| `DELETE` | `/api/community/messages/{message_id}` | `없음` | 204 | 본문 없음 |
| `GET` | `/api/community/admin/challenges` | `없음` | 200 | CommunityAdminChallenge[] |
| `POST` | `/api/community/admin/challenges` | `SaveChallengeRequest` | 201 | CommunityAdminChallenge {challenge_id, title, description, metric, goal, starts_on, ends_on, reward_mileage, enabled, note, participant_count, rewarded_count, locked} |
| `PUT` | `/api/community/admin/challenges/{challenge_id}` | `SaveChallengeRequest` | 200 | CommunityAdminChallenge {challenge_id, title, description, metric, goal, starts_on, ends_on, reward_mileage, enabled, note, participant_count, rewarded_count, locked} |
| `GET` | `/api/community/admin/rules` | `없음` | 200 | CommunityAdminRule[] |
| `PATCH` | `/api/community/admin/rules/{rule_key}` | `UpdateRuleRequest` | 200 | CommunityAdminRule {rule_key, amount, daily_limit, enabled, note, starts_at, updated_at} |

### Chat (7)

| Method | Path | 요청 본문 | 성공 | 출력 형식 |
|---|---|---|---:|---|
| `POST` | `/api/chats/health-score-preview` | `HealthScorePreviewRequest` | 200 | JSON 객체 {answer} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/chats/answer-preview` | `ChatAnswerPreviewRequest` | 200 | JSON 객체 {answer} **(OpenAPI 응답 필드 미명세)** |
| `POST` | `/api/chats` | `CreateChatRequest | null` | 201 | {chat: Chat} **(OpenAPI 응답 미명세)** |
| `GET` | `/api/chats` | `없음` | 200 | {chats: Chat[], has_more: boolean, next_cursor: string&#124;null} **(OpenAPI 응답 미명세)** |
| `PATCH` | `/api/chats/{chat_id}` | `UpdateChatRequest` | 200 | {chat: Chat} **(OpenAPI 응답 미명세)** |
| `GET` | `/api/chats/{chat_id}/messages` | `없음` | 200 | {chat_id, messages: ChatMessage[], has_more, next_cursor} **(OpenAPI 응답 미명세)** |
| `POST` | `/api/chats/{chat_id}/messages` | `ChatMessageRequest` | 201 | {chat, user_message: ChatMessage, assistant_message: ChatMessage, is_replay} **(OpenAPI 응답 미명세)** |

## 배포 전 확인할 계약 공백

- 응답 스키마가 넓은 `object`이거나 없는 동작: **78개**. 특히 러닝 AI 5개 경로는 외부 AI 원형 JSON을 일부 통과시켜 필드 계약이 고정되지 않았다.
- 자세 분석 AI 모델은 아직 없다. `GET /api/posture/jobs/{job_id}`와 `/result`는 저장된 작업/결과를 읽는 API이며, 영상 업로드·분석 작업 생성 API는 이 목록에 없다.
- Render와 네이버가 동일한 응답 형식을 내려면 같은 검증된 코드 버전, DB 마이그레이션, 환경변수 설정이 필요하다. 현재 자동 장애 전환은 없다.
- 네이버 담당자에게 전달할 때는 이 목록과 OpenAPI JSON, 검증된 배포 커밋, 마이그레이션 적용 목록, 인증 실호출 결과를 함께 보낸다. 비밀키 값은 포함하지 않는다.

# Auto-Fit 전체 API 입력 필드 참조

기존 자동 추출 목록: 2026-09-16. 현재 로컬 OpenAPI는 총 60개 operation이다. 아래 종합 분석 조회·냉장고 개인화 갱신 입력을 추가했으며 기존 업로드·식단 사진 입력은 해당 API 계약을 함께 참고한다. 실제 서버 배포 상태를 보증하지 않는다.

인증·호출 순서·응답 형태·추가 검증은 [프론트엔드 협업 안내](frontend-api-handoff.md), 원본은 [openapi.json](openapi.json)을 참고한다.

주의: 코드가 일반 Header로 인증을 받으므로 OpenAPI의 Authorization optional 표시는 인증 면제를 뜻하지 않는다. /health 외 모든 API에는 유효한 Bearer 토큰이 필요하다. 응답 스키마의 object는 아직 구체적인 응답 타입이 없음을 뜻한다.

## GET /api/health-assessments/input

인증 헤더 `Authorization: Bearer <token>` 필수. 요청 본문·쿼리 없음.
확정 저장된 본인의 최신 건강검진·인바디·사용 가능한 냉장고 재료·알레르기를 한 번에 반환한다. `ready`는 두 건강 자료가 모두 있을 때만 true이며, 없는 자료는 `missing`에 `health_checkup` 또는 `body_composition`으로 표시한다. `diet_context`에는 KST 기준으로 만료·수량 0·사용 불가 재료를 제외한 스냅샷 입력이 들어간다. `user_id`, `raw_data`는 반환하지 않는다. 상태 코드: 200, 401, 502.

## POST /api/health-assessments/{assessment_id}/diet-personalization/refresh

경로의 `assessment_id`와 인증 헤더가 필수이며 요청 본문은 없다. 기존 건강 분석은 유지하고 현재 냉장고·알레르기를 평가 스냅샷에 저장한 뒤 맞춤 제안을 갱신한다. 응답은 `MainAnalysisResponse`. 상태 코드: 200, 401, 404, 409, 422, 502.

## GET /api/health-assessments/latest

인증 헤더 `Authorization: Bearer <token>` 필수. 요청 본문·쿼리 없음.
응답은 `MainAnalysisResponse`. 상태 코드: 200, 401, 404, 502.
[저장값 우선순위·임시 문구 생성 조건·응답 계약](main-analysis-api-contract.md) 참고.

## GET /api/health-assessments/latest/popups

인증 헤더 `Authorization: Bearer <token>` 필수. 요청 본문·쿼리 없음.
응답은 `PopupResponse`. 상태 코드: 200, 401, 404, 502.

## GET /api/health-assessments/{assessment_id}/popups

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | assessment_id | 예 | string(uuid) | 본인 건강 평가 ID |
| header | Authorization | 예 | string | Bearer 토큰 |

요청 본문 없음. 응답은 `PopupResponse`. 상태 코드: 200, 401, 404, 422, 502.
Swagger Authorize 사용 가능. [응답·판정 스냅샷 계약](analysis-popup-api-contract.md) 참고.

## GET /health

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/test/roundtrip

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **RoundtripRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/profile

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## PATCH /api/profile

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **ProfileUpdateRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/allergies

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## PUT /api/allergies

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **AllergySelectionRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/onboarding/complete

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **CompleteOnboardingRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/preferences

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## PUT /api/exercise/preferences

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **ExercisePreferencesRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/recommendation-contexts/latest

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/exercise/recommendation-contexts

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **ExerciseRecommendationContextRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/recommendations/latest

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/exercise/recommendations/generate

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **GenerateExerciseRecommendationRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/exercise/sessions/start

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **StartExerciseSessionRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/exercise/sessions/{session_id}/items/{item_id}

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | session_id | 예 | string (uuid) | — |
| path | item_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **ExerciseItemResultRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/exercise/sessions/{session_id}/complete

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | session_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **CompleteExerciseSessionRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/sessions/latest

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/exercise/sessions/{session_id}/discomfort

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | session_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **ExerciseDiscomfortRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/sessions/{session_id}/discomfort

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | session_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## PUT /api/exercise/sessions/{session_id}/feedback

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | session_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **ExerciseSessionFeedbackRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/sessions/{session_id}/feedback

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | session_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/sessions/{session_id}/analysis

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | session_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/goals/active

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## PUT /api/exercise/goals/active

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **ExerciseGoalRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/history

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| query | from_date | 예 | string (date) | — |
| query | to_date | 예 | string (date) | — |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/progress

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| query | period | 아니오 | string | enum=["week","month","three_months"]; default="month" |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/exercise/summary

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/diet/inventory

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/diet/inventory

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **FoodInventoryCreateRequest**

OpenAPI에 명시된 상태 코드: 201, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## PATCH /api/diet/inventory/{inventory_id}

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | inventory_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **FoodInventoryUpdateRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## DELETE /api/diet/inventory/{inventory_id}

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | inventory_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 204, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/diet/recommendations

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| query | date | 예 | string (date) | — |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

응답의 `result.meals[].feedback`은 피드백이 없으면 null이며, 있으면
`feedback_type`(`eaten`, `different_food`, `skipped`)과 관련 피드백 정보를 포함합니다.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/diet/recommendations/latest

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

응답의 `result.meals[].feedback`은 피드백이 없으면 null이며, 있으면
`feedback_type`(`eaten`, `different_food`, `skipped`)과 관련 피드백 정보를 포함합니다.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/diet/nutrition-summary

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| query | date | 예 | string (date) | — |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/diet/recommendations/generate

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **GenerateDietRecommendationRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/diet/meals/{diet_meal_id}/regenerate

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | diet_meal_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **RegenerateDietMealRequest**

성공 응답은 `generator: "ai_v1"`, `meal.source_type: "ai_generated"`와
`used_ingredients[]`를 포함한다. 각 사용 재료에는 inventory ID, 보유량/단위,
AI 계획량/단위 및 비교 가능한 경우의 보유량 충족 여부가 포함된다.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·AI·DB 오류는 협업 안내 참고.

## POST /api/diet/meals/{diet_meal_id}/feedback

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | diet_meal_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **DietMealFeedbackRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## PATCH /api/diet/meals/{diet_meal_id}/feedback

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | diet_meal_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **DietMealFeedbackUpdateRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/diet/meal-logs

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| query | from_date | 예 | string (date) | — |
| query | to_date | 예 | string (date) | — |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/chats/health-score-preview

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **HealthScorePreviewRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/chats/answer-preview

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **ChatAnswerPreviewRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/chats

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 생략 가능, 타입: **CreateChatRequest 또는 null**

OpenAPI에 명시된 상태 코드: 201, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/chats

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| query | status | 아니오 | string 또는 null | — |
| query | limit | 아니오 | integer | maximum=50; minimum=1; default=20 |
| query | cursor | 아니오 | string 또는 null | — |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## PATCH /api/chats/{chat_id}

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | chat_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **UpdateChatRequest**

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## GET /api/chats/{chat_id}/messages

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | chat_id | 예 | string (uuid) | — |
| query | limit | 아니오 | integer | maximum=100; minimum=1; default=30 |
| query | before | 아니오 | string 또는 null | — |
| header | authorization | 아니오 | string 또는 null | — |

요청 본문 없음.

OpenAPI에 명시된 상태 코드: 200, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/chats/{chat_id}/messages

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | chat_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | — |

JSON 본문: 필수, 타입: **ChatMessageRequest**

OpenAPI에 명시된 상태 코드: 201, 422. 런타임 인증·상태·DB 오류는 협업 안내 참고.

## POST /api/health-documents

`multipart/form-data` 본문:

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| file | 예 | binary | PDF, PNG, JPEG, HEIC; 파일 자체 최대 10 MiB |
| original_file_name | 아니오 | string | 사용자 원본 파일명, 최대 255자; 생략 시 multipart 파일명 |
| document_type | 아니오 | string 또는 null | 생략 시 파일 내용으로 서버 자동 판별; enum=["health_checkup","body_composition"] |

OpenAPI에 201, 401, 404, 409, 413, 415, 422, 502와 오류 스키마를 정의한다.
응답 타입·단위·호출 흐름은 [건강 문서 API](health-documents-api.md)를 참고한다.

## GET /api/health-documents/{uploaded_file_id}

| 위치 | 이름 | 필수 | 타입 | 조건 |
|---|---|---|---|---|
| path | uploaded_file_id | 예 | string (uuid) | — |
| header | authorization | 아니오 | string 또는 null | 실제 호출에는 Bearer 토큰 필수 |

## PATCH /api/health-documents/{uploaded_file_id}/ocr-result

경로·인증은 위와 동일하다. JSON 본문은 `OCRResultUpdateRequest`이며
`extracted_data`에 문서 유형별 수정 항목만 보낸다. 생략한 항목은 유지하고 null은 값을 비운다.
정의되지 않은 필드는 거부하며 확정된 문서 수정은 409다.

## POST /api/health-documents/{uploaded_file_id}/confirm

경로·인증은 위와 동일하며 JSON 본문은 보내지 않는다. 건강검진은 `checkup_date`,
체성분은 `measured_at`이 임시 결과에 있어야 한다.

## 본문 타입 필드

기본값이 명시되지 않은 선택 필드는 서버 default_factory를 사용할 수 있다. 사용자 정의 검증은 아래 표에 자동 표현되지 않는다.

### AllergySelectionRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| allergy_type_ids | 아니오 | 배열<string (uuid)> | maxItems=12 |
| custom_names | 아니오 | 배열<string> | maxItems=5 |

### ChatAnswerPreviewRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| content | 예 | string | maxLength=500; minLength=1 |

### ChatMessageRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| content | 예 | string | maxLength=500; minLength=1 |
| client_message_id | 예 | string (uuid) | — |

### CompleteExerciseSessionRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|

### CompleteOnboardingRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|

### CreateChatRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| title | 아니오 | string 또는 null | — |

### DietMealFeedbackRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| feedback_type | 예 | string | enum=["eaten","different_food","skipped"] |
| eaten_at | 아니오 | string (date-time) | — |
| actual_items | 아니오 | 배열<MealLogItemRequest> | maxItems=20 |

### ExerciseDiscomfortRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| exercise_item_id | 아니오 | string (uuid) 또는 null | — |
| symptom_type | 예 | string | enum=["pain","fatigue","dizziness","breathing","other"] |
| severity | 아니오 | integer 또는 null | — |
| body_areas | 아니오 | 배열<string> | maxItems=10 |
| detail | 아니오 | string 또는 null | — |
| action_taken | 예 | string | enum=["adjust","stop","continue"] |

### ExerciseGoalRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| goal_type | 예 | string | enum=["weight_loss","muscle_gain","endurance","maintenance","rehabilitation"] |
| weekly_frequency | 예 | integer | maximum=7; minimum=1 |
| weekly_duration_minutes | 예 | integer | maximum=10080; minimum=1 |
| goal_period_weeks | 예 | integer | maximum=260; minimum=1 |
| starts_on | 아니오 | string (date) | — |

### ExerciseItemResultRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| completed | 예 | boolean | — |
| skipped | 예 | boolean | — |
| duration_minutes | 아니오 | integer 또는 null | — |
| completed_sets | 아니오 | integer 또는 null | — |
| performed_repetitions | 아니오 | integer 또는 null | — |
| performed_weight_kg | 아니오 | number 또는 string 또는 null | — |
| note | 아니오 | string 또는 null | — |
| skip_reason | 아니오 | string 또는 null | — |

### ExercisePreferencesRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| goal_type | 예 | string | enum=["weight_loss","muscle_gain","endurance","maintenance","rehabilitation","other"] |
| experience_level | 예 | string | enum=["beginner","intermediate","advanced"] |
| custom_goal | 조건부 | string 또는 null | 최대 200자; other일 때 공백 제거 후 비어 있으면 422; 일반 목표에서는 null로 초기화 |

### ExerciseRecommendationContextRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| available_minutes | 예 | integer | maximum=300; minimum=5 |
| location | 예 | string | enum=["gym","home","outdoor","other"] |
| available_equipment | 아니오 | 배열<string> | maxItems=5 |
| condition_level | 예 | string | maxLength=30; minLength=1 |
| discomfort_areas | 아니오 | 배열<string> | maxItems=10 |
| condition_note | 아니오 | string 또는 null | — |

### ExerciseSessionFeedbackRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| perceived_difficulty | 예 | integer | maximum=5; minimum=1 |
| post_condition | 예 | string | enum=["very_bad","bad","normal","good","very_good"] |
| uncomfortable_areas | 아니오 | 배열<string> | maxItems=10 |
| note | 아니오 | string 또는 null | — |

### FoodInventoryCreateRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| name | 예 | string | maxLength=100; minLength=1 |
| quantity | 아니오 | number 또는 string 또는 null | — |
| unit | 아니오 | string 또는 null | — |
| purchased_on | 아니오 | string (date) 또는 null | — |
| expires_on | 아니오 | string (date) 또는 null | — |

### FoodInventoryUpdateRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| name | 아니오 | string 또는 null | maxLength=100; minLength=1 |
| quantity | 아니오 | number 또는 string 또는 null | maximum=100000; minimum=0 |
| unit | 아니오 | string 또는 null | maxLength=20 |
| purchased_on | 아니오 | string (date) 또는 null | — |
| expires_on | 아니오 | string (date) 또는 null | — |

본문에는 하나 이상의 필드가 필요하다. `name`을 명시적으로 `null`로 보낼 수 없으며,
구매일과 유통기한 순서는 기존 값과 합친 최종 상태를 기준으로 검증한다.

### GenerateDietRecommendationRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|

### GenerateExerciseRecommendationRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|

### HTTPValidationError

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| detail | 아니오 | 배열<ValidationError> | — |

### HealthScorePreviewRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| mode | 아니오 | string | enum=["latest","change"]; default="latest" |
| explain | 아니오 | boolean | default=false |

### MealLogItemRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| food_name | 예 | string | maxLength=100; minLength=1 |
| quantity | 예 | number 또는 string | — |
| unit | 예 | string | maxLength=20; minLength=1 |
| calories | 아니오 | number 또는 string 또는 null | — |
| carbohydrates | 아니오 | number 또는 string 또는 null | — |
| protein | 아니오 | number 또는 string 또는 null | — |
| fat | 아니오 | number 또는 string 또는 null | — |

### OCRResultUpdateRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| extracted_data | 예 | object | 최대 30개 필드; 문서 유형별 필드·범위 검증 |

### ProfileUpdateRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| name | 아니오 | string 또는 null | — |
| nickname | 아니오 | string 또는 null | — |
| birth_date | 아니오 | string (date) 또는 null | — |
| gender | 아니오 | string 또는 null | — |
| target_weight | 아니오 | number 또는 string 또는 null | — |
| activity_level | 아니오 | string 또는 null | — |

### RegenerateDietMealRequest

필드 없는 빈 객체 `{}`만 허용한다.

### RoundtripRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| message | 예 | string | maxLength=200; minLength=1 |

### StartExerciseSessionRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|

### UpdateChatRequest

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| title | 아니오 | string 또는 null | — |
| status | 아니오 | string 또는 null | — |

### ValidationError

| 필드 | 필수 | 타입 | 조건 |
|---|---|---|---|
| loc | 예 | 배열<string 또는 integer> | — |
| msg | 예 | string | — |
| type | 예 | string | — |
| input | 아니오 | object | — |
| ctx | 아니오 | object | — |

## GET /api/health-documents

Bearer 인증 필수. query limit=20 (1~100), offset=0 (0 이상). 사용자 소유 건강 문서의 최신순 목록을 반환합니다. 응답은 items 배열과 limit, offset, has_more이며 각 항목은 uploaded_file_id, original_file_name, file_name, document_type, uploaded_at, status(awaiting_review | confirmed | failed)입니다. 선택 query status=confirmed로 확정 문서만 필터링합니다. 로그인 분기는 status=confirmed&limit=1의 items 유무를 사용합니다.

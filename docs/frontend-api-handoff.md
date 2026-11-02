# Auto-Fit 프론트엔드 협업용 전체 API 안내

기준일: 2026-09-28. 근거: `backend/app/main.py`, 라우터·챗봇 모듈, 저장소 SQL, 기존 검증 기록.
현재 FastAPI operation은 **59개**다. 아래 목록은 구현된 코드 기준이며 서버 배포 완료 목록은 아니다.
종합 분석 팝업의 신규 조회 2개는 [팝업 API 계약](analysis-popup-api-contract.md)을 확인한다.
메인 종합 분석 결과 조회는 [메인 API 계약](main-analysis-api-contract.md)을 확인한다.

## 공유 파일

- 이 문서: 화면별 API, 호출 순서, 응답 주요 경로, 예제, 미구현 영역.
- [입력 필드 전체 참조](api-input-reference.md): 파라미터·본문 필드·제약과 신규 팝업 조회 입력.
- [OpenAPI 원본](openapi.json): 코드에서 추출한 3.1 스키마. API 도구에 가져오기 가능.
- [챗봇 상세 계약](chat-api-contract.md): 메시지·근거 전체 형식과 재전송 규칙.
- [실연동 검증 기록](chat-integration-results.md): 실제 검증 범위와 한계.
- [식단 배포 검증 기록](diet-integration-results.md): 신규 식단 API의 인증·DB 왕복 25개 검사.

OpenAPI는 요청 스키마에 유용하지만 대부분 응답은 아직 `dict[str, Any]`로 선언되어 있다.
따라서 자동 생성된 응답 타입만으로 프론트 타입이 완성되지는 않는다. 아래 주요 응답 경로와
실제 개발 서버 응답을 함께 확인해야 한다. 이 문서는 현재 로컬 서버 구현을 기준으로 한다.

## 1. 접속·인증 공통 규칙

| 항목 | 현재 규격 |
|---|---|
| 개발 API 주소 | `http://localhost:8000` — 서버 실행 시 사용. 팀원 PC의 localhost는 팀원 PC를 가리킴 |
| 공유·배포 주소 | 미확정. 백엔드 담당이 실제 접근 가능한 주소를 별도 전달해야 함 |
| 실행 시 문서 | `{API_BASE}/docs`, `{API_BASE}/openapi.json` |
| 로그인 | 프론트가 Supabase Auth 사용. FastAPI `/login` API는 없음 |
| 인증 헤더 | `Authorization: Bearer <Supabase access_token>` |
| 인증 예외 | `/health`만 인증 불필요. OpenAPI의 optional 헤더 표기와 무관하게 나머지는 인증 필수 |
| 본문 | `Content-Type: application/json`, 필드명 `snake_case` |
| 사용자 ID | 요청에 넣지 않음. 서버가 검증된 로그인 사용자로 결정 |
| 서버 전용 키 | service_role/secret은 프론트에 공유하지 않음 |
| CORS | `FRONTEND_ORIGIN`(기본 `http://localhost:3000`)과 Expo Web `http://localhost:8081` 허용. 다른 포트·도메인은 별도 협의 |
| ID | 응답에서 받은 UUID를 재사용. session_id와 exercise_item_id 등 서로 다른 ID를 혼용하지 않음 |
| 날짜 | `YYYY-MM-DD`; 시각은 timezone 포함 ISO 8601로 전송 |
| 수치 | 응답은 직접 DB JSON 또는 Decimal 직렬화에 따라 숫자/문자열 가능. 표시 계층에서 안전하게 변환 |
| 건강 문서 업로드 | `multipart/form-data`, 파일 필드 `file`만 필수, `document_type` 생략 시 자동 판별; PDF/PNG/JPEG/HEIC, 최대 10 MiB |

GET은 JSON 본문 없이 호출한다. 아래 표의 `{}`는 빈 객체 본문을 보내야 하는 POST다.
POST라고 모두 201은 아니다. 코드가 지정한 성공 코드를 표에 명시했다.

## 2. 인증·프로필·온보딩 (7개)

| Method | 경로 | 입력 | 성공 응답 주요 경로 | 성공 코드 |
|---|---|---|---|---|
| GET | `/health` | 없음 | `status` | 200 |
| POST | `/api/test/roundtrip` | `message` 1~200자 | `ok, message, received_at, user_id, profile` | 200 |
| GET | `/api/profile` | 없음 | `profile, exercise_preferences` | 200 |
| PATCH | `/api/profile` | ProfileUpdateRequest | `ok, profile` | 200 |
| GET | `/api/allergies` | 없음 | `catalog[], selected[]` | 200 |
| PUT | `/api/allergies` | `allergy_type_ids[], custom_names[]` | `ok, selected[]` | 200 |
| POST | `/api/onboarding/complete` | `{}` | `ok, already_completed, profile` | 200 |

- 프로필 수정: name, nickname, birth_date, gender, target_weight, activity_level 중 하나 이상.
- gender: male/female/other. activity_level: sedentary/light/moderate/active/very_active.
- 생년월일 미래 날짜 거부. 이름 1~50자, 닉네임 최대 30자, 목표 체중 20~500.
- 알레르기 PUT은 전체 선택 교체다. 체크된 전체 ID를 보내고 선택 해제는 빈 배열로 보낸다.
- 카탈로그 선택 최대 12개, 기타 이름 최대 5개(각 1~50자), 중복 정리.
- 온보딩 완료 전 name/birth_date/gender와 운동 목표·경험(`user_exercise_profiles`)이 필요하다. 누락 시 409와 `fields`를 반환하며 운동 설정 누락은 `exercise_preferences`로 표시한다. 알레르기는 선택 사항이다. 약관은 아직 작성되지 않아 현재 완료 조건에 포함하지 않는다. 이미 완료됐으면 `already_completed=true`.
- 로그인 후 `GET /api/profile`로 현재 사용자의 가입 완료 여부와 기본 정보를 조회한다.
- 프로필 응답 주요 필드: user_id, name, nickname, birth_date, gender, target_weight, activity_level, onboarding_completed_at, updated_at. 같은 응답의 exercise_preferences는 연결된 운동 목표·경험 수준이며 미설정 시 null이다.

## 3. 운동 설정·추천 (6개)

| Method | 경로 | 입력 | 성공 응답 주요 경로 | 코드 |
|---|---|---|---|---|
| GET | `/api/exercise/preferences` | 없음 | `preferences` (없으면 null) | 200 |
| PUT | `/api/exercise/preferences` | `goal_type, experience_level, custom_goal?` | `ok, preferences` | 200 |
| GET | `/api/exercise/recommendation-contexts/latest` | 없음 | `context` (없으면 null) | 200 |
| POST | `/api/exercise/recommendation-contexts` | ExerciseRecommendationContextRequest | `ok, context` | 200 |
| GET | `/api/exercise/recommendations/latest` | 없음 | `result` (없으면 null) | 200 |
| POST | `/api/exercise/recommendations/generate` | `{}` | `ok, generator, result` | 200 |

추천 전 preferences와 새 context를 저장한다. 누락되면 409다.
goal_type: weight_loss/muscle_gain/endurance/maintenance/rehabilitation/other.
experience_level: beginner/intermediate/advanced.

회원가입의 ‘기타’ 목표는 아래처럼 저장한다. `custom_goal`은 `other`일 때 필수이며,
앞뒤 공백을 제거한 값이 비어 있으면 422다. 입력 최대 길이는 200자다.
일반 목표로 변경하면 `custom_goal`은 null로 초기화된다. 기존 두 필드 요청은 유지된다.
GET/PUT 응답의 `preferences.custom_goal`에서 입력 목표를 읽을 수 있다.

```json
{
  "goal_type": "other",
  "experience_level": "beginner",
  "custom_goal": "등산을 위한 기초 체력 만들기"
}
```

현재 규칙 기반 추천은 기타 입력 내용을 추천 요약에 표시하고 기본 걷기 루틴을 제공한다.
자유입력의 의미를 분석한 맞춤 처방은 제공하지 않는다.
배포 순서: `add_custom_exercise_goal` DB 마이그레이션 적용 → 백엔드 배포 → 기타 UI 연동.
마이그레이션은 기존 데이터·RLS·권한을 유지한다. 롤백 시 기타 데이터가 있는 동안은
기존 API로 되돌리지 않는다. 데이터를 백업하고 기존 목표로 전환한 뒤에만 컬럼/제약을 되돌린다.

```json
{
  "available_minutes": 60,
  "location": "gym",
  "available_equipment": ["machine", "dumbbell"],
  "condition_level": "보통",
  "discomfort_areas": [],
  "condition_note": null
}
```

시간 5~300분. 장소 gym/home/outdoor/other. 장비 machine/band/dumbbell/mat/other.
condition_level 1~30자, 불편 부위 최대 10개(각 1~50자), 메모 최대 500자.

`result.recommendation`은 exercise_recommendation_id, recommendation_date, goal,
total_duration_minutes, intensity, recommendation_summary, ai_reason, status 등을 가진다.
`result.items[]`는 exercise_item_id, exercise_name, sequence_order, sets, repetitions,
execution_type, target_duration_seconds, target_weight_kg, rest_seconds, instruction 등을 가진다.
운동 상세·수행 화면에는 여기서 받은 exercise_item_id를 사용한다.
현재 추천 생성기는 **rules_v1**이며 기본 프로필의 activity_level도 강도 결정에 반영한다. ai_reason이라는 필드명이 AI 모델 호출을 의미하지 않는다.

## 4. 운동 수행·피드백 (9개)

| Method | 경로 | 입력 | 성공 응답 주요 경로 | 코드 |
|---|---|---|---|---|
| POST | `/api/exercise/sessions/start` | `{}` | `ok, result.session, result.items[]` | 200 |
| POST | `/api/exercise/sessions/{session_id}/items/{item_id}` | ExerciseItemResultRequest | `ok, result.session, result.log` | 200 |
| POST | `/api/exercise/sessions/{session_id}/complete` | `{}` | `ok, result.session, result.logs[]` | 200 |
| GET | `/api/exercise/sessions/latest` | 없음 | `result.session, result.logs[]` 또는 result=null | 200 |
| POST | `/api/exercise/sessions/{session_id}/discomfort` | ExerciseDiscomfortRequest | `ok, result.discomfort, result.session, result.adjusted_items[]` | 200 |
| GET | `/api/exercise/sessions/{session_id}/discomfort` | 없음 | `logs[]` | 200 |
| PUT | `/api/exercise/sessions/{session_id}/feedback` | ExerciseSessionFeedbackRequest | `ok, feedback` | 200 |
| GET | `/api/exercise/sessions/{session_id}/feedback` | 없음 | `feedback` (없으면 null) | 200 |
| GET | `/api/exercise/sessions/{session_id}/analysis` | 없음 | `analysis, result` | 200 |

시작은 최신 active 추천이 필요하다. session_id는 result.session.exercise_session_id이다.
session의 주요 집계: status, started_at, completed_at, planned_item_count, completed_item_count,
skipped_item_count, total_duration_seconds, total_calories_burned, completion_rate.
상태는 in_progress/completed/stopped/skipped이며 화면 상태와 매핑한다.

운동 한 항목 완료 예:

```json
{
  "completed": true,
  "skipped": false,
  "duration_minutes": 5,
  "completed_sets": 3,
  "performed_repetitions": 12,
  "performed_weight_kg": 20,
  "note": null,
  "skip_reason": null
}
```

completed/skipped 중 정확히 하나만 true여야 한다. 건너뛰기는 skip_reason 필수.
이 API는 **운동 항목 단위 결과**이며 매 세트마다 별도 완료 이벤트를 저장하는 API는 아니다.
각 수치의 범위는 입력 필드 참조를 따른다.

불편함 기록 예:

```json
{
  "exercise_item_id": null,
  "symptom_type": "pain",
  "severity": 6,
  "body_areas": ["무릎"],
  "detail": "운동 중 불편함",
  "action_taken": "adjust"
}
```

symptom_type: pain/fatigue/dizziness/breathing/other. severity: 0~10 또는 null.
action_taken: adjust/stop/continue. 조정 후 result.adjusted_items와 result.session으로 화면 갱신.

운동 후 피드백 예:

```json
{"perceived_difficulty":3,"post_condition":"good","uncomfortable_areas":[],"note":null}
```

perceived_difficulty 1~5. post_condition very_bad/bad/normal/good/very_good.
분석은 종료 상태와 피드백을 요구한다(미충족 409, 세션 없음 404).
analysis: generator, summary, metrics, feedback_summary, insights[], next_session_adjustments[], safety_notice.
분석은 현재 rules_v1이다. 다음 운동 조정 문구가 실제 다음 추천에 반영되는지까지 보장하는 계약은 아니다.

## 5. 운동 목표·기록·진행 현황 (5개)

| Method | 경로 | 입력 | 성공 응답 | 코드 |
|---|---|---|---|---|
| GET | `/api/exercise/goals/active` | 없음 | `goal` 또는 null | 200 |
| PUT | `/api/exercise/goals/active` | ExerciseGoalRequest | `ok, goal` | 200 |
| GET | `/api/exercise/history` | query: `from_date, to_date` 필수 | `period, count, history[]` | 200 |
| GET | `/api/exercise/progress` | query: `period=week/month/three_months`, 기본 month | `progress` | 200 |
| GET | `/api/exercise/summary` | 없음 | `summary.recent_7_days, summary.cumulative` | 200 |

```json
{"goal_type":"maintenance","weekly_frequency":3,"weekly_duration_minutes":120,"goal_period_weeks":8,"starts_on":"2026-09-08"}
```

주간 횟수 1~7, 시간 1~10080분, 목표 기간 1~260주. starts_on 생략 시 서버 오늘 날짜.
history의 각 원소는 session, logs, feedback. progress는 period, goal, summary,
weekly_trend[], category_distribution[], achievements를 가진다.
summary: workout_count, exercise_count, duration_minutes, calories_burned,
target_workout_count, target_duration_minutes, goal_achievement_rate.
목표가 없으면 목표 관련 값은 null일 수 있다.

기록 기간은 from_date ≤ to_date, 차이 최대 366일(양 끝 포함 최대 367일).
**현재 일반 운동 history의 날짜 경계는 UTC**다. 식사 meal-logs, 날짜별 식단·영양 요약,
챗봇 요약은 KST 날짜 경계를 사용한다. 같은 '오늘'이어도 운동 기록 결과가 달라질 수 있으므로
실제 서비스 연동 전 운동 날짜 기준도 통일이 필요하다.
progress는 서버 date.today 기준이며 three_months는 이번 달과 앞선 두 달의 첫날부터 오늘까지다.
summary는 완료 상태 세션을 기준으로 최근 7일(오늘 포함 7일)과 누적 운동 횟수, 완료 종목 수, 시간, 열량, 활동일을 반환한다.
채팅 이외 목록 API에는 일반화된 페이지네이션이 없다. 대량 데이터 완전 조회를 보장하지 않는다.

## 6. 식단·냉장고 (11개)

| Method | 경로 | 입력 | 성공 응답 | 코드 |
|---|---|---|---|---|
| GET | `/api/diet/inventory` | 없음 | `count, inventory[]` | 200 |
| POST | `/api/diet/inventory` | FoodInventoryCreateRequest | `ok, item` | 201 |
| PATCH | `/api/diet/inventory/{inventory_id}` | FoodInventoryUpdateRequest | `ok, item` | 200 |
| DELETE | `/api/diet/inventory/{inventory_id}` | 없음 | 본문 없음 | 204 |
| GET | `/api/diet/recommendations?date=YYYY-MM-DD` | `date` 필수 | `result` 또는 null | 200 |
| GET | `/api/diet/recommendations/latest` | 없음 | `result` 또는 null | 200 |
| GET | `/api/diet/nutrition-summary?date=YYYY-MM-DD` | `date` 필수 | `summary` | 200 |
| POST | `/api/diet/recommendations/generate` | `{}` | `ok, generator, result` | 200 |
| POST | `/api/diet/meals/{diet_meal_id}/regenerate` | `{}` | `ok, generator, meal, used_ingredients[]` | 200 |
| POST | `/api/diet/meals/{diet_meal_id}/feedback` | DietMealFeedbackRequest | `ok, result.feedback, result.meal_log` | 200 |
| PATCH | `/api/diet/meals/{diet_meal_id}/feedback` | DietMealFeedbackUpdateRequest | `ok, result.feedback, result.meal_log` | 200 |
| GET | `/api/diet/meal-logs` | query: `from_date, to_date` 필수 | `period, count, logs[]` | 200 |

재료 추가 예:

```json
{"name":"두부","quantity":1,"unit":"모","purchased_on":"2026-09-08","expires_on":"2026-09-12"}
```

name만 필수(1~100자). quantity 0~100000, unit 최대 20자. 구매일이 있으면 유통기한은 구매일 이후.
PATCH는 변경할 필드를 하나 이상 보내며, 생략한 필드는 유지한다. DELETE는 소프트 삭제이며
이미 삭제되었거나 본인 소유가 아닌 ID에도 멱등하게 204를 반환한다.
result.recommendation: diet_recommendation_id, recommendation_date, target_calories,
target_carbohydrates, target_protein, target_fat, recommendation_summary, ai_reason, status.
result.meals[]: diet_meal_id, meal_type, meal_order, recommended_calories, recommendation_note,
image_storage_path, image_url, status, foods[], feedback, used_ingredients[]. `image_url`은 공개 Supabase Storage URL이며
추천 식단 카드의 이미지 소스로 바로 사용할 수 있다.
`used_ingredients[]`는 식단 생성 또는 한 끼 재추천 시점에 추천 음식과 냉장고 재료를
매칭해 저장한 스냅샷이다. 이후 재료를 소진·수정·삭제해도 날짜별 화면은 당시 사용한
재료의 `name` 목록을 그대로 복원한다. 스냅샷 도입 전 레코드는 현재 사용 가능한 재료와
다시 매칭하는 호환 로직을 사용하므로, 이미 삭제된 과거 재료는 복원되지 않을 수 있다.
`feedback`은 아직 피드백이 없으면 null이며, 있으면 diet_feedback_id, diet_meal_id,
meal_log_id, feedback_type, actual_food_name, feedback_note, recorded_at을 포함한다. 카드 상태는
`feedback.feedback_type`을 우선 사용하고 null이면 아직 선택하지 않은 상태로 복원한다.
`menu_image_key`, `image_source`, `image_generation_status`, `image_generation_required`는
이미지 캐시 상태를 나타낸다. `image_generation_required=true`이면 캐시에 완성된 이미지가
없다는 뜻이며, 향후 이미지 모델 작업 큐를 시작하는 기준으로 사용한다.
백엔드가 `foods[].food_name`을 정규화해 기존 사진과 자동 매칭하므로 프론트는 음식 이름과
사진을 개별 매핑하지 않는다. `image_url`만 사용하고 값이 없으면 기본 이미지를 표시한다.
foods[]: food_name, display_name, quantity, unit, display_unit, calories, carbohydrates, protein,
fat 등. 카드에는 괄호 부가정보를 제거한 `display_name`을 사용한다. 사용자가 카드를 펼치면
foods[] 전체를 순회해 `display_name + quantity + display_unit` 형식으로 재료와 분량을 표시한다.
원문 확인이 필요한 상세 데이터에는 괄호 내용을 보존한 `food_name`, `unit`을 사용한다.
일일 식단 생성은 `mixed_ai_v1`이며 하루 4끼 중 2~3끼가 `ai_generated`, 나머지가
`db_catalog`다.
날짜별 조회는 KST 기준 해당 날짜에 마지막으로 생성된 추천을 반환한다. 한 끼 재추천은
기존 `diet_meal_id`, `meal_type`, `meal_order`를 유지한 채 음식 목록을 교체하며, 완료·변경·건너뜀
상태의 식사는 409다. 단건 생성기는 `ai_v1`이고 성공한 식사는 `source_type=ai_generated`로
저장한다. `used_ingredients[]`에는 `user_food_inventory_id`, `name`, `matched_food_name`,
`quantity`, `unit`이 들어간다. AI가 비활성·실패하거나 사용 가능한 냉장고 재료를 결과에
반영하지 못하면 503이며 규칙 기반 결과로 자동 대체하지 않는다. `menu_image_key`는 이미지
캐시 키이므로 AI/DB 생성 출처 판단에는 `generator`와 `source_type`을 사용한다.

영양 요약의 `summary`에는 날짜, 추천 존재 여부, 알 수 없는 영양 항목 여부와 칼로리·탄수화물·
단백질·지방의 `consumed`, `target`, `unit`이 포함된다. 목표는 해당 날짜 최신 추천에서,
섭취량은 해당 KST 날짜의 기록된 식사 항목에서 계산한다. 목표가 없으면 `target`은 null이다.

추천 식단을 그대로 먹었을 때:

```json
{"feedback_type":"eaten","eaten_at":"2026-09-08T12:30:00+09:00","actual_items":[]}
```

다른 음식을 먹었을 때:

```json
{"feedback_type":"different_food","eaten_at":"2026-09-08T12:30:00+09:00","actual_items":[{"food_name":"김치볶음밥","quantity":300,"unit":"g","calories":480,"carbohydrates":72,"protein":14,"fat":13}]}
```

feedback_type: eaten/different_food/skipped. different_food만 actual_items 1~20개가 필요하다.
나머지 유형은 actual_items를 비운다. eaten_at 생략 시 서버 현재 UTC 시각.
음식의 food_name, quantity(0 초과), unit은 필수, 영양소는 선택이며 null 가능.
logs[]는 각 식사에 items[]를 포함한다. skipped의 result.meal_log는 null일 수 있다.
이 API는 diet_meal_id와 연결된 기록이다. 추천 식단과 무관한 독립 식사 등록 API는 아직 없다.

## 7. 건강 문서 업로드·검토·목록 (6개)

파일만 전송하면 서버가 문서 종류를 판별하고 응답의 `document_type`에 따라 화면을 분기한다. 실제 OCR 연결 후 판별 불가 시 저장 없이 422 `UNKNOWN_DOCUMENT`/`UNSUPPORTED_DOCUMENT`를 반환한다. URL이 없는 임시 모드는 종류 판별 없이 PDF/이미지 모두 고정 샘플을 반환한다. 종류 생략 시 기본 건강검진 샘플이며 서버 HEALTH_DOCUMENT_OCR_MOCK_DOCUMENT_TYPE=body_composition 설정으로 체성분 샘플도 테스트한다. 실제 판별은 OCR 서버 연결 후 수행한다. 상세 타입·단위·상태·오류·재업로드 계약은 [건강 문서 API](health-documents-api.md)를 참고한다.

| Method | 경로 | 입력 | 성공 응답 | 코드 |
|---|---|---|---|---|
| POST | `/api/health-documents` | multipart `file` 필수, `document_type`·`original_file_name` 선택 | `uploaded_file_id, document_type, file_name, original_file_name, uploaded_at, ocr_status, status, extracted_data, error` | 201 |
| GET | `/api/health-documents` | query `limit`(기본 20, 최대 100), `offset`(기본 0) | `items[{uploaded_file_id, original_file_name, file_name, document_type, uploaded_at, status}], limit, offset, has_more` | 200 |
| GET | `/api/health-documents/{uploaded_file_id}` | 경로 UUID | `uploaded_file_id, document_type, file_name, original_file_name, uploaded_at, ocr_status, status, extracted_data, error` | 200 |
| PATCH | `/api/health-documents/{uploaded_file_id}/ocr-result` | `extracted_data` | `uploaded_file_id, document_type, file_name, original_file_name, uploaded_at, ocr_status, status, extracted_data, error` | 200 |
| POST | `/api/health-documents/{uploaded_file_id}/confirm` | 본문 없음 | `uploaded_file_id, document_type, status, health_checkup_id, body_composition_id, already_confirmed` | 200 |
| GET | `/api/health-assessments/input` | 없음 | `ready, missing[], health_checkup, body_composition, diet_context` | 200 |
| POST | `/api/health-assessments/{assessment_id}/diet-personalization/refresh` | 본문 없음 | 갱신된 `MainAnalysisResponse` | 200 |

- 응답의 `document_type`: 서버가 결정한 `health_checkup` 또는 `body_composition` (`inbody`가 아님). 업로드·재업로드 요청에서는 생략한다.
- `DocumentPickerAsset.name`을 `original_file_name`으로 보내고 응답의 `original_file_name`을 표시한다. DB에 보존하며 기존 원본명이 없는 행은 file_name으로 대체한다.
- 업로드 응답의 `extracted_data`는 문서 종류별 명시적 타입이며 Decimal은 문자열로 반환한다.
- PATCH는 보낸 필드만 변경하며 null은 값을 비운다. 확정 문서 수정은 409다.
- 확정 전 건강검진은 `checkup_date`, 인바디는 timezone을 포함한 `measured_at`이 필수다.
- confirm은 같은 파일로 반복 호출해도 기존 건강 데이터를 반환한다.
- 건강검진과 인바디를 각각 confirm한 뒤 `/api/health-assessments/input`을 호출한다. 둘 다 있으면 `ready=true`; 하나라도 없으면 200과 함께 `ready=false`, `missing[]`을 반환한다.
- 통합 입력은 로그인 사용자의 최신 확정 레코드만 조회하며 `raw_data`, `user_id`는 노출하지 않는다.
- 파일은 private Storage 버킷에 저장하며 현재 다운로드 URL은 제공하지 않는다.

```bash
curl -X POST "$API_BASE/api/health-documents" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./checkup.pdf"
```

업로드 응답의 `uploaded_file_id`를 다음 두 호출의 경로 ID로 사용한다.

```json
{
  "extracted_data": {
    "checkup_date": "2026-09-16",
    "height_cm": 175.2,
    "weight_kg": 68.4,
    "systolic_bp": 120,
    "diastolic_bp": 80,
    "fasting_glucose": 92
  }
}
```

## 8. 챗봇 (7개)

| Method | 경로 | 입력 | 성공 응답 | 코드 |
|---|---|---|---|---|
| POST | `/api/chats` | 생략 또는 `{title:null}` | `chat` | 201 |
| GET | `/api/chats` | status 선택, limit 기본20/최대50, cursor 선택 | `chats[], next_cursor, has_more` | 200 |
| PATCH | `/api/chats/{chat_id}` | title/status 하나 이상 | `chat` | 200 |
| GET | `/api/chats/{chat_id}/messages` | limit 기본30/최대100, before 선택 | `chat_id, messages[], next_cursor, has_more` | 200 |
| POST | `/api/chats/{chat_id}/messages` | client_message_id UUID, content 1~500자 | `is_replay, chat, user_message, assistant_message` | 신규201/재전송200 |
| POST | `/api/chats/answer-preview` | content 1~500자 | `answer` | 200 |
| POST | `/api/chats/health-score-preview` | mode latest/change(기본 latest), explain 기본false | `answer` | 200 |

마지막 두 개는 **저장하지 않는 개발용 미리보기**다. 실제 화면의 대화 저장에는 messages 전송 API를 쓴다.

```json
{"client_message_id":"00000000-0000-4000-8000-000000000001","content":"이번 주 운동 몇 번 했어?"}
```

예제 UUID는 문서용이다. 프론트는 질문마다 새 UUID를 만들고 재시도에는 같은 UUID와 내용을 사용한다.
정식 말풍선: **assistant_message.content**, 미리보기 말풍선: **answer.content**.
메시지 ID로 중복 말풍선을 방지한다. 같은 요청 ID로 다른 내용·다른 채팅방 전송은 409.
채팅 상태는 active/archived. 팝업 닫기만으로 archived 처리하지 않는다.
메시지 페이지는 최신 구간을 과거→최신 순서로 반환한다. 이전 페이지는 before=next_cursor로 받고 앞에 붙인다.
목록의 updated_at 변경 중에는 snapshot이 보장되지 않으므로 chat_id로 중복 제거한다.

답변은 content, intent, response_source, needs_more_data, evidence[], required_data[]를 포함한다.
정식 메시지에는 message_id, chat_id, sender_type, created_at이 추가된다.
출처: database/database_ai/general_ai/need_more_data. **현재 생성하는 것은 database와 need_more_data**다.
건강 점수 최신·이전 비교, 식사·운동 기록 요약을 지원한다. 기록 기간은 오늘/어제/이번 주/지난주/최근 7일.
명시적인 루틴 생성 요청(예: `오늘 운동 루틴 만들어줘`)은 운동 설정과 미사용 추천 컨텍스트가 있으면 기존 추천 생성·저장 흐름을 실행한다. 답변 intent는 exercise_routine_generation이며 evidence에 exercise_recommendation_id와 다음 `/api/exercise/sessions/start` 경로가 들어간다. 입력이 부족하면 required_data에 exercise_preferences 또는 recommendation_context를 반환한다. answer-preview는 쓰기 없이 준비 상태만 확인한다.
그 밖의 임의 자연어·후속 대화 문맥·모델 해석은 아직 지원하지 않는다. 모델은 팀원 개발 완료, 백엔드 접속 규격은 미확인.
보관기간은 메시지 생성 후 30일(720시간)이다. 5분 주기로 만료 메시지를 삭제한다. 상세는 [보관 정책](chat-retention-policy.md)을 따른다. 요청 제한은 구현했고 AI 연동은 미완료이다.

## 9. 화면별 호출 순서

| 화면·흐름 | 프론트 호출 순서 |
|---|---|
| 가입 후 정보 입력 | Supabase Auth → PATCH profile → GET/PUT allergies → POST onboarding/complete |
| 운동 추천 | PUT preferences → POST recommendation-contexts → POST recommendations/generate → result로 화면 표시 |
| 운동 수행 | POST sessions/start → 항목마다 POST items/{item_id} → POST complete → PUT feedback → GET analysis |
| 수행 중 불편함 | POST discomfort → 반환 session/adjusted_items로 남은 화면 갱신 |
| 운동 목표·기록 | GET/PUT goals/active, 기간을 선택해 GET history/progress |
| 식단 | GET/PATCH/DELETE inventory → GET recommendations?date=... 또는 POST generate → 필요 시 POST meals/{id}/regenerate → POST feedback → GET nutrition-summary/meal-logs |
| 건강 데이터 업로드·분석 입력 | 문서별 POST health-documents → PATCH ocr-result → POST confirm → 두 문서 확정 후 GET health-assessments/input |
| 챗봇 재진입 | GET chats?status=active&limit=1 → 없으면 POST chats → GET messages |
| 챗봇 질문 | UUID 생성 → POST messages → assistant_message 표시 → 실패 시 같은 UUID로 재시도 |

## 10. 오류·재시도 협업 규칙

- 401: 토큰 갱신·재로그인 처리. 기존 토큰이 만료됐으면 새 access_token 사용.
- 404: 없는 데이터 또는 챗봇 타 사용자 접근. 빈 화면/안내로 처리.
- 409: 사전 단계 누락, 보관된 채팅, 중복 ID 충돌 등. 무조건 자동 재시도하지 말고 원인 표시.
- 422: 요청 필드·범위 오류. 입력 수정 안내.
- 413: 전체 요청 12 MiB 또는 건강 문서 10 MiB 제한 초과.
- 415: 실제 파일 시그니처가 PDF/PNG/JPEG/HEIC가 아님.
- 502: DB/외부 서비스 오류. 입력을 보존하고 재시도 제공.
- 현재 운동 session RPC 실패는 원인과 무관하게 409로 매핑되는 한계가 있다.
- 챗봇 오류: `{"detail":{"code":"VALIDATION_ERROR","message":"입력값을 확인해 주세요.","fields":["body.content"]}}`.
- 다른 API 오류: detail이 문자열 또는 FastAPI 검증 오류 배열, 온보딩은 message/fields 객체일 수 있다.
- 프론트 공통 오류 처리기는 detail의 문자열/객체/배열을 구분해야 한다. 아직 전체 API 오류 규격이 통일되지 않았다.
- 저장 채팅의 handler 제한 30초(인증 시간 별도). 타임아웃이어도 DB 저장 성공 가능 → 같은 client_message_id로 재시도.
- 채팅 외 POST의 중복 방지 보장을 일반화하지 않는다. 연속 클릭을 막고 상태 조회 후 재시도한다.
- 429 요청 제한: 사용자별 최근 60초간 전체 60회, 답변 생성 10회. `detail.retry_after`초 후 같은 요청 ID로 재시도한다. 상세는 [요청 제한](chat-rate-limits.md)을 따른다.

## 11. 최종 UI 대비 아직 없는 전용 API

아래는 UI 요구사항이다. 구현된 경로가 없으므로 프론트가 임의 URL을 가정하면 안 된다.

| 화면 요구 | 현재 공백 |
|---|---|
| 마이페이지 초기 표시 | GET profile 전용 조회 없음 |
| 프로필 사진·키·현재 체중·선호 운동 편집 | 현재 PATCH profile 필드로 모두 지원되지 않음 |
| 건강 문서 실제 OCR 자동 인식 | 업로드·수동 검토·확정 API는 있으나 OCR 엔진 연동 없음 |
| 건강 데이터 상세·삭제, 최초 종합 건강 분석 생성 | 통합 분석 입력 조회와 기존 평가의 냉장고 개인화 갱신 저장은 구현됨. 상세·삭제 및 최초 건강 평가·모델 분석 생성 API는 없음. 메인 조회는 저장된 `raw_result.total_analysis`를 우선 사용하고, 없으면 평가 당시 목표·확정 판정이 충분한 경우 제한된 임시 문구를 생성 |
| 월간 건강 리포트·인바디 변화 | 전용 API 없음. 운동 progress와 별도 |
| 냉장고 재료 다중 삭제 | 단건 PATCH/DELETE만 있으며 bulk API는 없음 |
| 음식 검색·사진 인식·독립 식사 추가·수정 | 전용 API 없음 |
| 알림 설정·방해금지·푸시 | 전용 API 없음 |
| 회원 탈퇴·연관 데이터 삭제 | 전용 API 없음 |
| 운동 동영상·세트별 재개·연속 목표 성취 | 현재 API와 최종 UI 요구를 추가 대조해야 함 |

## 12. 검증 상태와 담당

전체 자동 테스트 306개 통과 기록. 발표 시나리오 로컬 API 흐름 검증을 포함한다. 챗봇 저장/건강 점수는 실제 Supabase 연동 24개 검증 완료.
이번 식단 확장은 로컬 API 테스트와 PGlite 기반 `replace_diet_meal` RPC 검증 8개를 통과했다.
신규 `replace_diet_meal` 마이그레이션은 연결된 개발 Supabase에 적용됐고, 신규 API 코드는
Render 공유 서버에 배포됐다. `/health` 200과 신규 5개 경로의 인증 적용(미인증 401)을 확인했다.
합성 사용자의 실제 인증 토큰으로 성공 응답·소유권 차단·영양 집계 25개 검사도 통과했다.
프론트 화면의 로딩·빈 상태·오류 문구와 실제 사용자 조작 검증은 공동 실연동 단계에서 진행한다.
신규 챗봇 식사·운동은 모의 HTTP 검증 완료, 실제 DB 통합은 남아 있다.
그 밖의 API는 이번 인수인계에서 코드·SQL을 확인한 것이며 전부 최신 실연동 검증한 것은 아니다.

| 담당 | 인수인계 작업 |
|---|---|
| 백엔드 | 공유 서버 주소, CORS 허용 origin, 응답 타입 보완, 누락 API·모델 연동, 오류 대응 |
| 프론트 | 토큰 전달, 화면 API 연결, ID 보관, 로딩/빈 데이터/null/오류 처리, 재시도 중복 방지 |
| 모델 담당 | 모델 호출 주소 또는 Python 실행 방식, 입력·출력 JSON, 인증·제한·타임아웃 전달 |
| 공동 | 날짜 기준 통일, 응답 샘플 확인, 실제 화면 시나리오 테스트, 보관기간 기산점 확정 |

건강 문서 목록 상태 추가 (개발 서버 배포 완료): items.status는 awaiting_review | confirmed | failed입니다. 로그인 분기는 GET /api/health-documents?status=confirmed&limit=1의 items 유무로 판단합니다. 일반 목록 첫 페이지만으로 전체 확정 데이터 부재를 판단하면 안 됩니다.

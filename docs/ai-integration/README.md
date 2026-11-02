# AI 서버 연동 전달자료 및 구현 상태

기준일: 2026-10-19. 첨부 `backend_ai_integration_spec.md`와 현재 로컬 백엔드 코드를 비교했다.
사용자 결정: **하루 식단만 추출하지 않고, 7일 전체를 저장·조회한다.**
이 문서는 로컬 구현 상태이며 원격 DB 적용·배포·실제 AI 서버 검증을 의미하지 않는다.

## 전달할 파일

- [백엔드 OpenAPI 발췌](backend-openapi.json): 현재 코드에서 추출한 관련 API·DTO. AI 서버의 OpenAPI가 아니다.
- [기존 백엔드 합성 예시](backend-examples.json): 현재 Pydantic DTO로 검증한 건강 입력·챗봇 요청·기존 식단 생성 형식.
- [주간 식단 합성 응답](weekly-diet-example.json): 7일 × 4끼 전체 fixture. 실제 AI 결과나 사용자 데이터가 아니다.
- [백엔드 → AI 요청 예시](ai-request-examples.json): 생성·한 끼 교체의 실제 요청 body와 Recipe 입력 builder 결과. API 테스트로 구현과 일치하는지 검증한다.
- 이 문서: 역할, 필드 차이, 신규 주간 API, 확정이 필요한 계약.

### 모델 담당자에게 전달할 요청 형식

`ai-request-examples.json`의 `requests` 배열에서 각 `path`로 해당 `body`만 POST한다.
파일 전체를 요청 body로 보내는 형식은 아니다. 헤더는 서버 전용 Bearer 키와
`Content-Type: application/json`이다. 파일의 키 표기는 placeholder이며 실제 키는 포함하지 않는다.
`backend_generate`는 프론트 → 백엔드 요청 예시이므로 AI 요청과 구분한다.

- `/recommend/diet`: 최신 알레르기·목표 + 기피 음식·추가 조건·한 끼 영양 목표.
- `/recommend/diet/replace-meal`: 동일 조건 + 대상 요일·끼니·현재 메뉴·기존 주간 메뉴 제외 목록.
- `/recommend/diet/recipe`: 선택한 끼니의 원본 `items` + 알레르기·기피 음식. 현재 입력 builder만 구현.

예시의 `metric_statuses={}`, `sido=null`, `sigungu=null`, `nearby_regions=[]`는
현재 구현의 실제 전송값이다. `items`의 소수 수치는 반올림하지 않는다.
요일은 `monday`~`sunday`, 끼니는 `breakfast/lunch/dinner/snack`이다.
사용자 ID·plan ID·주 시작일·`expected_version`은 백엔드에서 관리하며 이 AI 요청 body에 포함하지 않는다.

### 원격 AI 코드와의 호환성 확인

2026-10-19에 원격 `ai` 브랜치의 커밋
[`1ebb6a2` (2026-09-30)](https://github.com/gahya9904/Auto-Fit/commit/1ebb6a2f9eac1e1c49e95aa573ea76e46b1ababe)를 확인했다.
아래는 해당 커밋의 소스 기준이며 실제 배포 서버의 동작을 검증한 결과는 아니다.
첨부 명세에 대응하는 최신 브랜치/커밋 확인이 필요하다.

| 항목 | 해당 AI 커밋에서 확인한 차이 | 연동 영향 |
|---|---|---|
| 식단 요청 | `disliked_foods`, 지역, `meal_target` 필드 없음 | 추가 조건이 무시될 수 있음 |
| 한 끼 교체 | `excluded_menu_names` 등 신규 조건 없음 | 주간 메뉴 중복 제외 계약 미충족 |
| 식단 응답 | `ingredients`는 있으나 `items` 없음 | 백엔드는 502 `AI_INVALID_RESPONSE`로 거부하며 저장하지 않음 |
| Recipe | 추천 router에 `/recommend/diet/recipe` 없음 | 정상·충돌·unavailable 전체 응답 필요 |
| 채팅 | 요청 `pending_action`, 응답 `action_status/requires_backend_apply` 없음 | 첨부 명세의 확인·적용 절차 연결 불가 |

근거: [추천 schema](https://github.com/gahya9904/Auto-Fit/blob/1ebb6a2f9eac1e1c49e95aa573ea76e46b1ababe/app/schemas/recommendation.py),
[추천 router](https://github.com/gahya9904/Auto-Fit/blob/1ebb6a2f9eac1e1c49e95aa573ea76e46b1ababe/app/routers/recommendation_router.py),
[채팅 schema](https://github.com/gahya9904/Auto-Fit/blob/1ebb6a2f9eac1e1c49e95aa573ea76e46b1ababe/app/schemas/chat.py).
`ingredients`를 `items`로 임의 변환하지 않으며, 이 구버전 형태를 거부하는 회귀 테스트를 추가했다.

건강 분석은 위 커밋에서 `/health-analysis`와 `/health-analysis/diet-refresh` 및 전체 DTO를 확인했다.
운동 추천 DTO도 확인했다. 두 기능은 기존 DB 저장 구조와의 매핑·검증 구현이 남아 있다.
특히 건강 분석 냉장고 입력의 `inventory_item_id`는 해당 AI schema에서 필수이고,
응답 `used_inventory_item_ids`와 대응하므로 불필요한 metadata와 구분해야 한다.
근거: [건강 schema](https://github.com/gahya9904/Auto-Fit/blob/1ebb6a2f9eac1e1c49e95aa573ea76e46b1ababe/app/schemas/health_analysis.py),
[건강 router](https://github.com/gahya9904/Auto-Fit/blob/1ebb6a2f9eac1e1c49e95aa573ea76e46b1ababe/app/routers/health_analysis_router.py).

## 1. 현재 구현과 남은 작업

| 기능 | 확인한 기존 구현 | 이번 로컬 구현 / 남은 사항 |
|---|---|---|
| AI 공통 호출 | HTTPS `/chat` 전용, `question/user_info/chat_history` | 독립 `ai_server.py`: 구조화 endpoint allowlist, Bearer 인증, timeout, 제한된 JSON 응답 처리 |
| 식단 생성 | 오늘 4끼, DB 메뉴와 AI 메뉴 혼합 | `/recommend/diet` 응답 7일 전체 검증·저장·조회 추가 |
| 한 끼 재추천 | 기존 일일 `diet_meal_id`를 RPC로 교체 | 주간 식단 ID + 요일 + 식사 유형 + 버전으로 선택 슬롯만 원자적 교체 |
| Recipe | API 없음 | 원본 `items` 보존 및 입력 builder 준비. 응답의 최상위 envelope 확인 후 공개 API 연결 필요 |
| Chat | 대화 저장, `/chat` 호환 호출 | `/chat/orchestrate`와 `pending_action`은 미연결. 상세 action 계약 필요 |
| 건강 분석 | 최신 확정 입력 조회·저장된 분석 조회·규칙 기반 냉장고 갱신 | AI 경로·DTO 소스 확인. 최초 분석 및 부분 갱신의 저장 매핑·연결 미구현 |
| 운동 추천 | 내부 규칙 기반 추천과 저장 RPC | AI DTO 소스 확인. 내부 종목·세트·반복 등과의 매핑 미구현 |

기존 일일 API·식사 기록·자정 갱신 작업은 일일 테이블을 사용한다. 이번 주간 API는 별도
`weekly_diet_plans`를 사용하므로 **주간 식단이 기존 일일 화면이나 식사 기록으로 자동 연결되지는 않는다.**
주간 화면에서 아래 신규 API를 사용하고, 주간 식사의 섭취 기록·일일 영양 요약 연결은 후속 작업이다.

## 2. 먼저 합의할 항목에 대한 백엔드 답변

| 항목 | 백엔드 구현 / 제안 |
|---|---|
| 인증 | 프론트→백엔드는 기존 Supabase 사용자 Bearer 토큰. 백엔드→AI는 별도 `Authorization: Bearer <AI_SERVER_API_KEY>` |
| 서버 주소 | `AI_SERVER_BASE_URL=https://<trusted-host>`: path/query/fragment 없는 HTTPS origin. 운영자가 지정하며 요청 body로 받지 않음 |
| 키 | 서버 환경변수만 사용. 기존 백엔드 정책과 동일하게 공백 없는 printable ASCII 32자 이상 |
| 사용자 식별 | 기존 `get_current_user` 결과만 사용. 주간 API body는 `user_id`를 허용하지 않음. AI 요청에 사용자·식단 DB ID를 전달하지 않음 |
| 요청 추적 | 주간 식단은 백엔드 plan ID 및 version으로 저장 대상을 식별. `/health-analysis`의 `request_id` 생성·상관관계 저장은 건강 분석 연결 시 구현 필요 |
| 날짜 | KST `Asia/Seoul`; 주 시작일은 월요일 `YYYY-MM-DD`; 월요일부터 일요일까지 실제 날짜를 조회 응답에 추가 |
| 상태 저장 | 주간 식단 및 생성 당시 입력은 Backend DB. 기존 대화는 `chats/chat_messages`; `pending_action` 저장·동시성 계약은 미정 |
| 재시도 | 현재 신규 클라이언트도 **자동 재시도 없음**. 생성 POST의 중복 호출·비용을 피하기 위한 초기 정책. AI 측 idempotency 지원 여부 확인 후 변경 가능 |
| 호출 한도 | 기존 DB 기반 `answers` quota를 공유: 사용자별 최근 60초 10회, 챗봇 새 답변·미리보기와 주간 생성·재생성 합산. 초과 시 AI 호출 전에 429 + `Retry-After` |
| 오류 | AI 401/422/500 및 잘못된 응답은 백엔드 502; AI 503·연결 실패·timeout은 503. AI의 인증 오류를 사용자 로그인 오류 401로 변환하지 않음 |

HTTP socket timeout 60초, 전체 AI 호출 예산 65초, 응답 최대 2 MiB. 리다이렉트·환경 proxy는 사용하지 않는다.
JSON이 아닌 응답, 중복 JSON key, NaN/Infinity, object가 아닌 응답은 거부한다.
오류 응답에는 AI 원문, 키, 요청 본문을 포함하지 않는다. 외부 오류 재시도와 별개로 DB 저장 오류는 데이터 오류로 처리한다.

## 3. 주간 식단 API

모든 경로는 인증이 필요하며 본인 자료만 접근한다.

| Method | 경로 | 요청 / 동작 |
|---|---|---|
| POST | `/api/diet/weekly-recommendations/generate` | 아래 body. 신규 201, `expected_version`으로 전체 재생성 시 200 |
| GET | `/api/diet/weekly-recommendations?week_start_date=2026-10-19` | 해당 주 식단. 날짜 생략 시 KST 현재 주 월요일 |
| GET | `/api/diet/weekly-recommendations/{plan_id}` | 본인 plan ID로 조회 |
| POST | `/api/diet/weekly-recommendations/{plan_id}/meals/{day}/{meal_type}/regenerate` | `{"expected_version": 1}`. 재조회 시 받은 버전 필요 |

생성 요청:

```json
{
  "week_start_date": "2026-10-19",
  "disliked_foods": ["가지"],
  "additional_input": "간이 강하지 않은 식단",
  "meal_target": {
    "calories_kcal": 550,
    "protein_g": 30,
    "fat_g": 18,
    "carbohydrate_g": 70
  }
}
```

모든 생성 필드는 선택이다. 날짜 기본값은 현재 주, 기피 음식은 `[]`, 추가 조건·영양 목표는 `null`.
이미 있는 주 전체를 다시 생성할 때만 `expected_version`을 함께 보낸다. 이때 기피 음식·추가 조건·영양 목표를
생략하면 기존 값을 유지한다. `disliked_foods: []` 또는 다른 선택 필드의 명시적 `null`은 값을 비운다.
`meal_target`을 제공하면 4개 수치가 모두 필요하며 열량은 양수다. 이는 사용자가 지정하는 목표이지 건강 수치가 아니다.
기피 음식은 해당 주 계획의 조건으로 저장한다. 현재 별도 전역 기피 음식 설정 API는 없다.

응답은 다음 키를 갖는다. 전체 `result` 형태는 [주간 fixture](weekly-diet-example.json)를 참조한다.

```json
{
  "ok": true,
  "weekly_diet_plan_id": "00000000-0000-4000-8000-000000000003",
  "week_start_date": "2026-10-19",
  "timezone": "Asia/Seoul",
  "version": 1,
  "generator": "auto-fit-ai",
  "result": "실제 응답에서는 AI result object 전체이며 각 day에 date가 추가됨",
  "last_replacement": null
}
```

위 코드는 envelope 설명용이며 응답 검증 fixture가 아니다.
반환할 때만 날짜를 추가하고 DB에는 AI `result`를 보존한다. `last_replacement`는 마지막 재추천의
`generator/meal/cautions/sources` 등을 포함하는 AI 응답 전체이며, 원래 주간 생성의 metadata와 구분한다.

- 같은 사용자·같은 주의 `expected_version` 없는 중복 생성은 409. 전체 재생성은 일치하는 버전으로만 가능하다.
- 월요일 이외 날짜·잘못된 요일/식사 enum·부정확한 입력은 422.
- 없는 계획과 다른 사용자 계획은 모두 404.
- 오래된 `expected_version` 및 생성 도중 입력 context 변경은 409.
- 저장 후 알레르기·목표가 바뀌면 조회·한 끼 변경도 409(`detail.weekly_diet_plan_id/version` 포함).
  변경된 제한을 반영하려면 같은 주를 `generate`에 `expected_version`과 함께 보내 전체 재생성한다.
- DB에서도 사용자별 lock으로 알레르기·목표 변경과 저장을 직렬 처리하고 실제 저장 시 snapshot을 재검증한다.
  알레르기 기준정보 변경도 shared/exclusive catalog lock으로 조정한다.
- 재추천은 28개 기존 메뉴명을 `excluded_menu_names`로 전달하고, 응답 슬롯·중복 메뉴·제한 음식을 확인한다.
- 확정된 재료 정보가 없는 `current_ingredients`는 `[]`로 전달한다. 완성 음식 item 이름을 조리 재료로 추정하지 않는다.

## 4. AI 입력 및 저장 매핑

| AI 필드 | 현재 연결한 백엔드 원본 / 처리 |
|---|---|
| `food_allergens` | 인증 사용자 `user_allergies` + 활성 `allergy_types`의 이름. 조회 실패·해석 불가 시 생성 중단 |
| `disliked_foods` | 신규 주간 생성 body → 계획의 `request_context`. 재추천·Recipe 입력에서도 별도 목록 유지 |
| `goal_type` | 사용자 `user_exercise_profiles.goal_type`. 없는 경우 `null`; 식단에도 같은 목표 enum을 쓸지 모델 측 확인 필요 |
| `metric_statuses` | 현재 `{}`. 저장된 평가 지표와 AI 상태 enum의 매핑이 미확정이므로 질환·판정 추정 안 함 |
| `additional_input` | 생성 body의 제한된 추가 조건. 사용자가 직접 기재한 개인정보까지 자동 익명화하는 것은 아님 |
| `sido/sigungu/nearby_regions` | 현재 `null/null/[]`. 지역 저장·계산 흐름 미연결, GPS 전달 없음 |
| `meal_target` | 생성 body의 한 끼 목표 또는 `null`. 기존 일일 식단의 고정 목표를 사용자 건강 목표로 추정하지 않음 |
| `weekly_plan` | 월~일 정확히 7개, 각 날 4끼 필수. JSONB로 원본 보존 |
| `items` | 원본 음식명·양·영양 값·순서를 보존. 기존 정수 `foods` 변환기를 거치지 않음 |
| `menu_name/description/nutrition/guidance` | 원본 result에 보존. 메뉴 영양과 음식별 영양을 별개로 유지 |

기존 일일 `foods`와 AI `items`의 대응은 `quantity (unit=g) ↔ portion_g`,
`calories ↔ calories_kcal`, `carbohydrates ↔ carbohydrate_g`, `protein ↔ protein_g`, `fat ↔ fat_g`이다.
기존 단위가 g가 아니면 양을 임의 환산할 수 없다. 신규 주간 저장 경로는 이 변환을 사용하지 않는다.

현재 백엔드의 제한 식품 검사는 이름과 기존 alias 기반 보조 검사다. 완성 음식명만으로 알레르기 안전을
보장하지 않는다. AI 측의 재료 기반 안전 검사를 대체하지 않으며 Recipe의 `safety_checked`,
`restriction_matches`와 unavailable 처리 규칙을 함께 확정해야 한다.
`goal_type=other`의 `custom_goal` 전달은 현재 미연결이다. AI의 추가 조건과 어떤 방식으로 합칠지
목표 enum 계약과 함께 확정해야 한다. 이번 단계는 건강 지표·지역까지 반영하는 전체 개인화 완료 상태가 아니다.

## 5. 건강 데이터 DTO 전달

`GET /api/health-assessments/input`은 `ready/missing/health_checkup/body_composition/diet_context`를 반환한다.
숫자 중 Decimal 필드는 현재 JSON 문자열로 직렬화된다. 필드별 null 허용과 타입은 OpenAPI에 포함했다.

| 묶음 | 주요 필드와 단위 |
|---|---|
| 공통 체격 | `height_cm` cm, `weight_kg` kg, `bmi` kg/m² |
| 건강검진 | `systolic_bp/diastolic_bp` mmHg; glucose·cholesterol·triglycerides·creatinine mg/dL; AST·ALT·GTP U/L; hemoglobin g/dL |
| 체성분 | muscle·fat mass kg; body fat·body water·protein percentage %; BMR kcal/day; body water L; visceral fat level |
| 날짜 | `checkup_date` 날짜, `measured_at/captured_at` ISO 8601 datetime |
| 냉장고 | inventory ID, 이름, quantity/unit, 구매·유통기한, freshness 상태. 만료·수량 0·사용 불가 항목은 제외 |

AI 전송 시 건강 record ID·기관명·기기명 등 분석에 불필요한 metadata를 제외할 serializer가 필요하다.
현재 백엔드 입력 응답 전체를 그대로 AI에 전달하면 안 된다. 확인한 AI 건강 schema는 주요 측정값의
숫자·문자열·null을 허용한다. 냉장고 `inventory_item_id`는 사용 재료 응답과 연결하기 위해 요구한다.
실제 적용할 AI 버전을 확인한 뒤 `{schema_version, request_id, goal, input}`으로 매핑하고 검증해야 한다.

## 6. 모델 개발자에게 확인·요청할 자료

1. **`chat_api_contract.md`, `chat_api_contract_examples.json`**: 현재 첨부에는 참조만 있다.
   history 원소 구조, pending action의 ID·유효기간·상태 전이, 확인·취소·중복 적용 규칙이 필요하다.
2. **Recipe 전체 정상·충돌·unavailable 응답 JSON**: 최상위 object/list 구조, 음식별 대응 방식,
   `safety_checked=false`일 때 노출 가능 여부를 확인해야 한다. 현재는 입력 builder만 준비했다.
3. **실제 적용 AI 버전**: 위 원격 커밋과 첨부 명세 사이에 차이가 있어 최신 브랜치/커밋이 필요하다.
   확인한 건강 분석 `analysis` schema는 기존 `MainAnalysis` 및 popup 지표·점수와 대응해야 한다.
4. **운동 추천 저장 매핑**: 확인한 AI schema에는 내부 RPC가 요구하는 종목 ID·세트·반복 등이 없어
   값을 임의 생성하지 않고 저장 구조와의 대응 규칙을 확정해야 한다.
5. **건강 status·목표 enum 및 지역 규격**: 사용자 운동 목표 enum은
   `weight_loss/muscle_gain/endurance/maintenance/rehabilitation/other`이다.
6. **AI 서버의 실제 base URL·검증용 환경** 및 응답 최대 크기·timeout 적합성. 키는 별도 안전한 경로로 설정한다.

## 7. 로컬 구현 검증 및 적용 순서

실행한 검증:

- `backend/.venv/bin/python -m pytest -q backend/tests`: 699개 통과(기존 deprecation warning 6건).
- 요청 예시·구버전 응답 거부 테스트 추가 후 `test_weekly_diet.py`, `test_ai_server.py`,
  `test_openapi.py` 대상 83개 통과(기존 deprecation warning 1건). 이 추가 이후 전체 테스트는 재실행하지 않았다.
- `node backend/tests/weekly_diet_sql.mjs <installed @electric-sql/pglite path>`:
  7일 저장, 정밀도, 중복 주·불완전 슬롯 거부, 소유권, 버전 충돌, DB 역할 접근 제한,
  전체 재생성·저장 직전 알레르기/목표 변경 거부,
  실제 기존 탈퇴 migration의 쓰기 차단·본인 계획 cascade 삭제 검증.
- OpenAPI는 실행 중인 로컬 app schema에서 추출하고 참조 무결성을 확인했다.

배포 전 필요한 순서:

1. 기존 계정 무결성·탈퇴 및 `20260908033403_chat_rate_limits.sql` migrations가 적용된 Auto-Fit 프로젝트에
   `supabase/migrations/20261020044749_weekly_ai_diet_plans.sql`을 2026-10-20 적용했다.
2. 서버 전용 `AI_SERVER_BASE_URL`, `AI_SERVER_API_KEY`, `AI_SERVER_ENABLED=true`를 설정한다.
   기존 `CHAT_AI_*`와 분리되어 있다. `.env.example`만 변경했으며 실제 AI 설정은 변경하지 않았다.
3. 합성 사용자로 실제 AI 생성→주간 조회→한 끼 교체→다른 사용자 접근 실패를 통합 검증한다.
4. 프론트 주간 화면 연결 후 E2E를 검증한다. 기존 일일 기록과의 연결은 별도 계약을 확정한다.

비활성화는 `AI_SERVER_ENABLED=false`로 신규 AI 호출을 중단한다. 저장 데이터는 유지하며 조회는 가능하다.
롤백 시 신규 router 연결을 제거하면 기존 일일 기능으로 돌아갈 수 있다. 테이블 삭제는 데이터 손실이므로
자동 rollback에 포함하지 않는다.

DB 권한 구성은 [Supabase RLS 가이드](https://supabase.com/docs/guides/database/postgres/row-level-security)와
[Database functions 가이드](https://supabase.com/docs/guides/database/functions)를 참고했다.

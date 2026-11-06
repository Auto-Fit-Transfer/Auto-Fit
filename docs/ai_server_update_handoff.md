# Auto-Fit AI Server 업데이트 인계서

> 2026-11-04 참고: 이 문서의 `rules_v1` 사용·fallback 설명은 이전 연동 상태다.
> 새 운동 추천 생성은 AI 전용이며, 완료 분석은 `/analyze/exercise-session`을 사용한다.
> 변경 코드는 Backend 및 AI Server 작업 트리에 있고 배포 전이다.

> 이 문서는 Auto-Fit AI Server의 누적 개발·연동 상태를 관리하는 상시 인계서다.
> 기능 업데이트 후 기존 이력을 삭제하지 않고 문서 마지막의 업데이트 이력에 새 항목을
> 추가한다.

## 문서 정보

| 항목 | 값 |
|---|---|
| 문서 버전 | 1.6 |
| 최초 작성일 | 2026-11-02 |
| 최종 갱신일 | 2026-11-04 |
| 대상 | Frontend, Backend, AI Server, 배포·인프라 담당자 |
| AI 저장소 | `Auto-Fit-Transfer/Auto-Fit` |
| AI 브랜치 | `ai` |
| 원격 AI 코드 기준 커밋 | `ffa3a2b` |
| 상세 OpenAPI | [ai-openapi.json](ai-openapi.json) |
| Backend 연동 명세 | [backend_ai_integration_spec.md](backend_ai_integration_spec.md) |

## 1. 문서 업데이트 규칙

기능을 수정하거나 배포할 때 다음 규칙을 적용한다.

1. `최종 갱신일`과 `문서 버전`을 갱신한다.
2. 현재 상태가 바뀌면 기능 현황 표를 수정한다.
3. 문서 마지막 `업데이트 이력`에 날짜별 항목을 추가한다.
4. 이전 이력은 삭제하지 않는다.
5. 잘못된 이전 내용은 삭제하는 대신 새 이력에 정정 사유와 대체 내용을 기록한다.
6. 구현, 검증, Backend 연동, Frontend 연동, 배포 상태를 구분한다.
7. 테스트하지 못한 기능은 `완료`로 표시하지 않는다.
8. API Key, DB 비밀번호, JWT secret, 사용자 개인정보는 기록하지 않는다.
9. API 계약 변경 시 요청·응답 예제와 OpenAPI 스냅샷을 함께 갱신한다.
10. 변경 커밋이 없으면 `미커밋`이라고 명시한다.

사용할 상태값:

- `구현 완료`: 코드 구현과 로컬 검증 완료
- `부분 구현`: 주요 코드는 있으나 범위 또는 provider가 제한됨
- `연동 대기`: AI 구현은 있으나 Frontend 또는 Backend가 아직 호출하지 않음
- `외부 검증 필요`: API Key, 외부 서비스 또는 실제 데이터가 필요함
- `배포 완료`: 배포 환경에서 smoke 또는 E2E 검증 완료
- `보류`: 팀 결정이나 외부 계약이 필요함

## 2. 시스템 역할과 호출 원칙

```text
React Native Frontend
        |
        | 사용자 인증 토큰
        v
Backend API
        |
        | 서버 간 Bearer API Key
        v
FastAPI AI Server
        |
        +-- OpenAI Structured Output
        +-- RAG / 검증 문서
        +-- 공식 Food DB
        +-- 식품안전나라 COOKRCP01
        +-- 공공 러닝 코스 데이터
        +-- Kakao / 경로 provider
        +-- MediaPipe 자세 분석
```

원칙:

- Frontend는 AI Server를 직접 호출하지 않는다.
- 서버 간 API Key는 Backend와 AI Server에만 보관한다.
- AI Server는 사용자 원본 인증 토큰이나 사용자 DB에 직접 접근하지 않는다.
- Backend가 인증, 사용자 데이터 조회, 영구 저장, 상태 전이를 담당한다.
- AI Server는 추천·분석·경로 계산 결과를 구조화된 응답으로 반환한다.
- 외부 provider 실패 결과를 정상 결과로 위장하지 않는다.

## 3. 현재 API 목록

현재 `docs/ai-openapi.json`에서 확인되는 주요 API다.

### 상태 확인

- `GET /`
- `GET /health`
- `GET /health/recipe`
- `GET /health/diet`
- `GET /health/chat`
- `GET /health/analysis`

### 건강·체성분 분석

- `POST /analysis`
- `POST /analysis/debug-inputs`
- `POST /ai/body-analysis`
- `POST /health-analysis`
- `POST /health-analysis/diet-refresh`

### 식단·레시피·운동 추천

- `POST /recommend/diet`
- `POST /recommend/diet/replace-meal`
- `POST /recommend/diet/recipe`
- `POST /recommend/exercise`

### 챗봇

- `POST /chat`
- `POST /chat/intent-test`
- `POST /chat/orchestrate`

### 러닝

- `GET /running/places/search`
- `GET /running/courses/recommend`
- `GET /running/courses/{course_id}`
- `POST /running/routes/preview`
- `POST /running/routes/generate-loop`
- `POST /running/session/recommend`

### 음식 이미지·자세 분석

- `POST /food-analysis/analyze`
- `POST /food-analysis/recalculate`
- `POST /posture-analysis/analyze`

### RAG 점검

- `GET /rag/test-search`
- `POST /rag/debug-analysis-search`

debug API는 운영 노출 여부를 별도로 관리해야 한다.

## 4. 기능별 현재 상태

| 영역 | AI 구현 | Backend 연동 | Frontend 연동 | 현재 상태 |
|---|---|---|---|---|
| 건강·체성분 분석 | 규칙·RAG·LLM 분석 및 fallback 존재 | 계약 존재 | 건강 리포트 화면 흐름 존재 | 구현 완료, E2E 재검증 필요 |
| 건강 점수·추세 | 식단·운동·건강 데이터 점수 서비스와 챗봇 연결 존재 | 계약 문서 존재 | 리포트 화면 존재 | 구현 완료, Backend 데이터 E2E 필요 |
| 주간 식단 추천 | Food DB 기반 후보·다양성·지역·RAG·LLM 설명 | Backend 식단 경로 존재 | 식단 화면 존재 | 구현 완료, 최신 건강목표 연동 필요 |
| 한 끼 재추천 | 공식 후보·안전 필터·OpenAI fallback·성능 최적화 | Backend 경로 존재 | 재추천 화면 존재 | 구현 완료, 최신 목표 계약 재검증 필요 |
| Recipe | 공식 exact → similar → LLM → unavailable | API 계약 존재 | Recipe 표시 계약 존재 | 구현 완료 |
| 운동 추천 | 기존 LLM 추천 + 로컬 CSV 강제 변경 | 현재 앱은 `rules_v1`만 사용 | Backend 공개 API 사용 | AI 구현, 실제 앱 연동 대기 |
| 러닝 코스 | 공공 코스·위치 추천·경로 preview·loop·세션 추천 | 인증·저장 Backend 경로 존재 | 러닝 화면 존재 | 구현 완료, provider live 검증 필요 |
| 챗봇 | 일반 답변·의도 분류·식단 변경·러닝 orchestration | Backend 적용 상태 관리 필요 | 챗 화면 존재 | 구현 완료, 액션 E2E 필요 |
| 운동 자세 분석 | MediaPipe Pose 기반 측면 스쿼트 분석 | Backend 계약 존재 | 촬영·결과 화면 존재 | 제한 범위 구현 완료 |
| 음식 이미지 분석 | 분석·재계산 API와 계약 존재 | OCR/이미지 전달 계약 확인 필요 | 촬영·확인 UI 계획 존재 | 부분 구현, provider·E2E 필요 |
| RAG | 건강 문서 검색·출처 제한·분석 연결 | AI 내부 사용 | 직접 노출하지 않음 | 구현 완료 |

## 5. 건강·체성분 분석

주요 구성:

- 입력 정규화와 개인정보 최소화
- Rule Engine 기반 metric 상태 판정
- 검증된 RAG context 결합
- OpenAI Structured Output
- 외부 LLM 실패 시 안전한 fallback
- 제공되지 않은 건강 수치와 질환을 추정하지 않는 정책
- 의료 진단이나 치료 처방을 생성하지 않는 정책

관련 주요 파일:

- `app/routers/analysis_router.py`
- `app/routers/health_analysis_router.py`
- `app/services/analysis_input_service.py`
- `app/services/health_analysis_service.py`
- `app/services/health_analysis_adapter.py`
- `app/services/health_analysis_validation_service.py`
- `app/services/health_analysis_output_validator.py`
- `app/services/rule_engine_service.py`
- `app/services/privacy_service.py`

건강 분석과 운동·식단 추천은 분리되어 있다. 운동 또는 식단 추천을 받기 위해 인바디와
건강검진을 반드시 업로드할 필요는 없다. 건강 상태 분류가 실제로 제공된 경우에만 추가
개인화와 안전 조건에 사용한다.

## 6. 건강 점수와 건강 리포트

현재 정책:

- 식단 점수는 추천 열량·탄수화물·단백질·지방 목표 준수도를 기준으로 계산한다.
- 운동 점수는 설정한 주간 빈도·시간·수행 결과를 기준으로 계산한다.
- 식단·운동 점수는 초기 0점에서 실제 수행에 따라 누적한다.
- 건강 데이터 점수는 최초 인바디와 건강검진을 기준점으로 사용한다.
- 건강 데이터 점수 계산에는 인바디와 건강검진이 모두 필요하다.
- 건강 데이터 점수 초기 기준은 80점이다.
- 점수 설명은 진단이 아니라 건강관리 추세로 표현한다.

관련 주요 파일과 계약:

- `app/services/health_score_service.py`
- `app/services/chat_orchestrator_service.py`
- [health_report_chat_backend_contract.md](health_report_chat_backend_contract.md)
- [health_report_api_contract_examples.json](health_report_api_contract_examples.json)

## 7. 식단 추천

### 7.1 기본 정책

- 공식 Food DB 기반 음식 후보를 사용한다.
- LLM이 메뉴의 열량과 탄수화물·단백질·지방을 임의로 확정하지 않는다.
- 서버가 검증된 Food DB 영양값을 최종 적용한다.
- 알레르기 제외가 개인화보다 우선한다.
- 기피 음식은 선호 기반 제외로 처리한다.
- 건강 상태, 한 끼 목표, 지역 특산물, 메뉴 다양성, family 반복 제한을 반영한다.
- 냉장고 재료 없이도 추천할 수 있다.
- LLM은 검증 메뉴에 대한 설명과 guidance 생성에 사용한다.
- 식단 생성과 Recipe 생성을 분리해 초기 응답 시간과 비용을 줄인다.

### 7.2 추천 메뉴 영양정보

각 메뉴 전체 기준으로 다음 값을 유지한다.

- `calories_kcal`
- `carbohydrate_g`
- `protein_g`
- `fat_g`

재료별 열량과 탄수화물·단백질·지방은 생성하지 않는다.

### 7.3 건강목표 계약

로컬 작업 트리에 다음 입력이 추가됐다.

```json
{
  "health_goal": {
    "goal_type": "muscle_gain",
    "goal_text": null
  }
}
```

허용 `goal_type`:

- `fat_loss`
- `muscle_gain`
- `fitness`
- `maintenance`
- `other`

`health_goal`은 `null`일 수 있다. `goal_text`는 최대 200자이며 사용자 데이터로만
처리한다. 기존 최상위 `goal_type`은 하위 호환을 위해 유지한다.

기존 값 매핑:

| 기존 값 | 신규 값 |
|---|---|
| `weight_loss`, `body_fat_loss` | `fat_loss` |
| `muscle_gain` | `muscle_gain` |
| `endurance`, `general_fitness` | `fitness` |
| `general_health`, `health_maintenance` | `maintenance` |
| `rehabilitation` | `other` |

건강목표만으로 질환, 개인 필요 열량, 치료 효과를 추정하지 않는다.

관련 주요 파일:

- `app/routers/recommendation_router.py`
- `app/schemas/recommendation.py`
- `app/services/diet_recommendation_service.py`
- `app/services/food_catalog_service.py`
- `app/services/diet_context_service.py`
- `app/services/diet_personalization_service.py`
- `app/services/local_specialty_service.py`
- `app/services/diet_refresh_service.py`

## 8. Recipe Pipeline

처리 순서:

```text
official_exact
  → official_similar
  → llm_generated
  → unavailable
```

역할 분리:

- `RecipeService`: 식품안전나라 COOKRCP01 공식 API 전용
- `MealRecipeService`: 검색어 확장, 유사도, 안전검사, LLM fallback, cache, 최종 응답
- `DietRecommendationService`: Recipe를 직접 생성하지 않음

검증 사례:

- 입력: `톳나물_두부`
- 공식 메뉴: `톳나물 두부무침`
- 결과: `official_similar`
- 기존 유사도: 약 `0.9157`

재료 구조:

```json
{
  "name": "두부",
  "amount_g": 56.0
}
```

공식 serving weight와 추천 portion이 다르고 원본 g 단위가 명확하면 비율로 재료량을
조정할 수 있다. 단위가 불명확하면 임의 g 값을 생성하지 않는다.

`app/services/llm_recipe_service.py`는 현재 Git 기준 추적되지 않은 파일이며,
`MealRecipeService` 내부 fallback과 중복될 가능성이 있다. 전체 refactor 전에는 기존
Pipeline에 연결하거나 임의 삭제하지 않는다.

관련 문서:

- [recipe_api_contract_examples.json](recipe_api_contract_examples.json)
- [backend_ai_integration_spec.md](backend_ai_integration_spec.md)

## 9. 운동 추천

### 9.1 AI Server 로컬 구현

현재 로컬 작업 트리에 구매한 GIF 목록 기반 CSV 카탈로그 강제가 구현됐다.

- 카탈로그: `data/exercise_assets/exercise_asset_catalog.csv`
- 전체 행: 7,599개
- 추천 가능한 primary·auto-mapped 자산: 6,369개
- 고유 운동 key: 5,323개
- LLM 후보 제한: 요청당 최대 48개

정책:

- `mapping_status=auto_mapped`
- `is_primary_asset=true`
- OpenAI는 전달받은 후보의 `exercise_key`만 선택
- 후보 밖 key는 실패 처리
- 응답에서 GIF 로컬 경로와 바이너리를 제외
- `catalog_version`은 LF 정규화 CSV SHA-256
- Backend가 같은 CSV로 key를 검증하고 GIF URL을 제공

AI 운동 item 응답 예시:

```json
{
  "exercise_key": "ex_846f603683467e",
  "name": "45도 바이시클 트위스트 크런치",
  "catalog_name_en": "45 Degree Bycicle Twisting Crunch",
  "exercise_modes": ["gym"],
  "duration_minutes": 5,
  "intensity": "보통",
  "instructions": [
    "복부에 힘을 유지하고 천천히 수행하세요."
  ]
}
```

### 9.2 최신 앱과 Backend 실제 상태

2026-11-02 확인 기준:

- Frontend 최신 기준: `origin/front_new` / `e2133be`
- Backend 최신 기준: `origin/backend` / `20661bf`
- Frontend는 운동 조건을 Backend에 저장한 뒤 빈 객체로 생성 API를 호출한다.
- Backend는 AI `/recommend/exercise`를 호출하지 않는다.
- Backend 응답 generator는 `rules_v1`이다.
- Backend는 제한된 운동 후보를 직전 결과에 따라 회전한다.
- 따라서 앱의 동일 운동 반복은 현재 Backend 규칙 생성 구조에서 발생한다.
- AI Server에 seed를 추가하는 것만으로는 현재 앱 결과가 바뀌지 않는다.

현재 흐름:

```text
Frontend
  → POST /api/exercise/recommendation-contexts
  → POST /api/exercise/recommendations/generate {}
  → Backend rules_v1
  → Supabase
  → Frontend
```

목표 흐름:

```text
Frontend
  → Backend 인증·조건 저장
  → AI POST /recommend/exercise
  → CSV key 검증
  → Backend DB 저장·GIF URL 조립
  → Frontend
```

### 9.3 계약 불일치

- 최신 Frontend는 시간, 장소, 기구, 컨디션, 불편 부위를 통합 형태로 수집한다.
- AI 스키마는 헬스의 training style·focus area와 홈트의 workout style을 요구한다.
- Frontend는 현재 focus area와 workout style을 제공하지 않는다.
- Frontend의 `bodyweight`는 Backend 요청에서 `mat`으로 변환된다.
- AI 카탈로그 장비 값은 `none`, `band`, `dumbbell`, `other` 중심이다.
- `bodyweight`, `mat`, `none`의 공통 enum을 확정해야 한다.
- Backend DB는 현재 `exercise_key`와 `catalog_version` 저장 계약이 없다.

### 9.4 반복 방지 예정 계약

권장 추가 필드:

```json
{
  "recommendation_seed": 1723456789,
  "excluded_exercise_keys": [
    "ex_11111111111111",
    "ex_22222222222222"
  ]
}
```

이 필드는 아직 공개 스키마에 구현되지 않았다.

구현 원칙:

- Backend가 요청마다 seed를 생성한다.
- Backend가 최근 추천·완료 운동 key를 제외 목록으로 전달한다.
- 동일 seed와 동일 요청은 재현 가능해야 한다.
- 다른 seed는 안전 조건 안에서 다른 후보군을 만들어야 한다.
- 한 추천 안에서 같은 key를 중복 사용하지 않는다.
- 안전·장비·불편 부위 조건이 다양성보다 우선한다.

자세한 당일 계약은 [ai_api_update_handoff_2026-11-02.md](ai_api_update_handoff_2026-11-02.md)를
참고한다.

## 10. 러닝

구현 범위:

- 장소 검색
- 공식·공공 코스 추천
- 코스 상세 조회
- GPS 또는 지정 출발지 기반 경로 preview
- 순환 코스 후보 생성
- 목표 거리와 실제 경로 거리 비교
- seed 기반 후보 변화
- 러닝 컨디션·강도·페이스 기반 세션 추천
- Kakao 좌표 순서 변환과 경로 검증
- 공공 코스 provider fallback

주요 정책:

- 좌표 내부 표현은 WGS84 `latitude`, `longitude`
- GeoJSON은 `[longitude, latitude]`
- 경로 provider x는 경도, y는 위도
- 순환 코스 목표 거리 오차 초기 기준은 ±10%
- 허용 오차를 만족하지 못하면 실제 거리와 오차를 명시
- 실제 provider가 반환한 도로 형상을 사용
- 외부 API 약관과 저장·지도 표시 조건을 별도 확인

관련 문서:

- [running_ai_backend_handoff.md](running_ai_backend_handoff.md)
- [running_backend_e2e_contract.md](running_backend_e2e_contract.md)
- [running_api_contract_examples.json](running_api_contract_examples.json)

외부 API Key와 한국 지역 경로 품질이 필요한 테스트는 live test로 분리한다.

## 11. 챗봇

구현 범위:

- 일반 건강관리 질문 답변
- intent 분류
- 식단 변경 의도 추출
- 식단 변경 확인·적용 상태 계약
- 러닝 코스 검색·추천 조건 추출
- GPS context 기반 러닝 추천
- 건강 점수·리포트 설명
- Backend 저장 정보 조회 context 활용
- 동시 요청과 보안 경계 테스트

중요:

- 챗봇이 Backend 데이터에 직접 쓰지 않는다.
- 변경 의도를 구조화하여 Backend가 확인·저장·적용한다.
- 실제 사용자 상태 변경은 Backend가 담당한다.
- 건강 관련 답변은 RAG 출처와 실제 metric 상태만 사용한다.
- 사용자 캐릭터별 말투·성격은 Frontend·Backend 계약 확정 후 추가한다.

관련 문서:

- [chat_api_contract.md](chat_api_contract.md)
- [chat_api_contract_examples.json](chat_api_contract_examples.json)
- [health_report_chat_backend_contract.md](health_report_chat_backend_contract.md)

## 12. 운동 자세 분석

현재 지원 범위:

- `POST /posture-analysis/analyze`
- MediaPipe Pose Landmarker Full
- 운동: `squat`
- 카메라: `side`
- MP4, MOV, WEBM, AVI
- 기본 제한: 50MB, 60초
- 완료 회차와 주요 자세 문제 분석
- Backend 작업 UUID 계약
- 원본 및 임시 영상 비영구 저장

현재 제한:

- 스쿼트 측면 이외 운동은 아직 지원하지 않는다.
- 실시간 스트리밍 분석이 아니라 업로드 영상 동기 분석이다.
- 모델 파일과 MediaPipe runtime이 없는 배포에서는 `503`이 발생한다.
- 품질 부족 또는 완료 회차 미검출은 `422`로 처리한다.

관련 문서:

- [posture_analysis_backend_contract.md](posture_analysis_backend_contract.md)
- [posture_analysis_contract_examples.json](posture_analysis_contract_examples.json)

## 13. 음식 이미지 분석

현재 API:

- `POST /food-analysis/analyze`
- `POST /food-analysis/recalculate`

목표 흐름:

```text
스마트폰 촬영 이미지
  → Backend 파일 전달
  → AI 음식 후보·양 추정
  → 사용자 확인 또는 수정
  → Backend 최종 저장
```

원칙:

- AI 인식 결과를 사용자 확인 없이 최종 기록으로 확정하지 않는다.
- 사용자가 저장 또는 수정 후 저장을 선택한다.
- OCR은 Backend 담당으로 분리한다.
- 특정 외부 음식 인식 provider의 정확도 비교는 추후 전체 평가 단계에서 진행한다.
- 실제 Backend multipart 계약과 이미지 크기·형식 제한은 E2E 전에 최종 확정한다.

관련 문서:

- [food_image_backend_contract.md](food_image_backend_contract.md)

## 14. RAG와 OpenAI 정책

RAG 정책:

- 검증된 건강 문서 context를 우선한다.
- RAG에 없는 기관이나 출처를 만들어내지 않는다.
- 실제 입력된 metric 상태를 사용한다.
- 제공되지 않은 수치를 추측하지 않는다.
- 의료 진단과 치료 처방을 생성하지 않는다.

OpenAI 정책:

- `AsyncOpenAI`를 사용한다.
- Structured Output은 기존 `client.responses.parse(...)` 패턴을 유지한다.
- 비용과 latency를 고려해 중복 호출을 만들지 않는다.
- fallback 가능한 경로는 provider 장애와 timeout을 분리해 기록한다.
- 원본 사용자 개인정보 대신 필요한 최소 상태 분류만 전달한다.

## 15. 데이터와 외부 provider

| 데이터·provider | 용도 | 상태 |
|---|---|---|
| 공식 Food DB | 식단 후보와 메뉴 전체 영양값 | 사용 중 |
| 식품안전나라 COOKRCP01 | 공식 레시피 exact·similar | 실제 호출 검증 경험 있음 |
| OpenAI API | 설명, guidance, Recipe fallback, 추천 | 설정 필요 |
| RAG 문서 | 건강 설명 근거 | 사용 중 |
| 전국길관광정보·공공 코스 | 러닝 공식 코스 | 연동 코드 존재 |
| Kakao 지도·경로 | 장소·경로 preview | API Key와 live 검증 필요 |
| 운동 GIF CSV | 운동 key와 Backend 자산 매핑 | 로컬 미커밋, 연동 대기 |
| MediaPipe 모델 | 스쿼트 자세 분석 | 모델 파일 배포 필요 |

외부 서비스의 무료 할당량, 유료 조건, 상업 이용, 저장 가능 범위와 라이선스는 배포 전
공식 문서 기준으로 다시 확인한다.

## 16. 보안과 환경변수

비밀값을 문서나 Git에 기록하지 않는다.

주요 환경변수 이름:

```text
OPENAI_API_KEY
AI_SERVER_API_KEY
식품안전나라 API Key 환경변수
Kakao 관련 API Key 환경변수
공공데이터 API Key 환경변수
MediaPipe 모델 경로 환경변수
```

Backend 측 연동에 필요한 이름:

```text
AI_SERVER_ENABLED
AI_SERVER_BASE_URL
AI_SERVER_API_KEY
EXERCISE_GIF_ROOT
```

`EXERCISE_GIF_ROOT`는 제안된 Backend 환경변수이며 현재 최신 Backend 운동 생성 경로에
구현된 상태는 아니다.

## 17. 테스트와 검증 상태

Repository에는 다음 영역의 테스트가 존재한다.

- Diet candidate/cache/LLM fallback/RAG/refresh
- weekly schedule/diversity/quality/local specialty
- Recipe query/structure/cache/resilience/router/contract
- Chat intent/orchestration/concurrency/security
- Health analysis/score/report/resilience
- Running course/loop/session/OpenAPI/E2E/live
- Exercise Frontend preferences와 CSV enforcement
- Posture analysis contract/service
- Food image analysis
- Backend AI contract snapshot
- 배포 서버 smoke

2026-11-02 로컬 변경 관련 실행 결과:

- 관련 Pytest 27개 통과
- 기존 동기식 식단·운동 회귀 스크립트 4개 통과
- Python 문법 검사 통과
- OpenAPI 스냅샷 계약 통과
- `git diff --check` 통과

제약:

- 현재 Windows 환경에는 `pytest-asyncio`가 설치되어 있지 않다.
- 일부 `asyncio.run()` 기반 테스트에서 환경 이벤트 루프 정지 현상이 발생했다.
- 해당 비동기 테스트는 CI 또는 정상 비동기 테스트 환경에서 재실행해야 한다.
- 외부 API live 테스트는 API Key, quota, 네트워크 상태에 따라 별도로 실행한다.

## 18. 현재 작업 트리 주의사항

2026-11-02 현재 AI 브랜치에는 커밋되지 않은 변경이 있다.

이번 변경 범위:

- `app/schemas/recommendation.py`
- `app/services/diet_recommendation_service.py`
- `app/services/exercise_recommendation_service.py`
- `app/services/exercise_catalog_service.py` 신규
- `data/exercise_assets/exercise_asset_catalog.csv` 신규
- `docs/ai-openapi.json`
- `docs/backend_ai_integration_spec.md`
- `test_diet_health_goal_contract.py` 신규
- `test_exercise_catalog_enforcement.py` 신규
- `test_exercise_frontend_preferences.py`

별도 확인 없이 이번 변경으로 간주하거나 삭제하면 안 되는 기존 미추적 항목:

- `.tmp_docs/`
- `artifacts/`
- `app/services/diet_service.py`
- `app/services/llm_recipe_service.py`

커밋 전 실제 import와 사용처, 파일 소유 범위를 다시 확인한다.

## 19. 현재 우선순위

1. 최신 Frontend 기준 운동 통합 요청 DTO 확정
2. `bodyweight`, `mat`, `none`과 컨디션·장소 enum 확정
3. AI 운동 요청 스키마 하위 호환 확장
4. Backend의 실제 AI 운동 adapter 구현
5. DB에 `exercise_key`, `catalog_version` 저장 계약 추가
6. Backend CSV 검증과 GIF URL 제공 구현
7. 운동 추천 seed·최근 key 제외·중복 방지 구현
8. 기존 Backend `rules_v1` fallback 유지
9. OpenAPI·계약 예제·테스트 갱신
10. Frontend → Backend → AI Server E2E
11. 비동기 전체 테스트와 외부 provider live test
12. 검증 완료 후 AI 브랜치 커밋·배포

## 20. 담당자별 확인 목록

### Frontend

- Backend 공개 API만 호출하는가
- 운동 시간·장소·기구·컨디션·불편 부위가 누락 없이 전송되는가
- `demo_video_url` 또는 합의된 GIF URL을 표시하는가
- 로컬 파일 경로나 서버 간 API Key를 사용하지 않는가
- 건강자료가 없는 사용자를 운동·식단 추천에서 불필요하게 차단하지 않는가

### Backend

- 사용자 인증과 저장을 담당하는가
- AI 요청에 필요한 최소 상태만 전달하는가
- AI 응답 스키마와 catalog version을 검증하는가
- `exercise_key`를 DB와 GIF 자산에 안정적으로 연결하는가
- AI 장애 fallback과 `generator`를 구분하는가
- Frontend에 서버 내부 경로를 노출하지 않는가

### AI Server

- OpenAPI 스냅샷이 runtime과 일치하는가
- 공식 DB와 카탈로그 밖 데이터를 정상 결과로 만들지 않는가
- 알레르기·안전 정책을 우회하지 않는가
- 제공되지 않은 건강 상태를 추측하지 않는가
- 실제 연동되지 않은 기능을 배포 완료로 표시하지 않는가

### 배포·인프라

- HTTPS 기본 URL과 서버 간 Bearer Key가 설정됐는가
- secret이 로그와 Frontend에 노출되지 않는가
- CSV와 모델 파일이 배포 이미지에 포함됐는가
- 외장하드 mount와 GIF root 권한이 올바른가
- health probe와 smoke test가 통과하는가
- 배포 커밋을 문서 업데이트 이력에 기록했는가

## 21. 통합 완료 기준

- import와 syntax 오류가 없다.
- runtime OpenAPI와 저장된 명세가 일치한다.
- 기존 Diet·Recipe·RAG 핵심 회귀 테스트가 통과한다.
- 공식 Recipe exact·similar와 LLM fallback이 유지된다.
- 알레르기 safety가 유지된다.
- 운동 추천은 CSV에 존재하는 key만 반환한다.
- Backend가 운동 key와 GIF를 정확히 연결한다.
- 동일 조건 재추천에서 최근 운동 제외가 동작한다.
- 건강자료가 없어도 일반 추천이 가능하다.
- AI 장애 fallback 결과가 정상 AI 결과와 구분된다.
- Frontend → Backend → AI Server E2E가 통과한다.
- 배포 환경 smoke test가 통과한다.

---

# 업데이트 이력

새 업데이트는 이 섹션의 마지막에 다음 형식으로 추가한다.

```markdown
## YYYY-MM-DD · 업데이트 제목

- 상태: 구현 완료 / 부분 구현 / 연동 대기 / 외부 검증 필요 / 배포 완료
- 관련 커밋: `<commit hash 또는 미커밋>`
- 변경 목적:
- 변경 API:
- 변경 파일:
- 기존 동작 영향:
- Frontend 작업:
- Backend 작업:
- AI·배포 작업:
- 실행 테스트:
- 테스트 결과:
- 남은 작업:
- 알려진 제한:
```

## 2026-11-02 · AI Server 누적 현황 문서화

- 상태: 구현 현황 정리
- 관련 커밋: 원격 기준 `951ac47`, 로컬 변경 미커밋
- 변경 목적: 지금까지 구현한 AI Server 기능과 연동 상태를 단일 문서로 관리
- 변경 API: 없음
- 변경 파일: `docs/ai_server_update_handoff.md`
- 기존 동작 영향: 없음
- Frontend 작업: 없음
- Backend 작업: 없음
- AI·배포 작업: 이후 업데이트마다 본 문서 갱신
- 실행 테스트: Markdown 형식 및 diff 검사
- 테스트 결과: 작성 완료
- 남은 작업: 기능 변경 시 날짜별 이력 누적
- 알려진 제한: 배포 상태는 실제 배포 커밋과 smoke 결과를 별도로 기록해야 함

## 2026-11-02 · 식단 건강목표 계약 확장

- 상태: 로컬 구현 완료, Backend 연동 대기
- 관련 커밋: 미커밋
- 변경 목적: Backend 활성 건강목표를 주간 식단과 한 끼 재추천에 반영
- 변경 API: `POST /recommend/diet`, `POST /recommend/diet/replace-meal`
- 변경 파일: `app/schemas/recommendation.py`, `app/services/diet_recommendation_service.py`, `docs/ai-openapi.json`
- 기존 동작 영향: 기존 최상위 `goal_type` 호환 유지
- Frontend 작업: 건강목표 입력·저장 방식은 Backend 계약을 따름
- Backend 작업: nullable `health_goal` 전달 및 기존 목표 매핑 확인
- AI·배포 작업: 배포 후 runtime OpenAPI 확인
- 실행 테스트: 건강목표 enum·null·legacy·악의적 자유입력·후보 점수 테스트
- 테스트 결과: 관련 테스트 통과
- 남은 작업: 실제 Backend 요청 E2E
- 알려진 제한: 건강목표만으로 개인 필요 열량이나 치료 효과를 추정하지 않음

## 2026-11-02 · 운동 GIF CSV 카탈로그 강제

- 상태: 로컬 구현 완료, Backend·Frontend 연동 대기
- 관련 커밋: 미커밋
- 변경 목적: 구매한 GIF 목록에 존재하는 운동만 AI가 추천하도록 제한
- 변경 API: `POST /recommend/exercise`
- 변경 파일: `app/services/exercise_catalog_service.py`, `app/services/exercise_recommendation_service.py`, `app/schemas/recommendation.py`, `data/exercise_assets/exercise_asset_catalog.csv`
- 기존 동작 영향: 운동 item에 `exercise_key`, `catalog_name_en`, `exercise_modes`가 추가되고 응답에 `catalog_version`이 필수
- Frontend 작업: Backend가 제공하는 GIF URL 표시
- Backend 작업: 같은 CSV 검증, key 저장, GIF URL 변환, DB adapter 구현
- AI·배포 작업: CSV 배포 및 OpenAPI 갱신
- 실행 테스트: 후보 필터, 후보 밖 key 거부, 응답 hydration, 플랫폼 독립 해시
- 테스트 결과: 관련 테스트 통과
- 남은 작업: seed·최근 key 제외, Backend 실제 호출, 모바일 E2E
- 알려진 제한: 현재 앱 Backend는 AI 운동 API를 호출하지 않고 `rules_v1` 사용

## 2026-11-02 · 최신 Frontend·Backend 운동 흐름 비교

- 상태: 분석 완료
- 관련 커밋: Frontend `e2133be`, Backend `20661bf`, AI `951ac47`
- 변경 목적: 앱에서 동일 운동이 반복되는 원인 확인
- 변경 API: 없음
- 변경 파일: 코드 변경 없음, `docs/ai_api_update_handoff_2026-11-02.md` 작성
- 기존 동작 영향: 없음
- Frontend 작업: 통합 운동 조건 계약 결정
- Backend 작업: `rules_v1`에서 AI 호출로 연결하고 fallback 유지
- AI·배포 작업: 최신 UI 조건에 맞춰 요청 스키마 확장
- 실행 테스트: 세 브랜치 호출 관계와 후보 필터 데이터 비교
- 테스트 결과: 현재 반복 원인은 Backend 규칙 후보 회전 구조로 확인
- 남은 작업: 공통 DTO·DB·GIF·seed 계약 구현
- 알려진 제한: AI Server만 수정해도 현재 앱 운동 결과는 변경되지 않음

## 2026-11-02 · 러닝 지역 정확도·장소 limit 보정

- 상태: 로컬 구현 완료, AI Server 재배포 대기
- 관련 커밋: 미커밋
- 변경 목적: `광주광역시 동구청` 검색에 대구·울산 동구 코스가 섞이는 오류와 `limit=2`가 무시되는 오류 수정
- 변경 API: `GET /running/places/search`, `GET /running/courses/recommend`
- 변경 파일: `app/routers/running_router.py`, `app/services/kakao_map_service.py`, `app/services/running_route_service.py`, `docs/ai-openapi.json`, 러닝 계약·테스트 파일
- 기존 동작 영향: 거리 필터·페이스·코스 정렬·Bearer 인증 계약은 유지하고 지역 일치와 장소 응답 개수만 엄격히 제한
- Frontend 작업: 기존 `limit` 전달 구조 유지, `official_metadata` 코스에 전체 공식 경로가 없을 수 있음을 UI에서 구분
- Backend 작업: 기존 `limit` 1~20 proxy 계약 유지, AI 재배포 후 `광주광역시 동구청&limit=2` 재시험
- AI·배포 작업: 최신 AI 이미지 재배포, `RUNNING_DURUNUBI_ENABLED` 활성화 여부 결정, runtime OpenAPI 갱신 확인
- 실행 테스트: 지역 계층 일치, GPS 시·도+시·군·구 보존, Kakao 장소 `limit=2`, OpenAPI snapshot, 러닝 계약 예제
- 테스트 결과: 관련 자동 테스트 6개 통과
- 남은 작업: 네이버 AI Server 재배포 후 Backend가 실제 호출하는 E2E, 실제 모바일 지도 표시 확인
- 알려진 제한: `official_gpx=disabled`이면 메타데이터 추천은 가능하지만 전체 공식 `path`는 보장되지 않음

## 2026-11-02 · GPS 기반 러닝 코스 3km 반경 제한

- 상태: 로컬 구현 완료, AI Server 재배포 대기
- 관련 커밋: `f9bdea1` 이후 로컬 변경 미커밋
- 변경 목적: GPS 기반 추천에서 사용자와 지나치게 먼 코스가 노출되지 않도록 코스 출발지 접근 거리를 제한
- 변경 API: `GET /running/courses/recommend`, 간접적으로 `POST /running/session/recommend`
- 변경 파일: `app/core/config.py`, `app/services/running_route_service.py`, `.env.example`, 러닝 계약·테스트 파일
- 기존 동작 영향: GPS가 있으면 출발지가 직선거리 3km 이내이고 좌표가 확인된 코스만 반환하며, GPS 없는 지역명 검색·코스 길이 ±10% 정책·가까운 순 정렬은 유지
- Frontend 작업: 추천 요청에 사용자 동의를 받은 WGS84 `latitude`, `longitude`를 함께 전달하고 빈 목록의 `generation_required`를 자동 순환 코스 생성 전이로 처리
- Backend 작업: 기존 GPS query proxy 유지, 별도 DTO 변경 없음
- AI·배포 작업: 기본값은 코드에 포함되며 필요하면 `RUNNING_COURSE_GPS_RADIUS_KM=3`을 명시한 뒤 재배포
- 실행 테스트: 3km 내부·경계 포함, 초과·좌표 미확인 제외, GPS 없는 검색 유지, 계약 예제·OpenAPI 검사
- 테스트 결과: 동기 필터 1개와 계약·OpenAPI 2개 통과; 전체 비동기 테스트는 Windows 이벤트 루프 생성 단계의 기존 소켓 대기로 이 환경에서 완료하지 못함
- 남은 작업: 배포 환경에서 GPS 좌표로 3km 내부·외부 실제 코스 E2E 및 모바일 빈 결과 fallback 확인
- 알려진 제한: 공공 메타데이터 지오코딩 후보는 `RUNNING_COURSE_GEOCODE_LIMIT` 범위에서만 좌표를 확인하므로 반경 내 코스를 누락할 가능성은 있으나, 좌표 미확인 코스를 3km 이내라고 추정해 반환하지는 않음

## 2026-11-02 · 28끼 공통 Recipe 상세 표시 계약 확장

- 상태: 로컬 구현 완료, Backend·Frontend 연동 대기
- 관련 커밋: 미커밋
- 변경 목적: 주간 7일×4끼 모든 추천 메뉴에서 동일한 Recipe 상세 화면 데이터를 제공
- 변경 API: `POST /recommend/diet/recipe`
- 변경 파일: `app/schemas/recommendation.py`, `app/routers/recommendation_router.py`, `app/services/meal_recipe_service.py`, Recipe 계약·OpenAPI·테스트 파일
- 기존 동작 영향: 기존 최소 요청과 official exact → similar → LLM → unavailable 순서, 영양값, 알레르기·기피 음식 검사는 유지
- Frontend 작업: 28개 슬롯이 공통 상세 컴포넌트를 사용하고 구조화된 조리 단계와 nullable 시간을 처리
- Backend 작업: 선택한 슬롯의 요일·식사 유형·메뉴 설명·guidance·items·일일 영양 목표·연관 메뉴를 AI Server로 전달하고 응답을 Frontend에 중계
- AI·배포 작업: AI Server 재배포 후 runtime OpenAPI와 저장된 snapshot 일치 확인
- 실행 테스트: 신규 상세 응답, legacy 요청 호환, Recipe Schema, 계약 예시, syntax 검사
- 테스트 결과: 실행 가능한 관련 테스트 통과; 기존 비동기 스크립트 일부는 Windows 이벤트 루프 대기로 별도 배포 환경 재검증 필요
- 남은 작업: Backend Recipe proxy 구현·DTO 확장, Frontend 공통 상세 화면 연결, Frontend → Backend → AI Server E2E
- 알려진 제한: 공식 원본에 조리시간이 없으면 `estimated_duration_minutes`는 `null`; 근거 없는 시간을 생성하지 않음
- 제외 사항: 장보기 목록 추가는 AI 계약에 포함하지 않으며 Backend/Frontend의 사용자 상태 기능으로 유지

## 2026-11-03 · Recipe LLM fallback 워커별 진단 보강

- 상태: 구현·로컬 검증·GitHub 반영 완료, 운영 재배포 및 유료 실호출 검증 대기
- 관련 커밋: `9a1e115`, `af35f84`, `5edea40`
- 변경 목적: OpenAI 응답 미파싱과 안전검사 거부가 로그 없이 `unavailable`이 되던 경로를 구분하고 멀티워커 환경에서 발생 워커를 식별
- 변경 API: `GET /health/recipe` 최상위에 additive 필드 `worker_pid` 추가; `POST /recommend/diet/recipe` 계약 변경 없음
- 변경 파일: `app/services/meal_recipe_service.py`, `app/routers/health_router.py`, `test_meal_recipe_diagnostics.py`, `test_recipe_router_cache.py`, `docs/recipe_llm_fallback_observability_handoff_2026-11-03.md`
- 기존 동작 영향: 공식 exact → similar → LLM → unavailable 우선순위와 Recipe 응답 DTO, 최대 2회 생성, 안전검사는 유지; Recipe LLM reasoning effort만 `minimal`로 명시
- Frontend 작업: 없음
- Backend 작업: 비용 승인된 주간 Recipe 1건의 요청 시각·요청조건과 음식별 `recipe_source`, `restriction_matches` 공유; health DTO를 엄격히 검증하면 `worker_pid`를 선택 필드로 허용
- AI·배포 작업: `5edea40` 이상으로 모든 워커 재배포, 워커별 health 전후 지표와 동일 시각 로그 수집
- 실행 테스트: syntax/import compile, Recipe diagnostics·structure·resilience·router cache·schema·detail display, 공식 exact/similar 회귀
- 테스트 결과: 관련 테스트 통과; `톳나물_두부`의 `official_similar` 약 0.9157 유지
- 남은 작업: 비용 승인 후 실제 OpenAI 주간 Recipe 1건 재현, `incomplete_reason`과 reasoning token 확인, 필요할 때만 토큰 한도 조정
- 알려진 제한: Recipe 지표와 cache는 프로세스 메모리 기반이라 워커마다 분리되고 재시작 시 초기화됨
- 상세 인계: [recipe_llm_fallback_observability_handoff_2026-11-03.md](recipe_llm_fallback_observability_handoff_2026-11-03.md)

## 2026-11-03 · 공식 Recipe 유사 매칭 안전성·호출 보정

- 상태: 구현·결정론적 검증·Git 커밋 완료, GitHub 반영·운영 배포 대기
- 관련 커밋: `1134328`
- 변경 목적: 포함 관계 점수만으로 다른 음식이 `official_similar`로 저장되는 문제와 음식당 과도한 공식 API 호출, URL 경로 인증키의 오류 로그 노출 가능성 보정
- 변경 API: `POST /recommend/diet/recipe` 요청·응답 계약 변경 없음
- 변경 파일: `app/services/meal_recipe_service.py`, `app/services/recipe_service.py`, `test_meal_recipe_structure.py`, `test_meal_recipe_resilience.py`, `docs/backend_official_recipe_matching_followup_2026-11-03.md`
- 기존 동작 영향: `official_exact → official_similar → llm_generated → unavailable` 순서는 유지; 검증되지 않은 접두·접미 포함 후보는 LLM fallback 대상으로 전환
- Frontend 작업: 없음
- Backend 작업: 기존에 저장된 잘못된 `official_similar` 결과를 새 규칙으로 재검증·무효화하고 러닝 `light/moderate/hard`를 `easy/moderate/hard`로 매핑
- AI·배포 작업: 수정본 배포 후 프로세스 cache 초기화, 공식 exact와 `톳나물_두부 → 톳나물 두부무침` 회귀 확인
- 실행 테스트: syntax compile, Recipe structure·resilience·diagnostics·schema·router cache·contract·detail display
- 테스트 결과: 제보된 6개 오매칭과 추가 무효 접미 사례 거부, exact와 기존 톳나물 유사도 0.9157 유지, 관련 로컬 테스트 통과
- 남은 작업: 실제 식품안전나라 API 회귀 호출은 실행 권한 미승인으로 미수행; 배포 환경에서 최소 호출 검증 필요
- 알려진 제한: 현재 검증된 유사 표현은 나물 복합 음식의 `무침` 접미사로 제한하며 새 유사 규칙은 실제 사례와 회귀 테스트를 추가한 뒤 확장
- Backend 상세 인계: [backend_official_recipe_matching_followup_2026-11-03.md](backend_official_recipe_matching_followup_2026-11-03.md)

## 2026-11-03 · LLM 완제품 Recipe 품질·러닝 경로 부재 전이 보정

- 상태: 로컬 구현·결정론적 검증 완료, 배포 대기
- 관련 커밋: 미커밋
- 변경 목적: 그릭요거트 같은 완제품을 원재료부터 제조하고 도구를 0g 재료로 반환하는 문제, 식품안전나라 HTTP 200 내부 호출 제한 코드를 성공으로 집계하는 문제, 공식 러닝 메타데이터만 있을 때 지도 경로 생성 필요성이 숨겨지는 문제 보정
- 변경 API: `GET /health/recipe`에 `llm_quality_rejections`, 공식 API `quota_exhaustions` 지표 추가; 러닝 추천의 기존 `generation_recommended` 의미를 지도 표시 가능한 검증 경로 기준으로 명확화
- 변경 파일: `app/services/meal_recipe_service.py`, `app/services/recipe_service.py`, `app/schemas/recommendation.py`, `app/services/running_route_service.py`, `app/services/chat_orchestrator_service.py`, `docs/ai-openapi.json`, Recipe·러닝·챗봇 테스트 및 기존 계약 문서
- 기존 동작 영향: Recipe `official_exact → official_similar → llm_generated → unavailable`, 최대 2회 생성, 알레르기·기피 음식 안전검사, 러닝 거리·지역·GPS 3km 정책은 유지
- Frontend 작업: 메타데이터 코스를 숨기지 말고 `상세 경로 좌표 미제공`으로 표시; `generation_recommended=true`이면 GPS 기반 자동 순환 코스 생성 CTA 제공
- Backend 작업: `status=matched`여도 `generation_recommended`를 별도로 확인; 생성 결과를 `auto_generated`로 저장하고 원본 공식 코스 경로로 표기하지 않음
- AI·배포 작업: 배포 후 그릭요거트 LLM fallback 1건과 광주 5km 메타데이터-only 응답 확인; `quota_exhaustions` 모니터링; `RUNNING_DURUNUBI_ENABLED` 활성화 및 광주 GPX 커버리지 별도 확인
- 실행 테스트: 0g 재료 거부, 조리 도구·완제품 제조형 응답 재생성, 품질 지표·로그, 공급자 INFO-500 재시도·ERROR-503 circuit, metadata-only 생성 전이, GPX 후보 회귀, 챗봇·계약 예제
- 테스트 결과: syntax compile 통과, Recipe 구조·품질 지표·resilience·router cache·Schema·계약 테스트 통과, 러닝·챗봇·OpenAPI·E2E 관련 15개 pytest 통과
- 남은 작업: 식품안전나라 `ERROR-503` 카운터 초기화 시각·경계 호출 기준 운영기관 확인, Backend/Frontend/AI 모바일 E2E
- 알려진 제한: 전국길 표준데이터에 원본 경로 좌표가 없으면 AI Server가 공식 Polyline을 복원할 수 없으며, 자동 생성 경로는 공식 원본과 별개임

## 2026-11-03 · Chat·Diet OpenAI 토큰 사용량 관측 보강

- 상태: 로컬 구현·결정론적 검증 완료, 배포 대기
- 관련 커밋: 미커밋
- 변경 목적: 일반 `/chat`과 구조화 식단 설명 생성의 실제 input·output·reasoning token 및 incomplete 상태를 원문 로그 없이 확인
- 변경 API: `POST /chat`에 선택적 `usage` 추가; `GET /health/chat`, `GET /health/diet`에 `worker_pid`와 프로세스 누적 지표 제공
- 변경 파일: `app/schemas/chat.py`, `app/services/llm_service.py`, `app/routers/chat_router.py`, `app/routers/health_router.py`, `app/services/diet_recommendation_service.py`, Chat·Diet 관측 테스트와 계약 문서
- 기존 동작 영향: `/chat` 일반 답변 역할과 fallback 문구, Food DB 기반 주간 식단·한 끼 재추천, LLM 설명 전용 정책은 유지
- Frontend 작업: 없음. AI Server API Key와 usage는 Frontend에 직접 전달하지 않음
- Backend 작업: `usage`를 선택 필드로 허용하고 식단 생성은 `/chat`이 아닌 `/recommend/diet*`로 전환
- AI·배포 작업: 모든 워커 재배포 후 `worker_pid`별 `/health/chat`, `/health/diet` 지표 수집
- 실행 테스트: Chat 응답 usage·fallback·incomplete, Diet completed·incomplete·usage missing, Router·OpenAPI·식단 회귀
- 테스트 결과: 관련 pytest 16개, Chat resilience·FastAPI integration, Diet fallback·cache/singleflight·item 보존·한 끼 재추천 스크립트 통과
- 남은 작업: 로컬 서버가 없어 미실행한 live 주간 식단 E2E, Backend 전환 후 기존 88건 재검증과 워커별 운영 사용량 확인
- 알려진 제한: health 지표는 프로세스 메모리 기반이며 재시작 시 초기화됨. usage는 최종 청구서가 아니라 OpenAI 응답 관측값임

## 2026-11-03 · Backend 오늘 운동 설정 계약 수용

- 상태: 로컬 구현·결정론적 검증 완료, Backend 변환 코드 배포 및 E2E 대기
- 관련 커밋: 미커밋
- 변경 목적: Backend가 저장하는 시간·장소·복수 장비·한글 컨디션·불편 부위를 운동 추천 후보와 OpenAI 입력에 누락 없이 반영
- 변경 API: `POST /recommend/exercise` 요청에 `available_equipment`, `condition_level`, `condition_note` 추가; 기존 요청 필드는 호환 유지
- 변경 파일: `app/schemas/recommendation.py`, `app/services/exercise_catalog_service.py`, `app/services/exercise_recommendation_service.py`, `docs/ai-openapi.json`, `docs/backend_ai_integration_spec.md`, 운동 계약 테스트
- 기존 동작 영향: CSV에 있는 `auto_mapped` primary 운동만 추천하고 후보 밖 `exercise_key`를 거부하는 정책과 `catalog_version` 반환 유지
- 컨디션 정규화: `좋음→good`, `보통→normal`, `피곤해요→tired`, `안 좋아요→poor`; 불편 부위 배열이 있으면 `has_discomfort=true` 자동 판정
- 장비 정책: Backend 복수 장비를 OR 조건으로 필터링; `mat`와 명시적 빈 배열은 무장비 후보, `machine`은 머신·케이블·스미스·유산소 머신 상세 장비를 포함
- 장소 정책: `gym`은 헬스장 자산, `home`·`outdoor`·`other`는 현재 catalog 한계상 고정식 헬스장 장비를 가정하지 않는 `home_training` 자산 사용
- Frontend 작업: 없음. 기존 오늘 운동 설정값을 Backend에 저장하는 흐름 유지
- Backend 작업: AI 요청 변환에서 `available_equipment`를 누락하지 않고 저장된 최신 context를 기준으로 `/recommend/exercise` 호출; `exercise_key`와 `catalog_version` 검증·저장
- 실행 테스트: Python syntax compile, Backend 요청 Schema 정규화, legacy 화면 설정 호환, 복수 장비·mat·야외·빈 장비 catalog 필터, 후보 밖 key 거부, OpenAPI snapshot 계약
- 테스트 결과: 운동·Backend AI 계약 pytest `12 passed`, 기존 운동 화면 설정 스크립트 통과
- 남은 작업: 원격 Backend에 `exercise_ai.py` 반영 후 실제 요청·응답 DTO 대조, Frontend → Backend → AI Server E2E, Backend GIF URL 매핑
- Backend 상세 인계: [backend_exercise_ai_request_contract_2026-11-03.md](backend_exercise_ai_request_contract_2026-11-03.md)

## 2026-11-04 · 운동 추천 강도 응답 계약 강화

- 상태: 로컬 구현·결정론적 검증 완료, AI Server 재배포 및 Backend 재시험 대기
- 관련 커밋: 미커밋
- 변경 목적: AI Server가 계약 외 운동 강도를 200으로 반환해 Backend에서 `intensity_invalid` 502가 발생하던 문제 방지
- 변경 API: `POST /recommend/exercise` 응답의 상위 `intensity`를 `low|moderate|high` 필수 enum으로 제한; 운동별 `intensity`는 같은 enum 또는 `null`
- 변경 파일: `app/schemas/recommendation.py`, `app/services/exercise_recommendation_service.py`, `docs/ai-openapi.json`, 운동 연동 계약·테스트 파일
- 기존 동작 영향: CSV 후보 강제, `exercise_key`·`catalog_version`, RAG 안전 조건, 장비·장소 필터는 유지
- 출력 보강: 운동별 `duration_minutes`를 필수화하고 세션과 세션별 운동 목록을 최소 1개로 제한
- 재생성 정책: 구조 파싱·응답 Schema·카탈로그 선택 검증 실패 시에만 1회 재생성하며, 재실패 또는 안전 거부는 정상 200으로 반환하지 않고 503 처리
- 컨디션 정책: `condition_level="보통"` 또는 `daily_condition="normal"`은 현재 컨디션이며 추천 결과를 무조건 `moderate`로 고정하지 않음
- Frontend 작업: 없음. 화면용 한글 강도는 Backend 또는 Frontend에서 canonical 코드를 변환
- Backend 작업: AI 요청에 `available_equipment`를 포함하고 `45분/헬스장/머신/보통` 조건으로 재시험; 응답 강도는 canonical 세 값으로 검증
- 실행 테스트: 운동 enum·nullable fallback·필수 시간·빈 계획 거부·1회 재생성·2회 실패·Router 503·카탈로그 강제·OpenAPI snapshot
- 테스트 결과: 관련 pytest `28 passed`, 기존 운동 화면 설정 스크립트 통과, syntax compile 통과
- 남은 작업: AI Server 배포 후 Backend 동일 조건 재시험 및 후속 catalog·장비·세션 시간 검증 오류 확인
- 알려진 제한: 실제 OpenAI 유료 호출은 수행하지 않았으며 fake structured response로 재생성 경계를 검증함

## 2026-11-04 · 운동 추천 선택 시간 최소 충족·5분 허용·200분 상한 계약

- 상태: AI Server 로컬 구현·결정론적 검증 완료, Backend 동일 검증 반영·통합 재시험 대기
- 관련 커밋: 미커밋
- 변경 목적: 사용자가 선택한 목표 운동시간보다 짧은 추천을 방지하면서 구성상 필요한 최대 5분의 초과를 허용하되, 추천 총시간은 절대 200분을 넘지 않도록 제한
- 변경 API: `POST /recommend/exercise` 요청·응답 필드 추가 없음. 기존 `available_minutes`, `sessions[].exercises[].duration_minutes`, `sessions[].estimated_duration_minutes`의 검증 의미 강화
- 요청 계약: `available_minutes`는 최대 200분이며 200분을 초과하는 요청은 정상 추천으로 처리하지 않음
- 시간 계약: 모든 세션을 독립적으로 검사하며 `available_minutes <= 운동별 시간 합계 <= min(available_minutes + 5, 200)`을 포함 범위로 적용
- 예상 시간 계약: `estimated_duration_minutes`를 LLM 추정값이 아닌 해당 세션 운동별 `duration_minutes`의 실제 합계로 설정하고, 목표 시간이 없는 레거시 요청도 200분 절대 상한을 적용
- 기존 동작 영향: 운동 CSV 후보 강제, `exercise_key`·`catalog_version`, 강도 enum, 장소·장비·컨디션·불편 부위 정책은 유지
- Frontend 작업: 기존 선택값을 유지하되 직접 입력에서도 200분을 초과하지 않도록 제한. 화면에는 Backend가 저장한 검증된 실제 합계를 표시
- Backend 작업: 요청 목표시간을 200분 이하로 검증하고, 기존 `session_minutes > available_minutes` 검사 대신 하한과 `min(목표+5분, 200분)` 포함 상한을 각 세션에 적용. 예상 시간 불일치도 저장 전 거부하고 검증된 합계를 세션 시간과 추천 총시간에 저장
- 경계 예시: 30분 선택 시 29분 거부·30~35분 허용·36분 거부. 198분 선택 시 198~200분 허용·201분 합계 거부. 200분 선택 시 200분만 허용하며 201분 목표 요청은 422 거부
- 테스트 결과: 관련 pytest `55 passed`, 운동 화면 설정 스크립트 통과, syntax compile 통과. 45분 일반 경계, 195·198·200분 절대 상한 경계, 201분 요청 거부, 목표 없는 레거시 요청의 200분 상한, 다중 세션, 재생성 및 최종 503을 확인
- 남은 작업: AI Server 배포, Backend 범위 검증·fixture 수정, 동일 요청으로 Frontend → Backend → AI Server E2E
- 알려진 제한: Backend가 기존 상한 `available_minutes`를 유지하면 AI Server가 `min(available_minutes + 5, 200)` 범위에서 만든 정상 초과 결과가 502가 되므로 양쪽을 함께 배포해야 함

## 2026-11-04 · 운동 추천 범위 밖 세션 결정론적 시간 보정

- 상태: 로컬 구현·결정론적 검증 완료, 파일럿 재배포 및 Backend 재시험 대기
- 관련 커밋: `bee6a48`
- 파일럿 실패: `45분 / 헬스장 / 머신 / 컨디션 보통` 요청에서 LLM 원본 합계가 40분과 37분으로 생성됐고, 기존 범위 검증이 두 응답을 모두 거부해 OpenAI 2회 호출 후 503 `AI_UNAVAILABLE` 발생
- 변경 목적: `+5분` 허용 계약은 유지하면서 범위 밖 시간만 로컬에서 보정해 불필요한 OpenAI 재호출과 정상 요청의 503을 방지
- 보정 정책: 세션 원본 합계가 `target <= total <= min(target+5, 200)`이면 유지하고, 범위 밖이면 운동 간 시간 비율을 최대한 유지해 정확히 `target`으로 조정
- 후검증: 보정한 운동별 합계를 기존 시간 공식과 200분 절대 상한으로 다시 검증하고 `estimated_duration_minutes`를 실제 합계로 설정
- 재생성 정책: 시간 부족·초과는 결정론적 후처리로 해결하므로 OpenAI를 재호출하지 않음. 구조 파싱·강도 enum·카탈로그 후보 등 다른 계약 위반의 기존 1회 재생성은 유지
- Backend 책임: AI 보정 결과도 신뢰하지 않고 세션별 실제 합계와 예상시간을 재검증하되, Backend에서 시간을 다시 보정하지 않음
- 기존 기능 영향: CSV 후보 강제, `exercise_key`·`catalog_version`, 장소·장비·컨디션·불편 부위, 강도 enum, 목표~`+5분` 범위 및 200분 상한 유지
- 재시험 조건: 원본 40분→최종 45분, 원본 37분→최종 45분, 허용 범위 47분은 유지, 시간 보정 성공 시 OpenAI 호출 1회
- E2E 조건: AI 계획 저장 후 조회·시작·항목 완료·세션 완료까지 확인
- 테스트 결과: 관련 pytest `64 passed`, 운동 화면 설정 스크립트와 syntax compile 통과. 40분·37분의 45분 보정, 허용 범위 47분 유지, 초과 52분 보정, 비율·순서 유지, 198·200분 상한, 보정 후검증, OpenAI 1회 호출을 확인
- 남은 작업: 수정본 배포 후 동일 파일럿 계정과 조건으로 재시험, 운영 로그에서 호출 횟수와 보정 결과 확인

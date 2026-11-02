# Auto-Fit API 업데이트 인계서

- 작성일: 2026-11-02
- 대상: Frontend, Backend, AI Server, 배포 담당자
- 목적: 2026-11-02 AI Server 변경사항과 최신 Frontend·Backend 비교 결과 공유

## 1. 비교 기준

| 구분 | 브랜치 | 확인 커밋 | 확인 시각 기준 상태 |
|---|---|---|---|
| Frontend | `origin/front_new` | `e2133bef0bcfb1626279cc8b931f529a7bcd9f84` | 최신 원격 참조 확인 |
| Backend | `origin/backend` | `20661bf91eceae9b404562508a6f0fbf3e64f56e` | 최신 원격 참조 확인 |
| AI Server | `origin/ai` | `951ac47fd20483ff015b858d0b0e0494fab77efd` | 원격 기준 커밋 |

AI Server의 아래 변경사항은 현재 로컬 작업 트리에 반영되어 있으며 아직 별도 커밋으로
배포되지 않았다. 실제 연동 전 AI 브랜치 커밋·배포 및 `/openapi.json` 재확인이 필요하다.

## 2. 오늘 확인된 핵심 사항

현재 앱의 운동 추천은 AI Server의 `POST /recommend/exercise`를 호출하지 않는다.

현재 실제 흐름은 다음과 같다.

```text
Frontend
  → POST /api/exercise/recommendation-contexts
  → POST /api/exercise/recommendations/generate {}
  → Backend build_exercise_recommendation_plan()
  → generator=rules_v1
  → Supabase 저장
  → Frontend 표시
```

Backend는 현재 워밍업·본 운동·마무리 운동을 규칙 기반 후보에서 선택한다. 각 유형의
후보 수가 제한적이며 직전 운동을 기준으로 순서만 회전하므로 동일 운동이 반복될 수 있다.
AI Server에 구현된 CSV 기반 운동 선택, `exercise_key`, GIF 카탈로그 검증은 아직 앱에서
사용되지 않는다.

## 3. Frontend 현재 계약

Frontend는 운동 추천 전에 다음 요청으로 조건을 저장한다.

```http
POST /api/exercise/recommendation-contexts
Authorization: Bearer <user access token>
Content-Type: application/json
```

```json
{
  "available_equipment": ["machine", "dumbbell"],
  "available_minutes": 30,
  "condition_level": "좋음",
  "condition_note": null,
  "discomfort_areas": [],
  "location": "gym"
}
```

이후 생성 API에는 빈 객체를 전송한다.

```http
POST /api/exercise/recommendations/generate
Authorization: Bearer <user access token>
Content-Type: application/json
```

```json
{}
```

현재 Frontend 선택값은 다음과 같다.

| 항목 | 값 |
|---|---|
| 운동 시간 | `30`, `45`, `60`, `90`, `120` |
| 장소 | `gym`, `home`, `outdoor`, `other` |
| 기구 | `machine`, `band`, `dumbbell`, `bodyweight`, `other` |
| 컨디션 | `좋음`, `보통`, `피곤해요`, `안 좋아요` |
| 불편 부위 | 자유 입력, 선택 항목, 최대 50자 |

주의: Frontend는 현재 `bodyweight`를 Backend 요청의 `mat`으로 변환한다. AI 운동
카탈로그는 홈트 장비를 `none`, `band`, `dumbbell`, `other`로 분류하므로 연동 전에
`bodyweight`, `mat`, `none`의 공통 의미를 확정해야 한다.

## 4. Backend 현재 계약과 연동 차이

Backend의 `POST /api/exercise/recommendations/generate`는 저장된 사용자 운동 목표,
경험 수준, 프로필, 가장 최근의 미연결 운동 조건을 읽는다. 인바디와 건강검진은 운동
추천 생성의 필수 입력이 아니다.

현재 응답의 생성기는 다음과 같다.

```json
{
  "ok": true,
  "generator": "rules_v1",
  "result": {
    "recommendation": {},
    "items": []
  }
}
```

Backend에는 AI Server 공통 클라이언트와 `AIEndpoint.EXERCISE`가 정의되어 있지만,
운동 추천 생성 경로에서는 아직 사용하지 않는다.

또한 현재 Supabase RPC는 `exercise_type_name`을 `exercise_types.name`과 조인하여
`exercise_type_id`를 결정한다. AI Server의 `exercise_key`를 저장하거나 검증할 DB 필드는
현재 운동 생성 경로에 연결되어 있지 않다.

## 5. AI Server 운동 추천 변경사항

### 5.1 구현 완료

- 추천 후보를 `data/exercise_assets/exercise_asset_catalog.csv`로 제한한다.
- `mapping_status=auto_mapped`이고 `is_primary_asset=true`인 행만 사용한다.
- 운동 모드, 운동 방식, 기구, 집중 부위, 운동 성향 조건으로 후보를 필터링한다.
- OpenAI는 제공된 후보의 `exercise_key`만 선택할 수 있다.
- OpenAI가 후보 밖의 key를 반환하면 임의 운동으로 대체하지 않고 실패 처리한다.
- AI 응답에는 로컬 GIF 경로, 외장하드 경로, 바이너리를 포함하지 않는다.
- CSV 줄바꿈을 LF로 정규화한 SHA-256을 `catalog_version`으로 반환한다.

### 5.2 현재 AI 요청 계약

```http
POST /recommend/exercise
Authorization: Bearer <server-to-server API key>
Content-Type: application/json
```

헬스 예시:

```json
{
  "metric_statuses": {},
  "goal_type": "muscle_gain",
  "experience_level": "beginner",
  "available_minutes": 30,
  "location": "gym",
  "preferred_training_types": ["weight_training"],
  "exercise_mode": "gym",
  "daily_condition": "good",
  "has_discomfort": false,
  "discomfort_areas": [],
  "gym_preferences": {
    "training_style": "machine",
    "focus_area": "full_body"
  }
}
```

홈트 예시:

```json
{
  "metric_statuses": {},
  "goal_type": "maintenance",
  "experience_level": "beginner",
  "available_minutes": 30,
  "location": "home",
  "preferred_training_types": ["home_training", "bodyweight"],
  "exercise_mode": "home_training",
  "daily_condition": "normal",
  "has_discomfort": true,
  "discomfort_areas": ["오른쪽 무릎"],
  "home_training_preferences": {
    "equipment": "none",
    "workout_style": "quiet"
  }
}
```

`metric_statuses`는 선택 입력이며 기본값은 `{}`이다. 인바디와 건강검진 자료가 없어도
운동 추천을 요청할 수 있다. 실제 건강 상태 분류가 있을 때만 일반화된 안전 태그로
반영하며, 제공되지 않은 건강 수치나 질환을 추정하지 않는다.

### 5.3 AI 응답 계약

```json
{
  "ok": true,
  "generator": "auto-fit-ai",
  "result": {
    "catalog_version": "sha256:<LF-normalized CSV SHA-256>",
    "summary": "오늘의 조건을 반영한 운동 계획",
    "weekly_frequency": 3,
    "intensity": "보통",
    "sessions": [
      {
        "name": "전신 운동",
        "focus": "전신",
        "estimated_duration_minutes": 30,
        "exercises": [
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
        ]
      }
    ],
    "cautions": [],
    "sources": []
  }
}
```

## 6. 최신 Frontend와 AI 요청의 불일치

현재 Frontend 화면은 통합 조건만 수집하지만 AI 요청 스키마는 모드별 상세 조건을
요구한다.

| AI 필드 | 최신 Frontend 제공 여부 | 처리 필요 |
|---|---|---|
| `exercise_mode` | 장소로 간접 제공 | Backend 또는 AI에서 변환 |
| `daily_condition` | 한글 표시값 제공 | 공통 enum 변환 필요 |
| `gym_preferences.training_style` | 기구로 일부 추정 가능 | 임의 추정 금지, 계약 합의 필요 |
| `gym_preferences.focus_area` | 제공하지 않음 | AI 요청 스키마 완화 또는 화면 추가 |
| `home_training_preferences.equipment` | 기구 제공 | `bodyweight/mat/none` 통일 필요 |
| `home_training_preferences.workout_style` | 제공하지 않음 | AI 요청 스키마 완화 또는 화면 추가 |
| `preferred_training_types` | 직접 제공하지 않음 | 장소·기구 기반 안전한 변환 필요 |

현재 없는 값을 Backend가 임의로 만들어 보내면 안 된다. 최신 UI를 유지하려면 AI
요청을 `location + available_equipment` 중심의 통합 구조로 확장하고 기존 모드별 필드는
하위 호환용 선택 입력으로 유지하는 방식을 권장한다.

## 7. 반복 추천 방지 계약

현재 AI 후보 순서는 동일 요청에서 결정적으로 고정되고, Backend 규칙 추천도 제한된
후보를 회전한다. 다음 필드를 운동 AI 요청에 추가하는 방향을 권장한다.

```json
{
  "recommendation_seed": 1723456789,
  "excluded_exercise_keys": [
    "ex_11111111111111",
    "ex_22222222222222"
  ]
}
```

정책:

- Backend가 추천 요청마다 새로운 `recommendation_seed`를 생성한다.
- Backend가 최근 추천 또는 최근 완료 운동의 `exercise_key`를 전달한다.
- AI Server는 제외 목록을 적용한 뒤 seed 기반으로 후보를 구성한다.
- 동일 seed와 동일 요청은 재현 가능한 결과를 만든다.
- 다른 seed는 가능한 범위에서 다른 후보군을 만든다.
- 한 추천 결과 안에서 동일 `exercise_key`를 중복 사용하지 않는다.
- 안전 조건과 사용 가능한 기구 조건은 다양성보다 항상 우선한다.
- 제외 후 후보가 부족하면 안전한 후보를 우선하고 반복 여부를 Backend 로그에 남긴다.

이 필드는 아직 오늘 구현된 공개 스키마에는 포함되지 않았다. Frontend·Backend·AI
계약 확정 후 함께 추가해야 한다.

## 8. Backend 수정 필요사항

1. `AI_SERVER_ENABLED=true`일 때 운동 생성 경로에서 `AIEndpoint.EXERCISE`를 호출한다.
2. Frontend 조건과 저장된 운동 목표를 AI 요청으로 안전하게 변환한다.
3. AI 응답의 `catalog_version`과 `exercise_key`를 검증한다.
4. AI `sessions[].exercises[]`를 현재 Supabase 추천 item 구조로 변환한다.
5. `exercise_key`와 `catalog_version`의 저장 위치를 DB 계약에 추가한다.
6. 같은 CSV를 배포하고 LF 정규화 방식으로 카탈로그 해시를 계산한다.
7. `exercise_key + exercise_mode + is_primary_asset=true`로 GIF 자산을 찾는다.
8. 같은 key의 남녀 자산이 모두 있으면 사용자 성별 자산을 우선하고, 없으면 사용 가능한
   primary 자산을 사용한다.
9. 외장하드 경로를 직접 반환하지 않고 인증된 HTTPS URL 또는 Backend 스트리밍 URL을
   Frontend에 제공한다.
10. AI 장애, timeout, 계약 불일치 시 기존 `rules_v1`을 fallback으로 사용할 수 있다.
11. 응답의 `generator`를 `auto-fit-ai` 또는 `rules_v1`으로 정확히 구분한다.
12. 최근 추천 key와 seed를 관리하여 재추천 반복을 방지한다.

## 9. Frontend 수정 필요사항

1. AI Server를 직접 호출하거나 서버 간 API Key를 보관하지 않는다.
2. 현재처럼 Backend 공개 API만 호출한다.
3. Backend가 제공하는 `demo_video_url` 또는 합의된 GIF URL을 표시한다.
4. `exercise_key`, `catalog_version`은 표시용이 아니라 추적·저장용 식별자로 취급한다.
5. Backend가 반복 방지를 담당하면 Frontend가 seed를 직접 생성할 필요는 없다.
6. 집중 부위와 운동 성향을 다시 받을지, 현재 통합 조건만 사용할지 팀에서 결정한다.
7. `bodyweight`, `mat`, `none`의 공통 API enum을 확정한 뒤 변환 코드를 한 곳에서 관리한다.

## 10. AI Server 및 배포 담당자 수정 필요사항

필요한 환경변수 이름:

```text
AI_SERVER_ENABLED
AI_SERVER_BASE_URL
AI_SERVER_API_KEY
EXERCISE_GIF_ROOT
```

- 실제 secret 값은 문서, Frontend, Git 저장소에 기록하지 않는다.
- `data/exercise_assets/exercise_asset_catalog.csv`를 AI와 Backend에 같은 버전으로 배포한다.
- AI Server에는 CSV만 필요하며 원본 GIF 외장하드 경로는 필요하지 않다.
- Backend만 `EXERCISE_GIF_ROOT`를 사용한다.
- 배포 후 AI `/openapi.json`과 저장된 `docs/ai-openapi.json`이 같은지 확인한다.
- 서버 간 요청은 HTTPS와 Bearer API Key를 사용한다.
- 카탈로그 버전 불일치 시 잘못된 GIF를 정상 응답으로 제공하지 않는다.

## 11. 식단 건강목표 API 변경사항

`POST /recommend/diet`와 `POST /recommend/diet/replace-meal`에 다음 입력이 추가됐다.

```json
{
  "health_goal": {
    "goal_type": "muscle_gain",
    "goal_text": null
  }
}
```

`health_goal`은 `null`일 수 있다.

`goal_type` 허용값:

- `fat_loss`
- `muscle_gain`
- `fitness`
- `maintenance`
- `other`

`goal_text`는 선택 입력이며 최대 200자다. 사용자 데이터로만 처리하고 그 안의 명령을
실행하지 않는다. 기존 최상위 `goal_type`도 하위 호환을 위해 유지한다.

기존 목표 매핑:

| 기존 값 | 신규 값 |
|---|---|
| `weight_loss`, `body_fat_loss` | `fat_loss` |
| `muscle_gain` | `muscle_gain` |
| `endurance`, `general_fitness` | `fitness` |
| `general_health`, `health_maintenance` | `maintenance` |
| `rehabilitation` | `other` |

건강목표만으로 질환, 개인 필요 열량, 치료 효과를 추정하지 않는다. 인바디·건강검진
자료가 없어도 식단 추천 요청은 가능하다. 알레르기 제외와 Food DB 영양값 검증이
건강목표 개인화보다 우선한다.

## 12. 호환성과 영향

### 유지되는 기능

- 기존 운동 `goal_type`과 운동 설정 입력
- 식단의 기존 최상위 `goal_type`
- Food DB 영양 검증
- 알레르기·기피 음식 필터
- Recipe exact → similar → LLM fallback
- RAG 안전 정책
- Backend의 `rules_v1` 운동 fallback

### 계약 변경 주의사항

- AI 운동 응답에는 `catalog_version`이 필수다.
- 각 AI 운동 item에는 `exercise_key`, `catalog_name_en`, `exercise_modes`가 필수다.
- AI Server는 GIF 경로와 `animation_assets`를 응답하지 않는다.
- Backend가 현재 AI 운동 응답을 저장하려면 adapter와 DB 계약 보완이 필요하다.

## 13. 오늘 실행한 검증

- 운동 카탈로그 강제 및 후보 밖 key 거부
- 카탈로그 버전의 Windows/Linux 줄바꿈 독립성
- 건강목표 다섯 enum과 `null` 입력
- 기존 목표 매핑 및 신규 목표 우선순위
- 악의적인 `goal_text`의 데이터 취급
- 건강목표별 후보 점수 변화
- FastAPI OpenAPI 스냅샷 일치
- 공식 Recipe 재료 구조 회귀

결과:

- 관련 Pytest 27개 통과
- 기존 동기식 식단·운동 회귀 스크립트 4개 통과
- 문법 검사 및 `git diff --check` 통과

현재 Windows 환경에는 `pytest-asyncio`가 설치되어 있지 않고 이벤트 루프 정지 현상이
있어 일부 비동기 Recipe 테스트 전체 실행은 완료하지 못했다. 코드 assertion 실패로
판단하지 않으며 CI 또는 정상 비동기 테스트 환경에서 재실행해야 한다.

## 14. 통합 완료 조건

1. Frontend 조건이 Backend DB에 누락 없이 저장된다.
2. Backend가 저장된 조건을 AI 요청 계약으로 변환한다.
3. AI Server가 CSV에 존재하는 운동만 반환한다.
4. Backend가 `catalog_version`과 모든 `exercise_key`를 검증한다.
5. 서로 다른 key가 동일 GIF로 잘못 매핑되지 않는다.
6. 동일 조건 재추천에서 최근 운동 제외와 seed가 작동한다.
7. 인바디·건강검진이 없어도 일반 운동 추천이 성공한다.
8. 건강 데이터가 있으면 실제 상태 분류만 안전 태그로 반영한다.
9. AI 장애 시 `rules_v1` fallback 여부와 generator가 명확하다.
10. Frontend에 로컬 파일 경로와 서버 간 API Key가 노출되지 않는다.
11. 운동 추천 저장, 세션 시작, 완료, 즐겨찾기·저장 기능이 기존대로 동작한다.
12. Frontend → Backend → AI Server E2E 테스트가 통과한다.

## 15. 권장 구현 순서

1. 최신 UI 기준 통합 운동 요청 DTO 확정
2. `bodyweight/mat/none`, 컨디션, 장소 enum 확정
3. AI 요청 스키마 하위 호환 확장
4. Backend AI 운동 adapter 구현
5. DB에 `exercise_key`·`catalog_version` 저장 계약 추가
6. Backend CSV 검증 및 GIF URL 제공 구현
7. seed·최근 운동 제외 구현
8. Backend `rules_v1` fallback 유지
9. OpenAPI·예제·계약 테스트 갱신
10. 모바일 E2E 검증 후 배포

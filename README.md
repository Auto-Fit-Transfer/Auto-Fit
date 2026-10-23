# Healthcare AI Server

백엔드와 분리된 AI 전용 FastAPI 서버 예제입니다.

## 역할

- Backend: DB, 사용자 인증, 서비스 로직
- AI Server: OpenAI, 체성분 분석, 식단·레시피·운동 추천
- AI Server는 DB에 직접 접근하지 않음

## 구조

```text
app/
├─ main.py
├─ core/
│  └─ config.py
├─ routers/
│  ├─ health_router.py
│  ├─ chat_router.py
│  └─ body_router.py
├─ schemas/
│  ├─ chat.py
│  ├─ body.py
│  └─ recommendation.py
├─ services/
│  ├─ llm_service.py
│  ├─ body_model_service.py
│  ├─ diet_recommendation_service.py
│  └─ meal_recipe_service.py
└─ models/
   └─ body_model/
```

## Windows 실행 방법

### 1. 가상환경 생성

```powershell
python -m venv .venv
```

PowerShell 실행 정책 문제를 피하려면 cmd에서 다음을 사용할 수 있습니다.

```cmd
.venv\Scripts\activate.bat
```

### 2. 패키지 설치

```powershell
pip install -r requirements.txt
```

### 3. 환경변수

`.env.example`을 복사하여 `.env` 파일을 만듭니다.

```env
OPENAI_API_KEY=sk-xxxxxxxx
OPENAI_MODEL=gpt-5
OPENAI_DIET_MODEL=gpt-5
OPENAI_REPLACE_MEAL_MODEL=gpt-5-mini
DIET_OPENAI_TIMEOUT_SECONDS=45
REPLACE_MEAL_OPENAI_TIMEOUT_SECONDS=30
CHAT_OPENAI_TIMEOUT_SECONDS=30
DIET_LLM_CACHE_TTL_SECONDS=900
DIET_LLM_CACHE_MAX_ENTRIES=256
LOCAL_SPECIALTY_CACHE_TTL_SECONDS=21600
DIET_RAG_CACHE_TTL_SECONDS=600
DIET_RAG_CACHE_MAX_ENTRIES=128
DIET_CANDIDATE_CACHE_TTL_SECONDS=600
DIET_CANDIDATE_CACHE_MAX_ENTRIES=128
AI_SERVER_API_KEY=replace-with-a-random-secret
FOOD_SAFETY_RECIPE_API_KEY=replace-with-your-key

# Recipe Pipeline 운영값(선택, 아래는 기본값)
RECIPE_API_TIMEOUT_SECONDS=30
RECIPE_API_MAX_ATTEMPTS=3
RECIPE_API_RETRY_BACKOFF_SECONDS=0.25
RECIPE_API_CIRCUIT_FAILURE_THRESHOLD=3
RECIPE_API_CIRCUIT_RECOVERY_SECONDS=30
RECIPE_OPENAI_TIMEOUT_SECONDS=60
RECIPE_CACHE_TTL_SECONDS=1800
RECIPE_CACHE_MAX_ENTRIES=512
```

`.env`는 GitHub에 업로드하지 마세요.

### 4. 서버 실행

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Swagger:

```text
http://127.0.0.1:8001/docs
```

## API

### 상태 확인

`GET /health`

Recipe Pipeline의 cache, retry, circuit 상태 확인:

`GET /health/recipe`

Diet LLM cache/singleflight 및 timeout/error fallback 상태 확인:

`GET /health/diet`

Chat 답변 timeout/error fallback 상태 확인:

`GET /health/chat`

### OpenAI 챗봇

기존 Backend 호환 API:

`POST /chat`

```json
{
  "question": "내 체성분을 바탕으로 운동 방향을 알려줘",
  "user_info": {
    "age": 25,
    "height_cm": 175,
    "weight_kg": 75,
    "body_fat_percent": 20
  },
  "chat_history": []
}
```

- 기존 Backend의 `question / user_info / chat_history` 계약을 유지합니다.
- 현재는 일반 답변 호환 경로이며 식단 변경 action을 실행하지 않습니다.
- OpenAI 오류·빈 응답·timeout 시 HTTP 500 대신 안전한 fallback 답변을 반환합니다.

확장형 개인화·action API:

`POST /chat/orchestrate`

```json
{
  "content": "월요일 점심 메뉴를 바꿔줘",
  "history": [],
  "context": {
    "metric_statuses": {},
    "food_allergens": [],
    "disliked_foods": [],
    "diet_summary": {
      "weekly_plan": []
    }
  },
  "pending_action": null
}
```

- 건강 RAG, 저장된 운동·식단 조회, 식단 변경 확인 절차에 사용합니다.
- 식단 변경은 `awaiting_confirmation` 이후 Backend가 `pending_action`을 다시 전달해야 실행됩니다.
- 결과가 `ready_for_backend_apply`여도 AI Server는 DB를 직접 변경하지 않습니다.
- 운동 계획 변경은 운동 API가 연결되기 전까지 `exercise_replace_unavailable`로 반환됩니다.
- 건강 답변의 `sources`에는 실제 RAG 결과에 존재하는 출처만 포함됩니다.
- 전체 Backend 입력·출력과 저장 책임은 [Backend AI Server Integration Specification](docs/backend_ai_integration_spec.md)을 참고하세요.
- Backend 연동 상세 계약과 상태 전이는 [Chat API Backend Contract](docs/chat_api_contract.md)를 참고하세요.

### 오늘의 운동 설정

헬스와 홈트는 기존 `POST /recommend/exercise`를 사용합니다. `exercise_mode`, `daily_condition`, `has_discomfort`와 `gym_preferences` 또는 `home_training_preferences`를 함께 보내면 Frontend 선택값이 운동 추천 프롬프트와 안전 조건에 반영됩니다. 기존 요청 필드만 보내는 호출도 계속 지원합니다.

러닝의 Backend 운영 계약은 거리 선택(`3km`, `5km`, `10km`, `custom`)을 코스 검색의 기본 조건으로 사용합니다. 목표 시간은 코스별 `estimated_duration_minutes`와 비교하는 보조 목표이며, 강도 선택은 `light -> easy`, `moderate -> moderate`, `hard -> hard`로 변환해 선택적 `desired_difficulty`로 전달합니다. 강도는 거리 허용 범위를 변경하지 않고 같은 거리 후보의 보조 정렬에만 사용합니다.

`POST /running/session/recommend`는 목표 시간 중심의 선택 기능으로 계속 제공하지만, Backend의 필수 5개 러닝 경로 계약에는 포함하지 않습니다.

### 러닝 경로 기반 API

지역·거리·현재 위치 기반 공식 코스 추천:

`GET /running/courses/recommend?region=성남시&distance_option=5km&latitude=37.3948&longitude=127.1112&desired_difficulty=easy`

현재 위치만 전달하면 Kakao 행정구역 조회로 지역을 결정합니다.

`GET /running/courses/recommend?distance_option=5km&latitude=37.3948&longitude=127.1112`

공식 코스 상세:

`GET /running/courses/{course_id}?pace_minutes_per_km=6.5`

장소 검색:

`GET /running/places/search?query=판교역`

실제 도보 경로 미리보기:

`POST /running/routes/preview`

현재 위치 또는 지정 출발지 기반 순환 코스 자동 생성:

`POST /running/routes/generate-loop`

```json
{
  "start": {
    "latitude": 37.394776627382875,
    "longitude": 127.11119669891646
  },
  "end": {
    "latitude": 37.4199323570413,
    "longitude": 127.12629039752096
  },
  "waypoints": [],
  "pace_minutes_per_km": 6.5
}
```

자동 생성 요청 예시:

```json
{
  "start": {
    "latitude": 37.3948,
    "longitude": 127.1112
  },
  "distance_option": "5km",
  "pace_minutes_per_km": 6.5,
  "candidate_count": 3,
  "seed": 0
}
```

- 경로 좌표는 `latitude`, `longitude` 형태로 반환합니다.
- Kakao 요청 시에는 `x=longitude`, `y=latitude`로 변환합니다.
- 사용자 페이스가 없으면 `RUNNING_DEFAULT_PACE_MINUTES_PER_KM`을 사용하고 `pace_assumed=true`를 반환합니다.
- 기본 공식 코스 카탈로그는 [전국길관광정보표준데이터](https://www.data.go.kr/data/15017321/standard.do)를 사용합니다.
- [한국관광공사 두루누비 정보 서비스](https://www.data.go.kr/data/15101974/openapi.do) 권한이 있고 `RUNNING_DURUNUBI_ENABLED=true`이면 GPX 실제 경로가 있는 코스를 함께 추천합니다.
- `3km`, `5km`, `10km`, `custom`은 목표 거리의 ±10% 범위로 필터링합니다.
- 현재 위치가 있으면 Kakao로 출발지 주소를 좌표화하고 가까운 코스부터 정렬합니다.
- 공식 표준데이터에는 전체 Polyline이 없으므로 `source_type=official_metadata`, `requires_route_validation=true`로 반환합니다.
- 두루누비 코스는 GPX 좌표로 실제 경로 길이를 재검증한 뒤 `source_type=official_gpx`, `geometry_status=verified_polyline`, `requires_route_validation=false`로 반환합니다.
- 추천 응답의 `data_sources`는 메타데이터와 GPX 공급자의 `available`, `disabled`, `unavailable` 상태를 구분합니다.
- 조건에 맞는 공식 코스가 없으면 부정확한 코스를 반환하지 않고 `status=generation_required`를 반환합니다.
- 순환 코스 생성은 방향이 다른 경유점 후보를 Kakao 도보 경로로 검증하며 후보별 최대 2회만 거리 보정을 시도합니다.
- 실제 경로가 목표 거리 ±10%이면 `matched`, 범위 밖의 가장 가까운 결과만 있으면 `best_effort`, 모두 실패하면 `unavailable`을 반환합니다.
- `best_effort` 결과에는 `distance_km`, `distance_error_km`, `distance_error_percent`, `within_tolerance=false`가 포함되므로 정상 매칭 결과처럼 저장하거나 표시하지 않습니다.
- `PUBLIC_DATA_SERVICE_KEY`는 전국길관광정보 API에 활용신청된 키여야 하며, 두루누비 GPX를 활성화하려면 같은 키에 두루누비 정보 서비스 권한도 별도로 승인되어야 합니다.
- 즐겨찾기와 선택 코스의 영구 저장은 Backend가 담당합니다.

### 체성분 분석

`POST /ai/body-analysis`

```json
{
  "age": 25,
  "sex": "male",
  "height_cm": 175,
  "weight_kg": 75,
  "skeletal_muscle_mass_kg": 31,
  "body_fat_mass_kg": 15,
  "body_fat_percent": 20,
  "bmi": 24.5
}
```

학습한 모델은 다음 경로에 배치합니다.

```text
app/models/body_model/body_model.pkl
```

## Backend -> AI Server 호출 예시

```python
import httpx

async def request_ai(question: str, user_info: dict):
    payload = {
        "question": question,
        "user_info": user_info,
        "chat_history": []
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "http://127.0.0.1:8001/ai/chat",
            json=payload,
        )
        response.raise_for_status()
        return response.json()
```

DB 조회와 AI 응답 저장은 Backend에서 처리하고, AI Server에는 필요한 데이터만 JSON으로 전달하는 방식을 권장합니다.

# Healthcare AI Server

백엔드와 분리된 AI 전용 FastAPI 서버 예제입니다.

## 역할

- Backend: DB, 사용자 인증, 서비스 로직
- AI Server: OpenAI, 체성분 분석 모델, OCR/KIE, 음식 분류 모델
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
│  ├─ body_router.py
│  ├─ ocr_router.py
│  └─ food_router.py
├─ schemas/
│  ├─ chat.py
│  ├─ body.py
│  ├─ ocr.py
│  └─ food.py
├─ services/
│  ├─ llm_service.py
│  ├─ body_model_service.py
│  ├─ ocr_service.py
│  └─ food_model_service.py
└─ models/
   ├─ body_model/
   └─ food_model/
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

### OCR/KIE

`POST /ai/ocr`

multipart/form-data의 `file` 필드로 이미지를 전송합니다.
현재는 인터페이스만 구현되어 있으며 실제 OCR/KIE 모델을 `ocr_service.py`에 연결하면 됩니다.

### 음식 분석

`POST /ai/food-analysis`

multipart/form-data의 `file` 필드로 음식 이미지를 전송합니다.
현재는 인터페이스만 구현되어 있으며 EfficientNet-B0 등의 모델을 `food_model_service.py`에 연결할 수 있습니다.

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

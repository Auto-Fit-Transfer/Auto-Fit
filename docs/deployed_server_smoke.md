# Auto-Fit 배포 AI Server Smoke Test

이 문서는 Backend 연동 전에 배포된 AI Server가 현재 계약대로 동작하는지 독립적으로 확인하는 방법을 설명한다.

## 검사 범위

기본 검사는 OpenAI 호출 없이 다음 항목을 확인한다.

1. `GET /health` 준비 상태
2. `GET /openapi.json`의 핵심 경로 존재 여부
3. Bearer 인증이 없는 요청의 `401` 응답
4. 계약 fixture로 계산한 건강점수의 `POST /chat/orchestrate` 전달
5. 챗봇 응답에서 건강검진·인바디 원본 변화량을 다시 노출하지 않는지 확인

`--full` 옵션은 위 검사에 `POST /health-analysis` 실호출을 추가한다. 이 검사는 OpenAI를 사용할 수 있으므로 비용과 지연이 발생할 수 있다.

## 필요한 환경변수

```dotenv
AI_SERVER_BASE_URL=https://<deployed-ai-server-host>
AI_SERVER_API_KEY=<server-to-server-secret>
AI_SERVER_SMOKE_TIMEOUT_SECONDS=60
RUN_FULL_AI_SERVER_SMOKE=false
```

실제 값은 `.env` 또는 현재 PowerShell 세션에만 저장한다. Key를 문서, 로그, Git, Frontend에 기록하지 않는다.

배포 주소에는 HTTPS를 사용해야 한다. 로컬 검증의 `localhost`와 `127.0.0.1`만 HTTP를 허용한다.

## 기본 검사 실행

```powershell
.\.venv\Scripts\python.exe -m app.scripts.deployed_server_smoke
```

기본 검사는 건강점수를 로컬의 결정론적 `HealthScoreService`로 계산하고 배포 챗봇에 전달한다. OpenAI 호출을 만들지 않는다.

## 전체 건강분석 검사

```powershell
.\.venv\Scripts\python.exe -m app.scripts.deployed_server_smoke --full
```

또는 `.env`에서 다음 값을 일시적으로 사용할 수 있다.

```dotenv
RUN_FULL_AI_SERVER_SMOKE=true
```

전체 검사는 계약 예제의 개인정보가 아닌 고정 테스트 값으로 `/health-analysis`를 한 번 호출한다. 완료 후 운영 환경에서는 `RUN_FULL_AI_SERVER_SMOKE=false`로 되돌린다.

## 성공 출력

성공하면 검사 이름, HTTP 상태, 지연시간만 표시한다.

```text
PASS health: HTTP 200, ... ms
PASS openapi_contract: HTTP 200, ... ms
PASS authentication_boundary: HTTP 401, ... ms
PASS health_score_chat: HTTP 200, ... ms
Deployment smoke test completed. Secret values were not printed.
```

API Key, Authorization Header, 건강 원문은 출력하지 않는다.

## 로컬 자동 테스트

외부 네트워크나 OpenAI 없이 Smoke 검사기 자체를 확인한다.

```powershell
.\.venv\Scripts\python.exe -m pytest -q test_deployed_server_smoke.py
```

MockTransport가 건강 상태, OpenAPI, 인증 경계, 챗봇, 전체 건강분석 응답을 재현한다.

## 실패 해석

| 실패 지점 | 의미 |
|---|---|
| `health` | 배포 프로세스 또는 라우팅 준비 상태 확인 필요 |
| `openapi_contract` | 배포 커밋이 최신 계약보다 오래됐거나 Router 등록 누락 |
| `authentication_boundary` | 인증 미들웨어 또는 서버 간 Key 경계 확인 필요 |
| `health_score_chat` | 최신 챗봇 Schema·Action이 배포되지 않았거나 응답 계약 불일치 |
| `full_health_analysis` | 건강분석 Schema, RAG/OpenAI 설정 또는 배포 환경 확인 필요 |

응답 Body 전체를 운영 로그에 복사하지 않는다. 실패한 검사 이름과 HTTP 상태, 배포 커밋을 기준으로 원인을 확인한다.

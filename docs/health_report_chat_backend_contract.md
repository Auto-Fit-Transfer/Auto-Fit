# Auto-Fit AI Server ↔ Backend 건강 리포트·챗봇 연동 계약서

## 1. 문서 정보

| 항목 | 내용 |
|---|---|
| 계약 버전 | `1.0` |
| 작성일 | `2026-10-23` |
| AI Server 기준 브랜치 | `ai` |
| AI Server 기준 커밋 | `33206c1` |
| 점수 계산 버전 | `health-score-v1` |
| AI Server 구현 상태 | 구현 및 AI Server 단위·계약 테스트 완료 |
| Backend 연동 상태 | Backend 검토 및 실연동 필요 |

이 문서는 Auto-Fit Backend 담당자가 최근 추가된 건강점수, 주간 점수 비교, 건강 리포트 챗봇 설명 기능을 실제 Backend 코드에 연결할 수 있는지 확인하기 위한 인수 계약서다.

이번 계약의 핵심 범위는 다음 두 API다.

- `POST /health-analysis`: 건강 리포트와 결정론적 건강점수 생성
- `POST /chat/orchestrate`: 저장된 건강점수에 대한 요약·비교·원인·우선 행동 설명

식단·레시피·운동·러닝 등 기존 기능을 변경하는 계약이 아니다. 관련 기존 계약은 [14. 관련 계약 문서](#14-관련-계약-문서)를 따른다.

## 2. 계약 해석 우선순위

계약 내용이 서로 다를 경우 다음 순서로 판단한다.

1. 배포 중인 AI Server의 `/openapi.json`
2. 이 저장소의 [ai-openapi.json](ai-openapi.json)
3. 실제 Pydantic 요청·응답 Schema
4. [health_report_api_contract_examples.json](health_report_api_contract_examples.json)의 건강점수 검증 예제
5. [chat_api_contract_examples.json](chat_api_contract_examples.json)의 챗봇 검증 예제
6. 이 문서의 설명과 예시

배포 서버의 `/openapi.json`과 저장소의 `docs/ai-openapi.json`이 다르면 배포 커밋을 먼저 확인한다. Backend는 문서 예시만 보고 DTO를 고정하지 않고 OpenAPI Schema 검증 결과를 우선한다.

## 3. 전체 호출 흐름과 책임

```text
Frontend
   |
   | 사용자 건강데이터·식단 기록·운동 기록 조회 요청
   v
Backend
   |  1. 사용자별 최초 기준데이터와 해당 주 기록 조회
   |  2. POST /health-analysis 호출
   v
AI Server
   |  HealthAnalysisService
   |  -> HealthScoreService (결정론적 점수 계산)
   |  -> RAG / OpenAI (건강 설명 생성)
   v
Backend
   |  3. analysis.health_score 원본 snapshot 저장
   |  4. Frontend에 건강 리포트 전달
   |
   |  건강점수 관련 챗봇 질문
   |  5. 최신 snapshot을 context.health_score에 그대로 삽입
   |  6. POST /chat/orchestrate 호출
   v
AI Server ChatOrchestrator
   |  저장된 점수를 재계산하지 않고 설명
   v
Backend -> Frontend
```

### 3.1 Backend 책임

- 사용자 인증과 사용자별 데이터 격리
- 최초 건강검진·인바디 기준데이터 보존
- 주간 식단 목표·실제 섭취량 집계
- 주간 운동 목표·실제 수행량 집계
- AI Server 요청용 `request_id` 생성
- 확정된 `analysis.health_score` snapshot 저장
- 다음 주 요청 시 직전 주 확정 점수를 `previous_health_score`로 전달
- 챗봇 질문 시 최신 점수 snapshot을 `context.health_score`로 전달
- Frontend에 보여줄 데이터와 화면 이동 결정

### 3.2 AI Server 책임

- 전달받은 데이터만 사용한 점수 계산
- 식단·운동·건강데이터 영역별 상태와 점수 반환
- 동일 점수 버전의 직전 주 snapshot과 증감 비교
- 변화 사유와 우선 행동 생성
- 건강점수 챗봇 질문의 의도 분류와 설명 생성
- 인바디·건강검진 원본 수치를 챗봇 응답에서 재노출하지 않음

### 3.3 AI Server가 하지 않는 일

- 사용자 DB 직접 조회 또는 저장
- Backend 사용자 식별자 해석
- 사용자별 최초 기준데이터 영구 보존
- 식단·운동 수행 기록 영구 보존
- 확정 건강점수의 Backend DB 저장
- Frontend 화면 이동 또는 DB 변경 직접 수행
- LLM을 이용한 건강점수 계산·수정

## 4. 공통 통신·인증 계약

모든 호출은 Frontend가 아닌 Backend에서 수행한다.

```http
Authorization: Bearer <AI_SERVER_API_KEY>
Content-Type: application/json
```

- AI Server 기본 URL은 환경변수 `AI_SERVER_BASE_URL`로 관리한다.
- 서버 간 Key는 `AI_SERVER_API_KEY`로 관리한다.
- 운영 활성화 여부는 기존 Backend 정책에 따라 `AI_SERVER_ENABLED=true`를 사용한다.
- 실제 URL과 Key 값은 이 문서, Git, Frontend 코드, 로그에 기록하지 않는다.
- Frontend에는 AI Server Key를 전달하지 않는다.
- `request_id`에는 개인정보를 포함하지 않는 고유 식별자를 사용한다.

## 5. 건강 리포트 생성 계약

### 5.1 Endpoint

```http
POST /health-analysis
```

Request Schema는 `HealthAnalysisRequest`, Response Schema는 `HealthAnalysisResponse`다.

### 5.2 요청 예시

아래 예시는 건강점수의 세 영역을 모두 계산하고 이전 주와 비교하기 위한 구조다. 실제 수치는 Backend DB에서 조회한 사용자 데이터만 사용한다.

```json
{
  "schema_version": "1.0",
  "request_id": "health-report-20261023-example",
  "goal": {
    "text": "체지방 감량과 규칙적인 운동",
    "goal_type": "body_fat_loss",
    "short_term": false
  },
  "input": {
    "health_checkup": {
      "checkup_date": "2026-10-20",
      "systolic_bp": 118,
      "diastolic_bp": 76,
      "fasting_glucose": 98,
      "total_cholesterol": 185,
      "hdl_cholesterol": 55,
      "ldl_cholesterol": 105,
      "triglycerides": 110
    },
    "body_composition": {
      "measured_at": "2026-10-20T08:30:00+09:00",
      "weight_kg": 68.5,
      "skeletal_muscle_mass_kg": 28.2,
      "body_fat_percentage": 24.0,
      "bmi": 23.1,
      "visceral_fat_level": 7
    },
    "diet_context": {
      "captured_at": "2026-10-23T09:00:00+09:00",
      "inventory": [],
      "allergies": []
    },
    "score_context": {
      "baseline_health_checkup": {
        "checkup_date": "2026-01-10",
        "systolic_bp": 124,
        "diastolic_bp": 80,
        "fasting_glucose": 105,
        "total_cholesterol": 195,
        "hdl_cholesterol": 50,
        "ldl_cholesterol": 118,
        "triglycerides": 135
      },
      "baseline_body_composition": {
        "measured_at": "2026-01-10T08:00:00+09:00",
        "weight_kg": 71.0,
        "skeletal_muscle_mass_kg": 27.5,
        "body_fat_percentage": 27.0,
        "bmi": 24.0,
        "visceral_fat_level": 8
      },
      "weekly_diet": {
        "expected_days": 7,
        "days": [
          {
            "date": "2026-10-19",
            "target": {
              "calories_kcal": 2000,
              "carbohydrate_g": 250,
              "protein_g": 100,
              "fat_g": 55
            },
            "actual": {
              "calories_kcal": 1950,
              "carbohydrate_g": 240,
              "protein_g": 98,
              "fat_g": 58
            }
          }
        ]
      },
      "weekly_exercise": {
        "goal_type": "body_fat_loss",
        "target_minutes": 90,
        "completed_minutes": 70,
        "target_days": 3,
        "completed_days": 2,
        "goal_aligned_completed_days": 2
      },
      "previous_health_score": {
        "scoring_version": "health-score-v1",
        "total_score": 70.5,
        "diet_score": 65.0,
        "exercise_score": 70.0,
        "health_data_score": 75.0
      }
    }
  }
}
```

### 5.3 필수 데이터 조건

| 계산 영역 | 필요한 Backend 데이터 | 누락 시 처리 |
|---|---|---|
| 식단 점수 | `weekly_diet`, 1~7일 목표 영양량과 실제 섭취량 | 영역 `unavailable`; 기록 일자의 `actual` 누락은 해당 일 0점 |
| 운동 점수 | `weekly_exercise`, 목표·완료 시간, 목표·완료 횟수, 목적 일치 수행 횟수 | 영역 `unavailable` |
| 건강데이터 점수 | 현재 건강검진·현재 인바디·최초 건강검진·최초 인바디 | 네 데이터 중 하나라도 없으면 영역 `unavailable` |
| 이전 주 비교 | 동일 버전의 `previous_health_score` | 현재 점수는 반환하되 비교만 생략 |

`score_context` 자체는 하위 호환을 위해 선택값이다. 단, 점수를 표시하려면 위 조건에 맞는 데이터를 Backend가 제공해야 한다.

`previous_health_score`는 네 점수가 모두 존재할 때만 전달한다. 직전 주 점수가 부분 계산 상태였다면 임의 값으로 채우지 않고 해당 필드 전체를 생략한다.

### 5.4 점수 정책

- 식단 점수는 메뉴 종류가 아니라 일별 `calories_kcal`, `carbohydrate_g`, `protein_g`, `fat_g`의 목표 준수율로 계산한다.
- 식단 가중치는 칼로리 30%, 단백질 30%, 탄수화물 20%, 지방 20%다.
- 운동 점수는 목표 시간 50%, 주간 횟수 30%, 운동 목적 일치 수행도 20%다.
- 식단과 운동은 0점부터 시작한다.
- 건강데이터는 최초 건강검진과 최초 인바디를 기준점으로 사용하며 80점부터 시작한다.
- 종합점수는 식단 30%, 운동 30%, 건강데이터 40%다.
- 점수 계산은 `health-score-v1` 코드로 수행하며 LLM을 사용하지 않는다.
- 세 영역 중 하나라도 계산 불가하면 `total_score`를 임의로 만들지 않는다.

### 5.5 응답 핵심 구조

Backend가 저장하고 재사용할 핵심 객체는 `analysis.health_score` 전체다.

```json
{
  "schema_version": "1.0",
  "request_id": "health-report-20261023-example",
  "analysis": {
    "health_score": {
      "status": "available",
      "total_score": 77.2,
      "maximum": 100,
      "scoring_version": "health-score-v1",
      "tier": "FIT",
      "tier_level": 1,
      "comparison_status": "available",
      "previous_total_score": 70.5,
      "score_delta": 6.7,
      "trend": "improved",
      "section_trends": {},
      "change_reasons": [],
      "priority_actions": [],
      "diet": {},
      "exercise": {},
      "health_data": {},
      "health_metric_adjustments": []
    }
  },
  "model": {
    "name": "string",
    "version": "string"
  }
}
```

위 JSON은 필드 위치 설명용 축약 예시다. `{}`로 표시된 하위 객체를 그대로 실제 요청에 사용하면 안 된다. 정확한 전체 객체는 OpenAPI와 실제 응답을 사용한다.

### 5.6 상태값

| 필드 | 값 | Backend 처리 |
|---|---|---|
| `health_score.status` | `available` | 종합점수 표시 및 snapshot 저장 가능 |
| `health_score.status` | `unavailable` | 종합점수 대신 필요한 입력 안내 |
| `comparison_status` | `available` | 이전 점수·증감·추세 표시 |
| `comparison_status` | `not_provided` | 최초 점수 또는 이전 snapshot 없음으로 표시 |
| `comparison_status` | `current_score_unavailable` | 현재 종합점수 계산 불가 처리 |
| `comparison_status` | `version_mismatch` | 점수 버전 변경 안내, 수치 증감 비교 금지 |
| `trend` | `improved` / `unchanged` / `declined` | 문자열 번역이 아닌 enum 기준으로 UI 처리 |

### 5.7 OpenAI 지연·장애 fallback

`/health-analysis`는 건강점수 계산 후 개인화 설명을 생성한다. 개인화 설명용 OpenAI 호출이 timeout, 오류 또는 빈 Structured Output으로 실패해도 이미 계산된 건강점수는 버리지 않고 HTTP `200`의 결정론적 fallback 응답으로 반환한다.

| `model.name` | `model.version` | 의미 |
|---|---|---|
| 설정된 OpenAI 모델명 | `health-analysis-v1` | 정상 개인화 설명 생성 완료 |
| `deterministic` | `health-analysis-fallback-v1` | OpenAI 없이 안전한 기본 건강 리포트 반환 |

Fallback 응답은 다음 원칙을 지킨다.

- `analysis.health_score`를 정상 계산 결과 그대로 보존한다.
- Rule Engine이 확정한 허용 건강지표 key만 사용한다.
- 알레르기 필터를 통과한 냉장고 재료의 개수와 실제 `expiring_soon` 이름만 표시한다.
- 구체적인 음식 조합이나 사용 재료를 임의 생성하지 않으므로 `used_items`와 `used_inventory_item_ids`는 비운다.
- Backend는 fallback 응답을 실패로 폐기하지 않고 점수 snapshot을 정상 저장할 수 있다.
- 운영 지표는 `GET /health/analysis`의 `health_analysis_resilience`에서 확인한다. 원본 건강정보나 API Key는 포함하지 않는다.

### 5.8 냉장고 식단 갱신 OpenAI 장애 fallback

`POST /health-analysis/diet-refresh`도 OpenAI 호출이 timeout, 오류 또는 빈 Structured Output으로 실패할 때 HTTP `503` 대신 HTTP `200`의 결정론적 fallback 응답을 반환한다.

| `model.name` | `model.version` | 의미 |
|---|---|---|
| 설정된 OpenAI 모델명 | `diet-refresh-v1` | 정상 식단 개인화 갱신 완료 |
| `deterministic` | `diet-refresh-fallback-v1` | OpenAI 없이 실제 안전 재고 상태만 반환 |

Fallback 응답은 알레르기 필터를 통과한 재고 개수와 실제 `expiring_soon` 항목만 사용한다. 구체적인 메뉴나 레시피를 추측하지 않으며 `used_items`와 `used_inventory_item_ids`를 비운다. Backend는 응답의 `model.version`을 확인해 기본 안내임을 표시할 수 있고, 기존 분석 결과에서는 `diet_suggestion`과 `refrigerator_context`만 교체한다.

사용 가능한 재고가 처음부터 없으면 건강 입력 형식 검증 후 RAG와 OpenAI 호출을 모두 생략하고 같은 fallback 계약으로 즉시 반환한다.

운영 지표는 `GET /health/analysis`의 `diet_refresh_resilience`에서 확인한다. 식단 갱신 OpenAI 제한 시간은 AI Server의 `DIET_REFRESH_OPENAI_TIMEOUT_SECONDS`로 설정하며 기본값은 30초다.

## 6. Backend 저장 및 다음 주 매핑 계약

Backend는 `analysis.health_score`를 사용자·평가 주차·`scoring_version` 기준의 불변 snapshot으로 저장하는 방식을 권장한다. AI Server는 저장소가 아니다.

다음 주 `/health-analysis` 요청의 `previous_health_score`는 직전 확정 snapshot에서 아래와 같이 매핑한다.

| 직전 응답 | 다음 요청 |
|---|---|
| `health_score.scoring_version` | `previous_health_score.scoring_version` |
| `health_score.total_score` | `previous_health_score.total_score` |
| `health_score.diet.score` | `previous_health_score.diet_score` |
| `health_score.exercise.score` | `previous_health_score.exercise_score` |
| `health_score.health_data.score` | `previous_health_score.health_data_score` |

Backend는 다음 규칙을 지킨다.

- AI Server가 반환한 점수를 다시 계산하거나 반올림해 원본 snapshot을 덮어쓰지 않는다.
- Frontend 표시용 반올림 값과 저장용 원본 값을 분리한다.
- `request_id`, `schema_version`, `scoring_version`, 생성 시각, 평가 기간을 함께 보존한다.
- 사용자의 최초 기준 건강검진·인바디는 명시적 기준 재설정 정책 없이 최신값으로 덮어쓰지 않는다.
- 동일 평가 주차의 재생성·확정 정책은 Backend transaction 규칙으로 관리한다.

## 7. 건강점수 챗봇 계약

### 7.1 Endpoint

```http
POST /chat/orchestrate
```

Request Schema는 `ChatRequest`, Response Schema는 `ChatResponse`다. 기존 일반 답변용 `POST /chat`과 혼용하지 않는다.

### 7.2 요청 예시

Backend는 최신 `/health-analysis` 응답의 `analysis.health_score`를 가능하면 변환 없이 `context.health_score`에 넣는다.

```json
{
  "content": "지난주보다 좋아졌어?",
  "history": [],
  "context": {
    "metric_statuses": {},
    "health_score": {
      "status": "available",
      "total_score": 77.2,
      "maximum": 100,
      "scoring_version": "health-score-v1",
      "tier": "FIT",
      "tier_level": 1,
      "comparison_status": "available",
      "previous_total_score": 70.5,
      "score_delta": 6.7,
      "trend": "improved",
      "section_trends": {
        "diet": {
          "previous_score": 65.0,
          "current_score": 80.0,
          "score_delta": 15.0,
          "trend": "improved"
        },
        "exercise": {
          "previous_score": 70.0,
          "current_score": 72.0,
          "score_delta": 2.0,
          "trend": "improved"
        },
        "health_data": {
          "previous_score": 75.0,
          "current_score": 79.0,
          "score_delta": 4.0,
          "trend": "improved"
        }
      },
      "change_reasons": [],
      "priority_actions": [],
      "diet": {
        "status": "available",
        "score": 80.0,
        "maximum": 100,
        "message": "식단 점수 계산 완료",
        "breakdown": {}
      },
      "exercise": {
        "status": "available",
        "score": 72.0,
        "maximum": 100,
        "message": "운동 점수 계산 완료",
        "breakdown": {}
      },
      "health_data": {
        "status": "available",
        "score": 79.0,
        "maximum": 100,
        "message": "건강데이터 점수 계산 완료",
        "breakdown": {}
      },
      "health_metric_adjustments": []
    }
  },
  "pending_action": null
}
```

### 7.3 지원 질문

| 사용자 질문 유형 | 예시 | 응답 `data.query_type` |
|---|---|---|
| 현재 점수 요약 | `내 건강 점수를 알려줘` | `summary` |
| 이전 주 비교 | `지난주보다 좋아졌어?` | `comparison` |
| 변화 원인 | `운동 점수가 낮은 이유가 뭐야?` | `reason` |
| 우선 행동 | `무엇부터 개선해야 해?` | `priority` |

`health_score_question`은 확정 snapshot을 설명하는 흐름이다. 점수를 다시 계산하거나 OpenAI가 새 수치를 만들지 않는다.

### 7.4 Backend Action 처리

| `action` | `action_status` | `requires_backend_apply` | Backend 처리 |
|---|---|---:|---|
| `health_score_context` | `completed` | `false` | `message`와 `data` 표시. DB 변경 없음 |
| `need_health_score_context` | `needs_input` | `false` | 최신 건강 리포트 조회 또는 생성 안내. 정상 점수 답변으로 취급하지 않음 |
| `health_rag` | `completed` | `false` | 일반 건강 질문 답변과 `sources` 표시 |

사용자 표시용 `message` 문자열을 비교해서 분기하지 않는다. 반드시 `intent`, `action`, `action_status`, `requires_backend_apply`를 기준으로 처리한다.

`data.recommended_next_feature`가 있으면 다음 값 중 하나다.

- `diet_recommendation`
- `exercise_recommendation`
- `health_analysis`

이 값은 이동 후보이며 Backend DB 변경 명령이 아니다. Frontend 실제 경로와의 매핑은 Backend·Frontend가 관리한다.

### 7.5 챗봇 개인정보 보호

- Backend는 해당 사용자 최신 snapshot만 전달한다.
- 대화 이력은 답변 문맥이며 건강데이터의 증거로 사용하지 않는다.
- `health_metric_adjustments`는 건강점수 계산 결과에는 존재할 수 있으나 AI Server가 챗봇 응답 `data`에서는 제거한다.
- Backend도 챗봇 표시를 위해 건강검진·인바디 원본 전체를 다시 첨부하지 않는다.
- 대화 로그와 오류 로그에 건강 원문, API Key, 사용자 식별 가능 정보를 남기지 않는다.

## 8. 오류 응답 계약

### 8.1 공통 인증·Schema 오류

| HTTP | 현재 의미 | Backend 처리 |
|---:|---|---|
| `401` | Bearer Header 누락, Scheme 오류, Key 불일치 | 재인증 화면이 아니라 서버 설정 오류로 기록하고 사용자에게 일반 장애 안내 |
| `422` | Pydantic 또는 서비스 입력 검증 실패 | 필드 매핑 오류 기록, 동일 payload 무한 재시도 금지 |
| `500` | 내부 처리 실패 또는 AI Server 인증 미설정 | 민감정보 없는 correlation log 기록 |

### 8.2 `/health-analysis` 추가 오류

| HTTP | 응답 형태 | 의미 |
|---:|---|---|
| `422` | `{"error":{"code":"VALIDATION_ERROR","message":"...","fields":[]}}` | 건강 분석 입력 검증 실패 |
| `503` | `{"error":{"code":"SERVICE_UNAVAILABLE","message":"...","fields":[]}}` | Rule/RAG Graph 또는 기타 복구 불가능한 내부 서비스 장애. OpenAI 설명 생성 오류는 정상 fallback 응답으로 복구 |
| `500` | `{"error":{"code":"INTERNAL_ERROR","message":"...","fields":[]}}` | 기타 서버 오류 |

### 8.3 `/chat/orchestrate` 오류

현재 예상하지 못한 오류는 `500`과 `{"detail":"Chat processing failed."}` 형태로 반환한다.

Backend는 `health_score.status=unavailable` 또는 `action=need_health_score_context`를 HTTP 오류로 취급하지 않는다. 이는 정상적인 업무 상태 응답이다.

## 9. 시간·날짜·단위 계약

- 날짜는 `YYYY-MM-DD` 형식을 권장한다.
- 시각은 timezone을 포함한 ISO 8601 형식을 권장한다.
- 서비스 기준 timezone은 `Asia/Seoul`로 합의하는 것을 권장한다.
- 체중·근육량·지방량은 `kg`, 영양량은 `g`, 열량은 `kcal`, 운동시간은 `minute` 단위를 사용한다.
- 혈액검사·혈압 단위는 현재 건강검진 입력 Schema와 Backend 원본 정의를 유지한다.
- 문자열로도 허용되는 일부 건강 수치가 있더라도 Backend는 가능하면 숫자 JSON 값으로 전달한다.

현재 날짜 필드는 Schema상 `str`이므로 엄격한 ISO 형식 강제는 아직 적용되지 않았다. 이 항목은 Backend DTO 확정 후 계약 테스트로 고정한다.

## 10. Backend E2E 수용 시나리오

| 번호 | 시나리오 | 기대 결과 |
|---:|---|---|
| 1 | 최초 기준 건강검진·인바디와 현재 동일 데이터, 빈 주간 식단, 운동 수행 0 전달 | 식단 0점, 운동 0점, 건강데이터 80점, 종합 32점 |
| 2 | 세 영역 전체 데이터와 같은 버전의 직전 점수 전달 | `status=available`, `comparison_status=available`, 증감·추세·영역별 추세 반환 |
| 3 | 이전 점수의 `scoring_version`이 다름 | `comparison_status=version_mismatch`, 수치 비교 생략 |
| 4 | 현재 또는 최초 건강검진·인바디 중 하나 누락 | 건강데이터 영역 및 종합점수 `unavailable`; 임의 점수 생성 안 함 |
| 5 | 최신 점수로 `내 건강 점수를 알려줘` 질문 | `health_score_question / health_score_context / completed` |
| 6 | 비교 가능한 점수로 `지난주보다 좋아졌어?` 질문 | `data.query_type=comparison`, 증감 설명 반환 |
| 7 | `운동 점수가 낮은 이유가 뭐야?` 질문 | `data.query_type=reason`, `data.section=exercise` |
| 8 | `무엇부터 개선해야 해?` 질문 | 우선 행동과 가능한 `recommended_next_feature` 반환 |
| 9 | `context.health_score` 없이 점수 질문 | `need_health_score_context / needs_input` |
| 10 | 일반 건강 질문 | 기존 `health_rag / completed` 및 실제 RAG `sources` 유지 |
| 11 | 잘못된 Bearer Key | HTTP `401` |
| 12 | 사용자 A 점수를 사용자 B 채팅에 전달하지 않음 | 사용자별 완전 격리 확인 |
| 13 | 냉장고 재료가 있는 요청에서 OpenAI timeout 또는 오류 발생 | HTTP `200`, `model.version=health-analysis-fallback-v1`, 건강점수 보존 |
| 14 | fallback 응답의 냉장고 context 확인 | 알레르기 제외·유통기한 상태는 원본 입력과 일치하고 사용 재료는 빈 배열 |

시나리오 1의 32점은 `0×0.3 + 0×0.3 + 80×0.4` 정책에 따른 기준값이다. 실제 E2E에서는 AI 설명 문장 전체 일치보다 점수·상태·Action·Schema를 검증한다.

## 11. Backend 구현 체크리스트

- [ ] 배포 AI Server가 최신 `ai` 브랜치 커밋인지 확인했다.
- [ ] 배포 서버 `/openapi.json`을 받아 Backend DTO와 대조했다.
- [ ] `health_report_api_contract_examples.json`의 네 가지 기준 사례를 Backend DTO로 역직렬화했다.
- [ ] `AI_SERVER_BASE_URL`, `AI_SERVER_API_KEY`, `AI_SERVER_ENABLED`를 서버 환경에만 설정했다.
- [ ] `/health-analysis`용 Request/Response DTO를 OpenAPI 기준으로 매핑했다.
- [ ] 최초 건강검진·인바디 기준데이터를 사용자별로 보존한다.
- [ ] 식단의 일별 영양 목표와 실제 섭취량을 구분해 집계한다.
- [ ] 운동 목표와 실제 시간·횟수·목적 일치 횟수를 구분해 집계한다.
- [ ] `analysis.health_score` 원본 snapshot을 점수 버전과 함께 저장한다.
- [ ] 직전 확정 snapshot을 다음 주 `previous_health_score`로 매핑한다.
- [ ] `/chat/orchestrate`에 최신 `health_score` 전체 객체를 전달한다.
- [ ] 챗봇 응답을 문장이 아닌 `action`과 `action_status`로 분기한다.
- [ ] `health_metric_adjustments`를 챗봇 UI에 노출하지 않는다.
- [ ] `model.version=health-analysis-fallback-v1` 응답에서도 건강점수 snapshot을 저장한다.
- [ ] `GET /health/analysis` 운영 지표를 배포 확인에 사용한다.
- [ ] `401`, `422`, `500`, `503` 및 timeout 처리를 구현했다.
- [ ] 사용자 간 건강정보·대화 context가 섞이지 않는 테스트를 추가했다.
- [ ] 민감정보가 로그·모니터링·예외 추적에 원문으로 남지 않는지 확인했다.
- [ ] 이 문서의 E2E 수용 시나리오를 실제 배포 환경에서 통과했다.

## 12. Backend 확인이 필요한 미확정 항목

아래 항목은 AI Server가 임의로 결정하지 않는다.

- [ ] `[Backend 확인 필요]` 운영 AI Server의 HTTPS 기본 URL과 배포 커밋
- [ ] `[Backend 확인 필요]` 한 주의 시작 요일과 `Asia/Seoul` 주차 경계
- [ ] `[Backend 확인 필요]` 최초 기준 건강검진·인바디의 재설정 조건
- [ ] `[Backend 확인 필요]` 동일 주차 건강점수 재생성 시 versioning 또는 덮어쓰기 정책
- [ ] `[Backend 확인 필요]` 직전 확정 점수가 없는 중간 주차의 비교 기준
- [ ] `[Backend 확인 필요]` `need_health_score_context` 발생 시 동기 재생성 또는 화면 이동 정책
- [ ] `[Backend 확인 필요]` `recommended_next_feature`와 Frontend 실제 route 매핑
- [ ] `[Backend 확인 필요]` `/health-analysis`와 기존 `/analysis` 중 공식 종합 건강분석 경로
- [ ] `[Backend 확인 필요]` 건강 리포트 및 snapshot 보존 기간과 삭제 정책
- [ ] `[Backend 확인 필요]` AI Server timeout과 제한적 재시도 횟수

## 13. 연동 완료 판정 기준

다음 조건을 모두 만족하면 이번 계약의 Backend 연동이 완료된 것으로 본다.

1. Backend DTO가 배포 서버 `/openapi.json`과 일치한다.
2. Backend가 사용자별 기준데이터와 주간 기록을 올바르게 조립한다.
3. `/health-analysis`의 `request_id`가 응답에서 동일하게 유지된다.
4. Backend가 확정 `health_score`를 재계산하지 않고 저장한다.
5. 다음 주 점수 비교에 직전 확정 snapshot이 사용된다.
6. 챗봇은 동일 snapshot을 설명하며 새 점수를 만들지 않는다.
7. `health_score_context`, `need_health_score_context`, `health_rag` 분기가 정상 동작한다.
8. 사용자 간 건강정보가 섞이지 않는다.
9. 민감정보와 서버 간 Key가 Frontend·로그·Git에 노출되지 않는다.
10. [10. Backend E2E 수용 시나리오](#10-backend-e2e-수용-시나리오)를 실제 환경에서 통과한다.

## 14. 관련 계약 문서

| 문서 | 용도 |
|---|---|
| [backend_ai_integration_spec.md](backend_ai_integration_spec.md) | 식단·레시피·운동·건강·러닝을 포함한 전체 Backend-AI 통합 명세 |
| [chat_api_contract.md](chat_api_contract.md) | 챗봇 전체 intent, action, pending action 계약 |
| [chat_api_contract_examples.json](chat_api_contract_examples.json) | Pydantic으로 검증되는 챗봇 요청·응답 예제 |
| [health_report_api_contract_examples.json](health_report_api_contract_examples.json) | 건강점수 최초·주간 비교·버전 불일치·데이터 누락 계약 예제 |
| [ai-openapi.json](ai-openapi.json) | AI Server OpenAPI snapshot |
| [running_backend_e2e_contract.md](running_backend_e2e_contract.md) | 러닝 저장 책임과 E2E 수용 기준 |
| [running_api_contract_examples.json](running_api_contract_examples.json) | 러닝 5개 API 요청·응답 예제 |
| [food_image_backend_contract.md](food_image_backend_contract.md) | 음식 이미지 분석의 임시 Backend 경계 계약 |
| [recipe_api_contract_examples.json](recipe_api_contract_examples.json) | 식단 Recipe 요청·응답 예제 |

## 15. Backend 검토 회신 양식

Backend 담당자는 검토 후 아래 항목을 채워 공유한다.

```text
검토자:
검토일:
Backend 기준 브랜치/커밋:
AI Server 배포 커밋:

[ ] 요청 DTO 일치
[ ] 응답 DTO 일치
[ ] enum 일치
[ ] null 허용 범위 일치
[ ] 인증 방식 일치
[ ] 저장 책임 일치
[ ] 사용자별 데이터 격리 가능
[ ] E2E 테스트 가능

불일치 항목:
- [입력 필요]

Backend에서 변경할 항목:
- [입력 필요]

AI Server에 요청할 변경:
- [입력 필요]

미확정 정책 결정:
- [입력 필요]
```

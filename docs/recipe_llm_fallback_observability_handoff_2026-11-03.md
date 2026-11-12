# Auto-Fit Recipe LLM fallback 진단·배포 인계서

> 작성일: 2026-11-03
> 대상: Backend 개발자, AI Server 개발자, 서버·배포 관리자
> 저장소: `Auto-Fit-Transfer/Auto-Fit`
> 브랜치: `ai`
> 진단 기능 최소 커밋: `5edea40c7de33dcf5858d6ef3ac11c0e35feac93`
> 권장 통합 코드 커밋: `1134328`

## 1. 결론

주간 식단의 Recipe가 오류 로그 없이 `unavailable`로 내려가던 경로를 추적할 수
있도록 AI Server의 LLM fallback 관측성을 보강했다.

이번 변경으로 다음을 확인할 수 있다.

- OpenAI 호출 자체가 예외로 실패했는지
- 응답은 왔지만 Structured Output이 파싱되지 않았는지
- 파싱은 성공했지만 알레르기·기피 음식 안전검사에서 거부됐는지
- 어느 AI Server 워커에서 지표와 로그가 발생했는지
- 응답이 `max_output_tokens` 때문에 중단됐는지
- 출력 토큰 중 추론 토큰이 얼마나 사용됐는지

Recipe 응답 DTO와 기존 처리 우선순위는 변경하지 않았다.

```text
official_exact
→ official_similar
→ llm_generated
→ unavailable
```

Backend의 기존 Recipe 요청·응답 매핑은 그대로 유지할 수 있다. Backend가 새로
처리해야 하는 필수 비즈니스 필드는 없으며, `GET /health/recipe`에 추가된
`worker_pid`만 운영 진단에 선택적으로 사용하면 된다.

## 2. 반영 커밋

| 커밋 | 내용 |
|---|---|
| `9a1e115` | 미파싱 응답과 안전검사 거부 지표·로그 추가 |
| `af35f84` | Recipe LLM에 `reasoning={"effort": "minimal"}` 적용 및 응답 상태 기록 |
| `5edea40` | 워커 PID와 OpenAI 응답 진단정보를 로그·health에 보강 |

`5edea40`을 배포하면 앞선 두 진단 커밋도 함께 포함된다. 공식 Recipe 오매칭
보정까지 포함하려면 통합 코드 커밋 `1134328` 이상을 배포한다.

## 3. 변경 배경

기존에는 `responses.parse()`가 예외를 발생시키면 `llm_failures`와 예외 로그가
남았지만, 다음 두 경로는 별도 진단정보 없이 재시도 후 `unavailable`이 될 수
있었다.

1. OpenAI 응답은 정상 수신했으나 `response.output_parsed`가 `None`인 경우
2. Structured Output 파싱 후 알레르기·기피 음식 안전검사에서 거부된 경우

또한 AI Server가 여러 워커로 실행되면 메모리 지표가 워커마다 분리되기 때문에,
단일 `/health/recipe` 응답만으로는 실제 요청을 처리한 워커의 지표를 확인하지
못할 수 있었다.

## 4. 실제 호출 흐름

```text
Frontend
  → Backend
    → POST /recommend/diet/recipe
      → recommendation_router
        → MealRecipeService
          → RecipeService / 식품안전나라 COOKRCP01
          → 공식 exact 또는 similar가 없으면 OpenAI responses.parse
          → 생성 결과 알레르기·기피 음식 안전검사
          → DietRecipeResponse

운영 상태 확인
  → GET /health/recipe
    → health_router
      → MealRecipeService.get_operational_stats()
```

## 5. 코드 변경 사항

### 5.1 OpenAI 추론 설정

Recipe LLM fallback 호출에 다음 설정을 적용했다.

```python
reasoning={"effort": "minimal"}
max_output_tokens=1200
```

목적은 `gpt-5`가 Recipe Structured Output을 생성하기 전에 추론 토큰을 과도하게
사용하여 출력 공간이 부족해지는 가능성을 낮추는 것이다.

`max_output_tokens`는 현재 `1200`을 유지한다. 실제 운영 재현에서
`incomplete_reason=max_output_tokens`와 높은 `reasoning_tokens`가 확인된 뒤에만
상향 여부를 결정한다.

### 5.2 Recipe health 지표

다음 지표가 `recipe_pipeline.cache`에 포함된다.

| 지표 | 의미 |
|---|---|
| `llm_unparsed_responses` | OpenAI 응답은 왔지만 `output_parsed`가 `None`인 횟수 |
| `llm_safety_rejections` | 파싱된 Recipe가 알레르기·기피 음식 안전검사에서 거부된 횟수 |
| `llm_quality_rejections` | 파싱된 Recipe에 조리 도구 재료, 완제품 직접 제조, 빈 재료·단계 같은 품질 문제가 있어 거부된 횟수 |
| `llm_failures` | OpenAI 호출 또는 응답 검증 중 예외가 발생한 횟수 |
| `item_failures` | 음식 또는 식사 Recipe enrichment의 바깥 단계에서 예외가 발생한 횟수 |
| `official_api_fallbacks` | 공식 Recipe 조회 예외로 LLM fallback을 사용한 횟수 |

`ingredients[].amount_g`는 확인된 값이면 반드시 `> 0`이며, 원본 단위를
합리적으로 g으로 정할 수 없으면 `null`이다. `0g`은 유효한 재료량으로
전송하지 않는다.

공식 API의 `quota_exhaustions`는 HTTP 200 응답 안에서 `ERROR-503`,
`INFO-300`, `INFO-320` 호출 제한 코드를 받은 횟수다. `ERROR-503`이면
해당 워커의 공식 Recipe circuit를 한국시간 19시까지 열어 제한 초과 요청을
반복하지 않으며, `INFO-300`·`INFO-320`은 1시간 동안 차단한다.

모든 값은 누적 횟수이며 Recipe 생성 1건에서 최대 2회까지 LLM을 재시도하므로,
한 음식 때문에 미파싱 또는 안전거부 지표가 `2` 증가할 수 있다.

### 5.3 워커 식별

`GET /health/recipe` 최상위 응답에 현재 요청을 처리한 프로세스의
`worker_pid`를 추가했다.

```json
{
  "status": "ok",
  "service": "healthcare-ai-server",
  "worker_pid": 12345,
  "recipe_pipeline": {
    "status": "ok",
    "cache": {
      "llm_unparsed_responses": 0,
      "llm_safety_rejections": 0,
      "llm_quality_rejections": 0,
      "llm_failures": 0,
      "item_failures": 0
    },
    "official_recipe_api": {
      "quota_exhaustions": 0,
      "circuit_open": false
    }
  }
}
```

위 예시는 변경 확인에 필요한 필드만 표시한 축약 예시다. 실제 응답에는 기존
cache 및 공식 API 통계도 함께 포함된다.

### 5.4 로그 진단정보

미파싱 경로의 로그 시작 문구:

```text
LLM recipe response has no parsed output
```

기록 정보:

- `attempt`
- `worker_pid`
- `response_id`
- `status`
- `incomplete_details`
- `incomplete_reason`
- `output_tokens`
- `reasoning_tokens`

안전검사 거부 경로의 로그 시작 문구:

```text
LLM recipe rejected by safety check
```

기록 정보:

- `attempt`
- `worker_pid`
- `restriction_count`
- `response_id`
- `status`
- `incomplete_details`
- `incomplete_reason`
- `output_tokens`
- `reasoning_tokens`

OpenAI 호출 예외의 기존 로그 시작 문구:

```text
LLM recipe generation failed
```

이 로그에도 `attempt`와 `worker_pid`를 기록한다.

음식명, 알레르기명, 기피 음식명, 프롬프트 원문은 위 진단 로그에 기록하지 않는다.
안전검사 거부 로그에는 금지 재료 목록 대신 개수인 `restriction_count`만 남긴다.

## 6. Backend 개발자 확인 사항

### 6.1 API 계약 영향

- `POST /recommend/diet/recipe` 요청 DTO 변경 없음
- Recipe 응답 DTO 변경 없음
- `recipe_source` 값 변경 없음
- `restriction_matches` 값의 의미 변경 없음
- `GET /health/recipe`에 숫자형 `worker_pid`가 추가됨

`worker_pid`는 additive 필드이므로 Backend가 health 응답을 엄격한 DTO로
역직렬화한다면 선택 필드로 허용한다. 일반적인 pass-through 또는 알 수 없는 필드
허용 방식이면 별도 변경이 필요 없다.

### 6.2 재현 요청 시 제공할 정보

비용 승인된 테스트 계정으로 주간 Recipe 1건을 재현할 때 다음을 AI·서버
담당자에게 전달한다.

- 요청 시각: 초 단위, KST와 UTC 중 사용한 시간대 명시
- Backend 요청 ID 또는 trace ID
- 실제 전달한 `food_allergens`
- 실제 전달한 `disliked_foods`
- 실제 전달한 식사 목표와 Recipe `items`
- 각 음식의 응답 `recipe_source`
- 각 음식의 응답 `restriction_matches`
- Backend가 받은 HTTP 상태 코드와 오류 본문

API Key, 사용자 인증 토큰, 이름·연락처 등의 개인정보는 공유하지 않는다.

### 6.3 응답 판정

| `recipe_source` | Backend 처리 |
|---|---|
| `official_exact` | 공식 정확 일치 Recipe로 저장·표시 |
| `official_similar` | 공식 유사 Recipe로 저장·표시 |
| `llm_generated` | AI 생성 Recipe임을 구분하여 저장·표시 |
| `unavailable` | Recipe 없음 상태로 저장하고 UI에서 안내; Recipe 본문을 가정해 만들지 않음 |

`unavailable`은 음식 한 건의 Recipe 해결 결과다. 응답 전체가 정상적으로 반환됐다면
이를 임의로 HTTP 503으로 바꾸지 않는다. 반대로 AI Server 자체 호출이 실패한
경우의 5xx는 기존 Backend 장애 처리 정책을 따른다.

## 7. 서버·배포 관리자 작업 순서

### 7.1 배포 전

1. 배포 소스가 `ai` 브랜치의 `5edea40` 이상인지 확인한다.
2. `OPENAI_API_KEY`가 설정됐는지만 확인한다. 실제 값은 출력하지 않는다.
3. `FOOD_SAFETY_RECIPE_API_KEY`가 설정됐는지만 확인한다. 이 키는
   식품안전나라에서 발급받은 키이며 임의 문자열을 사용하지 않는다.
4. 워커 수와 프로세스 실행 방식을 기록한다.
5. 배포 전 `/health/recipe` 값을 워커별로 가능한 범위에서 보관한다.

### 7.2 배포

1. 모든 워커를 새 이미지 또는 새 커밋으로 교체한다.
2. 이전 워커와 새 워커가 장시간 혼재하지 않는지 확인한다.
3. 각 워커 시작 로그에서 import 또는 설정 오류가 없는지 확인한다.
4. `/health`와 `/health/recipe`가 200인지 확인한다.
5. `/health/recipe.worker_pid`가 양의 정수인지 확인한다.

### 7.3 비용 승인 후 실제 재현 1건

1. Backend가 정확한 요청 시각을 기록하고 주간 Recipe 요청 1건을 보낸다.
2. 요청 직전과 직후 `/health/recipe`를 여러 번 조회해 관측된
   `worker_pid`별 지표를 비교한다.
3. 같은 시간 구간의 모든 워커 로그에서 다음 문구를 검색한다.

```text
LLM recipe response has no parsed output
LLM recipe rejected by safety check
LLM recipe generation failed
Recipe enrichment failed
```

4. Backend 응답의 음식별 `recipe_source`와 `restriction_matches`를 대조한다.
5. 결과를 요청 시각, 배포 커밋, 워커 PID와 함께 기록한다.

## 8. 결과 해석표

| 관측 결과 | 의미 | 다음 조치 |
|---|---|---|
| `llm_unparsed_responses` 증가 + `incomplete_reason=max_output_tokens` | 출력 한도 내 Structured Output 완성 실패 | `reasoning_tokens` 확인 후 토큰 한도 조정 검토 |
| `llm_safety_rejections` 증가 | Recipe는 생성됐으나 안전 정책 위반 | 요청 제한조건과 `restriction_matches` 대조; 안전검사는 완화하지 않음 |
| `llm_quality_rejections` 증가 | Recipe는 파싱됐으나 도구가 재료에 포함되거나 완제품 제조 과정 등이 생성됨 | `LLM recipe rejected by quality check` 로그의 시각·워커·횟수를 확인하고 동일 요청의 재시도 결과 확인 |
| `llm_failures` 증가 | SDK, 네트워크, 모델, 응답 검증 등의 예외 | 같은 PID의 traceback과 OpenAI 상태 확인 |
| `item_failures` 증가 | Recipe item 또는 meal enrichment 예외 | 같은 시각의 `Recipe enrichment failed` traceback 확인 |
| `official_api_fallbacks` 증가 | 공식 Recipe API 예외 후 LLM으로 전환 | 식품안전나라 키·응답·circuit 상태 확인 |
| 공식 API `requests=0` | 공식 조회가 실행되지 않은 워커이거나 설정·요청 경로 문제 | 키 설정, 워커 PID, 실제 요청 처리 워커 확인 |
| 지표 변화 없음, 관련 로그 존재 | 다른 워커의 health를 조회했을 가능성 | 로그의 `worker_pid`를 기준으로 해당 워커 확인 |
| 지표·로그 모두 없음 | 해당 AI 배포에 요청이 도달하지 않았거나 시간 범위가 틀림 | Backend URL, 배포 커밋, 요청 시각, proxy 로그 확인 |

## 9. 멀티워커 주의사항

Recipe 지표와 cache는 현재 프로세스 메모리에 있다. 따라서 다음 특성이 있다.

- 워커 A에서 증가한 지표는 워커 B의 `/health/recipe`에 나타나지 않는다.
- 배포 또는 프로세스 재시작 시 누적 지표가 초기화된다.
- load balancer가 같은 워커로만 health 요청을 보낼 수 있다.
- 워커별 로그의 `worker_pid`가 최종 판정 기준이다.

이번 변경은 워커를 통합하거나 중앙 지표 저장소를 추가한 것이 아니다. 장기적으로
전체 인스턴스 집계가 필요하면 Prometheus, OpenTelemetry 또는 중앙 로그 기반
집계를 별도 설계해야 한다.

## 10. 기존 동작에 미치는 영향

유지되는 기능:

- 공식 Recipe 우선 조회
- `official_exact → official_similar → llm_generated → unavailable` 순서
- `톳나물_두부 → 톳나물 두부무침` 유사 매칭 정책
- 공식 Recipe 재료 scaling
- LLM Recipe 최대 2회 생성
- 알레르기·기피 음식 안전검사
- Recipe cache와 single-flight
- 기존 Recipe 응답 Schema

변경되는 운영 동작:

- Recipe LLM의 reasoning effort가 `minimal`로 명시됨
- 미파싱·안전거부가 별도 지표와 warning 로그로 남음
- 로그에서 처리 워커와 OpenAI 응답 상태를 식별할 수 있음
- `/health/recipe` 최상위에 `worker_pid`가 추가됨

## 11. 실행한 테스트

다음 검증이 통과했다.

```text
Python syntax / import compile 검사
test_meal_recipe_diagnostics.py
test_meal_recipe_structure.py
test_meal_recipe_resilience.py
test_recipe_router_cache.py
test_diet_recipe_schema.py
test_recipe_detail_display.py: 3 passed
test_meal_recipe_query.py: official exact 및 official similar 회귀 확인
```

공식 유사 Recipe 회귀 사례:

```text
요청: 톳나물_두부
공식 매칭: 톳나물 두부무침
결과: official_similar
유사도: 약 0.9157
```

테스트에서는 가짜 OpenAI 응답을 사용해 미파싱·안전거부 경로를 결정론적으로
검증했다. 비용이 발생하는 실제 OpenAI Recipe 재현은 아직 수행하지 않았다.

## 12. 완료·미완료 구분

완료:

- 코드 수정
- 진단 지표 추가
- 안전한 로그 추가
- 워커 PID 노출
- 자동 테스트
- `ai` 브랜치 푸시

남은 작업:

- AI Server에 `5edea40` 이상 배포
- 모든 워커가 같은 커밋인지 확인
- 비용 승인 후 실제 주간 Recipe 1건 재현
- 워커별 전후 지표와 로그 수집
- 음식별 `recipe_source`, `restriction_matches` 대조
- 실제 결과에 따라 `max_output_tokens` 조정 여부 결정

코드가 GitHub에 반영된 것과 운영 배포 완료는 서로 다른 상태다. 배포 후 smoke와
실제 1건 재현이 끝나기 전까지 운영 문제 해결 완료로 표시하지 않는다.

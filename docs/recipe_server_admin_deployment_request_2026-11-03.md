# AI Server 설정 및 확인 요청

## 1. Recipe LLM 설정

현재 설정을 그대로 유지합니다.

- `reasoning.effort`: `minimal`
- `max_output_tokens`: `1200`
- 추가 토큰 상향: 현재는 불필요

향후 `llm_unparsed_responses`와
`incomplete_reason=max_output_tokens`가 발생할 때만 조정을 검토하겠습니다.

## 2. 식품안전나라 API Key

`FOOD_SAFETY_RECIPE_API_KEY`는 전달 완료했습니다.

서버 환경변수에 적용한 후 재시작하고 다음을 확인해 주세요.

- `/health/recipe`의 공식 API `requests` 증가
- `successes` 증가
- `official_api_fallbacks` 이상 증가 여부
- `톳나물_두부` 조회 결과가 `official_similar`인지 확인
- 공식 매칭 메뉴가 `톳나물 두부무침`인지 확인

API Key 값은 로그나 문서에 남기지 말아 주세요.

## 3. AI Server 배포

현재 운영 서버가 `af35f84`라면 통합 코드 커밋 `1134328` 이상으로 배포해 주세요.

`1134328`에는 `5edea40`의 진단 기능과 공식 Recipe 오매칭 보정이 모두
포함돼 있습니다.

- 워커별 `worker_pid`
- OpenAI `response_id`
- `incomplete_reason`
- 출력·추론 토큰 로그
- 워커별 실패 구분
- 공식 Recipe 접두·접미 오매칭 차단
- 공식 API 호출 조기 종료 및 최대 검색 횟수 제한
- 식품안전나라 HTTPS 적용
- 오류 로그의 URL 인증키 노출 방지

공식 Recipe API Key 적용과 최신 커밋 배포를 함께 진행하는 것을 권장합니다.

## 4. 배포 후 확인

- `/health`: HTTP 200
- `/health/recipe`: HTTP 200
- `worker_pid`: 양의 정수
- 공식 Recipe 조회 성공
- LLM Recipe fallback 정상
- `llm_unparsed_responses`: 비정상 증가 없음
- `llm_safety_rejections`: 비정상 증가 없음
- `llm_quality_rejections`: 비정상 증가 없음
- 공식 API `quota_exhaustions`: 비정상 증가 없음
- `llm_failures`: 비정상 증가 없음
- `item_failures`: 비정상 증가 없음

배포 완료 후 적용 커밋, 재시작 시각, `/health/recipe` 확인 결과를 공유해 주세요.

## 5. 러닝 관련 확인

난이도 계약은 다음과 같습니다.

```text
difficulty:
easy | moderate | hard | unknown

difficulty_basis:
official | heuristic | unknown

desired_difficulty:
easy | moderate | hard
```

경유지 좌표는 자동 순환 코스와 `/running/routes/preview`에서 지원합니다.
공식 메타데이터 코스는 원본 좌표가 없으면 임의로 생성하지 않습니다.

메타데이터 코스가 존재해도 검증된 전체 경로가 없으면
`status=matched`, `generation_recommended=true`로 반환합니다. 목록 카드는
유지하고 `상세 경로 좌표 미제공` 상태를 표시한 뒤, GPS 출발점으로
`POST /running/routes/generate-loop`를 호출해 지도용 후보를 생성해 주세요.
자동 생성 결과는 원본 공식 코스의 복원 경로가 아닙니다.

Kakao 키를 재발급한 경우 다음도 확인해 주세요.

- AI Server의 REST API Key 교체 및 재시작
- 기존 키 폐기
- Expo JavaScript Key 환경변수 갱신
- JavaScript SDK 허용 도메인 설정
- 모바일 새 빌드 생성 여부

## 6. 식품안전나라 호출 제한 확인

공식 COOKRCP01 페이지의 `API호출제한 1000`은 한 요청에서 조회할 수 있는
최대 행 수 설명이며 일일 호출 횟수로 확정할 근거는 아닙니다.

공식 오류 코드에는 다음 문구가 별도로 있습니다.

- `INFO-320`: 증분 파라미터 없이 호출 시 최대 100회/시간
- `ERROR-503`: 06시~19시 인증키/서비스별 300회

`ERROR-503` 문구는 06시~19시 시간대 전체에 인증키/서비스 조합별 최대
300회가 적용된다는 의미로 해석해야 합니다. `INFO-320`은 별도 조건이므로
증분 파라미터를 사용하지 않는 현재 조회에는 1시간당 100회와 낮 시간대
누적 300회가 함께 적용되며, 먼저 도달한 제한을 지켜야 합니다.

다만 카운터의 정확한 초기화 시각과 경계 호출 처리까지는 공개 문구에
명시되지 않았으므로 출시 전 운영기관에 아래 항목을 서면 문의합니다.

1. 06시~19시 300회의 집계 구간과 초기화 시각
2. 19시 이후 호출과 다음 날 06시 호출 사이의 카운터 처리 방식
3. 개발·운영 키 또는 서비스별 한도 분리 여부
4. 초과 시 재시도 가능 시각과 권장 호출 간격

확답 전에는 06시~19시 인증키/서비스별 300회 누적으로 운영하고,
Recipe cache와 검색 조기 종료를 유지합니다. 멀티워커 전체 호출량을
정확히 제한하려면 프로세스 메모리가 아닌 Backend/공용 저장소 기반 집계가
필요하므로 선제적인 워커별 호출 횟수 limiter는 추가하지 않습니다. 대신
실제 `ERROR-503`을 받은 워커는 한국시간 19시까지 circuit를 열어 같은
제한 초과 요청을 반복하지 않습니다.

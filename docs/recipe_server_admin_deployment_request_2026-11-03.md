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

Kakao 키를 재발급한 경우 다음도 확인해 주세요.

- AI Server의 REST API Key 교체 및 재시작
- 기존 키 폐기
- Expo JavaScript Key 환경변수 갱신
- JavaScript SDK 허용 도메인 설정
- 모바일 새 빌드 생성 여부

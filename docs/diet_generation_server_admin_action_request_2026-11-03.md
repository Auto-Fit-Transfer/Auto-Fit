# 식단 생성 구조화 API 배포·관측 요청 — 서버 관리자용

> 작성일: 2026-11-03
> 대상: 서버 관리자
> 관련 기능: Backend → AI Server 식단 연동, 토큰·비용 관측, 회귀시험

## 1. 결론

2026-11-03 시험에서 AI Server `/chat`은 88건 모두 HTTP 200을 반환했습니다. 서버 장애가 아니라 자유 형식 응답을 식단으로 사용하면서 Backend 계약 검사에서 탈락한 문제입니다.

Backend 수정 배포 후 식단 호출이 다음 전용 경로로 전환됐는지 확인해 주세요.

| 기능 | 확인할 AI Server 경로 |
|---|---|
| 주간 식단 생성 | `POST /recommend/diet` |
| 한 끼 재추천 | `POST /recommend/diet/replace-meal` |
| 레시피 조회 | `POST /recommend/diet/recipe` |
| 일반 채팅 | `POST /chat` |

## 2. 배포 전 확인

실제 값은 문서나 채팅에 공유하지 말고 서버의 안전한 환경변수 저장소에서 확인합니다.

- `AI_SERVER_BASE_URL`
- `AI_SERVER_API_KEY`
- `AI_SERVER_ENABLED=true`
- `OPENAI_API_KEY`
- 식품안전나라 Recipe API Key
- 필요한 Food DB 및 외부 서비스 설정

API Key는 Frontend 환경변수나 앱 번들에 넣지 않습니다. `.env` 내용과 실제 secret은 로그·문서·Git에 남기지 않습니다.

## 3. 배포 후 호출 경로 확인

Backend와 AI Server 로그의 같은 request ID 또는 요청 시각을 대조합니다.

### 정상 기대값

```text
주간 식단 생성
Backend → POST /recommend/diet → 200 → Backend 저장 성공

한 끼 재추천
Backend → POST /recommend/diet/replace-meal → 200 → 대상 슬롯 저장 성공
```

### 비정상 확인값

```text
Backend 식단 생성 → POST /chat
```

Backend 전환 완료 후 주간 식단 및 한 끼 재추천 목적으로 `/chat`이 호출되면 호출 시각과 Backend 경로를 공유해 주세요.

## 4. 로그 및 지표 요청

### 4.1 요청 단위

- 요청 시각
- 비식별 request ID
- 호출 엔드포인트
- HTTP 상태 코드
- 전체 응답 시간
- timeout 여부
- 재시도 횟수
- Backend 최종 저장 성공 여부

### 4.2 OpenAI 사용량

AI Server는 `/chat` 성공 응답의 선택적 `usage`와 `/health/chat`, `/health/diet`의 프로세스 누적 지표로 다음 값을 제공합니다. 목적별로 분리해 집계합니다.

- `input_tokens`
- `output_tokens`
- `reasoning_tokens`
- `total_tokens`
- 호출 횟수
- 모델명
- `response.status`
- `incomplete_details.reason`

`/health/chat`과 `/health/diet`의 `worker_pid`를 함께 기록합니다. 지표는 프로세스 메모리 기반이므로 멀티워커 환경에서는 워커별 값을 각각 수집해야 합니다.

사용 목적은 최소한 다음과 같이 분리합니다.

- 일반 챗봇
- 식단 설명·guidance
- Recipe LLM fallback
- 기타 건강 분석

토큰 수와 실제 청구 금액은 차이가 있을 수 있으므로 최종 비용은 OpenAI 사용량 또는 청구 기록과 대조합니다.

### 4.3 식단 품질 결과

- Schema 검증 실패 횟수
- 목표 열량 범위 실패 횟수
- 알레르기 검사 실패 횟수
- Food DB 후보 부족 횟수
- Backend 음식 목록 불일치 횟수
- 최종 저장 성공 횟수

## 5. 개인정보 및 보안 로그 정책

운영 로그에 다음 내용을 남기지 않습니다.

- 사용자 이름, 이메일, 전화번호
- 실제 건강검진 원문
- 전체 알레르기·기피 음식 목록
- OpenAI 프롬프트·응답 원문
- Bearer API Key 및 외부 API Key
- `.env` 내용

필요한 경우 알레르기 개수, 입력 음식 개수, 응답 item 개수처럼 집계값만 기록합니다.

## 6. 88건 회귀시험 요청

Backend 전환 배포 후 기존 88건 조건으로 다시 실행합니다.

### 전후 비교 항목

| 지표 | 기존 결과 | 전환 후 결과 |
|---|---:|---:|
| 전체 요청 | 88 | 확인 필요 |
| AI Server HTTP 200 | 88 | 확인 필요 |
| 열량 범위 탈락 | 10 | 확인 필요 |
| 형식 탈락 | 9 | 확인 필요 |
| 알레르기 탈락 | 4 | 확인 필요 |
| Backend 음식 목록 문제 | 65 | 확인 필요 |
| 최종 저장 성공 | 확인 필요 | 확인 필요 |

추가로 다음을 측정합니다.

- 엔드포인트별 호출 건수
- 평균, p95, 최대 응답 시간
- 전체 및 평균 토큰 사용량
- timeout과 재시도 횟수
- 7일 28끼 저장 완전성
- 한 끼 재추천 시 다른 27끼 보존 여부

## 7. 장애 판정 기준

다음 상태를 구분해 공유합니다.

| 상태 | 분류 |
|---|---|
| AI Server 연결 실패 또는 timeout | 인프라·네트워크 |
| AI Server 5xx | AI Server 또는 외부 의존성 |
| AI Server 200 후 Backend Schema 실패 | API 계약·Backend 매핑 |
| AI Server 200 후 음식 목록 실패 | Backend 카탈로그 매핑 |
| 후보 부족으로 명시적 오류 | 추천 조건·데이터 후보 부족 |
| OpenAI incomplete | 모델 출력 한도 또는 외부 모델 상태 |

HTTP 200만으로 식단 생성 성공으로 집계하지 않습니다. Backend 저장 완료까지 확인해야 최종 성공입니다.

## 8. 완료 조건

- [ ] 주간 식단 호출이 `/recommend/diet`로 확인된다.
- [ ] 한 끼 재추천 호출이 `/recommend/diet/replace-meal`로 확인된다.
- [ ] 식단 생성 목적의 `/chat` 호출이 0건이다.
- [ ] Backend와 AI Server 요청 시각 또는 request ID를 대조할 수 있다.
- [ ] 목적별 OpenAI 토큰 사용량을 확인할 수 있다.
- [ ] 운영 로그에 secret과 개인정보가 남지 않는다.
- [ ] 기존 88건 회귀시험 결과가 전후 비교표로 공유된다.
- [ ] AI 200 응답과 Backend 최종 저장 성공을 별도로 집계한다.

## 9. 결과 공유 형식

```text
배포 커밋 / 배포 시각:
Backend 호출 경로:
AI Server 응답 상태:
Backend 저장 결과:
88건 최종 성공 건수:
열량 / 형식 / 알레르기 탈락 건수:
음식 목록 불일치 건수:
평균 / p95 응답 시간:
input / output / reasoning / total tokens:
재시도 / timeout 건수:
남은 문제:
```

# 운동 AI 연결 작업

## 현재 코드 경로

앱은 기존 `POST /api/exercise/recommendations/generate`를 계속 호출한다. 백엔드는
`EXERCISE_AI_ENABLED=true`일 때 별도 AI 서버의 `POST /recommend/exercise`를 서버 간
Bearer 키로 호출한다. AI 응답은 카탈로그 해시, 운동 key, 모드, 장비, 시간, 강도를
검증한 뒤 기존 운동 추천 RPC로 저장한다. AI 호출이나 검증에 실패하면 저장하지 않고
오류를 반환한다. 시연용 `rules_v1`로 자동 대체하지 않는다.

AI 모델의 최대 3개 세션은 날짜별 계획으로 저장한다. 모델 응답에는 요일이 없어
생성일을 첫날로 하고 나머지는 7일 안에 균등한 간격으로 배치한다. 3개 세션이면
생성일·2일 뒤·4일 뒤다. 모바일은 각 세션의 운동 1~4개를 따로 보여주고 예정일이
되면 선택한 세션만 시작한다. 모든 세션을 마쳐야 추천 전체가 완료된다. 모델의
`weekly_frequency`와 실제 반환 세션 수가 달라도 실제 세션만 표시한다. 운동 key와
카탈로그 버전은 함께 저장해 결과의 출처를 추적한다.

현재 프런트가 수집하는 시간·장소·장비·한글 컨디션·불편 부위·컨디션 메모를
저장된 context에서 그대로 가져와 AI 서버에 전달한다. 건강 지표 원본 수치와
사용자 식별정보는 전달하지 않는다. 공용 GitHub의 현재 AI 요청 계약이 사용하는
`daily_condition`과 `has_discomfort`도 실제 입력값에서 변환해 함께 보낸다.
AI 출력이 선택한 장비와 맞지 않으면 추천 생성에 실패한다.

`EXERCISE_GIF_BASE_URL`에 CSV의 `relative_path`가 배포된 공개 HTTPS prefix를
설정하면 Backend가 `exercise_key`·운동 모드·프로필 성별로 primary GIF를 고른다.
객체가 `HEAD 200`으로 확인된 경우에만 응답에 `demo_gif_url`을 넣는다. 설정이
없거나 해당 성별의 객체가 없으면 `null`을 반환한다. 외장하드 경로는 반환하지 않는다.

## 활성화 순서

1. 별도 AI 서버에 [공용 GitHub `ai` 브랜치](https://github.com/Auto-Fit-Transfer/Auto-Fit/tree/2f9f9801dec72bed210102b57b1e9f239b475229)의 운동 API와 CSV 카탈로그가 배포됐는지 확인한다. 공개 `/openapi.json`에 `POST /recommend/exercise`가 있어야 한다.
2. `supabase/migrations/20261103072835_store_ai_exercise_recommendations.sql`과 `20261103072839_exercise_ai_weekly_sessions.sql`을 순서대로 적용한다. Auto-Fit 운영 프로젝트에는 2026-11-03에 두 버전이 이미 적용됐다. 기존 추천은 `generator=rules_v1`을 유지한다.
3. 카탈로그 CSV를 포함한 백엔드를 배포한다. 현재 CSV 해시는 `sha256:5e231250283742da2deee4e36da0308fb635409999ee8f6a29ff49274c5d97a1`이다. AI 서버의 `catalog_version`이 다르면 저장하지 않는다.
4. 백엔드 서버 전용 환경에 `AI_SERVER_BASE_URL`(별도 AI 서버의 HTTPS origin), `AI_SERVER_API_KEY`, `AI_SERVER_ENABLED=true`, `EXERCISE_AI_ENABLED=true`를 설정한다. GIF 객체를 공개 HTTPS에 업로드한 뒤 `EXERCISE_GIF_BASE_URL`도 설정한다. 앱 공용 API 주소 `https://211-233-206-193.sslip.io`는 AI 서버 주소가 아니다.
5. 날짜별 계획을 표시하는 모바일 앱을 배포한다. 합성 계정으로 생성 → 최신 조회 → 첫 세션 시작·완료 → 다음 예정일의 세션 시작을 확인한다. 응답 `generator`는 `auto-fit-ai`여야 한다.

## 남은 검증과 범위

- 로컬 PostgreSQL 호환 엔진에서 AI·기존 규칙 저장, 날짜별 세션 시작·항목 분리·완료·미래 날짜 제한을 확인했다. 운영 기준 `6439380` 위에 운동 변경만 다시 올린 Backend 브랜치의 테스트 882개, 모바일 단위 테스트 16개와 TypeScript 타입 검사가 통과했다. 운영 DB에서는 새 테이블의 RLS, 컬럼, 마이그레이션 기록을 확인했다. 운영 백엔드에서 규칙 기반 추천을 실제 생성한 검증은 아직 없다.
- 실제 AI 서버 주소와 인증 설정이 없어 라이브 생성·저장 시험은 아직 실행하지 못했다.
- GIF 자산의 공개 HTTPS 배포와 실제 AI 서버에 새 요청 Schema를 반영한 뒤
  라이브 계약을 확인해야 한다. AI 요청 계약은 원격 `ai` 브랜치에 있고,
  모바일 GIF 표시 코드는 별도 PR로 올라갔다. Backend 요청과 AI 입력 모델의
  네 가지 컨디션 값 교차 검사는 통과했다.
  반복 운동 제외, 세트·반복 처방,
  헬스 집중 부위·홈트 성향 입력은 별도 계약과 화면 작업이 필요하다.
- AI 응답에는 열량이 없어 운동 완료 화면의 열량은 0으로 집계된다. 운동 종류는
  CSV의 훈련 유형을 기존 `exercise_types`에 연결해 진행 분석에 반영한다.
- `EXERCISE_AI_ENABLED`의 기본값은 `false`다. 활성화 전에는 기존 규칙 추천이 계속 동작한다.

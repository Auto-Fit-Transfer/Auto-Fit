# 운동 AI 연결 작업

## 현재 코드 경로

앱은 기존 `POST /api/exercise/recommendations/generate`를 계속 호출한다. 백엔드는
별도 AI 서버의 `POST /recommend/exercise`를 서버 간 Bearer 키로 호출한다.
AI 응답은 카탈로그 해시, 운동 key, 모드, 장비, 시간, 강도를 검증한 뒤 기존 운동
추천 RPC로 저장한다. AI 설정·호출·검증에 실패하면 저장하지 않고 오류를 반환한다.
새 규칙 추천 생성 경로는 제거됐으며 `EXERCISE_AI_ENABLED`는 사용하지 않는다.
새 DB 마이그레이션은 비 AI 추천 삽입을 거부한다. 기존 `rules_v1` 기록은 그대로 읽고
진행 중 세션을 마칠 수 있다.
추천 생성은 유효한 입력과 AI 설정을 확인한 뒤 사용자별 공용 AI 답변 호출 제한을
차감한다. 제한 초과 시 AI 서버를 호출하지 않고 429를 반환한다.

운동 완료 분석 `GET /api/exercise/sessions/{session_id}/analysis`는 종료된 세션과 저장된
피드백을 조회한 뒤 AI 서버의 `POST /analyze/exercise-session`을 호출한다. 완료율·시간·
열량과 피드백 표시는 저장된 값을 사용하고, 요약·인사이트·다음 세션 제안·안전 문구만
AI 응답을 검증해 표시한다. 인증된 사용자의 세션만 조회하며 사용자 ID와 운동 로그 메모는
AI 서버에 보내지 않는다. 운동 중 불편 기록의 최신 30건에서 유형·강도·부위·조치를
전달하되 자유 텍스트 상세 내용은 제외한다. 불편 기록이 하나라도 있으면 AI 안전 문구를
필수로 검증한다. AI 장애나 잘못된
응답은 오류를 반환한다. 같은 세션 기록과 피드백의 분석 결과는 서버 전용 캐시에 보관해
다시 조회할 때 AI를 재호출하지 않는다. 기록이나 피드백이 바뀌면 새 분석을 생성하며,
새 생성은 기존 AI 답변 호출 제한을 사용한다. 모델·프롬프트·안전 규칙을 바꿀 때는
`backend/app/exercise_analysis_ai.py`의 `ANALYSIS_CACHE_VERSION`을 올려 기존 캐시를
무효화한다.

AI 모델의 최대 3개 세션은 날짜별 계획으로 저장한다. 모델 응답에는 요일이 없어
생성일을 첫날로 하고 나머지는 7일 안에 균등한 간격으로 배치한다. 3개 세션이면
생성일·2일 뒤·4일 뒤다. 모바일은 각 세션의 운동 1~4개를 따로 보여주고 예정일이
되면 선택한 세션만 시작한다. 모든 세션을 마쳐야 추천 전체가 완료된다. 모델의
`weekly_frequency`와 실제 반환 세션 수가 달라도 실제 세션만 표시한다. 운동 key와
카탈로그 버전은 함께 저장해 결과의 출처를 추적한다.

현재 프런트가 수집하는 시간·장소·장비·한글 컨디션·불편 부위·컨디션 메모는
저장된 context에서, 사용자가 직접 입력한 기타 운동 목표는 preferences에서 가져와
AI 서버에 전달한다. 건강 지표 원본 수치와
사용자 식별정보는 전달하지 않는다. 공용 GitHub의 현재 AI 요청 계약이 사용하는
`daily_condition`과 `has_discomfort`도 실제 입력값에서 변환해 함께 보낸다.
AI 출력이 선택한 장비와 맞지 않으면 추천 생성에 실패한다.

`EXERCISE_GIF_BASE_URL`에 CSV의 `relative_path`가 배포된 공개 HTTPS prefix를
설정하면 Backend가 `exercise_key`·운동 모드·프로필 성별로 primary GIF를 고른다.
객체가 `HEAD 200`으로 확인된 경우에만 응답에 `demo_gif_url`을 넣는다. 설정이
없거나 해당 성별의 객체가 없으면 `null`을 반환한다. 외장하드 경로는 반환하지 않는다.

## 활성화 순서

1. 별도 AI 서버에 운동 추천과 완료 분석 변경을 배포한다. 공개 `/openapi.json`에 `POST /recommend/exercise`와 `POST /analyze/exercise-session`이 있어야 한다. 서버 간 Bearer 인증과 OpenAI 설정을 확인한다.
2. 기존 운동 AI 저장 마이그레이션 2개 뒤에 `supabase/migrations/20261104055117_retire_rules_v1_exercise_recommendations.sql`과 `20261104060215_cache_exercise_ai_analysis.sql`을 순서대로 적용한다. 기존 `rules_v1` 행은 삭제하지 않는다.
3. 카탈로그 CSV를 포함한 백엔드를 배포한다. 현재 CSV 해시는 `sha256:5e231250283742da2deee4e36da0308fb635409999ee8f6a29ff49274c5d97a1`이다. AI 서버의 `catalog_version`이 다르면 저장하지 않는다.
4. 백엔드 서버 전용 환경에 `AI_SERVER_BASE_URL`(별도 AI 서버의 HTTPS origin), `AI_SERVER_API_KEY`, `AI_SERVER_ENABLED=true`를 설정한다. GIF 객체를 공개 HTTPS에 업로드한 뒤 `EXERCISE_GIF_BASE_URL`도 설정한다. 앱 공용 API 주소 `https://211-233-206-193.sslip.io`는 AI 서버 주소가 아니다.
5. 날짜별 계획을 표시하는 모바일 앱에서 합성 계정으로 생성 → 최신 조회 → 세션 시작·완료 → 피드백 저장 → AI 분석 조회를 검증한다. 추천과 분석의 `generator`는 모두 `auto-fit-ai`여야 한다.

## 남은 검증과 범위

- 로컬 PostgreSQL 호환 엔진에서 신규 비 AI 삽입 거부와 과거 규칙 추천 행의 상태 갱신을 확인했다. 새 AI 분석 API는 테스트 대역으로 검증했으며 실제 AI 호출과 배포 검증은 아직 필요하다.
- 운영 DB에 새 마이그레이션을 적용하고 AI 서버·백엔드 배포 버전을 확인해야 한다.
- GIF 자산의 공개 HTTPS 배포와 실제 AI 서버에 새 요청·분석 Schema를 반영한 뒤
  라이브 계약을 확인해야 한다. AI 서버 변경은 별도 작업 트리에 있고,
  모바일 GIF 표시 코드는 별도 PR로 올라갔다. Backend 요청과 AI 입력 모델의
  네 가지 컨디션 값 교차 검사는 통과했다.
  반복 운동 제외, 세트·반복 처방,
  헬스 집중 부위·홈트 성향 입력은 별도 계약과 화면 작업이 필요하다.
- AI 응답에는 열량이 없어 운동 완료 화면의 열량은 0으로 집계된다. 운동 종류는
  CSV의 훈련 유형을 기존 `exercise_types`에 연결해 진행 분석에 반영한다.
- `AI_SERVER_ENABLED=false`이면 새 운동 추천과 완료 분석은 503을 반환한다. 기존 기록 조회와 세션 진행은 가능하다.

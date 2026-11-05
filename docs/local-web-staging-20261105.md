# 정식 웹 UI 로컬 연동 확인 (2026-11-05)

## 범위와 결과

기존 GitHub `front-end` 브랜치 `ff3df41c484465bdb00a9f8cd5b92fa9babb9645`를 읽기 전용으로 복제해 Expo 웹으로 실행했다. `EXPO_PUBLIC_API_BASE_URL`은 로컬 API `http://127.0.0.1:18080`, Supabase URL과 publishable key는 로컬 Supabase CLI 상태에서 프로세스 환경 변수로만 전달했다. 운영 DB·운영 API·외부 AI로 연결하지 않았다. 기존 GitHub에는 푸시하지 않았다.

- 통합 백엔드 API의 1,048개 테스트가 통과했고, 로컬 Auth 일회용 계정을 생성·로그인·삭제하며 헬스, 인증 경계, 인증 후 9개 경로를 확인했다. `backend/scripts/local_staging_smoke.py`가 이를 재현한다.
- 정식 UI에서 이메일 로그인과 4단계 온보딩, 건강 자료 건너뛰기, 홈·식단·운동·커뮤니티·마이 탭을 확인했다. 새 계정의 빈 식단·운동·커뮤니티 상태가 오류 없이 표시됐다.
- 운동 설정에서 시간·장소·기구·컨디션을 선택하고 생성 요청까지 보냈다. 로컬 API는 `EXERCISE_AI_NOT_ENABLED`(HTTP 403)를 반환했다. 파일럿 허용 계정과 실제 AI 연결 설정이 없는 상태이므로 생성·세션 완료의 실연동 결과로 해석할 수 없다. 로컬 프런트엔드 패치 적용 후 입력 오류와 HTTP 403 안내가 웹 화면에 표시되는 것을 확인했다.
- 채팅의 `운동 기록 알려줘` 요청은 로컬 API를 통해 답변을 반환했다. 기록이 없는 새 계정에 `표시할 기록이 아직 없습니다.`가 표시됐다.
- 로컬 Auth의 가짜 테스트 계정에 `legacy/cancelled` 추천과 완료 세션 한 건을 만들어 정식 웹 운동 기록에서 `이전 추천 기록 · 참고용` 문구와 저장 버튼 숨김을 확인했다. 연결된 API는 `recommendation_generator=legacy`, `recommendation_status=cancelled`를 반환하고 루틴 저장은 HTTP 409로 거부했다. 해당 기록은 실제 사용자 기록이 아니다.
- 브라우저에서 수동 검토할 수 있도록 가짜 테스트 계정과 기록을 로컬 Auth/DB에 남겨 두었다. 실제 사용자 정보는 없으며, 웹 검토가 끝나면 삭제한다.
- 로컬 패치를 적용한 정식 프런트엔드 조회본의 `npm run typecheck`, `npm run lint`, `npm test`가 통과했다. 프런트엔드 테스트는 33개 모두 통과했다. 수정안은 `docs/patches/frontend-archive-ui-ff3df41.patch`에 있다.

## 외부 스테이징 전 남은 것

Auto-Fit용 별도 Supabase 스테이징 프로젝트나 브랜치가 확인되지 않았고, `deploy/stack`의 실제 환경 설정 파일 네 개도 없다. 실 HTTPS 주소 세 개와 DNS/TLS, Supabase 설정, OpenAI·CLOVA 키, API↔AI/OCR 토큰, RAG 원문·임베딩이 필요하다. 이 조건을 갖춘 격리된 환경에서 인증·추천·OCR·업로드·채팅·보관 기록을 다시 검증해야 한다.

이 로컬 웹 검증은 운영 전환 승인을 뜻하지 않는다.

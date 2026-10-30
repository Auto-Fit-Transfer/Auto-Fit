# 네이버 공용 API 담당자 전달 자료 (준비본, 2026-10-30)

**전달 시점:** 사용자 요청에 따라 전체 앱·API 작업과 백업 서버 검증이 끝난 후 전달한다. 이 문서는 담당자에게 아직 전송하지 않았다.

## 서버와 코드

| 대상 | 주소/코드 | 역할 |
|---|---|---|
| 네이버 공용 API | `https://211-233-206-193.sslip.io` | 앱의 기본 API. 담당자 배포 대상. |
| Render 백업 API | `https://auto-fit-api-dev.onrender.com` | 동일한 API 코드를 검증하고 장애 시 수동으로 사용할 백업. 자동 장애 전환은 없다. |
| 통합 API 소스 | GitHub `Auto-Fit-Transfer/Auto-Fit`, 브랜치 `codex/render-backup-api` | `backend/`, `supabase/migrations/`, `render.yaml`, 계약 문서 포함. |
| Supabase | 기존 프로젝트 | 두 API가 공유하는 Auth, DB, Storage. 스키마 적용 상태를 먼저 대조해야 한다. |
| 선택적 외부 서비스 | OCR, 식단·러닝 AI, 채팅 AI, 음식 이미지 | 기능별 환경변수로 연결한다. 미설정 시 해당 기능의 동작 또는 결과가 제한된다. |

Render 검증 결과 (2026-10-30): 커밋 `972e92fb6f2976e30bb5a7e2f0187edaeac67529`가 **Deploy succeeded · Live**로 확인됐다. `GET /health`는 HTTP 200, `{"status":"ok"}`를 반환했다. `GET /openapi.json`도 HTTP 200이며 132개 경로, 169개 동작, 160개 스키마로 로컬 문서와 일치했다. 인증이 필요한 기능의 실제 DB 호출과 iPhone 연동은 아직 검증하지 않았다.

## 요청·출력 계약

- [전체 API 목록과 각 동작의 요청·응답 형식](api-server-catalog-20261029.md): **132개 경로, 169개 HTTP 동작**. 메서드, 경로, 요청 본문 모델, 성공 상태, 출력 객체와 주요 필드를 정리했다.
- [OpenAPI JSON](api-server-openapi-20261029.json): 문서화된 모델의 필드 타입, 필수 여부, 중첩 구조, 검증 규칙을 포함한다. 서버에서 문서를 허용한 경우 `/openapi.json`으로도 확인할 수 있다.
- 인증: 앱의 대부분 `/api/*` 호출은 `Authorization: Bearer <Supabase access_token>`을 사용한다. 사진·문서 업로드만 `multipart/form-data`이며 나머지는 JSON이다.
- 오류: 현재 전 경로에 단일 오류 형식이 적용되지는 않았다. 일부는 `{"detail":{"code","message","fields"}}`, 나머지는 FastAPI 기본 `{"detail":...}`다. 배포하면서 임의로 바꾸지 않는다.
- 숨긴 운영 경로 `POST /internal/diet-refresh`는 `X-Cron-Token`이 필요하며 앱 호출용이 아니다. 테스트 경로 `POST /api/test/roundtrip`은 운영에서 비활성화한다.

## 담당자 배포 절차

1. 브랜치의 `backend/` 전체와 `backend/requirements.txt`를 한 버전으로 배포한다. 실행 명령은 `uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT --no-server-header`이며 저장소 루트에서 실행한다.
2. 기존 Supabase의 마이그레이션 이력과 `supabase/migrations/`를 대조한다. **이미 적용된 SQL을 재실행하지 않는다.** 특히 2026-10-29의 커뮤니티 상세·검색 2건과 마이페이지 관련 5건은 이전 작업에서 적용됐다고 기록되어 있으나, 담당자가 실제 이력을 확인해야 한다.
3. 기존 서버의 비밀값은 서버 측 환경변수로만 설정한다. 필수 연결값은 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`다. 호스트·CORS는 `BACKEND_ALLOWED_HOSTS`, `FRONTEND_ORIGIN`을 확인한다. 비밀키 값은 Git·문서·메신저에 넣지 않는다.
4. 선택 기능을 켤 때만 해당 서버 URL과 키를 준비한다: `HEALTH_DOCUMENT_OCR_URL`/`HEALTH_DOCUMENT_OCR_TOKEN`, `AI_SERVER_ENABLED`/`AI_SERVER_BASE_URL`/`AI_SERVER_API_KEY`, `CHAT_AI_ENABLED`/`CHAT_AI_URL`/`CHAT_AI_API_KEY`, `FOOD_IMAGE_ENABLED`/`FOOD_IMAGE_URL`/`FOOD_IMAGE_API_KEY`. 설정명과 기본값은 `render.yaml` 및 백엔드 코드를 확인한다.
5. 배포 후 `/health` 200과 `/openapi.json`의 경로 수를 확인하고, 인증 토큰으로 식단 레시피·운동 기록·커뮤니티·마이페이지 핵심 경로를 호출한다. Render 백업 서버와 동일한 요청에 대해 성공 상태, 필드, 오류 형식을 대조한다.

## 계약 공백과 완료 기준

- **78개 동작**은 OpenAPI에 구체적 응답 스키마가 없다. 목록에 코드에서 추출한 키 또는 화면 타입을 적었지만 완전한 타입 보증은 아니다. 특히 러닝 AI 결과는 외부 응답에 따라 일부 형태가 달라진다.
- 자세 분석 AI 모델은 아직 없다. 저장된 작업 조회 API는 있으나 영상 업로드·작업 생성 API는 없다. 분석이 완료되는 기능으로 안내하면 안 된다.
- Render에서 인증 실호출과 iPhone 앱 연동은 별도 확인한다. 네이버 서버는 담당자 확인 전 변경하지 않는다.

현재 통합 백엔드 테스트는 **819개 통과**했다. 이 결과는 실제 배포 서버와 DB의 동작을 대신하지 않는다.

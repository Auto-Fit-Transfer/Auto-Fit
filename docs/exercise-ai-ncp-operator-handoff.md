# 운동 AI·GIF NCP 작업 인계

작성일: 2026-11-03 (KST)

## 현재 확인된 상태

- Auto-Fit Supabase 프로젝트에는 운동 AI용 migration 두 개(`20261103072835`, `20261103072839`)가 적용돼 있다. 재적용하지 않는다.
- 운영 기준 `6439380` 위의 [운동 Backend 브랜치](https://github.com/Auto-Fit-Transfer/Auto-Fit/tree/codex/exercise-ai-on-6439380)를 사용한다. 기존 [Backend PR #7](https://github.com/Auto-Fit-Transfer/Auto-Fit/pull/7)은 오래된 `b72181c5` 기준이라 배포 소스로 사용하지 않는다. [모바일 PR #6](https://github.com/Auto-Fit-Transfer/Auto-Fit/pull/6)과 [AI 후보 정합성 PR #8](https://github.com/Auto-Fit-Transfer/Auto-Fit/pull/8)은 아직 병합되지 않았다.
- 앱에서 사용할 수 있는 기본 GIF는 CSV의 `is_primary_asset=true` 및 `mapping_status=auto_mapped`인 **6,369개, 20.45 GiB**다. 외장하드 전체 기본 GIF 7,027개 중 나머지 658개는 `needs_review`로, 현재 Backend 카탈로그에서 제외된다.
- 현재 작업 환경에는 NCP 콘솔 로그인과 Object Storage API 키가 없다. 서버용 AI 주소·키도 확인되지 않았다. 업로드와 운영 설정은 담당자가 실행한다.
- 운영 기준 `6439380`에서 새 운동 Backend 브랜치로 옮긴 뒤 `python -m pytest -q backend/tests` **882개 통과**. OpenAPI에 `/api/community/search`, `/api/community/activity`, `/api/community/bookmarks`, `/api/community/mileage/monthly`, `/api/notifications/preferences`, `/api/diet/meals/{diet_meal_id}/recipe`가 남아 있다.

## 담당자 작업 1: GIF 저장소

1. GIF 사용권이 앱 사용자에게 공개 URL로 파일을 전송하는 방식을 허용하는지 확인한다.
2. NCP Object Storage에 운동 GIF 전용 버킷을 만든다. 기존 서비스용 버킷을 재사용하지 않는다. 한국 리전 엔드포인트는 `https://kr.object.ncloudstorage.com`이다.
3. 버킷 범위로 제한된 API 인증키를 안전한 작업 환경에 설정한다. 키 값은 Git, 문서, 채팅, 로그에 넣지 않는다. 로컬 또는 서버의 별도 Python 가상환경에 `boto3`를 설치한다.
4. 외장하드가 연결된 환경에서 아래 사전 검증을 실행한다. 결과는 **6,369개, 20.45 GiB**여야 한다.

   ```bash
   python -m backend.scripts.upload_exercise_gifs_ncp \
     --asset-root /Volumes/another/GIFS
   ```

5. 아래 환경변수와 기존 버킷 이름을 설정한 뒤 업로드한다. 도구는 카탈로그 경로를 객체 키로 사용하고, `image/gif`, `public-read` ACL을 지정한다. 재실행 시 SHA-256이 같은 객체는 재사용하고, 다른 객체를 덮어쓰지 않는다. 끝나면 **모든 공개 HTTPS URL의 HEAD 200과 크기**를 확인한다.

   ```bash
   # NCP_ACCESS_KEY_ID, NCP_SECRET_ACCESS_KEY는 안전한 방법으로 환경에 주입한다.
   python -m backend.scripts.upload_exercise_gifs_ncp \
     --asset-root /Volumes/another/GIFS \
     --bucket "$NCP_EXERCISE_GIF_BUCKET" --upload
   ```

6. 출력된 `EXERCISE_GIF_BASE_URL`을 기록한다. 버킷 이름과 공개 URL만 공유하고 인증키는 공유하지 않는다. 서버에서 표본 GIF URL의 `HEAD 200`과 `Content-Type: image/gif`를 확인한다. 트래픽이 늘면 NCP CDN 경유 URL로 바꿀 수 있다. 이때 CSV 상대 경로가 그대로 연결돼야 한다.

NCP 공식 문서: [Boto3 엔드포인트·업로드](https://guide.ncloud-docs.com/docs/storage-storage-8-2), [객체 공개 ACL](https://guide.ncloud-docs.com/docs/objectstorage-troubleshoot-common).

## 담당자 작업 2: AI·Backend 배포

1. 실제 AI 서버의 HTTPS origin과 서버 간 Bearer 키를 확인한다. 공용 Backend API `https://211-233-206-193.sslip.io`는 AI 서버 주소가 아니다.
2. AI 서버에 `POST /recommend/exercise`, CSV 카탈로그, [PR #8](https://github.com/Auto-Fit-Transfer/Auto-Fit/pull/8)의 장비 필터 수정이 반영됐는지 확인한다. 공개 `/openapi.json`에서 경로를 확인하고, 서버 응답의 `catalog_version`이 `sha256:5e231250283742da2deee4e36da0308fb635409999ee8f6a29ff49274c5d97a1`인지 점검한다.
3. 현재 NCP Backend가 실제로 사용하는 소스 브랜치·커밋·배포 방식을 먼저 확인한다. `6439380`을 부모로 한 [새 운동 Backend 브랜치](https://github.com/Auto-Fit-Transfer/Auto-Fit/tree/codex/exercise-ai-on-6439380)의 변경만 해당 배포 소스에 반영한다. 오래된 PR #7이나 `backend` 브랜치를 배포하지 않는다. DB migration은 이미 적용됐으므로 다시 실행하지 않는다.
4. 배포 직후에는 `EXERCISE_AI_ENABLED=false`를 유지한다. `/health`, OpenAPI, 기존 규칙 기반 운동 추천, 기존 식단·인증 API를 확인한다. GIF 기본 URL과 `AI_SERVER_BASE_URL`, `AI_SERVER_API_KEY`, `AI_SERVER_ENABLED`를 서버 전용 환경에만 넣는다.
5. 합성 테스트 계정으로 AI 서버의 운동 응답을 확인한 후 `EXERCISE_AI_ENABLED=true`로 전환한다. 추천 생성 → 날짜별 세션 조회 → 첫 세션 시작·완료 → 다음 예정일 제한 → GIF URL 응답과 앱 표시를 확인한다. 응답의 `generator`는 `auto-fit-ai`여야 한다. 실패 시 `EXERCISE_AI_ENABLED=false`로 되돌리고 기존 규칙 추천을 확인한다.
6. [모바일 PR #6](https://github.com/Auto-Fit-Transfer/Auto-Fit/pull/6)은 다음 앱 빌드에 포함한다. GIF URL이 없을 때 기존 썸네일 표시가 유지되는지 실기기에서 확인한다.

## 공개 경로 보안 확인

- 운영 Backend의 `/docs`, `/redoc`, `/openapi.json`은 공개 상태다. `API_DOCS_ENABLED`의 코드 기본값은 `true`다. 운영 환경에서 문서가 불필요하면 `API_DOCS_ENABLED=false`로 설정하고 세 경로가 404인지 확인한다.
- AI 서버의 `/ai/body-analysis`는 현재 앱 내부에 Bearer 인증이 없다. Caddy의 외부 404만으로 내부·우회 경로가 보호되지는 않는다. AI 서버를 직접 노출하거나 Caddy 경로를 열기 전에 앱 레벨 인증을 적용하고 무인증 요청이 거부되는지 확인한다.

## 담당자가 전달할 결과

- NCP 버킷 이름·공개 base URL, 업로드 및 공개 HEAD 검증 개수
- AI 서버 URL의 호스트명, 배포된 AI·Backend 커밋, 기능 플래그 상태 (인증키 값 제외)
- 합성 계정 생성·저장·세션·GIF 표시 결과, 장애 시 되돌린 상태

Backend 연동 상세는 [운동 AI 연결 문서](exercise-ai-integration.md)를 참조한다.

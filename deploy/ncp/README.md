# NCP FastAPI 개발 서버 이전

이 구성은 Render의 `auto-fit-api-dev` 웹 서비스만 NCP VPC 서버로 옮긴다. Supabase Auth, DB, Storage와 별도 AI/OCR 서버는 계속 사용한다. 기존 Render 서비스는 새 주소의 기능 검증이 끝날 때까지 유지한다.

## 시작 전에 확정할 값

- 배포할 소스 버전: [2026-11-04 통합 배포 기록](../../docs/branch-consolidation-20261104.md)의 검증 브랜치와 신규 마이그레이션 세 개와 단계별 적용 순서를 사용한다. 서버의 기존 환경과 AI 허용목록을 보존한다.
- NCP 계정과 VPC 서버 접속 권한, 공인 IP, API용 도메인(예: `api.example.com`).
- 프론트엔드 Origin과 현재 Render에 설정된 환경변수의 **이름 및 필요한 값**. 실제 비밀키는 문서·Git·채팅에 기록하지 않는다.
- NCP 서버에서 Supabase, AI/OCR 서버로 나가는 HTTPS 통신이 가능한지 확인한다.

## NCP 인프라

1. VPC의 공인 서브넷에 Linux 서버를 생성하고 공인 IP를 할당한다. 서버·공인 IP·트래픽 비용을 확인한다.
2. ACG 인바운드는 `80/tcp`, `443/tcp`를 서비스용으로, `22/tcp`는 관리자 IP로만 연다. 아웃바운드는 DNS, 인증서 발급, Supabase, AI/OCR 호출을 허용한다. 컨테이너의 API 포트 `8000`은 외부에 열지 않는다.
3. API 도메인의 DNS A 레코드를 공인 IP로 연결한다. DNS가 전파된 뒤 HTTPS 인증서 발급을 진행한다.
4. 서버 OS에 [Docker Engine 및 Compose plugin](https://docs.docker.com/engine/install/ubuntu/)을 설치한다. 이 배포 구성은 Compose가 필요하다.

NCP 공식 절차: [Server](https://guide.ncloud-docs.com/docs/server-procedure), [Public IP](https://guide.ncloud-docs.com/docs/server-publicip-vpc), [ACG](https://guide.ncloud-docs.com/docs/server-acg-vpc). Caddy는 도메인과 외부 80/443 포트가 준비되면 [HTTPS 인증서를 자동 관리](https://caddyserver.com/docs/quick-starts/https)한다.

## 서버에서 배포

검토한 소스를 서버의 작업 디렉터리로 전달한다. `backend/.env`, `backend/.env.save`, `deploy/ncp/api.env`는 Git이나 이미지에 넣지 않는다. 다음 명령은 저장소 루트에서 실행한다.

```bash
cd deploy/ncp
cp .env.example .env
cp api.env.example api.env
chmod 600 .env api.env
```

`.env`의 `API_DOMAIN`을 실제 API 도메인으로 바꾼다. `api.env`에는 Render에서 사용 중인 서버 환경변수를 필요한 범위로 옮긴다. 특히 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_ORIGIN`, `DIET_REFRESH_CRON_TOKEN`을 확인한다. AI/OCR 기능을 사용한다면 해당 URL·키·활성화 플래그도 동일하게 설정한다. `BACKEND_ALLOWED_HOSTS`는 Compose가 `API_DOMAIN`을 이용해 설정한다.

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS "https://$(sed -n 's/^API_DOMAIN=//p' .env)/health"
```

`/health`는 FastAPI 실행 상태만 확인한다. 같은 Supabase 테스트 계정으로 로그인한 뒤 인증된 프로필 조회, 식단 조회, 파일 업로드·조회, AI/OCR 연결을 별도로 확인한다. 서버 로그는 `docker compose logs --tail=100 api caddy`로 본다. 로그를 공유할 때 토큰과 개인 자료는 제거한다.

## 주소 전환과 복구

1. 새 HTTPS 주소에서 기능과 CORS를 확인한다. `FRONTEND_ORIGIN`은 실제 프론트엔드 주소와 정확히 일치해야 한다.
2. 프론트엔드의 API 기본 주소를 새 주소로 바꾼다. 이 저장소의 테스트 화면에는 Render 주소가 `g.html`, `diet-ui-test.html`, `account-deletion-ui.js`에 고정되어 있다. 새 도메인이 확정되면 이 세 곳을 함께 수정한다. 일부 배포 연동 테스트에도 Render 허용 목록이 있으므로 새 주소로 검증하려면 별도 갱신이 필요하다.
3. GitHub 저장소 변수 `API_BASE_URL`에 `https://새-API-도메인`을 설정한다. 그러면 매일 KST 자정에 실행되는 `daily-diet-refresh.yml`이 새 서버를 호출한다. 변수 설정 전에는 기존 Render 주소를 호출한다. GitHub Secret `DIET_REFRESH_CRON_TOKEN`은 NCP `api.env` 값과 일치해야 한다.
4. `workflow_dispatch`로 식단 갱신을 검증할 때는 실제 사용자 데이터가 변경될 수 있으므로 대상 Supabase와 실행 시점을 확인한다.
5. 전환 중 문제가 생기면 프론트엔드 주소와 `API_BASE_URL`을 Render 주소로 돌린다. Render 서비스는 검증이 끝날 때까지 종료하지 않는다.

서버가 재시작되면 Compose 서비스는 `restart: unless-stopped`로 다시 실행된다. 재배포는 검토한 소스를 서버에 반영한 뒤 `docker compose up -d --build`를 다시 실행한다.

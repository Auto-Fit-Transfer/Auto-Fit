# 계정 삭제 API 배포·실연동 검증

2026-09-17 개발 서버에 `DELETE /api/account`를 배포했다. 현재 사용자의 영구
탈퇴 요청은 사용자 파일을 Storage API로 먼저 삭제하고, Auth 삭제 시 DB
트리거가 직접·간접 사용자 자료를 정리한다. 파일 정리 실패 시 성공 응답을
반환하지 않고 삭제 중 상태와 계정을 유지해 재시도할 수 있다.

- 서버: https://auto-fit-api-dev.onrender.com
- 배포 커밋: [55b3df1](https://github.com/gahya9904/Auto-Fit/commit/55b3df1a095f6a5f19a840455b4841a904800fe9)
- Render: [배포 성공 기록](https://dashboard.render.com/web/srv-dafmuen40ujc73c0ermg/deploys/dep-dalm6s6k1f9s738nkm0g)
- 배포 방식: 검증한 커밋을 지정한 수동 배포, 52.1초
- Supabase 프로젝트: `eeeqibyssajykrhvecbv`

DB 무결성 및 계정 정리 트리거·RPC는 해당 프로젝트에 별도 적용되어 있다.
API 서버 배포는 DB 마이그레이션을 자동 실행하지 않는다. 물리 FK는 추가하지 않았다.
공용 기준 자료와 다른 사용자의 자료는 계정 삭제 대상에 포함하지 않는다.

검증 결과:

| 항목 | 결과 |
| --- | --- |
| 작업 공간 백엔드 전체 테스트 | 428개 통과 |
| backend/app Bandit 검사 | 통과 |
| API 커밋 GitHub 상태 검사 | 2/2 성공 |
| 배포 OpenAPI | DELETE /api/account 존재, Profile 그룹 |
| 배포 상태·미인증 삭제 | /health 200, DELETE /api/account 401 |
| 배포 API + 실제 Supabase + 실제 Storage | 20개 검사 통과 |
| 테스트 계정·파일·정리 대기 상태 | 모두 0건 |
| 기존 활성 Auth·프로필·알림 설정 | 각각 10건 |
| public 물리 FK | 0개 |

이번 실행에서만 만든 합성 계정 하나로 실제 비밀번호 로그인 후 배포된
HTTPS 탈퇴 API를 호출했다. 내용 있는 프로필, 알림 설정, 채팅·메시지,
upload_files·OCR, health-documents의 PDF 및 meal-photos의 PNG를 준비했다.
탈퇴는 204를 반환했고 모든 테스트 DB 행과 실제 파일이 제거됐다.
삭제된 계정의 기존 토큰으로 /api/profile 호출 시 401, 관리자 계정 조회 시
404를 확인했다. 기존 사용자 자료는 테스트 대상으로 사용하지 않았다.

이 결과는 백엔드 API 검증이다. 프론트엔드 회원탈퇴 버튼 연결·화면 검증은
이번 배포 범위에 포함하지 않는다. 사용자 자료 백업이나 환경 파일은 배포
커밋에 포함하지 않았다.

재실행은 테스트 계정·파일을 생성한 뒤 삭제하므로 대상 프로젝트를 확인한다:

```bash
backend/.venv/bin/python -m backend.tests.account_deletion_live \
  --api-base https://auto-fit-api-dev.onrender.com
```

api-base 생략 시 로컬 ASGI 경로와 실제 Supabase를 연결한다. 원격 API 대상은
위 개발 서버만 허용하며 키·비밀번호·토큰·개인 경로·응답 본문을 출력하지 않는다.

## 테스트 화면 연결 검증

`g.html`과 `diet-ui-test.html`에 회원탈퇴 확인 창과 현재 로그인 계정의
DELETE /api/account 호출을 연결했다. 확인 전 취소, 처리 중 중복 요청 차단,
실패 후 재시도, 성공 후 세션·화면 자료 정리를 적용했다. 삭제 결과가 불명확하면
자료 입력 화면을 잠그고 재시도를 안내한다.

Playwright에서 두 화면의 키보드 초점, 취소, 중복 요청, 502 후 재시도,
로그아웃 및 320·768·1024·1440px 확인 창을 검증했다. 별도 시나리오로
401, 연결 실패, 토큰 없음, 서버 삭제 성공 후 로컬 정리 실패 안내도 통과했다.
모든 브라우저 요청은 합성 응답으로 대체해 실제 계정을 삭제하지 않았다.

```bash
backend/.venv/bin/python /Users/gimhyeonho/.codex/skills/webapp-testing/scripts/with_server.py \
  --server 'backend/.venv/bin/python -m http.server 3000 --bind 127.0.0.1' \
  --port 3000 -- backend/.venv/bin/python -m backend.tests.account_deletion_ui_check
```

이 변경은 저장소의 테스트 HTML 화면에 적용한 로컬 변경이며, 실제 앱 화면의
수정·배포 결과는 아니다. 실제 앱 프론트엔드 저장소는 아직 확인되지 않았다.

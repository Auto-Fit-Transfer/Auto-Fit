# 로컬 웹 서비스 미리보기

통합 백엔드를 검토하기 위한 임시 웹 화면이다. 정식 `front-end` 브랜치 `d06a63b`(2026-11-05)의 홈·식단·운동·커뮤니티·마이 구조, 디자인 토큰, Pretendard 폰트와 하단 탭 SVG를 참고했다. 프로젝트 `AGENTS.md`에 적힌 인수 시점 기준 `f499b9c`보다 원격 `front-end`가 6커밋 앞선 것을 읽기 전용 비교로 확인했다. 왼쪽은 **예시 데이터**로 만든 화면이다. 정식 앱의 로그인, 쓰기, 실시간 추천은 이 화면에서 수행하지 않는다.

오른쪽 검증 버튼은 통합본의 로컬 코드·테스트·DB에 실제로 실행한다. 기존 GitHub에는 푸시하지 않고 운영 DB에도 쓰지 않는다.

## 실행

저장소 루트에서 실행한다. Docker, Node.js와 Supabase CLI가 필요하다. 처음 실행할 때 PGlite 테스트 의존성을 설치한다.

```sh
supabase start --exclude studio
npm install --prefix demo/sql-tests

docker build -t auto-fit-integrated-api:verify -f backend/Dockerfile backend
docker build -t auto-fit-integrated-api-tests:verify -f demo/Dockerfile.api-tests .
docker build -t auto-fit-integrated-ai:verify -f ai_service/Dockerfile ai_service
docker build -t auto-fit-integrated-ai-tests:verify -f demo/Dockerfile.ai-tests ai_service
docker build -t auto-fit-integrated-ocr:verify -f ocr_service/Dockerfile ocr_service
docker build -t auto-fit-integrated-ocr-tests:verify -f demo/Dockerfile.ocr-tests .

python3 demo/server.py --port 8765
```

브라우저에서 `http://127.0.0.1:8765/`를 연다. 서버는 루프백 주소에만 바인딩한다.

## 화면과 검증 범위

하단 다섯 탭은 정식 서비스의 대표 화면을 둘러볼 수 있게 한다. 홈에서 식단·운동으로 이동하고, 식사 카드를 펼치고, 운동 기록과 커뮤니티 피드를 전환할 수 있다. 각 탭의 `이 영역 검사`는 해당 API 도메인의 기존 테스트를 실행한다.

`전체 검증 실행`은 API 전체, AI 비실서비스 테스트, OCR 서버 테스트, 식단·채팅·커뮤니티·건강·운동의 격리 SQL 14종, 운동 기록 보관 SQL, 기존 데이터 업그레이드 SQL, Compose 정적 설정 검사를 순서대로 실행한다. API·AI·OCR 버튼은 매번 현재 작업 트리에서 테스트 이미지를 다시 빌드한 뒤 실행한다. Docker 캐시가 있으면 재빌드는 빠르지만 첫 실행에는 몇 분이 걸릴 수 있다. 격리 SQL은 인메모리 PGlite에서 실행하고, 보관·업그레이드 SQL은 트랜잭션을 되돌려 로컬 DB에 테스트 행을 남기지 않는다. DB 상태의 `85 / 85`는 이미 적용된 로컬 마이그레이션 수이며 버튼 클릭마다 빈 DB를 재생한다는 뜻은 아니다. 각 단계의 성공·실패와 테스트 출력을 화면에서 확인할 수 있다.

API 회귀 테스트는 가짜 의존성을 사용한다. OpenAI·CLOVA·지도 API 실호출, 실제 회원 로그인, 실제 문서 판독, DNS·TLS 기반 서비스 간 연결은 운영용 설정과 권한이 필요하다. 화면의 `모두 통과`는 이 외부 항목까지 검증했다는 의미가 아니다. 정식 프런트엔드 코드는 변경하지 않았으므로 보관 상태 안내와 저장 버튼 비활성화는 전환 후 의도한 동작을 설명하는 예시다.

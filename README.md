# Auto-Fit 백엔드 통합본

GitHub의 43개 브랜치 끝 커밋과 로컬 백엔드 작업을 대조해 만든 **단일 기준 소스**입니다. API, AI, OCR은 의존성과 장애 범위가 달라 각각 독립 프로세스로 실행하며, `deploy/stack/compose.yaml`이 세 서비스를 하나의 배포 단위로 연결합니다. 이 폴더에는 프론트엔드와 조사용 브랜치 스냅샷이 없습니다.

| 경로 | 역할 |
| --- | --- |
| `backend/` | FastAPI API, 비즈니스 로직, 테스트, 운동 자산 |
| `ai_service/` | AI FastAPI 서비스, 계약 문서·테스트, 운동 자산 |
| `ocr_service/` | 건강 문서 OCR FastAPI 서비스와 테스트 |
| `supabase/` | 데이터베이스 마이그레이션과 로컬 개발 설정 |
| `deploy/stack/` | API·AI·OCR·Caddy Compose, 설정 예시와 사전 점검 |
| `.github/workflows/` | 검증 CI와 기본 비활성화된 일일 식단 갱신 |
| `docs/` | API 계약과 브랜치 통합 근거 |
| `demo/` | 과거 운동 추천 아카이브를 직접 확인하는 로컬 웹 검증 화면 |

## 시작하기

각 서비스의 `requirements.txt` 또는 `requirements-server.txt`를 해당 Python 환경에 설치해 테스트할 수 있습니다. API는 Python 3.14, AI와 OCR은 Python 3.12를 기준으로 합니다.

```sh
python -m pip install -r backend/requirements.txt pytest
PYTHONPATH=. python -m pytest -q backend/tests
```

AI는 `ai_service/`에서 `python -m pip install -r requirements.txt pytest pytest-asyncio` 후 `python -m pytest -q -m "not live"`로, OCR은 `ocr_service/`에서 `python -m pip install -r requirements-server.txt pytest httpx` 후 `python -m pytest -q tests`로 검사합니다. 현재 API 계약은 `docs/api-openapi.json`, AI 계약은 `ai_service/docs/ai-openapi.json`에 있습니다.

운영 설정과 기동 순서는 [통합 스택 안내](deploy/stack/README.md)를 따릅니다. 실제 `.env` 파일과 키는 커밋 대상에서 제외했습니다. Supabase 마이그레이션은 Compose가 적용하지 않으며, 대상 데이터베이스의 이력을 확인한 후 별도로 적용해야 합니다.

## 통합 범위

API는 `codex/backend-consolidation-20261104` (`8d3b70fb`), AI는 `ai` (`a5acc729`), OCR은 `ocr` (`d26fd502`)를 기준으로 삼았습니다. 다른 브랜치에서 필요한 식품명 응답 검증, 알레르기 오류의 안전한 진단 코드, AI 체성분 분석 인증을 이식했습니다. 로컬 `supabase/config.toml`의 인증 리디렉션 설정도 포함했습니다. 나머지 기능은 기준본과 대조해 이미 포함됐거나 더 오래된 구현으로 판단했습니다. 각 브랜치의 선택 근거는 [브랜치 통합 기록](docs/branch-consolidation.md)에 있습니다.

이 로컬 통합본은 공용 GitHub의 새 `back-end` 브랜치에 게시했습니다. 이 로컬 저장소에는 원격 저장소를 설정하지 않았습니다. 기존 `backend`와 정식 `front-end`는 유지했고, 나머지 브랜치는 앱 테스트의 남은 문제를 해결한 뒤 정리합니다. 운영 DB는 변경하지 않았습니다. 로컬 iOS 검증 결과는 [`docs/local-ios-staging-20261105.md`](docs/local-ios-staging-20261105.md)에 있습니다.

## 검증 범위

2026-11-05 로컬에서 API 테스트 1,048개, AI 비실서비스 테스트 177개(실서비스 4개 제외), OCR 테스트 4개와 Compose 정적 설정 검사를 통과했습니다. API·AI·OCR Docker 이미지를 모두 빌드했고, API·AI 컨테이너의 `/health`가 정상 응답했습니다. 로컬 Supabase에서 마이그레이션 85개를 처음부터 적용하고 핵심 테이블·트리거·RPC를 확인했습니다. 이전 규칙형 운동 추천은 새 추천이나 세션 실행에 쓰이지 않으며, 기존 기록은 조회용으로 보존됩니다. [로컬 웹 검증 화면](demo/README.md)에서 전환 SQL과 API 우회 차단 테스트를 직접 재실행할 수 있습니다. 공급자 키가 없는 OCR 컨테이너는 예상대로 `misconfigured`를 반환했습니다. 운영 DB에는 다섯 개의 마이그레이션이 남아 있으며, DNS·TLS·실제 공급자 연동은 아직 검증해야 합니다. 자세한 전환 조건은 [전환 준비 기록](docs/cutover-readiness-20261105.md)에 있습니다. RAG 원문·임베딩은 소스 저장소에 포함되지 않아 필요한 환경에서 별도로 적재해야 합니다. ChromaDB의 내장 사용에 대한 한정된 취약점 예외는 [보안 예외 기록](docs/security-exceptions.md)에 있습니다. 공용 GitHub `back-end` 푸시 후 CI 결과를 통합 기준으로 확인하세요.

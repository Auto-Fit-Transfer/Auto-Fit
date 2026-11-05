# 보안 검사 예외 — 2026-11-05

`pip-audit`는 현재 AI 의존성으로 설치되는 ChromaDB 1.5.9에서 `PYSEC-2026-311`, `PYSEC-2026-3813`, `PYSEC-2026-3814`, `PYSEC-2026-3815`를 보고합니다(첫 번째 항목은 두 번 표시될 수 있습니다). 아직 이 검사에서 제시되는 수정 버전은 없습니다. CI는 **이 네 ID만** 무시하고 나머지 AI 의존성은 계속 검사합니다.

예외 판단의 범위는 현재 저장소의 실행 방식입니다. AI 서비스는 `app/rag/vector_store.py`에서 로컬 파일을 사용하는 `chromadb.PersistentClient`만 만들며, Chroma HTTP 서버나 `HttpClient`를 실행하지 않습니다. Compose 역시 Chroma 포트를 노출하지 않습니다. 위 권고문의 공격 경로는 Chroma HTTP 서버의 컬렉션 생성·수정 API 또는 서버의 테넌트 권한 검사입니다. 따라서 현재 배포 구성에서는 그 경로에 접근할 수 없다고 판단했습니다. 이는 **패키지 전체가 안전하다는 주장이나 취약점이 수정됐다는 뜻이 아닙니다.**

- [사전 인증 컬렉션 생성 코드 실행 권고](https://osv.dev/vulnerability/PYSEC-2026-311)
- [테넌트 간 권한 검사 권고](https://osv.dev/vulnerability/PYSEC-2026-3813)
- [컬렉션 수정 코드 실행 권고](https://osv.dev/vulnerability/PYSEC-2026-3814)
- [RBAC 테넌트 범위 권고](https://osv.dev/vulnerability/PYSEC-2026-3815)

Chroma 서버, 원격 클라이언트, 다중 테넌트 컬렉션을 도입할 경우 이 예외를 즉시 제거하고 패치 버전으로 올린 뒤 재검증해야 합니다. 수정된 ChromaDB가 공개되면 버전을 올리고 네 가지 `--ignore-vuln` 옵션을 삭제하세요. `ai_service/data/chroma/`는 런타임 DB이므로 Git과 Docker 빌드 컨텍스트에서 제외합니다.

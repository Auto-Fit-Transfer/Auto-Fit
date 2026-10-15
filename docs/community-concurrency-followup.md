# 적용 후 동시성 검증과 보완안

2026-10-14. 기본 SQL `1a0ed31`은 원격 `20261014062855_community_feed`로 적용되어 있다.
기존 파일은 내용 변경 없이 실제 버전에 맞춰 이름을 바꿨다. 새 보완 마이그레이션
`20261014064332_community_comment_delete_lock_order.sql`은 **로컬 검증 완료, 공용 DB 미적용**이다.

## 발견한 문제

댓글 삭제와 글쓴이 회원 탈퇴가 동시에 실행되면 `community_delete_comment`가
PostgreSQL `40P01`(deadlock_detected)로 실패할 수 있다. 독립된 PostgreSQL 17.6 연결에서 두 번 재현했다.

1. 탈퇴 연결이 글쓴이 `auth.users` 행을 잠근다.
2. 댓글 삭제 연결이 댓글을 잠그고 삭제한 뒤, 집계 보정을 위해 글쓴이 `auth.users` 잠금을 기다린다.
3. 탈퇴 연결의 기존 cascade가 같은 댓글을 삭제하려고 기다리면서 순환 대기가 된다.

PostgreSQL이 한 트랜잭션을 취소하므로 이 재현에서 부분 삭제를 의미하지는 않는다.
다만 사용자 요청 실패와 재시도가 생기므로 커뮤니티 서버 배포 전에 보완해야 한다.

## 보완 내용

`community_delete_comment` 한 함수만 `CREATE OR REPLACE`한다.

- 권한을 먼저 검사하고, 관련 사용자 잠금 → 글 잠금 → 댓글 잠금 순서로 진행한다.
- 탈퇴 중인 관련 사용자가 있으면 기존 API 오류 코드로 거부한다.
- 잠금을 기다린 뒤 댓글 존재 여부를 다시 검사해 중복 삭제 시 집계가 두 번 감소하지 않도록 한다.
- SECURITY INVOKER, 빈 search_path, 함수 소유자와 기존 실행 권한을 유지한다.

원본 적용 파일을 수정하거나 다시 실행하지 않는다. 새 보완 파일 하나만 별도 검토·적용한다.

## 검증

| 검증 | 결과 |
| --- | --- |
| 좋아요 먼저, 탈퇴 나중 | 통과 |
| 탈퇴 먼저, 좋아요 나중 | 통과, 사라진 글 오류 반환 |
| 글쓴이 Auth 잠금 후 댓글 삭제와 탈퇴 중첩 | 원본 40P01 재현 → 보완 후 정상 탈퇴 및 댓글 조회 불가 오류 |
| 같은 댓글을 두 연결에서 삭제 | 통과, 집계 한 번만 감소 |
| 댓글 삭제 먼저, 글쓴이 탈퇴 나중 | 통과 |
| 교차 좋아요·댓글·공유를 가진 두 계정 동시 탈퇴 | 통과 |
| PGlite 피드 | 43개 통과 |
| PGlite 기존 탈퇴 연동 | 36개 통과 (검토 때 탈퇴 중 댓글 삭제 거절 3개 추가 → 39개) |
| FastAPI 커뮤니티·계정 탈퇴 | 48개 통과 |

동시성 테스트는 네트워크를 차단한 일회용 Docker PostgreSQL 17.6 컨테이너에서,
저장소 마이그레이션 전체와 공유받은 0917 SQL 5개를 함께 로드해 실행했다.
Auth/Storage는 기존 테스트와 같은 최소 테이블 스텁이고 실제 Storage API는 호출하지 않는다.
여섯 개의 통제된 실행 순서를 확인한 것이며 가능한 모든 동시 실행을 증명하는 테스트는 아니다.

피드 테스트는 임의 대기 시간을 제거하고 fixture 시각을 직접 제어한다.
동일 시각의 댓글은 UUID 오름차순, 피드는 UUID 내림차순이며 페이지 경계에서도 누락·중복이 없는지 확인한다.

## 재현

`backend/tests/community_concurrency.py`는 `autofit-community-check-20261014`라는 격리 컨테이너만 받는다.
원격 접속 옵션이 없으며 실행 전 빈 PostgreSQL에 기존 `support/autofit_schema.mjs` 로더의 SQL을 로드해야 한다.
컨테이너의 `/tmp` Unix socket과 `postgres` DB를 사용한다. 운영 DB에서 실행하지 않는다.

```bash
python3 backend/tests/community_concurrency.py
node backend/tests/community_feed_sql.mjs <PGlite 경로> <0917 참고 SQL 폴더>
node backend/tests/community_account_deletion_sql.mjs <PGlite 경로> <0917 참고 SQL 폴더>
python -m pytest backend/tests/test_community.py backend/tests/test_account_deletion.py -q
```

원본 교착을 다시 보려면 새 보완 마이그레이션을 제외한 빈 격리 DB에서 동시성 테스트를 실행한다.
이미 적용한 파일명과 원격 이력의 대응은 기본 마이그레이션 내용 SHA-256
`9f9e5459ec78fe64d1d6922df71e062895efdbb2e18eb7a775218a3c502f1252`로도 확인할 수 있다.

## 출시 순서

1. 커뮤니티 담당자와 이력 이름 정렬 및 보완 SQL을 공유하고 기존 작업에 반영한다.
2. 보완 SQL 하나를 Auto-Fit에 적용하고 원격 버전·함수·실행 권한을 확인한다.
3. 커뮤니티 담당자가 완성한 커뮤니티 화면과 API를 함께 검증한다. 현재 `community-backend`와 `backend`의 차이는 서버·DB·문서·테스트이며 화면 변경이 없다.
4. 검증된 커뮤니티 변경을 backend에 병합하고 Render에 배포한다.

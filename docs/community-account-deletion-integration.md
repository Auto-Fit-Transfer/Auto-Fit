# 커뮤니티 DB · 회원 탈퇴 연동

상태: 기본 SQL·댓글 삭제 동시성 보완·2~5단계 SQL 적용 완료
(원격 20261014062855, 20261015005534, 20261015014915, 20261015062629, 20261015064753).

기준일: 2026-10-14. 대상 파일: [`supabase/migrations/20261014062855_community_feed.sql`](../supabase/migrations/20261014062855_community_feed.sql)
(기존 `20261014120000` 파일의 내용은 유지하고 실제 원격 버전에 맞춰 이름만 정렬했다).

실제 원격 적용 이력: `20261014062855_community_feed`, 소스 커밋 `1a0ed31`.
이 파일은 이미 적용되어 있으므로 다시 실행하지 않는다. 새 보완 SQL과 검증 결과는
[적용 후 동시성 검증](community-concurrency-followup.md)을 참고한다.

참고한 자료: DB 담당자가 공유한 `community-db-handoff-20261014`(README와 2026-09-17 무결성 SQL 5개).
참고 SQL은 저장소에 복사하지 않았고 공용 DB에서 실행하지 않았다.

## 1. 요청 반영 결과

| 요청 | 반영 |
| --- | --- |
| ① 적용 방식 | 이번 신규 SQL 하나만 별도 마이그레이션으로 적용한다. 전체 `db push`는 하지 않는다. |
| ② 탈퇴 시 사진 삭제 | `{user_id}/{uuid}.jpg` 경로라 `account_deletion_storage` 조회 대상임을 시험으로 확인했다. 게시 사진과 미사용 사진 모두 포함된다. Storage API 실삭제는 격리 환경 실연동에서 확인할 일로 남긴다. |
| ③ 탈퇴 트리거 | 새 `AFTER DELETE ON auth.users` 트리거를 없앴다. 기존 `autofit_integrity.cascade_account_deletion()`이 Storage 잔여 파일 검사 뒤, 일반 테이블 순회 삭제 전에 `public.community_delete_user_data(old.id)`를 호출하도록 교체한다. |
| 탈퇴 중 쓰기 차단 | 커뮤니티 테이블 6개 모두 막는다. 아래 3절 참고. |

## 2. 최종 SQL 구성

- **새 테이블 6개**: `community_posts`, `community_uploads`, `community_post_likes`, `community_comments`,
  `community_reports`, `community_blocks`. 물리 FK는 없고, RLS를 켜고 `service_role`에만 권한을 준다.
- **public 함수 25개**: API용 RPC와 보조 함수. 브라우저 역할(anon, authenticated)은 실행할 수 없다.
- **비공개 버킷**: `community-photos` 1개.
- **쓰기 차단 트리거**:
  - `user_id`가 있는 4개 테이블에는 기존 함수(`autofit_integrity.check_user_reference`,
    `autofit_integrity.check_account_writable`)를 같은 트리거 이름으로 연결한다.
  - 신고·차단 2개 테이블에는 새 함수 `autofit_integrity.check_community_pair_writable()`를 연결한다.
- **기존 함수 교체**: `autofit_integrity.cascade_account_deletion()`. 원본과 다른 곳은 아래 두 곳뿐이다.
  - `create` → `create or replace`
  - Storage 검사 뒤에 `perform public.community_delete_user_data(old.id);` 1줄(주석 2줄 포함 3줄)을 추가했다.
  - 격리 수준 검사, Storage 검사, 프로필·알림 설정 정리, 탈퇴 표시 제거, 권한은 그대로다.
- **정리 함수 권한**: `community_delete_user_data`는 `service_role`도 실행할 수 없다. 실행 권한은 탈퇴 함수 소유자에게만 있다.
- **`business_references`에는 등록하지 않았다.** 커뮤니티는 다른 사람 글에 좋아요·댓글을 다는 구조라,
  소유자가 다른 참조를 오류로 막는 기존 규칙과 맞지 않는다. 다른 사용자와 얽힌 행은 정리 함수가 처리한다.

## 3. 탈퇴 진행 중 쓰기 차단

`begin_account_deletion` 이후의 처리는 다음과 같다.

| 상황 | 처리 |
| --- | --- |
| 탈퇴자 본인의 글·사진 등록·좋아요·댓글·공유·신고·차단 (API) | `COMMUNITY_ACCOUNT_UNAVAILABLE` (409) |
| 탈퇴자 본인의 테이블 직접 쓰기 | 기존 쓰기 차단 트리거: `Account deletion is in progress` |
| 다른 사용자가 탈퇴자 글에 좋아요·댓글·공유 | `COMMUNITY_POST_NOT_FOUND` (곧 사라질 글로 취급) |
| 다른 사용자가 탈퇴자나 그 글을 신고, 탈퇴자를 차단 | `COMMUNITY_TARGET_NOT_FOUND` / `COMMUNITY_USER_NOT_FOUND` |
| 탈퇴자 경로로 Storage 업로드 | 기존 `zzz_check_storage_account_writable`가 차단 |

**잠금 순서**: 좋아요·댓글·공유는 글 행을 잠그기 전에 글쓴이의 `auth.users` 행부터 공유 잠금으로 확인한다
(`community_lock_post` → `assert_account_writable`). 탈퇴 트랜잭션과 같은 순서(사용자 → 행)라서,
글쓴이가 탈퇴하는 순간 들어온 좋아요는 교착 상태가 되지 않고 기다렸다가 `POST_NOT_FOUND`로 끝난다.
탈퇴 후에 그 글을 가리키는 좋아요가 남지 않는다.

**동시 탈퇴**: 두 사용자가 동시에 탈퇴하는 경우, 상대도 탈퇴 중이면 그 사람 글의 집계 수는 보정하지 않는다.
그 글도 곧 같이 삭제되기 때문이다. 보정하려고 하면 상대의 쓰기 차단에 걸려 이쪽 탈퇴가 실패하므로 건너뛴다.

## 4. 검증 (격리 환경, 공용 DB 미접촉)

PGlite(메모리 PostgreSQL)에 저장소 마이그레이션 전체와 참고 SQL 5개를 버전 순서대로 올려 시험했다.
커뮤니티 SQL 단독 시험이 아니다. 지원되지 않는 `pg_cron` 확장 생성 1줄만 대체했다.

| README 확인 항목 | 결과 |
| --- | --- |
| 기존 탈퇴·삭제 보호 트리거와 함께 로드 | 통과 (`aa_cascade_account_deletion`, `auth_user_protect_removal` 등 실제 함수로 삭제) |
| 탈퇴자가 남긴 좋아요·댓글·공유 삭제 후 집계 수 = 실제 행 수 | 통과 (모든 글 전수 비교) |
| 탈퇴자 글에 달린 다른 사용자의 댓글·좋아요·공유 정리 | 통과 |
| 관련 없는 사용자의 글·사진·댓글 유지 | 통과 |
| 신고·차단·미사용 업로드 정리 | 통과 (신고는 신고자·대상 양쪽 기준) |
| 탈퇴 시작 이후 쓰기 차단 | 통과 (3절 표의 모든 경로) |
| 파일이 남아 있으면 삭제 거부 후 아무것도 지워지지 않음 | 통과 |
| 삭제 도중 실패 시 전체 롤백, 재시도 시 잔여 0·이중 차감 없음 | 통과 (프로필 삭제 단계에 시험용 실패 주입) |
| 브라우저 역할 차단, 서버 역할 정상 호출 | 통과 (정리 함수·무결성 스키마는 서버 역할도 접근 불가) |
| 시험의 실효성 | 교체 함수에서 커뮤니티 호출을 빼면 시험이 실패함을 확인 |
| 여러 연결 동시 쓰기 | 미실시 (PGlite 단일 연결). 잠금 순서는 설계 검토만 함 |
| Storage API 실삭제 | 미실시 (격리된 실연동 환경 필요) |

시험 결과: 탈퇴 흐름 36개(보완 SQL 반영 후 39개), 피드 기능 42개(보완 후 43개), FastAPI 커뮤니티 39개를 포함해 백엔드 전체 665개가 통과했다.

```bash
node backend/tests/community_account_deletion_sql.mjs <@electric-sql/pglite 경로> <참고 SQL 폴더>
node backend/tests/community_feed_sql.mjs <@electric-sql/pglite 경로> <참고 SQL 폴더>
```

### 2단계 SQL(원격 20261015014915, 적용 완료)의 탈퇴 연동

- 새 표 `community_follows`(사용자 열 2개)는 `check_community_pair_writable` 트리거로 두 사용자를 모두 검사한다.
- 새 표 `community_notifications`는 `user_id`(받는 사람)에 기존 `check_user_reference`·`zzz_check_account_writable`를 붙이고,
  `actor_user_id`(만든 사람)는 추가 트리거 `zzz_check_actor_writable`(INSERT만)로 검사한다. 읽음 표시(UPDATE)는 상대가 탈퇴 중이어도 된다.
- `community_delete_user_data`가 두 표에서 탈퇴자 쪽 행(양방향)을 지운다. 동시 탈퇴는 advisory lock으로 한 번에 하나씩 정리한다
  ([후속 보완](community-concurrency-followup.md)).
- 알림 생성·삭제와 차단 시 팔로우 해제는 트리거라서, 이미 적용한 RPC는 그대로다. 트리거 안의 쓰기는 RPC가 먼저 잠근
  사용자(`auth.users`) 범위 안에서만 일어나므로 잠금 순서(사용자 → 글 → 하위 행)를 지킨다.
- 시험: `community_social_sql.mjs` 27개, `community_account_deletion_sql.mjs` 44개(팔로우·알림 정리, 탈퇴 중 팔로우 거절 포함).

### 3단계 SQL(20261015062629)의 탈퇴 연동

- `user_id`가 있는 새 표 3개(`community_mileage_ledger`, `community_memberships`, `community_club_members`)는 기존
  `check_user_reference`·`zzz_check_account_writable`를 붙였고, 탈퇴 때 기존 일반 삭제(purge)가 지운다.
- `community_clubs`는 소유자 열이 `owner_user_id`라 `check_community_pair_writable`로 검사한다. UPDATE는 새 소유자만 검사해서
  탈퇴하는 클럽장의 클럽을 넘길 수 있다.
- `community_delete_user_data`가 클럽장 탈퇴 시 가장 먼저 가입한(탈퇴 중이 아닌) 회원에게 클럽을 넘기고, 넘길 사람이 없으면 클럽과
  회원 행을 지운다. 그 클럽에 남은 다른 사람의 글은 `club_id`를 유지하고 작성자 프로필에서만 보인다(다른 사람 행을 고치지 않으므로
  다른 탈퇴자의 쓰기 차단에 걸리지 않는다).
- 가입은 클럽 행을 `for share`로 잡아, 클럽장 탈퇴로 클럽이 지워지는 것과 순서를 맞춘다(사용자 → 클럽 행).
- 시험: `community_clubs_sql.mjs` 25개(클럽장 넘김·빈 클럽 삭제 포함), `community_account_deletion_sql.mjs` 48개
  (탈퇴 중 클럽 개설·적립·시연 회원 거절, 함께 탈퇴 중인 회원을 건너뛰고 넘김).

### 4·5단계 SQL(20261015064753)의 탈퇴 연동

- 새 사용자 표 2개(`community_challenge_participants`, `community_ranking_participants`)는 `user_id`가 있어 기존
  `check_user_reference`·`zzz_check_account_writable`를 붙였고, 탈퇴 때 기존 일반 삭제(purge)가 지운다. 정리 함수 교체는 없다.
- 챌린지 참여·보상, 랭킹 참여 RPC는 사용자 확인(`community_require_writable`) 뒤에만 쓴다.
- 시험: `community_challenges_sql.mjs` 20개, `community_account_deletion_sql.mjs` 51개(탈퇴 중 챌린지 참여·보상·랭킹 참여 거절 포함).

## 5. 적용 담당자 체크리스트

적용 전:

1. 새 환경에 적용할 때는 `list_migrations`로 `20261014062855` 또는 `community_feed`가 없는지 확인한다.
   Auto-Fit 공용 DB에는 이미 적용했다. 과거 소스 버전 `20261014120000`이 없다는 이유로 재적용하지 않는다.
2. 원격 탈퇴 함수가 참고 원본과 같은지 확인한다. 다르면 적용을 멈추고 이 파일의 교체 함수를 원격 정의에 맞춘다.
   ```sql
   select pg_get_functiondef('autofit_integrity.cascade_account_deletion()'::regprocedure);
   ```
3. 파일 전체를 마이그레이션 하나로 한 번만 적용한다. 적용 결과와 원격 버전을 기록한다.

적용 후 (읽기 전용 확인):

```sql
select count(*) from pg_tables where schemaname = 'public' and tablename like 'community\_%';  -- 6
select count(*) from pg_trigger
  where not tgisinternal and tgrelid::regclass::text like 'community\_%';                    -- 10
select public from storage.buckets where id = 'community-photos';                           -- false
select pg_get_functiondef('autofit_integrity.cascade_account_deletion()'::regprocedure)
  like '%community_delete_user_data%';                                                      -- true
select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'auth.users'::regclass and p.proname like 'community%';                  -- 0
select has_function_privilege('service_role', 'public.community_delete_user_data(uuid)', 'execute');      -- false
select has_function_privilege('service_role', 'public.community_feed(uuid,timestamptz,uuid,integer)', 'execute'); -- true
```

2026-10-14 적용 후 Auto-Fit 공용 DB의 합성 계정 2개로 게시·미사용 사진의 Storage API 실삭제와
기존 Render 탈퇴 API 204 응답을 확인했다. 다른 합성 계정의 글·사진 유지와 집계 보정도 확인했으며,
검증 데이터는 모두 정리했다. 별도 Supabase 프로젝트에서 수행한 테스트는 아니다.

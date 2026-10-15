# Auto-Fit 커뮤니티 API 계약 (1단계: 피드, 2단계: 팔로우·프로필·알림)

상태: 1단계 DB 적용 완료. 2단계 SQL(`20261015090000_community_follows_notifications.sql`)은 검토 대기, 공용 DB 미적용.
커뮤니티 서버 병합·배포와 화면 연동은 아직 대기.

기준일: 2026-10-15

구현 상태: `community-backend` 브랜치에 API 25개(1단계 16 + 2단계 9), DB 함수, 시험(서버 43개·PostgreSQL 피드 43개·
2단계 27개·탈퇴 흐름 44개)을 추가했다.
2단계 SQL을 적용하기 전에는 2단계 API와 피드(`GET /feed`)가 502(`DATA_SOURCE_ERROR`)를 반환한다.
피드가 2단계 함수(`community_timeline`)를 쓰기 때문이다.
`20261014062855_community_feed.sql`은 Auto-Fit Supabase 프로젝트에 적용했다.
원래 파일명은 `20261014120000_community_feed.sql`이며 원격 적용 버전에 맞춰 이름만 정렬했다.
댓글 삭제 교착 보완 SQL은 원격 `20261015005534_community_comment_delete_lock_order`로 적용됐다.
자세한 내용은 [검증 결과 및 보완안](community-concurrency-followup.md)을 참고한다.
회원 탈퇴 연동과 적용 절차는 [커뮤니티 DB·회원 탈퇴 연동](community-account-deletion-integration.md)을 따른다.

## 1. 범위와 결정 사항

- X(트위터)형 피드: 최신순, 글자 500자 이하, 사진 최대 5장.
- 좋아요, 공유(리포스트), 댓글(300자 이하), 신고, 차단.
- 팔로우·프로필·알림·클럽·마일리지·챌린지·랭킹은 다음 단계에서 같은 테이블 위에 추가한다.
- 작성자는 닉네임과 프로필 사진만 공개한다. 실명(`profiles.name`)은 응답에 없다.
- 글·댓글·공유를 쓰려면 닉네임이 있어야 한다. 없으면 409 `COMMUNITY_NICKNAME_REQUIRED`.
  닉네임은 기존 `PATCH /api/profile`의 `nickname`으로 저장한다.
- 사진은 서버가 JPEG로 다시 저장하면서 위치(GPS) 등 촬영 정보를 지우고, 휴대폰 회전을 바로잡고,
  긴 변을 2048px 이하로 줄인다.
- 사진 주소는 1시간 동안만 유효한 비공개 주소다. 오래 열어 둔 화면은 피드를 다시 불러온다.
- 신고한 글·댓글은 신고한 사람 화면에서 바로 사라진다. 다른 사람에게는 그대로 보인다.
- 차단하면 두 사람 모두 서로의 글·공유·댓글을 볼 수 없고 좋아요·댓글도 할 수 없다.
- 회원 탈퇴 시 그 사람의 글·댓글·좋아요·공유·차단·신고 기록이 함께 삭제되고,
  다른 사람 글의 숫자(좋아요 수 등)도 맞게 줄어든다.

## 2. 공통 규칙

```http
Authorization: Bearer <supabase_access_token>
```

- ID는 UUID 문자열, 시각은 타임존이 있는 ISO 8601 문자열이다.
- `user_id`는 요청에서 받지 않고 로그인 토큰에서 정한다.
- 목록은 `next_cursor`를 다음 요청의 `cursor`에 그대로 넣는다. 마지막 페이지면 `null`.
  `limit` 기본 20, 최대 50.
- 오류 형식은 챗봇 API와 같다.

```json
{ "detail": { "code": "COMMUNITY_NICKNAME_REQUIRED", "message": "커뮤니티를 이용하려면 닉네임을 먼저 정해 주세요.", "fields": null } }
```

| 상태 | code | 화면 처리 |
| --- | --- | --- |
| 401 | `AUTH_REQUIRED` | 로그인 화면으로 |
| 404 | `COMMUNITY_POST_NOT_FOUND`, `COMMUNITY_COMMENT_NOT_FOUND`, `COMMUNITY_USER_NOT_FOUND`, `COMMUNITY_TARGET_NOT_FOUND` | 삭제·차단된 글. 목록에서 빼기 |
| 409 | `COMMUNITY_NICKNAME_REQUIRED` | 닉네임 설정 화면 열기 |
| 409 | `COMMUNITY_UPLOAD_INVALID` | 사진을 다시 올린 뒤 재시도 |
| 409 | `COMMUNITY_ACCOUNT_UNAVAILABLE` | 탈퇴가 진행 중인 계정. 안내 후 로그인 화면으로 |
| 413 | `FILE_TOO_LARGE` | 5MB 이하로 줄여서 올리기 |
| 415 | `UNSUPPORTED_IMAGE` | JPEG·PNG·WebP만 가능 |
| 422 | `VALIDATION_ERROR`, `COMMUNITY_INVALID_INPUT`, `COMMUNITY_SELF_TARGET` | 입력 확인 |
| 429 | `COMMUNITY_RATE_LIMITED` (글 1시간 30개, 댓글 1시간 60개), `COMMUNITY_UPLOAD_LIMIT` (안 쓴 사진 하루 20장) | 잠시 후 재시도 |
| 502 | `DATA_SOURCE_ERROR` | 잠시 후 재시도 |

## 3. 글 객체 (`CommunityPost`)

피드, 글 조회, 글쓰기 응답이 모두 이 모양이다.

```json
{
  "feed_item_id": "공유 기록 ID 또는 post_id",
  "feed_created_at": "2026-10-14T03:00:00.123456+00:00",
  "reposted_by": { "user_id": "…", "nickname": "운동왕", "profile_image_url": null },
  "post_id": "원글 ID",
  "author": { "user_id": "…", "nickname": "식단러", "profile_image_url": null },
  "content": "샐러드 인증",
  "images": [{ "url": "https://…/sign/…?token=…", "width": 1200, "height": 900 }],
  "like_count": 3,
  "comment_count": 1,
  "repost_count": 1,
  "liked_by_me": true,
  "reposted_by_me": false,
  "is_mine": false,
  "created_at": "2026-10-14T02:00:00+00:00"
}
```

- `reposted_by`가 있으면 "○○님이 공유함" 줄을 위에 표시한다. 원글이면 `null`.
- 같은 원글이 원글과 공유로 두 번 나올 수 있으므로 목록 key는 `feed_item_id`를 쓴다.
- 좋아요·공유·댓글·삭제·신고는 항상 `post_id`(원글 ID)로 요청한다.
- `content`는 사진만 있는 글이면 `null`.
- `images[].url`은 사진 주소 발급에 실패하면 `null`이다. 회색 칸으로 표시한다.
- `width`·`height`로 사진 칸 비율을 미리 잡으면 사진이 늦게 떠도 화면이 밀리지 않는다.

## 4. API

### 피드

| 요청 | 설명 |
| --- | --- |
| `GET /api/community/feed?scope=all&cursor=&limit=20` | 피드 최신순. `scope`: `all`(기본, 전체) 또는 `following`(내가 팔로우한 사람 + 내 글). `{ "items": CommunityPost[], "next_cursor": string \| null }`. 커서는 같은 `scope`에서만 쓸 수 있다 |
| `GET /api/community/posts/{post_id}` | 글 하나. 공유 기록 ID를 넣어도 원글을 준다 |
| `DELETE /api/community/posts/{post_id}` | 내 글 삭제(204). 사진·좋아요·댓글·공유가 함께 삭제된다 |

### 글쓰기 (사진 포함)

1. 사진마다 `POST /api/community/images`를 한 장씩 호출한다 (`multipart/form-data`, 필드명 `file`, 5MB 이하).
   응답: `{ "upload_id": "…", "width": 2048, "height": 1536 }` (201)
2. `POST /api/community/posts`

```json
{ "content": "오늘 오운완!", "upload_ids": ["사진1 upload_id", "사진2 upload_id"] }
```

- `content`와 `upload_ids` 중 하나는 있어야 한다. `upload_ids`는 최대 5개, 보낸 순서대로 표시한다.
- 올린 사진은 한 번의 글에만 쓸 수 있다. 하루 동안 글에 쓰지 않은 사진은 자동으로 지워진다.
- 앱에서 사진을 고를 때 긴 변 2048px 이하, 품질 0.8 정도로 줄여 보내면 업로드가 빠르다.

### 좋아요·공유

| 요청 | 응답 |
| --- | --- |
| `PUT /api/community/posts/{post_id}/like` | `{ "post_id", "liked": true, "like_count" }` |
| `DELETE /api/community/posts/{post_id}/like` | `{ "post_id", "liked": false, "like_count" }` |
| `PUT /api/community/posts/{post_id}/repost` | `{ "post_id", "reposted": true, "repost_count" }` |
| `DELETE /api/community/posts/{post_id}/repost` | `{ "post_id", "reposted": false, "repost_count" }` |

여러 번 눌러도 한 번만 반영된다. 화면은 응답의 숫자로 갱신한다.

### 댓글

| 요청 | 설명 |
| --- | --- |
| `GET /api/community/posts/{post_id}/comments?cursor=&limit=20` | 오래된 순. `{ "items": CommunityComment[], "next_cursor" }` |
| `POST /api/community/posts/{post_id}/comments` | `{ "content": "멋져요" }` (300자 이하) → 201 `CommunityComment` |
| `DELETE /api/community/comments/{comment_id}` | 204. 댓글 작성자 또는 글 작성자만 가능 |

`CommunityComment`: `comment_id`, `post_id`, `author`, `content`, `created_at`, `is_mine`,
`can_delete`(삭제 버튼 표시 여부).

### 신고·차단

```json
POST /api/community/reports
{ "target_type": "post", "target_id": "…", "reason": "spam", "detail": "선택 입력, 300자 이하" }
```

- `target_type`: `post`, `comment`, `user`
- `reason`: `spam`(광고·도배), `abuse`(욕설·비하), `sexual`(음란물), `misinformation`(잘못된 건강 정보),
  `privacy`(개인정보 노출), `other`(기타)
- 같은 대상을 여러 번 신고해도 한 번으로 처리된다. 응답 201 `{ "reported": true }`

| 요청 | 설명 |
| --- | --- |
| `PUT /api/community/blocks/{user_id}` | 차단 `{ "user_id", "blocked": true }` |
| `DELETE /api/community/blocks/{user_id}` | 차단 해제 `{ "user_id", "blocked": false }` |
| `GET /api/community/blocks` | 차단 목록 `[{ "user_id", "nickname", "profile_image_url", "blocked_at" }]` |

### 프로필·팔로우 (2단계)

| 요청 | 설명 |
| --- | --- |
| `GET /api/community/users/me` | 내 프로필 |
| `GET /api/community/users/{user_id}` | 프로필 `CommunityAuthor` + `post_count`(공유 제외 글 수), `follower_count`, `following_count`, `is_me`, `followed_by_me`, `follows_me`. 차단 관계면 404 `COMMUNITY_USER_NOT_FOUND` |
| `GET /api/community/users/{user_id}/posts?cursor=` | 그 사용자의 글과 공유. 응답은 피드와 같다 |
| `GET /api/community/users/{user_id}/followers?cursor=` | 팔로워 최근순 `{ items: [CommunityAuthor + followed_at, is_me, followed_by_me], next_cursor }` |
| `GET /api/community/users/{user_id}/following?cursor=` | 팔로잉 최근순 (형식 같음) |
| `PUT /api/community/follows/{user_id}` | 팔로우 `{ "user_id", "following": true, "follower_count" }`. 닉네임 필요(409), 자기 자신 422, 1시간 100명 제한(429) |
| `DELETE /api/community/follows/{user_id}` | 팔로우 취소 `{ "user_id", "following": false, "follower_count" }` |

- 차단하면 두 사람 사이의 팔로우가 양쪽 모두 자동으로 풀린다. 차단 관계에서는 팔로우할 수 없다.
- 수(팔로워·팔로잉)는 전체 수이고, 목록에서는 나와 차단 관계인 사람이 빠진다.

### 알림 (2단계)

| 요청 | 설명 |
| --- | --- |
| `GET /api/community/notifications?cursor=` | 내 알림 최신순 |
| `GET /api/community/notifications/unread-count` | `{ "unread_count": 3 }` (배지용) |
| `POST /api/community/notifications/read` | 모두 읽음 표시. `{ "unread_count": 0 }` |

```json
{ "notification_id": "…", "type": "comment", "actor": { "user_id": "…", "nickname": "새벽러너", "profile_image_url": null },
  "post_id": "…", "comment_id": "…", "post_preview": "글 앞 80자", "comment_preview": "댓글 앞 80자",
  "created_at": "2026-10-15T01:00:00+00:00", "is_read": false }
```

- `type`: `follow`(나를 팔로우), `like`(내 글 좋아요), `comment`(내 글에 댓글), `repost`(내 글 공유). 내가 한 행동은 알리지 않는다.
- 좋아요·공유·팔로우를 취소하거나 글·댓글을 지우면 그 알림도 사라진다. 같은 사람의 같은 좋아요·공유·팔로우는 한 개만 남는다.
- 차단한 사람의 알림과 내가 신고한 댓글의 알림은 보이지 않는다.

## 5. 배포 전 확인 (백엔드 담당)

1. 적용 절차·검토 항목은 [커뮤니티 DB·회원 탈퇴 연동](community-account-deletion-integration.md)을 따른다.
   이 파일은 기존 탈퇴 함수 `autofit_integrity.cascade_account_deletion()`도 교체하므로 단독 검토 후 한 번만 적용한다.
2. 시험: `python -m pytest backend/tests/test_community.py`,
   `node backend/tests/community_feed_sql.mjs <@electric-sql/pglite 경로> <20260917 무결성 SQL 폴더>`,
   `node backend/tests/community_social_sql.mjs <@electric-sql/pglite 경로> <20260917 무결성 SQL 폴더>`,
   `node backend/tests/community_account_deletion_sql.mjs <@electric-sql/pglite 경로> <20260917 무결성 SQL 폴더>`.
3. 2단계 SQL `20261015090000_community_follows_notifications.sql`은 이미 적용한 두 파일을 바꾸지 않는다.
   새 표 2개(`community_follows`, `community_notifications`)와 함수를 추가하고, 기존 함수 2개
   (`autofit_integrity.check_community_pair_writable`, `public.community_delete_user_data`)를 같은 이름·인자로 교체한다.
   알림은 기존 RPC를 고치지 않고 트리거로 만든다. 이 파일 하나만 적용한다.
4. 신고 내용(`community_reports`)을 검토하고 글을 숨기는 관리자 기능은 아직 없다. 지금은 DB에서 직접 확인한다.

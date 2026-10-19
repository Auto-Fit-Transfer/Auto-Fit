# Auto-Fit 커뮤니티 API 계약 (1 피드, 2 팔로우·프로필·알림, 3 마일리지·유료 회원·클럽, 4·5 챌린지·랭킹)

상태: 1~5단계는 DB 적용, backend·frontend 병합, Render 배포 완료(2026-10-15).
2026-10-19 추가분 3개(클럽 관리·신고 검토·1:1 메시지)는 Auto-Fit 공용 DB에 아래 순서로 적용했다.
`20261019090000_community_club_management.sql` → `20261019100000_community_moderation.sql` →
`20261019110000_community_direct_messages.sql`
원격 버전: `20261019022924_community_club_management` → `20261019022935_community_moderation` →
`20261019023132_community_direct_messages`. 마지막 SQL에는 빈 대화의 최근 메시지 시각 재계산과 읽음 기록 잠금 보완이 포함됐다.

기준일: 2026-10-19

구현 상태: `community-backend` 브랜치에 API 라우트 58개(2026-10-19 추가 14개 포함), DB 함수, 시험(서버 전체 683개·
PostgreSQL 피드 43개·2단계 27개·3단계 25개·4·5단계 20개·클럽 관리 17개·신고 검토 18개·메시지 22개·탈퇴 흐름 53개)을 추가했다.
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

### 마일리지·유료 회원 (3단계, 규칙은 팀 결정 전 임시값)

| 요청 | 설명 |
| --- | --- |
| `GET /api/community/mileage` | 열 때마다 운동 완료(`exercise_sessions` completed)·식단 기록(`meal_logs` recorded)을 확인해 적립한 뒤 `{ balance, earned_today, rules[] }` |
| `GET /api/community/mileage/history?cursor=` | 적립(+)·사용(−) 내역 최신순 `{ entry_id, amount, reason(workout·meal_log·club_create), created_at }` |
| `GET /api/community/membership` | `{ active, plan, source("demo"), expires_at, demo_available, demo_days }` |
| `POST /api/community/membership/demo` | **시연용** 유료 회원 시작·연장(결제 없음). 규칙이 꺼져 있으면 409 `COMMUNITY_DEMO_UNAVAILABLE` |

- 숫자는 모두 `community_rules` 표에 있다(`earn_workout` 10/하루 1, `earn_meal_log` 5/하루 3, `club_create_cost` 500, `membership_demo_days` 30).
  팀이 정하면 SQL로 표의 `amount`·`daily_limit`·`enabled`만 바꾼다. 서버·앱 코드는 바꿀 필요가 없다.
- 규칙의 `starts_at` 이전 활동은 적립하지 않는다. 규칙을 껐다 다시 켜면 꺼져 있던 동안의 활동도 적립되므로, 원하지 않으면 `starts_at`을 함께 옮긴다.
- 같은 운동·식단 기록은 한 번만 적립된다(하루 한도는 한국 날짜 기준).

### 클럽 (3단계)

| 요청 | 설명 |
| --- | --- |
| `GET /api/community/clubs?scope=all\|mine&category=&cursor=` | 클럽 목록 최신순 |
| `POST /api/community/clubs` | `{ name(2~30자), description(선택, 300자), category }` → 201. 유료 회원은 무료, 아니면 마일리지 차감. 응답에 `paid_with`(membership·mileage), `mileage_spent` |
| `GET /api/community/clubs/{club_id}` | `{ club_id, name, description, category, owner, member_count, post_count, is_member, is_owner, created_at }` |
| `PUT` / `DELETE /api/community/clubs/{club_id}/membership` | 가입 / 나가기 `{ club_id, joined, member_count }`. 클럽장은 나갈 수 없음(409) |
| `GET /api/community/clubs/{club_id}/posts?cursor=` | 클럽 글(피드와 같은 형식) |
| `POST /api/community/clubs/{club_id}/posts` | 클럽에 글쓰기(가입자만, 403). 글쓰기와 같은 본문·규칙 |

- `category`: `running`, `strength`, `diet`, `yoga`, `hiking`, `cycling`, `sports`, `etc` (관심사 기준, 위치 정보 없음).
- 클럽 글은 전체·팔로잉 피드에 나오지 않고 클럽과 작성자 프로필에만 나온다. 좋아요·댓글·공유는 일반 글과 같다.
- 한 사람이 클럽을 5개까지 만든다. 클럽 이름은 대소문자 구분 없이 하나뿐이다.
- 클럽장이 탈퇴하면 가장 먼저 가입한(탈퇴 중이 아닌) 회원이 클럽장이 된다. 남은 회원이 없으면 클럽을 지운다.
- 오류: 404 `COMMUNITY_CLUB_NOT_FOUND`, 409 `COMMUNITY_CLUB_NAME_TAKEN`·`COMMUNITY_CLUB_LIMIT`·`COMMUNITY_CLUB_OWNER`·`COMMUNITY_MILEAGE_NOT_ENOUGH`,
  403 `COMMUNITY_MEMBERSHIP_REQUIRED`(개설 비용 규칙이 꺼진 상태에서 비회원)·`COMMUNITY_CLUB_MEMBERS_ONLY`.
- 아직 없는 것: 클럽 삭제·수정, 회원 목록, 클럽장 넘기기(탈퇴 때만 자동).

### 챌린지 (4단계, 예시 챌린지는 팀 결정 전 임시값)

| 요청 | 설명 |
| --- | --- |
| `GET /api/community/challenges` | 진행 중·예정, 끝난 지 1주 이내 챌린지 목록 |
| `PUT` / `DELETE /api/community/challenges/{challenge_id}/participation` | 참여(마지막 날까지) / 참여 취소(보상 받기 전까지) |
| `POST /api/community/challenges/{challenge_id}/claim` | 목표를 채우면 보상 마일리지를 한 번 받는다 |

```json
{ "challenge_id": "…", "title": "2주 운동 습관", "description": "…", "metric": "workout_days", "goal": 5,
  "starts_on": "2026-10-15", "ends_on": "2026-10-28", "reward_mileage": 50, "note": "임시값(팀 결정 전): …",
  "phase": "ongoing", "participant_count": 3, "joined": true, "progress": 2, "completed": false,
  "rewarded": false, "can_claim": false }
```

- `metric`: `workout_days`(운동 완료한 날 수), `meal_log_days`(식단 기록한 날 수). 한국 날짜, 기간 안의 기록만 센다. 인증 사진은 없다.
- 챌린지는 `community_challenges` 표의 행이다(예시 2개: 2주 운동 5일 +50, 2주 식단 7일 +30). 새 챌린지·목표·보상은 SQL로 행을 넣거나 바꾼다.
- 오류: 404 `COMMUNITY_CHALLENGE_NOT_FOUND`, 409 `COMMUNITY_CHALLENGE_ENDED`·`_NOT_JOINED`·`_NOT_COMPLETED`·`_ALREADY_CLAIMED`.
- 보상은 마일리지 내역에 `reason: "challenge"`로 남는다.

### 랭킹 (5단계)

| 요청 | 설명 |
| --- | --- |
| `GET /api/community/rankings?metric=workout\|mileage&scope=all\|following\|club&club_id=` | 이번 주(한국 날짜 월~일) 순위. `scope=club`이면 `club_id` 필수 |
| `PUT` / `DELETE /api/community/rankings/participation` | 랭킹 공개 참여 / 그만하기 (참여는 닉네임 필요) |

```json
{ "metric": "workout", "scope": "all", "week_start": "2026-10-12", "week_end": "2026-10-18", "participating": true,
  "items": [{ "user_id": "…", "nickname": "헬린이탈출", "profile_image_url": null, "rank": 1, "score": 3, "is_me": false }],
  "me": { "rank": 2, "score": 2 } }
```

- **참여를 켠 사람만** 순위에 나온다(기본은 비공개). 운동 기록을 자동으로 공개하지 않는다는 커뮤니티 원칙 때문이다.
- `workout`: 이번 주 완료한 운동 횟수. `mileage`: 이번 주 적립한 마일리지(각자 마일리지 화면을 열어 적립된 만큼).
- `following`: 내가 팔로우한 사람 + 나. `club`: 그 클럽 회원. 차단 관계인 사람은 빠진다. 같은 점수는 같은 순위.

### 클럽 관리 (2026-10-19)

| 요청 | 설명 |
| --- | --- |
| `PATCH /api/community/clubs/{club_id}` | 클럽장만. `{ name, description, category }` (만들 때와 같은 규칙) → 클럽 |
| `DELETE /api/community/clubs/{club_id}` | 클럽장만(204). 클럽 글과 그 사진·좋아요·댓글·공유가 함께 지워진다. 사진은 서버가 Storage에서 지운다 |
| `GET /api/community/clubs/{club_id}/members?cursor=` | 가입한 순서 `{ items: [CommunityAuthor + role(owner·member), joined_at, is_me, followed_by_me], next_cursor }` |
| `DELETE /api/community/clubs/{club_id}/members/{user_id}` | 클럽장만, 회원 내보내기 `{ club_id, member_count }`. 내보낸 회원은 다시 가입할 수 없다(403 `COMMUNITY_CLUB_BANNED`). 이미 쓴 글은 남는다 |

- 오류: 403 `COMMUNITY_CLUB_OWNER_ONLY`. 클럽장이 탈퇴하면 기존처럼 다음 회원에게 넘어간다.

### 신고 검토 (관리자, 2026-10-19)

| 요청 | 설명 |
| --- | --- |
| `GET /api/community/moderation/status` | `{ "is_moderator": true }` (화면에 메뉴를 보일지 판단) |
| `GET /api/community/moderation/reports?status=open\|resolved` | 신고된 대상별 목록(최근 신고순, 최대 100) |
| `POST /api/community/moderation/actions` | `{ target_type, target_id, action: hide\|unhide\|dismiss }`. 사용자 신고는 dismiss만 |

```json
{ "target_type": "post", "target_id": "…", "target_user": { "user_id": "…", "nickname": "…", "profile_image_url": null },
  "report_count": 2, "reasons": ["spam", "abuse"], "details": [{ "reason": "spam", "detail": "…" }],
  "content_snapshot": "신고 당시 내용", "latest_reported_at": "…", "post_id": "…", "exists": true, "hidden": false,
  "last_action": null, "last_action_at": null }
```

- 관리자는 DB 담당자가 SQL로 정한다: `insert into public.community_moderators(user_id, note) values ('<user_id>', '메모');`
- 신고한 사람은 관리자에게도 보이지 않는다. `open` = 마지막 처리 뒤에 새 신고가 있는 대상.
- 숨긴 글·댓글은 모든 사람의 피드·상세·클럽·댓글 목록에서 빠진다(지우지 않으므로 `unhide`로 되돌릴 수 있다). 댓글을 숨겨도 글의 댓글 수는 그대로다.
- 오류: 403 `COMMUNITY_FORBIDDEN`(관리자가 아님), 404 `COMMUNITY_TARGET_NOT_FOUND`(없거나 작성자가 탈퇴 중).

### 1:1 메시지 (2026-10-19)

| 요청 | 설명 |
| --- | --- |
| `POST /api/community/conversations` | `{ user_id }` 대화 열기. 있으면 그 대화, 없으면 **서로 팔로우한 사이일 때만** 새로 만든다(아니면 403 `COMMUNITY_DM_NOT_ALLOWED`) |
| `GET /api/community/conversations?cursor=` | 메시지가 있는 대화 최근순 `{ conversation_id, other, last_message{content, created_at, is_mine}, last_message_at, unread_count, can_send }` |
| `GET /api/community/conversations/unread-count` | `{ unread_count }` 안 읽은 메시지 수(배지용) |
| `GET /api/community/conversations/{id}/messages?cursor=&limit=30` | 최신순 메시지 `{ message_id, conversation_id, content, created_at, is_mine }`. 화면은 열려 있는 동안 5초마다 첫 페이지를 다시 불러온다 |
| `POST /api/community/conversations/{id}/messages` | `{ content }` 1,000자 이하, 보낸 사람당 10분에 60개(429) |
| `POST /api/community/conversations/{id}/read` | 읽음 표시 |
| `DELETE /api/community/messages/{message_id}` | 내가 보낸 메시지 삭제(양쪽 모두에서, 204) |

- 실시간 서버는 없다(폴링). 이미 시작한 대화는 팔로우를 끊어도 이어지고, **차단하면** 양쪽 모두 대화가 보이지 않고 보낼 수 없다(404 `COMMUNITY_CONVERSATION_NOT_FOUND`).
- 신고는 기존 사용자 신고(`target_type: "user"`)를 쓴다. 한쪽이 탈퇴하면 대화가 양쪽 모두에서 지워진다.

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
3. 2단계 SQL `20261015014915_community_follows_notifications.sql`(2026-10-15 적용 완료, 원래 이름 `20261015090000_…`)은
   이미 적용한 두 파일을 바꾸지 않는다.
   새 표 2개(`community_follows`, `community_notifications`)와 함수를 추가하고, 기존 함수 2개
   (`autofit_integrity.check_community_pair_writable`, `public.community_delete_user_data`)를 같은 이름·인자로 교체한다.
   알림은 기존 RPC를 고치지 않고 트리거로 만든다. 이 파일 하나만 적용한다.
4. 3단계 SQL `20261015062629_community_mileage_membership_clubs.sql`은 2026-10-15 적용 완료다. 새 표 5개
   (`community_rules`, `community_mileage_ledger`, `community_memberships`, `community_clubs`, `community_club_members`)와
   `community_posts.club_id` 열을 추가하고, 함수 3개(`check_community_pair_writable`, `community_timeline`,
   `community_delete_user_data`)를 같은 이름·인자로 교체한다. 시험: `node backend/tests/community_clubs_sql.mjs …`.
5. 4·5단계 SQL `20261015064753_community_challenges_rankings.sql`은 2026-10-15 적용 완료다. 새 표 3개
   (`community_challenges`, `community_challenge_participants`, `community_ranking_participants`)와 함수를 추가하고,
   마일리지 사유 제약(`community_mileage_ledger_reason_check`)에 `challenge`를 더한다. 기존 함수는 바꾸지 않는다.
   시험: `node backend/tests/community_challenges_sql.mjs …`.
6. 2026-10-19 추가 SQL 3개는 위 순서로 적용 완료했다. 시험: `community_club_management_sql.mjs`(17),
   `community_moderation_sql.mjs`(18), `community_messages_sql.mjs`(22), `community_account_deletion_sql.mjs`(53).
   교체하는 기존 함수: 클럽 관리 = `community_set_club_membership`, `community_create_club_post` /
   신고 검토 = `community_visible_post`, `community_comments`, `community_timeline`, `community_club_feed` /
   메시지 = `check_community_pair_writable`, `community_delete_user_data`. 모두 같은 이름·인자다.
   여러 연결의 동시성 시험은 로컬 Docker/PostgreSQL 서버가 없어 미실행이며, 단일 연결 PGlite 시험과 잠금 순서 검토를 완료했다.
7. 관리자 지정: `insert into public.community_moderators(user_id, note) values (…)` (DB 담당자만).

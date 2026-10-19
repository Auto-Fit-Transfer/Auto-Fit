"""Community feed: posts with up to five photos, likes, reposts, comments, reports and blocks,
plus follows, profiles, following/user timelines and notifications (stage 2) and mileage,
demo membership and clubs (stage 3), challenges and weekly rankings (stages 4-5), club
management, report moderation and 1:1 messages.

Every write is a SQL function (supabase/migrations/20261014062855_community_feed.sql,
20261015014915_community_follows_notifications.sql,
20261015062629_community_mileage_membership_clubs.sql and
20261015064753_community_challenges_rankings.sql and the 20261019 club management,
moderation and direct message migrations), so
counters, ownership and block rules change atomically. Photos live in a private bucket and
are re-encoded without EXIF metadata, so phone GPS locations never reach other users.
"""
import base64
import json
from datetime import date, datetime
from io import BytesIO
from typing import Any, Literal, NoReturn
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from backend.app.diet_timing import logger

BUCKET = "community-photos"
MAX_IMAGES = 5
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_EDGE = 2048
JPEG_QUALITY = 85
URL_TTL = 3600
PAGE_SIZE = 20
MAX_PAGE_SIZE = 50

ERRORS = {
    "COMMUNITY_INVALID_INPUT": (422, "입력값을 확인해 주세요."),
    "COMMUNITY_POST_NOT_FOUND": (404, "게시글을 찾을 수 없습니다."),
    "COMMUNITY_COMMENT_NOT_FOUND": (404, "댓글을 찾을 수 없습니다."),
    "COMMUNITY_TARGET_NOT_FOUND": (404, "신고할 대상을 찾을 수 없습니다."),
    "COMMUNITY_USER_NOT_FOUND": (404, "사용자를 찾을 수 없습니다."),
    "COMMUNITY_NICKNAME_REQUIRED": (409, "커뮤니티를 이용하려면 닉네임을 먼저 정해 주세요."),
    "COMMUNITY_UPLOAD_INVALID": (409, "사진을 다시 올려 주세요."),
    "COMMUNITY_SELF_TARGET": (422, "본인에게는 할 수 없는 작업입니다."),
    "COMMUNITY_UPLOAD_LIMIT": (429, "올린 사진이 너무 많습니다. 내일 다시 시도해 주세요."),
    "COMMUNITY_RATE_LIMITED": (429, "짧은 시간에 너무 많이 작성했습니다. 잠시 후 다시 시도해 주세요."),
    "COMMUNITY_ACCOUNT_UNAVAILABLE": (409, "탈퇴가 진행 중인 계정이라 처리할 수 없습니다."),
    "COMMUNITY_CLUB_NOT_FOUND": (404, "클럽을 찾을 수 없습니다."),
    "COMMUNITY_CLUB_NAME_TAKEN": (409, "이미 같은 이름의 클럽이 있습니다."),
    "COMMUNITY_CLUB_LIMIT": (409, "클럽은 한 사람이 5개까지 만들 수 있습니다."),
    "COMMUNITY_CLUB_OWNER": (409, "클럽장은 클럽을 나갈 수 없습니다."),
    "COMMUNITY_CLUB_MEMBERS_ONLY": (403, "클럽에 가입한 사람만 글을 쓸 수 있습니다."),
    "COMMUNITY_MILEAGE_NOT_ENOUGH": (409, "마일리지가 부족합니다."),
    "COMMUNITY_MEMBERSHIP_REQUIRED": (403, "유료 회원만 클럽을 만들 수 있습니다."),
    "COMMUNITY_DEMO_UNAVAILABLE": (409, "지금은 시연용 유료 회원을 시작할 수 없습니다."),
    "COMMUNITY_CHALLENGE_NOT_FOUND": (404, "챌린지를 찾을 수 없습니다."),
    "COMMUNITY_CLUB_OWNER_ONLY": (403, "클럽장만 할 수 있는 작업입니다."),
    "COMMUNITY_CLUB_BANNED": (403, "이 클럽에서 내보내져 다시 가입할 수 없습니다."),
    "COMMUNITY_FORBIDDEN": (403, "권한이 없습니다."),
    "COMMUNITY_DM_NOT_ALLOWED": (403, "서로 팔로우한 사이에서만 대화를 시작할 수 있습니다."),
    "COMMUNITY_CONVERSATION_NOT_FOUND": (404, "대화를 찾을 수 없습니다."),
    "COMMUNITY_MESSAGE_NOT_FOUND": (404, "메시지를 찾을 수 없습니다."),
    "COMMUNITY_CHALLENGE_ENDED": (409, "이미 끝난 챌린지입니다."),
    "COMMUNITY_CHALLENGE_NOT_JOINED": (409, "챌린지에 먼저 참여해 주세요."),
    "COMMUNITY_CHALLENGE_NOT_COMPLETED": (409, "아직 목표를 달성하지 못했습니다."),
    "COMMUNITY_CHALLENGE_ALREADY_CLAIMED": (409, "이미 보상을 받았습니다."),
    "VALIDATION_ERROR": (422, "입력값을 확인해 주세요."),
    "FILE_TOO_LARGE": (413, "사진은 한 장에 5MB 이하만 올릴 수 있습니다."),
    "UNSUPPORTED_IMAGE": (415, "JPEG, PNG, WebP 사진만 올릴 수 있습니다."),
    "DATA_SOURCE_ERROR": (502, "커뮤니티 데이터를 처리하지 못했습니다."),
}


# Raised by the account-deletion write guard (autofit_integrity) if a write slips past the
# RPC checks, e.g. a direct table write during begin_account_deletion.
ACCOUNT_GUARD_MESSAGES = {"Account deletion is in progress", "Account is unavailable"}


class UpstreamRejected(HTTPException):
    """The database answered with an error, so nothing from this call was written."""


def fail(code: str, *, rejected: bool = False) -> NoReturn:
    status_code, message = ERRORS.get(code, ERRORS["DATA_SOURCE_ERROR"])
    error = UpstreamRejected if rejected else HTTPException
    raise error(status_code, detail={"code": code, "message": message, "fields": None})


def trimmed(value: Any) -> Any:
    return (value.strip() or None) if isinstance(value, str) else value


class CreatePostRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str | None = Field(default=None, max_length=500)
    upload_ids: list[UUID] = Field(
        default_factory=list, max_length=MAX_IMAGES,
        description="POST /api/community/images 로 받은 upload_id. 보낸 순서대로 사진이 보입니다.",
    )

    @field_validator("content", mode="before")
    @classmethod
    def trim_content(cls, value: Any) -> Any:
        return trimmed(value)

    @model_validator(mode="after")
    def require_body(self) -> "CreatePostRequest":
        if self.content is None and not self.upload_ids:
            raise ValueError("content or upload_ids is required")
        if len(set(self.upload_ids)) != len(self.upload_ids):
            raise ValueError("upload_ids must be unique")
        return self


class CreateCommentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=300)

    @field_validator("content", mode="before")
    @classmethod
    def trim_content(cls, value: Any) -> Any:
        return trimmed(value)


class ReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_type: Literal["post", "comment", "user"]
    target_id: UUID
    reason: Literal["spam", "abuse", "sexual", "misinformation", "privacy", "other"]
    detail: str | None = Field(default=None, max_length=300)

    @field_validator("detail", mode="before")
    @classmethod
    def trim_detail(cls, value: Any) -> Any:
        return trimmed(value)


class CommunityAuthor(BaseModel):
    user_id: UUID
    nickname: str
    profile_image_url: str | None = None


class CommunityImage(BaseModel):
    url: str | None = Field(description="1시간 동안 유효한 비공개 사진 주소. 서명에 실패하면 null")
    width: int
    height: int


class CommunityPost(BaseModel):
    feed_item_id: UUID = Field(description="피드 항목 ID. 공유된 항목이면 공유 기록 ID, 아니면 post_id 와 같음")
    feed_created_at: datetime = Field(description="피드에 올라온 시각(공유 시각 또는 작성 시각)")
    reposted_by: CommunityAuthor | None = Field(description="공유한 사람. 원글이면 null")
    post_id: UUID = Field(description="원글 ID. 좋아요·공유·댓글·삭제·신고는 이 ID 로 요청")
    author: CommunityAuthor
    content: str | None
    images: list[CommunityImage]
    like_count: int
    comment_count: int
    repost_count: int
    liked_by_me: bool
    reposted_by_me: bool
    is_mine: bool
    created_at: datetime


class CommunityFeedPage(BaseModel):
    items: list[CommunityPost]
    next_cursor: str | None = Field(description="다음 페이지 요청에 cursor 로 그대로 전달. 마지막이면 null")


class CommunityComment(BaseModel):
    comment_id: UUID
    post_id: UUID
    author: CommunityAuthor
    content: str
    created_at: datetime
    is_mine: bool
    can_delete: bool = Field(description="댓글 작성자 또는 글 작성자이면 true")


class CommunityCommentPage(BaseModel):
    items: list[CommunityComment]
    next_cursor: str | None


class CommunityLikeState(BaseModel):
    post_id: UUID
    liked: bool
    like_count: int


class CommunityRepostState(BaseModel):
    post_id: UUID
    reposted: bool
    repost_count: int


class CommunityBlockState(BaseModel):
    user_id: UUID
    blocked: bool


class CommunityBlockedUser(CommunityAuthor):
    blocked_at: datetime


class CommunityProfile(CommunityAuthor):
    post_count: int = Field(description="공유를 뺀 글 수")
    follower_count: int
    following_count: int
    is_me: bool
    followed_by_me: bool
    follows_me: bool


class CommunityFollowState(BaseModel):
    user_id: UUID
    following: bool
    follower_count: int


class CommunityFollowUser(CommunityAuthor):
    followed_at: datetime
    is_me: bool
    followed_by_me: bool = Field(description="내가 이 사용자를 팔로우하고 있으면 true")


class CommunityFollowPage(BaseModel):
    items: list[CommunityFollowUser]
    next_cursor: str | None


class CommunityNotification(BaseModel):
    notification_id: UUID
    type: Literal["follow", "like", "comment", "repost"]
    actor: CommunityAuthor = Field(description="알림을 만든 사람")
    post_id: UUID | None = Field(description="좋아요·댓글·공유한 내 글. 팔로우면 null")
    comment_id: UUID | None
    post_preview: str | None = Field(description="글 앞부분 80자")
    comment_preview: str | None = Field(description="댓글 앞부분 80자")
    created_at: datetime
    is_read: bool


class CommunityNotificationPage(BaseModel):
    items: list[CommunityNotification]
    next_cursor: str | None


class CommunityUnreadCount(BaseModel):
    unread_count: int


ClubCategory = Literal["running", "strength", "diet", "yoga", "hiking", "cycling", "sports", "etc"]


class CreateClubRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=30)
    description: str | None = Field(default=None, max_length=300)
    category: ClubCategory

    @field_validator("name", "description", mode="before")
    @classmethod
    def trim_text(cls, value: Any) -> Any:
        return trimmed(value)


class CommunityRule(BaseModel):
    rule_key: str
    amount: int
    daily_limit: int | None
    enabled: bool
    note: str | None = Field(description="팀이 정하기 전 임시값이면 '임시값'으로 시작")


class CommunityMileage(BaseModel):
    balance: int
    earned_today: int
    rules: list[CommunityRule]


class CommunityMileageEntry(BaseModel):
    entry_id: UUID
    amount: int = Field(description="적립은 +, 사용은 -")
    reason: Literal["workout", "meal_log", "club_create", "challenge"]
    created_at: datetime


class CommunityMileagePage(BaseModel):
    items: list[CommunityMileageEntry]
    next_cursor: str | None


class CommunityMembership(BaseModel):
    active: bool
    plan: str | None
    source: Literal["demo"] | None = Field(description="demo = 결제 없는 시연용")
    expires_at: datetime | None
    demo_available: bool
    demo_days: int | None


class CommunityClub(BaseModel):
    club_id: UUID
    name: str
    description: str | None
    category: ClubCategory
    owner: CommunityAuthor
    member_count: int
    post_count: int
    is_member: bool
    is_owner: bool
    created_at: datetime


class CommunityCreatedClub(CommunityClub):
    paid_with: Literal["membership", "mileage"]
    mileage_spent: int


class CommunityClubPage(BaseModel):
    items: list[CommunityClub]
    next_cursor: str | None


class CommunityClubMembershipState(BaseModel):
    club_id: UUID
    joined: bool
    member_count: int


class CommunityChallenge(BaseModel):
    challenge_id: UUID
    title: str
    description: str | None
    metric: Literal["workout_days", "meal_log_days"] = Field(
        description="workout_days = 운동 완료한 날 수, meal_log_days = 식단 기록한 날 수 (한국 날짜)")
    goal: int
    starts_on: date
    ends_on: date
    reward_mileage: int
    note: str | None = Field(description="팀이 정하기 전 임시값이면 '임시값'으로 시작")
    phase: Literal["upcoming", "ongoing", "ended"]
    participant_count: int
    joined: bool
    progress: int = Field(description="기간 안에 달성한 날 수 (목표를 넘으면 목표 값)")
    completed: bool
    rewarded: bool
    can_claim: bool


class CommunityRankingEntry(CommunityAuthor):
    rank: int
    score: int
    is_me: bool


class CommunityRankingMe(BaseModel):
    rank: int
    score: int


class CommunityRanking(BaseModel):
    metric: Literal["workout", "mileage"]
    scope: Literal["all", "following", "club"]
    week_start: date
    week_end: date
    participating: bool = Field(description="내가 랭킹 공개에 참여 중인지. 참여한 사람만 순위에 보인다")
    items: list[CommunityRankingEntry]
    me: CommunityRankingMe | None = Field(description="내 순위. 참여하지 않았거나 이번 주 기록이 없으면 null")


class CommunityRankingParticipation(BaseModel):
    participating: bool


class CommunityClubMember(CommunityAuthor):
    role: Literal["owner", "member"]
    joined_at: datetime
    is_me: bool
    followed_by_me: bool


class CommunityClubMemberPage(BaseModel):
    items: list[CommunityClubMember]
    next_cursor: str | None


class CommunityClubMemberCount(BaseModel):
    club_id: UUID
    member_count: int


class ModerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_type: Literal["post", "comment", "user"]
    target_id: UUID
    action: Literal["hide", "unhide", "dismiss"] = Field(description="사용자 신고는 dismiss 만 가능")


class CommunityModeratorStatus(BaseModel):
    is_moderator: bool


class CommunityReportDetail(BaseModel):
    reason: str
    detail: str


class CommunityReportItem(BaseModel):
    target_type: Literal["post", "comment", "user"]
    target_id: UUID
    target_user: CommunityAuthor = Field(description="신고된 글·댓글의 작성자 또는 신고된 사용자")
    report_count: int
    reasons: list[str]
    details: list[CommunityReportDetail]
    content_snapshot: str | None = Field(description="신고 당시 글·댓글 내용")
    latest_reported_at: datetime
    post_id: UUID | None = Field(description="글이면 그 글, 댓글이면 댓글이 달린 글")
    exists: bool
    hidden: bool
    last_action: Literal["hide", "unhide", "dismiss"] | None
    last_action_at: datetime | None


class CommunityModerationResult(BaseModel):
    target_type: Literal["post", "comment", "user"]
    target_id: UUID
    action: Literal["hide", "unhide", "dismiss"]


class OpenConversationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID


class SendMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=1000)

    @field_validator("content", mode="before")
    @classmethod
    def trim_content(cls, value: Any) -> Any:
        return trimmed(value)


class CommunityLastMessage(BaseModel):
    content: str
    created_at: datetime
    is_mine: bool


class CommunityConversation(BaseModel):
    conversation_id: UUID
    other: CommunityAuthor
    last_message: CommunityLastMessage | None
    last_message_at: datetime | None
    unread_count: int
    can_send: bool


class CommunityConversationPage(BaseModel):
    items: list[CommunityConversation]
    next_cursor: str | None


class CommunityMessage(BaseModel):
    message_id: UUID
    conversation_id: UUID
    content: str
    created_at: datetime
    is_mine: bool


class CommunityMessagePage(BaseModel):
    items: list[CommunityMessage] = Field(description="최신순. 화면에서는 아래부터 쌓아 보여 준다")
    next_cursor: str | None = Field(description="더 오래된 메시지")


class CommunityConversationRead(BaseModel):
    conversation_id: UUID
    unread_count: int


class CommunityUpload(BaseModel):
    upload_id: UUID
    width: int
    height: int


class CommunityReportResult(BaseModel):
    reported: bool


def parse(model: type[BaseModel], payload: Any) -> Any:
    try:
        return model.model_validate(payload)
    except ValidationError:
        logger.warning("[community] unexpected database response model=%s", model.__name__)
        fail("DATA_SOURCE_ERROR")


def parse_rows(model: type[BaseModel], payload: Any) -> list[Any]:
    if not isinstance(payload, list):
        fail("DATA_SOURCE_ERROR")
    return [parse(model, row) for row in payload]


def encode_cursor(scope: str, created_at: Any, item_id: Any) -> str:
    return base64.urlsafe_b64encode(json.dumps([scope, str(created_at), str(item_id)]).encode()).decode()


def decode_cursor(cursor: str | None, scope: str) -> tuple[str | None, str | None]:
    if not cursor:
        return None, None
    try:
        saved_scope, timestamp, item_id = json.loads(base64.urlsafe_b64decode(cursor.encode()))
        if saved_scope != scope:
            raise ValueError("cursor belongs to another list")
        moment = datetime.fromisoformat(timestamp)
        if moment.tzinfo is None:
            raise ValueError("cursor time has no timezone")
        # Re-serialize typed values so only a timestamp and a UUID reach SQL.
        return moment.isoformat(), str(UUID(item_id))
    except (ValueError, TypeError, UnicodeError):
        fail("VALIDATION_ERROR")


def prepare_image(content: bytes) -> tuple[bytes, int, int]:
    """Re-encode to a bounded JPEG: fixes phone rotation and drops EXIF (GPS) metadata."""
    if not (content.startswith(b"\xff\xd8\xff") or content.startswith(b"\x89PNG\r\n\x1a\n")
            or (content[:4] == b"RIFF" and content[8:12] == b"WEBP")):
        fail("UNSUPPORTED_IMAGE")
    try:
        with Image.open(BytesIO(content)) as source:
            if source.width * source.height > MAX_PIXELS:
                fail("UNSUPPORTED_IMAGE")
            image = ImageOps.exif_transpose(source)
            if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
                rgba = image.convert("RGBA")
                image = Image.new("RGB", rgba.size, (255, 255, 255))
                image.paste(rgba, mask=rgba.getchannel("A"))
            elif image.mode != "RGB":
                image = image.convert("RGB")
            image.thumbnail((MAX_EDGE, MAX_EDGE))
            output = BytesIO()
            image.save(output, "JPEG", quality=JPEG_QUALITY, optimize=True)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        fail("UNSUPPORTED_IMAGE")
    return output.getvalue(), image.width, image.height


class CommunityStore:
    def __init__(self, settings: Any, user_id: str):
        self.url = settings.supabase_url
        self.user_id = user_id
        key = settings.supabase_service_role_key
        self.headers = {"apikey": key}
        if not key.startswith("sb_secret_"):
            self.headers["Authorization"] = f"Bearer {key}"

    async def rpc(self, name: str, /, **params: Any) -> Any:
        body = {f"p_{key}": value for key, value in params.items()}
        try:
            async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
                response = await client.post(f"{self.url}/rest/v1/rpc/{name}", headers=self.headers, json=body)
            payload = response.json() if response.content else None
        except (httpx.HTTPError, ValueError):
            fail("DATA_SOURCE_ERROR")
        if response.is_error:
            code = payload.get("message") if isinstance(payload, dict) else None
            if code in ACCOUNT_GUARD_MESSAGES:
                code = "COMMUNITY_ACCOUNT_UNAVAILABLE"
            if isinstance(code, str) and code.startswith("COMMUNITY_") and code in ERRORS:
                fail(code, rejected=True)
            logger.warning("[community] rpc=%s rejected upstream_status=%s", name, response.status_code)
            fail("DATA_SOURCE_ERROR", rejected=True)
        return payload

    async def upload_object(self, path: str, content: bytes) -> None:
        try:
            async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
                response = await client.post(
                    f"{self.url}/storage/v1/object/{BUCKET}/{path}",
                    headers={**self.headers, "Content-Type": "image/jpeg"}, content=content,
                )
        except httpx.HTTPError:
            fail("DATA_SOURCE_ERROR")
        if not response.is_success:
            logger.warning("[community] photo upload rejected upstream_status=%s", response.status_code)
            fail("DATA_SOURCE_ERROR")

    async def remove_objects(self, paths: list[str]) -> None:
        """Best effort: a leftover private file must not fail the user's action."""
        paths = [path for path in paths if isinstance(path, str) and path]
        if not paths:
            return
        try:
            async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
                response = await client.request(
                    "DELETE", f"{self.url}/storage/v1/object/{BUCKET}", headers=self.headers,
                    json={"prefixes": paths},
                )
            if not response.is_success:
                logger.warning("[community] photo removal rejected upstream_status=%s", response.status_code)
        except httpx.HTTPError:
            logger.warning("[community] photo removal unavailable")

    async def remove_stale_uploads(self) -> None:
        try:
            paths = await self.rpc("community_claim_stale_uploads", user_id=self.user_id)
        except HTTPException:
            logger.warning("[community] stale upload cleanup skipped")
            return
        if isinstance(paths, list):
            await self.remove_objects(paths)

    async def signed_urls(self, paths: list[str]) -> dict[str, str]:
        async with httpx.AsyncClient(timeout=10, trust_env=False) as client:
            response = await client.post(
                f"{self.url}/storage/v1/object/sign/{BUCKET}", headers=self.headers,
                json={"expiresIn": URL_TTL, "paths": paths},
            )
        if not response.is_success:
            raise httpx.HTTPStatusError("signing rejected", request=response.request, response=response)
        urls = {}
        for row in response.json():
            signed = row.get("signedURL") if isinstance(row, dict) else None
            if isinstance(signed, str) and signed.startswith("/") and not signed.startswith("//"):
                urls[row.get("path")] = f"{self.url}/storage/v1{signed}"
        return urls

    async def attach_image_urls(self, posts: list[Any]) -> None:
        images = [image for post in posts if isinstance(post, dict)
                  for image in (post.get("images") or []) if isinstance(image, dict)]
        paths = sorted({image["path"] for image in images if isinstance(image.get("path"), str)})
        urls: dict[str, str] = {}
        if paths:
            try:
                urls = await self.signed_urls(paths)
            except (httpx.HTTPError, ValueError, AttributeError):
                # Photos are optional decoration; posts stay readable without them.
                logger.warning("[community] photo URL signing failed")
        for image in images:
            image["url"] = urls.get(image.pop("path", None))

    async def posts(self, payload: Any) -> list[Any]:
        if not isinstance(payload, list):
            fail("DATA_SOURCE_ERROR")
        await self.attach_image_urls(payload)
        return parse_rows(CommunityPost, payload)

    async def post(self, payload: Any) -> Any:
        return (await self.posts([payload]))[0]


def page_cursor(rows: list[Any], limit: int, scope: str, time_key: str, id_key: str) -> str | None:
    if len(rows) <= limit:
        return None
    last = rows[limit - 1]
    return encode_cursor(scope, last.get(time_key), last.get(id_key)) if isinstance(last, dict) else None


def create_community_router(current_user_dependency: Any, settings_dependency: Any) -> APIRouter:
    router = APIRouter(prefix="/api/community", tags=["Community"])

    async def timeline(store: CommunityStore, scope: str, target: UUID | None, cursor: str | None,
                       limit: int, cursor_scope: str) -> dict[str, Any]:
        before_at, before_id = decode_cursor(cursor, cursor_scope)
        rows = await store.rpc("community_timeline", viewer=store.user_id, scope=scope,
                               user_id=str(target) if target else None, before_created_at=before_at,
                               before_item_id=before_id, limit=limit + 1)
        if not isinstance(rows, list):
            fail("DATA_SOURCE_ERROR")
        return {"items": await store.posts(rows[:limit]),
                "next_cursor": page_cursor(rows, limit, cursor_scope, "feed_created_at", "feed_item_id")}

    @router.get("/feed", response_model=CommunityFeedPage,
                summary="피드를 최신순으로 조회 (공유 포함, 차단·신고한 글 제외)")
    async def get_feed(
        scope: Literal["all", "following"] = Query(
            default="all", description="all = 전체, following = 내가 팔로우한 사람과 내 글"),
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        store = CommunityStore(settings, user.id)
        return await timeline(store, scope, None, cursor, limit, "feed" if scope == "all" else f"feed:{scope}")

    @router.post("/images", status_code=201, response_model=CommunityUpload,
                 responses={413: {"description": "Photo exceeds 5 MiB"},
                            415: {"description": "Unsupported image format"},
                            429: {"description": "Too many unposted photos"}},
                 summary="글에 붙일 사진 1장 올리기 (글 하나에 최대 5장, 위치정보 제거)")
    async def post_image(
        file: UploadFile = File(...),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        try:
            content = await file.read(MAX_UPLOAD_BYTES + 1)
        finally:
            await file.close()
        if len(content) > MAX_UPLOAD_BYTES:
            fail("FILE_TOO_LARGE")
        data, width, height = await run_in_threadpool(prepare_image, content)
        store = CommunityStore(settings, user.id)
        await store.remove_stale_uploads()
        path = f"{user.id}/{uuid4()}.jpg"
        await store.upload_object(path, data)
        try:
            row = await store.rpc("community_register_upload", user_id=user.id, storage_path=path,
                                  width=width, height=height)
        except UpstreamRejected:
            # Only an explicit rejection proves nothing was saved; a timeout may have committed.
            await store.remove_objects([path])
            raise
        return parse(CommunityUpload, row)

    @router.post("/posts", status_code=201, response_model=CommunityPost,
                 responses={409: {"description": "Nickname required or photo already used"},
                            429: {"description": "Posting too fast"}},
                 summary="글 쓰기 (글자 500자 이하, 사진 최대 5장)")
    async def create_post(
        body: CreatePostRequest,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        row = await store.rpc("community_create_post", user_id=user.id, content=body.content,
                              upload_ids=[str(upload_id) for upload_id in body.upload_ids])
        return await store.post(row)

    @router.get("/posts/{post_id}", response_model=CommunityPost, summary="글 하나 조회")
    async def get_post(
        post_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return await store.post(await store.rpc("community_get_post", viewer=user.id, post_id=str(post_id)))

    @router.delete("/posts/{post_id}", status_code=204, summary="내 글 삭제 (사진·좋아요·댓글·공유 함께 삭제)")
    async def delete_post(
        post_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Response:
        store = CommunityStore(settings, user.id)
        result = await store.rpc("community_delete_post", user_id=user.id, post_id=str(post_id))
        paths = result.get("image_paths") if isinstance(result, dict) else None
        if isinstance(paths, list):
            await store.remove_objects(paths)
        return Response(status_code=204)

    async def set_like(post_id: UUID, liked: bool, user: Any, settings: Any) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityLikeState, await store.rpc(
            "community_set_like", user_id=user.id, post_id=str(post_id), liked=liked))

    @router.put("/posts/{post_id}/like", response_model=CommunityLikeState, summary="좋아요")
    async def like_post(
        post_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_like(post_id, True, user, settings)

    @router.delete("/posts/{post_id}/like", response_model=CommunityLikeState, summary="좋아요 취소")
    async def unlike_post(
        post_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_like(post_id, False, user, settings)

    async def set_repost(post_id: UUID, reposted: bool, user: Any, settings: Any) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityRepostState, await store.rpc(
            "community_set_repost", user_id=user.id, post_id=str(post_id), reposted=reposted))

    @router.put("/posts/{post_id}/repost", response_model=CommunityRepostState,
                summary="공유 (내 팔로워 피드에 다시 올리기)")
    async def repost_post(
        post_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_repost(post_id, True, user, settings)

    @router.delete("/posts/{post_id}/repost", response_model=CommunityRepostState, summary="공유 취소")
    async def unrepost_post(
        post_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_repost(post_id, False, user, settings)

    @router.get("/posts/{post_id}/comments", response_model=CommunityCommentPage,
                summary="댓글 목록 (오래된 순)")
    async def get_comments(
        post_id: UUID,
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        scope = f"comments:{post_id}"
        after_at, after_id = decode_cursor(cursor, scope)
        store = CommunityStore(settings, user.id)
        rows = await store.rpc("community_comments", viewer=user.id, post_id=str(post_id),
                               after_created_at=after_at, after_comment_id=after_id, limit=limit + 1)
        if not isinstance(rows, list):
            fail("DATA_SOURCE_ERROR")
        return {"items": parse_rows(CommunityComment, rows[:limit]),
                "next_cursor": page_cursor(rows, limit, scope, "created_at", "comment_id")}

    @router.post("/posts/{post_id}/comments", status_code=201, response_model=CommunityComment,
                 summary="댓글 쓰기 (300자 이하)")
    async def create_comment(
        post_id: UUID, body: CreateCommentRequest,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityComment, await store.rpc(
            "community_add_comment", user_id=user.id, post_id=str(post_id), content=body.content))

    @router.delete("/comments/{comment_id}", status_code=204,
                   summary="댓글 삭제 (댓글 작성자 또는 글 작성자)")
    async def delete_comment(
        comment_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Response:
        store = CommunityStore(settings, user.id)
        await store.rpc("community_delete_comment", user_id=user.id, comment_id=str(comment_id))
        return Response(status_code=204)

    @router.post("/reports", status_code=201, response_model=CommunityReportResult,
                 summary="글·댓글·사용자 신고 (신고한 글·댓글은 바로 내 화면에서 숨김)")
    async def report(
        body: ReportRequest,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityReportResult, await store.rpc(
            "community_report", reporter=user.id, target_type=body.target_type,
            target_id=str(body.target_id), reason=body.reason, detail=body.detail))

    @router.get("/blocks", response_model=list[CommunityBlockedUser], summary="내가 차단한 사용자 목록")
    async def get_blocks(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse_rows(CommunityBlockedUser, await store.rpc("community_blocked_users", user_id=user.id))

    async def set_block(target: UUID, blocked: bool, user: Any, settings: Any) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityBlockState, await store.rpc(
            "community_set_block", user_id=user.id, target_user_id=str(target), blocked=blocked))

    @router.put("/blocks/{user_id}", response_model=CommunityBlockState,
                summary="사용자 차단 (서로의 글·댓글이 보이지 않음)")
    async def block_user(
        user_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_block(user_id, True, user, settings)

    @router.delete("/blocks/{user_id}", response_model=CommunityBlockState, summary="차단 해제")
    async def unblock_user(
        user_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_block(user_id, False, user, settings)

    async def profile(viewer: str, target: str, settings: Any) -> Any:
        store = CommunityStore(settings, viewer)
        return parse(CommunityProfile, await store.rpc("community_profile", viewer=viewer, user_id=target))

    @router.get("/users/me", response_model=CommunityProfile, summary="내 커뮤니티 프로필")
    async def get_my_profile(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await profile(user.id, user.id, settings)

    @router.get("/users/{user_id}", response_model=CommunityProfile,
                summary="프로필 (닉네임·사진·글 수·팔로워·팔로잉 수, 차단 관계면 404)")
    async def get_profile(
        user_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await profile(user.id, str(user_id), settings)

    @router.get("/users/{user_id}/posts", response_model=CommunityFeedPage,
                summary="이 사용자가 쓴 글과 공유한 글 (최신순)")
    async def get_user_posts(
        user_id: UUID,
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        store = CommunityStore(settings, user.id)
        return await timeline(store, "user", user_id, cursor, limit, f"user:{user_id}")

    async def follow_list(target: UUID, kind: str, cursor: str | None, limit: int,
                          user: Any, settings: Any) -> dict[str, Any]:
        scope = f"{kind}:{target}"
        before_at, before_id = decode_cursor(cursor, scope)
        store = CommunityStore(settings, user.id)
        rows = await store.rpc("community_follow_list", viewer=user.id, user_id=str(target), kind=kind,
                               before_created_at=before_at, before_user_id=before_id, limit=limit + 1)
        if not isinstance(rows, list):
            fail("DATA_SOURCE_ERROR")
        return {"items": parse_rows(CommunityFollowUser, rows[:limit]),
                "next_cursor": page_cursor(rows, limit, scope, "followed_at", "user_id")}

    @router.get("/users/{user_id}/followers", response_model=CommunityFollowPage,
                summary="이 사용자를 팔로우하는 사람 (최근순)")
    async def get_followers(
        user_id: UUID,
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        return await follow_list(user_id, "followers", cursor, limit, user, settings)

    @router.get("/users/{user_id}/following", response_model=CommunityFollowPage,
                summary="이 사용자가 팔로우하는 사람 (최근순)")
    async def get_following(
        user_id: UUID,
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        return await follow_list(user_id, "following", cursor, limit, user, settings)

    async def set_follow(target: UUID, following: bool, user: Any, settings: Any) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityFollowState, await store.rpc(
            "community_set_follow", user_id=user.id, target_user_id=str(target), following=following))

    @router.put("/follows/{user_id}", response_model=CommunityFollowState,
                responses={409: {"description": "Nickname required"}, 429: {"description": "Following too fast"}},
                summary="팔로우 (상대에게 알림)")
    async def follow_user(
        user_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_follow(user_id, True, user, settings)

    @router.delete("/follows/{user_id}", response_model=CommunityFollowState, summary="팔로우 취소")
    async def unfollow_user(
        user_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_follow(user_id, False, user, settings)

    @router.get("/notifications", response_model=CommunityNotificationPage,
                summary="내 알림 (팔로우·좋아요·댓글·공유, 최신순)")
    async def get_notifications(
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        before_at, before_id = decode_cursor(cursor, "notifications")
        store = CommunityStore(settings, user.id)
        rows = await store.rpc("community_notification_list", user_id=user.id, before_created_at=before_at,
                               before_id=before_id, limit=limit + 1)
        if not isinstance(rows, list):
            fail("DATA_SOURCE_ERROR")
        return {"items": parse_rows(CommunityNotification, rows[:limit]),
                "next_cursor": page_cursor(rows, limit, "notifications", "created_at", "notification_id")}

    @router.get("/notifications/unread-count", response_model=CommunityUnreadCount,
                summary="읽지 않은 알림 수 (배지용)")
    async def get_unread_count(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityUnreadCount, await store.rpc("community_unread_notification_count", user_id=user.id))

    @router.post("/notifications/read", response_model=CommunityUnreadCount, summary="알림 모두 읽음으로 표시")
    async def read_notifications(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityUnreadCount, await store.rpc("community_read_notifications", user_id=user.id))

    @router.get("/mileage", response_model=CommunityMileage,
                summary="마일리지 잔액 (열 때마다 운동 완료·식단 기록을 확인해 적립, 규칙은 임시값)")
    async def get_mileage(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityMileage, await store.rpc("community_sync_mileage", user_id=user.id))

    @router.get("/mileage/history", response_model=CommunityMileagePage, summary="마일리지 적립·사용 내역")
    async def get_mileage_history(
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        before_at, before_id = decode_cursor(cursor, "mileage")
        store = CommunityStore(settings, user.id)
        rows = await store.rpc("community_mileage_history", user_id=user.id, before_created_at=before_at,
                               before_id=before_id, limit=limit + 1)
        if not isinstance(rows, list):
            fail("DATA_SOURCE_ERROR")
        return {"items": parse_rows(CommunityMileageEntry, rows[:limit]),
                "next_cursor": page_cursor(rows, limit, "mileage", "created_at", "entry_id")}

    @router.get("/membership", response_model=CommunityMembership, summary="유료 회원 상태")
    async def get_membership(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityMembership, await store.rpc("community_membership", user_id=user.id))

    @router.post("/membership/demo", response_model=CommunityMembership,
                 responses={409: {"description": "Demo membership is switched off"}},
                 summary="시연용 유료 회원 시작 (실제 결제 없음)")
    async def start_demo_membership(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityMembership, await store.rpc("community_start_demo_membership", user_id=user.id))

    @router.get("/clubs", response_model=CommunityClubPage, summary="클럽 목록 (최신순)")
    async def get_clubs(
        scope: Literal["all", "mine"] = Query(default="all", description="all = 전체, mine = 내가 가입한 클럽"),
        category: ClubCategory | None = Query(default=None),
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        cursor_scope = f"clubs:{scope}:{category or ''}"
        before_at, before_id = decode_cursor(cursor, cursor_scope)
        store = CommunityStore(settings, user.id)
        rows = await store.rpc("community_club_list", viewer=user.id, scope=scope, category=category,
                               before_created_at=before_at, before_club_id=before_id, limit=limit + 1)
        if not isinstance(rows, list):
            fail("DATA_SOURCE_ERROR")
        return {"items": parse_rows(CommunityClub, rows[:limit]),
                "next_cursor": page_cursor(rows, limit, cursor_scope, "created_at", "club_id")}

    @router.post("/clubs", status_code=201, response_model=CommunityCreatedClub,
                 responses={403: {"description": "Membership required"},
                            409: {"description": "Name taken, club limit or not enough mileage"}},
                 summary="클럽 만들기 (유료 회원은 무료, 아니면 마일리지 사용)")
    async def create_club(
        body: CreateClubRequest,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityCreatedClub, await store.rpc(
            "community_create_club", user_id=user.id, name=body.name, description=body.description,
            category=body.category))

    @router.get("/clubs/{club_id}", response_model=CommunityClub, summary="클럽 정보")
    async def get_club(
        club_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityClub, await store.rpc("community_get_club", viewer=user.id, club_id=str(club_id)))

    async def set_club_membership(club_id: UUID, joined: bool, user: Any, settings: Any) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityClubMembershipState, await store.rpc(
            "community_set_club_membership", user_id=user.id, club_id=str(club_id), joined=joined))

    @router.put("/clubs/{club_id}/membership", response_model=CommunityClubMembershipState, summary="클럽 가입")
    async def join_club(
        club_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_club_membership(club_id, True, user, settings)

    @router.delete("/clubs/{club_id}/membership", response_model=CommunityClubMembershipState,
                   summary="클럽 나가기 (클럽장은 불가)")
    async def leave_club(
        club_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_club_membership(club_id, False, user, settings)

    @router.get("/clubs/{club_id}/posts", response_model=CommunityFeedPage, summary="클럽 글 (최신순)")
    async def get_club_posts(
        club_id: UUID,
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        scope = f"club:{club_id}"
        before_at, before_id = decode_cursor(cursor, scope)
        store = CommunityStore(settings, user.id)
        rows = await store.rpc("community_club_feed", viewer=user.id, club_id=str(club_id),
                               before_created_at=before_at, before_item_id=before_id, limit=limit + 1)
        if not isinstance(rows, list):
            fail("DATA_SOURCE_ERROR")
        return {"items": await store.posts(rows[:limit]),
                "next_cursor": page_cursor(rows, limit, scope, "feed_created_at", "feed_item_id")}

    @router.post("/clubs/{club_id}/posts", status_code=201, response_model=CommunityPost,
                 responses={403: {"description": "Members only"}},
                 summary="클럽에 글 쓰기 (가입한 사람만, 전체 피드에는 안 보임)")
    async def create_club_post(
        club_id: UUID, body: CreatePostRequest,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        row = await store.rpc("community_create_club_post", user_id=user.id, club_id=str(club_id),
                              content=body.content,
                              upload_ids=[str(upload_id) for upload_id in body.upload_ids])
        return await store.post(row)

    @router.get("/challenges", response_model=list[CommunityChallenge],
                summary="챌린지 목록 (진행 중·예정, 끝난 지 1주 이내) — 예시는 임시값")
    async def get_challenges(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse_rows(CommunityChallenge, await store.rpc("community_challenge_list", viewer=user.id))

    async def set_challenge(challenge_id: UUID, joined: bool, user: Any, settings: Any) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityChallenge, await store.rpc(
            "community_set_challenge_participation", user_id=user.id, challenge_id=str(challenge_id),
            joined=joined))

    @router.put("/challenges/{challenge_id}/participation", response_model=CommunityChallenge,
                summary="챌린지 참여 (마지막 날까지)")
    async def join_challenge(
        challenge_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_challenge(challenge_id, True, user, settings)

    @router.delete("/challenges/{challenge_id}/participation", response_model=CommunityChallenge,
                   summary="챌린지 참여 취소 (보상 받기 전까지)")
    async def leave_challenge(
        challenge_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_challenge(challenge_id, False, user, settings)

    @router.post("/challenges/{challenge_id}/claim", response_model=CommunityChallenge,
                 summary="챌린지 보상(마일리지) 받기 — 목표 달성 후 한 번")
    async def claim_challenge(
        challenge_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityChallenge, await store.rpc(
            "community_claim_challenge", user_id=user.id, challenge_id=str(challenge_id)))

    @router.get("/rankings", response_model=CommunityRanking,
                summary="이번 주 랭킹 (월~일, 참여를 켠 사람만)")
    async def get_ranking(
        metric: Literal["workout", "mileage"] = Query(
            default="workout", description="workout = 운동 완료 횟수, mileage = 적립한 마일리지"),
        scope: Literal["all", "following", "club"] = Query(default="all"),
        club_id: UUID | None = Query(default=None, description="scope=club 일 때만"),
        limit: int = Query(default=50, ge=1, le=100),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        if (scope == "club") != (club_id is not None):
            fail("VALIDATION_ERROR")
        store = CommunityStore(settings, user.id)
        return parse(CommunityRanking, await store.rpc(
            "community_ranking", viewer=user.id, metric=metric, scope=scope,
            club_id=str(club_id) if club_id else None, limit=limit))

    async def set_ranking(participating: bool, user: Any, settings: Any) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityRankingParticipation, await store.rpc(
            "community_set_ranking_participation", user_id=user.id, participating=participating))

    @router.put("/rankings/participation", response_model=CommunityRankingParticipation,
                summary="랭킹 공개 참여 (기본은 비공개)")
    async def join_ranking(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_ranking(True, user, settings)

    @router.delete("/rankings/participation", response_model=CommunityRankingParticipation,
                   summary="랭킹 공개 그만하기")
    async def leave_ranking(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        return await set_ranking(False, user, settings)

    @router.patch("/clubs/{club_id}", response_model=CommunityClub,
                  responses={403: {"description": "Owner only"}, 409: {"description": "Name taken"}},
                  summary="클럽 수정 (클럽장만: 이름·소개·관심사)")
    async def update_club(
        club_id: UUID, body: CreateClubRequest,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityClub, await store.rpc(
            "community_update_club", user_id=user.id, club_id=str(club_id), name=body.name,
            description=body.description, category=body.category))

    @router.delete("/clubs/{club_id}", status_code=204,
                   responses={403: {"description": "Owner only"}},
                   summary="클럽 삭제 (클럽장만, 클럽 글·사진·좋아요·댓글도 함께 삭제)")
    async def delete_club(
        club_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Response:
        store = CommunityStore(settings, user.id)
        result = await store.rpc("community_delete_club", user_id=user.id, club_id=str(club_id))
        paths = result.get("image_paths") if isinstance(result, dict) else None
        if isinstance(paths, list):
            await store.remove_objects(paths)
        return Response(status_code=204)

    @router.get("/clubs/{club_id}/members", response_model=CommunityClubMemberPage,
                summary="클럽 회원 목록 (가입한 순서)")
    async def get_club_members(
        club_id: UUID,
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        scope = f"members:{club_id}"
        after_at, after_id = decode_cursor(cursor, scope)
        store = CommunityStore(settings, user.id)
        rows = await store.rpc("community_club_member_list", viewer=user.id, club_id=str(club_id),
                               after_joined_at=after_at, after_user_id=after_id, limit=limit + 1)
        if not isinstance(rows, list):
            fail("DATA_SOURCE_ERROR")
        return {"items": parse_rows(CommunityClubMember, rows[:limit]),
                "next_cursor": page_cursor(rows, limit, scope, "joined_at", "user_id")}

    @router.delete("/clubs/{club_id}/members/{member_user_id}", response_model=CommunityClubMemberCount,
                   responses={403: {"description": "Owner only"}},
                   summary="회원 내보내기 (클럽장만, 다시 가입할 수 없음)")
    async def remove_club_member(
        club_id: UUID, member_user_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityClubMemberCount, await store.rpc(
            "community_remove_club_member", user_id=user.id, club_id=str(club_id),
            member_user_id=str(member_user_id)))

    @router.get("/moderation/status", response_model=CommunityModeratorStatus,
                summary="내가 신고 검토 관리자인지")
    async def get_moderator_status(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityModeratorStatus, await store.rpc("community_moderator_status", user_id=user.id))

    @router.get("/moderation/reports", response_model=list[CommunityReportItem],
                responses={403: {"description": "Moderators only"}},
                summary="신고 검토 목록 (관리자만, 신고자는 보이지 않음)")
    async def get_report_queue(
        status: Literal["open", "resolved"] = Query(default="open"),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse_rows(CommunityReportItem, await store.rpc(
            "community_report_queue", moderator=user.id, status=status, limit=100))

    @router.post("/moderation/actions", response_model=CommunityModerationResult,
                 responses={403: {"description": "Moderators only"}},
                 summary="신고 처리 (글·댓글 숨기기·되돌리기, 신고 넘기기)")
    async def moderate(
        body: ModerationRequest,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityModerationResult, await store.rpc(
            "community_moderate", moderator=user.id, target_type=body.target_type,
            target_id=str(body.target_id), action=body.action))

    @router.get("/conversations", response_model=CommunityConversationPage,
                summary="1:1 대화 목록 (최근 메시지 순)")
    async def get_conversations(
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        before_at, before_id = decode_cursor(cursor, "conversations")
        store = CommunityStore(settings, user.id)
        rows = await store.rpc("community_conversation_list", user_id=user.id, before_at=before_at,
                               before_id=before_id, limit=limit + 1)
        if not isinstance(rows, list):
            fail("DATA_SOURCE_ERROR")
        return {"items": parse_rows(CommunityConversation, rows[:limit]),
                "next_cursor": page_cursor(rows, limit, "conversations", "last_message_at", "conversation_id")}

    @router.post("/conversations", response_model=CommunityConversation,
                 responses={403: {"description": "Not following each other"}},
                 summary="대화 열기 (기존 대화, 또는 서로 팔로우한 사이면 새 대화)")
    async def open_conversation(
        body: OpenConversationRequest,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityConversation, await store.rpc(
            "community_open_conversation", user_id=user.id, target_user_id=str(body.user_id)))

    @router.get("/conversations/unread-count", response_model=CommunityUnreadCount,
                summary="읽지 않은 메시지 수 (배지용)")
    async def get_unread_messages(
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityUnreadCount, await store.rpc("community_unread_message_count", user_id=user.id))

    @router.get("/conversations/{conversation_id}/messages", response_model=CommunityMessagePage,
                summary="대화 메시지 (최신순, 화면을 연 동안 몇 초마다 다시 불러오기)")
    async def get_messages(
        conversation_id: UUID,
        cursor: str | None = Query(default=None, max_length=300),
        limit: int = Query(default=30, ge=1, le=MAX_PAGE_SIZE),
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> dict[str, Any]:
        scope = f"messages:{conversation_id}"
        before_at, before_id = decode_cursor(cursor, scope)
        store = CommunityStore(settings, user.id)
        rows = await store.rpc("community_message_list", user_id=user.id, conversation_id=str(conversation_id),
                               before_created_at=before_at, before_id=before_id, limit=limit + 1)
        if not isinstance(rows, list):
            fail("DATA_SOURCE_ERROR")
        return {"items": parse_rows(CommunityMessage, rows[:limit]),
                "next_cursor": page_cursor(rows, limit, scope, "created_at", "message_id")}

    @router.post("/conversations/{conversation_id}/messages", status_code=201, response_model=CommunityMessage,
                 responses={429: {"description": "Sending too fast"}},
                 summary="메시지 보내기 (1,000자 이하, 10분에 60개)")
    async def send_message(
        conversation_id: UUID, body: SendMessageRequest,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityMessage, await store.rpc(
            "community_send_message", user_id=user.id, conversation_id=str(conversation_id),
            content=body.content))

    @router.post("/conversations/{conversation_id}/read", response_model=CommunityConversationRead,
                 summary="대화 읽음 표시")
    async def read_conversation(
        conversation_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Any:
        store = CommunityStore(settings, user.id)
        return parse(CommunityConversationRead, await store.rpc(
            "community_read_conversation", user_id=user.id, conversation_id=str(conversation_id)))

    @router.delete("/messages/{message_id}", status_code=204, summary="내가 보낸 메시지 삭제 (양쪽 모두에서)")
    async def delete_message(
        message_id: UUID,
        user: Any = Depends(current_user_dependency), settings: Any = Depends(settings_dependency),
    ) -> Response:
        store = CommunityStore(settings, user.id)
        await store.rpc("community_delete_message", user_id=user.id, message_id=str(message_id))
        return Response(status_code=204)

    return router

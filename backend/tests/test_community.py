import json
from io import BytesIO

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import ExifTags, Image

from backend.app import community, main
from backend.tests.test_main import TEST_SETTINGS

USER = "3388350b-2b51-4784-a258-7d7f505fa311"
OTHER = "4cfd8a39-4b0c-4b8f-9d3c-7a7a3d0e1f22"
POST = "20261014-0000-4000-8000-000000000001"
POST_2 = "20261014-0000-4000-8000-000000000002"
POST_3 = "20261014-0000-4000-8000-000000000003"
UPLOAD_1 = "20261014-0000-4000-8000-000000000011"
UPLOAD_2 = "20261014-0000-4000-8000-000000000012"
COMMENT = "20261014-0000-4000-8000-000000000021"
COMMENT_2 = "20261014-0000-4000-8000-000000000022"
T1 = "2026-10-14T03:00:00.123456+00:00"
T2 = "2026-10-14T02:00:00.5+00:00"
T3 = "2026-10-14T01:00:00+00:00"


def author(user_id=OTHER, nickname="식단러"):
    return {"user_id": user_id, "nickname": nickname, "profile_image_url": None}


def post_row(post_id=POST, created_at=T1, images=(), **extra):
    return {"feed_item_id": post_id, "feed_created_at": created_at, "reposted_by": None,
            "post_id": post_id, "author": author(), "content": "샐러드 인증", "images": list(images),
            "like_count": 0, "comment_count": 0, "repost_count": 0, "liked_by_me": False,
            "reposted_by_me": False, "is_mine": False, "created_at": created_at, **extra}


def comment_row(comment_id=COMMENT, created_at=T1):
    return {"comment_id": comment_id, "post_id": POST, "author": author(), "content": "멋져요",
            "created_at": created_at, "is_mine": False, "can_delete": True}


def rejection(code, status=400):
    return httpx.Response(status, json={"code": "P0001", "message": code, "details": None, "hint": None})


class FakeSupabase:
    """Records every service-role request; answers like PostgREST and Supabase Storage."""

    def __init__(self):
        self.calls, self.rpc, self.uploaded, self.deleted = [], {}, {}, []
        self.sign_status = 200
        self.delete_status = 200

    def __call__(self, request):
        path = request.url.path
        is_json = request.headers.get("content-type", "").startswith("application/json")
        body = json.loads(request.content) if request.content and is_json else None
        self.calls.append((request.method, path, body))
        assert request.headers["apikey"] == TEST_SETTINGS.supabase_service_role_key
        if path.startswith("/rest/v1/rpc/"):
            result = self.rpc[path.rsplit("/", 1)[1]]
            result = result(request, body) if callable(result) else result
            return result if isinstance(result, httpx.Response) else httpx.Response(200, json=result)
        if path == f"/storage/v1/object/sign/{community.BUCKET}":
            if self.sign_status != 200:
                return httpx.Response(self.sign_status, json={"error": "rejected"})
            return httpx.Response(200, json=[
                {"path": p, "signedURL": f"/object/sign/{community.BUCKET}/{p}?token=t", "error": None}
                for p in body["paths"]])
        if request.method == "DELETE" and path == f"/storage/v1/object/{community.BUCKET}":
            self.deleted.extend(body["prefixes"])
            return httpx.Response(self.delete_status, json=[])
        if request.method == "POST" and path.startswith(f"/storage/v1/object/{community.BUCKET}/"):
            self.uploaded[path.split(f"/{community.BUCKET}/", 1)[1]] = (
                request.headers["content-type"], request.content)
            return httpx.Response(200, json={"Key": path})
        raise AssertionError(f"unexpected request {request.method} {path}")

    def bodies(self, name):
        return [body for _, path, body in self.calls if path == f"/rest/v1/rpc/{name}"]

    def count(self, prefix):
        return sum(1 for _, path, _ in self.calls if path.startswith(prefix))


@pytest.fixture
def supabase(monkeypatch):
    fake = FakeSupabase()
    original = httpx.AsyncClient
    monkeypatch.setattr(community.httpx, "AsyncClient",
                        lambda **kw: original(transport=httpx.MockTransport(fake), **kw))
    main.app.dependency_overrides[main.get_current_user] = lambda: main.AuthenticatedUser(id=USER)
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    yield fake
    main.app.dependency_overrides.pop(main.get_current_user, None)
    main.app.dependency_overrides.pop(main.get_settings, None)


@pytest.fixture
def client(supabase):
    return TestClient(main.app)


def jpeg(size=(40, 30), **save_options):
    output = BytesIO()
    Image.new("RGB", size, (200, 60, 60)).save(output, "JPEG", **save_options)
    return output.getvalue()


def test_feed_signs_all_photos_in_one_call_and_pages(client, supabase):
    photos = [{"path": f"{OTHER}/a.jpg", "width": 1200, "height": 900},
              {"path": f"{OTHER}/b.jpg", "width": 900, "height": 1200}]
    supabase.rpc["community_timeline"] = [post_row(POST, T1, photos), post_row(POST_2, T2, photos[:1]),
                                      post_row(POST_3, T3)]

    page = client.get("/api/community/feed", params={"limit": 2})

    assert page.status_code == 200
    body = page.json()
    assert [item["post_id"] for item in body["items"]] == [POST, POST_2]
    assert body["items"][0]["images"] == [
        {"url": f"https://example.supabase.co/storage/v1/object/sign/community-photos/{OTHER}/a.jpg?token=t",
         "width": 1200, "height": 900},
        {"url": f"https://example.supabase.co/storage/v1/object/sign/community-photos/{OTHER}/b.jpg?token=t",
         "width": 900, "height": 1200}]
    assert supabase.count("/storage/v1/object/sign/") == 1
    assert supabase.bodies("community_timeline")[0] == {
        "p_viewer": USER, "p_scope": "all", "p_user_id": None, "p_before_created_at": None,
        "p_before_item_id": None, "p_limit": 3}

    supabase.rpc["community_timeline"] = [post_row(POST_3, T3)]
    last = client.get("/api/community/feed", params={"limit": 2, "cursor": body["next_cursor"]})

    assert last.json()["next_cursor"] is None
    assert supabase.bodies("community_timeline")[1] == {
        "p_viewer": USER, "p_scope": "all", "p_user_id": None,
        "p_before_created_at": "2026-10-14T02:00:00.500000+00:00", "p_before_item_id": POST_2, "p_limit": 3}


@pytest.mark.parametrize("cursor", [
    "garbage",
    community.encode_cursor("comments:x", T1, POST),
    community.encode_cursor("feed", "2026-10-14T03:00:00", POST),
    community.encode_cursor("feed", T1, "not-a-uuid"),
])
def test_feed_rejects_tampered_cursors(client, supabase, cursor):
    response = client.get("/api/community/feed", params={"cursor": cursor})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "VALIDATION_ERROR"
    assert supabase.calls == []


def test_feed_stays_readable_when_photo_signing_fails(client, supabase):
    supabase.sign_status = 500
    supabase.rpc["community_timeline"] = [post_row(images=[{"path": f"{OTHER}/a.jpg", "width": 10, "height": 10}])]
    response = client.get("/api/community/feed")
    assert response.status_code == 200
    assert response.json()["items"][0]["images"] == [{"url": None, "width": 10, "height": 10}]


@pytest.mark.parametrize("payload", [
    {}, {"content": "   "}, {"content": "x" * 501},
    {"upload_ids": [UPLOAD_1] * 2},
    {"upload_ids": [f"20261014-0000-4000-8000-00000000003{i}" for i in range(6)]},
    {"content": "안녕", "user_id": OTHER},
])
def test_create_post_validates_before_database(client, supabase, payload):
    response = client.post("/api/community/posts", json=payload)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "VALIDATION_ERROR"
    assert supabase.calls == []


def test_create_post_trims_text_and_keeps_photo_order(client, supabase):
    supabase.rpc["community_create_post"] = post_row(is_mine=True, images=[
        {"path": f"{USER}/2.jpg", "width": 10, "height": 20}])
    response = client.post("/api/community/posts",
                           json={"content": "  오늘 오운완!  ", "upload_ids": [UPLOAD_2, UPLOAD_1]})
    assert response.status_code == 201
    assert response.json()["images"][0]["url"].endswith(f"{USER}/2.jpg?token=t")
    assert supabase.bodies("community_create_post") == [
        {"p_user_id": USER, "p_content": "오늘 오운완!", "p_upload_ids": [UPLOAD_2, UPLOAD_1]}]


@pytest.mark.parametrize("code,status", [
    ("COMMUNITY_NICKNAME_REQUIRED", 409), ("COMMUNITY_POST_NOT_FOUND", 404),
    ("COMMUNITY_RATE_LIMITED", 429), ("COMMUNITY_UPLOAD_INVALID", 409), ("COMMUNITY_SELF_TARGET", 422),
    ("COMMUNITY_ACCOUNT_UNAVAILABLE", 409),
])
def test_database_rules_become_coded_errors(client, supabase, code, status):
    supabase.rpc["community_create_post"] = rejection(code)
    response = client.post("/api/community/posts", json={"content": "안녕"})
    assert response.status_code == status
    assert response.json()["detail"] == {"code": code, "message": community.ERRORS[code][1], "fields": None}


@pytest.mark.parametrize("status,sqlstate,message", [
    (400, "23514", "Account deletion is in progress"),
    (409, "23503", "Account is unavailable"),
])
def test_account_deletion_guard_becomes_coded_error(client, supabase, status, sqlstate, message):
    # A write that reaches the autofit_integrity trigger during account deletion.
    supabase.rpc["community_create_post"] = httpx.Response(status, json={"code": sqlstate, "message": message})
    response = client.post("/api/community/posts", json={"content": "안녕"})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "COMMUNITY_ACCOUNT_UNAVAILABLE"


def test_unknown_database_failures_hide_details(client, supabase):
    supabase.rpc["community_create_post"] = httpx.Response(
        500, json={"message": 'relation "secret_table" does not exist'})
    response = client.post("/api/community/posts", json={"content": "안녕"})
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "DATA_SOURCE_ERROR"
    assert "secret_table" not in response.text

    def unavailable(request, body):
        raise httpx.ConnectError("down", request=request)

    supabase.rpc["community_timeline"] = unavailable
    assert client.get("/api/community/feed").status_code == 502


@pytest.mark.parametrize("payload", [{"oops": 1}, [{"post_id": POST}], None])
def test_malformed_database_responses_are_rejected(client, supabase, payload):
    supabase.rpc["community_timeline"] = httpx.Response(200, json=payload)
    response = client.get("/api/community/feed")
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "DATA_SOURCE_ERROR"


def test_upload_removes_location_and_fixes_phone_rotation(client, supabase):
    exif = Image.Exif()
    exif[ExifTags.Base.Orientation] = 6  # Stored sideways; viewers rotate 90 degrees clockwise.
    exif[ExifTags.Base.Make] = "PhoneMaker"
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    gps[ExifTags.GPS.GPSLatitudeRef] = "N"
    gps[ExifTags.GPS.GPSLatitude] = (37.0, 33.0, 59.0)
    original = jpeg((3000, 1000), exif=exif)
    with Image.open(BytesIO(original)) as check:
        assert check.getexif().get_ifd(ExifTags.IFD.GPSInfo)  # Precondition: the phone photo has GPS.
    supabase.rpc["community_claim_stale_uploads"] = []
    supabase.rpc["community_register_upload"] = lambda request, body: {
        "upload_id": UPLOAD_1, "width": body["p_width"], "height": body["p_height"]}

    response = client.post("/api/community/images", files={"file": ("phone.jpg", original, "image/jpeg")})

    assert response.status_code == 201
    [(path, (content_type, stored))] = supabase.uploaded.items()
    assert path.startswith(f"{USER}/") and path.endswith(".jpg")
    assert content_type == "image/jpeg"
    with Image.open(BytesIO(stored)) as saved:
        assert saved.format == "JPEG"
        assert len(saved.getexif()) == 0
        assert "exif" not in saved.info
        assert saved.height == 2048 and saved.width in (682, 683)
        size = saved.size
    assert response.json() == {"upload_id": UPLOAD_1, "width": size[0], "height": size[1]}
    assert supabase.bodies("community_register_upload") == [
        {"p_user_id": USER, "p_storage_path": path, "p_width": size[0], "p_height": size[1]}]


def test_upload_flattens_transparent_png(client, supabase):
    output = BytesIO()
    Image.new("RGBA", (20, 10), (0, 0, 0, 0)).save(output, "PNG")
    supabase.rpc["community_claim_stale_uploads"] = []
    supabase.rpc["community_register_upload"] = {"upload_id": UPLOAD_1, "width": 20, "height": 10}
    response = client.post("/api/community/images", files={"file": ("a.png", output.getvalue(), "image/png")})
    assert response.status_code == 201
    [(content_type, stored)] = supabase.uploaded.values()
    with Image.open(BytesIO(stored)) as saved:
        assert saved.mode == "RGB" and saved.getpixel((5, 5)) == (255, 255, 255)


@pytest.mark.parametrize("data,status,code", [
    (b"not an image", 415, "UNSUPPORTED_IMAGE"),
    (b"\xff\xd8\xff" + b"broken", 415, "UNSUPPORTED_IMAGE"),
    (b"\xff\xd8\xff" + b"x" * community.MAX_UPLOAD_BYTES, 413, "FILE_TOO_LARGE"),
], ids=["text", "broken-jpeg", "too-large"])
def test_upload_rejects_bad_files_without_storage(client, supabase, data, status, code):
    response = client.post("/api/community/images", files={"file": ("a.jpg", data, "image/jpeg")})
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code
    assert supabase.calls == []


def test_upload_rejects_pixel_bombs(monkeypatch):
    monkeypatch.setattr(community, "MAX_PIXELS", 100)
    with pytest.raises(community.HTTPException) as error:
        community.prepare_image(jpeg((20, 20)))
    assert error.value.status_code == 415


def test_upload_deletes_file_when_database_rejects(client, supabase):
    supabase.rpc["community_claim_stale_uploads"] = [f"{USER}/old.jpg"]
    supabase.rpc["community_register_upload"] = rejection("COMMUNITY_UPLOAD_LIMIT")
    response = client.post("/api/community/images", files={"file": ("a.jpg", jpeg(), "image/jpeg")})
    assert response.status_code == 429
    [path] = supabase.uploaded
    assert supabase.deleted == [f"{USER}/old.jpg", path]


def test_upload_keeps_file_when_database_result_is_unknown(client, supabase):
    def timeout(request, body):
        raise httpx.ReadTimeout("slow", request=request)

    supabase.rpc["community_claim_stale_uploads"] = []
    supabase.rpc["community_register_upload"] = timeout
    response = client.post("/api/community/images", files={"file": ("a.jpg", jpeg(), "image/jpeg")})
    assert response.status_code == 502
    assert len(supabase.uploaded) == 1
    assert supabase.deleted == []


@pytest.mark.parametrize("storage_status", [200, 500])
def test_delete_post_removes_its_photos(client, supabase, storage_status):
    supabase.delete_status = storage_status
    supabase.rpc["community_delete_post"] = {"deleted": True, "image_paths": [f"{USER}/a.jpg", f"{USER}/b.jpg"]}
    response = client.delete(f"/api/community/posts/{POST}")
    assert response.status_code == 204
    assert supabase.bodies("community_delete_post") == [{"p_user_id": USER, "p_post_id": POST}]
    assert supabase.deleted == [f"{USER}/a.jpg", f"{USER}/b.jpg"]


def test_get_post_and_toggles(client, supabase):
    supabase.rpc["community_get_post"] = post_row(liked_by_me=True)
    assert client.get(f"/api/community/posts/{POST}").json()["liked_by_me"] is True
    assert client.get("/api/community/posts/not-a-uuid").status_code == 422

    supabase.rpc["community_set_like"] = lambda request, body: {
        "post_id": POST, "liked": body["p_liked"], "like_count": int(body["p_liked"])}
    assert client.put(f"/api/community/posts/{POST}/like").json() == {"post_id": POST, "liked": True, "like_count": 1}
    assert client.delete(f"/api/community/posts/{POST}/like").json()["liked"] is False
    supabase.rpc["community_set_repost"] = lambda request, body: {
        "post_id": POST, "reposted": body["p_reposted"], "repost_count": 3}
    assert client.put(f"/api/community/posts/{POST}/repost").json()["reposted"] is True
    assert client.delete(f"/api/community/posts/{POST}/repost").json()["reposted"] is False
    assert [body["p_liked"] for body in supabase.bodies("community_set_like")] == [True, False]
    assert supabase.bodies("community_set_repost")[0] == {"p_user_id": USER, "p_post_id": POST, "p_reposted": True}


def test_comments_page_create_and_delete(client, supabase):
    supabase.rpc["community_comments"] = [comment_row(COMMENT, T3), comment_row(COMMENT_2, T2)]
    first = client.get(f"/api/community/posts/{POST}/comments", params={"limit": 1}).json()
    assert [item["comment_id"] for item in first["items"]] == [COMMENT]

    client.get(f"/api/community/posts/{POST}/comments", params={"limit": 1, "cursor": first["next_cursor"]})
    assert supabase.bodies("community_comments")[1] == {
        "p_viewer": USER, "p_post_id": POST, "p_after_created_at": "2026-10-14T01:00:00+00:00",
        "p_after_comment_id": COMMENT, "p_limit": 2}
    other_post = client.get(f"/api/community/posts/{POST_2}/comments", params={"cursor": first["next_cursor"]})
    assert other_post.status_code == 422

    assert client.post(f"/api/community/posts/{POST}/comments", json={"content": "   "}).status_code == 422
    supabase.rpc["community_add_comment"] = comment_row()
    created = client.post(f"/api/community/posts/{POST}/comments", json={"content": "  멋져요  "})
    assert created.status_code == 201
    assert supabase.bodies("community_add_comment") == [{"p_user_id": USER, "p_post_id": POST, "p_content": "멋져요"}]

    supabase.rpc["community_delete_comment"] = {"deleted": True, "post_id": POST}
    assert client.delete(f"/api/community/comments/{COMMENT}").status_code == 204


def test_reports_and_blocks(client, supabase):
    bad = client.post("/api/community/reports", json={"target_type": "post", "target_id": POST, "reason": "weird"})
    assert bad.status_code == 422
    supabase.rpc["community_report"] = {"reported": True}
    report = client.post("/api/community/reports", json={
        "target_type": "comment", "target_id": COMMENT, "reason": "abuse", "detail": "   "})
    assert report.status_code == 201
    assert supabase.bodies("community_report") == [{
        "p_reporter": USER, "p_target_type": "comment", "p_target_id": COMMENT,
        "p_reason": "abuse", "p_detail": None}]

    supabase.rpc["community_set_block"] = lambda request, body: {
        "user_id": body["p_target_user_id"], "blocked": body["p_blocked"]}
    assert client.put(f"/api/community/blocks/{OTHER}").json() == {"user_id": OTHER, "blocked": True}
    assert client.delete(f"/api/community/blocks/{OTHER}").json()["blocked"] is False
    supabase.rpc["community_blocked_users"] = [{**author(), "blocked_at": T1}]
    assert client.get("/api/community/blocks").json()[0]["nickname"] == "식단러"


def test_community_requires_login(monkeypatch):
    main.app.dependency_overrides[main.get_settings] = lambda: TEST_SETTINGS
    try:
        response = TestClient(main.app).get("/api/community/feed")
    finally:
        main.app.dependency_overrides.pop(main.get_settings, None)
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTH_REQUIRED"


def profile_row(user_id=OTHER, **extra):
    return {**author(user_id), "post_count": 3, "follower_count": 2, "following_count": 1, "is_me": False,
            "followed_by_me": True, "follows_me": False, **extra}


def test_following_feed_and_user_posts_use_their_own_cursor(client, supabase):
    supabase.rpc["community_timeline"] = [post_row(POST, T1), post_row(POST_2, T2)]
    first = client.get("/api/community/feed", params={"scope": "following", "limit": 1}).json()
    assert supabase.bodies("community_timeline")[0]["p_scope"] == "following"
    client.get("/api/community/feed", params={"scope": "following", "cursor": first["next_cursor"]})
    assert supabase.bodies("community_timeline")[1]["p_before_item_id"] == POST
    # A following-feed cursor cannot page the full feed or a profile.
    assert client.get("/api/community/feed", params={"cursor": first["next_cursor"]}).status_code == 422
    assert client.get(f"/api/community/users/{OTHER}/posts",
                      params={"cursor": first["next_cursor"]}).status_code == 422
    assert client.get("/api/community/feed", params={"scope": "user"}).status_code == 422

    posts = client.get(f"/api/community/users/{OTHER}/posts", params={"limit": 1})
    assert posts.status_code == 200
    assert supabase.bodies("community_timeline")[-1] == {
        "p_viewer": USER, "p_scope": "user", "p_user_id": OTHER, "p_before_created_at": None,
        "p_before_item_id": None, "p_limit": 2}


def test_profiles_and_follows(client, supabase):
    supabase.rpc["community_profile"] = lambda request, body: profile_row(
        body["p_user_id"], is_me=body["p_user_id"] == USER)
    assert client.get(f"/api/community/users/{OTHER}").json() == profile_row()
    me = client.get("/api/community/users/me").json()
    assert me["is_me"] is True and me["user_id"] == USER
    assert supabase.bodies("community_profile")[-1] == {"p_viewer": USER, "p_user_id": USER}
    assert client.get("/api/community/users/not-a-user").status_code == 422

    supabase.rpc["community_set_follow"] = lambda request, body: {
        "user_id": body["p_target_user_id"], "following": body["p_following"], "follower_count": 3}
    assert client.put(f"/api/community/follows/{OTHER}").json() == {
        "user_id": OTHER, "following": True, "follower_count": 3}
    assert client.delete(f"/api/community/follows/{OTHER}").json()["following"] is False
    assert supabase.bodies("community_set_follow")[0] == {
        "p_user_id": USER, "p_target_user_id": OTHER, "p_following": True}

    supabase.rpc["community_set_follow"] = rejection("COMMUNITY_NICKNAME_REQUIRED")
    blocked = client.put(f"/api/community/follows/{OTHER}")
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "COMMUNITY_NICKNAME_REQUIRED"
    supabase.rpc["community_profile"] = rejection("COMMUNITY_USER_NOT_FOUND")
    assert client.get(f"/api/community/users/{OTHER}").status_code == 404


def test_follow_lists_page_by_follow_time(client, supabase):
    rows = [{**author(USER, "나"), "followed_at": T1, "is_me": True, "followed_by_me": False},
            {**author(), "followed_at": T2, "is_me": False, "followed_by_me": True}]
    supabase.rpc["community_follow_list"] = rows
    first = client.get(f"/api/community/users/{OTHER}/followers", params={"limit": 1}).json()
    assert [item["user_id"] for item in first["items"]] == [USER]
    client.get(f"/api/community/users/{OTHER}/followers", params={"cursor": first["next_cursor"]})
    assert supabase.bodies("community_follow_list")[1] == {
        "p_viewer": USER, "p_user_id": OTHER, "p_kind": "followers",
        "p_before_created_at": "2026-10-14T03:00:00.123456+00:00", "p_before_user_id": USER, "p_limit": 21}
    wrong_list = client.get(f"/api/community/users/{OTHER}/following", params={"cursor": first["next_cursor"]})
    assert wrong_list.status_code == 422
    assert client.get(f"/api/community/users/{OTHER}/following").json()["next_cursor"] is None


def test_notifications_page_count_and_read(client, supabase):
    rows = [{"notification_id": COMMENT, "type": "comment", "actor": author(), "post_id": POST,
             "comment_id": COMMENT_2, "post_preview": "오운완", "comment_preview": "멋져요",
             "created_at": T1, "is_read": False},
            {"notification_id": COMMENT_2, "type": "follow", "actor": author(), "post_id": None,
             "comment_id": None, "post_preview": None, "comment_preview": None,
             "created_at": T2, "is_read": True}]
    supabase.rpc["community_notification_list"] = rows
    first = client.get("/api/community/notifications", params={"limit": 1}).json()
    assert first["items"][0]["type"] == "comment"
    client.get("/api/community/notifications", params={"cursor": first["next_cursor"]})
    assert supabase.bodies("community_notification_list")[1] == {
        "p_user_id": USER, "p_before_created_at": "2026-10-14T03:00:00.123456+00:00",
        "p_before_id": COMMENT, "p_limit": 21}

    supabase.rpc["community_unread_notification_count"] = {"unread_count": 4}
    assert client.get("/api/community/notifications/unread-count").json() == {"unread_count": 4}
    supabase.rpc["community_read_notifications"] = {"unread_count": 0}
    assert client.post("/api/community/notifications/read").json() == {"unread_count": 0}
    assert supabase.bodies("community_read_notifications") == [{"p_user_id": USER}]

    supabase.rpc["community_notification_list"] = [{**rows[0], "type": "mention"}]
    assert client.get("/api/community/notifications").status_code == 502


CLUB = "20261015-0000-4000-8000-000000000031"
CLUB_2 = "20261015-0000-4000-8000-000000000032"


def club_row(club_id=CLUB, created_at=T1, **extra):
    return {"club_id": club_id, "name": "아침 러닝", "description": None, "category": "running",
            "owner": author(), "member_count": 3, "post_count": 1, "is_member": False, "is_owner": False,
            "created_at": created_at, **extra}


def test_mileage_syncs_and_pages_history(client, supabase):
    rule = {"rule_key": "earn_workout", "amount": 10, "daily_limit": 1, "enabled": True,
            "note": "임시값(팀 결정 전)"}
    supabase.rpc["community_sync_mileage"] = {"balance": 35, "earned_today": 25, "rules": [rule]}
    assert client.get("/api/community/mileage").json()["balance"] == 35
    assert supabase.bodies("community_sync_mileage") == [{"p_user_id": USER}]

    entries = [{"entry_id": COMMENT, "amount": -30, "reason": "club_create", "created_at": T1},
               {"entry_id": COMMENT_2, "amount": 10, "reason": "workout", "created_at": T2}]
    supabase.rpc["community_mileage_history"] = entries
    first = client.get("/api/community/mileage/history", params={"limit": 1}).json()
    assert first["items"][0]["amount"] == -30
    client.get("/api/community/mileage/history", params={"cursor": first["next_cursor"]})
    assert supabase.bodies("community_mileage_history")[1]["p_before_id"] == COMMENT
    feed_cursor = client.get("/api/community/mileage/history", params={
        "cursor": community.encode_cursor("feed", T1, POST)})
    assert feed_cursor.status_code == 422


def test_demo_membership(client, supabase):
    state = {"active": True, "plan": "premium", "source": "demo", "expires_at": T1,
             "demo_available": True, "demo_days": 30}
    supabase.rpc["community_membership"] = {**state, "active": False, "plan": None, "source": None,
                                            "expires_at": None}
    assert client.get("/api/community/membership").json()["active"] is False
    supabase.rpc["community_start_demo_membership"] = state
    assert client.post("/api/community/membership/demo").json()["source"] == "demo"
    supabase.rpc["community_start_demo_membership"] = rejection("COMMUNITY_DEMO_UNAVAILABLE")
    off = client.post("/api/community/membership/demo")
    assert off.status_code == 409 and off.json()["detail"]["code"] == "COMMUNITY_DEMO_UNAVAILABLE"


@pytest.mark.parametrize("payload", [
    {"name": "아", "category": "running"},
    {"name": "아침 러닝", "category": "swimming"},
    {"name": "아침 러닝", "category": "running", "description": "x" * 301},
    {"name": "아침 러닝", "category": "running", "owner": USER},
])
def test_create_club_validates_before_database(client, supabase, payload):
    assert client.post("/api/community/clubs", json=payload).status_code == 422
    assert supabase.calls == []


def test_create_club_and_coded_errors(client, supabase):
    supabase.rpc["community_create_club"] = {**club_row(is_member=True, is_owner=True),
                                             "paid_with": "mileage", "mileage_spent": 500}
    created = client.post("/api/community/clubs", json={
        "name": "  아침 러닝  ", "description": "   ", "category": "running"})
    assert created.status_code == 201
    assert created.json()["paid_with"] == "mileage"
    assert supabase.bodies("community_create_club") == [{
        "p_user_id": USER, "p_name": "아침 러닝", "p_description": None, "p_category": "running"}]
    for code, status in [("COMMUNITY_MILEAGE_NOT_ENOUGH", 409), ("COMMUNITY_MEMBERSHIP_REQUIRED", 403),
                         ("COMMUNITY_CLUB_NAME_TAKEN", 409), ("COMMUNITY_CLUB_LIMIT", 409)]:
        supabase.rpc["community_create_club"] = rejection(code)
        response = client.post("/api/community/clubs", json={"name": "아침 러닝", "category": "running"})
        assert (response.status_code, response.json()["detail"]["code"]) == (status, code)


def test_club_list_join_and_posts(client, supabase):
    supabase.rpc["community_club_list"] = [club_row(CLUB, T1), club_row(CLUB_2, T2)]
    first = client.get("/api/community/clubs", params={"scope": "mine", "category": "running",
                                                       "limit": 1}).json()
    assert [club["club_id"] for club in first["items"]] == [CLUB]
    client.get("/api/community/clubs", params={"scope": "mine", "category": "running",
                                               "cursor": first["next_cursor"]})
    assert supabase.bodies("community_club_list")[1] == {
        "p_viewer": USER, "p_scope": "mine", "p_category": "running",
        "p_before_created_at": "2026-10-14T03:00:00.123456+00:00", "p_before_club_id": CLUB, "p_limit": 21}
    assert client.get("/api/community/clubs", params={"cursor": first["next_cursor"]}).status_code == 422

    supabase.rpc["community_get_club"] = club_row()
    assert client.get(f"/api/community/clubs/{CLUB}").json()["name"] == "아침 러닝"
    supabase.rpc["community_set_club_membership"] = lambda request, body: {
        "club_id": body["p_club_id"], "joined": body["p_joined"], "member_count": 4}
    assert client.put(f"/api/community/clubs/{CLUB}/membership").json()["joined"] is True
    supabase.rpc["community_set_club_membership"] = rejection("COMMUNITY_CLUB_OWNER")
    assert client.delete(f"/api/community/clubs/{CLUB}/membership").status_code == 409

    supabase.rpc["community_club_feed"] = [post_row(POST, T1), post_row(POST_2, T2)]
    page = client.get(f"/api/community/clubs/{CLUB}/posts", params={"limit": 1}).json()
    other_club = client.get(f"/api/community/clubs/{CLUB_2}/posts", params={"cursor": page["next_cursor"]})
    assert other_club.status_code == 422
    supabase.rpc["community_create_club_post"] = post_row()
    created = client.post(f"/api/community/clubs/{CLUB}/posts", json={"content": " 같이 뛰어요 "})
    assert created.status_code == 201
    assert supabase.bodies("community_create_club_post") == [{
        "p_user_id": USER, "p_club_id": CLUB, "p_content": "같이 뛰어요", "p_upload_ids": []}]
    supabase.rpc["community_create_club_post"] = rejection("COMMUNITY_CLUB_MEMBERS_ONLY")
    assert client.post(f"/api/community/clubs/{CLUB}/posts", json={"content": "글"}).status_code == 403

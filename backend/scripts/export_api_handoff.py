"""Export the local FastAPI contract for the Render/Naver server handoff.

Run from the repository root: python backend/scripts/export_api_handoff.py
This reads route metadata only; it does not connect to a database or deploy.
"""

from __future__ import annotations

import ast
import inspect
import json
import sys
import textwrap
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.app.main import app


DOCS = ROOT / "docs"
OPENAPI_PATH = DOCS / "api-server-openapi-20261029.json"
CATALOG_PATH = DOCS / "api-server-catalog-20261029.md"
METHODS = {"get", "post", "put", "patch", "delete"}

# These endpoints return dicts without FastAPI response_model. The descriptions
# come from the backend return statements and the matching frontend API types.
# Keep the absence of a machine-readable response schema visible in the table.
OUTPUT_NOTES = {
    ("GET", "/api/health-report"): "{period_start, body_compositions[], health_checkups[], target_weight_kg}",
    ("POST", "/api/tier/points/{event_code}/{source_id}"): "{awarded: boolean, reason: string}",
    ("GET", "/api/posture/jobs/{job_id}"): "PostureJob: posture_analysis_job_id, status, analysis_stage, progress_percent, processed_frames, total_frames, detected_repetitions, ...",
    ("GET", "/api/posture/jobs/{job_id}/result"): "PostureResult: job, assessment, repetitions[], findings[], routine_suggestions[]",
    ("GET", "/api/running/places/search"): "AI 원형 JSON 객체; AI 서버 응답 스키마 미확정",
    ("GET", "/api/running/courses/recommend"): "{status, courses[]}; 각 코스는 RunningCourse",
    ("GET", "/api/running/courses/{course_id}"): "RunningCourse 또는 {course: RunningCourse}; selection_token 포함",
    ("POST", "/api/running/routes/preview"): "{path: Coordinate[], distance_km, preview_token, ...AI 필드}",
    ("POST", "/api/running/routes/generate-loop"): "{status, candidates[]}; 후보에 selection_token 포함",
    ("GET", "/api/running/pace"): "{pace_minutes_per_km: number|null, pace_source: string}",
    ("PUT", "/api/running/pace"): "{pace_minutes_per_km: number, pace_source: 'user'}",
    ("GET", "/api/running/saved-courses"): "{courses: RunningSavedCourse[]}",
    ("POST", "/api/running/saved-courses"): "RunningSavedCourse 객체",
    ("PATCH", "/api/running/saved-courses/{saved_id}/favorite"): "RunningSavedCourse 객체",
    ("GET", "/api/running/sessions/active"): "{session: RunningSession|null}",
    ("GET", "/api/running/sessions/history"): "{sessions: RunningSession[]}",
    ("POST", "/api/running/sessions"): "{session: RunningSession}",
    ("POST", "/api/running/sessions/from-saved-course"): "{session: RunningSession}",
    ("GET", "/api/running/sessions/{session_id}"): "{session: RunningSession, points: RunningTrackPoint[], planned_course: RunningPlannedCourse|null}",
    ("POST", "/api/running/sessions/{session_id}/points"): "{accepted: boolean, reason?: string, session: RunningSession, point?: RunningTrackPoint}",
    ("POST", "/api/running/sessions/{session_id}/pause"): "{session: RunningSession}",
    ("POST", "/api/running/sessions/{session_id}/resume"): "{session: RunningSession}",
    ("POST", "/api/running/sessions/{session_id}/complete"): "{session: RunningSession}",
    ("GET", "/api/exercise/saved-routines"): "{routines: SavedWorkoutRoutine[]}",
    ("POST", "/api/exercise/saved-routines"): "{routine: SavedWorkoutRoutine}",
    ("POST", "/api/chats"): "{chat: Chat}",
    ("GET", "/api/chats"): "{chats: Chat[], has_more: boolean, next_cursor: string|null}",
    ("PATCH", "/api/chats/{chat_id}"): "{chat: Chat}",
    ("GET", "/api/chats/{chat_id}/messages"): "{chat_id, messages: ChatMessage[], has_more, next_cursor}",
    ("POST", "/api/chats/{chat_id}/messages"): "{chat, user_message: ChatMessage, assistant_message: ChatMessage, is_replay}",
}


def type_name(schema: dict, components: dict) -> str:
    if "$ref" in schema:
        return schema["$ref"].split("/")[-1]
    if "anyOf" in schema:
        return " | ".join(type_name(item, components) for item in schema["anyOf"])
    if "oneOf" in schema:
        return " | ".join(type_name(item, components) for item in schema["oneOf"])
    kind = schema.get("type")
    if kind == "array":
        return f"{type_name(schema.get('items', {}), components)}[]"
    if kind == "object":
        return "object"
    return kind or "unknown"


def literal_return_keys(method: str, path: str) -> list[str]:
    """Find literal top-level keys in route return values, without invoking it."""
    for route in app.routes:
        if getattr(route, "path", None) != path or method not in getattr(route, "methods", set()):
            continue
        try:
            source = textwrap.dedent(inspect.getsource(route.endpoint))
            tree = ast.parse(source)
        except (OSError, TypeError, SyntaxError):
            return []
        keys = set()
        for node in ast.walk(tree):
            if not isinstance(node, ast.Return) or not isinstance(node.value, ast.Dict):
                continue
            for key in node.value.keys:
                if isinstance(key, ast.Constant) and isinstance(key.value, str):
                    keys.add(key.value)
        return sorted(keys)
    return []


def response_description(method: str, path: str, operation: dict, components: dict) -> tuple[str, str]:
    responses = operation.get("responses", {})
    success = next((code for code in ("200", "201", "202", "204") if code in responses), "—")
    if success == "204":
        return success, "본문 없음"
    schema = responses.get(success, {}).get("content", {}).get("application/json", {}).get("schema", {})
    note = OUTPUT_NOTES.get((method, path))
    if note:
        return success, note + " **(OpenAPI 응답 미명세)**"
    if "$ref" in schema:
        name = type_name(schema, components)
        fields = list(components.get(name, {}).get("properties", {}))
        return success, f"{name} {{{', '.join(fields)}}}" if fields else name
    if "oneOf" in schema or "anyOf" in schema or schema.get("type") == "array":
        return success, type_name(schema, components)
    if schema.get("type") == "object" and schema.get("properties"):
        return success, "object {" + ", ".join(schema["properties"]) + "}"
    keys = literal_return_keys(method, path)
    if keys:
        return success, "JSON 객체 {" + ", ".join(keys) + "} **(OpenAPI 응답 필드 미명세)**"
    return success, "JSON 객체 **(OpenAPI 응답 필드 미명세)**"


def request_description(operation: dict, components: dict) -> str:
    body = operation.get("requestBody", {})
    content = body.get("content", {})
    schema = (content.get("application/json") or content.get("multipart/form-data") or {}).get("schema")
    return type_name(schema, components) if schema else "없음"


def main() -> None:
    spec = app.openapi()
    components = spec.get("components", {}).get("schemas", {})
    operations = defaultdict(list)
    untyped = []
    for path, methods in spec["paths"].items():
        for raw_method, operation in methods.items():
            if raw_method not in METHODS:
                continue
            method = raw_method.upper()
            tag = operation.get("tags", ["Other"])[0]
            status, response = response_description(method, path, operation, components)
            if "미명세" in response:
                untyped.append((method, path))
            operations[tag].append((method, path, request_description(operation, components), status, response))

    DOCS.mkdir(exist_ok=True)
    OPENAPI_PATH.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# Auto-Fit API 서버·응답 형식 목록 (2026-10-29)", "",
        "이 문서는 **로컬 `front_new` 작업본**의 `backend.app.main:app`에서 생성했다. 배포된 네이버/Render 서버의 현재 응답을 확인한 결과가 아니다.", "",
        f"총 **{len(spec['paths'])}개 경로, {sum(map(len, operations.values()))}개 HTTP 동작**. 전체 JSON Schema와 필드 타입·필수 여부는 [OpenAPI 원본](api-server-openapi-20261029.json)을 확인한다.", "",
        "## 서버 역할", "",
        "| 대상 | 역할 | 현재 확인된 연결/제약 |", "|---|---|---|",
        "| 네이버 공용 API | 앱 기본 API (`https://211-233-206-193.sslip.io`) | 서버 담당자 관리. 이 작업본은 아직 반영 여부 미확인. |",
        "| Render `auto-fit-api-dev` | 백업·개발 API (`https://auto-fit-api-dev.onrender.com`) | Dashboard의 실제 소스 브랜치는 `backend`, 현재 Live 커밋은 `51dcf00e45733ca4df5b6226057c2f5db235f8d6`이다. 로컬 `render.yaml`의 `front_new`와 다르며 새 `backend/` 파일은 아직 배포되지 않았다. |",
        "| Supabase | 두 API의 DB/Auth/Storage | 앱은 Supabase 로그인 토큰을 API에 전달한다. 마이그레이션 적용 상태는 별도 대조가 필요하다. |",
        "| OCR 서버 | 건강 문서 판독 | `HEALTH_DOCUMENT_OCR_URL`로 연결. 연결 실패 또는 미설정 시 운영 응답 확인 필요. |",
        "| AI 서버 | 식단·러닝 구조화 추천 | `AI_SERVER_ENABLED`/`AI_SERVER_BASE_URL`로 연결하는 선택적 외부 서버. 미설정 시 해당 기능 제한. |",
        "| 채팅 AI | 건강 상담 답변 | `CHAT_AI_ENABLED`/`CHAT_AI_URL`로 연결하는 선택적 외부 서버. |",
        "| 음식 이미지 생성기 | 레시피 이미지 | `FOOD_IMAGE_ENABLED=false`가 Render 기본값. |", "",
        "## 공통 호출·응답 규칙", "",
        "- 앱은 대부분의 `/api/*` 요청에 `Authorization: Bearer <Supabase access_token>`을 붙인다. 본문은 JSON이며 사진·문서 업로드만 `multipart/form-data`다.",
        "- 성공 응답은 아래 표의 HTTP 상태와 JSON 형식이다. `204`는 본문이 없다. 목록의 `next_cursor`가 `null`이면 다음 페이지가 없다.",
        "- 오류는 현재 완전히 통일되지 않았다. 채팅·커뮤니티·건강 문서는 대체로 `{'detail': {'code', 'message', 'fields'}}`, 그 외는 FastAPI 기본 `{'detail': string|object}` 또는 검증 오류 형식을 사용한다. 담당자는 기존 응답 모양을 유지해야 한다.",
        "- **OpenAPI 미명세**는 실제 코드/프론트 타입에서 확인한 예상 키를 적은 것이다. JSON Schema로 보증되지 않으므로 서버 배포 전에 계약 테스트와 `response_model` 보강이 필요하다.", "",
        "- OpenAPI에서 숨긴 운영 경로 `POST /internal/diet-refresh`는 `X-Cron-Token` 헤더를 사용하고 성공 시 `{ok: true, succeeded: number, failed: number}`를 반환한다. 일반 앱 호출용이 아니다. Render에서 별도 Cron 서비스를 만드는 설정은 현재 없다.",
        "- `POST /api/test/roundtrip`은 Render 설정의 `ENABLE_TEST_ENDPOINTS=false`에서 사용할 수 없다.", "",
        "## 엔드포인트별 출력 형식", "",
    ]
    tag_order = ["System", "Profile", "health-documents", "Health Analysis", "Diet", "Exercise", "Posture Analysis", "Running", "Community", "Chat"]
    for tag in tag_order:
        rows = operations.get(tag)
        if not rows:
            continue
        lines += [f"### {tag} ({len(rows)})", "", "| Method | Path | 요청 본문 | 성공 | 출력 형식 |", "|---|---|---|---:|---|"]
        for method, path, request, status, response in rows:
            lines.append(f"| `{method}` | `{path}` | `{request}` | {status} | {response.replace('|', '&#124;')} |")
        lines.append("")
    lines += [
        "## 배포 전 확인할 계약 공백", "",
        f"- 응답 스키마가 넓은 `object`이거나 없는 동작: **{len(untyped)}개**. 특히 러닝 AI 5개 경로는 외부 AI 원형 JSON을 일부 통과시켜 필드 계약이 고정되지 않았다.",
        "- 자세 분석 AI 모델은 아직 없다. `GET /api/posture/jobs/{job_id}`와 `/result`는 저장된 작업/결과를 읽는 API이며, 영상 업로드·분석 작업 생성 API는 이 목록에 없다.",
        "- Render와 네이버가 동일한 응답 형식을 내려면 같은 검증된 코드 버전, DB 마이그레이션, 환경변수 설정이 필요하다. 현재 자동 장애 전환은 없다.",
        "- 네이버 담당자에게 전달할 때는 이 목록과 OpenAPI JSON, 검증된 배포 커밋, 마이그레이션 적용 목록, 인증 실호출 결과를 함께 보낸다. 비밀키 값은 포함하지 않는다.", "",
    ]
    CATALOG_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {CATALOG_PATH} ({sum(map(len, operations.values()))} operations)")
    print(f"wrote {OPENAPI_PATH} ({len(components)} schemas, {len(untyped)} untyped outputs)")


if __name__ == "__main__":
    main()

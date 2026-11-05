"""Loopback-only browser runner for the integrated backend checks."""

from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import re
import subprocess
from time import perf_counter


ROOT = Path(__file__).resolve().parents[1]
DEMO = Path(__file__).resolve().parent
CONTAINER = "supabase_db_Auto-Fit"
API_TEST_IMAGE = "auto-fit-integrated-api-tests:verify"
AI_TEST_IMAGE = "auto-fit-integrated-ai-tests:verify"
OCR_TEST_IMAGE = "auto-fit-integrated-ocr-tests:verify"
PGLITE = ROOT / "demo/sql-tests/node_modules/@electric-sql/pglite"

BUILD_STEPS = {
    "api": [
        ["docker", "build", "-q", "-t", "auto-fit-integrated-api:verify",
         "-f", "backend/Dockerfile", "backend"],
        ["docker", "build", "-q", "-t", API_TEST_IMAGE,
         "-f", "demo/Dockerfile.api-tests", "."],
    ],
    "ai": [
        ["docker", "build", "-q", "-t", "auto-fit-integrated-ai:verify",
         "-f", "ai_service/Dockerfile", "ai_service"],
        ["docker", "build", "-q", "-t", AI_TEST_IMAGE,
         "-f", "demo/Dockerfile.ai-tests", "ai_service"],
    ],
    "ocr": [
        ["docker", "build", "-q", "-t", "auto-fit-integrated-ocr:verify",
         "-f", "ocr_service/Dockerfile", "ocr_service"],
        ["docker", "build", "-q", "-t", OCR_TEST_IMAGE,
         "-f", "demo/Dockerfile.ocr-tests", "."],
    ],
}

CASES = {
    "archive": [ROOT / "backend/tests/archived_exercise_session_sql.sql"],
    "upgrade": [
        ROOT / "backend/tests/archive_non_ai_upgrade_pre.sql",
        ROOT / "supabase/migrations/20261105020000_archive_non_ai_exercise_recommendations.sql",
        ROOT / "backend/tests/archive_non_ai_upgrade_post.sql",
    ],
}
API_GROUPS = {
    "domain_home": ["test_home.py", "test_health_report.py", "test_user_settings.py"],
    "domain_diet": ["test_weekly_diet.py", "test_diet_ai.py", "test_diet_recipe_api.py",
                    "test_meal_photos.py", "test_health_documents.py"],
    "domain_exercise": ["test_exercise_ai.py", "test_exercise_analysis_ai.py",
                        "test_exercise_retirement.py", "test_running.py",
                        "test_posture_analysis.py", "test_saved_workout_routines.py"],
    "domain_community": ["test_community.py", "test_community_mileage.py",
                         "test_chat_service.py", "test_chat_storage.py"],
    "domain_my": ["test_account_deletion.py", "test_user_settings.py",
                  "test_security.py", "test_habit_tier_api.py"],
}
STATUS_SQL = """
select concat_ws('|',
  (select count(*) from supabase_migrations.schema_migrations),
  (to_regprocedure('public.start_exercise_session(uuid,uuid)') is null)::text,
  (to_regprocedure('public.start_exercise_plan_session(uuid,uuid,uuid)') is not null)::text,
  exists(select 1 from pg_constraint
    where conname = 'exercise_recommendations_ai_or_archived_check')::text,
  exists(select 1 from pg_trigger
    where tgname = 'prevent_archived_exercise_derived_write'
      and not tgisinternal)::text
);
"""


def run_command(command: list[str], *, input_text: str | None = None,
                timeout: int = 60) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command, input=input_text, text=True, capture_output=True,
        timeout=timeout, check=False, cwd=ROOT,
    )


def ensure_current_image(service: str) -> dict[str, object] | None:
    """Rebuild against the current worktree so mutable tags cannot hide edits."""
    for command in BUILD_STEPS[service]:
        result = run_command(command, timeout=900)
        if result.returncode:
            return {"passed": False, "summary": "현재 코드 이미지 빌드 실패",
                    "output": (result.stdout + result.stderr).strip()[-12000:]}
    return None


def run_case(case: str) -> dict[str, object]:
    started = perf_counter()
    if case == "api_all" or case in API_GROUPS:
        build_error = ensure_current_image("api")
        if build_error:
            return {**build_error, "duration_seconds": round(perf_counter() - started, 1)}
        tests = (["backend/tests"] if case == "api_all" else
                 [f"backend/tests/{name}" for name in API_GROUPS[case]])
        result = run_command(
            ["docker", "run", "--rm", API_TEST_IMAGE, "python", "-m", "pytest",
             "-q", "-p", "no:cacheprovider", *tests], timeout=240,
        )
    elif case == "ai_all":
        build_error = ensure_current_image("ai")
        if build_error:
            return {**build_error, "duration_seconds": round(perf_counter() - started, 1)}
        result = run_command(
            ["docker", "run", "--rm", AI_TEST_IMAGE, "python", "-m", "pytest",
             "-q", "-p", "no:cacheprovider", "-m", "not live"], timeout=300,
        )
    elif case == "ocr_all":
        build_error = ensure_current_image("ocr")
        if build_error:
            return {**build_error, "duration_seconds": round(perf_counter() - started, 1)}
        result = run_command(
            ["docker", "run", "--rm", OCR_TEST_IMAGE, "python", "-m", "pytest",
             "-q", "-p", "no:cacheprovider", "tests"], timeout=90,
        )
    elif case == "stack":
        result = run_command(
            ["docker", "compose", "--env-file", "deploy/stack/.env.example",
             "-f", "deploy/stack/compose.yaml", "config", "--no-env-resolution", "-q"],
            timeout=30,
        )
    elif case == "sql_domains":
        if not (PGLITE / "package.json").exists():
            return {"passed": False, "summary": "PGlite 설치 필요",
                    "output": "demo/sql-tests에서 npm install을 실행하세요.",
                    "duration_seconds": round(perf_counter() - started, 1)}
        outputs = []
        passed = 0
        scripts = sorted((ROOT / "backend/tests").glob("*_sql.mjs"))
        if not scripts:
            return {"passed": False, "summary": "SQL 테스트 없음",
                    "output": "backend/tests의 SQL 검증 파일을 찾지 못했습니다.",
                    "duration_seconds": round(perf_counter() - started, 1)}
        for script in scripts:
            check = run_command(["node", str(script), str(PGLITE)], timeout=120)
            if check.returncode == 0:
                passed += 1
            detail = (check.stdout + check.stderr).strip()
            outputs.append(f"{script.name}: {'통과' if check.returncode == 0 else '실패'}\n{detail[-500:]}")
        return {"passed": passed == len(scripts),
                "summary": f"{passed}/{len(scripts)} SQL 검증 통과",
                "output": "\n\n".join(outputs)[-12000:],
                "duration_seconds": round(perf_counter() - started, 1)}
    else:
        script = "\n".join(path.read_text() for path in CASES[case])
        result = run_command(
            ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q",
             "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
            input_text=script, timeout=60,
        )
    output = (result.stdout + result.stderr).strip()
    match = re.search(r"(\d+ passed(?:, \d+ skipped)?(?:, \d+ deselected)?)", output)
    summary = (match.group(1) if match else
               "설정 정상" if case == "stack" and result.returncode == 0 else
               "SQL 검증 통과" if case in CASES and result.returncode == 0 else
               "실패" if result.returncode else "검증 통과")
    return {"passed": result.returncode == 0, "output": output[-12000:],
            "summary": summary, "duration_seconds": round(perf_counter() - started, 1)}


def local_status() -> dict[str, object]:
    result = run_command(
        ["docker", "exec", CONTAINER, "psql", "-X", "-A", "-t", "-U",
         "postgres", "-d", "postgres", "-c", STATUS_SQL], timeout=15,
    )
    if result.returncode != 0:
        raise RuntimeError("로컬 Supabase DB에 연결할 수 없습니다. supabase start 상태를 확인하세요.")
    parts = result.stdout.strip().split("|")
    if len(parts) != 5:
        raise RuntimeError("로컬 DB 상태 응답을 해석할 수 없습니다.")
    return {
        "applied_migrations": int(parts[0]),
        "expected_migrations": len(list((ROOT / "supabase/migrations").glob("*.sql"))),
        "old_start_removed": parts[1] == "true",
        "ai_start_available": parts[2] == "true",
        "archive_constraint": parts[3] == "true",
        "derived_write_guard": parts[4] == "true",
    }


class Handler(BaseHTTPRequestHandler):
    def send_json(self, code: int, payload: dict[str, object]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path == "/api/status":
            try:
                self.send_json(200, local_status())
            except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
                self.send_json(503, {"error": str(error)})
            return
        files = {
            "/": ("index.html", "text/html; charset=utf-8"),
            "/styles.css": ("styles.css", "text/css; charset=utf-8"),
            "/app.js": ("app.js", "text/javascript; charset=utf-8"),
            "/icons/house.svg": ("icons/house.svg", "image/svg+xml"),
            "/icons/fork-knife.svg": ("icons/fork-knife.svg", "image/svg+xml"),
            "/icons/barbell-fill.svg": ("icons/barbell-fill.svg", "image/svg+xml"),
            "/icons/chats-circle.svg": ("icons/chats-circle.svg", "image/svg+xml"),
            "/icons/user.svg": ("icons/user.svg", "image/svg+xml"),
            "/fonts/Pretendard-Regular.otf": ("fonts/Pretendard-Regular.otf", "font/otf"),
            "/fonts/Pretendard-SemiBold.otf": ("fonts/Pretendard-SemiBold.otf", "font/otf"),
            "/fonts/Pretendard-Bold.otf": ("fonts/Pretendard-Bold.otf", "font/otf"),
        }
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        if self.path not in files:
            self.send_error(404)
            return
        filename, content_type = files[self.path]
        data = (DEMO / filename).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        if self.path != "/api/run":
            self.send_error(404)
            return
        host = f"http://127.0.0.1:{self.server.server_port}"
        if self.headers.get("Origin") != host:
            self.send_json(403, {"error": "이 로컬 화면에서만 실행할 수 있습니다."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 256:
                raise ValueError()
            body = json.loads(self.rfile.read(length))
            case = body.get("case")
            if case not in (*CASES, *API_GROUPS, "api_all", "ai_all", "ocr_all", "sql_domains", "stack"):
                raise ValueError()
        except (ValueError, AttributeError, TypeError):
            self.send_json(400, {"error": "알 수 없는 로컬 테스트입니다."})
            return
        try:
            self.send_json(200, run_case(case))
        except (OSError, subprocess.TimeoutExpired) as error:
            self.send_json(503, {"error": f"테스트 실행 실패: {error}"})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = HTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Local backend demo: http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

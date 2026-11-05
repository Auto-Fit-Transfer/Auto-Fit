#!/usr/bin/env python3
"""Check deployment configuration without printing credential values."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DOMAIN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$")


def read_env(name: str, problems: list[str]) -> dict[str, str]:
    path = ROOT / name
    if not path.is_file():
        problems.append(f"{name}: file is missing")
        return {}
    result: dict[str, str] = {}
    for number, line in enumerate(path.read_text().splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            problems.append(f"{name}:{number}: expected KEY=VALUE")
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        result[key] = value
    return result


def required(values: dict[str, str], key: str, file: str, problems: list[str]) -> str:
    value = values.get(key, "")
    if not value or "example.com" in value or "YOUR_" in value or value == "replace_me":
        problems.append(f"{file}: configure {key}")
    return value


def main() -> int:
    problems: list[str] = []
    domains = read_env(".env", problems)
    api = read_env("api.env", problems)
    ai = read_env("ai.env", problems)
    ocr = read_env("ocr.env", problems)

    names = [required(domains, key, ".env", problems) for key in
             ("API_DOMAIN", "AI_DOMAIN", "OCR_DOMAIN")]
    if len(set(names)) != 3 or any(not DOMAIN_RE.fullmatch(name) for name in names):
        problems.append(".env: API_DOMAIN, AI_DOMAIN and OCR_DOMAIN must be distinct DNS names")

    for key in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
                "FRONTEND_ORIGIN"):
        required(api, key, "api.env", problems)
    for key in ("SUPABASE_URL", "FRONTEND_ORIGIN"):
        if not api.get(key, "").startswith("https://"):
            problems.append(f"api.env: {key} must use HTTPS")
    required(ai, "OPENAI_API_KEY", "ai.env", problems)
    for key in ("AUTOFIT_CLOVA_OCR_URL", "AUTOFIT_CLOVA_OCR_SECRET"):
        required(ocr, key, "ocr.env", problems)
    if not ocr.get("AUTOFIT_CLOVA_OCR_URL", "").startswith("https://"):
        problems.append("ocr.env: AUTOFIT_CLOVA_OCR_URL must use HTTPS")

    ai_key = required(api, "AI_SERVER_API_KEY", "api.env", problems)
    if ai_key != required(ai, "AI_SERVER_API_KEY", "ai.env", problems) or len(ai_key) < 32:
        problems.append("api.env/ai.env: AI_SERVER_API_KEY must match and contain 32+ characters")
    ocr_token = required(api, "HEALTH_DOCUMENT_OCR_TOKEN", "api.env", problems)
    if ocr_token != required(ocr, "AUTOFIT_OCR_SERVER_TOKEN", "ocr.env", problems) or len(ocr_token) < 32:
        problems.append("api.env/ocr.env: OCR Bearer tokens must match and contain 32+ characters")

    if len(names) == 3:
        if api.get("AI_SERVER_BASE_URL") != f"https://{names[1]}":
            problems.append("api.env: AI_SERVER_BASE_URL must use AI_DOMAIN over HTTPS")
        if api.get("HEALTH_DOCUMENT_OCR_URL") != f"https://{names[2]}/ai/ocr":
            problems.append("api.env: HEALTH_DOCUMENT_OCR_URL must use OCR_DOMAIN over HTTPS")
    if api.get("AI_SERVER_ENABLED") != "true":
        problems.append("api.env: AI_SERVER_ENABLED must be true for the integrated stack")
    if api.get("HEALTH_DOCUMENT_OCR_MOCK_ENABLED") != "false":
        problems.append("api.env: HEALTH_DOCUMENT_OCR_MOCK_ENABLED must be false")
    if api.get("API_DOCS_ENABLED") != "false":
        problems.append("api.env: API_DOCS_ENABLED must be false for deployment")
    if api.get("ENABLE_TEST_ENDPOINTS") != "false":
        problems.append("api.env: ENABLE_TEST_ENDPOINTS must be false for deployment")

    for message in sorted(set(problems)):
        print(message)
    if problems:
        return 1
    print("Configuration names and shared credentials are consistent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

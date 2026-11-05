"""Deployment checks must fail closed for the public API surface."""

import pytest

from deploy.stack import check_env


def write_stack_env(tmp_path, *, docs: str | None = "false",
                    test_endpoints: str | None = "false") -> None:
    (tmp_path / ".env").write_text(
        "API_DOMAIN=api.stage.example.net\n"
        "AI_DOMAIN=ai.stage.example.net\n"
        "OCR_DOMAIN=ocr.stage.example.net\n"
    )
    api = [
        "SUPABASE_URL=https://stage.supabase.co",
        "SUPABASE_PUBLISHABLE_KEY=publishable-test",
        "SUPABASE_SERVICE_ROLE_KEY=service-test",
        "FRONTEND_ORIGIN=https://app.stage.example.net",
        "AI_SERVER_BASE_URL=https://ai.stage.example.net",
        "AI_SERVER_API_KEY=" + "a" * 32,
        "HEALTH_DOCUMENT_OCR_URL=https://ocr.stage.example.net/ai/ocr",
        "HEALTH_DOCUMENT_OCR_TOKEN=" + "b" * 32,
        "HEALTH_DOCUMENT_OCR_MOCK_ENABLED=false",
        "AI_SERVER_ENABLED=true",
    ]
    if docs is not None:
        api.append(f"API_DOCS_ENABLED={docs}")
    if test_endpoints is not None:
        api.append(f"ENABLE_TEST_ENDPOINTS={test_endpoints}")
    (tmp_path / "api.env").write_text("\n".join(api) + "\n")
    (tmp_path / "ai.env").write_text(
        "OPENAI_API_KEY=provider-test\n"
        "AI_SERVER_API_KEY=" + "a" * 32 + "\n"
    )
    (tmp_path / "ocr.env").write_text(
        "AUTOFIT_CLOVA_OCR_URL=https://clova.stage.example.net\n"
        "AUTOFIT_CLOVA_OCR_SECRET=provider-test\n"
        "AUTOFIT_OCR_SERVER_TOKEN=" + "b" * 32 + "\n"
    )


def test_stack_env_accepts_disabled_public_debug_surfaces(tmp_path, monkeypatch, capsys) -> None:
    write_stack_env(tmp_path)
    monkeypatch.setattr(check_env, "ROOT", tmp_path)

    assert check_env.main() == 0
    assert "Configuration names and shared credentials are consistent." in capsys.readouterr().out


@pytest.mark.parametrize(("name", "docs", "test_endpoints"), [
    ("API_DOCS_ENABLED", None, "false"),
    ("API_DOCS_ENABLED", "true", "false"),
    ("ENABLE_TEST_ENDPOINTS", "false", None),
    ("ENABLE_TEST_ENDPOINTS", "false", "true"),
])
def test_stack_env_rejects_missing_or_enabled_public_debug_surfaces(
    tmp_path, monkeypatch, capsys, name, docs, test_endpoints,
) -> None:
    write_stack_env(tmp_path, docs=docs, test_endpoints=test_endpoints)
    monkeypatch.setattr(check_env, "ROOT", tmp_path)

    assert check_env.main() == 1
    assert name in capsys.readouterr().out

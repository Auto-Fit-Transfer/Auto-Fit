"""Opt-in verification of the deployed health document flow with disposable data.

Creates one synthetic account in the approved development project, then removes
only this run's account, records, and files. Never prints credentials or bodies.
"""
import argparse
import asyncio
import secrets
from uuid import uuid4

import httpx
from dotenv import dotenv_values

from backend.app import main

API_BASE = "https://auto-fit-api-dev.onrender.com"
PROJECT_URL = "https://eeeqibyssajykrhvecbv.supabase.co"


async def run(api_base: str) -> None:
    if api_base != API_BASE:
        raise ValueError("Unapproved API target")
    config = dotenv_values("backend/.env")
    if config["SUPABASE_URL"].rstrip("/") != PROJECT_URL:
        raise ValueError("Unapproved database target")
    settings = main.Settings(PROJECT_URL, config["SUPABASE_PUBLISHABLE_KEY"],
                             config["SUPABASE_SERVICE_ROLE_KEY"], "http://localhost:3000")
    admin = main.service_headers(settings)
    uid = None
    owner = None
    file_ids = []
    checks = 0

    def check(ok, label):
        nonlocal checks
        assert ok, label
        checks += 1
        print(f"PASS {label}", flush=True)

    async with httpx.AsyncClient(base_url=PROJECT_URL, timeout=30, trust_env=False) as db, \
            httpx.AsyncClient(base_url=API_BASE, timeout=90, trust_env=False) as api:
        try:
            schema_response = await api.get("/openapi.json")
            check(schema_response.status_code == 200, "deployed OpenAPI available")
            schema = schema_response.json()
            upload_schema = schema["paths"]["/api/health-documents"]["post"]["requestBody"]["content"]["multipart/form-data"]["schema"]
            upload_fields = schema["components"]["schemas"][upload_schema["$ref"].rsplit("/", 1)[-1]]
            check(upload_fields["required"] == ["file"], "document_type optional in deployed contract")
            check("original_file_name" in upload_fields["properties"] and "get" in schema["paths"]["/api/health-documents"],
                  "original filename and list API in deployed contract")
            email = f"autofit-health-test-{uuid4().hex}@example.com"
            password = "Af9!" + secrets.token_urlsafe(32)
            created = await db.post("/auth/v1/admin/users", headers=admin, json={
                "email": email, "password": password, "email_confirm": True,
                "app_metadata": {"autofit_integration_test": True},
            })
            check(created.status_code in (200, 201), "create disposable development account")
            uid = created.json()["id"]
            login = await db.post("/auth/v1/token?grant_type=password",
                headers={"apikey": settings.supabase_publishable_key},
                json={"email": email, "password": password})
            check(login.status_code == 200, "authenticate synthetic account")
            owner = {"Authorization": f"Bearer {login.json()['access_token']}"}
            denied = await api.get(f"/api/health-documents/{uuid4()}")
            check(denied.status_code == 401 and denied.json()["detail"]["code"] == "AUTH_REQUIRED",
                  "structured unauthenticated error")
            missing = await api.get(f"/api/health-documents/{uuid4()}", headers=owner)
            check(missing.status_code == 404 and missing.json()["detail"]["code"] == "DOCUMENT_NOT_FOUND",
                  "structured missing-document error")
            unsupported = await api.post("/api/health-documents", headers=owner,
                data={"document_type": "health_checkup"},
                files={"file": ("invalid.pdf", b"not a document", "application/pdf")})
            check(unsupported.status_code == 415 and unsupported.json()["detail"]["code"] == "UNSUPPORTED_FILE_TYPE",
                  "reject unsupported file contents")
            image_upload = await api.post("/api/health-documents", headers=owner,
                files={"file": ("synthetic-image.png", b"\x89PNG\r\n\x1a\nsynthetic mock fixture", "image/png")})
            check(image_upload.status_code == 201, "image upload without document_type")
            image_result = image_upload.json()
            file_ids.append(image_result["uploaded_file_id"])
            check(image_result["document_type"] == "health_checkup" and image_result["ocr_status"] == "completed"
                  and image_result["extracted_data"]["weight_kg"] == "70", "image returns default sample without classification")
            empty_confirmed = await api.get("/api/health-documents?status=confirmed&limit=1", headers=owner)
            check(empty_confirmed.status_code == 200 and empty_confirmed.json()["items"] == [],
                  "login branch: awaiting review is not confirmed data")
            for kind, table, id_field, date_field in [
                ("health_checkup", "health_checkups", "health_checkup_id", "checkup_date"),
                ("body_composition", "body_compositions", "body_composition_id", "measured_at"),
            ]:
                original_name = "건강검진결과_2026.pdf" if kind == "health_checkup" else "체성분결과_2026.pdf"
                upload = await api.post("/api/health-documents", headers=owner,
                    data={"original_file_name": original_name, **({} if kind == "health_checkup" else {"document_type": kind})},
                    files={"file": (f"cache-{uuid4()}.pdf", b"%PDF-1.4\n% synthetic mock OCR fixture\n%%EOF", "application/pdf")})
                check(upload.status_code == 201, f"{kind}: upload")
                initial = upload.json()
                file_ids.append(initial["uploaded_file_id"])
                check(initial["document_type"] == kind and initial["file_name"] == original_name
                      and bool(initial["uploaded_at"]), f"{kind}: flat upload metadata")
                check(initial["original_file_name"] == original_name, f"{kind}: POST preserves original filename")
                stored = await db.get("/rest/v1/upload_files", headers=admin,
                    params={"uploaded_file_id": f"eq.{initial['uploaded_file_id']}", "user_id": f"eq.{uid}",
                            "select": "original_file_name,storage_path"})
                check(stored.is_success and len(stored.json()) == 1 and stored.json()[0]["original_file_name"] == original_name
                      and original_name not in stored.json()[0]["storage_path"], f"{kind}: original name persisted with UUID storage path")
                check(initial["ocr_status"] == "completed" and initial["error"] is None
                      and initial["extracted_data"][date_field] is not None
                      and initial["extracted_data"]["weight_kg"] == "70", f"{kind}: populated mock extraction")
                path = f"/api/health-documents/{file_ids[-1]}"
                fetched = await api.get(path, headers=owner)
                check(fetched.status_code == 200 and fetched.json()["extracted_data"] == initial["extracted_data"],
                      f"{kind}: reload extraction")
                check(fetched.json()["original_file_name"] == original_name, f"{kind}: GET preserves original filename")
                modified = await api.patch(path + "/ocr-result", headers=owner,
                    json={"extracted_data": {"weight_kg": "69.5"}})
                check(modified.status_code == 200 and modified.json()["extracted_data"]["weight_kg"] == "69.5"
                      and modified.json()["extracted_data"][date_field] == initial["extracted_data"][date_field],
                      f"{kind}: partial update preserves other fields")
                confirmed = await api.post(path + "/confirm", headers=owner)
                check(confirmed.status_code == 200 and confirmed.json()["status"] == "confirmed"
                      and bool(confirmed.json()[id_field]), f"{kind}: confirm returns generated ID")
                data_id = confirmed.json()[id_field]
                persisted = await db.get(f"/rest/v1/{table}", headers=admin,
                    params={id_field: f"eq.{data_id}", "user_id": f"eq.{uid}", "select": "weight_kg,uploaded_file_id"})
                check(persisted.is_success and len(persisted.json()) == 1
                      and str(persisted.json()[0]["weight_kg"]) == "69.5"
                      and persisted.json()[0]["uploaded_file_id"] == file_ids[-1], f"{kind}: reviewed data persisted")
                reloaded = await api.get(path, headers=owner)
                check(reloaded.status_code == 200 and reloaded.json()["status"] == "confirmed",
                      f"{kind}: confirmation status persisted")
                repeated = await api.post(path + "/confirm", headers=owner)
                check(repeated.status_code == 200 and repeated.json()[id_field] == data_id
                      and repeated.json()["already_confirmed"], f"{kind}: repeated confirmation returns same ID")
                locked = await api.patch(path + "/ocr-result", headers=owner,
                    json={"extracted_data": {"weight_kg": "68"}})
                check(locked.status_code == 409 and locked.json()["detail"]["code"] == "DOCUMENT_CONFIRMED",
                      f"{kind}: confirmed document is immutable")
            check(len(file_ids) == 3 and len(set(file_ids)) == 3, "independent IDs for multiple files")
            listing = await api.get("/api/health-documents?limit=2&offset=0", headers=owner)
            check(listing.status_code == 200 and listing.json()["has_more"] and len(listing.json()["items"]) == 2
                  and {item["original_file_name"] for item in listing.json()["items"]} == {"건강검진결과_2026.pdf", "체성분결과_2026.pdf"},
                  "list shows persisted original names with pagination")
            check(all(item["status"] == "confirmed" for item in listing.json()["items"]),
                  "list includes confirmed status")
            next_page = await api.get("/api/health-documents?limit=2&offset=2", headers=owner)
            check(next_page.status_code == 200 and not next_page.json()["has_more"]
                  and [item["uploaded_file_id"] for item in next_page.json()["items"]] == [file_ids[0]],
                  "list next page contains only this user's remaining document")
            check(next_page.json()["items"][0]["status"] == "awaiting_review", "list includes awaiting_review status")
            confirmed_only = await api.get("/api/health-documents?status=confirmed&limit=1", headers=owner)
            check(confirmed_only.status_code == 200 and len(confirmed_only.json()["items"]) == 1
                  and confirmed_only.json()["items"][0]["status"] == "confirmed"
                  and confirmed_only.json()["items"][0]["uploaded_file_id"] in file_ids[1:],
                  "login branch: one filtered request finds confirmed data")
            failed_ocr = await db.patch("/rest/v1/ocr_results", headers=admin,
                params={"uploaded_file_id": f"eq.{file_ids[0]}"}, json={"status": "failed", "error_message": "OCR_FAILED"})
            failed_listing = await api.get("/api/health-documents?limit=2&offset=2", headers=owner)
            failed_detail = await api.get(f"/api/health-documents/{file_ids[0]}", headers=owner)
            check(failed_ocr.is_success and failed_listing.status_code == 200 and failed_detail.status_code == 200
                  and failed_listing.json()["items"][0]["status"] == failed_detail.json()["status"] == "failed",
                  "list failed status matches detail")
            print(f"Completed {checks} deployed health document checks.", flush=True)
        finally:
            if uid:
                deleted = await api.delete("/api/account", headers=owner) if owner else None
                if deleted is None or deleted.status_code != 204:
                    # Discover paths even when an upload response was interrupted.
                    files = await db.get("/rest/v1/upload_files", headers=admin,
                        params={"user_id": f"eq.{uid}", "select": "storage_path"})
                    assert files.is_success, "Synthetic file discovery failed"
                    for row in files.json():
                        path = row.get("storage_path")
                        if path:
                            removed = await db.delete(f"/storage/v1/object/health-documents/{path}", headers=admin)
                            assert removed.is_success, "Synthetic file cleanup failed"
                    removed = await db.delete(f"/auth/v1/admin/users/{uid}", headers=admin)
                    assert removed.is_success or removed.status_code == 404, "Synthetic account cleanup failed"
                for table in ("upload_files", "health_checkups", "body_compositions", "profiles", "notification_settings"):
                    remaining = await db.get(f"/rest/v1/{table}", headers=admin,
                        params={"user_id": f"eq.{uid}", "select": "user_id", "limit": "1"})
                    assert remaining.is_success and remaining.json() == [], f"Synthetic {table} cleanup incomplete"
                for fid in file_ids:
                    remaining = await db.get("/rest/v1/ocr_results", headers=admin,
                        params={"uploaded_file_id": f"eq.{fid}", "select": "ocr_result_id", "limit": "1"})
                    assert remaining.is_success and remaining.json() == [], "Synthetic OCR cleanup incomplete"
                print("This run's synthetic account and records cleaned up.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-base", required=True)
    asyncio.run(run(parser.parse_args().api_base))

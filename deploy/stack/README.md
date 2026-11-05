# Integrated backend stack

This stack runs the API, AI, and OCR services behind one Caddy proxy. Each service remains a separate process so that OCR and AI dependencies do not share the API process. Caddy obtains HTTPS certificates for three DNS names; those names must resolve to this host before startup. The API container resolves the AI and OCR names to Caddy on the private Compose network, so requests keep HTTPS without depending on hairpin routing.

## Configure

1. Copy `.env.example` to `.env`, then set distinct `API_DOMAIN`, `AI_DOMAIN`, and `OCR_DOMAIN` names.
2. Copy `api.env.example`, `ai.env.example`, and `ocr.env.example` to `api.env`, `ai.env`, and `ocr.env`. Fill the provider and Supabase settings from your secret manager. These four files are Git ignored.
3. Set the same 32+ character `AI_SERVER_API_KEY` in `api.env` and `ai.env`. Set the same 32+ character OCR token in `api.env` (`HEALTH_DOCUMENT_OCR_TOKEN`) and `ocr.env` (`AUTOFIT_OCR_SERVER_TOKEN`).
4. Use `https://<AI_DOMAIN>` for `AI_SERVER_BASE_URL` and `https://<OCR_DOMAIN>/ai/ocr` for `HEALTH_DOCUMENT_OCR_URL` in `api.env`. Keep `HEALTH_DOCUMENT_OCR_MOCK_ENABLED=false`.
5. Run `python3 check_env.py`. It reports missing or mismatched setting names without printing secret values.

From the repository root, validate configuration with:

```sh
docker compose --env-file deploy/stack/.env -f deploy/stack/compose.yaml config -q
```

Build and start only after the three DNS names, certificates, service credentials, and Supabase project are prepared:

```sh
docker compose --env-file deploy/stack/.env -f deploy/stack/compose.yaml up --build -d
```

Check `https://<API_DOMAIN>/health`, `https://<AI_DOMAIN>/health`, and `https://<OCR_DOMAIN>/health`. The OCR response must report `status: ok`; a mere HTTP 200 is not enough when its provider configuration is missing.

The AI Chroma index is persisted in the `ai_chroma` volume. Source documents and embeddings are not bundled into this code repository. If RAG search is required, supply approved source files to the AI container and run its `app.scripts.ingest_registered_sources` ingestion command with the configured OpenAI key. An empty index still allows the service to start but does not provide document-backed RAG results.

The SQL files in `supabase/migrations/` are **not** applied by Compose. Compare the destination database's migration history and function definitions before applying pending migrations. Do not replay a migration that is already recorded. The GitHub daily diet workflow remains disabled until the new repository's `DIET_REFRESH_SCHEDULE_ENABLED` variable is explicitly set to `true` together with its API URL and cron token.

Before an operational cutover, review the [2026-11-05 readiness record](../../docs/cutover-readiness-20261105.md). Pending migrations remove the old exercise-start RPC and archive historical exercise plans, so the database and API need a coordinated deployment window.

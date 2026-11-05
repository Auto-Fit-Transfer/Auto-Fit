# OCR service

This FastAPI service extracts health checkup and body composition fields from JPEG, PNG, HEIC, or PDF uploads. It exposes `POST /ai/ocr` and `GET /health` on port 8000. The API service calls it with `HEALTH_DOCUMENT_OCR_URL` and a Bearer token.

The service uses CLOVA General OCR and, when configured, CLOVA Template OCR. Supply the provider URLs and keys through environment variables listed in `.env.example`. `AUTOFIT_OCR_SERVER_TOKEN` must be nonempty in the integrated stack; the same value belongs in the API service's `HEALTH_DOCUMENT_OCR_TOKEN`. Do not commit either value.

From this directory, install `requirements-server.txt` and run `python -m uvicorn server.app:app --host 127.0.0.1 --port 8000`. For the integrated HTTPS deployment, follow `../deploy/stack/README.md`.

`tests/regression_pdfs.py` accepts caller supplied local PDF files and defaults to the local server. The historical server addresses and deployment scripts remain in the source collection archive, outside this canonical repository.

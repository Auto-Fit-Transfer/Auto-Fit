FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements-server.txt /tmp/requirements-server.txt
RUN pip install --no-cache-dir -r /tmp/requirements-server.txt \
    && useradd --uid 10002 --create-home app

COPY --chown=app:app ocr/ /app/ocr/
COPY --chown=app:app server/ /app/server/
COPY --chown=app:app schema/ /app/schema/

USER app
EXPOSE 8000
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]

FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        libegl1 \
        libgl1 \
        libgles2 \
        libglib2.0-0 \
        libxcb1 \
    && rm -rf /var/lib/apt/lists/*

COPY app/scripts/download_pose_model.py app/scripts/download_pose_model.py

RUN python app/scripts/download_pose_model.py \
    --output /app/app/models/pose_landmarker_full.task

COPY . .

EXPOSE 8001

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]

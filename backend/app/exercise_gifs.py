"""Short-lived GET links for catalog assets in an existing private NCP bucket."""

from __future__ import annotations

import os
import re

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError

from backend.app.exercise_ai import ExerciseAIError, gif_path_for_exercise


def private_gif_urls(keys: set[str], location: str, gender: str) -> dict[str, str | None]:
    """Sign trusted catalog keys only; never persist or log the resulting URLs."""
    bucket = os.getenv("EXERCISE_GIF_BUCKET", "").strip()
    prefix = os.getenv("EXERCISE_GIF_PREFIX", "").strip()
    access_key = os.getenv("NCP_ACCESS_KEY_ID", "").strip()
    secret_key = os.getenv("NCP_SECRET_ACCESS_KEY", "").strip()
    try:
        ttl = int(os.getenv("EXERCISE_GIF_URL_TTL_SECONDS", "14400"))
    except ValueError:
        raise ExerciseAIError("Invalid GIF expiry") from None
    if (not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket)
            or not access_key or not secret_key or not 60 <= ttl <= 14400
            or (prefix and ("\\" in prefix or any(
                part in {"", ".", ".."} for part in prefix.split("/"))))):
        raise ExerciseAIError("Invalid private GIF configuration")
    try:
        client = boto3.client(
            "s3", endpoint_url="https://kr.object.ncloudstorage.com",
            region_name="kr-standard", aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        urls: dict[str, str | None] = {}
        for key in keys:
            path = gif_path_for_exercise(key, location, gender)
            urls[key] = None if path is None else client.generate_presigned_url(
                "get_object", Params={"Bucket": bucket, "Key": f"{prefix}/{path}" if prefix else path},
                ExpiresIn=ttl, HttpMethod="GET",
            )
        return urls
    except BotoCoreError:
        raise ExerciseAIError("Private GIF signing failed") from None

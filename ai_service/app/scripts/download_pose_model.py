from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
from urllib.request import urlopen


DEFAULT_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_full/float16/latest/"
    "pose_landmarker_full.task"
)
MINIMUM_MODEL_BYTES = 1_000_000
EXPECTED_MODEL_SHA256 = "4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad"


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_model(
    *,
    output_path: Path,
    model_url: str = DEFAULT_MODEL_URL,
    expected_sha256: str = EXPECTED_MODEL_SHA256,
) -> Path:
    """공식 MediaPipe 모델을 해시 검증 후 원자적으로 내려받는다."""

    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if (
        output_path.is_file()
        and output_path.stat().st_size >= MINIMUM_MODEL_BYTES
        and file_sha256(output_path) == expected_sha256
    ):
        return output_path

    temporary_path = output_path.with_suffix(
        f"{output_path.suffix}.download"
    )

    try:
        with urlopen(model_url, timeout=120) as response:
            with temporary_path.open("wb") as destination:
                while chunk := response.read(1024 * 1024):
                    destination.write(chunk)

        if temporary_path.stat().st_size < MINIMUM_MODEL_BYTES:
            raise RuntimeError(
                "Downloaded pose model is unexpectedly small."
            )
        if file_sha256(temporary_path) != expected_sha256:
            raise RuntimeError("Downloaded pose model SHA-256 does not match the pinned digest.")

        temporary_path.replace(output_path)
    finally:
        temporary_path.unlink(missing_ok=True)

    return output_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("app/models/pose_landmarker_full.task"),
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_MODEL_URL,
    )
    parser.add_argument("--sha256", default=EXPECTED_MODEL_SHA256)
    arguments = parser.parse_args()

    model_path = download_model(
        output_path=arguments.output,
        model_url=arguments.url,
        expected_sha256=arguments.sha256,
    )
    print(f"Pose model ready: {model_path}")


if __name__ == "__main__":
    main()

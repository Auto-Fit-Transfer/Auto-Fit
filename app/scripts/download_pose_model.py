from __future__ import annotations

import argparse
from pathlib import Path
from urllib.request import urlopen


DEFAULT_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_full/float16/latest/"
    "pose_landmarker_full.task"
)
MINIMUM_MODEL_BYTES = 1_000_000


def download_model(
    *,
    output_path: Path,
    model_url: str = DEFAULT_MODEL_URL,
) -> Path:
    """공식 MediaPipe 모델을 원자적으로 내려받는다."""

    output_path = output_path.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if (
        output_path.is_file()
        and output_path.stat().st_size >= MINIMUM_MODEL_BYTES
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
    arguments = parser.parse_args()

    model_path = download_model(
        output_path=arguments.output,
        model_url=arguments.url,
    )
    print(f"Pose model ready: {model_path}")


if __name__ == "__main__":
    main()

"""Preflight checks for the NCP exercise GIF upload operator tool."""

import csv
from pathlib import Path

import pytest

from backend.scripts.upload_exercise_gifs_ncp import load_assets, public_url


def write_catalog(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "is_primary_asset", "mapping_status", "relative_path", "file_size_bytes",
        ])
        writer.writeheader()
        writer.writerows(rows)


def test_preflight_uploads_only_app_eligible_primary_gifs(tmp_path: Path) -> None:
    root = tmp_path / "gifs"
    (root / "Male").mkdir(parents=True)
    gif = root / "Male" / "one.gif"
    gif.write_bytes(b"GIF89a" + b"payload")
    catalog = tmp_path / "catalog.csv"
    write_catalog(catalog, [
        {"is_primary_asset": "true", "mapping_status": "auto_mapped",
         "relative_path": "Male/one.gif", "file_size_bytes": str(gif.stat().st_size)},
        {"is_primary_asset": "true", "mapping_status": "needs_review",
         "relative_path": "Male/unreviewed.gif", "file_size_bytes": "99"},
    ])

    assets = load_assets(catalog, root, "v1")

    assert len(assets) == 1
    assert assets[0].key == "v1/Male/one.gif"
    assert public_url("my-bucket", assets[0].key) == (
        "https://kr.object.ncloudstorage.com/my-bucket/v1/Male/one.gif"
    )


@pytest.mark.parametrize("relative,size", [
    ("../escape.gif", "12"),
    ("Male/./one.gif", "12"),
    ("Male/one.gif", "14"),
])
def test_preflight_rejects_unsafe_or_changed_assets(
    tmp_path: Path, relative: str, size: str,
) -> None:
    root = tmp_path / "gifs"
    (root / "Male").mkdir(parents=True)
    (root / "Male" / "one.gif").write_bytes(b"GIF89a" + b"payload")
    catalog = tmp_path / "catalog.csv"
    write_catalog(catalog, [{
        "is_primary_asset": "true", "mapping_status": "auto_mapped",
        "relative_path": relative, "file_size_bytes": size,
    }])
    with pytest.raises(ValueError):
        load_assets(catalog, root)

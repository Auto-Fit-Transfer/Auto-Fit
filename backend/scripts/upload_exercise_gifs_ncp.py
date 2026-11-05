"""Upload catalog GIFs to an existing NCP Object Storage bucket.

Dry run needs only the Python standard library. Upload needs boto3 and NCP API
keys in the environment. The bucket must exist before this script is run.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote


CATALOG = Path(__file__).resolve().parents[1] / "data/exercise_assets/exercise_asset_catalog.csv"
ENDPOINT = "https://kr.object.ncloudstorage.com"


@dataclass(frozen=True)
class Asset:
    key: str
    path: Path
    size: int


def load_assets(catalog: Path, asset_root: Path, prefix: str = "") -> list[Asset]:
    """Check every app-eligible source before any remote write occurs."""
    root = asset_root.resolve(strict=True)
    prefix_parts = prefix.split("/") if prefix else []
    if any(part in {"", ".", ".."} for part in prefix_parts) or "\\" in prefix:
        raise ValueError("Object prefix must be a safe relative path")
    assets: list[Asset] = []
    seen: set[str] = set()
    with catalog.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["is_primary_asset"].lower() != "true" or row["mapping_status"] != "auto_mapped":
                continue
            relative = row["relative_path"]
            parts = relative.split("/")
            if (not relative or relative.startswith("/") or "\\" in relative
                    or any(part in {"", ".", ".."} for part in parts)
                    or not relative.lower().endswith(".gif")):
                raise ValueError(f"Unsafe catalog path: {relative!r}")
            path = root.joinpath(*parts)
            if not path.is_file() or not path.resolve().is_relative_to(root):
                raise ValueError(f"Missing or unsafe source: {relative}")
            size = int(row["file_size_bytes"])
            if size <= 0 or path.stat().st_size != size:
                raise ValueError(f"Size mismatch: {relative}")
            with path.open("rb") as source:
                if source.read(6) not in {b"GIF87a", b"GIF89a"}:
                    raise ValueError(f"Invalid GIF header: {relative}")
            key = "/".join((*prefix_parts, *parts))
            if key in seen:
                raise ValueError(f"Duplicate object key: {key}")
            seen.add(key)
            assets.append(Asset(key, path, size))
    if not assets:
        raise ValueError("No app-eligible GIFs found")
    return assets


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def public_url(bucket: str, key: str) -> str:
    return f"{ENDPOINT}/{bucket}/{quote(key, safe='/')}"


def upload_one(client: object, bucket: str, asset: Asset) -> str:
    from botocore.exceptions import ClientError

    digest = sha256_file(asset.path)
    try:
        remote = client.head_object(Bucket=bucket, Key=asset.key)
    except ClientError as exc:
        if exc.response["Error"]["Code"] not in {"404", "NoSuchKey", "NotFound"}:
            raise
    else:
        if (remote["ContentLength"] != asset.size
                or remote.get("Metadata", {}).get("sha256") != digest):
            raise ValueError(f"Existing object differs; refusing overwrite: {asset.key}")
        client.put_object_acl(Bucket=bucket, Key=asset.key, ACL="private")
        return "existing"
    client.upload_file(
        str(asset.path), bucket, asset.key,
        ExtraArgs={"ACL": "private", "ContentType": "image/gif",
                   "CacheControl": "private, no-store", "Metadata": {"sha256": digest}},
    )
    remote = client.head_object(Bucket=bucket, Key=asset.key)
    if remote["ContentLength"] != asset.size or remote.get("Metadata", {}).get("sha256") != digest:
        raise ValueError(f"Upload verification failed: {asset.key}")
    return "uploaded"


def verify_private(client: object, asset: Asset, bucket: str) -> None:
    remote = client.head_object(Bucket=bucket, Key=asset.key)
    acl = client.get_object_acl(Bucket=bucket, Key=asset.key)
    if remote["ContentLength"] != asset.size:
        raise ValueError(f"Private object verification failed: {asset.key}")
    if any(grant.get("Grantee", {}).get("Type") == "Group" for grant in acl.get("Grants", [])):
        raise ValueError(f"Object still has group access: {asset.key}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=CATALOG)
    parser.add_argument("--asset-root", type=Path, required=True)
    parser.add_argument("--bucket", help="Existing NCP Object Storage bucket")
    parser.add_argument("--prefix", default="", help="Optional immutable object prefix")
    parser.add_argument("--upload", action="store_true", help="Write objects to NCP")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    if args.workers < 1 or args.workers > 16:
        parser.error("--workers must be between 1 and 16")
    assets = load_assets(args.catalog, args.asset_root, args.prefix)
    total = sum(asset.size for asset in assets)
    print(f"Validated {len(assets)} app-eligible GIFs ({total / 1024**3:.2f} GiB)")
    if not args.upload:
        return
    if not args.bucket or not os.getenv("NCP_ACCESS_KEY_ID") or not os.getenv("NCP_SECRET_ACCESS_KEY"):
        parser.error("--upload needs --bucket and NCP_ACCESS_KEY_ID/NCP_SECRET_ACCESS_KEY")
    import boto3

    client = boto3.client(
        "s3", endpoint_url=ENDPOINT, region_name="kr-standard",
        aws_access_key_id=os.environ["NCP_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["NCP_SECRET_ACCESS_KEY"],
    )
    client.head_bucket(Bucket=args.bucket)
    counts = {"existing": 0, "uploaded": 0}
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(upload_one, client, args.bucket, asset): asset for asset in assets}
        for future in as_completed(futures):
            try:
                counts[future.result()] += 1
            except Exception:
                executor.shutdown(wait=False, cancel_futures=True)
                raise
            if sum(counts.values()) % 250 == 0:
                print(f"Processed {sum(counts.values())}/{len(assets)} objects", flush=True)
    print(f"Objects: {counts['uploaded']} uploaded, {counts['existing']} already present")
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(verify_private, client, asset, args.bucket) for asset in assets]
        for index, future in enumerate(as_completed(futures), 1):
            try:
                future.result()
            except Exception:
                executor.shutdown(wait=False, cancel_futures=True)
                raise
            if index % 500 == 0:
                print(f"Verified {index}/{len(assets)} private objects", flush=True)
    print(f"Verified {len(assets)} private objects")
    print(f"EXERCISE_GIF_BUCKET={args.bucket}")
    print(f"EXERCISE_GIF_PREFIX={args.prefix}")


if __name__ == "__main__":
    main()

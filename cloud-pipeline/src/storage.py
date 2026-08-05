"""Upload to Cloudflare R2 (S3-compatible) and build public URLs."""
from __future__ import annotations

import os
from pathlib import Path

import boto3
from botocore.client import Config


_EPISODE_PREFIX_FULL = "episodes/"


def _client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def episode_prefix(variant: str = "full") -> str:
    """Return the R2 key prefix for episodes of the given variant.

    ``full``    -> ``episodes/`` (constant, the historical private feed).
    ``general`` -> ``$EPISODE_PREFIX_GENERAL`` or ``episodes-general/`` (the
                   public/sharing feed).
    """
    if variant == "full":
        return _EPISODE_PREFIX_FULL
    if variant == "general":
        return os.environ.get("EPISODE_PREFIX_GENERAL", "episodes-general/")
    raise ValueError(f"Unknown variant: {variant!r}")


def upload(local_path: str | Path, key: str, *, content_type: str | None = None) -> str:
    """Upload a file to R2, return its public URL."""
    extra = {"ACL": "public-read"}
    if content_type:
        extra["ContentType"] = content_type
    bucket = os.environ["R2_BUCKET"]
    _client().upload_file(str(local_path), bucket, key, ExtraArgs=extra)
    return f"{os.environ['R2_PUBLIC_URL'].rstrip('/')}/{key}"


def upload_bytes(data: bytes, key: str, *, content_type: str = "application/octet-stream") -> str:
    bucket = os.environ["R2_BUCKET"]
    _client().put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type, ACL="public-read")
    return f"{os.environ['R2_PUBLIC_URL'].rstrip('/')}/{key}"


def list_episodes(prefix: str = "episodes/") -> list[dict]:
    """List existing episodes for feed regeneration."""
    bucket = os.environ["R2_BUCKET"]
    paginator = _client().get_paginator("list_objects_v2")
    out = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            if obj["Key"].endswith(".mp3"):
                out.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"],
                    "url": f"{os.environ['R2_PUBLIC_URL'].rstrip('/')}/{obj['Key']}",
                })
    return sorted(out, key=lambda x: x["last_modified"], reverse=True)

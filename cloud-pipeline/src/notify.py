"""Slack webhook notification."""
from __future__ import annotations

import json
import os
import urllib.request


def send(message: str, *, webhook_url: str | None = None) -> None:
    url = webhook_url or os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        print("[notify] SLACK_WEBHOOK_URL absent, skip")
        return
    req = urllib.request.Request(
        url,
        data=json.dumps({"text": message}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status != 200:
            print(f"[notify] Slack non-200: {resp.status}")

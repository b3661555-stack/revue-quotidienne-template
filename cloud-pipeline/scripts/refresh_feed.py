"""Re-render and re-upload feed.xml from existing R2 episodes (no MP3 regeneration)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env", override=True)

from src import feed, storage


def main() -> None:
    cover_url = f"{os.environ['R2_PUBLIC_URL'].rstrip('/')}/assets/cover.png"
    items = []
    for obj in storage.list_episodes():
        date_str = obj["key"].replace("episodes/revue_", "").replace(".mp3", "")
        items.append(feed.build_episode_entry(
            url=obj["url"],
            date=obj["last_modified"],
            size=obj["size"],
            title=f"Revue du {date_str}",
            description=f"Revue quotidienne du {date_str}.",
            duration_seconds=0,
        ))
    feed_xml = feed.render_feed(items, cover_url)
    feed_url = storage.upload_bytes(
        feed_xml.encode("utf-8"), "feed.xml",
        content_type="application/rss+xml; charset=utf-8",
    )
    print(f"Feed re-uploaded: {feed_url} ({len(feed_xml)} bytes, {len(items)} items)")


if __name__ == "__main__":
    main()

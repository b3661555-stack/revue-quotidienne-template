"""Orchestrator: gather → write → (tts → upload → feed) par flux indépendant → notify."""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

# Ensure parent dir is importable when run directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Load .env from the cloud-pipeline directory if present (no-op on GitHub Actions where vars come from secrets)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)
except ImportError:
    pass

from src import dates, feed, notify, pubmed, storage, tts, writer

JINGLE_PATH = Path(__file__).resolve().parent.parent / "assets" / "jingle_intro.mp3"

# Per-variant config: (R2 text key suffix, cover asset filename)
_VARIANT_COVER = {"full": "cover.png", "general": "cover-general.png"}


def _local_now():
    tz = os.environ.get("PODCAST_TIMEZONE", "Europe/Zurich")
    return datetime.now(ZoneInfo(tz))


def _audio_duration_seconds(path: Path) -> int:
    """Use ffprobe to get the audio duration in seconds (rounded)."""
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            text=True,
        )
        return int(round(float(out.strip())))
    except Exception:
        return 0


def _prepend_jingle(audio_path: Path, jingle_path: Path) -> None:
    """Prepend the jingle to ``audio_path`` in-place via ffmpeg (re-encodes)."""
    if not jingle_path.exists():
        return
    tmp_path = audio_path.with_suffix(audio_path.suffix + ".prepend.tmp.mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-i", str(jingle_path), "-i", str(audio_path),
         "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[a]",
         "-map", "[a]", "-c:a", "libmp3lame", "-b:a", "192k",
         str(tmp_path)],
        check=True,
    )
    tmp_path.replace(audio_path)


def _synth_with_duration(text: str, out_path: Path) -> int:
    """Synthesize ``text`` to ``out_path``, prepend jingle, return duration in seconds."""
    tts.synthesize(text, out_path)
    _prepend_jingle(out_path, JINGLE_PATH)
    return _audio_duration_seconds(out_path)


def _build_feed_items(variant: str, today_key: str, today_duration: int) -> list[dict]:
    """List all episodes of a variant on R2, build feed entries.

    The duration of today's freshly-uploaded episode is injected from
    ``today_duration`` (no ffprobe round-trip on R2). Past episodes are
    listed with ``duration=0`` since their durations are not stored.
    """
    prefix = storage.episode_prefix(variant)
    items: list[dict] = []
    for obj in storage.list_episodes(prefix=prefix):
        date_str = obj["key"].replace(f"{prefix}revue_", "").replace(".mp3", "")
        items.append(feed.build_episode_entry(
            url=obj["url"],
            date=obj["last_modified"],
            size=obj["size"],
            title=f"Revue du {date_str}",
            description=f"Revue quotidienne du {date_str}.",
            duration_seconds=today_duration if obj["key"] == today_key else 0,
        ))
    return items


def _fmt_duration(sec: int) -> str:
    return f"{sec//60} min {sec%60:02d}s"


def _websub_ping(feed_url: str, variant: str) -> None:
    """Notify WebSub hub so Spotify/Apple/Overcast re-poll the feed quickly."""
    try:
        payload = f"hub.mode=publish&hub.url={requests.utils.quote(feed_url, safe='')}"
        resp = requests.post("https://pubsubhubbub.appspot.com/publish", data=payload,
                             headers={"Content-Type": "application/x-www-form-urlencoded"},
                             timeout=10)
        print(f"  hub ping {variant} -> HTTP {resp.status_code}")
    except Exception as exc:
        print(f"  hub ping {variant} failed ({exc})")


def _publish_variant(variant: str, text: str, today_iso: str, td: str,
                     assets_dir: Path) -> dict:
    """Synthesize → upload MP3+text → build & upload feed → WebSub ping, for one flux.

    Each variant is fully independent: a failure here (e.g. Azure TTS quota)
    raises and is caught by the caller, so the other flux can still publish.
    Returns a dict with ``ep_url``, ``feed_url`` and ``duration``.
    """
    mp3_path = Path(td) / f"revue_{today_iso}-{variant}.mp3"
    duration = _synth_with_duration(text, mp3_path)

    ep_key = f"{storage.episode_prefix(variant)}revue_{today_iso}.mp3"
    ep_url = storage.upload(mp3_path, ep_key, content_type="audio/mpeg")

    text_key = (f"texts/revue_{today_iso}.txt" if variant == "full"
                else f"texts/revue_{today_iso}-general.txt")
    storage.upload_bytes(text.encode("utf-8"), text_key,
                         content_type="text/plain; charset=utf-8")

    cover_name = _VARIANT_COVER[variant]
    cover_url = storage.upload(assets_dir / cover_name, f"assets/{cover_name}",
                               content_type="image/png")

    items = _build_feed_items(variant, ep_key, duration)
    feed_xml = feed.render_feed(items, cover_url, variant=variant)
    feed_url = storage.upload_bytes(
        feed_xml.encode("utf-8"),
        feed.feed_filename(variant),
        content_type="application/rss+xml; charset=utf-8",
    )

    _websub_ping(feed_url, variant)
    print(f"  [{variant}] OK -> {_fmt_duration(duration)}")
    return {"ep_url": ep_url, "feed_url": feed_url, "duration": duration}


def run() -> None:
    now = _local_now()
    today_iso = now.strftime("%Y-%m-%d")
    today_fr = now.strftime("%d/%m/%Y")
    print(f"=== Revue quotidienne — {today_fr} ===")

    # 1) Gather PubMed
    print("[1/6] PubMed...")
    pm_data = pubmed.gather_all(days_back=3)
    for k, v in pm_data.items():
        print(f"  {k}: {len(v)} articles")

    # 2) Editorial draft via Anthropic + web_search (un seul appel, sept sections balisées)
    print("[2/6] Anthropic draft (web_search activé)...")
    # Fetch yesterday's plain text for deduplication (soft — ignore any error)
    yesterday_iso = (now.date() - timedelta(days=1)).isoformat()
    previous_revue = ""
    try:
        r2_base = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
        if r2_base:
            resp = requests.get(f"{r2_base}/texts/revue_{yesterday_iso}.txt", timeout=10)
            if resp.ok:
                previous_revue = resp.text
                print(f"  Texte d'hier récupéré ({len(previous_revue)} chars)")
            else:
                print(f"  Texte d'hier absent (HTTP {resp.status_code})")
    except Exception as exc:
        print(f"  Texte d'hier non disponible ({exc})")
    revue_raw, sources_md = writer.write_revue(now, pm_data, previous_revue=previous_revue)
    sections = writer.split_sections(revue_raw)
    text_full = writer.build_text(sections, writer.SECTIONS_FULL)
    text_general = writer.build_text(sections, writer.SECTIONS_GENERAL)
    # Catch hallucinated weekdays (e.g. "vendredi 2 mai" on a Saturday) before TTS.
    dates.validate_dates(text_full, now)
    dates.validate_dates(text_general, now)
    print(f"  sections trouvées: {sorted(sections.keys())}")
    print(f"  texte complet : {len(text_full)} chars")
    print(f"  texte général : {len(text_general)} chars")

    # 3-5) Chaque flux (full + général) est traité indépendamment : synthèse,
    # upload, feed et ping. Un échec sur un flux (ex. quota Azure TTS) n'empêche
    # pas l'autre d'être publié.
    print("[3/6] TTS + upload + feed (deux flux indépendants)...")
    assets_dir = Path(__file__).resolve().parent.parent / "assets"
    variant_texts = {"full": text_full, "general": text_general}
    results: dict[str, dict | None] = {}
    with tempfile.TemporaryDirectory() as td:
        for variant, text in variant_texts.items():
            try:
                results[variant] = _publish_variant(
                    variant, text, today_iso, td, assets_dir,
                )
            except Exception as exc:
                results[variant] = None
                print(f"  [{variant}] ÉCHEC: {exc}")

    # Sources (soft — best effort, ne bloque pas la publication)
    try:
        storage.upload_bytes(sources_md.encode("utf-8"),
                             f"sources/sources_{today_iso}.md",
                             content_type="text/markdown; charset=utf-8")
    except Exception as exc:
        print(f"  sources upload failed ({exc})")

    res_full = results.get("full")
    res_general = results.get("general")

    # 6) Slack notification — uniquement les liens des flux qui ont réussi
    print("[6/6] Slack...")
    lines = [f":newspaper: *Revue quotidienne — {today_fr}* est prête", ""]
    if res_full:
        lines.append(
            f"▶︎ <{res_full['ep_url']}|Écouter (privé, complet)> "
            f"({_fmt_duration(res_full['duration'])})"
        )
    if res_general:
        lines.append(
            f"▶︎ <{res_general['ep_url']}|Écouter (partage, raccourci)> "
            f"({_fmt_duration(res_general['duration'])})"
        )
    lines.append("")
    if res_full:
        lines.append(f":scroll: <{res_full['feed_url']}|Flux RSS privé>")
    if res_general:
        lines.append(
            f":loudspeaker: <{res_general['feed_url']}|Flux RSS partageable> "
            f"— à transmettre librement"
        )
    failed = [v for v, r in results.items() if r is None]
    if failed:
        lines.append("")
        lines.append(f":warning: Flux en échec : {', '.join(failed)}")
    msg = "\n".join(lines)

    if os.environ.get("SLACK_NOTIFY", "true").lower() not in ("false", "0", "no"):
        notify.send(msg)
    else:
        print("[notify] SLACK_NOTIFY=false, skip")

    # Exit non-zero seulement si AUCUN flux n'a abouti (panne totale).
    if not any(results.values()):
        raise RuntimeError("Les deux flux ont échoué — aucun épisode publié.")
    print("=== OK ===")


if __name__ == "__main__":
    run()

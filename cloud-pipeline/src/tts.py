"""Text-to-speech via edge-tts (gratuit, sans clé): chunk, synthesize, concatenate.

Remplace l'ancien backend Azure TTS (REST + Ocp-Apim-Subscription-Key) par
edge-tts, qui expose les MÊMES voix neuronales (ex. fr-FR-VivienneMultilingualNeural)
sans clé API ni quota. Aucune variable AZURE_SPEECH_* n'est plus requise ; on garde
seulement AZURE_VOICE_NAME et PROSODY_RATE pour la configuration de la voix.
"""
from __future__ import annotations

import asyncio
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

import edge_tts

_MARKDOWN_LITERAL = re.compile(r"[*_`~]")


def _sanitize_for_speech(text: str) -> str:
    """Strip inline markdown chars TTS would otherwise read literally."""
    return _MARKDOWN_LITERAL.sub("", text)


def _split_chunks(text: str, max_chars: int = 1500) -> list[str]:
    paras = [p.strip() for p in re.split(r"\n\n+", text) if p.strip()]
    chunks, cur = [], ""
    for p in paras:
        if cur and len(cur) + len(p) + 2 > max_chars:
            chunks.append(cur)
            cur = p
        else:
            cur = (cur + "\n\n" + p) if cur else p
    if cur:
        chunks.append(cur)
    return chunks


def _normalize_rate(rate: str) -> str:
    """edge-tts attend un pourcentage signé, ex. '+0%' ou '-10%'."""
    rate = (rate or "0%").strip()
    if not rate.endswith("%"):
        rate = f"{rate}%"
    if not rate.startswith(("+", "-")):
        rate = f"+{rate}"
    return rate


async def _synth_one_async(text: str, out_file: str, *, voice: str, rate: str) -> None:
    communicate = edge_tts.Communicate(text, voice=voice, rate=rate)
    await communicate.save(out_file)


def _synth_one(text: str, out_file: str, *, voice: str, rate: str) -> None:
    """Synthesize one chunk to ``out_file`` with retry/backoff on transient errors."""
    last_exc: Exception | None = None
    for attempt in range(6):
        try:
            asyncio.run(_synth_one_async(text, out_file, voice=voice, rate=rate))
            if Path(out_file).stat().st_size > 0:
                return
            raise RuntimeError("edge-tts a renvoyé un fichier vide")
        except Exception as e:  # network / throttle / NoAudioReceived -> retry
            last_exc = e
            if attempt < 5:
                delay = min(2 ** (attempt + 1), 60)
                print(f"[tts] edge-tts échec ({e}) — retry {attempt + 1}/5 dans {delay:.0f}s")
                time.sleep(delay)
                continue
            raise
    if last_exc:
        raise last_exc


def synthesize(text: str, out_path: str | Path) -> Path:
    text = _sanitize_for_speech(text)
    voice = os.environ.get("AZURE_VOICE_NAME", "fr-FR-VivienneMultilingualNeural")
    rate = _normalize_rate(os.environ.get("PROSODY_RATE", "0%"))

    chunks = _split_chunks(text)
    print(f"[tts] {len(chunks)} chunks à synthétiser (edge-tts), voix={voice}, rate={rate}")

    with tempfile.TemporaryDirectory() as td:
        files = []
        for i, ch in enumerate(chunks, 1):
            f = Path(td) / f"chunk_{i:03d}.mp3"
            _synth_one(ch, str(f), voice=voice, rate=rate)
            files.append(str(f))
            print(f"[tts] chunk {i}/{len(chunks)} -> {f.stat().st_size} octets")

        # Concat with ffmpeg (edge-tts produit un format mp3 homogène, copie sûre)
        list_path = Path(td) / "list.txt"
        list_path.write_text("\n".join(f"file '{f}'" for f in files))
        out = Path(out_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error",
             "-f", "concat", "-safe", "0", "-i", str(list_path),
             "-c", "copy", str(out)],
            check=True,
        )
        print(f"[tts] -> {out} ({out.stat().st_size} octets)")
        return out

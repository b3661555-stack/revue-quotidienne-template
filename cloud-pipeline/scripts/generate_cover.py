"""Generate a 3000x3000 podcast cover and upload to R2 at assets/cover.png."""
from __future__ import annotations

import os
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from src.storage import upload_bytes


def find_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Avenir Next.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNS.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def main() -> None:
    size = 3000
    bg_top = (15, 23, 42)
    bg_bot = (30, 64, 175)

    img = Image.new("RGB", (size, size), bg_top)
    for y in range(size):
        t = y / (size - 1)
        r = int(bg_top[0] + (bg_bot[0] - bg_top[0]) * t)
        g = int(bg_top[1] + (bg_bot[1] - bg_top[1]) * t)
        b = int(bg_top[2] + (bg_bot[2] - bg_top[2]) * t)
        for x in range(size):
            img.putpixel((x, y), (r, g, b))

    draw = ImageDraw.Draw(img)
    accent = (250, 204, 21)
    margin = 240

    title_font = find_font(360)
    subtitle_font = find_font(150)
    tag_font = find_font(110)

    title = "Revue"
    title2 = "quotidienne"
    subtitle = "Actu · Science · Sport · IA"

    bbox1 = draw.textbbox((0, 0), title, font=title_font)
    w1 = bbox1[2] - bbox1[0]
    h1 = bbox1[3] - bbox1[1]
    draw.text(((size - w1) / 2, size / 2 - h1 - 100), title, fill=(255, 255, 255), font=title_font)

    bbox2 = draw.textbbox((0, 0), title2, font=title_font)
    w2 = bbox2[2] - bbox2[0]
    draw.text(((size - w2) / 2, size / 2 + 80), title2, fill=accent, font=title_font)

    bbox3 = draw.textbbox((0, 0), subtitle, font=subtitle_font)
    w3 = bbox3[2] - bbox3[0]
    draw.text(((size - w3) / 2, size - margin - 380), subtitle, fill=(226, 232, 240), font=subtitle_font)

    bar_y = size - margin - 180
    draw.rectangle([(margin, bar_y), (size - margin, bar_y + 8)], fill=accent)

    tag = "FR · 6 min · 05:30 UTC"
    bbox4 = draw.textbbox((0, 0), tag, font=tag_font)
    w4 = bbox4[2] - bbox4[0]
    draw.text(((size - w4) / 2, bar_y + 60), tag, fill=(148, 163, 184), font=tag_font)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    data = buf.getvalue()

    local = ROOT / "assets" / "cover.png"
    local.write_bytes(data)
    print(f"Cover generated locally: {local} ({len(data)} bytes)")

    url = upload_bytes(data, "assets/cover.png", content_type="image/png")
    print(f"Uploaded: {url}")


if __name__ == "__main__":
    main()

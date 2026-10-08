#!/usr/bin/env python3
"""Regenerate the Iter Open Graph cards.

Composites the brand card -- logomark, wordmark, headline, subcopy, footer
rule and the equalizer glyph -- over the painted backdrops in
`apps/web/assets/og/`, and writes the two share images that the
`/api/og` route serves:

    apps/web/public/images/opengraph-light.jpg
    apps/web/public/images/opengraph-dark.jpg

The card is laid out as HTML and rendered by headless Chrome so the real
Satoshi variable font is shaped and kerned exactly as it is on the site;
Pillow only re-encodes the result. Geometry below is measured from the
pre-backdrop cards (flat-gradient `opengraph.png` / `opengraph-light.png`
as of c2fbae4) so the lock-up lands in the same place it always has.

Requirements: Google Chrome (or set $CHROME) and Pillow.

    python3 apps/web/scripts/og/generate-og.py
"""

from __future__ import annotations

import base64
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

WEB = Path(__file__).resolve().parents[2]
ASSETS = WEB / "assets" / "og"
OUT = WEB / "public" / "images"
FONT = WEB / "public" / "fonts" / "Satoshi-Variable.woff2"

WIDTH, HEIGHT = 1200, 630
JPEG_QUALITY = 86

# Copy is duplicated from the landing hero on purpose: the card has to
# read on its own in a link unfurl, so it restates the pitch rather than
# pulling live strings out of the app.
HEADLINE_1 = "Fully on-chain order book."
HEADLINE_2 = "Inventory and settlement, solved."
SUBCOPY_1 = "Trade from your own wallet on one open order book. Every trade fills at"
SUBCOPY_2 = "a price you agreed to."
FOOTER = "rate.limo"

# The 12-bar logomark, transcribed from public/off_grid_logomark_v2.svg
# (Figma node 5254:8599). That file bakes the diagonal wipe in as opaque
# #09111D overlays, which only works on the flat app background -- over a
# painting they would read as dark blocks. Here the same wipe is applied
# as an alpha mask instead, so the erased part of each bar goes
# transparent and the backdrop shows through.
MARK_VIEWBOX = (93, 92)
MARK_BAR_W = 2.718
MARK_BAR_H = 91.661
# (bar x, wipe y, wipe height, wipe strength) -- strength 1.0 erases fully.
MARK_BARS = [
    (89.71, 0.00, 43.997, 0.08),
    (81.55, 2.75, 43.539, 0.16),
    (73.40, 5.50, 43.997, 0.24),
    (65.24, 10.08, 43.997, 0.32),
    (57.09, 16.96, 43.081, 0.40),
    (48.93, 25.21, 43.081, 0.48),
    (40.78, 32.54, 43.081, 0.56),
    (32.66, 38.50, 43.539, 0.64),
    (24.47, 42.16, 43.081, 0.72),
    (16.31, 46.75, 41.706, 0.80),
    (8.16, 48.58, 43.081, 0.88),
    (0.00, 52.71, 38.956, 1.00),
]

# Equalizer glyph, bottom right. Measured bar heights, 6px wide on an
# 11px pitch, sitting on the same baseline as the footer text.
GLYPH_HEIGHTS = [18, 29, 39, 49, 56, 61, 64, 64, 61, 56, 49, 39, 29, 18]
GLYPH_BAR_W = 6
GLYPH_PITCH = 11
GLYPH_RIGHT = 73  # distance from the right edge to the last bar
GLYPH_BASELINE = 566  # y of the bar feet


@dataclass(frozen=True)
class Theme:
    name: str
    backdrop: str
    # Card ink, sampled from the pre-backdrop cards.
    headline: str
    accent: str
    # Brand mark colour (--m-logo), deliberately decoupled from the sky-blue
    # UI accent: the Iter logomark + wordmark + dot stay emerald in both
    # themes (deep emerald in light, mint in dark). See app/globals.css.
    logo: str
    subcopy: str
    footer: str
    glyph: str
    # Scrim: the backdrop is a painting, so the text side needs to be
    # pulled back toward the app background colour or nothing reads.
    scrim: str
    scrim_strong: float
    scrim_mid: float
    scrim_soft: float


LIGHT = Theme(
    name="light",
    backdrop="background-light.png",
    headline="#16283A",
    accent="#4A7AA8",
    logo="#B07A08",  # high noon (--m-logo light)
    subcopy="#3F5666",
    footer="#5A7284",
    glyph="#5E91C2",
    scrim="238, 244, 248",
    scrim_strong=0.93,
    scrim_mid=0.84,
    scrim_soft=0.34,
)

DARK = Theme(
    name="dark",
    backdrop="background-dark.png",
    headline="#FFFFFF",
    accent="#79A9E8",
    logo="#E85D2A",  # last light (--m-logo dark)
    subcopy="#9EB2C7",
    footer="#8296AC",
    glyph="#5F93D6",
    scrim="9, 17, 29",
    scrim_strong=0.92,
    scrim_mid=0.82,
    scrim_soft=0.36,
)


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def prepare_backdrop(src: Path, tmp: Path) -> Path:
    """Cover-crop a backdrop to the card size before it is inlined.

    The source paintings are ~3 MB and neither is 1.91:1, so they get
    centre-cropped to the card's aspect and downscaled here. Doing it in
    Pillow rather than leaving it to CSS `object-fit` matters for more
    than tidiness: inlining the full-size originals as base64 produces a
    ~4 MB document that headless Chrome will sit on indefinitely.
    """
    img = Image.open(src).convert("RGB")
    scale = max(WIDTH / img.width, HEIGHT / img.height)
    resized = img.resize(
        (round(img.width * scale), round(img.height * scale)), Image.LANCZOS
    )
    left = (resized.width - WIDTH) // 2
    top = (resized.height - HEIGHT) // 2
    cropped = resized.crop((left, top, left + WIDTH, top + HEIGHT))
    dest = tmp / f"backdrop-{src.stem}.png"
    cropped.save(dest, "PNG")
    return dest


def mark_svg(color: str) -> str:
    """The logomark, with the diagonal wipe expressed as an alpha mask."""
    vb_w, vb_h = MARK_VIEWBOX
    bars, wipes = [], []
    for x, wipe_y, wipe_h, strength in MARK_BARS:
        bars.append(
            f'<rect x="{x}" y="0" width="{MARK_BAR_W}" height="{MARK_BAR_H}" fill="white"/>'
        )
        # In the mask, grey = partially kept. strength 1.0 -> black -> gone.
        keep = round((1 - strength) * 255)
        wipes.append(
            f'<rect x="{x}" y="{wipe_y}" width="{MARK_BAR_W}" height="{wipe_h}" '
            f'fill="rgb({keep},{keep},{keep})"/>'
        )
    return (
        f'<svg class="mark" viewBox="0 0 {vb_w} {vb_h}" xmlns="http://www.w3.org/2000/svg" '
        f'role="img" aria-label="Iter">'
        f'<mask id="wipe" maskUnits="userSpaceOnUse" x="0" y="0" width="{vb_w}" height="{vb_h}">'
        f'{"".join(bars)}{"".join(wipes)}</mask>'
        f'<rect x="0" y="0" width="{vb_w}" height="{vb_h}" fill="{color}" mask="url(#wipe)"/>'
        f"</svg>"
    )


def glyph_svg(color: str) -> str:
    width = GLYPH_PITCH * (len(GLYPH_HEIGHTS) - 1) + GLYPH_BAR_W
    height = max(GLYPH_HEIGHTS)
    bars = []
    for i, h in enumerate(GLYPH_HEIGHTS):
        x = i * GLYPH_PITCH
        bars.append(
            f'<rect x="{x}" y="{height - h}" width="{GLYPH_BAR_W}" height="{h}" '
            f'rx="{GLYPH_BAR_W / 2}" fill="{color}"/>'
        )
    return (
        f'<svg class="glyph" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        f'{"".join(bars)}</svg>'
    )


def build_html(theme: Theme, backdrop_png: Path) -> str:
    backdrop = data_uri(backdrop_png)
    font = data_uri(FONT)
    r = theme.scrim
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face {{
  font-family: 'Satoshi';
  src: url('{font}') format('woff2');
  font-weight: 300 900;
  font-display: block;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ width: {WIDTH}px; height: {HEIGHT}px; overflow: hidden; }}
.card {{
  position: relative; width: {WIDTH}px; height: {HEIGHT}px;
  font-family: 'Satoshi', sans-serif;
  -webkit-font-smoothing: antialiased;
  background: rgb({r});
}}
.backdrop {{
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; object-position: center;
}}
/* Horizontal scrim: heavy under the copy on the left, opening up on the
   right so the painting stays visible. */
.scrim {{
  position: absolute; inset: 0;
  background: linear-gradient(90deg,
    rgba({r}, {theme.scrim_strong}) 0%,
    rgba({r}, {theme.scrim_mid}) 44%,
    rgba({r}, {theme.scrim_soft}) 76%,
    rgba({r}, {theme.scrim_soft}) 100%);
}}
/* A touch more weight at the very bottom so the footer rule and glyph
   never sit on a busy patch of brushwork. */
.scrim-foot {{
  position: absolute; inset: 0;
  background: linear-gradient(180deg,
    rgba({r}, 0) 62%,
    rgba({r}, 0.30) 100%);
}}
.mark {{ position: absolute; left: 72px; top: 64px; width: 40px; height: 40px; }}
.wordmark {{
  position: absolute; left: 131px; top: 64px; height: 40px;
  display: flex; align-items: center; gap: 14px;
  font-size: 33px; font-weight: 600; letter-spacing: 0.055em;
  color: {theme.logo};
}}
.dot {{ width: 10px; height: 10px; background: {theme.logo}; }}
.headline {{
  position: absolute; left: 72px; top: 180px;
  font-size: 64px; line-height: 75px; font-weight: 500;
  letter-spacing: -0.017em;
  color: {theme.headline};
}}
.headline .accent {{ color: {theme.accent}; display: block; }}
.subcopy {{
  position: absolute; left: 72px; top: 355px;
  font-size: 23px; line-height: 34px; font-weight: 400;
  color: {theme.subcopy};
}}
.footer {{
  position: absolute; left: 72px; top: 543px;
  font-size: 16px; font-weight: 500; letter-spacing: 0.085em;
  text-transform: uppercase;
  color: {theme.footer};
}}
.glyph {{ position: absolute; right: {GLYPH_RIGHT}px; bottom: {HEIGHT - GLYPH_BASELINE}px; }}
</style></head>
<body>
  <div class="card">
    <img class="backdrop" src="{backdrop}" alt="">
    <div class="scrim"></div>
    <div class="scrim-foot"></div>
    {mark_svg(theme.logo)}
    <div class="wordmark"><span>Iter</span></div>
    <div class="headline">{HEADLINE_1}<span class="accent">{HEADLINE_2}</span></div>
    <div class="subcopy">{SUBCOPY_1}<br>{SUBCOPY_2}</div>
    <div class="footer">{FOOTER}</div>
    {glyph_svg(theme.glyph)}
  </div>
</body></html>
"""


def find_chrome() -> str:
    candidates = [
        os.environ.get("CHROME"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
    ]
    for c in candidates:
        if c and Path(c).exists():
            return c
    sys.exit("Chrome not found. Install Google Chrome or set $CHROME.")


def wait_for_screenshot(
    shot: Path, proc: subprocess.Popen, timeout: float = 120.0
) -> None:
    """Block until Chrome has finished writing `shot`.

    The file appears before it is complete, so this also waits for its
    size to stop growing rather than handing a truncated PNG to Pillow.
    """
    deadline = time.monotonic() + timeout
    last_size = -1
    stable_since = None
    while time.monotonic() < deadline:
        if shot.exists():
            size = shot.stat().st_size
            if size > 0 and size == last_size:
                if stable_since is None:
                    stable_since = time.monotonic()
                elif time.monotonic() - stable_since >= 0.4:
                    return
            else:
                stable_since = None
            last_size = size
        elif proc.poll() is not None:
            sys.exit("Chrome exited before writing a screenshot.")
        time.sleep(0.2)
    sys.exit(f"Timed out after {timeout:.0f}s waiting for Chrome to write {shot.name}.")


def render(theme: Theme, chrome: str) -> Path:
    dest = OUT / f"opengraph-{theme.name}.jpg"
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        backdrop = prepare_backdrop(ASSETS / theme.backdrop, tmp)
        page = tmp / "card.html"
        page.write_text(build_html(theme, backdrop), encoding="utf-8")
        shot = tmp / "card.png"
        proc = subprocess.Popen(
            [
                chrome,
                "--headless",
                "--disable-gpu",
                "--no-sandbox",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                f"--window-size={WIDTH},{HEIGHT}",
                # No --virtual-time-budget: with the font and backdrop
                # inlined as data URIs, Chrome never advances virtual time
                # and the process hangs forever. Everything the page needs
                # is embedded, so the default "screenshot once loaded"
                # behaviour is both correct and immediate.
                f"--screenshot={shot}",
                f"--user-data-dir={tmp / 'profile'}",
                page.as_uri(),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        # Wait on the artifact, not on the process. This build of Chrome
        # writes the screenshot and then declines to exit, so waiting for
        # the process to finish just stalls until something kills it.
        try:
            wait_for_screenshot(shot, proc)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
        img = Image.open(shot).convert("RGB")
        if img.size != (WIDTH, HEIGHT):
            img = img.resize((WIDTH, HEIGHT), Image.LANCZOS)
        # JPEG, not PNG: the backdrop is a painting, and a lossless
        # encode of it lands around 1.5 MB -- over the ~300 KB budget
        # WhatsApp needs before it silently drops the preview.
        img.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return dest


def main() -> None:
    # `--html <dir>` dumps the card markup and its cropped backdrop
    # without rendering, which is the quickest way to open the layout in
    # a real browser and poke at it.
    if "--html" in sys.argv:
        out_dir = Path(sys.argv[sys.argv.index("--html") + 1]).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        for theme in (LIGHT, DARK):
            backdrop = prepare_backdrop(ASSETS / theme.backdrop, out_dir)
            page = out_dir / f"card-{theme.name}.html"
            page.write_text(build_html(theme, backdrop), encoding="utf-8")
            print(f"  {page}")
        return

    chrome = find_chrome()
    OUT.mkdir(parents=True, exist_ok=True)
    for theme in (LIGHT, DARK):
        dest = render(theme, chrome)
        print(f"  {dest.relative_to(WEB)}  {dest.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()

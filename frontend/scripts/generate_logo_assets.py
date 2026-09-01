#!/usr/bin/env python3
"""Generate GigZee app icon / splash assets from the source logo."""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

SOURCE = Path(
    "/Users/abhilashanand/.cursor/projects/Users-abhilashanand-Desktop-Gigzee-StageLink/assets/"
    "ChatGPT_Image_Aug_5__2026__07_19_22_PM-b9c5761a-8206-446c-a0ba-8c88fc58eecd.png"
)
OUT_DIR = Path(__file__).resolve().parents[1] / "assets" / "images"


def trim_whitespace(img: Image.Image, threshold: int = 245) -> Image.Image:
    """Crop near-white margins so padding is measured from the logo itself."""
    rgba = img.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    left, top, right, bottom = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 16:
                continue
            if r >= threshold and g >= threshold and b >= threshold:
                continue
            found = True
            if x < left:
                left = x
            if y < top:
                top = y
            if x > right:
                right = x
            if y > bottom:
                bottom = y
    if not found:
        return rgba
    return rgba.crop((left, top, right + 1, bottom + 1))


def fit_on_canvas(
    logo: Image.Image,
    size: int,
    padding_frac: float,
    bg: tuple[int, int, int, int] = (255, 255, 255, 255),
) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    max_side = int(size * (1.0 - 2.0 * padding_frac))
    lw, lh = logo.size
    scale = min(max_side / lw, max_side / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def crop_mark_only(logo: Image.Image) -> Image.Image:
    """Prefer the graphic mark (top portion) for icons; fall back to full logo."""
    w, h = logo.size
    # Heuristic: mark sits above wordmark; keep upper ~62% then re-trim.
    mark = logo.crop((0, 0, w, int(h * 0.62)))
    mark = trim_whitespace(mark)
    mw, mh = mark.size
    if mw < 10 or mh < 10:
        return logo
    return mark


def to_white_silhouette(logo: Image.Image, size: int) -> Image.Image:
    """White opaque silhouette on transparent background (notification icon)."""
    rgba = logo.convert("RGBA")
    # Build alpha from non-white content.
    pixels = rgba.load()
    w, h = rgba.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out_px = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 16:
                continue
            # Near-white background stays transparent.
            if r >= 245 and g >= 245 and b >= 245:
                continue
            # Soften edges slightly using luminance of non-white pixels.
            darkness = 255 - int((r + g + b) / 3)
            alpha = min(255, max(a, darkness + 40))
            out_px[x, y] = (255, 255, 255, alpha)

    trimmed = trim_whitespace(out, threshold=255)
    # Extra trim for silhouette: any non-zero alpha counts.
    bbox = trimmed.getbbox()
    if bbox:
        trimmed = trimmed.crop(bbox)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pad = 0.12
    max_side = int(size * (1.0 - 2.0 * pad))
    lw, lh = trimmed.size
    scale = min(max_side / lw, max_side / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    resized = trimmed.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not SOURCE.exists():
        raise SystemExit(f"Source logo not found: {SOURCE}")

    shutil.copy2(SOURCE, OUT_DIR / "logo-source.png")

    full = trim_whitespace(Image.open(SOURCE))
    mark = crop_mark_only(full)

    # icon: mark centered, ~12% padding, white bg
    fit_on_canvas(mark, 1024, 0.12).convert("RGB").save(
        OUT_DIR / "icon.png", "PNG", optimize=True
    )
    # adaptive: mark in safer zone, ~18% padding
    fit_on_canvas(mark, 1024, 0.18).convert("RGB").save(
        OUT_DIR / "adaptive-icon.png", "PNG", optimize=True
    )
    # splash: full logo + wordmark
    fit_on_canvas(full, 1024, 0.12).convert("RGB").save(
        OUT_DIR / "splash-image.png", "PNG", optimize=True
    )
    # favicon
    fit_on_canvas(mark, 192, 0.12).convert("RGB").save(
        OUT_DIR / "favicon.png", "PNG", optimize=True
    )
    # notification: white silhouette on transparent
    to_white_silhouette(mark, 96).save(
        OUT_DIR / "notification-icon.png", "PNG", optimize=True
    )

    print("Wrote assets to", OUT_DIR)
    for name in (
        "logo-source.png",
        "icon.png",
        "adaptive-icon.png",
        "splash-image.png",
        "favicon.png",
        "notification-icon.png",
    ):
        p = OUT_DIR / name
        print(f"{name}: {p.stat().st_size} bytes")


if __name__ == "__main__":
    main()

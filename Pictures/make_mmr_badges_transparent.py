"""
Make AccountaBuild MMR badge PNG backgrounds transparent.

Approach:
- Convert to RGBA.
- Flood-fill from the image edges for pixels that are "near black" (within tolerance).
- Only those edge-connected pixels become transparent, which avoids removing dark/black
  details inside the badge that are not connected to the border.

Outputs are written to a separate folder, leaving originals untouched.
"""

from __future__ import annotations

import argparse
import os
from collections import deque
from typing import Iterable, Tuple

from PIL import Image


RGB = Tuple[int, int, int]


def iter_edge_coords(w: int, h: int) -> Iterable[Tuple[int, int]]:
    if w <= 0 or h <= 0:
        return []
    # Top and bottom rows
    for x in range(w):
        yield (x, 0)
        if h > 1:
            yield (x, h - 1)
    # Left and right columns (excluding corners already yielded)
    for y in range(1, h - 1):
        yield (0, y)
        if w > 1:
            yield (w - 1, y)


def is_near_color(rgb: RGB, target: RGB, tol: int) -> bool:
    return (
        abs(rgb[0] - target[0]) <= tol
        and abs(rgb[1] - target[1]) <= tol
        and abs(rgb[2] - target[2]) <= tol
    )


def make_background_transparent(im: Image.Image, bg: RGB = (0, 0, 0), tol: int = 24) -> Image.Image:
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    if px is None:
        return rgba

    visited = bytearray(w * h)  # 0/1
    q: deque[Tuple[int, int]] = deque()

    def idx(x: int, y: int) -> int:
        return y * w + x

    def can_fill(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        if a == 0:
            return False
        return is_near_color((r, g, b), bg, tol)

    # Seed queue with near-bg pixels on the edges
    for x, y in iter_edge_coords(w, h):
        i = idx(x, y)
        if visited[i]:
            continue
        if can_fill(x, y):
            visited[i] = 1
            q.append((x, y))

    # Flood fill (4-neighbor)
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or nx >= w or ny < 0 or ny >= h:
                continue
            i = idx(nx, ny)
            if visited[i]:
                continue
            if can_fill(nx, ny):
                visited[i] = 1
                q.append((nx, ny))

    # Apply alpha=0 to visited pixels
    for y in range(h):
        row_off = y * w
        for x in range(w):
            if visited[row_off + x]:
                r, g, b, _a = px[x, y]
                px[x, y] = (r, g, b, 0)

    return rgba


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=".", help="Input folder containing the PNGs")
    ap.add_argument("--output", required=True, help="Output folder for transparent PNGs")
    ap.add_argument("--pattern", default="_mmr.png", help="Only process files whose names end with this")
    ap.add_argument("--tolerance", type=int, default=24, help="0-255 channel tolerance for near-black background")
    args = ap.parse_args()

    in_dir = os.path.abspath(args.input)
    out_dir = os.path.abspath(args.output)
    os.makedirs(out_dir, exist_ok=True)

    pattern = args.pattern
    tol = max(0, min(255, int(args.tolerance)))

    inputs = []
    for name in os.listdir(in_dir):
        if not name.lower().endswith(".png"):
            continue
        if pattern and not name.lower().endswith(pattern.lower()):
            continue
        inputs.append(name)

    if not inputs:
        print(f"No PNGs matching *{pattern} found in {in_dir}")
        return 0

    inputs.sort()
    wrote = 0
    for name in inputs:
        src = os.path.join(in_dir, name)
        dst = os.path.join(out_dir, name)
        with Image.open(src) as im:
            out = make_background_transparent(im, bg=(0, 0, 0), tol=tol)
            out.save(dst, format="PNG", optimize=True)
        wrote += 1
        print(f"Wrote {dst}")

    print(f"Done. Wrote {wrote} file(s) to {out_dir} (tolerance={tol}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


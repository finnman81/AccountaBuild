"""
Make AccountaBuild MMR badge PNG backgrounds transparent.
Can also be used to remove white backgrounds from app icons and generate full-size app icons.

Approach:
- Convert to RGBA.
- Flood-fill from the image edges for pixels that are "near" the target background color (within tolerance).
- Only those edge-connected pixels become transparent, which avoids removing details inside
  the image that are not connected to the border.
- Crop to bounding box of non-transparent content.
- Resize to standard app icon sizes (iOS: 1024x1024, Android: 512x512).

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


def get_bounding_box(im: Image.Image) -> Tuple[int, int, int, int]:
    """Get bounding box of non-transparent pixels (left, top, right, bottom)."""
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    
    left = w
    top = h
    right = 0
    bottom = 0
    
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0:  # Non-transparent pixel
                left = min(left, x)
                top = min(top, y)
                right = max(right, x)
                bottom = max(bottom, y)
    
    # If no non-transparent pixels found, return full image
    if left > right or top > bottom:
        return (0, 0, w, h)
    
    return (left, top, right + 1, bottom + 1)


def crop_to_content(im: Image.Image) -> Image.Image:
    """Crop image to bounding box of non-transparent content."""
    bbox = get_bounding_box(im)
    left, top, right, bottom = bbox
    return im.crop((left, top, right, bottom))


def create_app_icons(im: Image.Image, base_name: str, output_dir: str) -> None:
    """Create iOS and Android app icon sizes from the processed image."""
    # iOS App Store icon: 1024x1024
    ios_size = 1024
    ios_icon = im.resize((ios_size, ios_size), Image.Resampling.LANCZOS)
    ios_path = os.path.join(output_dir, f"{base_name}_ios_1024x1024.png")
    ios_icon.save(ios_path, format="PNG", optimize=True)
    print(f"Created iOS icon: {ios_path}")
    
    # Android Play Store icon: 512x512
    android_size = 512
    android_icon = im.resize((android_size, android_size), Image.Resampling.LANCZOS)
    android_path = os.path.join(output_dir, f"{base_name}_android_512x512.png")
    android_icon.save(android_path, format="PNG", optimize=True)
    print(f"Created Android icon: {android_path}")


def process_app_icon(input_path: str, output_dir: str, bg_color: RGB, tol: int, create_sizes: bool = True) -> None:
    """Process a single app icon: remove background, crop, and optionally create standard sizes."""
    with Image.open(input_path) as im:
        # Remove background
        transparent = make_background_transparent(im, bg=bg_color, tol=tol)
        
        # Crop to content
        cropped = crop_to_content(transparent)
        
        # Get base name without extension
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        
        # Save cropped version
        cropped_path = os.path.join(output_dir, f"{base_name}_cropped.png")
        cropped.save(cropped_path, format="PNG", optimize=True)
        print(f"Created cropped version: {cropped_path}")
        
        # Create standard app icon sizes
        if create_sizes:
            create_app_icons(cropped, base_name, output_dir)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=".", help="Input folder containing the PNGs (or single file path)")
    ap.add_argument("--output", required=True, help="Output folder for transparent PNGs (or single file path)")
    ap.add_argument("--pattern", default="_mmr.png", help="Only process files whose names end with this (ignored if input is a file)")
    ap.add_argument("--tolerance", type=int, default=24, help="0-255 channel tolerance for background color matching")
    ap.add_argument("--bg-color", default="black", choices=["black", "white"], help="Background color to remove (default: black)")
    ap.add_argument("--single-file", action="store_true", help="Treat input and output as single file paths instead of directories")
    ap.add_argument("--app-icon", action="store_true", help="Process as app icon: remove background, crop, and create iOS/Android sizes")
    ap.add_argument("--no-sizes", action="store_true", help="Don't create standard app icon sizes (only crop)")
    args = ap.parse_args()

    # Determine background color
    bg_color = (255, 255, 255) if args.bg_color == "white" else (0, 0, 0)
    tol = max(0, min(255, int(args.tolerance)))

    # Single file mode
    if args.single_file or (os.path.isfile(args.input) and not os.path.isfile(args.output)):
        src = os.path.abspath(args.input)
        
        # For app icon mode, output is always a directory
        if args.app_icon:
            dst_dir = os.path.abspath(args.output)
        else:
            # For regular mode, output could be a file or directory
            if os.path.isfile(args.output):
                dst_dir = os.path.dirname(os.path.abspath(args.output))
            else:
                dst_dir = os.path.abspath(args.output)
        
        if not os.path.exists(src):
            print(f"Error: Input file not found: {src}")
            return 1
        
        os.makedirs(dst_dir, exist_ok=True)
        
        # App icon mode: remove background, crop, create sizes
        if args.app_icon:
            process_app_icon(src, dst_dir, bg_color, tol, create_sizes=not args.no_sizes)
        else:
            # Original behavior: just remove background
            dst = os.path.abspath(args.output)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with Image.open(src) as im:
                out = make_background_transparent(im, bg=bg_color, tol=tol)
                out.save(dst, format="PNG", optimize=True)
            print(f"Wrote {dst}")
        return 0

    # Directory mode
    in_dir = os.path.abspath(args.input)
    out_dir = os.path.abspath(args.output)
    os.makedirs(out_dir, exist_ok=True)

    pattern = args.pattern

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
        if args.app_icon:
            process_app_icon(src, out_dir, bg_color, tol, create_sizes=not args.no_sizes)
        else:
            dst = os.path.join(out_dir, name)
            with Image.open(src) as im:
                out = make_background_transparent(im, bg=bg_color, tol=tol)
                out.save(dst, format="PNG", optimize=True)
            print(f"Wrote {dst}")
        wrote += 1

    print(f"Done. Processed {wrote} file(s) to {out_dir} (tolerance={tol}, bg={args.bg_color}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

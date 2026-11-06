#!/usr/bin/env python3
"""
generate-icons.py — Generates Simple Budget's minimalist monochrome app icons
(public/icon.svg, public/apple-touch-icon.png, public/icon-192.png, public/icon-512.png)
using only the Python standard library (zero external dependencies).
"""
import struct
import zlib
from pathlib import Path

SVG_ICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#111111"/>
  <rect x="96" y="136" width="320" height="40" rx="20" fill="#FAFAF9"/>
  <rect x="96" y="236" width="224" height="40" rx="20" fill="#FAFAF9"/>
  <rect x="96" y="336" width="272" height="40" rx="20" fill="#4ADE95"/>
</svg>
"""


def make_png(size: int) -> bytes:
    bg = (17, 17, 17, 255)       # #111111
    fg = (250, 250, 249, 255)    # #FAFAF9
    green = (74, 222, 149, 255)  # #4ADE95

    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filter type 0 (None)
        ny = y / size
        for x in range(size):
            nx = x / size
            color = bg
            if 0.1875 <= nx <= 0.8125 and 0.265 <= ny <= 0.343:
                color = fg
            elif 0.1875 <= nx <= 0.625 and 0.460 <= ny <= 0.539:
                color = fg
            elif 0.1875 <= nx <= 0.718 and 0.656 <= ny <= 0.734:
                color = green
            rows.extend(color)

    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(rows), level=9)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def main() -> None:
    public_dir = Path(__file__).resolve().parent.parent / "public"
    public_dir.mkdir(exist_ok=True)
    (public_dir / "icon.svg").write_text(SVG_ICON, encoding="utf-8")
    for name, dim in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
        (public_dir / name).write_bytes(make_png(dim))


if __name__ == "__main__":
    main()


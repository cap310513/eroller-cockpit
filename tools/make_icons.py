"""Erzeugt die App-Icons (PNG) ohne Zusatzpakete: python tools/make_icons.py"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")

CYAN = (34, 211, 238)
INDIGO = (99, 102, 241)


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def cover(d):
    """Anti-Aliasing: Abstand (in Pixeln) -> Deckkraft 0..1"""
    return max(0.0, min(1.0, 0.5 - d))


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def render(size):
    c = size / 2
    R = size * 0.32          # Radius des Rings
    w = size * 0.085         # Dicke des Rings
    a0, a1 = 135.0, 405.0    # Start/Ende in Grad (SVG-Richtung)
    e1 = (c + R * math.cos(math.radians(a0)), c + R * math.sin(math.radians(a0)))
    e2 = (c + R * math.cos(math.radians(a1)), c + R * math.sin(math.radians(a1)))
    needle_end = (c + R * 0.78 * math.cos(math.radians(305)), c + R * 0.78 * math.sin(math.radians(305)))
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            # Hintergrund: dunkler Verlauf mit leichtem Glühen oben
            t = y / size
            bg = lerp((16, 20, 28), (5, 7, 11), t)
            glow = max(0.0, 1 - math.hypot(x - c, y - size * 0.1) / (size * 0.75)) * 0.16
            col = lerp(bg, CYAN, glow)

            # Ring (270 Grad) mit runden Enden
            dx, dy = x - c, y - c
            dist = math.hypot(dx, dy)
            ang = math.degrees(math.atan2(dy, dx)) % 360
            in_arc = ang >= a0 or ang <= (a1 - 360)
            d = 1e9
            if in_arc:
                d = abs(dist - R) - w / 2
            d = min(d, math.hypot(x - e1[0], y - e1[1]) - w / 2, math.hypot(x - e2[0], y - e2[1]) - w / 2)
            a = cover(d)
            if a > 0:
                tt = ((ang - a0) % 360) / 270 if in_arc else (0 if math.hypot(x - e1[0], y - e1[1]) < math.hypot(x - e2[0], y - e2[1]) else 1)
                col = lerp(col, lerp(INDIGO, CYAN, min(1, tt)), a)

            # Zeiger + Nabe
            dn = seg_dist(x, y, c, c, needle_end[0], needle_end[1]) - size * 0.022
            col = lerp(col, (255, 255, 255), cover(dn))
            col = lerp(col, (255, 255, 255), cover(dist - size * 0.05))

            row += bytes(int(max(0, min(255, v))) for v in col)
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path, size):
    raw = render(size)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("geschrieben:", os.path.normpath(path))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for s in (180, 192, 512):
        write_png(os.path.join(OUT, f"icon-{s}.png"), s)

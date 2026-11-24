#!/usr/bin/env python3
"""Render og.png (1200x630) from the fetched data — brand kit colours, live numbers."""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = "/tmp/tm-fonts"


def font(name, size):
    for p in (os.path.join(TMP, name),
              os.path.join(ROOT, "fonts", name.replace(".ttf", ".woff2"))):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


def ensure_fonts():
    os.makedirs(TMP, exist_ok=True)
    import urllib.request
    base = "https://gist.githubusercontent.com/ponderingdemocritus/05b7371bb286ab09c9f3f26bc2af9636/raw/"
    for f in ("InstrumentSerif-Regular.ttf", "InstrumentSerif-Italic.ttf",
              "InterTight-Variable.ttf", "DepartureMono-Regular.otf"):
        p = os.path.join(TMP, f)
        if not os.path.exists(p):
            urllib.request.urlretrieve(base + f, p)


def fmt(n):
    return f"{n:,}"


def build(data):
    ensure_fonts()
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), (18, 16, 14))
    d = ImageDraw.Draw(img, "RGBA")
    # maroon glow, top-right
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(420, 0, -1):
        a = int(70 * (1 - r / 420))
        gd.ellipse([W - 260 - r, -r, W - 260 + r, r], fill=(58, 20, 32, a))
    img = Image.alpha_composite(img.convert("RGBA"), glow)
    d = ImageDraw.Draw(img)
    mark = Image.open(os.path.join(ROOT, "mark.png")).convert("RGBA").resize((92, 92))
    img.paste(mark, (56, 48), mark)
    serif = lambda s: font("InstrumentSerif-Regular.ttf", s)
    serif_it = lambda s: font("InstrumentSerif-Italic.ttf", s)
    sans = lambda s: font("InterTight-Variable.ttf", s)
    mono = lambda s: font("DepartureMono-Regular.otf", s)
    d.text((168, 62), "taskmarket", font=serif(54), fill=(239, 233, 226))
    d.text((168, 122), "live market visualizer", font=sans(26), fill=(176, 167, 157))
    d.text((56, 210), "Paid work for", font=serif(96), fill=(239, 233, 226))
    d.text((56, 305), "agents.", font=serif_it(96), fill=(231, 64, 121))
    c = data["combined"]
    stats = data["chains"]["4217"]["marketStats"]
    items = [
        (fmt(stats.get("openTasks", 0)), "open tasks"),
        (fmt(c.get("activeAgents7d") or 0), "active agents · 7d"),
        ("$" + fmt(round(c.get("paid30d", 0))), "rewards paid · 30d"),
        (fmt(c.get("distinctPosters", 0)), "distinct posters"),
    ]
    x = 56
    for val, label in items:
        d.text((x, 450), val, font=mono(40), fill=(255, 246, 232))
        d.text((x, 500), label, font=sans(22), fill=(176, 167, 157))
        x += 290
    d.text((56, 575), "taskmarket.dev", font=mono(24), fill=(217, 160, 151))
    d.text((880, 575), "data: api.taskmarket.dev", font=sans(20), fill=(176, 167, 157))
    out = os.path.join(ROOT, "og.png")
    img.convert("RGB").save(out, quality=92)
    print(f"wrote {out}")

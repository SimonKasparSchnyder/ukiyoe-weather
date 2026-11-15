"""Measure a print's colours from its scan: paper colour and two accent colours.

- paper:        the most common light, unsaturated colour (the sheet itself)
- accent_dark:  a light-ish, clearly coloured ink (e.g. the blue of a river, a red cartouche) — for dark mode
- accent_light: a dark, clearly coloured ink (e.g. Prussian blue, deep green) — for light mode

Used by export_index.py. Needs Pillow.
"""
import colorsys
from pathlib import Path

from PIL import Image


def _hex(rgb):
    return "#%02x%02x%02x" % tuple(int(round(v)) for v in rgb)


def _hls(rgb):
    h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in rgb))
    return h * 360, l, (max(rgb) - min(rgb)) / 255


def _paper_like(c):
    """Warm beige/tan tones of the sheet itself (hue ~25–55°, not strongly coloured), or near-greys."""
    return c["chroma"] < 0.08 or (25 <= c["hue"] <= 55 and c["chroma"] < 0.3)


def measure(path: Path, crop=None, tagged=None, n_colors=16):
    img = Image.open(path).convert("RGB")
    if crop:
        w, h = img.size
        x, y, cw, ch = crop
        img = img.crop((int(x * w), int(y * h), int((x + cw) * w), int((y + ch) * h)))
    img.thumbnail((200, 200))
    q = img.quantize(colors=n_colors, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n_colors * 3]
    counts = sorted(q.getcolors(), reverse=True)  # [(count, index)]
    total = sum(c for c, _ in counts)

    clusters = []
    for count, idx in counts:
        rgb = pal[idx * 3: idx * 3 + 3]
        hue, light, chroma = _hls(rgb)
        clusters.append({"rgb": rgb, "share": count / total, "hue": hue, "light": light, "chroma": chroma})

    # paper: the most common light tone in the paper family
    paper_c = [c for c in clusters if c["light"] > 0.6 and _paper_like(c)]
    paper = max(paper_c, key=lambda c: c["share"]) if paper_c else None  # little visible paper: let the app decide

    # inks: clearly coloured clusters outside the paper family (blues, greens, reds …)
    inks = [c for c in clusters if not _paper_like(c) and c["share"] >= 0.01]
    score = lambda c: c["chroma"] * c["share"] ** 0.4

    # fallback when the scan shows no clear ink colour (faded prints): the colours the tagger saw
    tagged_rgb = []
    for hx in tagged or []:
        rgb = [int(hx[i:i + 2], 16) for i in (1, 3, 5)]
        hue, light, chroma = _hls(rgb)
        tagged_rgb.append({"rgb": rgb, "share": 0.05, "hue": hue, "light": light, "chroma": chroma})
    tagged_inks = [c for c in tagged_rgb if not _paper_like(c)]
    darkest = min(clusters, key=lambda c: c["light"])

    def pick(lo, hi, fallback):
        cands = [c for c in inks if lo <= c["light"] <= hi and c is not paper] or [c for c in tagged_inks if lo - 0.1 <= c["light"] <= hi + 0.1]
        return max(cands, key=score) if cands else fallback

    accent_light = pick(0.0, 0.5, darkest)            # dark ink, for the light panel
    accent_dark = pick(0.4, 0.85, accent_light)       # lighter ink, for the dark panel

    return {
        "paper": _hex(paper["rgb"]) if paper else None,
        "accent_light": _hex(accent_light["rgb"]),
        "accent_dark": _hex(accent_dark["rgb"]),
        "palette": [_hex(c["rgb"]) for c in sorted(clusters, key=lambda c: -c["share"])[:6]],
    }

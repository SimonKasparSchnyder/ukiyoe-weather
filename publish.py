"""Build the public website into site/ — only the parts of web/ that friends should get.

Run from the project folder:   python3 publish.py
GitHub Actions runs the same script on every push (.github/workflows/pages.yml) and publishes site/.

Not published: the Matching Tuner, the icon page, web/README.md, and everything outside web/
(pilot data, planning documents, scripts).
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
SITE = ROOT / "site"

# files and folders copied from web/ (folders are copied whole)
PUBLIC = [
    "index.html",
    "app.js",
    "app.css",
    "lib",
    "config",
    "data/index.json",
    "fonts",
    "fallback",
]


def main():
    if SITE.exists():
        shutil.rmtree(SITE)
    SITE.mkdir()
    for item in PUBLIC:
        src, dst = WEB / item, SITE / item
        if not src.exists():
            sys.exit(f"publish: missing {src}")
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns(".DS_Store", "*conflicted copy*"))
        else:
            shutil.copy2(src, dst)
    (SITE / ".nojekyll").write_text("")  # serve files as they are, no Jekyll processing

    # sanity check: nothing developer-only slipped in
    for name in ("tuning.html", "tuning.js", "icons.html"):
        assert not (SITE / name).exists(), name
    files = [p for p in SITE.rglob("*") if p.is_file()]
    size = sum(p.stat().st_size for p in files) / 1e6
    print(f"site/: {len(files)} files, {size:.1f} MB")


if __name__ == "__main__":
    main()

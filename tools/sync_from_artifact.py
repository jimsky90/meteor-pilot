#!/usr/bin/env python3
"""Update the live app from the latest published artifact.

Usage: python3 tools/sync_from_artifact.py /path/to/artifact.html

Takes the artifact page (as saved by the Artifact tool's read action), strips the viewer's wrapper,
the <title>/meta tag and the font links (index.html has its own <head>), puts the game between the
GAME markers in index.html, and bumps the service-worker cache version so installed apps update.
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1]).read_text()

m0 = re.search(r"<title>[^<]*</title>", src)
i = m0.start()
j = src.rfind("</body></html>")
game = src[i:j if j != -1 else len(src)].rstrip()
game = re.sub(r"<title>[^<]*</title>\n", "", game, count=1)
game = re.sub(r'<meta name="claude:[^"]*" content="[^"]*">\n', "", game)
game = re.sub(r'<link rel="(preconnect|stylesheet)" href="https://fonts\.(googleapis|gstatic)\.com[^>]*>\n', "", game)

idx = root / "index.html"
page = idx.read_text()
a, b = "<!-- GAME:START -->", "<!-- GAME:END -->"
page = page[: page.index(a) + len(a)] + "\n" + game + "\n" + page[page.index(b):]
idx.write_text(page)

m = re.search(r"\{ v: (\d+),", game)
ver = m.group(1) if m else "x"
sw = root / "sw.js"
sw.write_text(re.sub(r'const VERSION = "[^"]*";', f'const VERSION = "meteor-pilot-v{ver}";', sw.read_text()))
print(f"Synced game version {ver} into index.html; sw.js cache is meteor-pilot-v{ver}")

#!/usr/bin/env python3
"""Build the shareable single-file planner from index.html and its scripts.

  python3 tools/build.py

- Copies DATA_INFO.refreshed (data.js) into the footer of index.html, so the "Data last refreshed"
  date shows even where scripts don't run (phone file previews).
- Writes europe-trip-planner.html: index.html with every <script src="…"> inlined (the one people download).
"""
import datetime
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

data = open("data.js", encoding="utf-8").read()
m = re.search(r'refreshed:\s*"(\d{4}-\d{2}-\d{2})"', data)
if not m:
    raise SystemExit("data.js: DATA_INFO.refreshed not found")
refreshed = datetime.date.fromisoformat(m.group(1))
label = f"{refreshed.day} {refreshed.strftime('%b %Y')}"
covers = re.search(r'covers:\s*"([^"]+)"', data).group(1)

page = open("index.html", encoding="utf-8").read()
page, n = re.subn(r'(<footer class="refresh" id="refreshFooter">)[^<]*(</footer>)',
                  rf"\g<1>Data last refreshed: {label} ({covers}). Checked daily.\g<2>", page)
if n != 1:
    raise SystemExit("index.html: refresh footer not found")
open("index.html", "w", encoding="utf-8").write(page)

def inline(match):
    js = open(match.group(1), encoding="utf-8").read().replace("</script", "<\\/script")
    return "<script>\n" + js + "\n</script>"

single = re.sub(r'<script src="([^"]+)"></script>', inline, page)
open("europe-trip-planner.html", "w", encoding="utf-8").write(single)
print(f"Built europe-trip-planner.html ({len(single) // 1024} KB) — data refreshed {label}")

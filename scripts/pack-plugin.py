"""uxp-plugin/ 폴더를 app/resources/sha-paint-plugin.ccx 로 패키징한다.

.ccx는 manifest.json이 루트에 있는 zip이다. 개발 문서(README.md)는 넣지 않는다.
플러그인을 수정할 때마다 다시 실행해서 인스톨러에 최신 플러그인이 들어가게 한다.
    python scripts/pack-plugin.py
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "uxp-plugin")
OUT = os.path.join(ROOT, "app", "resources", "sha-paint-plugin.ccx")
EXCLUDE = {"README.md"}

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, _dirs, files in os.walk(SRC):
        for f in sorted(files):
            if f in EXCLUDE or f.startswith("."):
                continue
            full = os.path.join(dirpath, f)
            arc = os.path.relpath(full, SRC).replace(os.sep, "/")
            z.write(full, arc)
            print("  +", arc)
print("->", OUT)

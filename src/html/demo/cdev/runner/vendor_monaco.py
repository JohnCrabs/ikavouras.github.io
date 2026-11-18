"""Download Monaco Editor once into vendor/monaco so CDev works fully offline
(e.g. from a USB drive with the runner serving the UI at http://127.0.0.1:8787/).

    python runner/vendor_monaco.py
"""
import io
import os
import shutil
import sys
import tarfile
import urllib.request

VERSION = "0.52.2"
URL = f"https://registry.npmjs.org/monaco-editor/-/monaco-editor-{VERSION}.tgz"
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(APP_DIR, "vendor", "monaco")


def main():
    print(f"Downloading monaco-editor {VERSION} …")
    with urllib.request.urlopen(URL, timeout=120) as r:
        data = r.read()
    print(f"  {len(data) // 1024} KB, extracting min/vs …")
    if os.path.isdir(DEST):
        shutil.rmtree(DEST)
    prefix = "package/min/vs/"
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for m in tar.getmembers():
            if not m.isfile() or not m.name.startswith(prefix):
                continue
            rel = m.name[len("package/min/"):]
            if ".." in rel.split("/"):
                continue
            out = os.path.join(DEST, *rel.split("/"))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with tar.extractfile(m) as src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst)
    print(f"Done: {DEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""EPUB an ein Buch im Leselog hängen (am Mac, mit dem service_role-Schlüssel aus dem Schlüsselbund).

  python3 tools/epub_anhaengen.py <book_id> <datei> "<Anzeigename>.epub"

<datei> darf sein: .epub, ein Apple-Books-Ordner-EPUB (wird sauber gezippt) oder
.mobi/.azw3 (wird mit Calibre zu EPUB umgewandelt). Kopiergeschützte Dateien
(Apple-Books-Käufe, Adobe-DRM) werden übersprungen, über 100 MB ebenfalls.
Seit 04.10.2026 landet die Datei in Cloudflare R2 (Bucket leselog-epubs, per wrangler),
Pfad wie in der App: „r2:{user_id}/{book_id}.epub“.
"""
import json, os, subprocess, sys, tempfile, urllib.request, zipfile, re
bid, src, name = sys.argv[1:4]
K = subprocess.run(["security", "find-generic-password", "-s", "leselog-service-key", "-a", "leselog", "-w"], capture_output=True, text=True).stdout.strip()
U = "https://wejvvldovywrernuujgt.supabase.co"
H = {"apikey": K, "Authorization": f"Bearer {K}"}
def req(method, url, data=None, headers={}):
    r = urllib.request.Request(url, data=data, method=method, headers={**H, **headers})
    with urllib.request.urlopen(r) as resp: return resp.read()
book = json.loads(req("GET", f"{U}/rest/v1/books?id=eq.{bid}&select=user_id,title,epub_path"))[0]
if book["epub_path"]: sys.exit(f"hat schon EPUB: {book['title']}")
if src.lower().endswith((".mobi", ".azw3", ".azw")):  # Kindle-Format → EPUB (scheitert bei DRM)
    tmp = tempfile.mktemp(suffix=".epub")
    subprocess.run(["/Applications/calibre.app/Contents/MacOS/ebook-convert", src, tmp], check=True, capture_output=True)
    src = tmp
elif os.path.isdir(src):  # Apple-Books-Ordner-EPUB → richtiges Zip (mimetype zuerst, unkomprimiert)
    tmp = tempfile.mktemp(suffix=".epub")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(src, "mimetype"), "mimetype", compress_type=zipfile.ZIP_STORED)
        for r, _, fs in os.walk(src):
            for f in sorted(fs):
                p = os.path.join(r, f); rel = os.path.relpath(p, src)
                if rel == "mimetype" or f == ".DS_Store" or rel.startswith("iTunesMetadata") : continue
                z.write(p, rel)
    src = tmp
with zipfile.ZipFile(src) as z:
    n = z.namelist(); z.testzip()
    if any(x.endswith(("sinf.xml", "rights.xml")) for x in n): sys.exit("DRM – übersprungen")
data = open(src, "rb").read()
if len(data) > 100 * 1024 * 1024: sys.exit(f"zu groß: {len(data)//1048576} MB")
key = f"{book['user_id']}/{bid}.epub"
wr = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "worker-dateien")
subprocess.run(f'export PATH=~/.local/node/bin:$PATH; npx wrangler r2 object put "leselog-epubs/{key}" --file "{src}" '
               f'--content-type application/epub+zip --remote', shell=True, cwd=wr, check=True, capture_output=True)
req("PATCH", f"{U}/rest/v1/books?id=eq.{bid}", json.dumps({"epub_path": "r2:" + key, "epub_name": name, "epub_size": len(data)}).encode(), {"Content-Type": "application/json", "Prefer": "return=minimal"})
print(f"✓ {book['title']} ← {name} ({len(data)//1024} KB)")

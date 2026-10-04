"""Lesbare Sicherung aller Leselog-EPUBs in Google Drive (am Mac, service_role-Schlüssel aus dem Schlüsselbund).

  python3 tools/sicherung_drive.py

Ziel: Meine Ablage/Diverses/E-Books (Leselog-Sicherung)/<Kategorie>/<Autor> – <Titel>.epub
Holt nur, was fehlt oder sich geändert hat (Größe), verschiebt Dateien gelöschter Bücher nach „_Aus Leselog entfernt“,
und schreibt eine Übersicht.csv. Quelle: Cloudflare R2 (per wrangler) bzw. alte Supabase-Pfade.

Nachts (launchd) darf Python nicht in den Google-Drive-Ordner (macOS-Schutz) – dann setzt
tools/sicherung_nachts.sh LESELOG_SICHERUNG_ZIEL auf einen lokalen Spiegel und schiebt ihn per rclone nach Drive.
"""
import csv, json, os, re, subprocess, sys, time, unicodedata, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
ZIEL = os.environ.get("LESELOG_SICHERUNG_ZIEL") or os.path.expanduser("~/Library/CloudStorage/GoogleDrive-florian.s.thiel@gmail.com/Meine Ablage/Diverses/E-Books (Leselog-Sicherung)")
K = subprocess.run(["security", "find-generic-password", "-s", "leselog-service-key", "-a", "leselog", "-w"], capture_output=True, text=True).stdout.strip()
U = "https://wejvvldovywrernuujgt.supabase.co"
H = {"apikey": K, "Authorization": f"Bearer {K}", "User-Agent": "leselog-tools/1.0"}
WR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "worker-dateien")
STATUS = {"read": "Gelesen", "reading": "Lese gerade", "want": "Will lesen", "dropped": "Abgebrochen", "archive": "Archiv"}
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=300) as r: return r.read()
def sauber(s, n=90):
    s = unicodedata.normalize("NFC", re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", s or "")).strip(" .")
    return re.sub(r"\s+", " ", s)[:n].strip()
books = json.loads(get(f"{U}/rest/v1/books?select=id,title,author,category,status,epub_path,epub_size&epub_path=not.is.null&order=title"))
soll = {}
for b in books:
    rel = os.path.join(sauber(b["category"] or "Ohne Kategorie"), f"{sauber(b['author'] or 'Unbekannt', 50)} – {sauber(b['title'])}.epub")
    while rel in soll: rel = rel[:-5] + " (2).epub"
    soll[rel] = b
def hole(item):
    rel, b = item; ziel = os.path.join(ZIEL, rel)
    if os.path.exists(ziel) and os.path.getsize(ziel) == int(b["epub_size"] or -1): return None
    os.makedirs(os.path.dirname(ziel), exist_ok=True); tmp = ziel + ".teil"
    p = b["epub_path"]
    if p.startswith("r2:"):
        for versuch in range(4):  # wrangler bricht bei Netz-Wacklern gern ab -> nochmal
            r = subprocess.run(f'export PATH=~/.local/node/bin:$PATH; npx wrangler r2 object get "leselog-epubs/{p[3:]}" --file "{tmp}" --remote',
                               shell=True, cwd=WR, capture_output=True, text=True, timeout=600)
            if not r.returncode: break
            time.sleep(5 * (versuch + 1))
        else:
            if os.path.exists(tmp): os.remove(tmp)
            return f"FEHLER {b['title']}: " + " ".join(r.stderr.split())[-160:]
    else:
        open(tmp, "wb").write(get(f"{U}/storage/v1/object/epubs/{urllib.parse.quote(p)}"))
    os.replace(tmp, ziel); return f"✓ {rel}"
fehler = 0
with ThreadPoolExecutor(4) as ex:
    for m in ex.map(hole, soll.items()):
        if m: print(m, flush=True); fehler += m.startswith("FEHLER")
# Umbenannte/umsortierte Bücher: alte Datei weg. Aus Leselog gelöschte Bücher: nach „_Aus Leselog entfernt“ (nie löschen).
KARTE = os.path.join(ZIEL, ".zuordnung.json")
alt = json.load(open(KARTE)) if os.path.exists(KARTE) else {}
ids = {b["id"] for b in soll.values()}; weg = 0
for root, _, files in os.walk(ZIEL):
    if "_Aus Leselog entfernt" in root: continue
    for f in files:
        rel = unicodedata.normalize("NFC", os.path.relpath(os.path.join(root, f), ZIEL))
        if not f.endswith(".epub") or rel in soll: continue
        bid = alt.get(rel)
        if bid in ids: os.remove(os.path.join(root, f))
        else:
            os.makedirs(os.path.join(ZIEL, "_Aus Leselog entfernt"), exist_ok=True)
            os.replace(os.path.join(root, f), os.path.join(ZIEL, "_Aus Leselog entfernt", f))
        weg += 1
for root, dirs, files in os.walk(ZIEL, topdown=False):
    if root != ZIEL and not os.listdir(root): os.rmdir(root)
json.dump({rel: b["id"] for rel, b in soll.items()}, open(KARTE, "w"), ensure_ascii=False)
with open(os.path.join(ZIEL, "Übersicht.csv"), "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.writer(fh, delimiter=";"); w.writerow(["Kategorie", "Autor", "Titel", "Status", "Datei"])
    for rel, b in sorted(soll.items()): w.writerow([b["category"] or "", b["author"] or "", b["title"], STATUS.get(b["status"], b["status"]), rel])
print(f"Sicherung: {len(soll) - fehler} von {len(soll)} EPUBs in Drive, {weg} alte Dateien weggeräumt"
      + (f", {fehler} FEHLER – nochmal starten" if fehler else ""))
sys.exit(1 if fehler else 0)

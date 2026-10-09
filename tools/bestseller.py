# -*- coding: utf-8 -*-
"""Bestsellerlisten für den Leselog-Reiter „Bestseller“ holen und in Supabase (public.charts) ablegen.

Quellen:
  - SPIEGEL-Bestseller (Hardcover/Paperback/Taschenbuch je Belletristik + Sachbuch, Ratgeber,
    Kinder & Jugend) – öffentliche Seiten auf spiegel.de, einmal am Tag gelesen.
  - Apple-Books-Charts Deutschland (E-Books + Hörbücher, gesamt und je Genre) – offizieller RSS-Feed.
  - „gesamt“ = alle Hauptlisten zusammengerechnet (je Liste Platz 1 = 20 Punkte … Platz 20 = 1 Punkt).

Läuft täglich auf dem Funk-Server (cron), Key aus ~/.leselog.env (LESELOG_SERVICE_KEY).
Liefert eine Liste nichts, bleibt der alte Stand in der Datenbank stehen. Brechen viele Listen weg,
kommt ein Push. Aufruf: python3 bestseller.py [--trocken]
"""
import html, json, os, re, subprocess, sys, time, unicodedata, urllib.request
from datetime import datetime, timezone

SUPA = "https://wejvvldovywrernuujgt.supabase.co"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SP = "https://www.spiegel.de/kultur/"
SPIEGEL = [
    ("sp_hc_bel", "SPIEGEL Hardcover Belletristik", SP + "bestseller-buecher-belletristik-sachbuch-auf-spiegel-liste-a-458623.html"),
    ("sp_hc_sach", "SPIEGEL Hardcover Sachbuch", SP + "literatur/spiegel-bestseller-hardcover-a-1025428.html"),
    ("sp_pb_bel", "SPIEGEL Paperback Belletristik", SP + "literatur/spiegel-bestseller-paperback-a-1025444.html"),
    ("sp_pb_sach", "SPIEGEL Paperback Sachbuch", SP + "literatur/bestseller-paperback-sachbuch-a-dd0efe3f-eaf1-47f7-b5a4-f5cdf0a6da3a"),
    ("sp_tb_bel", "SPIEGEL Taschenbuch Belletristik", SP + "literatur/spiegel-bestseller-taschenbuecher-a-1025518.html"),
    ("sp_tb_sach", "SPIEGEL Taschenbuch Sachbuch", SP + "literatur/bestseller-taschenbuch-sachbuch-a-4ce7bbd7-b8a5-41f6-ba72-f1e95cd06fe3"),
    ("sp_ratgeber", "SPIEGEL Ratgeber", SP + "literatur/spiegel-bestseller-ratgeber-leben-gesundheit-essen-trinken-a-1253537.html"),
    ("sp_kinder", "SPIEGEL Kinder- & Jugendbuch", SP + "literatur/spiegel-bestseller-kinder-und-jugendbuecher-a-1025519.html"),
]
# Apple-Genre-IDs (Deutschland): https://itunes.apple.com/WebObjects/MZStoreServices.woa/ws/genres?id=38 bzw. 50000024
EBOOK_GENRES = {"9031": "Belletristik", "9032": "Krimis & Thriller", "9020": "Fantasy & Sci-Fi",
                "9003": "Liebesromane", "9008": "Biografien", "9002": "Sachbücher", "9025": "Körper & Geist",
                "9009": "Business & Finanzen", "9015": "Geschichte", "9034": "Politik", "9019": "Wissenschaft & Natur",
                "9018": "Religion & Spiritualität", "9010": "Kinder & Jugend"}
AUDIO_GENRES = {"50000040": "Belletristik", "50000051": "Krimis & Thriller", "50000052": "Sachbücher",
                "50000055": "Fantasy & Sci-Fi", "50000069": "Liebesromane", "50000042": "Biografien",
                "50000056": "Ratgeber", "50000043": "Wirtschaft", "50000049": "Geschichte",
                "50000054": "Naturwissenschaften", "50000053": "Religion & Spiritualität", "50000044": "Kinder & Jugend"}
# Diese Listen zählen für „gesamt“ (Genre-Listen nicht – die stecken schon in den Gesamtcharts)
GESAMT_AUS = ["sp_hc_bel", "sp_hc_sach", "sp_pb_bel", "sp_pb_sach", "sp_tb_bel", "sp_tb_sach",
              "sp_ratgeber", "ap_eb_all", "au_all"]
KURZ = {"sp_hc_bel": "SPIEGEL HC", "sp_hc_sach": "SPIEGEL HC", "sp_pb_bel": "SPIEGEL PB", "sp_pb_sach": "SPIEGEL PB",
        "sp_tb_bel": "SPIEGEL TB", "sp_tb_sach": "SPIEGEL TB", "sp_ratgeber": "SPIEGEL Ratgeber",
        "ap_eb_all": "E-Book", "au_all": "Hörbuch"}


def log(msg):
    print(f"{datetime.now():%Y-%m-%d %H:%M}  {msg}", flush=True)


def holen(url, versuche=3):
    for i in range(versuche):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == versuche - 1:
                raise
            time.sleep(4 * (i + 1))


def text(s):
    s = re.sub(r"<br\s*/?>", " ", s or "")
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    return re.sub(r"\s+", " ", s).strip()


def kurz(s, n=900):
    s = text(s)
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + " …"


# ---------------- SPIEGEL ----------------
def spiegel(url):
    s = holen(url)
    teile = s.split('x-data="{ expanded: false }"')[1:]
    items = []
    for t in teile:
        rang = re.search(r'<p class="font-sansUI lg:text-3xl[^"]*">\s*(\d+)\s*</p>', t)
        titel = re.search(r'<span class="align-middle">\s*(.*?)\s*</span>', t, re.S)
        if not rang or not titel:
            continue
        meta = re.findall(r'<li class="mr-8 flex items-center">\s*<p>(.*?)</p>', t, re.S)
        badge = re.search(r'<span class="block text-primary-base[^"]*">\s*(.*?)\s*</span>', t, re.S)
        preis = re.search(r"<li>\s*(€\s*[\d.,]+)\s*</li>", t)
        bild = re.search(r'data-src="(https://cdn\.prod\.www\.spiegel\.de/assets/bestseller/[^"]+)"', t)
        isbn = re.search(r"ISBN:\s*([\dX]{10,13})", t)
        probe = re.search(r'href="(https?://www\.book2look\.de/[^"]+)"', t)
        klappe = re.search(r'x-show="expanded".*?<p class="font-serifUI[^"]*">(.*?)<ul', t, re.S)
        items.append({
            "r": int(rang.group(1)), "t": text(titel.group(1)),
            "a": text(meta[0]) if meta else "", "p": text(meta[1]) if len(meta) > 1 else "",
            "b": text(badge.group(1)) if badge else "", "pr": preis.group(1) if preis else "",
            "img": bild.group(1) if bild else "", "isbn": isbn.group(1) if isbn else "",
            "lp": html.unescape(probe.group(1)) if probe else "",
            "d": kurz(klappe.group(1)) if klappe else "",
            "u": f"https://shop.spiegel.de/direct/{isbn.group(1)}" if isbn else "",
        })
    items.sort(key=lambda x: x["r"])
    return items


# ---------------- Apple Books ----------------
OHNE_ZUSATZ = re.compile(r"\s*[\(\[]\s*(ungekürzt[^)\]]*|gekürzt[^)\]]*|autorenlesung|lesung|ungekürzte lesung[^)\]]*)\s*[\)\]]", re.I)


def apple(art, genre=None, limit=25):
    feed = "toppaidebooks" if art == "eb" else "topaudiobooks"
    url = f"https://itunes.apple.com/de/rss/{feed}/limit={limit}" + (f"/genre={genre}" if genre else "") + "/json"
    d = json.loads(holen(url))["feed"]
    entries = d.get("entry") or []
    if isinstance(entries, dict):
        entries = [entries]
    items = []
    for i, e in enumerate(entries, 1):
        bilder = e.get("im:image") or []
        img = bilder[-1]["label"] if bilder else ""
        img = re.sub(r"/\d+x\d+bb\.", "/400x600bb.", img)
        link = e.get("link")
        if isinstance(link, list):
            link = link[0]
        titel = OHNE_ZUSATZ.sub("", e["im:name"]["label"]).strip()
        items.append({
            "r": i, "t": titel, "a": (e.get("im:artist") or {}).get("label", ""),
            "p": (e.get("im:publisher") or {}).get("label", ""),
            "g": e["category"]["attributes"].get("label", ""),
            "pr": (e.get("im:price") or {}).get("label", ""),
            "img": img, "u": (link or {}).get("attributes", {}).get("href", ""),
            "d": kurz((e.get("summary") or {}).get("label", "")),
            "j": (e.get("im:releaseDate") or {}).get("label", "")[:4],
        })
    return items, url


# ---------------- Gesamt ----------------
def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()


def schluessel(it):
    t = re.split(r"\s[–—-]\s|:|\(|\.\s", it["t"])[0]
    erst = re.split(r",|&| und | and ", it.get("a") or "")[0].strip()
    nach = norm(erst).split(" ")[-1] if erst else ""
    return norm(t) + "|" + nach


def gesamt(listen):
    pool = {}
    for lid in GESAMT_AUS:
        for it in (listen.get(lid) or {}).get("items", [])[:20]:
            k = schluessel(it)
            e = pool.setdefault(k, {"pkt": 0, "on": [], "it": None})
            e["pkt"] += 21 - it["r"]
            e["on"].append({"l": KURZ[lid], "r": it["r"], "id": lid})
            # SPIEGEL-Eintrag bevorzugen (hat ISBN + Klappentext), dann E-Book, dann Hörbuch
            if e["it"] is None or (lid.startswith("sp_") and not e["it"].get("isbn")):
                e["it"] = dict(it)
            elif not e["it"].get("d") and it.get("d"):
                e["it"]["d"] = it["d"]
    best = sorted(pool.values(), key=lambda e: (-e["pkt"], min(o["r"] for o in e["on"])))[:50]
    out = []
    for i, e in enumerate(best, 1):
        it = e["it"]
        it.update({"r": i, "on": sorted(e["on"], key=lambda o: o["r"]), "pkt": e["pkt"]})
        it.pop("b", None)
        out.append(it)
    return out


# ---------------- Supabase ----------------
def skey():
    if os.environ.get("LESELOG_SERVICE_KEY"):
        return os.environ["LESELOG_SERVICE_KEY"]
    return subprocess.check_output(
        ["security", "find-generic-password", "-s", "leselog-service-key", "-a", "leselog", "-w"]).decode().strip()


def speichern(zeilen):
    k = skey()
    req = urllib.request.Request(
        SUPA + "/rest/v1/charts?on_conflict=id", data=json.dumps(zeilen).encode(), method="POST",
        headers={"apikey": k, "Authorization": "Bearer " + k, "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal", "User-Agent": "leselog-tools/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status


def push(titel, text_):
    for p in ("/home/funk/bin/pushfunk", os.path.expanduser("~/bin/pushfunk")):
        if os.path.exists(p):
            subprocess.run([p, "pushfunk", titel, text_, "--quelle", "leselog-bestseller"], timeout=30)
            return


def main():
    trocken = "--trocken" in sys.argv
    jetzt = datetime.now(timezone.utc).isoformat()
    listen, fehler = {}, []

    for lid, titel, url in SPIEGEL:
        try:
            items = spiegel(url)
            if len(items) < 5:
                raise ValueError(f"nur {len(items)} Einträge – Seitenaufbau geändert?")
            listen[lid] = {"id": lid, "title": titel, "source": "spiegel", "url": url, "items": items}
        except Exception as e:
            fehler.append(f"{lid}: {e}")
        time.sleep(1.5)

    aufgaben = [("ap_eb_all", "Apple Books · E-Books", "eb", None, 50), ("au_all", "Apple Books · Hörbücher", "au", None, 50)]
    aufgaben += [(f"ap_eb_{g}", f"Apple Books · E-Books · {n}", "eb", g, 25) for g, n in EBOOK_GENRES.items()]
    aufgaben += [(f"au_{g}", f"Apple Books · Hörbücher · {n}", "au", g, 25) for g, n in AUDIO_GENRES.items()]
    for lid, titel, art, genre, limit in aufgaben:
        try:
            items, url = apple(art, genre, limit)
            if len(items) < 5:
                raise ValueError(f"nur {len(items)} Einträge")
            listen[lid] = {"id": lid, "title": titel, "source": "apple", "url": url, "items": items}
        except Exception as e:
            fehler.append(f"{lid}: {e}")
        time.sleep(0.5)

    if listen:
        listen["gesamt"] = {"id": "gesamt", "title": "Gesamt – alle Listen zusammen", "source": "gesamt",
                            "url": "", "items": gesamt(listen)}
    zeilen = [dict(v, fetched_at=jetzt) for v in listen.values()]
    log(f"{len(zeilen)} Listen geholt, {len(fehler)} Fehler")
    for f in fehler:
        log("  ✗ " + f)
    if trocken:
        g = listen.get("gesamt", {}).get("items", [])[:10]
        for it in g:
            log(f"  {it['r']:>2}. {it['t']} – {it['a']}  ({', '.join(o['l'] + ' #' + str(o['r']) for o in it['on'])})")
        json.dump(zeilen, open("bestseller_trocken.json", "w"), ensure_ascii=False, indent=1)
        return 0
    if zeilen:
        speichern(zeilen)
        log("gespeichert")
    if len(fehler) >= 6 or not any(k.startswith("sp_") for k in listen):
        push("⚠️ 📚 Leselog-Bestseller", f"{len(fehler)} Listen nicht abrufbar: {fehler[0][:120]}")
    return 0 if zeilen else 1


if __name__ == "__main__":
    sys.exit(main())

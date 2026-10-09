# -*- coding: utf-8 -*-
"""Holt fehlende Cover/Klappentexte nach – bevorzugt fuer die deutschen Ausgaben.

Deutsche Klappentexte kommen zuerst von der DNB (Verlagstext per ISBN, ohne
Schluessel und ohne Kontingent), danach von Google Books.

Laeuft taeglich per launchd. Ist nichts zu tun, endet das Skript sofort.
Ist Googles Tageskontingent erschoepft (403), bricht es sauber ab und versucht
es am naechsten Tag erneut. Es aendert nur, was leer ist – nie vorhandene Daten.
"""
import json, re, time, html, unicodedata, subprocess, urllib.request, urllib.parse, sys
from datetime import datetime

GKEY = "AIzaSyC6NrAnOw5HqnbyUt6_IA7VyHl623FHUQU"
GB   = "https://www.googleapis.com/books/v1/volumes"
SUPA = "https://wejvvldovywrernuujgt.supabase.co"

def log(msg):
    print(f"{datetime.now():%Y-%m-%d %H:%M}  {msg}", flush=True)

def skey():
    # Auf dem Funk-Server steht der Key in ~/.leselog.env, auf dem Mac im Schlüsselbund.
    import os
    if os.environ.get("LESELOG_SERVICE_KEY"):
        return os.environ["LESELOG_SERVICE_KEY"]
    return subprocess.check_output(
        ["security","find-generic-password","-s","leselog-service-key","-a","leselog","-w"]
    ).decode().strip()

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+"," ", re.sub(r"[^a-z0-9 ]+"," ", s)).strip()

def req(url, hdrs=None, data=None, method=None, timeout=30):
    r = urllib.request.Request(url, data=data, method=method)
    for k,v in (hdrs or {}).items(): r.add_header(k,v)
    with urllib.request.urlopen(r, timeout=timeout) as x:
        b = x.read()
        return json.loads(b) if b else None

class QuotaExhausted(Exception): pass

DE_WORTE = re.compile(r"\b(der|die|das|und|nicht|ist|eine|sich|von|dem|den|mit)\b")
def ist_deutsch(t):
    return len(DE_WORTE.findall((t or "").lower())) >= 3

SRU = "https://services.dnb.de/sru/dnb?"
MARC = "{http://www.loc.gov/MARC21/slim}"
WERBUNG = re.compile(r"farbschnitt|neues cover|frischen look|ausverkauft|jetzt als taschenbuch|jetzt im taschenbuch", re.I)

def _hol(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"Leselog/1.0"}), timeout=30) as x:
        return x.read().decode("utf-8", "replace")

def _klappentext_url_liste(cql, titel=None):
    """Blurb-Links (MVB-Verlagstexte) der DNB-Datensaetze zu einer CQL-Suche."""
    from xml.etree import ElementTree as ET
    q = urllib.parse.urlencode({"version":"1.1", "operation":"searchRetrieve", "query":cql,
                                "recordSchema":"MARC21-xml", "maximumRecords":"20"})
    out = []
    for rec in ET.fromstring(_hol(SRU + q)).iter(MARC + "record"):
        def sub(tag, code):
            for f in rec.iter(MARC + "datafield"):
                if f.get("tag") == tag:
                    for s in f:
                        if s.get("code") == code and s.text: return s.text
        if titel and not norm(sub("245", "a") or "").startswith(norm(titel)[:20]):
            continue
        for f in rec.iter(MARC + "datafield"):
            if f.get("tag") == "856":
                for s in f:
                    if s.get("code") == "u" and s.text and "/blurb" in s.text: out.append(s.text)
    return out

def _sauber(t):
    t = t.replace("\ufeff", "").replace("ï»¿", "")
    t = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", t)
    t = re.sub(r"(?i)<br\s*/?>|</p>", "\n", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    zeilen = []
    for z in t.splitlines():
        z = re.sub(r"[ \t\xa0]+", " ", z).strip()
        # Verlagswerbung (Farbschnitt, neues Cover …) satzweise entfernen
        z = " ".join(x for x in re.split(r"(?<=[.!?])\s+", z) if not WERBUNG.search(x))
        zeilen.append(z.lstrip(" -–"))
    return re.sub(r"\n{2,}", "\n\n", "\n".join(zeilen)).strip()

def dnb_klappentext(b):
    """Deutscher Verlagstext aus dem DNB-Katalog: erst per ISBN, sonst eine
    andere Ausgabe mit gleichem Titel und Autor. Ohne Schluessel, ohne Kontingent."""
    suchen = []
    if b.get("isbn13"): suchen.append((f"num={b['isbn13']}", None))
    worte = [w for w in re.findall(r"[a-zäöüß0-9]+", (b.get("title") or "").lower())
             if len(w) > 2 and w not in {"der","die","das","und","für","von","mit","the","and"}][:4]
    teile = (b.get("author") or "").split(",")[0].split()
    if worte and teile:
        per = f'{teile[-1]}, {teile[0]}' if len(teile) > 1 else teile[0]
        suchen.append((" and ".join(f"WOE={w}" for w in worte) + f' and per="{per}"', b["title"]))
    versucht = 0
    for cql, titel in suchen:
        try: urls = _klappentext_url_liste(cql, titel)
        except Exception: continue
        for u in urls:
            if versucht >= 4: return None
            versucht += 1
            try: t = _sauber(_hol(u))
            except Exception: continue
            if len(t) >= 80 and ist_deutsch(t): return t
    return None

def gbooks(query, lang=None):
    p = {"q":query, "key":GKEY, "country":"DE", "maxResults":"4"}
    if lang: p["langRestrict"] = lang
    url = GB + "?" + urllib.parse.urlencode(p)
    for i in range(4):
        try:
            return req(url, timeout=25)
        except urllib.error.HTTPError as e:
            if e.code == 403: raise QuotaExhausted()
            if e.code in (429,500,503): time.sleep(2 + i*2); continue
            return None
        except Exception:
            time.sleep(2)
    return None

def main():
    KEY = skey()
    H = {"apikey":KEY, "Authorization":"Bearer "+KEY}
    HW = {**H, "Content-Type":"application/json", "Prefer":"return=minimal"}

    # Kandidaten: deutsche Ausgaben ohne deutschen Klappentext, oder Buecher ohne Cover
    books = req(f"{SUPA}/rest/v1/books?select=id,title,author,isbn13,cover_url,description,"
                f"publisher,page_count,published_year,original_title&media_type=eq.book"
                f"&or=(original_title.not.is.null,cover_url.is.null)", H)
    todo = [b for b in books if not b.get("cover_url") or (b.get("original_title")
            and (not ist_deutsch(b.get("description")) or not b.get("page_count")))]
    if not todo:
        log("nichts zu tun"); return 0

    # 1) Deutsche Klappentexte von der DNB
    for b in todo:
        if b.get("original_title") and not ist_deutsch(b.get("description")):
            t = dnb_klappentext(b)
            if t:
                req(f"{SUPA}/rest/v1/books?id=eq.{b['id']}", HW, json.dumps({"description": t}).encode(), "PATCH")
                b["description"] = t
                log(f"  + {b['title'][:44]}  (Klappentext DNB)")
            time.sleep(0.5)

    log(f"{len(todo)} Buecher zu pruefen")
    done = skipped = 0
    for b in todo:
        try:
            # Deutsche Ausgabe: gezielt ueber die ISBN der deutschen Ausgabe
            hit = None
            if b.get("isbn13"):
                d = gbooks(f'isbn:{b["isbn13"]}')
                hit = (d or {}).get("items", [None])[0] if (d or {}).get("items") else None
            if not hit:
                q = f'intitle:{b["title"]}' + (f' inauthor:{b["author"].split(",")[0]}' if b.get("author") else "")
                d = gbooks(q, "de" if b.get("original_title") else None)
                items = (d or {}).get("items") or []
                if items: hit = items[0]
            if not hit:
                skipped += 1; time.sleep(0.8); continue

            vi = hit.get("volumeInfo", {})
            # Sicherung: Autor muss passen, sonst nichts anfassen
            if b.get("author"):
                last = norm(b["author"].split(",")[0]).split()[-1]
                if last and last not in norm(", ".join(vi.get("authors", []))):
                    skipped += 1; time.sleep(0.8); continue

            patch = {}
            img = vi.get("imageLinks") or {}
            cov = img.get("thumbnail") or img.get("smallThumbnail")
            if cov and not b.get("cover_url"):
                patch["cover_url"] = cov.replace("http://","https://").replace("&edge=curl","")
            # Deutschen Klappentext setzen, wenn der bisherige englisch ist
            desc = vi.get("description")
            if desc and b.get("original_title"):
                if ist_deutsch(desc) and not ist_deutsch(b.get("description")): patch["description"] = desc
            elif desc and not b.get("description"):
                patch["description"] = desc
            for col, val in (("publisher", vi.get("publisher")),
                             ("page_count", vi.get("pageCount"))):
                if val and not b.get(col): patch[col] = val
            pd = vi.get("publishedDate","")
            if pd[:4].isdigit() and not b.get("published_year"): patch["published_year"] = int(pd[:4])

            if patch:
                req(f"{SUPA}/rest/v1/books?id=eq.{b['id']}", HW,
                    json.dumps(patch).encode(), "PATCH")
                done += 1
                log(f"  + {b['title'][:44]}  ({', '.join(patch)})")
            else:
                skipped += 1
            time.sleep(0.8)
        except QuotaExhausted:
            log(f"Google-Kontingent erschoepft – {done} erledigt, Rest morgen.")
            return 0
        except Exception as e:
            log(f"  ! {b['title'][:40]}: {e}"); skipped += 1

    log(f"fertig: {done} ergaenzt, {skipped} unveraendert")
    return 0

if __name__ == "__main__":
    sys.exit(main())

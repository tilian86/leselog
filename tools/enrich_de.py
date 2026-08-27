# -*- coding: utf-8 -*-
"""Holt fehlende Cover/Klappentexte nach – bevorzugt fuer die deutschen Ausgaben.

Laeuft taeglich per launchd. Ist nichts zu tun, endet das Skript sofort.
Ist Googles Tageskontingent erschoepft (403), bricht es sauber ab und versucht
es am naechsten Tag erneut. Es aendert nur, was leer ist – nie vorhandene Daten.
"""
import json, re, time, unicodedata, subprocess, urllib.request, urllib.parse, sys
from datetime import datetime

GKEY = "AIzaSyC6NrAnOw5HqnbyUt6_IA7VyHl623FHUQU"
GB   = "https://www.googleapis.com/books/v1/volumes"
SUPA = "https://wejvvldovywrernuujgt.supabase.co"

def log(msg):
    print(f"{datetime.now():%Y-%m-%d %H:%M}  {msg}", flush=True)

def skey():
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
    todo = [b for b in books if b.get("original_title") or not b.get("cover_url")]
    if not todo:
        log("nichts zu tun"); return 0

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
                de = len(re.findall(r"\b(der|die|das|und|nicht|ist|eine|sich|von|dem|den|mit)\b", desc.lower()))
                if de >= 3: patch["description"] = desc
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

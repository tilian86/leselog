# -*- coding: utf-8 -*-
"""Sucht zu einem englischsprachigen Buch die deutsche Ausgabe – über die
Deutsche Nationalbibliothek (SRU, ohne API-Schluessel).

Sicherster Beleg: Im DNB-Datensatz steht der Originaltitel (MARC 240/246).
Stimmt der mit dem englischen Titel ueberein, ist es garantiert dieselbe Arbeit.
"""
import re, unicodedata, urllib.request, urllib.parse, difflib, time
from xml.etree import ElementTree as ET

NS = {"m": "http://www.loc.gov/MARC21/slim"}
SRU = "https://services.dnb.de/sru/dnb?"

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c)).replace("ß", "ss")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()

STOP = {"the","a","an","of","and","or","to","in","on","for","how","why","what","is","your","you"}
def keywords(t):
    return [w for w in norm(t).split() if w not in STOP and len(w) > 2]

def _get(cql, n=10):
    p = {"version":"1.1","operation":"searchRetrieve","query":cql,
         "recordSchema":"MARC21-xml","maximumRecords":str(n)}
    req = urllib.request.Request(SRU + urllib.parse.urlencode(p),
                                 headers={"User-Agent":"Leselog/1.0"})
    with urllib.request.urlopen(req, timeout=30) as x:
        return x.read()

def _records(xml):
    root = ET.fromstring(xml); out = []
    for rec in root.iter("{http://www.loc.gov/MARC21/slim}record"):
        def sub(tag, code):
            for f in rec.findall(f"m:datafield[@tag='{tag}']", NS):
                for s in f.findall(f"m:subfield[@code='{code}']", NS):
                    if s.text: return s.text
            return None
        langs = []
        for f in rec.findall("m:datafield[@tag='041']", NS):
            langs += [s.text for s in f.findall("m:subfield[@code='a']", NS) if s.text]
        out.append({
            "titel": sub("245","a"), "zusatz": sub("245","b"),
            "orig":  sub("240","a") or sub("246","a"),
            "autor": sub("100","a") or sub("700","a"),
            "jahr":  sub("264","c"), "verlag": sub("264","b"),
            "isbn":  sub("020","a"), "lang": (langs[0] if langs else None),
        })
    return out

def find_german(title_en, author=None, debug=False):
    kws = keywords(title_en)[:4]
    last = norm(author).split()[-1] if author else None
    queries = []
    if kws:
        base = " and ".join(f"WOE={w}" for w in kws)
        if last: queries.append(f"{base} and atr={last}")
        queries.append(base)
    best = None
    for cql in queries:
        try:
            recs = _records(_get(cql))
        except Exception as e:
            if debug: print("   ! ", e)
            continue
        for r in recs:
            if r["lang"] and r["lang"] != "ger":
                continue
            de = (r["titel"] or "").strip(" /:")
            if not de:
                continue
            # Beleg 1: Originaltitel im Datensatz stimmt mit dem englischen Titel ueberein
            score = 0.0
            if r["orig"]:
                score = difflib.SequenceMatcher(None, norm(title_en), norm(r["orig"])).ratio()
            # Beleg 2: deutscher Titel ist NICHT einfach der englische (sonst keine Uebersetzung)
            same = difflib.SequenceMatcher(None, norm(title_en), norm(de)).ratio()
            if score >= 0.75 and same < 0.9:
                cand = {"de_titel": de, "zusatz": r["zusatz"], "orig": r["orig"],
                        "autor": r["autor"], "jahr": r["jahr"], "verlag": r["verlag"],
                        "isbn": r["isbn"], "beleg": round(score, 2)}
                if not best or cand["beleg"] > best["beleg"]:
                    best = cand
        if best:
            break
        time.sleep(0.3)
    return best

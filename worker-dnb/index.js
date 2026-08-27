// Kleiner Vermittler: reicht Anfragen an die Deutsche Nationalbibliothek durch
// und ergänzt CORS-Header, damit die PWA sie lesen darf.
// Die DNB-SRU-Schnittstelle ist offen und braucht keinen Schlüssel.

const DNB = "https://services.dnb.de/sru/dnb";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const query = url.searchParams.get("q");
    if (!query) {
      return new Response(JSON.stringify({ error: "Parameter q fehlt" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (query.length > 300) {
      return new Response(JSON.stringify({ error: "Anfrage zu lang" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const dnbUrl = DNB + "?" + new URLSearchParams({
      version: "1.1",
      operation: "searchRetrieve",
      query,
      recordSchema: "MARC21-xml",
      maximumRecords: url.searchParams.get("n") || "10",
    });

    try {
      const res = await fetch(dnbUrl, {
        headers: { "User-Agent": "Leselog/1.0" },
        cf: { cacheTtl: 86400, cacheEverything: true },   // einen Tag zwischenspeichern
      });
      return new Response(res.body, {
        status: res.status,
        headers: { ...CORS, "Content-Type": "text/xml; charset=UTF-8",
                   "Cache-Control": "public, max-age=86400" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "DNB nicht erreichbar" }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  },
};

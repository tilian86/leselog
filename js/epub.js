// EPUB-Datei client-seitig öffnen und Metadaten lesen (Titel, Autor, ISBN, Verlag …).
// Eine EPUB ist ein ZIP; die Metadaten stecken in der OPF-Datei.

let zipPromise = null;
function loadZip() {
  if (!zipPromise) zipPromise = import("https://esm.sh/jszip@3.10.1").then((m) => m.default || m);
  return zipPromise;
}

function txt(doc, tag) {
  const el = doc.getElementsByTagName(tag)[0] || doc.getElementsByTagNameNS("*", tag.replace("dc:", ""))[0];
  return el ? el.textContent.trim() : null;
}

export async function readEpubMeta(file) {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(file);

  // 1) container.xml -> Pfad zur OPF
  const containerXml = await zip.file("META-INF/container.xml").async("string");
  const cdoc = new DOMParser().parseFromString(containerXml, "application/xml");
  const opfPath = cdoc.getElementsByTagName("rootfile")[0].getAttribute("full-path");

  // 2) OPF parsen
  const opfXml = await zip.file(opfPath).async("string");
  const odoc = new DOMParser().parseFromString(opfXml, "application/xml");

  const title = txt(odoc, "dc:title");
  const author = txt(odoc, "dc:creator");
  const publisher = txt(odoc, "dc:publisher");
  const language = txt(odoc, "dc:language");
  const dateRaw = txt(odoc, "dc:date");
  const published_year = dateRaw && dateRaw.match(/\d{4}/) ? parseInt(dateRaw.match(/\d{4}/)[0], 10) : null;

  // ISBN aus dc:identifier heraussuchen
  let isbn13 = null, isbn10 = null;
  const ids = odoc.getElementsByTagName("dc:identifier");
  for (const id of ids) {
    const val = (id.textContent || "").replace(/[^0-9Xx]/g, "");
    if (val.length === 13 && (val.startsWith("978") || val.startsWith("979"))) isbn13 = val;
    else if (val.length === 10) isbn10 = val;
  }

  return {
    title: title || file.name.replace(/\.epub$/i, ""),
    author, publisher, language, published_year, isbn13, isbn10,
    source: "epub",
  };
}

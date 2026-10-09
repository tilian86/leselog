// Kurzadresse für geteilte Leselog-Bücher:
//   buch.florian-s-thiel.workers.dev/<slug>  ->  leselog-dateien /b/<slug>  (Service-Binding, keine eigene Logik)
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const p = u.pathname.replace(/\/+$/, "");
    if (!p || p === "/favicon.ico") return new Response("Nichts hier.", { status: 404 });
    return env.DATEIEN.fetch(new Request("https://leselog-dateien/b" + p, { method: req.method, headers: req.headers }));
  },
};

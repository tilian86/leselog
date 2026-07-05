// Leselog Transkriptions-Worker
// Nimmt eine Audio-Datei entgegen und gibt den erkannten Text zurück.
// Der API-Key bleibt sicher hier im Worker – nie im Frontend.

function cors(origin, allowed) {
  const list = (allowed || "*").split(",").map((s) => s.trim());
  const allow = list.includes("*") ? "*" : (list.includes(origin) ? origin : list[0] || "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin, env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST")
      return new Response("Nur POST", { status: 405, headers });

    let audio;
    try {
      const form = await request.formData();
      audio = form.get("audio");
    } catch (_) {}
    if (!audio) return json({ error: "Keine Audiodatei" }, 400, headers);

    const provider = (env.PROVIDER || "elevenlabs").toLowerCase();
    try {
      const text = provider === "openai"
        ? await whisper(audio, env)
        : await scribe(audio, env);
      return json({ text }, 200, headers);
    } catch (err) {
      return json({ error: String(err.message || err) }, 502, headers);
    }
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...headers, "Content-Type": "application/json" },
  });
}

// ElevenLabs Scribe
async function scribe(audio, env) {
  if (!env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY fehlt");
  const fd = new FormData();
  fd.append("file", audio, "note.webm");
  fd.append("model_id", "scribe_v1");
  if (env.LANGUAGE) fd.append("language_code", env.LANGUAGE);
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    body: fd,
  });
  if (!res.ok) throw new Error("Scribe " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  return (data.text || "").trim();
}

// OpenAI Whisper
async function whisper(audio, env) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY fehlt");
  const fd = new FormData();
  fd.append("file", audio, "note.webm");
  fd.append("model", "whisper-1");
  if (env.LANGUAGE) fd.append("language", env.LANGUAGE);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.OPENAI_API_KEY },
    body: fd,
  });
  if (!res.ok) throw new Error("Whisper " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  return (data.text || "").trim();
}

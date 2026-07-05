// Sprache aufnehmen und in Text verwandeln.
// Weg A (bevorzugt): Audio -> Cloudflare Worker -> ElevenLabs Scribe (top Qualität).
// Weg B (Fallback, offline / kein Worker): das iPhone transkribiert selbst (Web Speech API).

import { CONFIG } from "./config.js";

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

export function hasMic() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function pickMime() {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/mpeg"];
  if (typeof MediaRecorder === "undefined") return "";
  return cands.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || "";
}

// Gibt einen Controller zurück: { stop(): Promise<string>, cancel() }
export async function startDictation({ onStatus, onPartial } = {}) {
  const useWorker = !!CONFIG.TRANSCRIBE_URL;

  if (useWorker && hasMic() && typeof MediaRecorder !== "undefined") {
    return startWorkerDictation({ onStatus });
  }
  if (SpeechRec) {
    return startBrowserDictation({ onStatus, onPartial });
  }
  throw new Error("Dein Browser unterstützt keine Spracheingabe. Tipp den Titel einfach ein.");
}

// -------- Weg A: Aufnehmen und an Scribe schicken --------
async function startWorkerDictation({ onStatus }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start();
  onStatus && onStatus("recording");

  const stop = () =>
    new Promise((resolve, reject) => {
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        onStatus && onStatus("transcribing");
        try {
          const blob = new Blob(chunks, { type: mime || "audio/webm" });
          const fd = new FormData();
          fd.append("audio", blob, "note." + (mime.includes("mp4") ? "mp4" : "webm"));
          const res = await fetch(CONFIG.TRANSCRIBE_URL, { method: "POST", body: fd });
          if (!res.ok) throw new Error("Transkription fehlgeschlagen (" + res.status + ")");
          const data = await res.json();
          resolve((data.text || "").trim());
        } catch (err) { reject(err); }
      };
      rec.stop();
    });

  const cancel = () => { try { rec.stop(); } catch (_) {} stream.getTracks().forEach((t) => t.stop()); };
  return { stop, cancel, mode: "scribe" };
}

// -------- Weg B: iPhone/Browser transkribiert selbst --------
function startBrowserDictation({ onStatus, onPartial }) {
  const rec = new SpeechRec();
  rec.lang = "de-DE";
  rec.interimResults = true;
  rec.continuous = true;
  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onPartial && onPartial((finalText + " " + interim).trim());
  };
  rec.start();
  onStatus && onStatus("recording");

  const stop = () =>
    new Promise((resolve) => {
      rec.onend = () => resolve(finalText.trim());
      try { rec.stop(); } catch (_) { resolve(finalText.trim()); }
    });
  const cancel = () => { try { rec.abort(); } catch (_) {} };
  return { stop, cancel, mode: "browser" };
}

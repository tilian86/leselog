// ISBN-Barcode vom Buchrücken scannen. Nutzt ZXing (lädt bei Bedarf).
// Funktioniert auch auf iPhone-Safari (dort fehlt die native BarcodeDetector-API).

let readerPromise = null;
function loadReader() {
  if (!readerPromise) {
    readerPromise = import("https://esm.sh/@zxing/browser@0.1.5").then(
      (m) => new m.BrowserMultiFormatReader()
    );
  }
  return readerPromise;
}

function isISBN(code) {
  const c = String(code).replace(/[^0-9Xx]/g, "");
  return (c.length === 13 && (c.startsWith("978") || c.startsWith("979"))) || c.length === 10;
}

// Startet die Kamera im übergebenen <video>. onDetected(isbn) wird beim ersten Fund gerufen.
export async function startScanner(videoEl, { onDetected, onError } = {}) {
  const reader = await loadReader();
  let stopped = false;
  let controls = null;

  try {
    controls = await reader.decodeFromVideoDevice(undefined, videoEl, (result, err) => {
      if (stopped) return;
      if (result) {
        const code = result.getText();
        if (isISBN(code)) {
          stopped = true;
          onDetected && onDetected(code.replace(/[^0-9Xx]/g, ""));
        }
      }
      // err ist bei jedem Frame ohne Treffer normal – ignorieren.
    });
  } catch (e) {
    onError && onError(e);
  }

  return {
    stop() {
      stopped = true;
      try { controls && controls.stop(); } catch (_) {}
      try { reader.reset && reader.reset(); } catch (_) {}
    },
  };
}

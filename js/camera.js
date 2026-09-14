// Kamera: foto via <input capture> (stabilast i iOS-PWA), komprimering, streckkod via ZXing.

export function pickPhoto({ capture = true } = {}) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    if (capture) inp.setAttribute('capture', 'environment');
    inp.style.position = 'fixed'; inp.style.left = '-9999px';
    document.body.appendChild(inp);
    let done = false;
    const finish = f => { if (done) return; done = true; inp.remove(); resolve(f || null); };
    inp.addEventListener('change', () => finish(inp.files && inp.files[0]));
    // iOS ger ingen "cancel"-händelse tillförlitligt; städa när fönstret får fokus igen
    // Vänta rejält innan vi antar avbrott – iOS kan exportera en stor HEIC-bild i flera sekunder efter att kameran stängts
    const onFocus = () => setTimeout(() => { window.removeEventListener('focus', onFocus); if (!done && !(inp.files && inp.files.length)) finish(null); }, 20000);
    window.addEventListener('focus', onFocus);
    inp.click();
  });
}

async function decodeBitmap(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch {}
    try { return await createImageBitmap(blob); } catch {}
  }
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = e => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}
export async function compressImage(blob, maxPx = 1280, quality = 0.82) {
  const bmp = await decodeBitmap(blob);
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  const k = Math.min(1, maxPx / Math.max(w, h));
  const cw = Math.round(w * k), ch = Math.round(h * k);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  c.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
  const out = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
  const dataURL = c.toDataURL('image/jpeg', quality);
  // Miniatyr för loggen
  const tk = Math.min(1, 320 / Math.max(cw, ch));
  const tc = document.createElement('canvas'); tc.width = Math.round(cw * tk); tc.height = Math.round(ch * tk);
  tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
  const thumb = await new Promise(r => tc.toBlob(r, 'image/jpeg', 0.8));
  if (bmp.close) bmp.close();
  return { blob: out, dataURL, thumb, width: cw, height: ch };
}

// ---- Streckkod ----
export const canLiveScan = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && (window.isSecureContext || location.hostname === 'localhost');
let zxingP = null;
function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (zxingP) return zxingP;
  zxingP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/zxing.min.js';
    s.onload = () => res(window.ZXing); s.onerror = () => { zxingP = null; rej(new Error('Kunde inte ladda streckkodsläsaren')); };
    document.head.appendChild(s);
  });
  return zxingP;
}
function hints(ZX) {
  const h = new Map();
  h.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E, ZX.BarcodeFormat.CODE_128]);
  h.set(ZX.DecodeHintType.TRY_HARDER, true);
  return h;
}
export async function startScanner(video, onResult) {
  const ZX = await loadZXing();
  const reader = new ZX.BrowserMultiFormatReader(hints(ZX), 300);
  let stopped = false;
  const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }, video, (result, err) => {
    if (stopped) return;
    if (result) { const txt = result.getText(); if (txt) onResult(txt); }
  });
  return { stop() { stopped = true; try { reader.reset(); } catch {} try { controls?.stop?.(); } catch {} } };
}
export async function decodeBarcodeFromImage(blob) {
  const ZX = await loadZXing();
  const reader = new ZX.BrowserMultiFormatReader(hints(ZX));
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url;
    await new Promise((r, j) => { img.onload = r; img.onerror = j; });
    // Prova originalet och en nedskalad variant (stora foton ger ibland missar)
    for (const maxPx of [1600, 900]) {
      const k = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      try { const r = await reader.decodeFromImageUrl(c.toDataURL('image/jpeg', 0.92)); if (r?.getText()) return r.getText(); } catch {}
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

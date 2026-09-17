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
// Bildkvalitet utan AI-anrop: medelljus och skärpa (varians av Laplace) på en liten gråskalekopia
function assess(canvas) {
  try {
    const w = 200, h = Math.max(1, Math.round(canvas.height / canvas.width * 200));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(canvas, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, gray = new Float32Array(w * h);
    let sum = 0; for (let i = 0; i < w * h; i++) { const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; gray[i] = v; sum += v; }
    const mean = sum / (w * h);
    let ls = 0, ls2 = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]; ls += l; ls2 += l * l; n++; }
    const sharp = ls2 / n - (ls / n) ** 2;
    // Kalibrerat mot skarpa foton (2 900–4 500), samma bilder med rejäl oskärpa (60–90) och nedsläckta (medelljus 16–28)
    return { mean: Math.round(mean), sharp: Math.round(sharp), dark: mean < 40, blurry: sharp < 110 };
  } catch { return { mean: 128, sharp: 999, dark: false, blurry: false }; }
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
  return { blob: out, dataURL, thumb, width: cw, height: ch, quality: assess(c) };
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
    // Streckkoden är ofta liten i ett helt foto: prova hela bilden i två storlekar, sedan förstorade utsnitt (mitten + fyra kvadranter),
    // även vridet 90° – allt lokalt i telefonen, inga AI-anrop. Träff = exakt produkt i stället för gissning.
    const W = img.width, H = img.height;
    const tryRegion = async (sx, sy, sw, sh, maxPx, rot = false) => {
      const k = Math.min(2, maxPx / Math.max(sw, sh));
      const cw = Math.round(sw * k), ch = Math.round(sh * k);
      const c = document.createElement('canvas'); c.width = rot ? ch : cw; c.height = rot ? cw : ch;
      const g = c.getContext('2d');
      if (rot) { g.translate(ch, 0); g.rotate(Math.PI / 2); }
      g.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
      try { const r = await reader.decodeFromImageUrl(c.toDataURL('image/jpeg', 0.92)); const t = r?.getText(); if (t && /^\d{8,14}$/.test(t)) return t; } catch {}
      return null;
    };
    const regions = [[0, 0, W, H, 1600], [0, 0, W, H, 900], [W * .2, H * .2, W * .6, H * .6, 1400], [0, 0, W * .6, H * .6, 1300], [W * .4, 0, W * .6, H * .6, 1300], [0, H * .4, W * .6, H * .6, 1300], [W * .4, H * .4, W * .6, H * .6, 1300]];
    const t0 = Date.now();
    for (const rot of [false, true]) for (const [sx, sy, sw, sh, px] of regions) { if (Date.now() - t0 > 3500) return null; const code = await tryRegion(sx, sy, sw, sh, px, rot); if (code) return code; }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

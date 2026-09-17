// Delade UI-byggstenar: ark, toast, ring, formatterare, datum
import { I } from './icons.js?v=202609171301';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const round = (n, d = 0) => { const f = 10 ** d; return Math.round((Number(n) || 0) * f) / f; };

// Svenska talformat: mellanslag som tusentalsavgränsare, komma som decimal
export function fmt(n, d = 0) {
  const v = round(n, d);
  const [i, f] = Math.abs(v).toFixed(d).split('.');
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '−' : '') + int + (f ? ',' + f : '');
}
export const kcal = n => fmt(n, 0);
export const g = n => fmt(n, Math.abs(n) < 10 ? 1 : 0);
export const signed = n => (n > 0 ? '+' : '') + fmt(n, 1);

// ---- Datum (lokala nycklar YYYY-MM-DD) ----
const pad = n => String(n).padStart(2, '0');
export function dateKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export const todayKey = () => dateKey(new Date());
export function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
export function daysBetween(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 86400000); }
const WD = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const WDL = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const MO = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MOL = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
export const weekdayShort = k => WD[parseKey(k).getDay()];
export function fmtDate(k, long = false) {
  const d = parseKey(k), t = todayKey();
  if (k === t) return 'Idag';
  if (k === addDays(t, -1)) return 'Igår';
  if (k === addDays(t, 1)) return 'Imorgon';
  const yr = d.getFullYear() !== parseKey(t).getFullYear() ? ` ${d.getFullYear()}` : '';
  return long ? `${WDL[d.getDay()]} ${d.getDate()} ${MOL[d.getMonth()]}${yr}` : `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}${yr}`;
}
export function fmtDateLong(k) { const d = parseKey(k); return `${WDL[d.getDay()]} ${d.getDate()} ${MOL[d.getMonth()]}`; }
export const fmtShort = k => { const d = parseKey(k); return `${d.getDate()} ${MO[d.getMonth()]}`; };
// AI-modeller skriver ibland "blomk\\u00e5l" (dubbelescapat) – avkoda sådana sekvenser i alla strängar, djupt
export function fixEscapes(v) {
  if (typeof v === 'string') return v.includes('\\u') ? v.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : v;
  if (Array.isArray(v)) return v.map(fixEscapes);
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = fixEscapes(v[k]); return v; }
  return v;
}
// ---- Var kör appen? Publik adress (GitHub Pages) kontra hemmanätet/datorn ----
export const PUBLIC_URL = 'https://niclasnn.github.io/tallrik-app/';
export const IS_LOCAL_HOST = /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[^.]+\.local)$/.test(location.hostname);
export const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
export const IS_STANDALONE = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
// ---- Teman (Malin-läge = gulligt, vitt & rosa) ----
export const THEMES = [
  { id: 'dark', name: 'Mörkt', emoji: '🌑', bg: '#0A0C12', accent: '#FF8A3D', fg: '#F5F6F8' },
  { id: 'light', name: 'Ljust', emoji: '☀️', bg: '#F3F4F8', accent: '#FF8A3D', fg: '#0F1219' },
  { id: 'malin', name: 'Malin-läge', emoji: '🐱', bg: '#FFF4F8', accent: '#FF6FA5', fg: '#4A2A3D' },
  { id: 'malin-dark', name: 'Malin natt', emoji: '🌙', bg: '#1B1020', accent: '#FF86B8', fg: '#FFF2F8' },
  { id: 'auto', name: 'Auto', emoji: '📱', bg: 'linear-gradient(135deg,#0A0C12 50%,#F3F4F8 50%)', accent: '#FF8A3D', fg: '#F5F6F8' },
];
export const THEME_BG = { dark: '#0A0C12', light: '#F3F4F8', malin: '#FFF4F8', 'malin-dark': '#1B1020' };
export function resolveTheme(setting) { const t = setting || 'dark'; if (t === 'auto') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; return THEME_BG[t] ? t : 'dark'; }
export function setDocumentTheme(id) {
  const de = document.documentElement; de.dataset.theme = id;
  if (/^malin/.test(id)) de.dataset.cute = '1'; else delete de.dataset.cute;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', THEME_BG[id]);
  // Hemskärmsikonen följer temat (iOS läser länken när man trycker "Lägg till på hemskärmen")
  document.querySelector('link[rel=apple-touch-icon]')?.setAttribute('href', /^malin/.test(id) ? 'icons/apple-touch-icon-malin.png' : 'icons/apple-touch-icon.png');
  try { localStorage.setItem('tallrik.theme', id); } catch {}
}
export const isCute = () => document.documentElement.dataset.cute === '1';
const CUTE = ['🐱', '🐾', '🌸', '🎀', '🧁', '🍓', '🦋', '🐰', '💕', '🌷', '🐣', '🍒'];
const MASCOTS = ['🐱', '🐰', '🐣', '🦋', '🐻', '🐼', '🐥', '🐹', '🐨', '🐶'];
const seedNum = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
export const cuteEmoji = (seed = Math.random()) => CUTE[seedNum(seed) % CUTE.length];
export const mascot = (seed = todayKey()) => MASCOTS[seedNum(seed) % MASCOTS.length];
// Lägg till en gullig emoji i Malin-läge, annars oförändrad text
export const cute = (text, seed) => isCute() ? `${text} ${cuteEmoji(seed ?? text)}` : text;
export function themePicker(current = 'dark') {
  return `<div class="theme-grid">${THEMES.map(t => `<button type="button" class="theme-sw ${t.id === current ? 'active' : ''}" data-theme-id="${t.id}"><span class="sw" style="background:${t.bg};color:${t.fg}">${t.emoji}<i style="background:${t.accent}"></i></span><span>${t.name}</span></button>`).join('')}</div>`;
}
export function bindThemePicker(root, onPick) {
  root.querySelectorAll('[data-theme-id]').forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll('[data-theme-id]').forEach(x => x.classList.toggle('active', x === b));
    haptic(); onPick(b.dataset.themeId);
  }));
}
export function greeting(name) {
  const h = new Date().getHours();
  const w = h < 5 ? 'God natt' : h < 10 ? 'God morgon' : h < 13 ? 'God förmiddag' : h < 18 ? 'God eftermiddag' : 'God kväll';
  return name ? `${w}, ${name}` : w;
}

// ---- Måltider ----
export const MEALS = [
  { id: 'breakfast', name: 'Frukost', icon: '🌅', share: .25 },
  { id: 'lunch', name: 'Lunch', icon: '🥗', share: .35 },
  { id: 'dinner', name: 'Middag', icon: '🍽️', share: .30 },
  { id: 'snack', name: 'Mellanmål', icon: '🍎', share: .10 },
];
export const meal = id => MEALS.find(m => m.id === id) || MEALS[3];
export function guessMeal(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5 && h < 10.5) return 'breakfast';
  if (h >= 10.5 && h < 14.5) return 'lunch';
  if (h >= 16.5 && h < 21.5) return 'dinner';
  return 'snack';
}
export const timeHM = (iso) => { const d = iso ? new Date(iso) : new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// ---- Haptik (no-op där det inte stöds) ----
export function haptic(kind = 'light') {
  try { if (navigator.vibrate) navigator.vibrate(kind === 'success' ? [10, 30, 10] : kind === 'heavy' ? 20 : 8); } catch {}
}

// ---- Toast ----
export function toast(msg, kind = '', ms = null, { action = '', onAction = null } = {}) {
  ms = ms ?? (kind === 'bad' ? 5200 : 2600);   // fel ska hinna läsas
  const host = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  if (kind === 'good' && isCute() && !/[\u{1F300}-\u{1FAFF}]/u.test(msg)) msg = `${msg} ${cuteEmoji()}`;
  t.innerHTML = (kind === 'good' ? `<span style="color:var(--good)">${I.check}</span>` : kind === 'bad' ? `<span style="color:var(--bad)">${I.warn}</span>` : '') + `<span>${esc(msg)}</span>` + (action ? `<button class="toast-action">${esc(action)}</button>` : '');
  t.querySelectorAll('svg').forEach(s => { s.style.width = '18px'; s.style.height = '18px'; });
  host.appendChild(t);
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  t.querySelector('.toast-action')?.addEventListener('click', () => { onAction && onAction(); kill(); });
  setTimeout(kill, action ? Math.max(ms, 5000) : ms);
}

// ---- Ark (bottom sheets), stapelbara ----
const stack = [];
export function openSheet({ title = '', html = '', full = false, onMount, onClose, onBeforeClose = null, closable = true }) {
  const host = document.getElementById('sheets');
  const back = document.createElement('div');
  back.className = 'sheet-backdrop';
  back.innerHTML = `
    <div class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true">
      <div class="handle"></div>
      <div class="sheet-head ${title ? '' : 'hidden'}">
        <div class="h2">${esc(title)}</div>
        ${closable ? `<button class="icon-btn round" data-close aria-label="Stäng">${I.close}</button>` : ''}
      </div>
      <div class="sheet-body ${title ? '' : 'tight'}">${html}</div>
    </div>`;
  host.appendChild(back);
  document.body.style.overflow = 'hidden';
  const sheetEl = back.querySelector('.sheet');
  const body = back.querySelector('.sheet-body');
  let closed = false;
  const api = {
    el: sheetEl, body,
    close(result, force = false) {
      if (closed) return;
      const guard = onBeforeClose || back.__guard;
      if (!force && guard && guard() === false) return;
      closed = true;
      back.classList.remove('in');
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.style.overflow = '';
      setTimeout(() => back.remove(), 340);
      onClose && onClose(result);
    },
    setTitle(t) { const h = back.querySelector('.sheet-head'); h.classList.remove('hidden'); h.querySelector('.h2').textContent = t; body.classList.remove('tight'); },
    setHTML(h) { body.innerHTML = h; },
  };
  stack.push(api);
  if (closable) {
    back.addEventListener('click', e => { if (e.target === back) api.close(); });
    back.querySelector('[data-close]')?.addEventListener('click', () => api.close());
    // Dra ner handtaget för att stänga
    let y0 = null, dy = 0;
    const handle = back.querySelector('.handle');
    const head = back.querySelector('.sheet-head');
    for (const h of [handle, head]) {
      h.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; dy = 0; sheetEl.style.transition = 'none'; }, { passive: true });
      h.addEventListener('touchmove', e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheetEl.style.transform = `translateY(${dy}px)`; }, { passive: true });
      h.addEventListener('touchend', () => { sheetEl.style.transition = ''; if (dy > 90) api.close(); else sheetEl.style.transform = ''; y0 = null; });
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add('in')));
  onMount && onMount(api);
  return api;
}
export function closeAllSheets() { [...stack].forEach(s => s.close()); }
export function topSheet() { return stack[stack.length - 1]; }

export function confirmSheet({ title, text, okText = 'Ja', cancelText = 'Avbryt', danger = false }) {
  return new Promise(resolve => {
    const s = openSheet({
      title, html: `<p class="lead" style="margin-bottom:18px">${esc(text)}</p>
        <div class="col gap-1">
          <button class="btn block ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText)}</button>
          <button class="btn block quiet" data-cancel>${esc(cancelText)}</button>
        </div>`,
      onMount(api) {
        api.body.querySelector('[data-ok]').onclick = () => { resolve(true); api.close(); };
        api.body.querySelector('[data-cancel]').onclick = () => { resolve(false); api.close(); };
      },
      onClose: () => resolve(false),
    });
  });
}

// ---- Ring ----
export function ring({ size = 190, stroke = 14, pct = 0, over = false, id = 'ringGrad', center = '' }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = clamp(pct, 0, 1);
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}">
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" style="stroke-width:${stroke}"/>
      <circle class="ring-fill ${over ? 'over' : ''}" cx="${size / 2}" cy="${size / 2}" r="${r}" style="stroke-width:${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - p)}"/>
    </svg>
    <div class="ring-center">${center}</div>
  </div>`;
}
// Animera ringar + staplar efter att HTML satts in
export function animateIn(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll('.ring-fill[data-target]').forEach(el => el.setAttribute('stroke-dashoffset', el.dataset.target));
    root.querySelectorAll('[data-width]').forEach(el => { el.style.width = el.dataset.width; });
  }));
}
export function countUp(el, to, { dur = 900, d = 0, suffix = '' } = {}) {
  const from = 0, t0 = performance.now();
  const step = now => {
    const t = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (to - from) * e, d) + suffix;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function segmented(items, active, attr = 'data-seg') {
  return `<div class="seg">${items.map(i => `<button ${attr}="${esc(i.id)}" class="${i.id === active ? 'active' : ''}">${esc(i.name)}</button>`).join('')}</div>`;
}
export function bindSeg(root, attr, onChange) {
  root.querySelectorAll(`[${attr}]`).forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll(`[${attr}]`).forEach(x => x.classList.toggle('active', x === b));
    haptic(); onChange(b.getAttribute(attr));
  }));
}
export function macroBars(t, tot, compact = false) {
  const m = (k, cls, name) => {
    const v = tot[k] || 0, goal = t[k] || 1, p = clamp(v / goal, 0, 1);
    return `<div class="macro ${cls}"><div class="lbl">${name}</div><div class="bar"><i data-width="${(p * 100).toFixed(1)}%"></i></div><div class="v">${fmt(v)}<small> / ${fmt(goal)} g</small></div></div>`;
  };
  return `<div class="macros ${compact ? 'compact' : ''}">${m('protein', 'p', 'Protein')}${m('carbs', 'c', 'Kolhydrater')}${m('fat', 'f', 'Fett')}</div>`;
}
export function initials(name) { return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
export const confColor = c => c >= .75 ? 'var(--good)' : c >= .5 ? 'var(--accent-2)' : 'var(--bad)';

// Liten viktkurva (sparkline) för senaste 30 dagarna – används i Idag-kortet och vägningsarket
export function weightSpark(weights, { days = 30, goal = null, height = 40, width = 300 } = {}) {
  const t = todayKey(), start = addDays(t, -days);
  const pts = (weights || []).filter(w => w.date >= start);
  if (pts.length < 2) return `<div class="small muted">${pts.length === 1 ? 'Väg dig igen om några dagar så ritas kurvan.' : 'Ingen vägning ännu.'}</div>`;
  const vals = pts.map(w => w.kg).concat(goal ? [goal] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(0.4, (hi - lo) * 0.2); lo -= pad; hi += pad;
  const x = k => ((days - daysBetween(k, t)) / days) * (width - 12) + 6, y = v => height - 6 - ((v - lo) / (hi - lo)) * (height - 12);
  const path = pts.map((w, i) => `${i ? 'L' : 'M'}${x(w.date).toFixed(1)},${y(w.kg).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${goal ? `<line x1="6" x2="${width - 6}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}" stroke="var(--good)" stroke-width="1" stroke-dasharray="3 4"/>` : ''}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(last.date).toFixed(1)}" cy="${y(last.kg).toFixed(1)}" r="4" fill="#fff" stroke="var(--accent)" stroke-width="2.5"/></svg>`;
}

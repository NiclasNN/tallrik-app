// State + persistens. Allt i localStorage (JSON) utom foton som ligger i IndexedDB.
import { uid, todayKey, addDays, dateKey, fixEscapes } from './components.js?v=202609171301';

let KEY = 'tallrik.state';
const VERSION = 1;
const USERS_KEY = 'tallrik.users', ACTIVE_KEY = 'tallrik.active', SHARED_KEY = 'tallrik.shared';

// ---- Användare (flera personer på samma app, egen data per person, PIN ibland) ----
const pinHash = pin => { let h = 5381; for (const ch of String(pin)) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return 'p' + (h >>> 0).toString(36); };
export function users() { try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; } }
function saveUsers(list) { localStorage.setItem(USERS_KEY, JSON.stringify(list)); }
export const activeUserId = () => localStorage.getItem(ACTIVE_KEY) || '';
export const activeUser = () => users().find(u => u.id === activeUserId()) || null;
const stateKey = id => 'tallrik.state.' + id;
export function migrateLegacy() {
  if (users().length) return;
  const raw = localStorage.getItem('tallrik.state');
  if (!raw) return;
  // Bara riktig data migreras (profil, loggar eller vikter) – ett tomt standardtillstånd raderas i stället för att bli en spökprofil
  let name = 'Användare', st = null; try { st = JSON.parse(raw); name = st.profile?.name || name; } catch {}
  const hasContent = !!(st && (st.profile || Object.values(st.days || {}).some(d => d.entries?.length) || (st.weights || []).length));
  if (!hasContent) { localStorage.removeItem('tallrik.state'); return; }
  const u = { id: 'u1', name, pinHash: pinHash('0000'), createdAt: new Date().toISOString(), lastUnlock: new Date().toISOString(), pinMode: 'sometimes' };
  saveUsers([u]); localStorage.setItem(stateKey('u1'), raw); localStorage.removeItem('tallrik.state'); localStorage.setItem(ACTIVE_KEY, 'u1');
}
export function createUser(name, pin, theme = 'dark') { const u = { id: uid(), name: String(name).trim() || 'Ny användare', pinHash: pinHash(pin || '0000'), createdAt: new Date().toISOString(), lastUnlock: new Date().toISOString(), pinMode: 'sometimes', theme }; saveUsers([...users(), u]); return u; }
export function setActiveUser(id) { localStorage.setItem(ACTIVE_KEY, id); }
export function checkPin(id, pin) { const u = users().find(x => x.id === id); return !!u && u.pinHash === pinHash(pin); }
export function updateUser(id, patch) { saveUsers(users().map(u => u.id === id ? { ...u, ...patch } : u)); }
export function setPin(id, pin) { updateUser(id, { pinHash: pinHash(pin) }); }
export function touchUnlock(id) { updateUser(id, { lastUnlock: new Date().toISOString() }); }
export function deleteUser(id) { saveUsers(users().filter(u => u.id !== id)); localStorage.removeItem(stateKey(id)); if (activeUserId() === id) localStorage.removeItem(ACTIVE_KEY); localStorage.removeItem('tallrik.inviteDone'); tx('readwrite', s => s.delete('state:' + id), 'backup').catch(() => {}); mirrorMeta(); }
// PIN-läge: 'never' | 'sometimes' (var 3:e dag) | 'always'
export function needsPin(u) { if (!u) return true; const mode = u.pinMode || 'sometimes'; if (mode === 'never') return false; if (mode === 'always') return true; return !u.lastUnlock || Date.now() - Date.parse(u.lastUnlock) > 3 * 86400000; }

export const state = {
  version: VERSION,
  profile: null,          // { name, sex, birthYear, heightCm, weightKg, goal, targetWeightKg, paceKgPerWeek, activity, diet, avoid[], mealsPerDay, motivation[], createdAt }
  targets: null,          // { kcal, protein, carbs, fat, waterGlasses, bmr, tdee, method }
  days: {},               // { 'YYYY-MM-DD': { entries: [], water: 0, note: '' } }
  weights: [],            // [{ date, kg }]
  favorites: {},          // { foodKey: food }
  recents: [],            // [food]
  customFoods: [],        // [food]
  settings: { theme: 'dark', haptics: true },
  aiQueue: [],            // [{ id, photoId, date, meal, hint, createdAt }]
  corrections: {},        // { normaliseratNamn: { grams, count, matchKey, matchName, per100, ts } } – appen lär sig dina rättelser
  shopping: [],           // [{ id, text, recipe, done, ts }]
  meta: { installedAt: null, lastOpened: null, tips: {} },
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(what = 'change') { listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } }); }

let saveTimer = null;
export function save(now = false) {
  clearTimeout(saveTimer);
  if (KEY === 'tallrik.state') return;   // ingen aktiv användare → inget att spara (skyddar mot spökprofil vid pagehide)
  const doSave = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); saveShared(); } catch (e) { console.warn('save misslyckades', e); } mirrorToIDB(now); };
  if (now) doSave(); else saveTimer = setTimeout(doSave, 120);
}
export function commit(what) { save(); emit(what); }

const defaults = () => ({ version: VERSION, profile: null, targets: null, days: {}, weights: [], favorites: {}, recents: [], customFoods: [], settings: { theme: 'dark', haptics: true }, aiQueue: [], corrections: {}, shopping: [], meta: { installedAt: null, lastOpened: null, tips: {} } });
function cleanEscapesInCache() { try { if (state.cache && JSON.stringify(state.cache).includes('\\\\u00')) fixEscapes(state.cache); } catch {} }
export function load() {
  const id = activeUserId();
  KEY = id ? stateKey(id) : 'tallrik.state';
  clearTimeout(saveTimer);                                   // ingen fördröjd sparning från förra användaren får skriva över
  for (const k of Object.keys(state)) delete state[k];       // rent tillstånd per användare
  Object.assign(state, defaults());
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      Object.assign(state, s);
      state.settings = { ...{ theme: 'dark', haptics: true }, ...(s.settings || {}) };
      state.meta = { ...{ installedAt: null, lastOpened: null, tips: {} }, ...(s.meta || {}) };
      state.aiQueue = s.aiQueue || [];
      state.favorites = s.favorites || {};
      state.recents = s.recents || [];
      state.customFoods = s.customFoods || [];
      state.corrections = s.corrections || {};
      state.shopping = s.shopping || [];
    }
  } catch (e) { console.warn('kunde inte läsa state', e); }
  if (!state.meta.installedAt) state.meta.installedAt = new Date().toISOString();
  state.meta.lastOpened = new Date().toISOString();
  // AI-nycklar delas mellan användarna på samma enhet (läggs in en gång)
  try { const shared = JSON.parse(localStorage.getItem(SHARED_KEY) || '{}'); const mine = Object.values(state.settings.ai?.keys || {}).some(Boolean); if (!mine && shared.ai && Object.values(shared.ai.keys || {}).some(Boolean)) state.settings.ai = { ...shared.ai, ...(state.settings.ai || {}), keys: shared.ai.keys, available: shared.ai.available || {} }; } catch {}
  try { const sb = sharedBackup(); if (sb?.token && !(state.settings.backup?.token || '').trim()) state.settings.backup = { ...(state.settings.backup || {}), token: sb.token, repo: sb.repo, enabled: true }; } catch {}
  if (id) save();   // utan aktiv användare finns inget att spara (annars skapas ett tomt "legacy"-tillstånd → spökprofil)
  cleanEscapesInCache();
}
let mirrorTimer = null;
// Användarlista, aktiv profil och delade nycklar speglas också – annars går det inte att hitta tillbaka om localStorage rensats helt
function mirrorMeta() { try { tx('readwrite', s => s.put({ users: localStorage.getItem(USERS_KEY), active: localStorage.getItem(ACTIVE_KEY), shared: localStorage.getItem(SHARED_KEY), ts: new Date().toISOString() }, 'meta'), 'backup').catch(() => {}); } catch {} }
function mirrorToIDB(now = false) {
  clearTimeout(mirrorTimer);
  const run = () => { try { const id = activeUserId() || 'legacy'; tx('readwrite', s => s.put({ json: JSON.stringify(state), ts: new Date().toISOString() }, 'state:' + id), 'backup').catch(() => {}); mirrorMeta(); } catch {} };
  if (now) run(); else mirrorTimer = setTimeout(run, 5000);
}
// Om localStorage saknar användarens data men IndexedDB har en spegel → återställ (t.ex. efter att Safari rensat lagring)
export async function restoreFromIDBIfEmpty() {
  try {
    if (!users().length) {
      // Hela localStorage borta (t.ex. Safari-rensning) → återskapa användarlistan och alla profiler från spegeln
      const meta = await tx('readonly', s => s.get('meta'), 'backup');
      if (!meta?.users) return false;
      localStorage.setItem(USERS_KEY, meta.users);
      if (meta.active) localStorage.setItem(ACTIVE_KEY, meta.active);
      if (meta.shared) localStorage.setItem(SHARED_KEY, meta.shared);
      let n = 0;
      for (const u of users()) { const rec = await tx('readonly', s => s.get('state:' + u.id), 'backup'); if (rec?.json) { localStorage.setItem(stateKey(u.id), rec.json); n++; } }
      if (!n) { localStorage.removeItem(USERS_KEY); localStorage.removeItem(ACTIVE_KEY); return false; }
      load(); emit('restore'); return true;
    }
    const id = activeUserId();
    if (!id || localStorage.getItem(stateKey(id))) return false;
    const rec = await tx('readonly', s => s.get('state:' + id), 'backup');
    if (!rec?.json) return false;
    localStorage.setItem(stateKey(id), rec.json);
    load(); emit('restore'); return true;
  } catch { return false; }
}
export async function backupInfo() { try { const id = activeUserId() || 'legacy'; const rec = await tx('readonly', s => s.get('state:' + id), 'backup'); return rec ? { ts: rec.ts, bytes: rec.json.length } : null; } catch { return null; } }
function saveShared() { try { const ai = state.settings?.ai; if (ai && Object.values(ai.keys || {}).some(Boolean)) { const prev = JSON.parse(localStorage.getItem(SHARED_KEY) || '{}'); localStorage.setItem(SHARED_KEY, JSON.stringify({ ...prev, ai: { keys: ai.keys, available: ai.available, provider: ai.provider, textProvider: ai.textProvider, models: ai.models, mode: ai.mode } })); } } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(true); });
window.addEventListener('pagehide', () => save(true));

// ---- Profil & mål ----
export function setProfile(p) { state.profile = { ...(state.profile || {}), ...p }; commit('profile'); }
export function setTargets(t) { state.targets = { ...(state.targets || {}), ...t }; commit('targets'); }
export function setSetting(k, v) { state.settings[k] = v; commit('settings'); if (k === 'theme') { const id = activeUserId(); if (id) updateUser(id, { theme: v }); } }

// ---- Dagar & poster ----
export function day(key = todayKey()) {
  if (!state.days[key]) state.days[key] = { entries: [], water: 0, note: '' };
  return state.days[key];
}
export function addEntry(key, e) {
  const entry = { id: uid(), time: new Date().toISOString(), source: 'manual', ...e };
  entry.kcal = Math.round(entry.kcal || 0);
  for (const k of ['protein', 'carbs', 'fat']) entry[k] = Math.round((entry[k] || 0) * 10) / 10;
  day(key).entries.push(entry);
  commit('entries');
  return entry;
}
export function updateEntry(key, id, patch) {
  const d = day(key), i = d.entries.findIndex(x => x.id === id);
  if (i < 0) return null;
  d.entries[i] = { ...d.entries[i], ...patch };
  commit('entries');
  return d.entries[i];
}
export function removeEntry(key, id) {
  const d = day(key);
  const gone = d.entries.find(x => x.id === id);
  d.entries = d.entries.filter(x => x.id !== id);
  commit('entries');
  // Fotot raderas när ingen post längre pekar på det (annars växer IndexedDB i åratal)
  if (gone?.photoId && !Object.values(state.days).some(dd => dd.entries.some(e => e.photoId === gone.photoId)) && !state.aiQueue.some(q => q.photoId === gone.photoId)) deletePhoto(gone.photoId);
}
// Nycklar som kommer in (inbakade/hemserver) innan en profil finns: spara på enhetsnivå så att profilen som skapas sen ärver dem
export function mergeSharedKeys(keys) {
  try {
    const clean = Object.fromEntries(Object.entries(keys || {}).filter(([k, v]) => v && typeof v === 'string'));
    if (!Object.keys(clean).length) return false;
    const sh = JSON.parse(localStorage.getItem(SHARED_KEY) || '{}');
    sh.ai ||= { keys: {}, available: {}, provider: 'gemini', textProvider: 'auto', models: {}, mode: 'fast' };
    sh.ai.keys ||= {};
    let changed = false;
    for (const [k, v] of Object.entries(clean)) if (!(sh.ai.keys[k] || '').trim()) { sh.ai.keys[k] = v; changed = true; }
    if (changed) localStorage.setItem(SHARED_KEY, JSON.stringify(sh));
    return changed;
  } catch { return false; }
}
// Backup-koppling (GitHub) på enhetsnivå: båda profilerna på telefonen använder samma nyckel
export function sharedBackup() { try { return JSON.parse(localStorage.getItem(SHARED_KEY) || '{}').backup || null; } catch { return null; } }
export function mergeSharedBackup(cfg, { overwrite = false } = {}) {
  try {
    const sh = JSON.parse(localStorage.getItem(SHARED_KEY) || '{}');
    const cur = sh.backup || {};
    if (!overwrite && (cur.token || '').trim()) return false;
    sh.backup = { token: (cfg?.token || '').trim(), repo: (cfg?.repo || '').trim() };
    if (!sh.backup.token) delete sh.backup;
    localStorage.setItem(SHARED_KEY, JSON.stringify(sh));
    return true;
  } catch { return false; }
}
// Ta bort en nyckel även ur den delade kopian på enheten (annars återuppstår den vid nästa start)
export function clearSharedKey(provider) {
  try { const sh = JSON.parse(localStorage.getItem(SHARED_KEY) || '{}'); if (sh.ai?.keys) { delete sh.ai.keys[provider]; if (sh.ai.available) delete sh.ai.available[provider]; if (Object.values(sh.ai.keys).some(Boolean)) localStorage.setItem(SHARED_KEY, JSON.stringify(sh)); else localStorage.removeItem(SHARED_KEY); } } catch {}
}
export function dayTotals(key = todayKey()) {
  const d = state.days[key] || { entries: [] };
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, byMeal: {}, count: d.entries.length };
  for (const e of d.entries) {
    t.kcal += e.kcal || 0; t.protein += e.protein || 0; t.carbs += e.carbs || 0; t.fat += e.fat || 0;
    const m = t.byMeal[e.meal] || (t.byMeal[e.meal] = { kcal: 0, entries: [] });
    m.kcal += e.kcal || 0; m.entries.push(e);
  }
  return t;
}
export function setWater(key, n) { day(key).water = Math.max(0, n); commit('water'); }

// ---- Vikt ----
export function addWeight(kg, key = todayKey()) {
  state.weights = state.weights.filter(w => w.date !== key);
  state.weights.push({ date: key, kg: Math.round(kg * 10) / 10 });
  state.weights.sort((a, b) => a.date < b.date ? -1 : 1);
  if (state.profile) state.profile.weightKg = Math.round(kg * 10) / 10;
  commit('weight');
}
export function removeWeight(key) { state.weights = state.weights.filter(w => w.date !== key); commit('weight'); }
export const latestWeight = () => state.weights.length ? state.weights[state.weights.length - 1] : null;
export const firstWeight = () => state.weights.length ? state.weights[0] : null;

// ---- Favoriter, senaste, egna ----
export function toggleFavorite(food) {
  if (state.favorites[food.key]) delete state.favorites[food.key]; else state.favorites[food.key] = stripFood(food);
  commit('favorites');
  return !!state.favorites[food.key];
}
export const isFavorite = key => !!state.favorites[key];
export function pushRecent(food) {
  const f = stripFood(food);
  state.recents = [f, ...state.recents.filter(x => x.key !== f.key)].slice(0, 40);
  commit('recents');
}
function stripFood(f) { const { key, name, brand, per100, group, serving, image, lastGrams, quantity, quantityGrams, liquid, source } = f; return { key, name, brand, per100, group, serving, image, lastGrams, quantity, quantityGrams: quantityGrams || 0, liquid: !!liquid, source }; }
export function addCustomFood(food) {
  const f = { ...food, key: food.key || 'custom:' + uid() };
  state.customFoods = [f, ...state.customFoods.filter(x => x.key !== f.key)];
  commit('custom');
  return f;
}
export function removeCustomFood(key) { state.customFoods = state.customFoods.filter(x => x.key !== key); commit('custom'); }

// ---- Streak: dagar i rad med minst en post (räknat bakåt från idag eller igår) ----
export function streak() {
  let k = todayKey(), n = 0;
  if (!(state.days[k]?.entries.length)) k = addDays(k, -1);
  while (state.days[k]?.entries.length) { n++; k = addDays(k, -1); if (n > 3650) break; }
  return n;
}

// ---- AI-kö (foton som väntar på bryggan) ----
export function enqueueAnalysis(item) { state.aiQueue.push({ id: uid(), createdAt: new Date().toISOString(), ...item }); commit('queue'); }
export function dequeueAnalysis(id) { state.aiQueue = state.aiQueue.filter(q => q.id !== id); commit('queue'); }

// ---- Rättelseminne: när du ändrar portion eller matchning på en AI-identifierad rätt sparas det och används nästa gång ----
export const normKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9åäöéü ]/g, ' ').replace(/\s+/g, ' ').trim();
// Portionskalibrering: glidande medel av (det du faktiskt loggade) / (AI:ns gram) för lös mat – appen lär sig dina portioner
export function learnPortion(aiGrams, finalGrams) {
  if (!(aiGrams > 0) || !(finalGrams > 0)) return;
  const r = Math.min(2, Math.max(0.5, finalGrams / aiGrams));
  const c = state.calib || { n: 0, ratio: 1 };
  c.ratio = c.n ? c.ratio * 0.85 + r * 0.15 : r; c.n++; c.ts = new Date().toISOString();
  state.calib = c; commit('calib');
}
export function rememberCorrection(name, data) {
  const k = normKey(name); if (!k) return;
  state.corrections[k] = { ...(state.corrections[k] || {}), ...data, ts: new Date().toISOString() };
  commit('corrections');
}
export function getCorrection(name) {
  const k = normKey(name); if (!k) return null;
  if (state.corrections[k]) return state.corrections[k];
  // tolerant: alla ord i det kortare namnet finns i det längre
  const toks = k.split(' ');
  for (const [key, v] of Object.entries(state.corrections)) {
    const kt = key.split(' ');
    const [a, b] = kt.length <= toks.length ? [kt, toks] : [toks, kt];
    if (v.renameTo) continue;   // "det här var egentligen produkt X" gäller bara exakt samma benämning
    if (a.length >= 1 && a.every(t => b.includes(t))) return { ...v, grams: 0 };   // tolerant träff: matchning/storlek, men inte portionsgram
  }
  return null;
}
export function forgetCorrection(name) { delete state.corrections[normKey(name)]; commit('corrections'); }

// ---- Inköpslista ----
export function addShopping(items, recipe = '') {
  const have = new Set(state.shopping.filter(x => !x.done).map(x => normKey(x.text)));
  let n = 0;
  for (const text of items) { const t = String(text || '').trim(); if (!t || have.has(normKey(t))) continue; state.shopping.push({ id: uid(), text: t, recipe, done: false, ts: new Date().toISOString() }); have.add(normKey(t)); n++; }
  commit('shopping');
  return n;
}
export function toggleShopping(id) { const x = state.shopping.find(i => i.id === id); if (x) { x.done = !x.done; commit('shopping'); } }
export function removeShopping(id) { state.shopping = state.shopping.filter(i => i.id !== id); commit('shopping'); }
export function clearShoppingDone() { state.shopping = state.shopping.filter(i => !i.done); commit('shopping'); }
export function clearShopping() { state.shopping = []; commit('shopping'); }

// ---- Foton i IndexedDB ----
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open('tallrik', 2);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos'); if (!db.objectStoreNames.contains('backup')) db.createObjectStore('backup'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
async function tx(mode, fn, store = 'photos') {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}
const PHOTO_META = 'tallrik.photos';   // { id: tidsstämpel } på enhetsnivå – foton sparas i 3 dagar, sedan bara siffror
const photoMeta = () => { try { return JSON.parse(localStorage.getItem(PHOTO_META) || '{}'); } catch { return {}; } };
const setPhotoMeta = m => { try { localStorage.setItem(PHOTO_META, JSON.stringify(m)); } catch {} };
export async function savePhoto(id, blob) { try { await tx('readwrite', s => s.put(blob, id)); const m = photoMeta(); if (!m[id]) { m[id] = Date.now(); setPhotoMeta(m); } return true; } catch (e) { console.warn('foto sparades inte', e); return false; } }
// Foton äldre än 3 dagar raderas (telefonen ska inte fyllas) – posterna behåller namn, gram och näringsvärden
export async function prunePhotos(days = 3) {
  const cutoff = Date.now() - days * 86400000, meta = photoMeta();
  const queued = new Set(state.aiQueue.map(q => q.photoId));
  let changed = false, removed = 0;
  for (const [k, d] of Object.entries(state.days)) for (const e of d.entries || []) {
    if (!e.photoId || queued.has(e.photoId)) continue;
    const t = Date.parse(e.time || '') || Date.parse(k) || 0;
    if (t < cutoff) { deletePhoto(e.photoId); delete meta[e.photoId]; e.photoId = null; changed = true; removed++; }
    else if (!meta[e.photoId]) meta[e.photoId] = t;
  }
  // Föräldralösa foton (kastad analys, ångrad post) – bort när de är över ett dygn gamla; utan tidsstämpel räknas de som gamla
  try {
    const referenced = new Set();
    for (const u of users()) { try { const st = JSON.parse(localStorage.getItem(stateKey(u.id)) || 'null'); if (st) { for (const d of Object.values(st.days || {})) for (const e of d.entries || []) if (e.photoId) referenced.add(e.photoId); for (const q of st.aiQueue || []) referenced.add(q.photoId); } } catch {} }
    for (const e of Object.values(state.days).flatMap(d => d.entries || [])) if (e.photoId) referenced.add(e.photoId);
    const ids = await tx('readonly', s => s.getAllKeys());
    for (const id of ids || []) { if (referenced.has(id)) continue; const ts = meta[id] || 0; if (Date.now() - ts > 86400000) { deletePhoto(id); delete meta[id]; removed++; } }
  } catch {}
  setPhotoMeta(meta);
  if (changed) save();
  return removed;
}
export async function getPhoto(id) { try { return await tx('readonly', s => s.get(id)); } catch { return null; } }
export async function deletePhoto(id) { try { await tx('readwrite', s => s.delete(id)); const m = photoMeta(); if (m[id]) { delete m[id]; setPhotoMeta(m); } } catch {} }
const urlCache = new Map();
export async function photoURL(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await getPhoto(id);
  if (!b) return null;
  const u = URL.createObjectURL(b); urlCache.set(id, u); return u;
}
export function blobToDataURL(blob) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); }

// ---- Export / import / nollställning ----
export function exportJSON() {
  state.meta.lastExport = new Date().toISOString(); save(true);
  return JSON.stringify({ app: 'tallrik', exported: new Date().toISOString(), state }, null, 2);
}
export function storageInfo() { const bytes = (localStorage.getItem(KEY) || '').length; const daysLogged = Object.values(state.days || {}).filter(d => d.entries?.length).length; const entries = Object.values(state.days || {}).reduce((n, d) => n + (d.entries?.length || 0), 0); return { bytes, daysLogged, entries, first: Object.keys(state.days || {}).filter(k => state.days[k].entries?.length).sort()[0] || null }; }
export function importJSON(text) {
  const o = JSON.parse(text);
  const s = o.state || o;
  if (!s || typeof s !== 'object' || !('days' in s)) throw new Error('Filen ser inte ut som en Tallrik-export');
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, defaults(), s);
  state.settings = { theme: 'dark', haptics: true, ...(s.settings || {}) };
  state.meta = { installedAt: null, lastOpened: null, tips: {}, ...(s.meta || {}) };
  // Normalisera så att en redigerad/partiell fil aldrig kan få appen att krascha vid start
  for (const k of ['weights', 'recents', 'customFoods', 'aiQueue', 'shopping']) if (!Array.isArray(state[k])) state[k] = [];
  for (const k of ['favorites', 'corrections']) if (!state[k] || typeof state[k] !== 'object') state[k] = {};
  if (!state.days || typeof state.days !== 'object') state.days = {};
  for (const k of Object.keys(state.days)) { const d = state.days[k] || {}; state.days[k] = { entries: Array.isArray(d.entries) ? d.entries.filter(e => e && typeof e === 'object') : [], water: +d.water || 0, note: d.note || '' }; }
  const uid_ = activeUserId(); if (uid_) updateUser(uid_, { theme: state.settings.theme || 'dark' });
  save(true); emit('import');
}
export function resetAll() {
  const theme = users().find(u => u.id === activeUserId())?.theme || 'dark';   // utseendet hör till profilen, inte till datan
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, defaults(), { meta: { installedAt: new Date().toISOString(), tips: {} } });
  state.settings.theme = theme;
  save(true); emit('reset');
}
export { dateKey };

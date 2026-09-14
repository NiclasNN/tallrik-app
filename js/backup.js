// Automatisk säkerhetskopia till ett privat GitHub-repo (Contents API). Varje profil skriver sin egen fil,
// komprimerad (gzip) och base64-kodad. Kör några minuter efter ändringar och när appen läggs i bakgrunden.
// Åtkomstnyckeln (fine-grained PAT, bara Contents read/write på repot) sparas på enhetsnivå så båda profilerna använder den.
import { state, commit, subscribe, activeUser, importJSON, save, mergeSharedBackup, sharedBackup } from './store.js?v=202609141620';

const API = 'https://api.github.com';
export const DEFAULT_REPO = 'NiclasNN/tallrik-data';
const DEBOUNCE_MS = 3 * 60 * 1000, MIN_GAP_MS = 8 * 60 * 1000;
const DATA_EVENTS = new Set(['entries', 'weight', 'profile', 'targets', 'water', 'shopping', 'corrections', 'favorites', 'custom', 'recents', 'import', 'note', 'cache', 'queue']);

export function backupSettings() { if (!state.settings.backup) state.settings.backup = {}; return state.settings.backup; }
export function backupConfig() {
  const b = backupSettings(), sh = sharedBackup();
  const token = (b.token || sh?.token || '').trim(), repo = (b.repo || sh?.repo || DEFAULT_REPO).trim();
  return { token, repo, enabled: !!token && b.enabled !== false, lastSync: b.lastSync || null, lastError: b.lastError || null, file: fileName() };
}
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profil';
export const fileName = () => `backups/${slug(state.profile?.name || activeUser()?.name)}.json.gz`;

export function setBackupConfig({ token, repo = DEFAULT_REPO }) {
  const b = backupSettings();
  b.token = (token || '').trim(); b.repo = (repo || DEFAULT_REPO).trim(); b.enabled = !!b.token; b.lastError = null;
  mergeSharedBackup({ token: b.token, repo: b.repo }, { overwrite: true });
  commit('backup');
}
export function disconnectBackup() { const b = backupSettings(); b.token = ''; b.enabled = false; b.lastSha = null; mergeSharedBackup({ token: '', repo: '' }, { overwrite: true }); commit('backup'); }

const headers = token => ({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' });
function bufToB64(buf) { const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToBuf(b64) { const bin = atob(b64.replace(/\s/g, '')); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; }
async function gzip(text) { const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')); return new Response(stream).arrayBuffer(); }
async function gunzip(buf) { const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')); return new Response(stream).text(); }
const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

function explain(status, j) {
  const msg = j?.message || '';
  if (status === 401) return 'Åtkomstnyckeln godkänns inte – skapa en ny på GitHub och koppla igen.';
  if (status === 403 && /rate limit/i.test(msg)) return 'GitHub: för många anrop just nu, försöker igen senare.';
  if (status === 403) return 'Nyckeln saknar rättighet att skriva i repot (Contents: read & write).';
  if (status === 404) return 'Repot hittades inte – kontrollera namnet och att nyckeln har tillgång till det.';
  return `GitHub svarade ${status}${msg ? ': ' + msg.slice(0, 80) : ''}`;
}
async function gh(path, { method = 'GET', token, body = null } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(API + path, { method, headers: headers(token), body: body ? JSON.stringify(body) : null, signal: ctl.signal });
    let j = null; try { j = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, j };
  } finally { clearTimeout(t); }
}
async function currentSha(cfg) {
  const r = await gh(`/repos/${cfg.repo}/contents/${cfg.file}`, { token: cfg.token });
  return r.ok ? r.j?.sha || null : (r.status === 404 ? null : (() => { throw new Error(explain(r.status, r.j)); })());
}

let inflight = null, timer = null, dirty = false;
export async function backupNow({ force = false } = {}) {
  const cfg = backupConfig();
  if (!cfg.enabled) return { skipped: 'off' };
  if (!state.profile) return { skipped: 'no-profile' };
  if (!navigator.onLine) return { skipped: 'offline' };
  if (inflight) return inflight;
  if (!force && cfg.lastSync && Date.now() - Date.parse(cfg.lastSync) < MIN_GAP_MS && !dirty) return { skipped: 'fresh' };
  inflight = (async () => {
    const b = backupSettings();
    try {
      const text = JSON.stringify({ app: 'tallrik', exported: new Date().toISOString(), profile: state.profile?.name || '', state });
      const gz = canGzip();
      const content = gz ? bufToB64(await gzip(text)) : btoa(unescape(encodeURIComponent(text)));
      const file = gz ? cfg.file : cfg.file.replace(/\.gz$/, '');
      const put = async sha => gh(`/repos/${cfg.repo}/contents/${file}`, { method: 'PUT', token: cfg.token, body: { message: `Tallrik backup ${state.profile?.name || ''} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, content, ...(sha ? { sha } : {}) } });
      let r = await put(b.lastSha || null);
      if (!r.ok && (r.status === 409 || r.status === 422)) { const sha = await currentSha({ ...cfg, file }); r = await put(sha); }
      if (!r.ok) throw new Error(explain(r.status, r.j));
      b.lastSha = r.j?.content?.sha || null; b.lastSync = new Date().toISOString(); b.lastError = null; b.lastBytes = text.length;
      state.meta.lastBackup = b.lastSync;
      dirty = false; commit('backup');
      return { ok: true, bytes: text.length };
    } catch (e) {
      b.lastError = e.message || String(e); commit('backup');
      return { ok: false, error: b.lastError };
    } finally { inflight = null; }
  })();
  return inflight;
}
export function scheduleBackup() {
  if (!backupConfig().enabled) return;
  dirty = true; clearTimeout(timer);
  timer = setTimeout(() => backupNow().catch(() => {}), DEBOUNCE_MS);
}
export async function listBackups() {
  const cfg = backupConfig();
  if (!cfg.token) throw new Error('Ingen backup kopplad.');
  const r = await gh(`/repos/${cfg.repo}/contents/backups`, { token: cfg.token });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(explain(r.status, r.j));
  return (Array.isArray(r.j) ? r.j : []).filter(f => f.type === 'file').map(f => ({ name: f.name, path: f.path, size: f.size, sha: f.sha }));
}
export async function restoreBackup(entry) {
  const cfg = backupConfig();
  let r = await gh(`/repos/${cfg.repo}/contents/${entry.path}`, { token: cfg.token });
  if (!r.ok) throw new Error(explain(r.status, r.j));
  let b64 = r.j?.content && r.j?.encoding === 'base64' ? r.j.content : null;
  if (!b64) { const blob = await gh(`/repos/${cfg.repo}/git/blobs/${entry.sha}`, { token: cfg.token }); if (!blob.ok) throw new Error(explain(blob.status, blob.j)); b64 = blob.j.content; }
  const buf = b64ToBuf(b64);
  const text = /\.gz$/.test(entry.name) ? await gunzip(buf) : new TextDecoder().decode(buf);
  const keep = { token: cfg.token, repo: cfg.repo };
  importJSON(text);
  setBackupConfig(keep);   // kopplingen ska överleva återställningen
  return true;
}

// Kör automatiskt: några minuter efter ändringar, och när appen läggs i bakgrunden
subscribe(what => { if (DATA_EVENTS.has(what)) scheduleBackup(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) { clearTimeout(timer); backupNow().catch(() => {}); } });
export function backupOnStart() { const cfg = backupConfig(); if (cfg.enabled && (!cfg.lastSync || Date.now() - Date.parse(cfg.lastSync) > 24 * 3600 * 1000)) setTimeout(() => backupNow({ force: true }).catch(() => {}), 4000); }

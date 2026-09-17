// Tallrik – uppstart, router, flikar
import { state, load, subscribe, save, migrateLegacy, activeUser, needsPin, users, commit, restoreFromIDBIfEmpty, setSetting, createUser, setActiveUser, touchUnlock, mergeSharedBackup, prunePhotos } from './store.js?v=202609171301';
import * as Users from './ui/users.js?v=202609171301';
import { I } from './icons.js?v=202609171301';
import { esc, todayKey, closeAllSheets, debounce, guessMeal, setDocumentTheme, resolveTheme, IS_IOS, IS_STANDALONE, IS_LOCAL_HOST, PUBLIC_URL } from './components.js?v=202609171301';
import { loadDB } from './foods.js?v=202609171301';
import { processQueue, aiStatus, syncKeysWithHost, ensureModels, loadBundledKeys } from './ai.js?v=202609171301';
import { backupOnStart } from './backup.js?v=202609171301';
import * as Onboarding from './ui/onboarding.js?v=202609171301';
import * as Home from './ui/home.js?v=202609171301';
import * as Log from './ui/log.js?v=202609171301';
import * as Suggest from './ui/suggest.js?v=202609171301';
import * as Progress from './ui/progress.js?v=202609171301';
import * as Profile from './ui/profile.js?v=202609171301';

const TABS = [
  { id: 'today', name: 'Idag', icon: I.today, view: Home },
  { id: 'progress', name: 'Framsteg', icon: I.progress, view: Progress },
  { id: 'suggest', name: 'Förslag', icon: I.suggest, view: Suggest },
  { id: 'profile', name: 'Profil', icon: I.profile, view: Profile },
];
const root = document.getElementById('app');
let current = null;

export function applyTheme() { setDocumentTheme(resolveTheme(state.settings.theme)); }
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

function tabFromHash() {
  const h = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
  return TABS.find(t => t.id === h)?.id || 'today';
}
export function navigate(tab) { if (tabFromHash() !== tab) location.hash = '#/' + tab; else render(); }

let unlocked = false;
export function showUsers() { unlocked = false; current = 'users'; root.innerHTML = ''; Users.render(root, { onEnter: (id, opts = {}) => { unlocked = true; load(); Home.setDate(todayKey()); Progress.resetView?.(); Suggest.resetView?.(); loadBundledKeys().catch(() => {}); const u = activeUser(); if (opts.theme) setSetting('theme', opts.theme); else if (u?.theme && u.theme !== state.settings.theme) setSetting('theme', u.theme); applyTheme(); render(); } }); }
function render() {
  if (current === 'gate') return;
  if (current === 'users' && !unlocked) return;   // bakåtknapp/hashändring på "Vem är du?" ska inte hoppa förbi PIN
  closeAllSheets();
  const u = activeUser();
  if (!u || (!unlocked && needsPin(u))) return showUsers();
  unlocked = true;
  const onboarded = !!(state.profile && state.targets);
  if (!onboarded) {
    current = 'onboarding';
    root.innerHTML = '';
    Onboarding.render(root, { onDone: () => { location.hash = '#/today'; render(); } });
    return;
  }
  const tab = tabFromHash();
  current = tab;
  root.innerHTML = `<div id="view"></div>
    <nav class="tabbar" role="tablist">
      ${TABS.slice(0, 2).map(t => tabBtn(t, tab)).join('')}
      <button class="tab-fab" id="fab" aria-label="Fota maten">${I.plus}</button>
      ${TABS.slice(2).map(t => tabBtn(t, tab)).join('')}
    </nav>`;
  root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.tab)));
  // Stora plusknappen = kameran direkt. Plusknappen vid en måltid öppnar arket med alla alternativ.
  root.querySelector('#fab').addEventListener('click', () => Log.startPhotoFlow(guessMeal(), Home.currentDate(), { capture: true }));
  const view = TABS.find(t => t.id === tab).view;
  view.render(root.querySelector('#view'));
  window.scrollTo(0, 0);
}
const tabBtn = (t, active) => `<button class="tab ${t.id === active ? 'active' : ''}" data-tab="${t.id}" role="tab">${t.icon}<span>${esc(t.name)}</span></button>`;

// Rita om aktuell vy när data ändras (sheets ligger i eget lager och påverkas inte)
const rerender = debounce(() => {
  if (current === 'onboarding') return;
  const v = root.querySelector('#view');
  if (!v) return;
  const y = window.scrollY;
  TABS.find(t => t.id === current)?.view.render(v);
  window.scrollTo(0, y);
}, 60);
subscribe(what => { if (what === 'settings') { const before = document.documentElement.dataset.theme; applyTheme(); if (before !== document.documentElement.dataset.theme && current !== 'profile') rerender(); } if (what !== 'settings' || current === 'profile') rerender(); });

window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (Home.dateChanged?.()) rerender();
    const ks = state.settings?.ai?.keys || {}; if (!(ks.gemini || '').trim() || !(ks.groq || '').trim()) loadBundledKeys().catch(() => {});
    prunePhotos().catch(() => {});
    processQueue();
  }
});
window.addEventListener('online', () => processQueue());

// Installationsguide: iPhone/iPad i Safari som inte kör som hemskärmsapp
// Installationssteg för iPhone i Safari: visa hur man lägger till på hemskärmen innan man börjar
function installGate() {
  current = 'gate';
  const cute = document.documentElement.dataset.cute === '1';
  const hello = inviteName ? `Hej ${esc(inviteName)}! ${cute ? '🐱 ' : ''}Det här blir din egen Tallrik.` : 'Tallrik är gjord för att köras som app på hemskärmen.';
  root.innerHTML = `<div class="ob"><div class="ob-splash" style="justify-content:flex-start;padding-top:6vh">
      <img class="logo-ring" src="icons/icon-512${cute ? '-malin' : ''}.png" alt="" style="width:96px;height:96px;border-radius:26px">
      <div class="brand" style="font-size:30px">Lägg till på hemskärmen</div>
      <p class="brand-sub">${hello} Gör så här först – det tar tio sekunder:</p>
      <div class="card mt-3" style="width:100%;text-align:left">
        <div class="row" style="gap:14px;align-items:flex-start"><div class="avatar" style="flex:0 0 auto;width:36px;height:36px;font-size:15px">1</div><div><div class="h3">Tryck på Dela-knappen</div><div class="small muted">Ikonen <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-3px"><path d="M12 16V4M7 9l5-5 5 5M5 14v6h14v-6"/></svg> längst ner i Safari (på iPad högst upp).</div></div></div>
        <div class="row mt-3" style="gap:14px;align-items:flex-start"><div class="avatar" style="flex:0 0 auto;width:36px;height:36px;font-size:15px">2</div><div><div class="h3">Välj ”Lägg till på hemskärmen”</div><div class="small muted">Skrolla lite i listan om du inte ser den. Tryck sedan <b>Lägg till</b>.</div></div></div>
        <div class="row mt-3" style="gap:14px;align-items:flex-start"><div class="avatar" style="flex:0 0 auto;width:36px;height:36px;font-size:15px">3</div><div><div class="h3">Öppna Tallrik från hemskärmen</div><div class="small muted">Där ${inviteName ? 'finns din profil klar och' : ''} sparas allt du loggar. Den här Safari-fliken kan du stänga.</div></div></div>
      </div>
      <button class="btn quiet block mt-3" id="gate-skip">Fortsätt i Safari istället</button>
      <p class="small faint" style="max-width:32ch">I Safari sparas inget till hemskärms-appen, så det här steget gör att du slipper börja om.</p>
    </div></div>`;
  root.querySelector('#gate-skip').onclick = () => { localStorage.setItem('tallrik.skipInstallGate', '1'); location.replace(location.pathname + location.search + location.hash); };
}
function installHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (!ios || standalone || localStorage.getItem('tallrik.installHintDismissed')) return;
  const el = document.createElement('div');
  el.className = 'install-hint';
  el.innerHTML = `<img src="icons/icon-192.png" alt=""><div class="grow"><div class="t">Installera Tallrik som app</div><div class="d">Tryck <b>Dela</b> <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:-2px"><path d="M12 16V4M7 9l5-5 5 5M5 14v6h14v-6"/></svg> i Safari och välj <b>Lägg till på hemskärmen</b>. Då öppnas den i helskärm som en riktig app.</div></div><button class="icon-btn round" aria-label="Stäng">${I.close}</button>`;
  el.querySelector('button').onclick = () => { localStorage.setItem('tallrik.installHintDismissed', '1'); el.remove(); };
  document.body.appendChild(el);
}
// Uppstart
migrateLegacy();
// Nyckellänk från partnern: ?keys=tallrik1:… → samma Gemini/Groq-nycklar på den här telefonen
const shareKeys = keys => { if (keys && Object.keys(keys).length) localStorage.setItem('tallrik.shared', JSON.stringify({ ai: { keys, provider: keys.gemini ? 'gemini' : 'groq', textProvider: 'auto', available: {}, models: {}, mode: 'fast' } })); };
let invited = null, inviteName = '';
const Q = new URL(location.href).searchParams;
// iPhone i Safari (inte installerad): den installerade appen får EGEN lagring på iOS, så allt man gör i Safari-fliken följer
// inte med till hemskärmen. Därför visas ett installationssteg först – och inbjudningslänken lämnas kvar i adressen så att
// "Lägg till på hemskärmen" tar med den (appen öppnas då med samma länk och skapar profilen där).
const inSafariOnIOS = (IS_IOS && !IS_STANDALONE) || Q.get('gate') === '1';
const gateNeeded = inSafariOnIOS && !localStorage.getItem('tallrik.skipInstallGate') && (Q.has('invite') || !users().some(u => localStorage.getItem('tallrik.state.' + u.id)));
try {
  const inv = Q.get('invite');
  if (inv && inv.startsWith('tallrik2:')) { try { inviteName = String(JSON.parse(decodeURIComponent(escape(atob(inv.slice(9))))).name || 'Malin').trim(); } catch {} }
  if (!gateNeeded) {
    const k = Q.get('keys');
    if (k && k.startsWith('tallrik1:')) { shareKeys(JSON.parse(atob(k.slice(9)))); history.replaceState(null, '', location.pathname + location.hash); }
    // Inbjudningslänk: ?invite=tallrik2:… → egen profil (namn, PIN, utseende) + nycklarna. Hon ser bara sin egen app.
    if (inv && inv.startsWith('tallrik2:')) {
      const done = localStorage.getItem('tallrik.inviteDone');
      if (done !== inv) {
        const d = JSON.parse(decodeURIComponent(escape(atob(inv.slice(9)))));
        shareKeys(d.keys);
        if (d.backup?.token) mergeSharedBackup(d.backup, { overwrite: true });   // automatisk backup följer med i inbjudan
        const name = String(d.name || 'Malin').trim();
        const existing = users().find(u => u.name.toLowerCase() === name.toLowerCase());
        const u = existing || createUser(name, d.pin || '0000', d.theme || 'malin');
        setActiveUser(u.id); touchUnlock(u.id);
        invited = { theme: existing ? null : (d.theme || 'malin'), name, isNew: !existing };
        localStorage.setItem('tallrik.inviteDone', inv);
      }
      if (!inSafariOnIOS) history.replaceState(null, '', location.pathname + location.hash);
    }
  }
} catch {}
load();
if (invited) { unlocked = true; if (invited.theme) setSetting('theme', invited.theme); }
applyTheme();
try { if (gateNeeded) installGate(); else render(); } catch (e) { console.error('Startfel', e); bootError(e); }
if (invited) setTimeout(() => import('./components.js?v=202609171301').then(m => m.toast(invited.isNew ? `Välkommen ${invited.name}! Det här är din egen Tallrik` : `Välkommen tillbaka, ${invited.name}`, 'good', 4000)), 600);
restoreFromIDBIfEmpty().then(ok => { if (ok) { current = null; unlocked = true; applyTheme(); render(); toastKeys('Din data återställdes från säkerhetskopian på enheten'); } }).catch(() => {});
setTimeout(() => { const b = document.getElementById('boot'); b.classList.add('out'); setTimeout(() => b.remove(), 400); installHint(); }, 250);
loadDB().catch(() => {});
Promise.allSettled([loadBundledKeys(), syncKeysWithHost()]).then(([b, s]) => { if (s.value) toastKeys(); for (const p of ['gemini', 'groq', 'openrouter']) ensureModels(p).catch(() => {}); });
setTimeout(processQueue, 2500);
setTimeout(() => { prunePhotos().catch(() => {}); backupOnStart(); }, 6000);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
function toastKeys(msg = 'AI-nycklar hämtade från din andra enhet') { import('./components.js?v=202609171301').then(m => m.toast(msg, 'good')); }
// Om något går sönder vid start får man aldrig en evig startskärm – utan en väg vidare
function bootError(e) {
  current = 'error';
  root.innerHTML = `<div class="ob"><div class="ob-splash" style="justify-content:flex-start;padding-top:10vh">
      <div style="font-size:48px">🙈</div><div class="brand" style="font-size:28px">Något gick fel vid start</div>
      <p class="brand-sub">Det är inte ditt fel. Prova att starta om – om det inte hjälper kan du byta profil eller nollställa den här profilen (dina andra profiler påverkas inte).</p>
      <div class="card small muted" style="width:100%;text-align:left;word-break:break-word">${esc(String(e?.message || e)).slice(0, 300)}</div>
      <button class="btn primary block mt-3" id="err-reload">Starta om</button>
      <button class="btn block mt-1" id="err-users">Byt profil</button>
      <button class="btn quiet block mt-1" id="err-reset">Nollställ den här profilen</button>
    </div></div>`;
  root.querySelector('#err-reload').onclick = () => location.reload();
  root.querySelector('#err-users').onclick = () => { current = null; showUsers(); };
  root.querySelector('#err-reset').onclick = () => { if (confirm('Nollställa den här profilen? All dess historik raderas.')) { import('./store.js?v=202609171301').then(m => { m.resetAll(); location.reload(); }); } };
}
// Gör moduler nåbara för felsökning i Safari Web Inspector
window.Tallrik = { state, save, navigate, Log, aiStatus, showUsers };

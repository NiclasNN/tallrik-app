// Användare: välj person, PIN (ibland), ny användare. Varje person har egen data på enheten.
import { users, activeUserId, setActiveUser, createUser, checkPin, touchUnlock, needsPin } from '../store.js?v=202609171301';
import { esc, haptic, initials, toast, themePicker, bindThemePicker, setDocumentTheme, resolveTheme } from '../components.js?v=202609171301';
import { I } from '../icons.js?v=202609171301';

let root, onEnter, view = 'list', pickedId = null, entered = '';

export function render(container, { onEnter: cb, force = false }) {
  root = container; onEnter = cb; view = 'list'; pickedId = null; entered = '';
  const list = users();
  if (!list.length) { view = 'new'; }
  draw();
}
function draw() {
  const list = users();
  if (view === 'new') return drawNew(list.length === 0);
  if (view === 'pin') return drawPin();
  root.innerHTML = `<div class="ob"><div class="ob-splash" style="justify-content:flex-start;padding-top:8vh">
      <img class="logo-ring" src="icons/icon-512${document.documentElement.dataset.cute ? '-malin' : ''}.png" alt="" style="width:84px;height:84px;border-radius:22px">
      <div class="brand" style="font-size:30px">Vem är du?</div>
      <p class="brand-sub">Välj din profil. Allt du loggar sparas på din egen profil.</p>
      <div class="choice-list mt-3" style="width:100%">${list.map(u => `<button class="choice" data-u="${esc(u.id)}"><div class="avatar ${/^malin/.test(u.theme || '') ? 'emoji' : ''}" style="flex:0 0 auto;${/^malin/.test(u.theme || '') ? 'background:linear-gradient(135deg,#FF6FA5,#FFA1C9);font-size:22px' : ''}">${/^malin/.test(u.theme || '') ? '🐱' : esc(initials(u.name))}</div><div class="grow" style="text-align:left"><div class="t">${esc(u.name)}</div><div class="d">${u.id === activeUserId() ? 'Senast inloggad' : 'Tryck för att logga in'}${needsPin(u) ? ' · PIN' : ''}</div></div>${I.chevR.replace('<svg', '<svg class="chev"')}</button>`).join('')}</div>
      <button class="btn block mt-3" id="u-new">${I.plus} Ny användare</button>
    </div></div>`;
  root.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { haptic(); const u = list.find(x => x.id === b.dataset.u); pickedId = u.id; if (u.id === activeUserId() && !needsPin(u)) enter(u.id); else { entered = ''; view = 'pin'; draw(); } });
  root.querySelector('#u-new').onclick = () => { haptic(); view = 'new'; draw(); };
}
function enter(id, opts) { setActiveUser(id); touchUnlock(id); onEnter(id, opts); }
function drawPin() {
  const u = users().find(x => x.id === pickedId);
  root.innerHTML = `<div class="ob"><div class="ob-top"><button class="icon-btn round" id="u-back" aria-label="Tillbaka">${I.chevL}</button><div class="grow"></div><span style="width:42px"></span></div>
    <div class="ob-splash" style="justify-content:flex-start;padding-top:4vh">
      <div class="avatar lg" ${/^malin/.test(u.theme || '') ? 'style="background:linear-gradient(135deg,#FF6FA5,#FFA1C9);font-size:40px"' : ''}>${/^malin/.test(u.theme || '') ? '🐱' : esc(initials(u.name))}</div>
      <div class="h1 mt-2">${esc(u.name)}</div>
      <p class="brand-sub">Ange din PIN-kod</p>
      <div class="pin-dots mt-3" id="dots">${[0, 1, 2, 3].map(i => `<span class="${entered.length > i ? 'on' : ''}"></span>`).join('')}</div>
      <div class="small muted mt-2" id="pin-msg" style="min-height:20px"></div>
      <div class="small faint" style="max-width:30ch">Har ni inte ändrat den är PIN-koden 0000. Den går att ändra under Profil.</div>
      <div class="pinpad mt-3">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k === '' ? '<span></span>' : `<button data-k="${k}" ${k === '⌫' ? 'class="del"' : ''}>${k}</button>`).join('')}</div>
    </div></div>`;
  root.querySelector('#u-back').onclick = () => { view = 'list'; draw(); };
  root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    haptic();
    if (b.dataset.k === '⌫') entered = entered.slice(0, -1); else if (entered.length < 4) entered += b.dataset.k;
    root.querySelectorAll('#dots span').forEach((d, i) => d.classList.toggle('on', entered.length > i));
    if (entered.length === 4) {
      if (checkPin(u.id, entered)) { haptic('success'); enter(u.id); }
      else { const dots = root.querySelector('#dots'); dots.classList.add('shake'); root.querySelector('#pin-msg').textContent = 'Fel PIN – försök igen'; setTimeout(() => { dots.classList.remove('shake'); entered = ''; root.querySelectorAll('#dots span').forEach(d => d.classList.remove('on')); }, 500); }
    }
  });
}
function drawNew(first) {
  root.innerHTML = `<div class="ob"><div class="ob-top">${first ? '<span style="width:42px"></span>' : `<button class="icon-btn round" id="u-back" aria-label="Tillbaka">${I.chevL}</button>`}<div class="grow"></div><span style="width:42px"></span></div>
    <div class="ob-body">
      <h1 class="h1">${first ? 'Välkommen till Tallrik' : 'Ny användare'}</h1>
      <p class="lead">${first ? 'Skapa din profil. Allt du loggar sparas här på telefonen, på just din profil.' : 'Varje person får egen profil, egen plan och egen historik.'}</p>
      <div class="field"><label>Namn</label><input class="input big" id="u-name" placeholder="T.ex. Malin" maxlength="24" autocomplete="given-name"></div>
      <div class="field mt-3"><label>PIN-kod (4 siffror)</label><input class="input big" id="u-pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="0000"></div>
      <p class="small muted mt-2" style="margin-left:4px;line-height:1.5">PIN-koden frågas bara ibland (var tredje dag) och när man byter användare – annars öppnas appen direkt. Du kan ändra det under Profil.</p>
      <div class="field mt-3"><label>Utseende</label>${themePicker(document.documentElement.dataset.theme || 'dark')}<p class="small muted mt-1" style="margin-left:4px;line-height:1.5" id="theme-hint">Välj hur din Tallrik ska se ut – går att byta när som helst under Profil.</p></div>
    </div>
    <div class="ob-foot"><button class="btn primary block" id="u-create">Skapa profil</button></div></div>`;
  const prevTheme = document.documentElement.dataset.theme || 'dark';
  let pickedTheme = prevTheme;
  root.querySelector('#u-back')?.addEventListener('click', () => { setDocumentTheme(prevTheme); view = 'list'; draw(); });
  bindThemePicker(root, id => { pickedTheme = id; setDocumentTheme(resolveTheme(id)); root.querySelector('#theme-hint').textContent = id === 'malin-dark' ? 'Mjukt lila och rosa för kvällen, katter och gulliga figurer 🐱🌙' : /^malin/.test(id) ? 'Vitt och rosa, mjuka former, katter och gulliga figurer 🐱💕' : id === 'auto' ? 'Följer telefonens mörka/ljusa läge.' : 'Går att byta när som helst under Profil.'; });
  setTimeout(() => root.querySelector('#u-name').focus(), 300);
  root.querySelector('#u-create').onclick = () => {
    const name = root.querySelector('#u-name').value.trim(), pin = root.querySelector('#u-pin').value.replace(/\D/g, '');
    if (!name) { toast('Skriv ditt namn', 'bad'); return; }
    if (pin.length !== 4) { toast('PIN-koden ska vara 4 siffror', 'bad'); return; }
    const u = createUser(name, pin, pickedTheme); haptic('success'); enter(u.id, { theme: pickedTheme });
  };
}

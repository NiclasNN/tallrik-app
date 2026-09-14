// Onboarding: reder ut situation, mål, takt, aktivitet, kost och drivkraft → räknar fram planen.
import { state, setProfile, setTargets, addWeight, importJSON, activeUser, users, subscribe } from '../store.js?v=202609141620';
import { showUsers } from '../app.js?v=202609141620';
import { esc, fmt, kcal as fk, haptic, toast, fmtDateLong, countUp, animateIn, sleep } from '../components.js?v=202609141620';
import { ACTIVITY, GOALS, PACES, DIETS, AVOID, MOTIVATIONS, computeTargets, bmi, bmiLabel } from '../nutrition.js?v=202609141620';
import { I } from '../icons.js?v=202609141620';
import { PROVIDERS, addKey } from '../ai.js?v=202609141620';

const STEPS = ['splash', 'name', 'body', 'goal', 'target', 'activity', 'diet', 'meals', 'motivation', 'ai', 'calc', 'plan'];
let draft, step, root, onDone;

export function render(container, { onDone: done }) {
  root = container; onDone = done;
  const year = new Date().getFullYear();
  draft = { name: activeUser()?.name || '', sex: 'female', birthYear: year - 32, heightCm: 170, weightKg: 72, goal: 'lose', targetWeightKg: 65, paceKgPerWeek: 0.5, activity: 2, diet: 'omnivore', avoid: [], mealsPerDay: 4, motivation: [] };
  step = 0;
  show();
}
function go(n) { step = Math.max(0, Math.min(STEPS.length - 1, n)); show(); }
const hasKey = id => !!(state.settings.ai?.keys?.[id] || '').trim();
function next() {
  let n = step + 1;
  if (STEPS[n] === 'target' && draft.goal === 'maintain') n++;
  if (STEPS[n] === 'ai' && hasKey('gemini') && hasKey('groq')) n++;   // nycklarna följde med (inbjudan/delad enhet) → inget att göra
  go(n);
}
function back() {
  let n = step - 1;
  if (STEPS[n] === 'target' && draft.goal === 'maintain') n--;
  go(n);
}
function shell(inner, { progress = true, footer = '' } = {}) {
  const pct = Math.round((step / (STEPS.length - 2)) * 100);
  root.innerHTML = `<div class="ob">
    <div class="ob-top">
      ${step > 0 && STEPS[step] !== 'plan' && STEPS[step] !== 'calc' ? `<button class="icon-btn round" id="ob-back" aria-label="Tillbaka">${I.chevL}</button>` : '<span style="width:42px"></span>'}
      ${progress ? `<div class="ob-progress"><i style="width:${pct}%"></i></div>` : '<div class="grow"></div>'}
      <span style="width:42px"></span>
    </div>
    <div class="ob-body">${inner}</div>
    <div class="ob-foot">${footer}</div>
  </div>`;
  root.querySelector('#ob-back')?.addEventListener('click', () => { haptic(); back(); });
  window.scrollTo(0, 0);
}
const nextBtn = (label = 'Fortsätt', disabled = false) => `<button class="btn primary block" id="ob-next" ${disabled ? 'disabled' : ''}>${esc(label)}</button>`;
function bindNext(fn) { root.querySelector('#ob-next')?.addEventListener('click', () => { haptic(); (fn || next)(); }); }

function show() {
  const s = STEPS[step];
  if (s === 'splash') return splash();
  if (s === 'name') return nameStep();
  if (s === 'body') return bodyStep();
  if (s === 'goal') return goalStep();
  if (s === 'target') return targetStep();
  if (s === 'activity') return activityStep();
  if (s === 'diet') return dietStep();
  if (s === 'meals') return mealsStep();
  if (s === 'motivation') return motivationStep();
  if (s === 'ai') return aiStep();
  if (s === 'calc') return calcStep();
  if (s === 'plan') return planStep();
}

function splash() {
  shell(`<div class="ob-splash">
      <img class="logo-ring" src="icons/icon-512${document.documentElement.dataset.cute ? '-malin' : ''}.png" alt="">
      <div class="brand">Tallrik</div>
      <p class="brand-sub">Fota maten. Få exakta kalorier. Följ en plan som anpassar sig efter dig.</p>
      <div class="ob-badges">
        <span class="pill">📸 Fotoigenkänning</span><span class="pill">🇸🇪 Livsmedelsverkets data</span><span class="pill">📈 Adaptiv plan</span>
      </div>
    </div>`, { progress: false, footer: `${nextBtn('Kom igång')}<button class="btn quiet block" id="ob-import">Har du en säkerhetskopia? Importera</button>${users().length > 1 ? `<button class="btn quiet block" id="ob-switch">Inte ${esc(activeUser()?.name || 'du')}? Byt profil</button>` : ''}` });
  bindNext();
  root.querySelector('#ob-switch')?.addEventListener('click', () => { haptic(); showUsers(); });
  root.querySelector('#ob-import').addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = async () => { try { importJSON(await inp.files[0].text()); toast('Data importerad', 'good'); onDone(); } catch (e) { toast(e.message, 'bad'); } };
    inp.click();
  });
}
function nameStep() {
  shell(`<h1 class="h1">Vad får vi kalla dig?</h1><p class="lead">Tallrik blir personlig från första dagen.</p>
    <div class="field"><input class="input big" id="ob-name" placeholder="Ditt namn" autocomplete="given-name" value="${esc(draft.name)}" maxlength="24"></div>`,
    { footer: nextBtn('Fortsätt', !draft.name.trim()) });
  const inp = root.querySelector('#ob-name');
  inp.addEventListener('input', () => { draft.name = inp.value; root.querySelector('#ob-next').disabled = !draft.name.trim(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && draft.name.trim()) next(); });
  setTimeout(() => inp.focus(), 350);
  bindNext();
}
function bodyStep() {
  shell(`<h1 class="h1">Berätta lite om dig</h1><p class="lead">Behövs för att räkna ut din energiförbrukning. Formeln (Mifflin-St Jeor) använder biologiskt kön.</p>
    <div class="seg" id="ob-sex">
      <button data-v="female" class="${draft.sex === 'female' ? 'active' : ''}">Kvinna</button>
      <button data-v="male" class="${draft.sex === 'male' ? 'active' : ''}">Man</button>
    </div>
    <div class="field mt-3"><label>Födelseår</label><input class="input" id="ob-year" type="number" inputmode="numeric" min="1920" max="${new Date().getFullYear() - 13}" value="${draft.birthYear}"></div>
    <div class="slider-block mt-3">
      <div class="eyebrow">Längd</div>
      <div class="val"><span id="v-h">${draft.heightCm}</span><small>cm</small></div>
      <input type="range" id="r-h" min="140" max="210" step="1" value="${draft.heightCm}">
      <div class="range-ticks"><span>140</span><span>175</span><span>210</span></div>
    </div>
    <div class="slider-block mt-2">
      <div class="eyebrow">Nuvarande vikt</div>
      <div class="val"><span id="v-w">${fmt(draft.weightKg, 1)}</span><small>kg</small></div>
      <input type="range" id="r-w" min="40" max="180" step="0.5" value="${draft.weightKg}">
      <div class="range-ticks"><span>40</span><span>110</span><span>180</span></div>
    </div>`, { footer: nextBtn() });
  root.querySelectorAll('#ob-sex button').forEach(b => b.addEventListener('click', () => { draft.sex = b.dataset.v; root.querySelectorAll('#ob-sex button').forEach(x => x.classList.toggle('active', x === b)); haptic(); }));
  root.querySelector('#ob-year').addEventListener('input', e => { const v = +e.target.value; const maxY = new Date().getFullYear() - 10; if (v > 1900 && v <= maxY) draft.birthYear = v; e.target.style.borderColor = String(e.target.value).length === 4 && (v <= 1900 || v > maxY) ? 'var(--bad)' : ''; });
  root.querySelector('#r-h').addEventListener('input', e => { draft.heightCm = +e.target.value; root.querySelector('#v-h').textContent = draft.heightCm; });
  root.querySelector('#r-w').addEventListener('input', e => { draft.weightKg = +e.target.value; root.querySelector('#v-w').textContent = fmt(draft.weightKg, 1); if (draft.goal === 'lose' && draft.targetWeightKg >= draft.weightKg) draft.targetWeightKg = Math.round(draft.weightKg * 0.92); });
  bindNext();
}
function goalStep() {
  shell(`<h1 class="h1">Vad vill du uppnå?</h1><p class="lead">Planen byggs kring ditt mål – och justeras när kroppen svarar.</p>
    <div class="choice-list">${GOALS.map(g => `<button class="choice ${draft.goal === g.id ? 'active' : ''}" data-v="${g.id}"><div class="ic">${g.icon}</div><div><div class="t">${esc(g.t)}</div><div class="d">${esc(g.d)}</div></div><div class="check"></div></button>`).join('')}</div>`,
    { footer: nextBtn() });
  root.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => {
    draft.goal = b.dataset.v; haptic();
    if (draft.goal === 'lose') { draft.paceKgPerWeek = 0.5; if (draft.targetWeightKg >= draft.weightKg) draft.targetWeightKg = Math.round(draft.weightKg * 0.92); }
    if (draft.goal === 'gain') { draft.paceKgPerWeek = 0.3; if (draft.targetWeightKg <= draft.weightKg) draft.targetWeightKg = Math.round(draft.weightKg * 1.06); }
    if (draft.goal === 'maintain') { draft.targetWeightKg = draft.weightKg; draft.paceKgPerWeek = 0; }
    root.querySelectorAll('.choice').forEach(x => x.classList.toggle('active', x === b));
  }));
  bindNext();
}
function targetStep() {
  const lose = draft.goal === 'lose';
  const min = lose ? Math.max(40, Math.round(draft.weightKg * 0.7)) : Math.round(draft.weightKg + 0.5);
  const max = lose ? Math.round(draft.weightKg - 0.5) : Math.min(180, Math.round(draft.weightKg * 1.25));
  draft.targetWeightKg = Math.min(max, Math.max(min, draft.targetWeightKg));
  const paces = PACES[draft.goal];
  const est = () => { const t = computeTargets(draft); return t.goalDate ? `Beräknat klart ${fmtDateLong(t.goalDate)} · ${Math.round(t.weeks)} veckor` : ''; };
  shell(`<h1 class="h1">${lose ? 'Din målvikt' : 'Vart vill du?'}</h1><p class="lead">${lose ? 'Sätt ett mål som känns motiverande – du kan ändra det när som helst.' : 'Ett måttligt överskott ger mest muskler och minst fett.'}</p>
    <div class="slider-block">
      <div class="val"><span id="v-t">${fmt(draft.targetWeightKg, 1)}</span><small>kg</small></div>
      <input type="range" id="r-t" min="${min}" max="${max}" step="0.5" value="${draft.targetWeightKg}">
      <div class="range-ticks"><span>${min}</span><span>${max}</span></div>
      <div class="small muted mt-1" id="v-diff">${lose ? '−' : '+'}${fmt(Math.abs(draft.weightKg - draft.targetWeightKg), 1)} kg från idag</div>
    </div>
    <div class="eyebrow mt-3" style="margin-bottom:10px">Takt</div>
    <div class="choice-list">${paces.map(p => `<button class="choice ${draft.paceKgPerWeek === p.kg ? 'active' : ''}" data-v="${p.kg}"><div><div class="t">${esc(p.t)}</div><div class="d">${esc(p.d)}</div></div><div class="check"></div></button>`).join('')}</div>
    <div class="notice mt-3" id="v-est">${est()}</div>`, { footer: nextBtn() });
  root.querySelector('#r-t').addEventListener('input', e => { draft.targetWeightKg = +e.target.value; root.querySelector('#v-t').textContent = fmt(draft.targetWeightKg, 1); root.querySelector('#v-diff').textContent = `${lose ? '−' : '+'}${fmt(Math.abs(draft.weightKg - draft.targetWeightKg), 1)} kg från idag`; root.querySelector('#v-est').textContent = est(); });
  root.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => { draft.paceKgPerWeek = +b.dataset.v; haptic(); root.querySelectorAll('.choice').forEach(x => x.classList.toggle('active', x === b)); root.querySelector('#v-est').textContent = est(); }));
  bindNext();
}
function activityStep() {
  shell(`<h1 class="h1">Hur aktiv är du?</h1><p class="lead">Räkna in både jobb och träning under en vanlig vecka.</p>
    <div class="choice-list">${ACTIVITY.map(a => `<button class="choice ${draft.activity === a.id ? 'active' : ''}" data-v="${a.id}"><div class="ic">${a.icon}</div><div><div class="t">${esc(a.t)}</div><div class="d">${esc(a.d)}</div></div><div class="check"></div></button>`).join('')}</div>`, { footer: nextBtn() });
  root.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => { draft.activity = +b.dataset.v; haptic(); root.querySelectorAll('.choice').forEach(x => x.classList.toggle('active', x === b)); }));
  bindNext();
}
function dietStep() {
  shell(`<h1 class="h1">Hur äter du?</h1><p class="lead">Styr förslagen och hur AI:n tolkar dina bilder.</p>
    <div class="chips" id="ob-diet">${DIETS.map(d => `<button class="chip ${draft.diet === d.id ? 'active' : ''}" data-v="${d.id}">${d.icon} ${esc(d.t)}</button>`).join('')}</div>
    <div class="eyebrow mt-4" style="margin-bottom:10px">Undviker du något?</div>
    <div class="chips" id="ob-avoid">${AVOID.map(a => `<button class="chip ${draft.avoid.includes(a) ? 'active' : ''}" data-v="${a}">${esc(a)}</button>`).join('')}</div>`, { footer: nextBtn() });
  root.querySelectorAll('#ob-diet .chip').forEach(b => b.addEventListener('click', () => { draft.diet = b.dataset.v; haptic(); root.querySelectorAll('#ob-diet .chip').forEach(x => x.classList.toggle('active', x === b)); }));
  root.querySelectorAll('#ob-avoid .chip').forEach(b => b.addEventListener('click', () => { const v = b.dataset.v; draft.avoid = draft.avoid.includes(v) ? draft.avoid.filter(x => x !== v) : [...draft.avoid, v]; b.classList.toggle('active'); haptic(); }));
  bindNext();
}
function mealsStep() {
  const opts = [{ v: 3, t: 'Tre måltider', d: 'Frukost, lunch och middag', icon: '🍽️' }, { v: 4, t: 'Tre plus mellanmål', d: 'Vanligast – ett mellanmål håller energin jämn', icon: '🍎' }, { v: 5, t: 'Många små', d: 'Fem eller fler tillfällen, t.ex. vid träning', icon: '⏱️' }, { v: 2, t: 'Periodisk fasta', d: 'Två större måltider inom ett ätfönster', icon: '🌙' }];
  shell(`<h1 class="h1">Hur ser en dag ut?</h1><p class="lead">Vi fördelar kalorierna över dina måltider.</p>
    <div class="choice-list">${opts.map(o => `<button class="choice ${draft.mealsPerDay === o.v ? 'active' : ''}" data-v="${o.v}"><div class="ic">${o.icon}</div><div><div class="t">${esc(o.t)}</div><div class="d">${esc(o.d)}</div></div><div class="check"></div></button>`).join('')}</div>`, { footer: nextBtn() });
  root.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => { draft.mealsPerDay = +b.dataset.v; haptic(); root.querySelectorAll('.choice').forEach(x => x.classList.toggle('active', x === b)); }));
  bindNext();
}
function motivationStep() {
  shell(`<h1 class="h1">Vad driver dig?</h1><p class="lead">Välj det som betyder mest. Vi påminner dig om varför när det är tungt.</p>
    <div class="chips">${MOTIVATIONS.map(m => `<button class="chip ${draft.motivation.includes(m.id) ? 'active' : ''}" data-v="${m.id}" style="padding:12px 16px;font-size:15px">${m.icon} ${esc(m.t)}</button>`).join('')}</div>`, { footer: nextBtn() });
  root.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { const v = b.dataset.v; draft.motivation = draft.motivation.includes(v) ? draft.motivation.filter(x => x !== v) : [...draft.motivation, v]; b.classList.toggle('active'); haptic(); }));
  bindNext();
}
let aiWatch = null;
function aiStep() {
  const g = PROVIDERS.gemini, q = PROVIDERS.groq;
  // Kommer nycklarna in (inbakade/hemserver) medan steget visas: hoppa vidare eller visa "inlagd ✓"
  if (aiWatch) aiWatch();
  aiWatch = subscribe(w => { if (w !== 'keys' || STEPS[step] !== 'ai') return; aiWatch(); aiWatch = null; if (hasKey('gemini') && hasKey('groq')) next(); else show(); });
  const block = (pr, role, hint) => `<div class="card mt-2" data-kp="${pr.id}">
      <div class="row between"><div><div class="h3">${esc(role)}</div><div class="small muted">${esc(pr.name)} · gratis, inget kort</div></div><span class="tag ${hasKey(pr.id) ? 'good' : ''}" data-status="${pr.id}">${hasKey(pr.id) ? 'inlagd ✓' : 'ej inlagd'}</span></div>
      ${hasKey(pr.id) ? `<div class="small muted mt-1">Nyckeln finns redan – klart.</div>` : `<div class="small muted mt-1" style="line-height:1.45">${esc(hint)}</div>
      <a class="btn block sm mt-2" href="${pr.keyUrl}" target="_blank" rel="noopener">Skapa nyckel hos ${esc(pr.name)} ${I.chevR}</a>
      <div class="row mt-2" style="gap:8px"><input class="input grow" data-key="${pr.id}" placeholder="${esc(pr.keyHint)}" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" data-save="${pr.id}" style="min-height:54px;padding:0 16px">Spara</button></div>
      <div class="small muted mt-1" data-msg="${pr.id}" style="margin-left:4px"></div>`}
    </div>`;
  shell(`<h1 class="h1">Koppla på AI:n</h1>
    <p class="lead">${hasKey('gemini') || hasKey('groq') ? 'En nyckel finns redan. Den andra tar en minut – eller lägg in den senare under Profil.' : 'Två gratisnycklar, en minut var. Nycklarna sparas bara på din telefon. Du kan lägga in dem senare under Profil.'}</p>
    ${block(g, '📸 Fotoanalys', 'Läser tallrikar och förpackningar. Logga in med Google-kontot → "Create API key" → kopiera.')}
    ${block(q, '🍽️ Recept, förslag & coach', 'Skapar nya recept åt dig hela tiden och svarar på frågor. Skapa konto → API Keys → Create → kopiera.')}`,
    { footer: `${nextBtn('Fortsätt')}` });
  bindNext();
  root.querySelectorAll('[data-save]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.save, key = root.querySelector(`[data-key="${id}"]`).value.trim(), msg = root.querySelector(`[data-msg="${id}"]`), st = root.querySelector(`[data-status="${id}"]`);
    if (!key) { msg.textContent = 'Klistra in nyckeln först.'; return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const r = await addKey(key, id);
      if (r.provider !== id) msg.innerHTML = `<span style="color:var(--accent-2)">Det här var en ${esc(PROVIDERS[r.provider].name)}-nyckel – sparad på rätt plats.</span>`;
      else msg.innerHTML = `<span style="color:var(--good)">✓ Fungerar (${r.models.length} modeller)</span>`;
      const s2 = root.querySelector(`[data-status="${r.provider}"]`); if (s2) { s2.textContent = 'inlagd ✓'; s2.className = 'tag good'; }
      btn.textContent = 'Sparad'; haptic('success');
    } catch (e) { msg.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; btn.disabled = false; btn.textContent = 'Spara'; }
  }));
}
async function calcStep() {
  const steps = ['Beräknar din basförbrukning', 'Räknar in din aktivitetsnivå', 'Sätter kaloriunderskott och makron', 'Bygger din personliga plan'];
  shell(`<div style="padding-top:40px" class="center"><div class="spinner" style="width:44px;height:44px;border-width:4px;margin:0 auto 22px"></div><h1 class="h1">Räknar ut din plan…</h1>
    <div class="calc-steps" style="text-align:left;max-width:320px;margin:30px auto 0">${steps.map((s, i) => `<div class="calc-step" data-i="${i}"><div class="dot">${I.check}</div><span>${esc(s)}</span></div>`).join('')}</div></div>`, { progress: false });
  root.querySelectorAll('.calc-step .dot svg').forEach(s => { s.style.width = '14px'; s.style.height = '14px'; });
  for (let i = 0; i < steps.length; i++) { await sleep(520); root.querySelector(`.calc-step[data-i="${i}"]`)?.classList.add('on'); haptic(); }
  await sleep(500);
  if (STEPS[step] === 'calc') next();
}
function planStep() {
  const t = computeTargets(draft);
  const b = bmi(draft.heightCm, draft.weightKg);
  const goalTxt = draft.goal === 'lose' ? `Ett underskott på ${fmt(Math.abs(t.delta))} kcal/dag ger ca ${fmt(draft.paceKgPerWeek, 2)} kg i veckan.` : draft.goal === 'gain' ? `Ett överskott på ${fmt(t.delta)} kcal/dag ger ca ${fmt(draft.paceKgPerWeek, 2)} kg i veckan.` : 'Du äter i balans med din förbrukning.';
  shell(`<div class="plan-hero">
      <div class="eyebrow">Ditt dagliga mål</div>
      <div class="bignum" id="plan-kcal">0</div>
      <div class="muted" style="margin-top:6px">kcal per dag</div>
    </div>
    <div class="card">
      ${['protein', 'carbs', 'fat'].map(k => `<div class="kv"><span>${{ protein: 'Protein', carbs: 'Kolhydrater', fat: 'Fett' }[k]}</span><b>${fmt(t[k])} g</b></div>`).join('')}
      <div class="kv"><span>Vatten</span><b>${t.waterGlasses} glas</b></div>
    </div>
    <div class="card mt-2">
      <div class="kv"><span>Basförbrukning (BMR)</span><b>${fmt(t.bmr)} kcal</b></div>
      <div class="kv"><span>Total förbrukning (TDEE)</span><b>${fmt(t.tdee)} kcal</b></div>
      <div class="kv"><span>BMI</span><b>${fmt(b, 1)} · ${bmiLabel(b)}</b></div>
      ${t.goalDate ? `<div class="kv"><span>Beräknat vid mål</span><b>${fmtDateLong(t.goalDate)}</b></div>` : ''}
    </div>
    <p class="muted small mt-2" style="padding:0 6px;line-height:1.5">${esc(goalTxt)} ${t.floored ? 'Målet är satt till ett säkert minimum – lägre rekommenderas inte utan läkarkontakt.' : ''} Efter två veckors loggning räknar Tallrik ut din <b>verkliga</b> förbrukning från vikttrend och intag och föreslår justering.</p>`,
    { progress: false, footer: `<button class="btn primary block" id="ob-finish">Starta Tallrik</button>` });
  countUp(root.querySelector('#plan-kcal'), t.kcal, { dur: 1200 });
  root.querySelector('#ob-finish').addEventListener('click', () => {
    haptic('success');
    const p = { ...draft, name: draft.name.trim(), createdAt: new Date().toISOString() };
    setProfile(p);
    setTargets({ ...t, method: 'formula' });
    addWeight(draft.weightKg);
    onDone();
  });
}
export { STEPS };

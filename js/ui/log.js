// Loggning 2.0: foto (AI + produktuppslag + Livsmedelsverket), streckkod, sök, snabbinlägg, redigering, vägning
import { state, addEntry, updateEntry, removeEntry, day, savePhoto, enqueueAnalysis, toggleFavorite, isFavorite, pushRecent, addCustomFood, removeCustomFood, addWeight, latestWeight, rememberCorrection, deletePhoto, learnPortion } from '../store.js?v=202609171301';
import { esc, fmt, openSheet, toast, haptic, MEALS, guessMeal, todayKey, dateKey, addDays, fmtDate, segmented, bindSeg, confirmSheet, confColor, uid, sleep, debounce, closeAllSheets, weightSpark } from '../components.js?v=202609171301';
import { I } from '../icons.js?v=202609171301';
import { loadDB, search, scale, portionPresets, foodEmoji, lookupBarcode, searchProducts, anchorSearch, fmtSize, packageSizes, productTitle  } from '../foods.js?v=202609171301';
import { pickPhoto, compressImage, canLiveScan, startScanner, decodeBarcodeFromImage } from '../camera.js?v=202609171301';
import { analyzePhoto, aiStatus, analyzeText, describeStatus, resolveItem } from '../ai.js?v=202609171301';
import { navigate } from '../app.js?v=202609171301';

const mealSeg = (active, attr = 'data-meal') => segmented(MEALS.map(m => ({ id: m.id, name: m.name })), active, attr);
const macroLine = t => `<span class="small muted num">P ${fmt(t.protein)} g · K ${fmt(t.carbs)} g · F ${fmt(t.fat)} g</span>`;
const FRAC = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
const pkgLabel = it => `${it.part && it.part < 1 ? (FRAC[it.part] || Math.round(it.part * 100) + ' %') + ' av ' : ''}${it.count} × ${it.unitLabel || fmtSize(it.unitGrams, it.liquid)}`;
const undoToast = (msg, date, ids) => toast(msg, 'good', 2600, { action: 'Ångra', onAction: () => { ids.forEach(id => removeEntry(date, id)); toast('Ångrat'); } });

// ---------- Startpunkt: välj metod ----------
let freeDraft = '';   // fritextutkast överlever om arket stängs av misstag
export function openAddSheet(meal = guessMeal(), date = todayKey()) {
  const recents = state.recents.slice(0, 6);
  openSheet({
    title: 'Logga mat',
    html: `${mealSeg(meal)}
      <button class="btn primary block mt-3 cta-photo" data-act="photo">${I.camera}<span>Fota maten</span></button>
      <div class="quick-row mt-2">
        <button class="quick-tile" data-act="search">${I.search}<span>Sök</span></button>
        <button class="quick-tile" data-act="scan">${I.barcode}<span>Streckkod</span></button>
        <button class="quick-tile" data-act="library">${I.image}<span>Album</span></button>
      </div>
      <div class="eyebrow mt-3" style="margin-bottom:8px">Eller skriv vad du åt</div>
      <textarea class="input area" id="free-text" rows="5" placeholder="T.ex. 2 stekta ägg, en skiva rågbröd med smör och ost, ett glas mellanmjölk och en banan.&#10;&#10;Skriv som du pratar – AI:n räknar ut resten." autocapitalize="sentences" spellcheck="true">${esc(freeDraft)}</textarea>
      <div class="row mt-2" style="gap:8px"><button class="icon-btn accent" id="free-photo" aria-label="Fota med texten" style="width:56px;height:52px;flex:0 0 auto">${I.camera}</button><button class="btn primary grow" id="free-go">Tolka texten</button></div>
      <div class="small faint mt-1" style="margin-left:2px">Kameran tar ett foto och skickar med det du skrivit.</div>
      ${recents.length ? `<div class="eyebrow mt-3" style="margin-bottom:8px">Senaste</div><div class="chips">${recents.map((r, i) => `<button class="chip sm" data-recent="${i}">${foodEmoji(r)} ${esc(r.name)}</button>`).join('')}</div>` : ''}
      <button class="btn quiet block mt-2" data-act="quick">Bara kalorier, utan livsmedel</button>`,
    onMount(api) {
      let m = meal;
      bindSeg(api.body, 'data-meal', v => m = v);
      api.body.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
        haptic(); api.close();
        const a = b.dataset.act;
        if (a === 'photo') startPhotoFlow(m, date, { capture: true });
        if (a === 'library') startPhotoFlow(m, date, { capture: false });
        if (a === 'scan') openScanner({ meal: m, date });
        if (a === 'search') openSearch({ meal: m, date });
        if (a === 'quick') openQuickAdd({ meal: m, date });
      }));
      api.body.querySelectorAll('[data-recent]').forEach(b => b.addEventListener('click', () => { haptic(); api.close(); openPortionSheet(recents[+b.dataset.recent], { meal: m, date }); }));
      // Fritext: utkastet sparas medan man skriver, fältet växer och hålls synligt ovanför tangentbordet
      const ta = api.body.querySelector('#free-text');
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(320, Math.max(132, ta.scrollHeight + 2)) + 'px'; };
      ta.addEventListener('input', () => { freeDraft = ta.value; grow(); });
      ta.addEventListener('focus', () => setTimeout(() => ta.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350));
      grow();
      api.body.querySelector('#free-go').addEventListener('click', () => { const text = ta.value.trim(); if (text.length < 3) { toast('Skriv vad du åt först', 'bad'); ta.focus(); return; } haptic(); api.close(); openTextAnalysisSheet({ text, meal: m, date }); });
      api.body.querySelector('#free-photo').addEventListener('click', () => { const text = ta.value.trim(); haptic(); api.close(); startPhotoFlow(m, date, { capture: true, hint: text }); });
    },
  });
}

// ---------- Foto ----------
export async function startPhotoFlow(meal = guessMeal(), date = todayKey(), { capture = true, hint = '' } = {}) {
  const file = await pickPhoto({ capture });
  if (!file) return;
  let img;
  try { img = await compressImage(file, 1600, 0.86); } catch { toast('Kunde inte läsa bilden', 'bad'); return; }
  // Mörk eller suddig bild ger sämre träff – föreslå en ny bild innan AI:n används (sparar både tid och kvot)
  if (capture && (img.quality?.dark || img.quality?.blurry)) {
    const retake = await confirmSheet({ title: img.quality.dark ? 'Bilden är mörk' : 'Bilden är suddig', text: 'AI:n träffar bättre med en skarp, ljus bild tagen rakt uppifrån eller med etiketten mot kameran.', okText: 'Ta om bilden', cancelText: 'Använd ändå' });
    if (retake) return startPhotoFlow(meal, date, { capture, hint });
  }
  const photoId = uid();
  await savePhoto(photoId, img.blob);
  // Bild ur albumet: föreslå dagen (och måltiden) den togs, om användaren står på idag
  let takenAt = null, photoMeal = meal;
  if (!capture && file.lastModified) {
    const d = new Date(file.lastModified);
    const k = dateKey(d);
    if (k < todayKey() && k >= addDays(todayKey(), -60) && date === todayKey()) { takenAt = k; date = k; photoMeal = guessMeal(d); }
  }
  openAnalysisSheet({ img, photoId, meal: photoMeal, date, hint, takenAt });
  if (hint) freeDraft = '';
}
// ---------- Fritext → AI-tolkning ----------
export function openTextAnalysisSheet({ text, meal, date, hint = '' }) {
  const quote = `<div class="card" style="padding:14px"><div class="eyebrow" style="margin-bottom:6px">Du skrev</div><div style="white-space:pre-wrap;line-height:1.45">${esc(text)}</div>${hint ? `<div class="small mt-2" style="color:var(--accent)">Rättelse: ${esc(hint)}</div>` : ''}</div>`;
  openSheet({
    full: true, title: 'Tolkar texten',
    html: `${quote}
      <div class="analyzing-steps mt-3" id="steps">
        <div data-s="identifying"><span class="spinner"></span><span>Förstår vad du åt – rätter, mängder, märken…</span></div>
        <div data-s="matching"><span class="status-dot"></span><span>Slår upp exakta produkter och näringsvärden…</span></div>
        <div data-s="done"><span class="status-dot"></span><span>Sammanställer</span></div>
      </div>
      <p class="small faint mt-3 center">Tar normalt 2–8 sekunder · <span id="an-sec">0</span> s</p>
      <div class="col mt-2 hidden" id="an-slow"><div class="notice warn">Tar längre tid än vanligt – tjänsten har hög belastning. Appen provar en annan modell automatiskt.</div><button class="btn block" id="an-manual">Sök och logga manuellt i stället</button></div>`,
    onMount(a) { run(a); },
  });
  async function run(a) {
    if (!describeStatus().configured) { a.setTitle('AI:n är inte aktiverad'); a.setHTML(`${quote}<div class="notice warn mt-3">Ingen AI-nyckel finns ännu. Starta om appen så hämtas nycklarna, eller lägg in en under Profil → AI-motor.</div><div class="col mt-3"><button class="btn primary block" id="manual">Sök och logga manuellt</button></div>`); a.body.querySelector('#manual').onclick = () => { a.close(null, true); openSearch({ meal, date }); }; return; }
    if (!navigator.onLine) { a.setTitle('Offline'); a.setHTML(`${quote}<div class="notice warn mt-3">Du verkar vara offline. Texten ligger kvar – försök igen när du har nät.</div><div class="col mt-3"><button class="btn primary block" id="retry">Försök igen</button><button class="btn quiet block" id="manual">Sök och logga manuellt</button></div>`); a.body.querySelector('#retry').onclick = () => { a.close(null, true); openTextAnalysisSheet({ text, meal, date, hint }); }; a.body.querySelector('#manual').onclick = () => { a.close(null, true); openSearch({ meal, date }); }; return; }
    const t0 = Date.now();
    const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); const el = a.body.querySelector('#an-sec'); if (el) el.textContent = s; if (s >= 12) a.body.querySelector('#an-slow')?.classList.remove('hidden'); }, 1000);
    a.body.querySelector('#an-manual')?.addEventListener('click', () => { clearInterval(tick); a.close(null, true); openSearch({ meal, date }); });
    const setStage = s => {
      const order = ['identifying', 'matching', 'done'];
      a.body.querySelectorAll('#steps > div').forEach(d => {
        const i = order.indexOf(d.dataset.s), j = order.indexOf(s);
        d.classList.toggle('done', i < j); d.classList.toggle('on', i === j);
        d.firstElementChild.className = i < j ? '' : i === j ? 'spinner' : 'status-dot';
        if (i < j) d.firstElementChild.innerHTML = '✓';
      });
    };
    try {
      const res = await analyzeText(text, { meal, hint, onStage: setStage });
      clearInterval(tick); setStage('done'); haptic('success');
      await sleep(200);
      showResults(a, res, { img: null, photoId: null, meal, date, text });
    } catch (e) {
      clearInterval(tick);
      a.setTitle('Tolkningen misslyckades');
      a.setHTML(`${quote}<div class="notice warn mt-3">${esc(e.message || 'Något gick fel')}</div>
        <div class="col mt-3"><button class="btn primary block" id="retry">Försök igen</button>${e.code === 'nokey' || e.code === 'badkey' ? `<button class="btn block" id="gokey">Öppna AI-inställningar</button>` : ''}<button class="btn quiet block" id="manual">Sök och logga manuellt</button></div>`);
      a.body.querySelector('#retry').onclick = () => { a.close(null, true); openTextAnalysisSheet({ text, meal, date, hint }); };
      a.body.querySelector('#gokey')?.addEventListener('click', () => { a.close(null, true); navigate('profile'); });
      a.body.querySelector('#manual').onclick = () => { a.close(null, true); openSearch({ meal, date }); };
    }
  }
}
export function openAnalysisSheet({ img, photoId, meal, date, hint, takenAt = null }) {
  const stage = (label) => `<div class="photo-stage"><img src="${img.dataURL}" alt=""><div class="veil"></div>${label ? '<div class="scanline"></div>' : ''}</div>`;
  openSheet({
    full: true, title: 'Analyserar',
    html: `${stage(true)}
      <div class="analyzing-steps" id="steps">
        <div data-s="identifying"><span class="spinner"></span><span>Läser bilden – rätter, förpackningar, portioner…</span></div>
        <div data-s="matching"><span class="status-dot"></span><span>Slår upp exakta produkter och näringsvärden…</span></div>
        <div data-s="done"><span class="status-dot"></span><span>Sammanställer</span></div>
      </div>
      <p class="small faint mt-3 center" id="an-note">Bilden skickas till ${esc(aiStatus().providerName)}. Tar normalt 2–10 sekunder · <span id="an-sec">0</span> s</p>
      <div class="col mt-2 hidden" id="an-slow"><div class="notice warn">Tar längre tid än vanligt – tjänsten har hög belastning. Appen provar en annan modell automatiskt, som mest 45 sekunder.</div><button class="btn block" id="an-manual">Sök och logga manuellt i stället</button></div>`,
    onMount(a) { run(a); },
  });
  async function run(a) {
    const st = aiStatus();
    if (!st.configured) return noKeyState(a);
    if (!navigator.onLine) return offlineState(a, 'Du verkar vara offline.');
    // Sekundräknare + "tar längre tid"-läge efter 12 s, så att analysen aldrig känns död
    const t0 = Date.now();
    const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); const el = a.body.querySelector('#an-sec'); if (el) el.textContent = s; if (s >= 12) a.body.querySelector('#an-slow')?.classList.remove('hidden'); }, 1000);
    a.body.querySelector('#an-manual')?.addEventListener('click', () => { clearInterval(tick); a.close(null, true); openSearch({ meal, date }); });
    const stopTick = () => clearInterval(tick);
    const setStage = s => {
      const order = ['identifying', 'matching', 'done'];
      a.body.querySelectorAll('#steps > div').forEach(d => {
        const i = order.indexOf(d.dataset.s), j = order.indexOf(s);
        d.classList.toggle('done', i < j); d.classList.toggle('on', i === j);
        d.firstElementChild.className = i < j ? '' : i === j ? 'spinner' : 'status-dot';
        if (i < j) d.firstElementChild.innerHTML = '✓';
      });
    };
    try {
      // Streckkod i fotot? Avkodas lokalt parallellt med AI:n – ger exakt produkt.
      const eanP = decodeBarcodeFromImage(img.blob).catch(() => null);
      const res = await analyzePhoto(img.dataURL, { hint, meal, onStage: setStage, extraEan: eanP });
      stopTick();
      setStage('done');
      haptic('success');
      await sleep(250);
      showResults(a, res, { img, photoId, meal, date, takenAt });
    } catch (e) {
      stopTick();
      a.setTitle('Analysen misslyckades');
      a.setHTML(`${stage(false)}
        <div class="notice warn mt-3">${esc(e.message || 'Något gick fel')}</div>
        <div class="col mt-3">
          <button class="btn primary block" id="retry">Försök igen</button>
          ${e.code === 'nokey' || e.code === 'badkey' ? `<button class="btn block" id="gokey">Öppna AI-inställningar</button>` : `<button class="btn block" id="queue">Spara fotot – analysera senare</button>`}
          <button class="btn quiet block" id="manual">Sök och logga manuellt</button>
        </div>`);
      a.body.querySelector('#retry').onclick = () => { a.close(null, true); openAnalysisSheet({ img, photoId, meal, date, hint, takenAt }); };
      a.body.querySelector('#gokey')?.addEventListener('click', () => { a.close(null, true); navigate('profile'); });
      a.body.querySelector('#queue')?.addEventListener('click', () => { enqueueAnalysis({ photoId, date, meal, hint }); toast('Fotot ligger i kö och analyseras när det går', 'good'); a.close(null, true); });
      a.body.querySelector('#manual').onclick = () => { a.close(null, true); openSearch({ meal, date }); };
    }
  }
  function noKeyState(a) {
    a.setTitle('Fotoanalys');
    a.setHTML(`${stage(false)}
      <div class="card mt-3"><div class="insight"><div class="ic">🔑</div><div><div class="t">Aktivera fotoanalysen</div><div class="d">Lägg in en gratis AI-nyckel (Google Gemini) under Profil → AI-motor. Tar en minut, kostar inget. Fotot sparas så länge.</div></div></div></div>
      <div class="col mt-3">
        <button class="btn primary block" id="gokey">Lägg till AI-nyckel</button>
        <button class="btn block" id="queue">Spara fotot i kö</button>
        <button class="btn quiet block" id="manual">Sök och logga manuellt</button>
      </div>`);
    a.body.querySelector('#gokey').onclick = () => { enqueueAnalysis({ photoId, date, meal, hint }); a.close(null, true); navigate('profile'); setTimeout(() => document.getElementById('ai-card')?.scrollIntoView({ behavior: 'smooth' }), 150); };
    a.body.querySelector('#queue').onclick = () => { enqueueAnalysis({ photoId, date, meal, hint }); toast('Fotot ligger i kö', 'good'); a.close(null, true); };
    a.body.querySelector('#manual').onclick = () => { a.close(null, true); openSearch({ meal, date }); };
  }
  function offlineState(a, why) {
    a.setTitle('Offline');
    a.setHTML(`${stage(false)}<div class="notice warn mt-3">${esc(why)} Fotot sparas och analyseras automatiskt när du är online igen.</div>
      <div class="col mt-3"><button class="btn primary block" id="queue">Spara i kö</button><button class="btn quiet block" id="manual">Sök och logga manuellt</button></div>`);
    a.body.querySelector('#queue').onclick = () => { enqueueAnalysis({ photoId, date, meal, hint }); toast('Sparat – analyseras när du är online', 'good'); a.close(null, true); };
    a.body.querySelector('#manual').onclick = () => { a.close(null, true); openSearch({ meal, date }); };
  }
}

// ----- Resultat (egen funktion så vyn kan visas fristående) -----
export function showResults(a, res, { img = null, photoId = null, meal, date, takenAt = null, text = '' }) {
  const items = res.items.map(it => ({ ...it, include: true, id: uid(), aiName: it.aiName || it.name }));
  let curMeal = meal, curDate = date, added = false, showDays = !!takenAt || date !== todayKey();
  const recompute = it => { it.per100 = it.match ? it.match.per100 : (it.source === 'label' ? (it.labelPer100 || it.per100) : it.aiPer100); Object.assign(it, scale(it.per100, it.grams)); };
  const totals = () => items.filter(i => i.include).reduce((s, i) => ({ kcal: s.kcal + i.kcal, protein: s.protein + i.protein, carbs: s.carbs + i.carbs, fat: s.fat + i.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  // Skydd mot att svepa bort analysen av misstag
  a.onBeforeClose = () => true;
  const guard = () => { if (added || !items.some(i => i.include)) return true; confirmSheet({ title: 'Kasta analysen?', text: 'Måltiden är inte tillagd ännu.', okText: 'Kasta', danger: true }).then(ok => { if (ok) { if (photoId) deletePhoto(photoId); a.close(null, true); } }); return false; };
  a.el.closest('.sheet-backdrop').__guard = guard;
  const draw = () => {
    const t = totals();
    const pkgCount = items.filter(i => i.type === 'package').length, srcCount = items.filter(i => i.match || i.source === 'label').length;
    a.setTitle(res.title || 'Din måltid');
    a.setHTML(`
      <div class="row" style="align-items:flex-start">
        ${img ? `<img src="${img.dataURL}" alt="" style="width:64px;height:64px;border-radius:14px;object-fit:cover;flex:0 0 auto">` : `<div style="width:64px;height:64px;border-radius:14px;background:var(--accent-soft);display:grid;place-items:center;font-size:30px;flex:0 0 auto">✍️</div>`}
        <div class="grow"><div class="small muted">${esc(res.notes || 'Kontrollera portionerna – tryck på en rad för att justera.')}</div>
        </div>
      </div>
      <div class="eyebrow mt-3" style="margin-bottom:8px">Loggas som</div>
      ${mealSeg(curMeal)}
      ${takenAt ? `<div class="notice good mt-2">📅 Bilden är från ${esc(fmtDate(takenAt, true))} – loggas på den dagen. Byt nedan om det är fel.</div>` : ''}
      <div class="row between mt-2" style="padding:0 2px"><span class="small muted">Dag: <b style="color:var(--text)">${esc(fmtDate(curDate))}</b></span><button class="link-btn small" id="day-toggle">${showDays ? 'Klar' : 'Byt dag'}</button></div>
      <div class="chips mt-1 ${showDays ? '' : 'hidden'}" id="days">${[todayKey(), addDays(todayKey(), -1), ...(curDate !== todayKey() && curDate !== addDays(todayKey(), -1) ? [curDate] : [])].map(k => `<button class="chip sm ${k === curDate ? 'active' : ''}" data-day="${k}">${esc(fmtDate(k))}</button>`).join('')}<label class="chip sm" style="position:relative;overflow:hidden">Annan dag…<input type="date" id="day-pick" max="${todayKey()}" style="position:absolute;inset:0;opacity:0;width:100%"></label></div>
      <div class="divider"></div>
      <div class="mt-2" id="items">
        ${items.length ? items.map(row).join('') : `<div class="notice">${img ? 'Ingen mat hittades på bilden. Prova att fota rakt uppifrån i bra ljus, eller sök manuellt.' : 'AI:n hittade ingen mat i texten. Skriv lite tydligare vad du åt, eller sök manuellt.'}</div>`}
      </div>
      <div class="row mt-2" style="gap:8px">
        <button class="btn sm grow" id="add-more">${I.plus} Lägg till fler</button>
        <button class="btn sm grow" id="fix">${I.edit} Stämmer inte?</button>
      </div>
      <div id="fixbox" class="hidden mt-2">
        <div class="small muted" style="margin:0 4px 6px">Skriv med egna ord vad som är fel, så tolkar AI:n om allt.</div>
        <div class="field"><textarea class="input area" id="fix-text" rows="3" style="min-height:84px" placeholder="T.ex. det är vanligt vatten, inte smaksatt · kalkon, inte kyckling · jag åt bara halva · 50 cl-flaska"></textarea></div>
        <button class="btn primary block mt-1" id="fix-run">Tolka om med rättelsen</button>
      </div>
      <button class="btn quiet block mt-3" id="discard">Kasta analysen</button>
      <div class="sticky-cta"><div class="row"><div style="flex:0 0 auto"><div class="hero-num" id="tot-kcal" style="font-size:22px;line-height:1.1">${fmt(t.kcal)} <small style="font-size:13px;color:var(--text-3)">kcal</small></div><div class="small muted num" style="white-space:nowrap">P ${fmt(t.protein)} · K ${fmt(t.carbs)} · F ${fmt(t.fat)}</div></div>
      <button class="btn primary grow" id="add-all" ${items.filter(i => i.include).length ? '' : 'disabled'}>Lägg till</button></div></div>`);
    bindSeg(a.body, 'data-meal', v => curMeal = v);
    a.body.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { curDate = b.dataset.day; haptic(); draw(); }));
    a.body.querySelector('#day-pick')?.addEventListener('change', e => { if (e.target.value) { curDate = e.target.value; draw(); } });
    a.body.querySelector('#day-toggle')?.addEventListener('click', () => { showDays = !showDays; haptic(); draw(); });
    a.body.querySelectorAll('[data-item]').forEach(b => b.addEventListener('click', () => openItemSheet(items.find(i => i.id === b.dataset.item))));
    // Snabbjustering direkt på raden: − / + (mat: ungefär 10 % i jämna steg, förpackning: antal)
    a.body.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const it = items.find(i => i.id === b.dataset.id), dir = +b.dataset.step; if (!it) return;
      if (it.type === 'package') { it.count = Math.max(1, (it.count || 1) + dir); it.grams = Math.max(1, Math.round(it.unitGrams * it.count * (it.part || 1))); }
      else { const step = it.grams < 50 ? 5 : it.grams < 200 ? 10 : it.grams < 500 ? 25 : 50; it.grams = Math.max(step, Math.round((it.grams + dir * step) / step) * step); }
      recompute(it); haptic(); draw();
    }));
    a.body.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const it = items.find(i => i.id === b.dataset.toggle); it.include = !it.include; haptic(); draw(); }));
    a.body.querySelectorAll('[data-scale]').forEach(b => b.addEventListener('click', () => { const k = +b.dataset.scale; items.forEach(it => { if (it.type === 'package') { const total = it.unitGrams * it.count * (it.part || 1) * k; it.count = Math.max(1, Math.round(total / it.unitGrams)); it.part = Math.min(1, Math.max(0.05, Math.round(total / (it.unitGrams * it.count) * 20) / 20)); it.grams = Math.max(1, Math.round(it.unitGrams * it.count * it.part)); } else it.grams = Math.max(1, Math.round(it.grams * k)); recompute(it); }); haptic(); draw(); }));
    a.body.querySelector('#add-more').onclick = () => openSearch({ meal: curMeal, date: curDate, onPick: food => openPortionSheet(food, { meal: curMeal, date, onDone: e => { items.push({ id: uid(), include: true, type: 'food', name: e.name, grams: e.grams, per100: e.per100, aiPer100: e.per100, match: e.foodKey ? { key: e.foodKey, name: e.name, per100: e.per100, group: e.group } : null, confidence: 1, grams_range: [e.grams, e.grams], alternatives: [], candidates: [], kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, basis: 'Tillagd manuellt', sourceLabel: 'Vald manuellt ✓', count: 1, unitGrams: e.grams, orig: { grams: e.grams, unitGrams: e.grams, matchKey: e.foodKey || null } }); draw(); } }) });
    a.body.querySelector('#fix').onclick = () => { a.body.querySelector('#fixbox').classList.toggle('hidden'); a.body.querySelector('#fix-text').focus(); };
    a.body.querySelector('#fix-run').onclick = () => { const h = a.body.querySelector('#fix-text').value.trim(); if (!h) return; added = true; a.close(null, true); if (img) openAnalysisSheet({ img, photoId, meal: curMeal, date: curDate, hint: h, takenAt }); else openTextAnalysisSheet({ text, meal: curMeal, date: curDate, hint: h }); };
    a.body.querySelector('#discard').onclick = () => { if (!guard()) return; if (photoId) deletePhoto(photoId); a.close(null, true); };
    a.body.querySelector('#add-all').onclick = () => {
      if (added) return;   // dubbeltryck ska inte ge dubbla poster
      const ids = []; let sum = 0;
      for (const it of items.filter(i => i.include)) {
        const e = addEntry(curDate, { meal: curMeal, name: it.name, grams: it.grams, kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat, per100: it.per100, source: img ? 'photo' : 'text', photoId: img && ids.length === 0 ? photoId : null, confidence: it.confidence, match: it.match?.name || '', group: it.match?.group || '', foodKey: it.match?.key || '', emoji: it.emoji || (it.match ? foodEmoji(it.match) : foodEmoji({ name: it.name })), image: it.image || '', portionLabel: it.type === 'package' ? pkgLabel(it) : '', liquid: it.liquid });
        ids.push(e.id); sum += it.kcal;
        if (img && it.type !== 'package' && it.aiGrams && !it.learned) learnPortion(it.aiGrams, it.grams);   // lär av fotoportioner (även "stämde" räknas)
        if (it.match) pushRecent({ key: it.match.key, name: it.type === 'package' ? it.name : it.match.name, brand: it.package?.brand || '', per100: it.match.per100, group: it.match.group, source: it.source === 'off' ? 'off' : 'slv', lastGrams: it.grams, image: it.image || it.match.image || '', quantity: it.type === 'package' ? it.unitLabel : '', quantityGrams: it.type === 'package' ? it.unitGrams : (it.match.quantityGrams || 0), liquid: !!it.liquid });
        // Lär av justeringar: annan storlek eller annan källa än AI:n föreslog
        const o = it.orig || {};
        if (o.grams !== it.grams || o.unitGrams !== it.unitGrams || o.matchKey !== (it.match?.key || null)) {
          rememberCorrection(it.type === 'package' ? `${it.package?.brand} ${it.package?.product} ${it.package?.variant}` : it.name, { grams: it.grams, unitGrams: it.type === 'package' ? it.unitGrams : 0, matchKey: it.match?.key || null, matchName: it.match?.name || '', per100: it.per100, group: it.match?.group || '', source: it.source });
        }
      }
      added = true; haptic('success'); closeAllSheets(); if (!img) freeDraft = '';
      if (img?.thumb) savePhoto(photoId, img.thumb).catch(() => {});   // behåll bara miniatyren – fullstora foton fyller lagringen på ett år
      undoToast(`Lagt till ${ids.length} livsmedel · ${fmt(sum)} kcal${curDate !== todayKey() ? ' (' + fmtDate(curDate) + ')' : ''}`, curDate, ids);
    };
  };
  const row = it => {
    const srcShort = it.source === 'off' ? 'Exakt produkt ✓' : it.source === 'label' ? 'Värden från etiketten ✓' : it.match ? esc(it.match.name) + ' ✓' : (it.sourceLabel === 'Vatten · 0 kcal' ? 'Vatten' : 'AI-skattning – kontrollera gärna');
    const sub = it.type === 'package' ? `${esc(pkgLabel(it))}${it.sizeRead ? '' : ' (uppskattad storlek)'} · ${srcShort}` : srcShort;
    const sym = it.emoji || (() => { const e = foodEmoji(it.type === 'package' ? { name: it.name } : (it.match || { name: it.name })); return e === '🍽️' && it.type === 'package' ? (it.liquid ? '🥤' : '📦') : e; })();
    const icon = it.image ? `<img src="${esc(it.image)}" alt="" style="width:40px;height:40px;border-radius:10px;object-fit:cover;flex:0 0 auto">` : `<div style="width:40px;height:40px;border-radius:10px;background:var(--surface-2);display:grid;place-items:center;font-size:22px;flex:0 0 auto">${sym}</div>`;
    const amount = it.type === 'package' ? `${it.count} st` : `${fmt(it.grams)} ${it.liquid ? 'ml' : 'g'}`;
    return `<div class="ai-item" data-item="${it.id}" role="button" tabindex="0" style="opacity:${it.include ? 1 : .45}">${icon}
      <div class="grow" style="min-width:0"><div class="n ellipsis"><span class="conf" style="background:${confColor(it.confidence)}"></span>${esc(it.name)}${it.hidden ? ' <span class="tag">dolda kalorier</span>' : ''}${it.learned ? ' <span class="tag good">lärt</span>' : ''}</div>
      <div class="s ellipsis">${sub}</div>
      ${it.include ? `<div class="qstep"><span class="qb" data-step="-1" data-id="${it.id}" role="button" aria-label="Mindre">−</span><span class="qv">${esc(amount)}</span><span class="qb" data-step="1" data-id="${it.id}" role="button" aria-label="Mer">+</span><span class="qe" role="button">${I.edit} Ändra</span></div>` : ''}</div>
      <div class="k">${fmt(it.kcal)} <small class="faint">kcal</small></div>
      <span class="del" data-toggle="${it.id}" role="button" aria-label="${it.include ? 'Ta bort' : 'Lägg tillbaka'}">${it.include ? I.close : I.plus}</span>
    </div>`;
  };
  function openItemSheet(it) {
    const isPkg = it.type === 'package';
    const sizes = isPkg ? (it.sizes?.length ? it.sizes : packageSizes(it.package?.container, it.unitGrams, it.liquid)) : [];
    openSheet({
      title: isPkg ? 'Förpackning' : 'Justera',
      html: `<div class="field"><label>Vad är det? Skriv för att byta</label><input class="input" id="it-name" value="${esc(it.name)}" placeholder="T.ex. Alpro yoghurt blåbär" autocomplete="off" autocapitalize="sentences" enterkeyhint="search"></div>
        <div id="it-sugg" class="list hidden" style="margin-top:6px"></div>
        ${it.alternatives?.length ? `<div class="chips mt-2"><span class="small muted" style="align-self:center">Menade du?</span>${it.alternatives.map((alt, i) => `<button class="chip sm" data-alt="${i}">${esc(alt)}</button>`).join('')}</div>` : ''}
        ${it.basis ? `<div class="small faint mt-2" style="margin-left:4px">${esc(it.basis)}</div>` : ''}
        ${isPkg ? `
        <div class="eyebrow mt-3" style="margin-bottom:8px">Storlek ${it.sizeRead ? '<span class="tag good">läst</span>' : '<span class="tag" style="color:var(--accent-2)">uppskattad</span>'}</div>
        <div class="chips" id="sizes">${sizes.map(s => `<button class="chip sm ${s.grams === it.unitGrams ? 'active' : ''}" data-size="${s.grams}">${esc(s.label)}</button>`).join('')}<button class="chip sm" id="size-custom">Annan…</button></div>
        <div class="row between mt-3"><div><div class="eyebrow" style="margin-bottom:6px">Antal</div><div class="stepper"><button id="c-m">−</button><input id="c" inputmode="numeric" value="${it.count}"><button id="c-p">+</button></div></div><div style="text-align:right"><div class="hero-num" id="it-kcal">${fmt(it.kcal)}</div><div class="small muted">kcal · <span id="it-g">${fmt(it.grams)} g</span></div></div></div>
        <div class="chips mt-2" id="part"><span class="small muted" style="align-self:center">Åt/drack:</span><button class="chip sm" data-part="0.25">¼</button><button class="chip sm" data-part="0.5">½</button><button class="chip sm" data-part="0.75">¾</button><button class="chip sm active" data-part="1">Hela</button></div>
        <div class="field mt-2" id="custom-box" style="display:none"><label>Gram / ml per förpackning</label><input class="input" id="g" inputmode="decimal" value="${it.unitGrams}"></div>`
        : `
        <div class="eyebrow mt-3" style="margin-bottom:8px">Portion</div>
        <div class="row between"><div class="stepper"><button id="g-m">−</button><input id="g" inputmode="decimal" value="${it.grams}"><button id="g-p">+</button></div><div><div class="hero-num" id="it-kcal">${fmt(it.kcal)}</div><div class="small muted">kcal</div></div></div>
        <div class="chips mt-2" id="g-chips">
          <button class="chip sm" data-g="${Math.round(it.grams / 2)}">Halv</button><button class="chip sm" data-g="${it.grams * 2}">Dubbel</button>
        </div>`}
        <details class="more mt-3"><summary>Varifrån kommer näringsvärdena?</summary>
        <div class="choice-list mt-2" id="src">
          ${it.match && it.source === 'off' ? `<button class="choice active" data-src="keep" style="padding:12px 14px"><div><div class="t" style="font-size:15px">${esc(it.match.name)}</div><div class="d">Open Food Facts · ${fmt(it.match.per100.kcal)} kcal/100 ${it.liquid ? 'ml' : 'g'}${it.ean ? ' · EAN ' + esc(it.ean) : ''}</div></div><div class="check"></div></button>` : ''}
          ${it.source === 'label' ? `<button class="choice ${!it.match ? 'active' : ''}" data-src="label" style="padding:12px 14px"><div><div class="t" style="font-size:15px">Etiketten på förpackningen</div><div class="d">${fmt(it.per100.kcal)} kcal/100 ${it.liquid ? 'ml' : 'g'} (läst av AI:n)</div></div><div class="check"></div></button>` : ''}
          ${(it.candidates || []).map(c => `<button class="choice ${it.match?.key === c.key ? 'active' : ''}" data-src="${c.key}" style="padding:12px 14px"><div><div class="t" style="font-size:15px">${esc(c.name)}</div><div class="d">Livsmedelsverket · ${fmt(c.per100.kcal)} kcal/100 g</div></div><div class="check"></div></button>`).join('')}
          <button class="choice ${!it.match && it.source !== 'label' ? 'active' : ''}" data-src="ai" style="padding:12px 14px"><div><div class="t" style="font-size:15px">AI:s egen skattning</div><div class="d">${fmt(it.aiPer100.kcal)} kcal/100 ${it.liquid ? 'ml' : 'g'}</div></div><div class="check"></div></button>
        </div>
        <div class="row mt-2" style="gap:8px"><button class="btn sm grow" id="src-search">${I.search} Livsmedelsverket</button><button class="btn sm grow" id="src-product">${I.barcode} Sök produkt</button></div>
        </details>
        <div class="col mt-4"><button class="btn primary block" id="it-save">Klar</button><button class="btn quiet block" id="it-del" style="color:var(--bad)">Ta bort</button></div>`,
      onMount(sa) {
        const b = sa.body;
        let part = it.part || 1;
        const upd = () => {
          if (isPkg) { it.count = Math.max(1, Math.round(+b.querySelector('#c').value || 1)); it.part = part; it.grams = Math.max(1, Math.round(it.unitGrams * it.count * part)); it.unitLabel = fmtSize(it.unitGrams, !!it.liquid); b.querySelector('#it-g').textContent = fmt(it.grams) + (it.liquid ? ' ml' : ' g'); }
          else { const g = b.querySelector('#g'); const v = parseFloat(String(g.value).replace(',', '.')); if (v > 0) it.grams = Math.max(1, Math.round(v)); }   // skriv inte tillbaka medan man skriver
          recompute(it); b.querySelector('#it-kcal').textContent = fmt(it.kcal);
        };
        if (isPkg) {
          b.querySelectorAll('[data-size]').forEach(c => c.onclick = () => { it.unitGrams = +c.dataset.size; it.sizeRead = true; b.querySelectorAll('[data-size]').forEach(x => x.classList.toggle('active', x === c)); upd(); haptic(); });
          b.querySelector('#size-custom').onclick = () => { b.querySelector('#custom-box').style.display = ''; b.querySelector('#g').focus(); };
          b.querySelector('#g').addEventListener('input', e => { const v = Math.round(parseFloat(String(e.target.value).replace(',', '.')) || 0); if (v > 0) { it.unitGrams = v; it.sizeRead = true; b.querySelectorAll('[data-size]').forEach(x => x.classList.remove('active')); upd(); } });
          b.querySelector('#c-m').onclick = () => { b.querySelector('#c').value = Math.max(1, it.count - 1); upd(); haptic(); };
          b.querySelector('#c-p').onclick = () => { b.querySelector('#c').value = it.count + 1; upd(); haptic(); };
          b.querySelector('#c').addEventListener('input', upd);
          b.querySelectorAll('[data-part]').forEach(c => c.onclick = () => { part = +c.dataset.part; b.querySelectorAll('[data-part]').forEach(x => x.classList.toggle('active', x === c)); upd(); haptic(); });
          b.querySelectorAll('[data-part]').forEach(x => x.classList.toggle('active', Math.abs(+x.dataset.part - part) < 0.01));
        } else {
          const g = b.querySelector('#g');
          g.addEventListener('input', upd);
          g.addEventListener('blur', () => { g.value = it.grams; });
          b.querySelector('#g-m').onclick = () => { g.value = Math.max(1, it.grams - 10); upd(); haptic(); };
          b.querySelector('#g-p').onclick = () => { g.value = it.grams + 10; upd(); haptic(); };
          b.querySelectorAll('[data-g]').forEach(c => c.onclick = () => { g.value = c.dataset.g; upd(); haptic(); });
        }
        b.querySelectorAll('[data-src]').forEach(c => c.onclick = () => {
          const k = c.dataset.src;
          if (k === 'ai') { it.match = null; it.source = 'ai'; it.per100 = it.aiPer100; it.sourceLabel = 'AI-skattning'; }
          else if (k === 'label') { it.match = null; it.source = 'label'; it.per100 = it.labelPer100 || it.per100; it.sourceLabel = 'Etikett läst ✓'; }
          else if (k !== 'keep') { const cand = it.candidates.find(x => x.key === k); if (cand) { it.match = { key: cand.key, name: cand.name, per100: cand.per100, group: cand.group }; it.source = 'slv'; it.sourceLabel = cand.name + ' ✓'; } }
          b.querySelectorAll('[data-src]').forEach(x => x.classList.toggle('active', x === c)); upd(); haptic();
        });
        const pickFood = f => { it.match = { key: f.key, name: f.source === 'off' ? productTitle(f) : f.name, per100: f.per100, group: f.group || (f.source === 'off' ? 'Produkt' : ''), image: f.image || '', quantityGrams: f.quantityGrams || 0, liquid: f.liquid }; it.source = f.source === 'off' ? 'off' : 'slv'; it.sourceLabel = (f.source === 'off' ? 'Open Food Facts' : f.name) + ' ✓'; if (f.image) it.image = f.image; if (isPkg && f.quantityGrams) { it.unitGrams = f.quantityGrams; it.sizeRead = true; if (f.liquid != null) it.liquid = f.liquid; } if (!isPkg && f.name) it.name = it.name; upd(); sa.close(); openItemSheet(it); };
        b.querySelector('#src-search').onclick = () => openSearch({ pickOnly: true, query: it.db_query, onPick: pickFood });
        b.querySelector('#src-product').onclick = () => openSearch({ pickOnly: true, query: isPkg ? `${it.package?.brand || ''} ${it.package?.product || ''}`.trim() : it.name, online: true, onPick: pickFood });
        b.querySelectorAll('[data-alt]').forEach(c => c.onclick = async () => {
          const alt = it.alternatives[+c.dataset.alt];
          it.name = alt; it.db_query = alt; await loadDB();
          const cands = anchorSearch(alt, 3).filter(x => x.coverage >= .5).map(x => x.f);
          it.candidates = cands.map(f => ({ key: f.key, name: f.name, per100: f.per100, group: f.group }));
          if (it.candidates[0]) { it.match = it.candidates[0]; it.source = 'slv'; it.sourceLabel = it.candidates[0].name + ' ✓'; }
          upd(); sa.close(); openItemSheet(it);
        });
        // Byt livsmedel: förslag ur Livsmedelsverket medan man skriver – ett tryck byter både namn och näringsvärden, mängden behålls
        // Appen lär sig: nästa gång AI:n kallar något samma sak blir det direkt det du rättade till
        const learnRename = x => { if (x.aiName && x.aiName !== x.name) rememberCorrection(x.aiName, { renameTo: x.name, emoji: x.emoji || '', per100: x.per100, matchKey: x.match?.key || null, matchName: x.match?.name || '', group: x.match?.group || '', source: x.source, unitGrams: x.type === 'package' ? x.unitGrams : 0 }); };
        const nameInp = b.querySelector('#it-name'), sugg = b.querySelector('#it-sugg');
        let suggList = [];
        const showSugg = debounce(async () => {
          const q = nameInp.value.trim();
          if (q.length < 2 || q === it.name) { sugg.classList.add('hidden'); return; }
          await loadDB().catch(() => {});
          suggList = search(q, { limit: 4 });
          sugg.innerHTML = `<button class="list-item" id="sugg-ai" style="padding:12px 14px"><div class="ic" style="font-size:20px">✨</div><div class="grow" style="min-width:0"><div class="t ellipsis" style="font-size:15px">Slå upp ”${esc(q)}”</div><div class="d">AI:n hittar rätt produkt eller rätt och räknar om</div></div></button>`
            + suggList.map((f, i) => `<button class="list-item" data-sugg="${i}" style="padding:10px 14px"><div class="ic" style="font-size:20px">${foodEmoji(f)}</div><div class="grow" style="min-width:0"><div class="t ellipsis" style="font-size:15px">${esc(f.name)}</div><div class="d">${fmt(f.per100.kcal)} kcal/100 g</div></div></button>`).join('');
          sugg.classList.remove('hidden');
          sugg.querySelector('#sugg-ai').onclick = async () => {
            const btn = sugg.querySelector('#sugg-ai'); btn.disabled = true; btn.querySelector('.ic').innerHTML = '<span class="spinner"></span>'; btn.querySelector('.d').textContent = 'Slår upp…';
            try {
              const r = await resolveItem(q, { grams: isPkg ? 0 : it.grams, liquid: !!it.liquid, meal: curMeal });
              if (!r) throw new Error('AI:n hittade inget som matchar – skriv lite tydligare.');
              const keep = { id: it.id, include: true, aiName: it.aiName || it.name };
              for (const k of Object.keys(it)) delete it[k];
              Object.assign(it, r, keep, { orig: { grams: r.grams, unitGrams: r.unitGrams, matchKey: r.match?.key || null } });
              recompute(it); learnRename(it); haptic('success'); sa.close(); draw();
            } catch (e) { toast(e.message || 'Kunde inte slå upp just nu', 'bad'); btn.disabled = false; btn.querySelector('.ic').textContent = '✨'; btn.querySelector('.d').textContent = 'Försök igen'; }
          };
          sugg.querySelectorAll('[data-sugg]').forEach(x => x.onclick = () => {
            const f = suggList[+x.dataset.sugg];
            it.name = f.name; it.db_query = f.name; it.emoji = foodEmoji(f); it.match = { key: f.key, name: f.name, per100: f.per100, group: f.group }; it.source = 'slv'; it.sourceLabel = f.name + ' ✓'; it.confidence = 1; it.alternatives = [];
            if (isPkg) { it.type = 'food'; it.package = null; it.image = ''; }
            it.candidates = [{ key: f.key, name: f.name, per100: f.per100, group: f.group }];
            recompute(it); learnRename(it); haptic('success'); sa.close(); draw();
          });
        }, 160);
        nameInp.addEventListener('input', showSugg);
        b.querySelector('#it-save').onclick = () => { it.name = nameInp.value.trim() || it.name; upd(); sa.close(); draw(); haptic(); };
        b.querySelector('#it-del').onclick = () => { it.include = false; sa.close(); draw(); };
      },
    });
  }
  draw();
}

// ---------- Sök ----------
export function openSearch({ meal = guessMeal(), date = todayKey(), onPick = null, pickOnly = false, query = '', online: startOnline = false } = {}) {
  let tab = 'all', q = query, online = null, onlineBusy = false, onlineFor = '';
  openSheet({
    full: true, title: pickOnly ? 'Välj livsmedel' : 'Sök livsmedel',
    html: `<div class="input-wrap">${I.search.replace('<svg', '<svg class="prefix-icon"')}<input class="input" id="q" placeholder="Sök livsmedel eller märke + produkt…" value="${esc(q)}" autocomplete="off"></div>
      <div class="mt-2">${segmented([{ id: 'all', name: 'Alla' }, { id: 'fav', name: 'Favoriter' }, { id: 'recent', name: 'Senaste' }, { id: 'custom', name: 'Egna' }], tab, 'data-tab')}</div>
      <div id="res" class="mt-2"></div>`,
    onMount(a) {
      const inp = a.body.querySelector('#q');
      const res = a.body.querySelector('#res');
      const fetchOnline = async () => { if (onlineBusy || !navigator.onLine) return; onlineBusy = true; onlineFor = q.trim(); draw(); online = (await searchProducts(onlineFor).catch(() => null)) || []; onlineBusy = false; draw(); };
      const draw = async () => {
        await loadDB().catch(() => {});
        let list = [], extra = '';
        if (tab === 'fav') list = Object.values(state.favorites);
        else if (tab === 'recent') list = state.recents;
        else if (tab === 'custom') list = state.customFoods;
        else if (q.trim().length >= 1) list = search(q, { limit: 40 });
        if (tab !== 'all' && q.trim()) { const nq = q.toLowerCase(); list = list.filter(f => (f.name + ' ' + (f.brand || '')).toLowerCase().includes(nq)); }
        const rows = list.map((f, i) => resultRow(f, i)).join('');
        if (tab === 'all' && q.trim().length >= 3) {
          if (online === null && !onlineBusy && list.length < 3 && navigator.onLine) setTimeout(fetchOnline, 0); // få lokala träffar → sök produkter automatiskt
          extra += online === null ? `<button class="btn sm block mt-2" id="off" ${onlineBusy ? 'disabled' : ''}>${onlineBusy ? '<span class="spinner"></span> Söker produkter…' : '🌍 Sök produkter (märke + produkt, Open Food Facts)'}</button>` : online.length ? `<div class="eyebrow mt-3" style="margin-bottom:6px">Produkter · Open Food Facts</div>${online.map((f, i) => resultRow(f, 1000 + i)).join('')}` : `<div class="notice mt-2">Inga produkter hittades för "${esc(onlineFor)}". Skriv märket först, t.ex. "arla kvarg".</div>`;
          if (!pickOnly) extra += `<button class="btn sm block mt-2" id="custom-new">${I.plus} Skapa eget livsmedel "${esc(q.trim())}"</button>`;
        }
        if (!list.length && !extra) extra = `<div class="empty-line center mt-3">${tab === 'all' ? 'Skriv t.ex. "kyckling", "kvarg" eller "coca cola"' : tab === 'fav' ? 'Inga favoriter ännu – stjärnmärk livsmedel du äter ofta' : tab === 'recent' ? 'Inget loggat ännu' : 'Inga egna livsmedel ännu'}</div>${tab === 'custom' && !pickOnly ? `<button class="btn sm block mt-2" id="custom-new">${I.plus} Skapa eget livsmedel</button>` : ''}`;
        res.innerHTML = rows + extra;
        res.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
          const i = +b.dataset.pick, f = i >= 1000 ? online[i - 1000] : list[i];
          haptic();
          if (onPick) { onPick(f); if (pickOnly) a.close(); } else openPortionSheet(f, { meal, date });
        }));
        res.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const i = +b.dataset.fav, f = i >= 1000 ? online[i - 1000] : list[i]; const on = toggleFavorite(f); b.classList.toggle('on', on); b.innerHTML = on ? I.starFill : I.star; haptic(); }));
        res.querySelectorAll('[data-delcustom]').forEach(b => b.addEventListener('click', async e => { e.stopPropagation(); if (await confirmSheet({ title: 'Ta bort eget livsmedel?', text: 'Redan loggade poster påverkas inte.', okText: 'Ta bort', danger: true })) { removeCustomFood(b.dataset.delcustom); draw(); } }));
        res.querySelector('#off')?.addEventListener('click', fetchOnline);
        res.querySelector('#custom-new')?.addEventListener('click', () => openCustomFoodSheet(q.trim(), () => { tab = 'custom'; q = ''; inp.value = ''; a.body.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === 'custom')); draw(); }));
      };
      inp.addEventListener('input', debounce(() => { q = inp.value; online = null; draw(); }, 140));
      bindSeg(a.body, 'data-tab', v => { tab = v; draw(); });
      draw();
      if (startOnline && q.trim().length >= 3) setTimeout(fetchOnline, 50);
      setTimeout(() => inp.focus(), 380);
    },
  });
  const resultRow = (f, i) => `<button class="result" data-pick="${i}">
      ${f.image ? `<img src="${esc(f.image)}" alt="" loading="lazy">` : `<div class="ico" style="width:44px;height:44px;border-radius:10px;background:var(--surface-2);display:grid;place-items:center;font-size:20px;flex:0 0 auto">${foodEmoji(f)}</div>`}
      <div class="grow"><div class="n ellipsis">${esc(f.name)}</div><div class="s ellipsis">${esc([f.brand, f.quantity, f.group, f.source === 'custom' ? 'Eget' : f.source === 'off' ? 'Open Food Facts' : ''].filter(Boolean).join(' · '))}</div></div>
      <div class="k"><b>${fmt(f.per100.kcal)}</b><small>kcal/100 ${f.liquid ? 'ml' : 'g'}</small></div>
      ${f.source === 'custom' && !pickOnly ? `<span class="fav" data-delcustom="${esc(f.key)}">${I.trash}</span>` : `<span class="fav ${isFavorite(f.key) ? 'on' : ''}" data-fav="${i}">${isFavorite(f.key) ? I.starFill : I.star}</span>`}
    </button>`;
}

// ---------- Portion ----------
export function openPortionSheet(food, { meal = guessMeal(), date = todayKey(), entry = null, onDone = null } = {}) {
  const presets = portionPresets(food);
  let grams = entry?.grams || food.lastGrams || presets.def;
  let curMeal = entry?.meal || meal;
  let label = entry?.portionLabel || '';
  const unit = food.liquid ? 'ml' : 'g';
  openSheet({
    title: entry ? 'Redigera' : 'Portion',
    html: `<div class="row" style="align-items:flex-start">
        ${food.image ? `<img src="${esc(food.image)}" alt="" style="width:56px;height:56px;border-radius:14px;object-fit:cover">` : `<div style="width:56px;height:56px;border-radius:14px;background:var(--surface-2);display:grid;place-items:center;font-size:26px">${foodEmoji(food)}</div>`}
        <div class="grow"><div class="h3">${esc(food.name)}</div><div class="small muted">${esc([food.brand, food.quantity, food.group].filter(Boolean).join(' · '))}</div><div class="small muted num">${fmt(food.per100.kcal)} kcal · P ${fmt(food.per100.protein)} · K ${fmt(food.per100.carbs)} · F ${fmt(food.per100.fat)} per 100 ${unit}</div></div>
        <button class="fav ${isFavorite(food.key) ? 'on' : ''}" id="fav" aria-label="Favorit" style="color:${isFavorite(food.key) ? 'var(--accent-2)' : 'var(--text-3)'}">${isFavorite(food.key) ? I.starFill : I.star}</button>
      </div>
      <div class="chips mt-3" id="presets">${presets.list.map(p => `<button class="chip sm ${p.grams === grams ? 'active' : ''}" data-g="${p.grams}" data-l="${esc(p.label)}">${esc(p.label)}</button>`).join('')}</div>
      <div class="row between mt-3">
        <div class="stepper"><button id="g-m">−</button><input id="g" inputmode="decimal" value="${grams}"><button id="g-p">+</button></div>
        <div style="text-align:right"><div class="hero-num" id="k">${fmt(scale(food.per100, grams).kcal)}</div><div class="small muted">kcal · <span id="gl">${grams} ${unit}</span></div></div>
      </div>
      <div class="mt-2" id="ml">${macroLine(scale(food.per100, grams))}</div>
      ${onDone ? '' : `<div class="eyebrow mt-3" style="margin-bottom:8px">Måltid</div>${mealSeg(curMeal)}`}
      <div class="col mt-4">
        <button class="btn primary block" id="ok">${entry ? 'Spara' : onDone ? 'Lägg till i måltiden' : 'Lägg till'}</button>
        ${entry ? `<button class="btn danger block" id="del">Ta bort</button>` : ''}
      </div>`,
    onMount(a) {
      const g = a.body.querySelector('#g');
      const upd = () => { grams = Math.max(1, Math.round(parseFloat(String(g.value).replace(',', '.')) || grams)); g.value = grams; const s = scale(food.per100, grams); a.body.querySelector('#k').textContent = fmt(s.kcal); a.body.querySelector('#gl').textContent = grams + ' ' + unit; a.body.querySelector('#ml').innerHTML = macroLine(s); a.body.querySelectorAll('[data-g]').forEach(c => c.classList.toggle('active', +c.dataset.g === grams)); };
      g.addEventListener('input', () => { label = ''; upd(); });
      a.body.querySelector('#g-m').onclick = () => { g.value = Math.max(1, grams - (grams > 50 ? 10 : 5)); label = ''; upd(); haptic(); };
      a.body.querySelector('#g-p').onclick = () => { g.value = grams + (grams >= 50 ? 10 : 5); label = ''; upd(); haptic(); };
      a.body.querySelectorAll('[data-g]').forEach(c => c.onclick = () => { g.value = c.dataset.g; label = c.dataset.l; upd(); haptic(); });
      bindSeg(a.body, 'data-meal', v => curMeal = v);
      a.body.querySelector('#fav').onclick = e => { const on = toggleFavorite(food); e.currentTarget.innerHTML = on ? I.starFill : I.star; e.currentTarget.style.color = on ? 'var(--accent-2)' : 'var(--text-3)'; haptic(); };
      a.body.querySelector('#del')?.addEventListener('click', async () => { if (await confirmSheet({ title: 'Ta bort posten?', text: food.name, okText: 'Ta bort', danger: true })) { removeEntry(date, entry.id); a.close(); toast('Borttagen'); } });
      a.body.querySelector('#ok').onclick = () => {
        const s = scale(food.per100, grams);
        const data = { meal: curMeal, name: food.name, brand: food.brand || '', grams, ...s, per100: food.per100, foodKey: food.key, group: food.group || '', emoji: foodEmoji(food), portionLabel: label, image: food.image || '', liquid: !!food.liquid, source: food.source === 'off' ? 'barcode' : food.source === 'custom' ? 'custom' : 'search' };
        haptic('success');
        if (onDone) { onDone(data); a.close(); return; }
        if (entry) { updateEntry(date, entry.id, { meal: curMeal, grams, ...s, portionLabel: label }); toast('Sparat', 'good'); closeAllSheets(); }
        else { const e = addEntry(date, data); pushRecent({ ...food, lastGrams: grams }); closeAllSheets(); undoToast(`${food.name} · ${fmt(s.kcal)} kcal`, date, [e.id]); }
      };
    },
  });
}

// ---------- Redigera befintlig post ----------
export function openEntry(date, e) {
  if (e.per100) return openPortionSheet({ key: e.foodKey || 'entry:' + e.id, name: e.name, brand: e.brand, per100: e.per100, group: e.group, image: e.image, source: e.source, liquid: e.liquid }, { meal: e.meal, date, entry: e });
  openQuickAdd({ meal: e.meal, date, entry: e });
}

// ---------- Snabbinlägg ----------
export function openQuickAdd({ meal = guessMeal(), date = todayKey(), entry = null } = {}) {
  let curMeal = entry?.meal || meal;
  openSheet({
    title: entry ? 'Redigera' : 'Snabbt inlägg',
    html: `<div class="field"><label>Vad åt du?</label><input class="input" id="qn" placeholder="T.ex. lunch på restaurang" value="${esc(entry?.name || '')}"></div>
      <div class="field mt-2"><label>Kalorier</label><div class="input-wrap"><input class="input big" id="qk" inputmode="numeric" placeholder="0" value="${entry?.kcal || ''}"><span class="suffix">kcal</span></div></div>
      <div class="row mt-2" style="gap:8px">
        ${['protein', 'carbs', 'fat'].map(k => `<div class="field grow"><label>${{ protein: 'Protein', carbs: 'Kolh.', fat: 'Fett' }[k]}</label><div class="input-wrap"><input class="input" id="q-${k}" inputmode="decimal" placeholder="–" value="${entry?.[k] || ''}"><span class="suffix">g</span></div></div>`).join('')}
      </div>
      <div class="eyebrow mt-3" style="margin-bottom:8px">Måltid</div>${mealSeg(curMeal)}
      <div class="col mt-4"><button class="btn primary block" id="ok">${entry ? 'Spara' : 'Lägg till'}</button>${entry ? '<button class="btn danger block" id="del">Ta bort</button>' : ''}</div>`,
    onMount(a) {
      bindSeg(a.body, 'data-meal', v => curMeal = v);
      setTimeout(() => a.body.querySelector(entry ? '#qn' : '#qk').focus(), 380);
      a.body.querySelector('#del')?.addEventListener('click', async () => { if (await confirmSheet({ title: 'Ta bort posten?', text: entry.name, okText: 'Ta bort', danger: true })) { removeEntry(date, entry.id); a.close(); } });
      a.body.querySelector('#ok').onclick = () => {
        const num = id => parseFloat(String(a.body.querySelector(id).value).replace(',', '.')) || 0;
        const kcal = num('#qk'); if (!kcal) { toast('Ange kalorier', 'bad'); return; }
        const data = { meal: curMeal, name: a.body.querySelector('#qn').value.trim() || 'Snabbinlägg', kcal, protein: num('#q-protein'), carbs: num('#q-carbs'), fat: num('#q-fat'), source: 'manual', emoji: '⚡' };
        haptic('success');
        if (entry) { updateEntry(date, entry.id, data); toast('Sparat', 'good'); a.close(); }
        else { const e = addEntry(date, data); a.close(); undoToast(`${fmt(kcal)} kcal tillagt`, date, [e.id]); }
      };
    },
  });
}

// ---------- Eget livsmedel ----------
export function openCustomFoodSheet(prefill = '', onCreated = null) {
  openSheet({
    title: 'Eget livsmedel',
    html: `<div class="field"><label>Namn</label><input class="input" id="cn" value="${esc(prefill)}" placeholder="T.ex. Mammas lasagne"></div>
      <div class="field mt-2"><label>Märke (valfritt)</label><input class="input" id="cb" placeholder=""></div>
      <div class="eyebrow mt-3" style="margin-bottom:8px">Näring per 100 g</div>
      <div class="row" style="gap:8px">${[['kcal', 'kcal', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Kolh.', 'g'], ['fat', 'Fett', 'g']].map(([k, l, u]) => `<div class="field grow"><label>${l}</label><div class="input-wrap"><input class="input" id="c-${k}" inputmode="decimal" placeholder="0"><span class="suffix">${u}</span></div></div>`).join('')}</div>
      <div class="row mt-2" style="gap:8px"><div class="field grow"><label>Portion (valfritt)</label><input class="input" id="c-sl" placeholder="1 portion"></div><div class="field" style="width:120px"><label>gram</label><input class="input" id="c-sg" inputmode="numeric" placeholder="250"></div></div>
      <button class="btn primary block mt-4" id="ok">Spara livsmedel</button>`,
    onMount(a) {
      setTimeout(() => a.body.querySelector(prefill ? '#c-kcal' : '#cn').focus(), 380);
      a.body.querySelector('#ok').onclick = () => {
        const v = id => parseFloat(String(a.body.querySelector(id).value).replace(',', '.')) || 0;
        const name = a.body.querySelector('#cn').value.trim(); if (!name) { toast('Ange ett namn', 'bad'); return; }
        const per100 = { kcal: Math.round(v('#c-kcal') || (v('#c-protein') * 4 + v('#c-carbs') * 4 + v('#c-fat') * 9)), protein: v('#c-protein'), carbs: v('#c-carbs'), fat: v('#c-fat') };
        const sg = v('#c-sg');
        const f = addCustomFood({ name, brand: a.body.querySelector('#cb').value.trim(), per100, source: 'custom', serving: sg ? { label: a.body.querySelector('#c-sl').value.trim() || '1 portion', grams: sg } : null });
        haptic('success'); toast('Sparat', 'good'); a.close(); onCreated && onCreated(f);
      };
    },
  });
}

// ---------- Streckkod ----------
export function openScanner({ meal = guessMeal(), date = todayKey() } = {}) {
  const live = canLiveScan();
  let scanner = null, closed = false, lastMiss = '', busy = false;
  openSheet({
    full: live, title: 'Skanna streckkod',
    html: live ? `<div class="scanner"><video autoplay muted playsinline id="vid"></video><div class="reticle"></div></div>
        <p class="small muted center mt-2" id="msg">Håll streckkoden inom ramen</p>
        <div class="row mt-2" style="gap:8px"><button class="btn sm grow" id="photo">${I.camera} Fota koden</button><button class="btn sm grow" id="manual">Skriv koden</button></div>`
      : `<div class="notice">Kameraläsning kräver https. Fota streckkoden så läser vi av bilden.</div>
        <div class="col mt-3"><button class="btn primary block" id="photo">${I.camera} Fota streckkoden</button><button class="btn block" id="manual">Skriv koden manuellt</button></div>
        <p class="small muted mt-2 center" id="msg"></p>`,
    onMount(a) {
      const msg = a.body.querySelector('#msg');
      const found = async code => {
        if (busy) return; busy = true;
        msg.innerHTML = `<span class="spinner" style="display:inline-block;vertical-align:middle"></span> Slår upp ${esc(code)}…`;
        haptic();
        try {
          const f = await lookupBarcode(code);
          if (f) { a.close(); openPortionSheet(f, { meal, date }); return true; }
          msg.textContent = `Koden ${code} finns inte i Open Food Facts ännu. Sök eller skapa eget livsmedel.`; busy = false; return false;
        } catch { msg.textContent = 'Ingen kontakt med Open Food Facts – kontrollera uppkopplingen.'; busy = false; return false; }
      };
      if (live) {
        // Skannern fortsätter efter en miss (samma kod provas inte igen) och stoppas även om arket stängdes innan kameran hann starta
        startScanner(a.body.querySelector('#vid'), code => { if (busy || code === lastMiss) return; found(code).then(ok => { if (!ok) lastMiss = code; }); }).then(s => { scanner = s; if (closed) s.stop(); }).catch(e => { msg.textContent = 'Kameran kunde inte startas: ' + (e.message || e); });
      }
      a.body.querySelector('#photo').onclick = async () => {
        scanner?.stop();
        const file = await pickPhoto({ capture: true }); if (!file) return;
        msg.textContent = 'Läser av bilden…';
        const code = await decodeBarcodeFromImage(file).catch(() => null);
        if (code) found(code); else msg.textContent = 'Hittade ingen streckkod i bilden – prova närmare och i bra ljus.';
      };
      a.body.querySelector('#manual').onclick = () => openSheet({ title: 'Streckkod', html: `<div class="field"><input class="input big" id="ean" inputmode="numeric" placeholder="7310865004703"></div><button class="btn primary block mt-3" id="ok">Slå upp</button>`, onMount(s) { setTimeout(() => s.body.querySelector('#ean').focus(), 380); s.body.querySelector('#ok').onclick = () => { const c = s.body.querySelector('#ean').value.replace(/\D/g, ''); if (c.length >= 8) { s.close(); found(c); } else toast('En streckkod har 8–13 siffror', 'bad'); }; } });
    },
    onClose() { closed = true; scanner?.stop(); },
  });
}

// ---------- Vikt ----------
export function openWeightSheet(date = todayKey()) {
  const lw = latestWeight();
  let kg = state.weights.find(w => w.date === date)?.kg || lw?.kg || state.profile.weightKg || 70;
  openSheet({
    title: 'Väg in',
    html: `<p class="lead">Väg dig helst på morgonen, efter toaletten och före frukost – då blir trenden tydligast.</p>
      <div class="slider-block"><div class="val"><span id="wv">${fmt(kg, 1)}</span><small>kg</small></div>
      <div class="row" style="justify-content:center;gap:10px;margin-top:6px">
        <button class="icon-btn" data-d="-1">−1</button><button class="icon-btn" data-d="-0.1">−0,1</button><button class="icon-btn" data-d="0.1">+0,1</button><button class="icon-btn" data-d="1">+1</button>
      </div>
      <input type="range" id="wr" min="${Math.max(30, Math.round(kg - 15))}" max="${Math.round(kg + 15)}" step="0.1" value="${kg}"></div>
      <div class="card mt-2" style="padding:12px 14px"><div class="eyebrow" style="margin-bottom:6px">Din kurva · 30 dagar</div><div id="w-chart">${weightSpark([...state.weights.filter(w => w.date !== date), { date, kg }], { days: 30, goal: state.profile.goal === 'maintain' ? null : state.profile.targetWeightKg, height: 64 })}</div>${lw && lw.date !== date ? `<div class="small muted mt-1" id="w-diff">${kg - lw.kg > 0 ? '+' : ''}${fmt(kg - lw.kg, 1)} kg sedan ${fmtDate(lw.date)}</div>` : ''}</div>
      <button class="btn primary block mt-3" id="ok">Spara ${date === todayKey() ? 'dagens' : ''} vikt</button>`,
    onMount(a) {
      const r = a.body.querySelector('#wr'), v = a.body.querySelector('#wv');
      const set = x => { kg = Math.round(x * 10) / 10; v.textContent = fmt(kg, 1); r.value = kg; const ch = a.body.querySelector('#w-chart'); if (ch) ch.innerHTML = weightSpark([...state.weights.filter(w => w.date !== date), { date, kg }], { days: 30, goal: state.profile.goal === 'maintain' ? null : state.profile.targetWeightKg, height: 64 }); const d = a.body.querySelector('#w-diff'); if (d && lw) d.textContent = `${kg - lw.kg > 0 ? '+' : ''}${fmt(kg - lw.kg, 1)} kg sedan ${fmtDate(lw.date)}`; };
      r.addEventListener('input', () => set(+r.value));
      a.body.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { set(kg + +b.dataset.d); haptic(); });
      a.body.querySelector('#ok').onclick = () => { addWeight(kg, date); haptic('success'); toast(`Vikt sparad: ${fmt(kg, 1)} kg`, 'good'); a.close(); };
    },
  });
}

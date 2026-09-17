// Idag: kaloriring, makron, måltider, vatten, vikt, insikter
import { state, dayTotals, day, setWater, latestWeight, streak, photoURL } from '../store.js?v=202609171301';
import { esc, fmt, ring, animateIn, macroBars, MEALS, meal as mealCfg, greeting, todayKey, addDays, fmtDate, haptic, initials, countUp, timeHM, guessMeal, weightSpark, isCute, mascot, cute } from '../components.js?v=202609171301';
import { I } from '../icons.js?v=202609171301';
import { foodEmoji, fmtSize } from '../foods.js?v=202609171301';
import { aiStatus } from '../ai.js?v=202609171301';
import { weightTrend } from '../nutrition.js?v=202609171301';
import * as Log from './log.js?v=202609171301';
import { pickForSlot, recipeImage, openRecipe, logRecipeAs } from './suggest.js?v=202609171301';
import { navigate } from '../app.js?v=202609171301';

let viewDate = todayKey();
export function dateChanged() { const t = todayKey(); if (viewDate !== t && viewDate < t && wasToday) { viewDate = t; return true; } return false; }
let wasToday = true;
export function setDate(k) { viewDate = k; wasToday = k === todayKey(); }
export const currentDate = () => viewDate;

export function render(root) {
  const p = state.profile, t = state.targets;
  const tot = dayTotals(viewDate);
  const d = day(viewDate);
  const remaining = t.kcal - tot.kcal;
  const pct = tot.kcal / t.kcal;
  const over = remaining < 0;
  const isToday = viewDate === todayKey();
  const ai = aiStatus();
  const st = streak();
  const lw = latestWeight();
  // Måltider enligt planen – plus alltid de som faktiskt har poster (frukost loggad i efterhand får aldrig bli osynlig)
  const planSlots = state.profile.mealsPerDay === 2 ? ['lunch', 'dinner', 'snack'] : ['breakfast', 'lunch', 'dinner', 'snack'];
  const slots = ['breakfast', 'lunch', 'dinner', 'snack'].filter(id => planSlots.includes(id) || dayTotals(viewDate).byMeal[id]);

  root.innerHTML = `<div class="page">
    <div class="row between">
      <div>
        <div class="eyebrow">${esc(fmtDate(viewDate, true))}</div>
        <h1 class="h1" style="margin-top:2px">${esc(isToday ? greeting(p.name) : 'Dagbok')}${isCute() ? ` <span class="mascot" aria-hidden="true">${mascot(isToday ? todayKey() : viewDate)}</span>` : ''}</h1>
      </div>
      <div class="row gap-1">
        ${st > 0 ? `<span class="pill accent streak">${I.flame}<span>${st}</span></span>` : ''}
        <button class="avatar ${isCute() ? 'emoji' : ''}" id="go-profile" aria-label="Profil">${isCute() ? '🐱' : esc(initials(p.name))}</button>
      </div>
    </div>
    <div class="row between mt-2" style="gap:6px">
      <button class="icon-btn" id="day-prev" aria-label="Föregående dag">${I.chevL}</button>
      <label class="btn sm ghost grow" style="position:relative;overflow:hidden" aria-label="Välj datum">${isToday ? 'Idag' : esc(fmtDate(viewDate, true))}<span class="faint" style="margin-left:6px">▾</span><input type="date" id="day-pick" value="${viewDate}" max="${todayKey()}" style="position:absolute;inset:0;opacity:0;width:100%;height:100%"></label>
      <button class="icon-btn" id="day-next" aria-label="Nästa dag" ${isToday ? 'disabled' : ''}>${I.chevR}</button>
    </div>
    ${isToday ? '' : `<div class="center mt-1"><button class="link-btn small" id="day-today">Tillbaka till idag</button></div>`}

    <div class="card accent mt-3">
      <div class="row" style="gap:18px">
        ${ring({ size: 164, stroke: 13, pct, over, center: `<div class="n" id="ring-num">0</div><div class="l">${over ? 'kcal över' : 'kcal kvar'}</div>` })}
        <div class="grow col" style="gap:14px">
          <div><div class="eyebrow">Ätit</div><div class="hero-num">${fmt(tot.kcal)}</div></div>
          <div><div class="eyebrow">Mål</div><div class="h3">${fmt(t.kcal)} kcal</div></div>
          ${t.method === 'adaptive' ? '<span class="pill good" style="align-self:flex-start">Adaptivt mål</span>' : ''}
        </div>
      </div>
      <div class="mt-3">${macroBars(t, tot)}</div>
    </div>

    ${!ai.configured ? `<button class="card pressable mt-2" id="ai-setup" style="width:100%;text-align:left"><div class="insight"><div class="ic">📸</div><div class="grow"><div class="t">Aktivera fotoanalysen</div><div class="d">Lägg in en gratis AI-nyckel så kan du fota maten och få kalorier direkt. Tar en minut.</div></div>${I.chevR}</div></button>` : ''}
    ${state.aiQueue.length ? `<div class="notice warn mt-2">📷 ${state.aiQueue.length} foto${state.aiQueue.length > 1 ? 'n' : ''} väntar på analys – körs automatiskt när du är online${ai.configured ? '' : ' och har en AI-nyckel'}.</div>` : ''}

    ${isToday && remaining > 150 ? nextMealCard(tot, t, remaining) : ''}

    <div class="section">
      <div class="section-head"><h2 class="h2">Måltider</h2><span class="small muted">${fmt(tot.kcal)} / ${fmt(t.kcal)} kcal</span></div>
      <div id="meals">${slots.map(id => mealCard(id, tot, t)).join('')}</div>
    </div>

    <div class="section">
      <div class="card">
        <div class="row between"><div class="row gap-1"><span style="color:var(--water)">${I.drop}</span><div><div class="h3">Vatten</div><div class="small muted">${d.water} av ${t.waterGlasses} glas · ${fmt(d.water * 0.25, 2).replace(',00', '')} l</div></div></div>
          <div class="row" style="gap:6px"><button class="icon-btn" id="w-minus" aria-label="Ta bort glas">−</button><button class="icon-btn accent" id="w-plus" aria-label="Lägg till glas">+</button></div></div>
        <div class="water-row">${Array.from({ length: t.waterGlasses }, (_, i) => `<button class="glass ${i < d.water ? 'on' : ''}" data-i="${i}" aria-label="Glas ${i + 1}">${i < d.water ? '💧' : ''}</button>`).join('')}</div>
      </div>
    </div>

    <div class="section">
      <div class="card">
        <div class="row between">
          <div class="row gap-1"><span style="color:var(--accent-2)">${I.scale}</span><div><div class="h3">Vikt</div><div class="small muted">${lw ? `Senast ${fmt(lw.kg, 1)} kg · ${fmtDate(lw.date)}` : 'Ingen vägning ännu'}${trendText()}</div></div></div>
          <button class="btn sm primary" id="log-weight">Väg in</button>
        </div>
        ${state.weights.length >= 2 ? `<div class="mt-2" id="w-spark" role="button">${weightSpark(state.weights, { days: 30, goal: p.goal === 'maintain' ? null : p.targetWeightKg })}<div class="row between small muted mt-1"><span>30 dagar${p.goal !== 'maintain' ? ' · streckad = mål ' + fmt(p.targetWeightKg, 1) + ' kg' : ''}</span><span style="color:var(--accent)">Hela diagrammet →</span></div></div>` : ''}
      </div>
    </div>

    <div class="section">${insightCard(tot, t, remaining)}</div>
  </div>`;

  countUp(root.querySelector('#ring-num'), Math.abs(remaining), { dur: 900 });
  animateIn(root);
  root.querySelector('#go-profile').addEventListener('click', () => navigate('profile'));
  root.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => { haptic(); Log.openPortionSheet(state.recents[+b.dataset.quick], { meal: guessMeal(), date: viewDate }); }));
  root.querySelector('#ai-setup')?.addEventListener('click', () => { navigate('profile'); setTimeout(() => document.getElementById('ai-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); });
  root.querySelector('#day-prev').addEventListener('click', () => { setDate(addDays(viewDate, -1)); render(root); });
  root.querySelector('#day-next').addEventListener('click', () => { setDate(addDays(viewDate, 1)); render(root); });
  root.querySelector('#day-today')?.addEventListener('click', () => { setDate(todayKey()); render(root); });
  root.querySelector('#day-pick').addEventListener('change', e => { if (e.target.value) { setDate(e.target.value); render(root); } });
  root.querySelector('#w-plus').addEventListener('click', () => { haptic(); setWater(viewDate, d.water + 1); });
  root.querySelector('#w-minus').addEventListener('click', () => { haptic(); setWater(viewDate, d.water - 1); });
  root.querySelectorAll('.glass').forEach(g => g.addEventListener('click', () => { haptic(); const i = +g.dataset.i; setWater(viewDate, i < d.water && i === d.water - 1 ? i : i + 1); }));
  root.querySelector('#log-weight').addEventListener('click', () => Log.openWeightSheet(viewDate));
  root.querySelector('#w-spark')?.addEventListener('click', () => navigate('progress'));
  root.querySelectorAll('[data-add-meal]').forEach(b => b.addEventListener('click', () => Log.openAddSheet(b.dataset.addMeal, viewDate)));
  root.querySelectorAll('[data-entry]').forEach(b => b.addEventListener('click', () => { const e = day(viewDate).entries.find(x => x.id === b.dataset.entry); if (e) Log.openEntry(viewDate, e); }));
  root.querySelector('#insight-cta')?.addEventListener('click', () => navigate('suggest'));
  root.querySelector('#nm-open')?.addEventListener('click', () => { if (nextPick) openRecipe(nextPick); });
  root.querySelector('#nm-log')?.addEventListener('click', e => { e.stopPropagation(); if (nextPick) logRecipeAs(nextPick, nextSlot); });
  root.querySelector('#nm-more')?.addEventListener('click', e => { e.stopPropagation(); navigate('suggest'); });
  // Fotominiatyrer laddas asynkront från IndexedDB
  root.querySelectorAll('img[data-photo]').forEach(async img => { const u = await photoURL(img.dataset.photo); if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('div'), { className: 'ico', textContent: '📷' })); });
}
let nextPick = null, nextSlot = null;
function nextMealCard(tot, t, remaining) {
  const order = ['breakfast', 'lunch', 'dinner', 'snack'];
  const g = guessMeal();
  nextSlot = !tot.byMeal[g] ? g : (order.slice(order.indexOf(g) + 1).find(m => !tot.byMeal[m]) || 'snack');
  const rem = { kcal: remaining, protein: t.protein - tot.protein, carbs: t.carbs - tot.carbs, fat: t.fat - tot.fat };
  nextPick = pickForSlot(nextSlot, rem, state.profile.goal === 'gain' ? 'muscle' : 'lose');
  if (!nextPick) return '';
  const src = recipeImage(nextPick);
  return `<div class="section"><div class="section-head"><h2 class="h2">Nästa: ${esc(mealCfg(nextSlot).name)}</h2><button class="link-btn" id="nm-more">Fler förslag →</button></div>
    <div class="card pressable" id="nm-open" role="button"><div class="row" style="gap:12px;align-items:flex-start">
      <div style="position:relative;flex:0 0 auto"><div class="recipe-card-img" style="display:grid;place-items:center;font-size:30px">${nextPick.emoji || '🍽️'}</div>${src ? `<img class="recipe-card-img" src="${esc(src)}" alt="" style="position:absolute;inset:0" onerror="this.style.display='none'">` : ''}</div>
      <div class="grow"><div class="h3">${esc(nextPick.title)}</div><div class="small muted" style="margin-top:2px">${esc(nextPick.d || '')}</div><div class="row gap-1 mt-1 small num" style="color:var(--text-2)"><b style="color:var(--text)">${fmt(nextPick.kcal)} kcal</b><span>P ${fmt(nextPick.protein)}</span>${nextPick.min ? `<span>⏱ ${nextPick.min} min</span>` : ''}<span class="tag good">index ${nextPick.index}</span></div></div>
    </div><div class="row mt-2" style="gap:8px"><button class="btn sm primary grow" id="nm-log">${I.plus} Logga</button><button class="btn sm grow">Recept & video</button></div></div></div>`;
}
function trendText() {
  const tr = weightTrend(state.weights, 7);
  if (!tr) return '';
  const v = tr.perWeek;
  return ` · ${v > 0 ? '+' : ''}${fmt(v, 1)} kg/vecka`;
}
function mealCard(id, tot, t) {
  const m = mealCfg(id), bm = tot.byMeal[id] || { kcal: 0, entries: [] };
  const share = state.profile.mealsPerDay === 3 && id === 'snack' ? 0 : m.share;
  const target = Math.round(t.kcal * (state.profile.mealsPerDay === 2 ? { lunch: .45, dinner: .45, snack: .1 }[id] || 0 : share));
  return `<div class="card meal">
    <div class="meal-head" data-add-meal="${id}" role="button" tabindex="0" aria-label="Lägg till i ${esc(m.name)}">
      <div class="ic">${m.icon}</div>
      <div><div class="t">${esc(m.name)}</div><div class="s">${target ? `Riktmärke ${fmt(target)} kcal` : 'Vid behov'}</div></div>
      <div class="kcal">${bm.kcal ? fmt(bm.kcal) : ''}</div>
      <span class="icon-btn accent round" aria-hidden="true">${I.plus}</span>
    </div>
    ${bm.entries.length ? `<div class="entries">${bm.entries.map(entryRow).join('')}</div>` : `<div class="empty-line">${cute('Inget loggat ännu', id)}</div>`}
  </div>`;
}
function entryRow(e) {
  const sub = [e.portionLabel && e.source === 'photo' ? e.portionLabel : e.grams ? `${fmt(e.grams)} ${e.liquid ? 'ml' : 'g'}` : (e.portionLabel || ''), e.brand || '', e.source === 'photo' ? '📸' : e.source === 'text' ? '✍️' : '', timeHM(e.time)].filter(Boolean).join(' · ');
  const icon = e.photoId ? `<img class="thumb" data-photo="${esc(e.photoId)}" alt="">` : e.image ? `<img class="thumb" src="${esc(e.image)}" alt="" loading="lazy">` : `<div class="ico">${e.emoji || foodEmoji({ name: e.name, group: e.group })}</div>`;
  return `<button class="entry" data-entry="${e.id}">${icon}<div class="grow"><div class="n ellipsis">${esc(e.name)}</div><div class="s ellipsis">${esc(sub)}</div></div><div class="k">${fmt(e.kcal)}<small> kcal</small></div></button>`;
}
function insightCard(tot, t, remaining) {
  const h = new Date().getHours();
  const pLeft = t.protein - tot.protein;
  let icon = '💡', title = '', text = '', cta = '';
  if (tot.count === 0) { icon = '🌱'; title = 'Ny dag, rent blad'; text = 'Logga din första måltid – snabbast är att fota tallriken.'; }
  else if (remaining < 0) { icon = '🧘', title = 'Lite över idag'; text = `Du ligger ${fmt(-remaining)} kcal över målet. En dag gör ingen skillnad – veckosnittet räknas. Imorgon är en ny chans.`; }
  else if (pLeft > 40 && h >= 14) { icon = '🥚'; title = 'Proteinet ligger efter'; text = `${fmt(pLeft)} g kvar till proteinmålet. Kvarg, ägg, kyckling eller fisk fyller på snabbt.`; cta = 'Visa förslag'; }
  else if (remaining > 0 && remaining < 250 && h >= 17) { icon = '✨'; title = 'Nästan i mål'; text = `${fmt(remaining)} kcal kvar – perfekt utrymme för en frukt eller lite kvarg.`; cta = 'Visa förslag'; }
  else if (remaining > 800 && h >= 18) { icon = '🍽️'; title = 'Gott om utrymme kvar'; text = `${fmt(remaining)} kcal kvar. Se till att äta ordentligt – för lite ger sug imorgon.`; cta = 'Vad ska jag äta?'; }
  else { icon = '👏'; title = 'Bra tempo'; text = `${fmt(remaining)} kcal kvar för dagen och makrona ser rimliga ut. Fortsätt så.`; }
  return `<div class="card"><div class="insight"><div class="ic">${icon}</div><div class="grow"><div class="t">${esc(title)}</div><div class="d">${esc(text)}</div>${cta ? `<button class="link-btn mt-1" id="insight-cta">${esc(cta)} →</button>` : ''}</div></div></div>`;
}

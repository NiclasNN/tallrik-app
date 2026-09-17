// Framsteg: viktkurva, kaloriförlopp, veckoöversikt, adaptiv förbrukning
import { state, dayTotals, setTargets, latestWeight, firstWeight, removeWeight } from '../store.js?v=202609171301';
import { esc, fmt, signed, todayKey, addDays, fmtShort, weekdayShort, haptic, toast, openSheet, segmented, bindSeg, confirmSheet, animateIn, fmtDate, parseKey, dateKey, cute } from '../components.js?v=202609171301';
import * as Home from './home.js?v=202609171301';
import { navigate } from '../app.js?v=202609171301';
import { I } from '../icons.js?v=202609171301';
import { adaptiveTDEE, computeTargets, weightTrend, bmi, bmiLabel } from '../nutrition.js?v=202609171301';
import * as Log from './log.js?v=202609171301';

let tab = 'weight', range = 30, calMonth = todayKey().slice(0, 7);
export function resetView() { tab = 'weight'; range = 30; calMonth = todayKey().slice(0, 7); }

export function render(root) {
  root.innerHTML = `<div class="page">
    <div class="eyebrow">Framsteg</div><h1 class="h1" style="margin-top:2px">${cute('Din utveckling', 'progress')}</h1>
    <div class="mt-3">${segmented([{ id: 'weight', name: 'Vikt' }, { id: 'kcal', name: 'Kalorier' }, { id: 'week', name: 'Vecka' }, { id: 'history', name: 'Historik' }], tab, 'data-tab')}</div>
    <div id="body" class="mt-3">${tab === 'weight' ? weightView() : tab === 'kcal' ? kcalView() : tab === 'week' ? weekView() : historyView()}</div>
  </div>`;
  bindSeg(root, 'data-tab', v => { tab = v; render(root); });
  bindSeg(root, 'data-range', v => { range = +v; render(root); });
  root.querySelector('#cal-prev')?.addEventListener('click', () => { calMonth = shiftMonth(calMonth, -1); haptic(); render(root); });
  root.querySelector('#cal-next')?.addEventListener('click', () => { calMonth = shiftMonth(calMonth, 1); haptic(); render(root); });
  root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { haptic(); Home.setDate(b.dataset.day); navigate('today'); }));
  root.querySelectorAll('[data-month]').forEach(b => b.addEventListener('click', () => { calMonth = b.dataset.month; haptic(); render(root); window.scrollTo(0, 0); }));
  root.querySelector('#log-weight')?.addEventListener('click', () => Log.openWeightSheet());
  root.querySelector('#apply-tdee')?.addEventListener('click', applyAdaptive);
  root.querySelectorAll('[data-delw]').forEach(b => b.addEventListener('click', async () => { if (await confirmSheet({ title: 'Ta bort vägning?', text: fmtDate(b.dataset.delw, true), okText: 'Ta bort', danger: true })) removeWeight(b.dataset.delw); }));
  root.querySelector('#all-weights')?.addEventListener('click', () => openSheet({ title: 'Alla vägningar', html: `<div class="list">${[...state.weights].reverse().map(w => `<div class="list-item"><span>${esc(fmtDate(w.date, true))}</span><span class="r"><b>${fmt(w.kg, 1)} kg</b><button class="icon-btn" data-delw="${w.date}" style="width:34px;height:34px">${I.trash}</button></span></div>`).join('')}</div>`, onMount(a) { a.body.querySelectorAll('[data-delw]').forEach(b => b.onclick = async () => { if (await confirmSheet({ title: 'Ta bort vägning?', text: fmtDate(b.dataset.delw, true), okText: 'Ta bort', danger: true })) { removeWeight(b.dataset.delw); a.close(); } }); } }));
  animateIn(root);
}

function weightView() {
  const p = state.profile, ws = state.weights;
  const lw = latestWeight(), fw = firstWeight();
  const tr = weightTrend(ws, 7);
  const goal = p.targetWeightKg;
  const b = lw ? bmi(p.heightCm, lw.kg) : null;
  const left = lw && goal ? lw.kg - goal : 0;
  const toGoal = p.goal === 'maintain' ? null : left;
  return `<div class="card">
      <div class="eyebrow">Nuvarande</div><div class="hero-num">${lw ? fmt(lw.kg, 1) : '–'} <small style="font-size:14px;color:var(--text-3)">kg</small></div>
      <div class="mt-2 mb-2">${segmented([{ id: '30', name: '30 dagar' }, { id: '90', name: '90 dagar' }, { id: '365', name: 'År' }, { id: '3650', name: 'Allt' }], String(range), 'data-range')}</div>
      ${weightChart(ws, range, goal)}
    </div>
    <div class="stat-grid mt-2">
      <div class="stat"><div class="l">Sedan start</div><div class="v">${lw && fw ? signed(lw.kg - fw.kg) : '–'} <small>kg</small></div></div>
      <div class="stat"><div class="l">Trend / vecka</div><div class="v">${tr ? signed(tr.perWeek) : '–'} <small>kg</small></div></div>
      <div class="stat"><div class="l">${toGoal === null ? 'Målvikt' : 'Kvar till målet'}</div><div class="v">${toGoal === null ? fmt(goal, 1) : fmt(Math.abs(toGoal), 1)} <small>kg</small></div></div>
      <div class="stat"><div class="l">BMI</div><div class="v">${b ? fmt(b, 1) : '–'} <small>${b ? bmiLabel(b) : ''}</small></div></div>
    </div>
    <div class="row mt-3" style="gap:8px"><button class="btn primary grow" id="log-weight">${I.scale} Väg in</button>${ws.length ? `<button class="btn grow" id="all-weights">Alla vägningar</button>` : ''}</div>
    ${tr && p.goal !== 'maintain' ? `<div class="notice mt-3">${trendComment(tr, p)}</div>` : ''}`;
}
function trendComment(tr, p) {
  const want = p.goal === 'lose' ? -p.paceKgPerWeek : p.paceKgPerWeek;
  const v = tr.perWeek;
  if (p.goal === 'lose') {
    if (v <= want * 0.7 && v >= want * 1.6) return `Trenden ${signed(v)} kg/vecka ligger nära planen (${signed(want)}). Bra jobbat – fortsätt så.`;
    if (v > 0) return `Vikten går uppåt (${signed(v)} kg/vecka). Vågen svänger med vätska och salt – titta på 2–3 veckors trend innan du ändrar något. Fliken Vecka visar om intaget ligger rätt.`;
    if (v > want * 0.7) return `Nedgången (${signed(v)} kg/vecka) är lite långsammare än planen. Helt ok – eller sänk med 100–150 kcal om du vill hålla tempot.`;
    return `Nedgången (${signed(v)} kg/vecka) är snabbare än planen. Ät gärna lite mer så du orkar och behåller muskler.`;
  }
  if (v < want * 0.5) return `Uppgången är långsam (${signed(v)} kg/vecka). Lägg till ett mellanmål med 200–300 kcal.`;
  if (v > want * 1.8) return `Uppgången är snabb (${signed(v)} kg/vecka) – mer än så blir mest fett. Dra ner något.`;
  return `Trenden ${signed(v)} kg/vecka ligger nära planen. Fortsätt så.`;
}
function weightChart(ws, days, goal) {
  const W = 340, H = 170, px = 10, py = 14;
  const today = todayKey();
  if (days >= 3650 && ws.length) days = Math.max(30, Math.round((parseKey(today) - parseKey(ws[0].date)) / 86400000) + 1);
  const start = addDays(today, -days);
  const pts = ws.filter(w => w.date >= start);
  if (pts.length < 2) return `<div class="empty-line center" style="padding:30px 0">${ws.length ? 'Väg dig några gånger till så ritas kurvan här.' : 'Väg in dig så börjar kurvan här.'}</div>`;
  const xs = pts.map(w => (Math.max(0, days - Math.round((new Date(today) - new Date(w.date)) / 86400000)) / days) * (W - 2 * px) + px);
  const vals = pts.map(w => w.kg).concat(goal ? [goal] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(0.6, (hi - lo) * 0.18); lo -= pad; hi += pad;
  const y = v => H - py - ((v - lo) / (hi - lo)) * (H - 2 * py);
  const path = pts.map((w, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${y(w.kg).toFixed(1)}`).join(' ');
  const area = `${path} L${xs[xs.length - 1].toFixed(1)},${H - py} L${xs[0].toFixed(1)},${H - py} Z`;
  const gridY = [lo + pad, (lo + hi) / 2, hi - pad];
  const longRange = days > 200;
  // Årsskiften som lodräta streck när kurvan spänner över mer än ett halvår
  let yearTicks = '';
  if (longRange) {
    const y0 = parseKey(start).getFullYear() + 1, y1 = parseKey(today).getFullYear();
    for (let yr = y0; yr <= y1; yr++) { const k = `${yr}-01-01`; const x = (Math.max(0, days - Math.round((parseKey(today) - parseKey(k)) / 86400000)) / days) * (W - 2 * px) + px; if (x > px + 24 && x < W - px - 24) yearTicks += `<line class="grid" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${py}" y2="${H - py}" stroke-dasharray="3 3"/><text class="lbl" x="${x.toFixed(1)}" y="${H - 1}" text-anchor="middle">${yr}</text>`; }
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    ${gridY.map(v => `<line class="grid" x1="${px}" x2="${W - px}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="lbl" x="${W - px}" y="${(y(v) - 4).toFixed(1)}" text-anchor="end">${fmt(v, 1)}</text>`).join('')}
    ${goal ? `<line class="goal" x1="${px}" x2="${W - px}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}"/><text class="lbl" x="${px}" y="${(y(goal) - 4).toFixed(1)}" style="fill:var(--good)">Mål ${fmt(goal, 1)}</text>` : ''}
    <path class="area" d="${area}"/><path class="line" d="${path}"/>
    ${pts.map((w, i) => i === pts.length - 1 ? `<circle class="dot" cx="${xs[i].toFixed(1)}" cy="${y(w.kg).toFixed(1)}" r="5"/>` : '').join('')}
    ${yearTicks}
    <text class="lbl" x="${px}" y="${H - 1}">${longRange ? monthYear(pts[0].date) : fmtShort(pts[0].date)}</text><text class="lbl" x="${W - px}" y="${H - 1}" text-anchor="end">${longRange ? monthYear(pts[pts.length - 1].date) : fmtShort(pts[pts.length - 1].date)}</text>
  </svg>`;
}
const monthYear = key => { const d = parseKey(key); return `${['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][d.getMonth()]} ${d.getFullYear()}`; };

function kcalView() {
  const t = state.targets, today = todayKey();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const rows = days.map(k => ({ k, kcal: dayTotals(k).kcal, logged: (state.days[k]?.entries.length || 0) > 0 }));
  const logged = rows.filter(r => r.logged && r.k !== today);
  const avg = logged.length ? logged.reduce((s, r) => s + r.kcal, 0) / logged.length : 0;
  const onTarget = logged.filter(r => Math.abs(r.kcal - t.kcal) <= t.kcal * 0.1).length;
  const W = 340, H = 160, px = 6, py = 16, bw = (W - 2 * px) / 14 - 4;
  const max = Math.max(t.kcal * 1.25, ...rows.map(r => r.kcal));
  const y = v => H - py - (v / max) * (H - 2 * py);
  return `<div class="card">
      <div class="row between mb-2"><div><div class="eyebrow">Snitt (loggade dagar)</div><div class="hero-num">${fmt(avg)} <small style="font-size:14px;color:var(--text-3)">kcal</small></div></div><div class="small muted" style="text-align:right">Mål ${fmt(t.kcal)} kcal<br>${onTarget} av ${logged.length} dagar inom ±10 %</div></div>
      <svg class="chart" viewBox="0 0 ${W} ${H}">
        <line class="goal" x1="${px}" x2="${W - px}" y1="${y(t.kcal).toFixed(1)}" y2="${y(t.kcal).toFixed(1)}"/>
        ${rows.map((r, i) => { const x = px + i * ((W - 2 * px) / 14) + 2; const h = Math.max(2, (H - py) - y(r.kcal)); return `<rect class="bar ${r.k === today ? 'today' : r.kcal > t.kcal * 1.1 ? 'over' : r.logged ? 'on' : ''}" x="${x.toFixed(1)}" y="${(H - py - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4"/>${i % 2 === 0 ? `<text class="lbl" x="${(x + bw / 2).toFixed(1)}" y="${H - 2}" text-anchor="middle">${weekdayShort(r.k)}</text>` : ''}`; }).join('')}
      </svg>
    </div>
    <div class="stat-grid mt-2">
      <div class="stat"><div class="l">Genomsnitt</div><div class="v">${fmt(avg)} <small>kcal</small></div></div>
      <div class="stat"><div class="l">Mot målet</div><div class="v">${logged.length ? signed(avg - t.kcal).replace(',0', '') : '–'} <small>kcal/dag</small></div></div>
      <div class="stat"><div class="l">Loggade dagar</div><div class="v">${logged.length} <small>av 13</small></div></div>
      <div class="stat"><div class="l">Snittprotein</div><div class="v">${logged.length ? fmt(logged.reduce((s, r) => s + dayTotals(r.k).protein, 0) / logged.length) : '–'} <small>g</small></div></div>
    </div>
    <div class="list mt-3">${rows.slice().reverse().slice(0, 7).map(r => `<div class="list-item"><span>${esc(fmtDate(r.k))}</span><span class="r ${r.logged ? '' : 'faint'}"><b>${r.logged ? fmt(r.kcal) : '–'}</b>&nbsp;kcal · P ${fmt(dayTotals(r.k).protein)} g</span></div>`).join('')}</div>`;
}

function weekReport(days, t) {
  const today = todayKey();
  const logged = days.filter(k => k !== today && dayTotals(k).count > 0);
  if (logged.length < 2) return `<div class="card"><div class="insight"><div class="ic">📅</div><div><div class="t">Din vecka</div><div class="d">Logga minst två dagar så får du en veckorapport med konkreta lärdomar här.</div></div></div></div>`;
  const avg = k => logged.reduce((s, d) => s + dayTotals(d)[k], 0) / logged.length;
  const kcal = avg('kcal'), prot = avg('protein');
  const onTarget = logged.filter(k => Math.abs(dayTotals(k).kcal - t.kcal) <= t.kcal * 0.1).length;
  const tr = weightTrend(state.weights, 7);
  const pts = [];
  const diff = kcal - t.kcal;
  pts.push(Math.abs(diff) <= t.kcal * 0.05 ? `✅ Snitt ${fmt(kcal)} kcal/dag – mitt i prick mot målet ${fmt(t.kcal)}.` : diff < 0 ? `✅ Snitt ${fmt(kcal)} kcal/dag, ${fmt(-diff)} under målet. ${-diff > t.kcal * 0.2 ? 'Mer än 20 % under är onödigt tufft – ät lite mer så orkar du hålla i.' : 'Bra tempo.'}` : `⚠️ Snitt ${fmt(kcal)} kcal/dag, ${fmt(diff)} över målet. Vanligaste orsaken är dryck, sås och kvällssnacks – kolla loggen på de tyngsta dagarna.`);
  pts.push(prot >= t.protein * 0.9 ? `✅ Protein ${fmt(prot)} g/dag – mättar och skyddar musklerna.` : `🥚 Protein ${fmt(prot)} g/dag, målet är ${fmt(t.protein)}. Ett proteinrikt mellanmål (kvarg, ägg, keso) per dag stänger gapet.`);
  if (tr) pts.push(tr.perWeek < -0.1 ? `📉 Vikten ${signed(tr.perWeek)} kg senaste veckan – i linje med planen.` : tr.perWeek > 0.2 ? `📈 Vikten ${signed(tr.perWeek)} kg – vätska och salt svänger, titta på trenden över 2–3 veckor innan du ändrar något.` : `⚖️ Vikten stabil (${signed(tr.perWeek)} kg).`);
  pts.push(logged.length >= 6 ? `🔥 ${logged.length} av 7 dagar loggade – det är så här resultat byggs.` : `📝 ${logged.length} av 7 dagar loggade. Ologgade dagar är oftast de tyngsta – fota även helgens mat.`);
  return `<div class="card accent"><div class="row between"><div class="h3">Din vecka</div><span class="pill">${onTarget}/${logged.length} dagar inom ±10 %</span></div><ul class="small mt-2" style="margin:0;padding-left:18px;line-height:1.6">${pts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
}
function weekView() {
  const t = state.targets, today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const dots = days.map(k => { const tot = dayTotals(k), logged = tot.count > 0; const hit = logged && Math.abs(tot.kcal - t.kcal) <= t.kcal * 0.1; return `<div><i class="${k === today ? 'today' : logged ? (hit ? 'hit' : 'miss') : ''}">${k === today ? '·' : logged ? (hit ? '✓' : '•') : ''}</i>${weekdayShort(k)}</div>`; }).join('');
  const logged = days.filter(k => dayTotals(k).count > 0 && k !== today);
  const avgM = k => logged.length ? logged.reduce((s, d) => s + dayTotals(d)[k], 0) / logged.length : 0;
  const a = adaptiveTDEE(state.days, state.weights, t);
  return `${weekReport(days, t)}
    <div class="card mt-2"><div class="h3">Senaste 7 dagarna</div><div class="week-dots">${dots}</div>
      <div class="small muted mt-2">✓ inom ±10 % av målet · • loggad men utanför</div></div>
    <div class="card mt-2"><div class="h3 mb-2">Snitt per loggad dag</div>
      ${['kcal', 'protein', 'carbs', 'fat'].map(k => { const v = avgM(k), g = t[k], p = Math.min(1, g ? v / g : 0); return `<div class="row between small" style="margin-top:8px"><span style="width:90px">${{ kcal: 'Kalorier', protein: 'Protein', carbs: 'Kolhydrater', fat: 'Fett' }[k]}</span><div class="pb grow"><i data-width="${(p * 100).toFixed(0)}%"></i></div><b class="num" style="width:110px;text-align:right">${fmt(v)} / ${fmt(g)} ${k === 'kcal' ? '' : 'g'}</b></div>`; }).join('')}
    </div>
    <div class="card mt-2 ${a.ok ? 'accent' : ''}">
      <div class="insight"><div class="ic">🧠</div><div class="grow">
        <div class="t">Din verkliga förbrukning</div>
        ${a.ok ? `<div class="d">Utifrån ${a.loggedDays} loggade dagar och ${a.weighIns} vägningar över ${a.span} dagar: du förbrukar ca <b>${fmt(a.tdee)} kcal/dag</b> (formeln sa ${fmt(t.tdee)}). Snittintag ${fmt(a.avgIntake)} kcal, vikttrend ${signed(a.slopePerWeek)} kg/vecka. Säkerhet: ${{ high: 'hög', medium: 'medel', low: 'låg' }[a.confidence]}.</div>
          ${Math.abs(a.tdee - t.tdee) >= 100 && a.confidence !== 'low' ? `<button class="btn sm primary mt-2" id="apply-tdee">Justera målet till ${fmt(computeTargets(state.profile, a.tdee).kcal)} kcal</button>` : '<div class="small mt-1" style="color:var(--good)">Planen stämmer bra – ingen justering behövs.</div>'}`
        : `<div class="d">Tallrik räknar ut din faktiska förbrukning från vikttrend och intag. Det behövs minst ${a.need.days} loggade dagar (du har ${a.loggedDays}) och ${a.need.weighIns} vägningar minst en vecka isär (du har ${a.weighIns}) under de senaste 4 veckorna.</div>`}
      </div></div>
    </div>`;
}
// ---- Historik: kalender per månad, tryck på en dag → Idag för den dagen ----
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
function shiftMonth(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function monthStats(ym) {
  const t = state.targets;
  const days = Object.keys(state.days).filter(k => k.startsWith(ym) && state.days[k].entries?.length);
  const kcal = days.map(k => dayTotals(k).kcal), prot = days.map(k => dayTotals(k).protein);
  const ws = state.weights.filter(w => w.date.startsWith(ym));
  return { logged: days.length, avgKcal: kcal.length ? kcal.reduce((a, b) => a + b, 0) / kcal.length : 0, avgProt: prot.length ? prot.reduce((a, b) => a + b, 0) / prot.length : 0, onTarget: kcal.filter(v => Math.abs(v - t.kcal) <= t.kcal * 0.1).length, wFirst: ws[0]?.kg, wLast: ws[ws.length - 1]?.kg };
}
function historyView() {
  const t = state.targets, today = todayKey();
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;     // måndag först
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div></div>');
  for (let d = 1; d <= daysIn; d++) {
    const k = `${calMonth}-${String(d).padStart(2, '0')}`;
    const tot = dayTotals(k), logged = tot.count > 0, future = k > today;
    const cls = !logged ? (future ? 'future' : 'empty') : Math.abs(tot.kcal - t.kcal) <= t.kcal * 0.1 ? 'hit' : tot.kcal > t.kcal * 1.1 ? 'over' : 'under';
    const w = state.weights.find(x => x.date === k);
    cells.push(`<button class="cal-day ${cls} ${k === today ? 'today' : ''}" data-day="${k}" ${future ? 'disabled' : ''}><span class="n">${d}</span>${logged ? `<span class="k">${Math.round(tot.kcal / 100) / 10}k</span>` : ''}${w ? '<span class="w">⚖</span>' : ''}</button>`);
  }
  const st = monthStats(calMonth);
  const months = [...new Set([...Object.keys(state.days).filter(k => state.days[k].entries?.length).map(k => k.slice(0, 7)), ...state.weights.map(w => w.date.slice(0, 7))])].sort().reverse();
  return `<div class="card">
      <div class="row between"><button class="icon-btn" id="cal-prev" aria-label="Föregående månad">${I.chevL}</button><div class="h3">${MONTHS[m - 1]} ${y}</div><button class="icon-btn" id="cal-next" aria-label="Nästa månad" ${calMonth >= today.slice(0, 7) ? 'disabled' : ''}>${I.chevR}</button></div>
      <div class="cal-head">${['må', 'ti', 'on', 'to', 'fr', 'lö', 'sö'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
      <div class="row gap-1 mt-2 small muted" style="flex-wrap:wrap"><span><i class="dot hit"></i> inom ±10 %</span><span><i class="dot under"></i> under</span><span><i class="dot over"></i> över</span><span>⚖ vägning</span></div>
    </div>
    <div class="stat-grid mt-2">
      <div class="stat"><div class="l">Loggade dagar</div><div class="v">${st.logged} <small>av ${daysIn}</small></div></div>
      <div class="stat"><div class="l">Inom målet</div><div class="v">${st.onTarget} <small>dagar</small></div></div>
      <div class="stat"><div class="l">Snitt kcal</div><div class="v">${st.logged ? fmt(st.avgKcal) : '–'}</div></div>
      <div class="stat"><div class="l">Vikt i månaden</div><div class="v">${st.wFirst != null ? `${signed((st.wLast || st.wFirst) - st.wFirst)} <small>kg</small>` : '–'}</div></div>
    </div>
    ${months.length > 1 ? `<div class="section"><div class="section-head"><h2 class="h2">Din resa</h2><span class="small muted">${months.length} månader</span></div><div class="list">${months.map(ym => { const ms = monthStats(ym); const [yy, mm] = ym.split('-').map(Number); return `<button class="list-item" data-month="${ym}"><div class="grow"><div class="t">${MONTHS[mm - 1]} ${yy}</div><div class="d">${ms.logged} dagar loggade${ms.logged ? ` · snitt ${fmt(ms.avgKcal)} kcal · ${ms.onTarget} inom mål` : ''}${ms.wFirst != null ? ` · vikt ${signed((ms.wLast || ms.wFirst) - ms.wFirst)} kg` : ''}</div></div>${I.chevR.replace('<svg', '<svg class="chev"')}</button>`; }).join('')}</div></div>` : ''}`;
}
async function applyAdaptive() {
  const a = adaptiveTDEE(state.days, state.weights, state.targets);
  if (!a.ok) return;
  const nt = computeTargets(state.profile, a.tdee);
  if (await confirmSheet({ title: 'Justera planen?', text: `Nytt dagsmål ${fmt(nt.kcal)} kcal (protein ${nt.protein} g, kolhydrater ${nt.carbs} g, fett ${nt.fat} g) baserat på din uppmätta förbrukning ${fmt(a.tdee)} kcal.`, okText: 'Justera' })) {
    setTargets({ ...nt, method: 'adaptive', tdee: a.tdee });
    haptic('success'); toast('Planen är uppdaterad', 'good');
  }
}

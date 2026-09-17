// Förslag 2.1: forskningsbaserade recept med steg, bilder och video – plus AI-recept (Groq), öppet recept-API och coach
import { state, dayTotals, addEntry, commit, save, addShopping, toggleShopping, removeShopping, clearShoppingDone, clearShopping } from '../store.js?v=202609171301';
import { esc, fmt, haptic, toast, openSheet, confirmSheet, MEALS, guessMeal, todayKey, segmented, bindSeg, closeAllSheets, cute } from '../components.js?v=202609171301';
import { I } from '../icons.js?v=202609171301';
import { RECIPES, RESEARCH, suggestMeals, weightLossIndex, indexReasons, violatesAvoid } from '../recipes.js?v=202609171301';
import { aiStatus, suggest as aiSuggest, ask as aiAsk, addKey, PROVIDERS, planDay } from '../ai.js?v=202609171301';
import { weightTrend } from '../nutrition.js?v=202609171301';
import { navigate } from '../app.js?v=202609171301';

let slot = null, focus = '', aiBusy = false, answer = '', asking = false, wish = '', media = null, mealQ = '', mealRes = null, mealBusy = false;
export function resetView() { slot = null; focus = ''; wish = ''; answer = ''; mealQ = ''; mealRes = null; shownIds.clear(); for (const k of Object.keys(autoTried)) delete autoTried[k]; feedCache = null; curatedCache = null; shown.length = 0; }
const shown = [];
// Receptström: AI-biblioteket växer för varje "Nya"; visade recept roteras bort så flödet alltid känns nytt
const shownIds = new Set();
const autoTried = {};
const normT = t => String(t || '').toLowerCase().replace(/[^a-zåäö0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function addToLibrary(recs) {
  const c = cache();
  const have = new Set(c.aiRecipes.map(r => normT(r.title)));
  const seenNow = new Set();
  // Engelska titlar (modellen tappar ibland språket) släpps inte in – appen är svensk
  const english = t => /\b(with|and|grilled|roasted|baked|steamed)\b/i.test(t) || (!/[åäö]/i.test(t) && (String(t).match(/\b(chicken|salad|soup|beef|salmon|rice|bowl|beans|shrimp|turkey|egg|eggs|oats|yogurt)\b/gi) || []).length >= 2);
  recs = recs.filter(r => !english(r.title || ''));
  const fresh = recs.filter(r => { const k = normT(r.title); if (!r.title || have.has(k) || seenNow.has(k)) return false; seenNow.add(k); return (r.kcal || 0) >= 50 && (r.ing || []).length > 0; });   // ofullständiga AI-svar (0 kcal, inga ingredienser) släpps inte in
  c.aiRecipes = [...fresh, ...c.aiRecipes].slice(0, 400);
  feedCache = null;
  commit('cache');
  return fresh;
}
function scoreFor(r, rem, slotId, focusId, unseenBonus = true) {
  let s = unseenBonus && shownIds.has(r.id) ? 0 : 60;
  const idx = weightLossIndex(r);
  s += focusId === 'lose' ? idx * 0.5 : focusId === 'health' ? idx * 0.3 : 0;
  const budget = Math.max(150, rem.kcal || 0);
  const ideal = slotId === 'snack' ? Math.min(budget, 250) : Math.min(budget, Math.max(350, budget * 0.85));
  s += Math.max(0, 30 - Math.abs((r.kcal || 0) - ideal) / Math.max(ideal, 200) * 45);
  if ((r.kcal || 0) > budget + 80) s -= 35;
  if (focusId === 'quick') s += (r.min || 99) <= 15 ? 25 : (r.min || 99) <= 20 ? 8 : -10;
  if (focusId === 'muscle') s += Math.min(30, (r.protein || 0) * 0.6);
  if ((rem.protein || 0) > 30) s += Math.min(15, (r.protein || 0) * 0.3);
  return s;
}
const feedScore = (r, rem) => scoreFor(r, rem, slot, focus);
// Bästa förslag för en måltid (används av Idag-vyn): AI-biblioteket först, annars kurerat
export function pickForSlot(slotId, rem, focusId = 'lose') {
  const p = state.profile;
  const pool = cache().aiRecipes.filter(r => (!r.slot || r.slot === slotId) && !violatesAvoid(r, p.avoid || []));
  if (pool.length) { const best = pool.map(r => ({ r, s: scoreFor(r, rem, slotId, focusId, false) })).sort((a, b) => b.s - a.s)[0].r; return { ...best, index: weightLossIndex(best), reasons: indexReasons(best) }; }
  return suggestMeals({ remaining: rem, slot: slotId, diet: p.diet, avoid: p.avoid, recentTitles: [], limit: 1, focus: focusId })[0] || null;
}
export const recipeImage = r => heroSrc(r);
export function logRecipeAs(r, slotId, quiet = false) { const prev = slot; slot = slotId; logRecipe(r, quiet); slot = prev; }
// Mängdskalning av ingredienser ("150 g kycklingfilé" ×2 → "300 g …", "½ avokado" ×2 → "1 avokado")
const FR = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
function fmtQty(v) { const r = Math.round(v * 4) / 4; const whole = Math.floor(r), frac = Math.round((r - whole) * 4) / 4; const fs = { 0.25: '¼', 0.5: '½', 0.75: '¾' }[frac]; if (!frac) return String(whole); return whole ? `${whole} ${fs}` : fs; }
const qty = num => FR[num] ?? parseFloat(String(num).replace(',', '.'));
// Skalar alla mängder på raden ("1 tomat, ½ gurka" ×2 → "2 tomat, 1 gurka") och intervall ("1–2 msk" ×2 → "2–4 msk")
export function scaleIng(text, n) { if (n === 1) return text; return String(text).replace(/(^|[,;+(]\s*)(\d+(?:[.,]\d+)?|[½¼¾⅓⅔])(?:\s*[–-]\s*(\d+(?:[.,]\d+)?))?(\s*)/g, (m, pre, a, b, sp) => pre + fmtQty(qty(a) * n) + (b ? '–' + fmtQty(qty(b) * n) : '') + (sp || ' ')); }
let curatedCache = null;
let feedCache = null;   // { key, ids } – strömmen ska inte blanda om sig vid varje omritning (bild laddad, post loggad …)
function aiFeed(rem, limit = 6) {
  const p = state.profile;
  const pool = cache().aiRecipes.filter(r => (!r.slot || r.slot === slot) && !violatesAvoid(r, p.avoid || []));
  const key = slot + '|' + focus;
  if (feedCache && feedCache.key === key) { const kept = feedCache.ids.map(id => pool.find(r => r.id === id)).filter(Boolean); if (kept.length === feedCache.ids.length) return kept.map(r => ({ ...r, index: weightLossIndex(r), reasons: indexReasons(r) })); }
  const list = pool.map(r => ({ r, s: feedScore(r, rem) })).sort((a, b) => b.s - a.s).slice(0, limit).map(x => ({ ...x.r, index: weightLossIndex(x.r), reasons: indexReasons(x.r) }));
  list.forEach(r => shownIds.add(r.id));
  feedCache = { key, ids: list.map(r => r.id) };
  return list;
}
const unseenCount = () => cache().aiRecipes.filter(r => (!r.slot || r.slot === slot) && !shownIds.has(r.id)).length;
const FOCUS = [{ id: 'lose', name: 'Viktnedgång' }, { id: 'health', name: 'Hälsa' }, { id: 'muscle', name: 'Muskler' }, { id: 'quick', name: 'Snabbt' }];
const cache = () => { state.cache ||= {}; state.cache.aiRecipes ||= []; state.cache.mealdb ||= {}; return state.cache; };
async function loadMedia() {
  if (media) return media;
  media = {};
  try { const v = await (await fetch('data/recipe-videos.json')).json(); for (const [id, video] of Object.entries(v)) { if (video) media[id] = { video }; } } catch {}
  return media;
}
// Videokatalog: förverifierade svenska matlagningsvideor. Appen matchar receptets ord mot katalogen → alltid inbäddad uppspelning.
let catalog = null;
export async function loadCatalog() { if (catalog) return catalog; try { catalog = await (await fetch('data/video-catalog.json')).json(); } catch { catalog = []; } return catalog; }
const STOPW = new Set(['med', 'och', 'på', 'i', 'till', 'av', 'en', 'ett', 'lätt', 'light', 'recept', 'som', 'för', 'the', 'and', 'with']);
const vtoks = s => String(s || '').toLowerCase().replace(/[^a-zåäö0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !STOPW.has(t));
const pfx = (a, b) => a === b || (a.length >= 6 && b.startsWith(a)) || (b.length >= 6 && a.startsWith(b));
const ADJ = new Set(['snabb', 'snabba', 'krämig', 'krämiga', 'enkel', 'enkla', 'nyttig', 'nyttiga', 'lätt', 'lätta', 'god', 'goda', 'härlig', 'grön', 'gröna', 'varm', 'kall', 'fräsch', 'proteinrik', 'proteinrika', 'ugnsbakad', 'ugnsbakade', 'ugnsrostade', 'stekt', 'grillad', 'rostad', 'rostade', 'hemgjord', 'hemgjorda', 'röd', 'vit', 'vegetarisk', 'veganska', 'vegansk', 'fullkorn', 'perfekt']);
export function bestVideos(r, n = 3) {
  if (!catalog?.length) return [];
  const title = vtoks(r.title), q = vtoks(r.youtubeQuery || ''), ing = vtoks((r.ing || []).slice(0, 5).join(' ')).filter(t => !/^\d/.test(t));
  const main = q[0] || title.find(t => !ADJ.has(t)) || title[0];
  return catalog.map(c => {
    let s = 0, matched = 0;
    for (const t of c.tokens) {
      let hit = false;
      if (title.includes(t)) { s += 14; hit = true; } else if (title.some(w => pfx(w, t))) { s += 6; hit = true; }
      if (q.includes(t)) { s += 10; hit = true; } else if (q.some(w => pfx(w, t))) { s += 4; hit = true; }
      if (ing.includes(t)) { s += 3; hit = true; }
      if (hit) matched++;
    }
    if (!matched) return { c, s: 0 };
    if (main && c.tokens.includes(main)) s += 10;
    s *= matched / c.tokens.length;                       // "kyckling curry" ska inte vinna på bara "kyckling"
    return { c, s };
  }).filter(x => x.s >= 12).sort((a, b) => b.s - a.s).slice(0, n).map(x => ({ id: x.c.id, title: x.c.title, channel: x.c.channel, score: Math.round(x.s) }));
}
const embed = (v, autoplay = false) => `<div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${esc(v.id)}?playsinline=1&rel=0&modestbranding=1${autoplay ? '&autoplay=1' : ''}" title="${esc(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
function videoBlock(list, active = 0) {
  if (!list.length) return `<div class="notice">Ingen passande video hittades i katalogen ännu.</div>`;
  const v = list[active];
  return `<div id="vid-box">${embed(v)}<div class="small muted mt-1">${esc(v.title)} · ${esc(v.channel)}</div>
    ${list.length > 1 ? `<div class="chips mt-2">${list.map((x, i) => `<button class="chip sm ${i === active ? 'active' : ''}" data-vid="${i}">${i === 0 ? (x.score >= 25 ? '★ Passar bäst' : 'Liknande rätt') : 'Alternativ ' + i}</button>`).join('')}</div>` : (list[0] && list[0].score < 25 && list[0].score !== 999 ? '<div class="small muted mt-1">Ingen video för exakt den här rätten – det här är en liknande.</div>' : '')}</div>`;
}
function bindVideos(root, list) {
  root.querySelectorAll('[data-vid]').forEach(b => b.onclick = () => { const i = +b.dataset.vid; const box = root.querySelector('#vid-box'); box.outerHTML = videoBlock(list, i); bindVideos(root, list); haptic(); });
}
// Bilder till AI-skapade recept: Openverse (öppet CC-bild-API, fungerar från webbläsaren, 200 anrop/dag anonymt). Bästa gratisalternativet
// när bildgenerering inte går att anropa från telefonen. Resultatet cachas på receptet.
const ovBusy = new Set();
const EN_STOP = new Set(['with', 'and', 'the', 'plate', 'bowl', 'photo', 'photography', 'overhead', 'top', 'view', 'served', 'fresh', 'garnished', 'close', 'closeup', 'natural', 'light', 'daylight', 'wooden', 'table', 'white', 'quick', 'easy', 'healthy', 'colorful', 'delicious', 'crispy', 'creamy', 'golden', 'juicy', 'tender', 'homemade', 'rustic', 'simple', 'tasty', 'vibrant', 'minimal', 'appetizing', 'style', 'food', 'dish', 'meal', 'shot', 'background', 'ceramic', 'sprinkled', 'topped', 'drizzled', 'sliced', 'chopped']);
async function openverseImage(query) {
  const words = String(query || '').toLowerCase().replace(/[^a-z ,]/g, ' ').split(/[ ,]+/).filter(w => w.length > 2 && !EN_STOP.has(w));
  if (!words.length) return '';
  const tryQ = async q => {
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=8&category=photograph&license_type=all-cc&mature=false`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return '';
    const j = await r.json();
    const qw = q.toLowerCase().split(' ').filter(w => w.length > 3 && w !== 'food');
    const ok = x => (x.width || 0) >= 500 && !/logo|icon|map|drawing|clipart|screenshot|restaurant|menu|sign|store|shop|interior/i.test(x.title || '') && qw.some(w => (x.title || '').toLowerCase().includes(w.slice(0, 5)));
    const hit = (j.results || []).find(ok);
    return hit ? (hit.thumbnail || hit.url) : '';
  };
  try { for (const n of [3, 2]) { if (words.length < n) continue; const src = await tryQ(words.slice(0, n).join(' ')); if (src) return src; } } catch {} return '';
}
// Först: mest lika kurerade recept (lokala, matchande bilder). Kräver att rättens huvudord matchar.
function similarCuratedImage(r) {
  const title = vtoks(r.title), q = vtoks(r.youtubeQuery || ''), ing = vtoks((r.ing || []).slice(0, 6).join(' ')).filter(t => !/^\d/.test(t));
  const main = q[0] || title.find(t => !ADJ.has(t)) || title[0];
  let best = null;
  for (const c of RECIPES) {
    const ct = vtoks(c.title);
    let s = 0;
    for (const t of ct) { if (title.includes(t)) s += 12; else if (title.some(w => pfx(w, t))) s += 5; if (ing.includes(t)) s += 2; }
    if (main && ct.some(t => pfx(t, main))) s += 10; else continue;      // utan huvudordet – ingen bild
    if (!best || s > best.s) best = { c, s };
  }
  return best && best.s >= 20 ? `img/recipes/${best.c.id}.jpg` : '';
}
// Reserv: TheMealDB har fina rättbilder – ta en liknande rätt utifrån huvudingrediensen
async function mealdbImage(query) {
  const words = String(query || '').toLowerCase().replace(/[^a-z ,]/g, ' ').split(/[ ,]+/).filter(w => w.length > 3 && !EN_STOP.has(w));
  if (!words.length) return '';
  const need = Math.min(2, words.length);   // bilden måste matcha minst två av orden (annars får varje "chicken …" samma foto)
  for (const w of words.slice(0, 3)) {
    try {
      const r = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(w)}`, { signal: AbortSignal.timeout(9000) }); const j = await r.json();
      const m = (j.meals || []).find(x => { const t = String(x.strMeal || '').toLowerCase(); return words.filter(q => t.includes(q)).length >= need; });
      if (m?.strMealThumb) return m.strMealThumb;
    } catch {}
  }
  return '';
}
function fillAiImages(root) {
  const c = cache();
  for (const r of c.aiRecipes.slice(0, 6)) {
    if (r.image || r.image === null || ovBusy.has(r.id)) continue;
    ovBusy.add(r.id);
    (async () => { let src = similarCuratedImage(r); if (!src) src = await mealdbImage(r.imageQuery || r.imgPrompt || r.title); if (!src) src = await openverseImage(r.imageQuery || r.imgPrompt || r.title); r.image = src || null; save(); ovBusy.delete(r.id); const img = root.querySelector(`img[data-hero="${r.id}"]`); if (img && src) { img.src = src; img.style.display = ''; } })();
  }
}
export const imgUrl = (prompt, { w = 768, h = 512, seed = 42 } = {}) => `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ', professional food photography, soft natural daylight, appetizing, no text')}?width=${w}&height=${h}&seed=${seed}&nologo=true`;
const heroSrc = r => r.ai ? (r.image || r.thumb || '') : `img/recipes/${r.id}.jpg`;
const videoOf = r => r.ai ? null : media?.[r.id]?.video || null;

export function render(root) {
  const t = state.targets, tot = dayTotals(todayKey());
  const rem = { kcal: t.kcal - tot.kcal, protein: t.protein - tot.protein, carbs: t.carbs - tot.carbs, fat: t.fat - tot.fat };
  slot = slot || nextSlot(tot);
  const p = state.profile;
  focus = focus || (p.goal === 'gain' ? 'muscle' : 'lose');
  // Basrecepten ligger stilla mellan omritningar (bild laddad, post loggad …) och byts bara via Blanda/Nya/måltidsbyte
  const ckey = slot + '|' + focus;
  let list = curatedCache && curatedCache.key === ckey ? curatedCache.list : null;
  if (!list) { list = suggestMeals({ remaining: rem, slot, diet: p.diet, avoid: p.avoid, recentTitles: shown.slice(-8), limit: 5, focus }); shown.push(...list.map(r => r.title)); curatedCache = { key: ckey, list }; }
  const ai = aiStatus();
  const c = cache();
  const feed = ai.textConfigured ? aiFeed(rem, 6) : [];
  root.innerHTML = `<div class="page">
    <div class="eyebrow">Förslag</div><h1 class="h1" style="margin-top:2px">${cute('Vad ska jag äta?', 'suggest')}</h1>
    <div class="card accent mt-3">
      <div class="row between"><div><div class="eyebrow">Kvar idag</div><div class="hero-num">${fmt(Math.max(0, rem.kcal))} <small style="font-size:14px;color:var(--text-3)">kcal</small></div></div>
        <div class="col" style="gap:4px;text-align:right;font-size:13px"><span class="pill" style="justify-content:flex-end">P ${fmt(Math.max(0, rem.protein))} g</span><span class="pill">K ${fmt(Math.max(0, rem.carbs))} g</span><span class="pill">F ${fmt(Math.max(0, rem.fat))} g</span></div></div>
      <div class="mt-3">${segmented(MEALS.map(m => ({ id: m.id, name: m.name })), slot, 'data-slot')}</div>
      <div class="mt-2 focus-seg">${segmented(FOCUS, focus, 'data-focus')}</div>
      <div class="row mt-3" style="gap:8px">${ai.textConfigured ? `<button class="btn sm primary grow" id="plan-day">${I.sparkle} Planera min dag</button>` : ''}<button class="btn sm grow" id="shop">🛒 Inköpslista${state.shopping.filter(x => !x.done).length ? ` (${state.shopping.filter(x => !x.done).length})` : ''}</button></div>
    </div>

    ${ai.textConfigured ? `<div class="section">
      <div class="section-head"><h2 class="h2">Nya recept åt dig</h2><button class="btn sm" id="ai-new" ${aiBusy ? 'disabled' : ''}>${I.refresh} Nya recept</button></div>
      <div class="card" style="padding:12px 14px">
        <div class="row" style="gap:8px"><input class="input grow" id="wish" placeholder="Önskemål? T.ex. kyckling, under 400 kcal, ugn, för två…" value="${esc(wish)}"><button class="icon-btn accent" id="ai-go" aria-label="Skapa" ${aiBusy ? 'disabled' : ''}>${aiBusy ? '<span class="spinner"></span>' : I.sparkle}</button></div>
        <div class="small muted mt-1" style="margin-left:4px">${c.aiRecipes.length ? `${c.aiRecipes.length} recept i ditt bibliotek · ` : ''}<button class="link-btn small" id="lib">Visa alla</button>${ai.textUsesGemini ? ' · Recepten går via Gemini – lägg till en Groq-nyckel för att spara kvoten' : ''}</div>
      </div>
      ${aiBusy ? `<div class="card" style="margin-top:12px"><div class="row" style="gap:12px"><span class="spinner"></span><div><div class="h3">Skapar ${wish ? 'recept efter ditt önskemål' : 'fem nya recept'}…</div><div class="small muted">${esc(ai.textProviderName)} · anpassade efter ${esc(MEALS.find(m => m.id === slot)?.name.toLowerCase() || 'måltiden')}, ditt fokus och vad du har kvar idag</div></div></div>
        <div class="skeleton mt-2" style="height:84px"></div><div class="skeleton mt-1" style="height:84px"></div></div>` : ''}
      ${feed.map(r => recipeCard(r)).join('')}
      ${!feed.length && !aiBusy ? '<div class="notice">Tryck på Nya så skapas fem recept åt dig.</div>' : ''}
    </div>` : ''}

    <div class="section">
      <div class="section-head"><h2 class="h2">${ai.textConfigured ? 'Tallriks basrecept' : (focus === 'lose' ? 'Bäst för viktnedgång' : focus === 'health' ? 'Bäst för hälsan' : focus === 'muscle' ? 'Bäst för musklerna' : 'Snabbast')}</h2><button class="link-btn" id="shuffle">${I.refresh} Blanda</button></div>
      ${ai.textConfigured ? '' : `<button class="small muted" id="research" style="margin:0 4px 10px;text-align:left;color:var(--accent)">🔬 Så väljer Tallrik – forskningen bakom förslagen →</button>`}
      ${list.map(r => recipeCard(r)).join('')}
      ${ai.textConfigured ? '' : groqSetupCard()}
    </div>

    <details class="more mt-3" ${mealRes || mealBusy || mealQ ? 'open' : ''}><summary>🌍 Sök recept från hela världen</summary>
      <div>
        <div class="row" style="gap:8px"><input class="input grow" id="meal-q" placeholder="Sök på engelska: chicken, salmon, lentil…" value="${esc(mealQ)}"><button class="icon-btn accent" id="meal-go" aria-label="Sök">${mealBusy ? '<span class="spinner"></span>' : I.search}</button></div>
        <div class="chips mt-2">${['Chicken', 'Seafood', 'Vegetarian', 'Vegan', 'Breakfast', 'Beef', 'Pasta', 'Side'].map(cat => `<button class="chip sm" data-cat="${cat}">${cat}</button>`).join('')}</div>
        ${mealRes ? (mealRes.length ? `<div class="mt-3" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${mealRes.slice(0, 12).map((m, i) => `<button class="card pressable" data-meal="${i}" style="padding:0;overflow:hidden;text-align:left"><img src="${esc(m.thumb)}/preview" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;display:block" loading="lazy"><div style="padding:10px"><div class="h3" style="font-size:14px">${esc(m.name)}</div><div class="small muted">${esc(m.area)} · ${esc(m.category)}${m.youtube ? ' · ▶ video' : ''}</div></div></button>`).join('')}</div>` : '<div class="notice mt-2">Inga träffar – prova ett annat ord.</div>') : ''}
        <p class="small faint mt-2">Öppna receptdata från TheMealDB. AI:n översätter och räknar näringen när du öppnar ett recept.</p>
      </div>
    </details>

    ${ai.textConfigured ? `<details class="more mt-2" ${answer || asking ? 'open' : ''}><summary>💬 Fråga coachen</summary>
      <div>
        <div class="row" style="gap:8px"><input class="input grow" id="ask" placeholder="T.ex. Hur mycket protein behöver jag per måltid?"><button class="icon-btn accent" id="ask-go" aria-label="Skicka" ${asking ? 'disabled' : ''}>${asking ? '<span class="spinner"></span>' : I.send}</button></div>
        ${answer ? `<div class="mt-2" style="line-height:1.5;white-space:pre-wrap">${esc(answer)}</div>` : ''}
      </div>
    </details>` : ''}
  </div>`;
  bindSeg(root, 'data-slot', v => { slot = v; render(root); });
  bindSeg(root, 'data-focus', v => { focus = v; render(root); });
  root.querySelector('#shuffle').onclick = () => { haptic(); curatedCache = null; feedCache = null; render(root); };
  root.querySelector('#research')?.addEventListener('click', openResearch);
  root.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const r = findRecipe(b.dataset.open, [...feed, ...list]); if (r) openRecipe(r); }));
  root.querySelectorAll('[data-log]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const r = findRecipe(b.dataset.log, [...feed, ...list]); if (r) logRecipe(r); }));
  bindGroqSetup(root);
  const generate = async ({ force = false } = {}) => {
    if (aiBusy) return;
    wish = root.querySelector('#wish')?.value || wish; aiBusy = true; render(root);
    try {
      const recs = await aiSuggest({ remaining: rem, slot, focus, count: 5, eatenToday: (state.days[todayKey()]?.entries || []).map(e => e.name), avoidTitles: c.aiRecipes.filter(r => r.slot === slot).slice(0, 40).map(r => r.title), wish });
      const fresh = addToLibrary(recs);
      if (!fresh.length && force) toast('AI:n föreslog bara recept du redan har – prova ett önskemål', '');
      haptic('success');
    } catch (e) { toast(e.message, 'bad'); autoTried[slot] = true; }
    aiBusy = false; render(root);
  };
  root.querySelector('#ai-go')?.addEventListener('click', () => generate({ force: true }));
  root.querySelector('#ai-new')?.addEventListener('click', () => { wish = ''; const w = root.querySelector('#wish'); if (w) w.value = ''; generate({ force: true }); });
  root.querySelector('#lib')?.addEventListener('click', openLibrary);
  root.querySelector('#shop')?.addEventListener('click', () => openShopping(() => render(root)));
  root.querySelector('#plan-day')?.addEventListener('click', () => openDayPlan(rem, () => render(root)));
  // Automatiskt: skapa nya när biblioteket saknar osedda recept för måltiden (en gång per måltid och öppning)
  if (ai.textConfigured && !aiBusy && unseenCount() < 3 && !autoTried[slot]) { autoTried[slot] = true; setTimeout(() => generate(), 50); }
  root.querySelector('#ask-go')?.addEventListener('click', async () => {
    const q = root.querySelector('#ask').value.trim(); if (!q) return;
    asking = true; render(root);
    try { const tr = weightTrend(state.weights, 7); answer = await aiAsk(q, { remaining: rem, eatenToday: (state.days[todayKey()]?.entries || []).map(e => e.name), trend: tr ? `${tr.perWeek > 0 ? '+' : ''}${fmt(tr.perWeek, 1)} kg/vecka` : 'okänd' }); }
    catch (e) { toast(e.message, 'bad'); }
    asking = false; render(root);
  });
  const doMealSearch = async q => { mealQ = q; mealBusy = true; render(root); mealRes = await searchMealDB(q).catch(() => null); mealBusy = false; render(root); };
  root.querySelector('#meal-go').onclick = () => { const q = root.querySelector('#meal-q').value.trim(); if (q) doMealSearch(q); };
  root.querySelector('#meal-q').addEventListener('keydown', e => { if (e.key === 'Enter') root.querySelector('#meal-go').click(); });
  root.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => doMealSearch('c:' + b.dataset.cat));
  root.querySelectorAll('[data-meal]').forEach(b => b.onclick = () => openMealDB(mealRes[+b.dataset.meal]));
  loadMedia();
  if (aiStatus().textConfigured) fillAiImages(root);
}
const findRecipe = (id, list) => list.find(r => r.id === id) || cache().aiRecipes.find(r => r.id === id) || RECIPES.find(r => r.id === id);
function nextSlot(tot) {
  const g = guessMeal();
  if (!tot.byMeal[g]) return g;
  const order = ['breakfast', 'lunch', 'dinner', 'snack'];
  return order.slice(order.indexOf(g) + 1).find(m => !tot.byMeal[m]) || 'snack';
}
function recipeCard(r) {
  const idx = r.index ?? weightLossIndex(r);
  const src = heroSrc(r);
  return `<div class="card pressable" data-open="${esc(r.id)}" role="button">
    <div class="row" style="align-items:flex-start;gap:12px">
      <div style="position:relative;flex:0 0 auto"><div class="recipe-card-img" style="display:grid;place-items:center;font-size:32px">${r.emoji || '🍽️'}</div><img class="recipe-card-img" src="${esc(src)}" data-hero="${esc(r.id)}" alt="" loading="lazy" style="position:absolute;inset:0;${src ? '' : 'display:none'}" onerror="this.style.display='none'"></div>
      <div class="grow"><div class="h3">${esc(r.title)}${r.ai ? ' <span class="tag ai">AI</span>' : ''}</div><div class="small muted" style="margin-top:2px;line-height:1.35">${esc(r.d || '')}</div>
        <div class="row gap-1 mt-1 small num" style="flex-wrap:wrap;color:var(--text-2)"><b style="color:var(--text)">${fmt(r.kcal)} kcal</b><span>P ${fmt(r.protein)}</span><span>K ${fmt(r.carbs)}</span><span>F ${fmt(r.fat)}</span>${r.fiber ? `<span>fiber ${fmt(r.fiber)}</span>` : ''}${r.min ? `<span>⏱ ${r.min} min</span>` : ''}</div>
        <div class="row gap-1 mt-1"><div class="idx-bar grow"><i style="width:${idx}%"></i></div><span class="small" style="font-weight:700;color:${idx >= 70 ? 'var(--good)' : idx >= 50 ? 'var(--accent-2)' : 'var(--text-2)'}">${idx}</span></div>
      </div>
    </div>
    ${r.why ? `<div class="small mt-2" style="color:var(--accent)">${esc(r.why)}</div>` : ''}
    <div class="row mt-2" style="gap:8px"><button class="btn sm primary grow" data-log="${esc(r.id)}">${I.plus} Logga</button><button class="btn sm grow" data-open="${esc(r.id)}">Recept & video</button></div>
  </div>`;
}
function groqSetupCard() {
  const pr = PROVIDERS.groq;
  return `<div class="card" id="groq-setup">
    <div class="insight"><div class="ic">✨</div><div class="grow"><div class="t">AI-recept efter dina önskemål</div><div class="d">Lägg till en gratis Groq-nyckel (tar en minut) så skriver AI:n kompletta recept med steg, bilder och näring – och Gemini-kvoten sparas till fotona.</div></div></div>
    <ol class="small" style="margin:12px 0 8px;padding-left:20px;line-height:1.6">${pr.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <a class="btn block sm" href="${pr.keyUrl}" target="_blank" rel="noopener">Öppna Groq ${I.chevR}</a>
    <div class="row mt-2" style="gap:8px"><input class="input grow" id="groq-key" placeholder="${esc(pr.keyHint)}" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" id="groq-test" style="min-height:54px;padding:0 18px">Spara</button></div>
    <div class="small muted mt-1" id="groq-msg" style="margin-left:4px">${esc(pr.free)}</div>
  </div>`;
}
function bindGroqSetup(root) {
  const btn = root.querySelector('#groq-test'); if (!btn) return;
  btn.onclick = async () => {
    const key = root.querySelector('#groq-key').value.trim(), msg = root.querySelector('#groq-msg');
    if (!key) { msg.textContent = 'Klistra in nyckeln först.'; return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try { const r = await addKey(key, 'groq'); haptic('success'); toast(`${PROVIDERS[r.provider].name} aktiverat${r.provider === 'gemini' ? ' (för foton – recept behöver en Groq-nyckel)' : ' för recept och coach'}`, 'good'); render(root); }
    catch (e) { msg.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; btn.disabled = false; btn.textContent = 'Spara'; }
  };
}

// ---------- Receptark ----------
export function openRecipe(r, slotId = null) {
  const mealId = slotId || r.slot || slot || guessMeal();
  const idx = r.index ?? weightLossIndex(r);
  const reasons = r.reasons || indexReasons(r);
  const src = heroSrc(r);
  const localSteps = !r.ai ? (r.steps || []).map((st, i) => st.img ? `img/recipes/steps/${r.id}-${i}.jpg` : null) : null;
  let showImgs = !!localSteps;
  let servings = 1;
  const a = openSheet({
    full: true, title: r.title,
    html: '',
    onMount(api) { draw(api); },
  });
  async function draw(api) {
    await loadMedia(); await loadCatalog();
    const specific = videoOf(r);
    const list = specific ? [{ ...specific, score: 999 }, ...bestVideos(r, 2).filter(v => v.id !== specific.id)] : bestVideos(r, 3);
    api.setHTML(`
      <div class="recipe-hero">${src ? `<img src="${esc(src)}" alt="" onerror="this.style.display='none'">` : `<div style="display:grid;place-items:center;height:100%;font-size:64px">${r.emoji || '🍽️'}</div>`}
        ${r.min ? `<span class="badge">⏱ ${r.min} min</span>` : ''}<span class="idx">Index ${idx}</span></div>
      <p class="muted mt-2" style="line-height:1.45">${esc(r.d || '')}</p>
      <div class="stat-grid mt-2" style="grid-template-columns:repeat(4,1fr);gap:8px">
        ${[['kcal', 'kcal', ''], ['protein', 'Protein', 'g'], ['carbs', 'Kolh.', 'g'], ['fat', 'Fett', 'g']].map(([k, l, u]) => `<div class="stat" style="padding:10px"><div class="l">${l}</div><div class="v" style="font-size:18px">${fmt(r[k])}<small> ${u}</small></div></div>`).join('')}
      </div>
      ${r.fiber || r.grams ? `<div class="small muted mt-1" style="margin-left:4px">${r.fiber ? `Fiber ${fmt(r.fiber)} g` : ''}${r.fiber && r.grams ? ' · ' : ''}${r.grams ? `portion ${fmt(r.grams)} g · ${(r.kcal / r.grams).toFixed(1).replace('.', ',')} kcal/g` : ''}</div>` : ''}
      ${reasons.length || r.why ? `<div class="card mt-3" style="padding:14px"><div class="eyebrow" style="margin-bottom:6px">Varför det funkar</div>${r.why && r.ai ? `<div class="small" style="line-height:1.45">${esc(r.why)}</div>` : ''}${reasons.length ? `<ul class="small" style="margin:${r.ai && r.why ? '8px' : '0'} 0 0;padding-left:18px;line-height:1.55">${reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<button class="link-btn small mt-1" id="rs">Läs forskningen →</button></div>` : ''}
      <div class="row between mt-3" style="margin-bottom:8px"><div class="eyebrow">Ingredienser · ${servings} portion${servings > 1 ? 'er' : ''}</div><div class="stepper" style="transform:scale(.85);transform-origin:right"><button id="sv-m">−</button><input id="sv" value="${servings}" readonly style="width:44px"><button id="sv-p">+</button></div></div>
      <div class="list">${(r.ing || []).map(x => `<div class="list-item" style="padding:11px 16px"><span>${esc(scaleIng(x, servings))}</span></div>`).join('') || '<div class="list-item"><span class="muted">Inga ingredienser angivna</span></div>'}</div>
      ${servings > 1 ? `<div class="small muted mt-1" style="margin-left:4px">Näringsvärdena ovan gäller per portion · totalt ${fmt(r.kcal * servings)} kcal för ${servings} portioner</div>` : ''}
      <button class="btn sm block mt-2" id="to-shop">🛒 Lägg ingredienserna i inköpslistan</button>
      <div class="row between mt-3" style="margin-bottom:6px"><div class="eyebrow">Gör så här</div>${localSteps ? `<button class="btn xs" id="imgs">${showImgs ? 'Dölj bilder' : '🖼 Visa stegbilder'}</button>` : ''}</div>
      <div class="card" style="padding:4px 16px">${(r.steps || []).map((s, i) => { const src = localSteps?.[i] || ''; return `<div class="step"><div class="num">${i + 1}</div><div class="grow"><div class="txt">${esc(s.t)}</div>${showImgs && src ? `<div class="skeleton" style="margin-top:10px;aspect-ratio:16/10;border-radius:14px"><img src="${esc(src)}" alt="" loading="lazy" style="margin:0;opacity:0;transition:opacity .3s" onload="this.style.opacity=1;this.parentElement.classList.remove('skeleton')" onerror="this.parentElement.style.display='none'"></div>` : ''}</div></div>`; }).join('') || '<div class="step"><div class="txt muted">Inga steg angivna.</div></div>'}</div>
      ${showImgs ? '<p class="small faint mt-1">Stegbilderna är AI-genererade illustrationer, inte foton av just din portion.</p>' : ''}
      <div class="eyebrow mt-3" style="margin-bottom:8px">Video – spelas upp här</div>
      ${videoBlock(list)}
      <div class="col mt-4"><button class="btn primary block" id="log">${I.plus} Logga som ${esc(MEALS.find(m => m.id === mealId)?.name.toLowerCase() || 'måltid')}</button></div>`);
    bindVideos(api.body, list);
    const redraw = () => { const y = api.body.scrollTop; draw(api).then(() => { api.body.scrollTop = y; }); };
    api.body.querySelector('#sv-m').onclick = () => { servings = Math.max(1, servings - 1); haptic(); redraw(); };
    api.body.querySelector('#sv-p').onclick = () => { servings = Math.min(8, servings + 1); haptic(); redraw(); };
    api.body.querySelector('#to-shop').onclick = () => { const n = addShopping((r.ing || []).map(x => scaleIng(x, servings)), r.title); haptic('success'); toast(n ? `${n} varor tillagda i inköpslistan` : 'Allt fanns redan i listan', 'good'); };
    api.body.querySelector('#log').onclick = () => { logRecipeAs(r, mealId); api.close(); };
    api.body.querySelector('#rs')?.addEventListener('click', openResearch);
    api.body.querySelector('#imgs')?.addEventListener('click', () => { showImgs = !showImgs; haptic(); const y = api.body.scrollTop; draw(api); api.body.scrollTop = y; });
  }
}
function logRecipe(r, quiet = false) {
  addEntry(todayKey(), { meal: slot || guessMeal(), name: r.title, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, grams: r.grams || null, source: 'suggestion', emoji: r.emoji || '🍽️', portionLabel: '1 portion', image: heroSrc(r) || '' });
  if (quiet) return;
  haptic('success'); toast(`${r.title} loggad · ${fmt(r.kcal)} kcal`, 'good');
}
export function openShopping(onChange = null) {
  const a = openSheet({ full: true, title: 'Inköpslista', html: '', onMount(api) { draw(api); }, onClose: () => onChange && onChange() });
  function draw(api) {
    const items = state.shopping, open = items.filter(x => !x.done), done = items.filter(x => x.done);
    const groups = {}; for (const x of open) (groups[x.recipe || 'Övrigt'] ||= []).push(x);
    api.setHTML(`<div class="row" style="gap:8px"><input class="input grow" id="sh-new" placeholder="Lägg till vara…"><button class="icon-btn accent" id="sh-add" aria-label="Lägg till">${I.plus}</button></div>
      ${open.length ? Object.entries(groups).map(([g, list]) => `<div class="eyebrow mt-3" style="margin-bottom:6px">${esc(g)}</div><div class="list">${list.map(x => `<button class="list-item" data-sh="${x.id}"><div class="ic" style="background:transparent;border:2px solid var(--border-strong);border-radius:8px;width:24px;height:24px"></div><div class="grow"><div class="t">${esc(x.text)}</div></div></button>`).join('')}</div>`).join('') : '<div class="notice mt-3">Listan är tom. Öppna ett recept och tryck "Lägg ingredienserna i inköpslistan", eller planera din dag.</div>'}
      ${done.length ? `<div class="eyebrow mt-3" style="margin-bottom:6px">Avbockat (${done.length})</div><div class="list">${done.map(x => `<button class="list-item" data-sh="${x.id}" style="opacity:.55"><div class="ic" style="background:var(--good);border-radius:8px;width:24px;height:24px;color:#063;font-weight:800">✓</div><div class="grow"><div class="t" style="text-decoration:line-through">${esc(x.text)}</div></div></button>`).join('')}</div>` : ''}
      <div class="row mt-3" style="gap:8px">${done.length ? '<button class="btn sm grow" id="sh-clear-done">Rensa avbockade</button>' : ''}${items.length ? '<button class="btn sm grow danger" id="sh-clear">Töm listan</button>' : ''}</div>`);
    api.body.querySelectorAll('[data-sh]').forEach(b => b.onclick = () => { toggleShopping(b.dataset.sh); haptic(); const y = api.body.scrollTop; draw(api); api.body.scrollTop = y; });
    const add = () => { const v = api.body.querySelector('#sh-new').value.trim(); if (!v) return; addShopping([v], 'Övrigt'); draw(api); };
    api.body.querySelector('#sh-add').onclick = add;
    api.body.querySelector('#sh-new').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    api.body.querySelector('#sh-clear-done')?.addEventListener('click', () => { clearShoppingDone(); draw(api); });
    api.body.querySelector('#sh-clear')?.addEventListener('click', async () => { if (await confirmSheet({ title: 'Töm inköpslistan?', text: `${items.length} varor tas bort.`, okText: 'Töm', danger: true })) { clearShopping(); draw(api); } });
  }
  return a;
}
export function openDayPlan(rem, onChange = null) {
  const c = cache(); const t = state.targets; const today = todayKey();
  let busy = false, planError = '';
  const a = openSheet({ full: true, title: 'Din dag', html: '', onMount(api) { if (!c.dayPlan || c.dayPlan.date !== today) generate(api); else draw(api); }, onClose: () => onChange && onChange() });
  async function generate(api, wishText = '') {
    busy = true; draw(api);
    try {
      const tot = dayTotals(today);
      const eaten = Object.keys(tot.byMeal);
      const daySlots = state.profile?.mealsPerDay === 2 ? ['lunch', 'dinner', 'snack'] : state.profile?.mealsPerDay === 3 ? ['breakfast', 'lunch', 'dinner'] : ['breakfast', 'lunch', 'dinner', 'snack'];
      const slots = daySlots.filter(x => !eaten.includes(x));
      // Allt redan loggat idag → planera en hel dag som inspiration (t.ex. för i morgon) i stället för att lägga mat ovanpå det som ätits
      const fullDay = !slots.length;
      const plan = await planDay({ kcal: fullDay ? t.kcal : Math.max(600, t.kcal - tot.kcal), protein: fullDay ? t.protein : Math.max(30, t.protein - tot.protein), focus, wish: wishText, slots: fullDay ? daySlots : slots, library: c.aiRecipes.slice(0, 40).map(r => ({ title: r.title, slot: r.slot, kcal: r.kcal, protein: r.protein })) });
      plan.meals = plan.meals.map(m => { const lib = m.fromLibrary && c.aiRecipes.find(r => normT(r.title) === normT(m.title)); return lib ? { ...lib, slot: m.slot, why: m.why || lib.why } : m; });
      c.dayPlan = { date: today, fullDay, ...plan }; planError = ''; commit('cache'); haptic('success');
    } catch (e) { planError = e.message || 'Något gick fel'; }
    busy = false; draw(api);
  }
  function draw(api) {
    const plan = c.dayPlan && c.dayPlan.date === today ? c.dayPlan : null;
    const eatenTot = dayTotals(today); const eatenSlots = Object.keys(eatenTot.byMeal);
    const sum = plan ? plan.meals.reduce((s, m) => ({ kcal: s.kcal + m.kcal, protein: s.protein + m.protein, carbs: s.carbs + m.carbs, fat: s.fat + m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 }) : null;
    api.setHTML(`${busy ? `<div class="card"><div class="row" style="gap:12px"><span class="spinner"></span><div><div class="h3">Planerar din dag…</div><div class="small muted">Recept för resten av dagen: ${fmt(Math.max(600, t.kcal - dayTotals(today).kcal))} kcal och ${fmt(Math.max(30, t.protein - dayTotals(today).protein))} g protein kvar</div></div></div><div class="skeleton mt-2" style="height:90px"></div><div class="skeleton mt-1" style="height:90px"></div><div class="skeleton mt-1" style="height:90px"></div></div>` : ''}
      ${plan && !busy ? `<div class="card accent"><div class="row between"><div><div class="eyebrow">${plan.fullDay ? 'Förslag för en hel dag' : eatenTot.kcal ? 'Ätit + planerat' : 'Hela dagen'}</div><div class="hero-num">${fmt(sum.kcal + (plan.fullDay ? 0 : eatenTot.kcal))} <small style="font-size:14px;color:var(--text-3)">/ ${fmt(t.kcal)} kcal</small></div>${plan.fullDay ? '<div class="small muted">Dagens måltider är redan loggade – använd som inspiration till i morgon</div>' : eatenTot.kcal ? `<div class="small muted">varav ${fmt(eatenTot.kcal)} redan ätit</div>` : ''}</div><div class="small muted" style="text-align:right">P ${fmt(sum.protein + (plan.fullDay ? 0 : eatenTot.protein))} / ${fmt(t.protein)} g<br>K ${fmt(sum.carbs)} · F ${fmt(sum.fat)} g</div></div>${plan.note ? `<div class="small mt-2" style="color:var(--accent)">${esc(plan.note)}</div>` : ''}</div>
        ${plan.meals.map((m, i) => `<div class="card pressable mt-2" data-pm="${i}" role="button"><div class="row" style="align-items:flex-start;gap:12px"><div class="recipe-card-img" style="display:grid;place-items:center;font-size:28px;width:60px;height:60px">${m.emoji || '🍽️'}</div><div class="grow"><div class="eyebrow">${esc(MEALS.find(x => x.id === m.slot)?.name || '')}</div><div class="h3">${esc(m.title)}${m.fromLibrary || m.image ? ' <span class="tag good">bibliotek</span>' : ''}</div><div class="small muted num mt-1"><b style="color:var(--text)">${fmt(m.kcal)} kcal</b> · P ${fmt(m.protein)} · K ${fmt(m.carbs)} · F ${fmt(m.fat)}${m.min ? ` · ⏱ ${m.min} min` : ''}</div>${m.why ? `<div class="small mt-1" style="color:var(--accent)">${esc(m.why)}</div>` : ''}</div></div></div>`).join('')}
        <div class="col mt-3"><button class="btn primary block" id="log-all">${I.plus} Logga hela dagen</button><button class="btn block" id="shop-all">🛒 Lägg allt i inköpslistan</button><button class="btn quiet block" id="replan">${I.refresh} Ny plan</button></div>
        <div class="field mt-2"><input class="input" id="plan-wish" placeholder="Önskemål för ny plan, t.ex. vegetariskt, snabbt…"></div>` : ''}
      ${!plan && !busy ? `${planError ? `<div class="notice warn">Kunde inte planera dagen just nu: ${esc(planError)}</div>` : '<div class="notice">Ingen plan ännu.</div>'}<button class="btn primary block mt-3" id="replan">${planError ? 'Försök igen' : 'Planera min dag'}</button>` : ''}`);
    api.body.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { const m = plan.meals[+b.dataset.pm]; openRecipe({ ...m, index: weightLossIndex(m), reasons: indexReasons(m) }, m.slot); });
    api.body.querySelector('#replan')?.addEventListener('click', () => generate(api, api.body.querySelector('#plan-wish')?.value || ''));
    api.body.querySelector('#shop-all')?.addEventListener('click', () => { let n = 0; for (const m of plan.meals) n += addShopping(m.ing || [], m.title); haptic('success'); toast(`${n} varor tillagda i inköpslistan`, 'good'); });
    api.body.querySelector('#log-all')?.addEventListener('click', () => { const todo = plan.meals.filter(m => !eatenSlots.includes(m.slot)); for (const m of todo) logRecipeAs(m, m.slot, true); haptic('success'); toast(todo.length ? `${todo.length} måltider loggade · ${fmt(todo.reduce((s, m) => s + (m.kcal || 0), 0))} kcal` : 'Alla måltider i planen är redan loggade', 'good'); api.close(); });
  }
  return a;
}
function openLibrary() {
  const all = cache().aiRecipes;
  let q = '';
  const a = openSheet({ full: true, title: `Ditt receptbibliotek (${all.length})`, html: '', onMount(api) { draw(api); } });
  function draw(api) {
    const nq = normT(q);
    const list = all.filter(r => !nq || normT(r.title + ' ' + (r.d || '') + ' ' + (r.ing || []).join(' ')).includes(nq));
    api.setHTML(`<div class="input-wrap">${I.search.replace('<svg', '<svg class="prefix-icon"')}<input class="input" id="lq" placeholder="Sök i biblioteket…" value="${esc(q)}"></div>
      <div class="list mt-2">${list.map(r => `<button class="list-item" data-lib="${esc(r.id)}"><div class="ic">${r.emoji || '🍽️'}</div><div class="grow"><div class="t">${esc(r.title)}</div><div class="d">${fmt(r.kcal)} kcal · P ${fmt(r.protein)} g · index ${weightLossIndex(r)} · ${esc(MEALS.find(m => m.id === r.slot)?.name || '')}</div></div>${I.chevR.replace('<svg', '<svg class="chev"')}</button>`).join('') || '<div class="list-item"><span class="muted">Inga recept ännu</span></div>'}</div>`);
    const inp = api.body.querySelector('#lq');
    inp.addEventListener('input', () => { q = inp.value; const y = api.body.scrollTop; draw(api); api.body.scrollTop = y; api.body.querySelector('#lq').focus(); });
    api.body.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => { const r = all.find(x => x.id === b.dataset.lib); if (r) openRecipe({ ...r, index: weightLossIndex(r), reasons: indexReasons(r) }); });
  }
}
export function openResearch() {
  openSheet({ title: 'Forskningen bakom', html: `<p class="lead" style="margin-bottom:8px">Tallriks index (0–100) väger proteinandel, energitäthet, fiber och grad av processning – de faktorer som i kontrollerade studier styr mättnad och viktnedgång. Sedan filtreras förslagen på vad du har kvar av dagen, din kost och tiden på dygnet.</p>
    ${RESEARCH.map(x => `<div class="research-item"><div class="t">${esc(x.title)}</div><div class="d">${esc(x.text)}</div><div class="s">${esc(x.src)}</div></div>`).join('')}
    <p class="small faint mt-2">Allmän kostinformation – inte medicinsk rådgivning. Vid sjukdom eller medicinering: prata med vården.</p>` });
}

// ---------- TheMealDB (öppet recept-API) ----------
async function searchMealDB(q) {
  const url = q.startsWith('c:') ? `https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(q.slice(2))}` : `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const j = await r.json();
  return (j.meals || []).map(m => ({ id: m.idMeal, name: m.strMeal, thumb: m.strMealThumb, area: m.strArea || '', category: m.strCategory || '', youtube: m.strYoutube || '', full: !!m.strInstructions, raw: m }));
}
async function fullMeal(m) {
  if (m.full) return m;
  const r = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${m.id}`, { signal: AbortSignal.timeout(12000) });
  const j = await r.json(); const x = j.meals?.[0]; if (!x) throw new Error('Receptet kunde inte hämtas');
  return { ...m, area: x.strArea || '', category: x.strCategory || '', youtube: x.strYoutube || '', full: true, raw: x };
}
const mealIngredients = raw => Array.from({ length: 20 }, (_, i) => [raw['strIngredient' + (i + 1)], raw['strMeasure' + (i + 1)]]).filter(([n]) => n && n.trim()).map(([n, q]) => `${(q || '').trim()} ${n.trim()}`.trim());
const mealSteps = raw => String(raw.strInstructions || '').split(/\r?\n+|(?<=\.)\s+(?=[A-Z])/).map(s => s.replace(/^step\s*\d+[:.)]?\s*/i, '').trim()).filter(s => s.length > 3);
const ytId = url => /(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url || '')?.[1] || '';
async function openMealDB(m0) {
  const c = cache();
  const a = openSheet({ full: true, title: m0.name, html: `<div class="center" style="padding:40px 0"><div class="spinner" style="margin:0 auto"></div></div>` });
  let m; try { m = await fullMeal(m0); } catch (e) { a.setHTML(`<div class="notice warn">${esc(e.message)}</div>`); return; }
  const adapted = c.mealdb[m.id];
  await loadCatalog();
  const draw = (busy = false) => {
    const sv = c.mealdb[m.id];
    const ai = aiStatus();
    const own = ytId(m.youtube) ? [{ id: ytId(m.youtube), title: m.name + ' (originalvideo)', channel: 'TheMealDB', score: 999 }] : [];
    const mlist = [...own, ...bestVideos({ title: sv?.title || m.name, ing: sv?.ing || mealIngredients(m.raw) }, 2)];
    a.setHTML(`
      <div class="recipe-hero"><img src="${esc(m.thumb)}" alt=""><span class="badge">${esc(m.area)} · ${esc(m.category)}</span></div>
      ${sv ? `<div class="stat-grid mt-3" style="grid-template-columns:repeat(4,1fr);gap:8px">${[['kcal', 'kcal', ''], ['protein', 'Protein', 'g'], ['carbs', 'Kolh.', 'g'], ['fat', 'Fett', 'g']].map(([k, l, u]) => `<div class="stat" style="padding:10px"><div class="l">${l}</div><div class="v" style="font-size:18px">${fmt(sv[k])}<small> ${u}</small></div></div>`).join('')}</div>
        <div class="small muted mt-1" style="margin-left:4px">Per portion, uppskattat av AI:n${sv.grams ? ` · ca ${fmt(sv.grams)} g` : ''} · Viktnedgångsindex ${weightLossIndex(sv)}</div>
        ${sv.lighter ? `<div class="notice good mt-2">💡 Lättare variant: ${esc(sv.lighter)}</div>` : ''}`
        : `<div class="card mt-3" style="padding:14px"><div class="small muted" style="line-height:1.45">Receptet är på engelska och saknar näringsvärden. ${ai.textConfigured ? 'Låt AI:n översätta, dela upp i steg och räkna näringen per portion.' : 'Lägg till en gratis Groq-nyckel under Förslag för att översätta och räkna näringen.'}</div>${ai.textConfigured ? `<button class="btn primary block mt-2" id="adapt" ${busy ? 'disabled' : ''}>${busy ? '<span class="spinner"></span> Översätter och räknar…' : '✨ Översätt & räkna näring'}</button>` : ''}</div>`}
      <div class="eyebrow mt-3" style="margin-bottom:8px">Ingredienser</div>
      <div class="list">${(sv?.ing || mealIngredients(m.raw)).map(x => `<div class="list-item" style="padding:11px 16px"><span>${esc(x)}</span></div>`).join('')}</div>
      <div class="eyebrow mt-3" style="margin-bottom:8px">Gör så här</div>
      <div class="card" style="padding:4px 16px">${(sv?.steps || mealSteps(m.raw).map(t => ({ t }))).map((s, i) => `<div class="step"><div class="num">${i + 1}</div><div class="txt">${esc(s.t)}</div></div>`).join('')}</div>
      <div class="eyebrow mt-3" style="margin-bottom:8px">Video – spelas upp här</div>
      ${videoBlock(mlist)}
      <div class="col mt-4">${sv ? `<button class="btn primary block" id="log">${I.plus} Logga som ${esc(MEALS.find(x => x.id === slot)?.name.toLowerCase() || 'måltid')}</button>` : ''}</div>`);
    bindVideos(a.body, mlist);
    a.body.querySelector('#adapt')?.addEventListener('click', async () => {
      draw(true);
      try {
        const { adaptMeal } = await import('../ai.js?v=202609171301');
        c.mealdb[m.id] = await adaptMeal({ name: m.name, area: m.area, category: m.category, ingredients: mealIngredients(m.raw), instructions: m.raw.strInstructions });
        commit('cache'); haptic('success');
      } catch (e) { toast(e.message, 'bad'); }
      draw(false);
    });
    a.body.querySelector('#log')?.addEventListener('click', () => { const s = c.mealdb[m.id]; logRecipe({ title: s.title || m.name, kcal: s.kcal, protein: s.protein, carbs: s.carbs, fat: s.fat, grams: s.grams, emoji: '🍽️', imgPrompt: '', ai: true, id: 'mealdb-' + m.id, thumb: m.thumb }); a.close(); });
  };
  draw();
}

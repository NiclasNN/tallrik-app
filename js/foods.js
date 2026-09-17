// Livsmedel: Livsmedelsverkets databas (inbakad), Open Food Facts (streckkod/produkter), egna livsmedel.
import { state } from './store.js?v=202609171301';
import { round } from './components.js?v=202609171301';

let DB = null, loading = null;
const ABBR = [[/\bu\. /g, 'utan '], [/\bm\. /g, 'med '], [/\bel\. /g, 'eller '], [/\bkonserv\./g, 'konserverad'], [/\bfrys\./g, 'fryst'], [/\bind\. /g, 'industri '], [/\bo\. /g, 'och '], [/\bev\. /g, 'eventuellt '], [/\bca /g, 'ca ']];
export function prettyName(n) { let s = n; for (const [re, r] of ABBR) s = s.replace(re, r); return s; }
const norm = s => s.toLowerCase().replace(/[.,()/%-]/g, ' ').replace(/\s+/g, ' ').trim();

export function loadDB() {
  if (DB) return Promise.resolve(DB);
  if (loading) return loading;
  loading = fetch('data/foods.json').then(r => r.json()).then(j => {
    const gi = j.cols.indexOf('group');
    DB = j.rows.map(r => ({
      key: 'slv:' + r[0], id: r[0], name: prettyName(r[1]), raw: r[1],
      per100: { kcal: r[2], protein: r[3], carbs: r[4], fat: r[5], fiber: r[6], sugar: r[7], salt: r[8], satfat: r[9] },
      group: j.groups[r[gi]] || '', source: 'slv',
    })).map(f => ({ ...f, _n: norm(f.name), _w: norm(f.name).split(' ') }));
    DB.meta = { source: j.source, fetched: j.fetched, groups: j.groups };
    return DB;
  }).catch(e => { loading = null; throw e; });
  return loading;
}
export const dbReady = () => !!DB;
export const dbMeta = () => DB?.meta;

// Sök: varje ord i frågan måste matcha början av ett ord i namnet (substring bara för längre ord).
// Rankning: basvaror och tillagade former före inälvsmat, tillskott, storhushåll och råvaror.
const LOW_GROUPS = [[/innanmat|inälvsmat/i, 28], [/kosttillskott|hälsopreparat/i, 30], [/spädbarn/i, 30], [/baknings ingrediens/i, 10], [/kryddning eller extrakt|smakämne/i, 16], [/andra djurfetter/i, 14]];
const RAW_GROUPS = /fågel|rött kött|kött eller köttprodukter|fisk|ägg|korv/i;
function rankAdjust(f, nq) {
  let s = 0;
  const g = f.group || '', n = f._n;
  for (const [re, pen] of LOW_GROUPS) if (re.test(g) && !re.test(nq)) s -= pen;
  if (RAW_GROUPS.test(g) && /\brå\b/.test(n) && !/\brå\b/.test(nq)) s -= 9;
  if (/\bokokt\b/.test(n) && !/okokt/.test(nq)) s -= 10;                 // torrvara – man loggar oftast det kokta
  if (/\b(stekt|kokt|grillad|ugnsstekt|ugnsbakad)\b/.test(n)) s += 4;
  if (/storhushåll|pulver|konc\b|torkad/.test(n) && !/storhushåll|pulver|konc|torkad/.test(nq)) s -= 6;
  if (/frysvara|konserv/.test(n) && !/frys|konserv/.test(nq)) s -= 5;
  if (/glutenfri|laktosfri|\beko\b|ekologisk|sötningsm/.test(n) && !/glutenfri|laktosfri|eko|sötning/.test(nq)) s -= 16;  // specialvarianter efter standard
  if (/^(mjölk|fil och yoghurt|frukt och bär|grönsaker|potatis|ris eller|pasta|jäst bröd|ägg|fågel|fisk$|hårdost|kvarg)/i.test(g)) s += 3;
  return s;
}
// Vardagssvenska → databasens namn ("kycklingfilé" heter "Kyckling bröstfilé", "keso" heter "Färskost cottage cheese")
const HEADS = ['kyckling', 'kalkon', 'nötkötts', 'nöt', 'gris', 'fläsk', 'lax', 'torsk', 'räk', 'ost', 'ägg', 'potatis', 'ris', 'pasta', 'fullkorns', 'fullkorn', 'fisk', 'kött', 'grönsaks', 'frukt', 'choklad', 'vanilj', 'jordgubbs', 'hallon', 'blåbärs', 'citron', 'apelsin', 'äppel', 'banan', 'tomat', 'morots', 'vitlöks', 'lök', 'soja', 'havre', 'vete', 'råg', 'majs', 'bön', 'lins', 'kikärts', 'tofu', 'yoghurt', 'kvarg', 'mjölk', 'grädd', 'smör', 'olje', 'sallads', 'kött', 'fläsk', 'skinka', 'bacon'];
function tokenAlternatives(t) {
  const alts = [[t]];
  if (t.length >= 5 && /(or|ar|er)$/.test(t)) alts.push([t.slice(0, -2)]);              // plural: räkor→räk(a), tomater→tomat
  if (t.length >= 7) for (const h of HEADS) if (t.startsWith(h) && t.length - h.length >= 3) { alts.push([h, t.slice(h.length)]); if (h.endsWith('s')) alts.push([h.slice(0, -1), t.slice(h.length)]); }
  return alts;
}
const matchTok = (f, t) => f._n.startsWith(t) ? 30 : f._w.some(w => w.startsWith(t)) ? 18 : (t.length >= 4 && f._n.includes(t)) ? 5 : 0;
let SYN_N = null;
function applySyn(nq) {
  SYN_N ||= SYN.map(([k, v]) => [norm(k), norm(v)]).filter(([k, v]) => k && k !== v).sort((a, b) => b[0].length - a[0].length);
  let out = ' ' + nq + ' ';
  for (const [k, v] of SYN_N) { const i = out.indexOf(' ' + k + ' '); if (i >= 0 && !out.includes(' ' + v + ' ')) out = out.slice(0, i) + ' ' + v + ' ' + out.slice(i + k.length + 2); }
  return out.trim();
}
export function search(q, { limit = 40, includeCustom = true } = {}) {
  let nq = norm(q);
  if (!nq) return [];
  nq = applySyn(nq);
  const toks = nq.split(' ').filter(Boolean);
  const alts = toks.map(tokenAlternatives);
  const pool = [...(includeCustom ? state.customFoods.map(f => ({ ...f, _n: norm(f.name + ' ' + (f.brand || '')), _w: norm(f.name + ' ' + (f.brand || '')).split(' ') })) : []), ...(DB || [])];
  const out = [];
  for (const f of pool) {
    let score = 0, ok = true;
    for (let i = 0; i < toks.length; i++) {
      let best = 0;
      for (const alt of alts[i]) { let s = 0, all = true; for (const a of alt) { const m = matchTok(f, a); if (!m) { all = false; break; } s += m; } if (all) best = Math.max(best, alt.length === 1 && alt[0] === toks[i] ? s : s * 0.8); }
      if (!best) { ok = false; break; }
      score += best;
    }
    if (!ok) continue;
    if (f._n === nq) score += 40;
    score -= Math.min(12, f._n.length / 6);           // korta namn = mer generella = oftast det man menar
    if (f.source === 'custom') score += 12; else score += rankAdjust(f, nq);
    if (state.favorites[f.key]) score += 6;
    out.push({ f, score });
  }
  out.sort((a, b) => b.score - a.score || a.f.name.length - b.f.name.length);
  return out.slice(0, limit).map(x => x.f);
}

export const scale = (per100, grams) => ({
  kcal: Math.round((per100.kcal || 0) * grams / 100),
  protein: round((per100.protein || 0) * grams / 100, 1),
  carbs: round((per100.carbs || 0) * grams / 100, 1),
  fat: round((per100.fat || 0) * grams / 100, 1),
});

// ---- Portionsförslag utifrån livsmedelsgrupp ----
const PORTIONS = [
  [/kaffe|te och kakao/i, 150, [['1 kopp', 150], ['1 mugg', 250], ['1 dl', 100]]],
  [/öl|cider/i, 330, [['1 burk (33 cl)', 330], ['1 flaska (50 cl)', 500], ['1 glas', 250]]],
  [/vin|likör|sprit/i, 150, [['1 glas (15 cl)', 150], ['1 shot (4 cl)', 40], ['1 dl', 100]]],
  [/mjölk|dryck|juice|läsk|vatten|vegetabiliska mejeri|vassle/i, 200, [['1 glas (2 dl)', 200], ['1 dl', 100], ['33 cl', 330], ['5 dl', 500]]],
  [/fil och yoghurt|färskost|mjukost|övriga mjölk/i, 150, [['1 dl', 100], ['1,5 dl', 150], ['2,5 dl', 250], ['1 msk', 15]]],
  [/grädde|dessertsås/i, 30, [['1 msk', 15], ['0,5 dl', 50], ['1 dl', 100]]],
  [/hårdost|halvhård|lagrad ost|^ost$|ostprodukt/i, 24, [['1 skiva', 12], ['2 skivor', 24], ['4 skivor', 48], ['1 dl riven', 40]]],
  [/smör|margarin/i, 7, [['tunt lager', 5], ['1 tsk', 5], ['1 msk', 14], ['2 msk', 28]]],
  [/vegetabiliskt fett|olja|djurfett/i, 14, [['1 tsk', 5], ['1 msk', 14], ['2 msk', 28]]],
  [/jäst bröd|övriga bröd|ojäst bröd/i, 35, [['1 skiva', 35], ['1 tunn skiva', 25], ['1 bulle', 60], ['2 skivor', 70]]],
  [/bageriprodukter|söta kakor|dessert|glass/i, 60, [['1 liten', 40], ['1 st', 60], ['1 stor', 100]]],
  [/choklad|konfekt|snacks/i, 30, [['1 bit', 10], ['1 rad', 25], ['1 näve', 30], ['1 påse (100 g)', 100]]],
  [/frukt och bär|processad frukt/i, 130, [['1 liten', 80], ['1 medel', 130], ['1 stor', 180], ['1 dl bär', 60]]],
  [/ägg$/i, 55, [['1 ägg', 55], ['2 ägg', 110], ['3 ägg', 165]]],
  [/nöt|frö|kärna/i, 30, [['1 msk', 10], ['1 näve', 30], ['1 dl', 60]]],
  [/sylt|marmelad|socker|honung|sirap/i, 18, [['1 tsk', 6], ['1 msk', 18], ['2 msk', 36]]],
  [/smaksättare|dressing|majonnäs|krydda|chutney|sås i/i, 15, [['1 tsk', 5], ['1 msk', 15], ['0,5 dl', 50]]],
  [/frukostflingor/i, 40, [['1 dl', 25], ['1,5 dl', 40], ['2 dl', 55]]],
  [/soppa/i, 300, [['1 liten skål', 200], ['1 skål', 300], ['1 stor skål', 400]]],
  [/pasta|ris eller|potatis och stärkelse|spannmål|cerealier eller/i, 200, [['liten portion', 150], ['portion', 200], ['stor portion', 300]]],
  [/rätt|pizza|paj|smörgåsar|färdigsallad|pannkaka|våffla|maträtter/i, 300, [['liten portion', 200], ['portion', 300], ['stor portion', 400]]],
  [/fisk|skaldjur|fågel|kött|korv|innanmat|vegetariska produkter|baljväxter/i, 125, [['liten bit', 80], ['portion', 125], ['stor portion', 180], ['1 dl', 60]]],
  [/grönsaker|svamp|rotfrukter/i, 100, [['1 dl', 50], ['liten portion', 75], ['portion', 125], ['stor portion', 200]]],
];
export function portionPresets(food) {
  if (food.quantityGrams) {
    const whole = { label: `Hela (${fmtSize(food.quantityGrams, food.liquid)})`, grams: food.quantityGrams };
    const list = [whole, ...(food.serving?.grams && food.serving.grams !== food.quantityGrams ? [{ label: food.serving.label || '1 portion', grams: food.serving.grams }] : []), { label: 'Hälften', grams: Math.round(food.quantityGrams / 2) }, { label: '100 g', grams: 100 }];
    return { def: food.quantityGrams <= 600 ? food.quantityGrams : (food.serving?.grams || 150), list };
  }
  // Rätter/gröt efter namn först (annars kan gruppens ord ge smör-portioner till gröt), sedan huvudgruppen utan exempeltext
  const name = food.name || '', gm = groupMain(food.group);
  if (/gröt|risotto|paella|gratäng|lasagne|pytt|gryta|wok|sallad med|pannkak|omelett|pizza|paj|smörgås|macka|tallrik|rätt\b/i.test(name)) { const [, def, list] = PORTIONS.find(([re]) => re.source.startsWith('rätt')); return { def, list: list.map(([label, grams]) => ({ label, grams })) }; }
  for (const [re, def, list] of PORTIONS) if (wordTest(re, gm) || (!gm && wordTest(re, name))) return { def, list: list.map(([label, grams]) => ({ label, grams })) };
  if (food.serving?.grams) return { def: food.serving.grams, list: [{ label: food.serving.label || '1 portion', grams: food.serving.grams }, { label: '50 g', grams: 50 }, { label: '100 g', grams: 100 }, { label: '200 g', grams: 200 }] };
  return { def: 100, list: [{ label: '50 g', grams: 50 }, { label: '100 g', grams: 100 }, { label: '150 g', grams: 150 }, { label: '200 g', grams: 200 }] };
}

const EMOJI = [
  [/kaffe|te och/i, '☕'], [/öl|cider/i, '🍺'], [/vin|likör|sprit/i, '🍷'], [/juice|läsk|dryck|vatten/i, '🥤'], [/mjölk|fil och|grädde|vegetabiliska mejeri|vassle/i, '🥛'],
  [/ost/i, '🧀'], [/smör|margarin/i, '🧈'], [/olja|fett/i, '🫒'], [/bröd/i, '🍞'], [/bageri|kakor|dessert/i, '🍰'], [/glass/i, '🍦'], [/choklad|konfekt/i, '🍫'], [/snacks/i, '🍿'],
  [/frukt|bär|processad frukt/i, '🍎'], [/ägg/i, '🥚'], [/nöt|frö|kärna/i, '🥜'], [/sylt|marmelad|honung|sirap|socker/i, '🍯'], [/krydda|smaksättare|dressing|chutney|sås/i, '🧂'],
  [/flingor/i, '🥣'], [/soppa/i, '🍲'], [/pasta/i, '🍝'], [/ris eller|spannmål|cerealier/i, '🍚'], [/potatis/i, '🥔'], [/pizza|paj/i, '🍕'], [/smörgås/i, '🥪'], [/sallad/i, '🥗'], [/pannkaka|våffla/i, '🥞'],
  [/fisk|skaldjur/i, '🐟'], [/fågel/i, '🍗'], [/korv/i, '🌭'], [/kött|innanmat/i, '🥩'], [/vegetarisk|baljväxt/i, '🌱'], [/grönsak|svamp|rotfrukt/i, '🥦'], [/rätt|maträtter/i, '🍽️'],
];
// Ordgränsmatchning som förstår åäö: "öl" ska inte träffa "mjölk", "smör" inte "smörgåsar". Gruppens exempeltext ("t.ex. …") ignoreras.
const wordRe = new Map();
export function wordTest(re, s) { let w = wordRe.get(re); if (!w) { w = new RegExp('(^|[^a-zåäöéü])(?:' + re.source + ')', 'i'); wordRe.set(re, w); } return w.test(s || ''); }
export const groupMain = g => (g || '').split(/\s+t\.ex\.|\s*\(/i)[0].trim();
// Emoji efter namnet först (rätten), sedan efter grupp. Rätt-ord får träffa inne i sammansättningar ("havregrynsGRÖT", "kycklingSOPPA").
// Produktnamn hos Open Food Facts är ofta på andra språk – "blåbär" ska träffa Blueberry/Myrtille/Heidelbeere
const WORD_SYN = { 'blåbär': ['blueberry', 'blueberries', 'myrtille', 'heidelbeere', 'bosbes', 'blåbær', 'mirtillo'], jordgubb: ['strawberry', 'fraise', 'erdbeere', 'aardbei', 'jordbær', 'jordgubbe'], hallon: ['raspberry', 'framboise', 'himbeere', 'bringebær'], vanilj: ['vanilla', 'vanille', 'vaniglia'], naturell: ['natural', 'nature', 'plain', 'natur', 'naturel', 'unsweetened', 'osötad'], choklad: ['chocolate', 'chocolat', 'schokolade', 'sjokolade', 'choco'], kokos: ['coconut', 'coco', 'kokosnuss'], persika: ['peach', 'pêche', 'pfirsich', 'perzik'], 'körsbär': ['cherry', 'cerise', 'kirsche', 'kers'], citron: ['lemon', 'zitrone', 'citroen'], havre: ['oat', 'oats', 'hafer', 'avoine'], mandel: ['almond', 'amande'], soja: ['soy', 'soya'], yoghurt: ['yogurt', 'yoghurt', 'joghurt', 'jogurt', 'yaourt', 'yog'], 'mjölk': ['milk', 'milch', 'lait', 'melk'], skogsbär: ['forest fruit', 'waldfrucht', 'fruits rouges', 'red fruits', 'berries'] };
export const wordVariants = t => [t, ...(WORD_SYN[t] || [])];
const DISH_EMOJI = [
  [/gröt|müsli|musli|granola|overnight/i, '🥣'], [/smörgås|macka|toast|fralla/i, '🥪'], [/pannkak|våffl|plätt/i, '🥞'], [/pizza/i, '🍕'], [/sopp/i, '🍲'], [/sallad/i, '🥗'],
  [/pasta|spaghetti|lasagne|makaron|nudl|risotto|gratäng|paella/i, '🍝'], [/wok|gryta|pytt/i, '🍲'], [/omelett|äggröra/i, '🥚'], [/smoothie/i, '🥤'], [/färskost|keso|cottage/i, '🧀'],
];
const NAME_EMOJI = [
  [/vatten|water\b/i, '💧'], [/\bris\b|rice\b|couscous|bulgur|quinoa/i, '🍚'], [/potatis|pommes|potato|fries|mos\b/i, '🥔'], [/ägg\b|\begg/i, '🥚'], [/kyckling|kalkon|chicken|turkey/i, '🍗'],
  [/lax|torsk|fisk|räk|tonfisk|sill|makrill|skaldjur|salmon|tuna|shrimp|\bfish/i, '🐟'], [/sushi/i, '🍣'], [/korv|sausage|hot ?dog/i, '🌭'], [/hamburg|burgare|burger/i, '🍔'], [/taco|tortilla|wrap|burrito/i, '🌮'], [/kebab|falafel/i, '🥙'],
  [/kött|biff|färs(?![a-zåäö])|fläsk|skinka|bacon|lamm|köttbull|beef|pork|\bham\b|meatball/i, '🥩'], [/banan|banana/i, '🍌'], [/äpple|apple/i, '🍎'], [/apelsin|clementin|citrus|orange/i, '🍊'], [/blåbär|blueberr/i, '🫐'],
  [/jordgubb|hallon|bär\b|strawberr|raspberr|berries/i, '🍓'], [/avokado|avocado/i, '🥑'], [/morot|broccoli|spenat|gurka|tomat|paprika|grönsak|sallat|kål|vegetable/i, '🥦'],
  [/yoghurt|yogurt|joghurt|kvarg|skyr|filmjölk|\bfil\b|keso|quark/i, '🥛'], [/havredryck|sojadryck|mandeldryck|oat ?drink|oatly|mjölk|milk/i, '🥛'],
  [/ost\b|cheddar|mozzarella|feta|halloumi|cheese/i, '🧀'], [/kaffe|latte|cappuccino|espresso|coffee/i, '☕'], [/\bte\b|grönt te|\btea\b/i, '🍵'], [/juice|nektar|smoothie/i, '🧃'],
  [/cola|läsk|fanta|sprite|pepsi|zingo|trocadero|energidryck|energy|red bull|monster|nocco|celsius|soda\b|lemonad/i, '🥤'], [/\böl\b|lager|ipa\b|\bbeer/i, '🍺'], [/\bvin\b|rosé|prosecco|\bwine/i, '🍷'],
  [/proteinbar|\bbar\b|snickers|mars\b|twix|kexchoklad|choklad|kakao|chocolate/i, '🍫'], [/godis|candy|gel[ée]|lakrits|tuggummi/i, '🍬'], [/chips|crisps|ostbåg|popcorn|snacks/i, '🍿'],
  [/glass|ice ?cream/i, '🍦'], [/bröd|knäcke|limpa|fralla|bread|toast/i, '🍞'], [/bulle|kaka|tårta|muffin|kex|cookie|biscuit|cake/i, '🍪'], [/nöt|mandel|jordnöt|cashew|\bnuts?\b|almond|peanut/i, '🥜'],
  [/smör|margarin|butter/i, '🧈'], [/olja|\boil\b/i, '🫒'], [/flingor|cornflakes|cereal/i, '🥣'], [/bönor|linser|kikärt|tofu|beans|lentil/i, '🌱'], [/ketchup|senap|majonnäs|dressing|sås\b|sauce/i, '🧂'],
];
export function foodEmoji(food) {
  const name = food.name || '', gm = groupMain(food.group);
  for (const [re, e] of DISH_EMOJI) if (re.test(name)) return e;
  for (const [re, e] of NAME_EMOJI) if (wordTest(re, name)) return e;
  for (const [re, e] of EMOJI) if (wordTest(re, gm)) return e;
  for (const [re, e] of EMOJI) if (wordTest(re, name)) return e;
  return '🍽️';
}

// ---- Open Food Facts ----
const OFF_FIELDS = 'code,product_name,product_name_sv,brands,nutriments,serving_size,serving_quantity,quantity,image_small_url,image_front_small_url';
function fromOFF(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'] ?? n['energy-kcal'];
  if (kcal == null && n['energy_100g'] != null) kcal = n['energy_100g'] / 4.184;
  const protein = n['proteins_100g'] ?? 0, carbs = n['carbohydrates_100g'] ?? 0, fat = n['fat_100g'] ?? 0;
  if (kcal == null) kcal = protein * 4 + carbs * 4 + fat * 9;
  if (!kcal && !protein && !carbs && !fat) return null;
  const name = p.product_name_sv || p.product_name || 'Okänd produkt';
  // OFF listar ofta "Bolag, Varumärke" – välj det kortaste (varumärket), inte bolagsnamnet
  const brandList = (Array.isArray(p.brands) ? p.brands : String(p.brands || '').split(',')).map(b => String(b).trim()).filter(Boolean);
  const brand = brandList.sort((a, b) => a.length - b.length)[0] || '';
  const sq = parseFloat(p.serving_quantity);
  return {
    key: 'off:' + p.code, name, brand, source: 'off', image: p.image_front_small_url || p.image_small_url || '',
    per100: { kcal: Math.round(kcal), protein: round(protein, 1), carbs: round(carbs, 1), fat: round(fat, 1), fiber: n['fiber_100g'], sugar: n['sugars_100g'], salt: n['salt_100g'] },
    serving: sq > 0 ? { label: '1 portion (' + (p.serving_size || sq + ' g') + ')', grams: sq } : null,
    quantity: p.quantity || '',
    quantityGrams: parseQuantity(p.quantity)?.grams || 0,
    liquid: parseQuantity(p.quantity)?.liquid ?? /dryck|läsk|juice|mjölk|öl|vatten|drink|beverage|soda|cola/i.test(name),
  };
}
export async function lookupBarcode(code) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, { signal: ctl.signal });
    if (r.status === 404) return null;
    const j = await r.json();
    if (j.status === 0 || !j.product) return null;
    return fromOFF(j.product);
  } finally { clearTimeout(t); }
}
// ---- Förpackningsstorlekar ----
export function parseQuantity(str) {
  if (!str) return null;
  let s = String(str).toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ').trim();
  let count = 1;
  const multi = /(\d+)\s*[x×*]\s*([\d.]+)\s*(ml|cl|dl|l|g|kg)\b/.exec(s);
  if (multi) { count = +multi[1]; s = multi[2] + ' ' + multi[3]; }
  const m = /([\d.]+)\s*(ml|cl|dl|liter|l|kg|gram|g)\b/.exec(s);
  if (!m) return null;
  const v = parseFloat(m[1]), u = m[2];
  if (!(v > 0)) return null;
  const grams = u === 'ml' ? v : u === 'cl' ? v * 10 : u === 'dl' ? v * 100 : (u === 'l' || u === 'liter') ? v * 1000 : u === 'kg' ? v * 1000 : v;
  const liquid = ['ml', 'cl', 'dl', 'l', 'liter'].includes(u);
  return { grams: Math.round(grams), count, liquid, label: fmtSize(Math.round(grams), liquid) };
}
export function fmtSize(grams, liquid) {
  const big = (g, unit) => (g / 1000).toFixed(g % 1000 ? (g % 100 ? 2 : 1) : 0).replace('.', ',') + ' ' + unit;
  if (liquid) { if (grams >= 1000) return big(grams, 'l'); if (grams >= 100 && grams % 10 === 0) return (grams / 10) + ' cl'; return grams + ' ml'; }
  if (grams >= 1000) return big(grams, 'kg');
  return grams + ' g';
}
const CONTAINERS = [
  [/glasflaska/, true, [250, 330, 500]],
  [/burk|can\b/, true, [250, 330, 500]],
  [/flaska|pet|bottle/, true, [330, 500, 1000, 1500]],
  [/kartong|tetra|brik/, true, [200, 250, 330, 500, 1000]],
  [/bägare|cup|yoghurt|kvarg/, false, [150, 175, 200, 250, 500, 1000]],
  [/påse|bag/, false, [40, 50, 100, 150, 175, 200, 275, 300]],
  [/\bbar\b|stång/, false, [35, 45, 50, 55, 60, 70]],
  [/kaka|choklad|tablet/, false, [40, 50, 100, 200]],
  [/låda|tråg|färdigmat|tray/, false, [300, 350, 400, 450]],
  [/pinne|glass/, false, [60, 80, 100, 120]],
];
export function packageSizes(container = '', unitGrams = 0, liquid = null) {
  const c = String(container || '').toLowerCase();
  let sizes = null, liq = liquid;
  for (const [re, isLiquid, list] of CONTAINERS) if (re.test(c)) { sizes = [...list]; if (liq === null) liq = isLiquid; break; }
  if (!sizes) sizes = unitGrams ? [Math.round(unitGrams / 2), unitGrams, unitGrams * 2] : [100, 200, 330, 500];
  if (unitGrams && !sizes.includes(unitGrams)) sizes.push(unitGrams);
  sizes = [...new Set(sizes)].sort((a, b) => a - b);
  return sizes.map(g => ({ grams: g, label: fmtSize(g, !!liq) }));
}

// ---- Produktsök hos Open Food Facts (v2-API:t har CORS men bara filter, ingen fritext → sök per varumärke) ----
export const productTitle = p => { const b = (p.brand || '').trim(), n = (p.name || '').trim(); return !b || n.toLowerCase().startsWith(b.toLowerCase()) || n.toLowerCase().includes(b.toLowerCase()) ? n : `${b} ${n}`; };
export const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function offSearch(params, timeout = 9000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const u = new URL('https://world.openfoodfacts.org/api/v2/search');
    for (const [k, v] of Object.entries({ page_size: 100, fields: OFF_FIELDS, ...params })) u.searchParams.set(k, v);
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return (j.products || []).map(fromOFF).filter(Boolean);
  } finally { clearTimeout(t); }
}
const dedupe = list => { const seen = new Set(); return list.filter(p => !seen.has(p.key) && seen.add(p.key)); };
export function rankProducts(list, query, sizeGrams = null) {
  const qt = norm(query).split(' ').filter(t => t.length > 1);
  return list.map(p => {
    const pn = norm(p.name), bn = norm(p.brand || ''), all = pn + ' ' + bn;
    let s = 0;
    const hit = (hay, t) => wordVariants(t).some(v => hay.includes(v));
    for (const t of qt) { if (hit(pn, t)) s += 10; else if (hit(bn, t)) s += 4; }
    if (qt.length && qt.every(t => hit(all, t))) s += 15;
    if (sizeGrams && p.quantityGrams) s += Math.abs(p.quantityGrams - sizeGrams) <= Math.max(15, sizeGrams * 0.06) ? 14 : -5;
    if (!p.quantityGrams) s -= 2;
    if (!p.per100.kcal && !p.per100.protein) s -= 20;
    if (p.image) s += 1;
    s -= Math.min(6, pn.length / 12);
    return { p, s };
  }).sort((a, b) => b.s - a.s).map(x => ({ ...x.p, _score: x.s }));
}
export async function searchProductsByBrand(brand, product = '', { sizeGrams = null } = {}) {
  const b = slug(brand); if (!b) return [];
  let list = [];
  try { list = await offSearch({ brands_tags: b, countries_tags_en: 'sweden' }); } catch {}
  if (list.length < 5) { try { list = dedupe([...list, ...await offSearch({ brands_tags: b })]); } catch {} }
  return rankProducts(list, `${brand} ${product}`, sizeGrams);
}
// Fritext: första ordet (eller två) tolkas som varumärke – så folk söker förpackade varor ("lindahls kvarg", "arla mellanmjölk")
export async function searchProducts(q) {
  const toks = norm(q).split(' ').filter(Boolean);
  if (!toks.length) return [];
  let list = await searchProductsByBrand(toks[0], toks.slice(1).join(' '));
  if (list.length < 3 && toks.length > 1) list = dedupe([...list, ...await searchProductsByBrand(toks.slice(0, 2).join(' '), toks.slice(2).join(' '))]);
  const rest = toks.slice(1);
  return list.filter(p => !rest.length || rest.some(t => wordVariants(t).some(v => norm(p.name + ' ' + (p.brand || '')).includes(v)))).slice(0, 25);
}

// ---- Förankring av AI-identifierade komponenter i Livsmedelsverkets värden ----
const SYN = [['mjölk fett 1,5', 'mellanmjölk fett 1,5'], ['mjölk fett 1 5', 'mellanmjölk fett 1 5'], ['mjölk fett 0,5', 'lättmjölk fett 0,5'], ['mjölk fett 0 5', 'lättmjölk fett 0 5'], ['standardmjölk', 'mjölk fett 3'], ['ris kokt', 'ris långkornigt kokt'], ['vitt ris', 'ris långkornigt kokt'], ['basmatiris', 'ris basmati'], ['jasminris', 'ris jasmin'], ['potatis kokt', 'potatis höst kokt'], ['kokt potatis', 'potatis höst kokt'], ['kycklingfilé', 'kyckling bröstfilé'], ['kycklingfile', 'kyckling bröstfilé'], ['kycklingbröst', 'kyckling bröstfilé'], ['kycklinglår', 'kyckling lår'], ['kycklingfärs', 'kyckling färs'], ['kycklingvingar', 'kyckling vinge'], ['nötfärs', 'nöt färs'], ['köttfärs', 'nöt färs'], ['blandfärs', 'blandfärs'], ['fläskfilé', 'gris fläskfilé'], ['fläskkotlett', 'gris fläskkotlett'], ['fläskkarré', 'gris karré'], ['skinka', 'gris skinka'], ['potatismos', 'potatis mos'], ['pommes', 'pommes frites'], ['räkor', 'räka'], ['keso', 'färskost cottage cheese'], ['knäckebröd', 'hårt bröd'], ['knäcke', 'hårt bröd'], ['pannkakor', 'pannkaka'], ['pyttipanna', 'pytt i panna'], ['pytt', 'pytt i panna'], ['turkisk yoghurt', 'yoghurt typ grekisk'], ['grekisk yoghurt', 'yoghurt typ grekisk'], ['morötter', 'morot'], ['nötter', 'nötter'], ['gräddsås', 'sås grädd'], ['brunsås', 'sås brun'], ['tomatsås', 'sås tomat'], ['olivolja', 'olivolja']];
export function anchorSearch(q, limit = 4) {
  let nq = norm(q);
  nq = applySyn(nq);
  const toks = nq.split(' ').filter(Boolean);
  if (!toks.length || !DB) return [];
  const out = [];
  for (const f of DB) {
    let s = 0, matched = 0, weak = 0;
    for (const t of toks) {
      // Exakt ord slår början-av-sammansättning: "vatten" ska inte bli "Vattenmelon", "ris" inte "Risgrynsgröt"
      if (f._w[0] === t) { s += 34; matched++; }
      else if (f._w.includes(t)) { s += 26; matched++; }
      else if (f._w.some(w => w.startsWith(t) && w.length - t.length <= 2)) { s += 20; matched++; }          // böjning: ägg→ägget, räka→räkor
      else if (t.length >= 3 && f._w.some(w => w.endsWith(t))) { s += f._w[0].endsWith(t) ? 30 : 22; matched++; }   // huvudordet sist: mellanMJÖLK, rågBRÖD, kycklingFILÉ
      else if (f._w.some(w => w.startsWith(t))) { s += 10; matched++; weak++; }                                 // förled: VATTENmelon, MJÖLKchoklad – inte samma sak
      else if (t.length >= 4 && f._n.includes(t.slice(0, -1))) { s += 8; matched++; weak++; }
    }
    if (!matched) continue;
    if (matched < toks.length) s -= 25 * (toks.length - matched);
    if (f._n === nq) s += 40;
    s -= Math.min(14, f._n.length / 5);
    s += rankAdjust(f, nq);
    // Bara svaga träffar (sammansättningar) räknas inte som täckning – då litar vi hellre på AI:ns egen skattning
    out.push({ f, s, coverage: (matched - weak) / toks.length });
  }
  out.sort((a, b) => b.s - a.s);
  return out.slice(0, limit);
}
// Väljer databaspost om täckningen är rimlig och energitätheten ligger inom 0,4–2,5× AI:ns egen skattning.
export function matchItem(query, aiKcal, grams, { zeroCal = false } = {}) {
  const cands = anchorSearch(query, 4);
  const aiPer100 = grams ? (aiKcal || 0) / grams * 100 : 0;
  const good = cands.filter(c => c.coverage >= 0.5).map(c => c.f);
  let chosen = null;
  for (const f of good) {
    // Kalorifri dryck (vatten, kaffe, te, light): godta bara lika kalorifria livsmedel – "Vatten" får aldrig bli "Vattenmelon"
    if (zeroCal && grams > 0 && aiPer100 <= 5) { if ((f.per100.kcal || 0) <= 12) { chosen = f; break; } continue; }
    const ratio = aiPer100 > 0 && f.per100.kcal > 0 ? f.per100.kcal / aiPer100 : 1;
    if (ratio > 0.4 && ratio < 2.5) { chosen = f; break; }
  }
  // Saknar AI:n energivärde för riktig mat (0 kcal) finns inget att rimlighetspröva mot – då gäller bästa träffen i Livsmedelsverket
  if (!chosen && !zeroCal && !(aiKcal > 0) && good.length) chosen = good[0];
  return { chosen, candidates: good.slice(0, 3).map(f => ({ key: f.key, name: f.name, per100: f.per100, group: f.group })) };
}

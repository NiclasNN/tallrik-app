// AI-motor 2.0: anropar en molnmodell direkt från telefonen med användarens egen gratisnyckel (ingen server, ingen Claude Max).
// Leverantörer: Google Gemini (rekommenderad), Groq, OpenRouter. Två analyslägen: tallrik (visuell skattning) och
// förpackning (läs etiketten). Varje komponent förankras i Open Food Facts (exakt produkt) eller Livsmedelsverket.
import { state, dequeueAnalysis, getPhoto, blobToDataURL, addEntry, commit, getCorrection, activeUserId, clearSharedKey, mergeSharedKeys, mergeSharedBackup } from './store.js?v=202609171301';
import { toast, IS_LOCAL_HOST, fixEscapes } from './components.js?v=202609171301';
import { loadDB, matchItem, scale, lookupBarcode, searchProductsByBrand, parseQuantity, packageSizes, fmtSize, productTitle } from './foods.js?v=202609171301';

export const PROVIDERS = {
  gemini: { id: 'gemini', name: 'Google Gemini', tagline: 'Rekommenderad · gratis · toppklass på matbilder', keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'AIza…', free: 'Gratisnivån räcker till hundratals analyser per dag. Inget kort, ingen kostnad.', steps: ['Öppna Google AI Studio och logga in med ditt Google-konto', 'Tryck "Create API key" (välj eller skapa ett projekt)', 'Kopiera nyckeln och klistra in den här'] },
  groq: { id: 'groq', name: 'Groq', tagline: 'Gratis · extremt snabb', keyUrl: 'https://console.groq.com/keys', keyHint: 'gsk_…', free: 'Gratisnivå med generösa dagsgränser.', steps: ['Skapa konto på console.groq.com', 'Gå till API Keys → Create API Key', 'Kopiera nyckeln och klistra in den här'] },
  openrouter: { id: 'openrouter', name: 'OpenRouter', tagline: 'Många gratis modeller', keyUrl: 'https://openrouter.ai/keys', keyHint: 'sk-or-…', free: 'Gratismodeller med dagsgräns (ca 50 anrop/dag).', steps: ['Skapa konto på openrouter.ai', 'Keys → Create Key', 'Kopiera nyckeln och klistra in den här'] },
};
function aiSettings() {
  if (!state.settings.ai) state.settings.ai = { provider: 'gemini', textProvider: 'auto', keys: {}, models: {}, available: {}, mode: 'fast' };
  const a = state.settings.ai;
  a.keys ||= {}; a.models ||= {}; a.available ||= {}; a.mode ||= 'fast'; a.provider ||= 'gemini'; a.textProvider ||= 'auto';
  return a;
}
// Foto = a.provider (Gemini rekommenderas). Text (recept, förslag, coach) = a.textProvider, 'auto' = Groq → OpenRouter → Gemini
// så att Geminis gratiskvot sparas till fotona.
export function textProviderId() {
  const a = aiSettings();
  const has = id => !!(a.keys[id] || '').trim();
  if (a.textProvider && a.textProvider !== 'auto' && has(a.textProvider)) return a.textProvider;
  return ['groq', 'openrouter', 'gemini'].find(has) || null;
}
// Fotoanalys: Gemini är motorn (bäst på tallrikar och förpackningar) och väljs automatiskt så fort nyckeln finns.
// Ingen tyst reserv på en svagare modell – saknas Gemini-nyckeln säger appen det. Ett manuellt val under Profil respekteras.
export function photoProviderId() {
  const a = aiSettings();
  const has = id => !!(a.keys[id] || '').trim();
  if (a.providerManual && has(a.provider)) return a.provider;
  return has('gemini') ? 'gemini' : null;
}
export function aiStatus() {
  const a = aiSettings();
  const pp = photoProviderId();
  const key = pp ? (a.keys[pp] || '').trim() : '';
  const tp = textProviderId();
  return { configured: !!key, provider: pp || a.provider, providerName: PROVIDERS[pp || a.provider]?.name || a.provider, mode: a.mode, model: pp ? pickModel(pp, a.mode) : '', key,
    photoUsesFallback: !!pp && pp !== 'gemini', geminiMissing: !(a.keys.gemini || '').trim(),
    textConfigured: !!tp, textProvider: tp, textProviderName: tp ? PROVIDERS[tp].name : '', textModel: tp ? pickModel(tp, 'text') : '', textUsesGemini: tp === 'gemini' };
}
export function setTextProvider(id) { aiSettings().textProvider = id; commit('settings'); }
// Känn igen nyckeltyp på prefixet så att en nyckel hamnar rätt oavsett var den klistras in
export function detectProvider(key) { const k = String(key || '').trim(); return /^gsk_/.test(k) ? 'groq' : /^AIza/.test(k) ? 'gemini' : /^sk-or-/.test(k) ? 'openrouter' : null; }
// Lägg till valfri nyckel: testa, spara på rätt leverantör och sätt roller (foto: Gemini om möjligt, text: Groq/OpenRouter)
export async function addKey(key, preferred = null) {
  const provider = detectProvider(key) || preferred;
  if (!provider) throw new AIError('Nyckeln känns inte igen. Gemini-nycklar börjar med AIza, Groq med gsk_, OpenRouter med sk-or-.', 'badkey');
  const r = await testKey(provider, key, { keepProvider: true });
  const a = aiSettings();
  const has = id => !!(a.keys[id] || '').trim();
  if (provider === 'gemini' || !has(a.provider)) a.provider = provider === 'gemini' ? 'gemini' : (has('gemini') ? 'gemini' : provider);
  if (provider === 'groq' || provider === 'openrouter') a.textProvider = provider;
  commit('settings');
  setTimeout(() => processQueue().catch(() => {}), 300);   // köade foton analyseras direkt när nyckeln är på plats
  return { provider, ...r };
}
// Inbakade nycklar (keys.bundle.json, skapad av byggskriptet/hemservern): finns med från första start, ingen behöver mata in dem.
// Fyller bara luckor – nycklar man själv lagt in rör vi aldrig.
const BK = 'tallrik-hemma-2026';
function decodeBundle(b) {
  if (!b || !b.d) return {};
  const bytes = Uint8Array.from(atob(b.d), c => c.charCodeAt(0));
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= BK.charCodeAt(i % BK.length);
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return {}; }
}
let bundleTries = 0, bundleTimer = null;
export async function loadBundledKeys() {
  clearTimeout(bundleTimer);
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    let r; try { r = await fetch('keys.bundle.json', { cache: 'no-cache', signal: ctl.signal }); } finally { clearTimeout(t); }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const keys = decodeBundle(await r.json());
    if (!Object.keys(keys).length) return false;
    bundleTries = 0;
    mergeSharedKeys(keys);   // enhetsnivå: profiler som skapas senare ärver nycklarna (även när ingen profil finns ännu vid start)
    const a = aiSettings(); let changed = false;
    for (const [k, v] of Object.entries(keys)) if (v && PROVIDERS[k] && !(a.keys[k] || '').trim()) { a.keys[k] = v; changed = true; }
    if (!changed) return false;
    if (!(a.keys[a.provider] || '').trim() && a.keys.gemini) a.provider = 'gemini';
    if ((a.textProvider === 'auto' || !(a.keys[a.textProvider] || '').trim()) && a.keys.groq) a.textProvider = 'groq';
    commit('keys');   // annan tagg än 'settings' så att Idag-vyn ritas om (kortet "Aktivera fotoanalysen" försvinner)
    return true;
  } catch {
    // Dålig uppkoppling vid start: försök igen med växande väntan (nycklarna ska aldrig behöva skrivas in för hand)
    if (bundleTries < 6) { bundleTimer = setTimeout(() => loadBundledKeys().catch(() => {}), [4000, 10000, 20000, 45000, 90000, 180000][bundleTries++]); }
    return false;
  }
}
// Nyckelsynk via den lokala servern (hemmanätet): hämta saknade nycklar vid start, skicka egna när de sparas. På GitHub Pages finns
// ingen /api/keys → tyst nej. Gör att nycklarna räcker att läggas in en gång, på vilken enhet som helst.
export async function syncKeysWithHost() {
  if (!IS_LOCAL_HOST) return false;   // på GitHub Pages skickas aldrig nycklar någonstans
  try {
    const r = await fetch('/api/keys', { signal: AbortSignal.timeout(4000) });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return false;
    const j = await r.json(); const remote = j.keys || {};
    const a = aiSettings(); let changed = false;
    mergeSharedKeys(remote);
    for (const [k, v] of Object.entries(remote)) if (v && !(a.keys[k] || '').trim() && PROVIDERS[k]) { a.keys[k] = v; changed = true; }
    const mine = Object.fromEntries(Object.entries(a.keys).filter(([k, v]) => v && PROVIDERS[k] && remote[k] !== v));
    const bt = (state.settings.backup?.token || '').trim(); if (bt && remote.github !== bt) mine.github = bt;
    if (remote.github && !(state.settings.backup?.token || '').trim()) { mergeSharedBackup({ token: remote.github, repo: remote.githubRepo || 'NiclasNN/tallrik-data' }); state.settings.backup = { ...(state.settings.backup || {}), token: remote.github, repo: remote.githubRepo || 'NiclasNN/tallrik-data', enabled: true }; changed = true; }
    if (Object.keys(mine).length) fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: mine }), signal: AbortSignal.timeout(4000) }).catch(() => {});
    if (changed) { if (!(a.keys[a.provider] || '').trim() && a.keys.gemini) a.provider = 'gemini'; commit('settings'); }
    return changed;
  } catch { return false; }
}
function pushKeysToHost() { if (!IS_LOCAL_HOST) return; try { const a = aiSettings(); const keys = Object.fromEntries(Object.entries(a.keys).filter(([k, v]) => v && PROVIDERS[k])); if (Object.keys(keys).length) fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }), signal: AbortSignal.timeout(4000) }).catch(() => {}); } catch {} }
export function removeKey(provider) { const a = aiSettings(); delete a.keys[provider]; delete a.available[provider]; if (a.textProvider === provider) a.textProvider = 'auto'; if (a.provider === provider) a.provider = ['gemini', 'groq', 'openrouter'].find(p => (a.keys[p] || '').trim()) || 'gemini'; clearSharedKey(provider); commit('settings'); }
export function setProvider(id) { const a = aiSettings(); a.provider = id; a.providerManual = true; commit('settings'); }
export function setKey(provider, key) { aiSettings().keys[provider] = (key || '').trim(); commit('settings'); }
export function setMode(mode) { aiSettings().mode = mode; commit('settings'); }
export function setModelChoice(provider, mode, model) { const a = aiSettings(); a.models[provider] ||= {}; a.models[provider][mode] = model; commit('settings'); }
export function availableModels(provider) { return aiSettings().available[provider] || []; }

// ---- Modellval: rangordna automatiskt, användaren kan välja manuellt ----
const ver = n => { const m = /(\d+)(?:\.(\d+))?/.exec(n.replace(/^.*?gemini-/, '')); return m ? parseFloat(m[1] + '.' + (m[2] || 0)) : 0; };
// Modellhälsa: en modell som nyss svarat 503/timeout/429 straffas i 30 min så att vi inte fastnar på en överbelastad modell
function healthPenalty(model) { const h = aiSettings().health?.[model]; if (!h?.lastFail) return 0; return Date.now() - Date.parse(h.lastFail) < 10 * 60 * 1000 ? Math.min(50, 25 * (h.fails || 1)) : 0; }
function noteFailure(model) { const a = aiSettings(); a.health ||= {}; const h = a.health[model] || { fails: 0 }; h.fails = (Date.now() - Date.parse(h.lastFail || 0) < 10 * 60 * 1000 ? h.fails : 0) + 1; h.lastFail = new Date().toISOString(); a.health[model] = h; commit('settings'); }
function rankGemini(name, mode) {
  const n = name.toLowerCase();
  if (!/gemini/.test(n) || /embed|tts|image|live|audio|computer|robot|veo|imagen|learnlm|gemma|transcribe|customtools/.test(n)) return -1;
  const v = ver(n), pro = /pro/.test(n), flash = /flash/.test(n), lite = /lite/.test(n), preview = /preview|exp/.test(n) || /\d{2}-\d{2}$/.test(n);
  let s = mode === 'precision' ? (pro ? 100 : flash && !lite ? 80 : lite ? 40 : 0) : (flash && !lite ? 100 : lite ? 70 : pro ? 40 : 0);
  // Beprövad och snabb generation först (2.5-flash svarar på ~1–3 s); de allra nyaste flash-modellerna har gett 503 "hög belastning"
  // och tiotals sekunders väntan. Nyare får gärna vinna när 2.5 försvinner ur listan.
  if (v >= 2.5 && v < 3) s += 30; else if (v >= 3) s += 10; else s -= 40;
  if (preview) s -= 15;
  if (/thinking/.test(n)) s -= 20;
  return s - healthPenalty(name);
}
function rankOpenAIStyle(m, mode, provider) {
  const n = (m.id || '').toLowerCase();
  if (provider === 'groq') {
    if (mode === 'text') {
      if (/whisper|tts|guard|embed|compound|allam/.test(n)) return -1;
      if (/gpt-oss-120b/.test(n)) return 100; if (/llama-3\.3-70b/.test(n)) return 95; if (/maverick/.test(n)) return 90; if (/qwen3-32b|qwen-3-32b/.test(n)) return 85; if (/gpt-oss-20b/.test(n)) return 80; if (/scout/.test(n)) return 75; if (/kimi|deepseek/.test(n)) return 70; if (/llama-3\.1-8b/.test(n)) return 50;
      return 20;
    }
    if (!/llama-4|llava|vision|qwen3\.[6-9]|qwen.*vl/.test(n)) return -1;
    return /maverick/.test(n) ? (mode === 'precision' ? 90 : 80) : /scout/.test(n) ? (mode === 'precision' ? 80 : 90) : /qwen3\.[6-9]/.test(n) ? 60 : 50;
  }
  if (provider === 'openrouter') {
    const img = (m.architecture?.input_modalities || []).includes('image');
    const free = String(m.pricing?.prompt) === '0' || /:free$/.test(n);
    if (!free) return -1;
    if (mode === 'text') { let s = 50; if (/gpt-oss-120b|deepseek-r1|deepseek-chat|llama-3\.3-70b|qwen3-235b|gemini/.test(n)) s += 30; if (/70b|120b|235b|405b/.test(n)) s += 10; if (/free/.test(n)) s += 5; return s; }
    if (!img) return -1;
    let s = 50;
    if (/gemini/.test(n)) s += 40; if (/qwen.*vl|qwen3.*vl/.test(n)) s += 30; if (/llama-4|maverick/.test(n)) s += 25; if (/gemma-3/.test(n)) s += 15; if (/72b|235b|400b/.test(n)) s += 10;
    return s;
  }
  return -1;
}
export function pickModel(provider, mode, { exclude = [] } = {}) {
  const a = aiSettings();
  const manual = a.models[provider]?.[mode];
  if (manual && !exclude.includes(manual)) return manual;
  const list = (a.available[provider] || []).filter(m => !exclude.includes(m.id));
  if (!list.length) return provider === 'gemini' ? (mode === 'precision' ? 'gemini-2.5-pro' : mode === 'text' ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash') : provider === 'groq' ? (mode === 'text' ? 'openai/gpt-oss-120b' : 'meta-llama/llama-4-scout-17b-16e-instruct') : 'google/gemini-2.0-flash-exp:free';
  const ranked = list.map(m => ({ id: m.id, s: provider === 'gemini' ? rankGemini(m.id, mode === 'text' ? 'fast' : mode) + (mode === 'text' && /lite/.test(m.id) ? 30 : 0) : rankOpenAIStyle(m, mode, provider) - healthPenalty(m.id) })).filter(x => x.s >= 0).sort((x, y) => y.s - x.s);
  return ranked[0]?.id || list[0].id;
}

// ---- HTTP ----
class AIError extends Error { constructor(msg, code, retryable = false) { super(msg); this.code = code; this.retryable = retryable; } }
async function http(url, { method = 'GET', headers = {}, body = null, timeout = 45000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : null, signal: ctl.signal });
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) {
      const msg = j?.error?.message || j?.error || r.statusText || ('HTTP ' + r.status);
      if (r.status === 400 && /api[ _]?key/i.test(String(msg))) throw new AIError('Nyckeln verkar ogiltig – kontrollera att hela nyckeln är inklistrad.', 'badkey');
      if (r.status === 401 || r.status === 403) throw new AIError('Nyckeln godkändes inte (' + r.status + '). Skapa en ny nyckel och prova igen.', 'badkey');
      if (r.status === 429) throw new AIError(/day|daily|per day|RPD/i.test(String(msg)) ? 'Dagens gratiskvot är slut – analysen kan köras imorgon, eller byt modell/leverantör i Profil.' : 'Många anrop just nu – vänta en halv minut och försök igen.', 'ratelimit', true);
      if (r.status >= 500) throw new AIError('Tjänsten är överbelastad just nu – försök igen om en stund.', 'server', true);
      throw new AIError(String(msg).slice(0, 200), 'http');
    }
    return j;
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e.name === 'AbortError') throw new AIError('Analysen tog för lång tid – kontrollera uppkopplingen och försök igen.', 'timeout', true);
    throw new AIError('Ingen kontakt med tjänsten – är du online?', 'network', true);
  } finally { clearTimeout(t); }
}
function extractJSON(text) {
  try { window.__tallrikLastRaw = String(text || ''); } catch {}
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new AIError('Modellen svarade inte med tolkningsbar data – prova igen.', 'parse', true);
  t = t.slice(a, b + 1);
  try { return fixEscapes(JSON.parse(t)); } catch { try { return fixEscapes(JSON.parse(t.replace(/,\s*([}\]])/g, '$1'))); } catch { throw new AIError('Modellen svarade inte med tolkningsbar data – prova igen.', 'parse', true); } }
}

// ---- Leverantörsanrop ----
async function generate({ provider, key, model, prompt, imageDataURL = null, json = true, maxTokens = 2048, temperature = 0.2, thinkingBudget = null, effort = 'low' }) {
  const t0 = performance.now();
  let text = '';
  if (provider === 'gemini') {
    const parts = [];
    if (imageDataURL) { const m = /^data:(image\/\w+);base64,(.+)$/s.exec(imageDataURL); parts.push({ inline_data: { mime_type: m[1], data: m[2] } }); }
    parts.push({ text: prompt });
    const gen = { temperature, maxOutputTokens: maxTokens };
    if (json) gen.response_mime_type = 'application/json';
    const mv = ver(model);
    if (/flash/.test(model) && !/lite/.test(model)) { if (mv >= 3) gen.thinkingConfig = { thinkingLevel: aiSettings().mode === 'precision' ? 'medium' : 'low' }; else if (mv >= 2.5) gen.thinkingConfig = { thinkingBudget: thinkingBudget ?? (aiSettings().mode === 'precision' ? 1024 : 0) }; }
    let j;
    try { j = await http(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': key }, body: { contents: [{ role: 'user', parts }], generationConfig: gen }, timeout: imageDataURL ? 30000 : 45000 }); }
    catch (e) { if (isModelGone(e)) throw new AIError(`Modellen ${model} finns inte längre hos Google – hämtar ny modellista.`, 'badmodel'); throw e; }
    const c = j.candidates?.[0];
    if (!c) throw new AIError(j.promptFeedback?.blockReason ? 'Bilden stoppades av leverantörens filter.' : 'Tomt svar från modellen.', 'empty', true);
    text = (c.content?.parts || []).map(p => p.text || '').join('');
  } else {
    const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const content = imageDataURL ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageDataURL } }] : prompt;
    const body = { model, messages: [{ role: 'user', content }], temperature, max_tokens: maxTokens };
    if (json) body.response_format = { type: 'json_object' };
    if (provider === 'groq' && /qwen/.test(model)) body.reasoning_format = 'hidden';
    // gpt-oss resonerar internt och kan bränna hela svarsutrymmet → tomt svar. Lågt resonemang räcker gott för recept och planer.
    if (provider === 'groq' && /gpt-oss/.test(model)) { body.reasoning_effort = effort; body.include_reasoning = false; }
    const headers = { Authorization: 'Bearer ' + key };
    if (provider === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Tallrik'; }
    let j;
    try { j = await http(url, { method: 'POST', headers, body }); }
    catch (e) {
      if (isModelGone(e)) throw new AIError(`Modellen ${model} finns inte längre hos ${PROVIDERS[provider]?.name || provider} – hämtar ny modellista.`, 'badmodel');
      if (e.code === 'http' && /reasoning_format|reasoning_effort|include_reasoning/i.test(e.message)) { delete body.reasoning_format; delete body.reasoning_effort; delete body.include_reasoning; j = await http(url, { method: 'POST', headers, body }); }
      else if (json && e.code === 'http' && /response_format|json/i.test(e.message)) { delete body.response_format; delete body.reasoning_format; j = await http(url, { method: 'POST', headers, body }); } else throw e;
    }
    text = j.choices?.[0]?.message?.content || '';
    if (Array.isArray(text)) text = text.map(p => p.text || '').join('');
    if (!String(text).trim()) throw new AIError(j.choices?.[0]?.finish_reason === 'length' ? 'Svaret blev för långt för modellen – provar en annan.' : 'Tomt svar från modellen – provar en annan.', 'empty', true);
  }
  return { text, ms: Math.round(performance.now() - t0) };
}
const isModelGone = e => e?.code === 'http' && /model.*(does not exist|not found|decommissioned|deprecated|no longer|not supported)|model_not_found|is not found for API version/i.test(String(e.message || ''));
// Kör ett anrop med rätt modell: hämta modellistan om den saknas, och om leverantören svarar att modellen är borta → uppdatera listan och försök igen en gång
async function run(ctxFn, opts) {
  let ctx = ctxFn();
  try { if (await ensureModels(ctx.provider)) ctx = ctxFn(); } catch {}
  const tried = [];
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const model = attempt === 0 ? ctx.model : pickModel(ctx.provider, ctx.mode, { exclude: tried });
    if (!model || tried.includes(model)) break;
    tried.push(model);
    try { const r = await generate({ ...ctx, model, ...opts }); r.model = model; return r; }
    catch (e) {
      last = e;
      if (e.code === 'badmodel') { try { await ensureModels(ctx.provider, { force: true }); } catch {} ctx = ctxFn(); continue; }
      // Överbelastad/långsam/kvot slut på just den modellen → nästa modell direkt, ingen väntan
      if (e.code === 'server' || e.code === 'timeout' || e.code === 'ratelimit') { noteFailure(model); continue; }
      if (e.code === 'parse' || e.code === 'empty') continue;   // byt modell för det här anropet, men det är inget hälsoproblem hos modellen
      throw e;
    }
  }
  throw last || new AIError('Ingen modell kunde svara just nu – försök igen om en stund.', 'server', true);
}
async function withRetry(fn, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { last = e; if (!(e.retryable && i < tries - 1)) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); } }
  throw last;
}
function current() {
  const a = aiSettings(), provider = photoProviderId(), key = provider ? (a.keys[provider] || '').trim() : '';
  if (!key) throw new AIError('Ingen AI-nyckel inlagd ännu. Lägg till en gratis nyckel under Profil → AI-motor.', 'nokey');
  return { provider, key, model: pickModel(provider, a.mode), mode: a.mode };
}
function currentText() {
  const a = aiSettings(), provider = textProviderId();
  if (!provider) throw new AIError('Ingen AI-nyckel för recept ännu. Lägg till en gratis Groq-nyckel under Förslag eller Profil.', 'nokey');
  return { provider, key: (a.keys[provider] || '').trim(), model: pickModel(provider, 'text'), mode: 'text' };
}

// ---- Testa nyckel + hämta modeller ----
async function fetchModels(provider, key) {
  if (provider === 'gemini') {
    const j = await http('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, timeout: 15000 });
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }));
  }
  if (provider === 'groq') {
    const j = await http('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key }, timeout: 15000 });
    return (j.data || []).map(m => ({ id: m.id, name: m.id }));
  }
  const j = await http('https://openrouter.ai/api/v1/models', { headers: { Authorization: 'Bearer ' + key }, timeout: 15000 });
  return (j.data || []).map(m => ({ id: m.id, name: m.name || m.id, architecture: m.architecture, pricing: m.pricing }));
}
// Nycklar som kommit via inbjudan/synk/delad enhet saknar modellista → hämta den vid behov, så att vi aldrig gissar ett utgånget modell-id
const modelsInflight = {};
export async function ensureModels(provider, { force = false } = {}) {
  const a = aiSettings(), key = (a.keys[provider] || '').trim();
  if (!key || !PROVIDERS[provider]) return false;
  if (!force && (a.available[provider] || []).length) return false;
  if (!modelsInflight[provider]) modelsInflight[provider] = (async () => { try { const models = await fetchModels(provider, key); if (models.length) { a.available[provider] = models; commit('settings'); return true; } return false; } finally { delete modelsInflight[provider]; } })();
  return modelsInflight[provider];
}
export async function testKey(provider, key, { keepProvider = false } = {}) {
  key = (key || '').trim();
  if (!key) throw new AIError('Klistra in nyckeln först.', 'nokey');
  const models = await fetchModels(provider, key);
  const a = aiSettings();
  a.available[provider] = models;
  a.keys[provider] = key;
  if (!keepProvider) a.provider = provider;
  commit('settings');
  pushKeysToHost();
  const fast = pickModel(provider, 'fast'), precision = pickModel(provider, 'precision');
  if (!fast) throw new AIError('Nyckeln fungerar men ingen bildmodell hittades.', 'nomodel');
  return { models, fast, precision };
}

// ---- Prompter ----
function ctx() {
  const p = state.profile || {}, t = state.targets || {};
  return { diet: p.diet, avoid: p.avoid || [], goal: p.goal, targets: { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat } };
}
const DIET_SV = { omnivore: 'allätare', pescetarian: 'pescetarian', vegetarian: 'vegetarian', vegan: 'vegan' };
const MEAL_SV = { breakfast: 'frukost', lunch: 'lunch', dinner: 'middag', snack: 'mellanmål' };
const ANALYSIS_SCHEMA = String.raw`{"meal_title":"kort svensk titel","items":[{"type":"package","name":"Coca-Cola","emoji":"🥤","db_query":"Läsk cola sockrad","state":"","grams":330,"grams_range":[330,330],"count":1,"package":{"brand":"Coca-Cola","product":"Coca-Cola Original","variant":"","declared_size":"33 cl","container":"burk","size_read_from_label":true},"ean":"5449000000996","label_per100":{"kcal":42,"protein":0,"carbs":10.6,"fat":0},"kcal":139,"protein":0,"carbs":35,"fat":0,"confidence":0.9,"basis":"33 cl läst på burken; näring från deklarationen","alternatives":[],"hidden":false},{"type":"food","name":"Lax stekt","emoji":"🐟","db_query":"Lax stekt","state":"stekt","grams":150,"grams_range":[120,180],"count":1,"package":null,"ean":null,"label_per100":null,"kcal":300,"protein":30,"carbs":0,"fat":20,"confidence":0.8,"basis":"kort motivering","alternatives":["Regnbåge stekt"],"hidden":false}],"notes":"kort kommentar om osäkerheter"}`;
// Personens egna vanor som ledtråd (kostar inga extra anrop): det hen ofta loggar och hur hen rättat AI:n tidigare
function habitsBlock() {
  try {
    const since = Date.now() - 60 * 86400000, freq = new Map();
    for (const [k, d] of Object.entries(state.days || {})) { if (Date.parse(k) < since) continue; for (const e of d.entries || []) { const n = String(e.name || '').trim(); if (!n) continue; const f = freq.get(n) || { n: 0, grams: [] }; f.n++; if (e.grams) f.grams.push(e.grams); freq.set(n, f); } }
    const top = [...freq.entries()].filter(([, f]) => f.n >= 2).sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([n, f]) => { const g = f.grams.sort((a, b) => a - b)[Math.floor(f.grams.length / 2)]; return g ? `${n} (${g} g)` : n; });
    const corr = Object.entries(state.corrections || {}).filter(([, v]) => v.renameTo).sort((a, b) => String(b[1].ts).localeCompare(String(a[1].ts))).slice(0, 8).map(([k, v]) => `"${k}" var egentligen "${v.renameTo}"`);
    if (!top.length && !corr.length) return '';
    return `\nPERSONENS VANOR (ledtråd – använd bara när det stämmer med det du ser/läser, hitta aldrig på):${top.length ? `\n- Loggar ofta: ${top.join(', ')}.` : ''}${corr.length ? `\n- Tidigare rättelser: ${corr.join('; ')}.` : ''}\n`;
  } catch { return ''; }
}
// Mätt 2026-09-17 mot receptbilder med känt facit: "eftertanke" (thinkingBudget 512) gav ingen säker vinst (medelfel 21 % → 16 % på 4 bilder)
// men längre svarstid och fler fel (2 av 6) – därför av. Träffsäkerheten höjs i stället med personliga vanor, inlärda rättelser,
// portionskalibrering, skarpare bild och lokal streckkodsläsning – allt utan fler anrop.
const PHOTO_THINKING = 0;
function analyzePrompt(hint, meal) {
  const c = ctx();
  return `Du är en erfaren klinisk dietist som bedömer mat från foton, med expertkunskap om svensk mat, svenska förpackningar och portionsstorlekar samt Livsmedelsverkets livsmedelsdatabas.

STEG 1 – AVGÖR VAD BILDEN VISAR
(A) FÖRPACKAD PRODUKT: burk, flaska, kartong, påse, bägare, bar, tub, konservburk, chokladkaka – hel eller delvis synlig förpackning.
(B) MAT UTAN FÖRPACKNING: tillagad eller upplagd mat/dryck på tallrik, i skål, i glas, i händerna.
(C) BÅDE OCH: t.ex. en tallrik med mat och en läskburk bredvid – hantera varje del efter sin regel.

REGLER FÖR FÖRPACKADE PRODUKTER (A) – "type": "package":
1. LÄS förpackningen noga och skriv bara det du faktiskt kan läsa: varumärke, produktnamn, smak/variant, deklarerad mängd ("33 cl", "330 ml", "500 g", "1,5 l") och näringsdeklarationen per 100 g/ml om den syns ("label_per100", annars null). Om siffrorna under streckkoden syns (8–13 siffror) → "ean", annars null.
2. Portionen är hela förpackningens deklarerade mängd om den är hel eller nyöppnad (1 ml ≈ 1 g för drycker). Flera exemplar → "count". Om bara en del ätits/druckits: ange den mängden i "grams" och förklara i "basis".
3. Om mängden INTE går att läsa: bedöm form och proportioner mot svenska standardstorlekar och sätt "size_read_from_label": false med ett bredare "grams_range". Standardstorlekar: läskburk 33 cl (slim/energidryck 25 cl, stor burk 50 cl), glasflaska läsk/öl 33 cl, PET-flaska 50 cl eller 1,5 l, juice/mjölk/fil 1 l (liten 25–33 cl), yoghurt/kvarg-bägare 150–250 g (stor 500 g–1 kg), proteinbar 50–60 g, chipspåse 175–275 g, portionspåse chips/nötter 40–50 g, godispåse 100–200 g, chokladkaka 100 g (liten 40–50 g), glasspinne 60–100 g, färdigrätt 350–450 g, butikssmörgås 150–200 g.
4. "package": {"brand": "...", "product": "...", "variant": "...", "declared_size": "33 cl", "container": "burk|flaska|glasflaska|kartong|bägare|påse|bar|kaka|låda|tub|konservburk|annat", "size_read_from_label": true}.
5. Näringsvärden: använd näringsdeklarationen om den syns, annars din kunskap om produkten (skriv "från kunskap" i basis). "db_query" = generiskt namn i Livsmedelsverkets stil för samma typ ("Läsk cola sockrad", "Läsk lightversion", "Yoghurt vanilj fett 2%", "Chips potatis", "Energidryck", "Proteinbar").

REGLER FÖR MAT UTAN FÖRPACKNING (B) – "type": "food" eller "drink":
1. Identifiera varje komponent separat (t.ex. "Lax stekt", "Ris kokt", "Broccoli kokt", "Bearnaisesås"). Sammansatta rätter delas upp när det går. Ta med dolda kalorier som syns eller är mycket sannolika: stekfett (ca 1 msk = 14 g per stekt komponent), smör på bröd, dressing, sås, riven ost, socker i drycker – markera med "hidden": true.
2. Bedöm ENBART utifrån det visuella – färg, form, textur, tillagning, glans (fett) och portionsstorlek. Gissa inte utifrån varumärken.
3. Uppskatta vikten i gram av det som faktiskt ligger på tallriken (tillagad vikt). Storleksreferenser: middagstallrik 26–27 cm, assiett 19–21 cm, gaffel ca 19 cm, dricksglas 2–3 dl, hand ca 18 cm, tesked 5 g, matsked 15 g. Typiska svenska portioner: kött/fisk/fågel 120–180 g, kokt pasta/ris 150–250 g, potatis 150–250 g, grönsaker 80–150 g, sås 30–70 g, brödskiva 30–40 g, smörgås med pålägg 70–110 g.
4. Var kalibrerad: stora portioner underskattas ofta – ge en realistisk mittskattning ("grams") och ett ärligt intervall ("grams_range"). "confidence" 0–1 för identifiering + portion.
5. "state" = tillagning (rå, kokt, stekt, friterad, ugnsbakad, grillad, tillagad). "db_query" = kort generiskt namn i Livsmedelsverkets stil utan varumärke ("Kyckling bröst stekt", "Ris kokt", "Potatis kokt", "Bröd fullkorn", "Mjölk fett 3%", "Ost 28%", "Rapsolja", "Bearnaisesås"). Beräkna kcal, protein, kolhydrater och fett för hela portionen (inte per 100 g).
6. Tvetydigt (kyckling/kalkon, ris/couscous)? Välj det troligaste och lista upp till 3 "alternatives".

NAMN OCH SYMBOL: "name" är alltid ett livsmedels- eller produktnamn, aldrig en färg- eller utseendebeskrivning (skriv inte "lila yoghurt" – skriv "Yoghurt blåbär" eller, om förpackningen syns, märket och sorten: "Alpro Yoghurt Blåbär"). Avslöjar färgen smaken (lila = blåbär/skogsbär, rosa = jordgubb/hallon, gul = vanilj/banan) så välj den troligaste och lägg de andra i "alternatives". "emoji" = EN emoji som bäst visar just det livsmedlet (🥛 mjölk/yoghurt/kvarg, 🫐 blåbär, 🍓 jordgubbar, 🍗 kyckling, 🥩 kött, 🐟 fisk, 🍚 ris, 🍝 pasta, 🥔 potatis, 🥗 sallad, 🥦 grönsaker, 🍞 bröd, 🧀 ost, 🥚 ägg, 🧈 smör, 🥣 gröt/flingor, 🍌 banan, 🍎 äpple, 🥤 läsk, 💧 vatten, ☕ kaffe, 🍵 te, 🧃 juice, 🍺 öl, 🍷 vin, 🍫 choklad, 🍬 godis, 🍪 kaka, 🍦 glass, 🥜 nötter, 🍕 pizza, 🍔 burgare, 🌮 taco, 🍣 sushi, 🍲 soppa/gryta).

VATTEN: kran-, mineral-, kolsyrat och naturellt vatten har 0 kcal ("db_query": "Vatten"). Gissa aldrig en smak eller sort som inte går att läsa på etiketten – en genomskinlig dryck utan läsbar etikett är vatten, inte smaksatt dryck.

Om bilden inte visar mat eller dryck: tom items-lista och förklara i "notes". Alla texter på svenska.
${c.diet ? `Personen äter: ${DIET_SV[c.diet] || c.diet}.` : ''} Måltid: ${MEAL_SV[meal] || 'okänd'}.
Fyll ALLTID i "kcal", "protein", "carbs" och "fat" med din bästa beräkning för varje rad – aldrig 0 för mat som innehåller energi, även när användarens kommentar ändrar mängden.
${habitsBlock()}Användarens egen kommentar (väger tungt om den finns): "${String(hint || '').replace(/"/g, "'").slice(0, 400)}"

Svara med ENBART ett JSON-objekt enligt exakt denna form (null där något inte gäller):
${ANALYSIS_SCHEMA}`;
}
function suggestPrompt(b) {
  const c = ctx(), r = b.remaining || {}, t = c.targets;
  const focus = { lose: 'snabbast möjliga hälsosamma viktnedgång: högt protein (≥30 % av energin), låg energitäthet, mycket grönsaker/baljväxter, minimalt processat', health: 'långsiktig hälsa enligt nordiska näringsrekommendationer och medelhavskost: fisk, fullkorn, baljväxter, grönsaker, nötter, rapsolja', muscle: 'muskeluppbyggnad: 40+ g protein per måltid, tillräckligt med energi och kolhydrater runt träning', quick: 'snabbast möjliga vardagsmat, max 15 minuter, få ingredienser' }[b.focus] || 'hälsosam viktnedgång';
  const n = Math.min(6, Math.max(3, +b.count || 3));
  const avoidT = (b.avoidTitles || []).slice(0, 40);
  return `Du är en svensk dietist och kock som bygger recept på aktuell forskning (proteinets mättnadseffekt, låg energitäthet, fiber, minimalt processad mat). Föreslå ${n} konkreta ${MEAL_SV[b.slot] || 'måltids'}-recept som skiljer sig tydligt åt: variera proteinkälla (kyckling, fisk, skaldjur, ägg, baljväxter, kvarg/keso, magert nötkött, tofu), tillagning (ugn, panna, wok, gryta, soppa, sallad, kallt) och kök (svenskt, medelhav, asiatiskt, mexikanskt, indiskt, mellanöstern). Fokus: ${focus}. Svara ENBART med JSON.
${avoidT.length ? `Dessa recept finns redan – föreslå INTE dem eller nära varianter: ${avoidT.join('; ')}.` : ''}
Dagsmål: ${t.kcal || '?'} kcal, ${t.protein || '?'} g protein, ${t.carbs || '?'} g kolhydrater, ${t.fat || '?'} g fett. Kvar idag: ${Math.round(r.kcal ?? 0)} kcal, ${Math.round(r.protein ?? 0)} g protein.
Mål: ${c.goal || 'okänt'}. Kost: ${DIET_SV[c.diet] || 'allätare'}. Undviker: ${(c.avoid || []).join(', ') || 'inget'}. Ätit idag: ${(b.eatenToday || []).slice(0, 12).join(', ') || 'inget loggat'}. Nyligen föreslaget (variera): ${(b.recent || []).slice(0, 8).join(', ') || '-'}.
Klockan är ${new Date().toTimeString().slice(0, 5)}. Användarens önskemål (väger tyngst): "${String(b.wish || '').slice(0, 300)}".
SPRÅK: "title", "description", "ingredients", "steps.text" och "why" ska vara på SVENSKA – aldrig engelska. Bara "image_prompt" skrivs på engelska.
Krav: enkel vardagsmat som går att laga i Sverige med vanliga ingredienser, realistiska portioner (ange portionens vikt i gram), 4–7 tydliga steg, mängder i ingredienslistan, näringsvärden per portion inkl. fiber, och en kort forskningsbaserad motivering. "image_prompt" = engelsk bildbeskrivning för fotot av den färdiga rätten, och varje steg får en kort engelsk "image_prompt". Inga kosttillskott.
{"suggestions":[{"title":"...","emoji":"🍽️","description":"en mening om rätten","kcal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"grams":0,"prep_minutes":0,"ingredients":["mängd + ingrediens"],"steps":[{"text":"...","image_prompt":"..."}],"why":"forskningsbaserad motivering, 1–2 meningar","image_prompt":"...","image_query":"2–3 engelska ord för bildsökning, t.ex. chicken stir fry","video_query":"2–3 svenska nyckelord för rätten, t.ex. kycklingwok nudlar"}]}`;
}
function askPrompt(b) {
  const c = ctx(), t = c.targets, r = b.remaining || {};
  return `Du är "Tallrik", en varm, rak och kunnig svensk näringscoach i en app. Svara på svenska, max 120 ord, konkret och utan floskler. Ge allmänna kostråd – hänvisa till vården vid medicinska frågor. Ingen markdown, inga rubriker; löpande text och eventuellt en kort punktlista med "•".
Om personen: mål ${c.goal || '?'}, kost ${DIET_SV[c.diet] || 'allätare'}, undviker ${(c.avoid || []).join(', ') || 'inget'}. Dagsmål ${t.kcal || '?'} kcal / ${t.protein || '?'} g protein. Kvar idag: ${Math.round(r.kcal ?? 0)} kcal, ${Math.round(r.protein ?? 0)} g protein. Ätit idag: ${(b.eatenToday || []).slice(0, 15).join(', ') || 'inget loggat'}. Viktrend: ${b.trend || 'okänd'}.
Fråga: "${String(b.question || '').slice(0, 600)}"`;
}

// ---- Bildanalys ----
// extraEan: streckkod som appen själv avkodat ur fotot (promise eller sträng) – ger exakt produkt även om AI:n missar siffrorna.
export async function analyzePhoto(dataURL, { hint = '', meal = '', onStage = () => {}, extraEan = null, thinkingBudget = null } = {}) {
  const { provider, key, model } = current();
  onStage('identifying');
  const [res] = await Promise.all([run(current, { prompt: analyzePrompt(hint, meal), imageDataURL: dataURL, maxTokens: 3500, thinkingBudget: thinkingBudget ?? PHOTO_THINKING }), loadDB().catch(() => null)]);
  onStage('matching');
  let ean = null;
  try { ean = await Promise.race([Promise.resolve(extraEan), new Promise(r => setTimeout(() => r(null), 4000))]); } catch { ean = null; }
  return normalizeAnalysis(extractJSON(res.text), { model: res.model || model, ms: res.ms, extraEan: ean });
}
// ---- Fritext: "2 stekta ägg, en skiva rågbröd med smör och ost, ett glas mjölk" → samma komponentlista som fotoanalysen ----
function describePrompt(text, meal, hint) {
  const c = ctx();
  return `Du är en erfaren klinisk dietist med expertkunskap om svensk mat, svenska produkter, svenska portionsstorlekar och Livsmedelsverkets livsmedelsdatabas. En person har med egna ord skrivit vad hen har ätit och druckit. Tolka texten och gör en noggrann näringsberäkning.

SÅ HÄR TOLKAR DU TEXTEN:
1. Dela upp i separata komponenter – en rad per livsmedel/dryck ("2 stekta ägg", "rågbröd", "smör", "ost", "mellanmjölk"). Sammansatta rätter (lasagne, pytt i panna, kebabtallrik, sushi 10 bitar) får vara en komponent om personen inte beskrivit delarna.
2. Mängder: använd det personen skrivit. Hushållsmått och vardagsord räknas om till gram: 1 dl vätska ≈ 100 g, 1 msk ≈ 15 g (olja/smör 14 g), 1 tsk ≈ 5 g, 1 ägg ≈ 55 g, brödskiva 30–40 g, ostskiva 10–12 g, glas 2–2,5 dl, kopp/mugg 2–2,5 dl, tallrik/portion = normal svensk portion (kött/fisk/fågel 120–180 g, kokt pasta/ris 150–250 g, potatis 150–250 g, grönsaker 80–150 g, sås 30–70 g), näve nötter ≈ 30 g, frukt medelstor (banan 120 g, äpple 150 g). Saknas mängd: anta en normal portion och säg det i "basis" med ett bredare "grams_range".
3. "liten", "stor", "halv", "dubbel", "ett par", "några" påverkar mängden – räkna rimligt och förklara kort i "basis".
4. Märkesvaror och förpackningar ("en burk Coca-Cola Zero", "en Snickers", "Lindahls kvarg vanilj 500 g", "en Risifrutti"): "type": "package" med varumärke, produkt, variant och deklarerad storlek. Skriv storleken personen angav; annars svensk standardstorlek (läskburk 33 cl, PET 50 cl, energidryck 25/50 cl, chokladkaka 45–50 g, kvarg 500 g/150 g, yoghurt 1 l/200 g) med "size_read_from_label": false. "ean" och "label_per100" är alltid null här.
5. Tillagning ("stekt", "kokt", "friterad", "ugnsbakad") → "state". Stekfett eller smör på brödet räknas bara om personen skrivit det ELLER om det är mycket sannolikt för rätten (t.ex. stekt ägg ≈ 5 g fett) – markera då "hidden": true.
6. "name" = rent, kort livsmedelsnamn utan mängd och utan "en/ett" ("Stekta ägg", "Rågbröd", "Smör", "Ost", "Mellanmjölk", "Banan", "Vatten") – mängden hör hemma i "grams" och "basis". "db_query" = kort generiskt namn i Livsmedelsverkets stil utan varumärke ("Ägg stekt", "Bröd fullkorn råg", "Smör", "Ost hårdost fett 28%", "Mellanmjölk fett 1,5%", "Lättmjölk fett 0,5%", "Mjölk fett 3%", "Banan", "Kyckling bröstfilé stekt", "Ris kokt", "Vatten"). Beräkna kcal, protein, kolhydrater och fett för HELA den angivna mängden (inte per 100 g).
7. "emoji" = EN emoji som bäst visar just det livsmedlet (🥛 mjölk/yoghurt, 🫐 blåbär, 🍗 kyckling, 🥩 kött, 🐟 fisk, 🍚 ris, 🍝 pasta, 🥔 potatis, 🥗 sallad, 🍞 bröd, 🧀 ost, 🥚 ägg, 🧈 smör, 🥣 gröt, 🍌 banan, 🥤 läsk, 💧 vatten, ☕ kaffe, 🍫 choklad, 🥜 nötter …). "confidence" 0–1: hög när både livsmedel och mängd är tydliga, lägre när du behövt anta mängd eller tolka vagt. Tvetydigt? Välj det troligaste och ge upp till 3 "alternatives".
8. Ta bara med det personen faktiskt skrivit att hen ätit eller druckit. Hitta aldrig på extra mat. Vatten, kaffe och te utan tillbehör kan tas med (0–2 kcal) om de nämns.

Om texten inte beskriver mat eller dryck: tom items-lista och förklara i "notes". Alla texter på svenska. "meal_title" = kort sammanfattande titel.
${c.diet ? `Personen äter: ${DIET_SV[c.diet] || c.diet}.` : ''} Måltid: ${MEAL_SV[meal] || 'okänd'}.
${habitsBlock()}Personens text: <<<${String(text || '').replace(/>>>/g, '').slice(0, 1500)}>>>
${hint ? `Personens rättelse av din förra tolkning (väger tyngst): "${String(hint).replace(/"/g, "'").slice(0, 400)}"` : ''}

Fyll ALLTID i "kcal", "protein", "carbs" och "fat" med din bästa beräkning för varje rad – aldrig 0 för mat som innehåller energi.

Svara med ENBART ett JSON-objekt enligt exakt denna form (null där något inte gäller):
${ANALYSIS_SCHEMA}`;
}
// Gemini tolkar texten (samma motor som fotona); saknas Gemini-nyckeln används textmotorn (Groq)
function currentForDescribe() {
  const a = aiSettings();
  const gk = (a.keys.gemini || '').trim();
  if (gk) return { provider: 'gemini', key: gk, model: pickModel('gemini', 'fast'), mode: 'fast' };
  return currentText();
}
export function describeStatus() { const a = aiSettings(); const has = id => !!(a.keys[id] || '').trim(); const p = has('gemini') ? 'gemini' : textProviderId(); return { configured: !!p, providerName: p ? PROVIDERS[p].name : '' }; }
// Rätta en enskild rad: "Alpro yoghurt blåbär" → AI:n slår upp just den produkten/rätten, mängden behålls om den inte nämns
export async function resolveItem(text, { grams = 0, liquid = false, meal = '' } = {}) {
  const res = await analyzeText(`${String(text).trim()}${grams ? ` – mängd: ${grams} ${liquid ? 'ml' : 'g'}` : ''}`, { meal, hint: 'Texten beskriver EN enda sak. Svara med exakt en rad i items.' });
  return res.items[0] || null;
}
export async function analyzeText(text, { meal = '', hint = '', onStage = () => {} } = {}) {
  onStage('identifying');
  const [res] = await Promise.all([run(currentForDescribe, { prompt: describePrompt(text, meal, hint), maxTokens: 3500 }), loadDB().catch(() => null)]);
  onStage('matching');
  return normalizeAnalysis(extractJSON(res.text), { model: res.model, ms: res.ms });
}
// Bara symboler som föreställer något ätbart – färgade cirklar, hjärtan, stjärnor o.d. faller tillbaka på appens egen tabell
const NOT_FOOD = /[\u{1F534}-\u{1F53D}\u{1F7E0}-\u{1F7EB}\u{26AA}\u{26AB}\u{2B1B}\u{2B1C}\u{2764}\u{1F499}-\u{1F49C}\u{1F90D}\u{1F90E}\u{2B50}\u{2728}\u{2705}\u{274C}\u{2753}\u{1F37D}]/u;
const validEmoji = e => { const t = String(e || '').trim(); return t && t.length <= 8 && /\p{Extended_Pictographic}/u.test(t) && !NOT_FOOD.test(t) ? t : ''; };
const isPlainWater = s => /^(ett |en )?(glas |flaska |kanna )?(kran|mineral|bubbel|soda|käll|is|bords)?vatten( (kolsyrat|okolsyrat|naturell|stilla|med kolsyra|utan kolsyra|med is|med citron|med gurka))?$/i.test(String(s || '').trim().toLowerCase());
const cleanEan = e => { const d = String(e || '').replace(/\D/g, ''); return d.length >= 8 && d.length <= 14 ? d : ''; };
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]).catch(() => null);
const num1 = v => +(Number(v) || 0).toFixed(1);
const per100FromGrams = (ai, grams) => ({ kcal: Math.round(ai.kcal / grams * 100), protein: num1(ai.protein / grams * 100), carbs: num1(ai.carbs / grams * 100), fat: num1(ai.fat / grams * 100) });

// AI-svar → komponenter. Ordning för näringskälla: exakt produkt (EAN) → produkt via varumärke → etikett → Livsmedelsverket → AI:s egen skattning.
export async function normalizeAnalysis(j, { model = '', ms = 0, extraEan = null } = {}) {
  const items = [];
  const rawItems = Array.isArray(j.items) ? j.items.filter(r => r && r.name) : [];
  const online = navigator.onLine;
  const extra = cleanEan(extraEan);
  for (const raw of rawItems) {
    const pkg = raw.package && typeof raw.package === 'object' ? raw.package : null;
    const isPkg = raw.type === 'package' || !!pkg;
    const count = Math.max(1, Math.min(20, Math.round(Number(raw.count) || 1)));
    let grams = Math.max(1, Math.round(Number(raw.grams) || 0));
    const ai = { kcal: Math.max(0, Math.round(Number(raw.kcal) || 0)), protein: num1(raw.protein), carbs: num1(raw.carbs), fat: num1(raw.fat) };
    const it = {
      type: isPkg ? 'package' : (raw.type === 'drink' ? 'drink' : 'food'),
      name: String(raw.name).slice(0, 80), db_query: String(raw.db_query || raw.name).slice(0, 80), state: raw.state || '', grams, count,
      grams_range: Array.isArray(raw.grams_range) && raw.grams_range.length === 2 ? raw.grams_range.map(x => Math.max(1, Math.round(+x || grams))) : [Math.round(grams * .8), Math.round(grams * 1.2)],
      confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.6)), basis: String(raw.basis || '').slice(0, 200),
      alternatives: Array.isArray(raw.alternatives) ? raw.alternatives.map(String).slice(0, 3) : [], hidden: !!raw.hidden,
      emoji: validEmoji(raw.emoji), ai, aiPer100: per100FromGrams(ai, grams), package: null, ean: cleanEan(raw.ean), sizeRead: false, unitGrams: 0, liquid: null, sizes: [], sourceLabel: '',
    };
    if (isPkg) {
      const q = parseQuantity(pkg?.declared_size);
      it.package = { brand: String(pkg?.brand || '').slice(0, 60), product: String(pkg?.product || '').slice(0, 80), variant: String(pkg?.variant || '').slice(0, 60), declared: String(pkg?.declared_size || ''), container: String(pkg?.container || '').slice(0, 30) };
      it.sizeRead = pkg?.size_read_from_label !== false && !!q;
      it.liquid = q ? q.liquid : /dryck|läsk|juice|mjölk|öl|vatten|cola|energi|smoothie/i.test(it.db_query + ' ' + it.name);
      it.unitGrams = q ? q.grams * (q.count > 1 && count === 1 ? 1 : 1) : Math.max(1, Math.round(grams / count));
      if (q) { const full = it.unitGrams * count; if (grams > 0 && grams < full * 0.75) { it.part = Math.max(0.05, Math.round(grams / full * 20) / 20); it.grams = Math.round(full * it.part); } else it.grams = full; }
      it.name = [it.package.brand, it.package.product || it.name].filter(Boolean).join(' ').replace(/^(\S+) \1\b/i, '$1');
      if (it.package.variant && !it.name.toLowerCase().includes(it.package.variant.toLowerCase())) it.name += ' ' + it.package.variant;
    }
    // 1) Exakt produkt via EAN (AI-läst eller avkodad ur fotot)
    let product = null;
    const ean = it.ean || (isPkg || rawItems.length === 1 ? extra : '');
    if (ean && online) { product = await withTimeout(lookupBarcode(ean), 7000); if (product) it.ean = ean; }
    // 2) Produkt via varumärke + namn
    if (!product && isPkg && it.package.brand && online) {
      const list = await withTimeout(searchProductsByBrand(it.package.brand, `${it.package.product} ${it.package.variant}`.trim(), { sizeGrams: it.sizeRead ? it.unitGrams : null }), 9000);
      const best = list && list[0];
      if (best && best._score >= 20 && (!it.aiPer100.kcal || !best.per100.kcal || (best.per100.kcal / it.aiPer100.kcal > 0.4 && best.per100.kcal / it.aiPer100.kcal < 2.5))) product = best;
    }
    const label = raw.label_per100 && Number(raw.label_per100.kcal) > 0 ? { kcal: Math.round(+raw.label_per100.kcal), protein: num1(raw.label_per100.protein), carbs: num1(raw.label_per100.carbs), fat: num1(raw.label_per100.fat) } : null;
    it.candidates = [];
    if (label) it.labelPer100 = label;
    if (product) {
      it.match = { key: product.key, name: productTitle(product), per100: product.per100, group: 'Produkt', image: product.image || '', quantityGrams: product.quantityGrams || 0, liquid: product.liquid };
      it.per100 = product.per100; it.source = 'off'; it.sourceLabel = 'Open Food Facts ✓';
      if (!it.sizeRead && product.quantityGrams) { it.unitGrams = product.quantityGrams; it.grams = it.unitGrams * count; it.sizeRead = true; }
      if (product.liquid != null) it.liquid = product.liquid;
      if (product.image) it.image = product.image;
    } else if (label) {
      it.match = null; it.per100 = label; it.source = 'label'; it.sourceLabel = 'Etikett läst ✓';
    } else if (isPlainWater(it.db_query) || isPlainWater(it.name)) {
      // Vatten är alltid 0 kcal och ska aldrig förankras i något annat (Livsmedelsverket saknar "Vatten" → blev "Vattenmelon")
      const zero = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      it.match = null; it.per100 = zero; it.aiPer100 = zero; it.ai = zero; it.source = 'ai'; it.sourceLabel = 'Vatten · 0 kcal'; it.emoji = '💧'; it.liquid = true; it.confidence = Math.max(it.confidence, 0.9);
    } else {
      const zeroCal = (it.type === 'drink' || isPkg) && /vatten|kaffe|(^| )te( |$)|light|zero|sockerfri|max( |$)/i.test(it.name + ' ' + it.db_query);
      const { chosen, candidates } = matchItem(it.db_query, ai.kcal, grams, { zeroCal });
      it.candidates = candidates;
      if (chosen && !isPkg) { it.match = { key: chosen.key, name: chosen.name, per100: chosen.per100, group: chosen.group }; it.per100 = chosen.per100; it.source = 'slv'; it.sourceLabel = chosen.name + ' ✓'; }
      else if (chosen && isPkg && !it.aiPer100.kcal) { it.match = { key: chosen.key, name: chosen.name, per100: chosen.per100, group: chosen.group }; it.per100 = chosen.per100; it.source = 'slv'; it.sourceLabel = chosen.name + ' ✓'; }
      else { it.match = null; it.per100 = it.aiPer100; it.source = 'ai'; it.sourceLabel = isPkg ? 'AI:s kunskap om produkten' : 'AI-skattning'; }
    }
    if (isPkg) {
      it.sizes = packageSizes(it.package.container, it.unitGrams, it.liquid);
      if (!it.sizeRead) it.sourceLabel += ' · storlek uppskattad – kontrollera';
      it.unitLabel = fmtSize(it.unitGrams, !!it.liquid);
    }
    // 3) Rättelseminne: din tidigare justering av samma sak vinner
    const corr = getCorrection(isPkg ? `${it.package.brand} ${it.package.product} ${it.package.variant}` : it.name);
    if (corr) {
      if (corr.per100 && corr.matchKey) { it.match = { key: corr.matchKey, name: corr.matchName || it.name, per100: corr.per100, group: corr.group || '' }; it.per100 = corr.per100; it.source = corr.source || 'learned'; }
      else if (corr.per100 && corr.renameTo) { it.match = null; it.per100 = corr.per100; it.source = 'learned'; }
      if (corr.renameTo) { it.name = corr.renameTo; if (corr.emoji) it.emoji = corr.emoji; }
      if (corr.unitGrams) { it.unitGrams = corr.unitGrams; it.grams = corr.unitGrams * count; it.sizeRead = true; it.unitLabel = fmtSize(it.unitGrams, !!it.liquid); }
      else if (corr.grams && !isPkg) it.grams = corr.grams;
      it.learned = true; it.sourceLabel = 'Din tidigare rättelse ✓';
    }
    it.aiGrams = it.grams;
    const cal = state.calib;
    if (!isPkg && !it.learned && cal && cal.n >= 6 && Math.abs(cal.ratio - 1) >= 0.05) { const k = Math.min(1.35, Math.max(0.8, cal.ratio)); it.grams = Math.max(1, Math.round(it.grams * k / 5) * 5); it.calibrated = true; it.basis = (it.basis ? it.basis + ' · ' : '') + `portionen anpassad efter dina tidigare ändringar (×${k.toFixed(2).replace('.', ',')})`; }
    Object.assign(it, scale(it.per100, it.grams));
    it.orig = { grams: it.grams, unitGrams: it.unitGrams, matchKey: it.match?.key || null };
    items.push(it);
  }
  // Streckkod avkodad ur fotot men AI:n hittade ingen förpackning → lägg till produkten ändå
  if (extra && !items.some(i => i.ean === extra) && online) {
    const product = await withTimeout(lookupBarcode(extra), 7000);
    if (product) {
      const unit = product.quantityGrams || product.serving?.grams || 100;
      const it = { type: 'package', name: productTitle(product), db_query: product.name, state: '', grams: unit, count: 1, grams_range: [unit, unit], confidence: 0.95, basis: 'Streckkod avläst i fotot', alternatives: [], hidden: false, ai: scale(product.per100, unit), aiPer100: product.per100, package: { brand: product.brand, product: product.name, variant: '', declared: product.quantity, container: '' }, ean: extra, sizeRead: !!product.quantityGrams, unitGrams: unit, liquid: product.liquid, candidates: [], match: { key: product.key, name: product.name, per100: product.per100, group: 'Produkt', image: product.image, quantityGrams: product.quantityGrams, liquid: product.liquid }, per100: product.per100, source: 'off', sourceLabel: 'Streckkod i fotot ✓', image: product.image };
      it.sizes = packageSizes('', unit, product.liquid); it.unitLabel = fmtSize(unit, !!product.liquid);
      Object.assign(it, scale(it.per100, it.grams)); it.orig = { grams: it.grams, unitGrams: unit, matchKey: it.match.key };
      items.push(it);
    }
  }
  return { items, title: String(j.meal_title || '').slice(0, 80), notes: String(j.notes || '').slice(0, 300), ms, model, total: items.reduce((s, i) => s + i.kcal, 0) };
}
export async function suggest(b) {
  const { provider, key, model } = currentText();
  const res = await run(currentText, { prompt: suggestPrompt(b), maxTokens: Math.min(12000, 3000 + 1500 * Math.min(6, Math.max(3, +b.count || 3))), temperature: 0.7, effort: 'medium' });
  const j = extractJSON(res.text);
  return (j.suggestions || []).map((s, i) => ({
    id: 'ai-' + Date.now().toString(36) + i, ai: true, model: res.model || model, slot: b.slot || '', focus: b.focus || '', created: new Date().toISOString(),
    title: s.title || 'Förslag', d: s.description || '', kcal: Math.round(+s.kcal || 0), protein: Math.round(+s.protein || 0), carbs: Math.round(+s.carbs || 0), fat: Math.round(+s.fat || 0), fiber: Math.round(+s.fiber || 0), grams: Math.round(+s.grams || 0),
    ing: Array.isArray(s.ingredients) ? s.ingredients.map(x => typeof x === 'string' ? x : (x && typeof x === 'object' ? [x.amount ?? x.quantity ?? '', x.unit ?? '', x.name ?? x.item ?? x.ingredient ?? ''].filter(Boolean).join(' ').trim() : String(x))).filter(Boolean) : [], min: +s.prep_minutes || 0, why: s.why || '', emoji: s.emoji || '🍽️', tags: [],
    steps: Array.isArray(s.steps) ? s.steps.map(st => typeof st === 'string' ? { t: st, img: '' } : { t: String(st.text || ''), img: String(st.image_prompt || '') }).filter(st => st.t) : [],
    imgPrompt: s.image_prompt || '', imageQuery: s.image_query || '', youtubeQuery: s.video_query || s.youtube_query || s.title,
  }));
}
function adaptPrompt(m) {
  const c = ctx();
  return `Du är en svensk dietist och kock. Här är ett recept från en öppen receptdatabas (engelska). Översätt till naturlig svenska med svenska mått (dl, msk, tsk, g), dela upp instruktionerna i 4–8 tydliga steg, och beräkna näringsvärden PER PORTION (anta ${m.servings || 4} portioner om inget anges) utifrån ingredienserna. Ge också ett konkret tips på en lättare variant för viktnedgång (t.ex. mindre olja/grädde, mer grönsaker, magrare protein) om det är relevant för personens mål (${c.goal || 'okänt'}). Svara ENBART med JSON.
Namn: ${m.name} (${m.area}, ${m.category})
Ingredienser: ${m.ingredients.join('; ')}
Instruktioner: ${String(m.instructions || '').slice(0, 3000)}
{"title":"svenskt namn","servings":4,"kcal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"grams":0,"ingredients":["mängd + ingrediens på svenska (för hela receptet)"],"steps":["steg 1","steg 2"],"lighter":"tips eller tom sträng"}`;
}
export async function adaptMeal(m) {
  const { provider, key, model } = currentText();
  const res = await run(currentText, { prompt: adaptPrompt(m), maxTokens: 3000, temperature: 0.3 });
  const j = extractJSON(res.text);
  return { title: j.title || m.name, servings: +j.servings || 4, kcal: Math.round(+j.kcal || 0), protein: Math.round(+j.protein || 0), carbs: Math.round(+j.carbs || 0), fat: Math.round(+j.fat || 0), fiber: Math.round(+j.fiber || 0), grams: Math.round(+j.grams || 0), ing: Array.isArray(j.ingredients) ? j.ingredients.map(String) : m.ingredients, steps: (Array.isArray(j.steps) ? j.steps : []).map(t => ({ t: String(t) })), lighter: j.lighter || '', model, ts: new Date().toISOString() };
}
function planPrompt(b) {
  const c = ctx(), t = c.targets;
  const lib = (b.library || []).slice(0, 40).map(r => `${r.title} (${r.slot || '-'}, ${r.kcal} kcal, P ${r.protein})`).join('; ');
  const slots = (b.slots || ['breakfast', 'lunch', 'dinner', 'snack']).map(x => MEAL_SV[x]).join(', ');
  return `Du är en svensk dietist. Planera en hel dags mat – exakt EN rätt per måltid (${slots}), inga extra måltider – för en person så att summan hamnar inom ±5 % av ${b.kcal || t.kcal} kcal med ca ${b.protein || t.protein} g protein, ${t.carbs} g kolhydrater och ${t.fat} g fett. Fokus: ${{ lose: 'viktnedgång – proteinrikt, låg energitäthet, fiber, minimalt processat', health: 'hälsa – medelhavs/nordisk kost', muscle: 'muskler – högt protein', quick: 'snabb vardagsmat' }[b.focus] || 'hälsosam viktnedgång'}. Kost: ${DIET_SV[c.diet] || 'allätare'}. Undviker: ${(c.avoid || []).join(', ') || 'inget'}. Önskemål: "${String(b.wish || '').slice(0, 200)}".
Använd gärna recept från personens bibliotek när de passar (ange då exakt samma titel och "from_library": true): ${lib || 'inga'}.
För nya recept: kort svensk titel, ingredienser med mängder (1 portion) och 3–5 korta steg. Enkel mat som går att laga i Sverige. Svara ENBART med JSON:
{"meals":[{"slot":"breakfast|lunch|dinner|snack","title":"...","from_library":false,"kcal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"grams":0,"prep_minutes":0,"ingredients":["..."],"steps":["..."],"why":"en mening"}],"note":"en mening om dagen som helhet"}`;
}
export async function planDay(b) {
  const { provider, key, model } = currentText();
  const res = await run(currentText, { prompt: planPrompt(b), maxTokens: 5000, temperature: 0.6 });
  const j = extractJSON(res.text);
  const meals = (Array.isArray(j.meals) ? j.meals : []).map((m, i) => ({
    id: 'plan-' + Date.now().toString(36) + i, ai: true, model, slot: ['breakfast', 'lunch', 'dinner', 'snack'].includes(m.slot) ? m.slot : 'snack', fromLibrary: !!m.from_library,
    title: m.title || 'Måltid', d: m.why || '', kcal: Math.round(+m.kcal || 0), protein: Math.round(+m.protein || 0), carbs: Math.round(+m.carbs || 0), fat: Math.round(+m.fat || 0), fiber: Math.round(+m.fiber || 0), grams: Math.round(+m.grams || 0), min: +m.prep_minutes || 0,
    ing: Array.isArray(m.ingredients) ? m.ingredients.map(String) : [], steps: (Array.isArray(m.steps) ? m.steps : []).map(x => ({ t: String(x), img: '' })), why: m.why || '', emoji: { breakfast: '🌅', lunch: '🥗', dinner: '🍽️', snack: '🍎' }[m.slot] || '🍽️', tags: [],
  }));
  return { meals, note: j.note || '', model, created: new Date().toISOString() };
}
export async function ask(question, b) {
  const { provider, key, model } = currentText();
  const res = await run(currentText, { prompt: askPrompt({ ...b, question }), json: false, maxTokens: 600, temperature: 0.5 });
  return res.text.trim();
}

// ---- Offline-kö: foton tagna utan uppkoppling analyseras när det går ----
let processing = false;
export async function processQueue() {
  if (processing || !state.aiQueue.length || !navigator.onLine || !aiStatus().configured) return;
  processing = true;
  const owner = activeUserId();   // om användaren byts under analysen får resultatet inte hamna hos fel person
  try {
    for (const q of [...state.aiQueue]) {
      if (activeUserId() !== owner) return;
      const blob = await getPhoto(q.photoId);
      if (activeUserId() !== owner) return;
      if (!blob) { dequeueAnalysis(q.id); continue; }
      try {
        const res = await analyzePhoto(await blobToDataURL(blob), { hint: q.hint, meal: q.meal });
        if (activeUserId() !== owner) return;
        for (const it of res.items) addEntry(q.date, { meal: q.meal, name: it.name, grams: it.grams, kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat, per100: it.per100, source: 'photo', photoId: q.photoId, confidence: it.confidence, time: q.createdAt, match: it.match?.name || '', foodKey: it.match?.key || '', image: it.image || '' });
        dequeueAnalysis(q.id);
        toast(res.items.length ? `Väntande foto analyserat: ${res.items.length} livsmedel, ${res.total} kcal` : 'Väntande foto: ingen mat hittades', res.items.length ? 'good' : '');
      } catch (e) { console.warn('kö-analys misslyckades', e); if (e.code === 'nokey' || e.code === 'badkey' || e.code === 'ratelimit') break; }
    }
  } finally { processing = false; }
}
export { AIError };

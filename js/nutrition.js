// Näringsberäkningar: Mifflin-St Jeor, TDEE, makron, prognos och adaptiv förbrukning.
import { todayKey, addDays, daysBetween, parseKey, dateKey } from './components.js?v=202609141620';

export const ACTIVITY = [
  { id: 1, f: 1.2, t: 'Stillasittande', d: 'Kontorsjobb, mest sittande, få promenader', icon: '🛋️' },
  { id: 2, f: 1.375, t: 'Lätt aktiv', d: 'Promenader dagligen eller träning 1–2 gånger i veckan', icon: '🚶' },
  { id: 3, f: 1.55, t: 'Måttligt aktiv', d: 'Träning 3–5 dagar i veckan eller rörligt jobb', icon: '🏃' },
  { id: 4, f: 1.725, t: 'Mycket aktiv', d: 'Hård träning nästan varje dag', icon: '🏋️' },
  { id: 5, f: 1.9, t: 'Extremt aktiv', d: 'Fysiskt tungt arbete plus daglig träning', icon: '⚡' },
];
export const GOALS = [
  { id: 'lose', t: 'Gå ner i vikt', d: 'Ett lagom underskott som går att leva med', icon: '🔥' },
  { id: 'maintain', t: 'Behålla vikten', d: 'Ät i balans och må bra i vardagen', icon: '⚖️' },
  { id: 'gain', t: 'Bygga muskler', d: 'Ett kontrollerat överskott med mycket protein', icon: '💪' },
];
export const PACES = {
  lose: [
    { kg: 0.25, t: 'Lugn', d: '0,25 kg i veckan – nästan ingen hunger' },
    { kg: 0.5, t: 'Balanserad', d: '0,5 kg i veckan – rekommenderat för de flesta' },
    { kg: 0.75, t: 'Snabb', d: '0,75 kg i veckan – kräver disciplin' },
  ],
  gain: [
    { kg: 0.15, t: 'Lean bulk', d: '0,15 kg i veckan – mest muskler, lite fett' },
    { kg: 0.3, t: 'Balanserad', d: '0,3 kg i veckan – bra kompromiss' },
    { kg: 0.5, t: 'Snabb', d: '0,5 kg i veckan – mer fettinlagring' },
  ],
};
export const DIETS = [
  { id: 'omnivore', t: 'Allätare', icon: '🍖' },
  { id: 'pescetarian', t: 'Pescetarian', icon: '🐟' },
  { id: 'vegetarian', t: 'Vegetarian', icon: '🥦' },
  { id: 'vegan', t: 'Vegan', icon: '🌱' },
];
export const AVOID = ['Gluten', 'Laktos', 'Nötter', 'Ägg', 'Skaldjur', 'Soja', 'Fläsk', 'Socker'];
export const MOTIVATIONS = [
  { id: 'energy', t: 'Mer energi', icon: '⚡' }, { id: 'health', t: 'Bättre hälsa', icon: '❤️' },
  { id: 'looks', t: 'Se bättre ut', icon: '✨' }, { id: 'performance', t: 'Prestera i träningen', icon: '🏆' },
  { id: 'confidence', t: 'Självförtroende', icon: '🌟' }, { id: 'habits', t: 'Bättre vanor', icon: '🧭' },
];

export function age(p) { const y = new Date().getFullYear(); return Math.max(14, Math.min(100, y - (p.birthYear || y - 30))); }
export function bmr(p) {
  const w = p.weightKg || 70, h = p.heightCm || 170, a = age(p);
  const base = 10 * w + 6.25 * h - 5 * a;
  return p.sex === 'male' ? base + 5 : p.sex === 'female' ? base - 161 : base - 78;
}
export const activityFactor = lvl => (ACTIVITY.find(a => a.id === lvl) || ACTIVITY[1]).f;
export const tdee = p => bmr(p) * activityFactor(p.activity);
export const bmi = (h, w) => w / Math.pow(h / 100, 2);

export function computeTargets(p, overrideTdee = null) {
  const b = bmr(p);
  const t = overrideTdee || tdee(p);
  const pace = p.paceKgPerWeek || (p.goal === 'lose' ? 0.5 : p.goal === 'gain' ? 0.3 : 0);
  let delta = 0;
  if (p.goal === 'lose') delta = -pace * 7700 / 7;
  if (p.goal === 'gain') delta = pace * 7700 / 7;
  let kcal = Math.round((t + delta) / 10) * 10;
  const floor = p.sex === 'female' ? 1200 : 1500;
  let floored = false;
  if (kcal < floor) { kcal = floor; floored = true; }
  const w = p.weightKg || 70;
  // Protein per kg beroende på mål; fett minst 0,7 g/kg och ca 28 % av energin
  const pPerKg = p.goal === 'lose' ? 2.0 : p.goal === 'gain' ? 1.8 : 1.6;
  let protein = Math.round(Math.min(pPerKg * w, kcal * 0.35 / 4));
  let fat = Math.round(Math.max(0.7 * w, kcal * 0.28 / 9));
  if (p.diet === 'vegan') protein = Math.round(protein * 0.9);
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  if (carbs < 50) { carbs = 50; fat = Math.round((kcal - protein * 4 - carbs * 4) / 9); }
  const waterGlasses = Math.max(6, Math.min(12, Math.round(w * 0.035 * 1000 / 250)));
  const target = p.targetWeightKg || w;
  const diff = Math.abs(target - w);
  const weeks = pace ? diff / pace : 0;
  const goalDate = weeks ? addDays(todayKey(), Math.round(weeks * 7)) : null;
  return { kcal, protein, carbs, fat, waterGlasses, bmr: Math.round(b), tdee: Math.round(t), delta: Math.round(delta), floored, weeks, goalDate, method: overrideTdee ? 'adaptive' : 'formula' };
}

// Adaptiv TDEE: jämför genomsnittligt intag med viktförändring över de senaste 28 dagarna.
export function adaptiveTDEE(days, weights, targets, windowDays = 28) {
  const today = todayKey(), start = addDays(today, -windowDays);
  const logged = [];
  for (let k = start; k <= today; k = addDays(k, 1)) {
    const d = days[k];
    if (!d || !d.entries.length) continue;
    const kcal = d.entries.reduce((s, e) => s + (e.kcal || 0), 0);
    if (targets && kcal < targets.kcal * 0.5) continue; // ofullständigt loggad dag
    logged.push({ k, kcal });
  }
  const ws = weights.filter(w => w.date >= start && w.date <= today);
  if (logged.length < 10 || ws.length < 2) return { ok: false, loggedDays: logged.length, weighIns: ws.length, need: { days: 10, weighIns: 2 } };
  const span = daysBetween(ws[0].date, ws[ws.length - 1].date);
  if (span < 7) return { ok: false, loggedDays: logged.length, weighIns: ws.length, need: { days: 10, weighIns: 2, span: 7 } };
  // Linjär regression på vikt mot dag
  const xs = ws.map(w => daysBetween(start, w.date)), ys = ws.map(w => w.kg);
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den ? num / den : 0; // kg/dag
  const avgIntake = logged.reduce((s, d) => s + d.kcal, 0) / logged.length;
  // Spärr: två brusiga vägningar får inte flytta förbrukningen orimligt långt från fysiologin (BMR × 1,15 … × 2,3)
  const raw = (avgIntake - slope * 7700);
  const lo = targets?.bmr ? targets.bmr * 1.15 : 1100, hi = targets?.bmr ? targets.bmr * 2.3 : 4000;
  const est = Math.round(Math.min(hi, Math.max(lo, raw)) / 10) * 10;
  const confidence = logged.length >= 20 && n >= 4 && span >= 14 ? 'high' : logged.length >= 14 && n >= 3 && span >= 10 ? 'medium' : 'low';
  return { ok: true, tdee: est, avgIntake: Math.round(avgIntake), slopePerWeek: Math.round(slope * 7 * 100) / 100, loggedDays: logged.length, weighIns: n, span, confidence };
}

export function weightTrend(weights, days = 7) {
  if (weights.length < 2) return null;
  const last = weights[weights.length - 1];
  const cutoff = addDays(last.date, -days);
  const prev = [...weights].reverse().find(w => w.date <= cutoff) || weights[0];
  if (prev.date === last.date) return null;
  const d = daysBetween(prev.date, last.date) || 1;
  if (d < 3) return null;   // två vägningar en dag isär säger inget om trenden
  return { perWeek: (last.kg - prev.kg) / d * 7, from: prev, to: last };
}
export function bmiLabel(v) { if (!(v > 0)) return '–'; return v < 18.5 ? 'Undervikt' : v < 25 ? 'Normalvikt' : v < 30 ? 'Övervikt' : 'Fetma'; }
export { parseKey, dateKey };

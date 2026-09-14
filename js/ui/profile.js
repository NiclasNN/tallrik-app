// Profil: plan, AI-motor, utseende, data
import { state, setProfile, setTargets, setSetting, exportJSON, importJSON, resetAll, users, activeUser, setPin, checkPin, updateUser, deleteUser, createUser, storageInfo } from '../store.js?v=202609141620';
import { showUsers } from '../app.js?v=202609141620';
import { esc, fmt, haptic, toast, openSheet, confirmSheet, segmented, bindSeg, initials, fmtDateLong, themePicker, bindThemePicker, isCute, PUBLIC_URL, IS_LOCAL_HOST } from '../components.js?v=202609141620';
import { I } from '../icons.js?v=202609141620';
import { backupConfig, setBackupConfig, disconnectBackup, backupNow, listBackups, restoreBackup, DEFAULT_REPO } from '../backup.js?v=202609141620';
import { ACTIVITY, GOALS, PACES, DIETS, AVOID, computeTargets } from '../nutrition.js?v=202609141620';
import { PROVIDERS, aiStatus, addKey, removeKey, setProvider, setMode, setModelChoice, availableModels, pickModel, setTextProvider } from '../ai.js?v=202609141620';
import { dbMeta } from '../foods.js?v=202609141620';

export function render(root) {
  const p = state.profile, t = state.targets, ai = aiStatus();
  const activity = ACTIVITY.find(a => a.id === p.activity)?.t || '';
  const goal = GOALS.find(g => g.id === p.goal)?.t || '';
  root.innerHTML = `<div class="page">
    <div class="row" style="gap:14px"><div class="avatar lg ${isCute() ? 'emoji' : ''}">${isCute() ? '🐱' : esc(initials(p.name))}</div><div><h1 class="h1">${esc(p.name)}${isCute() ? ' 💕' : ''}</h1><div class="small muted">Med Tallrik sedan ${fmtDateLong((p.createdAt || new Date().toISOString()).slice(0, 10))}</div></div></div>

    <div class="section">
      <div class="section-head"><h2 class="h2">Din plan</h2><button class="link-btn" id="edit-plan">Ändra</button></div>
      <div class="card">
        <div class="row between"><div><div class="eyebrow">Dagligt mål</div><div class="hero-num">${fmt(t.kcal)} <small style="font-size:14px;color:var(--text-3)">kcal</small></div></div>${t.method === 'adaptive' ? '<span class="pill good">Adaptivt</span>' : '<span class="pill">Formel</span>'}</div>
        <div class="divider"></div>
        <div class="kv"><span>Protein / Kolhydrater / Fett</span><b>${t.protein} / ${t.carbs} / ${t.fat} g</b></div>
        <div class="kv"><span>Mål</span><b>${esc(goal)}${p.goal !== 'maintain' ? ` · ${fmt(p.paceKgPerWeek, 2)} kg/v` : ''}</b></div>
        <div class="kv"><span>Målvikt</span><b>${fmt(p.targetWeightKg, 1)} kg</b></div>
        <div class="kv"><span>Aktivitet</span><b>${esc(activity)}</b></div>
        <div class="kv"><span>Kost</span><b>${esc(DIETS.find(d => d.id === p.diet)?.t || '')}${p.avoid?.length ? ' · utan ' + p.avoid.join(', ').toLowerCase() : ''}</b></div>
        <div class="kv"><span>Förbrukning (BMR / TDEE)</span><b>${fmt(t.bmr)} / ${fmt(t.tdee)} kcal</b></div>
      </div>
    </div>

    <div class="section" id="ai-card">
      <div class="section-head"><h2 class="h2">AI-motor</h2><span class="row gap-1 small muted"><span class="status-dot ${ai.configured ? 'on' : ''}"></span>${ai.configured ? 'Aktiv' : 'Ej aktiverad'}</span></div>
      <div class="card">
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <span class="pill ${ai.configured ? 'good' : ''}">📸 Foton: ${ai.configured ? esc(ai.providerName) : 'ingen nyckel'}</span>
          <span class="pill ${ai.textConfigured ? 'good' : ''}">🍽️ Recept & coach: ${ai.textConfigured ? esc(ai.textProviderName) : 'ingen nyckel'}</span>

        </div>
        <p class="small muted mt-2" style="line-height:1.5">Klistra in en gratisnyckel – appen känner igen vilken tjänst den hör till. <b>Gemini</b> (AIza…) används för fotoanalys, <b>Groq</b> (gsk_…) för recept, förslag och coach så att Gemini-kvoten sparas till fotona. Nycklarna lämnar aldrig telefonen utom till respektive tjänst.</p>
        <div class="field mt-2"><label>Lägg till nyckel</label><div class="row" style="gap:8px"><input class="input grow" id="key" placeholder="AIza… eller gsk_…" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" id="test" style="min-height:54px;padding:0 18px">Spara</button></div></div>
        <div class="small muted mt-1" id="key-msg" style="margin-left:4px"></div>
        <button class="btn sm block mt-2" id="share-keys">💌 Bjud in Malin – hennes egen app</button>
        <div class="list mt-3">${Object.values(PROVIDERS).map(pr => { const has = !!(state.settings.ai?.keys?.[pr.id] || '').trim(); const roles = [ai.provider === pr.id && has ? 'foton' : '', ai.textProvider === pr.id ? 'recept & coach' : ''].filter(Boolean).join(' + '); return `<div class="list-item"><div class="grow"><div class="t">${esc(pr.name)} ${has ? '<span class="tag good">nyckel ✓</span>' : ''}</div><div class="d">${has ? (roles ? 'Används för ' + roles : 'Nyckel sparad, används inte just nu') : esc(pr.tagline)}</div></div>${has ? `<button class="btn xs danger" data-forget="${pr.id}">Ta bort</button>` : `<a class="btn xs" href="${pr.keyUrl}" target="_blank" rel="noopener">Skaffa nyckel</a>`}</div>`; }).join('')}</div>
        <div class="eyebrow mt-3" style="margin-bottom:8px">Fotoanalys med</div>
        ${segmented(Object.values(PROVIDERS).map(pr => ({ id: pr.id, name: pr.name.replace(' (Llama 4)', '').replace('Google ', '') })), ai.provider, 'data-prov')}
        <div class="mt-2">${segmented([{ id: 'fast', name: 'Snabb' }, { id: 'precision', name: 'Precision' }], state.settings.ai?.mode || 'fast', 'data-mode')}</div>
        <div class="small muted mt-1" style="margin-left:4px">Modell: ${esc(ai.model)}${availableModels(ai.provider).length ? '' : ' (standard)'}</div>
        ${availableModels(ai.provider).length ? `<div class="field mt-2"><label>Välj fotomodell manuellt (${state.settings.ai?.mode === 'precision' ? 'precision' : 'snabb'})</label><select class="input" id="model-sel"><option value="">Automatiskt val</option>${availableModels(ai.provider).map(m => `<option value="${esc(m.id)}" ${state.settings.ai?.models?.[ai.provider]?.[state.settings.ai?.mode || 'fast'] === m.id ? 'selected' : ''}>${esc(m.id)}</option>`).join('')}</select></div>` : ''}
        <div class="eyebrow mt-3" style="margin-bottom:8px">Recept, förslag & coach med</div>
        ${segmented([{ id: 'auto', name: 'Auto' }, { id: 'groq', name: 'Groq' }, { id: 'openrouter', name: 'OpenRouter' }, { id: 'gemini', name: 'Gemini' }], state.settings.ai?.textProvider || 'auto', 'data-textprov')}
        <div class="small muted mt-1" style="margin-left:4px">${ai.textConfigured ? `Använder ${esc(ai.textProviderName)} · ${esc(ai.textModel)}` : 'Ingen textmotor ännu – klistra in en Groq-nyckel ovan.'}${ai.textUsesGemini ? ' · Tips: en Groq-nyckel sparar Gemini-kvoten.' : ''}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="h2">Användare</h2><span class="small muted">${users().length} på den här telefonen</span></div>
      <div class="list">
        ${users().map(u => `<div class="list-item"><div class="avatar" style="width:34px;height:34px;font-size:13px">${esc(initials(u.name))}</div><div class="grow"><div class="t">${esc(u.name)}${u.id === activeUser()?.id ? ' <span class="tag good">du</span>' : ''}</div><div class="d">${u.id === activeUser()?.id ? 'Inloggad nu' : 'Byt via "Byt användare"'}</div></div>${u.id !== activeUser()?.id ? `<button class="btn xs danger" data-deluser="${esc(u.id)}">Ta bort</button>` : ''}</div>`).join('')}
        <button class="list-item" id="u-switch"><div class="ic">${I.profile}</div><div class="grow"><div class="t">Byt användare</div><div class="d">Till Malin eller annan profil (PIN krävs)</div></div>${I.chevR.replace('<svg', '<svg class="chev"')}</button>
        <button class="list-item" id="u-add"><div class="ic">${I.plus}</div><div class="grow"><div class="t">Lägg till användare</div><div class="d">Egen profil, plan och historik</div></div>${I.chevR.replace('<svg', '<svg class="chev"')}</button>
        <button class="list-item" id="u-pin"><div class="ic">🔒</div><div class="grow"><div class="t">Ändra min PIN</div><div class="d">4 siffror</div></div>${I.chevR.replace('<svg', '<svg class="chev"')}</button>
      </div>
      <div class="card mt-2"><div class="eyebrow" style="margin-bottom:8px">Fråga efter PIN</div>${segmented([{ id: 'never', name: 'Aldrig' }, { id: 'sometimes', name: 'Ibland (3 dagar)' }, { id: 'always', name: 'Varje start' }], activeUser()?.pinMode || 'sometimes', 'data-pinmode')}<div class="small muted mt-1" style="margin-left:4px">PIN frågas alltid vid byte av användare.</div></div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="h2">Utseende</h2></div>
      <div class="card">${themePicker(state.settings.theme || 'dark')}<div class="small muted mt-2" style="margin-left:2px">${/^malin/.test(state.settings.theme || '') ? 'Malin-läge: vitt och rosa, mjuka former, katter och gulliga figurer 🐱💕' : 'Malin-läge ger ett gulligt utseende i vitt och rosa – varje profil har sitt eget.'}</div></div>
    </div>

    <div class="section">
      ${IS_LOCAL_HOST ? `<div class="notice" style="margin-bottom:10px;line-height:1.5">🏠 Den här kopian körs från datorn hemma. Den publika appen finns på <a href="${PUBLIC_URL}" target="_blank" rel="noopener">${PUBLIC_URL.replace('https://', '')}</a>. Flytta dit: <b>Exportera säkerhetskopia</b> här → öppna länken i Safari → lägg till på hemskärmen → <b>Importera</b> filen i appen.</div>` : ''}
      <div class="section-head"><h2 class="h2">Data</h2><span class="small muted">${(() => { const i = storageInfo(); return `${i.entries} poster · ${i.daysLogged} dagar${i.first ? ' sedan ' + i.first.slice(0, 7) : ''} · ${(i.bytes / 1024).toFixed(0)} kB`; })()}</span></div>
      ${(() => { const i = storageInfo(); const last = state.meta?.lastBackup || state.meta?.lastExport; const old = !last || Date.now() - Date.parse(last) > 30 * 86400000; return i.entries > 100 && old ? `<div class="notice warn" style="margin-bottom:10px">💾 Du har ${i.entries} loggade poster${last ? ' och senaste säkerhetskopian är över en månad gammal' : ' men ingen säkerhetskopia ännu'}. Exportera en fil till Filer/iCloud då och då – då kan du alltid få tillbaka allt.</div>` : ''; })()}
      ${(() => { const c = backupConfig(); const when = c.lastSync ? new Date(c.lastSync) : null; const whenTxt = when ? `${fmtDate(when.toISOString().slice(0, 10))} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}` : 'inte ännu'; return `<div class="card mb-2" id="backup-card" style="margin-bottom:10px">
        <div class="row between"><div><div class="h3">☁️ Automatisk backup</div><div class="small muted">Privat GitHub-repo · ${c.enabled ? esc(c.repo) : 'inte ansluten'}</div></div><span class="tag ${c.enabled ? (c.lastError ? '' : 'good') : ''}">${c.enabled ? (c.lastError ? 'fel' : 'på') : 'av'}</span></div>
        ${c.enabled ? `<div class="small muted mt-1">Senast sparad: ${whenTxt} · ${esc(c.file.replace('backups/', ''))}${c.lastError ? `<div style="color:var(--bad)">⚠️ ${esc(c.lastError)}</div>` : ''}</div>
          <div class="small muted mt-1">Sparas automatiskt några minuter efter ändringar och när appen stängs. Foton ingår inte, bara det du loggat.</div>
          <div class="row mt-2" style="gap:8px"><button class="btn sm grow" id="bk-now">Säkerhetskopiera nu</button><button class="btn sm grow" id="bk-restore">Hämta från backup</button></div>
          <button class="btn xs quiet mt-1" id="bk-off">Koppla bort</button>`
        : `<div class="small muted mt-1" style="line-height:1.45">Kopiera allt du loggat automatiskt till ditt privata repo <b>${esc(DEFAULT_REPO)}</b>. Klistra in åtkomstnyckeln från GitHub en gång – den följer sedan med i inbjudningslänken.</div>
          <div class="row mt-2" style="gap:8px"><input class="input grow" id="bk-token" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" id="bk-connect" style="min-height:54px;padding:0 16px">Koppla</button></div>`}
      </div>`; })()}
      <div class="list">
        <button class="list-item" id="export"><div class="ic">${I.download}</div><div class="grow"><div class="t">Exportera säkerhetskopia</div><div class="d">Allt du loggat som JSON-fil</div></div>${I.chevR.replace('<svg', '<svg class="chev"')}</button>
        <button class="list-item" id="import"><div class="ic">${I.upload}</div><div class="grow"><div class="t">Importera säkerhetskopia</div><div class="d">Ersätter allt på den här enheten</div></div>${I.chevR.replace('<svg', '<svg class="chev"')}</button>
        <button class="list-item" id="reset"><div class="ic" style="color:var(--bad)">${I.trash}</div><div class="grow"><div class="t" style="color:var(--bad)">Nollställ appen</div><div class="d">Raderar profil och all historik</div></div></button>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2 class="h2">Om Tallrik</h2><span class="small muted">Version 2.3</span></div>
      <div class="card small muted" style="line-height:1.55">
        Fotoanalysen läser förpackningar (märke, storlek, näringstabell, streckkod) och slår upp exakta produkter i Open Food Facts; tallrikar skattas visuellt och förankras i Livsmedelsverket. Appen lär sig dina rättelser av storlek och matchning.<br><br>Näringsvärden: <b>Livsmedelsverkets livsmedelsdatabas</b> (${dbMeta()?.fetched || '2026'}, 2 606 livsmedel, öppna data) och <b>Open Food Facts</b> (streckkoder, öppen databas). Energiberäkning enligt Mifflin-St Jeor. All data sparas lokalt på din enhet.<br><br>Tallrik ger allmän kostinformation och ersätter inte råd från vården.
      </div>
    </div>
  </div>`;
  root.querySelector('#edit-plan').onclick = openPlanEditor;
  root.querySelector('#u-switch').onclick = () => { haptic(); showUsers(); };
  root.querySelector('#u-add').onclick = () => openSheet({ title: 'Ny användare', html: `<div class="field"><label>Namn</label><input class="input" id="nu-name" placeholder="T.ex. Malin" maxlength="24"></div><div class="field mt-2"><label>PIN-kod (4 siffror)</label><input class="input" id="nu-pin" inputmode="numeric" maxlength="4" value="0000"></div><p class="small muted mt-2">Profilen skapas på den här telefonen. Nycklarna för Gemini och Groq delas automatiskt.</p><button class="btn primary block mt-3" id="nu-ok">Skapa och byt till profilen</button>`, onMount(a) { setTimeout(() => a.body.querySelector('#nu-name').focus(), 380); a.body.querySelector('#nu-ok').onclick = () => { const name = a.body.querySelector('#nu-name').value.trim(), pin = a.body.querySelector('#nu-pin').value.replace(/\D/g, ''); if (!name || pin.length !== 4) { toast('Namn och 4-siffrig PIN behövs', 'bad'); return; } createUser(name, pin); a.close(); toast(`${name} skapad – välj profilen och ange PIN`, 'good'); showUsers(); }; } });
  root.querySelector('#u-pin').onclick = () => openSheet({ title: 'Ändra PIN', html: `<div class="field"><label>Nuvarande PIN</label><input class="input" id="p-old" inputmode="numeric" maxlength="4" type="password"></div><div class="field mt-2"><label>Ny PIN (4 siffror)</label><input class="input" id="p-new" inputmode="numeric" maxlength="4"></div><button class="btn primary block mt-3" id="p-ok">Spara</button>`, onMount(a) { a.body.querySelector('#p-ok').onclick = () => { const u = activeUser(); const o = a.body.querySelector('#p-old').value, n = a.body.querySelector('#p-new').value.replace(/\D/g, ''); if (!checkPin(u.id, o)) { toast('Fel nuvarande PIN', 'bad'); return; } if (n.length !== 4) { toast('Ny PIN ska vara 4 siffror', 'bad'); return; } setPin(u.id, n); a.close(); toast('PIN ändrad', 'good'); }; } });
  root.querySelectorAll('[data-deluser]').forEach(b => b.onclick = async () => { const u = users().find(x => x.id === b.dataset.deluser); if (await confirmSheet({ title: `Ta bort ${u.name}?`, text: 'All data för profilen raderas från den här telefonen.', okText: 'Ta bort', danger: true })) { deleteUser(u.id); toast('Profilen borttagen'); render(root); } });
  bindSeg(root, 'data-pinmode', v => { updateUser(activeUser().id, { pinMode: v }); toast(v === 'never' ? 'PIN frågas bara vid byte av användare' : v === 'always' ? 'PIN frågas vid varje start' : 'PIN frågas var tredje dag', 'good'); });
  bindThemePicker(root, v => setSetting('theme', v));
  bindProvider(root);
  root.querySelector('#bk-connect')?.addEventListener('click', async () => {
    const tok = root.querySelector('#bk-token').value.trim(); if (!tok) { toast('Klistra in åtkomstnyckeln först', 'bad'); return; }
    setBackupConfig({ token: tok, repo: DEFAULT_REPO }); toast('Kopplar… säkerhetskopierar nu', '');
    const r = await backupNow({ force: true }); if (r.ok) { haptic('success'); toast('Backup klar – sparas automatiskt från och med nu', 'good'); } else { toast(r.error || 'Kunde inte säkerhetskopiera', 'bad'); }
    render(root);
  });
  root.querySelector('#bk-now')?.addEventListener('click', async () => { toast('Säkerhetskopierar…', ''); const r = await backupNow({ force: true }); toast(r.ok ? `Backup klar (${Math.round(r.bytes / 1024)} kB)` : (r.error || r.skipped || 'Kunde inte säkerhetskopiera'), r.ok ? 'good' : 'bad'); render(root); });
  root.querySelector('#bk-off')?.addEventListener('click', async () => { if (await confirmSheet({ title: 'Koppla bort automatisk backup?', text: 'Redan sparade kopior på GitHub finns kvar.', okText: 'Koppla bort', danger: true })) { disconnectBackup(); render(root); } });
  root.querySelector('#bk-restore')?.addEventListener('click', () => openSheet({ title: 'Hämta från backup', html: '<div class="skeleton" style="height:60px"></div>', async onMount(a) {
    try {
      const files = await listBackups();
      if (!files.length) { a.setHTML('<div class="notice">Inga säkerhetskopior i repot ännu.</div>'); return; }
      a.setHTML(`<p class="small muted">Välj vilken kopia som ska hämtas. <b>All data på den här profilen ersätts.</b></p><div class="list mt-2">${files.map((f, i) => `<button class="list-item" data-bk="${i}"><div class="grow"><div class="t">${esc(f.name.replace(/\.json(\.gz)?$/, ''))}</div><div class="d">${Math.round(f.size / 1024)} kB</div></div>${I.chevR.replace('<svg', '<svg class="chev"')}</button>`).join('')}</div>`);
      a.body.querySelectorAll('[data-bk]').forEach(b => b.onclick = async () => { const f = files[+b.dataset.bk]; if (await confirmSheet({ title: `Hämta ${f.name.replace(/\.json(\.gz)?$/, '')}?`, text: 'Allt som finns på den här profilen just nu ersätts med kopian.', okText: 'Hämta', danger: true })) { try { await restoreBackup(f); toast('Återställd', 'good'); setTimeout(() => location.reload(), 400); } catch (e) { toast(e.message, 'bad'); } } });
    } catch (e) { a.setHTML(`<div class="notice warn">${esc(e.message)}</div>`); }
  } }));
  root.querySelector('#export').onclick = () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tallrik-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast('Säkerhetskopia skapad', 'good');
  };
  root.querySelector('#import').onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = async () => { if (!inp.files[0]) return; if (!await confirmSheet({ title: 'Importera?', text: 'All data på den här enheten ersätts av filen.', okText: 'Importera', danger: true })) return; try { importJSON(await inp.files[0].text()); toast('Importerad', 'good'); location.reload(); } catch (e) { toast(e.message, 'bad'); } };
    inp.click();
  };
  root.querySelector('#reset').onclick = async () => { if (await confirmSheet({ title: 'Nollställa allt?', text: 'Profil, loggar, vikter och favoriter raderas. Exportera först om du vill spara.', okText: 'Radera allt', danger: true })) { resetAll(); location.reload(); } };
}
function bindProvider(root) {
  const msg = root.querySelector('#key-msg'), btn = root.querySelector('#test');
  root.querySelector('#share-keys')?.addEventListener('click', () => openSheet({ title: 'Bjud in till Tallrik', html: `
    <p class="small muted" style="line-height:1.5">Länken öppnar Tallrik som <b>hennes egen app</b>: egen profil, egen plan och egen historik. Hon ser inte din profil eller dina loggar. AI-nycklarna (Gemini/Groq) följer med så fotoanalys och recept fungerar direkt.</p>
    ${!(state.settings.ai?.keys?.gemini || '').trim() ? `<div class="notice warn mt-2" style="line-height:1.45">⚠️ Gemini-nyckeln saknas här – då fungerar inte fotoanalysen för henne. Lägg in den först (AI-motor ovan) eller skicka en ny länk senare.</div>` : ''}${!(state.settings.ai?.keys?.groq || '').trim() ? `<div class="notice warn mt-2" style="line-height:1.45">⚠️ Groq-nyckeln saknas – recept, dagsplan och coach går då via Gemini eller inte alls.</div>` : ''}
    <div class="field mt-2"><label>Namn</label><input class="input" id="inv-name" value="Malin" maxlength="24"></div>
    <div class="field mt-2"><label>PIN-kod (4 siffror)</label><input class="input" id="inv-pin" inputmode="numeric" maxlength="4" value="0000"></div>
    <div class="field mt-2"><label>Utseende</label>${themePicker('malin')}</div>
    <button class="btn primary block mt-3" id="inv-ok">Skapa länk och skicka</button>
    <p class="small muted mt-2" style="line-height:1.5">Skicka länken via iMessage. Hon öppnar den i Safari, lägger till Tallrik på hemskärmen (appen visar hur) och gör sedan klart sin plan i appen.${IS_LOCAL_HOST ? ' Länken går till den publika appen på GitHub.' : ''}</p>`, onMount(a) {
      let theme = 'malin';
      bindThemePicker(a.body, id => { theme = id; });
      a.body.querySelector('#inv-ok').onclick = async () => {
        const name = a.body.querySelector('#inv-name').value.trim() || 'Malin', pin = a.body.querySelector('#inv-pin').value.replace(/\D/g, '');
        if (pin.length !== 4) { toast('PIN-koden ska vara 4 siffror', 'bad'); return; }
        const keys = Object.fromEntries(Object.entries(state.settings.ai?.keys || {}).filter(([, v]) => v));
        const bc = backupConfig(); const backup = bc.enabled ? { token: bc.token, repo: bc.repo } : undefined;
        const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ name, pin, theme, keys, ...(backup ? { backup } : {}) }))));
        const link = (IS_LOCAL_HOST ? PUBLIC_URL : location.origin + location.pathname) + '?invite=tallrik2:' + payload;
        const text = `Hej ${name}! Här är din Tallrik 🐱 Öppna länken i Safari på din telefon så är appen din (PIN ${pin}):\n${link}`;
        try { if (navigator.share) { await navigator.share({ title: 'Tallrik', text }); } else { await navigator.clipboard.writeText(text); toast('Länken kopierad – skicka till ' + name, 'good'); } a.close(); } catch {}
      };
    } }));
  btn.onclick = async () => {
    const key = root.querySelector('#key').value.trim();
    if (!key) { msg.textContent = 'Klistra in nyckeln först.'; return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try { const r = await addKey(key); haptic('success'); toast(`${PROVIDERS[r.provider].name}: nyckeln fungerar (${r.models.length} modeller)`, 'good'); }
    catch (e) { msg.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; btn.disabled = false; btn.textContent = 'Spara'; }
  };
  root.querySelectorAll('[data-forget]').forEach(b => b.onclick = async () => { if (await confirmSheet({ title: 'Ta bort nyckeln?', text: PROVIDERS[b.dataset.forget].name, okText: 'Ta bort', danger: true })) removeKey(b.dataset.forget); });
  bindSeg(root, 'data-prov', v => { if (!(state.settings.ai?.keys?.[v] || '').trim()) { toast('Ingen nyckel för ' + PROVIDERS[v].name + ' ännu', 'bad'); return; } setProvider(v); });
  bindSeg(root, 'data-mode', v => setMode(v));
  bindSeg(root, 'data-textprov', v => setTextProvider(v));
  root.querySelector('#model-sel')?.addEventListener('change', e => { setModelChoice(state.settings.ai.provider, state.settings.ai.mode || 'fast', e.target.value); toast(e.target.value ? 'Modell vald' : 'Automatiskt val'); });
}
function openPlanEditor() {
  const d = { ...state.profile };
  const sheet = openSheet({
    full: true, title: 'Ändra plan',
    html: `<div class="row" style="gap:8px">
        <div class="field grow"><label>Vikt (kg)</label><input class="input" id="w" inputmode="decimal" value="${d.weightKg}"></div>
        <div class="field grow"><label>Längd (cm)</label><input class="input" id="h" inputmode="numeric" value="${d.heightCm}"></div>
        <div class="field grow"><label>Födelseår</label><input class="input" id="y" inputmode="numeric" value="${d.birthYear}"></div>
      </div>
      <div class="mt-2">${segmented([{ id: 'female', name: 'Kvinna' }, { id: 'male', name: 'Man' }], d.sex, 'data-sex')}</div>
      <div class="eyebrow mt-3" style="margin-bottom:8px">Mål</div>${segmented(GOALS.map(g => ({ id: g.id, name: g.t.replace('Gå ner i vikt', 'Gå ner').replace('Behålla vikten', 'Behålla').replace('Bygga muskler', 'Bygga') })), d.goal, 'data-goal')}
      <div id="pace-box" class="mt-2 ${d.goal === 'maintain' ? 'hidden' : ''}">
        <div class="field"><label>Målvikt (kg)</label><input class="input" id="tw" inputmode="decimal" value="${d.targetWeightKg}"></div>
        <div class="eyebrow mt-2" style="margin-bottom:8px">Takt</div><div id="pace-seg">${paceSeg(d)}</div>
      </div>
      <div class="eyebrow mt-3" style="margin-bottom:8px">Aktivitet</div>
      <div class="choice-list">${ACTIVITY.map(a => `<button class="choice ${d.activity === a.id ? 'active' : ''}" data-act="${a.id}" style="padding:12px 14px"><div class="ic" style="width:36px;height:36px;font-size:18px">${a.icon}</div><div><div class="t" style="font-size:15px">${esc(a.t)}</div><div class="d">${esc(a.d)}</div></div><div class="check"></div></button>`).join('')}</div>
      <div class="eyebrow mt-3" style="margin-bottom:8px">Kost</div>
      <div class="chips" id="diet">${DIETS.map(x => `<button class="chip ${d.diet === x.id ? 'active' : ''}" data-diet="${x.id}">${x.icon} ${esc(x.t)}</button>`).join('')}</div>
      <div class="chips mt-2" id="avoid">${AVOID.map(a => `<button class="chip sm ${(d.avoid || []).includes(a) ? 'active' : ''}" data-avoid="${a}">${esc(a)}</button>`).join('')}</div>
      <div class="eyebrow mt-3" style="margin-bottom:8px">Måltider per dag</div>${segmented([{ id: '3', name: '3' }, { id: '4', name: '3 + mellanmål' }, { id: '5', name: 'Många små' }, { id: '2', name: 'Fasta' }], String(d.mealsPerDay), 'data-meals')}
      <div class="card accent mt-4" id="preview"></div>
      <button class="btn primary block mt-3" id="save">Spara planen</button>`,
    onMount(a) {
      const b = a.body;
      const read = () => { d.weightKg = parseFloat(String(b.querySelector('#w').value).replace(',', '.')) || d.weightKg; d.heightCm = +b.querySelector('#h').value || d.heightCm; d.birthYear = +b.querySelector('#y').value || d.birthYear; d.targetWeightKg = parseFloat(String(b.querySelector('#tw').value).replace(',', '.')) || d.targetWeightKg; if (d.goal === 'maintain') { d.targetWeightKg = d.weightKg; d.paceKgPerWeek = 0; } };
      const preview = () => { read(); const t = computeTargets(d); b.querySelector('#preview').innerHTML = `<div class="row between"><div><div class="eyebrow">Nytt dagsmål</div><div class="hero-num">${fmt(t.kcal)} <small style="font-size:14px;color:var(--text-3)">kcal</small></div></div><div class="small muted" style="text-align:right">P ${t.protein} · K ${t.carbs} · F ${t.fat} g<br>TDEE ${fmt(t.tdee)} kcal${t.goalDate ? '<br>Mål ' + fmtDateLong(t.goalDate) : ''}</div></div>`; };
      ['#w', '#h', '#y', '#tw'].forEach(s => b.querySelector(s).addEventListener('input', preview));
      bindSeg(b, 'data-sex', v => { d.sex = v; preview(); });
      bindSeg(b, 'data-goal', v => { d.goal = v; b.querySelector('#pace-box').classList.toggle('hidden', v === 'maintain'); if (v === 'lose') { d.paceKgPerWeek = 0.5; if (d.targetWeightKg >= d.weightKg) { d.targetWeightKg = Math.round(d.weightKg * 0.92); b.querySelector('#tw').value = d.targetWeightKg; } } if (v === 'gain') { d.paceKgPerWeek = 0.3; if (d.targetWeightKg <= d.weightKg) { d.targetWeightKg = Math.round(d.weightKg * 1.06); b.querySelector('#tw').value = d.targetWeightKg; } } b.querySelector('#pace-seg').innerHTML = paceSeg(d); bindSeg(b.querySelector('#pace-seg'), 'data-pace', v2 => { d.paceKgPerWeek = +v2; preview(); }); preview(); });
      bindSeg(b.querySelector('#pace-seg'), 'data-pace', v => { d.paceKgPerWeek = +v; preview(); });
      b.querySelectorAll('[data-act]').forEach(x => x.onclick = () => { d.activity = +x.dataset.act; b.querySelectorAll('[data-act]').forEach(y => y.classList.toggle('active', y === x)); haptic(); preview(); });
      b.querySelectorAll('[data-diet]').forEach(x => x.onclick = () => { d.diet = x.dataset.diet; b.querySelectorAll('[data-diet]').forEach(y => y.classList.toggle('active', y === x)); haptic(); preview(); });
      b.querySelectorAll('[data-avoid]').forEach(x => x.onclick = () => { const v = x.dataset.avoid; d.avoid = (d.avoid || []).includes(v) ? d.avoid.filter(z => z !== v) : [...(d.avoid || []), v]; x.classList.toggle('active'); haptic(); });
      bindSeg(b, 'data-meals', v => { d.mealsPerDay = +v; });
      preview();
      b.querySelector('#save').onclick = () => { read(); const t = computeTargets(d); setProfile(d); setTargets({ ...t, method: 'formula' }); haptic('success'); toast('Planen är uppdaterad', 'good'); a.close(); };
    },
  });
  return sheet;
}
const paceSeg = d => d.goal === 'maintain' ? '' : segmented((PACES[d.goal] || []).map(p => ({ id: String(p.kg), name: p.t })), String(d.paceKgPerWeek), 'data-pace');

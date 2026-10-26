/* ================= Settings ================= */
function aiSectionHtml() {
  const st = S.settings.ai, id = st.provider, p = PROVIDERS[id];
  const list = (st.lists[id] && st.lists[id].length ? st.lists[id] : p.models);
  const opts = Object.entries(PROVIDERS).filter(([k, v]) => (!v.previewOnly || IS_ARTIFACT) && (k !== 'free' || freeCfg())).map(([k, v]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
  const m = st.models[id] || {};
  const canList = ['anthropic', 'gemini'].includes(p.kind) || (p.kind === 'openai' && !p.azure);
  return `
    <label class="field"><span>AI service for notes, quizzes, citations and translation</span><select id="ai-provider">${opts}</select></label>
    <p class="small muted" style="margin:0">${esc(p.note)}</p>
    ${id !== 'free' && !ownReady(id) && freeAvailable() ? `<div class="notice">Until you add a key, Didasko uses its <b>free shared AI</b> (Gemini). Live translation still runs on-device only.</div>` : ''}
    ${p.kind === 'free' && !freeAvailable() ? `<div class="notice warn">${freeState().region ? esc(FREE_MSG.FREE_REGION) : 'Today’s shared free allowance is used up. It resets at midnight Pacific time — or add your own free Gemini key.'}</div>` : ''}
    ${p.key ? `<label class="field"><span>${esc(p.label.replace(/ \(.*\)$/, ''))} API key${p.optionalKey ? ' (optional)' : ''}</span><input id="ai-key" type="password" value="${esc(st.keys[id] || '')}" placeholder="${esc(p.keyHint)}" autocomplete="off" spellcheck="false"></label>
      ${p.keyUrl ? `<p class="small muted" style="margin:0">Get a key at <a href="${p.keyUrl}" target="_blank" rel="noopener">${esc(p.keyUrl.replace(/^https:\/\//, ''))}</a>. Each teacher uses their own key, so usage is billed to them — or is free on free tiers — and never to the app’s owner.</p>` : ''}` : ''}
    ${p.editBase ? `<label class="field"><span>Service address</span><input id="ai-base" value="${esc(st.bases[id] || p.base || '')}" placeholder="https://…/v1" autocomplete="off" inputmode="url"></label>` : ''}
    ${p.azure ? `<div class="grid-2 stack-sm">
      <label class="field"><span>Endpoint</span><input id="az-endpoint" value="${esc(st.azure.endpoint)}" placeholder="https://your-resource.openai.azure.com" inputmode="url" autocomplete="off"></label>
      <label class="field"><span>API version</span><input id="az-version" value="${esc(st.azure.apiVersion)}" autocomplete="off"></label>
      <label class="field"><span>Deployment (notes and quiz)</span><input id="az-dep" value="${esc(st.azure.deployment)}" placeholder="e.g. gpt-main" autocomplete="off"></label>
      <label class="field"><span>Deployment (live translation)</span><input id="az-fast" value="${esc(st.azure.fastDeployment)}" placeholder="Same as above" autocomplete="off"></label>
    </div>` : ''}
    ${!p.azure && !['chrome', 'sample', 'free'].includes(p.kind) ? `<div class="grid-2 stack-sm">
      <label class="field"><span>Model for notes, quizzes and citations</span><input id="ai-main" list="ai-models" value="${esc(m.main || p.main)}" placeholder="Tap Refresh to list models" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span>Faster model for live translation</span><input id="ai-fast" list="ai-models" value="${esc(m.fast || p.fast)}" placeholder="Same as above" autocomplete="off" spellcheck="false"></label>
      <datalist id="ai-models">${list.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>
    </div>` : ''}
    ${p.kind === 'gemini' || id === 'openai' ? `<label class="field"><span>Picture model (children’s books)</span><input id="ai-image" value="${esc((st.imageModels || {})[id] || IMAGE_MODELS[p.kind === 'gemini' ? 'gemini' : 'openai'])}" autocomplete="off" spellcheck="false"></label>` : !['sample'].includes(p.kind) ? `<p class="small muted" style="margin:0">Children’s-book pictures: this service draws simple illustrations. Gemini and ChatGPT can paint full pictures.</p>` : ''}
    <div class="row">${canList ? `<button class="btn sm" id="ai-refresh">Refresh model list</button>` : ''}<button class="btn sm" id="ai-test">Test connection</button><span class="small muted" id="ai-test-out"></span></div>`;
}
function bindAiSection(box) {
  const st = S.settings.ai;
  const changed = () => { saveSettings(); TR.engineCache.clear(); renderAiState(); };
  $('#ai-provider', box).onchange = e => { st.provider = e.target.value; changed(); box.innerHTML = aiSectionHtml(); bindAiSection(box); };
  const on = (sel, fn) => { const el = $(sel, box); if (el) el.oninput = el.onchange = () => { fn(el.value.trim()); changed(); }; };
  const id = st.provider;
  on('#ai-key', v => { st.keys[id] = v; });
  on('#ai-base', v => { st.bases[id] = v; });
  on('#az-endpoint', v => { st.azure.endpoint = v; }); on('#az-version', v => { st.azure.apiVersion = v; });
  on('#az-dep', v => { st.azure.deployment = v; }); on('#az-fast', v => { st.azure.fastDeployment = v; });
  on('#ai-main', v => { st.models[id] = { ...(st.models[id] || {}), main: v }; });
  on('#ai-fast', v => { st.models[id] = { ...(st.models[id] || {}), fast: v }; });
  on('#ai-image', v => { st.imageModels = { ...(st.imageModels || {}), [id]: v }; });
  const out = $('#ai-test-out', box);
  const rb = $('#ai-refresh', box);
  if (rb) rb.onclick = async () => {
    out.textContent = 'Loading models…';
    try { const ids = await listModels(); $('#ai-models', box).innerHTML = ids.map(x => `<option value="${esc(x)}"></option>`).join(''); out.textContent = `${ids.length} models available — tap a model field to choose.`; }
    catch (e) { out.textContent = e.message; }
  };
  $('#ai-test', box).onclick = async () => {
    if (!aiReady()) { out.textContent = PROVIDERS[st.provider].kind === 'chrome' ? 'Chrome’s on-device model isn’t available in this browser.' : PROVIDERS[st.provider].kind === 'free' ? 'The free AI isn’t available right now.' : 'Fill in the key and model first.'; return; }
    out.textContent = 'Testing…';
    try { const t = await callAI({ maxTokens: 30, system: 'Reply with exactly: ready', user: 'Status check' }); out.textContent = t.trim() ? `Connected to ${aiLabel()}.` : 'Connected, but the reply was empty.'; }
    catch (e) { out.textContent = e.message === 'NO_AI' ? 'Fill in the key and model first.' : e.message; }
  };
}
function openSettings() {
  const st = S.settings;
  const opt = (arr, v) => arr.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  openSheet('Settings', `
    <div class="set-group"><span class="eyebrow">Account</span>
      <div class="row between"><span class="small">${isSignedIn() ? `Signed in as <b>${esc(CLOUD.user.displayName || CLOUD.user.email)}</b>` : 'Not signed in — one lecture is kept on this device.'}</span>
      <button class="btn sm" id="set-acct">${isSignedIn() ? 'Manage' : 'Sign in'}</button></div></div>
    <div class="set-group"><span class="eyebrow">AI model</span><div id="ai-box" class="view" style="gap:12px">${aiSectionHtml()}</div></div>
    <div class="set-group"><span class="eyebrow">Translation and display</span>
      <div class="grid-2 stack-sm">
        <label class="field"><span>Translation engine</span><select id="set-engine">${opt([['auto', 'On-device first, then AI'], ['device', 'On-device only'], ['ai', 'AI model only']], st.engine)}</select></label>
        <label class="field"><span>Appearance</span><select id="set-theme">${opt([['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']], st.theme)}</select></label>
      </div></div>
    ${IS_ARTIFACT ? '' : `<div class="set-group"><span class="eyebrow">Install</span>
      ${standalone ? '<p class="small muted" style="margin:0">Didasko is installed on this device.</p>' : S.installPrompt ? `<div class="row"><button class="btn sm primary" id="set-install">${icon('down')}Install Didasko</button><span class="small muted">Adds it to your home screen and works offline.</span></div>` : `<p class="small muted" style="margin:0">${ios ? 'In Safari, tap Share, then <b>Add to Home Screen</b>.' : 'Use your browser’s menu and choose <b>Install app</b> or <b>Add to Home screen</b>.'}</p>`}</div>`}
    <div class="set-group"><span class="eyebrow">Privacy</span><p class="small muted" style="margin:0">Speech recognition is provided by the browser (Chrome and Edge process audio on their servers; Safari may process on-device). Text for notes, quizzes and AI translation goes only to the AI service chosen above, using that teacher’s own key. Without a key, notes, quizzes and transcription use Didasko’s free shared AI (Google Gemini), and Google may use that text to improve its products — leave out student names. Shared captions and quiz answers pass through this app’s database and are visible to anyone with the session link. Check your school’s policy before captioning or recording students.</p></div>
    <div class="set-group"><div class="row"><button class="btn sm ghost danger" id="set-wipe">${icon('trash')}Delete ${isSignedIn() ? 'all my lectures' : 'the lecture on this device'}</button></div></div>`,
    sh => {
      bindAiSection($('#ai-box', sh));
      $('#set-acct', sh).onclick = openAccountSheet;
      $('#set-engine', sh).onchange = e => { st.engine = e.target.value; saveSettings(); TR.engineCache.clear(); renderEngineNote(); };
      $('#set-theme', sh).onchange = e => { st.theme = e.target.value; saveSettings(); applyTheme(); };
      const ib = $('#set-install', sh); if (ib) ib.onclick = async () => { S.installPrompt.prompt(); await S.installPrompt.userChoice.catch(() => {}); S.installPrompt = null; closeSheet(); };
      twoStep($('#set-wipe', sh), 'Tap again to delete permanently', async () => {
        if (S.rec.running) pauseCaptions(true);
        for (const m of [...S.index]) await deleteLecture(m.id);
        await switchLecture(newLecture()); closeSheet(); toast('Lectures deleted');
      });
    });
}
function renderAiState() {
  const ok = aiReady();
  const chip = $('#ai-chip');
  if (chip) { chip.textContent = ok ? (usingFree() ? 'AI: free (shared)' : `AI: ${aiLabel()}`) : 'AI: not set up'; chip.className = 'chip ' + (ok ? 'ok' : 'warn'); }
  const nh = $('#notes-gen-hint'), qh = $('#quiz-hint');
  if (nh) nh.innerHTML = ok ? '' : `<b>No AI model is connected.</b> Articles, picture books and custom outputs need one. <button class="linklike" id="nh-ai">Connect one</button> (Gemini is free).`;
  const nb = $('#nh-ai'); if (nb) nb.onclick = () => openAiSetupSheet('Connect an AI model to write articles, picture books, custom outputs and quizzes from your lectures.', null);
  if (qh) qh.textContent = ok ? '' : 'No AI model is set up, so Didasko builds simple concept checks on this device. Choose an AI service in Settings for scenario and misconception questions.';
  if ($('#notes-style-hint')) renderNotesStyleUi();
  if (S.view === 'home') renderHome();
  TR.engineCache.clear(); renderEngineNote();
}
/* Quick AI setup, shown when a feature needs an AI model and none is connected. On success it continues the task. */
function openAiSetupSheet(why, onReady, alt) {
  const st = S.settings.ai;
  const QUICK = [['gemini', 'Gemini', 'Free tier — usually enough for a class. Can also transcribe recordings and YouTube videos and paint pictures.'], ['anthropic', 'Claude', 'Paid API, strong writing.'], ['openai', 'ChatGPT', 'Paid API. Can transcribe recordings and paint pictures.']];
  let pick = QUICK.some(q => q[0] === st.provider) ? st.provider : 'gemini';
  openSheet('Connect an AI model', `
    <p style="margin:0">${esc(why)}</p>
    <div class="seg start-from" role="group" aria-label="AI service" style="grid-template-columns:repeat(3,1fr)">${QUICK.map(([k, l]) => `<button type="button" data-ai="${k}" aria-pressed="${k === pick}">${esc(l)}</button>`).join('')}</div>
    <p class="small muted" id="aq-note" style="margin:0"></p>
    <ol class="small" id="aq-steps" style="margin:0;padding-left:1.3em;display:grid;gap:4px"></ol>
    <label class="field"><span id="aq-label">API key</span><input id="aq-key" type="password" autocomplete="off" spellcheck="false"></label>
    <p class="small muted" style="margin:0">The key is saved only on this device and goes straight to that service. You can change it any time in Settings → AI model.</p>
    <div class="row"><button class="btn primary" id="aq-go">${icon('spark')}Connect and continue</button>${alt ? `<button class="btn ghost" id="aq-alt">${esc(alt.label)}</button>` : ''}<span class="small muted" id="aq-out"></span></div>`,
    sh => {
      const paint = () => {
        const p = PROVIDERS[pick];
        $$('[data-ai]', sh).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ai === pick)));
        $('#aq-note', sh).textContent = QUICK.find(q => q[0] === pick)[2];
        $('#aq-steps', sh).innerHTML = `<li>Open <a href="${p.keyUrl}" target="_blank" rel="noopener">${esc(p.keyUrl.replace(/^https:\/\//, ''))}</a> and sign in.</li><li>Create an API key and copy it.</li><li>Paste it below.</li>`;
        $('#aq-label', sh).textContent = `${p.label.replace(/ \(.*\)$/, '')} API key`;
        $('#aq-key', sh).placeholder = p.keyHint; $('#aq-key', sh).value = st.keys[pick] || '';
      };
      $$('[data-ai]', sh).forEach(b => b.onclick = () => { pick = b.dataset.ai; paint(); });
      paint();
      $('#aq-go', sh).onclick = async () => {
        const key = $('#aq-key', sh).value.trim(), out = $('#aq-out', sh);
        if (!key) { out.textContent = 'Paste the key first.'; return; }
        const prevProv = st.provider, prevKey = st.keys[pick];
        st.provider = pick; st.keys[pick] = key; TR.engineCache.clear();
        out.textContent = 'Checking the key…'; $('#aq-go', sh).disabled = true;
        try {
          await callAI({ maxTokens: 20, system: 'Reply with exactly: ready', user: 'Status check' });
          saveSettings(); renderAiState(); closeSheet(); toast(`Connected to ${aiLabel()}`);
          onReady && onReady();
        } catch (e) {
          st.provider = prevProv; if (prevKey === undefined) delete st.keys[pick]; else st.keys[pick] = prevKey;
          out.textContent = e.message === 'NO_AI' ? 'That key didn’t work.' : e.message; $('#aq-go', sh).disabled = false;
        }
      };
      const a = $('#aq-alt', sh); if (a) a.onclick = () => { closeSheet(); alt.run(); };
    });
}

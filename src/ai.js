/* ================= AI providers (bring your own key) =================
   Every AI feature (notes, quiz, translation, citation detection) calls callAI().
   Keys stay on this device and go straight from the browser to the chosen provider. */
const PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic)', kind: 'anthropic', key: true, keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys',
    main: 'claude-sonnet-5-5', fast: 'claude-haiku-5-5', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], vision: true,
    note: 'Paid API billed by Anthropic to the key’s owner. A Claude.ai subscription does not include API use.'
  },
  openai: {
    label: 'ChatGPT (OpenAI)', kind: 'openai', base: 'https://api.openai.com/v1', key: true, keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys',
    main: 'gpt-6.1-sol', fast: 'gpt-6-luna', models: ['gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna', 'gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-luna'], vision: true, maxField: 'max_completion_tokens', jsonMode: true,
    note: 'Paid API billed by OpenAI to the key’s owner. A ChatGPT Plus subscription does not include API use.'
  },
  gemini: {
    label: 'Gemini (Google)', kind: 'gemini', key: true, keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey',
    main: 'gemini-3.8-flash', fast: 'gemini-3.5-flash-lite', models: ['gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'], vision: true,
    note: 'Google AI Studio keys include a free tier with daily limits, which is usually enough for a class.'
  },
  azure: {
    label: 'Microsoft Copilot (Azure OpenAI)', kind: 'openai', azure: true, key: true, keyHint: 'Azure key', keyUrl: 'https://ai.azure.com',
    main: '', fast: '', models: [], vision: true, maxField: 'max_completion_tokens', jsonMode: true,
    note: 'Microsoft Copilot has no public API. Schools on Microsoft 365 can use an Azure OpenAI (Azure AI Foundry) deployment instead — the same GPT models behind Copilot. Enter the endpoint and deployment names.'
  },
  openrouter: {
    label: 'OpenRouter (hundreds of models)', kind: 'openai', base: 'https://openrouter.ai/api/v1', key: true, keyHint: 'sk-or-…', keyUrl: 'https://openrouter.ai/keys',
    main: 'openrouter/auto', fast: 'openrouter/auto', models: ['openrouter/auto'], vision: true, listPublic: true,
    note: 'One key reaches Claude, GPT, Gemini, Llama, Mistral and more. Models ending in “:free” cost nothing.'
  },
  mistral: {
    label: 'Mistral', kind: 'openai', base: 'https://api.mistral.ai/v1', key: true, keyHint: 'Mistral key', keyUrl: 'https://console.mistral.ai/api-keys',
    main: 'mistral-large-latest', fast: 'mistral-small-latest', models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'], vision: false, jsonMode: true,
    note: 'Has a free experimentation tier.'
  },
  groq: {
    label: 'Groq (fast open models)', kind: 'openai', base: 'https://api.groq.com/openai/v1', key: true, keyHint: 'gsk_…', keyUrl: 'https://console.groq.com/keys',
    main: '', fast: '', models: [], vision: false, jsonMode: true,
    note: 'Free tier with rate limits. Tap Refresh to list the current models.'
  },
  ollama: {
    label: 'Ollama (free, on your computer)', kind: 'openai', base: 'http://localhost:11434/v1', key: false, editBase: true,
    main: '', fast: '', models: [], vision: false,
    note: 'Runs open models on your own computer at no cost. Start Ollama with OLLAMA_ORIGINS set to this site’s address, then tap Refresh.'
  },
  custom: {
    label: 'Other OpenAI-compatible service', kind: 'openai', base: '', key: true, keyHint: 'API key (if needed)', editBase: true, optionalKey: true,
    main: '', fast: '', models: [], vision: false,
    note: 'For LM Studio, DeepSeek, Together, a school AI gateway, and similar services.'
  },
  chrome: {
    label: 'Gemini Nano in Chrome (free, on-device)', kind: 'chrome', key: false, main: 'gemini-nano', fast: 'gemini-nano', models: ['gemini-nano'], vision: false,
    note: 'Built into Chrome on desktop computers. Free and private, but small: best for short lectures and translation.'
  },
  free: {
    label: 'Didasko free AI (shared Gemini, no key)', kind: 'free', key: false, main: 'gemini-3.5-flash-lite', fast: 'gemini-3.5-flash-lite', models: ['gemini-3.5-flash-lite'], vision: true, hidden: true,
    note: 'Free for everyone, with a daily allowance shared by all Didasko users. Google may use what you send to improve its products, so leave out student names. For adults (18+); not offered in the EU, EEA, UK or Switzerland. For more capacity and privacy, add your own free Gemini key.'
  },
  account: {
    label: 'My Claude account (preview only)', kind: 'sample', key: false, main: 'default', fast: 'quick', models: ['default'], vision: false, previewOnly: true,
    note: 'Uses your Claude.ai account inside this preview.'
  }
};
const DEFAULT_AI = { provider: 'gemini', keys: {}, models: {}, imageModels: {}, lists: {}, bases: {}, azure: { endpoint: '', deployment: '', fastDeployment: '', apiVersion: '2024-10-21' } };

/* ---- Didasko free AI: Gemini through Firebase AI Logic on the app owner's no-cost Spark plan, protected by App Check.
   Used automatically whenever the teacher hasn't connected their own AI. The daily allowance is shared by everyone. ---- */
const FREE_SDK = '12.19.0';
const FREE = { sdk: null };
const freeCfg = () => { const c = window.DIDASKO_CONFIG || {}; return c.freeAI && c.freeAI.enabled !== false && c.freeAI.recaptchaSiteKey && c.firebase && c.firebase.apiKey ? c : null; };
const ptDay = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); } catch { return new Date().toISOString().slice(0, 10); } };
const freeState = () => { try { return JSON.parse(localStorage.getItem('didasko-free') || '{}'); } catch { return {}; } };
const setFreeState = o => { try { localStorage.setItem('didasko-free', JSON.stringify({ ...freeState(), ...o })); } catch { /* private mode */ } };
function freeAvailable() {
  if (IS_ARTIFACT || !freeCfg()) return false;
  const f = freeState();
  return !f.region && f.out !== ptDay();
}
async function freeSdk() {
  if (!FREE.sdk) FREE.sdk = (async () => {
    const c = freeCfg(), u = n => `https://www.gstatic.com/firebasejs/${FREE_SDK}/firebase-${n}.js`;
    const [A, C, AI] = await Promise.all([import(u('app')), import(u('app-check')), import(u('ai'))]);
    const app = A.initializeApp(c.firebase, 'didasko-free-ai');
    C.initializeAppCheck(app, { provider: new C.ReCaptchaEnterpriseProvider(c.freeAI.recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
    return { AI, ai: AI.getAI(app, { backend: new AI.GoogleAIBackend() }) };
  })().catch(e => { FREE.sdk = null; throw new Error('Couldn’t start Didasko’s free AI. Check your internet connection' + (e && e.message ? ` (${e.message})` : '') + '.'); });
  return FREE.sdk;
}
function freeError(e) {
  const m = String((e && (e.message || e.code)) || ''), st = e && e.customErrorData && e.customErrorData.status;
  if (st === 429 || /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(m)) return freeOut('FREE_QUOTA', { out: ptDay() });
  if (/location is not supported|not available in your country|FAILED_PRECONDITION/i.test(m)) return freeOut('FREE_REGION', { region: true });
  if (/app.?check|attestation|recaptcha/i.test(m)) return new Error('Didasko’s free AI couldn’t verify this browser. Reload the page and try again, or add your own free Gemini key in Settings → AI model.');
  if (/SAFETY|blocked/i.test(m)) return new Error('The free AI declined this request. Try again, or use your own AI key.');
  return new Error('Didasko’s free AI: ' + (m.replace(/^\[?AI\/[\w-]+\]?:?\s*/i, '').replace(/^Firebase AI:\s*/i, '') || 'something went wrong.'));
}
function freeOut(code, state) {
  setFreeState(state); renderAiStateSoon();
  setTimeout(() => { try { openAiSetupSheet(FREE_MSG[code], null); } catch { /* ignore */ } }, 50);
  return new Error(FREE_MSG[code]);
}
const renderAiStateSoon = () => setTimeout(() => { try { renderAiState(); } catch { /* not ready */ } }, 0);
const FREE_MSG = {
  FREE_QUOTA: 'Today’s shared free AI allowance is used up. Add your own free Gemini key (about two minutes) to keep going — it’s saved only on this device.',
  FREE_REGION: 'Didasko’s shared free AI isn’t offered where you are. Add your own AI key to use AI features.'
};
/* One-time notice before anything is sent to the shared free AI. */
function freeConsent() {
  if (freeState().agreed) return Promise.resolve(true);
  return new Promise(resolve => {
    let done = false; const finish = v => { if (done) return; done = true; resolve(v); };
    openSheet('Use Didasko’s free AI?', `
      <p style="margin:0">Didasko includes a free AI model (Google Gemini) so you can try articles, quizzes and transcription without an API key. It costs nothing.</p>
      <ul class="small" style="margin:0;padding-left:1.2em;display:grid;gap:6px">
        <li><b>Google may use what you send</b> (transcripts, files, prompts) to improve its products, and people may review it. Leave out student names and anything private.</li>
        <li><b>For adults (18+).</b> Not offered in the EU, EEA, UK or Switzerland.</li>
        <li><b>A shared daily allowance.</b> Everyone using Didasko draws on it; it resets at midnight Pacific time.</li>
      </ul>
      <p class="small muted" style="margin:0">For private use and your own allowance, connect your own key instead — Gemini’s is free.</p>
      <div class="row"><button class="btn primary" id="fc-yes">${icon('spark')}I understand — use free AI</button><button class="btn ghost" id="fc-own">Use my own key</button></div>`,
      sh => {
        $('#fc-yes', sh).onclick = () => { setFreeState({ agreed: true }); closeSheet(); renderAiStateSoon(); finish(true); };
        $('#fc-own', sh).onclick = () => { finish(false); openAiSetupSheet('Connect your own AI model. Gemini has a free tier.', null); };
        const obs = new MutationObserver(() => { if (!sh.isConnected) { obs.disconnect(); finish(false); } });
        obs.observe($('#sheet-root'), { childList: true });
      });
  });
}
async function callFree({ system, user, imgs, maxTokens, onText, signal, json }) {
  if (!(await freeConsent())) throw new Error('Nothing was sent. Connect your own AI key in Settings → AI model, or choose the free AI when you’re ready.');
  const { AI, ai } = await freeSdk();
  const generationConfig = { maxOutputTokens: Math.max(maxTokens * 2, 8192) };
  if (json) generationConfig.responseMimeType = 'application/json';
  const model = AI.getGenerativeModel(ai, { model: freeCfg().freeAI.model || PROVIDERS.free.main, systemInstruction: system, generationConfig });
  const parts = imgs.map(im => ({ inlineData: { mimeType: im.mime, data: im.data } }));
  parts.push({ text: user });
  const req = { contents: [{ role: 'user', parts }] };
  const opts = signal ? { signal } : undefined;
  const txt = r => { try { return r.text(); } catch { return ''; } };
  try {
    if (!onText) {
      const r = await model.generateContent(req, opts);
      const t = txt(r.response);
      if (!t && r.response.promptFeedback?.blockReason) throw new Error('blocked ' + r.response.promptFeedback.blockReason);
      return t;
    }
    const r = await model.generateContentStream(req, opts);
    let text = '';
    for await (const ch of r.stream) { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); const d = txt(ch); if (d) { text += d; onText(text); } }
    return text;
  } catch (e) {
    if (signal?.aborted || e?.name === 'AbortError') throw e;
    throw freeError(e);
  }
}

/* The service actually used: the teacher's choice when it is set up, otherwise the free AI. */
function ownReady(id) {
  const p = PROVIDERS[id]; if (!p) return false;
  const st = S.settings.ai, key = st.keys[id] || '';
  if (p.kind === 'free') return freeAvailable();
  if (p.kind === 'sample') return !!S.ai.sample;
  if (p.kind === 'chrome') return 'LanguageModel' in self;
  if (p.azure) return !!(key && st.azure.endpoint && st.azure.deployment);
  if (p.key && !p.optionalKey && !key) return false;
  if (p.editBase && !(st.bases[id] || p.base)) return false;
  const m = st.models[id] || {};
  return !!(m.main || p.main);
}
const aiId = () => { const id = S.settings.ai.provider; return ownReady(id) || !freeAvailable() ? id : 'free'; };
const usingFree = () => aiId() === 'free' && freeAvailable();
const prov = () => PROVIDERS[aiId()] || PROVIDERS.gemini;
const aiKey = () => S.settings.ai.keys[aiId()] || '';
const aiModel = fast => {
  const id = aiId(), m = S.settings.ai.models[id] || {};
  if (id === 'free') return (freeCfg() && freeCfg().freeAI.model) || PROVIDERS.free.main;
  if (PROVIDERS[id]?.azure) return fast ? (S.settings.ai.azure.fastDeployment || S.settings.ai.azure.deployment) : S.settings.ai.azure.deployment;
  return (fast ? m.fast : m.main) || (fast ? PROVIDERS[id]?.fast : PROVIDERS[id]?.main) || '';
};
const aiBase = () => (S.settings.ai.bases[aiId()] || prov().base || '').replace(/\/+$/, '');
const aiReady = () => ownReady(aiId());
/* The teacher's own AI (not the shared free one): used for live translation, which would use up the shared allowance. */
const ownAiReady = () => aiReady() && !usingFree();
const aiVision = () => aiReady() && !!prov().vision;
const aiLabel = () => usingFree() ? 'Didasko free (shared Gemini)' : `${prov().label.replace(/ \(.*\)$/, '')}${aiModel(false) && !['chrome', 'sample'].includes(prov().kind) ? ' · ' + aiModel(false) : ''}`;
function aiErr(status, msg) {
  const name = prov().label.replace(/ \(.*\)$/, '');
  if (status === 401 || status === 403) return `${name} rejected the API key, or it doesn’t have access to this model. Check Settings → AI model.`;
  if (status === 404) return `${name} couldn’t find the model “${aiModel(false)}”. Tap Refresh in Settings and pick another.`;
  if (status === 429) return `${name}’s rate limit or free quota was reached. Wait a minute, or pick a different model.`;
  if (status >= 500) return `${name} is busy right now. Try again in a moment.`;
  return msg ? `${name}: ${msg}` : `${name} returned an error (${status}).`;
}
async function readSSE(res, onData) {
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
        let ev; try { ev = JSON.parse(d); } catch { continue; }
        onData(ev);
      }
    }
  }
}
async function aiFetch(url, init, signal) {
  try { return await fetch(url, { ...init, signal }); }
  catch (e) {
    if (signal?.aborted) throw e;
    const p = prov();
    throw new Error(`Couldn’t reach ${p.label.replace(/ \(.*\)$/, '')}. Check your internet connection${p === PROVIDERS.ollama ? ', that Ollama is running, and that OLLAMA_ORIGINS allows this site' : ''}.`);
  }
}
async function failIfBad(res) {
  if (res.ok) return;
  let m = '';
  try { const j = await res.json(); m = j.error?.message || j.message || (Array.isArray(j) && j[0]?.error?.message) || ''; } catch { /* ignore */ }
  throw new Error(aiErr(res.status, m));
}
async function callAI({ system, user, images = [], maxTokens = 4000, fast = false, onText, signal, json = false }) {
  if (!aiReady()) throw new Error('NO_AI');
  const p = prov(), model = aiModel(fast), key = aiKey();
  const imgs = p.vision ? images.slice(0, 8) : [];
  if (p.kind === 'free') return callFree({ system, user, imgs, maxTokens, onText, signal, json });

  if (p.kind === 'anthropic') {
    const content = imgs.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.data } }));
    content.push({ type: 'text', text: user });
    const res = await aiFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }], stream: !!onText })
    }, signal);
    await failIfBad(res);
    if (!onText) { const j = await res.json(); return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''); }
    let text = '';
    await readSSE(res, ev => {
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') { text += ev.delta.text; onText(text); }
      else if (ev.type === 'error') throw new Error(ev.error?.message || 'The model stopped with an error.');
    });
    return text;
  }

  if (p.kind === 'openai') {
    let url, headers = { 'content-type': 'application/json' };
    if (p.azure) {
      const ep = S.settings.ai.azure.endpoint.replace(/\/+$/, '');
      if (/\/openai\/v1$/.test(ep)) url = `${ep}/chat/completions`;
      else url = `${ep}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(S.settings.ai.azure.apiVersion || '2024-10-21')}`;
      headers['api-key'] = key;
    } else {
      url = `${aiBase()}/chat/completions`;
      if (key) headers.Authorization = `Bearer ${key}`;
      if (S.settings.ai.provider === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Didasko'; }
    }
    const userContent = imgs.length ? [...imgs.map(im => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.data}` } })), { type: 'text', text: user }] : user;
    const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }], stream: !!onText };
    body[p.maxField || 'max_tokens'] = maxTokens;
    if (json && p.jsonMode) body.response_format = { type: 'json_object' };
    const res = await aiFetch(url, { method: 'POST', headers, body: JSON.stringify(body) }, signal);
    await failIfBad(res);
    if (!onText) { const j = await res.json(); return j.choices?.[0]?.message?.content || ''; }
    let text = '';
    await readSSE(res, ev => {
      if (ev.error) throw new Error(ev.error.message || 'The model stopped with an error.');
      const d = ev.choices?.[0]?.delta?.content; if (d) { text += d; onText(text); }
    });
    return text;
  }

  if (p.kind === 'gemini') {
    const parts = imgs.map(im => ({ inlineData: { mimeType: im.mime, data: im.data } }));
    parts.push({ text: user });
    const body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: Math.max(maxTokens * 2, 8192) } };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
    const res = await aiFetch(onText ? `${base}:streamGenerateContent?alt=sse` : `${base}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body)
    }, signal);
    await failIfBad(res);
    const pick = j => (j.candidates?.[0]?.content?.parts || []).filter(x => x.text && !x.thought).map(x => x.text).join('');
    if (!onText) { const j = await res.json(); const t = pick(j); if (!t && j.promptFeedback?.blockReason) throw new Error('Gemini declined this request (' + j.promptFeedback.blockReason + ').'); return t; }
    let text = '';
    await readSSE(res, ev => { const d = pick(ev); if (d) { text += d; onText(text); } });
    return text;
  }

  if (p.kind === 'chrome') {
    const LM = self.LanguageModel;
    const avail = await LM.availability().catch(() => 'unavailable');
    if (avail === 'unavailable') throw new Error('Chrome’s built-in model isn’t available on this device. Pick another AI model in Settings.');
    const session = await LM.create({ initialPrompts: [{ role: 'system', content: system }], monitor(m) { m.addEventListener('downloadprogress', e => toast(`Downloading Chrome’s on-device model… ${Math.round((e.loaded || 0) * 100)}%`, 4000)); } });
    let input = user;
    try {
      const quota = session.inputQuota || 6000, used = await session.measureInputUsage?.(input);
      if (used && used > quota * 0.85) { input = input.slice(0, Math.floor(input.length * (quota * 0.8) / used)) + '\n[…shortened to fit the on-device model]'; toast('This lecture was shortened to fit Chrome’s on-device model.', 4000); }
    } catch { /* older API */ }
    try {
      if (!onText) return await session.prompt(input, { signal });
      let text = '';
      const stream = session.promptStreaming(input, { signal });
      for await (const chunk of stream) { text = chunk.startsWith(text) && text ? chunk : text + chunk; onText(text); }
      return text;
    } finally { try { session.destroy(); } catch { /* ignore */ } }
  }

  if (p.kind === 'sample') {
    try {
      const r = await S.ai.sample(`${system}\n\n---\n\n${user}`, { onText: onText ? ({ text }) => onText(text) : undefined, signal, modelTier: fast ? 'quick' : 'default' });
      return r.text;
    } catch (e) {
      if (signal?.aborted) throw e;
      const c = e?.code;
      throw new Error(c === 'not_granted' ? 'Claude access wasn’t allowed for this page.' : c === 'rate_limited' ? 'Too many requests at once. Wait a moment and try again.' : (e?.message || 'Claude couldn’t finish that request.'));
    }
  }
  throw new Error('NO_AI');
}
const st_key = id => S.settings.ai.keys[id] || '';
async function listModels() {
  const id = S.settings.ai.provider, p = PROVIDERS[id], key = st_key(id);
  let ids = [];
  if (p.kind === 'anthropic') {
    const r = await aiFetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    await failIfBad(r); ids = (await r.json()).data.map(m => m.id);
  } else if (p.kind === 'gemini') {
    const r = await aiFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    await failIfBad(r); ids = (await r.json()).models.filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, '')).filter(m => /gemini|gemma/.test(m) && !/embedding|image|tts|audio|live/.test(m));
  } else if (p.kind === 'openai' && !p.azure) {
    const h = {}; if (key) h.Authorization = `Bearer ${key}`;
    const r = await aiFetch(`${aiBase()}/models`, { headers: h });
    await failIfBad(r); ids = ((await r.json()).data || []).map(m => m.id);
    if (id === 'openai') ids = ids.filter(m => /^(gpt|o\d|chatgpt)/.test(m) && !/audio|realtime|transcribe|tts|image|search|embedding|moderation|instruct/.test(m));
  } else return p.models;
  ids = [...new Set(ids)].sort();
  S.settings.ai.lists[id] = ids; saveSettings();
  return ids;
}

/* ---- Pictures (children's books). Gemini and OpenAI can paint images; other services fall back to AI-drawn SVG illustrations. ---- */
const IMAGE_MODELS = { gemini: 'gemini-2.5-flash-image', openai: 'gpt-image-1' };
function imageProvider() {
  if (!aiReady()) return null;
  const id = aiId(), p = prov();
  if (p.kind === 'gemini') return 'gemini';
  if (id === 'openai') return 'openai';
  return null;
}
const imageModel = () => (S.settings.ai.imageModels || {})[aiId()] || IMAGE_MODELS[imageProvider()] || '';
async function aiImage(prompt, signal) {
  const kind = imageProvider(), model = imageModel(), key = aiKey();
  if (!kind) throw new Error('This AI service can’t paint pictures.');
  if (kind === 'gemini') {
    const res = await aiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } })
    }, signal);
    await failIfBad(res);
    const j = await res.json();
    const part = (j.candidates?.[0]?.content?.parts || []).find(x => x.inlineData?.data || x.inline_data?.data);
    const d = part?.inlineData || part?.inline_data;
    if (!d) throw new Error(j.promptFeedback?.blockReason ? `Gemini declined this picture (${j.promptFeedback.blockReason}).` : 'Gemini didn’t return a picture.');
    return `data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`;
  }
  const body = { model, prompt, n: 1, size: '1024x1024' };
  if (/^dall-e/.test(model)) body.response_format = 'b64_json'; else body.quality = 'medium';
  const res = await aiFetch(`${aiBase()}/images/generations`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body) }, signal);
  await failIfBad(res);
  const j = await res.json(), d = j.data?.[0];
  if (d?.b64_json) return `data:image/png;base64,${d.b64_json}`;
  if (d?.url) return d.url;
  throw new Error('OpenAI didn’t return a picture.');
}

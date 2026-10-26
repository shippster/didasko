
/* ================= Basics ================= */
const BUILD = document.querySelector('meta[name="didasko:build"]')?.content || 'pwa';
const IS_ARTIFACT = BUILD === 'artifact';
const IN_FRAME = (() => { try { return window.top !== window; } catch { return true; } })();
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2, '0');
const fmtClock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };
const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const words = t => (String(t || '').match(/\S+/g) || []).length;
const fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const slug = s => String(s || 'lecture').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'lecture';
const icon = (id, extra = '') => `<svg class="i" ${extra}><use href="#i-${id}"/></svg>`;

const SRC_LANGS = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-AU', 'English (Australia)'], ['en-IN', 'English (India)'],
  ['es-US', 'Spanish (US)'], ['es-MX', 'Spanish (Mexico)'], ['es-ES', 'Spanish (Spain)'], ['fr-FR', 'French'], ['fr-CA', 'French (Canada)'],
  ['de-DE', 'German'], ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (Brazil)'], ['pt-PT', 'Portuguese (Portugal)'],
  ['zh-CN', 'Chinese (Mandarin)'], ['ja-JP', 'Japanese'], ['ko-KR', 'Korean'], ['ar-SA', 'Arabic'], ['hi-IN', 'Hindi'],
  ['ru-RU', 'Russian'], ['uk-UA', 'Ukrainian'], ['vi-VN', 'Vietnamese'], ['fil-PH', 'Filipino'], ['pl-PL', 'Polish'],
  ['nl-NL', 'Dutch'], ['tr-TR', 'Turkish'], ['sv-SE', 'Swedish'], ['he-IL', 'Hebrew'], ['id-ID', 'Indonesian']
];
const TGT_LANGS = [
  ['off', 'Off (captions only)'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'],
  ['zh', 'Chinese (Simplified)'], ['zh-Hant', 'Chinese (Traditional)'], ['ja', 'Japanese'], ['ko', 'Korean'], ['ar', 'Arabic'],
  ['hi', 'Hindi'], ['bn', 'Bengali'], ['ur', 'Urdu'], ['fa', 'Persian'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['vi', 'Vietnamese'],
  ['tl', 'Tagalog'], ['ht', 'Haitian Creole'], ['so', 'Somali'], ['sw', 'Swahili'], ['pl', 'Polish'], ['tr', 'Turkish'],
  ['ne', 'Nepali'], ['my', 'Burmese'], ['ps', 'Pashto'], ['en', 'English']
];
const RTL = new Set(['ar', 'ur', 'fa', 'he', 'ps']);
const tgtName = c => (TGT_LANGS.find(l => l[0] === c) || [c, c])[1];
const srcName = c => (SRC_LANGS.find(l => l[0] === c) || [c, c])[1].replace(/ \(.*\)/, '');
const srcBase = c => { const b = (c || 'en-US').split('-')[0]; return b === 'fil' ? 'tl' : b; };
const CAP_SIZES = [1.15, 1.4, 1.65, 1.9, 2.25, 2.7, 3.2, 3.8];
const AUDIENCE = { middle: 'middle school students (grades 6–8)', high: 'high school students (grades 9–12)', undergrad: 'undergraduate college students', grad: 'graduate or professional students' };

/* ================= Storage (IndexedDB with memory fallback) ================= */
const store = (() => {
  const mem = new Map();
  let dbp = null;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open('didasko', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  async function run(mode, fn) {
    try {
      const db = await open();
      return await new Promise((res, rej) => {
        const t = db.transaction('kv', mode); const req = fn(t.objectStore('kv'));
        t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    } catch { return undefined; }
  }
  return {
    async get(k) { const v = await run('readonly', s => s.get(k)); return v === undefined ? (mem.has(k) ? structuredClone(mem.get(k)) : undefined) : v; },
    async set(k, v) { mem.set(k, structuredClone(v)); await run('readwrite', s => s.put(v, k)); },
    async del(k) { mem.delete(k); await run('readwrite', s => s.delete(k)); }
  };
})();

/* ================= State ================= */
const guessSrc = () => { const n = navigator.language || 'en-US'; return (SRC_LANGS.find(l => l[0] === n) || SRC_LANGS.find(l => l[0].startsWith(n.split('-')[0])) || SRC_LANGS[0])[0]; };
const DEFAULT_SETTINGS = { srcLang: guessSrc(), tgtLang: 'off', engine: 'auto', capStep: 3, capMode: 'both', theme: 'system', lastLecture: null, lecturer: '', institution: '', ai: null };
const S = {
  settings: { ...DEFAULT_SETTINGS }, index: [], lecture: null, view: 'home',
  rec: { running: false, interim: '', interimTr: '', startedAt: 0, pendingKey: false },
  ai: { sample: null, downloads: null },
  ui: { notesTab: 'notes', notesEdit: false, quizMode: 'teacher', present: 0, revealed: false, practice: {} },
  installPrompt: null
};
function newLecture(title) {
  const now = Date.now();
  return { id: uid(), title: title || `Lecture · ${new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, course: '', createdAt: now, updatedAt: now, ms: 0, segments: [], notes: null, quiz: null, files: [] };
}
let saveTimer = null;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 600); }
async function saveNow() {
  clearTimeout(saveTimer);
  const L = S.lecture; if (!L) return;
  L.updatedAt = Date.now();
  await store.set(K('lec:' + L.id), L);
  const meta = lectureMeta(L);
  const i = S.index.findIndex(x => x.id === L.id);
  if (i >= 0) S.index[i] = meta; else S.index.unshift(meta);
  await store.set(K('index'), S.index);
  cloudSaveSoon(L);
  if (LIVE.code) liveMeta();
}
function lectureMeta(L) {
  return {
    id: L.id, title: L.title, course: L.course || '', createdAt: L.createdAt, updatedAt: L.updatedAt, ms: L.ms, words: speechWords(L),
    notes: L.notes?.md || L.notes?.book ? (L.notes.style || 'apa') : '', quiz: L.quiz?.questions?.length || 0, runs: L.quiz?.runs?.length || 0,
    files: L.files.length, keys: speechSegs(L).filter(s => s.key).length, sample: !!L.sample
  };
}
function saveSettings() { store.set('settings', S.settings); }
const speechSegs = L => L.segments.filter(s => s.kind === 'speech');
const speechWords = L => speechSegs(L).reduce((n, s) => n + words(s.text), 0);
const elapsed = () => (S.lecture?.ms || 0) + (S.rec.running ? Date.now() - S.rec.startedAt : 0);

/* ================= UI helpers ================= */
let toastTimer = null;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function openSheet(title, html, mount) {
  closeSheet();
  const root = $('#sheet-root');
  root.innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('close')}</button></div>${html}</div></div>`;
  const scrim = $('#scrim');
  scrim.addEventListener('click', e => { if (e.target === scrim || e.target.closest('[data-close]')) closeSheet(); });
  mount && mount(scrim.querySelector('.sheet'));
  const f = scrim.querySelector('input:not([type=checkbox]), textarea, select'); if (f && !matchMedia('(hover: none)').matches) f.focus();
}
function closeSheet() { $('#sheet-root').innerHTML = ''; }
function twoStep(btn, label, fn) {
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) { fn(); return; }
    const orig = btn.innerHTML; btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.innerHTML = orig; } }, 3500);
  });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch {
    openSheet('Copy text', `<p class="small muted" style="margin:0">Select all and copy.</p><label class="field"><textarea id="copy-area" style="min-height:40vh">${esc(text)}</textarea></label>`, sh => { const a = $('#copy-area', sh); a.focus(); a.select(); });
  }
}
async function saveFile(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  if (IS_ARTIFACT) {
    const dl = S.ai.downloads;
    if (!dl) { toast('Saving files needs the installed app.'); return; }
    try { await dl.save({ filename, data: blob }); toast(`Saved ${filename}`); }
    catch (e) { if (e?.code !== 'declined') toast(e?.code === 'rejected_extension' ? 'This file type can’t be saved from the preview.' : 'Couldn’t save the file here. Try the installed app.'); }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast(`Saved ${filename}`);
}
function printHtml(html) { $('#print-root').innerHTML = html; setTimeout(() => window.print(), 50); }
function loadScript(urls) {
  return urls.reduce((p, url) => p.catch(() => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = url; s.async = true;
    s.onload = () => res(url); s.onerror = () => { s.remove(); rej(new Error('load failed')); };
    document.head.appendChild(s);
  })), Promise.reject());
}
const LIBS = {
  pdf: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'],
  mammoth: ['https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js'],
  jszip: ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'],
  qr: ['https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js']
};
const libCache = {};
async function lib(name) {
  const g = { pdf: 'pdfjsLib', mammoth: 'mammoth', jszip: 'JSZip', qr: 'qrcode' }[name];
  if (window[g]) return window[g];
  if (!libCache[name]) libCache[name] = loadScript(LIBS[name]).then(url => {
    if (name === 'pdf') window.pdfjsLib.GlobalWorkerOptions.workerSrc = url.replace('pdf.min.js', 'pdf.worker.min.js');
    return window[g];
  }).catch(() => { delete libCache[name]; throw new Error('Couldn’t load the file reader. Connect to the internet once so Didasko can cache it.'); });
  return libCache[name];
}

/* ================= AI helpers ================= */
function stripFences(t) { return String(t || '').replace(/^\s*```(?:markdown|md)?\s*\n/i, '').replace(/\n```\s*$/, '').trim(); }
function parseJson(t) {
  const s = String(t || ''); const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('The AI’s answer wasn’t in the expected format. Try again.');
  return JSON.parse(s.slice(a, b + 1));
}

/* ================= Markdown: parse once, render to HTML or DOCX ================= */
function parseInline(s, f = {}) {
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+?\*\*|__[^_]+?__)|(\*[^*\s](?:[^*]*?[^*\s])?\*)|(^|[^\w])_([^_\s](?:[^_]*?[^_\s])?)_(?!\w)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ ...f, text: s.slice(last, m.index) });
    if (m[1]) out.push({ ...f, code: true, text: m[1].slice(1, -1) });
    else if (m[2]) out.push(...parseInline(m[2].slice(2, -2), { ...f, b: true }));
    else if (m[3]) out.push(...parseInline(m[3].slice(1, -1), { ...f, i: true }));
    else if (m[5] !== undefined) { if (m[4]) out.push({ ...f, text: m[4] }); out.push(...parseInline(m[5], { ...f, i: true })); }
    else if (m[6]) out.push(...parseInline(m[7], { ...f, href: m[8] }));
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ ...f, text: s.slice(last) });
  return out;
}
function runsHtml(runs) {
  return runs.map(r => {
    let h = esc(r.text);
    if (r.code) h = `<code>${h}</code>`;
    if (r.i) h = `<em>${h}</em>`;
    if (r.b) h = `<strong>${h}</strong>`;
    if (r.href) h = `<a href="${esc(r.href)}" target="_blank" rel="noopener">${h}</a>`;
    return h;
  }).join('');
}
const inl = s => runsHtml(parseInline(s));
function parseMd(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const blocks = []; let para = []; let i = 0;
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  while (i < lines.length) {
    const line = lines[i]; let m;
    if (/^\s*```/.test(line)) { flush(); const buf = []; i++; while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]); i++; blocks.push({ type: 'code', text: buf.join('\n') }); continue; }
    if (!line.trim()) { flush(); i++; continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flush(); blocks.push({ type: 'h', level: m[1].length, text: m[2].replace(/\s+#+\s*$/, '') }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push({ type: 'hr' }); i++; continue; }
    if (/^\s*>/.test(line)) { flush(); const buf = []; while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, '')); blocks.push({ type: 'quote', text: buf.join(' ') }); continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush();
      const row = l => l.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
      const head = row(line); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(row(lines[i++]));
      blocks.push({ type: 'table', head, rows }); continue;
    }
    if ((m = line.match(LIST))) {
      flush(); const items = [];
      while (i < lines.length) {
        const mm = lines[i].match(LIST);
        if (mm) { items.push({ indent: mm[1].replace(/\t/g, '    ').length, ordered: /\d/.test(mm[2]), text: mm[3] }); i++; }
        else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; }
        else break;
      }
      const indents = [...new Set(items.map(x => x.indent))].sort((a, b) => a - b);
      items.forEach(x => { x.level = indents.indexOf(x.indent); });
      blocks.push({ type: 'list', items }); continue;
    }
    para.push(line.trim()); i++;
  }
  flush();
  return blocks;
}
function listHtml(items) {
  let h = ''; const stack = [];
  for (const it of items) {
    while (stack.length > it.level + 1) h += `</li></${stack.pop()}>`;
    if (stack.length === it.level + 1 && stack[stack.length - 1] !== (it.ordered ? 'ol' : 'ul')) h += `</li></${stack.pop()}>`;
    else if (stack.length === it.level + 1) h += '</li>';
    while (stack.length < it.level + 1) { const t = it.ordered ? 'ol' : 'ul'; h += `<${t}>`; stack.push(t); }
    h += `<li>${inl(it.text)}`;
  }
  while (stack.length) h += `</li></${stack.pop()}>`;
  return h;
}
function mdToHtml(src) {
  return parseMd(src).map(b => {
    switch (b.type) {
      case 'h': return `<h${b.level}>${inl(b.text)}</h${b.level}>`;
      case 'p': return `<p>${inl(b.text)}</p>`;
      case 'hr': return '<hr>';
      case 'quote': return `<blockquote>${inl(b.text)}</blockquote>`;
      case 'code': return `<pre><code>${esc(b.text)}</code></pre>`;
      case 'list': return listHtml(b.items);
      case 'table': return `<div class="table-wrap"><table><thead><tr>${b.head.map(c => `<th>${inl(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${b.head.map((_, k) => `<td>${inl(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      default: return '';
    }
  }).join('\n');
}
const mdToText = src => parseMd(src).map(b => {
  const strip = s => parseInline(s).map(r => r.text).join('');
  if (b.type === 'list') return b.items.map(x => '  '.repeat(x.level) + (x.ordered ? '• ' : '– ') + strip(x.text)).join('\n');
  if (b.type === 'table') return [b.head, ...b.rows].map(r => r.map(strip).join(' | ')).join('\n');
  if (b.type === 'hr') return '—';
  if (b.type === 'h') return strip(b.text).toUpperCase();
  return strip(b.text || '');
}).join('\n\n');

/* ================= Speech recognition ================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, restartTimer = null, restarts = 0, wakeLock = null, tick = null;
async function grabWake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; } }
function startCaptions() {
  if (!SR || IS_ARTIFACT) { showNoSpeech(); return; }
  try {
    recog = new SR();
    recog.lang = S.settings.srcLang; recog.continuous = true; recog.interimResults = true; recog.maxAlternatives = 1;
    recog.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]; const t = r[0].transcript;
        if (r.isFinal) addSpeech(t); else interim += t;
      }
      restarts = 0; setInterim(interim);
    };
    recog.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { pauseCaptions(true); showMicBlocked(); }
      else if (e.error === 'audio-capture') { pauseCaptions(true); toast('No microphone was found. Plug one in or check your device’s sound settings.', 5000); }
      else if (e.error === 'language-not-supported') { pauseCaptions(true); toast(`This browser can’t caption ${srcName(S.settings.srcLang)}. Pick another speaking language.`, 5000); }
      else if (e.error === 'network') { toast('Captioning paused: this browser’s speech service needs an internet connection.', 4000); }
    };
    recog.onend = () => {
      if (!S.rec.running) return;
      if (S.rec.interim) { addSpeech(S.rec.interim); setInterim(''); }
      restarts++;
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => { if (S.rec.running) { try { recog.start(); } catch { /* already started */ } } }, Math.min(2500, 120 * restarts));
    };
    recog.start();
  } catch (e) { toast('Captions couldn’t start: ' + (e.message || e)); return; }
  S.rec.running = true; S.rec.startedAt = Date.now(); restarts = 0;
  grabWake();
  clearInterval(tick); tick = setInterval(renderClock, 1000);
  renderRecState(); renderCaptions();
}
function pauseCaptions(silent) {
  if (!S.rec.running) return;
  S.lecture.ms += Date.now() - S.rec.startedAt;
  S.rec.running = false;
  clearTimeout(restartTimer);
  if (S.rec.interim) { addSpeech(S.rec.interim); }
  setInterim('');
  try { recog && recog.stop(); } catch { /* ignore */ }
  recog = null;
  try { wakeLock && wakeLock.release(); } catch { /* ignore */ } wakeLock = null;
  clearInterval(tick);
  saveNow(); renderRecState(); renderClock();
  if (!silent) toast('Captions paused');
}
function toggleCaptions() {
  if (S.rec.running) { pauseCaptions(); return; }
  const tgt = target();
  if (tgt) engineFor(tgt).then(e => { if (e === 'device') deviceTranslator(srcBase(S.settings.srcLang), tgt); });
  startCaptions();
}
function tidy(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.charAt(0).toLocaleUpperCase() + t.slice(1);
}
function addSpeech(text, at) {
  const t = tidy(text); if (!t) return null;
  const seg = { id: uid(), kind: 'speech', t: at ?? elapsed(), text: t, tr: {}, key: false };
  if (S.rec.pendingKey) { seg.key = true; S.rec.pendingKey = false; }
  S.lecture.segments.push(seg);
  saveSoon(); renderCaptions(); renderStats(); if (S.view === 'notes' && S.ui.notesTab === 'transcript') renderTranscript();
  liveSeg(seg);
  queueTranslate(seg); if (LIVE.code) LIVE.langs.forEach(l => queueTranslate(seg, l));
  return seg;
}
function addTopic(text) {
  const t = tidy(text); if (!t) return;
  const seg = { id: uid(), kind: 'topic', t: elapsed(), text: t };
  S.lecture.segments.push(seg); liveSeg(seg);
  saveSoon(); renderCaptions(); toast(`New topic: ${t}`);
}
function markKey() {
  const segs = speechSegs(S.lecture); const last = segs[segs.length - 1];
  if (S.rec.interim || !last) { S.rec.pendingKey = true; toast('The next sentence will be marked as a key point'); }
  else { last.key = true; liveSeg(last); saveSoon(); toast('Marked as a key point'); }
  renderCaptions(); renderStats();
}

/* ================= Translation ================= */
const TR = { device: new Map(), queue: [], inflight: 0, engineCache: new Map() };
const target = () => S.settings.tgtLang === 'off' ? null : S.settings.tgtLang;
async function engineFor(tgt) {
  const src = srcBase(S.settings.srcLang);
  if (!tgt || tgt === src) return null;
  const key = `${S.settings.engine}|${src}|${tgt}|${ownAiReady()}|${S.settings.ai.provider}`;
  if (TR.engineCache.has(key)) return TR.engineCache.get(key);
  let eng = null;
  if (S.settings.engine !== 'ai' && 'Translator' in self) {
    try { const a = await self.Translator.availability({ sourceLanguage: src, targetLanguage: tgt }); if (a && a !== 'unavailable') eng = 'device'; } catch { /* unsupported pair */ }
  }
  if (!eng && S.settings.engine !== 'device' && ownAiReady()) eng = 'ai';
  TR.engineCache.set(key, eng);
  return eng;
}
function deviceTranslator(src, tgt) {
  const key = src + '>' + tgt;
  if (!TR.device.has(key)) {
    const p = self.Translator.create({
      sourceLanguage: src, targetLanguage: tgt,
      monitor(m) { m.addEventListener('downloadprogress', e => setEngineNote(`Downloading the ${tgtName(tgt)} language pack for on-device translation… ${Math.round((e.loaded || 0) * 100)}%`)); }
    }).then(t => { renderEngineNote(); return t; });
    p.catch(() => TR.device.delete(key));
    TR.device.set(key, p);
  }
  return TR.device.get(key);
}
async function translateText(text, tgt, context = []) {
  const eng = await engineFor(tgt);
  if (eng === 'device') {
    try { const t = await deviceTranslator(srcBase(S.settings.srcLang), tgt); return await t.translate(text); }
    catch (e) { if (!ownAiReady() || S.settings.engine === 'device') throw e; }
  }
  if (eng === 'ai' || eng === 'device') {
    const ctx = context.length ? `Earlier captions, for context only (do not translate these):\n${context.join('\n')}\n\n` : '';
    const out = await callAI({
      fast: true, maxTokens: 600,
      system: `You translate live classroom captions from ${srcName(S.settings.srcLang)} into ${tgtName(tgt)} for students. The caption comes from speech recognition and may contain small errors: translate the intended meaning. Keep subject terminology accurate. Reply with the translation only — no quotes, notes or alternatives.`,
      user: `${ctx}Caption to translate:\n${text}`
    });
    return out.trim().replace(/^["“]|["”]$/g, '');
  }
  throw new Error('NO_ENGINE');
}
function queueTranslate(seg, tgt = target()) {
  if (!tgt || seg.kind !== 'speech' || seg.tr?.[tgt]) return;
  TR.queue.push([seg, tgt]); pumpTranslate();
}
function pumpTranslate() {
  while (TR.inflight < 3 && TR.queue.length) {
    const [seg, tgt] = TR.queue.shift(); TR.inflight++;
    const segs = speechSegs(S.lecture); const idx = segs.indexOf(seg);
    const ctx = segs.slice(Math.max(0, idx - 2), idx).map(s => s.text);
    translateText(seg.text, tgt, ctx).then(t => {
      seg.tr = seg.tr || {}; seg.tr[tgt] = t; saveSoon(); updateCapTr(seg, tgt); liveTr(seg, tgt, t);
      if (S.view === 'notes' && S.ui.notesTab === 'transcript') renderTranscript();
    }).catch(e => {
      if (e.message !== 'NO_ENGINE' && e.message !== 'NO_AI') { if (!TR.warned) { TR.warned = true; toast(`Translation: ${e.message}`, 4000); setTimeout(() => { TR.warned = false; }, 20000); } }
    }).finally(() => { TR.inflight--; pumpTranslate(); });
  }
}
let interimTrTimer = null, interimTrBusy = false;
function setInterim(text) {
  S.rec.interim = tidy(text);
  liveInterim(S.rec.interim);
  if (!S.rec.interim) S.rec.interimTr = '';
  renderInterim();
  const tgt = target();
  if (!tgt || !S.rec.interim || interimTrTimer) return;
  interimTrTimer = setTimeout(async () => {
    interimTrTimer = null;
    if (interimTrBusy || !S.rec.interim) return;
    if (await engineFor(tgt) !== 'device') return; // live preview only with on-device translation (free and instant)
    interimTrBusy = true;
    try { const tr = await (await deviceTranslator(srcBase(S.settings.srcLang), tgt)).translate(S.rec.interim); if (S.rec.interim) { S.rec.interimTr = tr; renderInterim(); } }
    catch { /* ignore */ } finally { interimTrBusy = false; }
  }, 700);
}

/* ================= Rendering: shell ================= */
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'system') { if (!IS_ARTIFACT) delete document.documentElement.dataset.theme; }
  else document.documentElement.dataset.theme = t;
}
function renderHeader() {
  const L = S.lecture;
  $('#lecture-title').textContent = L.title || 'Untitled lecture';
  $('#lecture-meta').textContent = [L.course, fmtDate(L.createdAt)].filter(Boolean).join(' · ');
  document.title = IS_ARTIFACT ? 'Didasko' : `${L.title} · Didasko`;
}
function renderRecState() {
  const run = S.rec.running, b = $('#btn-rec');
  b.classList.toggle('running', run);
  b.innerHTML = run ? `${icon('pause')}<span>Pause</span>` : `${icon('mic')}<span>${S.lecture.ms ? 'Resume captions' : 'Start captions'}</span>`;
  $('#btn-key').disabled = !run && !speechSegs(S.lecture).length;
  $('#fs-rec').innerHTML = icon(run ? 'pause' : 'mic');
  renderClock();
}
function renderClock() {
  const pill = $('#status-pill'), run = S.rec.running, ms = elapsed();
  pill.classList.toggle('live', run); pill.classList.toggle('paused', !run && ms > 0);
  $('#status-text').textContent = run ? `LIVE ${fmtClock(ms)}` : ms > 0 ? `Paused ${fmtClock(ms)}` : 'Ready';
  $('#st-time').textContent = fmtClock(ms);
  $('#fs-status').textContent = run ? `● LIVE ${fmtClock(ms)}` : 'Paused';
}
function renderStats() {
  const L = S.lecture;
  $('#st-words').textContent = speechWords(L).toLocaleString();
  $('#st-keys').textContent = speechSegs(L).filter(s => s.key).length;
  $('#btn-key').disabled = !S.rec.running && !speechSegs(L).length;
}
function renderBadges() {
  const q = S.lecture.quiz?.questions?.length || 0, f = S.lecture.files.length;
  $('#quiz-badge').hidden = !q; $('#quiz-badge').textContent = q;
  $('#files-badge').hidden = !f; $('#files-badge').textContent = f;
}
function showView(v) {
  S.view = v;
  ['home', 'live', 'notes', 'quiz', 'files'].forEach(x => { $('#view-' + x).hidden = x !== v; $('#tab-' + x).setAttribute('aria-selected', String(x === v)); });
  document.body.dataset.view = v;
  if (v === 'home') renderHome();
  if (v === 'notes') renderNotesArea();
  if (v === 'quiz') renderQuiz();
  if (v === 'files') renderFiles();
  window.scrollTo({ top: 0 });
}

/* ================= Rendering: captions =================
   The stage shows a rolling window of exactly two lines, like broadcast captions. Everything is still kept in the transcript. */
const CAP_TAIL = 4; // recent sentences fed into the window; only the last two visual lines are visible
function capStream(tgt) {
  const segs = speechSegs(S.lecture).slice(-CAP_TAIL);
  const orig = segs.map(s => s.text).concat(S.rec.interim ? [S.rec.interim] : []).join(' ');
  const tr = tgt ? segs.map(s => s.tr?.[tgt] || '').filter(Boolean).concat(S.rec.interimTr ? [S.rec.interimTr] : []).join(' ') : '';
  const pendingTr = !!tgt && segs.length > 0 && !segs[segs.length - 1].tr?.[tgt];
  return { orig, tr, pendingTr };
}
function renderCaptions() {
  const box = $('#captions'), tgt = target();
  const mode = tgt ? S.settings.capMode : 'original';
  const { orig, tr, pendingTr } = capStream(tgt);
  let html = '';
  if (mode !== 'translation') html += `<div class="cap-win cap-o-win" aria-label="Captions"><p>${esc(orig)}</p></div>`;
  if (tgt && mode !== 'original') html += `<div class="cap-win cap-t-win ${!tr && pendingTr ? 'pending' : ''}" dir="${RTL.has(tgt) ? 'rtl' : 'auto'}" lang="${esc(tgt)}"><p>${esc(tr || (pendingTr ? '…' : ''))}</p></div>`;
  if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
  box.className = 'captions two-line mode-' + mode;
  $('#stage-empty').hidden = !!orig || S.rec.running;
}
function renderInterim() { renderCaptions(); }
function updateCapTr(seg, tgt) { if (tgt === target()) renderCaptions(); }
function renderStageMeta() {
  const tgt = target();
  const src = srcBase(S.settings.srcLang).toUpperCase();
  $('#stage-lang').innerHTML = tgt ? `${esc(src)} → <b>${esc(tgt.toUpperCase())}</b>` : esc(src);
  document.documentElement.style.setProperty('--cap-size', CAP_SIZES[S.settings.capStep] + 'rem');
  const mb = $('#mode-btn'); mb.hidden = !tgt;
  const labels = { both: ['⇅', 'Showing original and translation'], translation: ['T', 'Showing translation only'], original: ['O', 'Showing original only'] };
  const [txt, lab] = labels[S.settings.capMode] || labels.both;
  mb.textContent = txt; mb.title = lab; mb.setAttribute('aria-label', lab);
}
function setEngineNote(html, warn) { const n = $('#engine-note'); n.innerHTML = html; n.classList.toggle('warn', !!warn); }
async function renderEngineNote() {
  const tgt = target();
  let speech;
  if (IS_ARTIFACT) speech = `<b>Preview mode.</b> The microphone is off inside this preview, so live captions run only in the installed app. Everything else works here — try it with the sample lecture.`;
  else if (!SR) speech = `<b>This browser can’t caption from the microphone.</b> Use Chrome, Edge or Safari, or type and import lines instead.`;
  else speech = `Captions use this browser’s speech recognition${/Chrome|Edg/.test(navigator.userAgent) && !/iPhone|iPad/.test(navigator.userAgent) ? ' (Chrome and Edge send audio to their speech service)' : ''}.`;
  let tr = '';
  if (tgt) {
    const eng = await engineFor(tgt);
    tr = eng === 'device' ? ` Translating to <b>${esc(tgtName(tgt))}</b> on this device.`
      : eng === 'ai' ? ` Translating to <b>${esc(tgtName(tgt))}</b> with ${esc(prov().label.replace(/ \(.*\)$/, ''))}${aiModel(true) && prov().key ? ` (${esc(aiModel(true))})` : ''}.`
      : ` <b>No translator is available for ${esc(tgtName(tgt))}.</b> Choose an AI model in Settings, or use Chrome on a desktop for on-device translation.`;
    setEngineNote(speech + tr, !eng || (!SR && !IS_ARTIFACT));
  } else setEngineNote(speech, !SR && !IS_ARTIFACT);
}
function showNoSpeech() {
  openSheet('Live captions aren’t available here', `
    <p style="margin:0">${IS_ARTIFACT ? 'This preview can’t use the microphone. Install Didasko from your own web address to caption live lectures.' : 'This browser doesn’t support speech recognition. Chrome, Edge (desktop and Android) and Safari (Mac, iPhone, iPad) do.'}</p>
    <p class="muted small" style="margin:0">You can still type lines as you go, or import a transcript or caption file (.txt, .vtt, .srt) from another tool.</p>
    <div class="row"><button class="btn primary" id="ns-type">${icon('edit')}Type a line</button><button class="btn" id="ns-import">${icon('upload')}Import transcript</button></div>`,
    sh => { $('#ns-type', sh).onclick = openTypeSheet; $('#ns-import', sh).onclick = openImportSheet; });
}
function showMicBlocked() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  openSheet('Microphone access is off', `
    <p style="margin:0">Didasko needs the microphone to caption your lecture.</p>
    <ul class="small" style="margin:0;padding-left:1.2em">
      ${ios ? '<li>Open <b>Settings → Safari → Microphone</b> (or Settings → Didasko) and choose <b>Allow</b>.</li><li>Also check <b>Settings → Privacy & Security → Speech Recognition</b>.</li>' : '<li>Click the icon at the left of the address bar, set <b>Microphone</b> to <b>Allow</b>, then reload.</li><li>On Android: <b>Settings → Apps → Chrome → Permissions → Microphone</b>.</li>'}
    </ul>
    <div class="row"><button class="btn primary" data-close>OK</button></div>`);
}

/* ================= Projector mode ================= */
function toggleProjector() {
  const st = $('#stage');
  if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
  if (st.classList.contains('projector')) { st.classList.remove('projector'); return; }
  if (st.requestFullscreen) st.requestFullscreen().catch(() => st.classList.add('projector'));
  else st.classList.add('projector');
}

/* ================= Notes ================= */
function transcriptForPrompt(L) {
  return L.segments.map(s => s.kind === 'topic' ? `\n== TOPIC: ${s.text} ==` : `[${fmtClock(s.t)}]${s.key ? ' ★KEY POINT:' : ''} ${s.text}`).join('\n').trim();
}
function materials(flag, budget = 90000) {
  const fs = S.lecture.files.filter(f => f[flag]);
  const textFiles = fs.filter(f => f.text);
  const per = textFiles.length ? Math.floor(budget / textFiles.length) : 0;
  const text = textFiles.map(f => `<material name="${f.name}">\n${f.text.length > per ? f.text.slice(0, per) + '\n[…truncated]' : f.text}\n</material>`).join('\n\n');
  const images = aiVision() ? fs.filter(f => f.image).map(f => ({ mime: 'image/jpeg', data: f.image.split(',')[1], name: f.name })) : [];
  return { text, images, names: fs.map(f => f.name) };
}
function lectureHeader(L) {
  return `Lecture title: ${L.title}\nCourse: ${L.course || '(not given)'}\nDate: ${fmtDate(L.createdAt)}\nRecorded length: ${fmtClock(L.ms || (speechSegs(L).slice(-1)[0]?.t || 0))}`;
}
function renderNotesArea() {
  const t = S.ui.notesTab;
  $('#nv-notes').setAttribute('aria-pressed', String(t === 'notes'));
  $('#nv-transcript').setAttribute('aria-pressed', String(t === 'transcript'));
  $('#notes-pane').hidden = t !== 'notes'; $('#transcript-pane').hidden = t !== 'transcript';
  $('#notes-tools').hidden = t !== 'notes';
  if (t === 'notes') renderNotes(); else renderTranscript();
}
function renderTranscript() {
  const L = S.lecture, tgt = target(), box = $('#transcript');
  const n = speechSegs(L).length;
  $('#transcript-count').textContent = `${n} lines · ${speechWords(L).toLocaleString()} words · ${fmtClock(L.ms)}`;
  $('#tr-translate').hidden = !tgt;
  if (!L.segments.length) { box.innerHTML = `<div class="empty"><h3>The transcript is empty</h3><p>Captured captions appear here as you teach.</p></div>`; return; }
  box.innerHTML = L.segments.map(s => `<div class="tline ${s.kind === 'topic' ? 'topic' : ''} ${s.key ? 'key' : ''}" data-id="${s.id}">
      <time>${fmtClock(s.t)}</time>
      <div class="grow"><div class="tx" contenteditable="true" spellcheck="true">${esc(s.text)}</div>${tgt && s.tr?.[tgt] ? `<div class="tr" dir="auto">${esc(s.tr[tgt])}</div>` : ''}</div>
      <div class="row" style="gap:2px">${s.kind === 'speech' ? `<button class="tbtn" data-act="key" aria-label="${s.key ? 'Unmark' : 'Mark'} key point" title="Key point">${icon('star', s.key ? 'style="fill:currentColor;color:var(--warn)"' : '')}</button>` : ''}<button class="tbtn" data-act="del" aria-label="Delete line" title="Delete line">${icon('trash')}</button></div>
    </div>`).join('');
}
const STOP = new Set('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just let like me more most my no nor not now of off on once only or other our ours out over own really right same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours okay ok yeah gonna kind sort thing things going get got know see say said one two three first second next way lot little well want think make made today everyone remember plus minus times okay so basically actually means mean called call use used using look let’s let\'s we\'ll we’re we\'re it\'s that\'s'.split(' '));
function keyTerms(text, n = 12) {
  const toks = (String(text).toLowerCase().match(/[\p{L}][\p{L}\p{N}'’-]{2,}/gu) || []);
  const f = new Map(), bi = new Map();
  toks.forEach((t, i) => {
    if (STOP.has(t) || t.length < 4) return;
    f.set(t, (f.get(t) || 0) + 1);
    const nx = toks[i + 1]; if (nx && !STOP.has(nx) && nx.length > 3) { const k = t + ' ' + nx; bi.set(k, (bi.get(k) || 0) + 1); }
  });
  const scored = [...[...bi].filter(([, c]) => c >= 2).map(([k, c]) => [k, c * 2.2]), ...[...f].map(([k, c]) => [k, c * (k.length > 7 ? 1.3 : 1)])];
  scored.sort((a, b) => b[1] - a[1]);
  const out = [];
  for (const [k] of scored) { if (out.length >= n) break; if (out.some(o => o.includes(k) || k.includes(o))) continue; out.push(k); }
  return out;
}
function sentencesOf(text) {
  const parts = (String(text).match(/[^.!?]+(?:[.!?]+|$)/g) || []).map(s => s.trim()).filter(Boolean);
  const out = [];
  parts.forEach(p => { const w = p.split(/\s+/); if (w.length <= 32) out.push(tidy(p)); else for (let i = 0; i < w.length; i += 22) out.push(tidy(w.slice(i, i + 22).join(' '))); });
  return out;
}

/* ================= Quiz (formative assessment) =================
   Design principles (Black & Wiliam; Wiliam's hinge questions; Hattie & Timperley on feedback):
   - questions ask students to explain, apply and analyze, not to recall a word from a sentence;
   - every distractor is a known misconception, so a wrong answer tells the teacher *what* to reteach;
   - feedback is specific to the option chosen and says how to close the gap;
   - students rate their confidence, and the class reflects at the end (exit ticket). */
const LEVELS = {
  mixed: 'mostly Understand, Apply and Analyze: about a quarter explain-why or compare questions, half applying an idea to a new example or scenario, and a quarter analyzing data, a claim or a prediction. At most one question may check a single essential definition',
  hinge: 'hinge questions: each targets one important idea where students commonly go wrong, and every distractor is a specific, well-documented misconception, so the class\'s answer pattern shows the teacher exactly what to reteach',
  transfer: 'mostly Apply and Analyze: put the lecture\'s ideas to work in situations the lecture did not mention — new scenarios, cases, data, or "what would happen if…" predictions',
  understand: 'mostly Understand: ask students to recognize the best paraphrase, the best explanation of why something happens, the best example or non-example, or how two ideas relate — never to recall an exact word or phrase'
};
const DEFAULT_REFLECTION = 'What is one idea from today you could now explain to a classmate, and one thing you are still unsure about?';
let quizBusy = false;
async function generateQuiz() {
  const L = S.lecture;
  if (!speechSegs(L).length && !L.files.some(f => f.useQuiz && f.text)) { toast('Record a lecture or add files first.'); return; }
  const n = +$('#quiz-count').value, level = $('#quiz-level').value, lv = $('#quiz-lang').value, qtype = $('#quiz-type').value;
  const lang = lv === 'src' ? srcName(S.settings.srcLang) : tgtName(lv);
  const useFiles = $('#quiz-use-files').checked, keyFocus = $('#quiz-key-focus').checked;
  if (!aiReady() && !S.ui.localQuizOk) {
    openAiSetupSheet('Scenario and misconception questions are written by an AI model. No AI model is connected on this device yet.', () => generateQuiz(), { label: 'Build simple checks without AI', run: () => { S.ui.localQuizOk = true; generateQuiz(); S.ui.localQuizOk = false; } });
    return;
  }
  if (!aiReady()) {
    try { L.quiz = { questions: buildLocalQuiz(L, useFiles, n, qtype), reflection: DEFAULT_REFLECTION, local: true, at: Date.now() }; S.ui.practice = {}; saveSoon(); renderQuiz(); renderBadges(); toast('Simple concept checks built on this device'); }
    catch (e) { toast(e.message, 4500); }
    return;
  }
  const mat = useFiles ? materials('useQuiz') : { text: '', images: [], names: [] };
  const TYPE_RULES = {
    mc: '- Every question is multiple choice with exactly 4 options and exactly one correct answer ("type":"mc").\n- Spread the correct answer across positions A–D.',
    tf: '- Every question is a true/false statement ("type":"tf") whose options are exactly ["True","False"]; "answer" is 0 when the statement is true and 1 when it is false.\n- Each statement is a claim a student might plausibly make; false ones express a real misconception, never a trivial word swap. Avoid double negatives and give-away absolutes ("always", "never").',
    mix: '- About two-thirds of the questions are multiple choice with exactly 4 options ("type":"mc"); the rest are true/false claims ("type":"tf") whose options are exactly ["True","False"], with "answer" 0 for true and 1 for false. False claims express real misconceptions.\n- Spread multiple-choice answers across positions A–D.'
  };
  let system = `You are an expert in formative assessment. You write short concept checks that a teacher uses during or right after a lecture to find out what students understand and what to reteach, following research-based practice (Black & Wiliam's assessment for learning, Wiliam's hinge questions, Hattie & Timperley's feedback model).
Rules:
- Write exactly ${n} questions, in ${lang}, for ${AUDIENCE[$('#notes-audience').value] || 'students'}.
- Focus: ${LEVELS[level] || LEVELS.mixed}.
${TYPE_RULES[qtype] || TYPE_RULES.mc}
- Never write fill-in-the-blank, cloze or "which word completes the sentence" items, and never ask for a word, name, number or date quoted from the lecture. Ask students to explain, predict, compare, classify, apply, or evaluate a claim.
- Prefer stems that present a short scenario, example, data point, or a classmate's claim ("A student says… What is the best response?").
- Each wrong option is a plausible misconception or partial understanding a real student would hold — not a joke or an obviously wrong choice. Never "all of the above" or "none of the above". Keep options similar in length and grammar so the answer can't be guessed from form.
- Stems are self-contained, clear and fair; no trick wording or double negatives.
- Base every question only on the transcript and the materials. The transcript comes from speech recognition, so ignore obvious recognition errors.
- Cover the lecture's most important ideas${mat.text ? ', and include some questions that draw on the materials' : ''}.${keyFocus ? '\n- Every line marked ★KEY POINT must be assessed by at least one question.' : ''}
For each question return:
"type"; "stem"; "options" (array of strings, no letter prefixes); "answer" (index of the correct option);
"feedback" (array, one string per option, same order, 1–2 sentences each: for the correct option say why it is right; for each wrong option name the misconception it reveals and give a hint that moves the student toward the right idea — specific, kind, and without simply restating the answer);
"explanation" (1–2 sentences the teacher can say after revealing the answer);
"reflect" (one short open reflection or turn-and-talk prompt that asks students to explain their reasoning or connect the idea to something new);
"source" (a transcript timestamp like "Lecture 12:40", or the material's file name); "level" (Understand, Apply, Analyze or Evaluate).
Also return "reflection": one exit-ticket question for the end of the quiz that asks students to reflect on their own learning about today's topic.
Reply with JSON only, in this shape: {"questions":[{"type":"mc","stem":"","options":["","","",""],"answer":0,"feedback":["","","",""],"explanation":"","reflect":"","source":"","level":""}],"reflection":""}`;
  const noTr = !speechSegs(L).length;
  const user = `${lectureHeader(L)}\n\n<transcript>\n${noTr ? '(none — write every question from the materials)' : transcriptForPrompt(L)}\n</transcript>${mat.text ? `\n\n<materials>\n${mat.text}\n</materials>` : ''}`;
  if (noTr) system += '\nThere is no lecture transcript for this session: base every question on the materials, and use the material’s file name as "source".';
  quizBusy = true; setQuizBusy(true);
  try {
    const text = await callAI({
      system, user, images: mat.images, maxTokens: 12000, json: true,
      onText: t => { const k = (t.match(/"stem"\s*:/g) || []).length; $('#quiz-status-text').textContent = k ? `Writing question ${Math.min(k, n)} of ${n}…` : 'Reading the lecture…'; }
    });
    const j = parseJson(text);
    const qs = normalizeQuestions(j.questions);
    if (!qs.length) throw new Error('The AI didn’t return any usable questions. Try again.');
    L.quiz = { questions: qs, at: Date.now(), lang, type: qtype, level, reflection: String(j.reflection || '').trim() || DEFAULT_REFLECTION };
    S.ui.practice = {};
    toast(`${qs.length} questions ready`);
  } catch (e) { toast(e.message, 5000); }
  finally { quizBusy = false; setQuizBusy(false); saveSoon(); renderQuiz(); renderBadges(); }
}
function normalizeQuestions(arr) {
  return (Array.isArray(arr) ? arr : []).map(q => {
    let options = (q.options || []).map(o => String(o).replace(/^\s*[A-D][.)]\s+/, '').trim()).slice(0, 4);
    const tf = q.type === 'tf' || (options.length === 2 && /^(true|verdadero|vrai|wahr|vero|verdadeiro)$/i.test(options[0]));
    if (tf && options.length !== 2) options = ['True', 'False'];
    let answer = Number.isInteger(q.answer) ? q.answer : typeof q.answer === 'boolean' ? (q.answer ? 0 : 1) : /^(true|t)$/i.test(String(q.answer)) ? 0 : /^(false|f)$/i.test(String(q.answer)) ? 1 : 'ABCD'.indexOf(String(q.answer || '').trim().toUpperCase()[0]);
    const fb = Array.isArray(q.feedback) ? q.feedback.map(x => String(x || '').trim()) : [];
    const feedback = options.map((_, k) => fb[k] || '');
    return { id: q.id || uid(), type: tf ? 'tf' : 'mc', stem: String(q.stem || '').trim(), options, answer, feedback, explanation: String(q.explanation || '').trim(), reflect: String(q.reflect || '').trim(), source: String(q.source || '').trim(), level: String(q.level || '').trim() };
  }).filter(q => q.stem && q.options.length === (q.type === 'tf' ? 2 : 4) && q.answer >= 0 && q.answer < q.options.length);
}
const optLetter = (q, k) => q.type === 'tf' ? (k ? 'F' : 'T') : 'ABCD'[k];
function setQuizBusy(on) {
  $('#quiz-status').hidden = !on; $('#quiz-generate').disabled = on;
  if (on) { $('#quiz-status-text').textContent = 'Reading the lecture…'; $('#quiz-list').innerHTML = ''; $('#quiz-bar').hidden = true; }
}
/* ---- On-device concept checks (no AI) ----
   No fill-in-the-blank: each item asks which claim about a key idea is accurate. The distractors are real statements from
   the lecture about *other* ideas, re-attached to this one — the classic "confusing two related concepts" error — and the
   feedback for each says which idea the statement actually describes. */
const FILLER = /^(?:(?:okay|ok|so|and|but|um+|uh+|well|now|right|alright|all right|yeah|like|you know|basically|actually|remember|everyone|everybody|guys|folks|let'?s|let’s)[\s,]+)+/i;
function cleanSpoken(t) {
  let x = String(t || '').replace(/\b(um+|uh+|you know|kind of|sort of)\b,?\s*/gi, '').replace(/\s{2,}/g, ' ').trim();
  x = x.replace(FILLER, '').replace(/^(?:get started,?\s*)/i, '');
  return endDot(tidy(x));
}
function buildLocalQuiz(L, useFiles, n, qtype = 'mc') {
  const segs = speechSegs(L);
  const corpus = segs.map(s => s.text).concat(useFiles ? L.files.filter(f => f.useQuiz && f.text).map(f => f.text) : []).join('. ');
  const terms = keyTerms(corpus, 40).filter(t => t.length > 5 || t.includes(' '));
  if (terms.length < 4) throw new Error('There isn’t enough lecture content yet to build questions. Record more, or choose an AI model in Settings.');
  const pool = [...segs.filter(s => s.key), ...segs.filter(s => !s.key)].flatMap(s => sentencesOf(s.text).map(t => ({ t: cleanSpoken(t), src: `Lecture ${fmtClock(s.t)}` })));
  if (useFiles) L.files.filter(f => f.useQuiz && f.text).forEach(f => sentencesOf(f.text.replace(/\n+/g, '. ')).forEach(t => pool.push({ t: cleanSpoken(t), src: f.name })));
  const reTerm = k => new RegExp(`(?<![\\p{L}\\p{N}-])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}-])`, 'iu');
  const swap = (t, from, to) => t.replace(reTerm(from), (m, off) => off === 0 ? to.charAt(0).toUpperCase() + to.slice(1) : to);
  const ok = p => { const w = words(p.t); return w >= 7 && w <= 38; };
  const facts = pool.filter(ok).map(p => ({ ...p, term: terms.find(k => reTerm(k).test(p.t)) })).filter(p => p.term);
  const REFLECT = [
    k => `In one or two sentences, explain “${k}” to a classmate who missed class.`,
    k => `What is an example of “${k}” that the lecture didn’t mention? Why does it fit?`,
    (k, k2) => `How is “${k}” connected to “${k2}”? Explain your reasoning to a partner.`,
    k => `What would change if “${k}” didn’t happen or didn’t exist?`
  ];
  const STEMS = [k => `Which statement about “${k}” is accurate, according to the lecture?`, k => `A classmate is studying “${k}”. Which of their notes is correct?`, k => `Which claim about “${k}” would your teacher agree with?`];
  const used = new Set(), qs = [];
  for (const f of facts) {
    if (qs.length >= n) break;
    if (used.has(f.term)) continue;
    const others = facts.filter(o => o.term !== f.term && !reTerm(f.term).test(o.t));
    const k2 = others[0]?.term || terms.find(t => t !== f.term);
    const reflect = REFLECT[qs.length % REFLECT.length](f.term, k2);
    const asTF = qtype === 'tf' || (qtype === 'mix' && qs.length % 3 === 2);
    if (asTF) {
      const o = Math.random() < .5 ? others[Math.floor(Math.random() * others.length)] : null;
      const stmt = o ? swap(o.t, o.term, f.term) : f.t;
      qs.push({ id: uid(), type: 'tf', stem: `True or false: ${stmt}`, options: ['True', 'False'], answer: o ? 1 : 0,
        feedback: o ? [`Look again: this describes “${o.term}”, not “${f.term}” (${o.src}). Mixing up related ideas is a common slip — what makes them different?`, `Right — the lecture said this about “${o.term}”, not “${f.term}” (${o.src}).`]
          : [`Right — the lecture made this point about “${f.term}” (${f.src}).`, `This one is true: the lecture said it about “${f.term}” (${f.src}). Which part made you doubt it?`],
        explanation: o ? `The lecture said: “${o.t}” That is about ${o.term}.` : `From the lecture: “${f.t}”`, reflect, source: f.src, level: 'Understand' });
      used.add(f.term); continue;
    }
    const picks = []; const seenT = new Set([f.term]);
    for (const o of others.sort(() => Math.random() - .5)) { if (picks.length >= 3) break; if (seenT.has(o.term)) continue; seenT.add(o.term); picks.push(o); }
    if (picks.length < 3) continue;
    const opts = [{ text: f.t, ok: true, src: f.src }, ...picks.map(o => ({ text: swap(o.t, o.term, f.term), ok: false, about: o.term, src: o.src }))].sort(() => Math.random() - .5);
    qs.push({ id: uid(), type: 'mc', stem: STEMS[qs.length % STEMS.length](f.term), options: opts.map(o => o.text), answer: opts.findIndex(o => o.ok),
      feedback: opts.map(o => o.ok ? `Yes — this is what the lecture said about “${f.term}” (${o.src}).` : `This is really a statement about “${o.about}” (${o.src}). How are “${o.about}” and “${f.term}” different?`),
      explanation: `From the lecture: “${f.t}” The other options describe ${picks.map(p => p.term).join(', ')}.`, reflect, source: f.src, level: 'Understand' });
    used.add(f.term);
  }
  if (qs.length < 2) throw new Error('There isn’t enough lecture content yet to build questions. Record more, or choose an AI model in Settings.');
  return qs;
}
function renderQuiz() {
  const Q = S.lecture.quiz, list = $('#quiz-list');
  const n = Q?.questions?.length || 0;
  $('#quiz-bar').hidden = !n || quizBusy;
  $('#quiz-generate span').textContent = n ? 'Generate a new quiz' : 'Generate quiz';
  const mat = S.lecture.files.filter(f => f.useQuiz).length;
  $('#quiz-chip').textContent = mat ? `${mat} file${mat > 1 ? 's' : ''} included` : 'Lecture only';
  if (quizBusy) return;
  if (!n) { list.innerHTML = `<div class="panel empty"><h3>No quiz yet</h3><p>Generate a short formative check from today’s lecture${mat ? ' and your files' : ''}. Run it live with a leaderboard, present it on the board, or export it to your LMS.</p></div>`; return; }
  const teacher = S.ui.quizMode === 'teacher';
  $('#qv-teacher').setAttribute('aria-pressed', String(teacher)); $('#qv-practice').setAttribute('aria-pressed', String(!teacher));
  list.innerHTML = Q.questions.map((q, i) => {
    const pick = S.ui.practice[q.id];
    const showAns = teacher || pick !== undefined;
    const fb = k => q.feedback?.[k] || '';
    return `<div class="q-card" data-qid="${q.id}">
      <div class="q-head"><span class="q-num">${pad(i + 1)}</span><div class="q-stem" ${teacher ? 'contenteditable="true"' : ''} data-f="stem">${esc(q.stem)}</div></div>
      <div class="q-opts">${q.options.map((o, k) => {
        const cls = showAns && k === q.answer ? 'correct' : (!teacher && pick === k && k !== q.answer ? 'wrong' : '');
        return teacher
          ? `<div class="q-opt ${cls}"><button class="L" data-set="${k}" title="Make this the correct answer" aria-label="Make ${optLetter(q, k)} the correct answer">${optLetter(q, k)}</button><div class="grow"><span contenteditable="true" data-f="opt" data-k="${k}">${esc(o)}</span>${fb(k) ? `<span class="q-fb" contenteditable="true" data-f="fb" data-k="${k}" title="Feedback a student sees after choosing this option">${esc(fb(k))}</span>` : ''}</div></div>`
          : `<button class="q-opt ${cls}" data-pick="${k}"><span class="L">${optLetter(q, k)}</span><span class="grow">${esc(o)}${pick === k && fb(k) ? `<span class="q-fb">${esc(fb(k))}</span>` : ''}</span></button>`;
      }).join('')}</div>
      ${showAns && q.explanation ? `<div class="q-explain">${esc(q.explanation)}</div>` : ''}
      ${showAns && q.reflect ? `<div class="q-reflect"><span class="eyebrow">Reflect</span><span ${teacher ? 'contenteditable="true" data-f="reflect"' : ''}>${esc(q.reflect)}</span></div>` : ''}
      ${teacher ? `<div class="q-foot">${q.level ? `<span class="chip accent">${esc(q.level)}</span>` : ''}${q.source ? `<span class="chip">${esc(q.source)}</span>` : ''}<span class="grow"></span><button class="btn sm ghost danger" data-del>${icon('trash')}Remove</button></div>` : ''}
    </div>`;
  }).join('') + `<div class="q-card q-exit"><div class="q-head"><span class="q-num">${icon('spark')}</span><div class="grow"><span class="eyebrow">Exit ticket · asked at the end of a live quiz</span><div class="q-stem" ${teacher ? 'contenteditable="true"' : ''} data-f="reflection">${esc(Q.reflection || DEFAULT_REFLECTION)}</div></div></div></div>`;
}
function quizStudentBlocks(L, qs, key) {
  const b = [{ type: 'h', level: 1, text: `${key ? 'Answer key — ' : ''}${L.title}` }];
  b.push({ type: 'p', runs: [{ text: [L.course, fmtDate(L.createdAt)].filter(Boolean).join(' · '), i: true }] });
  if (!key) b.push({ type: 'p', runs: [{ text: 'Name: ______________________________      Date: ______________' }] });
  if (!key) {
    qs.forEach((q, i) => {
      b.push({ type: 'p', runs: [{ text: `${i + 1}. ${q.stem}`, b: true }] });
      q.options.forEach((o, k) => b.push({ type: 'p', indent: true, runs: [{ text: `${q.type === 'tf' ? '☐' : 'ABCD'[k] + '.'}  ${o}` }] }));
      b.push({ type: 'p', indent: true, runs: [{ text: 'How sure are you?   ☐ Guessing   ☐ Fairly sure   ☐ Certain', i: true }] });
      if (q.reflect) b.push({ type: 'p', indent: true, runs: [{ text: `Reflect: ${q.reflect}`, i: true }, { text: '\n______________________________________________________________' }] });
    });
    const ex = L.quiz?.reflection || DEFAULT_REFLECTION;
    b.push({ type: 'h', level: 2, text: 'Exit ticket' }, { type: 'p', runs: [{ text: ex }] }, { type: 'p', runs: [{ text: '______________________________________________________________\n______________________________________________________________' }] });
  } else {
    b.push({ type: 'table', head: ['#', 'Answer', 'Why', 'Source'], rows: qs.map((q, i) => [String(i + 1), q.type === 'tf' ? q.options[q.answer] : `${'ABCD'[q.answer]} — ${q.options[q.answer]}`, q.explanation, q.source || '']) });
    b.push({ type: 'h', level: 2, text: 'What each wrong answer tells you' });
    qs.forEach((q, i) => {
      const wrong = q.options.map((o, k) => k !== q.answer && q.feedback?.[k] ? `${optLetter(q, k)}: ${q.feedback[k]}` : '').filter(Boolean);
      if (wrong.length) b.push({ type: 'p', runs: [{ text: `${i + 1}. `, b: true }, { text: wrong.join('   ') }] });
    });
  }
  return b;
}
function quizText(qs) { return qs.map((q, i) => `${i + 1}. ${q.stem}\n${q.options.map((o, k) => `   ${optLetter(q, k)}. ${o}${q.feedback?.[k] ? `\n      → ${q.feedback[k]}` : ''}`).join('\n')}\n   Answer: ${q.type === 'tf' ? q.options[q.answer] : 'ABCD'[q.answer]}${q.explanation ? ` — ${q.explanation}` : ''}${q.reflect ? `\n   Reflect: ${q.reflect}` : ''}`).join('\n\n') + `\n\nExit ticket: ${S.lecture.quiz?.reflection || DEFAULT_REFLECTION}`; }
function giftEsc(s) { return String(s).replace(/([~=#{}:\\])/g, '\\$1'); }
function quizGift(L, qs) {
  return `// ${L.title} — formative check generated by Didasko\n// ${fmtDate(L.createdAt)}\n\n` + qs.map((q, i) =>
    `// ${q.level || 'Question'}${q.source ? ' · ' + q.source : ''}${q.reflect ? `\n// Reflect: ${q.reflect}` : ''}\n::Q${i + 1}:: ${giftEsc(q.stem)} ` + (q.type === 'tf'
      ? `{${q.answer === 0 ? 'TRUE' : 'FALSE'}${q.feedback?.[1 - q.answer] ? '#' + giftEsc(q.feedback[1 - q.answer]) : q.explanation ? '#' + giftEsc(q.explanation) : ''}${q.feedback?.[q.answer] ? '#' + giftEsc(q.feedback[q.answer]) : q.explanation ? '#' + giftEsc(q.explanation) : ''}}`
      : `{\n${q.options.map((o, k) => `${k === q.answer ? '=' : '~'}${giftEsc(o)}${q.feedback?.[k] ? '#' + giftEsc(q.feedback[k]) : k === q.answer && q.explanation ? '#' + giftEsc(q.explanation) : ''}`).join('\n')}\n}`)).join('\n\n')
    + `\n\n// Exit ticket\n::Exit ticket:: ${giftEsc(L.quiz?.reflection || DEFAULT_REFLECTION)} {}\n`;
}
function csvCell(s) { s = String(s ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function quizCsv(qs) {
  const rows = [['Type', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct', 'Feedback A', 'Feedback B', 'Feedback C', 'Feedback D', 'Explanation', 'Reflection prompt', 'Level', 'Source']];
  const pad4 = a => [...a, ...Array(4 - a.length).fill('')];
  qs.forEach(q => rows.push([q.type === 'tf' ? 'True/False' : 'Multiple choice', q.stem, ...pad4(q.options), q.type === 'tf' ? q.options[q.answer] : 'ABCD'[q.answer], ...pad4(q.feedback || []), q.explanation, q.reflect || '', q.level, q.source]));
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
function quizPrintHtml(L, qs, key) {
  const head = `<h1>${key ? 'Answer key — ' : ''}${esc(L.title)}</h1><p><em>${esc([L.course, fmtDate(L.createdAt)].filter(Boolean).join(' · '))}</em></p>`;
  if (key) return head + `<table><thead><tr><th>#</th><th>Answer</th><th>Why</th><th>What wrong answers tell you</th></tr></thead><tbody>${qs.map((q, i) => `<tr><td>${i + 1}</td><td>${q.type === 'tf' ? esc(q.options[q.answer]) : `${'ABCD'[q.answer]} — ${esc(q.options[q.answer])}`}</td><td>${esc(q.explanation)}</td><td>${q.options.map((o, k) => k !== q.answer && q.feedback?.[k] ? `<b>${optLetter(q, k)}</b> ${esc(q.feedback[k])}` : '').filter(Boolean).join('<br>')}</td></tr>`).join('')}</tbody></table>`;
  return head + `<div class="pname"><span>Name: ____________________________</span><span>Date: ____________</span></div>` + qs.map((q, i) => `<div class="pq"><strong>${i + 1}. ${esc(q.stem)}</strong>${q.type === 'tf' ? `<p>☐ True &nbsp;&nbsp; ☐ False</p>` : `<ol>${q.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>`}<p class="pconf">How sure are you? ☐ Guessing ☐ Fairly sure ☐ Certain</p>${q.reflect ? `<p class="preflect"><em>Reflect:</em> ${esc(q.reflect)}<br>_______________________________________________________</p>` : ''}</div>`).join('')
    + `<div class="pq"><strong>Exit ticket</strong><p>${esc(L.quiz?.reflection || DEFAULT_REFLECTION)}</p><p>_______________________________________________________<br>_______________________________________________________</p></div>`;
}

/* ---- Present mode ---- */
function openPresent(i = 0) {
  const qs = S.lecture.quiz?.questions || []; if (!qs.length) return;
  S.ui.present = Math.max(0, Math.min(i, qs.length - 1)); S.ui.revealed = false;
  $('#present').hidden = false; document.body.style.overflow = 'hidden';
  try { $('#present').requestFullscreen?.().catch(() => {}); } catch { /* ignore */ }
  renderPresent();
}
function closePresent() { $('#present').hidden = true; document.body.style.overflow = ''; if (document.fullscreenElement) document.exitFullscreen?.(); }
function renderPresent() {
  const qs = S.lecture.quiz.questions, q = qs[S.ui.present], r = S.ui.revealed;
  $('#p-count').textContent = `Question ${S.ui.present + 1} of ${qs.length}`;
  $('#p-stem').textContent = q.stem;
  $('#p-opts').innerHTML = q.options.map((o, k) => `<div class="p-opt ${r ? (k === q.answer ? 'correct' : 'dim') : ''}"><span class="L">${optLetter(q, k)}</span><span>${esc(o)}</span></div>`).join('');
  $('#p-explain').hidden = !r || !q.explanation; $('#p-explain').textContent = q.explanation;
  $('#p-reflect').hidden = !r || !q.reflect; $('#p-reflect').innerHTML = q.reflect ? `<span class="eyebrow">Turn and talk</span> ${esc(q.reflect)}` : '';
  $('#p-reveal').textContent = r ? 'Hide answer' : 'Reveal answer';
  $('#p-prev').disabled = S.ui.present === 0; $('#p-next').disabled = S.ui.present === qs.length - 1;
}

/* ================= Files ================= */
async function downscale(file, max = 1400) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
function stripCaptionFile(t) {
  return t.replace(/\r/g, '').split('\n').filter(l => l.trim() && !/^WEBVTT/.test(l) && !/-->/.test(l) && !/^\d+$/.test(l.trim()) && !/^(NOTE|STYLE|REGION)\b/.test(l)).map(l => l.replace(/<[^>]+>/g, '')).join(' ');
}
async function extractFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const f = { id: uid(), name: file.name, size: file.size, kind: ext, addedAt: Date.now(), useNotes: true, useQuiz: true, text: '', meta: '' };
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(ext)) {
    f.kind = 'image'; f.image = await downscale(file); f.meta = 'Image · read by AI models that accept images'; return f;
  }
  if (['txt', 'md', 'csv'].includes(ext)) f.text = await file.text();
  else if (ext === 'html' || ext === 'htm') { const d = new DOMParser().parseFromString(await file.text(), 'text/html'); f.text = d.body?.innerText || d.body?.textContent || ''; }
  else if (ext === 'vtt' || ext === 'srt') { f.text = stripCaptionFile(await file.text()); f.meta = 'Caption file'; }
  else if (ext === 'pdf') {
    const pdfjs = await lib('pdf');
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const out = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 300); p++) {
      const tc = await (await pdf.getPage(p)).getTextContent();
      out.push(tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join(''));
    }
    f.text = out.join('\n\n'); f.meta = `${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}`;
    try { const md = (await pdf.getMetadata()).info || {}; f.props = readDocProps(`<dc:title>${xe(md.Title || '')}</dc:title><dc:creator>${xe(md.Author || '')}</dc:creator><dcterms:created>${String(md.CreationDate || '').replace(/^D:/, '')}</dcterms:created>`); } catch { /* no metadata */ }
    if (words(f.text) < 20) f.meta += ' · no text found (scanned? add page photos instead)';
  } else if (ext === 'docx') {
    const buf = await file.arrayBuffer();
    const m = await lib('mammoth'); f.text = (await m.extractRawText({ arrayBuffer: buf })).value;
    try { const JSZip = await lib('jszip'); const z = await JSZip.loadAsync(buf); const core = z.file('docProps/core.xml'); if (core) f.props = readDocProps(await core.async('string')); } catch { /* no metadata */ }
  } else if (ext === 'pptx') {
    const JSZip = await lib('jszip'); const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const num = n => +(n.match(/(\d+)\.xml$/) || [0, 0])[1];
    const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
    const parts = [];
    for (const s of slides) {
      const xml = await zip.file(s).async('string');
      const txt = xml.split('</a:p>').map(p => (p.match(/<a:t>([^<]*)<\/a:t>/g) || []).map(t => unxml(t.slice(5, -6))).join('')).filter(Boolean).join('\n');
      const nf = zip.file(`ppt/notesSlides/notesSlide${num(s)}.xml`);
      let notes = ''; if (nf) { const nx = await nf.async('string'); notes = (nx.match(/<a:t>([^<]*)<\/a:t>/g) || []).map(t => unxml(t.slice(5, -6))).join(' ').replace(/^\s*\d+\s*$/, '').trim(); }
      parts.push(`[Slide ${num(s)}]\n${txt}${notes ? `\nSpeaker notes: ${notes}` : ''}`);
    }
    f.text = parts.join('\n\n'); f.meta = `${slides.length} slides`;
    const core = zip.file('docProps/core.xml'); if (core) f.props = readDocProps(await core.async('string'));
  } else throw new Error(`${file.name}: this file type isn’t supported. Use PDF, Word, PowerPoint, text or an image.`);
  if (f.props) f.cite = { authors: f.props.author || '', year: f.props.year || '', title: f.props.title || '' };
  f.text = f.text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const w = words(f.text).toLocaleString() + ' words';
  f.meta = f.meta ? `${f.meta} · ${w}` : w;
  return f;
}
async function addFiles(list) {
  const files = Array.from(list || []); if (!files.length) return;
  for (const file of files) {
    if (isMediaFile(file)) { showView('notes'); S.ui.notesTab = 'transcript'; renderNotesArea(); await transcribeFile(file, S.lecture); continue; }
    if (file.size > 60 * 1048576) { toast(`${file.name} is larger than 60 MB.`); continue; }
    toast(`Reading ${file.name}…`, 20000);
    try {
      const f = await extractFile(file); S.lecture.files.push(f); saveSoon(); renderFiles(); renderBadges(); toast(`Added ${file.name}`);
      if (aiReady() && f.text) detectCitation(f, { quiet: true }).then(() => { if (S.view === 'files') renderFiles(); });
    }
    catch (e) { toast(e.message || `Couldn’t read ${file.name}`, 5000); }
  }
}
function renderFiles() {
  const fs = S.lecture.files, box = $('#file-list');
  const locked = filesLocked();
  $('#drop').hidden = locked; $('#paste-material').hidden = locked;
  if (locked) {
    box.innerHTML = `<div class="panel empty"><h3>Sign in to add lecture files</h3><p>Uploading slides, papers, readings and photos — and saving a library of lectures you can open on any device — needs a free account. You can still transcribe a recording or a YouTube video without one.</p><div class="row" style="justify-content:center"><button class="btn primary" data-signin>${icon('user')}Sign in or create an account</button></div></div>`;
    return;
  }
  $('#files-summary').textContent = fs.length ? `${fs.length} source${fs.length > 1 ? 's' : ''} · ${fs.reduce((n, f) => n + words(f.text), 0).toLocaleString()} words of material · each one is cited in the notes` : '';
  if (!fs.length) { box.innerHTML = `<div class="panel empty"><h3>No materials yet</h3><p>Add a paper, a reading, your slides or a photo of the whiteboard — or transcribe a recording or YouTube video. Didasko can write notes and quizzes from these alone or alongside a live lecture, and cites each one.</p></div>`; return; }
  box.innerHTML = fs.map(f => `<div class="file" data-fid="${f.id}">
    <div class="ftype">${f.image ? `<img src="${f.image}" alt="">` : esc(f.kind)}</div>
    <div style="min-width:0"><div class="fname" title="${esc(f.name)}">${esc(f.name)}</div><div class="fmeta">${esc(f.meta)} · ${fmtBytes(f.size)}</div></div>
    <button class="icon-btn" data-fdel aria-label="Remove ${esc(f.name)}">${icon('trash')}</button>
    <div class="toggles">
      <label class="switch"><input type="checkbox" data-flag="useNotes" ${f.useNotes ? 'checked' : ''}> Notes</label>
      <label class="switch"><input type="checkbox" data-flag="useQuiz" ${f.useQuiz ? 'checked' : ''}> Quiz</label>
    </div>
    ${citeEditorHtml(f)}
    ${f.text ? `<details><summary>Preview text</summary><pre>${esc(f.text.slice(0, 3000))}${f.text.length > 3000 ? '\n…' : ''}</pre></details>` : ''}
  </div>`).join('');
}

/* ================= Sheets ================= */
function openTopicSheet() {
  openSheet('Start a new topic', `
    <p class="small muted" style="margin:0">A topic heading splits the transcript into sections. The notes use it as a heading.</p>
    <label class="field"><span>Topic</span><input id="topic-in" placeholder="e.g. The electron transport chain" autocomplete="off"></label>
    <div class="row"><button class="btn primary" id="topic-ok">Add topic</button><button class="btn ghost" data-close>Cancel</button></div>`,
    sh => { const go = () => { addTopic($('#topic-in', sh).value); closeSheet(); }; $('#topic-ok', sh).onclick = go; $('#topic-in', sh).onkeydown = e => { if (e.key === 'Enter') go(); }; });
}
function openTypeSheet() {
  openSheet('Type a line', `
    <p class="small muted" style="margin:0">Add something the microphone missed, or caption by typing. Each line becomes a caption.</p>
    <label class="field"><span>Text</span><textarea id="type-in" placeholder="Type here…"></textarea></label>
    <label class="switch"><input type="checkbox" id="type-key"> Mark as key point</label>
    <div class="row"><button class="btn primary" id="type-ok">Add to transcript</button><button class="btn ghost" data-close>Close</button></div>`,
    sh => {
      $('#type-ok', sh).onclick = () => {
        const v = $('#type-in', sh).value; const lines = v.split(/\n+/).filter(l => l.trim()); if (!lines.length) return;
        lines.forEach(l => { const s = addSpeech(l); if (s && $('#type-key', sh).checked) s.key = true; });
        renderCaptions(); renderStats(); $('#type-in', sh).value = ''; toast(`Added ${lines.length} line${lines.length > 1 ? 's' : ''}`);
      };
    });
}
function parseTimed(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n'); const out = []; let t = null, pending = null;
  const toMs = s => { const p = s.replace(',', '.').split(':').map(Number); return Math.round(((p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]) || 0) * 1000); };
  for (const l of lines) {
    const m = l.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->/);
    if (m) { t = toMs(m[1]); continue; }
    const tl = l.trim();
    if (!tl || /^WEBVTT|^NOTE\b|^\d+$/.test(tl)) continue;
    if (/^\d+\s+(seconds?|minutes?|hours?)(,\s*\d+\s+(seconds?|minutes?))*$/i.test(tl)) continue; // YouTube's spoken-time labels
    const only = tl.match(/^\[?\(?(\d{1,2}:\d{2}(?::\d{2})?)\)?\]?$/);           // YouTube copy: a timestamp on its own line
    if (only) { pending = toMs(only[1] + '.0'); continue; }
    const ts = tl.match(/^\[?\(?(\d{1,2}:\d{2}(?::\d{2})?)\)?\]?\s*[-–—:]?\s+(.*)$/);
    if (ts) { out.push({ t: toMs(ts[1] + '.0'), text: ts[2] }); pending = null; }
    else { out.push({ t: pending ?? t, text: tl.replace(/<[^>]+>/g, '') }); pending = null; }
  }
  let last = 0;
  const rows = out.map(x => { const tt = x.t ?? last + 5000; last = tt; return { t: tt, text: x.text.trim() }; }).filter(x => x.text);
  // Caption files and copied transcripts break speech into fragments: join them back into sentences (or ~35-word passages when unpunctuated).
  const merged = []; let cur = null;
  const ends = s => /[.?!…]["”’)\]]?$/.test(s);
  for (const r of rows) {
    if (!cur) cur = { ...r };
    else cur.text += ' ' + r.text;
    if (ends(cur.text) || words(cur.text) >= 35) { merged.push(cur); cur = null; }
  }
  if (cur) merged.push(cur);
  return merged;
}
function openImportSheet() {
  openSheet('Import a transcript', `
    <p class="small muted" style="margin:0">Paste text or choose a .txt, .vtt or .srt file — for example from Zoom, Teams or YouTube. Lines are added to this lecture.</p>
    <label class="field"><span>Transcript</span><textarea id="imp-text" placeholder="Paste a transcript…"></textarea></label>
    <div class="row"><label class="btn sm" for="imp-file">${icon('upload')}Choose file</label><input type="file" id="imp-file" accept=".txt,.vtt,.srt,.md" hidden><span class="small muted" id="imp-name"></span></div>
    <div class="row"><span class="small muted">No transcript yet?</span><button class="btn sm ghost" id="imp-rec">${icon('mic')}Transcribe a recording</button><button class="btn sm ghost" id="imp-yt">${icon('play')}From a YouTube link</button></div>
    <div class="row"><button class="btn primary" id="imp-ok">Import</button><button class="btn ghost" data-close>Cancel</button></div>`,
    sh => {
      $('#imp-rec', sh).onclick = () => { closeSheet(); pickRecording(); };
      $('#imp-yt', sh).onclick = () => { closeSheet(); openVideoSheet(); };
      $('#imp-file', sh).onchange = async e => { const f = e.target.files[0]; if (!f) return; $('#imp-text', sh).value = await f.text(); $('#imp-name', sh).textContent = f.name; };
      $('#imp-ok', sh).onclick = () => {
        const rows = parseTimed($('#imp-text', sh).value); if (!rows.length) { toast('Nothing to import'); return; }
        const base = speechSegs(S.lecture).length ? elapsed() : 0;
        rows.forEach(r => { const s = addSpeech(r.text, base + r.t); });
        S.lecture.ms = Math.max(S.lecture.ms, base + rows[rows.length - 1].t + 4000);
        saveSoon(); closeSheet(); renderAll(); toast(`Imported ${rows.length} lines`);
      };
    });
}
function openPasteMaterial() {
  openSheet('Paste lecture material', `
    <label class="field"><span>Name</span><input id="pm-name" placeholder="e.g. Reading excerpt, ch. 8" autocomplete="off"></label>
    <label class="field"><span>Text</span><textarea id="pm-text" placeholder="Paste text from a reading, slide notes or a website…" style="min-height:30vh"></textarea></label>
    <div class="row"><button class="btn primary" id="pm-ok">Add material</button><button class="btn ghost" data-close>Cancel</button></div>`,
    sh => {
      $('#pm-ok', sh).onclick = () => {
        const text = $('#pm-text', sh).value.trim(); if (!text) return;
        const name = $('#pm-name', sh).value.trim() || 'Pasted text';
        S.lecture.files.push({ id: uid(), name, size: new Blob([text]).size, kind: 'txt', addedAt: Date.now(), useNotes: true, useQuiz: true, text, meta: words(text).toLocaleString() + ' words' });
        saveSoon(); closeSheet(); renderFiles(); renderBadges(); toast(`Added ${name}`);
      };
    });
}
/* ================= Render everything ================= */
function fillLangSelects() {
  const st = S.settings;
  $('#src-lang').innerHTML = SRC_LANGS.map(([c, l]) => `<option value="${c}" ${c === st.srcLang ? 'selected' : ''}>${esc(l)}</option>`).join('');
  $('#tgt-lang').innerHTML = TGT_LANGS.map(([c, l]) => `<option value="${c}" ${c === st.tgtLang ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const outLangs = `<option value="src">Speaking language</option>` + TGT_LANGS.filter(l => l[0] !== 'off' && l[0] !== 'en').map(([c, l]) => `<option value="${c}">${esc(l)}</option>`).join('') + `<option value="en">English</option>`;
  $('#notes-lang').innerHTML = outLangs; $('#quiz-lang').innerHTML = outLangs;
}
function renderAll() {
  renderHeader(); renderStageMeta(); renderCaptions(); renderRecState(); renderStats(); renderBadges(); renderAiState(); renderShare();
  if (S.view === 'home') renderHome(); if (S.view === 'notes') renderNotesArea(); if (S.view === 'quiz') renderQuiz(); if (S.view === 'files') renderFiles();
}

/* ================= Events ================= */
function bind() {
  $$('.tab').forEach(t => t.onclick = () => showView(t.dataset.view));
  const goHome = () => showView('home');
  $('#brand-home').onclick = goHome; $('#brand-home').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } };
  $('#btn-rec').onclick = toggleCaptions; $('#fs-rec').onclick = toggleCaptions;
  $('#btn-key').onclick = markKey; $('#fs-key').onclick = markKey;
  $('#btn-topic').onclick = openTopicSheet; $('#btn-type').onclick = openTypeSheet;
  $('#btn-to-notes').onclick = () => showView('notes'); $('#btn-to-quiz').onclick = () => showView('quiz');
  $('#lecture-btn').onclick = () => openLectureSheet(); $('#btn-settings').onclick = openSettings; $('#btn-account').onclick = openAccountSheet;
  $('#btn-share').onclick = openShareSheet;
  $('#btn-qr-stage').onclick = () => { LIVE.showQR = !LIVE.showQR; renderShare(); };
  $('#quiz-live').onclick = openLiveQuiz;
  ['#quiz-type', '#quiz-timer', '#quiz-names', '#quiz-level'].forEach(id => { const v = S.settings[id.slice(1)]; if (v != null && $(id).querySelector(`option[value="${v}"]`)) $(id).value = v; $(id).onchange = e => { S.settings[id.slice(1)] = e.target.value; saveSettings(); }; });
  [['#quiz-board', 'quizBoard'], ['#quiz-conf', 'quizConf'], ['#quiz-reflect', 'quizReflect']].forEach(([id, k]) => { if (S.settings[k] != null) $(id).checked = !!S.settings[k]; $(id).onchange = e => { S.settings[k] = e.target.checked; saveSettings(); }; });
  $('#notes-style').onchange = () => { S.settings.notesStyle = $('#notes-style').value; saveSettings(); renderNotesStyleUi(); };
  $('#notes-custom').oninput = e => { S.settings.notesCustom = e.target.value; saveSettings(); };
  $('#font-up').onclick = () => { S.settings.capStep = Math.min(CAP_SIZES.length - 1, S.settings.capStep + 1); saveSettings(); renderStageMeta(); };
  $('#font-down').onclick = () => { S.settings.capStep = Math.max(0, S.settings.capStep - 1); saveSettings(); renderStageMeta(); };
  $('#mode-btn').onclick = () => { const o = ['both', 'translation', 'original']; S.settings.capMode = o[(o.indexOf(S.settings.capMode) + 1) % 3]; saveSettings(); renderStageMeta(); renderCaptions(); };
  $('#fs-btn').onclick = toggleProjector;
  $('#src-lang').onchange = e => {
    S.settings.srcLang = e.target.value; saveSettings(); TR.engineCache.clear(); renderStageMeta(); renderEngineNote(); liveMeta();
    if (S.rec.running) { pauseCaptions(true); startCaptions(); }
  };
  $('#tgt-lang').onchange = async e => {
    S.settings.tgtLang = e.target.value; saveSettings(); renderStageMeta(); renderCaptions();
    const tgt = target();
    if (tgt && await engineFor(tgt) === 'device') deviceTranslator(srcBase(S.settings.srcLang), tgt); // warm up within the gesture
    renderEngineNote();
    if (tgt) speechSegs(S.lecture).slice(-6).forEach(s => queueTranslate(s, tgt));
  };
  document.addEventListener('keydown', e => {
    if (LIVE.q && e.key === 'Escape') { closeLiveQuiz(); return; }
    if (!$('#present').hidden) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') $('#p-next').click();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') $('#p-prev').click();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); $('#p-reveal').click(); }
      else if (e.key === 'Escape') closePresent();
      return;
    }
    if (e.key === 'Escape') { if ($('#scrim')) closeSheet(); else $('#stage').classList.remove('projector'); $$('.menu-pop').forEach(m => { m.hidden = true; }); }
    const inProj = document.fullscreenElement === $('#stage') || $('#stage').classList.contains('projector');
    if (inProj && e.key === ' ') { e.preventDefault(); toggleCaptions(); }
    if (inProj && (e.key === 'k' || e.key === 'K')) markKey();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.rec.running && !wakeLock) grabWake(); if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('pagehide', () => saveNow());

  // menus
  const menu = (btnId, popId) => { $(btnId).onclick = e => { e.stopPropagation(); const p = $(popId); const open = p.hidden; $$('.menu-pop').forEach(m => { m.hidden = true; }); p.hidden = !open; }; };
  menu('#notes-export-btn', '#notes-export'); menu('#quiz-export-btn', '#quiz-export');
  document.addEventListener('click', e => { if (!e.target.closest('.menu')) $$('.menu-pop').forEach(m => { m.hidden = true; }); });
  if (IN_FRAME) $$('.print-only').forEach(b => { b.hidden = true; });

  // notes
  $('#nv-notes').onclick = () => { S.ui.notesTab = 'notes'; renderNotesArea(); };
  $('#nv-transcript').onclick = () => { S.ui.notesTab = 'transcript'; renderNotesArea(); };
  $('#notes-generate').onclick = generateNotes;
  $('#notes-stop').onclick = () => notesCtl?.abort();
  $('#notes-edit').onclick = () => {
    if (S.ui.notesEdit) { S.lecture.notes.md = $('#notes-editor').value; saveSoon(); }
    S.ui.notesEdit = !S.ui.notesEdit; renderNotes();
  };
  $('#notes-editor').oninput = () => { S.lecture.notes.md = $('#notes-editor').value; saveSoon(); };
  $('#notes-doc').addEventListener('focusout', e => {
    const t = e.target.closest('[data-page-text]'); const b = S.lecture.notes?.book; if (!t || !b) return;
    const p = b.pages[+t.dataset.pageText], v = t.textContent.replace(/\s+/g, ' ').trim();
    if (p && v && v !== p.text) { p.text = v; S.lecture.notes.md = bookMarkdown(S.lecture, b); saveSoon(); }
  });
  $('#notes-doc').addEventListener('click', e => { const r = e.target.closest('[data-redraw]'); if (r) redrawPicture(+r.dataset.redraw); });
  $('#notes-export').onclick = async e => {
    const b = e.target.closest('[data-exp]'); if (!b) return; $('#notes-export').hidden = true;
    try { await exportNotes(b.dataset.exp); } catch (err) { toast(err.message || 'Export failed', 4500); }
  };
  // transcript editing
  $('#transcript').addEventListener('focusout', e => {
    const tx = e.target.closest('.tx'); if (!tx) return;
    const id = tx.closest('.tline').dataset.id; const s = S.lecture.segments.find(x => x.id === id); if (!s) return;
    const v = tidy(tx.textContent);
    if (v && v !== s.text) { s.text = v; s.tr = {}; saveSoon(); liveSeg(s); queueTranslate(s); if (LIVE.code) LIVE.langs.forEach(l => queueTranslate(s, l)); renderCaptions(); }
  });
  $('#transcript').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.tx')) { e.preventDefault(); e.target.blur(); } });
  $('#transcript').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.tline').dataset.id; const L = S.lecture; const s = L.segments.find(x => x.id === id); if (!s) return;
    if (b.dataset.act === 'key') { s.key = !s.key; liveSeg(s); }
    if (b.dataset.act === 'del') { L.segments = L.segments.filter(x => x.id !== id); liveDelSeg(id); }
    saveSoon(); renderTranscript(); renderCaptions(); renderStats();
  });
  $('#tr-translate').onclick = async () => {
    const tgt = target(); if (!tgt) return;
    if (!await engineFor(tgt)) { toast('No translator is available. Choose an AI model in Settings.'); return; }
    const todo = speechSegs(S.lecture).filter(s => !s.tr?.[tgt]); todo.forEach(s => queueTranslate(s, tgt));
    toast(todo.length ? `Translating ${todo.length} lines…` : 'Everything is already translated');
  };
  $('#tr-import').onclick = openImportSheet;

  // quiz
  $('#quiz-generate').onclick = generateQuiz;
  $('#qv-teacher').onclick = () => { S.ui.quizMode = 'teacher'; renderQuiz(); };
  $('#qv-practice').onclick = () => { S.ui.quizMode = 'practice'; S.ui.practice = {}; renderQuiz(); };
  $('#quiz-present').onclick = () => openPresent(0);
  $('#quiz-list').addEventListener('click', e => {
    const card = e.target.closest('.q-card'); if (!card) return;
    const Q = S.lecture.quiz; const q = Q.questions.find(x => x.id === card.dataset.qid); if (!q) return;
    const pick = e.target.closest('[data-pick]'), set = e.target.closest('[data-set]'), del = e.target.closest('[data-del]');
    if (pick && S.ui.practice[q.id] === undefined) { S.ui.practice[q.id] = +pick.dataset.pick; renderQuiz(); }
    if (set) { q.answer = +set.dataset.set; saveSoon(); renderQuiz(); toast(`Correct answer set to ${q.type === 'tf' ? q.options[q.answer] : 'ABCD'[q.answer]}`); }
    if (del) { Q.questions = Q.questions.filter(x => x !== q); saveSoon(); renderQuiz(); renderBadges(); toast('Question removed'); }
  });
  $('#quiz-list').addEventListener('focusout', e => {
    const f = e.target.closest('[data-f]'); if (!f) return;
    const q = S.lecture.quiz.questions.find(x => x.id === f.closest('.q-card').dataset.qid); if (!q && f.dataset.f !== 'reflection') return;
    const v = f.textContent.replace(/\s+/g, ' ').trim();
    if (f.dataset.f === 'reflection') { S.lecture.quiz.reflection = v || DEFAULT_REFLECTION; saveSoon(); return; }
    if (!v && f.dataset.f !== 'fb' && f.dataset.f !== 'reflect') { renderQuiz(); return; }
    if (f.dataset.f === 'stem') q.stem = v; else if (f.dataset.f === 'fb') { q.feedback = q.feedback || q.options.map(() => ''); q.feedback[+f.dataset.k] = v; } else if (f.dataset.f === 'reflect') q.reflect = v; else q.options[+f.dataset.k] = v;
    saveSoon();
  });
  $('#quiz-export').onclick = async e => {
    const b = e.target.closest('[data-qexp]'); if (!b) return; $('#quiz-export').hidden = true;
    const L = S.lecture, qs = L.quiz?.questions || [], name = slug(L.title) + '-quiz', t = b.dataset.qexp;
    try {
      if (t === 'docx') saveFile(name + '.docx', await buildDocx([...quizStudentBlocks(L, qs, false), { type: 'pagebreak' }, ...quizStudentBlocks(L, qs, true)], L.title + ' quiz'));
      else if (t === 'gift') saveFile(name + '-moodle-gift.txt', quizGift(L, qs), 'text/plain');
      else if (t === 'csv') saveFile(name + '.csv', quizCsv(qs), 'text/csv');
      else if (t === 'json') saveFile(name + '.json', JSON.stringify({ title: L.title, course: L.course, date: new Date(L.createdAt).toISOString(), questions: qs.map(({ id, ...q }) => q) }, null, 2), 'application/json');
      else if (t === 'print') printHtml(quizPrintHtml(L, qs, false));
      else if (t === 'printkey') printHtml(quizPrintHtml(L, qs, true));
      else if (t === 'copy') copyText(quizText(qs));
    } catch (err) { toast(err.message || 'Export failed', 4500); }
  };
  $('#p-close').onclick = closePresent;
  $('#p-prev').onclick = () => { if (S.ui.present > 0) { S.ui.present--; S.ui.revealed = false; renderPresent(); } };
  $('#p-next').onclick = () => { if (S.ui.present < S.lecture.quiz.questions.length - 1) { S.ui.present++; S.ui.revealed = false; renderPresent(); } };
  $('#p-reveal').onclick = () => { S.ui.revealed = !S.ui.revealed; renderPresent(); };

  // files
  $('#file-input').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  document.addEventListener('paste', e => { if (S.view !== 'files' || !e.clipboardData?.files?.length) return; addFiles(e.clipboardData.files); });
  $('#paste-material').onclick = openPasteMaterial;
  $('#add-recording').onclick = () => pickRecording();
  $('#add-video').onclick = () => openVideoSheet();
  $('#file-list').addEventListener('change', e => {
    const c = e.target.closest('[data-flag]'); if (!c) return;
    const f = S.lecture.files.find(x => x.id === c.closest('.file').dataset.fid); if (f) { f[c.dataset.flag] = c.checked; saveSoon(); }
  });
  $('#file-list').addEventListener('click', e => {
    const d = e.target.closest('[data-fdel]'); if (!d) return;
    const id = d.closest('.file').dataset.fid; S.lecture.files = S.lecture.files.filter(f => f.id !== id); saveSoon(); renderFiles(); renderBadges(); toast('File removed');
  });
  $('#file-list').addEventListener('input', e => {
    const c = e.target.closest('[data-cite]'); if (!c) return;
    const card = c.closest('.file'), f = S.lecture.files.find(x => x.id === card.dataset.fid); if (!f) return;
    f.cite = { ...(f.cite || {}), [c.dataset.cite]: c.value }; saveSoon();
    card.querySelector('.cite-ref').innerHTML = inl(fileRef(f)); card.querySelector('.cite-intext').innerHTML = inl(fileInText(f));
  });
  $('#file-list').addEventListener('change', e => { const c = e.target.closest('select[data-cite]'); if (c) c.dispatchEvent(new Event('input', { bubbles: true })); });
  $('#file-list').addEventListener('click', async e => {
    const d = e.target.closest('[data-detect]'); if (!d) return;
    const f = S.lecture.files.find(x => x.id === d.closest('.file').dataset.fid); if (!f) return;
    d.disabled = true; d.textContent = 'Reading…';
    f.cite = { ...(f.cite || {}), checked: false };
    const ok = await detectCitation(f); f._openCite = true; renderFiles(); delete f._openCite; if (ok) toast('Citation details filled in. Check them before sharing.');
  });
  document.addEventListener('click', e => { if (e.target.closest('[data-signin]')) openAccountSheet(); });

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installPrompt = e; });
}

/* ================= Sample lecture ================= */
function sampleLecture() {
  const L = newLecture('Sample · Photosynthesis: the light reactions'); L.sample = true;
  L.course = 'BIO 110 · Section 2';
  const seq = [
    ['t', 'Why light matters'],
    [5, 'Okay everyone let\'s get started, today we\'re picking up photosynthesis where we left off on Monday'],
    [18, 'Remember the overall equation six CO2 plus six water plus light energy gives you glucose and six oxygen'],
    [34, 'But that equation hides two very different stages and today is all about the first one the light dependent reactions', 1],
    [52, 'These happen in the thylakoid membranes inside the chloroplast so picture stacks of little discs called grana'],
    ['t', 'Photosystem II and splitting water'],
    [75, 'Light hits photosystem two first, which is confusing because it\'s numbered two but it comes first, it was just discovered second'],
    [93, 'Chlorophyll a in the reaction center called P680 absorbs that energy and an electron gets excited to a higher energy level'],
    [111, 'To replace that electron the plant splits water, this is photolysis and this is where the oxygen we breathe comes from', 1],
    [130, 'So the oxygen in the atmosphere is a byproduct of splitting water not of carbon dioxide, that\'s a really common misconception'],
    ['t', 'The electron transport chain'],
    [152, 'The excited electron moves down an electron transport chain through plastoquinone the cytochrome b6f complex and plastocyanin'],
    [170, 'As it moves that energy is used to pump hydrogen ions, protons, into the thylakoid space building up a concentration gradient'],
    [188, 'Then ATP synthase lets those protons flow back out and uses that flow to make ATP, this is called chemiosmosis', 1],
    [207, 'It\'s the same basic idea as in mitochondria which we\'ll compare next week'],
    ['t', 'Photosystem I and NADPH'],
    [225, 'The electron arrives at photosystem one, P700 gets re-energized by light and passes it to ferredoxin'],
    [242, 'And finally the enzyme NADP plus reductase uses it to make NADPH'],
    [255, 'So the products of the light reactions are ATP NADPH and oxygen, and the ATP and NADPH go on to power the Calvin cycle', 1],
    [274, 'For Thursday read section 8.3 on the Calvin cycle and try the practice problems at the end']
  ];
  let lastT = 0;
  seq.forEach(r => {
    if (r[0] === 't') L.segments.push({ id: uid(), kind: 'topic', t: lastT * 1000 + 1000, text: r[1] });
    else { lastT = r[0]; L.segments.push({ id: uid(), kind: 'speech', t: r[0] * 1000, text: r[1], tr: {}, key: !!r[2] }); }
  });
  L.ms = 290000;
  const reading = `Chapter 8.2 — The light-dependent reactions (excerpt)

The light-dependent reactions take place in the thylakoid membrane. Two photosystems work in series. Photosystem II (P680) absorbs light first; its excited electrons are replaced by electrons taken from water, releasing O2 and H+ ions into the thylakoid lumen (photolysis).

Electrons pass from PSII through plastoquinone (PQ), the cytochrome b6f complex and plastocyanin (PC) to Photosystem I (P700). The cytochrome complex uses this energy to pump protons into the lumen. The resulting proton-motive force drives ATP synthase, which produces ATP as protons flow back to the stroma (chemiosmosis, or photophosphorylation).

At PSI, electrons are re-excited and passed to ferredoxin (Fd). NADP+ reductase transfers them to NADP+, forming NADPH in the stroma. ATP and NADPH then supply energy and reducing power to the Calvin cycle.

Common misconception: the O2 released by plants comes from water, not from CO2. Isotope-labelling experiments with 18O confirmed this in 1941.`;
  const fid = uid();
  L.lecturer = 'Alex Rivera'; L.institution = 'Sample State University'; L.author = 'Alex Rivera';
  L.files.push({ id: fid, name: 'Ch8.2 reading – light reactions.txt', size: reading.length, kind: 'txt', addedAt: Date.now(), useNotes: true, useQuiz: true, text: reading, meta: `${words(reading)} words`,
    cite: { authors: 'Sample State University Biology Department', year: '2025', title: 'Chapter 8.2: The light-dependent reactions', source: 'BIO 110 course reader', kind: 'chapter', checked: true } });
  L.notes = { style: 'apa', at: Date.now(), lectureTitle: 'Photosynthesis: The light-dependent reactions', titles: { [fid]: 'Chapter 8.2: The light-dependent reactions' },
    keywords: ['photosynthesis', 'light-dependent reactions', 'photosystem II', 'photolysis', 'electron transport chain', 'chemiosmosis', 'NADPH'],
    md: `# Photosynthesis: How the Light-Dependent Reactions Turn Sunlight Into Chemical Energy

## Abstract
Photosynthesis is usually summarized in a single equation, yet that equation conceals two distinct stages with different locations, inputs and purposes. This article examines the first stage, the light-dependent reactions, as presented in an introductory biology lecture (Rivera, 2026) and its accompanying course reading. It first establishes where the reactions take place and why their location in the thylakoid membrane matters. It then follows energy from its capture by two photosystems, through an electron transport chain that builds a proton gradient, to the synthesis of ATP and NADPH. A discussion section addresses the most persistent misconception about photosynthesis, the origin of atmospheric oxygen, and links the light reactions to cellular respiration and the Calvin cycle. Understanding the light reactions as an energy-conversion pathway, rather than a list of named molecules, gives students a framework for reasoning about how disruptions to any step affect the whole process.

*Keywords:* photosynthesis, light-dependent reactions, photolysis, electron transport chain, chemiosmosis

## Introduction
Nearly all energy that flows through living systems enters them through photosynthesis, the process by which plants, algae and some bacteria capture light and store its energy in chemical bonds. Students usually meet the process as a balanced equation, 6 CO₂ + 6 H₂O + light energy → C₆H₁₂O₆ + 6 O₂, which accurately describes the overall inputs and outputs but says nothing about how the conversion happens (Rivera, 2026).

That gap matters. When the process is reduced to an equation, students tend to treat its parts as interchangeable and to draw incorrect conclusions, most commonly that the oxygen plants release comes from carbon dioxide (Rivera, 2026). Rivera therefore separated photosynthesis into its two stages and devoted the lecture to the first, the **light-dependent reactions**, which convert light into the chemical energy carriers that the second stage, the Calvin cycle, later spends to build sugar.

This article organizes the lecture's content around that conversion of energy. Section 2 explains where the light reactions occur and why the structure of the chloroplast is essential to them. Section 3 traces the pathway of energy from light to ATP and NADPH. Section 4 discusses the misconceptions and connections the lecture highlighted, and Section 5 concludes.

## The Setting: Two Stages and a Specialized Membrane
Before following any single molecule, it helps to see the light reactions in context: what they contribute to photosynthesis as a whole, and the physical structure that makes them possible.

### Two Stages With Different Jobs
Rivera described photosynthesis as a two-part system in which each stage depends on the other (Rivera, 2026). The light-dependent reactions capture energy and produce three things: ATP, NADPH and oxygen. The **Calvin cycle**, which the class would study next, uses the ATP and NADPH to fix carbon dioxide into sugar. The two stages are therefore linked by energy carriers rather than by a shared location or set of reactions.

This division clarifies what the light reactions are for. Their purpose is not to make sugar, but to make the energy available in a usable chemical form. Seeing them this way prepares students to ask the right questions about each step: where the energy comes from, where it goes, and what is produced along the way.

### The Thylakoid Membrane
The light reactions take place in the **thylakoid membranes** inside the chloroplast, flattened discs that are stacked into columns called **grana** (Rivera, 2026; Sample State University Biology Department, 2025). The location is not incidental. As Section 3 shows, the reactions work by moving protons from one side of a membrane to the other and then harnessing their return. A sealed membrane is what allows that difference in concentration to exist at all.

## From Light to Chemical Energy
The core of the lecture followed a single pathway of energy through the thylakoid membrane. It is easiest to understand as three linked steps: capturing light, using it to build a proton gradient, and using the gradient and a second burst of light to make the energy carriers.

### Capturing Light and Splitting Water at Photosystem II
Light first strikes **Photosystem II**. Rivera noted that the name causes confusion because the numbering reflects the order of discovery, not the order of action (Rivera, 2026). In the reaction center, a chlorophyll *a* molecule called **P680** absorbs light energy, and one of its electrons is raised to a higher energy level and passed on.

The electron that leaves P680 must be replaced, and the plant replaces it by splitting water, a process called **photolysis**. Splitting water releases hydrogen ions into the thylakoid space and gives off oxygen as a by-product (Sample State University Biology Department, 2025). This single step is the source of the oxygen in Earth's atmosphere, a point Section 4 returns to.

### Building a Proton Gradient Along the Electron Transport Chain
From Photosystem II the excited electron moves along an **electron transport chain**, passing from plastoquinone to the cytochrome b6f complex and then to plastocyanin (Rivera, 2026). At each transfer the electron is held a little less tightly, and the energy released is used by the cytochrome complex to pump protons into the thylakoid space.

The result is a store of potential energy: many more protons inside the thylakoid than outside it. **ATP synthase**, an enzyme spanning the membrane, lets the protons flow back out and couples that flow to the synthesis of ATP. This mechanism is called **chemiosmosis**, or photophosphorylation in the course reading (Rivera, 2026; Sample State University Biology Department, 2025).

### Re-energizing Electrons and Making NADPH at Photosystem I
When the electron reaches **Photosystem I**, its reaction center, **P700**, absorbs more light and re-energizes it. The electron passes to ferredoxin, and the enzyme NADP⁺ reductase uses it to reduce NADP⁺ to **NADPH** in the stroma (Rivera, 2026). With this final step the light reactions have completed their job: ATP and NADPH stay in the chloroplast to power the Calvin cycle, and oxygen leaves the leaf.

## Discussion: Misconceptions and Connections
The lecture used the pathway to correct a common misunderstanding and to connect photosynthesis to other topics in the course.

The most persistent misconception is that atmospheric oxygen comes from carbon dioxide. The pathway shows why that cannot be true: oxygen is released when water is split to replace electrons lost from Photosystem II, while carbon dioxide is not used until the Calvin cycle (Rivera, 2026). Isotope-labelling experiments with ¹⁸O confirmed this origin in 1941 (Sample State University Biology Department, 2025). Asking students to trace an oxygen atom through the process is a direct way to test whether the correction has taken hold.

The pathway also shows how the stages depend on one another. Because ATP production relies on the proton gradient, anything that makes the thylakoid membrane leaky would cut ATP output even if electrons kept flowing. Rivera pointed out that mitochondria use the same principle to make ATP during cellular respiration, a comparison the class would take up the following week (Rivera, 2026).

## Conclusion
The light-dependent reactions are best understood as an energy-conversion pathway: light is captured at Photosystem II, water is split, energy from moving electrons builds a proton gradient that drives ATP synthase, and a second photosystem produces NADPH (Rivera, 2026; Sample State University Biology Department, 2025). Framing the process this way explains where atmospheric oxygen comes from, why the chloroplast's membranes matter, and how the light reactions supply the Calvin cycle. Students were asked to read Section 8.3 on the Calvin cycle and complete its practice problems before the next class.` };
  L.quiz = { at: Date.now(), reflection: 'Which step of the light reactions could you now teach to a classmate, and which step still feels fuzzy? What question would you ask to clear it up?', questions: normalizeQuestions([
    { stem: 'A classmate says, “Plants release oxygen because they break apart the CO₂ they take in.” Based on the lecture, what is the best response?', options: ['That’s right — the oxygen atoms in O₂ come from CO₂.', 'Not quite — the O₂ comes from water that is split to replace electrons lost from Photosystem II.', 'Not quite — the O₂ comes from glucose broken down during the Calvin cycle.', 'Not quite — the O₂ is made by ATP synthase as protons cross the membrane.'], answer: 1,
      feedback: ['This is the misconception the lecture warned about. Think about which molecule is split in Photosystem II and what it gives off.', 'Yes. Photolysis splits water to replace P680’s electrons, and the oxygen is a by-product — confirmed with ¹⁸O labelling.', 'Glucose is built in the Calvin cycle, not broken down there. Trace where the oxygen appears in the light reactions.', 'ATP synthase makes ATP from a proton flow; it doesn’t produce any gas. Where does water enter the process?'],
      explanation: 'Photolysis at Photosystem II splits water; the O₂ released comes from H₂O, not CO₂.', reflect: 'How would you convince someone who still believes the oxygen comes from CO₂? What evidence would you use?', source: 'Lecture 1:51', level: 'Evaluate' },
    { stem: 'A herbicide makes the thylakoid membrane leaky to H⁺ ions, but electrons still flow normally. What happens first?', options: ['Water stops being split at Photosystem II', 'ATP production falls because the proton gradient can’t build up', 'NADPH production stops because ferredoxin can’t accept electrons', 'Light absorption by P680 and P700 stops'], answer: 1,
      feedback: ['Water splitting depends on electrons leaving P680, which still happens here. What depends on the gradient instead?', 'Exactly. ATP synthase is driven by the proton gradient; a leak dissipates it, so ATP output drops even though electrons still flow.', 'Electron flow to ferredoxin is unaffected in this scenario. Which product depends on protons, not electrons?', 'Pigments still absorb light; the leak affects the membrane, not the chlorophyll.'],
      explanation: 'Chemiosmosis needs a proton gradient across the thylakoid membrane. Without it, ATP synthase has nothing to drive it.', reflect: 'Why does it matter that the light reactions happen in a membrane rather than floating in the stroma?', source: 'Lecture 3:08', level: 'Apply' },
    { stem: 'Why is the first photosystem in the pathway called Photosystem “II”?', options: ['It absorbs longer wavelengths of light than Photosystem I', 'It was discovered after Photosystem I', 'It only works after Photosystem I has run once', 'It contains twice as much chlorophyll'], answer: 1,
      feedback: ['Wavelength isn’t the reason for the name. The lecture gave a historical reason.', 'Right — the names reflect the order of discovery, not the order in the pathway.', 'In the pathway, PSII acts before PSI, so this reverses the order.', 'The “II” is a sequence number, not a quantity.'],
      explanation: 'The numbering reflects the order of discovery, not the order in which they act.', reflect: 'Can you think of another scientific name that misleads people about how something works?', source: 'Lecture 1:15', level: 'Understand' },
    { stem: 'Which comparison between the light reactions and the Calvin cycle is accurate?', options: ['The light reactions make ATP, NADPH and O₂; the Calvin cycle uses ATP and NADPH to build sugar', 'The light reactions make glucose; the Calvin cycle releases oxygen', 'Both stages happen in the thylakoid membrane', 'The Calvin cycle produces the ATP that the light reactions need'], answer: 0,
      feedback: ['Yes — the light reactions supply the energy carriers, and the Calvin cycle spends them to fix carbon.', 'This swaps the two stages. Which stage did the lecture say releases O₂?', 'The light reactions are in the thylakoids, but the Calvin cycle is in the stroma.', 'The flow of energy runs the other way: light reactions → ATP → Calvin cycle.'],
      explanation: 'The light reactions convert light to ATP and NADPH (and release O₂); the Calvin cycle uses them to make sugar.', reflect: 'Draw a quick arrow diagram linking the two stages. What crosses between them?', source: 'Lecture 4:15', level: 'Analyze' },
    { stem: 'Trace one electron from water to NADPH. Which sequence is correct?', options: ['Water → PSII (P680) → plastoquinone → cytochrome b6f → plastocyanin → PSI (P700) → ferredoxin → NADPH', 'Water → PSI (P700) → ferredoxin → plastoquinone → PSII (P680) → NADPH', 'Water → PSII → ferredoxin → plastocyanin → cytochrome b6f → NADPH', 'CO₂ → PSII → ATP synthase → PSI → NADPH'], answer: 0,
      feedback: ['Correct. The electron passes PSII, the transport chain, PSI, then ferredoxin and NADP⁺ reductase.', 'This starts at the wrong photosystem. Which photosystem gets its electrons from water?', 'Ferredoxin comes after PSI, not right after PSII.', 'Electrons come from water, not CO₂, and ATP synthase moves protons, not electrons.'],
      explanation: 'PSII → PQ → cytochrome b6f → PC → PSI → ferredoxin → NADP⁺ reductase → NADPH.', reflect: 'At which step is energy used to pump protons, and why does that matter for ATP?', source: 'Ch8.2 reading – light reactions.txt', level: 'Understand' }
  ]) };
  return L;
}

/* ================= Boot ================= */
async function boot() {
  const saved = (await store.get('settings')) || {};
  S.settings = { ...DEFAULT_SETTINGS, ...saved };
  const ai = saved.ai || {};
  S.settings.ai = { ...DEFAULT_AI, ...ai, keys: { ...(ai.keys || {}) }, models: { ...(ai.models || {}) }, lists: { ...(ai.lists || {}) }, bases: { ...(ai.bases || {}) }, azure: { ...DEFAULT_AI.azure, ...(ai.azure || {}) } };
  if (!saved.ai && IS_ARTIFACT) S.settings.ai.provider = 'account';
  if (!PROVIDERS[S.settings.ai.provider] || (PROVIDERS[S.settings.ai.provider].previewOnly && !IS_ARTIFACT)) S.settings.ai.provider = 'gemini';
  applyTheme();
  const join = new URLSearchParams(location.search).get('join');
  if (join !== null) { registerSW(); await bootParticipant(join); return; }

  S.index = (await store.get(K('index'))) || [];
  let L = S.settings.lastLecture ? await store.get(K('lec:' + S.settings.lastLecture)) : null;
  if (!L && S.index[0]) L = await store.get(K('lec:' + S.index[0].id));
  if (!L) L = sampleLecture();
  S.lecture = normalizeLecture(L); S.settings.lastLecture = L.id;
  await saveNow(); saveSettings();
  fillLangSelects(); bind(); renderAll(); renderAccount();
  $('#notes-style').value = styleKey(L.notes?.style || S.settings.notesStyle || 'apa');
  $('#notes-custom').value = L.notes?.custom || S.settings.notesCustom || '';
  renderNotesStyleUi();
  showView('home');

  if (window.claude?.use) {
    window.claude.use('sample').then(s => { if (s) { S.ai.sample = s; renderAiState(); } }).catch(() => {});
    window.claude.use('downloads').then(d => { S.ai.downloads = d; }).catch(() => {});
  }
  registerSW();
  await initCloud();
  renderAll();
}
function registerSW() {
  if (IS_ARTIFACT || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Didasko was updated. Reopen the app to use the new version.', 5000); });
    });
  }).catch(() => {});
}

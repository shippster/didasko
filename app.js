/* Didasko — live captions, translation, APA notes, live quizzes. Built from src/ by build.py. */
(() => {
'use strict';

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
  settings: { ...DEFAULT_SETTINGS }, index: [], lecture: null, view: 'live',
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
  const meta = { id: L.id, title: L.title, course: L.course || '', createdAt: L.createdAt, updatedAt: L.updatedAt, ms: L.ms, words: speechWords(L) };
  const i = S.index.findIndex(x => x.id === L.id);
  if (i >= 0) S.index[i] = meta; else S.index.unshift(meta);
  await store.set(K('index'), S.index);
  cloudSaveSoon(L);
  if (LIVE.code) liveMeta();
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
  const key = `${S.settings.engine}|${src}|${tgt}|${aiReady()}|${S.settings.ai.provider}`;
  if (TR.engineCache.has(key)) return TR.engineCache.get(key);
  let eng = null;
  if (S.settings.engine !== 'ai' && 'Translator' in self) {
    try { const a = await self.Translator.availability({ sourceLanguage: src, targetLanguage: tgt }); if (a && a !== 'unavailable') eng = 'device'; } catch { /* unsupported pair */ }
  }
  if (!eng && S.settings.engine !== 'device' && aiReady()) eng = 'ai';
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
    catch (e) { if (!aiReady() || S.settings.engine === 'device') throw e; }
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
  ['live', 'notes', 'quiz', 'files'].forEach(x => { $('#view-' + x).hidden = x !== v; $('#tab-' + x).setAttribute('aria-selected', String(x === v)); });
  if (v === 'notes') renderNotesArea();
  if (v === 'quiz') renderQuiz();
  if (v === 'files') renderFiles();
  window.scrollTo({ top: 0 });
}

/* ================= Rendering: captions ================= */
function capHtml(s, tgt) {
  if (s.kind === 'topic') return `<div class="cap-topic">${esc(s.text)}</div>`;
  const tr = tgt ? (s.tr?.[tgt] ? `<div class="cap-t" dir="${RTL.has(tgt) ? 'rtl' : 'auto'}">${esc(s.tr[tgt])}</div>` : `<div class="cap-t pending" dir="auto">…</div>`) : '';
  return `<div class="cap${s.key ? ' key' : ''}" data-id="${s.id}"><div class="cap-o">${esc(s.text)}</div>${tr}</div>`;
}
function renderCaptions() {
  const box = $('#captions'), tgt = target();
  const segs = S.lecture.segments.slice(-8);
  box.innerHTML = segs.map(s => capHtml(s, tgt)).join('') + `<div class="cap interim" id="cap-interim" hidden><div class="cap-o"></div><div class="cap-t" dir="${tgt && RTL.has(tgt) ? 'rtl' : 'auto'}"></div></div>`;
  box.className = 'captions mode-' + (tgt ? S.settings.capMode : 'original');
  $('#stage-empty').hidden = S.lecture.segments.length > 0 || S.rec.running;
  renderInterim();
  box.scrollTop = box.scrollHeight;
}
function renderInterim() {
  const el = $('#cap-interim'); if (!el) return;
  const has = !!S.rec.interim;
  el.hidden = !has;
  el.querySelector('.cap-o').textContent = S.rec.interim;
  el.querySelector('.cap-t').textContent = S.rec.interimTr || '';
  $('#stage-empty').hidden = S.lecture.segments.length > 0 || S.rec.running;
  const box = $('#captions'); box.scrollTop = box.scrollHeight;
}
function updateCapTr(seg, tgt) {
  if (tgt !== target()) return;
  const el = $(`#captions .cap[data-id="${seg.id}"] .cap-t`);
  if (el) { el.textContent = seg.tr[tgt]; el.classList.remove('pending'); const box = $('#captions'); box.scrollTop = box.scrollHeight; }
}
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

/* ================= Quiz ================= */
const LEVELS = { recall: 'mostly Remember and Understand questions that check the key facts and definitions', mixed: 'a mix: about a third Remember, a third Understand and a third Apply/Analyze', higher: 'mostly Apply and Analyze questions using new scenarios, examples or data, with a few Understand questions' };
let quizBusy = false;
async function generateQuiz() {
  const L = S.lecture;
  if (!speechSegs(L).length && !L.files.some(f => f.useQuiz && f.text)) { toast('Record a lecture or add files first.'); return; }
  const n = +$('#quiz-count').value, level = $('#quiz-level').value, lv = $('#quiz-lang').value, qtype = $('#quiz-type').value;
  const lang = lv === 'src' ? srcName(S.settings.srcLang) : tgtName(lv);
  const useFiles = $('#quiz-use-files').checked, keyFocus = $('#quiz-key-focus').checked;
  if (!aiReady()) {
    try { L.quiz = { questions: buildLocalQuiz(L, useFiles, n, qtype), local: true, at: Date.now() }; saveSoon(); renderQuiz(); renderBadges(); toast('Practice questions built on this device'); }
    catch (e) { toast(e.message, 4500); }
    return;
  }
  const mat = useFiles ? materials('useQuiz') : { text: '', images: [], names: [] };
  const TYPE_RULES = {
    mc: '- Every question is multiple choice with exactly 4 options and exactly one correct answer ("type":"mc").\n- Spread the correct answer across positions A–D.',
    tf: '- Every question is a true/false statement ("type":"tf") whose options are exactly ["True","False"]; "answer" is 0 when the statement is true and 1 when it is false.\n- Make roughly half the statements true and half false. False statements should reflect a real misconception, not a trivial word swap. Avoid double negatives and absolute words that give the answer away.',
    mix: '- About two-thirds of the questions are multiple choice with exactly 4 options ("type":"mc"); the rest are true/false statements ("type":"tf") whose options are exactly ["True","False"], with "answer" 0 for true and 1 for false.\n- Spread multiple-choice answers across positions A–D.'
  };
  const system = `You write formative assessment questions that a teacher uses to check understanding right after a lecture.
Rules:
- Write exactly ${n} questions, in ${lang}, for ${AUDIENCE[$('#notes-audience').value] || 'students'}.
- Thinking level: ${LEVELS[level]}.
${TYPE_RULES[qtype] || TYPE_RULES.mc}
- Distractors are plausible and based on likely misconceptions; never "all of the above" or "none of the above"; keep options similar in length and grammar.
- Stems are self-contained and clear; no trick wording.
- Base every question only on the transcript and the materials. The transcript comes from speech recognition, so ignore obvious recognition errors.
- Cover the lecture broadly${mat.text ? ', and include some questions that draw on the materials' : ''}.${keyFocus ? '\n- Every line marked ★KEY POINT must be assessed by at least one question.' : ''}
For each question return: "type"; "stem"; "options" (array of strings, no letter prefixes); "answer" (index of the correct option); "explanation" (1–2 sentences on why it is right and what misconception the strongest distractor reflects); "source" (a transcript timestamp like "Lecture 12:40", or the material's file name); "level" (Remember, Understand, Apply or Analyze).
Reply with JSON only, in this shape: {"questions":[{"type":"mc","stem":"","options":["","","",""],"answer":0,"explanation":"","source":"","level":""}]}`;
  const user = `${lectureHeader(L)}\n\n<transcript>\n${transcriptForPrompt(L)}\n</transcript>${mat.text ? `\n\n<materials>\n${mat.text}\n</materials>` : ''}`;
  quizBusy = true; setQuizBusy(true);
  try {
    const text = await callAI({
      system, user, images: mat.images, maxTokens: 8000, json: true,
      onText: t => { const k = (t.match(/"stem"\s*:/g) || []).length; $('#quiz-status-text').textContent = k ? `Writing question ${Math.min(k, n)} of ${n}…` : 'Reading the lecture…'; }
    });
    const qs = normalizeQuestions(parseJson(text).questions);
    if (!qs.length) throw new Error('The AI didn’t return any usable questions. Try again.');
    L.quiz = { questions: qs, at: Date.now(), lang, type: qtype };
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
    return { id: uid(), type: tf ? 'tf' : 'mc', stem: String(q.stem || '').trim(), options, answer, explanation: String(q.explanation || '').trim(), source: String(q.source || '').trim(), level: String(q.level || '').trim() };
  }).filter(q => q.stem && q.options.length === (q.type === 'tf' ? 2 : 4) && q.answer >= 0 && q.answer < q.options.length);
}
const optLetter = (q, k) => q.type === 'tf' ? (k ? 'F' : 'T') : 'ABCD'[k];
function setQuizBusy(on) {
  $('#quiz-status').hidden = !on; $('#quiz-generate').disabled = on;
  if (on) { $('#quiz-status-text').textContent = 'Reading the lecture…'; $('#quiz-list').innerHTML = ''; $('#quiz-bar').hidden = true; }
}
function buildLocalQuiz(L, useFiles, n, qtype = 'mc') {
  const segs = speechSegs(L);
  const corpus = segs.map(s => s.text).concat(useFiles ? L.files.filter(f => f.useQuiz && f.text).map(f => f.text) : []).join('. ');
  const terms = keyTerms(corpus, 40).filter(t => t.length > 4);
  if (terms.length < 4) throw new Error('There isn’t enough lecture content yet to build questions. Record more, or choose an AI model in Settings.');
  const pool = [...segs.filter(s => s.key), ...segs.filter(s => !s.key)].flatMap(s => sentencesOf(s.text).map(t => ({ t, src: `Lecture ${fmtClock(s.t)}` })));
  if (useFiles) L.files.filter(f => f.useQuiz && f.text).forEach(f => sentencesOf(f.text.replace(/\n+/g, '. ')).forEach(t => pool.push({ t, src: f.name })));
  const used = new Set(), qs = [];
  for (const { t, src } of pool) {
    if (qs.length >= n) break;
    const w = words(t); if (w < 7 || w > 40) continue;
    const term = terms.find(k => !used.has(k) && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t));
    if (!term) continue;
    used.add(term);
    const asTF = qtype === 'tf' || (qtype === 'mix' && qs.length % 3 === 2);
    if (asTF) {
      const swap = Math.random() < .5 && terms.length > 1 ? terms.find(k => k !== term && !t.toLowerCase().includes(k)) : null;
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      qs.push({ id: uid(), type: 'tf', stem: 'True or false: ' + (swap ? t.replace(re, swap) : t), options: ['True', 'False'], answer: swap ? 1 : 0, explanation: `From the lecture: “${t}”`, source: src, level: 'Remember' });
      continue;
    }
    const stem = 'Fill in the blank: ' + t.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '_____');
    const others = terms.filter(k => k !== term).sort(() => Math.random() - .5).slice(0, 3);
    const options = [term, ...others].sort(() => Math.random() - .5);
    qs.push({ id: uid(), type: 'mc', stem, options, answer: options.indexOf(term), explanation: `From the lecture: “${t}”`, source: src, level: 'Remember' });
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
  if (!n) { list.innerHTML = `<div class="panel empty"><h3>No quiz yet</h3><p>Generate a short multiple-choice check from today’s lecture${mat ? ' and your files' : ''}. Present it on the board or export it to your LMS.</p></div>`; return; }
  const teacher = S.ui.quizMode === 'teacher';
  $('#qv-teacher').setAttribute('aria-pressed', String(teacher)); $('#qv-practice').setAttribute('aria-pressed', String(!teacher));
  list.innerHTML = Q.questions.map((q, i) => {
    const pick = S.ui.practice[q.id];
    const showAns = teacher || pick !== undefined;
    return `<div class="q-card" data-qid="${q.id}">
      <div class="q-head"><span class="q-num">${pad(i + 1)}</span><div class="q-stem" ${teacher ? 'contenteditable="true"' : ''} data-f="stem">${esc(q.stem)}</div></div>
      <div class="q-opts">${q.options.map((o, k) => {
        const cls = showAns && k === q.answer ? 'correct' : (!teacher && pick === k && k !== q.answer ? 'wrong' : '');
        return teacher
          ? `<div class="q-opt ${cls}"><button class="L" data-set="${k}" title="Make this the correct answer" aria-label="Make ${optLetter(q, k)} the correct answer">${optLetter(q, k)}</button><span class="grow" contenteditable="true" data-f="opt" data-k="${k}">${esc(o)}</span></div>`
          : `<button class="q-opt ${cls}" data-pick="${k}"><span class="L">${optLetter(q, k)}</span><span>${esc(o)}</span></button>`;
      }).join('')}</div>
      ${showAns && q.explanation ? `<div class="q-explain">${esc(q.explanation)}</div>` : ''}
      ${teacher ? `<div class="q-foot">${q.level ? `<span class="chip accent">${esc(q.level)}</span>` : ''}${q.source ? `<span class="chip">${esc(q.source)}</span>` : ''}<span class="grow"></span><button class="btn sm ghost danger" data-del>${icon('trash')}Remove</button></div>` : ''}
    </div>`;
  }).join('');
}
function quizStudentBlocks(L, qs, key) {
  const b = [{ type: 'h', level: 1, text: `${key ? 'Answer key — ' : ''}${L.title}` }];
  b.push({ type: 'p', runs: [{ text: [L.course, fmtDate(L.createdAt)].filter(Boolean).join(' · '), i: true }] });
  if (!key) b.push({ type: 'p', runs: [{ text: 'Name: ______________________________      Date: ______________' }] });
  if (!key) qs.forEach((q, i) => {
    b.push({ type: 'p', runs: [{ text: `${i + 1}. ${q.stem}`, b: true }] });
    q.options.forEach((o, k) => b.push({ type: 'p', indent: true, runs: [{ text: `${q.type === 'tf' ? '☐' : 'ABCD'[k] + '.'}  ${o}` }] }));
  });
  else b.push({ type: 'table', head: ['#', 'Answer', 'Why', 'Source'], rows: qs.map((q, i) => [String(i + 1), q.type === 'tf' ? q.options[q.answer] : `${'ABCD'[q.answer]} — ${q.options[q.answer]}`, q.explanation, q.source || '']) });
  return b;
}
function quizText(qs) { return qs.map((q, i) => `${i + 1}. ${q.stem}\n${q.options.map((o, k) => `   ${optLetter(q, k)}. ${o}`).join('\n')}\n   Answer: ${q.type === 'tf' ? q.options[q.answer] : 'ABCD'[q.answer]}${q.explanation ? ` — ${q.explanation}` : ''}`).join('\n\n'); }
function giftEsc(s) { return String(s).replace(/([~=#{}:\\])/g, '\\$1'); }
function quizGift(L, qs) {
  return `// ${L.title} — formative check generated by Didasko\n// ${fmtDate(L.createdAt)}\n\n` + qs.map((q, i) =>
    `// ${q.level || 'Question'}${q.source ? ' · ' + q.source : ''}\n::Q${i + 1}:: ${giftEsc(q.stem)} ` + (q.type === 'tf'
      ? `{${q.answer === 0 ? 'TRUE' : 'FALSE'}${q.explanation ? '#' + giftEsc(q.explanation) + '#' + giftEsc(q.explanation) : ''}}`
      : `{\n${q.options.map((o, k) => `${k === q.answer ? '=' : '~'}${giftEsc(o)}${k === q.answer && q.explanation ? '#' + giftEsc(q.explanation) : ''}`).join('\n')}\n}`)).join('\n\n') + '\n';
}
function csvCell(s) { s = String(s ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function quizCsv(qs) {
  const rows = [['Type', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct', 'Explanation', 'Level', 'Source']];
  qs.forEach(q => rows.push([q.type === 'tf' ? 'True/False' : 'Multiple choice', q.stem, ...q.options, ...Array(4 - q.options.length).fill(''), q.type === 'tf' ? q.options[q.answer] : 'ABCD'[q.answer], q.explanation, q.level, q.source]));
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
function quizPrintHtml(L, qs, key) {
  const head = `<h1>${key ? 'Answer key — ' : ''}${esc(L.title)}</h1><p><em>${esc([L.course, fmtDate(L.createdAt)].filter(Boolean).join(' · '))}</em></p>`;
  if (key) return head + `<table><thead><tr><th>#</th><th>Answer</th><th>Why</th></tr></thead><tbody>${qs.map((q, i) => `<tr><td>${i + 1}</td><td>${q.type === 'tf' ? esc(q.options[q.answer]) : `${'ABCD'[q.answer]} — ${esc(q.options[q.answer])}`}</td><td>${esc(q.explanation)}</td></tr>`).join('')}</tbody></table>`;
  return head + `<div class="pname"><span>Name: ____________________________</span><span>Date: ____________</span></div>` + qs.map((q, i) => `<div class="pq"><strong>${i + 1}. ${esc(q.stem)}</strong>${q.type === 'tf' ? `<p>☐ True &nbsp;&nbsp; ☐ False</p>` : `<ol>${q.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>`}</div>`).join('');
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
  $('#drop').hidden = locked; $('#paste-material').parentElement.hidden = locked;
  if (locked) {
    box.innerHTML = `<div class="panel empty"><h3>Sign in to add lecture files</h3><p>Uploading slides, readings and photos — and saving a library of lectures you can open on any device — needs a free account.</p><div class="row" style="justify-content:center"><button class="btn primary" data-signin>${icon('user')}Sign in or create an account</button></div></div>`;
    return;
  }
  $('#files-summary').textContent = fs.length ? `${fs.length} source${fs.length > 1 ? 's' : ''} · ${fs.reduce((n, f) => n + words(f.text), 0).toLocaleString()} words of material · each one is cited in the notes` : '';
  if (!fs.length) { box.innerHTML = `<div class="panel empty"><h3>No materials yet</h3><p>Add your slides, a reading or a photo of the whiteboard. Didasko uses them to correct terms in the notes, writes quiz questions from them, and cites each one in APA style.</p></div>`; return; }
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
  const lines = text.replace(/\r/g, '').split('\n'); const out = []; let t = null;
  const toMs = s => { const p = s.replace(',', '.').split(':').map(Number); return Math.round(((p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]) || 0) * 1000); };
  for (const l of lines) {
    const m = l.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->/);
    if (m) { t = toMs(m[1]); continue; }
    if (!l.trim() || /^WEBVTT|^NOTE\b|^\d+$/.test(l.trim())) continue;
    const ts = l.match(/^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.*)$/);
    if (ts) out.push({ t: toMs(ts[1] + '.0'), text: ts[2] });
    else out.push({ t, text: l.replace(/<[^>]+>/g, '') });
  }
  let last = 0;
  return out.map(x => { const tt = x.t ?? last + 5000; last = tt; return { t: tt, text: x.text }; }).filter(x => x.text.trim());
}
function openImportSheet() {
  openSheet('Import a transcript', `
    <p class="small muted" style="margin:0">Paste text or choose a .txt, .vtt or .srt file — for example from Zoom, Teams or YouTube. Lines are added to this lecture.</p>
    <label class="field"><span>Transcript</span><textarea id="imp-text" placeholder="Paste a transcript…"></textarea></label>
    <div class="row"><label class="btn sm" for="imp-file">${icon('upload')}Choose file</label><input type="file" id="imp-file" accept=".txt,.vtt,.srt,.md" hidden><span class="small muted" id="imp-name"></span></div>
    <div class="row"><button class="btn primary" id="imp-ok">Import</button><button class="btn ghost" data-close>Cancel</button></div>`,
    sh => {
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
  if (S.view === 'notes') renderNotesArea(); if (S.view === 'quiz') renderQuiz(); if (S.view === 'files') renderFiles();
}

/* ================= Events ================= */
function bind() {
  $$('.tab').forEach(t => t.onclick = () => showView(t.dataset.view));
  $('#btn-rec').onclick = toggleCaptions; $('#fs-rec').onclick = toggleCaptions;
  $('#btn-key').onclick = markKey; $('#fs-key').onclick = markKey;
  $('#btn-topic').onclick = openTopicSheet; $('#btn-type').onclick = openTypeSheet;
  $('#btn-to-notes').onclick = () => showView('notes'); $('#btn-to-quiz').onclick = () => showView('quiz');
  $('#lecture-btn').onclick = () => openLectureSheet(); $('#btn-settings').onclick = openSettings; $('#btn-account').onclick = openAccountSheet;
  $('#btn-share').onclick = openShareSheet;
  $('#btn-qr-stage').onclick = () => { LIVE.showQR = !LIVE.showQR; renderShare(); };
  $('#quiz-live').onclick = openLiveQuiz;
  ['#quiz-type', '#quiz-timer', '#quiz-names'].forEach(id => { $(id).value = S.settings[id.slice(1)] ?? $(id).value; $(id).onchange = e => { S.settings[id.slice(1)] = e.target.value; saveSettings(); }; });
  $('#quiz-board').checked = !!S.settings['quiz-board']; $('#quiz-board').onchange = e => { S.settings['quiz-board'] = e.target.checked; saveSettings(); };
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
    const q = S.lecture.quiz.questions.find(x => x.id === f.closest('.q-card').dataset.qid); if (!q) return;
    const v = f.textContent.replace(/\s+/g, ' ').trim(); if (!v) { renderQuiz(); return; }
    if (f.dataset.f === 'stem') q.stem = v; else q.options[+f.dataset.k] = v;
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
  L.notes = { style: 'study', at: Date.now(), lectureTitle: 'Photosynthesis: The light-dependent reactions', titles: { [fid]: 'Chapter 8.2: The light-dependent reactions' },
    keywords: ['photosynthesis', 'light-dependent reactions', 'photosystem II', 'photolysis', 'electron transport chain', 'chemiosmosis', 'NADPH'],
    md: `# Photosynthesis: The Light-Dependent Reactions

## Abstract
This lecture introduced the first stage of photosynthesis, the light-dependent reactions, which take place in the thylakoid membranes of the chloroplast. Rivera explained that light energizes electrons in Photosystem II and that water is split to replace them, releasing the oxygen in Earth’s atmosphere. As electrons pass along the electron transport chain, protons are pumped into the thylakoid space, and ATP synthase uses the resulting gradient to make ATP through chemiosmosis. At Photosystem I, electrons are re-energized and used to form NADPH. The ATP and NADPH produced in these reactions power the Calvin cycle, the topic of the next class (Rivera, 2026).

*Keywords:* photosynthesis, light-dependent reactions, photosystem II, photolysis, electron transport chain, chemiosmosis, NADPH

## Introduction
Photosynthesis is the process by which plants, algae and some bacteria capture light energy and store it in chemical bonds. This lecture continued the unit on photosynthesis by focusing on its first stage, the light-dependent reactions, and on how the chloroplast converts light into the chemical energy carriers ATP and NADPH (Rivera, 2026).

## Why Light Matters
The overall equation for photosynthesis is 6 CO₂ + 6 H₂O + light energy → C₆H₁₂O₆ + 6 O₂. Rivera emphasized that this single equation hides two stages: the **light-dependent reactions**, covered in this lecture, and the **Calvin cycle**, covered next (Rivera, 2026).

- The light-dependent reactions occur in the **thylakoid membranes** of the chloroplast.
- Thylakoids are stacked into **grana**.

## Photosystem II and the Splitting of Water
Light strikes **Photosystem II** first; its name reflects the order in which it was discovered, not its position in the pathway (Rivera, 2026). The reaction-center chlorophyll *a*, **P680**, absorbs light energy, and an electron is excited to a higher energy level.

To replace that electron, the plant splits water in a process called **photolysis**, which releases oxygen and hydrogen ions (Rivera, 2026; Sample State University Biology Department, 2025).

> A common misconception is that atmospheric oxygen comes from carbon dioxide. It comes from water (Rivera, 2026).

## The Electron Transport Chain
### Carriers Between the Photosystems
**Table 1**
*Electron Carriers Between Photosystem II and Photosystem I*

| Carrier | Role |
|---|---|
| Plastoquinone (PQ) | Carries electrons away from Photosystem II |
| Cytochrome b6f complex | Uses electron energy to pump H⁺ into the thylakoid space |
| Plastocyanin (PC) | Delivers electrons to Photosystem I |

### Making ATP by Chemiosmosis
As electrons move along the chain, protons build up in the thylakoid space and form a concentration gradient. **ATP synthase** lets the protons flow back out and uses that flow to make ATP, a process called **chemiosmosis** (Rivera, 2026). The course reader also calls this *photophosphorylation* (Sample State University Biology Department, 2025). Mitochondria rely on the same principle, which the class will compare next week.

## Photosystem I and NADPH
At **Photosystem I (P700)**, light re-energizes the electron, which passes to **ferredoxin**. The enzyme **NADP⁺ reductase** then uses it to form **NADPH** (Rivera, 2026). The products of the light-dependent reactions are ATP, NADPH and oxygen; ATP and NADPH go on to power the Calvin cycle.

## Conclusion
The light-dependent reactions transform light energy into chemical energy through a coordinated sequence: water splitting at Photosystem II, proton pumping along the electron transport chain, ATP synthesis by chemiosmosis and NADPH formation at Photosystem I (Rivera, 2026; Sample State University Biology Department, 2025). Understanding this sequence explains where atmospheric oxygen comes from and prepares students for the Calvin cycle, which uses these products to fix carbon in the next class.

## Key Terms
**Table 2**
*Key Terms From the Lecture*

| Term | Meaning |
|---|---|
| Thylakoid | Membrane disc inside the chloroplast where the light reactions occur |
| Grana | Stacks of thylakoids |
| P680 / P700 | Reaction-center chlorophylls of Photosystem II / I |
| Photolysis | Splitting water with light energy, which releases O₂ |
| Chemiosmosis | Making ATP from the flow of protons through ATP synthase |
| NADPH | Electron carrier produced at the end of the light reactions |

## Review Questions
1. Why is Photosystem II numbered “II” if it acts first?
2. Trace one electron from water to NADPH.
3. What would happen to ATP production if the thylakoid membrane became leaky to protons?
4. Which products of the light reactions are used by the Calvin cycle, and which is released?` };
  L.quiz = { at: Date.now(), questions: normalizeQuestions([
    { stem: 'Where in the chloroplast do the light-dependent reactions take place?', options: ['In the stroma', 'In the thylakoid membranes', 'In the outer chloroplast membrane', 'In the cytoplasm next to the chloroplast'], answer: 1, explanation: 'Both photosystems and the electron transport chain sit in the thylakoid membranes. The stroma is where the Calvin cycle happens, the most common mix-up.', source: 'Lecture 0:52', level: 'Remember' },
    { stem: 'The oxygen released during photosynthesis comes from which molecule?', options: ['Carbon dioxide', 'Glucose', 'Water', 'NADPH'], answer: 2, explanation: 'Photolysis splits water to replace electrons lost from Photosystem II, releasing O₂. Believing it comes from CO₂ is a well-known misconception.', source: 'Lecture 1:51', level: 'Remember' },
    { stem: 'Why is Photosystem II the first photosystem in the electron pathway even though it is numbered "II"?', options: ['It absorbs longer wavelengths of light', 'It was discovered after Photosystem I', 'It only works when Photosystem I is inactive', 'It is located closer to the stroma'], answer: 1, explanation: 'The numbering reflects the order of discovery, not the order in the pathway.', source: 'Lecture 1:15', level: 'Understand' },
    { stem: 'A herbicide makes the thylakoid membrane leaky to H⁺ ions. Which process is affected most directly?', options: ['Splitting of water at Photosystem II', 'Absorption of light by P700', 'ATP production by ATP synthase', 'Transfer of electrons to ferredoxin'], answer: 2, explanation: 'ATP synthase depends on the proton gradient across the membrane (chemiosmosis). A leak dissipates the gradient, so ATP output falls even if electrons still flow.', source: 'Lecture 3:08', level: 'Apply' },
    { stem: 'Which set lists the products of the light-dependent reactions?', options: ['Glucose, ATP and O₂', 'ATP, NADPH and O₂', 'CO₂, NADP⁺ and H₂O', 'ADP, NADPH and CO₂'], answer: 1, explanation: 'The light reactions make ATP and NADPH (used by the Calvin cycle) and release O₂. Glucose is made later, in the Calvin cycle.', source: 'Lecture 4:15', level: 'Remember' },
    { stem: 'What is the correct order of electron carriers from Photosystem II to Photosystem I?', options: ['Plastocyanin → cytochrome b6f → plastoquinone', 'Ferredoxin → plastoquinone → plastocyanin', 'Plastoquinone → cytochrome b6f → plastocyanin', 'Cytochrome b6f → ferredoxin → plastoquinone'], answer: 2, explanation: 'Electrons flow PSII → plastoquinone → cytochrome b6f → plastocyanin → PSI. Ferredoxin receives electrons after PSI.', source: 'Ch8.2 reading – light reactions.txt', level: 'Understand' }
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
  $('#notes-style').value = L.notes?.style || 'study';

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
  account: {
    label: 'My Claude account (preview only)', kind: 'sample', key: false, main: 'default', fast: 'quick', models: ['default'], vision: false, previewOnly: true,
    note: 'Uses your Claude.ai account inside this preview.'
  }
};
const DEFAULT_AI = { provider: 'gemini', keys: {}, models: {}, lists: {}, bases: {}, azure: { endpoint: '', deployment: '', fastDeployment: '', apiVersion: '2024-10-21' } };

const prov = () => PROVIDERS[S.settings.ai.provider] || PROVIDERS.gemini;
const aiKey = () => S.settings.ai.keys[S.settings.ai.provider] || '';
const aiModel = fast => {
  const id = S.settings.ai.provider, m = S.settings.ai.models[id] || {};
  if (PROVIDERS[id]?.azure) return fast ? (S.settings.ai.azure.fastDeployment || S.settings.ai.azure.deployment) : S.settings.ai.azure.deployment;
  return (fast ? m.fast : m.main) || (fast ? PROVIDERS[id]?.fast : PROVIDERS[id]?.main) || '';
};
const aiBase = () => (S.settings.ai.bases[S.settings.ai.provider] || prov().base || '').replace(/\/+$/, '');
function aiReady() {
  const p = prov();
  if (p.kind === 'sample') return !!S.ai.sample;
  if (p.kind === 'chrome') return 'LanguageModel' in self;
  if (p.azure) return !!(aiKey() && S.settings.ai.azure.endpoint && S.settings.ai.azure.deployment);
  if (p.key && !p.optionalKey && !aiKey()) return false;
  if (p.editBase && !aiBase()) return false;
  return !!aiModel(false);
}
const aiVision = () => aiReady() && !!prov().vision;
const aiLabel = () => `${prov().label.replace(/ \(.*\)$/, '')}${aiModel(false) && !['chrome', 'sample'].includes(prov().kind) ? ' · ' + aiModel(false) : ''}`;
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
async function listModels() {
  const id = S.settings.ai.provider, p = PROVIDERS[id], key = aiKey();
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

/* ================= APA 7 notes: citations, composition, export ================= */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ORG_RE = /\b(University|College|Association|Institute|Department|Agency|Organi[sz]ation|Society|Board|Council|Inc|LLC|Ltd|Press|Foundation|Cent(er|re)|School|District|Ministry|Office|Museum|Library|Committee|Commission|Group|Company)\b/i;
const splitNames = s => (Array.isArray(s) ? s : String(s || '').split(/\s*(?:;|\s&\s|\band\b)\s*/i)).map(x => String(x).trim()).filter(Boolean);
const initials = s => s.split(/[\s.]+/).filter(Boolean).map(w => w.split('-').map(p => p[0].toUpperCase() + '.').join('-')).join(' ');
function cleanName(n) {
  return String(n || '').replace(/^\s*(Dr|Prof|Professor|Mr|Mrs|Ms|Mx|Rev)\.?\s+/i, '').replace(/,?\s*\b(Ph\.?\s?D|Ed\.?\s?D|M\.?\s?D|M\.?\s?Ed|M\.?\s?A|M\.?\s?S|B\.?\s?A|B\.?\s?S|MBA|J\.?\s?D)\b\.?/gi, '').replace(/,?\s*\b(Jr|Sr|II|III|IV)\b\.?$/i, m => m).trim().replace(/,$/, '');
}
const isOrg = n => ORG_RE.test(n) || (/^[A-Z0-9&]{2,}$/.test(n.trim()));
function apaName(n) {
  n = cleanName(n); if (!n) return '';
  if (isOrg(n)) return n;
  if (n.includes(',')) { const [last, first] = n.split(',').map(x => x.trim()); return first ? `${last}, ${initials(first)}` : last; }
  const parts = n.split(/\s+/); if (parts.length === 1) return parts[0];
  const last = parts.pop(); return `${last}, ${initials(parts.join(' '))}`;
}
const surname = n => { n = cleanName(n); if (isOrg(n)) return n; return n.includes(',') ? n.split(',')[0].trim() : n.split(/\s+/).pop(); };
function apaAuthorList(names) {
  const a = splitNames(names).map(apaName).filter(Boolean);
  if (a.length <= 1) return a[0] || '';
  if (a.length === 2) return `${a[0]}, & ${a[1]}`;
  if (a.length <= 20) return `${a.slice(0, -1).join(', ')}, & ${a[a.length - 1]}`;
  return `${a.slice(0, 19).join(', ')}, . . . ${a[a.length - 1]}`;
}
function inTextAuthors(names) {
  const a = splitNames(names).map(surname).filter(Boolean);
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} & ${a[1]}`;
  return `${a[0]} et al.`;
}
const yearOf = ts => new Date(ts).getFullYear();
const apaLongDate = ts => { const d = new Date(ts); return `${d.getFullYear()}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const titleDate = ts => { const d = new Date(ts); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
const endDot = s => /[.?!]$/.test(s) ? s : s + '.';
function apaRef({ authors, date, title, desc, source, url }) {
  const au = apaAuthorList(authors);
  const t = `*${title}*${desc ? ` [${desc}]` : ''}`;
  let r = au ? `${endDot(au)} (${date}). ${endDot(t)}` : `${endDot(t)} (${date}).`;
  if (source) r += ` ${endDot(source)}`;
  if (url) r += ` ${url}`;
  return r.replace(/\*\s*\[/, '* [').replace(/\.\*\./g, '.*').replace(/([?!])\*\./g, '$1*');
}
const FILE_KIND = { pptx: 'slides', pdf: 'document', docx: 'document', txt: 'document', md: 'document', csv: 'dataset', vtt: 'transcript', srt: 'transcript', html: 'webpage', image: 'image' };
const KIND_DESC = { slides: 'PowerPoint slides', image: 'Photograph', dataset: 'Data set', transcript: 'Transcript', lecture: 'Lecture' };
const CITE_KINDS = [['document', 'Document or reading'], ['article', 'Journal article'], ['book', 'Book'], ['chapter', 'Book chapter'], ['webpage', 'Web page'], ['slides', 'Slides'], ['report', 'Report'], ['image', 'Image or photo'], ['transcript', 'Transcript'], ['dataset', 'Data set']];
function fileCite(f) {
  const c = f.cite || {};
  const title = (c.title || f.name.replace(/\.[a-z0-9]+$/i, '')).trim();
  const kind = c.kind || FILE_KIND[f.kind] || 'document';
  return { authors: splitNames(c.authors), year: (c.year || '').trim() || 'n.d.', title, kind, source: (c.source || '').trim(), url: (c.url || '').trim() };
}
function fileRef(f, titleOverride) {
  const c = fileCite(f);
  const t = titleOverride || c.title;
  if (c.kind === 'article') {
    const au = apaAuthorList(c.authors);
    let r = au ? `${endDot(au)} (${c.year}). ${endDot(t)}` : `${endDot(t)} (${c.year}).`;
    if (c.source) { const m = c.source.match(/^(.*?)(,\s*\d.*)$/); r += m ? ` *${m[1]}*${endDot(m[2])}` : ` *${endDot(c.source)}*`; }
    if (c.url) r += ` ${c.url}`;
    return r;
  }
  return apaRef({ authors: c.authors, date: c.year, title: t, desc: KIND_DESC[c.kind], source: c.source, url: c.url });
}
function fileInText(f) {
  const c = fileCite(f);
  const who = inTextAuthors(c.authors);
  if (who) return `(${who}, ${c.year})`;
  const short = c.title.split(/\s+/).slice(0, 4).join(' ');
  return c.kind === 'article' ? `(“${short}”, ${c.year})` : `(*${short}*, ${c.year})`;
}
const lecturerOf = L => (L.lecturer || S.settings.lecturer || '').trim();
function lectureInText(L) { const w = inTextAuthors([lecturerOf(L)]) || L.course || 'Lecture'; return `(${w}, ${yearOf(L.createdAt)})`; }
function lectureRef(L, titleSC) {
  const lec = lecturerOf(L);
  const src = [L.course, L.institution].filter(Boolean).join(', ');
  return apaRef({ authors: lec ? [lec] : [], date: apaLongDate(L.createdAt), title: titleSC || L.title, desc: 'Lecture', source: src });
}
function citedFiles(L) { return L.files.filter(f => f.useNotes); }
function referenceList(L) {
  const n = L.notes || {}, titles = n.titles || {};
  const refs = [lectureRef(L, n.lectureTitle), ...citedFiles(L).map(f => fileRef(f, titles[f.id]))];
  const key = r => r.replace(/[*“”"]/g, '').toLowerCase();
  return [...new Set(refs)].sort((a, b) => key(a).localeCompare(key(b)));
}

/* ---- Compose the paper from the AI-written body ---- */
function splitBody(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  let title = '', i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (/^#\s+/.test(lines[i] || '')) { title = lines[i].replace(/^#\s+/, '').trim(); i++; }
  const rest = lines.slice(i);
  let abstract = [], body = [], inAbs = false, keywords = '';
  for (const l of rest) {
    if (/^##\s+abstract\s*$/i.test(l)) { inAbs = true; continue; }
    if (inAbs && /^##\s+/.test(l)) inAbs = false;
    const kw = l.match(/^\s*[*_]{0,2}keywords:?[*_]{0,2}:?\s*(.+)$/i);
    if (kw) { keywords = kw[1].replace(/[*_]/g, '').trim().replace(/\.$/, ''); continue; }
    (inAbs ? abstract : body).push(l);
  }
  return { title, abstract: abstract.join('\n').trim(), body: body.join('\n').trim().replace(/^(\*\*(?:Table|Figure) \d+\*\*)[ \t]*\n(?=\*[^*\n])/gm, '$1\n\n'), keywords };
}
const JOURNAL = 'Didasko Lecture Notes';
function composeApa(L) {
  const sb = splitBody(L.notes?.md || '');
  const full = sb.title || L.title;
  const [t, ...sub] = full.split(/:\s+/);
  const lecturer = lecturerOf(L), author = (L.author || S.settings.author || '').trim();
  const running = full.replace(/:.*$/, '').toUpperCase();
  return {
    fullTitle: full, title: sub.length ? t : full, subtitle: sub.join(': '),
    lecturer, author: author && author !== lecturer ? author : '',
    affiliation: (L.institution || S.settings.institution || '').trim(),
    course: (L.course || '').trim(), date: titleDate(L.createdAt), length: fmtClock(L.ms || 0),
    runningHead: running.length > 50 ? running.slice(0, 47).replace(/\s+\S*$/, '') + '…' : running,
    abstract: sb.abstract, keywords: sb.keywords || (L.notes?.keywords || []).join(', '), body: sb.body,
    cite: lectureRef(L, L.notes?.lectureTitle), refs: referenceList(L), kind: { cornell: 'Lecture Notes · Cornell Format', outline: 'Lecture Notes · Outline', handout: 'Short Communication' }[L.notes?.style] || 'Lecture Notes'
  };
}
function apaHtml(L) {
  const c = composeApa(L);
  const aff = [c.affiliation, c.course].filter(Boolean).join(', ');
  return `<article class="jr">
    <header class="jr-mast"><span class="jr-journal">${JOURNAL}</span><span>${esc([c.course, c.date].filter(Boolean).join(' · '))}</span></header>
    <div class="jr-head">
      <p class="jr-kicker">${esc(c.kind)}</p>
      <h1 class="jr-title">${inl(c.title)}${c.subtitle ? `<span class="jr-sub">${inl(c.subtitle)}</span>` : ''}</h1>
      <p class="jr-authors">${esc(c.lecturer || 'Lecturer not set')}${aff ? '<sup>1</sup>' : ''}</p>
      ${aff ? `<p class="jr-affil"><sup>1</sup>${esc(aff)}</p>` : ''}
      <dl class="jr-meta"><div><dt>Lecture date</dt><dd>${esc(c.date)}</dd></div>${c.length !== '0:00' ? `<div><dt>Recorded</dt><dd>${esc(c.length)}</dd></div>` : ''}${c.author ? `<div><dt>Notes prepared by</dt><dd>${esc(c.author)}</dd></div>` : ''}</dl>
    </div>
    ${c.abstract || c.keywords ? `<section class="jr-abstract" aria-label="Abstract"><h2>Abstract</h2>${mdToHtml(c.abstract)}${c.keywords ? `<p class="jr-kw"><em>Keywords:</em> ${esc(c.keywords)}</p>` : ''}</section>` : ''}
    <p class="jr-cite"><b>Cite this lecture:</b> ${inl(c.cite)}</p>
    <div class="jr-body">${mdToHtml(c.body)}<section class="jr-refs"><h2>References</h2>${c.refs.map(r => `<p class="apa-ref">${inl(r)}</p>`).join('')}</section></div>
    <footer class="jr-foot"><span>${esc(c.runningHead)}</span><span>${JOURNAL}</span></footer>
  </article>`;
}
function ensureJournalCss() { if (!document.getElementById('jr-css')) { const st = document.createElement('style'); st.id = 'jr-css'; st.textContent = JOURNAL_CSS; document.head.appendChild(st); } }
function apaMarkdown(L) {
  const c = composeApa(L);
  return [`*${JOURNAL} · ${c.kind}*`, '', `# ${c.fullTitle}`, '', `**${c.lecturer}**${[c.affiliation, c.course].filter(Boolean).length ? '  \n' + [c.affiliation, c.course].filter(Boolean).join(', ') : ''}  \n${c.date}${c.author ? `  \nNotes prepared by ${c.author}` : ''}`, '',
    c.abstract ? `## Abstract\n\n${c.abstract}` : '', c.keywords ? `\n*Keywords:* ${c.keywords}` : '', '', `**Cite this lecture:** ${c.cite}`, '', '---', '', c.body, '', '## References', '', c.refs.join('\n\n')].join('\n').replace(/\n{3,}/g, '\n\n');
}
function apaStandalone(L) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(composeApa(L).fullTitle)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=Source+Sans+3:wght@400;600;700&display=swap">
<style>body{margin:0;background:#e6e8e7;padding:24px 12px}${JOURNAL_CSS}</style></head><body>${apaHtml(L)}</body></html>`;
}
/* Journal-article look: masthead, title block, boxed abstract, two-column body (wide screens and print), references in the flow. */
const JOURNAL_CSS = `
.jr{--jr-ink:#141414;--jr-mute:#5b5b5b;--jr-rule:#c9c9c9;--jr-accent:#1d6b57;--jr-box:#f2f5f4;background:#fff;color:var(--jr-ink);max-width:8.5in;margin:0 auto;padding:clamp(20px,6vw,.8in);font:15px/1.55 "Source Serif 4",Tinos,"Times New Roman",serif;box-shadow:0 1px 4px rgba(0,0,0,.12);border-radius:3px;overflow-wrap:anywhere}
.jr *{box-sizing:border-box}
.jr-mast{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font:600 11px/1.3 "Source Sans 3","Atkinson Hyperlegible",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--jr-mute);border-bottom:2px solid var(--jr-ink);padding-bottom:6px}
.jr-journal{color:var(--jr-accent)}
.jr-head{padding:22px 0 14px}
.jr-kicker{margin:0 0 8px;font:700 11px/1 "Source Sans 3",system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--jr-accent)}
.jr-title{margin:0;font:700 clamp(24px,4.4vw,34px)/1.15 "Source Serif 4",Tinos,serif;letter-spacing:-.01em;text-wrap:balance;text-align:left;border:0;padding:0;color:var(--jr-ink)}
.jr-sub{display:block;font-weight:400;font-size:.62em;line-height:1.3;margin-top:6px;color:#333}
.jr-authors{margin:14px 0 0;font:600 15px/1.4 "Source Sans 3",system-ui,sans-serif}
.jr-affil{margin:2px 0 0;font:italic 13px/1.4 "Source Serif 4",serif;color:var(--jr-mute)}
.jr sup{font-size:.7em;line-height:0}
.jr-meta{display:flex;flex-wrap:wrap;gap:4px 22px;margin:12px 0 0;font:12px/1.4 "Source Sans 3",system-ui,sans-serif;color:var(--jr-mute)}
.jr-meta div{display:flex;gap:6px}.jr-meta dt{font-weight:700}.jr-meta dd{margin:0}
.jr-abstract{background:var(--jr-box);border-top:1px solid var(--jr-ink);border-bottom:1px solid var(--jr-ink);padding:14px 18px;margin:6px 0 10px;font-size:14px}
.jr-abstract h2{margin:0 0 6px;font:700 12px/1 "Source Sans 3",system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;text-align:left;border:0;padding:0;color:var(--jr-ink)}
.jr-abstract p{margin:0 0 .5em;text-indent:0;text-align:justify;hyphens:auto}
.jr-kw{margin:6px 0 0!important}
.jr-cite{margin:0 0 18px;font:12.5px/1.45 "Source Sans 3",system-ui,sans-serif;color:var(--jr-mute);padding-left:2em;text-indent:-2em}
.jr-body{border-top:1px solid var(--jr-rule);padding-top:16px}
@media (min-width:760px){.jr-body{column-count:2;column-gap:28px;column-rule:1px solid #e3e3e3}}
.jr-body h2{font:700 14px/1.3 "Source Sans 3",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;text-align:center;margin:18px 0 8px;break-after:avoid;border:0;padding:0;color:var(--jr-ink)}
.jr-body > h2:first-child{margin-top:0}
.jr-body h3{font:700 14.5px/1.35 "Source Sans 3",system-ui,sans-serif;margin:14px 0 4px;break-after:avoid}
.jr-body h4{font:italic 700 14.5px/1.35 "Source Serif 4",serif;margin:12px 0 4px;break-after:avoid}
.jr-body h5{font:700 14.5px/1.4 "Source Serif 4",serif;margin:8px 0 2px}
.jr-body p{margin:0;text-indent:1.4em;text-align:justify;hyphens:auto}
.jr-body h2+p,.jr-body h3+p,.jr-body h4+p,.jr-body .table-wrap+p,.jr-body ul+p,.jr-body ol+p,.jr-body blockquote+p{text-indent:0}
.jr-body ul,.jr-body ol{margin:.35em 0 .5em;padding-left:1.3em}.jr-body li{margin:.15em 0}
.jr-body blockquote{margin:.6em 0;padding:.4em .8em;border-left:3px solid var(--jr-accent);background:var(--jr-box);break-inside:avoid}
.jr-body blockquote p{text-indent:0}
.jr-body p:has(> strong:only-child){text-indent:0;margin-top:.8em;font:700 12.5px/1.3 "Source Sans 3",system-ui,sans-serif}
.jr-body p:has(> em:only-child){text-indent:0;font-size:13px;margin-bottom:.3em}
.jr-body .table-wrap{overflow-x:auto;margin:.2em 0 .9em;break-inside:avoid}
.jr-body table{border-collapse:collapse;width:100%;font:12.5px/1.4 "Source Sans 3",system-ui,sans-serif}
.jr-body th{border-top:1.5px solid var(--jr-ink);border-bottom:1px solid var(--jr-ink);text-align:left;padding:5px 6px;background:none;font-weight:700}
.jr-body td{border:0;padding:5px 6px;vertical-align:top}
.jr-body tbody tr:last-child td{border-bottom:1.5px solid var(--jr-ink)}
.jr-body code{font-family:ui-monospace,monospace;font-size:.85em}
.jr-refs{margin-top:16px;padding-top:10px;border-top:1px solid var(--jr-rule);font-size:13px}
.jr-refs .apa-ref{text-indent:-1.6em!important;padding-left:1.6em;margin:0 0 .45em;text-align:left;break-inside:avoid}
.jr-foot{display:flex;justify-content:space-between;gap:12px;margin-top:22px;padding-top:8px;border-top:1px solid var(--jr-rule);font:600 10.5px/1.3 "Source Sans 3",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--jr-mute)}
.jr a{color:inherit}
@media print{.jr{box-shadow:none;max-width:none;padding:0;font-size:10pt}.jr-body{column-count:2;column-gap:.3in}}`;

/* ---- Prompting ---- */
const NOTE_FORMATS = {
  study: `Organize the notes as study notes: one ## Level 1 heading per major topic in lecture order (### for subtopics, #### only if needed). Under each heading write short indented paragraphs and bulleted lists; **bold** key terms the first time they appear; use a small table where it helps to compare things. After the Conclusion, add a ## Key Terms section (table: Term | Meaning) and a ## Review Questions section (4–6 open questions, no answers).`,
  cornell: `Organize the notes in Cornell format: one ## Level 1 heading per major topic; under each, a table with columns Cue / Question | Notes, pairing a short cue question with concise notes that answer it. After the Conclusion, add a ## Key Terms section (table: Term | Meaning).`,
  outline: `Organize the notes as an outline: one ## Level 1 heading per major topic, each opening with one sentence of context and then a nested numbered list (main points → sub-points → details/examples). After the Conclusion, add a ## Key Terms section (table: Term | Meaning).`,
  handout: `Write a short communication: the whole body is at most 900 words. Keep the Introduction to one paragraph, use two to four concise ## Level 1 sections, then the Conclusion, then ## Key Terms (table, at most 8 rows).`
};
let notesCtl = null, notesRAF = 0;
async function detectCitation(f, { quiet } = {}) {
  if (!aiReady() || !f.text) return false;
  try {
    const out = await callAI({
      fast: true, json: true, maxTokens: 600,
      system: 'You extract APA 7 reference metadata from the start of a document. Use only what the document clearly states — never guess or invent. Reply with JSON only.',
      user: `File name: ${f.name}\nDocument properties: ${JSON.stringify(f.props || {})}\n\nBeginning of the document:\n${f.text.slice(0, 4000)}\n\nReturn {"authors":["First M. Last", ...],"year":"","title":"","source":"","url":"","kind":"document|article|book|chapter|webpage|slides|report|transcript"}. "source" is the journal, publisher, website or organization. Use empty strings or an empty array when not stated. Write the title in APA sentence case.`
    });
    const j = parseJson(out);
    f.cite = f.cite || {};
    const set = (k, v) => { if (v && !f.cite[k]) f.cite[k] = v; };
    set('authors', (j.authors || []).filter(Boolean).join('; '));
    set('year', String(j.year || '').match(/\d{4}/)?.[0] || '');
    set('title', j.title); set('source', j.source); set('url', j.url);
    if (j.kind && !f.cite.kind && CITE_KINDS.some(k => k[0] === j.kind)) f.cite.kind = j.kind;
    f.cite.checked = true; saveSoon();
    return true;
  } catch (e) { if (!quiet) toast(e.message === 'NO_AI' ? 'Choose an AI model in Settings first.' : e.message, 4000); f.cite = { ...(f.cite || {}), checked: true }; return false; }
}
async function generateNotes() {
  const L = S.lecture;
  if (!speechSegs(L).length) { toast('Record, type or import a transcript first.'); return; }
  if (!lecturerOf(L)) { openLectureSheet(true); toast('Add the lecturer’s name so the notes can cite the lecture.', 4000); return; }
  const style = $('#notes-style').value, aud = $('#notes-audience').value, lv = $('#notes-lang').value;
  const lang = lv === 'src' ? srcName(S.settings.srcLang) : tgtName(lv);
  const useFiles = $('#notes-use-files').checked;
  if (!aiReady()) {
    L.notes = { md: buildLocalNotes(L, useFiles), style, local: true, at: Date.now() };
    saveSoon(); S.ui.notesEdit = false; renderNotes(); toast('Notes organized on this device'); return;
  }
  notesCtl = new AbortController();
  setNotesBusy(true, 'Checking sources…');
  const files = useFiles ? citedFiles(L) : [];
  for (const f of files) if (f.text && !f.cite?.checked && !(f.cite?.authors)) await detectCitation(f, { quiet: true });
  const mat = useFiles ? materials('useNotes') : { text: '', images: [], names: [] };
  const sources = [`- LECTURE — the transcript itself. Cite as ${lectureInText(L)}. For a direct quotation add the timestamp, e.g. (${inTextAuthors([lecturerOf(L)])}, ${yearOf(L.createdAt)}, 12:40).`,
    ...files.map((f, i) => `- F${i + 1} — material "${f.name}". Cite as ${fileInText(f)}.`)].join('\n');
  const system = `You are an expert instructional designer and science editor who turns raw lecture transcripts into notes written and structured like a scientific journal article, using APA 7th edition citation style.
The transcript comes from live speech recognition: it may lack punctuation and contain misheard words, filler words and false starts. Clean these up silently. When a misheard word is obvious from context or from the materials, use the correct word. Do not add facts that are not supported by the transcript or the materials; where the recording is unclear, write "(unclear in recording)".
Lines marked ★KEY POINT were flagged by the instructor as important: every one must appear in the notes, and the most important belong in the abstract. Lines like "== TOPIC: … ==" are section breaks the instructor set: use them as Level 1 headings.
Write for ${AUDIENCE[aud]}, in ${lang}, in the formal, precise register of a journal article: third person, complete paragraphs, past tense for what the lecturer said (e.g. "Shippee explained that…") and present tense for established facts, each supported by a citation.

Output GitHub-flavored Markdown in exactly this order:
1. "# Title: Subtitle" — a concise, descriptive APA title in title case, with a subtitle after a colon.
2. "## Abstract" followed by one paragraph of 150–220 words that states the lecture's purpose, its main points and their significance, like a journal abstract.
3. A line "*Keywords:* " followed by 5–8 keywords or key phrases, lowercase except proper nouns, separated by commas.
4. The body, organized like a journal article. Use APA heading levels: "##" = Level 1, "###" = Level 2, "####" = Level 3, headings in title case.
   - Begin with "## Introduction": one or two paragraphs that set out the background, why the topic matters, and what the lecture covered.
   - Then the main sections described below.
   - Then "## Conclusion": one or two paragraphs that synthesize the main findings and their implications, and note what comes next if the lecture says so.
${NOTE_FORMATS[style]}
   Any Key Terms or Review Questions sections come after the Conclusion.
Before each table write "**Table N**" on its own line, then the table title in italic title case on the next line.

Citations (APA 7 in-text): cite the sources below using exactly the in-text forms given, placed at the end of the sentence or paragraph they support. Cite the lecture at least once per Level 1 section. Cite a material wherever its content is used. Do not cite anything else and do not write a References section — it is added automatically.
${sources}

After the notes, output exactly one final line and nothing after it:
<!--didasko {"lectureTitle":"<the lecture's title in APA sentence case>","titles":{"F1":"<title of F1 in APA sentence case>"}}-->
Include every F-number listed above in "titles".`;
  const user = `${lectureHeader(L)}\nLecturer: ${lecturerOf(L)}\n\n<transcript>\n${transcriptForPrompt(L)}\n</transcript>${mat.text ? `\n\n<materials>\n${files.map((f, i) => `F${i + 1} = ${f.name}`).join('\n')}\n${mat.text}\n</materials>` : ''}${mat.images.length ? `\n\nAttached images: ${mat.images.map(i => i.name).join(', ')} (photos or slides from the lecture).` : ''}`;
  setNotesBusy(true, 'Reading the transcript…');
  const prev = L.notes;
  let latest = '';
  const show = t => { L.notes = { ...(L.notes || {}), md: stripFences(t.split('<!--didasko')[0]) }; const d = $('#notes-doc'); d.className = 'apa'; ensureJournalCss(); d.innerHTML = apaHtml(L); };
  try {
    const out = await callAI({
      system, user, images: mat.images, maxTokens: 9000, signal: notesCtl.signal,
      onText: t => { latest = t; $('#notes-status-text').textContent = 'Writing notes…'; if (!notesRAF) notesRAF = requestAnimationFrame(() => { notesRAF = 0; show(latest); }); }
    });
    const [body, meta] = out.split('<!--didasko');
    let extra = {};
    try { extra = JSON.parse((meta || '').replace(/-->[\s\S]*$/, '').trim() || '{}'); } catch { extra = {}; }
    const titles = {};
    files.forEach((f, i) => { const t = extra.titles?.['F' + (i + 1)]; if (t) titles[f.id] = String(t).trim(); });
    const md = stripFences(body);
    L.notes = { md, style, at: Date.now(), lang, lectureTitle: (extra.lectureTitle || '').trim() || null, titles, keywords: splitBody(md).keywords.split(/,\s*/).filter(Boolean) };
    toast('Notes ready');
  } catch (e) {
    if (notesCtl?.signal.aborted) { if (latest) L.notes = { md: stripFences(latest.split('<!--didasko')[0]), style, at: Date.now(), partial: true }; else L.notes = prev; toast('Stopped'); }
    else { L.notes = prev; toast(e.message === 'NO_AI' ? 'Choose an AI model in Settings first.' : e.message, 5000); }
  } finally { notesCtl = null; setNotesBusy(false); saveSoon(); renderNotes(); }
}
function buildLocalNotes(L, useFiles) {
  const sections = []; let cur = null, count = 0;
  const hasTopics = L.segments.some(x => x.kind === 'topic');
  for (const s of L.segments) {
    if (s.kind === 'topic') { cur = { title: s.text, items: [] }; sections.push(cur); count = 0; continue; }
    if (!cur || (!hasTopics && count >= 6)) { cur = { title: null, start: s.t, items: [] }; sections.push(cur); count = 0; }
    cur.items.push(s); cur.end = s.t; count++;
  }
  const segs = speechSegs(L);
  const all = segs.map(s => s.text).join('. ');
  const kws = keyTerms(all, 7);
  const cite = lectureInText(L);
  const abs = sentencesOf(segs.filter(s => s.key).map(s => s.text).join('. ') || all).slice(0, 5).join(' ');
  let md = `# ${L.title}\n\n## Abstract\n${abs} ${cite}\n\n*Keywords:* ${kws.join(', ')}\n\n## Introduction\n> Organized on this device without AI. Choose an AI model in Settings for a fully written journal-style article.\n\nThis lecture, ${L.course ? `part of ${L.course}, ` : ''}addressed ${kws.slice(0, 3).join(', ')} ${cite}.\n\n`;
  const keys = segs.filter(s => s.key);
  if (keys.length) md += `## Key Points Emphasized in Class\n${keys.map(s => `- ${endDot(s.text)}`).join('\n')} ${cite}\n\n`;
  sections.forEach((sec, i) => {
    if (!sec.items.length) return;
    md += `## ${sec.title || `Part ${i + 1} (${fmtClock(sec.start)}–${fmtClock(sec.end)})`}\n`;
    sec.items.forEach(s => sentencesOf(s.text).forEach(t => { md += `- ${s.key ? '★ ' : ''}${t}\n`; }));
    md += `\n${cite.replace(/^\(|\)$/g, '') ? `Source: ${cite}` : ''}\n\n`;
  });
  const fs = useFiles ? citedFiles(L) : [];
  if (fs.length) md += `## Lecture Materials\n${fs.map(f => `- **${fileCite(f).title}** — ${f.text ? f.text.split(/\s+/).slice(0, 28).join(' ') + '…' : 'image'} ${fileInText(f)}`).join('\n')}\n`;
  return md;
}
function setNotesBusy(on, msg) {
  $('#notes-status').hidden = !on; if (msg) $('#notes-status-text').textContent = msg;
  $('#notes-generate').disabled = on; $('#notes-stop').hidden = !on;
  $('#notes-tools').style.visibility = on ? 'hidden' : '';
  if (on) { S.ui.notesEdit = false; $('#notes-editor').hidden = true; $('#notes-doc').hidden = false; $('#notes-doc').innerHTML = ''; }
}
function renderNotesCite() {
  const L = S.lecture, el = $('#notes-cite');
  if (!el) return;
  const lec = lecturerOf(L);
  el.innerHTML = lec
    ? `Lecture cited as <b>${inl(lectureInText(L))}</b> · ${citedFiles(L).length} more source${citedFiles(L).length === 1 ? '' : 's'} in References · <button class="linklike" id="notes-cite-edit">Edit</button>`
    : `<b>Add the lecturer’s name</b> so the notes can cite the lecture. <button class="linklike" id="notes-cite-edit">Add</button>`;
  $('#notes-cite-edit').onclick = () => openLectureSheet(true);
}
function renderNotes() {
  const L = S.lecture, doc = $('#notes-doc'), ed = $('#notes-editor');
  const has = !!L.notes?.md;
  renderNotesCite();
  $('#notes-tools').style.visibility = has ? '' : 'hidden';
  $('#notes-generate span').textContent = has ? 'Regenerate notes' : 'Generate notes';
  $('#notes-edit span').textContent = S.ui.notesEdit ? 'Done' : 'Edit';
  if (S.ui.notesEdit && has) { ed.hidden = false; doc.hidden = true; ed.value = L.notes.md; return; }
  ed.hidden = true; doc.hidden = false;
  doc.className = has ? 'apa' : 'doc';
  if (has) { ensureJournalCss(); doc.innerHTML = apaHtml(L); return; }
  const n = speechSegs(L).length;
  doc.innerHTML = `<div class="empty"><h3>${n ? 'Ready to organize' : 'No notes yet'}</h3><p>${n ? `${n} transcript lines and ${citedFiles(L).length} lecture files are ready. Choose a format above and tap Generate notes. Notes are laid out like a journal article — title block, abstract, keywords, sections and APA references.` : 'Start captions on the Live tab, or import a transcript, and Didasko will turn it into notes laid out like a journal article.'}</p></div>`;
}
async function exportNotes(t) {
  const L = S.lecture, name = slug(L.title);
  if (t === 'docx') { const d = apaDocBlocks(L); return saveFile(name + '-notes.docx', await buildDocx(d.blocks, composeApa(L).fullTitle, { journal: true, runningHead: d.runningHead, footer: d.footer })); }
  if (t === 'html') return saveFile(name + '-notes.html', apaStandalone(L), 'text/html');
  if (t === 'md') return saveFile(name + '-notes.md', apaMarkdown(L), 'text/markdown');
  if (t === 'print') return printHtml(`<style>${JOURNAL_CSS.replace(/\.jr/g, '#print-root .jr')}</style>${apaHtml(L)}`);
  if (t === 'copy') return copyText(mdToText(apaMarkdown(L)));
  if (t === 'transcript') return saveFile(name + '-transcript.txt', L.segments.map(s => s.kind === 'topic' ? `\n## ${s.text}\n` : `[${fmtClock(s.t)}] ${s.key ? '★ ' : ''}${s.text}${target() && s.tr?.[target()] ? `\n         ${s.tr[target()]}` : ''}`).join('\n'), 'text/plain');
}
function apaDocBlocks(L) {
  const c = composeApa(L), B = [];
  const aff = [c.affiliation, c.course].filter(Boolean).join(', ');
  B.push({ type: 'p', style: 'Masthead', runs: [{ text: JOURNAL.toUpperCase() }, { text: '\t' }, { text: [c.course, c.date].filter(Boolean).join(' · ').toUpperCase() }] });
  B.push({ type: 'p', style: 'Kicker', runs: [{ text: c.kind.toUpperCase() }] });
  B.push({ type: 'p', style: 'ArticleTitle', runs: parseInline(c.title) });
  if (c.subtitle) B.push({ type: 'p', style: 'Subtitle', runs: parseInline(c.subtitle) });
  B.push({ type: 'p', style: 'Authors', runs: [{ text: c.lecturer || 'Lecturer not set' }, ...(aff ? [{ text: '1', sup: true }] : [])] });
  if (aff) B.push({ type: 'p', style: 'Affiliation', runs: [{ text: '1', sup: true }, { text: aff }] });
  B.push({ type: 'p', style: 'Meta', runs: [{ text: 'Lecture date: ', b: true }, { text: c.date }, ...(c.length !== '0:00' ? [{ text: '    Recorded: ', b: true }, { text: c.length }] : []), ...(c.author ? [{ text: '    Notes prepared by: ', b: true }, { text: c.author }] : [])] });
  if (c.abstract || c.keywords) {
    B.push({ type: 'p', style: 'AbstractHeading', runs: [{ text: 'ABSTRACT' }] });
    parseMd(c.abstract).forEach(b => B.push({ type: 'p', style: 'Abstract', runs: parseInline(b.text || '') }));
    if (c.keywords) B.push({ type: 'p', style: 'Keywords', runs: [{ text: 'Keywords: ', i: true }, { text: c.keywords }] });
  }
  B.push({ type: 'p', style: 'CiteLine', runs: [{ text: 'Cite this lecture: ', b: true }, ...parseInline(c.cite)] });
  B.push({ type: 'section', cols: 1 });
  let prevHead = true;
  parseMd(c.body).forEach(b => {
    const label = b.type === 'p' && (/^\*\*(Table|Figure) \d+\*\*$/.test(b.text) || /^\*[^*]+\*$/.test(b.text));
    B.push(b.type === 'p' ? { ...b, noIndent: prevHead || label, style: label ? 'TableLabel' : undefined } : b);
    prevHead = b.type === 'h' || b.type === 'table' || b.type === 'list' || label;
  });
  B.push({ type: 'h', level: 2, text: 'References' });
  c.refs.forEach(r => B.push({ type: 'ref', text: r }));
  B.push({ type: 'section', cols: 2, continuous: true }); // ends the two-column body so Word balances the columns
  return { blocks: B, runningHead: c.runningHead, footer: [JOURNAL, c.course].filter(Boolean).join(' · ') };
}

/* ---- DOCX writer (WordprocessingML via JSZip). opts.journal: two-column journal article; otherwise a plain document ---- */
const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function docxRuns(runs, base = {}) {
  return runs.map(r0 => {
    const r = { ...base, ...r0 };
    if (r.text === '\t') return '<w:r><w:tab/></w:r>';
    const pr = [r.b && '<w:b/>', r.i && '<w:i/>', r.code && '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>', r.href && '<w:u w:val="single"/>', r.sup && '<w:vertAlign w:val="superscript"/>'].filter(Boolean).join('');
    return String(r.text).split('\n').map((t, k) => `${k ? '<w:r><w:br/></w:r>' : ''}<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xe(t)}</w:t></w:r>`).join('');
  }).join('');
}
const SANS = 'w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"';
function journalStyles(W) {
  const st = (id, name, ppr, rpr, based = 'Normal') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${based}"/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  const shade = '<w:shd w:val="clear" w:color="auto" w:fill="F2F5F4"/>', box = '<w:ind w:left="0" w:right="0" w:firstLine="0"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:jc w:val="both"/><w:ind w:firstLine="284"/></w:pPr></w:style>
  ${st('Masthead', 'Masthead', '<w:tabs><w:tab w:val="right" w:pos="10080"/></w:tabs><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="3" w:color="141414"/></w:pBdr><w:spacing w:after="240"/>', `<w:rFonts ${SANS}/><w:b/><w:color w:val="555555"/><w:spacing w:val="16"/><w:sz w:val="15"/>`)}
  ${st('Kicker', 'Article type', '<w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:after="80"/>', `<w:rFonts ${SANS}/><w:b/><w:color w:val="1D6B57"/><w:spacing w:val="20"/><w:sz w:val="16"/>`)}
  ${st('ArticleTitle', 'Title', '<w:keepNext/><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:after="60" w:line="240" w:lineRule="auto"/>', '<w:b/><w:sz w:val="44"/><w:szCs w:val="44"/>')}
  ${st('Subtitle', 'Subtitle', '<w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:after="160"/>', '<w:color w:val="333333"/><w:sz w:val="28"/>')}
  ${st('Authors', 'Authors', '<w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:before="80"/>', `<w:rFonts ${SANS}/><w:b/><w:sz w:val="21"/>`)}
  ${st('Affiliation', 'Affiliation', '<w:jc w:val="left"/><w:ind w:firstLine="0"/>', '<w:i/><w:color w:val="555555"/><w:sz w:val="18"/>')}
  ${st('Meta', 'Article metadata', '<w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:before="100" w:after="200"/>', `<w:rFonts ${SANS}/><w:color w:val="555555"/><w:sz w:val="16"/>`)}
  ${st('AbstractHeading', 'Abstract heading', `<w:keepNext/>${shade}${box}<w:pBdr><w:top w:val="single" w:sz="6" w:space="6" w:color="141414"/></w:pBdr><w:spacing w:after="60"/>`, `<w:rFonts ${SANS}/><w:b/><w:spacing w:val="20"/><w:sz w:val="16"/>`)}
  ${st('Abstract', 'Abstract', `${shade}${box}<w:jc w:val="both"/><w:spacing w:after="60"/>`, '<w:sz w:val="19"/>')}
  ${st('Keywords', 'Keywords', `${shade}${box}<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="141414"/></w:pBdr><w:jc w:val="left"/>`, '<w:sz w:val="19"/>')}
  ${st('CiteLine', 'Citation line', '<w:jc w:val="left"/><w:ind w:left="284" w:hanging="284"/><w:spacing w:before="160" w:after="240"/>', `<w:rFonts ${SANS}/><w:color w:val="555555"/><w:sz w:val="16"/>`)}
  ${st('Heading1', 'heading 1', '<w:keepNext/><w:jc w:val="center"/><w:ind w:firstLine="0"/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="0"/>', `<w:rFonts ${SANS}/><w:b/><w:caps/><w:spacing w:val="10"/><w:sz w:val="19"/>`)}
  ${st('Heading2', 'heading 2', '<w:keepNext/><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:before="160" w:after="40"/><w:outlineLvl w:val="1"/>', `<w:rFonts ${SANS}/><w:b/><w:sz w:val="19"/>`)}
  ${st('Heading3', 'heading 3', '<w:keepNext/><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:before="120" w:after="20"/><w:outlineLvl w:val="2"/>', '<w:b/><w:i/>')}
  ${st('ListParagraph', 'List Paragraph', '<w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:after="30"/>', '')}
  ${st('TableLabel', 'Table label', '<w:keepNext/><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:before="120"/>', `<w:rFonts ${SANS}/><w:sz w:val="17"/>`)}
  ${st('TableText', 'Table text', '<w:keepNext/><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:line="240" w:lineRule="auto"/>', `<w:rFonts ${SANS}/><w:sz w:val="16"/>`)}
  ${st('Reference', 'Reference', '<w:jc w:val="left"/><w:ind w:left="284" w:hanging="284"/><w:spacing w:after="50"/>', '<w:sz w:val="17"/>')}
  ${st('Quote', 'Quote', `${shade}<w:ind w:left="142" w:right="0" w:firstLine="0"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="1D6B57"/></w:pBdr><w:spacing w:before="80" w:after="80"/>`, '')}
  ${st('Footer', 'footer', '<w:tabs><w:tab w:val="right" w:pos="10080"/></w:tabs><w:ind w:firstLine="0"/><w:jc w:val="left"/>', `<w:rFonts ${SANS}/><w:color w:val="666666"/><w:sz w:val="14"/>`)}
  </w:styles>`;
}
function plainStyles(W) {
  const hfont = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia" w:eastAsia="Georgia"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="15201C"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr>${hfont}<w:b/><w:sz w:val="30"/><w:color w:val="1D6B57"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr>${hfont}<w:b/><w:sz w:val="25"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr>${hfont}<w:b/><w:i/><w:sz w:val="23"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/><w:contextualSpacing/></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="Reference"><w:name w:val="Reference"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="567"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="F2CB52"/></w:pBdr></w:pPr><w:rPr><w:color w:val="4A5853"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="right"/></w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:style>
  </w:styles>`;
}
async function buildDocx(blocks, title, opts = {}) {
  const JSZip = await lib('jszip');
  const jr = !!opts.journal, nums = [];
  const para = (inner, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${inner}</w:p>`;
  const hStyle = lv => jr ? 'Heading' + Math.max(1, Math.min(3, lv - 1)) : (lv === 1 ? 'Title' : 'Heading' + Math.min(3, lv - 1));
  const M = jr ? 1080 : 1260;
  const refs = '<w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/>';
  const page = `<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="${M}" w:right="${M}" w:bottom="${M}" w:left="${M}" w:header="540" w:footer="540" w:gutter="0"/>`;
  const body = blocks.map(b => {
    const runs = b.runs || parseInline(b.text || '');
    switch (b.type) {
      case 'h': return para(docxRuns(runs), `<w:pStyle w:val="${hStyle(b.level)}"/>`);
      case 'p': return para(docxRuns(runs), (b.style ? `<w:pStyle w:val="${b.style}"/>` : '') + (b.indent ? '<w:ind w:left="567"/><w:spacing w:after="40"/>' : (jr && b.noIndent && !b.style ? '<w:ind w:firstLine="0"/>' : '')));
      case 'section': return `<w:p><w:pPr><w:sectPr>${refs}${b.continuous ? '<w:type w:val="continuous"/>' : ''}${page}<w:cols w:num="${b.cols || 1}" w:space="400"/></w:sectPr></w:pPr></w:p>`;
      case 'ref': return para(docxRuns(runs), '<w:pStyle w:val="Reference"/>');
      case 'quote': return para(docxRuns(runs, jr ? {} : { i: true }), '<w:pStyle w:val="Quote"/>');
      case 'code': return para(docxRuns([{ text: b.text, code: true }]), '<w:ind w:firstLine="0"/>');
      case 'hr': return para('', '<w:ind w:firstLine="0"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>');
      case 'pagebreak': return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      case 'list': {
        let numId = null;
        return b.items.map(it => {
          let id = 1;
          if (it.ordered) { if (!numId) { nums.push(nums.length + 2); numId = nums[nums.length - 1]; } id = numId; }
          return para(docxRuns(parseInline(it.text)), `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${Math.min(it.level, 4)}"/><w:numId w:val="${id}"/></w:numPr>`);
        }).join('');
      }
      case 'table': {
        const line = 'w:val="single" w:sz="8" w:space="0" w:color="141414"', soft = 'w:val="single" w:sz="4" w:space="0" w:color="C9D3CF"';
        const cell = (t, head) => `<w:tc><w:tcPr>${head ? (jr ? `<w:tcBorders><w:bottom ${line}/></w:tcBorders>` : '<w:shd w:val="clear" w:color="auto" w:fill="E6EEEA"/>') : ''}</w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr>${docxRuns(parseInline(t), head ? { b: true } : {})}</w:p></w:tc>`;
        const borders = jr ? `<w:top ${line}/><w:bottom ${line}/>` : `<w:top ${soft}/><w:left ${soft}/><w:bottom ${soft}/><w:right ${soft}/><w:insideH ${soft}/><w:insideV ${soft}/>`;
        return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>`
          + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.head.map(c => cell(c, true)).join('')}</w:tr>` + b.rows.map(r => `<w:tr>${b.head.map((_, k) => cell(r[k] || '', false)).join('')}</w:tr>`).join('') + '</w:tbl>' + para('', '<w:ind w:firstLine="0"/><w:spacing w:after="80"/>');
      }
      default: return '';
    }
  }).join('');
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const ind = (i) => jr ? `<w:ind w:left="${300 + i * 260}" w:hanging="240"/>` : `<w:ind w:left="${720 + i * 360}" w:hanging="360"/>`;
  const lvl = (i, fmt, text, font) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr>${ind(i)}</w:pPr>${font ? `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:hint="default"/></w:rPr>` : ''}</w:lvl>`;
  const bulletLv = [0, 1, 2, 3, 4].map(i => i % 2 ? lvl(i, 'bullet', 'o', 'Courier New') : lvl(i, 'bullet', '', 'Symbol')).join('');
  const orderedLv = [['decimal', '%1.'], ['lowerLetter', '%2.'], ['lowerRoman', '%3.'], ['decimal', '%4.'], ['lowerLetter', '%5.']].map(([f, t], i) => lvl(i, f, t)).join('');
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>
    <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bulletLv}</w:abstractNum>
    <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${orderedLv}</w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
    ${nums.map(n => `<w:num w:numId="${n}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('')}
  </w:numbering>`;
  const pageField = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const header = jr
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="10080"/></w:tabs><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts ${SANS}/><w:sz w:val="15"/><w:color w:val="555555"/><w:spacing w:val="12"/></w:rPr><w:t xml:space="preserve">${xe(opts.runningHead || title.toUpperCase())}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:rPr><w:rFonts ${SANS}/><w:sz w:val="16"/></w:rPr></w:r>${pageField}</w:p></w:hdr>`
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${pageField}</w:p></w:hdr>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:t xml:space="preserve">${xe(opts.footer || 'Prepared with Didasko')}</w:t></w:r></w:p></w:ftr>`;
  const finalSect = `<w:sectPr>${refs}${jr ? '<w:type w:val="continuous"/>' : ''}${page}<w:cols w:num="1" w:space="400"/></w:sectPr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}${finalSect}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(title)}</dc:title><dc:creator>Didasko</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  zip.file('word/document.xml', doc);
  zip.file('word/styles.xml', jr ? journalStyles(W) : plainStyles(W));
  zip.file('word/numbering.xml', numbering);
  zip.file('word/header1.xml', header);
  zip.file('word/footer1.xml', footer);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ---- Citation editor on file cards ---- */
function citeEditorHtml(f) {
  const c = f.cite || {};
  const opt = CITE_KINDS.map(([k, l]) => `<option value="${k}" ${(c.kind || FILE_KIND[f.kind] || 'document') === k ? 'selected' : ''}>${l}</option>`).join('');
  return `<details class="cite-box" ${f._openCite ? 'open' : ''}><summary>APA citation · <span class="cite-intext">${inl(fileInText(f))}</span></summary>
    <p class="cite-ref">${inl(fileRef(f))}</p>
    <div class="grid-2 stack-sm">
      <label class="field"><span>Author(s) — separate with ;</span><input data-cite="authors" value="${esc(c.authors || '')}" placeholder="e.g. Jane Q. Smith; Lee Chen" autocomplete="off"></label>
      <label class="field"><span>Year</span><input data-cite="year" value="${esc(c.year || '')}" placeholder="n.d." inputmode="numeric" autocomplete="off"></label>
      <label class="field"><span>Title</span><input data-cite="title" value="${esc(c.title || '')}" placeholder="${esc(fileCite(f).title)}" autocomplete="off"></label>
      <label class="field"><span>Journal (with volume, pages), publisher or website</span><input data-cite="source" value="${esc(c.source || '')}" autocomplete="off"></label>
      <label class="field"><span>URL or DOI</span><input data-cite="url" value="${esc(c.url || '')}" placeholder="https://…" autocomplete="off" inputmode="url"></label>
      <label class="field"><span>Type</span><select data-cite="kind">${opt}</select></label>
    </div>
    ${f.text ? `<div class="row"><button class="btn sm" data-detect>${icon('spark')}Detect from the file</button></div>` : ''}
  </details>`;
}
function readDocProps(xml) {
  const g = tag => (xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`)) || [])[1];
  const junk = /^(microsoft (word|powerpoint)|untitled|presentation\d*|document\d*|slide \d+|powerpoint presentation)/i;
  const title = unxml(g('dc:title') || '').trim(), author = unxml(g('dc:creator') || '').trim(), created = g('dcterms:created') || '';
  return { title: junk.test(title) ? '' : title, author: /^(user|admin|owner|microsoft office user)$/i.test(author) ? '' : author, year: (created.match(/\d{4}/) || [''])[0] };
}

/* ================= Cloud: Firebase accounts, lecture library, newsletter ================= */
const CFG = window.DIDASKO_CONFIG || {};
const PMODE = new URLSearchParams(location.search).has('join');
const CLOUD = { ready: false, auth: null, db: null, user: null, offset: 0, scope: 'guest' };
const FB_VER = '10.12.2';
const fbUrls = n => [`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-${n}-compat.js`, `https://cdn.jsdelivr.net/npm/firebase@${FB_VER}/firebase-${n}-compat.js`];
const cloudConfigured = () => !IS_ARTIFACT && !!(CFG.firebase && CFG.firebase.apiKey && CFG.firebase.databaseURL);
const isSignedIn = () => !!(CLOUD.user && !CLOUD.user.isAnonymous);
const filesLocked = () => CLOUD.ready && !isSignedIn();
const libraryLocked = () => CLOUD.ready && !isSignedIn();
const K = k => `${CLOUD.scope}:${k}`;
const serverNow = () => Date.now() + (CLOUD.offset || 0);
const TS = () => window.firebase.database.ServerValue.TIMESTAMP;

async function initCloud() {
  if (!cloudConfigured()) return;
  try {
    await loadScript(fbUrls('app'));
    await Promise.all([loadScript(fbUrls('auth')), loadScript(fbUrls('database'))]);
  } catch { toast('Couldn’t load sign-in and live sharing. Check your connection.', 4000); return; }
  try {
    window.firebase.initializeApp(CFG.firebase);
    CLOUD.auth = window.firebase.auth(); CLOUD.db = window.firebase.database();
  } catch (e) { console.warn('Firebase setup failed', e); return; }
  CLOUD.ready = true;
  CLOUD.db.ref('.info/serverTimeOffset').on('value', s => { CLOUD.offset = s.val() || 0; });
  CLOUD.auth.getRedirectResult().then(r => { if (r && r.user) afterSignIn(r, r.credential?.providerId || 'redirect'); }).catch(authError);
  await new Promise(res => { let first = true; CLOUD.auth.onAuthStateChanged(async u => { await onAuth(u); if (first) { first = false; res(); } }); });
}
async function ensureAuth() {
  if (!CLOUD.ready) throw new Error(IS_ARTIFACT ? 'Sharing to students’ devices works in the hosted app, not in this preview.' : 'Live sharing turns on once Didasko is connected to Firebase. See SETUP.md.');
  if (!CLOUD.user) { const c = await CLOUD.auth.signInAnonymously(); CLOUD.user = c.user; }
  return CLOUD.user;
}
let authUid = null;
async function onAuth(user) {
  CLOUD.user = user;
  if (PMODE) return;
  const uid = user && !user.isAnonymous ? user.uid : null;
  renderAccount();
  if (uid === authUid) return;
  const was = authUid; authUid = uid;
  if (uid) {
    if (!S.settings.lecturer && user.displayName) { S.settings.lecturer = user.displayName; saveSettings(); }
    await loadLibrary(uid, was === null);
  } else if (was) {
    await clearScope(was); CLOUD.scope = 'guest';
    S.index = (await store.get(K('index'))) || [];
    const L = S.index[0] ? await store.get(K('lec:' + S.index[0].id)) : null;
    await switchLecture(L || newLecture());
  }
  renderAll();
}
async function clearScope(uid) {
  const idx = (await store.get(uid + ':index')) || [];
  for (const m of idx) await store.del(uid + ':lec:' + m.id);
  await store.del(uid + ':index');
}
async function loadLibrary(uid, migrateGuest) {
  const guest = S.lecture;
  CLOUD.scope = uid;
  let idx = [];
  try { idx = Object.values((await CLOUD.db.ref(`users/${uid}/index`).once('value')).val() || {}); }
  catch { idx = (await store.get(K('index'))) || []; toast('Working offline — showing the lectures saved on this device.'); }
  S.index = idx.sort((a, b) => b.updatedAt - a.updatedAt);
  if (migrateGuest && guest && !guest.sample && (speechSegs(guest).length || guest.files.length) && !S.index.some(m => m.id === guest.id)) {
    S.lecture = guest; await saveNow(); toast('Your current lecture was saved to your account');
    return;
  }
  const want = S.index.find(m => m.id === S.settings.lastLecture) || S.index[0];
  const L = want ? await openLecture(want.id) : null;
  S.lecture = L || guest || newLecture();
  await saveNow();
}
async function openLecture(id) {
  let L = await store.get(K('lec:' + id));
  if (isSignedIn() && CLOUD.db) {
    try {
      const v = (await CLOUD.db.ref(`users/${CLOUD.user.uid}/lectures/${id}`).once('value')).val();
      if (v?.json && (!L || (v.updatedAt || 0) > (L.updatedAt || 0))) { L = normalizeLecture(JSON.parse(v.json)); await store.set(K('lec:' + id), L); }
    } catch { /* offline: use the local copy */ }
  }
  return L ? normalizeLecture(L) : null;
}
function normalizeLecture(L) {
  L.segments = L.segments || []; L.files = L.files || []; L.segments.forEach(s => { if (s.kind === 'speech') s.tr = s.tr || {}; });
  return L;
}
let cloudTimer = null;
function cloudSaveSoon(L) {
  if (!isSignedIn() || !CLOUD.db) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    const uid = CLOUD.user.uid;
    const meta = S.index.find(m => m.id === L.id);
    CLOUD.db.ref(`users/${uid}/lectures/${L.id}`).set({ json: JSON.stringify(L), updatedAt: L.updatedAt }).catch(() => toast('Couldn’t sync to your account. Changes are kept on this device.', 3500));
    if (meta) CLOUD.db.ref(`users/${uid}/index/${L.id}`).set(meta).catch(() => {});
  }, 1500);
}
async function deleteLecture(id) {
  await store.del(K('lec:' + id));
  S.index = S.index.filter(x => x.id !== id); await store.set(K('index'), S.index);
  if (isSignedIn() && CLOUD.db) { const u = CLOUD.user.uid; CLOUD.db.ref(`users/${u}/lectures/${id}`).remove().catch(() => {}); CLOUD.db.ref(`users/${u}/index/${id}`).remove().catch(() => {}); }
}
async function switchLecture(L) {
  if (LIVE.code) stopSharing(true);
  S.lecture = normalizeLecture(L); S.settings.lastLecture = L.id; saveSettings(); S.ui.practice = {}; S.ui.notesEdit = false;
  await saveNow(); renderAll();
}

/* ---- Sign-in ---- */
const AUTH_COPY = {
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/weak-password': 'Use a password with at least 8 characters.',
  'auth/wrong-password': 'That email and password don’t match.',
  'auth/invalid-credential': 'That email and password don’t match.',
  'auth/invalid-login-credentials': 'That email and password don’t match.',
  'auth/user-not-found': 'No account uses that email. Create one instead.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/account-exists-with-different-credential': 'This email is already registered with a different sign-in method. Use that one instead.',
  'auth/operation-not-allowed': 'This sign-in method isn’t turned on yet in Firebase (see SETUP.md).',
  'auth/unauthorized-domain': 'This web address isn’t on Firebase’s list of authorized domains (see SETUP.md).',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/popup-blocked': 'The sign-in window was blocked. Allow pop-ups for this site and try again.'
};
function authError(e) {
  if (!e || ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/redirect-cancelled-by-user'].includes(e.code)) return;
  const msg = AUTH_COPY[e.code] || e.message || 'Sign-in didn’t work. Try again.';
  const out = $('#acct-error'); if (out) { out.textContent = msg; out.hidden = false; } else toast(msg, 4500);
}
const needsRedirect = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && (matchMedia('(display-mode: standalone)').matches || navigator.standalone);
async function signInWith(kind) {
  if (!CLOUD.ready) { toast(IS_ARTIFACT ? 'Accounts work in the hosted app.' : 'Accounts turn on once Didasko is connected to Firebase. See SETUP.md.', 4000); return; }
  if (!consentOk()) return;
  const fb = window.firebase.auth;
  const provider = kind === 'google' ? new fb.GoogleAuthProvider() : new fb.OAuthProvider('microsoft.com');
  provider.setCustomParameters({ prompt: 'select_account' });
  if (kind === 'microsoft' && CFG.microsoftTenant) provider.setCustomParameters({ prompt: 'select_account', tenant: CFG.microsoftTenant });
  const anon = CLOUD.user?.isAnonymous ? CLOUD.user : null;
  try {
    if (needsRedirect()) { sessionStorage.setItem('didasko-consent', '1'); await (anon ? anon.linkWithRedirect(provider) : CLOUD.auth.signInWithRedirect(provider)); return; }
    const cred = anon ? await anon.linkWithPopup(provider) : await CLOUD.auth.signInWithPopup(provider);
    await afterSignIn(cred, kind, !!anon);
  } catch (e) {
    if (e.code === 'auth/credential-already-in-use' && e.credential) { try { await afterSignIn(await CLOUD.auth.signInWithCredential(e.credential), kind); } catch (e2) { authError(e2); } return; }
    if (e.code === 'auth/popup-blocked') { try { await CLOUD.auth.signInWithRedirect(provider); return; } catch (e2) { authError(e2); return; } }
    authError(e);
  }
}
async function emailAuth(mode, name, email, pw) {
  if (!CLOUD.ready) { toast('Accounts turn on once Didasko is connected to Firebase. See SETUP.md.', 4000); return; }
  const fb = window.firebase.auth;
  try {
    if (mode === 'create') {
      if (!consentOk()) return;
      if (pw.length < 8) { authError({ code: 'auth/weak-password' }); return; }
      const anon = CLOUD.user?.isAnonymous ? CLOUD.user : null;
      const cred = anon ? await anon.linkWithCredential(fb.EmailAuthProvider.credential(email, pw)) : await CLOUD.auth.createUserWithEmailAndPassword(email, pw);
      if (name) { await cred.user.updateProfile({ displayName: name }); }
      cred.user.sendEmailVerification().catch(() => {});
      await afterSignIn(cred, 'email', true);
    } else if (mode === 'signin') {
      await afterSignIn(await CLOUD.auth.signInWithEmailAndPassword(email, pw), 'email');
    } else if (mode === 'reset') {
      await CLOUD.auth.sendPasswordResetEmail(email); toast('Check your email for a link to reset your password.', 4500);
    }
  } catch (e) { authError(e); }
}
async function afterSignIn(cred, provider, forceNew) {
  const user = cred.user;
  const isNew = forceNew || cred.additionalUserInfo?.isNewUser;
  if (isNew) subscribeNewsletter(user, provider);
  closeSheet();
  await onAuth(CLOUD.auth.currentUser || user);
  toast(`Signed in as ${user.displayName || user.email}`);
}
function consentOk() {
  const N = CFG.newsletter || {};
  if (!N.enabled || !N.requireCheckbox) return true;
  const c = $('#acct-consent'); if (!c || c.checked || sessionStorage.getItem('didasko-consent')) return true;
  authError({ message: 'Please tick the box to agree to the newsletter sign-up.' }); return false;
}
async function subscribeNewsletter(user, provider) {
  const N = CFG.newsletter || {};
  if (!N.enabled || !user?.email) return;
  try { await CLOUD.db.ref('newsletter/' + user.uid).set({ email: user.email, name: user.displayName || '', provider: String(provider || ''), source: 'didasko', at: TS() }); } catch { /* backup list only */ }
  if (N.wordpressBlogId) {
    const body = new URLSearchParams({ action: 'subscribe', blog_id: String(N.wordpressBlogId), email: user.email, source: location.origin + location.pathname, 'sub-type': 'didasko-app', app_source: 'didasko', redirect_fragment: '' });
    fetch(N.wordpressSubscribeUrl || 'https://wordpress.com/email-subscriptions', { method: 'POST', mode: 'no-cors', body }).catch(() => {});
  }
  if (N.webhookUrl) fetch(N.webhookUrl, { method: 'POST', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ email: user.email, name: user.displayName || '', source: 'didasko' }) }).catch(() => {});
}
async function signOut() {
  if (LIVE.code) stopSharing(true);
  await saveNow();
  await CLOUD.auth.signOut();
  closeSheet(); toast('Signed out. Lectures saved to your account were removed from this device.', 4000);
}
const newsletterNote = () => {
  const N = CFG.newsletter || {};
  if (!N.enabled) return '';
  return `<p class="newsletter-note">${icon('mail')}<span>${esc(N.notice || 'Creating an account also subscribes you to blog emails. You can unsubscribe at any time.')}</span></p>`;
};
function renderAccount() {
  const b = $('#btn-account'); if (!b) return;
  const u = CLOUD.user;
  if (isSignedIn()) {
    const n = (u.displayName || u.email || '?').trim();
    b.innerHTML = u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>`;
    b.setAttribute('aria-label', `Account: ${n}`); b.classList.add('signed');
  } else { b.innerHTML = icon('user'); b.setAttribute('aria-label', 'Sign in'); b.classList.remove('signed'); }
}
function openAccountSheet() {
  const u = CLOUD.user;
  if (isSignedIn()) {
    openSheet('Your account', `
      <div class="row"><div class="avatar-lg">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc((u.displayName || u.email || '?')[0].toUpperCase())}</div>
        <div class="grow"><div style="font-weight:700">${esc(u.displayName || 'Didasko user')}</div><div class="small muted">${esc(u.email || '')}</div></div></div>
      <div class="notice">Your lectures, notes, quizzes and files sync to this account. Open Didasko on any device and sign in to pick up where you left off. AI keys stay on each device.</div>
      ${(CFG.newsletter || {}).enabled ? `<p class="small muted" style="margin:0">You’re on the ${esc(CFG.newsletter.listName || 'blog')} email list. Use the unsubscribe link in any email to leave it at any time.</p>` : ''}
      <div class="row"><button class="btn" id="acct-out">Sign out</button></div>`, sh => { $('#acct-out', sh).onclick = signOut; });
    return;
  }
  const off = !CLOUD.ready;
  const N = CFG.newsletter || {};
  openSheet('Sign in to Didasko', `
    <p class="small muted" style="margin:0">Captions, sharing and live quizzes work without an account. Sign in to upload lecture files and keep a library of lectures on every device.</p>
    ${off ? `<div class="notice warn">${IS_ARTIFACT ? 'Accounts work in the hosted app, not in this preview.' : 'Accounts turn on once Didasko is connected to Firebase. See SETUP.md.'}</div>` : ''}
    <div class="auth-buttons">
      <button class="btn auth" id="acct-google" ${off ? 'disabled' : ''}>${GOOGLE_G}Continue with Google</button>
      <button class="btn auth" id="acct-ms" ${off ? 'disabled' : ''}>${MS_LOGO}Continue with Microsoft</button>
    </div>
    <div class="or"><span>or use email</span></div>
    <div class="seg" role="group" aria-label="Email account"><button id="acct-m-create" aria-pressed="true">Create account</button><button id="acct-m-signin" aria-pressed="false">Sign in</button></div>
    <form id="acct-form" class="view" style="gap:10px" novalidate>
      <label class="field" id="acct-name-f"><span>Name</span><input id="acct-name" autocomplete="name" placeholder="e.g. Dr. Jordan Lee"></label>
      <label class="field"><span>Email</span><input id="acct-email" type="email" autocomplete="email" inputmode="email" required></label>
      <label class="field"><span>Password</span><input id="acct-pw" type="password" autocomplete="new-password" minlength="8" required></label>
      ${N.enabled && N.requireCheckbox ? `<label class="switch" style="align-items:flex-start"><input type="checkbox" id="acct-consent"> <span>${esc(N.checkboxLabel || 'Yes, add me to the blog email list.')}</span></label>` : ''}
      <p class="small" id="acct-error" hidden style="margin:0;color:var(--rec)"></p>
      <div class="row"><button class="btn primary" type="submit" id="acct-submit" ${off ? 'disabled' : ''}>Create account</button><button class="btn ghost sm" type="button" id="acct-reset" hidden>Forgot password?</button></div>
    </form>
    ${newsletterNote()}`,
    sh => {
      let mode = 'create';
      const setMode = m => {
        mode = m; $('#acct-m-create', sh).setAttribute('aria-pressed', String(m === 'create')); $('#acct-m-signin', sh).setAttribute('aria-pressed', String(m === 'signin'));
        $('#acct-name-f', sh).hidden = m !== 'create'; $('#acct-reset', sh).hidden = m !== 'signin';
        $('#acct-submit', sh).textContent = m === 'create' ? 'Create account' : 'Sign in';
        $('#acct-pw', sh).autocomplete = m === 'create' ? 'new-password' : 'current-password'; $('#acct-error', sh).hidden = true;
      };
      $('#acct-m-create', sh).onclick = () => setMode('create'); $('#acct-m-signin', sh).onclick = () => setMode('signin');
      $('#acct-google', sh).onclick = () => signInWith('google'); $('#acct-ms', sh).onclick = () => signInWith('microsoft');
      $('#acct-form', sh).onsubmit = e => { e.preventDefault(); const em = $('#acct-email', sh).value.trim(), pw = $('#acct-pw', sh).value; if (!em || !pw) { authError({ message: 'Enter your email and password.' }); return; } emailAuth(mode, $('#acct-name', sh).value.trim(), em, pw); };
      $('#acct-reset', sh).onclick = () => { const em = $('#acct-email', sh).value.trim(); if (!em) { authError({ message: 'Enter your email first, then tap Forgot password.' }); return; } emailAuth('reset', '', em, ''); };
    });
}
const GOOGLE_G = '<svg class="i" viewBox="0 0 48 48" style="stroke:none"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const MS_LOGO = '<svg class="i" viewBox="0 0 23 23" style="stroke:none"><path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/></svg>';

/* ---- Lecture sheet (details + library) ---- */
function openLectureSheet(focusLecturer) {
  const L = S.lecture;
  const locked = libraryLocked();
  const items = [...S.index].sort((a, b) => b.createdAt - a.createdAt).map(m => `<button class="lec-item ${m.id === L.id ? 'current' : ''}" data-lid="${m.id}"><div class="grow"><div class="t">${esc(m.title)}</div><div class="m">${esc([m.course, fmtDate(m.createdAt), `${(m.words || 0).toLocaleString()} words`].filter(Boolean).join(' · '))}</div></div></button>`).join('');
  openSheet('Lecture', `
    <div class="grid-2 stack-sm">
      <label class="field"><span>Title</span><input id="lec-title" value="${esc(L.title)}" autocomplete="off"></label>
      <label class="field"><span>Course / section</span><input id="lec-course" value="${esc(L.course)}" placeholder="e.g. BIO 110: Introductory Biology" autocomplete="off"></label>
      <label class="field"><span>Lecturer (cited as the source)</span><input id="lec-lecturer" value="${esc(L.lecturer || S.settings.lecturer || '')}" placeholder="e.g. Micah Shippee" autocomplete="name"></label>
      <label class="field"><span>Institution</span><input id="lec-inst" value="${esc(L.institution || S.settings.institution || '')}" placeholder="e.g. State University" autocomplete="organization"></label>
      <label class="field"><span>Notes prepared by (optional)</span><input id="lec-author" value="${esc(L.author || S.settings.author || '')}" placeholder="e.g. a TA or note-taker" autocomplete="off"></label>
      <label class="field"><span>Lecture date</span><input id="lec-date" type="date" value="${new Date(L.createdAt - new Date(L.createdAt).getTimezoneOffset() * 60000).toISOString().slice(0, 10)}"></label>
    </div>
    <p class="small muted" style="margin:0" id="lec-cite-prev"></p>
    <div class="row between"><span class="eyebrow">${locked ? 'This device' : 'Your lectures'}</span><button class="btn sm primary" id="lec-new">${icon('plus')}New lecture</button></div>
    ${locked ? `<div class="notice">Without an account Didasko keeps one lecture on this device; starting a new one replaces it. <button class="linklike" data-signin>Sign in</button> to save a library of lectures and files.</div>` : `<div class="lec-list">${items}</div>`}
    <div class="row"><button class="btn sm ghost danger" id="lec-del">${icon('trash')}Delete this lecture</button></div>`,
    sh => {
      const prev = () => { $('#lec-cite-prev', sh).innerHTML = `Reference entry: ${inl(lectureRef(L, L.notes?.lectureTitle))}`; };
      const upd = () => {
        L.title = $('#lec-title', sh).value.trim() || 'Untitled lecture'; L.course = $('#lec-course', sh).value.trim();
        L.lecturer = $('#lec-lecturer', sh).value.trim(); L.institution = $('#lec-inst', sh).value.trim(); L.author = $('#lec-author', sh).value.trim();
        const d = $('#lec-date', sh).value; if (d) { const [y, mo, da] = d.split('-').map(Number); const t = new Date(L.createdAt); t.setFullYear(y, mo - 1, da); L.createdAt = t.getTime(); }
        if (L.lecturer) S.settings.lecturer = L.lecturer; if (L.institution) S.settings.institution = L.institution; if (L.author) S.settings.author = L.author; saveSettings();
        if (L.notes) L.notes.lectureTitle = null;
        renderHeader(); saveSoon(); prev(); if (S.view === 'notes') renderNotes();
      };
      ['#lec-title', '#lec-course', '#lec-lecturer', '#lec-inst', '#lec-author', '#lec-date'].forEach(id => { $(id, sh).oninput = upd; });
      prev();
      if (focusLecturer) setTimeout(() => $('#lec-lecturer', sh).focus(), 60);
      const doNew = async () => { if (S.rec.running) pauseCaptions(true); await saveNow(); const n = newLecture(); n.course = L.course; n.lecturer = L.lecturer; n.institution = L.institution; n.author = L.author; if (locked) await deleteLecture(L.id); await switchLecture(n); closeSheet(); toast('New lecture started'); };
      if (locked && (speechSegs(L).length || L.notes)) twoStep($('#lec-new', sh), 'Tap again — this replaces the current lecture', doNew); else $('#lec-new', sh).onclick = doNew;
      $$('.lec-item', sh).forEach(b => b.onclick = async () => { if (b.dataset.lid === L.id) { closeSheet(); return; } if (S.rec.running) pauseCaptions(true); await saveNow(); const l = await openLecture(b.dataset.lid); if (l) await switchLecture(l); closeSheet(); });
      twoStep($('#lec-del', sh), 'Tap again to delete permanently', async () => {
        if (S.rec.running) pauseCaptions(true);
        await deleteLecture(L.id);
        const next = S.index[0] ? await openLecture(S.index[0].id) : null;
        await switchLecture(next || newLecture()); closeSheet(); toast('Lecture deleted');
      });
    });
}

/* ================= Settings ================= */
function aiSectionHtml() {
  const st = S.settings.ai, id = st.provider, p = PROVIDERS[id];
  const list = (st.lists[id] && st.lists[id].length ? st.lists[id] : p.models);
  const opts = Object.entries(PROVIDERS).filter(([, v]) => !v.previewOnly || IS_ARTIFACT).map(([k, v]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
  const m = st.models[id] || {};
  const canList = ['anthropic', 'gemini'].includes(p.kind) || (p.kind === 'openai' && !p.azure);
  return `
    <label class="field"><span>AI service for notes, quizzes, citations and translation</span><select id="ai-provider">${opts}</select></label>
    <p class="small muted" style="margin:0">${esc(p.note)}</p>
    ${p.key ? `<label class="field"><span>${esc(p.label.replace(/ \(.*\)$/, ''))} API key${p.optionalKey ? ' (optional)' : ''}</span><input id="ai-key" type="password" value="${esc(st.keys[id] || '')}" placeholder="${esc(p.keyHint)}" autocomplete="off" spellcheck="false"></label>
      ${p.keyUrl ? `<p class="small muted" style="margin:0">Get a key at <a href="${p.keyUrl}" target="_blank" rel="noopener">${esc(p.keyUrl.replace(/^https:\/\//, ''))}</a>. Each teacher uses their own key, so usage is billed to them — or is free on free tiers — and never to the app’s owner.</p>` : ''}` : ''}
    ${p.editBase ? `<label class="field"><span>Service address</span><input id="ai-base" value="${esc(st.bases[id] || p.base || '')}" placeholder="https://…/v1" autocomplete="off" inputmode="url"></label>` : ''}
    ${p.azure ? `<div class="grid-2 stack-sm">
      <label class="field"><span>Endpoint</span><input id="az-endpoint" value="${esc(st.azure.endpoint)}" placeholder="https://your-resource.openai.azure.com" inputmode="url" autocomplete="off"></label>
      <label class="field"><span>API version</span><input id="az-version" value="${esc(st.azure.apiVersion)}" autocomplete="off"></label>
      <label class="field"><span>Deployment (notes and quiz)</span><input id="az-dep" value="${esc(st.azure.deployment)}" placeholder="e.g. gpt-main" autocomplete="off"></label>
      <label class="field"><span>Deployment (live translation)</span><input id="az-fast" value="${esc(st.azure.fastDeployment)}" placeholder="Same as above" autocomplete="off"></label>
    </div>` : ''}
    ${!p.azure && !['chrome', 'sample'].includes(p.kind) ? `<div class="grid-2 stack-sm">
      <label class="field"><span>Model for notes, quizzes and citations</span><input id="ai-main" list="ai-models" value="${esc(m.main || p.main)}" placeholder="Tap Refresh to list models" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span>Faster model for live translation</span><input id="ai-fast" list="ai-models" value="${esc(m.fast || p.fast)}" placeholder="Same as above" autocomplete="off" spellcheck="false"></label>
      <datalist id="ai-models">${list.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>
    </div>` : ''}
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
  const out = $('#ai-test-out', box);
  const rb = $('#ai-refresh', box);
  if (rb) rb.onclick = async () => {
    out.textContent = 'Loading models…';
    try { const ids = await listModels(); $('#ai-models', box).innerHTML = ids.map(x => `<option value="${esc(x)}"></option>`).join(''); out.textContent = `${ids.length} models available — tap a model field to choose.`; }
    catch (e) { out.textContent = e.message; }
  };
  $('#ai-test', box).onclick = async () => {
    if (!aiReady()) { out.textContent = prov().kind === 'chrome' ? 'Chrome’s on-device model isn’t available in this browser.' : 'Fill in the key and model first.'; return; }
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
    <div class="set-group"><span class="eyebrow">Privacy</span><p class="small muted" style="margin:0">Speech recognition is provided by the browser (Chrome and Edge process audio on their servers; Safari may process on-device). Text for notes, quizzes and AI translation goes only to the AI service chosen above, using that teacher’s own key. Shared captions and quiz answers pass through this app’s database and are visible to anyone with the session link. Check your school’s policy before captioning or recording students.</p></div>
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
  if (chip) { chip.textContent = ok ? `AI: ${aiLabel()}` : 'AI: not set up'; chip.className = 'chip ' + (ok ? 'ok' : 'warn'); }
  const nh = $('#notes-gen-hint'), qh = $('#quiz-hint');
  if (nh) nh.textContent = ok ? '' : 'No AI model is set up, so Didasko builds simple notes on this device. Choose an AI service in Settings for full APA notes.';
  if (qh) qh.textContent = ok ? '' : 'No AI model is set up, so Didasko builds fill-in-the-blank items. Choose an AI service in Settings for real questions.';
  TR.engineCache.clear(); renderEngineNote();
}

/* ================= Live sessions (presenter side) =================
   sessions/{CODE}: host, active, title, captions/{id}, interim, participants/{uid}, quiz, reveal/{i}, responses/{i}/{uid}, scores/{uid} */
const LIVE = { code: null, ref: null, people: {}, langs: new Set(), offs: [], showQR: false, interimAt: 0, interimTimer: null, q: null };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_LIVE_LANGS = 10;
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
function joinUrl(code, quiz) {
  const base = (CFG.appUrl || (location.origin + location.pathname)).replace(/index\.html?$/, '');
  return `${base}?join=${code}${quiz ? '&quiz=1' : ''}`;
}
const shortUrl = u => u.replace(/^https?:\/\//, '').replace(/\/?\?join=/, '/?join=');
async function qrSvg(text) {
  try {
    const qr = (await lib('qr'))(0, 'M'); qr.addData(text); qr.make();
    const n = qr.getModuleCount(), m = 2; let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg role="img" aria-label="QR code to join" class="qr-svg" viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  } catch { return ''; }
}
const segPayload = s => { const p = { t: s.t, kind: s.kind, text: s.text }; if (s.key) p.key = true; if (s.tr && Object.keys(s.tr).length) p.tr = s.tr; return p; };
function liveSeg(seg) { if (LIVE.ref && seg) LIVE.ref.child('captions/' + seg.id).set(segPayload(seg)).catch(() => {}); }
function liveDelSeg(id) { if (LIVE.ref) LIVE.ref.child('captions/' + id).remove().catch(() => {}); }
function liveTr(seg, lang, text) { if (LIVE.ref) LIVE.ref.child(`captions/${seg.id}/tr/${lang}`).set(text).catch(() => {}); }
function liveMeta() { if (LIVE.ref) LIVE.ref.update({ title: S.lecture.title, course: S.lecture.course || '', srcLang: S.settings.srcLang }).catch(() => {}); }
function liveInterim(text) {
  if (!LIVE.ref) return;
  clearTimeout(LIVE.interimTimer);
  const send = () => { LIVE.interimAt = Date.now(); LIVE.ref.child('interim').set(text ? { text } : null).catch(() => {}); };
  if (!text || Date.now() - LIVE.interimAt > 600) send(); else LIVE.interimTimer = setTimeout(send, 600);
}
function liveTargets() { const t = new Set(LIVE.langs); if (target()) t.add(target()); return [...t]; }
async function startSharing() {
  try { await ensureAuth(); } catch (e) { toast(e.message, 5000); return false; }
  const uid = CLOUD.user.uid, L = S.lecture, db = CLOUD.db;
  let code = L.liveCode || null;
  try {
    if (code && (await db.ref(`sessions/${code}/host`).once('value')).val() !== uid) code = null;
    for (let i = 0; !code && i < 6; i++) { const c = genCode(); if (!(await db.ref(`sessions/${c}/host`).once('value')).exists()) code = c; }
    if (!code) throw new Error('no code');
    LIVE.code = code; LIVE.ref = db.ref('sessions/' + code);
    await LIVE.ref.update({ host: uid, active: true, startedAt: TS(), title: L.title, course: L.course || '', srcLang: S.settings.srcLang, lecturer: lecturerOf(L) });
  } catch (e) { LIVE.code = null; LIVE.ref = null; toast('Couldn’t start sharing. Check your connection and the Firebase setup.', 5000); return false; }
  L.liveCode = code; saveSoon();
  const upd = {}; L.segments.slice(-40).forEach(s => { upd['captions/' + s.id] = segPayload(s); });
  if (Object.keys(upd).length) LIVE.ref.update(upd).catch(() => {});
  const pref = LIVE.ref.child('participants');
  const cb = pref.on('value', snap => { LIVE.people = snap.val() || {}; onPeople(); });
  LIVE.offs.push(() => pref.off('value', cb));
  renderShare();
  return true;
}
function stopSharing(silent) {
  if (!LIVE.ref) return;
  LIVE.ref.update({ active: false, interim: null, quiz: null }).catch(() => {});
  LIVE.offs.forEach(f => f()); LIVE.offs = [];
  if (LIVE.q) closeLiveQuiz(true);
  Object.assign(LIVE, { code: null, ref: null, people: {}, langs: new Set(), showQR: false, q: null });
  renderShare(); renderStageQR();
  if (!silent) toast('Sharing stopped. Students see that the session has ended.');
}
function onPeople() {
  const online = Object.values(LIVE.people).filter(p => p.online !== false);
  const before = new Set(LIVE.langs);
  LIVE.langs = new Set(online.map(p => p.lang).filter(l => l && l !== 'off' && l !== srcBase(S.settings.srcLang)).slice(0, MAX_LIVE_LANGS));
  for (const lang of LIVE.langs) if (!before.has(lang)) speechSegs(S.lecture).slice(-6).forEach(s => queueTranslate(s, lang));
  renderShare();
  if (LIVE.q) renderLiveQuiz();
}
function peopleSummary() {
  const online = Object.values(LIVE.people).filter(p => p.online !== false);
  const by = {}; online.forEach(p => { const l = p.lang && p.lang !== 'off' ? p.lang : 'orig'; by[l] = (by[l] || 0) + 1; });
  return { n: online.length, by };
}
function renderShare() {
  const chip = $('#share-chip'), txt = $('#share-text'), btn = $('#btn-share'), qb = $('#btn-qr-stage');
  if (!chip) return;
  if (!LIVE.code) {
    chip.textContent = 'Off'; chip.className = 'chip';
    txt.textContent = 'Let students follow the captions on their own phone or laptop and choose their own translation. They don’t need an account.';
    btn.innerHTML = `${icon('qr')}Share captions`; qb.hidden = true; return;
  }
  const { n, by } = peopleSummary();
  chip.textContent = `${n} connected`; chip.className = 'chip ok';
  const langs = Object.entries(by).map(([l, c]) => `${l === 'orig' ? srcName(S.settings.srcLang) : tgtName(l)} ${c}`).join(' · ');
  txt.innerHTML = `Code <b class="mono">${LIVE.code}</b>${n ? ` · ${esc(langs)}` : ' · waiting for students to join'}`;
  btn.innerHTML = `${icon('qr')}Show join code`; qb.hidden = false; qb.textContent = LIVE.showQR ? 'Hide code on screen' : 'Show code on screen';
  renderStageQR();
}
async function renderStageQR() {
  const box = $('#stage-qr'); if (!box) return;
  if (!LIVE.code || !LIVE.showQR) { box.hidden = true; return; }
  const url = joinUrl(LIVE.code);
  box.hidden = false;
  box.innerHTML = `<div class="qr-wrap">${await qrSvg(url)}</div><div><div class="qr-code mono">${LIVE.code}</div><div class="qr-url">${esc(shortUrl(url))}</div><div class="qr-hint">Scan for captions in your language</div></div>`;
}
async function openShareSheet() {
  if (!LIVE.code) { const ok = await startSharing(); if (!ok) return; }
  const url = joinUrl(LIVE.code);
  openSheet('Students join here', `
    <div class="share-hero"><div class="qr-wrap big">${await qrSvg(url)}</div>
      <div class="share-info"><span class="eyebrow">Join code</span><div class="qr-code mono">${LIVE.code}</div>
      <span class="eyebrow">Or open</span><div class="share-url mono" id="share-url">${esc(url)}</div>
      <div class="row"><button class="btn sm" id="share-copy">${icon('copy')}Copy link</button></div></div></div>
    <p class="small muted" style="margin:0">Students scan the code, choose a language, and see your captions live. No account or app install needed. Translations use this device’s AI model, so each extra language adds a little usage.</p>
    <div class="row"><button class="btn primary" id="share-show">${LIVE.showQR ? 'Hide' : 'Show'} code on the caption screen</button><button class="btn ghost danger" id="share-stop">Stop sharing</button></div>`,
    sh => {
      $('#share-copy', sh).onclick = () => copyText(url);
      $('#share-show', sh).onclick = () => { LIVE.showQR = !LIVE.showQR; renderShare(); closeSheet(); };
      $('#share-stop', sh).onclick = () => { closeSheet(); stopSharing(); };
    });
}

/* ================= Live quiz (presenter side) ================= */
const PALETTE = [['Red', '#e5484d'], ['Orange', '#f76b15'], ['Amber', '#e2a336'], ['Lime', '#7cb342'], ['Green', '#30a46c'], ['Teal', '#12a594'], ['Sky', '#0d9adb'], ['Blue', '#3e63dd'], ['Indigo', '#5b5bd6'], ['Violet', '#8e4ec6'], ['Pink', '#d6409f'], ['Coral', '#ec5e5e'], ['Gold', '#c29b0c'], ['Jade', '#29a383'], ['Plum', '#ab4aba'], ['Navy', '#2f4e9e']];
const ANIMALS = 'Otter Fox Heron Lynx Panda Koala Falcon Beaver Bison Owl Badger Dolphin Gecko Ibex Jaguar Kiwi Lemur Manatee Narwhal Ocelot Penguin Quokka Raven Seal Tapir Walrus Yak Zebra Moose Puffin Sloth Turtle Wombat Hedgehog Crane Marmot Orca Llama Hare Toucan Axolotl Bobcat Capybara Dingo Egret Ferret Gazelle Hippo Iguana Jackal Kestrel Lobster Meerkat Newt Okapi Pelican Robin Salmon Tiger Viper Wolf'.split(' ');
const OPT_COLORS = ['#e5484d', '#3e63dd', '#e2a336', '#30a46c'];
const displayName = (p, mode) => (mode === 'ask' && p?.name) ? p.name : (p ? `${p.color} ${p.animal}` : 'Someone');
const colorHex = c => (PALETTE.find(p => p[0] === c) || [0, '#888'])[1];
function liveQuizSettings() { return { duration: +$('#quiz-timer').value, nameMode: $('#quiz-names').value, showBoard: $('#quiz-board').checked }; }
async function openLiveQuiz() {
  const qs = S.lecture.quiz?.questions || [];
  if (!qs.length) { toast('Generate a quiz first.'); return; }
  if (!LIVE.code && !(await startSharing())) return;
  const set = liveQuizSettings();
  LIVE.q = { ...set, i: -1, state: 'lobby', qs, results: {}, scores: {}, responses: {}, startedAt: 0, off: null, timer: null };
  await LIVE.ref.update({ quiz: { state: 'lobby', total: qs.length, nameMode: set.nameMode, duration: set.duration, showBoard: set.showBoard }, reveal: null, responses: null, scores: null });
  let ov = $('#liveq');
  if (!ov) { ov = document.createElement('div'); ov.id = 'liveq'; ov.className = 'present liveq'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Live quiz'); document.body.appendChild(ov); }
  ov.hidden = false; document.body.style.overflow = 'hidden';
  try { ov.requestFullscreen?.().catch(() => {}); } catch { /* optional */ }
  renderLiveQuiz();
}
function closeLiveQuiz(silent) {
  const q = LIVE.q; if (!q) return;
  clearInterval(q.timer); q.off && q.off();
  if (LIVE.ref && !silent) LIVE.ref.update({ quiz: { state: 'closed' } }).catch(() => {});
  if (!q.saved && Object.keys(q.results).length) saveQuizRun(q);
  LIVE.q = null;
  const ov = $('#liveq'); if (ov) ov.hidden = true;
  document.body.style.overflow = ''; if (document.fullscreenElement) document.exitFullscreen?.();
}
function saveQuizRun(q) {
  const L = S.lecture; L.quiz.runs = L.quiz.runs || [];
  L.quiz.runs.push({ at: Date.now(), nameMode: q.nameMode, people: Object.fromEntries(Object.entries(LIVE.people).map(([k, p]) => [k, displayName(p, q.nameMode)])), results: q.results, scores: q.scores });
  saveSoon();
}
async function askQuestion(i) {
  const q = LIVE.q; q.i = i; q.state = 'question';
  const item = q.qs[i];
  clearInterval(q.timer); q.off && q.off(); q.responses = {};
  await LIVE.ref.child('quiz').update({ state: 'question', index: i, startedAt: TS(), q: { stem: item.stem, options: item.options, type: item.type || 'mc' } });
  q.startedAt = (await LIVE.ref.child('quiz/startedAt').once('value')).val() || serverNow();
  const rref = LIVE.ref.child('responses/' + i);
  const cb = rref.on('value', s => { q.responses = s.val() || {}; renderLiveQuiz(); maybeAutoReveal(); });
  q.off = () => rref.off('value', cb);
  q.timer = setInterval(() => { updateCountdown(); maybeAutoReveal(); }, 200);
  renderLiveQuiz();
}
function onlineCount() { return Object.values(LIVE.people).filter(p => p.online !== false).length; }
function maybeAutoReveal() {
  const q = LIVE.q; if (!q || q.state !== 'question') return;
  const answered = Object.keys(q.responses).length, n = onlineCount();
  const timeUp = q.duration && serverNow() >= q.startedAt + q.duration * 1000;
  if (timeUp || (n > 0 && answered >= n)) reveal();
}
function updateCountdown() {
  const q = LIVE.q; const el = $('#lq-time'); if (!q || !el || !q.duration) return;
  const rem = Math.max(0, q.startedAt + q.duration * 1000 - serverNow());
  el.textContent = Math.ceil(rem / 1000); $('#lq-bar').style.transform = `scaleX(${rem / (q.duration * 1000)})`;
}
async function reveal() {
  const q = LIVE.q; if (!q || q.state !== 'question') return;
  q.state = 'reveal'; clearInterval(q.timer); q.off && q.off();
  const item = q.qs[q.i], counts = item.options.map(() => 0), win = (q.duration || 30) * 1000;
  for (const [pid, r] of Object.entries(q.responses)) {
    if (r.c >= 0 && r.c < counts.length) counts[r.c]++;
    const pts = r.c === item.answer ? Math.round(500 + 500 * Math.max(0, 1 - (r.ms || win) / win)) : 0;
    q.scores[pid] = (q.scores[pid] || 0) + pts;
  }
  q.results[q.i] = q.responses;
  await LIVE.ref.update({ [`reveal/${q.i}`]: { answer: item.answer, explanation: item.explanation || '', counts }, scores: q.scores, 'quiz/state': 'reveal' });
  renderLiveQuiz();
}
async function endQuiz() {
  const q = LIVE.q; q.state = 'ended'; clearInterval(q.timer); q.off && q.off();
  await LIVE.ref.child('quiz/state').set('ended');
  saveQuizRun(q); q.saved = true;
  renderLiveQuiz();
}
function boardRows(q, limit) {
  return Object.entries(q.scores).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([pid, sc], k) => {
    const p = LIVE.people[pid];
    return `<li><span class="rank">${k + 1}</span><span class="dot" style="background:${colorHex(p?.color)}"></span><span class="grow">${esc(displayName(p, q.nameMode))}</span><b class="mono">${sc}</b></li>`;
  }).join('');
}
async function renderLiveQuiz() {
  const q = LIVE.q, ov = $('#liveq'); if (!q || !ov) return;
  const n = onlineCount(), url = joinUrl(LIVE.code, true);
  const people = Object.entries(LIVE.people).filter(([, p]) => p.online !== false);
  const top = `<div class="present-top"><span class="count">${q.state === 'lobby' ? 'Live quiz · lobby' : q.state === 'ended' ? 'Results' : `Question ${q.i + 1} of ${q.qs.length}`} · ${n} connected</span><button class="btn sm" id="lq-close">${icon('close')}Close</button></div>`;
  let body = '', nav = '';
  if (q.state === 'lobby') {
    body = `<div class="lobby"><div class="qr-wrap big">${await qrSvg(url)}</div>
      <div class="lobby-info"><span class="eyebrow">Join at</span><div class="share-url mono">${esc(shortUrl(url))}</div><span class="eyebrow">Code</span><div class="qr-code mono">${LIVE.code}</div>
      <p class="present-explain">${q.nameMode === 'ask' ? 'Students type their name when they join.' : 'Each student is given a color-and-animal name.'} ${q.duration ? `${q.duration} seconds per question.` : 'No time limit.'} ${q.qs.length} questions.</p></div></div>
      <ul class="names">${people.map(([, p]) => `<li style="--c:${colorHex(p.color)}">${esc(displayName(p, q.nameMode))}</li>`).join('') || '<li class="muted-li">Waiting for students…</li>'}</ul>`;
    nav = `<button class="btn primary" id="lq-start" ${n ? '' : 'disabled'}>Start quiz</button>`;
  } else if (q.state === 'question' || q.state === 'reveal') {
    const item = q.qs[q.i], resp = Object.values(q.responses), total = Math.max(1, resp.length);
    const counts = item.options.map((_, k) => resp.filter(r => r.c === k).length);
    const rv = q.state === 'reveal';
    body = `${q.duration && !rv ? `<div class="lq-timer"><span id="lq-time" class="mono">${q.duration}</span><div class="lq-track"><div id="lq-bar"></div></div></div>` : ''}
      <h2 class="present-stem">${esc(item.stem)}</h2>
      <div class="present-opts ${item.type === 'tf' ? 'tf' : ''}">${item.options.map((o, k) => `<div class="p-opt ${rv ? (k === item.answer ? 'correct' : 'dim') : ''}" style="--oc:${OPT_COLORS[k]}"><span class="L">${optLetter(item, k)}</span><span class="grow">${esc(o)}</span>${rv ? `<span class="bar-count mono">${counts[k]}</span><span class="bar" style="width:${Math.round(counts[k] / total * 100)}%"></span>` : ''}</div>`).join('')}</div>
      ${rv ? `${item.explanation ? `<p class="present-explain">${esc(item.explanation)}</p>` : ''}<p class="present-explain"><b>${resp.length ? Math.round(counts[item.answer] / resp.length * 100) : 0}% correct</b> · ${resp.length} answered</p>${q.showBoard && Object.keys(q.scores).length ? `<ol class="board">${boardRows(q, 5)}</ol>` : ''}`
        : `<p class="present-explain"><b>${resp.length}</b> of ${n} answered</p>`}`;
    nav = rv ? (q.i < q.qs.length - 1 ? `<button class="btn primary" id="lq-next">Next question</button>` : `<button class="btn primary" id="lq-end">See results</button>`) : `<button class="btn" id="lq-reveal">Reveal answer now</button>`;
  } else if (q.state === 'ended') {
    const rows = q.qs.map((item, i) => { const r = Object.values(q.results[i] || {}); const pct = r.length ? Math.round(r.filter(x => x.c === item.answer).length / r.length * 100) : 0; return `<li><span class="mono">${pad(i + 1)}</span><span class="grow">${esc(item.stem.slice(0, 90))}${item.stem.length > 90 ? '…' : ''}</span><span class="pct-track"><span style="width:${pct}%"></span></span><b class="mono">${pct}%</b></li>`; }).join('');
    const all = Object.values(q.results).flatMap((res, i) => Object.values(res).map(r => r.c === q.qs[+Object.keys(q.results)[i]]?.answer));
    const avg = all.length ? Math.round(all.filter(Boolean).length / all.length * 100) : 0;
    body = `<h2 class="present-stem">Class average: ${avg}% correct</h2><ul class="qstats">${rows}</ul>${q.showBoard ? `<ol class="board">${boardRows(q, 10)}</ol>` : ''}<p class="present-explain">Results are saved with this lecture. Download them for your gradebook or to plan reteaching.</p>`;
    nav = `<button class="btn primary" id="lq-csv">${icon('down')}Download results (.csv)</button><button class="btn" id="lq-again">Run again</button>`;
  }
  ov.innerHTML = `${top}<div class="present-body">${body}</div><div class="present-nav">${nav}</div>`;
  $('#lq-close', ov).onclick = () => closeLiveQuiz();
  const b = id => $(id, ov);
  if (b('#lq-start')) b('#lq-start').onclick = () => askQuestion(0);
  if (b('#lq-reveal')) b('#lq-reveal').onclick = reveal;
  if (b('#lq-next')) b('#lq-next').onclick = () => askQuestion(q.i + 1);
  if (b('#lq-end')) b('#lq-end').onclick = endQuiz;
  if (b('#lq-csv')) b('#lq-csv').onclick = () => saveFile(slug(S.lecture.title) + '-quiz-results.csv', quizResultsCsv(q), 'text/csv');
  if (b('#lq-again')) b('#lq-again').onclick = () => { closeLiveQuiz(true); openLiveQuiz(); };
  updateCountdown();
}
function quizResultsCsv(q) {
  const head = ['Participant', 'Score', 'Correct', ...q.qs.map((_, i) => `Q${i + 1}`)];
  const ids = new Set(Object.values(q.results).flatMap(r => Object.keys(r)));
  const rows = [...ids].map(pid => {
    const p = LIVE.people[pid]; let correct = 0;
    const cells = q.qs.map((item, i) => { const r = q.results[i]?.[pid]; if (!r) return ''; if (r.c === item.answer) correct++; return `${optLetter(item, r.c)}${r.c === item.answer ? ' ✓' : ''}`; });
    return [displayName(p, q.nameMode), q.scores[pid] || 0, `${correct}/${q.qs.length}`, ...cells];
  }).sort((a, b) => b[1] - a[1]);
  const key = ['Answer key', '', '', ...q.qs.map(item => optLetter(item, item.answer))];
  return '﻿' + [head, key, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

/* ================= Participant view (?join=CODE) — no account needed ================= */
const P = { code: '', ref: null, me: null, uid: null, session: {}, caps: new Map(), interim: '', quiz: null, reveals: {}, myAnswers: {}, scores: {}, tab: 'captions', lang: 'off', size: 2, follow: true, localTr: new Map(), timer: null, raf: 0, ended: false };
const PSIZES = [1.05, 1.25, 1.5, 1.8, 2.2, 2.7];
const pSave = (k, v) => { try { localStorage.setItem('didasko-p-' + k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* private mode */ } };
const pLoad = (k, d) => { try { const v = localStorage.getItem('didasko-p-' + k); return v === null ? d : (/^[[{"\d]/.test(v) ? JSON.parse(v) : v); } catch { return d; } };
function guessTgt() { const n = (navigator.language || 'en').toLowerCase(); const hit = TGT_LANGS.find(([c]) => c !== 'off' && (n === c.toLowerCase() || n.startsWith(c.toLowerCase() + '-'))); return hit ? hit[0] : 'off'; }

async function bootParticipant(raw) {
  document.title = 'Join · Didasko';
  $('#app').hidden = true; document.body.classList.add('p-mode');
  const root = $('#participant'); root.hidden = false;
  P.code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  P.tab = new URLSearchParams(location.search).get('quiz') ? 'quiz' : 'captions';
  P.size = pLoad('size', 2); P.lang = pLoad('lang', guessTgt());
  if (!P.code) { renderJoin(); return; }
  if (!cloudConfigured()) { renderPMessage('Live sessions aren’t available here', IS_ARTIFACT ? 'Open the join link from the hosted Didasko app to see live captions.' : 'This copy of Didasko isn’t connected to its database yet. Ask your teacher to finish setup (SETUP.md).'); return; }
  renderPMessage('Joining…', `Connecting to session ${P.code}.`, true);
  await initCloud();
  try { await ensureAuth(); } catch (e) { renderPMessage('Couldn’t connect', e.message); return; }
  P.uid = CLOUD.user.uid;
  P.ref = CLOUD.db.ref('sessions/' + P.code);
  const snap = await P.ref.child('host').once('value').catch(() => null);
  if (!snap || !snap.exists()) { renderPMessage('No session with that code', `Check the code ${P.code} with your teacher, or scan the QR code again.`, false, true); return; }
  await joinSession();
}
function renderJoin(err) {
  $('#participant').innerHTML = `<div class="p-join">
    <div class="brand-mark big"><svg class="i"><use href="#i-chalk"/></svg></div>
    <h1>Join a live lecture</h1><p>Enter the code shown on your teacher’s screen.</p>
    <form id="p-join-form" class="p-join-form" novalidate><input id="p-code" class="mono" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABC123" aria-label="Join code" inputmode="text"><button class="btn primary" type="submit">Join</button></form>
    ${err ? `<p class="p-err">${esc(err)}</p>` : ''}</div>`;
  $('#p-join-form').onsubmit = e => { e.preventDefault(); const c = $('#p-code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length < 6) { renderJoin('Codes have 6 letters and numbers.'); return; } location.search = '?join=' + c; };
  $('#p-code').focus();
}
function renderPMessage(title, text, spin, retry) {
  $('#participant').innerHTML = `<div class="p-join">${spin ? '<span class="spinner"></span>' : ''}<h1>${esc(title)}</h1><p>${esc(text)}</p>${retry ? '<button class="btn" id="p-retry">Enter a different code</button>' : ''}</div>`;
  if (retry) $('#p-retry').onclick = () => { location.search = '?join='; };
}
async function pickAnimal() {
  const taken = new Set(Object.values((await P.ref.child('participants').once('value')).val() || {}).map(p => `${p.color} ${p.animal}`));
  for (let i = 0; i < 40; i++) { const c = PALETTE[Math.floor(Math.random() * PALETTE.length)][0], a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]; if (!taken.has(`${c} ${a}`)) return [c, a]; }
  return [PALETTE[0][0], ANIMALS[Math.floor(Math.random() * ANIMALS.length)] + ' ' + Math.floor(Math.random() * 90 + 10)];
}
async function joinSession() {
  const saved = pLoad('me-' + P.code, null);
  let [color, animal] = saved?.animal ? [saved.color, saved.animal] : await pickAnimal();
  P.me = { color, animal, name: pLoad('name', ''), lang: P.lang, online: true, joinedAt: TS() };
  pSave('me-' + P.code, { color, animal });
  const meRef = P.ref.child('participants/' + P.uid);
  await meRef.set(P.me).catch(() => {});
  meRef.child('online').onDisconnect().set(false);
  CLOUD.db.ref('.info/connected').on('value', s => { if (s.val()) { meRef.child('online').set(true).catch(() => {}); meRef.child('online').onDisconnect().set(false); } });
  renderPShell();
  P.ref.child('active').on('value', s => { P.ended = s.val() === false; renderPHeader(); });
  P.ref.child('title').on('value', s => { P.session.title = s.val() || 'Live lecture'; renderPHeader(); });
  P.ref.child('lecturer').on('value', s => { P.session.lecturer = s.val() || ''; renderPHeader(); });
  P.ref.child('srcLang').on('value', s => { P.session.srcLang = s.val() || 'en-US'; renderPLangs(); });
  const cq = P.ref.child('captions').orderByChild('t').limitToLast(150);
  cq.on('child_added', s => { P.caps.set(s.key, s.val()); schedulePCaps(); });
  cq.on('child_changed', s => { P.caps.set(s.key, s.val()); schedulePCaps(); });
  cq.on('child_removed', s => { P.caps.delete(s.key); schedulePCaps(); });
  P.ref.child('interim').on('value', s => { P.interim = s.val()?.text || ''; schedulePCaps(); });
  P.ref.child('quiz').on('value', s => onPQuiz(s.val()));
  P.ref.child('reveal').on('value', s => { P.reveals = s.val() || {}; renderPQuiz(); });
  P.ref.child('scores/' + P.uid).on('value', s => { P.myScore = s.val() || 0; renderPQuiz(); });
}
function renderPShell() {
  $('#participant').innerHTML = `
    <header class="p-top"><div class="grow" style="min-width:0"><div class="p-title" id="p-title">Live lecture</div><div class="p-sub" id="p-sub"></div></div><span class="status-pill live" id="p-status"><span class="dot"></span><span>LIVE</span></span></header>
    <div class="p-tabs seg" role="tablist"><button role="tab" id="pt-captions" aria-pressed="true">Captions</button><button role="tab" id="pt-quiz" aria-pressed="false">Quiz<span class="p-badge" id="pt-badge" hidden></span></button></div>
    <section class="p-caps-wrap" id="pv-captions">
      <div class="p-caps" id="p-caps" aria-live="polite"></div>
      <button class="btn sm p-jump" id="p-jump" hidden>Jump to latest ↓</button>
      <div class="p-bar">
        <label class="field grow"><span>Show captions in</span><select id="p-lang"></select></label>
        <div class="row" style="gap:6px;align-self:flex-end"><button class="stage-btn" id="p-smaller" aria-label="Smaller text">A−</button><button class="stage-btn" id="p-bigger" aria-label="Larger text">A+</button></div>
      </div>
      <p class="p-note" id="p-note"></p>
    </section>
    <section class="p-quiz" id="pv-quiz" hidden></section>`;
  $('#pt-captions').onclick = () => setPTab('captions'); $('#pt-quiz').onclick = () => setPTab('quiz');
  $('#p-smaller').onclick = () => { P.size = Math.max(0, P.size - 1); pSave('size', P.size); applyPSize(); };
  $('#p-bigger').onclick = () => { P.size = Math.min(PSIZES.length - 1, P.size + 1); pSave('size', P.size); applyPSize(); };
  const box = $('#p-caps');
  box.addEventListener('scroll', () => { P.follow = box.scrollTop + box.clientHeight >= box.scrollHeight - 40; $('#p-jump').hidden = P.follow; });
  $('#p-jump').onclick = () => { P.follow = true; box.scrollTop = box.scrollHeight; $('#p-jump').hidden = true; };
  renderPLangs(); applyPSize(); setPTab(P.tab); renderPHeader();
}
function renderPHeader() {
  const t = $('#p-title'); if (!t) return;
  t.textContent = P.session.title || 'Live lecture';
  $('#p-sub').textContent = [P.session.lecturer, P.me ? `You: ${displayName(P.me, P.quiz?.nameMode || 'animal')}` : ''].filter(Boolean).join(' · ');
  const st = $('#p-status'); st.className = 'status-pill ' + (P.ended ? '' : 'live'); st.lastElementChild.textContent = P.ended ? 'Ended' : 'LIVE';
}
function setPTab(t) {
  P.tab = t; $('#pt-captions').setAttribute('aria-pressed', String(t === 'captions')); $('#pt-quiz').setAttribute('aria-pressed', String(t === 'quiz'));
  $('#pv-captions').hidden = t !== 'captions'; $('#pv-quiz').hidden = t !== 'quiz';
  if (t === 'quiz') { $('#pt-badge').hidden = true; renderPQuiz(); } else schedulePCaps();
}
function applyPSize() { const b = $('#p-caps'); if (b) b.style.fontSize = PSIZES[P.size] + 'rem'; }
function renderPLangs() {
  const sel = $('#p-lang'); if (!sel) return;
  const src = srcBase(P.session.srcLang || 'en-US');
  sel.innerHTML = `<option value="off">${esc(srcName(P.session.srcLang || 'en-US'))} (original)</option>` + TGT_LANGS.filter(([c]) => c !== 'off' && c !== src).map(([c, l]) => `<option value="${c}" ${c === P.lang ? 'selected' : ''}>${esc(l)}</option>`).join('');
  if (P.lang === src) P.lang = 'off';
  sel.value = P.lang;
  sel.onchange = () => { P.lang = sel.value; pSave('lang', P.lang); P.ref.child(`participants/${P.uid}/lang`).set(P.lang).catch(() => {}); P.localTr.clear(); schedulePCaps(); renderPNote(); };
  renderPNote();
}
function renderPNote() {
  const n = $('#p-note'); if (!n) return;
  n.textContent = P.lang === 'off' ? 'Captions are created live from your teacher’s microphone and may contain mistakes.' : `Translations to ${tgtName(P.lang)} are created live and may take a few seconds or contain mistakes.`;
}
function schedulePCaps() { if (!P.raf) P.raf = requestAnimationFrame(() => { P.raf = 0; renderPCaps(); }); }
async function localTranslate(id, text) {
  if (!('Translator' in self) || P.localTr.has(id)) return;
  P.localTr.set(id, null);
  try {
    const src = srcBase(P.session.srcLang || 'en-US');
    if ((await self.Translator.availability({ sourceLanguage: src, targetLanguage: P.lang })) === 'unavailable') return;
    const t = await self.Translator.create({ sourceLanguage: src, targetLanguage: P.lang });
    P.localTr.set(id, await t.translate(text)); schedulePCaps();
  } catch { /* leave original */ }
}
function renderPCaps() {
  const box = $('#p-caps'); if (!box || P.tab !== 'captions') return;
  const items = [...P.caps.entries()].sort((a, b) => a[1].t - b[1].t);
  const lang = P.lang, rtl = RTL.has(lang);
  if (!items.length && !P.interim) { box.innerHTML = `<div class="p-empty">${P.ended ? 'This session has ended.' : 'Waiting for your teacher to start speaking…'}</div>`; return; }
  box.innerHTML = items.map(([id, c]) => {
    if (c.kind === 'topic') return `<div class="cap-topic">${esc(c.text)}</div>`;
    let tr = lang === 'off' ? '' : (c.tr?.[lang] || P.localTr.get(id) || '');
    if (lang !== 'off' && !tr && Date.now() > 0) localTranslate(id, c.text);
    return `<div class="cap${c.key ? ' key' : ''}">${lang === 'off' ? `<div class="cap-o">${esc(c.text)}</div>` : tr ? `<div class="cap-t" dir="${rtl ? 'rtl' : 'auto'}">${esc(tr)}</div><div class="cap-o small-o">${esc(c.text)}</div>` : `<div class="cap-o">${esc(c.text)}</div><div class="cap-t pending">translating…</div>`}</div>`;
  }).join('') + (P.interim && !P.ended ? `<div class="cap interim"><div class="cap-o">${esc(P.interim)}</div></div>` : '') + (P.ended ? '<div class="cap-topic">Session ended</div>' : '');
  if (P.follow) box.scrollTop = box.scrollHeight;
}

/* ---- Quiz ---- */
function onPQuiz(q) {
  const prev = P.quiz;
  P.quiz = q;
  if (q && (q.state === 'lobby' || q.state === 'question') && (!prev || prev.state !== q.state || prev.index !== q.index)) {
    if (P.tab !== 'quiz') { setPTab('quiz'); }
    if (q.state === 'question' && navigator.vibrate) navigator.vibrate(60);
  }
  renderPHeader(); renderPQuiz();
}
async function pAnswer(k) {
  const q = P.quiz; if (!q || q.state !== 'question' || P.myAnswers[q.index] !== undefined) return;
  if (q.duration && serverNow() > q.startedAt + q.duration * 1000) return;
  P.myAnswers[q.index] = k; renderPQuiz();
  try { await P.ref.child(`responses/${q.index}/${P.uid}`).set({ c: k, ms: Math.max(0, serverNow() - (q.startedAt || serverNow())) }); }
  catch { delete P.myAnswers[q.index]; toast('That answer didn’t go through — time may be up.'); renderPQuiz(); }
}
async function pTranslateQuiz(q) {
  if (P.lang === 'off' || !('Translator' in self) || !q?.q) return;
  const key = 'q' + q.index; if (P.localTr.has(key)) return;
  P.localTr.set(key, null);
  try {
    const src = srcBase(P.session.srcLang || 'en-US'), t = await self.Translator.create({ sourceLanguage: src, targetLanguage: P.lang });
    P.localTr.set(key, { stem: await t.translate(q.q.stem), options: await Promise.all(q.q.options.map(o => t.translate(o))) }); renderPQuiz();
  } catch { /* show original */ }
}
function renderPQuiz() {
  const box = $('#pv-quiz'); if (!box) return;
  const q = P.quiz;
  if (P.tab !== 'quiz') { if (q && (q.state === 'lobby' || q.state === 'question')) { $('#pt-badge').hidden = false; } return; }
  clearInterval(P.timer);
  const meName = P.me ? displayName(P.me, q?.nameMode || 'animal') : '';
  const meChip = P.me ? `<div class="me-chip" style="--c:${colorHex(P.me.color)}"><span class="dot"></span>${esc(meName)}</div>` : '';
  if (!q || q.state === 'closed') { box.innerHTML = `<div class="p-empty">${meChip}<p>No quiz is running right now. When your teacher starts one, it appears here.</p></div>`; return; }
  if (q.nameMode === 'ask' && !P.me.name && q.state !== 'ended') {
    box.innerHTML = `<form class="p-name" id="p-name-form"><h2>What’s your name?</h2><p>Your teacher will see this name with your answers.</p><input id="p-name" maxlength="40" autocomplete="name" placeholder="First and last name" aria-label="Your name"><button class="btn primary" type="submit">Save name</button></form>`;
    $('#p-name-form').onsubmit = e => { e.preventDefault(); const v = $('#p-name').value.trim().slice(0, 40); if (!v) return; P.me.name = v; pSave('name', v); P.ref.child(`participants/${P.uid}/name`).set(v).catch(() => {}); renderPQuiz(); renderPHeader(); };
    return;
  }
  if (q.state === 'lobby') { box.innerHTML = `<div class="p-empty">${meChip}<h2>You’re in!</h2><p>The quiz will start soon. ${q.total} questions${q.duration ? `, ${q.duration} seconds each` : ''}.</p></div>`; return; }
  if (q.state === 'ended') {
    const n = q.total || 0; let correct = 0;
    for (let i = 0; i < n; i++) if (P.reveals[i] && P.myAnswers[i] === P.reveals[i].answer) correct++;
    box.innerHTML = `<div class="p-empty">${meChip}<h2>Quiz complete</h2><p class="p-score"><b>${correct}</b> of ${n} correct${q.showBoard ? ` · ${P.myScore || 0} points` : ''}</p><p>Thanks for taking part. Your teacher has your results.</p></div>`; return;
  }
  const item = q.q || { stem: '', options: [] }, mine = P.myAnswers[q.index], rv = q.state === 'reveal' ? P.reveals[q.index] : null;
  pTranslateQuiz(q);
  const trq = P.localTr.get('q' + q.index);
  box.innerHTML = `<div class="p-q">
    <div class="row between"><span class="eyebrow">Question ${q.index + 1} of ${q.total}</span>${q.duration && !rv ? `<span class="p-time mono" id="p-time"></span>` : ''}</div>
    ${q.duration && !rv ? '<div class="lq-track"><div id="p-bar"></div></div>' : ''}
    <h2 class="p-stem">${esc(item.stem)}</h2>${trq ? `<p class="p-stem-tr" dir="auto">${esc(trq.stem)}</p>` : ''}
    <div class="p-opts ${item.type === 'tf' ? 'tf' : ''}">${item.options.map((o, k) => {
      const cls = rv ? (k === rv.answer ? 'correct' : k === mine ? 'wrong' : 'dim') : (mine === k ? 'picked' : mine !== undefined ? 'dim' : '');
      return `<button class="p-opt ${cls}" data-k="${k}" style="--oc:${OPT_COLORS[k]}" ${mine !== undefined || rv ? 'disabled' : ''}><span class="L">${optLetter(item, k)}</span><span class="grow">${esc(o)}${trq?.options?.[k] ? `<small dir="auto">${esc(trq.options[k])}</small>` : ''}</span></button>`;
    }).join('')}</div>
    <p class="p-status-line">${rv ? (mine === undefined ? 'No answer this time.' : mine === rv.answer ? '✓ Correct!' : '✗ Not this time.') + (rv.explanation ? ` ${esc(rv.explanation)}` : '') : mine !== undefined ? 'Answer locked in. Waiting for the others…' : 'Tap your answer.'}</p>
  </div>`;
  $$('.p-opt', box).forEach(b => b.onclick = () => pAnswer(+b.dataset.k));
  if (q.duration && !rv) {
    const tick = () => {
      const rem = Math.max(0, (q.startedAt || 0) + q.duration * 1000 - serverNow());
      const t = $('#p-time'), bar = $('#p-bar'); if (!t) { clearInterval(P.timer); return; }
      t.textContent = Math.ceil(rem / 1000) + 's'; bar.style.transform = `scaleX(${rem / (q.duration * 1000)})`;
      if (rem <= 0) { clearInterval(P.timer); if (mine === undefined) { $$('.p-opt', box).forEach(b => { b.disabled = true; }); $('.p-status-line', box).textContent = 'Time’s up.'; } }
    };
    tick(); P.timer = setInterval(tick, 200);
  }
}

boot();
})();

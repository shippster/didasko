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
  if (!aiReady()) {
    try { L.quiz = { questions: buildLocalQuiz(L, useFiles, n, qtype), reflection: DEFAULT_REFLECTION, local: true, at: Date.now() }; S.ui.practice = {}; saveSoon(); renderQuiz(); renderBadges(); toast('Concept checks built on this device'); }
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
const DEFAULT_AI = { provider: 'gemini', keys: {}, models: {}, imageModels: {}, lists: {}, bases: {}, azure: { endpoint: '', deployment: '', fastDeployment: '', apiVersion: '2024-10-21' } };

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

/* ---- Pictures (children's books). Gemini and OpenAI can paint images; other services fall back to AI-drawn SVG illustrations. ---- */
const IMAGE_MODELS = { gemini: 'gemini-2.5-flash-image', openai: 'gpt-image-1' };
function imageProvider() {
  if (!aiReady()) return null;
  const id = S.settings.ai.provider, p = prov();
  if (p.kind === 'gemini') return 'gemini';
  if (id === 'openai') return 'openai';
  return null;
}
const imageModel = () => (S.settings.ai.imageModels || {})[S.settings.ai.provider] || IMAGE_MODELS[imageProvider()] || '';
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
const isVideoSrc = L => L.source?.kind === 'video' && !!L.source.url;
const lectureYear = L => (isVideoSrc(L) && L.source.year) || yearOf(L.createdAt);
function lectureInText(L) { const w = inTextAuthors([lecturerOf(L)]) || L.course || (isVideoSrc(L) ? L.source.title?.split(/\s+/).slice(0, 4).join(' ') : '') || 'Lecture'; return `(${w}, ${lectureYear(L)})`; }
function lectureRef(L, titleSC) {
  const lec = lecturerOf(L), s = L.source || {};
  if (isVideoSrc(L)) return apaRef({ authors: lec ? [lec] : [], date: s.year || 'n.d.', title: titleSC || s.title || L.title, desc: 'Video', source: 'YouTube', url: s.url });
  const src = [L.course, L.institution].filter(Boolean).join(', ');
  return apaRef({ authors: lec ? [lec] : [], date: apaLongDate(L.createdAt), title: titleSC || L.title, desc: s.kind === 'audio' ? 'Lecture recording' : 'Lecture', source: src });
}
const hasTranscript = L => speechSegs(L).length > 0;
function citedFiles(L) { return L.files.filter(f => f.useNotes); }
function referenceList(L) {
  const n = L.notes || {}, titles = n.titles || {};
  const refs = [...(hasTranscript(L) ? [lectureRef(L, n.lectureTitle)] : []), ...citedFiles(L).map(f => fileRef(f, titles[f.id]))];
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
/* ---- Compose the article. Layout modeled on a single-column research journal (e.g. Springer):
   running header, bold title, authors joined by "·", run-in Abstract and Keywords, numbered sections
   (1 Introduction, 1.1 …), justified body, first-page author footnote, small hanging-indent references. ---- */
const JOURNAL = 'Didasko Lecture Notes', JOURNAL_SHORT = 'Didasko Lect Notes';
const UNNUMBERED = /^(abstract|references|works cited|keywords|acknowledg)/i;
function numberHeadings(md) {
  let a = 0, b = 0, c = 0;
  return String(md || '').split('\n').map(l => {
    const m2 = l.match(/^##\s+(.*)$/), m3 = l.match(/^###\s+(.*)$/), m4 = l.match(/^####\s+(.*)$/);
    const clean = s => s.replace(/^\d+(\.\d+)*\.?\s+/, '').trim();
    if (m2 && !UNNUMBERED.test(clean(m2[1]))) { a++; b = 0; c = 0; return `## ${a} ${clean(m2[1])}`; }
    if (m3 && a) { b++; c = 0; return `### ${a}.${b} ${clean(m3[1])}`; }
    if (m4 && a && b) { c++; return `#### ${a}.${b}.${c} ${clean(m4[1])}`; }
    return l;
  }).join('\n');
}
function composeJournal(L, mla) {
  const sb = splitBody(L.notes?.md || '');
  const full = sb.title || L.title;
  const [t, ...sub] = full.split(/:\s+/);
  const lecturer = lecturerOf(L), author = (L.author || S.settings.author || '').trim();
  const running = full.replace(/:.*$/, '');
  const src = L.source || {};
  return {
    mla, fullTitle: full, title: sub.length ? t : full, subtitle: sub.join(': '),
    lecturer, author: author && author !== lecturer ? author : '',
    affiliation: (L.institution || S.settings.institution || '').trim(),
    course: (L.course || '').trim(), date: mla ? mlaLongDate(L.createdAt) : titleDate(L.createdAt), length: fmtClock(L.ms || 0),
    runningHead: running.length > 60 ? running.slice(0, 57).replace(/\s+\S*$/, '') + '…' : running,
    abstract: sb.abstract, keywords: (sb.keywords || (L.notes?.keywords || []).join(', ')).split(/\s*[,;·]\s*/).filter(Boolean),
    body: numberHeadings(sb.body),
    cite: mla ? mlaLectureRef(L, L.notes?.lectureTitle) : lectureRef(L, L.notes?.lectureTitle),
    refs: mla ? worksCited(L) : referenceList(L), refsTitle: mla ? 'Works Cited' : 'References',
    kind: hasTranscript(L) ? (isVideoSrc(L) ? 'Notes on a video lecture' : src.kind === 'audio' ? 'Notes on a recorded lecture' : 'Lecture notes') : 'Notes on course materials',
    hasTr: hasTranscript(L), video: isVideoSrc(L)
  };
}
const composeApa = L => composeJournal(L, false);
// In-text citation years in the journal's link color, as in the example article.
const tintYears = html => html.replace(/\(([^()<>]*?\b(?:1[89]|20)\d{2}[a-z]?\b[^()<>]*?)\)/g, (m, inner) => '(' + inner.replace(/\b((?:1[89]|20)\d{2}[a-z]?)\b/g, '<span class="yr">$1</span>') + ')');
function journalHtml(L, mla) {
  const c = composeJournal(L, mla);
  const people = [c.lecturer, c.author].filter(Boolean);
  const aff = [c.affiliation, c.course].filter(Boolean).join(', ');
  const body = tintYears(mdToHtml(c.body));
  const cut = body.indexOf('<h2', body.indexOf('<h2') + 1); // the author footnote sits at the foot of the first section, as on page one of a journal
  const fn = people.length || aff ? `<div class="jr-fn">${people.length ? `<p><b>${esc(people[0])}</b>${aff ? `<br>${esc(aff)}` : ''}</p>` : ''}${c.author ? `<p>${esc(c.author)} prepared these notes.</p>` : ''}</div>` : '';
  const bodyHtml = cut > 0 ? body.slice(0, cut) + fn + body.slice(cut) : body + fn;
  return `<article class="jr${mla ? ' jr-mla' : ''}">
    <header class="jr-run"><span><span class="jr-j">${JOURNAL_SHORT}</span><br>${esc([c.kind, c.date].join(' · '))}</span><span class="jr-rh">${esc(c.course || '')}</span></header>
    <h1 class="jr-title">${inl(c.title)}${c.subtitle ? `: ${inl(c.subtitle)}` : ''}</h1>
    ${people.length ? `<p class="jr-authors">${people.map(esc).join(' · ')}</p>` : ''}
    <p class="jr-meta">${esc([c.hasTr ? (c.video ? 'Video' : 'Lecture') + ` · ${c.date}` : c.date, c.hasTr && c.length !== '0:00' ? `${c.length} recorded` : '', aff].filter(Boolean).join(' · '))}</p>
    ${c.abstract ? `<div class="jr-abs">${tintYears(mdToHtml(c.abstract)).replace(/^<p>/, '<p><b>Abstract</b> ')}</div>` : ''}
    ${c.keywords.length ? `<p class="jr-kw"><b>Keywords</b> ${c.keywords.map(esc).join(' · ')}</p>` : ''}
    <div class="jr-body">${bodyHtml}</div>
    <section class="jr-refs"><h2>${c.refsTitle}</h2>${c.refs.map(r => `<p class="apa-ref">${inl(r)}</p>`).join('')}</section>
    <footer class="jr-foot">${c.hasTr ? `<span><b>Cite as:</b> ${inl(c.cite)}</span>` : ''}<span>${JOURNAL}</span></footer>
  </article>`;
}
const apaHtml = L => journalHtml(L, false);
function ensureJournalCss() { if (!document.getElementById('jr-css')) { const st = document.createElement('style'); st.id = 'jr-css'; st.textContent = JOURNAL_CSS; document.head.appendChild(st); } }
function journalMarkdown(L, mla) {
  const c = composeJournal(L, mla);
  return [`*${JOURNAL} · ${c.kind} · ${c.date}*`, '', `# ${c.fullTitle}`, '', [c.lecturer, c.author].filter(Boolean).map(x => `**${x}**`).join(' · '),
    [c.affiliation, c.course].filter(Boolean).join(', '), '', c.abstract ? `**Abstract** ${c.abstract.replace(/\n+/g, ' ')}` : '', '', c.keywords.length ? `**Keywords** ${c.keywords.join(' · ')}` : '', '', c.body, '', `## ${c.refsTitle}`, '', c.refs.join('\n\n'), '', c.hasTr ? `*Cite as:* ${c.cite}` : ''].join('\n').replace(/\n{3,}/g, '\n\n');
}
const apaMarkdown = L => journalMarkdown(L, false);
function journalStandalone(L, mla) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(composeJournal(L, mla).fullTitle)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=STIX+Two+Text:ital,wght@0,400;0,700;1,400&display=swap">
<style>body{margin:0;background:#e9eaea;padding:24px 12px}${JOURNAL_CSS}</style></head><body>${journalHtml(L, mla)}</body></html>`;
}
const apaStandalone = L => journalStandalone(L, false);
const JOURNAL_CSS = `
.jr{--jr-ink:#141414;--jr-mute:#4d4d4d;--jr-rule:#1a1a1a;--jr-link:#1f4e8c;--jr-soft:#f4f4f2;background:#fff;color:var(--jr-ink);max-width:7.4in;margin:0 auto;padding:clamp(22px,6vw,.85in) clamp(18px,6.5vw,1in) clamp(22px,5vw,.7in);font:16.5px/1.52 "STIX Two Text","Times New Roman",Tinos,Times,serif;box-shadow:0 1px 4px rgba(0,0,0,.14);border-radius:2px;overflow-wrap:anywhere;text-rendering:optimizeLegibility}
.jr *{box-sizing:border-box}
.jr-run{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;font-size:12.5px;line-height:1.4;padding-bottom:7px;border-bottom:1px solid var(--jr-rule);margin-bottom:clamp(26px,5vw,44px)}
.jr-rh{text-align:right}
.jr-title{margin:0 0 14px;font-weight:700;font-size:clamp(21px,3.4vw,25px);line-height:1.24;font-family:inherit;letter-spacing:0;text-wrap:balance;text-align:left;border:0;padding:0;color:var(--jr-ink);max-width:34em}
.jr-authors{margin:0;font-weight:700}
.jr-meta{margin:clamp(22px,5vw,40px) 0 clamp(18px,4vw,30px);font-size:12.5px;color:var(--jr-mute)}
.jr-abs p{margin:0;text-align:justify;hyphens:auto}
.jr-abs b,.jr-kw b{margin-right:.45em}
.jr-kw{margin:12px 0 clamp(26px,5vw,38px)}
.jr-body h2{font-weight:700;font-size:1em;line-height:1.3;font-family:inherit;margin:1.9em 0 .85em;text-align:left;border:0;padding:0;color:var(--jr-ink);break-after:avoid}
.jr-body > h2:first-child{margin-top:0}
.jr-body h3{font-weight:400;font-size:1em;line-height:1.3;font-family:inherit;margin:1.5em 0 .8em;break-after:avoid}
.jr-body h4{font-style:italic;font-weight:400;font-size:1em;line-height:1.3;font-family:inherit;margin:1.2em 0 .5em;break-after:avoid}
.jr-body p{margin:0;text-indent:1.5em;text-align:justify;hyphens:auto}
.jr-body h2+p,.jr-body h3+p,.jr-body h4+p,.jr-body .table-wrap+p,.jr-body ul+p,.jr-body ol+p,.jr-body blockquote+p,.jr-body .jr-fn+p{text-indent:0}
.jr-body ul,.jr-body ol{margin:.55em 0 .7em;padding-left:2.1em}
.jr-body li{margin:.12em 0;text-align:justify;padding-left:.3em}
.jr-body blockquote{margin:.8em 2.2em;padding:0;border:0;background:none;font-size:.96em}
.jr-body blockquote p{text-indent:0}
.jr-body p:has(> strong:only-child){text-indent:0;margin-top:1em;font-size:.86em}
.jr-body p:has(> em:only-child){text-indent:0;font-size:.86em;margin-bottom:.4em}
.jr-body .table-wrap{overflow-x:auto;margin:.4em 0 1.1em;break-inside:avoid}
.jr-body table{border-collapse:collapse;width:100%;font-size:.86em;line-height:1.4}
.jr-body th{border-top:1.5px solid var(--jr-ink);border-bottom:1px solid var(--jr-ink);text-align:left;padding:5px 8px;background:none;font-weight:700}
.jr-body td{border:0;padding:5px 8px;vertical-align:top}
.jr-body tbody tr:last-child td{border-bottom:1.5px solid var(--jr-ink)}
.jr-body code{font-family:ui-monospace,monospace;font-size:.85em}
.jr-fn{margin:1.6em 0 .4em;font-size:12.5px;line-height:1.42}
.jr-fn::before{content:"";display:block;width:150px;border-top:1px solid var(--jr-rule);margin-bottom:7px}
.jr-fn p{margin:0 0 .5em!important;text-indent:0!important;text-align:left!important}
.jr-fn b{font-weight:400}
.jr .yr{color:var(--jr-link)}
.jr-refs{margin-top:2.4em}
.jr-refs h2{font-weight:700;font-size:1em;line-height:1.3;font-family:inherit;margin:0 0 .9em;text-align:left;border:0;padding:0;color:var(--jr-ink)}
.jr-refs .apa-ref{font-size:12.8px;line-height:1.45;margin:0 0 .42em;padding-left:1.5em;text-indent:-1.5em!important;text-align:left;break-inside:avoid}
.jr-refs a{color:var(--jr-link)}
.jr-foot{display:flex;justify-content:space-between;gap:8px 18px;flex-wrap:wrap;margin-top:2.4em;padding-top:8px;border-top:1px solid #cfcfcf;font-size:12px;line-height:1.45;color:var(--jr-mute)}
.jr-foot span:first-child{padding-left:1.5em;text-indent:-1.5em;flex:1 1 22em}
.jr a{color:inherit}
@media print{.jr{box-shadow:none;max-width:none;padding:0;font-size:10.5pt}.jr-refs .apa-ref{font-size:9pt}.jr-fn,.jr-run,.jr-meta{font-size:8.5pt}}`;

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
  const k = styleKey($('#notes-style')?.value || L.notes?.style), mla = k === 'mla', n = citedFiles(L).length;
  if (k === 'kids') { el.innerHTML = lec ? `Based on the lecture by <b>${esc(lec)}</b> · <button class="linklike" id="notes-cite-edit">Edit</button>` : `<button class="linklike" id="notes-cite-edit">Add the lecturer’s name</button> to credit them in the book.`; $('#notes-cite-edit').onclick = () => openLectureSheet(true); return; }
  if (!hasTranscript(L)) { el.innerHTML = `No transcript: ${n ? `the output is written from your ${n} material${n === 1 ? '' : 's'} and cites ${n === 1 ? 'it' : 'them'}` : 'add a paper or reading on the Files tab, or transcribe a recording or video'}.`; return; }
  el.innerHTML = lec
    ? `${isVideoSrc(L) ? 'Video' : 'Lecture'} cited as <b>${inl(mla ? mlaLectureInText(L) : lectureInText(L))}</b> · ${n} more source${n === 1 ? '' : 's'} in ${mla ? 'Works Cited' : k === 'apa' ? 'References' : 'Sources'} · <button class="linklike" id="notes-cite-edit">Edit</button>`
    : `<b>Add the lecturer’s name</b> so the notes can cite the lecture${k === 'apa' || mla ? ' (required for APA and MLA)' : ''}. <button class="linklike" id="notes-cite-edit">Add</button>`;
  $('#notes-cite-edit').onclick = () => openLectureSheet(true);
}
function journalDocBlocks(L, mla) {
  const c = composeJournal(L, mla), B = [];
  const people = [c.lecturer, c.author].filter(Boolean), aff = [c.affiliation, c.course].filter(Boolean).join(', ');
  B.push({ type: 'p', style: 'Masthead', runs: [{ text: JOURNAL_SHORT }, { text: '\n' + [c.kind, c.date].join(' · ') }, { text: '\t' }, { text: c.course || '' }] });
  B.push({ type: 'p', style: 'ArticleTitle', runs: [...parseInline(c.title), ...(c.subtitle ? [{ text: ': ' }, ...parseInline(c.subtitle)] : [])] });
  if (people.length) B.push({ type: 'p', style: 'Authors', runs: [{ text: people.join(' · ') }] });
  B.push({ type: 'p', style: 'Meta', runs: [{ text: [c.hasTr ? (c.video ? 'Video' : 'Lecture') + ` · ${c.date}` : c.date, c.hasTr && c.length !== '0:00' ? `${c.length} recorded` : '', aff].filter(Boolean).join(' · ') }] });
  if (c.abstract) parseMd(c.abstract).forEach((b, i) => B.push({ type: 'p', style: 'Abstract', runs: [...(i ? [] : [{ text: 'Abstract  ', b: true }]), ...parseInline(b.text || '')] }));
  if (c.keywords.length) B.push({ type: 'p', style: 'Keywords', runs: [{ text: 'Keywords  ', b: true }, { text: c.keywords.join(' · ') }] });
  let prevHead = true, h2s = 0;
  const fn = () => { if (people.length || aff) { B.push({ type: 'p', style: 'FootnoteRule', runs: [{ text: '' }] }); B.push({ type: 'p', style: 'AuthorNote', runs: [{ text: [people[0], aff].filter(Boolean).join('\n') + (c.author ? `\n${c.author} prepared these notes.` : '') }] }); } };
  parseMd(c.body).forEach(b => {
    if (b.type === 'h' && b.level === 2 && ++h2s === 2) fn();
    const label = b.type === 'p' && (/^\*\*(Table|Figure) \d+\*\*$/.test(b.text) || /^\*[^*]+\*$/.test(b.text));
    B.push(b.type === 'p' ? { ...b, noIndent: prevHead || label, style: label ? 'TableLabel' : undefined } : b);
    prevHead = b.type === 'h' || b.type === 'table' || b.type === 'list' || label;
  });
  if (h2s < 2) fn();
  B.push({ type: 'p', style: 'RefsHeading', runs: [{ text: c.refsTitle }] });
  c.refs.forEach(r => B.push({ type: 'ref', text: r }));
  if (c.hasTr) B.push({ type: 'p', style: 'CiteLine', runs: [{ text: 'Cite as: ', b: true }, ...parseInline(c.cite)] });
  return { blocks: B, runningHead: c.runningHead, footer: [JOURNAL, c.course].filter(Boolean).join(' · ') };
}
const apaDocBlocks = L => journalDocBlocks(L, false);

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
  const left = '<w:jc w:val="left"/><w:ind w:firstLine="0"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:jc w:val="both"/><w:ind w:firstLine="340"/></w:pPr></w:style>
  ${st('Masthead', 'Running header', `<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>${left}<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="1A1A1A"/></w:pBdr><w:spacing w:after="520"/>`, '<w:sz w:val="17"/>')}
  ${st('ArticleTitle', 'Title', `<w:keepNext/>${left}<w:spacing w:after="200" w:line="276" w:lineRule="auto"/>`, '<w:b/><w:sz w:val="30"/><w:szCs w:val="30"/>')}
  ${st('Authors', 'Authors', left, '<w:b/>')}
  ${st('Meta', 'Article metadata', `${left}<w:spacing w:before="480" w:after="360"/>`, '<w:color w:val="4D4D4D"/><w:sz w:val="17"/>')}
  ${st('Abstract', 'Abstract', '<w:jc w:val="both"/><w:ind w:firstLine="0"/><w:spacing w:after="160"/>', '')}
  ${st('Keywords', 'Keywords', `${left}<w:spacing w:after="480"/>`, '')}
  ${st('Heading1', 'heading 1', `<w:keepNext/>${left}<w:spacing w:before="400" w:after="200"/><w:outlineLvl w:val="0"/>`, '<w:b/>')}
  ${st('Heading2', 'heading 2', `<w:keepNext/>${left}<w:spacing w:before="300" w:after="160"/><w:outlineLvl w:val="1"/>`, '')}
  ${st('Heading3', 'heading 3', `<w:keepNext/>${left}<w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="2"/>`, '<w:i/>')}
  ${st('ListParagraph', 'List Paragraph', '<w:jc w:val="both"/><w:ind w:firstLine="0"/><w:spacing w:after="40"/>', '')}
  ${st('TableLabel', 'Table label', `<w:keepNext/>${left}<w:spacing w:before="160"/>`, '<w:sz w:val="18"/>')}
  ${st('TableText', 'Table text', `<w:keepNext/>${left}<w:spacing w:line="240" w:lineRule="auto"/>`, '<w:sz w:val="18"/>')}
  ${st('FootnoteRule', 'Footnote rule', `${left}<w:spacing w:before="320" w:after="80"/><w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="1A1A1A"/></w:pBdr><w:ind w:left="0" w:right="7200" w:firstLine="0"/>`, '<w:sz w:val="4"/>')}
  ${st('AuthorNote', 'Author note', `${left}<w:spacing w:after="240" w:line="240" w:lineRule="auto"/>`, '<w:sz w:val="17"/>')}
  ${st('RefsHeading', 'References heading', `<w:keepNext/>${left}<w:spacing w:before="480" w:after="200"/>`, '<w:b/>')}
  ${st('Reference', 'Reference', '<w:jc w:val="left"/><w:ind w:left="284" w:hanging="284"/><w:spacing w:after="60" w:line="240" w:lineRule="auto"/>', '<w:sz w:val="18"/>')}
  ${st('Quote', 'Quote', '<w:ind w:left="567" w:right="567" w:firstLine="0"/><w:spacing w:before="120" w:after="120"/>', '<w:sz w:val="20"/>')}
  ${st('CiteLine', 'Citation line', `${left}<w:ind w:left="284" w:hanging="284"/><w:spacing w:before="360"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="CFCFCF"/></w:pBdr>`, '<w:color w:val="4D4D4D"/><w:sz w:val="16"/>')}
  ${st('Footer', 'footer', `<w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs>${left}`, '<w:color w:val="666666"/><w:sz w:val="15"/>')}
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
    <w:style w:type="paragraph" w:styleId="Picture"><w:name w:val="Picture"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:before="120" w:after="240"/></w:pPr></w:style>
    <w:style w:type="paragraph" w:styleId="BookTitle"><w:name w:val="Book title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/><w:color w:val="1D6B57"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="BookText"><w:name w:val="Book text"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="BookBy"><w:name w:val="Book byline"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr>${hfont}<w:color w:val="8A7A5C"/><w:sz w:val="20"/></w:rPr></w:style>
  </w:styles>`;
}
function mlaStyles(W) {
  const tnr = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>';
  const st = (id, name, ppr, rpr = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>
    <w:docDefaults><w:rPrDefault><w:rPr>${tnr}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:ind w:firstLine="720"/></w:pPr></w:style>
    ${st('NoIndent', 'MLA heading', '<w:ind w:firstLine="0"/>')}
    ${st('MlaTitle', 'Title', '<w:keepNext/><w:jc w:val="center"/><w:ind w:firstLine="0"/>')}
    ${st('Title', 'Title alt', '<w:keepNext/><w:jc w:val="center"/><w:ind w:firstLine="0"/>')}
    ${st('Heading1', 'heading 1', '<w:keepNext/><w:ind w:firstLine="0"/><w:outlineLvl w:val="0"/>', '<w:b/>')}
    ${st('Heading2', 'heading 2', '<w:keepNext/><w:ind w:firstLine="0"/><w:outlineLvl w:val="1"/>', '<w:i/>')}
    ${st('Heading3', 'heading 3', '<w:keepNext/><w:ind w:firstLine="0"/><w:outlineLvl w:val="2"/>', '<w:i/>')}
    ${st('ListParagraph', 'List Paragraph', '<w:ind w:firstLine="0"/>')}
    ${st('Reference', 'Works Cited entry', '<w:ind w:left="720" w:hanging="720"/>')}
    ${st('TableText', 'Table text', '<w:ind w:firstLine="0"/><w:spacing w:line="240" w:lineRule="auto"/>')}
    ${st('Quote', 'Quote', '<w:ind w:left="720" w:firstLine="0"/>')}
    ${st('Footer', 'footer', '<w:ind w:firstLine="0"/><w:jc w:val="right"/>', '<w:sz w:val="16"/>')}
  </w:styles>`;
}
async function buildDocx(blocks, title, opts = {}) {
  const JSZip = await lib('jszip');
  const jr = !!opts.journal, mla = !!opts.mla, nums = [], media = [];
  const para = (inner, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${inner}</w:p>`;
  const hStyle = lv => jr ? 'Heading' + Math.max(1, Math.min(3, lv - 1)) : (lv === 1 ? 'Title' : 'Heading' + Math.min(3, lv - 1));
  const M = jr ? 1440 : mla ? 1440 : 1260;
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
      case 'image': {
        const m = String(b.src || '').match(/^data:image\/(png|jpe?g);base64,(.+)$/); if (!m) return '';
        const n = media.length + 1, ext = m[1] === 'png' ? 'png' : 'jpeg', rid = 'rIdImg' + n;
        media.push({ rid, file: `image${n}.${ext}`, data: m[2] });
        const cx = Math.round((b.wIn || 5) * 914400), cy = Math.round((b.hIn || b.wIn || 5) * 914400);
        const pic = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
        return para(pic, '<w:pStyle w:val="Picture"/>');
      }
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
  const header = mla
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:pPr><w:jc w:val="right"/><w:ind w:firstLine="0"/></w:pPr><w:r><w:t xml:space="preserve">${xe(opts.runningHead ? opts.runningHead + ' ' : '')}</w:t></w:r>${pageField}</w:p></w:hdr>`
    : jr
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">${xe(opts.runningHead || title)}</w:t></w:r><w:r><w:tab/></w:r>${pageField}</w:p></w:hdr>`
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${pageField}</w:p></w:hdr>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:t xml:space="preserve">${xe(opts.footer ?? 'Prepared with Didasko')}</w:t></w:r></w:p></w:ftr>`;
  const finalSect = `<w:sectPr>${refs}${jr ? '<w:type w:val="continuous"/>' : ''}${page}<w:cols w:num="1" w:space="400"/></w:sectPr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W} xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}${finalSect}</w:body></w:document>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${media.map(m => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.file}"/>`).join('')}</Relationships>`);
  media.forEach(m => zip.file('word/media/' + m.file, m.data, { base64: true }));
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(title)}</dc:title><dc:creator>Didasko</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  zip.file('word/document.xml', doc);
  zip.file('word/styles.xml', jr ? journalStyles(W) : mla ? mlaStyles(W) : plainStyles(W));
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

/* ================= Notes output formats =================
   APA journal article (narrative) · MLA journal article · outline overview · children's picture book · anything else the teacher describes.
   Every format is written from the same transcript + materials; only the prompt, the renderer and the exports differ. */
const STYLE_ALIAS = { study: 'apa', cornell: 'apa', handout: 'apa' };
const STYLES = ['apa', 'mla', 'outline', 'kids', 'other'];
const styleKey = s => STYLE_ALIAS[s] || (STYLES.includes(s) ? s : 'apa');
const STYLE_LABEL = { apa: 'APA journal article', mla: 'MLA journal article', outline: 'Outline overview', kids: 'Children’s picture book', other: 'Custom output' };
function styleHint(k) {
  if (k === 'apa') return 'A research-journal article: the lecture reorganized by theme (not in speaking order), each idea unpacked, with abstract, keywords, numbered sections, a discussion, APA 7 citations and References.';
  if (k === 'mla') return 'The same research-journal article, with MLA 9 (Author) citations and a Works Cited list.';
  if (k === 'outline') return 'A quick bulleted overview — main ideas, supporting details and key terms — that’s easy to skim before a test.';
  if (k === 'kids') {
    const ip = imageProvider();
    return aiReady() ? `The lecture retold as an 8–10 page picture book for ages 6–9. ${ip ? `Pictures are painted by ${ip === 'gemini' ? 'Gemini' : 'OpenAI'} (${esc(imageModel())}).` : `Pictures are drawn as illustrations by ${esc(prov().label.replace(/ \(.*\)$/, ''))}. For painted pictures, choose Gemini or ChatGPT in Settings.`}` : 'Picture books need an AI model. Choose one in Settings.';
  }
  return aiReady() ? 'Describe the output you want and Didasko writes it from the lecture and your files.' : 'Custom outputs need an AI model. Choose one in Settings.';
}
function renderNotesStyleUi() {
  const k = styleKey($('#notes-style').value);
  $('#notes-custom-wrap').hidden = k !== 'other';
  $('#notes-style-hint').innerHTML = styleHint(k);
  $('#notes-audience').disabled = k === 'kids';
  renderNotesCite();
}
function syncNotesStyle(L) {
  $('#notes-style').value = styleKey(L.notes?.style || S.settings.notesStyle || 'apa');
  $('#notes-custom').value = L.notes?.custom || S.settings.notesCustom || '';
  renderNotesStyleUi();
}

/* ---- MLA 9 citations ---- */
const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const mlaDate = ts => { const d = new Date(ts); return `${d.getDate()} ${MLA_MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const mlaLongDate = ts => { const d = new Date(ts); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
function mlaInvert(n) {
  n = cleanName(n); if (!n || isOrg(n) || n.includes(',')) return n;
  const p = n.split(/\s+/); if (p.length === 1) return n;
  const last = p.pop(); return `${last}, ${p.join(' ')}`;
}
function mlaAuthors(names) {
  const a = splitNames(names).map(cleanName).filter(Boolean);
  if (!a.length) return '';
  if (a.length === 1) return mlaInvert(a[0]);
  if (a.length === 2) return `${mlaInvert(a[0])}, and ${a[1]}`;
  return `${mlaInvert(a[0])}, et al.`;
}
function mlaInTextName(names) {
  const a = splitNames(names).map(surname).filter(Boolean);
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a[0]} et al.`;
}
const MLA_QUOTED = new Set(['article', 'chapter', 'webpage']);
const mlaLectureInText = L => `(${mlaInTextName([lecturerOf(L)]) || L.course || 'Lecture'})`;
function mlaFileInText(f) {
  const c = fileCite(f), who = mlaInTextName(c.authors);
  if (who) return `(${who})`;
  const short = c.title.split(/\s+/).slice(0, 4).join(' ');
  return MLA_QUOTED.has(c.kind) ? `(“${short}”)` : `(*${short}*)`;
}
const mlaTitleDot = t => /[.?!]$/.test(t) ? t : t + '.';
function mlaFileRef(f, titleOverride) {
  const c = fileCite(f), t = (titleOverride || c.title).trim(), au = mlaAuthors(c.authors);
  const quoted = MLA_QUOTED.has(c.kind);
  let r = au ? endDot(au) + ' ' : '';
  r += quoted ? `“${mlaTitleDot(t)}” ` : `*${t}*${/[?!]$/.test(t) ? '' : '.'} `;
  const tail = [quoted && c.source ? `*${c.source}*` : c.source, c.year && c.year !== 'n.d.' ? c.year : ''].filter(Boolean).join(', ');
  if (tail) r += endDot(tail) + ' ';
  if (c.url) r += endDot(c.url.replace(/^https?:\/\//, '')) + ' ';
  const desc = { slides: 'PowerPoint presentation', image: 'Photograph', dataset: 'Data set', transcript: 'Transcript' }[c.kind];
  if (desc) r += desc + '.';
  return r.trim();
}
function mlaLectureRef(L, title) {
  const lec = lecturerOf(L), s = L.source || {};
  if (isVideoSrc(L)) return `${lec ? endDot(mlaAuthors([lec])) + ' ' : ''}“${mlaTitleDot(title || s.title || L.title)}” *YouTube*, ${s.year ? s.year + ', ' : ''}${endDot(s.url.replace(/^https?:\/\//, ''))}`;
  const where = [L.course, mlaDate(L.createdAt), L.institution].filter(Boolean).join(', ');
  return `${lec ? endDot(mlaAuthors([lec])) + ' ' : ''}“${mlaTitleDot(title || L.title)}” ${endDot(where)} Lecture.`;
}
function worksCited(L) {
  const n = L.notes || {}, titles = n.titles || {};
  const refs = [...(hasTranscript(L) ? [mlaLectureRef(L, n.lectureTitle)] : []), ...citedFiles(L).map(f => mlaFileRef(f, titles[f.id]))];
  const key = r => r.replace(/[*“”"]/g, '').toLowerCase();
  return [...new Set(refs)].sort((a, b) => key(a).localeCompare(key(b)));
}
const composeMla = L => composeJournal(L, true);
const mlaHtml = L => journalHtml(L, true);
function plainDocHtml(L) {
  const k = styleKey(L.notes?.style), md = L.notes?.md || '';
  const meta = [STYLE_LABEL[k], L.course, fmtDate(L.createdAt), lecturerOf(L)].filter(Boolean).join(' · ');
  return `<article class="nd nd-${k}"><p class="nd-kicker">${esc(meta)}</p>${mdToHtml(md)}
    <section class="nd-src"><h2>Sources</h2>${referenceList(L).map(r => `<p class="apa-ref">${inl(r)}</p>`).join('')}</section></article>`;
}
function bookImgSrc(p) { return p?.img || ''; }
function bookHtml(L, { editable = true, busy = false } = {}) {
  const b = L.notes?.book; if (!b) return '';
  const art = (p, i) => {
    const src = bookImgSrc(p);
    if (src) return `<img src="${esc(src)}" alt="${esc(p.picture || 'Illustration')}" loading="lazy">`;
    return `<div class="book-ph">${busy || p?.drawing ? '<span class="spinner"></span><span>Drawing…</span>' : `<span>${esc(p?.picture || 'Picture')}</span>`}</div>`;
  };
  const lec = lecturerOf(L);
  return `<div class="book">
    <section class="book-page book-cover"><div class="book-art">${art(b.cover || {}, -1)}</div>
      <div class="book-cap"><h1 class="book-title">${esc(b.title || L.title)}</h1><p class="book-by">${esc(['A picture book', lec ? `based on a lecture by ${lec}` : 'based on a lecture', L.course].filter(Boolean).join(' · '))}</p></div>
      ${editable ? `<div class="book-tools"><button class="btn sm" data-redraw="-1">${icon('spark')}Redraw</button></div>` : ''}</section>
    ${b.pages.map((p, i) => `<section class="book-page" data-page="${i}"><div class="book-art">${art(p, i)}</div>
      <div class="book-cap"><p class="book-text" ${editable ? 'contenteditable="true" spellcheck="true"' : ''} data-page-text="${i}">${esc(p.text)}</p></div>
      <div class="book-foot"><span class="book-num">${i + 1}</span>${editable ? `<button class="btn sm ghost" data-redraw="${i}">${icon('spark')}Redraw picture</button>` : ''}</div></section>`).join('')}
    ${b.glossary?.length ? `<section class="book-page book-words"><div class="book-cap"><h2>Words to know</h2><dl>${b.glossary.map(g => `<div><dt>${esc(g.word)}</dt><dd>${esc(g.meaning)}</dd></div>`).join('')}</dl>
      ${b.wonder ? `<h2>Wonder together</h2><p>${esc(b.wonder)}</p>` : ''}<p class="book-src">${inl(lectureRef(L, L.notes?.lectureTitle))}</p></div></section>` : ''}
  </div>`;
}
function notesDocHtml(L, opts) {
  const k = styleKey(L.notes?.style);
  ensureJournalCss(); ensureFormatCss();
  if (k === 'apa') return apaHtml(L);
  if (k === 'mla') return mlaHtml(L);
  if (k === 'kids') return bookHtml(L, opts);
  return plainDocHtml(L);
}
function renderNotes() {
  const L = S.lecture, doc = $('#notes-doc'), ed = $('#notes-editor');
  const k = styleKey(L.notes?.style);
  const has = !!(L.notes?.md || L.notes?.book);
  renderNotesCite();
  $('#notes-tools').style.visibility = has ? '' : 'hidden';
  $('#notes-edit').hidden = k === 'kids';
  $('#notes-generate span').textContent = has ? 'Regenerate' : 'Generate';
  $('#notes-edit span').textContent = S.ui.notesEdit ? 'Done' : 'Edit';
  $$('#notes-export [data-exp="docx"]').forEach(b => { b.lastChild.textContent = k === 'kids' ? 'Word picture book (.docx)' : 'Word document (.docx)'; });
  if (S.ui.notesEdit && has && k !== 'kids') { ed.hidden = false; doc.hidden = true; ed.value = L.notes.md; return; }
  ed.hidden = true; doc.hidden = false;
  doc.className = has ? `apa notes-${k}` : 'doc';
  if (has) { doc.innerHTML = notesDocHtml(L); return; }
  const n = speechSegs(L).length;
  const nf = citedFiles(L).filter(f => f.text || f.image).length;
  doc.innerHTML = `<div class="empty"><h3>${n || nf ? 'Ready to write' : 'No notes yet'}</h3><p>${n || nf ? `${n ? `${n} transcript lines` : 'No transcript — notes will come from your materials'} and ${nf} lecture file${nf === 1 ? '' : 's'} are ready. Choose an output above — an APA or MLA article, a bulleted outline, a children’s picture book, or anything else you describe — and tap Generate.` : 'Start from anything: caption a live lecture, transcribe a recording or YouTube video, or add a paper or reading on the Files tab. Didasko turns it into notes in the format you choose.'}</p>
    ${n || nf ? '' : `<div class="row" style="justify-content:center"><button class="btn sm" id="nd-rec">${icon('mic')}Transcribe a recording</button><button class="btn sm" id="nd-yt">${icon('play')}Add a video link</button><button class="btn sm" id="nd-files">${icon('files')}Add a paper</button></div>`}</div>`;
  const b = id => $(id, doc);
  if (b('#nd-rec')) { b('#nd-rec').onclick = () => pickRecording(); b('#nd-yt').onclick = () => openVideoSheet(); b('#nd-files').onclick = () => showView('files'); }
}

/* ---- Prompts ---- */
/* ---- Journal articles (APA and MLA) are written in two passes:
   1) plan: read the whole transcript and reorganize it into themes, with the definitions, examples and evidence each needs;
   2) write: a fully unpacked article from that plan, structured like a research-journal paper rather than in speaking order. ---- */
const CLEANUP = 'The transcript comes from speech recognition: it may lack punctuation and contain misheard words, filler words, false starts and digressions. Clean these up silently. When a misheard word is obvious from context or from the materials, use the correct word. Use only facts supported by the transcript or the materials.';
function journalPlanSystem({ aud, lang }) {
  return `You are the senior editor of an academic journal. You are planning an article that turns a lecture (its transcript and any course materials) into a well-organized journal article for ${AUDIENCE[aud]}, written in ${lang}.
${CLEANUP}
Read the ENTIRE transcript and all materials before planning. Lectures wander: the speaker returns to ideas, gives examples out of order and mixes background with detail. Do NOT follow the order in which things were said. Instead:
- Work out the lecture's central question and its main argument (thesis).
- Group everything that belongs together, wherever in the transcript it was said, into 3 to 6 major themes.
- Order the themes for a reader: background and key definitions first, then the core concepts, mechanisms or frameworks, then applications and examples, then implications, challenges or debates.
- Within each theme plan 2 to 4 subsections. For each, list the points to make, the concepts that must be defined, the lecturer's examples, evidence or data, any material (F1, F2 …) that supports it, and the transcript timestamps it draws on.
- Note tensions, misconceptions, limitations and open questions the lecture raised, for a Discussion section.
- Every line marked ★KEY POINT must be placed somewhere in the plan.
Reply with JSON only:
{"title":"","subtitle":"","thesis":"","keywords":[""],"introduction":{"context":"","problem":"","purpose":""},"sections":[{"heading":"","purpose":"","subsections":[{"heading":"","points":[""],"define":[""],"examples":[""],"materials":["F1"],"timestamps":["12:40"]}]}],"discussion":[""],"conclusion":[""]}`;
}
function journalSystem({ aud, lang, sources, mla }) {
  const cite = mla
    ? `Citations (MLA 9 in-text): cite the sources below using exactly the forms given, placed before the sentence's final punctuation, e.g. "…from water (Rivera)." For a direct quotation from the lecture add the timestamp, e.g. (Rivera 00:12:40). Do not use page numbers unless the material shows them. Do not write a Works Cited list — it is added automatically.`
    : `Citations (APA 7 in-text): cite the sources below using exactly the in-text forms given, as parenthetical citations at the end of the sentence they support or as narrative citations ("Rivera (2026) argued that…"). For a direct quotation add the timestamp. Do not write a References section — it is added automatically.`;
  return `You are an expert academic writer and editor. You write a polished research-journal article from a lecture, following the editor's plan you are given. The article should read like a peer-reviewed paper in a journal such as Education and Information Technologies: it organizes ideas thematically, unpacks each one fully, and synthesizes rather than summarizing the lecture in order.
${CLEANUP}
Write for ${AUDIENCE[aud]}, in ${lang}, in a formal, precise academic register: third person; ${mla ? 'present tense when discussing what the lecture argues ("Rivera explains that…")' : 'past tense for what the lecturer said ("Rivera explained that…")'} and present tense for established facts.

How to write it:
- Follow the plan's structure and order, not the order of the transcript.
- Unpack every idea. Define each key concept when it first appears, explain how and why it works, give the lecturer's examples and evidence, connect it to the materials, and say why it matters. Never just list what the lecturer said.
- Each major section opens with a short framing paragraph that tells the reader what the section covers and how it connects to the article's argument. Each subsection has two to four developed paragraphs of four to seven sentences, with a clear topic sentence and transitions. End subsections with a sentence that links to the next idea.
- Write in connected prose. Use a numbered list only where the lecture itself set out a defined set of items (for example stages, factors or criteria); introduce it with a full sentence, give each item a short explanation, and use at most two such lists in the whole article. Use a table only if it genuinely clarifies a comparison; put "**Table N**" on its own line and the table title in italic title case on the next line.
- Bold a key term only the first time it is defined. No bold run-in labels, no Q&A, no "Key Terms" or "Review Questions" sections.
- Length: about 1,200 words for every 15 minutes of lecture, between 1,500 and 4,500 words in total (shorter if the source is short).

Output GitHub-flavored Markdown in exactly this order:
1. "# Title: Subtitle" — a concise, informative ${mla ? 'MLA title-case' : 'APA title-case'} title with a subtitle after a colon.
2. "## Abstract" — one paragraph of 150–250 words: the topic and why it matters, the article's purpose, the main themes in the order they appear, and the key implication.
3. A line "*Keywords:* " with 4–6 keywords or short phrases separated by commas.
4. "## Introduction" — three or four paragraphs: the context and background; the problem or question that makes the topic important; the purpose of the article; and a final roadmap sentence that names the sections that follow.
5. One "##" section per theme in the plan, each with "###" subsections. Do not number headings — the app numbers them.
6. "## Discussion" — synthesize across the themes: how the ideas relate, what they mean for students and practice, the misconceptions, limitations or open questions the lecture raised.
7. "## Conclusion" — one or two paragraphs restating the thesis in light of the article and noting what comes next if the lecture says so.

${cite} Cite the lecture in every major section, and a material wherever its content is used. Do not cite anything else.
${sources}

After the article, output exactly one final line and nothing after it:
<!--didasko {"lectureTitle":"<the lecture's title in ${mla ? 'MLA title case' : 'APA sentence case'}>","titles":{"F1":"<title of F1 in ${mla ? 'MLA title case' : 'APA sentence case'}>"}}-->
Include every F-number listed above in "titles".`;
}
const apaSystem = o => journalSystem({ ...o, mla: false });
const mlaSystem = o => journalSystem({ ...o, mla: true });
function outlineSystem({ aud, lang }) {
  return `You turn raw lecture transcripts into a crisp, skimmable outline for ${AUDIENCE[aud]}, written in ${lang}.
The transcript comes from speech recognition: fix obvious recognition errors silently and drop filler. Do not add facts that are not in the transcript or the materials. Lines marked ★KEY POINT were flagged by the instructor: include every one and start its bullet with "★ ". Lines like "== TOPIC: … ==" are the instructor's section breaks.
Output GitHub-flavored Markdown in exactly this order:
1. "# Title" — the lecture's topic.
2. One sentence in italics summarizing the whole lecture.
3. "## Big Picture" — two or three bullets on why this matters.
4. One "##" heading per major topic in lecture order. Under each, nested "-" bullets: main idea → supporting details → examples, at most three levels deep. Short phrases, not paragraphs. Bold each key term the first time it appears.
5. "## Key Terms" — bullets in the form "**Term** — plain-language meaning".
6. "## Takeaways" — three to five bullets a student should remember.
No citations, no introduction or conclusion paragraphs, nothing after the Takeaways.`;
}
function customSystem({ aud, lang, custom, sources }) {
  return `You turn a lecture transcript (and any lecture materials) into exactly the output a teacher asks for.
The teacher's request: «${custom}»
Rules:
- Produce that output and nothing else: no preface, no notes about what you did.
- Write in ${lang}, for ${AUDIENCE[aud]} unless the request says otherwise.
- The transcript comes from speech recognition: fix obvious recognition errors silently. Use only facts supported by the transcript or the materials.
- Use GitHub-flavored Markdown (headings, lists, tables, bold) wherever it suits the requested format. Start with a "# " title.
- If the requested format normally cites sources, cite them with these APA in-text forms:
${sources}`;
}
function kidsSystem({ lang }) {
  return `You are an award-winning children's picture-book author and a careful teacher. You retell a lecture as a short, warm picture book for children aged 6 to 9, written in ${lang}.
Rules:
- 8 to 10 pages. Each page has 1 to 3 short sentences (at most 40 words) with simple, vivid words. Read-aloud rhythm is welcome; rhyme is optional.
- Keep the science or subject accurate: simplify, but never say anything false. Explain the lecture's key ideas in the order that makes them easiest to understand, through a friendly main character on a small adventure.
- Page 1 introduces the character and the question; the last page recaps the big idea and ends on a sense of wonder.
- For each page, describe the illustration concretely (who, where, what is happening, colors) in one or two sentences. Pictures contain no words, letters or numbers.
- Describe the main character once, visually, so every picture can show them the same way, and give one art-style description for the whole book.
- Add 3 to 6 "words to know" with child-friendly meanings, and one "wonder together" question a grown-up can ask.
- The transcript comes from speech recognition; ignore recognition errors. Use only ideas from the transcript and materials.
Reply with JSON only in this shape:
{"title":"","character":"","style":"","cover":"<cover illustration description>","pages":[{"text":"","picture":""}],"glossary":[{"word":"","meaning":""}],"wonder":"","lectureTitle":"<the lecture's title in APA sentence case>"}`;
}

/* ---- Generate ---- */
async function generateNotes() {
  const L = S.lecture;
  const live = hasTranscript(L), haveMat = citedFiles(L).some(f => f.text || f.image);
  if (!live && !haveMat) { toast('Add something to work from first: record or import a transcript, transcribe a recording or video, or add a paper or reading on the Files tab.', 6000); return; }
  if (!live && !$('#notes-use-files').checked) { $('#notes-use-files').checked = true; }
  const style = styleKey($('#notes-style').value), aud = $('#notes-audience').value, lv = $('#notes-lang').value;
  const lang = lv === 'src' ? srcName(S.settings.srcLang) : tgtName(lv);
  const useFiles = $('#notes-use-files').checked;
  const custom = $('#notes-custom').value.trim();
  if (live && (style === 'apa' || style === 'mla') && !lecturerOf(L)) { openLectureSheet(true); toast('Add the lecturer’s name so the article can cite the lecture.', 4000); return; }
  if (style === 'other' && !custom) { $('#notes-custom').focus(); toast('Describe the output you’re looking for.'); return; }
  if (!aiReady()) {
    if (style === 'kids' || style === 'other') { toast(`${style === 'kids' ? 'Picture books' : 'Custom outputs'} need an AI model. Choose one in Settings.`, 4500); openSettings(); return; }
    const src = live ? L : materialsAsLecture(L);
    L.notes = { md: style === 'outline' ? buildLocalOutline(src, live && useFiles) : buildLocalNarrative(src, live && useFiles, style), style, local: true, at: Date.now() };
    saveSoon(); S.ui.notesEdit = false; renderNotes(); toast('Notes organized on this device'); return;
  }
  notesCtl = new AbortController();
  setNotesBusy(true, 'Checking sources…');
  const files = useFiles ? citedFiles(L) : [];
  if (style === 'apa' || style === 'mla' || style === 'other') for (const f of files) if (f.text && !f.cite?.checked && !(f.cite?.authors)) await detectCitation(f, { quiet: true });
  const mat = useFiles ? materials('useNotes') : { text: '', images: [], names: [] };
  const lecT = mlaInTextName([lecturerOf(L)]) || L.course || 'Lecture';
  const sources = !live ? files.map((f, i) => `- F${i + 1} — material "${f.name}". Cite as ${style === 'mla' ? mlaFileInText(f) : fileInText(f)}.`).join('\n') : style === 'mla'
    ? [`- LECTURE — the transcript itself. Cite as ${mlaLectureInText(L)}; for a quotation (${lecT} 00:12:40).`, ...files.map((f, i) => `- F${i + 1} — material "${f.name}". Cite as ${mlaFileInText(f)}.`)].join('\n')
    : [`- LECTURE — the transcript itself. Cite as ${lectureInText(L)}. For a direct quotation add the timestamp, e.g. (${inTextAuthors([lecturerOf(L)]) || lecT}, ${yearOf(L.createdAt)}, 12:40).`, ...files.map((f, i) => `- F${i + 1} — material "${f.name}". Cite as ${fileInText(f)}.`)].join('\n');
  const opts = { aud, lang, sources, custom };
  const system = { apa: apaSystem, mla: mlaSystem, outline: outlineSystem, other: customSystem, kids: kidsSystem }[style](opts)
    + (live ? (L.source?.kind ? `\nThe transcript comes from a ${L.source.kind === 'video' ? 'video' : 'recording'}${L.source.title ? ` titled “${L.source.title}”` : ''}, transcribed automatically.` : '')
      : '\nIMPORTANT: there is no lecture transcript for this session. Build the whole output from the materials alone. Do not mention or cite a lecture or lecturer; where the instructions above say to cite the lecture, cite the materials instead. In the abstract and introduction, describe the material’s topic rather than a lecture.');
  const user = `${lectureHeader(L)}\nLecturer: ${lecturerOf(L) || '(not given)'}\n\n<transcript>\n${live ? transcriptForPrompt(L) : '(none — use the materials only)'}\n</transcript>${mat.text ? `\n\n<materials>\n${files.map((f, i) => `F${i + 1} = ${f.name}`).join('\n')}\n${mat.text}\n</materials>` : ''}${mat.images.length ? `\n\nAttached images: ${mat.images.map(i => i.name).join(', ')} (photos or slides from the lecture).` : ''}`;
  if (style === 'kids') return generateKidsBook(L, { system, user, images: mat.images, lang });
  const prev = L.notes;
  let latest = '', userMsg = user;
  if (style === 'apa' || style === 'mla') {
    setNotesBusy(true, 'Reading the whole lecture and planning the article…');
    try {
      const planText = await callAI({ system: journalPlanSystem(opts), user, images: mat.images, maxTokens: 6000, json: true, signal: notesCtl.signal,
        onText: t => { const k = (t.match(/"heading"\s*:/g) || []).length; if (k) $('#notes-status-text').textContent = `Planning the article… ${k} section${k === 1 ? '' : 's'} so far`; } });
      const plan = parseJson(planText);
      if (Array.isArray(plan.sections) && plan.sections.length) userMsg = `${user}\n\n<editor_plan>\n${JSON.stringify(plan, null, 1)}\n</editor_plan>\n\nWrite the article now, following the editor's plan.`;
    } catch (e) { if (notesCtl?.signal.aborted) { setNotesBusy(false); notesCtl = null; toast('Stopped'); return; } /* no plan: the writer organizes it in one pass */ }
  }
  setNotesBusy(true, style === 'apa' || style === 'mla' ? 'Writing the article…' : 'Reading the transcript…');
  const show = t => { L.notes = { ...(L.notes || {}), style, md: stripFences(t.split('<!--didasko')[0]) }; delete L.notes.book; const d = $('#notes-doc'); d.className = `apa notes-${style}`; d.innerHTML = notesDocHtml(L); };
  try {
    const out = await callAI({
      system, user: userMsg, images: mat.images, maxTokens: 14000, signal: notesCtl.signal,
      onText: t => { latest = t; $('#notes-status-text').textContent = 'Writing…'; if (!notesRAF) notesRAF = requestAnimationFrame(() => { notesRAF = 0; show(latest); }); }
    });
    const [body, meta] = out.split('<!--didasko');
    let extra = {};
    try { extra = JSON.parse((meta || '').replace(/-->[\s\S]*$/, '').trim() || '{}'); } catch { extra = {}; }
    const titles = {};
    files.forEach((f, i) => { const t = extra.titles?.['F' + (i + 1)]; if (t) titles[f.id] = String(t).trim(); });
    const md = stripFences(body);
    L.notes = { md, style, at: Date.now(), lang, custom: style === 'other' ? custom : undefined, lectureTitle: (extra.lectureTitle || '').trim() || null, titles, keywords: splitBody(md).keywords.split(/,\s*/).filter(Boolean) };
    toast(`${STYLE_LABEL[style]} ready`);
  } catch (e) {
    if (notesCtl?.signal.aborted) { if (latest) L.notes = { md: stripFences(latest.split('<!--didasko')[0]), style, at: Date.now(), partial: true }; else L.notes = prev; toast('Stopped'); }
    else { L.notes = prev; toast(e.message === 'NO_AI' ? 'Choose an AI model in Settings first.' : e.message, 5000); }
  } finally { notesCtl = null; setNotesBusy(false); saveSoon(); renderNotes(); }
}

/* ---- Children's book ---- */
const BOOK_ART = 'Warm, friendly children’s picture-book illustration, soft gouache and colored-pencil texture, bright but gentle colors, simple shapes, expressive faces, plenty of space, no text, letters or numbers in the image.';
function pagePrompt(b, p, cover) {
  return `${b.style || BOOK_ART} Main character: ${b.character || 'a curious, friendly child'}. ${cover ? `Book cover for “${b.title}”: ${p.picture || 'the main character, smiling, ready for an adventure'}` : `Scene: ${p.picture}`} Square composition. Do not include any words, letters, numbers or captions.`;
}
async function drawBookPicture(b, p, cover, signal) {
  const prompt = pagePrompt(b, p, cover);
  if (imageProvider() && !b.svgOnly) {
    try { return await shrinkImage(await aiImage(prompt, signal), 768); }
    catch (e) {
      if (signal?.aborted) throw e;
      b.svgOnly = true;
      toast(`Couldn’t paint pictures with ${imageModel()}: ${e.message.replace(/^.*?: /, '')} Drawing illustrations instead.`, 6000);
    }
  }
  return aiSvgPicture(prompt, signal);
}
async function aiSvgPicture(prompt, signal) {
  const out = await callAI({
    signal, maxTokens: 6000,
    system: 'You are an illustrator who draws charming, simple children’s-book pictures as SVG code. Reply with one complete <svg> element only: viewBox="0 0 800 800", flat filled shapes with soft rounded forms, a bright friendly palette, a full background (sky, ground or room), a clear focal subject, and expressive simple faces. No text, letters or numbers. No script, image or foreignObject elements, external links or CSS imports. Keep it under 12 KB.',
    user: prompt
  });
  return sanitizeSvg(out);
}
function sanitizeSvg(raw) {
  const m = String(raw || '').match(/<svg[\s\S]*<\/svg>/i); if (!m) throw new Error('The AI didn’t return a picture.');
  const doc = new DOMParser().parseFromString(m[0], 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('The picture couldn’t be read.');
  doc.querySelectorAll('script,foreignObject,image,iframe,object,embed,a,style').forEach(n => n.remove());
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(a => { const n = a.name.toLowerCase(), v = a.value.trim().toLowerCase(); if (n.startsWith('on') || ((n === 'href' || n === 'xlink:href') && !v.startsWith('#')) || v.includes('javascript:') || (v.includes('url(') && !/url\(\s*#/.test(v))) el.removeAttribute(a.name); });
  });
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 800 800');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}
function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Image could not be loaded')); im.src = src; }); }
async function shrinkImage(src, max = 768, mime = 'image/jpeg') {
  const im = await loadImg(src);
  const k = Math.min(1, max / Math.max(im.naturalWidth || max, im.naturalHeight || max));
  const c = document.createElement('canvas'); c.width = Math.round((im.naturalWidth || max) * k); c.height = Math.round((im.naturalHeight || max) * k);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL(mime, 0.84);
}
async function generateKidsBook(L, { system, user, images, lang }) {
  setNotesBusy(true, 'Writing the story…');
  const prev = L.notes;
  try {
    const out = await callAI({ system, user, images, json: true, maxTokens: 6000, signal: notesCtl.signal, onText: t => { const k = (t.match(/"text"\s*:/g) || []).length; $('#notes-status-text').textContent = k ? `Writing page ${k}…` : 'Writing the story…'; } });
    const j = parseJson(out);
    const pages = (j.pages || []).map(p => ({ text: String(p.text || '').trim(), picture: String(p.picture || '').trim() })).filter(p => p.text).slice(0, 12);
    if (pages.length < 3) throw new Error('The AI didn’t return a usable story. Try again.');
    const book = { title: String(j.title || L.title).trim(), character: String(j.character || '').trim(), style: String(j.style || '').trim(), cover: { picture: String(j.cover || '').trim() }, pages, glossary: (j.glossary || []).filter(g => g?.word).slice(0, 8).map(g => ({ word: String(g.word), meaning: String(g.meaning || '') })), wonder: String(j.wonder || '').trim() };
    L.notes = { style: 'kids', book, md: bookMarkdown(L, book), at: Date.now(), lang, lectureTitle: String(j.lectureTitle || '').trim() || null, titles: {} };
    saveSoon(); renderNotes();
    await drawAllPictures(L, book, notesCtl.signal);
    toast('Picture book ready');
  } catch (e) {
    if (notesCtl?.signal.aborted) { toast('Stopped'); if (!L.notes?.book) L.notes = prev; }
    else { if (!L.notes?.book) L.notes = prev; toast(e.message === 'NO_AI' ? 'Choose an AI model in Settings first.' : e.message, 5000); }
  } finally { notesCtl = null; setNotesBusy(false); if (L.notes?.book) L.notes.md = bookMarkdown(L, L.notes.book); saveSoon(); renderNotes(); }
}
async function drawAllPictures(L, book, signal) {
  const jobs = [{ p: book.cover, cover: true }, ...book.pages.map(p => ({ p, cover: false }))].filter(j => !j.p.img);
  let done = 0; const total = jobs.length;
  const status = () => { $('#notes-status').hidden = false; $('#notes-status-text').textContent = `Drawing picture ${Math.min(done + 1, total)} of ${total}…`; };
  status();
  const worker = async () => {
    while (jobs.length) {
      if (signal?.aborted) return;
      const j = jobs.shift(); j.p.drawing = true; rerenderBook(L);
      try { j.p.img = await drawBookPicture(book, j.p, j.cover, signal); }
      catch (e) { if (signal?.aborted) return; j.p.error = e.message; }
      finally { delete j.p.drawing; done++; status(); saveSoon(); rerenderBook(L); }
    }
  };
  await Promise.all([worker(), worker()]);
}
function rerenderBook(L) { if (S.lecture === L && S.view === 'notes' && S.ui.notesTab === 'notes') { const d = $('#notes-doc'); d.hidden = false; d.className = 'apa notes-kids'; d.innerHTML = bookHtml(L); } }
async function redrawPicture(i) {
  const L = S.lecture, b = L.notes?.book; if (!b) return;
  if (!aiReady()) { toast('Choose an AI model in Settings to draw pictures.'); return; }
  const p = i < 0 ? b.cover : b.pages[i]; if (!p || p.drawing) return;
  delete b.svgOnly; p.drawing = true; delete p.img; rerenderBook(L);
  try { p.img = await drawBookPicture(b, p, i < 0); toast('New picture ready'); }
  catch (e) { toast(e.message, 4000); }
  finally { delete p.drawing; saveSoon(); rerenderBook(L); }
}
function bookMarkdown(L, b) {
  return [`# ${b.title}`, '', `*A picture book based on a lecture${lecturerOf(L) ? ` by ${lecturerOf(L)}` : ''}${L.course ? ` · ${L.course}` : ''}*`, '',
    ...b.pages.flatMap((p, i) => [`## Page ${i + 1}`, '', p.text, '', `*Picture: ${p.picture}*`, '']),
    ...(b.glossary?.length ? ['## Words to know', '', ...b.glossary.map(g => `- **${g.word}** — ${g.meaning}`), ''] : []),
    ...(b.wonder ? ['## Wonder together', '', b.wonder, ''] : [])].join('\n');
}

/* ---- On-device fallbacks (no AI) ---- */
function lectureSections(L) {
  const sections = []; let cur = null, count = 0;
  const hasTopics = L.segments.some(x => x.kind === 'topic');
  for (const s of L.segments) {
    if (s.kind === 'topic') { cur = { title: s.text, items: [] }; sections.push(cur); count = 0; continue; }
    if (!cur || (!hasTopics && count >= 6)) { cur = { title: null, start: s.t, items: [] }; sections.push(cur); count = 0; }
    cur.items.push(s); cur.end = s.t; count++;
  }
  return sections.filter(x => x.items.length);
}
function buildLocalNarrative(L, useFiles, style) {
  const segs = speechSegs(L), mla = style === 'mla';
  const all = segs.map(s => s.text).join('. ');
  const kws = keyTerms(all, 7);
  const cite = L._cite || (mla ? mlaLectureInText(L) : lectureInText(L));
  const para = items => { const sents = items.flatMap(s => sentencesOf(s.text).map(cleanSpoken)).filter(t => words(t) > 3); const out = []; for (let i = 0; i < sents.length; i += 4) out.push(sents.slice(i, i + 4).join(' ').replace(/\.$/, '') + ` ${cite}.`); return out.join('\n\n'); };
  const keys = segs.filter(s => s.key).map(s => cleanSpoken(s.text));
  let md = `# ${L.title}\n\n`;
  if (!mla) md += `## Abstract\n${(keys.length ? keys : sentencesOf(all).map(cleanSpoken)).slice(0, 5).join(' ').replace(/\.$/, '')} ${cite}.\n\n*Keywords:* ${kws.join(', ')}\n\n## Introduction\n`;
  md += `> Organized on this device without AI. Choose an AI model in Settings for a fully written article.\n\nThis lecture${L.course ? `, part of ${L.course},` : ''} addressed ${kws.slice(0, 3).join(', ')}${keys.length ? `, and the lecturer emphasized that ${keys[0].charAt(0).toLowerCase() + keys[0].slice(1).replace(/\.$/, '')}` : ''} ${cite}.\n\n`;
  lectureSections(L).forEach((sec, i) => { md += `## ${sec.title || `Part ${i + 1}`}\n${para(sec.items)}\n\n`; });
  md += `## Conclusion\nTaken together, the lecture connected ${kws.slice(0, 4).join(', ')} ${cite}.\n`;
  const fs = useFiles ? citedFiles(L) : [];
  if (fs.length) md += `\nThe lecture materials ${fs.map(f => `${mla ? mlaFileInText(f) : fileInText(f)}`).join(', ')} provide further detail.\n`;
  return md;
}
function buildLocalOutline(L, useFiles) {
  const segs = speechSegs(L);
  const kws = keyTerms(segs.map(s => s.text).join('. '), 8);
  let md = `# ${L.title}\n\n*Organized on this device without AI — key ideas in lecture order.*\n\n`;
  const keys = segs.filter(s => s.key);
  if (keys.length) md += `## Big Picture\n${keys.map(s => `- ★ ${cleanSpoken(s.text)}`).join('\n')}\n\n`;
  lectureSections(L).forEach((sec, i) => {
    md += `## ${sec.title || `Part ${i + 1} (${fmtClock(sec.start)}–${fmtClock(sec.end)})`}\n`;
    sec.items.forEach(s => sentencesOf(s.text).map(cleanSpoken).filter(t => words(t) > 3).forEach(t => { md += `- ${s.key ? '★ ' : ''}${t}\n`; }));
    md += '\n';
  });
  md += `## Key Terms\n${kws.map(k => `- **${k}**`).join('\n')}\n`;
  const fs = useFiles ? citedFiles(L) : [];
  if (fs.length) md += `\n## Lecture Materials\n${fs.map(f => `- **${fileCite(f).title}** — ${f.text ? f.text.split(/\s+/).slice(0, 24).join(' ') + '…' : 'image'}`).join('\n')}\n`;
  return md;
}

/* ---- Exports ---- */
const ND_CSS = `
.nd{background:#fff;color:#15201c;max-width:820px;margin:0 auto;padding:clamp(20px,5vw,52px);border-radius:12px;border:1px solid #d6dfdb;font:1.02rem/1.65 Literata,Georgia,serif;overflow-wrap:anywhere}
.nd-kicker{margin:0 0 .6em;font:700 .74rem/1.3 "Atkinson Hyperlegible",system-ui,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#1d6b57}
.nd h1{font-size:1.8rem;line-height:1.2;margin:0 0 .4em;text-wrap:balance}
.nd h2{font:700 1.15rem/1.3 "Atkinson Hyperlegible",system-ui,sans-serif;margin:1.6em 0 .5em;padding-bottom:.3em;border-bottom:1px solid #d6dfdb;color:#1d6b57}
.nd h3{font:700 1.02rem/1.3 "Atkinson Hyperlegible",system-ui,sans-serif;margin:1.2em 0 .3em}
.nd p,.nd ul,.nd ol{margin:.5em 0}
.nd li{margin:.2em 0}
.nd ul ul,.nd ol ol,.nd ul ol,.nd ol ul{margin:.15em 0}
.nd blockquote{margin:1em 0;padding:.6em 1em;border-left:3px solid #f2cb52;background:#f6f8f7;border-radius:0 8px 8px 0}
.nd table{border-collapse:collapse;font:.92rem/1.45 "Atkinson Hyperlegible",system-ui,sans-serif;min-width:100%}
.nd th,.nd td{border:1px solid #d6dfdb;padding:7px 9px;text-align:left;vertical-align:top}
.nd th{background:#f6f8f7}
.nd-src{margin-top:2.2em;font-size:.86rem;color:#4a5853}
.nd-src h2{font-size:.8rem;letter-spacing:.09em;text-transform:uppercase;color:#5a6963}
.nd-src .apa-ref{padding-left:2em;text-indent:-2em;margin:.3em 0}
.nd a{color:inherit}
@media print{.nd{border:0;padding:0;max-width:none}}`;
const BOOK_CSS = `
.book{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));font-family:Literata,Georgia,serif}
.book-page{background:#fffdf6;color:#2b2218;border-radius:18px;border:1px solid #eadfc8;box-shadow:0 2px 10px rgba(60,40,10,.08);overflow:hidden;display:flex;flex-direction:column;position:relative}
.book-art{aspect-ratio:1/1;background:#f3ead6;display:grid;place-items:center;overflow:hidden}
.book-art img{width:100%;height:100%;object-fit:cover;display:block}
.book-ph{display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;padding:24px;text-align:center;color:#8a7a5c;font:italic .9rem/1.4 Literata,Georgia,serif}
.book-cap{padding:16px 20px 8px;flex:1}
.book-text{margin:0;font-size:1.22rem;line-height:1.5;text-wrap:pretty;outline:none;border-radius:6px}
.book-text:focus{background:#fff4cf}
.book-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 12px 12px 20px}
.book-num{font:700 .9rem/1 "Atkinson Hyperlegible",system-ui,sans-serif;color:#b59a63}
.book-cover{background:#173a30;color:#fdf6e3;border-color:#173a30}
.book-cover .book-art{background:#0f2a22}
.book-title{margin:0;font:700 1.8rem/1.15 Literata,Georgia,serif;text-wrap:balance;color:#f2cb52}
.book-by{margin:.4em 0 0;font:.9rem/1.4 "Atkinson Hyperlegible",system-ui,sans-serif;opacity:.85}
.book-tools{position:absolute;top:10px;right:10px}
.book-words h2{margin:0 0 .4em;font:700 1.2rem/1.2 Literata,Georgia,serif;color:#1d6b57}
.book-words h2:not(:first-child){margin-top:1em}
.book-words dl{margin:0;display:grid;gap:8px}
.book-words dt{font-weight:700}
.book-words dd{margin:0 0 0 .2em;color:#5c4f3b}
.book-src{margin-top:1.4em;font:.78rem/1.4 "Atkinson Hyperlegible",system-ui,sans-serif;color:#8a7a5c;padding-left:1.6em;text-indent:-1.6em}
.book .btn{background:rgba(255,255,255,.85);border-color:#e0d4b8;color:#2b2218}
@media print{.book{display:block}.book-page{break-inside:avoid;break-after:page;box-shadow:none;border:0;max-width:6.5in;margin:0 auto}.book-tools,.book-foot .btn{display:none}}`;
function ensureFormatCss() { if (!document.getElementById('fmt-css')) { const st = document.createElement('style'); st.id = 'fmt-css'; st.textContent = ND_CSS + BOOK_CSS; document.head.appendChild(st); } }
function standaloneHtml(L) {
  const k = styleKey(L.notes?.style);
  if (k === 'apa') return apaStandalone(L);
  if (k === 'mla') return journalStandalone(L, true);
  const title = k === 'kids' ? L.notes.book.title : (splitBody(L.notes.md).title || L.title);
  const css = k === 'kids' ? BOOK_CSS : ND_CSS;
  const body = k === 'kids' ? bookHtml(L, { editable: false }) : plainDocHtml(L);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,700;1,7..72,400&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<style>body{margin:0;background:${k === 'kids' ? '#f4efe3' : '#e6e8e7'};padding:24px 12px}${css}</style></head><body>${body}</body></html>`;
}
function formatMarkdown(L) {
  const k = styleKey(L.notes?.style);
  if (k === 'apa') return apaMarkdown(L);
  if (k === 'mla') return journalMarkdown(L, true);
  if (k === 'kids') return bookMarkdown(L, L.notes.book) + `\n\n---\n\n${lectureRef(L, L.notes?.lectureTitle)}\n`;
  return `${L.notes.md}\n\n## Sources\n\n${referenceList(L).join('\n\n')}\n`;
}
function plainDocBlocks(L) {
  const B = [{ type: 'p', runs: [{ text: [STYLE_LABEL[styleKey(L.notes.style)], L.course, fmtDate(L.createdAt), lecturerOf(L)].filter(Boolean).join(' · '), i: true }] }, ...parseMd(L.notes.md)];
  B.push({ type: 'h', level: 2, text: 'Sources' }); referenceList(L).forEach(r => B.push({ type: 'ref', text: r }));
  return B;
}
async function bookDocBlocks(L) {
  const b = L.notes.book, B = [];
  const img = async p => { if (!p?.img) return null; try { const png = /^data:image\/svg/.test(p.img) ? await shrinkImage(p.img, 900, 'image/png') : await shrinkImage(p.img, 900); return { type: 'image', src: png, wIn: 5.6, hIn: 5.6 }; } catch { return null; } };
  const cov = await img(b.cover); if (cov) B.push(cov);
  B.push({ type: 'p', style: 'BookTitle', runs: [{ text: b.title }] }, { type: 'p', style: 'BookBy', runs: [{ text: `A picture book based on a lecture${lecturerOf(L) ? ` by ${lecturerOf(L)}` : ''}${L.course ? ` · ${L.course}` : ''}` }] });
  for (const [i, p] of b.pages.entries()) {
    B.push({ type: 'pagebreak' });
    const im = await img(p); if (im) B.push(im);
    B.push({ type: 'p', style: 'BookText', runs: [{ text: p.text }] }, { type: 'p', style: 'BookBy', runs: [{ text: String(i + 1) }] });
  }
  if (b.glossary?.length || b.wonder) {
    B.push({ type: 'pagebreak' });
    if (b.glossary?.length) { B.push({ type: 'h', level: 2, text: 'Words to know' }); b.glossary.forEach(g => B.push({ type: 'p', runs: [{ text: g.word + ' — ', b: true }, { text: g.meaning }] })); }
    if (b.wonder) B.push({ type: 'h', level: 2, text: 'Wonder together' }, { type: 'p', runs: [{ text: b.wonder }] });
    B.push({ type: 'ref', text: lectureRef(L, L.notes?.lectureTitle) });
  }
  return B;
}
async function exportNotes(t) {
  const L = S.lecture, name = slug(L.title), k = styleKey(L.notes?.style);
  if (t === 'transcript') return saveFile(name + '-transcript.txt', L.segments.map(s => s.kind === 'topic' ? `\n## ${s.text}\n` : `[${fmtClock(s.t)}] ${s.key ? '★ ' : ''}${s.text}${target() && s.tr?.[target()] ? `\n         ${s.tr[target()]}` : ''}`).join('\n'), 'text/plain');
  if (!L.notes?.md && !L.notes?.book) { toast('Generate notes first.'); return; }
  const suffix = { apa: 'apa', mla: 'mla', outline: 'outline', kids: 'picture-book', other: 'notes' }[k];
  if (t === 'docx') {
    if (k === 'apa') { const d = apaDocBlocks(L); return saveFile(`${name}-${suffix}.docx`, await buildDocx(d.blocks, composeApa(L).fullTitle, { journal: true, runningHead: d.runningHead, footer: d.footer })); }
    if (k === 'mla') { const d = journalDocBlocks(L, true); return saveFile(`${name}-${suffix}.docx`, await buildDocx(d.blocks, composeMla(L).fullTitle, { journal: true, runningHead: d.runningHead, footer: d.footer })); }
    if (k === 'kids') { toast('Preparing pictures…'); return saveFile(`${name}-${suffix}.docx`, await buildDocx(await bookDocBlocks(L), L.notes.book.title, { footer: L.notes.book.title })); }
    return saveFile(`${name}-${suffix}.docx`, await buildDocx(plainDocBlocks(L), splitBody(L.notes.md).title || L.title));
  }
  if (t === 'html') return saveFile(`${name}-${suffix}.html`, standaloneHtml(L), 'text/html');
  if (t === 'md') return saveFile(`${name}-${suffix}.md`, formatMarkdown(L), 'text/markdown');
  if (t === 'print') {
    const css = k === 'apa' || k === 'mla' ? JOURNAL_CSS.replace(/\.jr/g, '#print-root .jr') : (k === 'kids' ? BOOK_CSS : ND_CSS);
    return printHtml(`<style>${css}</style>${k === 'kids' ? bookHtml(L, { editable: false }) : notesDocHtml(L)}`);
  }
  if (t === 'copy') return copyText(mdToText(formatMarkdown(L)));
}

/* ================= Recordings and video links → transcript =================
   Lets a teacher start from an audio/video recording or a YouTube link instead of live captions.
   Gemini transcribes audio and YouTube videos; ChatGPT (OpenAI) transcribes audio with Whisper.
   Long recordings are cut into parts under each service's upload limit and stitched back together with their timestamps. */
const MEDIA_EXT = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime' };
const extOf = n => (String(n).split('.').pop() || '').toLowerCase();
const isMediaFile = f => !!MEDIA_EXT[extOf(f.name)] || /^(audio|video)\//.test(f.type || '');
const YT_RE = /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{6,})/i;
const youTubeId = u => (String(u || '').trim().match(YT_RE) || [])[1] || '';
function transcriber() {
  if (!aiReady()) return null;
  if (prov().kind === 'gemini') return 'gemini';
  if (S.settings.ai.provider === 'openai') return 'openai';
  return null;
}
const NEEDS_TRANSCRIBER = 'Transcribing a recording needs Gemini or ChatGPT. Choose one in Settings → AI model (Gemini has a free tier), or import a transcript file instead.';
const NEEDS_GEMINI_VIDEO = 'Video links need Gemini as the AI model (Settings → AI model; it has a free tier). Or open the video on YouTube, choose “Show transcript”, copy it, and use Import transcript.';
const MEDIA = { busy: false, ctl: null };
function setMediaStatus(text) {
  const st = $('#notes-status'); if (!st) return;
  st.hidden = !text; if (text) $('#notes-status-text').textContent = text;
  $('#notes-generate').disabled = !!text;
}
const blobB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Couldn’t read the recording.')); r.readAsDataURL(blob); });
function mediaDuration(file) {
  return new Promise(res => {
    const a = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio'); const url = URL.createObjectURL(file);
    const done = d => { URL.revokeObjectURL(url); res(Number.isFinite(d) && d > 0 ? d : 0); };
    a.preload = 'metadata'; a.onloadedmetadata = () => done(a.duration); a.onerror = () => done(0); setTimeout(() => done(0), 8000); a.src = url;
  });
}
/* MP3 is a stream of independent frames, so it can be cut at a frame boundary without re-encoding. */
async function mp3Parts(file, maxBytes) {
  const parts = []; let start = 0;
  while (start < file.size) {
    let end = Math.min(file.size, start + maxBytes);
    if (end < file.size) {
      const win = new Uint8Array(await file.slice(end, Math.min(file.size, end + 8192)).arrayBuffer());
      let k = 0; while (k < win.length - 1 && !(win[k] === 0xFF && (win[k + 1] & 0xE0) === 0xE0)) k++;
      end += k;
    }
    parts.push({ blob: file.slice(start, end, 'audio/mpeg'), start, end });
    start = end;
  }
  return parts;
}
/* Other formats: decode in the browser at 16 kHz mono and cut into WAV parts (speech needs no more). */
function wavBlob(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
async function decodedParts(file, secondsPerPart) {
  const rate = 16000;
  let audio;
  try { audio = await new OfflineAudioContext(1, 1, rate).decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error(`This browser couldn’t read ${file.name}. Convert it to MP3 and try again.`); }
  const ch = audio.numberOfChannels, len = audio.length, mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) { const d = audio.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / ch; }
  const per = secondsPerPart * rate, parts = [];
  for (let i = 0; i < len; i += per) parts.push({ blob: wavBlob(mono.subarray(i, Math.min(len, i + per)), rate), offsetMs: Math.round(i / rate * 1000) });
  return { parts, duration: len / rate };
}
async function transcribePart(kind, blob, mime, signal) {
  if (kind === 'openai') {
    const fd = new FormData();
    fd.append('file', blob, 'part.' + (Object.keys(MEDIA_EXT).find(k => MEDIA_EXT[k] === mime) || 'mp3'));
    fd.append('model', 'whisper-1'); fd.append('response_format', 'verbose_json');
    const res = await aiFetch(`${aiBase()}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${aiKey()}` }, body: fd }, signal);
    await failIfBad(res);
    const j = await res.json();
    return (j.segments || []).map(s => ({ t: Math.round((s.start || 0) * 1000), text: String(s.text || '').trim() })).filter(s => s.text)
      .concat(!j.segments && j.text ? [{ t: 0, text: j.text }] : []);
  }
  const data = await blobB64(blob);
  const out = await callAI({
    signal, maxTokens: 16000, images: [{ mime, data, name: 'recording' }],
    system: 'You are a careful transcriber of lectures and classroom recordings. You write what was said, accurately, in the language spoken.',
    user: 'Transcribe this recording. Remove filler words (um, uh) and false starts, but keep every idea and keep the speaker’s wording. Write one line per sentence or short passage, each line starting with its timestamp from the start of this clip in [m:ss] form, for example "[3:07] Today we look at…". If there are several speakers, start each line after the timestamp with a short label such as "Student:" for anyone who is not the main speaker. Output the transcript lines only.'
  });
  return parseTimed(out);
}
async function transcribeFile(file, L) {
  const kind = transcriber(); if (!kind) { toast(NEEDS_TRANSCRIBER, 7000); return false; }
  if (MEDIA.busy) { toast('A recording is already being transcribed.'); return false; }
  MEDIA.busy = true; MEDIA.ctl = new AbortController();
  const ext = extOf(file.name), mime = file.type && /^(audio|video)\//.test(file.type) ? file.type : MEDIA_EXT[ext] || 'audio/mpeg';
  const cap = kind === 'gemini' ? 14 * 1048576 : 24 * 1048576;
  const label = file.name.length > 40 ? file.name.slice(0, 37) + '…' : file.name;
  try {
    setMediaStatus(`Preparing ${label}…`);
    let parts, duration = await mediaDuration(file);
    if (file.size <= cap) parts = [{ blob: file, offsetMs: 0, mime }];
    else if (ext === 'mp3' || mime === 'audio/mpeg') {
      const raw = await mp3Parts(file, cap);
      const secPerByte = duration ? duration / file.size : 1 / 16000; // 128 kbps if the length is unknown
      parts = raw.map(p => ({ blob: p.blob, offsetMs: Math.round(p.start * secPerByte * 1000), mime: 'audio/mpeg' }));
    } else {
      setMediaStatus(`Converting ${label} for transcription…`);
      const d = await decodedParts(file, kind === 'gemini' ? 420 : 720);
      parts = d.parts.map(p => ({ ...p, mime: 'audio/wav' })); duration = duration || d.duration;
    }
    const lines = [];
    for (const [i, p] of parts.entries()) {
      setMediaStatus(parts.length > 1 ? `Transcribing part ${i + 1} of ${parts.length}…` : `Transcribing ${label}…`);
      const rows = await transcribePart(kind, p.blob, p.mime, MEDIA.ctl.signal);
      rows.forEach(r => lines.push({ t: p.offsetMs + r.t, text: r.text }));
    }
    if (!lines.length) throw new Error('No speech was found in this recording.');
    const base = speechSegs(L).length ? elapsed() + 2000 : 0;
    lines.forEach(r => addSpeech(r.text, base + r.t));
    L.ms = Math.max(L.ms || 0, base + Math.round((duration || 0) * 1000), base + lines[lines.length - 1].t + 4000);
    L.source = L.source || { kind: file.type.startsWith('video/') ? 'video' : 'audio', name: file.name };
    saveSoon(); renderAll();
    toast(`Transcript ready: ${lines.length} lines from ${label}. Choose an output and tap Generate.`, 5000);
    return true;
  } catch (e) {
    if (!MEDIA.ctl?.signal.aborted) toast(e.message === 'NO_AI' ? NEEDS_TRANSCRIBER : e.message, 6000);
    return false;
  } finally { MEDIA.busy = false; MEDIA.ctl = null; setMediaStatus(''); }
}
async function transcribeYouTube(url, L) {
  const id = youTubeId(url);
  if (!id) { toast('That doesn’t look like a YouTube link. Paste the address of a public video.'); return false; }
  if (!aiReady() || prov().kind !== 'gemini') { toast(NEEDS_GEMINI_VIDEO, 8000); return false; }
  if (MEDIA.busy) { toast('A recording is already being transcribed.'); return false; }
  MEDIA.busy = true; MEDIA.ctl = new AbortController();
  const watch = `https://www.youtube.com/watch?v=${id}`;
  try {
    setMediaStatus('Watching the video and writing the transcript… long videos can take a few minutes.');
    const prompt = 'Transcribe this video. On the first line write "TITLE: " and the video’s title; on the second line write "SPEAKER: " and the main speaker’s or channel’s name; on the third line write "YEAR: " and the year it was published if you know it, otherwise leave it blank. Then write the transcript: remove filler words and false starts but keep every idea and the speaker’s wording, one line per sentence or short passage, each starting with its timestamp in [m:ss] or [h:mm:ss] form. Output nothing else.';
    const body = { contents: [{ role: 'user', parts: [{ fileData: { fileUri: watch, mimeType: 'video/*' } }, { text: prompt }] }], generationConfig: { maxOutputTokens: 32768, mediaResolution: 'MEDIA_RESOLUTION_LOW' } };
    const res = await aiFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(aiModel(false))}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': aiKey() }, body: JSON.stringify(body) }, MEDIA.ctl.signal);
    await failIfBad(res);
    const j = await res.json();
    const text = (j.candidates?.[0]?.content?.parts || []).filter(x => x.text && !x.thought).map(x => x.text).join('');
    if (!text.trim()) throw new Error(j.promptFeedback?.blockReason ? `Gemini declined this video (${j.promptFeedback.blockReason}).` : 'Gemini couldn’t read this video. It must be public, and very long videos may need to be shortened.');
    const meta = {}; const body2 = text.replace(/^\s*(TITLE|SPEAKER|YEAR):[ \t]*(.*)$/gim, (_, k, v) => { meta[k.toUpperCase()] = v.trim(); return ''; });
    const rows = parseTimed(body2.replace(/^\s*\n/gm, ''));
    if (rows.length < 2) throw new Error('Gemini didn’t return a transcript for this video. Check that it’s public and try again.');
    const base = speechSegs(L).length ? elapsed() + 2000 : 0;
    rows.forEach(r => addSpeech(r.text, base + r.t));
    L.ms = Math.max(L.ms || 0, base + rows[rows.length - 1].t + 5000);
    L.source = { kind: 'video', url: watch, title: meta.TITLE || '', speaker: meta.SPEAKER || '', year: (meta.YEAR || '').match(/\d{4}/)?.[0] || '' };
    if (!L.lecturer && meta.SPEAKER) L.lecturer = meta.SPEAKER;
    if (meta.TITLE && /^Lecture · /.test(L.title)) L.title = meta.TITLE;
    saveSoon(); renderAll();
    toast(`Transcript ready: ${rows.length} lines from “${meta.TITLE || 'the video'}”. Choose an output and tap Generate.`, 5000);
    return true;
  } catch (e) {
    if (!MEDIA.ctl?.signal.aborted) toast(e.message === 'NO_AI' ? NEEDS_GEMINI_VIDEO : e.message, 7000);
    return false;
  } finally { MEDIA.busy = false; MEDIA.ctl = null; setMediaStatus(''); }
}
function openVideoSheet(after) {
  openSheet('Add a video link', `
    <p class="small muted" style="margin:0">Paste a public YouTube link. Gemini watches the video and writes a timestamped transcript, which you can turn into notes or a quiz like a recorded lecture.</p>
    <label class="field"><span>YouTube link</span><input id="yt-url" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off"></label>
    ${prov().kind === 'gemini' && aiReady() ? '' : `<div class="notice warn">${esc(NEEDS_GEMINI_VIDEO)}</div>`}
    <div class="row"><button class="btn primary" id="yt-ok">${icon('spark')}Transcribe video</button><button class="btn ghost" data-close>Cancel</button></div>`,
    sh => {
      const go = async () => { const u = $('#yt-url', sh).value; if (!youTubeId(u)) { toast('Paste the address of a YouTube video.'); return; } closeSheet(); showView('notes'); S.ui.notesTab = 'transcript'; renderNotesArea(); const ok = await transcribeYouTube(u, S.lecture); if (ok && after) after(); };
      $('#yt-ok', sh).onclick = go; $('#yt-url', sh).onkeydown = e => { if (e.key === 'Enter') go(); };
    });
}
function pickRecording(after) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,video/*,.mp3,.m4a,.wav,.ogg,.webm,.flac,.mp4,.mov';
  inp.onchange = async () => { const f = inp.files[0]; if (!f) return; showView('notes'); S.ui.notesTab = 'transcript'; renderNotesArea(); const ok = await transcribeFile(f, S.lecture); if (ok && after) after(); };
  inp.click();
}
/* A lecture built only from uploaded materials: used by the on-device fallbacks so they have sentences to organize. */
function materialsAsLecture(L) {
  const fs = citedFiles(L).filter(f => f.text);
  const segments = fs.flatMap(f => sentencesOf(f.text.replace(/\n+/g, '. ')).filter(t => words(t) > 5).map(t => ({ id: uid(), kind: 'speech', t: 0, text: t, tr: {}, key: false })));
  return { ...L, segments, _cite: fs[0] ? fileInText(fs[0]) : '' };
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
  await saveNow(); syncNotesStyle(S.lecture); renderAll();
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
        if (S.view === 'home') renderHomeList();
      };
      ['#lec-title', '#lec-course', '#lec-lecturer', '#lec-inst', '#lec-author', '#lec-date'].forEach(id => { $(id, sh).oninput = upd; });
      prev();
      if (focusLecturer) setTimeout(() => $('#lec-lecturer', sh).focus(), 60);
      $('#lec-new', sh).onclick = () => { closeSheet(); openNewLectureSheet(); };
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
  if (nh) nh.textContent = ok ? '' : 'No AI model is set up, so Didasko organizes simple notes on this device. Choose an AI service in Settings for fully written articles, picture books and custom outputs.';
  if (qh) qh.textContent = ok ? '' : 'No AI model is set up, so Didasko builds simple concept checks on this device. Choose an AI service in Settings for scenario and misconception questions.';
  if ($('#notes-style-hint')) renderNotesStyleUi();
  if (S.view === 'home') renderHome();
  TR.engineCache.clear(); renderEngineNote();
}

/* ================= Home dashboard (shown when the app opens) ================= */
const COURSE_HUES = [158, 205, 28, 262, 340, 92, 190, 12, 300, 48];
const courseHue = c => { let h = 0; for (const ch of String(c || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0; return COURSE_HUES[h % COURSE_HUES.length]; };
function greeting() { const h = new Date().getHours(); return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
const firstName = n => cleanName(n).split(/\s+/)[0] || '';
function relBucket(ts) {
  const now = new Date(), d = new Date(ts);
  const day = 864e5, startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startToday) return 'Today';
  if (ts >= startToday - day) return 'Yesterday';
  if (ts >= startToday - 6 * day) return 'This week';
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'Earlier this month';
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function homeLectures() {
  const all = [...S.index];
  if (S.lecture && !all.some(m => m.id === S.lecture.id)) all.unshift(lectureMeta(S.lecture));
  return all.map(m => (S.lecture && m.id === S.lecture.id ? lectureMeta(S.lecture) : m)).sort((a, b) => b.createdAt - a.createdAt);
}
function homeStats(list) {
  const real = list.filter(m => !m.sample);
  const ms = real.reduce((n, m) => n + (m.ms || 0), 0);
  return [
    ['Lectures', real.length.toLocaleString()],
    ['Time captioned', ms < 3.6e6 ? `${Math.round(ms / 6e4)} min` : `${(ms / 3.6e6).toFixed(ms < 36e6 ? 1 : 0)} h`],
    ['Words captured', real.reduce((n, m) => n + (m.words || 0), 0).toLocaleString()],
    ['Live quizzes run', real.reduce((n, m) => n + (m.runs || 0), 0).toLocaleString()]
  ];
}
function setupSteps() {
  const steps = [];
  steps.push({ id: 'name', done: !!S.settings.lecturer, label: 'Add your name and school', sub: 'Used to cite your lectures in the notes.' });
  steps.push({ id: 'ai', done: aiReady(), label: 'Choose an AI model', sub: 'Unlocks written articles, picture books and scenario quizzes. Several are free.' });
  if (cloudConfigured()) steps.push({ id: 'account', done: isSignedIn(), label: 'Sign in to keep a library', sub: 'Save every lecture and open it on any device.' });
  return steps;
}
function lecCardHtml(m) {
  const cur = S.lecture && m.id === S.lecture.id;
  const live = cur && S.rec.running;
  const chips = [
    m.notes ? `<span class="chip ok">${icon('notes')}${esc(STYLE_LABEL[styleKey(m.notes)] || 'Notes')}</span>` : '',
    m.quiz ? `<span class="chip">${icon('quiz')}${m.quiz} questions</span>` : '',
    m.runs ? `<span class="chip">${icon('trophy')}${m.runs} live run${m.runs > 1 ? 's' : ''}</span>` : '',
    m.keys ? `<span class="chip">${icon('star')}${m.keys} key point${m.keys > 1 ? 's' : ''}</span>` : '',
    m.files ? `<span class="chip">${icon('files')}${m.files} file${m.files > 1 ? 's' : ''}</span>` : ''
  ].filter(Boolean).join('');
  const meta = [fmtDate(m.createdAt), m.ms ? fmtClock(m.ms) : '', m.words ? `${m.words.toLocaleString()} words` : 'Not recorded yet'].filter(Boolean).join(' · ');
  return `<article class="lec-card ${cur ? 'current' : ''}" data-lid="${m.id}" style="--h:${courseHue(m.course || m.title)}">
    <button class="lec-open" data-open="${m.notes ? 'notes' : 'live'}" aria-label="Open ${esc(m.title)}">
      <span class="lec-course">${esc(m.course || (m.sample ? 'Sample lecture' : 'No course'))}${live ? ' · <b class="live-tag">● LIVE</b>' : cur ? ' · Open now' : ''}</span>
      <span class="lec-title">${esc(m.title)}</span>
      <span class="lec-meta">${esc(meta)}</span>
    </button>
    ${chips ? `<div class="lec-chips">${chips}</div>` : ''}
    <div class="lec-actions">
      <button class="btn sm" data-open="live">${icon('cc')}Captions</button>
      <button class="btn sm" data-open="notes">${icon('notes')}Notes</button>
      <button class="btn sm" data-open="quiz">${icon('quiz')}Quiz</button>
      <button class="icon-btn sm lec-del" data-del aria-label="Delete ${esc(m.title)}" title="Delete">${icon('trash')}</button>
    </div>
  </article>`;
}
function renderHomeList() {
  const box = $('#home-list'); if (!box) return;
  const q = (S.ui.homeQ || '').trim().toLowerCase(), course = S.ui.homeCourse || '';
  const list = homeLectures().filter(m => (!course || (m.course || '') === course) && (!q || `${m.title} ${m.course}`.toLowerCase().includes(q)));
  if (!list.length) {
    box.innerHTML = `<div class="panel empty"><h3>${q || course ? 'No lectures match' : 'Your lectures will appear here'}</h3><p>${q || course ? 'Try a different search or course.' : 'Tap New lecture to start captioning. Every lecture you record is saved with its transcript, notes and quiz.'}</p></div>`;
    return;
  }
  const groups = new Map();
  list.forEach(m => { const g = relBucket(m.createdAt); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(m); });
  box.innerHTML = [...groups].map(([g, items]) => `<div class="lec-group"><h3 class="eyebrow">${esc(g)}</h3><div class="lec-grid">${items.map(lecCardHtml).join('')}</div></div>`).join('');
  $$('[data-del]', box).forEach(b => {
    const id = b.closest('.lec-card').dataset.lid;
    twoStep(b, 'Delete?', async () => {
      if (S.lecture?.id === id) { if (S.rec.running) pauseCaptions(true); await deleteLecture(id); const next = S.index[0] ? await openLecture(S.index[0].id) : null; await switchLecture(next || newLecture()); }
      else await deleteLecture(id);
      toast('Lecture deleted'); renderHome();
    });
  });
}
function renderHome() {
  const root = $('#home'); if (!root || !S.lecture) return;
  const list = homeLectures();
  const name = firstName(S.settings.lecturer || (isSignedIn() ? CLOUD.user.displayName : '') || '');
  const courses = [...new Set(list.map(m => m.course).filter(Boolean))];
  if (S.ui.homeCourse && !courses.includes(S.ui.homeCourse)) S.ui.homeCourse = '';
  const steps = setupSteps(), open = steps.filter(s => !s.done);
  const L = S.lecture, hasCur = speechSegs(L).length || L.notes || L.quiz;
  const locked = libraryLocked();
  root.innerHTML = `
    <section class="home-hero">
      <div class="home-greet">
        <span class="eyebrow">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</span>
        <h1>${esc(greeting())}${name ? `, ${esc(name)}` : ''}</h1>
        <p>Caption your lecture live, turn it into notes in the format you need, and check understanding with a live quiz.</p>
      </div>
      <div class="home-cta">
        <button class="new-lec" id="home-new">${icon('plus')}<span><b>New lecture</b><small>Live, from a recording, a YouTube video or a paper</small></span></button>
        ${hasCur ? `<button class="btn" id="home-resume">${icon(S.rec.running ? 'cc' : 'mic')}${S.rec.running ? 'Back to live captions' : `Continue “${esc(L.title.length > 28 ? L.title.slice(0, 27) + '…' : L.title)}”`}</button>` : ''}
      </div>
    </section>
    ${S.rec.running ? `<div class="home-live" role="status"><span class="dot"></span><span class="grow">Captions are live for <b>${esc(L.title)}</b> · ${fmtClock(elapsed())}</span><button class="btn sm" id="home-golive">Return to live</button></div>` : ''}
    ${list.some(m => !m.sample) ? `<section class="home-stats" aria-label="Your teaching at a glance">${homeStats(list).map(([k, v]) => `<div class="hstat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</section>` : ''}
    ${open.length ? `<section class="panel home-setup"><div class="row between"><h2>Get set up</h2><span class="chip">${steps.length - open.length} of ${steps.length} done</span></div>
      <div class="setup-steps">${steps.map(s => `<button class="setup-step ${s.done ? 'done' : ''}" data-step="${s.id}" ${s.done ? 'disabled' : ''}><span class="tick">${s.done ? '✓' : ''}</span><span class="grow"><b>${esc(s.label)}</b><small>${esc(s.sub)}</small></span>${s.done ? '' : icon('arrow')}</button>`).join('')}</div></section>` : ''}
    <section class="home-lib">
      <div class="row between home-lib-head">
        <h2>Past lectures</h2>
        <label class="search">${icon('search')}<input id="home-q" type="search" placeholder="Search lectures" value="${esc(S.ui.homeQ || '')}" aria-label="Search lectures" autocomplete="off"></label>
      </div>
      ${courses.length > 1 ? `<div class="course-chips" role="group" aria-label="Filter by course"><button class="cchip" aria-pressed="${!S.ui.homeCourse}" data-course="">All</button>${courses.map(c => `<button class="cchip" aria-pressed="${S.ui.homeCourse === c}" data-course="${esc(c)}" style="--h:${courseHue(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      ${locked ? `<div class="notice">Without an account Didasko keeps one lecture on this device. <button class="linklike" data-signin>Sign in</button> to save a library of lectures you can reopen any time.</div>` : ''}
      <div id="home-list"></div>
    </section>
    <p class="home-foot small muted">Students join from your QR code — no account needed. Have a code yourself? <a class="linklike" href="?join=">Join a session</a></p>`;
  renderHomeList();
  $('#home-new').onclick = openNewLectureSheet;
  const r = $('#home-resume'); if (r) r.onclick = () => showView('live');
  const gl = $('#home-golive'); if (gl) gl.onclick = () => showView('live');
  $('#home-q').oninput = e => { S.ui.homeQ = e.target.value; renderHomeList(); };
  $$('.cchip', root).forEach(b => b.onclick = () => { S.ui.homeCourse = b.dataset.course; renderHome(); });
  $$('.setup-step', root).forEach(b => b.onclick = () => { const s = b.dataset.step; if (s === 'name') openLectureSheet(true); else if (s === 'ai') openSettings(); else openAccountSheet(); });
  $('#home-list').onclick = async e => {
    const b = e.target.closest('[data-open]'); if (!b) return;
    const id = b.closest('.lec-card').dataset.lid, view = b.dataset.open;
    if (S.lecture?.id !== id) {
      if (S.rec.running) { pauseCaptions(true); toast('Captions paused for the previous lecture'); }
      await saveNow();
      const l = await openLecture(id); if (!l) { toast('Couldn’t open that lecture.'); return; }
      await switchLecture(l);
    }
    showView(view);
  };
}
function openNewLectureSheet(startFrom) {
  const L = S.lecture, locked = libraryLocked();
  const replaces = locked && (speechSegs(L).length || L.notes);
  const courses = [...new Set(homeLectures().map(m => m.course).filter(Boolean))];
  const canCaption = SR && !IS_ARTIFACT;
  let mode = startFrom || (canCaption ? 'live' : 'recording');
  const MODES = [['live', 'Live lecture', 'mic'], ['recording', 'Recording', 'upload'], ['video', 'YouTube video', 'play'], ['paper', 'Paper or reading', 'notes']];
  openSheet('New lecture', `
    <div class="field"><span>Start from</span><div class="seg start-from" role="group" aria-label="Start from">${MODES.map(([k, l, i]) => `<button type="button" data-mode="${k}" aria-pressed="${k === mode}">${icon(i)}${l}</button>`).join('')}</div></div>
    <label class="field"><span>Title</span><input id="nl-title" placeholder="${esc(newLecture().title)}" autocomplete="off"></label>
    <div class="grid-2 stack-sm">
      <label class="field"><span>Course / section</span><input id="nl-course" list="nl-courses" value="${esc(L.course && !L.sample ? L.course : '')}" placeholder="e.g. BIO 110: Introductory Biology" autocomplete="off"><datalist id="nl-courses">${courses.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>
      <label class="field"><span>Language</span><select id="nl-lang">${SRC_LANGS.map(([c, l]) => `<option value="${c}" ${c === S.settings.srcLang ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    </div>
    <div id="nl-mode"></div>
    ${replaces ? `<div class="notice warn">Without an account, starting a new lecture replaces the one on this device. <button class="linklike" data-signin>Sign in</button> to keep both.</div>` : ''}
    <div class="row"><button class="btn primary" id="nl-ok"></button><button class="btn ghost" data-close>Cancel</button></div>`,
    sh => {
      const box = $('#nl-mode', sh), ok = $('#nl-ok', sh);
      const paint = () => {
        $$('[data-mode]', sh).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
        const tr = transcriber(), gem = aiReady() && prov().kind === 'gemini';
        if (mode === 'live') box.innerHTML = canCaption ? `<label class="switch"><input type="checkbox" id="nl-start" checked> Start captions right away</label>` : `<p class="small muted" style="margin:0">${IS_ARTIFACT ? 'Live captions run in the installed app. You can still type or import a transcript.' : 'This browser can’t caption from the microphone. You can type or import a transcript.'}</p>`;
        if (mode === 'recording') box.innerHTML = `<label class="field"><span>Recording (MP3, M4A, WAV or a video file)</span><input type="file" id="nl-file" accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.webm,.flac,.mp4,.mov"></label><p class="small muted" style="margin:0">The recording is transcribed with timestamps, then you can make notes or a quiz from it. The file itself isn’t stored.</p>${tr ? '' : `<div class="notice warn">${esc(NEEDS_TRANSCRIBER)}</div>`}`;
        if (mode === 'video') box.innerHTML = `<label class="field"><span>YouTube link</span><input id="nl-url" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off"></label><p class="small muted" style="margin:0">Gemini watches the public video and writes a timestamped transcript. The video is cited as the source.</p>${gem ? '' : `<div class="notice warn">${esc(NEEDS_GEMINI_VIDEO)}</div>`}`;
        if (mode === 'paper') box.innerHTML = filesLocked() ? `<div class="notice warn">Adding papers and readings needs a free account. <button class="linklike" data-signin>Sign in</button></div>` : `<label class="field"><span>Papers, readings or slides</span><input type="file" id="nl-docs" multiple accept=".pdf,.docx,.pptx,.txt,.md,.html,image/*"></label><p class="small muted" style="margin:0">No lecture needed: Didasko writes notes and quizzes from the material itself and cites it.</p>`;
        ok.innerHTML = { live: `${icon(canCaption ? 'mic' : 'plus')}${canCaption ? 'Create and start' : 'Create lecture'}`, recording: `${icon('spark')}Create and transcribe`, video: `${icon('spark')}Create and transcribe`, paper: `${icon('plus')}Create from material` }[mode];
      };
      $$('[data-mode]', sh).forEach(b => b.onclick = () => { mode = b.dataset.mode; paint(); });
      paint();
      const go = async () => {
        const file = $('#nl-file', sh)?.files?.[0], url = $('#nl-url', sh)?.value?.trim(), docs = [...($('#nl-docs', sh)?.files || [])];
        if (mode === 'recording' && !file) { toast('Choose a recording first.'); return; }
        if (mode === 'video' && !youTubeId(url)) { toast('Paste the address of a YouTube video.'); return; }
        if (mode === 'paper' && !docs.length) { toast(filesLocked() ? 'Sign in to add papers and readings.' : 'Choose a paper or reading first.'); return; }
        const start = mode === 'live' && canCaption && $('#nl-start', sh)?.checked;
        if (S.rec.running) pauseCaptions(true);
        await saveNow();
        const typed = $('#nl-title', sh).value.trim();
        const n = newLecture(typed || (mode === 'recording' ? file.name.replace(/\.[^.]+$/, '') : mode === 'paper' ? docs[0].name.replace(/\.[^.]+$/, '') : undefined));
        n.course = $('#nl-course', sh).value.trim(); n.lecturer = mode === 'video' || mode === 'paper' ? '' : (S.settings.lecturer || L.lecturer || ''); n.institution = S.settings.institution || L.institution || ''; n.author = L.sample ? '' : (L.author || '');
        const lang = $('#nl-lang', sh).value;
        if (lang !== S.settings.srcLang) { S.settings.srcLang = lang; saveSettings(); TR.engineCache.clear(); $('#src-lang').value = lang; renderEngineNote(); }
        if (locked) await deleteLecture(L.id);
        await switchLecture(n); closeSheet();
        if (mode === 'live') { showView('live'); if (start) toggleCaptions(); else toast('New lecture ready'); return; }
        showView('notes');
        if (mode === 'paper') { await addFiles(docs); S.ui.notesTab = 'notes'; renderNotesArea(); toast('Material added. Choose an output and tap Generate, or make a quiz.', 5000); return; }
        S.ui.notesTab = 'transcript'; renderNotesArea();
        if (mode === 'recording') await transcribeFile(file, S.lecture); else await transcribeYouTube(url, S.lecture);
        S.ui.notesTab = 'notes'; renderNotesArea();
      };
      if (replaces) twoStep(ok, 'Tap again — this replaces the current lecture', go); else ok.onclick = go;
      $('#nl-title', sh).onkeydown = e => { if (e.key === 'Enter' && !replaces) go(); };
    });
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

/* ================= Live quiz (presenter side) =================
   Flow: lobby → question → reveal → … → reflection (exit ticket) → review → celebration.
   A live leaderboard sits on the right and shows who has answered each question as it happens. */
const PALETTE = [['Red', '#e5484d'], ['Orange', '#f76b15'], ['Amber', '#e2a336'], ['Lime', '#7cb342'], ['Green', '#30a46c'], ['Teal', '#12a594'], ['Sky', '#0d9adb'], ['Blue', '#3e63dd'], ['Indigo', '#5b5bd6'], ['Violet', '#8e4ec6'], ['Pink', '#d6409f'], ['Coral', '#ec5e5e'], ['Gold', '#c29b0c'], ['Jade', '#29a383'], ['Plum', '#ab4aba'], ['Navy', '#2f4e9e']];
const ANIMALS = 'Otter Fox Heron Lynx Panda Koala Falcon Beaver Bison Owl Badger Dolphin Gecko Ibex Jaguar Kiwi Lemur Manatee Narwhal Ocelot Penguin Quokka Raven Seal Tapir Walrus Yak Zebra Moose Puffin Sloth Turtle Wombat Hedgehog Crane Marmot Orca Llama Hare Toucan Axolotl Bobcat Capybara Dingo Egret Ferret Gazelle Hippo Iguana Jackal Kestrel Lobster Meerkat Newt Okapi Pelican Robin Salmon Tiger Viper Wolf'.split(' ');
const OPT_COLORS = ['#e5484d', '#3e63dd', '#e2a336', '#30a46c'];
const CONF_LABELS = ['Guessing', 'Fairly sure', 'Certain'];
const displayName = (p, mode) => (mode === 'ask' && p?.name) ? p.name : (p ? `${p.color} ${p.animal}` : 'Someone');
const colorHex = c => (PALETTE.find(p => p[0] === c) || [0, '#888'])[1];
function liveQuizSettings() { return { duration: +$('#quiz-timer').value, nameMode: $('#quiz-names').value, showBoard: $('#quiz-board').checked, conf: $('#quiz-conf').checked, reflectOn: $('#quiz-reflect').checked }; }
async function openLiveQuiz() {
  const qs = S.lecture.quiz?.questions || [];
  if (!qs.length) { toast('Generate a quiz first.'); return; }
  if (!LIVE.code && !(await startSharing())) return;
  const set = liveQuizSettings();
  const reflection = set.reflectOn ? (S.lecture.quiz.reflection || DEFAULT_REFLECTION) : '';
  LIVE.q = { ...set, reflection, i: -1, state: 'lobby', qs, results: {}, scores: {}, delta: {}, responses: {}, startedAt: 0, off: null, timer: null };
  await LIVE.ref.update({ quiz: { state: 'lobby', total: qs.length, nameMode: set.nameMode, duration: set.duration, showBoard: set.showBoard, conf: set.conf }, reveal: null, responses: null, scores: null });
  // clear last run's confidence and reflections
  const clr = {}; Object.keys(LIVE.people).forEach(pid => { clr[`participants/${pid}/conf`] = null; clr[`participants/${pid}/reflect`] = null; });
  if (Object.keys(clr).length) LIVE.ref.update(clr).catch(() => {});
  let ov = $('#liveq');
  if (!ov) { ov = document.createElement('div'); ov.id = 'liveq'; ov.className = 'present liveq'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Live quiz'); document.body.appendChild(ov); }
  ov.hidden = false; document.body.style.overflow = 'hidden';
  try { ov.requestFullscreen?.().catch(() => {}); } catch { /* optional */ }
  renderLiveQuiz();
}
function closeLiveQuiz(silent) {
  const q = LIVE.q; if (!q) return;
  clearInterval(q.timer); q.off && q.off(); stopCelebration();
  if (LIVE.ref && !silent) LIVE.ref.update({ quiz: { state: 'closed' } }).catch(() => {});
  if (!q.saved && Object.keys(q.results).length) saveQuizRun(q);
  LIVE.q = null;
  const ov = $('#liveq'); if (ov) { ov.hidden = true; ov.innerHTML = ''; ov.classList.remove('celebrating'); }
  document.body.style.overflow = ''; if (document.fullscreenElement) document.exitFullscreen?.();
}
function confOf(pid, i) { const c = LIVE.people[pid]?.conf; const v = c ? c[i] ?? c[String(i)] : undefined; return Number.isInteger(v) ? v : undefined; }
function saveQuizRun(q) {
  const L = S.lecture; L.quiz.runs = L.quiz.runs || [];
  const conf = {}, reflections = {};
  Object.entries(LIVE.people).forEach(([pid, p]) => { if (p.conf) conf[pid] = p.conf; if (p.reflect) reflections[pid] = p.reflect; });
  L.quiz.runs.push({ at: Date.now(), nameMode: q.nameMode, people: Object.fromEntries(Object.entries(LIVE.people).map(([k, p]) => [k, displayName(p, q.nameMode)])), results: q.results, scores: q.scores, conf, reflections, reflection: q.reflection });
  saveSoon();
}
async function askQuestion(i) {
  const q = LIVE.q; q.i = i; q.state = 'question'; q.delta = {};
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
  q.delta = {};
  for (const [pid, r] of Object.entries(q.responses)) {
    if (r.c >= 0 && r.c < counts.length) counts[r.c]++;
    const pts = r.c === item.answer ? Math.round(500 + 500 * Math.max(0, 1 - (r.ms || win) / win)) : 0;
    q.scores[pid] = (q.scores[pid] || 0) + pts; q.delta[pid] = pts;
  }
  q.results[q.i] = q.responses;
  await LIVE.ref.update({ [`reveal/${q.i}`]: { answer: item.answer, explanation: item.explanation || '', reflect: item.reflect || '', feedback: item.feedback || [], counts }, scores: q.scores, 'quiz/state': 'reveal' });
  renderLiveQuiz();
}
async function startReflection() {
  const q = LIVE.q; q.state = 'reflect';
  await LIVE.ref.child('quiz').update({ state: 'reflect', prompt: q.reflection });
  renderLiveQuiz();
}
async function endQuiz() {
  const q = LIVE.q; q.state = 'ended'; clearInterval(q.timer); q.off && q.off();
  await LIVE.ref.child('quiz/state').set('ended');
  if (!q.saved) { saveQuizRun(q); q.saved = true; }
  renderLiveQuiz();
}
function podium(q) {
  const ranked = Object.entries(q.scores).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const top = ranked.length ? ranked[0][1] : 0;
  const nm = pid => displayName(LIVE.people[pid], q.nameMode);
  const winners = ranked.filter(([, s]) => s === top).map(([pid, s]) => ({ pid, name: nm(pid), score: s, color: LIVE.people[pid]?.color || '' }));
  const runners = ranked.filter(([, s]) => s < top).slice(0, 2).map(([pid, s]) => ({ pid, name: nm(pid), score: s }));
  return { winners, runners };
}
async function celebrate() {
  const q = LIVE.q; q.state = 'celebrate';
  const { winners, runners } = podium(q);
  q.podium = { winners, runners };
  await LIVE.ref.child('quiz').update({ state: 'celebrate', winners: winners.map(({ pid, name, score }) => ({ pid, name, score })), runners: runners.map(({ name, score }) => ({ name, score })) }).catch(() => {});
  renderLiveQuiz();
}
function answeredCount(q, pid) { let n = 0; for (const r of Object.values(q.results)) if (r && r[pid]) n++; if (q.state === 'question' && q.responses[pid]) n++; return n; }
function boardEntries(q) {
  const ids = new Set([...Object.keys(LIVE.people).filter(pid => LIVE.people[pid]?.online !== false), ...Object.keys(q.scores)]);
  return [...ids].map(pid => ({ pid, p: LIVE.people[pid], score: q.scores[pid] || 0, answered: answeredCount(q, pid), now: !!q.responses[pid], online: LIVE.people[pid]?.online !== false }))
    .sort((a, b) => b.score - a.score || b.answered - a.answered || displayName(a.p, q.nameMode).localeCompare(displayName(b.p, q.nameMode)));
}
function boardHtml(q) {
  const rows = boardEntries(q), asked = q.state === 'lobby' ? 0 : Math.max(0, q.i + 1);
  const n = onlineCount(), inQ = q.state === 'question', ans = Object.keys(q.responses).length;
  const totalPossible = rows.length * asked, given = rows.reduce((s, r) => s + r.answered, 0);
  const part = totalPossible ? Math.round(given / totalPossible * 100) : 0;
  const meter = inQ ? (n ? ans / n : 0) : part / 100;
  const label = q.state === 'lobby' ? `<b>${n}</b> joined` : inQ ? `<b>${ans}</b> of ${n} answered` : `<b>${part}%</b> participation`;
  let rank = 0, prev = null;
  return `<div class="lqb-head"><span class="eyebrow">${icon('trophy')}Leaderboard</span><span class="lqb-part">${label}</span></div>
    <div class="lqb-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(meter * 100)}"><span style="transform:scaleX(${meter.toFixed(3)})"></span></div>
    <ol class="lqb-list">${rows.length ? rows.map((r, k) => {
      if (r.score !== prev) { rank = k + 1; prev = r.score; }
      const d = q.state === 'reveal' ? q.delta[r.pid] : undefined;
      const status = q.state === 'lobby' ? '' : inQ ? (r.now ? '<span class="ans yes" title="Answered">✓</span>' : '<span class="ans wait" title="Thinking…">…</span>') : `<span class="ans count" title="Questions answered">${r.answered}/${asked}</span>`;
      return `<li data-pid="${esc(r.pid)}" class="${r.now && inQ ? 'answered' : ''}${!r.online ? ' away' : ''}${rank === 1 && r.score > 0 ? ' lead' : ''}"><span class="rank">${r.score > 0 ? rank : '–'}</span><span class="dot" style="background:${colorHex(r.p?.color)}"></span><span class="nm">${esc(displayName(r.p, q.nameMode))}</span>${d ? `<span class="delta">+${d}</span>` : ''}${status}<b class="pts mono">${r.score.toLocaleString()}</b></li>`;
    }).join('') : '<li class="empty-li">Waiting for students to join…</li>'}</ol>`;
}
function revealInsights(q, item) {
  const resp = Object.entries(q.responses);
  if (!resp.length) return '';
  const wrong = resp.filter(([, r]) => r.c !== item.answer);
  const counts = item.options.map((_, k) => resp.filter(([, r]) => r.c === k).length);
  let topWrong = -1; counts.forEach((c, k) => { if (k !== item.answer && c > 0 && (topWrong < 0 || c > counts[topWrong])) topWrong = k; });
  const conf = resp.map(([pid]) => confOf(pid, q.i)).filter(v => v !== undefined);
  const sureWrong = wrong.filter(([pid]) => confOf(pid, q.i) === 2).length;
  const unsureRight = resp.filter(([pid, r]) => r.c === item.answer && confOf(pid, q.i) === 0).length;
  const parts = [];
  if (topWrong >= 0) parts.push(`<div class="ins"><span class="eyebrow">Most common wrong answer · ${optLetter(item, topWrong)} (${counts[topWrong]})</span><p>${esc(item.feedback?.[topWrong] || item.options[topWrong])}</p></div>`);
  if (q.conf && conf.length) parts.push(`<div class="ins"><span class="eyebrow">Confidence</span><p>${CONF_LABELS.map((l, k) => `${conf.filter(v => v === k).length} ${l.toLowerCase()}`).join(' · ')}${sureWrong ? `<br><b class="warn-t">${sureWrong} certain but incorrect</b> — a misconception worth reteaching.` : ''}${unsureRight ? `<br>${unsureRight} right but guessing — worth a quick recap.` : ''}</p></div>`);
  if (item.reflect) parts.push(`<div class="ins"><span class="eyebrow">Turn and talk</span><p>${esc(item.reflect)}</p></div>`);
  return parts.length ? `<div class="insights">${parts.join('')}</div>` : '';
}
function flipCapture(ov) { const m = new Map(); ov.querySelectorAll('.lqb-list li[data-pid]').forEach(li => m.set(li.dataset.pid, li.getBoundingClientRect().top)); return m; }
function flipPlay(ov, before) {
  if (!before.size || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  ov.querySelectorAll('.lqb-list li[data-pid]').forEach(li => {
    const t = before.get(li.dataset.pid); if (t === undefined) { li.classList.add('enter'); return; }
    const dy = t - li.getBoundingClientRect().top; if (Math.abs(dy) < 1) return;
    li.style.transform = `translateY(${dy}px)`; li.style.transition = 'none';
    requestAnimationFrame(() => { li.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)'; li.style.transform = ''; });
  });
}
async function renderLiveQuiz() {
  const q = LIVE.q, ov = $('#liveq'); if (!q || !ov) return;
  if (q.state === 'celebrate') { if (!ov.classList.contains('celebrating')) renderCelebrateScreen(ov, q); return; }
  ov.classList.remove('celebrating'); stopCelebration();
  const n = onlineCount(), url = joinUrl(LIVE.code, true);
  const people = Object.entries(LIVE.people).filter(([, p]) => p.online !== false);
  const stateLabel = { lobby: 'Live quiz · lobby', reflect: 'Exit ticket', ended: 'Review' }[q.state] || `Question ${q.i + 1} of ${q.qs.length}`;
  const top = `<div class="present-top"><span class="count">${stateLabel} · ${n} connected · code <b class="mono">${LIVE.code}</b></span><button class="btn sm" id="lq-close">${icon('close')}Close</button></div>`;
  let body = '', nav = '';
  if (q.state === 'lobby') {
    body = `<div class="lobby"><div class="qr-wrap big">${await qrSvg(url)}</div>
      <div class="lobby-info"><span class="eyebrow">Join at</span><div class="share-url mono">${esc(shortUrl(url))}</div><span class="eyebrow">Code</span><div class="qr-code mono">${LIVE.code}</div>
      <p class="present-explain">${q.nameMode === 'ask' ? 'Students type their name when they join.' : 'Each student is given a color-and-animal name.'} ${q.duration ? `${q.duration} seconds per question.` : 'No time limit.'} ${q.qs.length} questions${q.reflection ? ', then a short reflection' : ''}.</p></div></div>
      ${q.showBoard ? '' : `<ul class="names">${people.map(([, p]) => `<li style="--c:${colorHex(p.color)}">${esc(displayName(p, q.nameMode))}</li>`).join('') || '<li class="muted-li">Waiting for students…</li>'}</ul>`}`;
    nav = `<button class="btn primary" id="lq-start" ${n ? '' : 'disabled'}>Start quiz</button>`;
  } else if (q.state === 'question' || q.state === 'reveal') {
    const item = q.qs[q.i], resp = Object.values(q.responses), total = Math.max(1, resp.length);
    const counts = item.options.map((_, k) => resp.filter(r => r.c === k).length);
    const rv = q.state === 'reveal';
    body = `${q.duration && !rv ? `<div class="lq-timer"><span id="lq-time" class="mono">${q.duration}</span><div class="lq-track"><div id="lq-bar"></div></div></div>` : ''}
      <h2 class="present-stem">${esc(item.stem)}</h2>
      <div class="present-opts ${item.type === 'tf' ? 'tf' : ''}">${item.options.map((o, k) => `<div class="p-opt ${rv ? (k === item.answer ? 'correct' : 'dim') : ''}" style="--oc:${OPT_COLORS[k]}"><span class="L">${optLetter(item, k)}</span><span class="grow">${esc(o)}</span>${rv ? `<span class="bar-count mono">${counts[k]}</span><span class="bar" style="width:${Math.round(counts[k] / total * 100)}%"></span>` : ''}</div>`).join('')}</div>
      ${rv ? `<p class="present-explain"><b>${resp.length ? Math.round(counts[item.answer] / resp.length * 100) : 0}% correct</b> · ${resp.length} answered${item.explanation ? ` · ${esc(item.explanation)}` : ''}</p>${revealInsights(q, item)}`
        : `<p class="present-explain"><b>${resp.length}</b> of ${n} answered${q.conf ? ' · students also rate how sure they are' : ''}</p>`}`;
    const last = q.i >= q.qs.length - 1;
    nav = rv ? (!last ? `<button class="btn primary" id="lq-next">Next question</button>` : q.reflection ? `<button class="btn primary" id="lq-reflect">Exit ticket</button>` : `<button class="btn primary" id="lq-end">Review results</button>`) : `<button class="btn" id="lq-reveal">Reveal answer now</button>`;
  } else if (q.state === 'reflect') {
    const refl = Object.values(LIVE.people).map(p => p.reflect).filter(r => r && String(r).trim());
    body = `<span class="eyebrow">Reflect on your learning</span><h2 class="present-stem">${esc(q.reflection)}</h2>
      <p class="present-explain"><b>${refl.length}</b> of ${n} reflections in · shown without names</p>
      <ul class="reflections">${refl.slice(-24).reverse().map(r => `<li>${esc(String(r).slice(0, 280))}</li>`).join('') || '<li class="muted-li">Students are writing…</li>'}</ul>`;
    nav = `<button class="btn primary" id="lq-end">Review results</button>`;
  } else if (q.state === 'ended') {
    const rows = q.qs.map((item, i) => {
      const res = Object.entries(q.results[i] || {}); const pct = res.length ? Math.round(res.filter(([, x]) => x.c === item.answer).length / res.length * 100) : 0;
      const sure = res.filter(([pid, x]) => x.c !== item.answer && confOf(pid, i) === 2).length;
      return `<li><span class="mono">${pad(i + 1)}</span><span class="grow">${esc(item.stem.slice(0, 90))}${item.stem.length > 90 ? '…' : ''}${sure ? ` <span class="flag" title="Students who were certain but wrong">⚠ ${sure} certain but wrong</span>` : ''}</span><span class="pct-track"><span style="width:${pct}%;${pct < 60 ? 'background:#f0b84a' : ''}"></span></span><b class="mono">${pct}%</b></li>`;
    }).join('');
    const all = Object.entries(q.results).flatMap(([i, res]) => Object.values(res || {}).map(r => r.c === q.qs[+i]?.answer));
    const avg = all.length ? Math.round(all.filter(Boolean).length / all.length * 100) : 0;
    const reteach = q.qs.map((item, i) => { const r = Object.values(q.results[i] || {}); return { i, pct: r.length ? r.filter(x => x.c === item.answer).length / r.length : 1 }; }).filter(x => x.pct < .6).map(x => x.i + 1);
    body = `<h2 class="present-stem">Class average: ${avg}% correct</h2>
      ${reteach.length ? `<p class="present-explain">Consider revisiting question${reteach.length > 1 ? 's' : ''} ${reteach.join(', ')} — fewer than 60% of the class chose the best answer.</p>` : `<p class="present-explain">Every question was answered correctly by most of the class.</p>`}
      <ul class="qstats">${rows}</ul><p class="present-explain small">Results, confidence ratings and reflections are saved with this lecture. Download them for your gradebook or to plan reteaching.</p>`;
    nav = `<button class="btn primary" id="lq-celebrate">${icon('trophy')}Celebrate the winner</button><button class="btn" id="lq-csv">${icon('down')}Download results (.csv)</button><button class="btn" id="lq-again">Run again</button>`;
  }
  const before = flipCapture(ov);
  ov.innerHTML = `${top}<div class="lq-layout ${q.showBoard ? 'with-board' : ''}"><div class="present-body ${q.state === 'reveal' ? 'rv' : ''}">${body}</div>${q.showBoard ? `<aside class="lq-board" aria-label="Live leaderboard">${boardHtml(q)}</aside>` : ''}</div><div class="present-nav">${nav}</div>`;
  flipPlay(ov, before);
  $('#lq-close', ov).onclick = () => closeLiveQuiz();
  const b = id => $(id, ov);
  if (b('#lq-start')) b('#lq-start').onclick = () => askQuestion(0);
  if (b('#lq-reveal')) b('#lq-reveal').onclick = reveal;
  if (b('#lq-next')) b('#lq-next').onclick = () => askQuestion(q.i + 1);
  if (b('#lq-reflect')) b('#lq-reflect').onclick = startReflection;
  if (b('#lq-end')) b('#lq-end').onclick = endQuiz;
  if (b('#lq-celebrate')) b('#lq-celebrate').onclick = celebrate;
  if (b('#lq-csv')) b('#lq-csv').onclick = () => saveFile(slug(S.lecture.title) + '-quiz-results.csv', quizResultsCsv(q), 'text/csv');
  if (b('#lq-again')) b('#lq-again').onclick = () => { closeLiveQuiz(true); openLiveQuiz(); };
  updateCountdown();
}
async function renderCelebrateScreen(ov, q) {
  ov.classList.add('celebrating');
  const { winners, runners } = q.podium || podium(q);
  const w = winners[0];
  const correct = w ? q.qs.filter((item, i) => q.results[i]?.[w.pid]?.c === item.answer).length : 0;
  const sub = w ? `${w.score.toLocaleString()} points · ${correct} of ${q.qs.length} correct` : 'Thanks for taking part in today’s quiz.';
  ov.innerHTML = `<div class="cele-host" id="cele-host"></div><div class="cele-actions"><button class="btn sm" id="lq-back">Back to review</button><button class="btn sm" id="lq-close">${icon('close')}Close</button></div>`;
  $('#lq-back', ov).onclick = async () => { q.state = 'ended'; stopCelebration(); await LIVE.ref.child('quiz/state').set('ended').catch(() => {}); renderLiveQuiz(); };
  $('#lq-close', ov).onclick = () => closeLiveQuiz();
  await mountCelebration($('#cele-host', ov), { winners, runners, plaque: S.lecture.course || 'Live quiz champion', subtitle: sub });
}
function quizResultsCsv(q) {
  const head = ['Participant', 'Score', 'Correct', ...q.qs.flatMap((_, i) => [`Q${i + 1}`, `Q${i + 1} confidence`]), 'Reflection'];
  const ids = new Set([...Object.values(q.results).flatMap(r => Object.keys(r || {})), ...Object.keys(LIVE.people).filter(pid => LIVE.people[pid]?.reflect)]);
  const rows = [...ids].map(pid => {
    const p = LIVE.people[pid]; let correct = 0;
    const cells = q.qs.flatMap((item, i) => { const r = q.results[i]?.[pid]; if (!r) return ['', '']; if (r.c === item.answer) correct++; const c = confOf(pid, i); return [`${optLetter(item, r.c)}${r.c === item.answer ? ' ✓' : ''}`, c === undefined ? '' : CONF_LABELS[c]]; });
    return [displayName(p, q.nameMode), q.scores[pid] || 0, `${correct}/${q.qs.length}`, ...cells, p?.reflect || ''];
  }).sort((a, b) => b[1] - a[1]);
  const key = ['Answer key', '', '', ...q.qs.flatMap(item => [optLetter(item, item.answer), ''])];
  return '﻿' + [head, key, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

/* ================= Celebration screen: gold trophy, flames, smoke and graffiti =================
   Used on the presenter's screen at the end of a live quiz review and, in a lighter version, on students' devices. */
let graffitiFontsP = null;
function loadGraffitiFonts() {
  if (!graffitiFontsP) {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Rubik+Wet+Paint&family=Permanent+Marker&display=swap';
    document.head.appendChild(l);
    graffitiFontsP = Promise.race([
      Promise.all([document.fonts?.load('64px "Rubik Wet Paint"', 'CHAMPION'), document.fonts?.load('32px "Permanent Marker"', 'Legend')]).catch(() => {}),
      new Promise(r => setTimeout(r, 1500))
    ]);
  }
  return graffitiFontsP;
}
function nameLines(name) {
  const n = String(name || '').trim() || 'Champion';
  if (n.length <= 13 || !n.includes(' ')) return [n];
  const mid = n.length / 2; let best = -1;
  for (let i = 0; i < n.length; i++) if (n[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [n] : [n.slice(0, best), n.slice(best + 1)];
}
function trophySvg(name, plaque) {
  const lines = nameLines(name);
  const longest = Math.max(...lines.map(l => l.length));
  const fs = Math.max(13, Math.min(34, 150 / (0.6 * longest)));
  const y0 = lines.length === 1 ? 132 : 118;
  const text = (attrs) => lines.map((l, i) => `<text x="150" y="${y0 + i * fs * 1.08}" ${attrs} font-size="${fs.toFixed(1)}" text-anchor="middle" font-family="'Permanent Marker','Atkinson Hyperlegible',system-ui,sans-serif"${l.length > 14 ? ` textLength="${Math.min(170, l.length * fs * .58).toFixed(0)}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(l)}</text>`).join('');
  const pl = String(plaque || 'Live quiz champion').slice(0, 34);
  return `<svg class="trophy" viewBox="0 0 300 360" role="img" aria-label="Gold trophy engraved with ${esc(name)}">
  <defs>
    <linearGradient id="tg-gold" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#8a5a00"/><stop offset=".18" stop-color="#ffd85a"/><stop offset=".34" stop-color="#fff6c8"/><stop offset=".5" stop-color="#f5bf2a"/><stop offset=".78" stop-color="#b57a06"/><stop offset="1" stop-color="#ffd860"/></linearGradient>
    <linearGradient id="tg-gold-v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#e6a91a"/><stop offset="1" stop-color="#8a5a00"/></linearGradient>
    <linearGradient id="tg-base" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3b2a20"/><stop offset="1" stop-color="#1c130e"/></linearGradient>
    <radialGradient id="tg-glow" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#ffd85a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd85a" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="150" cy="150" r="150" fill="url(#tg-glow)"/>
  <path d="M66 72 C14 66 14 150 84 160" fill="none" stroke="url(#tg-gold-v)" stroke-width="15" stroke-linecap="round"/>
  <path d="M234 72 C286 66 286 150 216 160" fill="none" stroke="url(#tg-gold-v)" stroke-width="15" stroke-linecap="round"/>
  <path d="M58 48 C58 150 96 202 150 207 C204 202 242 150 242 48 Z" fill="url(#tg-gold)"/>
  <ellipse cx="150" cy="48" rx="92" ry="14" fill="#ffe58a"/><ellipse cx="150" cy="50" rx="80" ry="9" fill="#9a6400" opacity=".55"/>
  <path d="M82 66 C80 120 98 166 128 188" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity=".38"/>
  <path d="M150 72 l7 14 15 2 -11 10 3 15 -14 -7 -14 7 3 -15 -11 -10 15 -2z" fill="#9a6400" opacity=".85"/>
  <g>${text('fill="#fff3b0" opacity=".9" dx="1" dy="1.4"')}${text('fill="#6b4300"')}</g>
  <path d="M136 207 L164 207 L172 250 L128 250 Z" fill="url(#tg-gold)"/>
  <ellipse cx="150" cy="252" rx="32" ry="9" fill="url(#tg-gold-v)"/>
  <path d="M96 262 L204 262 L214 300 L86 300 Z" fill="url(#tg-gold)"/>
  <rect x="70" y="298" width="160" height="34" rx="6" fill="url(#tg-base)"/>
  <rect x="88" y="305" width="124" height="20" rx="3" fill="url(#tg-gold)"/>
  <text x="150" y="319.5" font-size="${pl.length > 22 ? 8.5 : 10}" text-anchor="middle" fill="#5a3700" font-family="'Atkinson Hyperlegible',system-ui,sans-serif" font-weight="700" letter-spacing=".6">${esc(pl.toUpperCase())}</text>
</svg>`;
}
const CROWN = `<svg class="cele-crown" viewBox="0 0 120 70" aria-hidden="true"><path d="M8 60 L14 18 L38 42 L60 8 L82 42 L106 18 L112 60 Z" fill="none" stroke="#f2cb52" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="14" cy="16" r="5" fill="#ff3ea5"/><circle cx="60" cy="7" r="6" fill="#2de2e6"/><circle cx="106" cy="16" r="5" fill="#b6ff3b"/></svg>`;
const TAGS = [
  { t: 'CHAMPION', c: '#ff3ea5', s: '#2de2e6', x: 50, y: 7, r: -4, z: 1.55, big: true },
  { t: 'LEGEND', c: '#b6ff3b', s: '#5b2cff', x: 13, y: 22, r: -13, z: 1 },
  { t: '#1', c: '#ff8a00', s: '#ffef3b', x: 87, y: 20, r: 11, z: 1.6 },
  { t: 'ON FIRE', c: '#2de2e6', s: '#ff3ea5', x: 14, y: 60, r: 7, z: .9 },
  { t: 'BIG BRAIN', c: '#ffef3b', s: '#ff3ea5', x: 86, y: 58, r: -8, z: .85 },
  { t: 'GG', c: '#ff6b6b', s: '#2de2e6', x: 30, y: 40, r: -18, z: .8, wide: true },
  { t: 'WOW', c: '#c38bff', s: '#b6ff3b', x: 72, y: 42, r: 14, z: .75, wide: true }
];
function celebrationHtml({ winners = [], runners = [], plaque = '', subtitle = '', compact = false, mine = false }) {
  const names = winners.map(w => w.name);
  const champ = names.length > 1 ? names.join(' & ') : (names[0] || 'Our class');
  const head = names.length ? (mine ? 'You won!' : names.length > 1 ? 'Co-champions!' : 'Congratulations!') : 'Great effort, everyone!';
  const tags = (compact ? TAGS.filter(t => !t.wide).slice(0, 4) : TAGS).map((g, i) => `<span class="tag${g.big ? ' big' : ''}" style="--x:${compact ? Math.round(50 + (g.x - 50) * .62) : g.x}%;--y:${g.y}%;--r:${g.r}deg;--z:${g.z};--c:${g.c};--s:${g.s};--d:${(0.35 + i * 0.22).toFixed(2)}s">${esc(g.t)}</span>`).join('');
  const splats = Array.from({ length: compact ? 10 : 22 }, (_, i) => { const c = ['#ff3ea5', '#2de2e6', '#b6ff3b', '#ff8a00', '#ffef3b', '#c38bff'][i % 6]; return `<i style="--x:${(Math.random() * 96 + 2).toFixed(1)}%;--y:${(Math.random() * 70 + 2).toFixed(1)}%;--c:${c};--sz:${(Math.random() * 46 + 14).toFixed(0)}px;--d:${(0.2 + Math.random() * 1.6).toFixed(2)}s"></i>`; }).join('');
  return `<div class="cele${compact ? ' compact' : ''}" role="region" aria-label="Celebration">
    <div class="cele-wall"></div>
    <div class="cele-splats" aria-hidden="true">${splats}</div>
    <div class="cele-tags" aria-hidden="true">${tags}</div>
    <canvas class="cele-fire" aria-hidden="true"></canvas>
    <div class="cele-center">
      ${CROWN}
      <div class="cele-trophy">${trophySvg(champ, plaque)}</div>
      <h1 class="cele-head" aria-live="polite">${esc(head)}${names.length && !mine ? `<span>${esc(champ)}</span>` : ''}</h1>
      ${subtitle ? `<p class="cele-sub">${esc(subtitle)}</p>` : ''}
      ${runners.length ? `<ol class="cele-podium">${runners.map((r, i) => `<li><span class="medal m${i + 2}">${i + 2}</span><span class="grow">${esc(r.name)}</span><b class="mono">${(r.score || 0).toLocaleString()}</b></li>`).join('')}</ol>` : ''}
    </div>
  </div>`;
}
/* Particle fire + smoke on a canvas: flame "tongues" lick up from emitters along the bottom edge (taller at the sides, so the
   trophy is framed by fire), smoke curls off the tips, and embers float up. Returns a stop() function. */
function startFire(canvas, { intensity = 1 } = {}) {
  const ctx = canvas.getContext('2d'); if (!ctx) return () => {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, raf = 0, last = performance.now(), alive = true, clock = 0;
  const sprite = (r, g, b, a = 1, soft = .45) => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g},${b},${a})`); gr.addColorStop(soft, `rgba(${r},${g},${b},${a * .5})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return c;
  };
  const FL = [sprite(255, 212, 110), sprite(255, 160, 36), sprite(244, 96, 18), sprite(150, 34, 8)];
  const SM = sprite(120, 112, 106, .9, .6), EM = sprite(255, 214, 120);
  const flames = [], smoke = [], embers = [];
  let emitters = [];
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1); W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, W * dpr); canvas.height = Math.max(1, H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(6, Math.ceil(W / 64));
    emitters = Array.from({ length: n }, (_, i) => { const x = (i + .5) * W / n, e = Math.min(x, W - x) / W; return { x, ph: Math.random() * 6.3, sp: .8 + Math.random() * 1.4, boost: e < .18 ? 1.9 : e < .3 ? 1.35 : 1 }; });
  };
  resize(); const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null; ro?.observe(canvas);
  const base = () => Math.max(70, H * .2);
  const spawn = dt => {
    for (const em of emitters) {
      const h = base() * em.boost * (0.7 + 0.45 * Math.sin(clock * em.sp * 2.2 + em.ph) + 0.2 * Math.sin(clock * 5.3 + em.ph * 2));
      const k = 70 * intensity * dt; let m = Math.floor(k) + (Math.random() < k % 1 ? 1 : 0);
      while (m--) {
        const life = .55 + Math.random() * .5;
        flames.push({ x: em.x + (Math.random() + Math.random() - 1) * 26, y: H + 6, tx: em.x, vy: -Math.max(40, h) / life, life: 0, max: life, size: (30 + Math.random() * 26) * Math.min(1.25, em.boost), w: Math.random() * 6.3 });
      }
      if (Math.random() < 1.4 * intensity * dt * em.boost) smoke.push({ x: em.x + (Math.random() - .5) * 40, y: H - h * (0.85 + Math.random() * .3), vx: (Math.random() - .5) * 16, vy: -(22 + Math.random() * 26), life: 0, max: 4 + Math.random() * 3, size: 70 + Math.random() * 70, ph: Math.random() * 6 });
      if (Math.random() < 2.2 * intensity * dt * em.boost) embers.push({ x: em.x + (Math.random() - .5) * 30, y: H - h * Math.random() * .7, vx: (Math.random() - .5) * 40, vy: -(90 + Math.random() * 170), life: 0, max: 1.4 + Math.random() * 2, ph: Math.random() * 6 });
    }
  };
  const step = dt => {
    clock += dt; spawn(dt);
    for (const a of [flames, smoke, embers]) for (let i = a.length - 1; i >= 0; i--) { const p = a[i]; p.life += dt; if (p.life >= p.max) a.splice(i, 1); }
    for (const p of flames) { const t = p.life / p.max; p.x += ((p.tx - p.x) * 2.2 + Math.sin(clock * 7 + p.w) * 22 * t) * dt; p.y += p.vy * dt; }
    for (const p of smoke) { p.x += (p.vx + Math.sin(p.life * 1.2 + p.ph) * 12) * dt; p.y += p.vy * dt; p.size += 26 * dt; }
    for (const p of embers) { p.x += (p.vx + Math.sin(p.life * 6 + p.ph) * 34) * dt; p.y += p.vy * dt; p.vy *= .995; }
  };
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    for (const p of smoke) { const t = p.life / p.max; ctx.globalAlpha = Math.sin(Math.PI * t) * .3; ctx.drawImage(SM, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, H, 0, H - base() * 1.6); g.addColorStop(0, 'rgba(255,120,20,.35)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, H - base() * 1.6, W, base() * 1.6);
    for (const p of flames) {
      const t = p.life / p.max, spr = FL[Math.min(3, Math.floor(t * 4.2))];
      const s = p.size * (1 - t * .78);
      ctx.globalAlpha = Math.pow(1 - t, .7) * .42;
      ctx.drawImage(spr, p.x - s / 2, p.y - s * .8, s, s * 1.6);
    }
    for (const p of embers) { const t = p.life / p.max; ctx.globalAlpha = 1 - t; ctx.drawImage(EM, p.x - 3, p.y - 3, 6, 6); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
  if (reduced) { for (let i = 0; i < 180; i++) step(1 / 60); draw(); return () => { ro?.disconnect(); }; }
  const loop = now => { if (!alive) return; const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); draw(); raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  return () => { alive = false; cancelAnimationFrame(raf); ro?.disconnect(); };
}
let celeStop = null;
async function mountCelebration(host, opts) {
  stopCelebration();
  await loadGraffitiFonts();
  host.innerHTML = celebrationHtml(opts);
  const cv = $('.cele-fire', host);
  celeStop = startFire(cv, { intensity: opts.compact ? .6 : 1 });
  requestAnimationFrame(() => host.querySelector('.cele')?.classList.add('go'));
}
function stopCelebration() { if (celeStop) { celeStop(); celeStop = null; } }

/* ================= Participant view (?join=CODE) — no account needed ================= */
const P = { code: '', ref: null, me: null, uid: null, session: {}, caps: new Map(), interim: '', quiz: null, reveals: {}, myAnswers: {}, myConf: {}, scores: {}, reflected: false, tab: 'captions', lang: 'off', size: 2, follow: true, localTr: new Map(), timer: null, raf: 0, ended: false };
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
  P.ref.child('scores').on('value', s => { P.scores = s.val() || {}; P.myScore = P.scores[P.uid] || 0; if (P.quiz?.state === 'ended' || P.quiz?.state === 'reveal') renderPQuiz(); });
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
  if (q?.state === 'lobby' && prev?.state !== 'lobby') { P.myAnswers = {}; P.myConf = {}; P.reflected = false; }
  if (q?.state !== 'celebrate') closePCelebration();
  if (q?.state === 'reflect' && prev?.state !== 'reflect' && P.tab !== 'quiz') setPTab('quiz');
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
function pConfidence(k) {
  const q = P.quiz; if (!q || P.myAnswers[q.index] === undefined) return;
  P.myConf[q.index] = k; renderPQuiz();
  P.ref.child(`participants/${P.uid}/conf/${q.index}`).set(k).catch(() => {});
}
function pRank() {
  const sc = P.scores || {}, mine = sc[P.uid] || 0;
  return { rank: 1 + Object.values(sc).filter(v => v > mine).length, of: Math.max(Object.keys(sc).length, 1) };
}
function closePCelebration() { const o = $('#p-cele'); if (o) { stopCelebration(); o.remove(); } }
async function showPCelebration(q) {
  if ($('#p-cele')) return;
  const o = document.createElement('div'); o.id = 'p-cele'; o.className = 'p-cele';
  o.innerHTML = '<div class="cele-host"></div><div class="cele-actions"><button class="btn sm" id="p-cele-close">Close</button></div>';
  document.body.appendChild(o);
  $('#p-cele-close').onclick = () => { P.celeDismissed = true; closePCelebration(); };
  const winners = q.winners || [], mine = winners.some(w => w.pid === P.uid);
  if (navigator.vibrate) navigator.vibrate(mine ? [80, 60, 80, 60, 200] : 60);
  await mountCelebration($('.cele-host', o), { winners, runners: q.runners || [], compact: true, mine, plaque: P.session.title?.slice(0, 30) || 'Live quiz champion', subtitle: mine ? `${(winners.find(w => w.pid === P.uid)?.score || 0).toLocaleString()} points — top of the class!` : winners.length ? `${(winners[0].score || 0).toLocaleString()} points` : '' });
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
  if (q.state === 'reflect') {
    if (P.reflected) { box.innerHTML = `<div class="p-empty">${meChip}<h2>Thanks for reflecting</h2><p>Your teacher will share the results in a moment.</p></div>`; return; }
    if ($('#p-reflect-form', box)) return; // keep what the student is typing
    box.innerHTML = `<form class="p-name p-reflect" id="p-reflect-form"><span class="eyebrow">Exit ticket</span><h2>${esc(q.prompt || DEFAULT_REFLECTION)}</h2><p>Your teacher sees reflections without names on the board.</p><textarea id="p-reflect-in" maxlength="280" rows="4" placeholder="Type your reflection…" aria-label="Your reflection"></textarea><button class="btn primary" type="submit">Send reflection</button></form>`;
    $('#p-reflect-form').onsubmit = e => { e.preventDefault(); const v = $('#p-reflect-in').value.trim().slice(0, 280); if (!v) return; P.reflected = true; P.ref.child(`participants/${P.uid}/reflect`).set(v).catch(() => toast('That didn’t send — try again.')); renderPQuiz(); };
    return;
  }
  if (q.state === 'ended' || q.state === 'celebrate') {
    const n = q.total || 0; let correct = 0;
    for (let i = 0; i < n; i++) if (P.reveals[i] && P.myAnswers[i] === P.reveals[i].answer) correct++;
    const { rank, of } = pRank();
    box.innerHTML = `<div class="p-empty">${meChip}<h2>Quiz complete</h2><p class="p-score"><b>${correct}</b> of ${n} correct${q.showBoard ? ` · ${(P.myScore || 0).toLocaleString()} points · #${rank} of ${of}` : ''}</p><p>Thanks for taking part. Your teacher has your results.</p></div>`;
    if (q.state === 'celebrate' && !P.celeDismissed) showPCelebration(q);
    return;
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
    ${!rv && mine !== undefined && q.conf ? `<div class="p-conf"><span class="eyebrow">How sure are you?</span><div class="p-conf-btns">${CONF_LABELS.map((l, k) => `<button class="btn sm ${P.myConf[q.index] === k ? 'on' : ''}" data-conf="${k}" aria-pressed="${P.myConf[q.index] === k}">${esc(l)}</button>`).join('')}</div></div>` : ''}
    <p class="p-status-line">${rv ? (mine === undefined ? 'No answer this time.' : mine === rv.answer ? '✓ Correct!' : '✗ Not this time.') : mine !== undefined ? 'Answer locked in. Waiting for the others…' : 'Tap your answer.'}</p>
    ${rv ? `${mine !== undefined && rv.feedback?.[mine] ? `<div class="p-fb ${mine === rv.answer ? 'ok' : 'no'}">${esc(rv.feedback[mine])}</div>` : rv.explanation ? `<div class="p-fb">${esc(rv.explanation)}</div>` : ''}${rv.reflect ? `<div class="p-fb think"><span class="eyebrow">Think about it</span> ${esc(rv.reflect)}</div>` : ''}` : ''}
  </div>`;
  $$('.p-opt', box).forEach(b => b.onclick = () => pAnswer(+b.dataset.k));
  $$('[data-conf]', box).forEach(b => b.onclick = () => pConfidence(+b.dataset.conf));
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

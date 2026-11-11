/* ================= Recordings and video links → transcript =================
   Lets a teacher start from an audio/video recording or a YouTube link instead of live captions.
   Gemini transcribes audio and YouTube videos; ChatGPT (OpenAI) transcribes audio with Whisper.
   Long recordings are cut into parts under each service's upload limit and stitched back together with their timestamps. */
const MEDIA_EXT = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime' };
const extOf = n => (String(n).split('.').pop() || '').toLowerCase();
const isMediaFile = f => !!MEDIA_EXT[extOf(f.name)] || /^(audio|video)\//.test(f.type || '');
const YT_RE = /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{6,})/i;
const youTubeId = u => (String(u || '').trim().match(YT_RE) || [])[1] || '';
/* Groq runs Whisper large-v3-turbo many times faster than real time, on a free tier, so a Groq key is used for recordings. */
const GROQ_WHISPER = 'whisper-large-v3-turbo';
const groqKey = () => S.settings.ai.keys.groq || '';
function transcriber() {
  if (S.settings.ai.provider === 'groq' && groqKey()) return 'groq';
  if (!aiReady()) return null;
  if (prov().kind === 'gemini' || prov().kind === 'free') return 'gemini';
  if (aiId() === 'openai') return 'openai';
  return null;
}
const NEEDS_TRANSCRIBER = 'Transcribing a recording needs Gemini, ChatGPT or Groq. Choose one in Settings → AI model (Gemini and Groq have free tiers; Groq is the fastest), or import a transcript file instead.';
const NEEDS_GEMINI_VIDEO = 'Video links need your own Gemini key (Settings → AI model; Gemini has a free tier). Or open the video on YouTube, choose “Show transcript”, copy it, and use Import transcript.';
const MEDIA = { busy: false, ctl: null };
function setMediaStatus(text) {
  const st = $('#notes-status'); if (!st) return;
  st.hidden = !text; if (text) $('#notes-status-text').textContent = text;
  $('#notes-generate').disabled = !!text;
  basicStatus(text);
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
  if (kind === 'openai' || kind === 'groq') {
    const fd = new FormData();
    fd.append('file', blob, 'part.' + (Object.keys(MEDIA_EXT).find(k => MEDIA_EXT[k] === mime) || 'mp3'));
    fd.append('model', kind === 'groq' ? GROQ_WHISPER : 'whisper-1'); fd.append('response_format', 'verbose_json');
    const url = kind === 'groq' ? `${(S.settings.ai.bases.groq || PROVIDERS.groq.base).replace(/\/+$/, '')}/audio/transcriptions` : `${aiBase()}/audio/transcriptions`;
    const res = await aiFetch(url, { method: 'POST', headers: { Authorization: `Bearer ${kind === 'groq' ? groqKey() : aiKey()}` }, body: fd }, signal);
    await failIfBad(res);
    const j = await res.json();
    return (j.segments || []).map(s => ({ t: Math.round((s.start || 0) * 1000), text: String(s.text || '').trim() })).filter(s => s.text)
      .concat(!j.segments && j.text ? [{ t: 0, text: j.text }] : []);
  }
  const data = await blobB64(blob);
  const out = await callAI({
    signal, maxTokens: 16000, think: 'off', images: [{ mime, data, name: 'recording' }],
    system: 'You are a careful transcriber of lectures and classroom recordings. You write what was said, accurately, in the language spoken.',
    user: 'Transcribe this recording. Remove filler words (um, uh) and false starts, but keep every idea and keep the speaker’s wording. Write one line per sentence or short passage, each line starting with its timestamp from the start of this clip in [m:ss] form, for example "[3:07] Today we look at…". If there are several speakers, start each line after the timestamp with a short label such as "Student:" for anyone who is not the main speaker. Output the transcript lines only.'
  });
  return parseTimed(out);
}
async function transcribeFile(file, L, quiet) {
  const kind = transcriber(); if (!kind) { toast(NEEDS_TRANSCRIBER, 7000); return false; }
  if (MEDIA.busy) { toast('A recording is already being transcribed.'); return false; }
  MEDIA.busy = true; MEDIA.ctl = new AbortController();
  const ext = extOf(file.name), mime = file.type && /^(audio|video)\//.test(file.type) ? file.type : MEDIA_EXT[ext] || 'audio/mpeg';
  const free = kind === 'gemini' && usingFree();
  const cap = free ? 10 * 1048576 : kind === 'gemini' ? 14 * 1048576 : 24 * 1048576;
  /* Speed: a model writes a transcript about as fast for a 5-minute clip as for the first 5 minutes of an hour, so
     long recordings are cut into short parts that are transcribed side by side. The shared free AI keeps the old
     one-at-a-time behavior so it doesn't use up everyone's allowance. */
  const secs = free ? 0 : kind === 'gemini' ? 300 : 600;
  const parallel = kind === 'groq' ? 3 : kind === 'openai' ? 4 : aiParallel();
  const label = file.name.length > 40 ? file.name.slice(0, 37) + '…' : file.name;
  const job = new AbortController(); MEDIA.ctl.signal.addEventListener('abort', () => job.abort());
  try {
    setMediaStatus(`Preparing ${label}…`);
    let parts, duration = await mediaDuration(file);
    const short = !secs || !duration || duration <= secs * 1.2;
    const isMp3 = ext === 'mp3' || mime === 'audio/mpeg';
    if (file.size <= cap && short) parts = [{ blob: file, offsetMs: 0, mime }];
    else if (isMp3) {
      const bytesPerPart = secs && duration ? Math.floor(file.size / duration * secs) : cap;
      const raw = await mp3Parts(file, Math.min(cap, bytesPerPart));
      const secPerByte = duration ? duration / file.size : 1 / 16000; // 128 kbps if the length is unknown
      parts = raw.map(p => ({ blob: p.blob, offsetMs: Math.round(p.start * secPerByte * 1000), mime: 'audio/mpeg' }));
    } else {
      setMediaStatus(`Converting ${label} for transcription…`);
      const d = await decodedParts(file, secs || 300);
      parts = d.parts.map(p => ({ ...p, mime: 'audio/wav' })); duration = duration || d.duration;
    }
    let done = 0;
    const status = () => setMediaStatus(parts.length > 1 ? `Transcribing ${label}: ${done} of ${parts.length} parts done…` : `Transcribing ${label}…`);
    status();
    let results;
    try {
      results = await runPool(parts, parallel, async p => {
        const rows = await withRetry(() => transcribePart(kind, p.blob, p.mime, job.signal), job.signal);
        done++; status();
        return rows.map(r => ({ t: p.offsetMs + r.t, text: r.text }));
      });
    } catch (e) { job.abort(); throw e; }
    const lines = results.flat();
    if (!lines.length) throw new Error('No speech was found in this recording.');
    const base = speechSegs(L).length ? elapsed() + 2000 : 0;
    lines.forEach(r => addSpeech(r.text, base + r.t));
    L.ms = Math.max(L.ms || 0, base + Math.round((duration || 0) * 1000), base + lines[lines.length - 1].t + 4000);
    if (!base) L.source = L.source || { kind: file.type.startsWith('video/') ? 'video' : 'audio', name: file.name };
    saveSoon(); renderAll();
    if (!quiet) reviewTranscript(); toast(`Transcript ready: ${lines.length} lines from ${label}. Review and edit it, then write notes or make a quiz.`, 6000);
    return true;
  } catch (e) {
    if (!MEDIA.ctl?.signal.aborted) toast(e.message === 'NO_AI' ? NEEDS_TRANSCRIBER : e.message, 6000);
    return false;
  } finally { MEDIA.busy = false; MEDIA.ctl = null; setMediaStatus(''); }
}
async function transcribeYouTube(url, L, quiet) {
  const id = youTubeId(url);
  if (!id) { toast('That doesn’t look like a YouTube link. Paste the address of a public video.'); return false; }
  if (!aiReady() || prov().kind !== 'gemini') { toast(NEEDS_GEMINI_VIDEO, 8000); return false; }
  if (MEDIA.busy) { toast('A recording is already being transcribed.'); return false; }
  MEDIA.busy = true; MEDIA.ctl = new AbortController();
  const watch = `https://www.youtube.com/watch?v=${id}`;
  try {
    setMediaStatus('Watching the video and writing the transcript… long videos can take a few minutes.');
    const prompt = 'Transcribe this video. On the first line write "TITLE: " and the video’s title; on the second line write "SPEAKER: " and the main speaker’s or channel’s name; on the third line write "YEAR: " and the year it was published if you know it, otherwise leave it blank. Then write the transcript: remove filler words and false starts but keep every idea and the speaker’s wording, one line per sentence or short passage, each starting with its timestamp in [m:ss] or [h:mm:ss] form. Output nothing else.';
    /* Speed: no thinking before writing, and one video frame every 10 seconds (a transcript comes from the audio;
       the default is a frame every second). The response streams, so the status shows how far Gemini has got. */
    const model = aiModel(false);
    const body = { contents: [{ role: 'user', parts: [{ fileData: { fileUri: watch, mimeType: 'video/*' }, videoMetadata: { fps: 0.1 } }, { text: prompt }] }], generationConfig: { maxOutputTokens: 32768, mediaResolution: 'MEDIA_RESOLUTION_LOW' } };
    const tc = geminiThinking(model, 'off'); if (tc) body.generationConfig.thinkingConfig = tc;
    const strip = b => { const p0 = b.contents[0].parts[0], had = !!(p0.videoMetadata || b.generationConfig.thinkingConfig); delete p0.videoMetadata; delete b.generationConfig.thinkingConfig; return had; };
    const res = await withRetry(async () => {
      const r = await postAI(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, { 'content-type': 'application/json', 'x-goog-api-key': aiKey() }, body, MEDIA.ctl.signal, strip);
      await failIfBad(r); return r;
    }, MEDIA.ctl.signal);
    let text = '', block = '';
    await readSSE(res, ev => {
      if (ev.promptFeedback?.blockReason) block = ev.promptFeedback.blockReason;
      const d = (ev.candidates?.[0]?.content?.parts || []).filter(x => x.text && !x.thought).map(x => x.text).join('');
      if (!d) return;
      text += d;
      const last = [...text.matchAll(/\[(\d+:\d{2}(?::\d{2})?)\]/g)].pop();
      if (last) setMediaStatus(`Writing the transcript… reached ${last[1]} of the video.`);
    });
    if (!text.trim()) throw new Error(block ? `Gemini declined this video (${block}).` : 'Gemini couldn’t read this video. It must be public, and very long videos may need to be shortened.');
    const meta = {}; const body2 = text.replace(/^\s*(TITLE|SPEAKER|YEAR):[ \t]*(.*)$/gim, (_, k, v) => { meta[k.toUpperCase()] = v.trim(); return ''; });
    const rows = parseTimed(body2.replace(/^\s*\n/gm, ''));
    if (rows.length < 2) throw new Error('Gemini didn’t return a transcript for this video. Check that it’s public and try again.');
    const appended = speechSegs(L).length > 0;
    const base = appended ? elapsed() + 2000 : 0;
    rows.forEach(r => addSpeech(r.text, base + r.t));
    L.ms = Math.max(L.ms || 0, base + rows[rows.length - 1].t + 5000);
    if (!appended) L.source = { kind: 'video', url: watch, title: meta.TITLE || '', speaker: meta.SPEAKER || '', year: (meta.YEAR || '').match(/\d{4}/)?.[0] || '' };
    if (!appended && !L.lecturer && meta.SPEAKER) L.lecturer = meta.SPEAKER;
    if (meta.TITLE && /^Lecture · /.test(L.title)) L.title = meta.TITLE;
    saveSoon(); renderAll();
    if (!quiet) reviewTranscript(); toast(`Transcript ready: ${rows.length} lines from “${meta.TITLE || 'the video'}”. Review and edit it, then write notes or make a quiz.`, 6000);
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

/* ================= Supporting materials from a link =================
   Google Slides, Docs and Sheets shared as "Anyone with the link" can be read in the browser through Google's export
   addresses (slides come as .pptx so speaker notes are kept). Other addresses work when the site allows other pages to read it. */
const GOOGLE_FILE_RE = /docs\.google\.com\/(presentation|document|spreadsheets)\/(?:u\/\d+\/)?d\/(e\/)?([\w-]{15,})/i;
const DRIVE_FILE_RE = /drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=)([\w-]{15,})/i;
const LINK_TYPES = {
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md', 'text/csv': 'csv', 'text/html': 'html', 'text/vtt': 'vtt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'
};
const LINK_EXTS = ['pdf', 'docx', 'pptx', 'txt', 'md', 'csv', 'vtt', 'srt', 'html', 'htm', 'jpg', 'jpeg', 'png', 'webp', 'gif'];
const isGoogleFileLink = u => GOOGLE_FILE_RE.test(String(u || '')) || DRIVE_FILE_RE.test(String(u || ''));
function linkPlan(u) {
  const href = u.href, g = href.match(GOOGLE_FILE_RE);
  if (g) {
    const [, type, published, id] = g, base = `https://docs.google.com/${type}/d/${id}`;
    const label = { presentation: 'Google Slides', document: 'Google Docs', spreadsheets: 'Google Sheets' }[type];
    if (published) return { error: `That is a “Publish to the web” link. In ${label}, tap Share → Copy link and paste that link instead.` };
    if (type === 'presentation') return { google: true, label, citeUrl: base, cite: { kind: 'slides', desc: 'Google Slides' }, tries: [['pptx', `${base}/export/pptx`], ['txt', `${base}/export/txt`]] };
    if (type === 'document') return { google: true, label, citeUrl: base, cite: { kind: 'document' }, tries: [['docx', `${base}/export?format=docx`], ['txt', `${base}/export?format=txt`]] };
    const gid = (href.match(/[#?&]gid=(\d+)/) || [])[1];
    return { google: true, label, citeUrl: base, cite: { kind: 'dataset' }, tries: [['csv', `${base}/export?format=csv${gid ? `&gid=${gid}` : ''}`]] };
  }
  const d = href.match(DRIVE_FILE_RE);
  if (d) return { google: true, label: 'Google Drive', citeUrl: `https://drive.google.com/file/d/${d[1]}/view`, cite: {}, tries: [['', `https://drive.google.com/uc?export=download&id=${d[1]}`]] };
  return { label: 'Web', citeUrl: href, cite: {}, tries: [['', href]] };
}
function linkFileName(res, u, plan) {
  const cd = res.headers.get('content-disposition') || '';
  let name = '';
  const star = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i), plain = cd.match(/filename="?([^";]+)"?/i);
  try { if (star) name = decodeURIComponent(star[1].trim()); } catch { /* fall through */ }
  if (!name && plain) name = plain[1].trim();
  if (!name && !plan.google) { try { name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || ''); } catch { /* keep empty */ } }
  return name.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
}
async function fetchLinkMaterial(raw, signal) {
  let url = String(raw || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  let u; try { u = new URL(url); } catch { u = null; }
  if (!u || !u.hostname.includes('.')) throw new Error('That doesn’t look like a link. Paste the full address, starting with https://');
  const plan = linkPlan(u);
  if (plan.error) throw new Error(plan.error);
  let res = null, ext = '';
  for (const [want, addr] of plan.tries) {
    try {
      const r = await fetch(addr, { credentials: 'omit', signal });
      const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!r.ok || (plan.google && type === 'text/html')) continue; // a private file answers with Google's sign-in page
      const pathExt = extOf(u.pathname);
      res = r; ext = want || LINK_TYPES[type] || (LINK_EXTS.includes(pathExt) ? pathExt : ''); break;
    } catch (e) { if (signal?.aborted) throw e; }
  }
  if (!res) throw new Error(plan.google
    ? `Didasko couldn’t open that ${plan.label} file. Tap Share, set General access to “Anyone with the link”, then try again — or download the file and add it here.`
    : 'Didasko can’t read that page directly — most websites don’t allow it. Download the file, or copy the text and paste it here instead.');
  if (!ext) throw new Error('That link isn’t a document Didasko can read. Use a link to slides, a document, a PDF or a web page.');
  const blob = await res.blob();
  if (blob.size > 60 * 1048576) throw new Error('That file is larger than 60 MB.');
  let title = linkFileName(res, u, plan), file;
  if (ext === 'html' || ext === 'htm') {
    const doc = new DOMParser().parseFromString(await blob.text(), 'text/html');
    title = (doc.title || '').trim() || title;
    doc.querySelectorAll('script,style,noscript,template,svg,nav,header,footer,aside,form').forEach(n => n.remove());
    const text = (doc.querySelector('main, article') || doc.body)?.textContent || '';
    file = new File([text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n')], `${title || u.hostname}.txt`, { type: 'text/plain' });
  } else file = new File([blob], `${title || plan.label}.${ext}`, { type: blob.type });
  title = title || (plan.google ? plan.label : u.hostname);
  const f = await extractFile(file);
  if (!f.text && !f.image) throw new Error('No text was found at that link.');
  if (ext === 'html' || ext === 'htm') { f.kind = 'html'; f.name = `${title}.html`; }
  f.url = plan.citeUrl;
  f.meta = `${plan.label} link · ${f.meta}`;
  // Google's exported copies carry export details, not the real author or date, so only the title and link are kept for those.
  f.cite = plan.google ? { ...plan.cite, title, url: plan.citeUrl } : { ...(f.cite || {}), ...plan.cite, title: f.cite?.title || title, url: plan.citeUrl };
  return f;
}
/* Fetch a link and add it to this lecture's materials. Returns the new material, or null (with a message shown) when it fails. */
async function addLinkMaterial(url, quiet) {
  const ctl = new AbortController(); if (!MEDIA.ctl) MEDIA.ctl = ctl;
  if (!quiet) toast('Reading the link…', 20000);
  try {
    const f = await fetchLinkMaterial(url, ctl.signal);
    S.lecture.files.push(f); saveSoon(); renderFiles(); renderBadges();
    if (!quiet) toast(`Added ${f.name}`);
    if (aiReady() && f.text) detectCitation(f, { quiet: true }).then(() => { if (S.view === 'files') renderFiles(); });
    return f;
  } catch (e) {
    if (!ctl.signal.aborted) toast(e.message || 'Couldn’t read that link.', 8000);
    return null;
  } finally { if (MEDIA.ctl === ctl) MEDIA.ctl = null; }
}
function openLinkSheet() {
  openSheet('Add a link', `
    <p class="small muted" style="margin:0">Paste a link to Google Slides, Google Docs or Google Sheets (shared as “Anyone with the link”), or to a PDF or web page. Didasko reads the text and cites the link in your notes.</p>
    <label class="field"><span>Link</span><input id="lk-url" type="url" inputmode="url" placeholder="https://docs.google.com/presentation/d/…" autocomplete="off"></label>
    <div class="row"><button class="btn primary" id="lk-ok">${icon('plus')}Add link</button><button class="btn ghost" data-close>Cancel</button></div>`,
    sh => {
      const go = async () => {
        const v = $('#lk-url', sh).value.trim(); if (!v) { toast('Paste a link first.'); return; }
        if (youTubeId(v)) { closeSheet(); openVideoSheet(); const y = $('#yt-url'); if (y) y.value = v; return; }
        $('#lk-ok', sh).disabled = true;
        const f = await addLinkMaterial(v);
        if (f) closeSheet(); else if ($('#lk-ok', sh)) $('#lk-ok', sh).disabled = false;
      };
      $('#lk-ok', sh).onclick = go; $('#lk-url', sh).onkeydown = e => { if (e.key === 'Enter') go(); };
    });
}

/* ================= Listening in every language =================
   A browser's own speech recognition follows one language at a time, so a speaker who moves between languages
   (English → Spanish → English) is misheard. With "Speaker switches between languages" on, Didasko records the
   microphone itself, cuts the sound at natural pauses and sends each short piece to the teacher's transcription
   service (Groq or ChatGPT Whisper, or Gemini), which writes down whatever language is spoken. Captions arrive a
   few seconds behind. The sound is not stored. */
const AICAP = { on: false, kind: null, stream: null, ctx: null, src: null, node: null, mute: null, rate: 16000, buf: [], len: 0, startMs: 0, voiced: 0, quiet: 0, min: 5, max: 12, chain: Promise.resolve(), pending: 0, ctl: null, lastErr: 0 };
const NEEDS_AI_LISTEN = 'Listening in several languages needs your own Groq, Gemini or ChatGPT key (Settings → AI model; Groq and Gemini have free tiers, and Groq is the fastest).';
const multiLangOn = () => !!S.settings.multiLang;
const aiListenReady = () => !IS_ARTIFACT && !!navigator.mediaDevices?.getUserMedia && !!transcriber() && !(transcriber() === 'gemini' && usingFree());
const useAiListen = () => multiLangOn() && aiListenReady();
const aiListenPending = () => AICAP.pending > 0;
const aiListenIdle = () => AICAP.chain;
const AI_NOISE = /amara\.org|subt[ií]tulos (realizados|por la comunidad)|^\W*$/i;
const AI_NOISE_SHORT = /^\W*(thank you|thanks for watching|thanks|you|bye|gracias|okay|ok)\W*$/i; // what Whisper writes for a cough or a click
function setMultiLang(on) {
  if (on && !aiListenReady()) { toast(IS_ARTIFACT ? 'Live recording runs in the installed app.' : NEEDS_AI_LISTEN, 8000); on = false; }
  S.settings.multiLang = !!on; saveSettings(); renderMultiLang(); renderEngineNote();
  if (S.rec.running) { pauseCaptions(true); startCaptions(); }
  return !!on;
}
function renderMultiLang() {
  const on = multiLangOn();
  ['#multi-lang', '#b-multi'].forEach(id => { const c = $(id); if (c) c.checked = on; });
  const n = $('#multi-note'); if (n) n.hidden = !on;
}
async function startAiListen() {
  const A = AICAP, gen = A.gen = (A.gen || 0) + 1;
  A.kind = transcriber(); A.ctl = new AbortController(); A.buf = []; A.len = 0; A.voiced = 0; A.quiet = 0;
  A.min = A.kind === 'gemini' ? 10 : 5; A.max = A.kind === 'gemini' ? 20 : 12;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  if (!S.rec.running || gen !== A.gen) { stream.getTracks().forEach(t => t.stop()); return; } // paused or restarted while the permission prompt was open
  A.stream = stream;
  const AC = window.AudioContext || window.webkitAudioContext;
  try { A.ctx = new AC({ sampleRate: 16000 }); } catch { A.ctx = new AC(); }
  A.rate = A.ctx.sampleRate;
  if (A.ctx.state === 'suspended') await A.ctx.resume();
  A.src = A.ctx.createMediaStreamSource(A.stream);
  try {
    const code = `class DidaskoTap extends AudioWorkletProcessor { process(inputs) { const c = inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; } } registerProcessor('didasko-tap', DidaskoTap);`;
    const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    try { await A.ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    A.node = new AudioWorkletNode(A.ctx, 'didasko-tap');
    A.node.port.onmessage = e => aiListenFrames(e.data);
  } catch {
    A.node = A.ctx.createScriptProcessor(4096, 1, 1); // older browsers
    A.node.onaudioprocess = e => aiListenFrames(new Float32Array(e.inputBuffer.getChannelData(0)));
  }
  A.mute = A.ctx.createGain(); A.mute.gain.value = 0; // keeps the graph running without playing the microphone back
  A.src.connect(A.node); A.node.connect(A.mute); A.mute.connect(A.ctx.destination);
  A.on = true;
}
function aiListenFrames(f) {
  const A = AICAP; if (!A.on || !f?.length) return;
  if (!A.len) A.startMs = elapsed();
  let sum = 0; for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
  const dur = f.length / A.rate;
  if (Math.sqrt(sum / f.length) > 0.012) { A.voiced += dur; A.quiet = 0; } else A.quiet += dur;
  A.buf.push(f); A.len += f.length;
  // Before anyone speaks, keep only the last half second so a piece starts just ahead of the first word.
  while (!A.voiced && A.len / A.rate > 0.5 && A.buf.length > 1) { const d = A.buf.shift(); A.len -= d.length; A.startMs += d.length / A.rate * 1000; }
  const secs = A.len / A.rate;
  if (secs >= A.max || (secs >= A.min && A.quiet >= 0.45) || (A.voiced >= 0.4 && A.quiet >= 2)) aiListenCut();
}
function aiListenCut() {
  const A = AICAP, n = A.len; if (!n) return;
  const voiced = A.voiced, at = Math.round(A.startMs), all = new Float32Array(n);
  let o = 0; for (const b of A.buf) { all.set(b, o); o += b.length; }
  A.buf = []; A.len = 0; A.voiced = 0; A.quiet = 0;
  if (voiced < 0.35) return; // silence or a click: nothing to send
  const blob = wavBlob(all, A.rate), kind = A.kind, signal = A.ctl.signal;
  A.pending++; aiListenStatus();
  const job = withRetry(() => transcribePart(kind, blob, 'audio/wav', signal), signal, [2000, 6000]).then(rows => ({ rows }), error => ({ error }));
  A.chain = A.chain.then(() => job).then(({ rows, error }) => {
    A.pending--;
    if (error) aiListenError(error, signal);
    else rows.forEach(r => { if (!AI_NOISE.test(r.text) && !(voiced < 1.5 && AI_NOISE_SHORT.test(r.text))) addSpeech(r.text, at + (r.t || 0)); });
    aiListenStatus();
  });
}
function aiListenError(e, signal) {
  if (signal?.aborted) return;
  if (e.status === 401 || e.status === 403 || e.message === 'NO_AI') { if (S.rec.running) pauseCaptions(true); toast(e.message === 'NO_AI' ? NEEDS_AI_LISTEN : `Captions stopped: ${e.message}`, 8000); return; }
  if (Date.now() - AICAP.lastErr > 20000) { AICAP.lastErr = Date.now(); toast(`A few seconds of captions were missed: ${e.message || 'the transcription service didn’t answer'}`, 5000); }
}
function aiListenStatus() {
  const el = $('#b-ai'); if (el) el.textContent = AICAP.pending ? 'Writing captions…' : 'Listening in every language. Captions appear a few seconds after you speak.';
}
/* Stop the microphone. What was said just before is still sent, so its captions arrive a moment later. */
function stopAiListen(discard) {
  const A = AICAP;
  if (A.on && !discard) aiListenCut();
  A.on = false; A.buf = []; A.len = 0;
  try { A.node && (A.node.port ? (A.node.port.onmessage = null) : (A.node.onaudioprocess = null)); A.src?.disconnect(); A.node?.disconnect(); A.mute?.disconnect(); } catch { /* already gone */ }
  try { A.stream?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
  try { A.ctx?.close(); } catch { /* ignore */ }
  A.stream = A.ctx = A.src = A.node = A.mute = null;
}

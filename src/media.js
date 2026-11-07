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

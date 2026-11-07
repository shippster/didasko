/* ================= Basic view =================
   A very simple start: record, add a transcript, or upload a video/audio file → then make notes or a quiz.
   "Advanced mode" is the full app; each view links to the other. The choice is remembered (S.settings.uiMode). */
const BASIC = { step: 'start', roller: null, timer: null, editing: false, adding: false };
const isBasic = () => S.settings.uiMode !== 'advanced';

function enterBasic(save = true) {
  if (save) { S.settings.uiMode = 'basic'; saveSettings(); }
  S.ui.fromBasic = false; document.body.classList.remove('from-basic');
  $('#app').hidden = true; $('#basic').hidden = false; document.body.classList.add('basic-mode');
  basicGo(S.rec.running ? 'record' : 'start');
}
function enterAdvanced(view, save = true) {
  closeBasicEditor();
  if (save) { S.settings.uiMode = 'advanced'; saveSettings(); }
  S.ui.fromBasic = !save; document.body.classList.toggle('from-basic', S.ui.fromBasic);
  $('#basic').hidden = true; $('#app').hidden = false; document.body.classList.remove('basic-mode');
  clearInterval(BASIC.timer);
  renderAll(); renderModeSwitch();
  showView(view || 'home');
}
function renderModeSwitch() {
  const b = $('#btn-basic'); if (!b) return;
  b.innerHTML = S.ui.fromBasic ? `<span aria-hidden="true">←</span> Back to basic view` : 'Basic view';
  b.title = 'Switch to the simple start screen';
}

function basicGo(step) {
  BASIC.step = step; closeBasicEditor();
  clearInterval(BASIC.timer);
  const box = $('#basic-main');
  const L = S.lecture, hasContent = !L.sample && (speechSegs(L).length || L.notes || L.quiz);
  const replaceNote = libraryLocked() && hasContent
    ? `<p class="b-note">Starting something new replaces “${esc(L.title)}” on this device. ${cloudConfigured() ? '<button class="linklike" data-signin>Sign in</button> to keep every lecture.' : ''}</p>` : '';
  const canRecord = SR && !IS_ARTIFACT;
  if (step === 'start' || step === 'next') BASIC.adding = false;
  const add = BASIC.adding, addTo = add ? ` to “${esc(L.title)}”` : '';
  if (step === 'start') {
    const resume = !L.sample && speechSegs(L).length;
    box.innerHTML = `
      <h1 class="b-h1">What would you like to do?</h1>
      <div class="b-choices">
        <button class="b-choice" id="b-rec" ${canRecord ? '' : 'aria-disabled="true"'}><span class="b-ico rec">${icon('mic')}</span><span><b>Start recording</b><small>${canRecord ? 'Live captions as you teach' : 'Needs Chrome, Edge or Safari'}</small></span></button>
        <button class="b-choice" id="b-tr"><span class="b-ico">${icon('notes')}</span><span><b>Add a transcript</b><small>A file, pasted text or a YouTube link</small></span></button>
        <button class="b-choice" id="b-media"><span class="b-ico">${icon('upload')}</span><span><b>Upload video or audio</b><small>We’ll turn it into a transcript</small></span></button>
      </div>
      ${replaceNote}
      ${resume ? `<button class="b-resume" id="b-resume">Continue with “${esc(L.title)}” <span aria-hidden="true">→</span></button>` : ''}`;
    $('#b-rec').onclick = () => canRecord ? basicStartRecording() : toast('Live recording works in Chrome, Edge or Safari. You can still add a transcript or upload a recording.', 5000);
    $('#b-tr').onclick = () => basicGo('transcript');
    $('#b-media').onclick = basicPickMedia;
    if ($('#b-resume')) $('#b-resume').onclick = () => basicGo('next');
  } else if (step === 'record') {
    box.innerHTML = `
      <div class="b-rec-head"><span class="b-live ${S.rec.running ? 'on' : ''}" id="b-live">${S.rec.running ? '● Recording' : 'Paused'}</span><span class="b-clock mono" id="b-clock">0:00</span></div>
      <div class="b-stage"><div class="b-cap" id="b-cap"></div><p class="b-cap-empty" id="b-cap-empty">Start speaking — your words appear here.</p></div>
      <div class="b-rec-ctl">
        <button class="btn b-big" id="b-pause">${icon(S.rec.running ? 'pause' : 'mic')}<span>${S.rec.running ? 'Pause' : 'Resume'}</span></button>
        <button class="btn primary b-big b-stop" id="b-stop">${icon('stop')}<span>Stop</span></button>
      </div>`;
    BASIC.roller = new CapRoller($('#b-cap'));
    $('#b-pause').onclick = () => { toggleCaptions(); basicRecState(); };
    $('#b-stop').onclick = basicStopRecording;
    basicRecState(); drawBasicCaptions(false);
    BASIC.timer = setInterval(() => { const c = $('#b-clock'); if (c) c.textContent = fmtClock(elapsed()); }, 500);
  } else if (step === 'transcript') {
    box.innerHTML = `
      <button class="b-back" id="b-back"><span aria-hidden="true">←</span> Back</button>
      <h1 class="b-h1">Add a transcript${addTo}</h1>
      ${add ? '<p class="b-sub">It’s added after what’s already there, so the notes and quiz cover everything.</p>' : ''}
      <label class="b-drop" id="b-drop" tabindex="0">
        <input type="file" id="b-file" accept=".txt,.vtt,.srt,.md,.docx,.pdf,audio/*,video/*,.mp3,.m4a,.wav,.mp4,.mov,.webm" hidden>
        <span class="b-ico">${icon('upload')}</span>
        <b>Drop a file here or tap to choose</b>
        <small>Transcript files: .txt, .vtt, .srt, .docx or .pdf</small>
      </label>
      <div class="b-or"><span>or</span></div>
      <label class="field"><span>Paste a YouTube link</span><div class="row b-link"><input id="b-url" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" autocomplete="off"><button class="btn primary" id="b-url-go">Add</button></div></label>
      <details class="b-paste"><summary>Paste transcript text instead</summary>
        <textarea id="b-text" placeholder="Paste a transcript…"></textarea>
        <button class="btn primary" id="b-text-go">Add text</button>
      </details>
      ${add ? '' : replaceNote}`;
    $('#b-back').onclick = () => basicGo(add ? 'next' : 'start');
    const drop = $('#b-drop');
    $('#b-file').onchange = e => { const f = e.target.files[0]; if (f) basicAddFile(f); };
    drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#b-file').click(); } };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) basicAddFile(f); };
    const goUrl = () => basicAddLink($('#b-url').value.trim());
    $('#b-url-go').onclick = goUrl; $('#b-url').onkeydown = e => { if (e.key === 'Enter') goUrl(); };
    $('#b-text-go').onclick = () => basicAddText($('#b-text').value, 'Pasted transcript');
  } else if (step === 'working') {
    box.innerHTML = `<div class="b-working"><span class="spinner"></span><h1 class="b-h1" id="b-work-title">Working on it…</h1><p class="b-sub" id="b-work-text">This can take a minute or two for long recordings.</p><button class="btn ghost" id="b-cancel">Cancel</button></div>`;
    $('#b-cancel').onclick = () => { MEDIA.ctl?.abort(); basicGo(add ? 'next' : 'start'); };
  } else if (step === 'next') {
    const n = speechSegs(L).length, words = speechWords(L);
    box.innerHTML = `
      <span class="b-done">${icon('spark')} Transcript ready</span>
      <h1 class="b-h1">Next step</h1>
      <p class="b-sub"><b>${esc(L.title)}</b> · ${words.toLocaleString()} words${L.ms ? ` · ${fmtClock(L.ms)}` : ''}</p>
      <div class="b-choices two">
        <button class="b-choice big" id="b-quiz"><span class="b-ico">${icon('quiz')}</span><span><b>Create quiz</b><small>Multiple-choice questions from this lecture</small></span></button>
        <button class="b-choice big" id="b-notes"><span class="b-ico">${icon('notes')}</span><span><b>Create notes</b><small>Organized, well-formatted lecture notes</small></span></button>
      </div>
      <div class="b-more">
        <span class="b-more-h">Add more to this lecture</span>
        <div class="b-more-row">
          <button class="b-mini" id="b-more-rec" ${canRecord ? '' : 'aria-disabled="true"'}>${icon('mic')}<span>Record more</span></button>
          <button class="b-mini" id="b-more-tr">${icon('notes')}<span>Add a transcript</span></button>
          <button class="b-mini" id="b-more-media">${icon('upload')}<span>Upload video or audio</span></button>
        </div>
      </div>
      <div class="b-links"><button class="linklike" id="b-edit">${icon('edit')}Review or fix the transcript</button><button class="linklike" id="b-new">Start something new</button></div>
      <div id="b-editor" hidden></div>`;
    if (!n) { $('#b-quiz').disabled = $('#b-notes').disabled = true; }
    $('#b-quiz').onclick = () => { saveBasicEditor(); enterAdvanced('quiz', false); generateQuiz(); };
    $('#b-notes').onclick = () => { saveBasicEditor(); enterAdvanced('notes', false); S.ui.notesTab = 'notes'; renderNotesArea(); generateNotes(); };
    $('#b-edit').onclick = toggleBasicEditor;
    $('#b-new').onclick = () => basicGo('start');
    $('#b-more-rec').onclick = () => { saveBasicEditor(); canRecord ? basicRecordMore() : toast('Live recording works in Chrome, Edge or Safari.', 5000); };
    $('#b-more-tr').onclick = () => { saveBasicEditor(); BASIC.adding = true; basicGo('transcript'); };
    $('#b-more-media').onclick = () => { saveBasicEditor(); basicPickMedia(true); };
  }
  $$('[data-signin]', box).forEach(b => b.onclick = () => openAccountSheet());
  window.scrollTo({ top: 0 });
}

/* ---- New lecture for each Basic flow (same rules as the New lecture sheet) ---- */
async function basicNewLecture(title, fromOthers) {
  const L = S.lecture, locked = libraryLocked();
  if (S.rec.running) pauseCaptions(true);
  await saveNow();
  const n = newLecture(title);
  n.lecturer = fromOthers ? '' : myName(); n.institution = S.settings.institution || (L.sample ? '' : L.institution) || '';
  n.author = ''; n.course = L.sample ? '' : (L.course || ''); n.subject = L.sample ? '' : (L.subject || '');
  if (locked && L.id !== n.id) await deleteLecture(L.id);
  await switchLecture(n);
}

/* ---- Recording ---- */
async function basicStartRecording() {
  await basicNewLecture();
  basicGo('record');
  toggleCaptions(); basicRecState();
}
/* Keep recording into the same lecture: the new lines follow the earlier ones. */
function basicRecordMore() {
  BASIC.adding = true;
  basicGo('record');
  if (!S.rec.running) toggleCaptions();
  basicRecState();
}
function basicRecState() {
  const run = S.rec.running, b = $('#b-pause'), l = $('#b-live'); if (!b) return;
  b.innerHTML = `${icon(run ? 'pause' : 'mic')}<span>${run ? 'Pause' : 'Resume'}</span>`;
  l.textContent = run ? '● Recording' : 'Paused'; l.classList.toggle('on', run);
}
function drawBasicCaptions(animate) {
  if (BASIC.step !== 'record' || !BASIC.roller || $('#basic').hidden) return;
  BASIC.roller.update(capUnits(null), S.rec.interim, animate);
  const e = $('#b-cap-empty'); if (e) e.hidden = !!(speechSegs(S.lecture).length || S.rec.interim);
  basicRecState();
}
function basicStopRecording() {
  if (S.rec.running) pauseCaptions(true);
  if (!speechSegs(S.lecture).length) { toast('Nothing was captured yet. Check that the microphone is allowed, then try again.', 5000); basicGo('start'); return; }
  basicGo('next');
}

/* ---- Video or audio file ---- */
function basicPickMedia(adding) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,video/*,.mp3,.m4a,.wav,.ogg,.webm,.flac,.mp4,.mov';
  inp.onchange = () => { const f = inp.files[0]; if (f) { BASIC.adding = !!adding; basicTranscribeMedia(f); } };
  inp.click();
}
async function basicTranscribeMedia(file) {
  if (!transcriber()) { toast(NEEDS_TRANSCRIBER, 7000); return; }
  const add = BASIC.adding;
  if (!add) await basicNewLecture(file.name.replace(/\.[^.]+$/, ''));
  basicGo('working'); $('#b-work-title').textContent = `Transcribing ${file.name.length > 40 ? file.name.slice(0, 37) + '…' : file.name}`;
  const ok = await transcribeFile(file, S.lecture, true);
  if (BASIC.step !== 'working') return; // cancelled
  basicGo(ok || add ? 'next' : 'start');
}

/* ---- Transcript: file, link or pasted text ---- */
const isTranscriptFile = f => /\.(txt|vtt|srt|md|docx|pdf|html?)$/i.test(f.name);
async function basicAddFile(file) {
  if (isMediaFile(file)) { basicTranscribeMedia(file); return; }
  if (!isTranscriptFile(file)) { toast('Choose a transcript file (.txt, .vtt, .srt, .docx or .pdf), or a video or audio file.', 5000); return; }
  let text = '';
  try {
    if (/\.(txt|vtt|srt|md)$/i.test(file.name)) text = await file.text();
    else text = (await extractFile(file)).text || '';
  } catch (e) { toast(`Couldn’t read ${file.name}: ${e.message || e}`, 5000); return; }
  basicAddText(text, file.name.replace(/\.[^.]+$/, ''));
}
async function basicAddText(text, title) {
  const rows = parseTimed(text || '');
  if (!rows.length) { toast('That file or text doesn’t contain a transcript.'); return; }
  const add = BASIC.adding && speechSegs(S.lecture).length;
  if (!BASIC.adding) await basicNewLecture(title, true);
  const base = add ? elapsed() + 2000 : 0;
  rows.forEach(r => addSpeech(r.text, base + r.t));
  S.lecture.ms = Math.max(S.lecture.ms || 0, base + rows[rows.length - 1].t + 4000);
  saveSoon(); renderAll();
  if (add) toast(`Added ${rows.length} line${rows.length > 1 ? 's' : ''} to the transcript.`);
  basicGo('next');
}
async function basicAddLink(url) {
  if (!url) { toast('Paste a link first.'); return; }
  if (!youTubeId(url)) { toast('Paste a YouTube link. For other sites, download the transcript and add the file.', 5000); return; }
  if (!aiReady() || prov().kind !== 'gemini') { toast(NEEDS_GEMINI_VIDEO, 8000); return; }
  const add = BASIC.adding;
  if (!add) await basicNewLecture(undefined, true);
  basicGo('working'); $('#b-work-title').textContent = 'Transcribing the video';
  const ok = await transcribeYouTube(url, S.lecture, true);
  if (BASIC.step !== 'working') return;
  if (!ok && add) BASIC.adding = true;
  basicGo(ok ? 'next' : 'transcript');
}
function basicStatus(text) {
  const t = $('#b-work-text'); if (t && text) t.textContent = text;
}

/* ---- Inline transcript review (same text-block editor as Advanced mode) ---- */
function toggleBasicEditor() {
  const ed = $('#b-editor'); if (!ed) return;
  if (!ed.hidden) { saveBasicEditor(); closeBasicEditor(); return; }
  const adv = $('#transcript'); if (adv) adv.innerHTML = ''; // only one editor in the page at a time
  ed.hidden = false; BASIC.editing = true;
  ed.innerHTML = '<p class="b-sub small">Fix misheard words or delete anything you don’t want in the notes and quiz. Changes save as you type.</p><div class="panel transcript as-block" id="b-tr-box"></div>';
  renderTranscriptBlock($('#b-tr-box'));
  $('#b-edit').innerHTML = `${icon('edit')}Done reviewing`;
  $('#tr-block')?.focus();
}
function saveBasicEditor() { if (BASIC.editing) saveTranscriptBlock(); }
function closeBasicEditor() {
  const ed = $('#b-editor'); if (ed) { ed.innerHTML = ''; ed.hidden = true; }
  const e = $('#b-edit'); if (e) e.innerHTML = `${icon('edit')}Review or fix the transcript`;
  BASIC.editing = false;
}

function bindBasic() {
  $('#b-adv').onclick = () => enterAdvanced('home');
  $('#b-adv-foot').onclick = () => enterAdvanced('home');
  $('#b-home').onclick = () => { if (BASIC.step !== 'record' && BASIC.step !== 'working') basicGo('start'); };
  $('#btn-basic').onclick = () => enterBasic();
  $('#home-basic').onclick = () => enterBasic();
  renderModeSwitch();
}

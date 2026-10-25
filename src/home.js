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
        n.course = $('#nl-course', sh).value.trim(); n.lecturer = mode === 'video' || mode === 'paper' ? '' : (S.settings.lecturer || (L.sample ? '' : L.lecturer) || ''); n.institution = S.settings.institution || (L.sample ? '' : L.institution) || ''; n.author = L.sample ? '' : (L.author || '');
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

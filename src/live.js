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

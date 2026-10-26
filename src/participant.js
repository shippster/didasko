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
    const asked = Object.keys(P.reveals || {}).length, n = asked || q.total || 0; let correct = 0;
    for (let i = 0; i < (q.total || n); i++) if (P.reveals[i] && P.myAnswers[i] === P.reveals[i].answer) correct++;
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

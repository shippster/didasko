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

/* ================= Subject and state standards (per lecture, optional) =================
   L.subject: '' | math | science | ela | social | other — "math" turns on step-by-step worked solutions in the notes.
   L.standards: { state, grade, text } — one standard per line; when present the quiz is aligned to them. */
const SUBJECTS = [['', 'General / not set'], ['math', 'Mathematics'], ['science', 'Science'], ['ela', 'English language arts'], ['social', 'Social studies / history'], ['other', 'Other subject']];
const US_STATES = 'Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada New_Hampshire New_Jersey New_Mexico New_York North_Carolina North_Dakota Ohio Oklahoma Oregon Pennsylvania Rhode_Island South_Carolina South_Dakota Tennessee Texas Utah Vermont Virginia Washington West_Virginia Wisconsin Wyoming'.split(' ').map(s => s.replace(/_/g, ' '));
const STD_SETS = ['Common Core State Standards', 'Next Generation Science Standards (NGSS)', 'C3 Framework (social studies)', 'District or school standards'];
const subjectOf = L => (L && L.subject) || '';
const isMath = L => subjectOf(L) === 'math';
const subjectOptions = v => SUBJECTS.map(([k, l]) => `<option value="${k}" ${k === (v || '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
function setSubject(v) {
  const L = S.lecture; L.subject = v || ''; saveSoon();
  $$('[data-subject-select]').forEach(el => { if (el.value !== L.subject) el.value = L.subject; });
  renderNotesStyleUi(); renderStandards();
}
/* Parse "CODE — description" lines; a line without a separator is kept whole as the description. */
function standardsList(L) {
  const t = (L.standards && L.standards.text) || '';
  return t.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 25).map(line => {
    const m = line.match(/^([A-Za-z0-9][\w.\-–:/()]{0,40}?)\s*(?:—|–|-|:)\s+(.+)$/);
    return m && /\d|[A-Z]{2,}/.test(m[1]) ? { code: m[1].replace(/[:\s]+$/, ''), text: m[2].trim() } : { code: '', text: line };
  });
}
const stdLabel = s => s.code || (s.text.length > 40 ? s.text.slice(0, 38) + '…' : s.text);
function standardsForPrompt(L) {
  const list = standardsList(L); if (!list.length) return '';
  const st = L.standards || {};
  return `\n- Align the quiz to these ${[st.state, st.grade].filter(Boolean).join(', ') || ''} learning standards chosen by the teacher. Every question must assess one of them (spread the questions across all of them where the lecture supports it), and set "standard" to that standard's code exactly as written (or its short description when it has no code). Only assess what the lecture or materials actually taught toward each standard; if a standard was not covered, skip it rather than inventing content.
Standards:
${list.map(s => `  • ${s.code ? s.code + ' — ' : ''}${s.text}`).join('\n')}`;
}
function renderStandards() {
  const box = $('#quiz-std'); if (!box || !S.lecture) return;
  const L = S.lecture, st = L.standards || {}, list = standardsList(L);
  const open = box.querySelector('details')?.open ?? !!list.length;
  const opts = `<option value="">Choose…</option><optgroup label="Standard sets">${STD_SETS.map(s => `<option ${s === st.state ? 'selected' : ''}>${esc(s)}</option>`).join('')}</optgroup><optgroup label="States">${[...US_STATES, 'District of Columbia'].map(s => `<option ${s === st.state ? 'selected' : ''}>${esc(s)}</option>`).join('')}</optgroup>`;
  box.innerHTML = `<details ${open ? 'open' : ''}><summary><span class="eyebrow">State standards (optional)</span>${list.length ? `<span class="chip ok">${list.length} standard${list.length > 1 ? 's' : ''} · questions aligned</span>` : '<span class="small muted">Align questions to the standards you teach</span>'}</summary>
    <div class="grid-2 stack-sm" style="margin-top:10px">
      <label class="field"><span>State or standard set</span><select id="std-state">${opts}</select></label>
      <label class="field"><span>Grade or course level</span><input id="std-grade" value="${esc(st.grade || '')}" placeholder="e.g. Grade 7 · Algebra I" autocomplete="off"></label>
      <label class="field"><span>Subject</span><select id="std-subject" data-subject-select>${subjectOptions(L.subject)}</select></label>
    </div>
    <label class="field"><span>Standards — one per line, code then description</span><textarea id="std-text" rows="4" placeholder="7.EE.B.4 — Use variables to represent quantities and construct simple equations to solve problems&#10;MS-LS1-6 — Construct a scientific explanation for the role of photosynthesis">${esc(st.text || '')}</textarea></label>
    <div class="row"><button class="btn sm" id="std-suggest">${icon('spark')}Suggest from this lecture</button><span class="small muted" id="std-out">Each generated question is tagged with the standard it assesses. Paste standards from your state’s official site for exact wording.</span></div>
  </details>`;
  const save = () => { L.standards = { state: $('#std-state', box).value, grade: $('#std-grade', box).value.trim(), text: $('#std-text', box).value }; saveSoon(); const c = box.querySelector('summary'); const n = standardsList(L).length; c.lastElementChild.outerHTML = n ? `<span class="chip ok">${n} standard${n > 1 ? 's' : ''} · questions aligned</span>` : '<span class="small muted">Align questions to the standards you teach</span>'; };
  $('#std-state', box).onchange = save; $('#std-grade', box).oninput = save; $('#std-text', box).oninput = save;
  $('#std-subject', box).onchange = e => setSubject(e.target.value);
  $('#std-suggest', box).onclick = suggestStandards;
}
async function suggestStandards() {
  const L = S.lecture, box = $('#quiz-std'), out = $('#std-out', box), st = L.standards || {};
  if (!st.state) { out.textContent = 'Choose a state or standard set first.'; $('#std-state', box).focus(); return; }
  if (!speechSegs(L).length && !L.files.some(f => f.text)) { out.textContent = 'Record or add some lecture content first.'; return; }
  if (!aiReady()) { openAiSetupSheet('Suggesting standards uses an AI model.', suggestStandards); return; }
  const btn = $('#std-suggest', box); btn.disabled = true; out.textContent = 'Reading the lecture…';
  try {
    const mat = materials('useQuiz');
    const text = await callAI({
      json: true, maxTokens: 1500,
      system: `You are a curriculum specialist in ${st.state}. From a lecture, you identify the official learning standards it addresses. Use ${st.state}${/standards|NGSS|Framework/i.test(st.state) ? '' : '’s currently adopted K-12 standards'} for ${SUBJECTS.find(s => s[0] === subjectOf(L))?.[1] || 'the lecture’s subject'}${st.grade ? `, ${st.grade}` : ''}. Give 2 to 6 standards the lecture clearly teaches toward, most relevant first, with the official code and a short description. Only list standards you are confident exist with that code; if unsure of a code, leave "code" empty. Reply with JSON only: {"standards":[{"code":"","text":""}]}`,
      user: `${lectureHeader(L)}\n\n<transcript>\n${transcriptForPrompt(L).slice(0, 30000)}\n</transcript>${mat.text ? `\n\n<materials>\n${mat.text.slice(0, 12000)}\n</materials>` : ''}`
    });
    const list = (parseJson(text).standards || []).filter(s => s && s.text).slice(0, 6);
    if (!list.length) throw new Error('No matching standards were found. Add them yourself.');
    const add = list.map(s => `${s.code ? String(s.code).trim() + ' — ' : ''}${String(s.text).trim()}`).join('\n');
    L.standards = { ...st, text: [(st.text || '').trim(), add].filter(Boolean).join('\n') };
    saveSoon(); renderStandards();
    $('#std-out', $('#quiz-std')).textContent = 'Suggestions added. Check each code against your state’s official list before using them.';
  } catch (e) { out.textContent = e.message === 'NO_AI' ? 'Connect an AI model first.' : e.message; btn.disabled = false; }
}

/* Worked solutions for mathematics lectures. Equations go on their own "$$ … $$" lines so every format can display them. */
const MATH_RULES = `
This is a MATHEMATICS lecture. Whenever the transcript or materials work through a problem, present it as a worked example the reader can follow step by step:
- Start with a line "**Worked example: <short description>**", then state the problem exactly as given.
- Then numbered steps, each as its own paragraph starting "**Step N.**" with a short reason in words (for example "Subtract 3 from both sides."), followed on the next line by the resulting equation on its own line written between double dollar signs, e.g. "$$2x = 8$$".
- Write math in simple LaTeX inside the $$ … $$ lines only (\\frac{a}{b}, x^{2}, \\sqrt{x}, \\times, \\div, \\le, \\ge, \\neq, \\pi). In ordinary sentences write math as plain text (x², 3/4), never with single dollar signs.
- End with "**Solution.**" and the answer, and "**Check.**" only if the lecturer checked it.
- Show every algebraic step the lecturer performed, and make an implied step explicit only when it is pure arithmetic or algebra on the lecturer's own problem. Use only the problems, methods and numbers that appear in the transcript or materials — never invent new practice problems or alternative methods.`;
const MATH_QUIZ = '\n- This is a mathematics lecture: include questions that ask students to choose the correct next step, find the error in a worked solution, or pick the right method — using the lecture\'s own problem types. Write math in plain text (x², √x, 3/4).';

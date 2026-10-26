/* ================= Notes output formats =================
   APA journal article (narrative) · MLA journal article · outline overview · children's picture book · anything else the teacher describes.
   Every format is written from the same transcript + materials; only the prompt, the renderer and the exports differ. */
const STYLE_ALIAS = { study: 'apa', cornell: 'apa', handout: 'apa' };
const STYLES = ['apa', 'mla', 'outline', 'kids', 'other'];
const styleKey = s => STYLE_ALIAS[s] || (STYLES.includes(s) ? s : 'apa');
const STYLE_LABEL = { apa: 'APA journal article', mla: 'MLA journal article', outline: 'Outline overview', kids: 'Children’s picture book', other: 'Custom output' };
function styleHint(k) {
  if (k === 'apa') return `A research-journal article: the lecture’s own content reorganized by theme (not in speaking order) into clean prose, with abstract, keywords, numbered sections, APA 7 citations and References. Nothing is added beyond the transcript and your files.${isMath(S.lecture) ? ' Math: worked problems are shown step by step.' : ''}`;
  if (k === 'mla') return `The same research-journal article, with MLA 9 (Author) citations and a Works Cited list. Nothing is added beyond the transcript and your files.${isMath(S.lecture) ? ' Math: worked problems are shown step by step.' : ''}`;
  if (k === 'outline') return `A quick bulleted overview — main ideas, supporting details and key terms — that’s easy to skim before a test.${isMath(S.lecture) ? ' Math: worked problems are shown step by step.' : ''}`;
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
  const ns = $('#notes-subject'); if (ns) { if (!ns.options.length) ns.innerHTML = subjectOptions(''); ns.value = subjectOf(L); }
  renderNotesStyleUi(); renderStandards();
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
const CLEANUP = 'The transcript comes from speech recognition: it may lack punctuation and contain misheard words, filler words, false starts and digressions. Clean these up silently. When a misheard word is obvious from context or from the materials, use the correct word.';
/* Notes must stay faithful: organize and clarify the sources, never extend them. */
const FIDELITY = `FIDELITY — the most important rule. Your job is to organize and clearly present what the sources contain, not to add to it.
- Every statement must come from the transcript or the materials. Do not add facts, definitions, examples, analogies, statistics, background, history, research, implications, applications, opinions or conclusions that the sources do not state — even if they are true and would help.
- Do not expand, expound on or "unpack" an idea beyond what the speaker or the materials said. If the lecturer mentioned something briefly, present it briefly. Define a term only if the sources define it, and use their definition.
- You may: reorder and group content by theme; merge repeated points; rewrite speech into clear, complete, grammatical sentences; add headings and short transitions that only signpost what comes next; and summarize. Transitions must not introduce new claims.
- Keep the speaker's meaning, emphasis and level of certainty. Never resolve an ambiguity by guessing; leave out what you cannot understand.
- If the sources are short, the output is short. Never pad to reach a length.`;
function journalPlanSystem({ aud, lang }) {
  return `You are the senior editor of an academic journal. You are planning an article that turns a lecture (its transcript and any course materials) into a well-organized journal article for ${AUDIENCE[aud]}, written in ${lang}.
${CLEANUP}
The source may be a lecture, a talk, an interview or a panel discussion; when more than one person speaks, keep track of who said what and attribute ideas to the right speaker.
Read the ENTIRE transcript and all materials before planning. Lectures wander: the speaker returns to ideas, gives examples out of order and mixes background with detail. Do NOT follow the order in which things were said. Instead:
- Work out the lecture's central question and its main argument (thesis).
- Group everything that belongs together, wherever in the transcript it was said, into 3 to 6 major themes.
- Order the themes for a reader: background and key definitions first, then the core concepts, mechanisms or frameworks, then applications and examples, then implications, challenges or debates.
- Within each theme plan as many subsections as the content needs (often 1 to 4). For each, list only the points the sources actually make, the definitions the sources give, the lecturer's own examples, evidence or data, any material (F1, F2 …) that supports it, and the transcript timestamps it draws on.
- Under "discussion", list only connections, tensions, limitations or open questions that the lecturer or the materials themselves raised; leave it empty if there are none. Do not add your own.
- Every line marked ★KEY POINT must be placed somewhere in the plan.
- Plan nothing that is not in the sources.
${FIDELITY}
Reply with JSON only:
{"title":"","subtitle":"","thesis":"","keywords":[""],"introduction":{"context":"","problem":"","purpose":""},"sections":[{"heading":"","purpose":"","subsections":[{"heading":"","points":[""],"define":[""],"examples":[""],"materials":["F1"],"timestamps":["12:40"]}]}],"discussion":[""],"conclusion":[""]}`;
}
function journalSystem({ aud, lang, sources, mla, target }) {
  const cite = mla
    ? `Citations (MLA 9 in-text): cite the sources below using exactly the forms given, placed before the sentence's final punctuation, e.g. "…from water (Rivera)." For a direct quotation from the lecture add the timestamp, e.g. (Rivera 00:12:40). Do not use page numbers unless the material shows them. Do not write a Works Cited list — it is added automatically.`
    : `Citations (APA 7 in-text): cite the sources below using exactly the in-text forms given, as parenthetical citations at the end of the sentence they support or as narrative citations ("Rivera (2026) argued that…"). For a direct quotation add the timestamp. Do not write a References section — it is added automatically.`;
  return `You are an expert academic editor. You turn a lecture into a well-organized article in the format of a research-journal paper, following the editor's plan you are given. It organizes the lecture's ideas thematically instead of in speaking order, and it presents them in clear academic prose — but it contains only what the lecture and its materials say.
${CLEANUP}
${FIDELITY}
Write for ${AUDIENCE[aud]}, in ${lang}, in a formal, precise academic register: third person; ${mla ? 'present tense when discussing what the lecture argues ("Rivera explains that…")' : 'past tense for what the lecturer said ("Rivera explained that…")'} and present tense for established facts.

How to write it:
- Follow the plan's structure and order, not the order of the transcript. If the source is an interview or discussion, write about the ideas and attribute them to the person who expressed them; do not narrate the conversation.
- Never copy transcript fragments verbatim; rewrite speech into clear, complete sentences. Quote directly only for a short, memorable phrase.
- Present each idea completely and in the lecturer's own terms: include the explanation, examples and evidence the lecturer gave and what the materials say about it — and nothing more. Write connected paragraphs rather than lists of what the lecturer said.
- A major section may open with one sentence saying what it covers. Paragraphs have clear topic sentences; use as many as the content needs and no more.
- Write in connected prose. Use a numbered list only where the lecture itself set out a defined set of items (for example stages, factors or criteria); introduce it with a full sentence, give each item a short explanation, and use at most two such lists in the whole article. Use a table only if it genuinely clarifies a comparison; put "**Table N**" on its own line and the table title in italic title case on the next line.
- Bold a key term only the first time it is defined. No bold run-in labels, no Q&A, no "Key Terms" or "Review Questions" sections.
- Length follows the sources: present all of their content once, clearly. As a guide, ${target || 'keep it concise'}. Shorter is fine; never lengthen by elaboration.

Output GitHub-flavored Markdown in exactly this order:
1. "# Title: Subtitle" — a concise, informative ${mla ? 'MLA title-case' : 'APA title-case'} title with a subtitle after a colon.
2. "## Abstract" — one paragraph of 100–200 words summarizing the topic and the main themes as the lecture presented them.
3. A line "*Keywords:* " with 4–6 keywords or short phrases separated by commas.
4. "## Introduction" — one or two paragraphs: the topic, the context and purpose as the lecturer stated them, and a final roadmap sentence naming the sections that follow. Add no outside background.
5. One "##" section per theme in the plan, each with "###" subsections. Do not number headings — the app numbers them.
6. "## Discussion" — ONLY if the lecture or materials themselves drew connections between the themes or raised implications, limitations or open questions: present those. Otherwise leave this section out entirely.
7. "## Conclusion" — one short paragraph restating the lecture's main points and noting what comes next only if the lecture says so.

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
3. "## Big Picture" — two or three bullets on the lecture's main message, as the lecturer framed it.
4. One "##" heading per major topic in lecture order. Under each, nested "-" bullets: main idea → supporting details → examples, at most three levels deep. Short phrases, not paragraphs. Bold each key term the first time it appears.
5. "## Key Terms" — bullets in the form "**Term** — meaning", using only meanings the sources give (leave out terms the sources don't explain).
6. "## Takeaways" — three to five bullets restating the lecture's most important points.
Do not add anything the transcript or materials don't say.
No citations, no introduction or conclusion paragraphs, nothing after the Takeaways.`;
}
function customSystem({ aud, lang, custom, sources }) {
  return `You turn a lecture transcript (and any lecture materials) into exactly the output a teacher asks for.
The teacher's request: «${custom}»
Rules:
- Produce that output and nothing else: no preface, no notes about what you did.
- Write in ${lang}, for ${AUDIENCE[aud]} unless the request says otherwise.
- The transcript comes from speech recognition: fix obvious recognition errors silently.
- Use only content from the transcript and materials. Organize and rephrase it as the format needs, but do not extend, elaborate on or add to it unless the teacher's request explicitly asks for that.
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
    const what = { apa: 'An APA journal article', mla: 'An MLA journal article', kids: 'A picture book', other: 'A custom output', outline: 'A well-organized outline' }[style];
    const rough = () => { const src = live ? L : materialsAsLecture(L); L.notes = { md: buildLocalOutline(src, live && useFiles), style: 'outline', local: true, at: Date.now() }; $('#notes-style').value = 'outline'; renderNotesStyleUi(); saveSoon(); S.ui.notesEdit = false; renderNotes(); toast('Rough outline made on this device'); };
    openAiSetupSheet(`${what} is written by an AI model, which reorganizes the lecture by theme and writes it up properly. No AI model is connected on this device yet.`, () => generateNotes(), { label: 'Make a rough outline without AI', run: rough });
    return;
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
  const srcWords = (live ? speechWords(L) : 0) + Math.round((mat.text || '').split(/\s+/).length * 0.5);
  const tw = Math.max(250, Math.min(4500, Math.round(srcWords * 0.6 / 50) * 50));
  const target = `about ${tw.toLocaleString()} words or fewer (the sources contain about ${srcWords.toLocaleString()} words of usable content)`;
  const opts = { aud, lang, sources, custom, target };
  const system = { apa: apaSystem, mla: mlaSystem, outline: outlineSystem, other: customSystem, kids: kidsSystem }[style](opts)
    + (isMath(L) && style !== 'kids' ? '\n' + MATH_RULES + (style === 'outline' ? '\nIn the outline, put each worked example under its topic: the "**Worked example**" line as a bullet, then the steps and $$ … $$ equation lines unindented below it.' : '') : '')
    + (live ? (L.source?.kind ? `\nThe transcript comes from a ${L.source.kind === 'video' ? 'video' : 'recording'}${L.source.title ? ` titled “${L.source.title}”` : ''}, transcribed automatically.` : '')
      : '\nIMPORTANT: there is no lecture transcript for this session. Build the whole output from the materials alone. Do not mention or cite a lecture or lecturer; where the instructions above say to cite the lecture, cite the materials instead. In the abstract and introduction, describe the material’s topic rather than a lecture.');
  const user = `${lectureHeader(L)}\nLecturer: ${lecturerOf(L) || '(not given)'}\n\n<transcript>\n${live ? transcriptForPrompt(L) : '(none — use the materials only)'}\n</transcript>${mat.text ? `\n\n<materials>\n${files.map((f, i) => `F${i + 1} = ${f.name}`).join('\n')}\n${mat.text}\n</materials>` : ''}${mat.images.length ? `\n\nAttached images: ${mat.images.map(i => i.name).join(', ')} (photos or slides from the lecture).` : ''}`;
  if (style === 'kids') return generateKidsBook(L, { system, user, images: mat.images, lang });
  const prev = L.notes;
  let latest = '', userMsg = user;
  if (style === 'apa' || style === 'mla') {
    setNotesBusy(true, 'Reading the whole lecture and planning the article…');
    try {
      const planText = await callAI({ system: journalPlanSystem(opts) + (isMath(L) ? '\nThis is a mathematics lecture: for every problem the lecturer worked through, record the problem and every step in order (with the equation after each step) under "examples", so the writer can show it step by step.' : ''), user, images: mat.images, maxTokens: 6000, json: true, signal: notesCtl.signal,
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
  let md = `# ${L.title}\n\n> Rough outline made on this device without AI, in the order things were said. Connect an AI model and tap Regenerate for a properly organized version.\n\n`;
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
.eq{text-align:center;margin:.5em 0 .9em;font-family:'STIX Two Text','Cambria Math','Times New Roman',serif;font-size:1.12em;line-height:1.6;overflow-x:auto}
.eq i{font-style:italic}.eq .frac{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;margin:0 .12em;font-size:.92em;line-height:1.15}
.eq .frac>span:first-child{border-bottom:1px solid currentColor;padding:0 .2em}.eq .frac>span:last-child{padding:0 .2em}
.eq .sqrt>span{border-top:1px solid currentColor;padding:0 .15em}.eq sup,.eq sub{font-size:.7em}
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

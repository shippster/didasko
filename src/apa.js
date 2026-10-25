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

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
const JOURNAL = 'Didasko Lecture Notes';
function composeApa(L) {
  const sb = splitBody(L.notes?.md || '');
  const full = sb.title || L.title;
  const [t, ...sub] = full.split(/:\s+/);
  const lecturer = lecturerOf(L), author = (L.author || S.settings.author || '').trim();
  const running = full.replace(/:.*$/, '').toUpperCase();
  return {
    fullTitle: full, title: sub.length ? t : full, subtitle: sub.join(': '),
    lecturer, author: author && author !== lecturer ? author : '',
    affiliation: (L.institution || S.settings.institution || '').trim(),
    course: (L.course || '').trim(), date: titleDate(L.createdAt), length: fmtClock(L.ms || 0),
    runningHead: running.length > 50 ? running.slice(0, 47).replace(/\s+\S*$/, '') + '…' : running,
    abstract: sb.abstract, keywords: sb.keywords || (L.notes?.keywords || []).join(', '), body: sb.body,
    cite: lectureRef(L, L.notes?.lectureTitle), refs: referenceList(L), kind: { cornell: 'Lecture Notes · Cornell Format', outline: 'Lecture Notes · Outline', handout: 'Short Communication' }[L.notes?.style] || 'Lecture Notes'
  };
}
function apaHtml(L) {
  const c = composeApa(L);
  const aff = [c.affiliation, c.course].filter(Boolean).join(', ');
  return `<article class="jr">
    <header class="jr-mast"><span class="jr-journal">${JOURNAL}</span><span>${esc([c.course, c.date].filter(Boolean).join(' · '))}</span></header>
    <div class="jr-head">
      <p class="jr-kicker">${esc(c.kind)}</p>
      <h1 class="jr-title">${inl(c.title)}${c.subtitle ? `<span class="jr-sub">${inl(c.subtitle)}</span>` : ''}</h1>
      <p class="jr-authors">${esc(c.lecturer || (hasTranscript(L) ? 'Lecturer not set' : c.author || 'Lecture notes'))}${aff ? '<sup>1</sup>' : ''}</p>
      ${aff ? `<p class="jr-affil"><sup>1</sup>${esc(aff)}</p>` : ''}
      <dl class="jr-meta"><div><dt>Lecture date</dt><dd>${esc(c.date)}</dd></div>${c.length !== '0:00' ? `<div><dt>Recorded</dt><dd>${esc(c.length)}</dd></div>` : ''}${c.author ? `<div><dt>Notes prepared by</dt><dd>${esc(c.author)}</dd></div>` : ''}</dl>
    </div>
    ${c.abstract || c.keywords ? `<section class="jr-abstract" aria-label="Abstract"><h2>Abstract</h2>${mdToHtml(c.abstract)}${c.keywords ? `<p class="jr-kw"><em>Keywords:</em> ${esc(c.keywords)}</p>` : ''}</section>` : ''}
    ${hasTranscript(L) ? `<p class="jr-cite"><b>Cite this ${isVideoSrc(L) ? 'video' : 'lecture'}:</b> ${inl(c.cite)}</p>` : ''}
    <div class="jr-body">${mdToHtml(c.body)}<section class="jr-refs"><h2>References</h2>${c.refs.map(r => `<p class="apa-ref">${inl(r)}</p>`).join('')}</section></div>
    <footer class="jr-foot"><span>${esc(c.runningHead)}</span><span>${JOURNAL}</span></footer>
  </article>`;
}
function ensureJournalCss() { if (!document.getElementById('jr-css')) { const st = document.createElement('style'); st.id = 'jr-css'; st.textContent = JOURNAL_CSS; document.head.appendChild(st); } }
function apaMarkdown(L) {
  const c = composeApa(L);
  return [`*${JOURNAL} · ${c.kind}*`, '', `# ${c.fullTitle}`, '', `**${c.lecturer}**${[c.affiliation, c.course].filter(Boolean).length ? '  \n' + [c.affiliation, c.course].filter(Boolean).join(', ') : ''}  \n${c.date}${c.author ? `  \nNotes prepared by ${c.author}` : ''}`, '',
    c.abstract ? `## Abstract\n\n${c.abstract}` : '', c.keywords ? `\n*Keywords:* ${c.keywords}` : '', '', `**Cite this lecture:** ${c.cite}`, '', '---', '', c.body, '', '## References', '', c.refs.join('\n\n')].join('\n').replace(/\n{3,}/g, '\n\n');
}
function apaStandalone(L) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(composeApa(L).fullTitle)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=Source+Sans+3:wght@400;600;700&display=swap">
<style>body{margin:0;background:#e6e8e7;padding:24px 12px}${JOURNAL_CSS}</style></head><body>${apaHtml(L)}</body></html>`;
}
/* Journal-article look: masthead, title block, boxed abstract, two-column body (wide screens and print), references in the flow. */
const JOURNAL_CSS = `
.jr{--jr-ink:#141414;--jr-mute:#5b5b5b;--jr-rule:#c9c9c9;--jr-accent:#1d6b57;--jr-box:#f2f5f4;background:#fff;color:var(--jr-ink);max-width:8.5in;margin:0 auto;padding:clamp(20px,6vw,.8in);font:15px/1.55 "Source Serif 4",Tinos,"Times New Roman",serif;box-shadow:0 1px 4px rgba(0,0,0,.12);border-radius:3px;overflow-wrap:anywhere}
.jr *{box-sizing:border-box}
.jr-mast{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font:600 11px/1.3 "Source Sans 3","Atkinson Hyperlegible",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--jr-mute);border-bottom:2px solid var(--jr-ink);padding-bottom:6px}
.jr-journal{color:var(--jr-accent)}
.jr-head{padding:22px 0 14px}
.jr-kicker{margin:0 0 8px;font:700 11px/1 "Source Sans 3",system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--jr-accent)}
.jr-title{margin:0;font:700 clamp(24px,4.4vw,34px)/1.15 "Source Serif 4",Tinos,serif;letter-spacing:-.01em;text-wrap:balance;text-align:left;border:0;padding:0;color:var(--jr-ink)}
.jr-sub{display:block;font-weight:400;font-size:.62em;line-height:1.3;margin-top:6px;color:#333}
.jr-authors{margin:14px 0 0;font:600 15px/1.4 "Source Sans 3",system-ui,sans-serif}
.jr-affil{margin:2px 0 0;font:italic 13px/1.4 "Source Serif 4",serif;color:var(--jr-mute)}
.jr sup{font-size:.7em;line-height:0}
.jr-meta{display:flex;flex-wrap:wrap;gap:4px 22px;margin:12px 0 0;font:12px/1.4 "Source Sans 3",system-ui,sans-serif;color:var(--jr-mute)}
.jr-meta div{display:flex;gap:6px}.jr-meta dt{font-weight:700}.jr-meta dd{margin:0}
.jr-abstract{background:var(--jr-box);border-top:1px solid var(--jr-ink);border-bottom:1px solid var(--jr-ink);padding:14px 18px;margin:6px 0 10px;font-size:14px}
.jr-abstract h2{margin:0 0 6px;font:700 12px/1 "Source Sans 3",system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;text-align:left;border:0;padding:0;color:var(--jr-ink)}
.jr-abstract p{margin:0 0 .5em;text-indent:0;text-align:justify;hyphens:auto}
.jr-kw{margin:6px 0 0!important}
.jr-cite{margin:0 0 18px;font:12.5px/1.45 "Source Sans 3",system-ui,sans-serif;color:var(--jr-mute);padding-left:2em;text-indent:-2em}
.jr-body{border-top:1px solid var(--jr-rule);padding-top:16px}
@media (min-width:760px){.jr-body{column-count:2;column-gap:28px;column-rule:1px solid #e3e3e3}}
.jr-body h2{font:700 14px/1.3 "Source Sans 3",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;text-align:center;margin:18px 0 8px;break-after:avoid;border:0;padding:0;color:var(--jr-ink)}
.jr-body > h2:first-child{margin-top:0}
.jr-body h3{font:700 14.5px/1.35 "Source Sans 3",system-ui,sans-serif;margin:14px 0 4px;break-after:avoid}
.jr-body h4{font:italic 700 14.5px/1.35 "Source Serif 4",serif;margin:12px 0 4px;break-after:avoid}
.jr-body h5{font:700 14.5px/1.4 "Source Serif 4",serif;margin:8px 0 2px}
.jr-body p{margin:0;text-indent:1.4em;text-align:justify;hyphens:auto}
.jr-body h2+p,.jr-body h3+p,.jr-body h4+p,.jr-body .table-wrap+p,.jr-body ul+p,.jr-body ol+p,.jr-body blockquote+p{text-indent:0}
.jr-body ul,.jr-body ol{margin:.35em 0 .5em;padding-left:1.3em}.jr-body li{margin:.15em 0}
.jr-body blockquote{margin:.6em 0;padding:.4em .8em;border-left:3px solid var(--jr-accent);background:var(--jr-box);break-inside:avoid}
.jr-body blockquote p{text-indent:0}
.jr-body p:has(> strong:only-child){text-indent:0;margin-top:.8em;font:700 12.5px/1.3 "Source Sans 3",system-ui,sans-serif}
.jr-body p:has(> em:only-child){text-indent:0;font-size:13px;margin-bottom:.3em}
.jr-body .table-wrap{overflow-x:auto;margin:.2em 0 .9em;break-inside:avoid}
.jr-body table{border-collapse:collapse;width:100%;font:12.5px/1.4 "Source Sans 3",system-ui,sans-serif}
.jr-body th{border-top:1.5px solid var(--jr-ink);border-bottom:1px solid var(--jr-ink);text-align:left;padding:5px 6px;background:none;font-weight:700}
.jr-body td{border:0;padding:5px 6px;vertical-align:top}
.jr-body tbody tr:last-child td{border-bottom:1.5px solid var(--jr-ink)}
.jr-body code{font-family:ui-monospace,monospace;font-size:.85em}
.jr-refs{margin-top:16px;padding-top:10px;border-top:1px solid var(--jr-rule);font-size:13px}
.jr-refs .apa-ref{text-indent:-1.6em!important;padding-left:1.6em;margin:0 0 .45em;text-align:left;break-inside:avoid}
.jr-foot{display:flex;justify-content:space-between;gap:12px;margin-top:22px;padding-top:8px;border-top:1px solid var(--jr-rule);font:600 10.5px/1.3 "Source Sans 3",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--jr-mute)}
.jr a{color:inherit}
@media print{.jr{box-shadow:none;max-width:none;padding:0;font-size:10pt}.jr-body{column-count:2;column-gap:.3in}}`;

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
function apaDocBlocks(L) {
  const c = composeApa(L), B = [];
  const aff = [c.affiliation, c.course].filter(Boolean).join(', ');
  B.push({ type: 'p', style: 'Masthead', runs: [{ text: JOURNAL.toUpperCase() }, { text: '\t' }, { text: [c.course, c.date].filter(Boolean).join(' · ').toUpperCase() }] });
  B.push({ type: 'p', style: 'Kicker', runs: [{ text: c.kind.toUpperCase() }] });
  B.push({ type: 'p', style: 'ArticleTitle', runs: parseInline(c.title) });
  if (c.subtitle) B.push({ type: 'p', style: 'Subtitle', runs: parseInline(c.subtitle) });
  B.push({ type: 'p', style: 'Authors', runs: [{ text: c.lecturer || 'Lecturer not set' }, ...(aff ? [{ text: '1', sup: true }] : [])] });
  if (aff) B.push({ type: 'p', style: 'Affiliation', runs: [{ text: '1', sup: true }, { text: aff }] });
  B.push({ type: 'p', style: 'Meta', runs: [{ text: 'Lecture date: ', b: true }, { text: c.date }, ...(c.length !== '0:00' ? [{ text: '    Recorded: ', b: true }, { text: c.length }] : []), ...(c.author ? [{ text: '    Notes prepared by: ', b: true }, { text: c.author }] : [])] });
  if (c.abstract || c.keywords) {
    B.push({ type: 'p', style: 'AbstractHeading', runs: [{ text: 'ABSTRACT' }] });
    parseMd(c.abstract).forEach(b => B.push({ type: 'p', style: 'Abstract', runs: parseInline(b.text || '') }));
    if (c.keywords) B.push({ type: 'p', style: 'Keywords', runs: [{ text: 'Keywords: ', i: true }, { text: c.keywords }] });
  }
  B.push({ type: 'p', style: 'CiteLine', runs: [{ text: 'Cite this lecture: ', b: true }, ...parseInline(c.cite)] });
  B.push({ type: 'section', cols: 1 });
  let prevHead = true;
  parseMd(c.body).forEach(b => {
    const label = b.type === 'p' && (/^\*\*(Table|Figure) \d+\*\*$/.test(b.text) || /^\*[^*]+\*$/.test(b.text));
    B.push(b.type === 'p' ? { ...b, noIndent: prevHead || label, style: label ? 'TableLabel' : undefined } : b);
    prevHead = b.type === 'h' || b.type === 'table' || b.type === 'list' || label;
  });
  B.push({ type: 'h', level: 2, text: 'References' });
  c.refs.forEach(r => B.push({ type: 'ref', text: r }));
  B.push({ type: 'section', cols: 2, continuous: true }); // ends the two-column body so Word balances the columns
  return { blocks: B, runningHead: c.runningHead, footer: [JOURNAL, c.course].filter(Boolean).join(' · ') };
}

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
  const shade = '<w:shd w:val="clear" w:color="auto" w:fill="F2F5F4"/>', box = '<w:ind w:left="0" w:right="0" w:firstLine="0"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:jc w:val="both"/><w:ind w:firstLine="284"/></w:pPr></w:style>
  ${st('Masthead', 'Masthead', '<w:tabs><w:tab w:val="right" w:pos="10080"/></w:tabs><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="3" w:color="141414"/></w:pBdr><w:spacing w:after="240"/>', `<w:rFonts ${SANS}/><w:b/><w:color w:val="555555"/><w:spacing w:val="16"/><w:sz w:val="15"/>`)}
  ${st('Kicker', 'Article type', '<w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:after="80"/>', `<w:rFonts ${SANS}/><w:b/><w:color w:val="1D6B57"/><w:spacing w:val="20"/><w:sz w:val="16"/>`)}
  ${st('ArticleTitle', 'Title', '<w:keepNext/><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:after="60" w:line="240" w:lineRule="auto"/>', '<w:b/><w:sz w:val="44"/><w:szCs w:val="44"/>')}
  ${st('Subtitle', 'Subtitle', '<w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:after="160"/>', '<w:color w:val="333333"/><w:sz w:val="28"/>')}
  ${st('Authors', 'Authors', '<w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:before="80"/>', `<w:rFonts ${SANS}/><w:b/><w:sz w:val="21"/>`)}
  ${st('Affiliation', 'Affiliation', '<w:jc w:val="left"/><w:ind w:firstLine="0"/>', '<w:i/><w:color w:val="555555"/><w:sz w:val="18"/>')}
  ${st('Meta', 'Article metadata', '<w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:before="100" w:after="200"/>', `<w:rFonts ${SANS}/><w:color w:val="555555"/><w:sz w:val="16"/>`)}
  ${st('AbstractHeading', 'Abstract heading', `<w:keepNext/>${shade}${box}<w:pBdr><w:top w:val="single" w:sz="6" w:space="6" w:color="141414"/></w:pBdr><w:spacing w:after="60"/>`, `<w:rFonts ${SANS}/><w:b/><w:spacing w:val="20"/><w:sz w:val="16"/>`)}
  ${st('Abstract', 'Abstract', `${shade}${box}<w:jc w:val="both"/><w:spacing w:after="60"/>`, '<w:sz w:val="19"/>')}
  ${st('Keywords', 'Keywords', `${shade}${box}<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="141414"/></w:pBdr><w:jc w:val="left"/>`, '<w:sz w:val="19"/>')}
  ${st('CiteLine', 'Citation line', '<w:jc w:val="left"/><w:ind w:left="284" w:hanging="284"/><w:spacing w:before="160" w:after="240"/>', `<w:rFonts ${SANS}/><w:color w:val="555555"/><w:sz w:val="16"/>`)}
  ${st('Heading1', 'heading 1', '<w:keepNext/><w:jc w:val="center"/><w:ind w:firstLine="0"/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="0"/>', `<w:rFonts ${SANS}/><w:b/><w:caps/><w:spacing w:val="10"/><w:sz w:val="19"/>`)}
  ${st('Heading2', 'heading 2', '<w:keepNext/><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:before="160" w:after="40"/><w:outlineLvl w:val="1"/>', `<w:rFonts ${SANS}/><w:b/><w:sz w:val="19"/>`)}
  ${st('Heading3', 'heading 3', '<w:keepNext/><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:before="120" w:after="20"/><w:outlineLvl w:val="2"/>', '<w:b/><w:i/>')}
  ${st('ListParagraph', 'List Paragraph', '<w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:after="30"/>', '')}
  ${st('TableLabel', 'Table label', '<w:keepNext/><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:before="120"/>', `<w:rFonts ${SANS}/><w:sz w:val="17"/>`)}
  ${st('TableText', 'Table text', '<w:keepNext/><w:jc w:val="left"/><w:ind w:firstLine="0"/><w:spacing w:line="240" w:lineRule="auto"/>', `<w:rFonts ${SANS}/><w:sz w:val="16"/>`)}
  ${st('Reference', 'Reference', '<w:jc w:val="left"/><w:ind w:left="284" w:hanging="284"/><w:spacing w:after="50"/>', '<w:sz w:val="17"/>')}
  ${st('Quote', 'Quote', `${shade}<w:ind w:left="142" w:right="0" w:firstLine="0"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="1D6B57"/></w:pBdr><w:spacing w:before="80" w:after="80"/>`, '')}
  ${st('Footer', 'footer', '<w:tabs><w:tab w:val="right" w:pos="10080"/></w:tabs><w:ind w:firstLine="0"/><w:jc w:val="left"/>', `<w:rFonts ${SANS}/><w:color w:val="666666"/><w:sz w:val="14"/>`)}
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
  const M = jr ? 1080 : mla ? 1440 : 1260;
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
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="10080"/></w:tabs><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts ${SANS}/><w:sz w:val="15"/><w:color w:val="555555"/><w:spacing w:val="12"/></w:rPr><w:t xml:space="preserve">${xe(opts.runningHead || title.toUpperCase())}</w:t></w:r><w:r><w:tab/></w:r><w:r><w:rPr><w:rFonts ${SANS}/><w:sz w:val="16"/></w:rPr></w:r>${pageField}</w:p></w:hdr>`
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

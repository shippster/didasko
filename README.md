# Didasko

Live captions, live translation, APA-formatted lecture notes and live formative quizzes — in one installable web app for teachers, instructors and professors. Built mobile-first; works on a phone at the didasko, a tablet, or a laptop plugged into the projector.

**First time? Read `SETUP.md`** — it connects the free Firebase backend (accounts, live sharing, quizzes) and takes about 30 minutes. The only file you edit is `config.js`.

## What it does

| Area | Features |
|---|---|
| **Live captions** | Real-time captions on a high-contrast "chalkboard" stage, projector mode, key-point and new-topic markers, translation under each caption. |
| **Students' devices** | **Share captions** creates a 6-letter code, link and QR code. Students scan it — no account, no install — and pick **their own translation language**. The presenter's device translates each language that students choose. Show the QR on the caption screen for latecomers. |
| **Journal-style notes** | Notes are laid out like a scientific journal article: masthead, article type, title and subtitle, lecturer and affiliation, boxed abstract with auto-generated **keywords**, a “Cite this lecture” line, Introduction → topic sections → Conclusion in two columns, APA 7 heading levels and in-text citations, and a **References** section citing the **lecturer** plus every file or text the teacher adds. Variants: full article, Cornell cue tables, outline sections, short communication. Export to Word (two-column layout with running head and page numbers), HTML, Markdown, print/PDF. |
| **Sources** | Upload slides (.pptx with speaker notes), readings (.pdf, .docx), text, caption files or photos. Each file gets an editable APA citation, filled in automatically from document properties and the file's first page. |
| **Quizzes** | Multiple choice, true/false, or a mix; 5–20 questions; recall → analysis. Edit questions, set answers, practice mode, present mode, exports (Word student copy + key, Moodle GIFT, CSV, JSON). |
| **Live quiz** | **Run live with QR**: students join on their phones, answer with a **10, 20 or 30-second timer** (or none), and appear either with **names they type** or **assigned color + animal names** (e.g. "Teal Otter"). Live answer counts, reveal with response bars, optional leaderboard, class results with per-question % correct, CSV download for the gradebook. |
| **Accounts** | No account needed for captions, sharing or quizzes. Sign in with **Google, Microsoft or email** to upload files and keep a synced library of lectures on every device. New accounts are added to the micahshippee.com blog list, with a clear notice and unsubscribe at any time. |
| **AI model choice** | Settings → AI model: Claude, ChatGPT, Gemini, Microsoft Copilot (via Azure OpenAI), OpenRouter, Mistral, Groq, Ollama, Gemini Nano in Chrome, or any OpenAI-compatible service. Each teacher uses their own key (several are free), so the app's owner pays nothing for AI. |

## Files

```
index.html             app shell (teacher and student views)
config.js              ← your settings: Firebase, app address, newsletter
styles.css             styles (light + dark, APA paper, print)
app.js                 the app (built from src/ by build.py)
sw.js                  service worker (offline shell + cached libraries)
manifest.webmanifest   install metadata
database.rules.json    Firebase security rules — paste into the console
SETUP.md               step-by-step setup
icons/                 app icons
```

If you change anything in `src/`, run `python3 build.py` to rebuild `app.js`.

## Browser support

| Feature | Chrome / Edge desktop | Chrome Android | Safari iOS / macOS | Firefox |
|---|---|---|---|---|
| Live captions (presenter) | ✓ | ✓ | ✓ (iOS 14.5+) | — (type or import instead) |
| Joining as a student | ✓ | ✓ | ✓ | ✓ |
| On-device translation / Gemini Nano | ✓ Chrome 138+ | — | — | — |
| Install + offline | ✓ | ✓ | ✓ (Add to Home Screen) | partial |

## Privacy notes for schools

- Speech recognition is provided by the presenter's browser (Chrome and Edge send audio to their speech services; Safari may process on-device).
- Shared captions and quiz answers pass through your Firebase database and can be read by anyone with the session code. Sessions don't contain account details.
- Transcript and file text go only to the AI service the teacher chose, using the teacher's own key.
- Check your institution's policy before captioning or recording class discussion that includes students.

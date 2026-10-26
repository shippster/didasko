# Didasko

Live captions, live translation, APA-formatted lecture notes and live formative quizzes — in one installable web app for teachers, instructors and professors. Built mobile-first; works on a phone at the lectern, a tablet, or a laptop plugged into the projector.

**First time? Read `SETUP.md`** — it connects the free Firebase backend (accounts, live sharing, quizzes) and takes about 30 minutes. The only file you edit is `config.js`.

## What it does

| Area | Features |
|---|---|
| **Home dashboard** | Opens first: a big **New lecture** button (title, course and speaking language, then captions start), a *Continue* shortcut, totals (lectures, time captioned, words, live quizzes run), a short setup checklist, and a searchable list of **past lectures** grouped by date and color-coded by course, each with one-tap Captions / Notes / Quiz. |
| **Start from anything** | A lecture doesn’t have to be live. **New lecture → Start from** offers a live lecture, a **recording** (MP3, M4A, WAV or video — transcribed with timestamps by Gemini or ChatGPT/Whisper; long recordings are split automatically), a **YouTube link** (Gemini watches the public video and writes the transcript; the video is cited as the source), or a **paper or reading** (notes and quizzes are written from the material alone and cite it). |
| **Live captions** | The stage shows **exactly two rolling lines**, like broadcast captions — nothing else — while the full transcript keeps recording. High-contrast "chalkboard" stage, projector mode, key-point and new-topic markers, translation as its own two-line track. |
| **Students' devices** | **Share captions** creates a 6-letter code, link and QR code. Students scan it — no account, no install — and pick **their own translation language**. The presenter's device translates each language that students choose. Show the QR on the caption screen for latecomers. |
| **Faithful notes** | Every output organizes and cleans up only what is in the transcript and the imported files — regrouped by theme, rewritten into clear sentences — with no added facts, examples or elaboration. Length follows the sources. |
| **Math lectures** | Set **Subject → Mathematics** (Notes tab, Quiz tab or lecture details) and worked problems appear step by step: each step's reason, then the resulting equation on its own centered line (fractions, powers and roots formatted; Word export uses Cambria Math). Quizzes add next-step and find-the-error questions. |
| **State standards** | Optional, per lecture (Quiz tab → *State standards*): pick a state or standard set, grade level, and list standards (paste them, or *Suggest from this lecture*). Generated questions are aligned to and tagged with the standard they assess; the answer key, CSV and Moodle exports include it. |
| **Notes outputs** | Pick the output: **APA journal article** (a cleaned-up narrative — no bullets — with abstract, keywords and References), **MLA journal article** (MLA 9 heading, centered title, (Author) citations, Works Cited), **Outline** (bulleted overview with key terms and takeaways), **Children’s book with AI pictures** (8–10 illustrated pages for ages 6–9; Gemini or ChatGPT paint the pictures, other AI services draw illustrations; redraw any page, edit text in place, export to Word with pictures), or **Other** — type what you want and Didasko writes it. |
| **Journal-style notes (APA)** | Notes are laid out like a scientific journal article: masthead, article type, title and subtitle, lecturer and affiliation, boxed abstract with auto-generated **keywords**, a “Cite this lecture” line, Introduction → topic sections → Conclusion in two columns, APA 7 heading levels and in-text citations, and a **References** section citing the **lecturer** plus every file or text the teacher adds. Variants: full article, Cornell cue tables, outline sections, short communication. Export to Word (two-column layout with running head and page numbers), HTML, Markdown, print/PDF. |
| **Sources** | Upload slides (.pptx with speaker notes), readings (.pdf, .docx), text, caption files or photos. Each file gets an editable APA citation, filled in automatically from document properties and the file's first page. |
| **Quizzes** | Formative checks built on assessment-for-learning practice: scenario, prediction and "a classmate says…" questions (never fill-in-the-blank); every wrong option is a known misconception with its own feedback; a reflection prompt per question and an exit ticket. Focus options include hinge questions to uncover misconceptions. Edit questions and feedback, practice mode, present mode, exports (Word student copy with confidence and reflection lines + key explaining each wrong answer, Moodle GIFT with per-answer feedback, CSV, JSON). |
| **Live quiz** | **Run live with QR**: students join on their phones, answer with a **10, 20 or 30-second timer** (or none), rate **how sure they are**, and get feedback for the option they chose. A **live leaderboard on the right** shows who has answered each question as it happens, points and participation. The reveal flags the most common wrong answer and students who were *certain but wrong*. Then an anonymous **exit-ticket wall**, a review with reteach suggestions, and a **celebration screen** — the winner’s name on a gold trophy with flames, smoke and graffiti, also shown on students’ phones. CSV download with answers, confidence and reflections. |
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

**Updating from an earlier version:** paste the new `database.rules.json` into the Firebase console (Realtime Database → Rules). It adds validation for the confidence ratings and reflections students send; the app also works with the old rules.

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

## Developer notes

Didasko is designed and developed by **Micah Shippee, PhD** ([micahshippee.com](https://micahshippee.com)). The app itself shows no developer branding: students see only the join code and QR code, and notes are authored by whoever is signed in (or the name they enter).


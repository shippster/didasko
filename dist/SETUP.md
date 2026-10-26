# Setting up Didasko (about 30 minutes, free)

Didasko is a static web app. Live caption sharing, live quizzes, accounts and synced lectures use **Firebase** (Google's free app backend). AI features use whichever AI service each teacher picks, with **their own key**, so you never pay for anyone's AI use.

You only edit one file: **`config.js`**.

---

## 1. Create the Firebase project

1. Go to **console.firebase.google.com** → **Create a project** → name it `didasko` (Google Analytics: optional, off is fine).
2. Stay on the free **Spark** plan.
3. On the project home page, click the **Web** icon (`</>`) → nickname `Didasko` → **Register app**. Firebase shows a `firebaseConfig` block.
4. Copy `apiKey`, `authDomain`, `projectId` and `appId` into the `firebase` section of `config.js`.

## 2. Turn on the Realtime Database

1. **Build → Realtime Database → Create database** → pick the location closest to you → **Start in locked mode**.
2. Copy the database URL at the top (looks like `https://didasko-xxxx-default-rtdb.firebaseio.com`) into `databaseURL` in `config.js`.
3. Open the **Rules** tab, replace everything with the contents of **`database.rules.json`**, and click **Publish**.

The rules make sure only the presenter can write captions and questions, each student can only write their own name and answers, answers are accepted only while a question is open, and each person's lecture library is private to them.

## 3. Turn on sign-in methods

**Build → Authentication → Get started → Sign-in method**, then enable:

| Provider | What to do |
|---|---|
| **Anonymous** | Enable. Students and guests use this silently — they never see a sign-in screen. |
| **Email/Password** | Enable (leave "Email link" off). |
| **Google** | Enable, choose a support email, Save. |
| **Microsoft** | Needs a free Azure app registration — see below. |

### Microsoft sign-in

1. Go to **portal.azure.com** → **App registrations** → **New registration**.
   - Name: `Didasko`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: platform **Web**, and paste the callback URL shown in Firebase's Microsoft provider panel (it looks like `https://didasko-xxxx.firebaseapp.com/__/auth/handler`).
2. Copy the **Application (client) ID**.
3. **Certificates & secrets → New client secret** → copy the secret **Value** (not the ID).
4. Paste both into Firebase's Microsoft provider and Save.

To allow only one school's Microsoft accounts, put its tenant (for example `yourschool.onmicrosoft.com`) in `microsoftTenant` in `config.js`.

## 4. Authorize your web address

**Authentication → Settings → Authorized domains → Add domain**, and add the address where the app will live — for example `micahshippee.github.io` or `didasko.micahshippee.com`. (`localhost` is already there for testing.)

## 5. Put the app online

Any static HTTPS host works. Pick one:

- **GitHub Pages:** new repository → upload everything in this folder → Settings → Pages → Deploy from branch `main`.
- **Netlify Drop:** drag this folder onto app.netlify.com/drop.
- **Firebase Hosting:** `npm i -g firebase-tools`, then `firebase init hosting` and `firebase deploy` in this folder.

**Custom address (optional):** micahshippee.com's domain is managed at WordPress.com, so you can add a `CNAME` record such as `didasko` → `micahshippee.github.io` under **WordPress.com → Domains → micahshippee.com → DNS records**, then set the same custom domain in GitHub Pages. Put the final address in `appUrl` in `config.js` so QR codes always point there, and add it to Firebase's authorized domains (step 4).

## 6. Newsletter sign-up

Everyone who **creates** an account (Google, Microsoft or email) is added to the micahshippee.com list, and the sign-in screen tells them so and that they can unsubscribe at any time. Two things happen:

1. Didasko submits their email to **WordPress.com's subscription form for micahshippee.com** (blog ID `21768516`). WordPress.com then sends its own "confirm your subscription" email, so people are added once they confirm — this keeps the list clean and compliant.
2. A backup copy is stored in the Firebase database under **`newsletter`** (email, name, sign-in method, date). Only you can see it in the Firebase console. To import it: Realtime Database → `newsletter` → ⋮ → **Export JSON**, convert to CSV, then **WordPress.com → Jetpack → Subscribers → Add subscribers → Import**.

Optional: put a Zapier/Make/Mailchimp webhook URL in `newsletter.webhookUrl` to send each new sign-up somewhere else as well.

**Consent laws:** automatic sign-up with a clear notice is common in the US. For users in the EU, UK or Canada, an explicit opt-in is safer — set `requireCheckbox: true` and people tick a box before creating an account.

## 7. AI models — no cost to you

### Built-in free AI (works with no key)

Didasko ships with a shared free model — Gemini through **Firebase AI Logic** on your no-cost Spark plan. It is used automatically whenever a teacher hasn't added their own key (notes, quizzes, transcription of recordings; not live translation or YouTube links).

1. Firebase console → **AI Logic** → Get started → choose the **Gemini Developer API** (no billing needed).
2. Google Cloud console → Security → **reCAPTCHA** (Fraud Defense) → Create key: type **Web**, domain = your site. Copy the key ID.
3. Firebase console → **App Check** → Apps → your web app → **reCAPTCHA Enterprise** → paste the key → Save. Then under APIs, set **Firebase AI Logic** to *Enforced*.
4. In `config.js`, set `freeAI.recaptchaSiteKey` to the key. Set `freeAI.enabled: false` to turn the free AI off.

Things to know: the daily allowance is per project and shared by everyone (roughly a few hundred requests a day on Flash-Lite; it resets at midnight Pacific). When it runs out, Didasko asks the teacher to add their own free Gemini key. On the free tier Google may use prompts to improve its products, it's for users 18+, and it isn't offered in the EU/EEA, UK or Switzerland — Didasko shows a one-time notice explaining this before anything is sent.

### Teachers' own keys

Each teacher opens **Settings → AI model**, picks a service and pastes their own key. Keys stay on that device and go straight from the browser to the provider; nothing passes through your Firebase project.

| Service | Cost to the teacher |
|---|---|
| Gemini (Google AI Studio key) | Free tier with daily limits — usually enough for a class |
| Gemini Nano in Chrome | Free, on-device (desktop Chrome only; short lectures) |
| Ollama | Free, runs open models on the teacher's own computer |
| OpenRouter | One key for many models; models ending in `:free` cost nothing |
| Mistral, Groq | Free tiers with rate limits |
| ChatGPT (OpenAI), Claude (Anthropic) | Paid API, billed to the teacher's key |
| Microsoft Copilot | Copilot itself has no public API. Schools on Microsoft 365 can use an **Azure OpenAI** deployment (the same GPT models), entered as endpoint + deployment name |

Tap **Refresh model list** in Settings to pull the provider's current models.

## Free-tier limits to know about

The Firebase Spark plan is free but has caps. The one that matters most: the Realtime Database allows about **100 simultaneous connections** across the whole app — fine for a class or two at a time. If many teachers will run sessions at once, switch the project to the pay-as-you-go **Blaze** plan (you set a budget alert; caption text is tiny, so typical costs stay very low). Storage (1 GB) and download (10 GB/month) on Spark cover a lot of lectures, since only text and small images are stored.

## Testing locally

```
python3 -m http.server 8080
```
Open `http://localhost:8080`. To try a student device on the same Wi-Fi, use your computer's local IP — or simply open the join link in a second browser window.

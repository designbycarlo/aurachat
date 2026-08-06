# 🤖 AuraChat — AI SEO / AEO Analyzer

> Is your website ready for the age of AI-driven search? AuraChat reads your page the way an AI answer engine would — and tells you exactly what to fix.

AuraChat is a lightweight, self-hosted tool that analyzes any public URL and produces an instant **AI-readiness report**. It scores your site for discovery by engines like **Google AI Overview**, **Perplexity**, and **ChatGPT Search**, then hands back a clear grade, strengths, weaknesses, and prioritized recommendations.

No frameworks. No build step. Just Node, Express, a sprinkle of AI magic — and a Postgres database for accounts, sessions, and saved reports. ✨

---

## ✨ Features

- **🎯 AI Readiness Score (0–100)** with a letter grade from `S` to `F`
- **🔍 Deep signal extraction** — title tags, meta descriptions, canonical URLs, Open Graph, JSON-LD structured data, heading hierarchy, word count, FAQ/How-to detection, conversational tone, and AI-agent markers
- **🧠 LLM-powered analysis** via [OpenRouter](https://openrouter.ai) with **automatic model failover** — if the primary model hiccups, AuraChat seamlessly falls back to the next free model
- **📊 Actionable report cards** — strengths, weaknesses, and prioritized recommendations, served as clean JSON
- **📄 Export to PDF & CSV** — one-click download of a polished one-page PDF report or raw CSV data for spreadsheets
- **🎨 Widget-based dashboard** — animated, responsive layout with score gauge, signal coverage grid, stat tiles, and list panels
- **🌀 Fun loading experience** — while the AI thinks, you'll see rotating messages like *"Consulting the SEO oracle..."* and *"Polishing the crystal ball..."*
- **🎨 Polished dark UI** — responsive, dependency-free, and ready to ship
- **📱 Mobile zoom prevention** — pinch-to-zoom and gesture zooming are disabled on touch devices for a native-app feel
- **📦 PWA ready** — installable web app with manifest, icons, and offline-capable structure
- **🚀 One-command deploy** to Railway (or any Node host)

---

## 🧰 Tech Stack

| Layer       | Technology                                      |
| ----------- | ----------------------------------------------- |
| Runtime     | Node.js ≥ 18                                    |
| Server      | Express                                         |
| AI SDK      | [Vercel AI SDK](https://sdk.vercel.ai) (`ai`)   |
| LLM Gateway | [OpenRouter](https://openrouter.ai) (free tier) |
| PDF         | [PDFKit](https://pdfkit.org)                    |
| Frontend    | Vanilla HTML, CSS, and JS — zero build step     |
| Database    | PostgreSQL (Railway add-on) — or embedded PGlite for local dev |
| Deploy      | Railway (Nixpacks)                              |

---

## 🚀 Quick Start

### 1. Prerequisites

- [Node.js](https://nodejs.org) **v18 or newer**
- A free [OpenRouter API key](https://openrouter.ai/keys)

### 2. Install

```bash
npm install
```

### 3. Configure

Create a `.env` file in the project root:

```env
# Required: your OpenRouter API key
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Optional: override the default model (defaults to a free model)
OPENROUTER_MODEL=openai/gpt-oss-20b:free
```

> 💡 **Tip:** Free models on OpenRouter end with `:free` and cost $0 to use. Browse all available models at [openrouter.ai/models](https://openrouter.ai/models).

### 4. Run

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000) and paste any URL to analyze.

---

## 📡 API Reference

### `POST /api/analyze`

Analyze a URL for AI SEO / AEO readiness.

**Request body**

```json
{
  "url": "https://example.com"
}
```

**Response (200)**

```json
{
  "score": 82,
  "grade": "A",
  "summary": "Well-structured page with strong structured data and clear headings.",
  "strengths": ["JSON-LD present", "Clear H1 hierarchy", "FAQ section detected"],
  "weaknesses": ["Meta description is short", "No Open Graph image"],
  "recommendations": ["Expand meta description to 120–160 characters", "Add og:image for social sharing"],
  "signals": { "...": "extracted page signals" }
}
```

**Error responses**

| Status | Meaning                          |
| ------ | -------------------------------- |
| 400    | Missing or invalid URL           |
| 500    | Analysis failed (server error)   |

### `POST /api/report/pdf`

Generate a one-page PDF report from analysis data.

**Request body** — the full response object from `/api/analyze`

**Response (200)** — `application/pdf` binary stream with `Content-Disposition: inline`

### `POST /api/report/csv`

Generate a CSV export from analysis data.

**Request body** — the full response object from `/api/analyze`

**Response (200)** — `text/csv` binary stream with `Content-Disposition: attachment`

### `GET /health`

Returns `{ "status": "ok" }` — used by Railway for health checks.

---

## 🧠 How It Works

```
User submits URL
      │
      ▼
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Fetch page  │ ──▶ │ Extract signals  │ ──▶ │  Build AI prompt │
│  (15s limit) │     │ (SEO + AEO data) │     │  (heuristics)    │
└──────────────┘     └──────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                     ┌──────────────────────────────┐
                                     │  Generate report via LLM     │
                                     │  (with model failover)       │
                                     └──────────────────────────────┘
                                                         │
                                                         ▼
                                               JSON report → UI
```

### Scoring Heuristics

The AI is guided by a transparent scoring rubric:

| Signal                                  | Points |
| --------------------------------------- | ------ |
| Clear, concise title tag                | +10    |
| Meta description (> 30 chars)           | +10    |
| Canonical tag present                   | +5     |
| Open Graph title + description          | +10    |
| JSON-LD structured data                 | +15    |
| Logical heading hierarchy (H1/H2/H3)    | +10    |
| Word count > 300                        | +5     |
| Word count > 800                        | +5     |
| FAQ section detected                    | +5     |
| How-to / step-by-step content           | +5     |
| Conversational / Q&A style              | +5     |
| AI-agent friendly markers               | +5     |
| Missing meta description or no H1       | −5     |
| Duplicate OG/title without description  | −3     |

### Model Failover

AuraChat tries models in order and gracefully falls back on failure:

1. `openai/gpt-oss-20b:free` *(default)*
2. `google/gemma-4-31b-it:free`
3. `nvidia/nemotron-3-super-120b-a12b:free`
4. `meta-llama/llama-4-maverick:free`

Override the primary model with `OPENROUTER_MODEL` in your `.env`.

---

## ☁️ Deployment

### Railway

This repo is Railway-ready out of the box.

```bash
# Install the Railway CLI
npm i -g @railway/cli

# Link and deploy
railway link
railway up
```

Set `OPENROUTER_API_KEY` as a Railway variable, and you're live. The `railway.toml` config handles the rest — build via Nixpacks, `npm start` on deploy, and a `/health` check.

#### 🐘 Adding the Postgres add-on (required for accounts & saved reports)

AuraChat stores users, sessions, and saved reports in Postgres. On Railway this is a one-time, zero-config add-on:

1. In the Railway project, click **New → Database → Add PostgreSQL**.
2. Railway automatically injects a `DATABASE_URL` environment variable into the service — **you don't set it manually**, and you don't need to add it to your repo.
3. Redeploy (Railway does this automatically once the database is linked).

On first boot the app runs an idempotent schema migration (`CREATE TABLE IF NOT EXISTS` for `users`, `sessions`, `reports`, and `reset_tokens` with FK cascades), so a brand-new database self-initializes. **No `DATABASE_URL` ⇒ no persistence**: without the add-on, account, session, and report features return errors while analysis still works — so the add-on is effectively required for the auth/save flow.

> 💡 **Why Postgres?** The earlier JSON file store was wiped on every Railway redeploy (ephemeral filesystem) and couldn't be shared across multiple instances. Postgres makes user data survive deploys and scale horizontally.

##### Local development (no Postgres install needed)

Leave `DATABASE_URL` **unset** locally. AuraChat then falls back to [PGlite](https://pglite.dev) — a real Postgres engine compiled to WASM that runs embedded in the process (stored in the gitignored `data-pglite/` dir). It speaks genuine Postgres SQL, so the schema and queries you test locally are identical to production:

```bash
npm install
npm test          # exercises the store against embedded PGlite (real Postgres)
npm start         # uses PGlite; open http://localhost:3000
```

### Other hosts

AuraChat is a standard Express app — deploy anywhere that runs Node:

```bash
npm install
npm start
```

Set `PORT` and `OPENROUTER_API_KEY` as environment variables.

---

## 📁 Project Structure

```
aurachat/
├── server.js              # Express server, signal extraction, AI analysis
├── db.js                  # Postgres connection (pg in prod, PGlite locally) + schema
├── data-store.js          # Async user/session/report persistence layer
├── generate-pdf.js        # PDFKit report generator (one-page, print-optimized)
├── public/
│   └── index.html         # Frontend UI (widget dashboard, dark theme, PWA)
├── fonts/                 # Geist variable font (self-hosted)
├── package.json           # Dependencies and scripts
├── railway.toml           # Railway deployment config
├── .env                   # Environment variables (not committed)
└── .env.example           # Example environment file
```

---

## 🔧 Configuration

| Variable              | Required | Default                          | Description                          |
| --------------------- | -------- | -------------------------------- | ------------------------------------ |
| `OPENROUTER_API_KEY`  | ✅ Yes   | —                                | Your OpenRouter API key              |
| `OPENROUTER_MODEL`    | ❌ No    | `openai/gpt-oss-20b:free`        | Primary LLM model ID                 |
| `PORT`                | ❌ No    | `3000`                           | Server port                          |
| `DATABASE_URL`        | ❌*      | *(unset → embedded PGlite)*      | Postgres connection string (Railway injects this) |

\* Required in production (via the Railway Postgres add-on); leave unset for local dev to use the embedded PGlite database.

---

## 🛠️ Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm start`     | Start production server              |
| `npm run dev`   | Start development server (alias)     |
| `npm test`      | Run store integration tests (PGlite) |
| `npm run icons` | Generate PWA icons from SVG source   |

---

## 🛡️ Notes & Limitations

- Only `http` and `https` URLs are accepted.
- Pages are fetched with a 15-second timeout and capped at 80,000 characters.
- Analysis quality depends on the selected LLM — free models are great for experimentation; swap in a paid model for production-grade reports.
- The `.env` file contains secrets — **never commit it to version control**.
- Mobile zoom is disabled via viewport meta, CSS `touch-action`, and JS gesture blocking to prevent accidental pinch/double-tap zoom on touch devices.
- PDF reports are single-page by design — content intelligently scales to fit.
- CSV exports include all signals, strengths, weaknesses, and recommendations in a tabular format.

---

## 📜 License

MIT — free to use, modify, and share. Build something cool. 🚀
# 🤖 AuraChat — AI SEO / AEO Analyzer

> Is your website ready for the age of AI-driven search? AuraChat reads your page the way an AI answer engine would — and tells you exactly what to fix.

AuraChat is a lightweight, self-hosted tool that analyzes any public URL and produces an instant **AI-readiness report**. It scores your site for discovery by engines like **Google AI Overview**, **Perplexity**, and **ChatGPT Search**, then hands back a clear grade, strengths, weaknesses, and prioritized recommendations.

No frameworks. No build step. Just static HTML/CSS/JS served from Cloudflare Pages, Pages Functions for the API, D1 (serverless SQLite) for accounts and saved reports, and a sprinkle of AI magic via OpenRouter. ✨

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
- **🚀 Deploy to Cloudflare Pages** with D1 database (generous free tier, no credit card required)

---

## 🧰 Tech Stack

| Layer       | Technology                                      |
| ----------- | ----------------------------------------------- |
| Runtime     | Cloudflare Pages Functions (Workers runtime)    |
| Frontend    | Vanilla HTML, CSS, and JS — zero build step     |
| AI Gateway  | [OpenRouter](https://openrouter.ai) (free tier) |
| PDF         | [pdf-lib](https://github.com/Hopding/pdf-lib)   |
| Database    | Cloudflare [D1](https://developers.cloudflare.com/d1/) (serverless SQLite) |
| Auth        | Cookie-based sessions, scrypt password hashing (`@noble/hashes`) |
| Deploy      | Cloudflare Pages (wrangler)                     |

---

## 🚀 Quick Start (Local Dev)

### 1. Prerequisites

- [Node.js](https://nodejs.org) **v18 or newer**
- [pnpm](https://pnpm.io) (preferred) or npm
- A free [OpenRouter API key](https://openrouter.ai/keys)
- [Wrangler CLI](https://developers.cloudflare.com/pages/wrangler/) (for local dev / deploy)

### 2. Install

```bash
pnpm install
```

### 3. Configure

Create a `.dev.vars` file (for local dev) or set secrets (for production):

```bash
# Local dev — create .dev.vars
echo "OPENROUTER_API_KEY=your_api_key_here" > .dev.vars
# (wrangler pages dev reads variables from .dev.vars automatically)
```

For production, add it as an **encrypted environment variable** in the Pages project:

1. Cloudflare dashboard → **Workers & Pages** → your project → **Settings** → **Environment variables**
2. Add `OPENROUTER_API_KEY` and tick **Encrypt**
3. Redeploy (env variables only apply to new deployments)

> 💡 **Tip:** Free models on OpenRouter end with `:free` and cost $0 to use. Browse all available models at [openrouter.ai/models](https://openrouter.ai/models). Override the primary model with `OPENROUTER_MODEL` in your `.dev.vars` or Pages env variables.
>
> ⚠️ `wrangler secret put` is **Workers-only** — it will not set variables on a Pages project.

### 4. Run Locally

```bash
# Start the Pages dev server with a local D1 database
pnpm run pages:dev
```

Then open [http://localhost:8788](http://localhost:8788) and paste any URL to analyze.

> 💡 **Local D1:** The first run creates a local SQLite database at `.wrangler/state/d1/aurachat.db`. Run migrations first with `pnpm run pages:migrate:local` if the DB is empty.

---

## 📡 API Reference

All endpoints are **Pages Functions** in `functions/api/`. They return JSON with a `Content-Type: application/json` header.

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

### Authentication & Saved Reports

| Method   | Endpoint                  | Description                                      |
| -------- | ------------------------- | ------------------------------------------------ |
| `POST`   | `/api/auth/register`      | Register a new account (email + password, min 8 chars) |
| `POST`   | `/api/auth/login`         | Log in; sets a `HttpOnly` session cookie          |
| `POST`   | `/api/auth/logout`        | Clear the session cookie                          |
| `GET`    | `/api/auth/me`            | Returns the authenticated user or 401              |
| `POST`   | `/api/auth/reset/request` | Request a password reset token                   |
| `POST`   | `/api/auth/reset/confirm` | Reset password using a token (min 8 chars)         |
| `GET`    | `/api/reports`            | List saved reports for the authenticated user      |
| `POST`   | `/api/reports`            | Save a new report for the authenticated user       |
| `GET`    | `/api/reports/{id}`       | Retrieve a specific saved report                   |
| `DELETE` | `/api/reports/{id}`       | Delete a saved report                              |

Auth uses a `aura_session` cookie (HttpOnly, SameSite=Lax, Secure on HTTPS). You can also pass a bearer token via the `Authorization` header.

### `GET /health`

Returns `{ "status": "ok" }` — used by hosting/monitoring health checks.

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
| Headings hierarchy (H1 present, logical H2/H3) | +10    |
| Word count > 300                        | +5     |
| Word count > 800                        | +5     |
| FAQ section detected                    | +5     |
| How-to / step-by-step content           | +5     |
| Conversational / Q&A style              | +5     |
| AI-agent markers                        | +5     |
| Missing meta description or no H1       | −5     |
| Duplicate OG and title without description | −3     |

### Model Failover

AuraChat tries models in order and gracefully falls back on failure:

1. `openai/gpt-oss-20b:free` *(default)*
2. `google/gemma-4-31b-it:free`
3. `nvidia/nemotron-3-super-120b-a12b:free`
4. `meta-llama/llama-4-maverick:free`

Override the primary model with `OPENROUTER_MODEL` in your environment.

---

## ☁️ Deployment (Cloudflare Pages)

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/) (free tier available)
- The [Wrangler CLI](https://developers.cloudflare.com/pages/wrangler/) installed (`npm install -g wrangler` or `npx wrangler`)
- An [OpenRouter API key](https://openrouter.ai/keys)

### One-Time D1 Setup

```bash
# Link your Cloudflare account (opens a browser)
npx wrangler login

# Create the D1 database (if it doesn't already exist)
npx wrangler d1 create aurachat

# Apply schema migrations
pnpm run pages:migrate:remote
```

> 💡 The `wrangler.toml` already declares the D1 binding (`DB`) and database name (`aurachat`). If you create a new database, update the `database_id` in `wrangler.toml` to match, or paste the `migrations/*.sql` files into the D1 console instead.

### Deploy

```bash
# Deploy the static assets + Functions
npx wrangler pages deploy public
```

Set `OPENROUTER_API_KEY` as an **encrypted environment variable** in the Pages project (Settings → Environment variables) before deploying. It is read at runtime by `functions/_lib/analyze.js`.

### Local Development

```bash
# Start the Pages dev server with a local D1 database
pnpm run pages:dev
```

This spins up a local Pages runtime at `http://localhost:8788` with an embedded D1 database. Run `pnpm run pages:migrate:local` first if the local DB is empty.

---

## 📁 Project Structure

```
aurachat/
├── public/
│   └── index.html           # Frontend UI (widget dashboard, dark theme, PWA)
├── functions/
│   ├── _lib/
│   │   ├── analyze.js       # URL fetch + signal extraction + AI model failover
│   │   ├── auth.js          # Scrypt password hashing, session cookies, tokens
│   │   ├── db.js            # D1 query helpers (env.DB)
│   │   ├── http.js          # JSON responses, rate limiting, auth middleware
│   │   ├── pdf.js           # pdf-lib report generator (one-page, print-optimized)
│   │   └── store.js         # D1-backed data access (users, sessions, reports, rate limits)
│   ├── api/
│   │   ├── analyze.js          # POST /api/analyze
│   │   ├── report/
│   │   │   ├── pdf.js          # POST /api/report/pdf
│   │   │   └── csv.js          # POST /api/report/csv
│   │   ├── reports.js          # GET/POST /api/reports
│   │   ├── reports/
│   │   │   └── [id].js         # GET/DELETE /api/reports/{id}
│   │   ├── auth/
│   │   │   ├── login.js        # POST /api/auth/login
│   │   │   ├── logout.js       # POST /api/auth/logout
│   │   │   ├── me.js           # GET /api/auth/me
│   │   │   ├── register.js     # POST /api/auth/register
│   │   │   └── reset/
│   │   │       ├── request.js  # POST /api/auth/reset/request
│   │   │       └── confirm.js  # POST /api/auth/reset/confirm
│   └── health.js            # GET /health
├── migrations/
│   ├── 0001_init.sql       # D1 schema (users, sessions, reports, reset_tokens)
│   └── 0002_rate_limits.sql # Brute-force rate-limit table
├── server.js              # Legacy Express server (kept for local pnpm test parity)
├── data-store.js          # Legacy Postgres store (kept for local pnpm test parity)
├── db.js                  # Legacy Postgres connection + schema (uses pg or PGlite)
├── migrate.js             # Legacy migration runner (npm run migrate)
├── generate-pdf.js        # Legacy pdfkit report generator (Node-only)
├── generate-icons.js      # PWA icon generation
├── fonts/                 # Geist variable font (self-hosted, for print)
├── icc/                   # CMYK ICC profile (for print-ready PDFs)
├── package.json           # Dependencies and scripts
├── wrangler.toml          # Cloudflare Pages + D1 config
├── .dev.vars              # Local env vars (not committed)
├── .env.example           # Example environment file
└── pnpm-workspace.yaml    # pnpm configuration
```

---

## 🔧 Configuration

| Variable              | Required | Default                          | Description                          |
| --------------------- | -------- | -------------------------------- | ------------------------------------ |
| `OPENROUTER_API_KEY`  | ✅ Yes   | —                                | Your OpenRouter API key              |
| `OPENROUTER_MODEL`    | ❌ No    | `openai/gpt-oss-20b:free`        | Primary LLM model ID                 |
| `OPENROUTER_TIMEOUT_MS`| ❌ No   | `60000`                          | Timeout for OpenRouter API calls     |

For local dev, create a `.dev.vars` file with:

```env
OPENROUTER_API_KEY=your_api_key_here
# Optional: override the default model
# OPENROUTER_MODEL=google/gemma-4-31b-it:free
# Optional: adjust timeout (ms)
# OPENROUTER_TIMEOUT_MS=60000
```

For production (Cloudflare Pages), set variables via the dashboard: project → **Settings** → **Environment variables** (tick **Encrypt** for secrets like `OPENROUTER_API_KEY`). Variables apply to new deployments.

---

## 🛠️ Scripts

| Command                   | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `pnpm run pages:dev`      | Start local Pages dev server with D1              |
| `pnpm run pages:deploy`   | Deploy to Cloudflare Pages                       |
| `pnpm run pages:migrate:local`  | Apply D1 migrations locally              |
| `pnpm run pages:migrate:remote` | Apply D1 migrations to remote D1       |
| `pnpm run icons`          | Generate PWA icons from SVG source               |
| `pnpm test`               | Run legacy store integration tests (PGlite)       |
| `pnpm start`              | Start legacy Express server (local dev)          |
| `npm start`               | Alias for `pnpm start`                          |

---

## 🛡️ Notes & Limitations

- Only `http` and `https` URLs are accepted.
- Pages are fetched with a 15-second timeout and capped at 80,000 characters.
- Analysis quality depends on the selected LLM — free models are great for experimentation; swap in a paid model for production-grade reports.
- Never commit `.dev.vars` or `.env` — they contain secrets.
- Mobile zoom is disabled via viewport meta, CSS `touch-action`, and JS gesture blocking to prevent accidental pinch/double-tap zoom on touch devices.
- PDF reports are single-page by design — content intelligently scales to fit.
- CSV exports include all signals, strengths, weaknesses, and recommendations in a tabular format.
- Login brute-force protection is **DB-backed** (D1 rate-limit table) so it survives worker restarts and cold starts.
- Password hashing uses **scrypt** (N=16384, r=8, p=1) via `@noble/hashes` — compatible with the original Node `crypto.scryptSync` parameters, so hashes can migrate from older deployments.

---

## 📜 License

MIT — free to use, modify, and share. Build something cool. 🚀
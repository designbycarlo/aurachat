# 🤖 AuraChat — AI SEO / AEO Analyzer

> Is your website ready for the age of AI-driven search? AuraChat reads your page the way an AI answer engine would — and tells you exactly what to fix.

AuraChat is a lightweight, self-hosted tool that analyzes any public URL and produces an instant **AI-readiness report**. It scores your site for discovery by engines like **Google AI Overview**, **Perplexity**, and **ChatGPT Search**, then hands back a clear grade, strengths, weaknesses, and prioritized recommendations.

No frameworks. No build step. No database. Just Node, Express, and a sprinkle of AI magic. ✨

---

## ✨ Features

- **🎯 AI Readiness Score (0–100)** with a letter grade from `S` to `F`
- **🔍 Deep signal extraction** — title tags, meta descriptions, canonical URLs, Open Graph, JSON-LD structured data, heading hierarchy, word count, FAQ/How-to detection, conversational tone, and AI-agent markers
- **🧠 LLM-powered analysis** via [OpenRouter](https://openrouter.ai) with **automatic model failover** — if the primary model hiccups, AuraChat seamlessly falls back to the next free model
- **📊 Actionable report cards** — strengths, weaknesses, and prioritized recommendations, served as clean JSON
- **🌀 Fun loading experience** — while the AI thinks, you'll see rotating messages like *"Consulting the SEO oracle..."* and *"Polishing the crystal ball..."*
- **🎨 Polished dark UI** — responsive, dependency-free, and ready to ship
- **🚀 One-command deploy** to Railway (or any Node host)

---

## 🧰 Tech Stack

| Layer       | Technology                                      |
| ----------- | ----------------------------------------------- |
| Runtime     | Node.js ≥ 18                                    |
| Server      | Express                                         |
| AI SDK      | [Vercel AI SDK](https://sdk.vercel.ai) (`ai`)   |
| LLM Gateway | [OpenRouter](https://openrouter.ai) (free tier) |
| Frontend    | Vanilla HTML, CSS, and JS — zero build step     |
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
├── server.js          # Express server, signal extraction, AI analysis
├── public/
│   └── index.html     # Frontend UI (dark theme, fun loading texts)
├── package.json       # Dependencies and scripts
├── railway.toml       # Railway deployment config
└── .env               # Environment variables (not committed)
```

---

## 🔧 Configuration

| Variable              | Required | Default                          | Description                          |
| --------------------- | -------- | -------------------------------- | ------------------------------------ |
| `OPENROUTER_API_KEY`  | ✅ Yes   | —                                | Your OpenRouter API key              |
| `OPENROUTER_MODEL`    | ❌ No    | `openai/gpt-oss-20b:free`        | Primary LLM model ID                 |
| `PORT`                | ❌ No    | `3000`                           | Server port                          |

---

## 🛡️ Notes & Limitations

- Only `http` and `https` URLs are accepted.
- Pages are fetched with a 15-second timeout and capped at 80,000 characters.
- Analysis quality depends on the selected LLM — free models are great for experimentation; swap in a paid model for production-grade reports.
- The `.env` file contains secrets — **never commit it to version control**.

---

## 📜 License

MIT — free to use, modify, and share. Build something cool. 🚀
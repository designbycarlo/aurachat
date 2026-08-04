const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { createOpenAI } = require('@ai-sdk/openai');
const { generateText } = require('ai');
const { generatePDFReport } = require('./generate-pdf');
const store = require('./data-store');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free';
const FALLBACK_MODELS = [
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'meta-llama/llama-4-maverick:free',
];

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 AI-SEO-Analyzer/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text.slice(0, 80000);
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }
}

function extractSignals(html, url) {
  const lower = html.toLowerCase();
  const get = (tag, attr, limit = 1) => {
    const regex = new RegExp(`<${tag}[^>]*${attr}=([\"'])(.*?)\\1`, 'gi');
    const matches = [];
    let m;
    while ((m = regex.exec(html)) && matches.length < limit) {
      matches.push(m[2]);
    }
    return matches;
  };
  const getContent = (tag, limit = 1) => {
    const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'gis');
    const matches = [];
    let m;
    while ((m = regex.exec(html)) && matches.length < limit) {
      matches.push(m[1].replace(/<[^>]+>/g, '').trim());
    }
    return matches;
  };
  const has = (pattern) => lower.includes(pattern.toLowerCase());

  const title = getContent('title', 1)[0] || '';
  const metaDescription = (get('meta', 'name="description"', 1)[0] || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const metaRobots = get('meta', 'name="robots"', 1)[0] || '';
  const canonical = get('link', 'rel="canonical"', 1)[0] || '';
  const ogTitle = get('meta', 'property="og:title"', 1)[0] || '';
  const ogDescription = get('meta', 'property="og:description"', 1)[0] || '';
  const ogImage = get('meta', 'property="og:image"', 1)[0] || '';
  const jsonLd = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  const headings = [];
  const hRegex = /<h([1-3])[^>]*>(.*?)<\/h\1>/gi;
  let hMatch;
  while ((hMatch = hRegex.exec(html)) && headings.length < 10) {
    headings.push({ level: hMatch[1], text: hMatch[2].replace(/<[^>]+>/g, '').trim() });
  }
  const plainText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;

  return {
    url,
    title,
    metaDescription,
    metaRobots,
    canonical,
    ogTitle,
    ogDescription,
    ogImage,
    hasJsonLd: jsonLd.length > 0,
    jsonLdCount: jsonLd.length,
    headings,
    wordCount,
    hasFAQ: has('faq') || has('frequently asked'),
    hasHowTo: has('how-to') || has('how to') || has('step-by-step'),
    hasSchemaOrg: html.includes('schema.org') || html.includes('schema.org'),
    hasAIAgentMarkers: has('ai:') || has('ai_') || has('assistant'),
    hasConversationalContent: plainText.includes('?') && plainText.includes('you'),
  };
}

function buildPrompt(signals) {
  return `You are an AI SEO / AEO (Answer Engine Optimization) analyst.

Analyze the following website signals and produce a JSON report with:
- score (0-100 integer, where 100 is perfectly optimized for AI-driven discovery like Google AI Overview, Perplexity, ChatGPT Search, etc.)
- grade (S, A, B, C, D, or F)
- summary (1-2 sentences explaining the overall readiness)
- strengths (array of strings)
- weaknesses (array of strings)
- recommendations (array of strings, prioritized)

Scoring heuristics:
- Title tag clear and concise: +10
- Meta description present and > 30 chars: +10
- Canonical tag present: +5
- Open Graph title + description: +10
- JSON-LD structured data present: +15
- Headings hierarchy (H1 present, logical H2/H3): +10
- Word count > 300: +5
- Word count > 800: +5
- FAQ section detected: +5
- How-to / step-by-step detected: +5
- Conversational / question-answering style: +5
- AI-agent markers (AI, assistant, chatbot friendly): +5
- Penalty: missing meta description or no H1: -5
- Penalty: duplicate OG and title same as title but no description: -3

Signals from the page:
- URL: ${signals.url}
- Title: ${signals.title}
- Meta Description: ${signals.metaDescription}
- Meta Robots: ${signals.metaRobots}
- Canonical: ${signals.canonical}
- OG Title: ${signals.ogTitle}
- OG Description: ${signals.ogDescription}
- OG Image: ${signals.ogImage}
- JSON-LD present: ${signals.hasJsonLd} (${signals.jsonLdCount} blocks)
- Headings: ${JSON.stringify(signals.headings)}
- Word count: ${signals.wordCount}
- FAQ detected: ${signals.hasFAQ}
- How-to detected: ${signals.hasHowTo}
- Schema.org detected: ${signals.hasSchemaOrg}
- AI-agent markers detected: ${signals.hasAIAgentMarkers}
- Conversational style detected: ${signals.hasConversationalContent}

Return ONLY a valid JSON object with these keys: score, grade, summary, strengths, weaknesses, recommendations.`;
}

async function analyzeWithModel(model, signals) {
  const result = await generateText({
    model: openrouter(model),
    prompt: buildPrompt(signals),
    temperature: 0.2,
    maxTokens: 1200,
  });
  const raw = result.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Model did not return JSON');
  return JSON.parse(jsonMatch[0]);
}

async function analyzeURL(url) {
  let html;
  try {
    html = await fetchPage(url);
  } catch (err) {
    return { error: err.message };
  }
  const signals = extractSignals(html, url);
  const models = [DEFAULT_MODEL, ...FALLBACK_MODELS];
  let lastError;
  for (const model of models) {
    try {
      const report = await analyzeWithModel(model, signals);
      return { ...report, signals };
    } catch (err) {
      lastError = err;
      console.error(`Model ${model} failed:`, err.message);
    }
  }
  return { error: `All models failed. Last error: ${lastError?.message}` };
}

app.post('/api/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  let parsed;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
  } catch {
    return res.status(400).json({ error: 'Please provide a valid http/https URL' });
  }
  try {
    const result = await analyzeURL(url);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/api/report/pdf', async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.signals) {
      return res.status(400).json({ error: 'Report data is required' });
    }
    const pdfBuffer = await generatePDFReport(data);
    const filename = `aurachat-seo-report-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'Failed to generate PDF report' });
  }
});

app.post('/api/report/csv', async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.signals) {
      return res.status(400).json({ error: 'Report data is required' });
    }
    const rows = [];
    rows.push(['Metric', 'Value']);
    rows.push(['Score', data.score ?? 0]);
    rows.push(['Grade', data.grade || '--']);
    rows.push(['URL', data.signals?.url || '']);
    rows.push(['Title', data.signals?.title || '']);
    rows.push(['Meta Description', data.signals?.metaDescription || '']);
    rows.push(['Canonical', data.signals?.canonical || '']);
    rows.push(['Open Graph Title', data.signals?.ogTitle || '']);
    rows.push(['Open Graph Description', data.signals?.ogDescription || '']);
    rows.push(['Has JSON-LD', data.signals?.hasJsonLd ? 'Yes' : 'No']);
    rows.push(['JSON-LD Blocks', data.signals?.jsonLdCount || 0]);
    rows.push(['Word Count', data.signals?.wordCount || 0]);
    rows.push(['Has FAQ', data.signals?.hasFAQ ? 'Yes' : 'No']);
    rows.push(['Has How-to', data.signals?.hasHowTo ? 'Yes' : 'No']);
    rows.push(['Has Schema.org', data.signals?.hasSchemaOrg ? 'Yes' : 'No']);
    rows.push(['Conversational Content', data.signals?.hasConversationalContent ? 'Yes' : 'No']);
    rows.push(['AI Agent Markers', data.signals?.hasAIAgentMarkers ? 'Yes' : 'No']);
    rows.push(['Headings', JSON.stringify(data.signals?.headings || [])]);
    rows.push([]);
    rows.push(['Strengths', '']);
    (data.strengths || []).forEach((s) => rows.push([s, '']));
    rows.push([]);
    rows.push(['Weaknesses', '']);
    (data.weaknesses || []).forEach((w) => rows.push([w, '']));
    rows.push([]);
    rows.push(['Recommendations', '']);
    (data.recommendations || []).forEach((r) => rows.push([r, '']));

    const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const buffer = Buffer.from(csvContent, 'utf-8');
    const filename = `aurachat-seo-report-${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('CSV generation error:', err);
    res.status(500).json({ error: 'Failed to generate CSV report' });
  }
});

const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------------ *
 * Auth + saved reports
 * ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const user = token ? store.userForToken(token) : null;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  req.token = token;
  next();
}

function publicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

app.post('/api/auth/register', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (store.findByEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const user = store.createUser(email, password);
  const token = store.createSession(user.id);
  res.status(201).json({ user: publicUser(user), token });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = store.findByEmail(email);
  if (!user || !store.safeEqual(store.hashPassword(password, user.salt), user.passHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = store.createSession(user.id);
  res.json({ user: publicUser(user), token });
});

app.post('/api/auth/logout', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (token) store.destroySession(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const user = token ? store.userForToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: publicUser(user) });
});

/* Saved personalized reports — always tied to the authenticated user */

app.post('/api/reports', requireAuth, (req, res) => {
  const report = req.body;
  if (!report || typeof report !== 'object' || !report.signals || typeof report.signals !== 'object') {
    return res.status(400).json({ error: 'Report data is required' });
  }
  const saved = store.addReport(req.user.id, report);
  res.status(201).json({ id: saved.id, createdAt: saved.createdAt });
});

app.get('/api/reports', requireAuth, (req, res) => {
  res.json({ reports: store.listReports(req.user.id) });
});

app.get('/api/reports/:id', requireAuth, (req, res) => {
  const rec = store.getReport(req.user.id, req.params.id);
  if (!rec) return res.status(404).json({ error: 'Report not found' });
  res.json({ report: rec.report });
});

app.delete('/api/reports/:id', requireAuth, (req, res) => {
  if (!store.deleteReport(req.user.id, req.params.id)) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI SEO/AEO Analyzer running at http://0.0.0.0:${PORT}`);
});

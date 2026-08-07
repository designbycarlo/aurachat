// Analyze engine — ported from server.js. Runs inside the Pages/Workers runtime.
//
// Original server.js used the `@ai-sdk/openai` SDK pointed at OpenRouter. That SDK
// pulls in Node-only dependencies that don't build for Workers, so here we call the
// OpenRouter Chat Completions endpoint directly via the platform `fetch`. The model
// behavior (system instructions, scoring heuristics, JSON-only response) is unchanged.

const DEFAULT_MODEL = (typeof process !== 'undefined' && process.env.OPENROUTER_MODEL) || 'openai/gpt-oss-20b:free';
const FALLBACK_MODELS = [
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'meta-llama/llama-4-maverick:free',
];

export async function fetchPage(url, env) {
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

// Ported verbatim from server.js:extractSignals.
export function extractSignals(html, url) {
  const lower = html.toLowerCase();
  const get = (tag, attr, limit = 1) => {
    const regex = new RegExp(`<${tag}[^>]*${attr}=([\\"'])(.*?)\\1`, 'gi');
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
  const metaDescription = (get('meta', 'name="description"', 1)[0] || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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
  const plainText = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

// Ported verbatim from server.js:buildPrompt.
export function buildPrompt(signals) {
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

// Call OpenRouter Chat Completions. Mirrors analyzeWithModel(model, signals).
async function analyzeWithModel(model, signals, env) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');
  const timeoutMs = Number(env.OPENROUTER_TIMEOUT_MS) || 60000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aurachat-aeo.pages.dev',
        'X-Title': 'AuraChat AEO Analyzer',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: buildPrompt(signals) }],
        temperature: 0.2,
        max_tokens: 1200,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`OpenRouter request timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = (data?.choices?.[0]?.message?.content || '').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Model did not return JSON');
  return JSON.parse(jsonMatch[0]);
}

// Ported from server.js:analyzeURL — same multi-model fallback behavior.
export async function analyzeURL(url, env) {
  let html;
  try {
    html = await fetchPage(url, env);
  } catch (err) {
    return { error: err.message };
  }
  const signals = extractSignals(html, url);
  const models = [(env && env.OPENROUTER_MODEL) || DEFAULT_MODEL, ...FALLBACK_MODELS];
  let lastError;
  for (const model of models) {
    try {
      const report = await analyzeWithModel(model, signals, env);
      return { ...report, signals };
    } catch (err) {
      lastError = err;
      console.error(`Model ${model} failed:`, err.message);
    }
  }
  return { error: `All models failed. Last error: ${lastError?.message}` };
}

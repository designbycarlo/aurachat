const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

/* ------------------------------------------------------------------ *
 * Assets
 * ------------------------------------------------------------------ */

const FONTS_DIR = path.join(__dirname, 'fonts');
const PUBLIC_DIR = path.join(__dirname, 'public');

const FONT_FILES = {
  light: ['Geist Light', 'Geist-Light.ttf'],
  regular: ['Geist Regular', 'Geist-Regular.ttf'],
  medium: ['Geist Medium', 'Geist-Medium.ttf'],
  semibold: ['Geist SemiBold', 'Geist-SemiBold.ttf'],
  bold: ['Geist Bold', 'Geist-Bold.ttf'],
};

// Font aliases used throughout the layout. Fall back to the PDF base fonts if
// the bundled Geist files are unavailable so a report is still produced.
const F = {
  light: 'Geist Light',
  regular: 'Geist Regular',
  medium: 'Geist Medium',
  semibold: 'Geist SemiBold',
  bold: 'Geist Bold',
};

const FALLBACK_F = {
  light: 'Helvetica',
  regular: 'Helvetica',
  medium: 'Helvetica',
  semibold: 'Helvetica-Bold',
  bold: 'Helvetica-Bold',
};

/**
 * Fonts must be registered on every document instance -- registration state
 * lives on the document, not on the module. Returns the font-name map that is
 * safe to use for this document.
 */
function registerFonts(doc) {
  let ok = true;
  for (const [key, [name, file]] of Object.entries(FONT_FILES)) {
    const fontPath = path.join(FONTS_DIR, file);
    if (!fs.existsSync(fontPath)) {
      ok = false;
      continue;
    }
    try {
      doc.registerFont(name, fontPath);
    } catch {
      ok = false;
    }
    void key;
  }
  return ok ? F : FALLBACK_F;
}

function findLogo() {
  const candidates = ['icon-192.png', 'favicon-32.png', 'apple-touch-icon.png'];
  for (const file of candidates) {
    const candidate = path.join(PUBLIC_DIR, file);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Design tokens
 * ------------------------------------------------------------------ */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2; // 532
const GUTTER = 11;

const C = {
  ink: '#0F172A',
  body: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  hairline: '#E4E8EF',
  surface: '#FFFFFF',
  wash: '#F7F9FC',
  accent: '#4F46E5',
  accentWash: '#EEF0FE',
  success: '#15803D',
  successWash: '#EDFBF1',
  danger: '#BE123C',
  dangerWash: '#FFF1F3',
  white: '#FFFFFF',
};

const BANDS = [
  { min: 85, label: 'Exceptional', color: '#15803D', wash: '#EDFBF1' },
  { min: 70, label: 'Strong', color: '#0E7490', wash: '#ECFBFD' },
  { min: 55, label: 'Developing', color: '#B45309', wash: '#FFF8EC' },
  { min: 40, label: 'Needs Work', color: '#C2410C', wash: '#FFF4ED' },
  { min: -Infinity, label: 'Critical', color: '#BE123C', wash: '#FFF1F3' },
];

function scoreBand(score) {
  return BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1];
}

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

function truncate(text, max) {
  if (!text) return '';
  const value = String(text);
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trim() + '\u2026';
}

/** Truncate to a pixel width using real glyph metrics. */
function fitText(doc, text, font, size, maxWidth) {
  const value = String(text || '');
  doc.font(font).fontSize(size);
  if (doc.widthOfString(value) <= maxWidth) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = value.slice(0, mid).trimEnd() + '\u2026';
    if (doc.widthOfString(candidate) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return value.slice(0, low).trimEnd() + '\u2026';
}

function lineHeight(doc, font, size, lineGap = 0) {
  doc.font(font).fontSize(size);
  return doc.currentLineHeight(true) + lineGap;
}

/* ------------------------------------------------------------------ *
 * Primitive widgets
 * ------------------------------------------------------------------ */

function card(doc, x, y, w, h, opts = {}) {
  const radius = opts.radius ?? 8;
  doc.save();
  doc.roundedRect(x, y, w, h, radius).fill(opts.fill || C.surface);
  doc.lineWidth(opts.lineWidth ?? 0.7);
  doc.roundedRect(x, y, w, h, radius).stroke(opts.border || C.hairline);
  if (opts.accent) {
    // Accent rail along the top edge, clipped to the rounded corner radius.
    doc.save();
    doc.roundedRect(x, y, w, h, radius).clip();
    doc.rect(x, y, w, 2.4).fill(opts.accent);
    doc.restore();
  }
  doc.restore();
}

function eyebrow(doc, fonts, text, x, y, color, size = 6.4) {
  doc
    .font(fonts.semibold)
    .fontSize(size)
    .fillColor(color || C.faint)
    .text(String(text).toUpperCase(), x, y, {
      characterSpacing: 0.85,
      lineBreak: false,
    });
}

function pill(doc, fonts, text, x, y, opts = {}) {
  const size = opts.size ?? 6.6;
  const padX = opts.padX ?? 6;
  const h = opts.height ?? 13;
  doc.font(fonts.semibold).fontSize(size);
  const w = opts.width ?? doc.widthOfString(String(text)) + padX * 2 + (opts.characterSpacing || 0.6) * String(text).length;
  doc.save();
  doc.roundedRect(x, y, w, h, h / 2).fill(opts.fill || C.accentWash);
  if (opts.border) {
    doc.lineWidth(0.6).roundedRect(x, y, w, h, h / 2).stroke(opts.border);
  }
  doc.restore();
  doc
    .font(fonts.semibold)
    .fontSize(size)
    .fillColor(opts.color || C.accent)
    .text(String(text), x, y + (h - size) / 2 - 0.6, {
      width: w,
      align: 'center',
      characterSpacing: opts.characterSpacing ?? 0.6,
      lineBreak: false,
    });
  return w;
}

function checkGlyph(doc, cx, cy, size, color) {
  const s = size;
  doc.save();
  doc.lineWidth(Math.max(1, s * 0.22)).lineCap('round').lineJoin('round');
  doc.moveTo(cx - s * 0.5, cy + s * 0.02);
  doc.lineTo(cx - s * 0.12, cy + s * 0.42);
  doc.lineTo(cx + s * 0.52, cy - s * 0.4);
  doc.stroke(color);
  doc.restore();
}

function crossGlyph(doc, cx, cy, size, color) {
  const s = size * 0.42;
  doc.save();
  doc.lineWidth(Math.max(1, size * 0.2)).lineCap('round');
  doc.moveTo(cx - s, cy - s).lineTo(cx + s, cy + s);
  doc.moveTo(cx + s, cy - s).lineTo(cx - s, cy + s);
  doc.stroke(color);
  doc.restore();
}

function arrowGlyph(doc, cx, cy, size, color) {
  const s = size * 0.45;
  doc.save();
  doc.lineWidth(Math.max(1, size * 0.2)).lineCap('round').lineJoin('round');
  doc.moveTo(cx - s * 0.9, cy).lineTo(cx + s * 0.7, cy);
  doc.moveTo(cx + s * 0.05, cy - s * 0.65).lineTo(cx + s * 0.75, cy).lineTo(cx + s * 0.05, cy + s * 0.65);
  doc.stroke(color);
  doc.restore();
}

/** Progress ring drawn with an SVG arc path (0..1). */
function ring(doc, cx, cy, radius, progress, opts = {}) {
  const width = opts.width ?? 8;
  doc.save();
  doc.lineWidth(width);
  doc.circle(cx, cy, radius).stroke(opts.track || '#EDF1F7');
  const pct = Math.max(0, Math.min(1, progress));
  if (pct > 0) {
    doc.lineCap('round');
    if (pct >= 0.999) {
      doc.circle(cx, cy, radius).stroke(opts.color || C.accent);
    } else {
      const start = -Math.PI / 2;
      const end = start + Math.PI * 2 * pct;
      const x0 = cx + radius * Math.cos(start);
      const y0 = cy + radius * Math.sin(start);
      const x1 = cx + radius * Math.cos(end);
      const y1 = cy + radius * Math.sin(end);
      const large = pct > 0.5 ? 1 : 0;
      doc
        .path(`M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`)
        .stroke(opts.color || C.accent);
    }
  }
  doc.restore();
}

function meterBar(doc, x, y, w, h, progress, color, track) {
  const pct = Math.max(0, Math.min(1, progress));
  doc.save();
  doc.roundedRect(x, y, w, h, h / 2).fill(track || '#EDF1F7');
  if (pct > 0) {
    doc.roundedRect(x, y, Math.max(h, w * pct), h, h / 2).fill(color || C.accent);
  }
  doc.restore();
}

/* ------------------------------------------------------------------ *
 * Data shaping
 * ------------------------------------------------------------------ */

function buildSignalChecks(signals) {
  const headings = Array.isArray(signals.headings) ? signals.headings : [];
  return [
    { label: 'Title Tag', ok: !!signals.title },
    { label: 'Meta Desc.', ok: !!signals.metaDescription },
    { label: 'Canonical', ok: !!signals.canonical },
    { label: 'Open Graph', ok: !!(signals.ogTitle || signals.ogDescription) },
    { label: 'JSON-LD', ok: !!signals.hasJsonLd },
    { label: 'Headings', ok: headings.length > 0 },
    { label: 'FAQ / How-to', ok: !!(signals.hasFAQ || signals.hasHowTo) },
    { label: 'Conversational', ok: !!signals.hasConversationalContent },
    { label: 'Schema.org', ok: !!signals.hasSchemaOrg },
    { label: 'AI Markers', ok: !!signals.hasAIAgentMarkers },
  ];
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function cleanItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item == null ? '' : item).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * List fitting -- guarantees the report stays on one page
 * ------------------------------------------------------------------ */

const LIST_PAD_TOP = 10;
const LIST_HEADER_H = 15;
const LIST_PAD_BOTTOM = 10;
const ITEM_GAP = 5;
const META_MIN_H = 80;
const META_MAX_H = 190;

function measureList(doc, fonts, items, width, style) {
  const cap = lineHeight(doc, fonts.regular, style.fontSize, style.lineGap) * style.maxLines;
  return items.map((text) => {
    doc.font(fonts.regular).fontSize(style.fontSize);
    const natural = Math.max(1, doc.heightOfString(text, { width, lineGap: style.lineGap }));
    const height = Math.max(style.minItemHeight || 0, Math.min(natural, cap));
    return { text, height, natural, shownRatio: Math.min(1, cap / natural) };
  });
}

function listHeight(measured, count) {
  let h = LIST_PAD_TOP + LIST_HEADER_H;
  for (let i = 0; i < count; i++) {
    h += measured[i].height + (i < count - 1 ? ITEM_GAP : 0);
  }
  return h + LIST_PAD_BOTTOM;
}

/**
 * Chooses the type scale and how many items each panel shows so the three list
 * widgets always fit the space left on page one.
 *
 * Candidate scales are tried from most generous to most compact; the winner is
 * the one that surfaces the most content, with ties broken toward the larger
 * type. That means a short report is set in comfortable 9pt while a dense one
 * tightens up rather than silently dropping recommendations.
 */
function fitPanels(doc, fonts, panels, available, rowGap) {
  const scales = [
    { fontSize: 9, lineGap: 2.3, maxLines: 3 },
    { fontSize: 8.4, lineGap: 1.9, maxLines: 3 },
    { fontSize: 8, lineGap: 1.5, maxLines: 2 },
    { fontSize: 7.6, lineGap: 1.2, maxLines: 2 },
    { fontSize: 7.2, lineGap: 1, maxLines: 1 },
  ];

  let best = null;

  scales.forEach((scale, scaleIndex) => {
    const state = panels.map((panel) => {
      const measured = measureList(doc, fonts, panel.items, panel.textWidth, {
        ...scale,
        minItemHeight: 10,
      });
      return {
        ...panel,
        scale,
        measured,
        count: Math.min(panel.items.length, panel.maxItems),
      };
    });

    const buildRows = () => {
      // Panels sharing a row are laid out side by side and share one height.
      const groups = new Map();
      for (const panel of state) {
        if (!groups.has(panel.row)) groups.set(panel.row, []);
        groups.get(panel.row).push(panel);
      }
      return [...groups.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([row, members]) => ({
          row,
          members,
          height: Math.max(
            ...members.map((m) => listHeight(m.measured, m.count))
          ),
        }));
    };

    const totalFor = (rows) =>
      rows.reduce((sum, r) => sum + r.height, 0) + rowGap * (rows.length - 1);

    let rows = buildRows();
    let total = totalFor(rows);
    let guard = 0;

    while (total > available && guard++ < 80) {
      // Trim an item from the panel that currently *drives* the tallest row --
      // trimming a shorter side-by-side panel would lose content without
      // reclaiming any height.
      let target = null;
      for (const row of rows) {
        for (const panel of row.members) {
          if (panel.count <= panel.minItems) continue;
          if (listHeight(panel.measured, panel.count) < row.height - 0.01) continue;
          if (!target || row.height > target.rowHeight) target = { panel, rowHeight: row.height };
        }
      }
      if (!target) break;
      target.panel.count -= 1;
      rows = buildRows();
      total = totalFor(rows);
    }

    // Prefer the candidate that renders the most actual text, nudged toward
    // the larger type scale so a dense report degrades gracefully instead of
    // collapsing straight to tiny one-line bullets.
    const rendered = state.reduce((sum, p) => {
      let chars = 0;
      for (let i = 0; i < p.count; i++) {
        chars += p.measured[i].text.length * p.measured[i].shownRatio;
      }
      return sum + chars;
    }, 0);

    const candidate = {
      rows,
      total,
      quality: rendered * (1 - 0.02 * scaleIndex),
      fits: total <= available,
    };

    if (!best) {
      best = candidate;
      return;
    }
    if (best.fits !== candidate.fits) {
      if (candidate.fits) best = candidate;
      return;
    }
    if (!candidate.fits) {
      if (candidate.total < best.total) best = candidate;
      return;
    }
    if (candidate.quality > best.quality) best = candidate;
  });

  return best;
}

/* ------------------------------------------------------------------ *
 * Section renderers
 *
 * Each renderer draws one horizontal band of the dashboard and returns the
 * y coordinate where the next band starts, so the page composes top-down.
 * ------------------------------------------------------------------ */

function drawHeader(doc, fonts, y, timestamp) {
  const logo = findLogo();
  const brandX = logo ? MARGIN + 30 : MARGIN;

  if (logo) {
    doc.save();
    doc.roundedRect(MARGIN, y, 24, 24, 6).clip();
    doc.image(logo, MARGIN, y, { width: 24, height: 24 });
    doc.restore();
  }

  doc
    .font(fonts.semibold)
    .fontSize(13)
    .fillColor(C.ink)
    .text('aurachat', brandX, y + 1, { lineBreak: false, characterSpacing: -0.3 });
  doc
    .font(fonts.medium)
    .fontSize(7.2)
    .fillColor(C.muted)
    .text('AI SEO / AEO READINESS REPORT', brandX, y + 15, {
      characterSpacing: 0.7,
      lineBreak: false,
    });

  doc
    .font(fonts.medium)
    .fontSize(7.6)
    .fillColor(C.muted)
    .text(timestamp, PAGE_W - MARGIN - 160, y + 2, {
      width: 160,
      align: 'right',
      lineBreak: false,
    });
  doc
    .font(fonts.regular)
    .fontSize(7)
    .fillColor(C.faint)
    .text('Generated by AuraChat', PAGE_W - MARGIN - 160, y + 14, {
      width: 160,
      align: 'right',
      lineBreak: false,
    });

  const ruleY = y + 32;
  doc.save().lineWidth(0.7).moveTo(MARGIN, ruleY).lineTo(PAGE_W - MARGIN, ruleY).stroke(C.hairline).restore();

  return ruleY + GUTTER + 2;
}

function drawHeroRow(doc, fonts, y, report) {
  const { score, grade, band, summary, signals } = report;
  const heroH = 138;
  const scoreW = 166;
  const verdictX = MARGIN + scoreW + GUTTER;
  const verdictW = CONTENT_W - scoreW - GUTTER;

  /* Score widget */
  card(doc, MARGIN, y, scoreW, heroH, { accent: band.color });
  eyebrow(doc, fonts, 'Readiness Score', MARGIN + 12, y + 13);

  const ringCy = y + 66;
  ring(doc, MARGIN + scoreW / 2, ringCy, 29, score / 100, { width: 8, color: band.color });

  doc
    .font(fonts.bold)
    .fontSize(24)
    .fillColor(C.ink)
    .text(String(score), MARGIN, ringCy - 12, { width: scoreW, align: 'center', lineBreak: false });
  doc
    .font(fonts.medium)
    .fontSize(6.4)
    .fillColor(C.faint)
    .text('OUT OF 100', MARGIN, ringCy + 12, {
      width: scoreW,
      align: 'center',
      characterSpacing: 0.6,
      lineBreak: false,
    });

  // Grade chip and verdict word are centred together as one pair.
  const gradeLabel = `GRADE ${grade}`;
  const bandLabel = band.label.toUpperCase();
  doc.font(fonts.semibold).fontSize(7);
  const gradeW = doc.widthOfString(gradeLabel) + 16;
  const bandW = doc.widthOfString(bandLabel) + 16;
  const pairX = MARGIN + (scoreW - (gradeW + 6 + bandW)) / 2;
  const pairY = y + heroH - 29;

  pill(doc, fonts, gradeLabel, pairX, pairY, {
    width: gradeW,
    height: 15,
    size: 7,
    fill: C.ink,
    color: C.white,
    characterSpacing: 0.7,
  });
  pill(doc, fonts, bandLabel, pairX + gradeW + 6, pairY, {
    width: bandW,
    height: 15,
    size: 7,
    fill: band.wash,
    color: band.color,
    characterSpacing: 0.7,
  });

  /* Analyzed page + executive summary widget */
  card(doc, verdictX, y, verdictW, heroH);
  const pad = 13;
  const inner = verdictW - pad * 2;

  eyebrow(doc, fonts, 'Analyzed Page', verdictX + pad, y + 12);
  doc
    .font(fonts.semibold)
    .fontSize(9.6)
    .fillColor(C.ink)
    .text(
      signals.title ? fitText(doc, signals.title, fonts.semibold, 9.6, inner) : 'Untitled page',
      verdictX + pad,
      y + 24,
      { width: inner, lineBreak: false }
    );
  doc
    .font(fonts.regular)
    .fontSize(7.6)
    .fillColor(C.accent)
    .text(fitText(doc, signals.url || 'N/A', fonts.regular, 7.6, inner), verdictX + pad, y + 38, {
      width: inner,
      lineBreak: false,
    });

  doc
    .save()
    .lineWidth(0.7)
    .moveTo(verdictX + pad, y + 52)
    .lineTo(verdictX + verdictW - pad, y + 52)
    .stroke(C.hairline)
    .restore();

  eyebrow(doc, fonts, 'Executive Summary', verdictX + pad, y + 60);
  const summaryTop = y + 71;
  doc
    .font(fonts.regular)
    .fontSize(8.4)
    .fillColor(C.body)
    .text(summary, verdictX + pad, summaryTop, {
      width: inner,
      height: y + heroH - pad + 1 - summaryTop,
      lineGap: 2,
      ellipsis: true,
    });

  return y + heroH + GUTTER;
}

function drawSignalWidget(doc, fonts, y, report) {
  const { checks, passed, coverage, band } = report;
  const cols = 5;
  const rows = Math.ceil(checks.length / cols);
  const gap = 7;
  const pad = 12;
  const chipW = (CONTENT_W - pad * 2 - gap * (cols - 1)) / cols;
  const chipH = 23;
  const height = pad + 22 + rows * chipH + (rows - 1) * gap + pad - 2;

  card(doc, MARGIN, y, CONTENT_W, height);
  eyebrow(doc, fonts, 'Signal Coverage', MARGIN + pad, y + 13);

  const meterW = 84;
  const meterX = PAGE_W - MARGIN - pad - meterW;
  doc
    .font(fonts.semibold)
    .fontSize(7.4)
    .fillColor(C.ink)
    .text(`${passed}/${checks.length} SIGNALS PRESENT`, MARGIN, y + 12, {
      width: meterX - MARGIN - 8,
      align: 'right',
      characterSpacing: 0.5,
      lineBreak: false,
    });
  meterBar(doc, meterX, y + 13.5, meterW, 5, coverage, band.color);

  const chipTop = y + pad + 22;
  checks.forEach((check, i) => {
    const cx = MARGIN + pad + (i % cols) * (chipW + gap);
    const cy = chipTop + Math.floor(i / cols) * (chipH + gap);

    doc.save();
    doc.roundedRect(cx, cy, chipW, chipH, 5).fill(check.ok ? C.successWash : C.wash);
    doc.lineWidth(0.6).roundedRect(cx, cy, chipW, chipH, 5).stroke(check.ok ? '#CFEEDA' : C.hairline);
    doc.restore();

    const iconCx = cx + 12;
    const iconCy = cy + chipH / 2;
    doc.save().circle(iconCx, iconCy, 6).fill(check.ok ? '#DCF5E5' : '#ECEFF4').restore();
    if (check.ok) checkGlyph(doc, iconCx, iconCy, 5.6, C.success);
    else crossGlyph(doc, iconCx, iconCy, 5.6, C.faint);

    const labelW = chipW - 25;
    doc
      .font(fonts.medium)
      .fontSize(6.6)
      .fillColor(check.ok ? C.ink : C.muted)
      .text(fitText(doc, check.label, fonts.medium, 6.6, labelW), cx + 21, iconCy - 3.4, {
        width: labelW,
        lineBreak: false,
      });
  });

  return y + height + GUTTER;
}

function drawStatRow(doc, fonts, y, report) {
  const { signals, passed, checks, coverage } = report;
  const headings = Array.isArray(signals.headings) ? signals.headings : [];
  const h1Count = headings.filter((h) => String(h.level) === '1').length;
  const words = Number(signals.wordCount || 0);

  const stats = [
    {
      label: 'Word Count',
      value: formatNumber(words),
      note: words >= 800 ? 'In-depth coverage' : words >= 300 ? 'Adequate depth' : 'Thin content',
    },
    {
      label: 'JSON-LD Blocks',
      value: formatNumber(signals.jsonLdCount),
      note: signals.hasJsonLd ? 'Machine readable' : 'None found',
    },
    {
      label: 'Headings Found',
      value: formatNumber(headings.length),
      note: h1Count ? `${h1Count} H1 detected` : 'No H1 detected',
    },
    {
      label: 'Signal Coverage',
      value: `${Math.round(coverage * 100)}%`,
      note: `${passed} of ${checks.length} present`,
    },
  ];

  const statW = (CONTENT_W - GUTTER * (stats.length - 1)) / stats.length;
  const statH = 50;

  stats.forEach((stat, i) => {
    const x = MARGIN + i * (statW + GUTTER);
    card(doc, x, y, statW, statH, { fill: C.wash });
    eyebrow(doc, fonts, stat.label, x + 11, y + 10);
    doc
      .font(fonts.bold)
      .fontSize(15)
      .fillColor(C.ink)
      .text(stat.value, x + 11, y + 21, { width: statW - 22, lineBreak: false });
    doc
      .font(fonts.regular)
      .fontSize(6.6)
      .fillColor(C.faint)
      .text(fitText(doc, stat.note, fonts.regular, 6.6, statW - 22), x + 11, y + 38, {
        width: statW - 22,
        lineBreak: false,
      });
  });

  return y + statH + GUTTER;
}

/**
 * Draws the strengths / weaknesses / recommendations widgets, plus a metadata
 * widget when the narrative content leaves room for it, filling the page
 * exactly down to the footer rule.
 */
function drawListSection(doc, fonts, y, report, bottom) {
  const available = bottom - y;
  const halfW = (CONTENT_W - GUTTER) / 2;
  const padX = 12;
  const indent = 20;

  const panels = [
    {
      row: 0,
      title: 'Strengths',
      accent: C.success,
      marker: 'check',
      items: report.strengths.length
        ? report.strengths
        : ['No standout strengths were detected on this page.'],
      maxItems: 5,
      minItems: 2,
      x: MARGIN,
      width: halfW,
      textWidth: halfW - padX * 2 - indent,
    },
    {
      row: 0,
      title: 'Weaknesses',
      accent: C.danger,
      marker: 'arrow',
      items: report.weaknesses.length
        ? report.weaknesses
        : ['No blocking weaknesses were detected.'],
      maxItems: 5,
      minItems: 2,
      x: MARGIN + halfW + GUTTER,
      width: halfW,
      textWidth: halfW - padX * 2 - indent,
    },
    {
      row: 1,
      title: 'Prioritized Recommendations',
      accent: C.accent,
      numbered: true,
      items: report.recommendations.length
        ? report.recommendations
        : ['Re-run the analysis to generate recommendations.'],
      maxItems: 6,
      minItems: 2,
      x: MARGIN,
      width: CONTENT_W,
      textWidth: CONTENT_W - padX * 2 - indent - 6,
    },
  ];

  const { rows } = fitPanels(doc, fonts, panels, available, GUTTER);

  // A sparse report would otherwise stretch two sentences over half a page, so
  // any surplus beyond the widgets is handed to the metadata widget instead.
  const naturalTotal = rows.reduce((sum, r) => sum + r.height, 0);
  const used = naturalTotal + GUTTER * (rows.length - 1);
  const leftover = available - used - GUTTER;
  const metaH = leftover >= META_MIN_H ? Math.min(leftover, META_MAX_H) : 0;

  const listsAvailable = metaH ? available - metaH - GUTTER : available;
  const slack = Math.max(0, listsAvailable - used);

  let rowY = y;
  rows.forEach((row, i) => {
    const isLast = i === rows.length - 1;
    const grow = naturalTotal ? slack * (row.height / naturalTotal) : 0;
    const rowH = isLast ? Math.max(y + listsAvailable - rowY, 48) : row.height + grow;
    for (const panel of row.members) {
      drawPanel(doc, fonts, panel, panel.x, rowY, panel.width, rowH, { padX, indent });
    }
    rowY += rowH + GUTTER;
  });

  if (metaH) {
    drawMetaPanel(doc, fonts, report.signals, MARGIN, rowY, CONTENT_W, bottom - rowY);
  }
}

function drawFooter(doc, fonts, footerTop, signals) {
  doc
    .save()
    .lineWidth(0.7)
    .moveTo(MARGIN, footerTop)
    .lineTo(PAGE_W - MARGIN, footerTop)
    .stroke(C.hairline)
    .restore();

  doc
    .font(fonts.regular)
    .fontSize(6.8)
    .fillColor(C.faint)
    .text(
      `AuraChat \u00b7 AI SEO / AEO Analyzer \u00b7 ${truncate(signals.url || '', 58)}`,
      MARGIN,
      footerTop + 7,
      { width: CONTENT_W - 90, lineBreak: false }
    );

  doc
    .font(fonts.medium)
    .fontSize(6.8)
    .fillColor(C.faint)
    .text('Page 1 of 1', PAGE_W - MARGIN - 90, footerTop + 7, {
      width: 90,
      align: 'right',
      lineBreak: false,
    });
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

function generatePDFReport(data = {}) {
  return new Promise((resolve, reject) => {
    try {
      const signals = data.signals || {};
      const checks = buildSignalChecks(signals);
      const passed = checks.filter((c) => c.ok).length;
      const score = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));

      const report = {
        signals,
        checks,
        passed,
        coverage: passed / checks.length,
        score,
        band: scoreBand(score),
        grade: String(data.grade || '--').trim().toUpperCase().slice(0, 2),
        summary: String(data.summary || 'No summary was returned for this analysis.')
          .replace(/\s+/g, ' ')
          .trim(),
        strengths: cleanItems(data.strengths),
        weaknesses: cleanItems(data.weaknesses),
        recommendations: cleanItems(data.recommendations),
      };

      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 0,
        info: {
          Title: `AI SEO / AEO Readiness Report \u2014 ${truncate(signals.url || 'AuraChat Analysis', 80)}`,
          Author: 'AuraChat',
          Subject: 'AI SEO & AEO Readiness Report',
          Keywords:
            'SEO, AEO, AI Readiness, Search Engine Optimization, Answer Engine Optimization, AI Discovery',
          Creator: 'AuraChat AI SEO/AEO Analyzer',
        },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fonts = registerFonts(doc);

      // The report is a single-page artefact by design: the layout is measured
      // to fit, and this guard makes an orphaned second page impossible even if
      // an unexpected input slips past the fitting pass.
      doc.__overflowed = false;
      doc.addPage = function blockedAddPage() {
        this.__overflowed = true;
        return this;
      };

      const timestamp = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.white);

      const footerTop = PAGE_H - MARGIN - 20;
      let y = MARGIN;
      y = drawHeader(doc, fonts, y, timestamp);
      y = drawHeroRow(doc, fonts, y, report);
      y = drawSignalWidget(doc, fonts, y, report);
      y = drawStatRow(doc, fonts, y, report);
      drawListSection(doc, fonts, y, report, footerTop - 12);
      drawFooter(doc, fonts, footerTop, signals);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/* ------------------------------------------------------------------ *
 * List widget renderer
 * ------------------------------------------------------------------ */

function drawPanel(doc, fonts, panel, x, y, w, h, opts) {
  const padX = opts.padX;
  const indent = opts.indent;
  const scale = panel.scale;

  card(doc, x, y, w, h, { accent: panel.accent });

  eyebrow(doc, fonts, panel.title, x + padX, y + 13, panel.accent);

  const shown = panel.count;
  const hidden = panel.items.length - shown;
  if (hidden > 0) {
    doc
      .font(fonts.medium)
      .fontSize(6.4)
      .fillColor(C.faint)
      .text(`+${hidden} MORE`, x + w - padX - 60, y + 13, {
        width: 60,
        align: 'right',
        characterSpacing: 0.5,
        lineBreak: false,
      });
  }

  let itemY = y + LIST_PAD_TOP + LIST_HEADER_H;
  const textX = x + padX + indent + (panel.numbered ? 6 : 0);
  const textW = panel.textWidth;

  // Spread any surplus height across the rows so a short list breathes instead
  // of leaving a dead zone at the bottom of the widget.
  const contentH = listHeight(panel.measured, shown) - LIST_PAD_TOP - LIST_HEADER_H - LIST_PAD_BOTTOM;
  const surplus = Math.max(0, h - (contentH + LIST_PAD_TOP + LIST_HEADER_H + LIST_PAD_BOTTOM));
  const gap = ITEM_GAP + (shown > 1 ? Math.min(7, surplus / (shown - 1)) : 0);

  // Content is clipped to the widget so a widget can never bleed into its
  // neighbours or the footer, whatever the analysis returns.
  doc.save();
  doc.roundedRect(x, y, w, h, 8).clip();

  for (let i = 0; i < shown; i++) {
    const item = panel.measured[i];
    const centerY = itemY + scale.fontSize * 0.55;

    if (panel.numbered) {
      const badgeW = 17;
      const badgeH = 13;
      doc.save();
      doc.roundedRect(x + padX, itemY - 1.5, badgeW, badgeH, 3.5).fill(i < 2 ? C.accent : C.accentWash);
      doc.restore();
      doc
        .font(fonts.bold)
        .fontSize(7)
        .fillColor(i < 2 ? C.white : C.accent)
        .text(`P${i + 1}`, x + padX, itemY + 1.4, {
          width: badgeW,
          align: 'center',
          lineBreak: false,
        });
    } else if (panel.marker === 'check') {
      doc.save().circle(x + padX + 6, centerY, 5.4).fill(C.successWash).restore();
      checkGlyph(doc, x + padX + 6, centerY, 5.2, C.success);
    } else {
      doc.save().circle(x + padX + 6, centerY, 5.4).fill(C.dangerWash).restore();
      arrowGlyph(doc, x + padX + 6, centerY, 5.6, C.danger);
    }

    doc
      .font(fonts.regular)
      .fontSize(scale.fontSize)
      .fillColor(C.body)
      .text(item.text, textX, itemY, {
        width: textW,
        height: item.height,
        lineGap: scale.lineGap,
        ellipsis: true,
      });

    itemY += item.height + gap;
  }

  doc.restore();
}

/* ------------------------------------------------------------------ *
 * Metadata widget -- raw tag values, used to fill spare vertical space
 * ------------------------------------------------------------------ */

function drawMetaPanel(doc, fonts, signals, x, y, w, h) {
  const headings = Array.isArray(signals.headings) ? signals.headings : [];
  const outline = headings
    .slice(0, 4)
    .map((hd) => `H${hd.level} ${String(hd.text || '').trim()}`)
    .join('  \u00b7  ');

  const fields = [
    ['Title Tag', signals.title],
    ['Meta Description', signals.metaDescription],
    ['Canonical URL', signals.canonical],
    ['Open Graph', [signals.ogTitle, signals.ogDescription].filter(Boolean).join(' \u2014 ')],
    ['Meta Robots', signals.metaRobots],
    ['Heading Outline', outline],
  ];

  const padX = 12;
  const headerH = LIST_PAD_TOP + LIST_HEADER_H;
  const labelW = 92;
  const rowMin = 16;
  const bodyH = h - headerH - LIST_PAD_BOTTOM;
  const maxRows = Math.max(1, Math.min(fields.length, Math.floor(bodyH / rowMin)));
  const rows = fields.slice(0, maxRows);
  const rowH = bodyH / rows.length;

  card(doc, x, y, w, h, { accent: C.faint, fill: C.wash });
  eyebrow(doc, fonts, 'Page Metadata', x + padX, y + 13, C.muted);
  doc
    .font(fonts.regular)
    .fontSize(6.4)
    .fillColor(C.faint)
    .text('RAW VALUES READ FROM THE PAGE', x + w - padX - 200, y + 13, {
      width: 200,
      align: 'right',
      characterSpacing: 0.5,
      lineBreak: false,
    });

  doc.save();
  doc.roundedRect(x, y, w, h, 8).clip();

  rows.forEach(([label, rawValue], i) => {
    const rowY = y + headerH + i * rowH;
    const centerY = rowY + rowH / 2;

    if (i > 0) {
      doc
        .save()
        .lineWidth(0.6)
        .moveTo(x + padX, rowY)
        .lineTo(x + w - padX, rowY)
        .stroke(C.hairline)
        .restore();
    }

    doc
      .font(fonts.semibold)
      .fontSize(6.4)
      .fillColor(C.faint)
      .text(String(label).toUpperCase(), x + padX, centerY - 3.4, {
        width: labelW,
        characterSpacing: 0.5,
        lineBreak: false,
      });

    const valueX = x + padX + labelW;
    const valueW = w - padX * 2 - labelW;
    const value = String(rawValue || '').replace(/\s+/g, ' ').trim();
    doc
      .font(value ? fonts.medium : fonts.regular)
      .fontSize(7.6)
      .fillColor(value ? C.body : C.faint)
      .text(
        value ? fitText(doc, value, fonts.medium, 7.6, valueW) : 'Not found on this page',
        valueX,
        centerY - 4.2,
        { width: valueW, lineBreak: false }
      );
  });

  doc.restore();
}

module.exports = { generatePDFReport, truncate };

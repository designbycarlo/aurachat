// PDF report generator using pdf-lib (Works-compatible). Produces a clean,
// print-friendly single-page report equivalent to the original pdfkit layout:
// header/branding, score ring, grade band, summary, strengths / weaknesses /
// recommendations columns, and a signal checklist. The frontend only needs a
// valid application/pdf blob, so the download contract is preserved.
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const C = {
  ink: rgb(0.043, 0.059, 0.078),
  body: rgb(0.133, 0.188, 0.251),
  muted: rgb(0.29, 0.353, 0.416),
  faint: rgb(0.478, 0.541, 0.604),
  hairline: rgb(0.784, 0.808, 0.839),
  surface: rgb(1, 1, 1),
  wash: rgb(0.941, 0.949, 0.961),
  accent: rgb(0.227, 0.208, 0.627),
  accentWash: rgb(0.91, 0.906, 0.961),
  success: rgb(0.051, 0.42, 0.18),
  danger: rgb(0.627, 0.118, 0.227),
};

const BANDS = [
  { min: 85, label: 'Exceptional', color: rgb(0.082, 0.502, 0.239), wash: rgb(0.929, 0.984, 0.945) },
  { min: 70, label: 'Strong', color: rgb(0.055, 0.455, 0.565), wash: rgb(0.925, 0.984, 0.992) },
  { min: 55, label: 'Developing', color: rgb(0.706, 0.325, 0.035), wash: rgb(1, 0.973, 0.925) },
  { min: 40, label: 'Needs Work', color: rgb(0.761, 0.255, 0.047), wash: rgb(1, 0.957, 0.929) },
  { min: -Infinity, label: 'Critical', color: rgb(0.745, 0.071, 0.235), wash: rgb(1, 0.945, 0.953) },
];

function scoreBand(score) {
  return BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1];
}

function truncate(text, max) {
  const v = String(text || '');
  return v.length <= max ? v : v.slice(0, max - 1).trim() + '…';
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
      // very long single token — hard break
      while (font.widthOfTextAtSize(line, size) > maxWidth && line.length > 1) {
        let cut = line.length;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generatePDFReport(data) {
  const doc = await PDFDocument.create();
  doc.setTitle('AuraChat AEO Report');
  const page = doc.addPage([612, 792]); // Letter
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const M = 54;
  const contentW = width - M * 2;

  // ---- Header band ----
  page.drawRectangle({ x: 0, y: height - 96, width, height: 96, color: C.wash });
  page.drawRectangle({ x: M, y: height - 60, width: 22, height: 22, color: C.accent });
  page.drawText('AuraChat', { x: M + 32, y: height - 56, size: 16, font: fontBold, color: C.ink });
  page.drawText('AI SEO / AEO Analyzer', { x: M + 32, y: height - 74, size: 10, font, color: C.muted });
  const url = truncate(data.signals?.url || '', 64);
  page.drawText(url, { x: M, y: height - 88, size: 9, font, color: C.faint });

  let y = height - 96 - 40;

  // ---- Score ring + grade ----
  const score = Math.max(0, Math.min(100, Number(data.score ?? 0)));
  const band = scoreBand(score);
  const cx = M + 46;
  const cy = y - 46;
  const radius = 38;
  page.drawCircle({ x: cx, y: cy, size: radius + 8, borderColor: C.wash, borderWidth: 8 });
  // track
  page.drawCircle({ x: cx, y: cy, size: radius, borderColor: C.wash, borderWidth: 8 });
  // progress arc approximated with short ticks (pdf-lib has no arc); use ring via many segments
  drawArc(page, cx, cy, radius, 0, (score / 100) * 2 * Math.PI, band.color, 8);
  page.drawText(String(score), { x: cx - 18, y: cy - 7, size: 22, font: fontBold, color: C.ink });
  page.drawText('Score', { x: cx - 16, y: cy + 16, size: 8, font, color: C.faint });

  page.drawText(band.label, { x: cx + 64, y: cy + 6, size: 18, font: fontBold, color: band.color });
  page.drawText(`Grade ${data.grade || '--'}`, { x: cx + 64, y: cy - 14, size: 11, font, color: C.muted });

  y = cy - radius - 30;

  // ---- Summary ----
  page.drawText('SUMMARY', { x: M, y, size: 10, font: fontBold, color: C.faint });
  y -= 16;
  const summaryLines = wrapText(data.summary || '', font, 11, contentW);
  for (const ln of summaryLines) {
    page.drawText(ln, { x: M, y, size: 11, font, color: C.body });
    y -= 15;
  }
  y -= 14;

  // ---- Three columns: Strengths / Weaknesses / Recommendations ----
  const cols = [
    { title: 'STRENGTHS', items: data.strengths || [], color: C.success },
    { title: 'WEAKNESSES', items: data.weaknesses || [], color: C.danger },
    { title: 'RECOMMENDATIONS', items: data.recommendations || [], color: C.accent },
  ];
  const colW = (contentW - 24) / 3;
  let colY = y;
  for (const col of cols) {
    page.drawText(col.title, { x: M + (col === cols[0] ? 0 : col === cols[1] ? colW + 12 : (colW + 12) * 2), y: colY, size: 10, font: fontBold, color: col.color });
    let ly = colY - 14;
    const items = col.items.slice(0, 12);
    if (!items.length) {
      page.drawText('—', { x: M + (col === cols[0] ? 0 : col === cols[1] ? colW + 12 : (colW + 12) * 2), y: ly, size: 10, font, color: C.faint });
      ly -= 15;
    }
    for (const it of items) {
      const offset = col === cols[0] ? 0 : col === cols[1] ? colW + 12 : (colW + 12) * 2;
      const lines = wrapText('• ' + it, font, 9, colW - 6);
      for (const ln of lines) {
        if (ly < 80) break;
        page.drawText(ln, { x: M + offset, y: ly, size: 9, font, color: C.body });
        ly -= 12;
      }
      ly -= 3;
    }
  }

  // ---- Signal checklist ----
  let sy = y - 150;
  if (sy < 120) sy = 120;
  page.drawText('SIGNAL CHECKLIST', { x: M, y: sy, size: 10, font: fontBold, color: C.faint });
  sy -= 16;
  const sig = data.signals || {};
  const checks = [
    ['Title Tag', !!sig.title],
    ['Meta Description', !!sig.metaDescription],
    ['Canonical', !!sig.canonical],
    ['Open Graph', !!(sig.ogTitle || sig.ogDescription)],
    ['JSON-LD', !!sig.hasJsonLd],
    ['Headings', Array.isArray(sig.headings) && sig.headings.length > 0],
    ['FAQ / How-to', !!(sig.hasFAQ || sig.hasHowTo)],
    ['Conversational', !!sig.hasConversationalContent],
    ['Schema.org', !!sig.hasSchemaOrg],
    ['AI Markers', !!sig.hasAIAgentMarkers],
  ];
  const half = Math.ceil(checks.length / 2);
  checks.forEach(([label, ok], i) => {
    const col = i < half ? 0 : 1;
    const row = i % half;
    const x = M + col * (contentW / 2);
    const yy = sy - row * 16;
    page.drawText(ok ? '✓' : '✗', { x, y: yy, size: 11, font: fontBold, color: ok ? C.success : C.danger });
    page.drawText(label, { x: x + 16, y: yy, size: 9, font, color: C.body });
  });

  // ---- Footer ----
  page.drawText(`Generated ${new Date().toISOString()} • aurachat-aeo.pages.dev`, {
    x: M, y: 36, size: 8, font, color: C.faint,
  });

  const bytes = await doc.save();
  return bytes; // Uint8Array
}

// Draw an arc using line segments (pdf-lib has no native arc primitive).
function drawArc(page, cx, cy, radius, start, end, color, width) {
  const steps = Math.max(8, Math.round(((end - start) / (2 * Math.PI)) * 64));
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const a = start + ((end - start) * i) / steps;
    const x = cx + radius * Math.cos(a - Math.PI / 2);
    const y = cy + radius * Math.sin(a - Math.PI / 2);
    if (prev) page.drawLine({ start: prev, end: { x, y }, thickness: width, color });
    prev = { x, y };
  }
}

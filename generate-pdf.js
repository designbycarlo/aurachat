const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const FONTS_DIR = path.join(__dirname, 'fonts');

let fontsRegistered = false;

function registerFonts(document) {
  if (fontsRegistered) return;
  document.registerFont('Geist Light', path.join(FONTS_DIR, 'Geist-Light.ttf'));
  document.registerFont('Geist Regular', path.join(FONTS_DIR, 'Geist-Regular.ttf'));
  document.registerFont('Geist Medium', path.join(FONTS_DIR, 'Geist-Medium.ttf'));
  document.registerFont('Geist SemiBold', path.join(FONTS_DIR, 'Geist-SemiBold.ttf'));
  document.registerFont('Geist Bold', path.join(FONTS_DIR, 'Geist-Bold.ttf'));
  fontsRegistered = true;
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 55;
const CONTENT_W = PAGE_W - MARGIN * 2;

const GRADE_COLORS = {
  S: '#22c55e',
  A: '#4ade80',
  B: '#38bdf8',
  C: '#facc15',
  D: '#fb923c',
  F: '#f87171',
};

function scoreColor(score) {
  if (score >= 85) return { light: '#86efac', dark: '#22c55e' };
  if (score >= 70) return { light: '#7dd3fc', dark: '#0ea5e9' };
  if (score >= 55) return { light: '#fde68a', dark: '#ca8a04' };
  if (score >= 40) return { light: '#fdba74', dark: '#ea580c' };
  return { light: '#fecaca', dark: '#dc2626' };
}

function gradeColor(grade) {
  return GRADE_COLORS[grade] || '#94a3b8';
}

function truncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trim() + '…';
}

function drawCheck(doc, x, y, color, size) {
  const s = size || 12;
  doc.save();
  doc.strokeColor(color);
  doc.lineWidth(2);
  doc.moveTo(x - s * 0.5, y);
  doc.lineTo(x - s * 0.2, y + s * 0.5);
  doc.lineTo(x + s * 0.5, y - s * 0.3);
  doc.stroke();
  doc.restore();
}

function drawX(doc, x, y, color, size) {
  const s = size || 12;
  doc.save();
  doc.strokeColor(color);
  doc.lineWidth(2);
  doc.moveTo(x - s * 0.4, y - s * 0.4);
  doc.lineTo(x + s * 0.4, y + s * 0.4);
  doc.moveTo(x + s * 0.4, y - s * 0.4);
  doc.lineTo(x - s * 0.4, y + s * 0.4);
  doc.stroke();
  doc.restore();
}

function generatePDFReport(data) {
  return new Promise((resolve, reject) => {
    try {
      const document = new PDFDocument({
        size: 'LETTER',
        margin: 0,
        info: {
          Title: `AI SEO/AEO Report — ${data.signals?.url || 'AuraChat Analysis'}`,
          Author: 'AuraChat',
          Subject: 'AI SEO & AEO Readiness Report',
          Keywords: 'SEO, AEO, AI Readiness, Search Engine Optimization, Answer Engine Optimization, AI Discovery',
          Creator: 'AuraChat AI SEO/AEO Analyzer',
        },
      });

      const chunks = [];
      document.on('data', (c) => chunks.push(c));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      registerFonts(document);

      const score = data.score ?? 0;
      const grade = data.grade || '--';
      const summary = data.summary || '';
      const strengths = data.strengths || [];
      const weaknesses = data.weaknesses || [];
      const recommendations = data.recommendations || [];
      const signals = data.signals || {};
      const url = truncate(signals.url || 'N/A', 48);
      const now = new Date();
      const timestamp = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      let y = MARGIN;

      // ── Background subtle gradient overlay ──
      const bgGrad = document.linearGradient(0, 0, 0, PAGE_H);
      bgGrad.stop(0, '#0f172a');
      bgGrad.stop(1, '#1e293b');
      document.rect(0, 0, PAGE_W, PAGE_H).fill(bgGrad);

      // ── Header ──
      const logoPath = path.join(__dirname, '..', 'public', 'favicon-32.png');
      if (fs.existsSync(logoPath)) {
        document.image(logoPath, MARGIN, y, { width: 32, height: 32 });
      }

      document.font('Geist SemiBold').fontSize(18).fillColor('#f8fafc').text(
        'AI SEO / AEO Summary',
        MARGIN + 44,
        y + 6
      );
      document.font('Geist Regular').fontSize(10).fillColor('#94a3b8').text(
        'Report',
        MARGIN + 44,
        y + 22
      );

      y += 44;

      // URL row
      document.font('Geist Medium').fontSize(11).fillColor('#38bdf8').text(
        'Analyzed URL',
        MARGIN,
        y
      );
      document.font('Geist Regular').fontSize(10).fillColor('#cbd5e1').text(
        url,
        MARGIN,
        y + 14
      );

      y += 42;

      // ── Score & Grade ──
      const colors = scoreColor(score);
      const gradeC = gradeColor(grade);

      // Score circle with gradient
      const circleX = MARGIN + 30;
      const circleY = y + 35;
      const circleR = 34;

      const grad = document.radialGradient(circleX, circleY, 0, circleX, circleY, circleR);
      grad.stop(0, colors.light);
      grad.stop(1, colors.dark);

      document.circle(circleX, circleY, circleR).fill(grad);
      document.circle(circleX, circleY, circleR - 4).fill('#0f172a').opacity(0.12);

      document.font('Geist Bold').fontSize(22).fillColor('#0f172a').text(
        String(score),
        circleX - 22,
        circleY - 10
      );

      // Grade badge
      const gradeBadgeX = circleX + circleR + 24;
      const gradeBadgeY = circleY - 22;
      document.roundedRect(gradeBadgeX, gradeBadgeY, 64, 44, 10).fill(gradeC);
      document.font('Geist Bold').fontSize(20).fillColor('#0f172a').text(
        grade,
        gradeBadgeX + 32,
        gradeBadgeY + 18,
        { align: 'center' }
      );

      document.font('Geist SemiBold').fontSize(13).fillColor('#facc15').text(
        'SCORE',
        circleX - 24,
        y - 4
      );
      document.font('Geist SemiBold').fontSize(13).fillColor('#94a3b8').text(
        'GRADE',
        gradeBadgeX + 6,
        y - 4
      );

      y += 88;

      // Summary
      document.font('Geist Regular').fontSize(10).fillColor('#cbd5e1').text(
        summary,
        MARGIN,
        y,
        { width: CONTENT_W, align: 'center' }
      );
      y += document.heightOfString(summary, { width: CONTENT_W, fontSize: 10 }) + 20;

      // ── Key Metrics Grid ──
      document.font('Geist SemiBold').fontSize(11).fillColor('#38bdf8').text(
        'Key Signals',
        MARGIN,
        y
      );
      y += 18;

      const metrics = [
        { label: 'Title Tag', ok: !!signals.title },
        { label: 'Meta Desc', ok: !!signals.metaDescription },
        { label: 'Canonical', ok: !!signals.canonical },
        { label: 'Open Graph', ok: !!(signals.ogTitle || signals.ogDescription) },
        { label: 'JSON-LD', ok: signals.hasJsonLd },
        { label: 'Headings', ok: signals.headings && signals.headings.length > 0 },
        { label: 'FAQ/How-to', ok: signals.hasFAQ || signals.hasHowTo },
        { label: 'Conversational', ok: signals.hasConversationalContent },
      ];

      const badgeW = 70;
      const badgeH = 30;
      const cols = 4;
      const rows = 2;
      const badgeGap = 12;
      const gridW = cols * badgeW + (cols - 1) * badgeGap;
      const gridStartX = MARGIN + (CONTENT_W - gridW) / 2;

      for (let i = 0; i < metrics.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const bx = gridStartX + col * (badgeW + badgeGap);
        const by = y + row * (badgeH + badgeGap);
        const m = metrics[i];
        const badgeColor = m.ok
          ? 'rgba(74,222,128,0.15)'
          : 'rgba(248,113,113,0.15)';
        const borderColor = m.ok ? '#4ade80' : '#f87171';
        const iconColor = m.ok ? '#4ade80' : '#f87171';

        document.save();
        document.roundedRect(bx, by, badgeW, badgeH, 6).fill(badgeColor).stroke(borderColor).lineWidth(1);
        document.restore();

        if (m.ok) {
          drawCheck(document, bx + 16, by + 15, iconColor, 8);
        } else {
          drawX(document, bx + 16, by + 15, iconColor, 8);
        }

        document.font('Geist Medium').fontSize(8).fillColor(m.ok ? '#4ade80' : '#f87171').text(
          m.label,
          bx + 28,
          by + 9
        );
      }

      y += rows * badgeH + (rows - 1) * badgeGap + 16;

      // Word count + headings info
      document.font('Geist Medium').fontSize(9).fillColor('#94a3b8').text(
        `Words: ${signals.wordCount || 0}  ·  Headings H${signals.headings && signals.headings.length > 0
          ? signals.headings[0].level
          : '-'}  ·  JSON-LD blocks: ${signals.jsonLdCount || 0}`,
        MARGIN,
        y
      );
      y += 22;

      // ── Strengths ──
      let currentY = y;
      currentY = drawSection(document, 'Strengths', strengths, '#4ade80', '#bbf7d0', MARGIN, currentY, 2, true, score, grade) || currentY;

      // ── Weaknesses ──
      let weaknessesY = currentY + 24;
      if (weaknesses.length > 0) {
        weaknessesY = currentY + 24;
      }
      currentY = drawSection(document, 'Weaknesses', weaknesses, '#fbbf24', '#fecaca', MARGIN, weaknessesY, 2, false, score, grade) || weaknessesY;

      // ── Recommendations ──
      let recY = currentY + 24;
      currentY = drawSection(document, 'Recommendations', recommendations, '#38bdf8', '#f8fafc', MARGIN, recY, 2, false, score, grade, true) || recY;

      // ── Footer ──
      const footerY = PAGE_H - MARGIN - 30;

      document.save();
      document.strokeColor('#334155');
      document.lineWidth(1);
      document.moveTo(MARGIN, footerY - 14);
      document.lineTo(PAGE_W - MARGIN, footerY - 14);
      document.stroke();
      document.restore();

      document.font('Geist Regular').fontSize(8).fillColor('#64748b').text(
        `Generated by AuraChat  ·  ${timestamp}`,
        MARGIN,
        footerY
      );

      document.font('Geist Medium').fontSize(8).fillColor('#475569').text(
        `Page 1 of 1`,
        PAGE_W - MARGIN - 40,
        footerY,
        { align: 'right' }
      );

      document.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawSection(doc, title, items, titleColor, itemColor, startX, startY, maxItems, isFirst, score, grade, numbered) {
  if (!items.length) return startY;

  let y = startY;

  doc.font('Geist SemiBold').fontSize(11).fillColor(titleColor).text(
    title,
    startX,
    y
  );
  y += 16;

  const bulletR = 5;
  const indent = 24;
  const itemWidth = CONTENT_W - indent;
  const maxItemsToShow = numbered ? Math.min(items.length, 6) : maxItems;
  const hasMore = items.length > maxItemsToShow;

  for (let i = 0; i < maxItemsToShow; i++) {
    const item = items[i];
    const textColor = numbered ? '#f8fafc' : itemColor;

    if (numbered) {
      // Numbered badge
      const badgeX = startX;
      const badgeY = y;
      doc.roundedRect(badgeX, badgeY, 18, 18, 4).fill('#1e293b').stroke('#334155').lineWidth(0.5);
      doc.font('Geist Bold').fontSize(9).fillColor('#38bdf8').text(
        String(i + 1),
        badgeX + 9,
        badgeY + 4,
        { align: 'center' }
      );

      doc.font('Geist Regular').fontSize(9).fillColor(textColor).text(
        item,
        startX + indent,
        y - 2,
        { width: itemWidth - 20, lineGap: 2 }
      );
    } else {
      if (isFirst) {
        drawCheck(doc, startX + 7, y + 5, titleColor, 8);
      } else {
        doc.circle(startX + 7, y + 6, bulletR).fill(titleColor);
      }

      doc.font('Geist Regular').fontSize(9).fillColor(textColor).text(
        item,
        startX + indent,
        y - 2,
        { width: itemWidth, lineGap: 2 }
      );
    }

    y += doc.heightOfString(item, { width: itemWidth, fontSize: 9, lineGap: 2 }) + 8;
  }

  if (hasMore) {
    doc.font('Geist Medium').fontSize(8).fillColor('#64748b').text(
      `+${items.length - maxItemsToShow} more...`,
      startX + indent,
      y
    );
    y += 12;
  }

  return y;
}

module.exports = { generatePDFReport, scoreColor, gradeColor, truncate };

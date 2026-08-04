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
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

function truncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trim() + '\u2026';
}

function drawCheck(doc, x, y, size) {
  const s = size || 10;
  doc.save();
  doc.lineWidth(1.5);
  doc.moveTo(x - s * 0.45, y);
  doc.lineTo(x - s * 0.15, y + s * 0.45);
  doc.lineTo(x + s * 0.45, y - s * 0.25);
  doc.stroke();
  doc.restore();
}

function drawX(doc, x, y, size) {
  const s = size || 10;
  doc.save();
  doc.lineWidth(1.5);
  doc.moveTo(x - s * 0.35, y - s * 0.35);
  doc.lineTo(x + s * 0.35, y + s * 0.35);
  doc.moveTo(x + s * 0.35, y - s * 0.35);
  doc.lineTo(x - s * 0.35, y + s * 0.35);
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
          Title: `AI SEO/AEO Report \u2014 ${data.signals?.url || 'AuraChat Analysis'}`,
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
      const url = truncate(signals.url || 'N/A', 50);
      const now = new Date();
      const timestamp = now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      let y = MARGIN;

      document.rect(0, 0, PAGE_W, PAGE_H).fill('#ffffff');

      const logoPath = path.join(__dirname, '..', 'public', 'favicon-32.png');
      if (fs.existsSync(logoPath)) {
        document.image(logoPath, MARGIN, y, { width: 28, height: 28 });
      }

      document.font('Geist SemiBold').fontSize(16).fillColor('#000000').text(
        'AI SEO / AEO Summary',
        MARGIN + 38,
        y + 4
      );
      document.font('Geist Regular').fontSize(9).fillColor('#555555').text(
        'Report',
        MARGIN + 38,
        y + 18
      );

      y += 38;

      document.font('Geist Medium').fontSize(10).fillColor('#000000').text(
        'Analyzed URL',
        MARGIN,
        y
      );
      document.font('Geist Regular').fontSize(9).fillColor('#444444').text(
        url,
        MARGIN,
        y + 12
      );

      y += 36;

      const circleX = MARGIN + 28;
      const circleY = y + 30;
      const circleR = 30;

      document.circle(circleX, circleY, circleR).fill('#ffffff').stroke('#000000').lineWidth(2);

      document.font('Geist Bold').fontSize(20).fillColor('#000000').text(
        String(score),
        circleX - 18,
        circleY - 8
      );

      const gradeBadgeX = circleX + circleR + 20;
      const gradeBadgeY = circleY - 18;
      document.roundedRect(gradeBadgeX, gradeBadgeY, 56, 36, 8).fill('#ffffff').stroke('#000000').lineWidth(1.5);
      document.font('Geist Bold').fontSize(18).fillColor('#000000').text(
        grade,
        gradeBadgeX + 28,
        gradeBadgeY + 14,
        { align: 'center' }
      );

      document.font('Geist SemiBold').fontSize(11).fillColor('#000000').text(
        'SCORE',
        circleX - 20,
        y - 2
      );
      document.font('Geist SemiBold').fontSize(11).fillColor('#000000').text(
        'GRADE',
        gradeBadgeX + 4,
        y - 2
      );

      y += 78;

      document.font('Geist Regular').fontSize(9).fillColor('#333333').text(
        summary,
        MARGIN,
        y,
        { width: CONTENT_W, align: 'left' }
      );
      y += document.heightOfString(summary, { width: CONTENT_W, fontSize: 9 }) + 16;

      document.font('Geist SemiBold').fontSize(10).fillColor('#000000').text(
        'Key Signals',
        MARGIN,
        y
      );
      y += 14;

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

      const badgeW = 66;
      const badgeH = 26;
      const cols = 4;
      const rows = 2;
      const badgeGap = 10;
      const gridW = cols * badgeW + (cols - 1) * badgeGap;
      const gridStartX = MARGIN + (CONTENT_W - gridW) / 2;

      for (let i = 0; i < metrics.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const bx = gridStartX + col * (badgeW + badgeGap);
        const by = y + row * (badgeH + badgeGap);
        const m = metrics[i];

        document.save();
        document.roundedRect(bx, by, badgeW, badgeH, 4).fill('#ffffff').stroke('#000000').lineWidth(0.75);
        document.restore();

        if (m.ok) {
          drawCheck(document, bx + 14, by + 13, 7);
        } else {
          drawX(document, bx + 14, by + 13, 7);
        }

        document.font('Geist Medium').fontSize(7).fillColor('#000000').text(
          m.label,
          bx + 24,
          by + 8
        );
      }

      y += rows * badgeH + (rows - 1) * badgeGap + 14;

      document.font('Geist Medium').fontSize(8).fillColor('#555555').text(
        `Words: ${signals.wordCount || 0}  \u00b7  Headings H${signals.headings && signals.headings.length > 0
          ? signals.headings[0].level
          : '-'}  \u00b7  JSON-LD blocks: ${signals.jsonLdCount || 0}`,
        MARGIN,
        y
      );
      y += 18;

      let currentY = y;
      currentY = drawSection(document, 'Strengths', strengths, MARGIN, currentY, 3, true) || currentY;

      let weaknessesY = currentY + 18;
      currentY = drawSection(document, 'Weaknesses', weaknesses, MARGIN, weaknessesY, 3, false) || weaknessesY;

      let recY = currentY + 18;
      currentY = drawSection(document, 'Recommendations', recommendations, MARGIN, recY, 3, false, true) || recY;

      const footerY = PAGE_H - MARGIN - 24;

      document.save();
      document.strokeColor('#000000');
      document.lineWidth(0.5);
      document.moveTo(MARGIN, footerY - 10);
      document.lineTo(PAGE_W - MARGIN, footerY - 10);
      document.stroke();
      document.restore();

      document.font('Geist Regular').fontSize(7).fillColor('#555555').text(
        `Generated by AuraChat  \u00b7  ${timestamp}`,
        MARGIN,
        footerY
      );

      document.font('Geist Medium').fontSize(7).fillColor('#555555').text(
        `Page 1 of 1`,
        PAGE_W - MARGIN - 36,
        footerY,
        { align: 'right' }
      );

      document.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawSection(doc, title, items, startX, startY, maxItems, isFirst, numbered) {
  if (!items.length) return startY;

  let y = startY;

  doc.font('Geist SemiBold').fontSize(10).fillColor('#000000').text(
    title,
    startX,
    y
  );
  y += 14;

  const indent = 22;
  const itemWidth = CONTENT_W - indent;
  const maxItemsToShow = numbered ? Math.min(items.length, 5) : maxItems;
  const hasMore = items.length > maxItemsToShow;

  for (let i = 0; i < maxItemsToShow; i++) {
    const item = items[i];

    if (numbered) {
      const badgeX = startX;
      const badgeY = y;
      doc.roundedRect(badgeX, badgeY, 16, 16, 3).fill('#ffffff').stroke('#000000').lineWidth(0.5);
      doc.font('Geist Bold').fontSize(8).fillColor('#000000').text(
        String(i + 1),
        badgeX + 8,
        badgeY + 3,
        { align: 'center' }
      );

      doc.font('Geist Regular').fontSize(8).fillColor('#000000').text(
        item,
        startX + indent,
        y - 1,
        { width: itemWidth - 16, lineGap: 1.5 }
      );
    } else {
      if (isFirst) {
        drawCheck(doc, startX + 6, y + 4, 7);
      } else {
        doc.circle(startX + 6, y + 5, 4).fill('#000000');
      }

      doc.font('Geist Regular').fontSize(8).fillColor('#000000').text(
        item,
        startX + indent,
        y - 1,
        { width: itemWidth, lineGap: 1.5 }
      );
    }

    y += doc.heightOfString(item, { width: itemWidth, fontSize: 8, lineGap: 1.5 }) + 6;
  }

  if (hasMore) {
    doc.font('Geist Medium').fontSize(7).fillColor('#555555').text(
      `+${items.length - maxItemsToShow} more...`,
      startX + indent,
      y
    );
    y += 10;
  }

  return y;
}

module.exports = { generatePDFReport, truncate };
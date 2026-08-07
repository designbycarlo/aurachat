(function () {
  'use strict';

  var PAGE_W = 1275;
  var PAGE_H = 1650;
  var MARGIN = 90;
  var CONTENT_W = PAGE_W - MARGIN * 2;
  var CONTENT_TOP = 250;
  var CONTENT_BOTTOM = PAGE_H - 120;

  var COLORS = {
    bg: '#ffffff',
    ink: '#0f172a',
    sub: '#475569',
    muted: '#94a3b8',
    accent: '#6366f1',
    accent2: '#7c3aed',
    line: '#e2e8f0',
    success: '#059669',
    danger: '#dc2626',
    softBg: '#f8fafc',
  };

  function scoreBand(score) {
    if (score >= 85) return { label: 'Exceptional', color: '#4ade80' };
    if (score >= 70) return { label: 'Strong', color: '#38bdf8' };
    if (score >= 55) return { label: 'Developing', color: '#facc15' };
    if (score >= 40) return { label: 'Needs Work', color: '#fb923c' };
    return { label: 'Critical', color: '#f87171' };
  }

  function buildSignalChecks(signals) {
    var s = signals || {};
    var headings = Array.isArray(s.headings) ? s.headings : [];
    return [
      { label: 'Title Tag', ok: !!s.title },
      { label: 'Meta Description', ok: !!s.metaDescription },
      { label: 'Canonical', ok: !!s.canonical },
      { label: 'Open Graph', ok: !!(s.ogTitle || s.ogDescription) },
      { label: 'JSON-LD', ok: !!s.hasJsonLd },
      { label: 'Headings', ok: headings.length > 0 },
      { label: 'FAQ / How-to', ok: !!(s.hasFAQ || s.hasHowTo) },
      { label: 'Conversational', ok: !!s.hasConversationalContent },
      { label: 'Schema.org', ok: !!s.hasSchemaOrg },
      { label: 'AI Markers', ok: !!s.hasAIAgentMarkers },
    ];
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function fmtDate(d) {
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function fmtDateISO(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function elide(ctx, text, maxWidth) {
    var s = String(text || '');
    if (ctx.measureText(s).width <= maxWidth) return s;
    while (s.length > 1 && ctx.measureText(s + '\u2026').width > maxWidth) {
      s = s.slice(0, -1);
    }
    return s + '\u2026';
  }

  function createReport(data) {
    var signals = data.signals || {};
    var score = data.score || 0;
    var band = scoreBand(score);
    var checks = buildSignalChecks(signals);
    var passed = checks.filter(function (c) { return c.ok; }).length;
    var coverage = Math.round((passed / checks.length) * 100);
    var headings = Array.isArray(signals.headings) ? signals.headings : [];
    var h1Count = headings.filter(function (h) { return String(h.level) === '1'; }).length;
    var words = Number(signals.wordCount || 0);
    var date = new Date();

    var pages = [];
    var pg = 0;
    var y = CONTENT_TOP;

    function ctx() {
      var c = pages[pg];
      return c.getContext('2d');
    }

    function newPage() {
      var c = document.createElement('canvas');
      c.width = PAGE_W;
      c.height = PAGE_H;
      pages.push(c);
      pg = pages.length - 1;
      y = CONTENT_TOP;
      drawPageChrome(c, pg);
    }

    function drawPageChrome(c, index) {
      var g = c.getContext('2d');
      g.fillStyle = COLORS.bg;
      g.fillRect(0, 0, PAGE_W, PAGE_H);
      g.fillStyle = COLORS.ink;
      g.font = '700 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      g.fillText('AuraChat', MARGIN, 58);
      g.fillStyle = COLORS.accent;
      g.fillRect(MARGIN, 78, 30, 5);
      g.strokeStyle = COLORS.line;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(MARGIN, 104);
      g.lineTo(PAGE_W - MARGIN, 104);
      g.stroke();
    }

    function drawFooter(total) {
      for (var i = 0; i < pages.length; i++) {
        var g = pages[i].getContext('2d');
        g.strokeStyle = COLORS.line;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(MARGIN, PAGE_H - 80);
        g.lineTo(PAGE_W - MARGIN, PAGE_H - 80);
        g.stroke();
        g.fillStyle = COLORS.muted;
        g.font = '500 17px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        g.fillText('AuraChat \u2014 AI SEO/AEO Report \u00b7 ' + fmtDateISO(date), MARGIN, PAGE_H - 48);
        var tag = 'Page ' + (i + 1) + ' of ' + total;
        g.fillText(tag, PAGE_W - MARGIN - g.measureText(tag).width, PAGE_H - 48);
      }
    }

    function ensure(h) {
      if (y + h > CONTENT_BOTTOM) newPage();
    }

    function sectionTitle(text, keepWith) {
      ensure(56 + (keepWith || 0));
      var g = ctx();
      g.fillStyle = COLORS.ink;
      g.font = '800 27px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      g.fillText(text, MARGIN, y + 27);
      y += 18;
      g.strokeStyle = COLORS.line;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(MARGIN, y + 16);
      g.lineTo(PAGE_W - MARGIN, y + 16);
      g.stroke();
      y += 38;
    }

    function fillRounded(x, yy, w, h, r, color) {
      var g = ctx();
      g.fillStyle = color;
      roundRectPath(g, x, yy, w, h, r);
      g.fill();
    }

    /* ---------- Page 1 header ---------- */
    newPage();
    var g = ctx();

    g.fillStyle = COLORS.ink;
    g.font = '800 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText('SEO/AEO Report', MARGIN, 196);
    var dStr = fmtDate(date);
    g.font = '500 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillStyle = COLORS.muted;
    g.fillText(dStr, PAGE_W - MARGIN - g.measureText(dStr).width, 196);
    g.fillStyle = COLORS.line;
    g.fillRect(MARGIN, 216, CONTENT_W, 2);
    y = 248;

    /* Score gauge (left) */
    var gaugeSize = 252;
    var gx = MARGIN;
    var gy = y;
    var gcx = gx + gaugeSize / 2;
    var gcy = gy + gaugeSize / 2;
    var gRad = gaugeSize / 2 - 16;
    var startA = Math.PI * 0.8;
    var endA = Math.PI * 0.2;
    var full = endA - startA;
    if (full < 0) full += Math.PI * 2;
    g.lineCap = 'round';
    g.lineWidth = 22;
    g.strokeStyle = '#eef2ff';
    g.beginPath();
    g.arc(gcx, gcy, gRad, startA, endA);
    g.stroke();
    var grad = g.createLinearGradient(gx, gy, gx + gaugeSize, gy + gaugeSize);
    grad.addColorStop(0, COLORS.accent);
    grad.addColorStop(1, COLORS.accent2);
    var sweep = startA + full * Math.max(0, Math.min(100, score)) / 100;
    g.strokeStyle = grad;
    g.beginPath();
    g.arc(gcx, gcy, gRad, startA, sweep);
    g.stroke();
    g.lineCap = 'butt';

    g.textAlign = 'center';
    g.fillStyle = COLORS.ink;
    g.font = '800 84px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText(String(score), gcx, gcy + 10);
    g.font = '600 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillStyle = band.color;
    g.fillText(band.label + (data.grade ? ' \u00b7 ' + data.grade : ''), gcx, gcy + 46);
    g.textAlign = 'left';

    /* Page info (right) */
    var ix = gx + gaugeSize + 56;
    var iw = PAGE_W - MARGIN - ix;
    g.fillStyle = COLORS.muted;
    g.font = '600 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText('ANALYZED PAGE', ix, y + 24);
    g.fillStyle = COLORS.ink;
    g.font = '800 38px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    var titleLines = wrapText(g, signals.title || 'Untitled page', iw).slice(0, 2);
    titleLines.forEach(function (line, i) {
      g.fillText(line, ix, y + 66 + i * 46);
    });
    var ty = y + 66 + titleLines.length * 46;
    g.fillStyle = COLORS.accent;
    g.font = '500 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText(elide(g, signals.url || '--', iw), ix, ty + 22);

    y += gaugeSize + 34;

    /* Summary */
    ensure(120);
    g = ctx();
    g.fillStyle = COLORS.ink;
    g.font = '800 27px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText('Overview', MARGIN, y + 27);
    y += 52;
    g.font = '400 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillStyle = COLORS.sub;
    var sumLines = wrapText(g, data.summary || 'No summary provided.', CONTENT_W);
    sumLines.forEach(function (line) {
      ensure(30);
      g = ctx();
      g.fillText(line, MARGIN, y + 24);
      y += 30;
    });
    y += 18;

    /* ---------- Signal coverage ---------- */
    var cols = 2;
    var rows = Math.ceil(checks.length / cols);
    var chipH = 62;
    var chipGap = 18;
    var chipW = (CONTENT_W - chipGap * (cols - 1)) / cols;
    var rowH = chipH + chipGap;
    sectionTitle('Signal Coverage', 44 + rowH);
    g = ctx();
    var barY = y;
    g.fillStyle = '#eef2ff';
    roundRectPath(g, MARGIN, barY, CONTENT_W, 20, 10);
    g.fill();
    g.fillStyle = band.color;
    roundRectPath(g, MARGIN, barY, Math.max(20, CONTENT_W * coverage / 100), 20, 10);
    g.fill();
    g.fillStyle = COLORS.ink;
    g.font = '700 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText(coverage + '%', MARGIN + CONTENT_W + 16, barY + 19);
    y = barY + 44;

    for (var r = 0; r < rows; r++) {
      ensure(rowH);
      g = ctx();
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c;
        if (i >= checks.length) break;
        var cx = MARGIN + c * (chipW + chipGap);
        var cyy = y;
        g.fillStyle = COLORS.softBg;
        roundRectPath(g, cx, cyy, chipW, chipH, 12);
        g.fill();
        var ok = checks[i].ok;
        var dot = 34;
        var dx = cx + 18;
        var dcy = cyy + chipH / 2;
        g.fillStyle = ok ? COLORS.success : COLORS.danger;
        g.beginPath();
        g.arc(dx + dot / 2, dcy, dot / 2, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        g.beginPath();
        if (ok) {
          g.moveTo(dx + 8, dcy + 2);
          g.lineTo(dx + dot / 2, dcy + 10);
          g.lineTo(dx + dot - 8, dcy - 8);
        } else {
          g.moveTo(dx + 10, dcy - 10);
          g.lineTo(dx + dot - 10, dcy + 10);
          g.moveTo(dx + dot - 10, dcy - 10);
          g.lineTo(dx + 10, dcy + 10);
        }
        g.stroke();
        g.fillStyle = COLORS.ink;
        g.font = '600 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        g.fillText(checks[i].label, dx + dot + 20, dcy + 8);
      }
      y += rowH;
    }
    y += 8;

    /* ---------- Stat tiles ---------- */
    sectionTitle('Metrics');
    var tiles = [
      { value: words.toLocaleString('en-US'), note: words >= 800 ? 'In-depth coverage' : words >= 300 ? 'Adequate depth' : 'Thin content' },
      { value: Number(signals.jsonLdCount || 0).toLocaleString('en-US'), note: signals.hasJsonLd ? 'Machine readable' : 'None found' },
      { value: String(headings.length), note: h1Count ? h1Count + ' H1 detected' : 'No H1 detected' },
      { value: coverage + '%', note: passed + ' of ' + checks.length + ' present' },
    ];
    ensure(140);
    g = ctx();
    var tileGap = 20;
    var tileW = (CONTENT_W - tileGap * 3) / 4;
    var tileY = y;
    for (var t = 0; t < tiles.length; t++) {
      var tx = MARGIN + t * (tileW + tileGap);
      g.fillStyle = COLORS.softBg;
      roundRectPath(g, tx, tileY, tileW, 120, 14);
      g.fill();
      g.fillStyle = COLORS.ink;
      g.font = '800 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      g.fillText(tiles[t].value, tx + 20, tileY + 52);
      g.fillStyle = COLORS.sub;
      g.font = '500 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      g.fillText(tiles[t].note, tx + 20, tileY + 90);
    }
    y += 140;

    /* ---------- Lists ---------- */
    function renderList(title, items, kind) {
      var arr = Array.isArray(items) ? items.filter(Boolean) : [];
      var keepWith = 0;
      if (arr.length) {
        var probe = document.createElement('canvas').getContext('2d');
        probe.font = '400 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        keepWith = 16 + wrapText(probe, arr[0], CONTENT_W - 60).length * 30 + 16;
      }
      sectionTitle(title, keepWith);
      if (!arr.length) {
        ensure(40);
        g = ctx();
        g.fillStyle = COLORS.muted;
        g.font = '400 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        g.fillText('Nothing to report here.', MARGIN, y + 24);
        y += 46;
        return;
      }
      arr.forEach(function (item, idx) {
        g = ctx();
        g.font = '400 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        var lines = wrapText(g, item, CONTENT_W - 60);
        var itemH = 16 + lines.length * 30 + 16;
        ensure(itemH);
        g = ctx();
        if (kind === 'recommendations') {
          var prio = idx < 2;
          g.fillStyle = prio ? COLORS.accent2 : COLORS.accent;
          g.font = '700 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
          g.fillText('P' + (idx + 1), MARGIN, y + 24);
          g.fillStyle = COLORS.ink;
        } else {
          var ok = kind === 'strengths';
          var dcx = MARGIN + 15;
          var dcyy = y + 16;
          g.fillStyle = ok ? COLORS.success : COLORS.danger;
          g.beginPath();
          g.arc(dcx, dcyy, 7, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#ffffff';
          g.lineWidth = 2;
          g.beginPath();
          if (ok) {
            g.moveTo(dcx - 4, dcyy + 1);
            g.lineTo(dcx - 1, dcyy + 4);
            g.lineTo(dcx + 4, dcyy - 4);
          } else {
            g.moveTo(dcx - 3, dcyy - 3);
            g.lineTo(dcx + 3, dcyy + 3);
            g.moveTo(dcx + 3, dcyy - 3);
            g.lineTo(dcx - 3, dcyy + 3);
          }
          g.stroke();
          g.fillStyle = COLORS.ink;
        }
        g.font = '400 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        lines.forEach(function (line, li) {
          g.fillText(line, MARGIN + 48, y + 24 + li * 30);
        });
        y += itemH;
      });
    }

    renderList('Strengths', data.strengths, 'strengths');
    renderList('Weaknesses', data.weaknesses, 'weaknesses');
    renderList('Recommendations', data.recommendations, 'recommendations');

    drawFooter(pages.length);
    return pages;
  }

  function pickEncoder() {
    var c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    var candidates = ['image/avif', 'image/webp', 'image/png'];
    for (var i = 0; i < candidates.length; i++) {
      try {
        var dataUrl = c.toDataURL(candidates[i]);
        if (dataUrl.indexOf('data:' + candidates[i]) === 0) return candidates[i];
      } catch (e) { /* unsupported */ }
    }
    return 'image/png';
  }

  function mimeExt(mime) {
    if (mime === 'image/avif') return '.avif';
    if (mime === 'image/webp') return '.webp';
    return '.png';
  }

  function exportReportToImage(report) {
    return new Promise(function (resolve, reject) {
      var pages;
      try {
        pages = createReport(report);
      } catch (err) {
        reject(err);
        return;
      }
      var mime = pickEncoder();
      if (pages.length === 1) {
        pages[0].toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('Image export is not supported in this browser.'));
        }, mime, 0.85);
        return;
      }
      /* Multi-page report: download one print-ready image per page. */
      var base = 'aurachat-seo-report-' + Date.now();
      var saved = 0;
      pages.forEach(function (canvas, i) {
        canvas.toBlob(function (blob) {
          saved++;
          if (blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = base + '-page-' + (i + 1) + mimeExt(mime);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
          }
          if (saved === pages.length) {
            if (blob) resolve(true);
            else reject(new Error('Image export is not supported in this browser.'));
          }
        }, mime, 0.85);
      });
    });
  }

  window.exportReportToImage = exportReportToImage;
})();

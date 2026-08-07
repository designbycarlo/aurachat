// CSV report — reimplemented for the Workers runtime (no Node Buffer).
// Mirrors the CSV layout from server.js:/api/report/csv.
export const onRequestPost = async ({ request }) => {
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Report data is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!data || !data.signals) {
    return new Response(JSON.stringify({ error: 'Report data is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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

  const csvContent = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const buffer = new TextEncoder().encode(csvContent);
  const filename = `aurachat-seo-report-${Date.now()}.csv`;
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
    },
  });
};

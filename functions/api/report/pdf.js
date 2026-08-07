import { generatePDFReport } from '../../_lib/pdf.js';

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
  try {
    const bytes = await generatePDFReport(data);
    const filename = `aurachat-seo-report-${Date.now()}.pdf`;
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to generate PDF report' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

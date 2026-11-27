// Optional Vercel Serverless Route for Resend Free Tier Email Delivery
// Set RESEND_API_KEY and RESEND_FROM_EMAIL in Vercel Environment Variables.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(501).json({
      error: 'RESEND_API_KEY not configured on server. Falling back to mailto client link.',
    });
  }

  const { to, subject, html, text } = req.body || {};
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    return res.status(400).json({ error: 'Valid recipient email is required.' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Marquee 1 <onboarding@resend.dev>',
        to: [to],
        subject: String(subject || 'Marquee 1 Invoice'),
        html: html ? String(html) : undefined,
        text: text ? String(text) : undefined,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.message || 'Resend API error' });
    }
    return res.status(200).json({ ok: true, id: data.id });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to send email' });
  }
}

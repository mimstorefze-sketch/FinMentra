export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only allow requests from your domain
  const origin = req.headers.origin || '';
  const allowed = ['https://www.finmentra.com', 'https://finmentra.com', 'https://fin-mentra.vercel.app'];
  if (!allowed.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { prompt, system, question, standard, correctAnswer } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: system || 'You are Mr. Ledger AI, an expert finance and accounting tutor for FinMentra. Help students understand IFRS, IAS, ISA, Tax, Costing, and Financial Management. Give concise exam-focused answers under 120 words. Use ** for key terms. Reference specific standard paragraphs. End with one exam tip.',
        messages: [{
          role: 'user',
          content: 'Standard: ' + (standard || '') + '\nQuestion: ' + (question || '') + '\nCorrect answer: ' + (correctAnswer || '') + '\nStudent asks: ' + (prompt || '')
        }]
      })
    });

    const data = await response.json();
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: 'AI service unavailable' });
  }
}

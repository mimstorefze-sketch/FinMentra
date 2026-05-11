export default async function handler(req, res) {
  // Set CORS headers first
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, system, question, standard, correctAnswer } = req.body || {};

    // Build context-aware message
    let userMessage = prompt || '';
    if (question && question.length > 5) {
      userMessage = 'Topic: ' + (standard || 'General Accounting') +
        '\nQuestion being studied: ' + question +
        (correctAnswer ? '\nCorrect answer: ' + correctAnswer : '') +
        '\nStudent asks: ' + (prompt || '');
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: system || 'You are Mr. Ledger AI, an expert finance and accounting tutor for FinMentra. Answer ANY finance, accounting, IFRS, IAS, ISA, Tax, Costing, or FM question the student asks. Use the provided question context only as background. Give concise exam-focused answers under 150 words. Bold key terms with **text**. Reference specific standard paragraphs. End with one practical exam tip.',
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('AI proxy error:', error);
    return res.status(500).json({ error: 'AI service unavailable' });
  }
}

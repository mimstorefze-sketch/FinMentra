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

    // Build smart context message
    let userMessage = prompt || '';
    if (question && question.length > 5) {
      userMessage = 'Topic: ' + (standard || 'General Accounting') +
        '\nQuestion being studied: ' + question +
        (correctAnswer ? '\nCorrect answer: ' + correctAnswer : '') +
        '\nStudent asks: ' + (prompt || '');
    }

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
        system: system || 'You are Mr. Ledger AI, an expert finance and accounting tutor for FinMentra. Answer ANY finance, accounting, IFRS, IAS, ISA, Tax, Costing, or FM question the student asks. Use the provided question context only as background — focus on what the student actually asked. Give concise exam-focused answers under 150 words. Bold key terms with **text**. Reference specific standard paragraphs where relevant. End with one practical exam tip.',
        messages: [{ role: 'user', content: userMessage }]
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

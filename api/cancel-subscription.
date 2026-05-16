const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.finmentra.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Get subscription ID from Supabase
    const { data, error } = await supabase
      .from('user_progress')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .single();

    if (error || !data?.stripe_subscription_id) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    // Cancel at period end (user keeps Pro until billing cycle ends)
    await stripe.subscriptions.update(data.stripe_subscription_id, {
      cancel_at_period_end: true
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Cancel subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
};

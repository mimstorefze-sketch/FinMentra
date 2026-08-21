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

    // Cancel any active Stripe subscription immediately (account is being deleted,
    // so no need to wait until end of billing period like the normal cancel flow)
    const { data: progress } = await supabase
      .from('user_progress')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .single();
    if (progress?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(progress.stripe_subscription_id);
      } catch (stripeErr) {
        // Don't block account deletion if Stripe cancel fails (e.g. already cancelled)
        console.error('Stripe cancel during account delete (continuing):', stripeErr.message);
      }
    }

    // Delete user_progress row (and any other user-linked rows, if you add tables later)
    await supabase.from('user_progress').delete().eq('user_id', userId);

    // Delete the actual auth account — requires service role key, cannot be done client-side
    const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
    if (authErr) {
      console.error('Delete auth user error:', authErr);
      return res.status(500).json({ error: authErr.message });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({ error: err.message });
  }
};

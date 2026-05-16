const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Supabase admin client (bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Disable body parsing — Stripe needs raw body for signature verification
export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    // ── Payment succeeded → activate Pro ──
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const userEmail = session.metadata?.userEmail;

      if (userId) {
        const { error } = await supabase
          .from('user_progress')
          .update({
            plan: 'pro',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            plan_started_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        if (error) console.error('Supabase update error:', error);
        else console.log(`✅ Pro activated for user ${userEmail}`);
      }
    }

    // ── Subscription cancelled → revert to free ──
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const userId = subscription.metadata?.userId;

      if (userId) {
        await supabase
          .from('user_progress')
          .update({ plan: 'free' })
          .eq('user_id', userId);

        console.log(`⬇️ Plan reverted to free for user ${userId}`);
      }
    }

    // ── Payment failed → notify (keep pro for now, Stripe retries) ──
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      console.warn(`⚠️ Payment failed for customer ${invoice.customer}`);
      // Stripe will retry — we don't revoke access immediately
    }

  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
};

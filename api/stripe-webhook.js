const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function getUserIdByEmail(email) {
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) { console.error('listUsers error:', error); return null; }
    const user = data?.users?.find(u => u.email === email);
    return user?.id || null;
  } catch(e) {
    console.error('getUserIdByEmail error:', e);
    return null;
  }
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

  console.log('Event:', event.type);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userEmail = session.customer_email || session.metadata?.userEmail;
      let userId = session.metadata?.userId;

      console.log('userId from metadata:', userId);
      console.log('userEmail:', userEmail);

      // Always lookup by email as most reliable method
      if (userEmail) {
        const foundId = await getUserIdByEmail(userEmail);
        if (foundId) {
          userId = foundId;
          console.log('userId confirmed by email lookup:', userId);
        }
      }

      if (!userId) {
        console.error('No userId found — cannot activate Pro');
        return res.status(200).json({ received: true, warning: 'no userId' });
      }

      // Upsert — works even if row doesn't exist yet
      const { error } = await supabase
        .from('user_progress')
        .upsert({
          user_id: userId,
          plan: 'pro',
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          plan_started_at: new Date().toISOString(),
          onboarding_done: true,
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('Supabase upsert error:', JSON.stringify(error));
      } else {
        console.log('✅ Pro activated for:', userEmail, userId);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      let userId = subscription.metadata?.userId;
      if (!userId && subscription.customer) {
        // Find user by stripe_customer_id
        const { data } = await supabase
          .from('user_progress')
          .select('user_id')
          .eq('stripe_customer_id', subscription.customer)
          .single();
        userId = data?.user_id;
      }
      if (userId) {
        await supabase.from('user_progress')
          .update({ plan: 'free' })
          .eq('user_id', userId);
        console.log('Plan reverted to free for:', userId);
      }
    }

    if (event.type === 'invoice.payment_failed') {
      console.warn('Payment failed for customer:', event.data.object.customer);
    }

  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
};

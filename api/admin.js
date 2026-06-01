export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify admin token
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Use exact same variable names as your existing Vercel setup
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaUrl = process.env.SUPABASE_URL || 'https://vofxhqnipoywbbkmlxcp.supabase.co';

  if (!supaKey) return res.status(500).json({ error: 'Service key not configured' });

  try {
    const { action, table, data, id, filters, select, order, limit, count } = req.body || {};

    if (!table) return res.status(400).json({ error: 'table is required' });

    // COUNT query (HEAD request)
    if (action === 'count') {
      let url = `${supaUrl}/rest/v1/${table}?select=*`;
      if (filters) Object.entries(filters).forEach(([col, val]) => url += `&${col}=eq.${encodeURIComponent(val)}`);
      const r = await fetch(url, {
        method: 'HEAD',
        headers: {
          'apikey': supaKey,
          'Authorization': 'Bearer ' + supaKey,
          'Prefer': 'count=exact'
        }
      });
      const cr = r.headers.get('content-range');
      return res.status(200).json({ count: cr ? parseInt(cr.split('/')[1]) || 0 : 0 });
    }

    // Build URL with query params
    let url = `${supaUrl}/rest/v1/${table}`;
    const params = new URLSearchParams();
    params.append('select', select || '*');
    if (order) params.append('order', order);
    if (limit) params.append('limit', String(limit));
    if (filters) Object.entries(filters).forEach(([col, val]) => params.append(col, `eq.${val}`));
    if (id) params.append('id', `eq.${id}`);
    url += '?' + params.toString();

    // HTTP method
    const methodMap = { select: 'GET', insert: 'POST', update: 'PATCH', delete: 'DELETE' };
    const method = methodMap[action] || 'GET';

    const headers = {
      'apikey': supaKey,
      'Authorization': 'Bearer ' + supaKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    const fetchOpts = { method, headers };
    if (data && (action === 'insert' || action === 'update')) {
      fetchOpts.body = JSON.stringify(data);
    }

    const response = await fetch(url, fetchOpts);

    // DELETE returns 204 no content
    if (response.status === 204) return res.status(200).json({ success: true });

    const result = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: result.message || result.error || 'Supabase error' });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Admin proxy error:', error);
    return res.status(500).json({ error: 'Admin service unavailable: ' + error.message });
  }
}

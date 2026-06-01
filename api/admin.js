export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaUrl = process.env.SUPABASE_URL || 'https://vofxhqnipoywbbkmlxcp.supabase.co';

  if (!supaKey) return res.status(500).json({ error: 'Service key not configured' });

  try {
    const { action, table, data, filters, select, order, limit } = req.body || {};

    if (!table) return res.status(400).json({ error: 'table is required' });

    const headers = {
      'apikey': supaKey,
      'Authorization': 'Bearer ' + supaKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    // COUNT
    if (action === 'count') {
      let url = `${supaUrl}/rest/v1/${table}?select=*`;
      if (filters) Object.entries(filters).forEach(([col, val]) => {
        url += `&${col}=eq.${encodeURIComponent(val)}`;
      });
      const r = await fetch(url, { method: 'HEAD', headers: { ...headers, 'Prefer': 'count=exact' } });
      const cr = r.headers.get('content-range');
      return res.status(200).json({ count: cr ? parseInt(cr.split('/')[1]) || 0 : 0 });
    }

    // Build base URL — filters go as query params for ALL actions
    let url = `${supaUrl}/rest/v1/${table}`;
    const params = new URLSearchParams();

    if (action === 'select' || action === 'insert') {
      params.append('select', select || '*');
      if (order) params.append('order', order);
      if (limit) params.append('limit', String(limit));
    }

    // For update/delete: filters MUST be in query params (Supabase requirement)
    if (filters && Object.keys(filters).length > 0) {
      Object.entries(filters).forEach(([col, val]) => {
        params.append(col, `eq.${val}`);
      });
    }

    const qs = params.toString();
    if (qs) url += '?' + qs;

    const methodMap = { select: 'GET', insert: 'POST', update: 'PATCH', delete: 'DELETE' };
    const method = methodMap[action] || 'GET';

    const fetchOpts = { method, headers };
    if (data && (action === 'insert' || action === 'update')) {
      fetchOpts.body = JSON.stringify(data);
    }

    const response = await fetch(url, fetchOpts);

    if (response.status === 204) return res.status(200).json({ success: true });

    const text = await response.text();
    if (!text) return res.status(200).json({ success: true });

    let result;
    try { result = JSON.parse(text); }
    catch(e) { return res.status(500).json({ error: 'Invalid response from Supabase: ' + text.substring(0, 100) }); }

    if (!response.ok) return res.status(response.status).json({ error: result.message || result.error || 'Supabase error' });

    return res.status(200).json(result);

  } catch (error) {
    console.error('Admin proxy error:', error);
    return res.status(500).json({ error: 'Admin service unavailable: ' + error.message });
  }
}

const axios = require('axios');

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const res = await axios.post('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: process.env.LARK_APP_ID,
    app_secret: process.env.LARK_APP_SECRET
  });
  if (res.data.code !== 0) throw new Error('Lark auth failed: ' + res.data.msg);
  _token = res.data.tenant_access_token;
  _tokenExpiry = Date.now() + (res.data.expire - 60) * 1000;
  return _token;
}

async function readLarkEmails(hoursBack = 24) {
  if (!process.env.LARK_APP_ID || !process.env.LARK_APP_SECRET) {
    console.log('[LARK] No credentials — skipping Lark scan');
    return [];
  }
  try {
    const token = await getToken();
    const res = await axios.get('https://open.larksuite.com/open-apis/mail/v1/mailboxes/me/messages', {
      headers: { Authorization: `Bearer ${token}` },
      params: { page_size: 50 }
    });
    const since = Date.now() - hoursBack * 3600 * 1000;
    const items = res.data.data?.items || [];
    const results = [];
    for (const msg of items) {
      if (msg.internal_date < since) continue;
      try {
        const detail = await axios.get(
          `https://open.larksuite.com/open-apis/mail/v1/mailboxes/me/messages/${msg.message_id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = detail.data.data;
        results.push({
          id: msg.message_id,
          subject: d.subject || '',
          from: d.from?.mail_address || '',
          date: new Date(msg.internal_date).toISOString(),
          snippet: d.body_plain?.slice(0, 500) || ''
        });
      } catch { continue; }
    }
    return results;
  } catch (e) {
    console.error('[LARK] readEmails error:', e.message);
    return [];
  }
}

function matchEmailsToLeads(emails, leads) {
  return leads
    .filter(l => l.lark_email)
    .map(lead => ({
      lead,
      emails: emails.filter(e =>
        e.from.toLowerCase().includes(lead.lark_email.toLowerCase()) ||
        e.from.toLowerCase().includes(lead.name.toLowerCase())
      )
    }))
    .filter(r => r.emails.length > 0);
}

module.exports = { readLarkEmails, matchEmailsToLeads };

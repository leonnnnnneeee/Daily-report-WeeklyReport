require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Hardcode credentials
const TG_API_ID = 23444646;
const TG_API_HASH = '83816a4a3a3006b19549b2ba782acae0';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rgtodxxuwdusaacipokt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndG9keHh1d2R1c2FhY2lwb2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjkxMjcsImV4cCI6MjA5NDIwNTEyN30.8zORHPswWA-0uwJfmKN9TxbTrsNdEAdk4IB8pst7GzU';

const logs = [];
function log(msg) {
  const line = '[' + new Date().toLocaleTimeString('vi-VN') + '] ' + msg;
  console.log(line);
  logs.push(line);
  if (logs.length > 300) logs.shift();
}

log('🚀 Coincu Sales v5 - Supabase DB');
log('TG_API_ID: ' + TG_API_ID);
log('Supabase: ' + SUPABASE_URL);

// Supabase DB helpers
const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function getLeads() {
  try {
    const r = await axios.get(SUPABASE_URL + '/rest/v1/leads?order=created_at.asc', { headers: sbHeaders });
    return r.data || [];
  } catch(e) { log('DB getLeads error: ' + e.message); return []; }
}

async function saveLead(lead) {
  try {
    await axios.post(SUPABASE_URL + '/rest/v1/leads', lead, { headers: sbHeaders });
  } catch(e) { log('DB saveLead error: ' + e.message); throw e; }
}

async function updateLead(id, data) {
  try {
    data.updated_at = new Date().toISOString();
    await axios.patch(SUPABASE_URL + '/rest/v1/leads?id=eq.' + id, data, { headers: sbHeaders });
  } catch(e) { log('DB updateLead error: ' + e.message); throw e; }
}

async function deleteLead(id) {
  try {
    await axios.delete(SUPABASE_URL + '/rest/v1/leads?id=eq.' + id, { headers: sbHeaders });
  } catch(e) { log('DB deleteLead error: ' + e.message); throw e; }
}

// Session
const SESSION_FILE = path.join(__dirname, 'data/tg.session');
let pendingClient = null;

function getSession() {
  try {
    if (process.env.TELEGRAM_SESSION && process.env.TELEGRAM_SESSION.length > 10)
      return process.env.TELEGRAM_SESSION;
    if (fs.existsSync(SESSION_FILE)) {
      const s = fs.readFileSync(SESSION_FILE, 'utf8').trim();
      if (s.length > 10) return s;
    }
  } catch(e) {}
  return null;
}

function saveSession(session) {
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, session);
    process.env.TELEGRAM_SESSION = session;
  } catch(e) { log('Save session error: ' + e.message); }
}

// LEADS API
app.get('/api/leads', async (req, res) => res.json(await getLeads()));

app.post('/api/leads', async (req, res) => {
  const lead = {
    id: 'lead_' + Date.now(),
    name: req.body.name || '',
    website: req.body.website || '',
    sources: req.body.sources || '',
    telegram_username: (req.body.telegram_username || '').replace('@','').trim(),
    lark_email: req.body.lark_email || '',
    research: req.body.research || '',
    status: req.body.status || 'new',
    note: req.body.note || '',
    last_contacted: new Date().toISOString().slice(0,10),
    week: Math.ceil((new Date() - new Date(new Date().getFullYear(),0,1)) / 604800000)
  };
  try {
    await saveLead(lead);
    log('➕ Lead added: ' + lead.name + ' (@' + lead.telegram_username + ')');
    res.json({ ok: true, lead });
  } catch(e) { res.json({ ok: false, message: e.message }); }
});

app.patch('/api/leads/:id', async (req, res) => {
  const data = {};
  if (req.body.status) data.status = req.body.status;
  if (req.body.note !== undefined) data.note = req.body.note;
  data.last_contacted = new Date().toISOString().slice(0,10);
  try { await updateLead(req.params.id, data); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, message: e.message }); }
});

app.delete('/api/leads/:id', async (req, res) => {
  try { await deleteLead(req.params.id); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, message: e.message }); }
});

app.get('/api/stats', async (req, res) => {
  const leads = await getLeads();
  const counts = {};
  leads.forEach(l => { counts[l.status] = (counts[l.status]||0)+1; });
  res.json({ total: leads.length, counts });
});

app.get('/api/logs', (req, res) => res.json(logs));

// AUTH
app.post('/api/auth/send-otp', async (req, res) => {
  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  log('📱 Sending OTP to ' + req.body.phone);
  try {
    const client = new TelegramClient(new StringSession(''), TG_API_ID, TG_API_HASH, { connectionRetries: 5 });
    await client.connect();
    await client.sendCode({ apiId: TG_API_ID, apiHash: TG_API_HASH }, req.body.phone);
    pendingClient = client;
    log('✅ OTP sent!');
    res.json({ ok: true });
  } catch(e) { log('❌ ' + e.message); res.json({ ok: false, message: e.message }); }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  log('🔑 Verifying OTP...');
  try {
    let client = pendingClient || new TelegramClient(new StringSession(''), TG_API_ID, TG_API_HASH, { connectionRetries: 5 });
    if (!pendingClient) await client.connect();
    await client.start({
      phoneNumber: () => Promise.resolve(req.body.phone),
      phoneCode: () => Promise.resolve(req.body.code),
      password: () => Promise.resolve(''),
      onError: (e) => { throw e }
    });
    const session = client.session.save();
    saveSession(session);
    pendingClient = null;
    log('✅ Session saved!');
    res.json({ ok: true });
  } catch(e) { log('❌ ' + e.message); res.json({ ok: false, message: e.message }); }
});

app.get('/api/auth/status', (req, res) => res.json({ connected: !!getSession() }));

// SCAN
app.post('/api/scan', async (req, res) => {
  log('🔍 Manual scan triggered');
  res.json({ ok: true });
  runScan().catch(e => log('❌ ' + e.message));
});

async function runScan() {
  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  const Anthropic = require('@anthropic-ai/sdk');

  const leads = await getLeads();
  const session = getSession();
  log('📋 Leads: ' + leads.length + ' | Session: ' + (session ? 'YES ✅' : 'NO ❌'));

  if (!session) { log('⚠️ No session — authenticate first'); return; }

  const leadsWithTG = leads.filter(l => l.telegram_username && l.telegram_username.length > 0);
  log('📱 Leads with TG: ' + leadsWithTG.length + ' → ' + leadsWithTG.map(l => '@' + l.telegram_username).join(', '));

  if (!leadsWithTG.length) { log('⚠️ No leads with telegram_username!'); return; }

  let client;
  try {
    client = new TelegramClient(new StringSession(session), TG_API_ID, TG_API_HASH, { connectionRetries: 3 });
    await client.connect();
    log('✅ Telegram connected!');
  } catch(e) { log('❌ TG connect: ' + e.message); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const ai = apiKey ? new Anthropic({ apiKey }) : null;
  log('🤖 AI: ' + (ai ? 'enabled' : 'disabled'));

  let changed = 0;
  for (const lead of leadsWithTG) {
    try {
      log('  🔍 @' + lead.telegram_username + ' (' + lead.name + ')...');
      const entity = await client.getEntity(lead.telegram_username);
      const msgs = await client.getMessages(entity, { limit: 20 });
      const cutoff = Date.now()/1000 - 72*3600;
      const recent = msgs.filter(m => m.date > cutoff && m.message)
        .map(m => ({ fromMe: m.out, text: m.message }));
      log('  📨 ' + recent.length + ' messages');

      if (!recent.length) { log('  ⚪ No recent messages'); continue; }
      recent.slice(0,3).forEach(m => log('  [' + (m.fromMe?'ME':lead.name) + ']: ' + m.text.slice(0,60)));

      if (!ai) continue;
      const res = await ai.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 200,
        system: 'Phân tích chat crypto lead. JSON: {"status":"interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost|no_change","summary":"1 câu tiếng Việt","next_action":"..."}',
        messages: [{ role: 'user', content: 'Lead: ' + lead.name + '\nStatus: ' + lead.status + '\n' + recent.map(m=>(m.fromMe?'ME':lead.name)+': '+m.text).join('\n') }]
      });
      const r = JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
      log('  🤖 → ' + r.status + ': ' + r.summary);

      if (r.status !== 'no_change') {
        await updateLead(lead.id, { status: r.status, note: r.summary, last_scanned: new Date().toISOString() });
        log('  ✅ Updated: ' + lead.status + ' → ' + r.status);
        changed++;
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch(e) { log('  ❌ ' + lead.name + ': ' + e.message); }
  }

  try { await client.disconnect(); } catch {}
  log('✅ Scan done — ' + changed + ' leads updated');
}

cron.schedule('0 */2 * * *', () => { log('[CRON] Auto scan'); runScan().catch(e => log('❌ ' + e.message)); }, { timezone: 'Asia/Ho_Chi_Minh' });

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  log('✅ Ready on port ' + PORT);
  getLeads().then(leads => log('📋 Leads in DB: ' + leads.length));
});

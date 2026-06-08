require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Hardcode credentials trực tiếp
const TG_API_ID = 23444646;
const TG_API_HASH = '83816a4a3a3006b19549b2ba782acae0';

const logs = [];
function log(msg) {
  const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`;
  console.log(line);
  logs.push(line);
  if (logs.length > 300) logs.shift();
}

log(`🚀 Coincu Sales v4 starting on port ${PORT}`);
log(`TG_API_ID: ${TG_API_ID} | TG_API_HASH: ${TG_API_HASH.slice(0,8)}...`);

// Session management
const SESSION_FILE = path.join(__dirname, 'data/tg.session');
let pendingClient = null;

function getSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const s = fs.readFileSync(SESSION_FILE, 'utf8').trim();
      if (s.length > 10) { log('Session found in file'); return s; }
    }
  } catch(e) {}
  return null;
}

function saveSession(session) {
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, session);
    log('Session saved to file');
  } catch(e) { log('Save session error: ' + e.message); }
}

// Leads DB
function getLeads() {
  const f = path.join(__dirname, 'data/leads.json');
  try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)).leads || [] : []; }
  catch(e) { return []; }
}
function saveLeads(leads) {
  const f = path.join(__dirname, 'data/leads.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ leads }, null, 2));
}

// LEADS API
app.get('/api/leads', (req, res) => res.json(getLeads()));
app.post('/api/leads', (req, res) => {
  const leads = getLeads();
  const lead = {
    id: `lead_${Date.now()}`,
    name: req.body.name || '',
    website: req.body.website || '',
    sources: req.body.sources || '',
    telegram_username: (req.body.telegram_username || '').replace('@','').trim(),
    lark_email: req.body.lark_email || '',
    research: req.body.research || '',
    status: req.body.status || 'new',
    note: req.body.note || '',
    last_contacted: new Date().toISOString().slice(0,10),
    last_scanned: null,
    week: Math.ceil((new Date() - new Date(new Date().getFullYear(),0,1)) / 604800000)
  };
  leads.push(lead);
  saveLeads(leads);
  log(`➕ Lead added: ${lead.name} (@${lead.telegram_username})`);
  res.json({ ok: true, lead });
});
app.patch('/api/leads/:id', (req, res) => {
  const leads = getLeads();
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.json({ ok: false });
  if (req.body.status) leads[idx].status = req.body.status;
  if (req.body.note !== undefined) leads[idx].note = req.body.note;
  leads[idx].last_contacted = new Date().toISOString().slice(0,10);
  saveLeads(leads);
  res.json({ ok: true });
});
app.delete('/api/leads/:id', (req, res) => {
  saveLeads(getLeads().filter(l => l.id !== req.params.id));
  res.json({ ok: true });
});
app.get('/api/stats', (req, res) => {
  const leads = getLeads();
  const counts = {};
  leads.forEach(l => { counts[l.status] = (counts[l.status]||0)+1; });
  res.json({ total: leads.length, counts });
});

// LOGS API
app.get('/api/logs', (req, res) => res.json(logs));

// AUTH API
app.post('/api/auth/send-otp', async (req, res) => {
  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  const phone = req.body.phone;
  log(`📱 Sending OTP to ${phone} | API_ID: ${TG_API_ID}`);
  try {
    const client = new TelegramClient(new StringSession(''), TG_API_ID, TG_API_HASH, { connectionRetries: 5 });
    await client.connect();
    await client.sendCode({ apiId: TG_API_ID, apiHash: TG_API_HASH }, phone);
    pendingClient = client;
    log('✅ OTP sent successfully!');
    res.json({ ok: true });
  } catch(e) {
    log('❌ Send OTP error: ' + e.message);
    res.json({ ok: false, message: e.message });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  const { phone, code } = req.body;
  log(`🔑 Verifying OTP for ${phone}`);
  try {
    let client = pendingClient;
    if (!client) {
      client = new TelegramClient(new StringSession(''), TG_API_ID, TG_API_HASH, { connectionRetries: 5 });
      await client.connect();
    }
    await client.start({
      phoneNumber: () => Promise.resolve(phone),
      phoneCode: () => Promise.resolve(code),
      password: () => Promise.resolve(''),
      onError: (e) => { throw e }
    });
    const session = client.session.save();
    saveSession(session);
    pendingClient = null;
    log('✅ Telegram authenticated! Session saved.');
    res.json({ ok: true });
  } catch(e) {
    log('❌ Verify OTP error: ' + e.message);
    res.json({ ok: false, message: e.message });
  }
});

app.get('/api/auth/status', (req, res) => {
  const session = getSession();
  res.json({ connected: !!session });
});

// SCAN
app.post('/api/scan', async (req, res) => {
  log('🔍 Manual scan triggered');
  res.json({ ok: true });
  runScan().catch(e => log('❌ Scan error: ' + e.message));
});

async function runScan() {
  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  const Anthropic = require('@anthropic-ai/sdk');

  const leads = getLeads();
  const session = getSession();

  log(`📋 Leads: ${leads.length} | Session: ${session ? 'YES ✅' : 'NO ❌'}`);

  if (!session) {
    log('⚠️ No session — authenticate first in Auto Scan tab');
    return;
  }

  const leadsWithTG = leads.filter(l => l.telegram_username && l.telegram_username.length > 0);
  log(`📱 Leads with TG username: ${leadsWithTG.length}`);

  if (!leadsWithTG.length) {
    log('⚠️ No leads have telegram_username set!');
    return;
  }

  log(`🔌 Connecting to Telegram...`);
  let client;
  try {
    client = new TelegramClient(new StringSession(session), TG_API_ID, TG_API_HASH, { connectionRetries: 3 });
    await client.connect();
    log('✅ Telegram connected!');
  } catch(e) {
    log('❌ TG connect failed: ' + e.message);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const ai = apiKey ? new Anthropic({ apiKey }) : null;
  log(`🤖 AI: ${ai ? 'enabled' : 'disabled (no ANTHROPIC_API_KEY)'}`);

  let changed = 0;
  for (const lead of leadsWithTG) {
    try {
      log(`🔍 Scanning @${lead.telegram_username} (${lead.name})...`);
      const entity = await client.getEntity(lead.telegram_username);
      const msgs = await client.getMessages(entity, { limit: 20 });
      const cutoff = Date.now()/1000 - 72*3600;
      const recent = msgs.filter(m => m.date > cutoff && m.message)
        .map(m => ({ fromMe: m.out, text: m.message }));
      log(`  📨 ${recent.length} messages in last 72h`);

      if (!recent.length) { log(`  ⚪ No new messages`); continue; }
      recent.forEach(m => log(`  [${m.fromMe?'ME':lead.name}]: ${m.text.slice(0,60)}`));

      if (!ai) continue;

      const res = await ai.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 200,
        system: `Phân tích chat với lead crypto. JSON: {"status":"interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost|no_change","summary":"1 câu tiếng Việt","next_action":"..."}`,
        messages: [{ role: 'user', content: `Lead: ${lead.name}\nStatus: ${lead.status}\n${recent.map(m=>`[${m.fromMe?'ME':lead.name}]:${m.text}`).join('\n')}` }]
      });

      const r = JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
      log(`  🤖 → ${r.status}: ${r.summary}`);

      if (r.status !== 'no_change' && r.status !== lead.status) {
        const all = getLeads();
        const idx = all.findIndex(l => l.id === lead.id);
        if (idx !== -1) {
          all[idx].status = r.status;
          all[idx].note = r.summary;
          all[idx].last_scanned = new Date().toISOString();
          saveLeads(all);
          log(`  ✅ Updated: ${lead.status} → ${r.status}`);
          changed++;
        }
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch(e) {
      log(`  ❌ Error scanning ${lead.name}: ${e.message}`);
    }
  }

  try { await client.disconnect(); } catch {}
  log(`✅ Scan done — ${changed} leads updated`);
}

cron.schedule('0 */2 * * *', () => {
  log('[CRON] Auto scan...');
  runScan().catch(e => log('❌ ' + e.message));
}, { timezone: 'Asia/Ho_Chi_Minh' });

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  log(`✅ Server ready on port ${PORT}`);
  log(`📋 Leads: ${getLeads().length}`);
});

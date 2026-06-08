require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// In-memory log buffer
const logs = [];
function log(msg) {
  const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`;
  console.log(line);
  logs.push(line);
  if (logs.length > 200) logs.shift();
}

let tgAuth;
try { tgAuth = require('./src/tg-auth'); log('✅ tg-auth loaded'); }
catch(e) { log('❌ tg-auth: ' + e.message); }

function getLeads() {
  const f = path.join(__dirname, 'data/leads.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)).leads || [] : [];
}
function saveLeads(leads) {
  const f = path.join(__dirname, 'data/leads.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ leads }, null, 2));
}

// ── LEADS API ──────────────────────────────────────
app.get('/api/leads', (req, res) => res.json(getLeads()));

app.post('/api/leads', (req, res) => {
  const leads = getLeads();
  const lead = {
    id: `lead_${Date.now()}`,
    name: req.body.name || '',
    website: req.body.website || '',
    sources: req.body.sources || '',
    telegram_username: req.body.telegram_username || '',
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

// ── LOG API ────────────────────────────────────────
app.get('/api/logs', (req, res) => res.json(logs));

// ── SCAN API ───────────────────────────────────────
app.post('/api/scan', async (req, res) => {
  log('🔍 Manual scan triggered');
  res.json({ ok: true, message: 'Scan đang chạy...' });
  runScan().catch(e => log('❌ Scan error: ' + e.message));
});

// ── TELEGRAM AUTH ──────────────────────────────────
app.post('/api/auth/send-otp', async (req, res) => {
  if (!tgAuth) return res.json({ ok: false, message: 'tg-auth module lỗi' });
  try {
    log(`📱 Sending OTP to ${req.body.phone}`);
    await tgAuth.sendOtp(req.body.phone);
    log('✅ OTP sent');
    res.json({ ok: true });
  } catch(e) {
    log('❌ OTP error: ' + e.message);
    res.json({ ok: false, message: e.message });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  if (!tgAuth) return res.json({ ok: false, message: 'tg-auth module lỗi' });
  try {
    log('🔑 Verifying OTP...');
    await tgAuth.verifyOtp(req.body.phone, req.body.code);
    log('✅ Telegram session saved!');
    res.json({ ok: true });
  } catch(e) {
    log('❌ Verify error: ' + e.message);
    res.json({ ok: false, message: e.message });
  }
});

app.get('/api/auth/status', (req, res) => {
  const session = tgAuth ? tgAuth.getSession() : null;
  res.json({ connected: !!session });
});

// ── SCAN LOGIC ─────────────────────────────────────
const Anthropic = require('@anthropic-ai/sdk');

const STATUS_MAP = {
  interested:'interested', waiting:'waiting', no_budget:'no_budget',
  follow_up_needed:'follow_up_needed', closed_won:'closed_won', closed_lost:'closed_lost'
};

async function analyzeMessages(leadName, messages, currentStatus) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { log('❌ No ANTHROPIC_API_KEY'); return null; }
  
  const client = new Anthropic({ apiKey });
  const text = messages.map(m => `[${m.fromMe?'TÔI':leadName}]: ${m.text}`).join('\n');
  
  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `Phân tích chat với lead crypto, trả về JSON:
{"status":"interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost|no_change","summary":"1 câu tiếng Việt","next_action":"việc cần làm"}`,
      messages: [{ role: 'user', content: `Lead: ${leadName}\nStatus hiện tại: ${currentStatus}\n\n${text}` }]
    });
    return JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
  } catch(e) {
    log('❌ AI error: ' + e.message);
    return null;
  }
}

async function runScan() {
  const leads = getLeads();
  const session = tgAuth ? tgAuth.getSession() : null;
  
  log(`📋 Leads: ${leads.length} | TG Session: ${session ? 'YES' : 'NO'}`);
  
  if (!session) {
    log('⚠️ Chưa có Telegram session — vào tab Setup xác thực OTP trước');
    return;
  }

  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  
  const TG_API_ID = parseInt(process.env.TELEGRAM_API_ID || '23444646');
  const TG_API_HASH = process.env.TELEGRAM_API_HASH || '83816a4a3a3006b19549b2ba782acae0';
  
  log(`📱 Connecting Telegram (API_ID: ${TG_API_ID})...`);
  
  let client;
  try {
    client = new TelegramClient(new StringSession(session), TG_API_ID, TG_API_HASH, { connectionRetries: 3 });
    await client.connect();
    log('✅ Telegram connected');
  } catch(e) {
    log('❌ Telegram connect failed: ' + e.message);
    return;
  }

  const leadsWithTG = leads.filter(l => l.telegram_username);
  log(`📱 Scanning ${leadsWithTG.length} leads with Telegram username...`);

  if (leadsWithTG.length === 0) {
    log('⚠️ Không có lead nào có telegram_username — thêm @username vào tab Add Lead');
    await client.disconnect();
    return;
  }

  let changed = 0;
  for (const lead of leadsWithTG) {
    try {
      log(`  Scanning @${lead.telegram_username}...`);
      const entity = await client.getEntity(lead.telegram_username);
      const msgs = await client.getMessages(entity, { limit: 20 });
      const cutoff = Date.now()/1000 - 24*3600;
      const recent = msgs.filter(m => m.date > cutoff && m.message)
                        .map(m => ({ fromMe: m.out, text: m.message }));
      
      if (!recent.length) { log(`  ⚪ ${lead.name}: không có tin mới`); continue; }
      
      log(`  📨 ${lead.name}: ${recent.length} tin → AI phân tích...`);
      const analysis = await analyzeMessages(lead.name, recent, lead.status);
      
      if (analysis && analysis.status !== 'no_change' && analysis.status !== lead.status) {
        const allLeads = getLeads();
        const idx = allLeads.findIndex(l => l.id === lead.id);
        if (idx !== -1) {
          allLeads[idx].status = analysis.status;
          allLeads[idx].note = analysis.summary;
          allLeads[idx].last_scanned = new Date().toISOString();
          saveLeads(allLeads);
          log(`  ✅ ${lead.name}: ${lead.status} → ${analysis.status}`);
          changed++;
        }
      } else {
        log(`  → ${lead.name}: ${analysis?.summary || 'no change'}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch(e) {
      log(`  ❌ ${lead.name}: ${e.message}`);
    }
  }
  
  await client.disconnect();
  log(`✅ Scan xong — ${changed} leads cập nhật`);
}

// Cron mỗi 2 giờ
cron.schedule('0 */2 * * *', () => {
  log('[CRON] Auto scan...');
  runScan().catch(e => log('❌ Cron error: ' + e.message));
}, { timezone: 'Asia/Ho_Chi_Minh' });

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Coincu Sales v3.0 — port ${PORT}`);
  log(`📋 Leads: ${getLeads().length}`);
  log(`TG API_ID: ${process.env.TELEGRAM_API_ID || '23444646 (default)'}`);
});

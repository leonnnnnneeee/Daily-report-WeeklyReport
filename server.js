require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Live log buffer
const logs = [];
function log(msg) {
  const line = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`;
  console.log(line);
  logs.push(line);
  if (logs.length > 300) logs.shift();
}

const TG_API_ID = parseInt(process.env.TELEGRAM_API_ID || '23444646');
const TG_API_HASH = process.env.TELEGRAM_API_HASH || '83816a4a3a3006b19549b2ba782acae0';

log(`🚀 Starting Coincu Sales v3 on port ${PORT}`);
log(`TG_API_ID: ${TG_API_ID}`);

let tgAuth;
try { tgAuth = require('./src/tg-auth'); log('✅ tg-auth loaded'); }
catch(e) { log('❌ tg-auth error: ' + e.message); }

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

// ── LEADS ──────────────────────────────────────────
app.get('/api/leads', (req, res) => res.json(getLeads()));

app.post('/api/leads', (req, res) => {
  const leads = getLeads();
  const lead = {
    id: `lead_${Date.now()}`,
    name: req.body.name || '',
    website: req.body.website || '',
    sources: req.body.sources || '',
    telegram_username: (req.body.telegram_username || '').replace('@',''),
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
  log(`➕ Added lead: ${lead.name} (@${lead.telegram_username})`);
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

// ── LOGS ───────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(logs);
});

// ── TELEGRAM AUTH ──────────────────────────────────
app.post('/api/auth/send-otp', async (req, res) => {
  log(`📱 Sending OTP to ${req.body.phone}...`);
  if (!tgAuth) return res.json({ ok: false, message: 'tg-auth module lỗi' });
  try {
    await tgAuth.sendOtp(req.body.phone);
    log('✅ OTP sent!');
    res.json({ ok: true });
  } catch(e) {
    log('❌ OTP error: ' + e.message);
    res.json({ ok: false, message: e.message });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  log('🔑 Verifying OTP...');
  if (!tgAuth) return res.json({ ok: false, message: 'tg-auth module lỗi' });
  try {
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

// ── SCAN ───────────────────────────────────────────
app.post('/api/scan', async (req, res) => {
  log('🔍 Manual scan triggered');
  res.json({ ok: true, message: 'Scan đang chạy...' });
  runScan().catch(e => log('❌ Scan error: ' + e.message));
});

async function runScan() {
  const leads = getLeads();
  const session = tgAuth ? tgAuth.getSession() : null;

  log(`📋 Total leads: ${leads.length}`);
  log(`🔐 TG Session: ${session ? 'YES ✅' : 'NO ❌'}`);

  if (!session) {
    log('⚠️  Chưa có session — vào tab Auto Scan xác thực OTP');
    return;
  }

  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  const Anthropic = require('@anthropic-ai/sdk');

  log(`📱 Connecting Telegram (API_ID: ${TG_API_ID})...`);
  let client;
  try {
    client = new TelegramClient(new StringSession(session), TG_API_ID, TG_API_HASH, { connectionRetries: 3 });
    await client.connect();
    log('✅ Telegram connected!');
  } catch(e) {
    log('❌ Connect failed: ' + e.message);
    return;
  }

  const leadsWithTG = leads.filter(l => l.telegram_username);
  log(`📱 Leads có TG username: ${leadsWithTG.length}`);

  if (!leadsWithTG.length) {
    log('⚠️  Không có lead nào có telegram_username!');
    await client.disconnect();
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const ai = apiKey ? new Anthropic({ apiKey }) : null;
  if (!ai) log('⚠️  Không có ANTHROPIC_API_KEY — sẽ không AI phân tích');

  let changed = 0;
  for (const lead of leadsWithTG) {
    try {
      log(`  🔍 Scanning @${lead.telegram_username} (${lead.name})...`);
      const entity = await client.getEntity(lead.telegram_username);
      const msgs = await client.getMessages(entity, { limit: 30 });
      const cutoff = Date.now()/1000 - 48*3600; // 48h
      const recent = msgs.filter(m => m.date > cutoff && m.message)
                        .map(m => ({ fromMe: m.out, text: m.message, date: new Date(m.date*1000).toLocaleString('vi-VN') }));

      log(`  📨 ${lead.name}: ${recent.length} tin nhắn trong 48h qua`);

      if (!recent.length) {
        log(`  ⚪ ${lead.name}: không có tin mới`);
        continue;
      }

      // Hiện tin nhắn
      recent.forEach(m => log(`    [${m.fromMe?'TÔI':lead.name}]: ${m.text.slice(0,80)}`));

      if (!ai) continue;

      // AI phân tích
      const msgText = recent.map(m => `[${m.fromMe?'TÔI':lead.name}]: ${m.text}`).join('\n');
      const res = await ai.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: `Phân tích chat với lead crypto. Trả về JSON:
{"status":"interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost|no_change","summary":"1 câu tiếng Việt","next_action":"việc cần làm"}`,
        messages: [{ role: 'user', content: `Lead: ${lead.name}\nStatus hiện tại: ${lead.status}\n\n${msgText}` }]
      });

      const analysis = JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
      log(`  🤖 AI: ${analysis.status} — ${analysis.summary}`);

      if (analysis.status !== 'no_change' && analysis.status !== lead.status) {
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
      }

      await new Promise(r => setTimeout(r, 1500));
    } catch(e) {
      log(`  ❌ ${lead.name}: ${e.message}`);
    }
  }

  try { await client.disconnect(); } catch {}
  log(`✅ Scan hoàn tất — ${changed} leads cập nhật`);
}

// Cron mỗi 2 giờ
cron.schedule('0 */2 * * *', () => {
  log('[CRON] Auto scan triggered');
  runScan().catch(e => log('❌ Cron: ' + e.message));
}, { timezone: 'Asia/Ho_Chi_Minh' });

// Serve React
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  log(`✅ Server listening on port ${PORT}`);
  log(`📋 Leads: ${getLeads().length}`);
});

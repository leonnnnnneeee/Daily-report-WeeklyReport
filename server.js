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

const TG_API_ID = 23444646;
const TG_API_HASH = '83816a4a3a3006b19549b2ba782acae0';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rgtodxxuwdusaacipokt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndG9keHh1d2R1c2FhY2lwb2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjkxMjcsImV4cCI6MjA5NDIwNTEyN30.8zORHPswWA-0uwJfmKN9TxbTrsNdEAdk4IB8pst7GzU';

const logs = [];
function log(msg) {
  const line = '[' + new Date().toLocaleTimeString('vi-VN') + '] ' + msg;
  console.log(line);
  logs.push(line);
  if (logs.length > 500) logs.shift();
}
log('🚀 Coincu Sales v6 - Auto DM Scanner');

// Supabase
const sbH = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
async function getLeads() {
  try { const r = await axios.get(SUPABASE_URL + '/rest/v1/leads?order=created_at.asc', { headers: sbH }); return r.data || []; }
  catch(e) { log('DB error: ' + e.message); return []; }
}
async function upsertLead(lead) {
  try {
    const existing = await axios.get(SUPABASE_URL + '/rest/v1/leads?telegram_username=eq.' + lead.telegram_username, { headers: sbH });
    if (existing.data && existing.data.length > 0) {
      // Update existing
      await axios.patch(SUPABASE_URL + '/rest/v1/leads?telegram_username=eq.' + lead.telegram_username,
        { status: lead.status, note: lead.note, last_scanned: new Date().toISOString(), last_contacted: new Date().toISOString().slice(0,10) },
        { headers: sbH });
      return { action: 'updated', lead: existing.data[0] };
    } else {
      // Insert new
      await axios.post(SUPABASE_URL + '/rest/v1/leads', lead, { headers: sbH });
      return { action: 'created', lead };
    }
  } catch(e) { log('Upsert error: ' + e.message); throw e; }
}
async function updateLead(id, data) {
  try { await axios.patch(SUPABASE_URL + '/rest/v1/leads?id=eq.' + id, { ...data, updated_at: new Date().toISOString() }, { headers: sbH }); }
  catch(e) { log('Update error: ' + e.message); }
}
async function deleteLead(id) {
  try { await axios.delete(SUPABASE_URL + '/rest/v1/leads?id=eq.' + id, { headers: sbH }); }
  catch(e) { log('Delete error: ' + e.message); }
}

// Session
const SESSION_FILE = path.join(__dirname, 'data/tg.session');
let pendingClient = null;
function getSession() {
  try {
    if (process.env.TELEGRAM_SESSION && process.env.TELEGRAM_SESSION.length > 10) return process.env.TELEGRAM_SESSION;
    if (fs.existsSync(SESSION_FILE)) { const s = fs.readFileSync(SESSION_FILE, 'utf8').trim(); if (s.length > 10) return s; }
  } catch(e) {}
  return null;
}
function saveSession(s) {
  try { fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true }); fs.writeFileSync(SESSION_FILE, s); process.env.TELEGRAM_SESSION = s; log('✅ Session saved'); }
  catch(e) { log('Save session error: ' + e.message); }
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
  try { await axios.post(SUPABASE_URL + '/rest/v1/leads', lead, { headers: sbH }); log('➕ ' + lead.name); res.json({ ok: true, lead }); }
  catch(e) { res.json({ ok: false, message: e.message }); }
});
app.patch('/api/leads/:id', async (req, res) => {
  const data = { last_contacted: new Date().toISOString().slice(0,10) };
  if (req.body.status) data.status = req.body.status;
  if (req.body.note !== undefined) data.note = req.body.note;
  try { await updateLead(req.params.id, data); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false }); }
});
app.delete('/api/leads/:id', async (req, res) => {
  try { await deleteLead(req.params.id); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false }); }
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
  } catch(e) { log('❌ OTP: ' + e.message); res.json({ ok: false, message: e.message }); }
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
    saveSession(client.session.save());
    pendingClient = null;
    res.json({ ok: true });
  } catch(e) { log('❌ Verify: ' + e.message); res.json({ ok: false, message: e.message }); }
});

app.get('/api/auth/status', (req, res) => res.json({ connected: !!getSession() }));

// MAIN SCAN - quét toàn bộ DM conversations
async function runScan() {
  const { TelegramClient } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  const { Api } = require('telegram');
  const Anthropic = require('@anthropic-ai/sdk');

  const session = getSession();
  log('🔐 Session: ' + (session ? 'YES ✅' : 'NO ❌'));
  if (!session) { log('⚠️ No session — authenticate first'); return; }

  let client;
  try {
    client = new TelegramClient(new StringSession(session), TG_API_ID, TG_API_HASH, { connectionRetries: 3 });
    await client.connect();
    log('✅ Telegram connected!');
  } catch(e) { log('❌ Connect: ' + e.message); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const ai = apiKey ? new Anthropic({ apiKey }) : null;
  if (!ai) { log('⚠️ No ANTHROPIC_API_KEY'); }

  // Lấy tất cả dialogs (conversations)
  log('📥 Fetching all DM conversations...');
  let dialogs = [];
  try {
    dialogs = await client.getDialogs({ limit: 100 });
    log('📬 Found ' + dialogs.length + ' conversations');
  } catch(e) { log('❌ getDialogs: ' + e.message); await client.disconnect(); return; }

  // Lọc chỉ DM (không phải group/channel)
  const dmDialogs = dialogs.filter(d => d.isUser && !d.entity.bot);
  log('👤 DM conversations: ' + dmDialogs.length);

  const cutoff = Date.now()/1000 - 72*3600; // 72h qua
  let newLeads = 0, updatedLeads = 0;

  for (const dialog of dmDialogs) {
    try {
      const entity = dialog.entity;
      const username = entity.username || '';
      const name = (entity.firstName || '') + ' ' + (entity.lastName || '');
      const displayName = username || name.trim() || String(entity.id);

      // Lấy messages gần đây
      const msgs = await client.getMessages(entity, { limit: 20 });
      const recent = msgs.filter(m => m.date > cutoff && m.message)
        .map(m => ({ fromMe: m.out, text: m.message, date: new Date(m.date*1000).toLocaleString('vi-VN') }));

      if (!recent.length) continue;

      log('  💬 ' + displayName + ': ' + recent.length + ' msgs');

      if (!ai) continue;

      // AI phân tích
      const msgText = recent.map(m => '[' + (m.fromMe?'TÔI':name.trim()) + ']: ' + m.text).join('\n');
      const res = await ai.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 300,
        system: `Bạn là sales analyst Coincu.com (crypto PR & media).
Phân tích conversation Telegram và xác định:
1. Đây có phải lead tiềm năng không (dự án crypto/Web3 cần PR/media)
2. Trạng thái hiện tại

Trả về JSON:
{"is_lead": true/false, "name": "tên dự án hoặc người", "status": "interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost|new", "summary": "1 câu tóm tắt tiếng Việt", "next_action": "việc cần làm tiếp theo"}`,
        messages: [{ role: 'user', content: 'Conversation với: ' + displayName + '\n\n' + msgText }]
      });

      const r = JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());

      if (!r.is_lead) { log('  ⏩ ' + displayName + ': not a lead'); continue; }

      log('  🎯 LEAD: ' + r.name + ' | ' + r.status + ' | ' + r.summary);

      // Upsert vào DB
      const leadData = {
        id: 'lead_tg_' + entity.id,
        name: r.name || displayName,
        telegram_username: username,
        status: r.status,
        note: r.summary,
        sources: 'Telegram DM',
        website: '',
        lark_email: '',
        research: r.summary,
        last_contacted: new Date().toISOString().slice(0,10),
        last_scanned: new Date().toISOString(),
        week: Math.ceil((new Date() - new Date(new Date().getFullYear(),0,1)) / 604800000)
      };

      const result = await upsertLead(leadData);
      if (result.action === 'created') { newLeads++; log('  ✅ NEW lead added: ' + r.name); }
      else { updatedLeads++; log('  🔄 Updated: ' + r.name); }

      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch(e) {
      log('  ❌ Error: ' + e.message);
    }
  }

  try { await client.disconnect(); } catch {}
  log('✅ Scan done! New: ' + newLeads + ' | Updated: ' + updatedLeads);

  // Generate daily report
  if (ai && (newLeads > 0 || updatedLeads > 0)) {
    await generateDailyReport(ai);
  }
}

// Generate + log daily report
async function generateDailyReport(ai) {
  const leads = await getLeads();
  if (!leads.length) return;

  log('📋 Generating daily report...');
  const summary = leads.map(l => l.name + ': ' + l.status + ' — ' + l.note).join('\n');

  try {
    const res = await ai.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      system: 'Tạo daily standup report ngắn gọn bằng tiếng Việt cho sales team Coincu.com (crypto PR & media).',
      messages: [{ role: 'user', content: 'Leads hôm nay:\n' + summary + '\n\nTạo daily report với: yesterday, today, follow-ups.' }]
    });
    const report = res.content[0].text;
    log('📊 DAILY REPORT:\n' + report);

    // Gửi qua Telegram Bot nếu có
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
      await axios.post('https://api.telegram.org/bot' + botToken + '/sendMessage', {
        chat_id: chatId, text: report, parse_mode: 'HTML'
      });
      log('📤 Daily report sent via Telegram Bot!');
    } else {
      log('ℹ️ No BOT_TOKEN/CHAT_ID — report logged only');
    }
  } catch(e) { log('❌ Report error: ' + e.message); }
}

app.post('/api/scan', async (req, res) => {
  log('🔍 Manual scan triggered');
  res.json({ ok: true });
  runScan().catch(e => log('❌ ' + e.message));
});

// Cron 8:00 sáng mỗi ngày
cron.schedule('0 8 * * *', () => { log('[CRON] Daily scan 8AM'); runScan().catch(e => log('❌ ' + e.message)); }, { timezone: 'Asia/Ho_Chi_Minh' });

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  log('✅ Ready on port ' + PORT);
  getLeads().then(l => log('📋 Leads in DB: ' + l.length));
});

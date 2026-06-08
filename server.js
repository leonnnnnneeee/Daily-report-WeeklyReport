require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Load modules
let scanner, leadsDb, tgAuth;
try { leadsDb = require('./src/leads-db'); } catch(e) { console.warn('[WARN] leads-db:', e.message); }
try { scanner = require('./src/scanner'); } catch(e) { console.warn('[WARN] scanner:', e.message); }
try { tgAuth = require('./src/tg-auth'); } catch(e) { console.warn('[WARN] tg-auth:', e.message); }

function getLeads() {
  if (leadsDb) return leadsDb.getLeads();
  const f = path.join(__dirname, 'data/leads.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)).leads : [];
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

// ── SCAN API ───────────────────────────────────────
app.post('/api/scan', async (req, res) => {
  if (!scanner) return res.json({ ok: false, message: 'Scanner chưa sẵn sàng — kiểm tra Railway Variables' });
  res.json({ ok: true, message: 'Scan đang chạy...' });
  scanner.runScan().catch(console.error);
});

// ── TELEGRAM AUTH API ──────────────────────────────
app.post('/api/auth/send-otp', async (req, res) => {
  if (!tgAuth) return res.json({ ok: false, message: 'Telegram module không load được' });
  try {
    await tgAuth.sendOtp(req.body.phone);
    res.json({ ok: true });
  } catch(e) {
    console.error('[AUTH] sendOtp error:', e.message);
    res.json({ ok: false, message: e.message });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  if (!tgAuth) return res.json({ ok: false, message: 'Telegram module không load được' });
  try {
    const result = await tgAuth.verifyOtp(req.body.phone, req.body.code);
    res.json({ ok: true, message: 'Session saved' });
  } catch(e) {
    console.error('[AUTH] verifyOtp error:', e.message);
    res.json({ ok: false, message: e.message });
  }
});

app.get('/api/auth/status', (req, res) => {
  const session = tgAuth ? tgAuth.getSession() : null;
  res.json({ connected: !!session });
});

// ── SERVE REACT ────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// ── CRON mỗi 2 giờ ────────────────────────────────
if (scanner) {
  cron.schedule('0 */2 * * *', () => {
    console.log(`[CRON] ${new Date().toLocaleString('vi-VN')} — scanning...`);
    scanner.runScan().catch(console.error);
  }, { timezone: 'Asia/Ho_Chi_Minh' });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Coincu Sales v2.0 — port ${PORT}`);
  console.log(`📋 Leads: ${getLeads().length}`);
  console.log(`🤖 Scanner: ${scanner ? 'ON' : 'OFF'}`);
  console.log(`📱 TG Auth: ${tgAuth ? 'ON' : 'OFF'}\n`);
});

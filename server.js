require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

let scanner, leadsDb;
try {
  leadsDb = require('./src/leads-db');
  scanner = require('./src/scanner');
} catch(e) { console.warn('[WARN] Automation not loaded:', e.message); }

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

// API routes
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
  res.json({ total: leads.length, counts, time: new Date().toISOString() });
});

app.post('/api/scan', async (req, res) => {
  if (!scanner) return res.json({ ok: false, message: 'Scanner not configured — set TELEGRAM_SESSION + LARK credentials' });
  res.json({ ok: true, message: 'Scan triggered' });
  scanner.runScan().catch(console.error);
});

// Serve React
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// Cron mỗi 2 giờ
if (scanner) {
  cron.schedule('0 */2 * * *', () => {
    console.log(`[CRON] ${new Date().toLocaleString('vi-VN')} — scanning...`);
    scanner.runScan().catch(console.error);
  }, { timezone: 'Asia/Ho_Chi_Minh' });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Coincu Sales System v2.0 — port ${PORT}`);
  console.log(`📋 Leads: ${getLeads().length}`);
  console.log(`🤖 Auto scan: ${scanner ? 'ON (every 2h)' : 'OFF'}\n`);
});

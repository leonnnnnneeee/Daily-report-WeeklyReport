require('dotenv').config();
const { scanAllTelegramLeads } = require('./telegram-reader');
const { readLarkEmails, matchEmailsToLeads } = require('./lark-reader');
const { analyzeMessages } = require('./ai-analyzer');
const { getLeads, updateLeadStatus } = require('./leads-db');

async function runScan() {
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`🔍 SCAN bắt đầu lúc ${now}`);
  console.log('═'.repeat(50));

  const leads = getLeads();
  const changes = [];

  // ── TELEGRAM ──────────────────────────────────────
  console.log('\n📱 Quét Telegram DM...');
  try {
    const tgResults = await scanAllTelegramLeads(leads, 24);
    for (const { lead, messages } of tgResults) {
      if (!messages.length) { console.log(`   ⚪ ${lead.name}: không có tin mới`); continue; }
      console.log(`   📨 ${lead.name}: ${messages.length} tin → AI phân tích...`);
      const r = await analyzeMessages(lead.name, messages, lead.status, 'Telegram');
      console.log(`   → ${r.status}: ${r.summary}`);
      const changed = updateLeadStatus(lead.id, r.status, r.summary);
      if (changed) changes.push({ name: lead.name, source: 'Telegram', old: lead.status, new: r.status, action: r.next_action });
    }
  } catch (e) { console.error('[TG SCAN ERROR]', e.message); }

  // ── LARK MAIL ─────────────────────────────────────
  console.log('\n📧 Quét Lark Mail...');
  try {
    const emails = await readLarkEmails(24);
    console.log(`   ${emails.length} emails mới`);
    const matched = matchEmailsToLeads(emails, leads);
    for (const { lead, emails: le } of matched) {
      console.log(`   📧 ${lead.name}: ${le.length} email → AI phân tích...`);
      const msgs = le.map(e => ({ date: e.date, fromMe: false, text: `Subject: ${e.subject}\n${e.snippet}` }));
      const r = await analyzeMessages(lead.name, msgs, lead.status, 'Lark Mail');
      console.log(`   → ${r.status}: ${r.summary}`);
      const changed = updateLeadStatus(lead.id, r.status, r.summary);
      if (changed) changes.push({ name: lead.name, source: 'Lark', old: lead.status, new: r.status, action: r.next_action });
    }
  } catch (e) { console.error('[LARK SCAN ERROR]', e.message); }

  // ── SUMMARY ───────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  if (!changes.length) {
    console.log('✅ Xong — không có thay đổi');
  } else {
    console.log(`✅ Xong — ${changes.length} thay đổi:`);
    changes.forEach(c => console.log(`  • ${c.name} [${c.source}]: ${c.old} → ${c.new}\n    → ${c.action}`));
  }
  console.log('─'.repeat(50) + '\n');
  return changes;
}

if (require.main === module) runScan().catch(console.error);
module.exports = { runScan };

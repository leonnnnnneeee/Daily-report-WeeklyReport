const fs = require('fs');
const path = require('path');
const LEADS_FILE = path.join(__dirname, '../data/leads.json');

function getLeads() {
  return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8')).leads || [];
}

function saveLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify({ leads }, null, 2));
}

function updateLeadStatus(leadId, newStatus, note) {
  const leads = getLeads();
  const idx = leads.findIndex(l => l.id === leadId);
  if (idx === -1) return false;
  const old = leads[idx].status;
  if (newStatus && newStatus !== 'no_change') leads[idx].status = newStatus;
  if (note) leads[idx].note = note;
  leads[idx].last_scanned = new Date().toISOString();
  leads[idx].last_contacted = new Date().toISOString().slice(0, 10);
  saveLeads(leads);
  return newStatus !== 'no_change' && newStatus !== old;
}

module.exports = { getLeads, saveLeads, updateLeadStatus };

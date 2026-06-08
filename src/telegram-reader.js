const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

async function getClient() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  // Dùng session string từ env (Railway không có filesystem persistent)
  const session = new StringSession(process.env.TELEGRAM_SESSION || '');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
  });
  await client.connect();
  return client;
}

async function readDMMessages(client, username, hoursBack = 24) {
  try {
    const entity = await client.getEntity(username);
    const messages = await client.getMessages(entity, { limit: 30 });
    const cutoff = Date.now() / 1000 - hoursBack * 3600;
    return messages
      .filter(m => m.date > cutoff && m.message)
      .map(m => ({
        date: new Date(m.date * 1000).toISOString(),
        fromMe: m.out,
        text: m.message
      }));
  } catch (e) {
    console.error(`[TG] Cannot read @${username}:`, e.message);
    return [];
  }
}

async function scanAllTelegramLeads(leads, hoursBack = 24) {
  if (!process.env.TELEGRAM_SESSION) {
    console.log('[TG] No TELEGRAM_SESSION set — skipping Telegram scan');
    return [];
  }
  let client;
  try {
    client = await getClient();
  } catch (e) {
    console.error('[TG] Connect failed:', e.message);
    return [];
  }

  const results = [];
  for (const lead of leads) {
    if (!lead.telegram_username) continue;
    console.log(`[TG] Scanning ${lead.name} (@${lead.telegram_username})...`);
    const messages = await readDMMessages(client, lead.telegram_username, hoursBack);
    results.push({ lead, messages });
    await new Promise(r => setTimeout(r, 1000));
  }

  await client.disconnect();
  return results;
}

module.exports = { scanAllTelegramLeads };

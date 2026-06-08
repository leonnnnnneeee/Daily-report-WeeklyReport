const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const path = require('path');
const fs = require('fs');

const SESSION_FILE = path.join(__dirname, '../data/tg.session');

// Fallback hardcoded nếu env không có
const TG_API_ID = parseInt(process.env.TELEGRAM_API_ID || '36780878');
const TG_API_HASH = process.env.TELEGRAM_API_HASH || 'a9a578157a139127c0cac768c736a301';

let pendingClient = null;

async function sendOtp(phone) {
  console.log('[TG AUTH] API_ID:', TG_API_ID, 'API_HASH:', TG_API_HASH ? 'set' : 'missing');

  let sessionStr = '';
  if (process.env.TELEGRAM_SESSION) sessionStr = process.env.TELEGRAM_SESSION;
  else if (fs.existsSync(SESSION_FILE)) sessionStr = fs.readFileSync(SESSION_FILE, 'utf8').trim();

  const client = new TelegramClient(new StringSession(sessionStr), TG_API_ID, TG_API_HASH, {
    connectionRetries: 3
  });

  await client.connect();
  await client.sendCode({ apiId: TG_API_ID, apiHash: TG_API_HASH }, phone);
  pendingClient = client;
  return { ok: true };
}

async function verifyOtp(phone, code) {
  if (!pendingClient) throw new Error('Chưa gửi OTP');

  await pendingClient.start({
    phoneNumber: () => phone,
    phoneCode: () => Promise.resolve(code),
    password: () => Promise.resolve(''),
    onError: (err) => { throw err },
  });

  const session = pendingClient.session.save();
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, session);
  process.env.TELEGRAM_SESSION = session;
  console.log('[TG AUTH] Session saved!');
  pendingClient = null;
  return { ok: true, session };
}

function getSession() {
  if (process.env.TELEGRAM_SESSION) return process.env.TELEGRAM_SESSION;
  if (fs.existsSync(SESSION_FILE)) return fs.readFileSync(SESSION_FILE, 'utf8').trim();
  return null;
}

module.exports = { sendOtp, verifyOtp, getSession };

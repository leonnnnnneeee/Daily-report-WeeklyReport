const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const path = require('path');
const fs = require('fs');

const SESSION_FILE = path.join(__dirname, '../data/tg.session');

const TG_API_ID = parseInt(process.env.TELEGRAM_API_ID || '23444646');
const TG_API_HASH = process.env.TELEGRAM_API_HASH || '83816a4a3a3006b19549b2ba782acae0';

let pendingClient = null;

async function sendOtp(phone) {
  console.log('[TG AUTH] Using API_ID:', TG_API_ID);

  let sessionStr = process.env.TELEGRAM_SESSION || '';
  if (!sessionStr && fs.existsSync(SESSION_FILE)) {
    sessionStr = fs.readFileSync(SESSION_FILE, 'utf8').trim();
  }

  const client = new TelegramClient(new StringSession(sessionStr), TG_API_ID, TG_API_HASH, {
    connectionRetries: 3
  });

  await client.connect();
  await client.sendCode({ apiId: TG_API_ID, apiHash: TG_API_HASH }, phone);
  pendingClient = client;
  return { ok: true };
}

async function verifyOtp(phone, code) {
  if (!pendingClient) throw new Error('Chưa gửi OTP — thử lại từ đầu');

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
  console.log('[TG AUTH] ✅ Session saved');
  pendingClient = null;
  return { ok: true };
}

function getSession() {
  if (process.env.TELEGRAM_SESSION) return process.env.TELEGRAM_SESSION;
  if (fs.existsSync(SESSION_FILE)) return fs.readFileSync(SESSION_FILE, 'utf8').trim();
  return null;
}

module.exports = { sendOtp, verifyOtp, getSession };

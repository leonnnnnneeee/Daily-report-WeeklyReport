const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const path = require('path');
const fs = require('fs');

// Hardcode trực tiếp — không phụ thuộc env
const TG_API_ID = 23444646;
const TG_API_HASH = '83816a4a3a3006b19549b2ba782acae0';
const SESSION_FILE = path.join(__dirname, '../data/tg.session');

let pendingClient = null;

async function sendOtp(phone) {
  console.log('[TG] API_ID:', TG_API_ID, '| phone:', phone);

  // Đọc session cũ nếu có
  let sessionStr = '';
  try {
    if (process.env.TELEGRAM_SESSION) sessionStr = process.env.TELEGRAM_SESSION;
    else if (fs.existsSync(SESSION_FILE)) sessionStr = fs.readFileSync(SESSION_FILE, 'utf8').trim();
  } catch(e) {}

  const client = new TelegramClient(
    new StringSession(sessionStr),
    TG_API_ID,
    TG_API_HASH,
    { connectionRetries: 5, timeout: 30 }
  );

  await client.connect();
  console.log('[TG] Connected, sending code...');
  
  await client.sendCode(
    { apiId: TG_API_ID, apiHash: TG_API_HASH },
    phone
  );

  pendingClient = client;
  console.log('[TG] OTP sent!');
  return { ok: true };
}

async function verifyOtp(phone, code) {
  if (!pendingClient) {
    // Tạo client mới nếu pending bị mất
    let sessionStr = '';
    try {
      if (process.env.TELEGRAM_SESSION) sessionStr = process.env.TELEGRAM_SESSION;
      else if (fs.existsSync(SESSION_FILE)) sessionStr = fs.readFileSync(SESSION_FILE, 'utf8').trim();
    } catch(e) {}
    
    pendingClient = new TelegramClient(
      new StringSession(sessionStr),
      TG_API_ID,
      TG_API_HASH,
      { connectionRetries: 5 }
    );
    await pendingClient.connect();
  }

  await pendingClient.start({
    phoneNumber: () => Promise.resolve(phone),
    phoneCode: () => Promise.resolve(code),
    password: () => Promise.resolve(''),
    onError: (err) => console.error('[TG]', err),
  });

  const session = pendingClient.session.save();
  
  // Lưu session
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, session);
    process.env.TELEGRAM_SESSION = session;
  } catch(e) { console.error('[TG] Save session error:', e.message); }

  console.log('[TG] ✅ Session saved!');
  pendingClient = null;
  return { ok: true };
}

function getSession() {
  try {
    if (process.env.TELEGRAM_SESSION && process.env.TELEGRAM_SESSION.length > 10) 
      return process.env.TELEGRAM_SESSION;
    if (fs.existsSync(SESSION_FILE)) {
      const s = fs.readFileSync(SESSION_FILE, 'utf8').trim();
      if (s.length > 10) return s;
    }
  } catch(e) {}
  return null;
}

module.exports = { sendOtp, verifyOtp, getSession };

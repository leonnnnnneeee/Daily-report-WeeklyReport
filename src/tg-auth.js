const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const path = require('path');
const fs = require('fs');

const SESSION_FILE = path.join(__dirname, '../data/tg.session');

let pendingClient = null;
let pendingResolve = null;

async function sendOtp(phone) {
  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;

  // Đọc session cũ nếu có
  let sessionStr = '';
  if (process.env.TELEGRAM_SESSION) sessionStr = process.env.TELEGRAM_SESSION;
  else if (fs.existsSync(SESSION_FILE)) sessionStr = fs.readFileSync(SESSION_FILE, 'utf8').trim();

  const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, { connectionRetries: 3 });

  await client.connect();

  // Gửi OTP
  await client.sendCode({ apiId, apiHash }, phone);
  pendingClient = client;

  return { ok: true };
}

async function verifyOtp(phone, code) {
  if (!pendingClient) throw new Error('Chưa gửi OTP — gửi OTP trước');

  await pendingClient.start({
    phoneNumber: () => phone,
    phoneCode: () => Promise.resolve(code),
    password: () => Promise.resolve(''),
    onError: (err) => { throw err },
  });

  const session = pendingClient.session.save();

  // Lưu session vào file
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, session);

  // Cập nhật env runtime
  process.env.TELEGRAM_SESSION = session;

  console.log('[TG AUTH] Session saved:', session.slice(0, 30) + '...');
  pendingClient = null;

  return { ok: true, session };
}

function getSession() {
  if (process.env.TELEGRAM_SESSION) return process.env.TELEGRAM_SESSION;
  if (fs.existsSync(SESSION_FILE)) return fs.readFileSync(SESSION_FILE, 'utf8').trim();
  return null;
}

module.exports = { sendOtp, verifyOtp, getSession };

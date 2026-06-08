const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

async function main() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '36780878');
  const apiHash = process.env.TELEGRAM_API_HASH || 'a9a578157a139127c0cac768c736a301';

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.start({
    phoneNumber: () => ask('📱 Nhập số điện thoại Telegram (+84...): '),
    phoneCode:   () => ask('🔑 Nhập OTP code Telegram gửi về: '),
    password:    () => ask('🔒 Nhập 2FA password (nếu có, không có thì Enter): '),
    onError:     (err) => console.error(err),
  });

  const session = client.session.save();
  console.log('\n✅ SESSION STRING (copy toàn bộ dòng dưới):');
  console.log('─'.repeat(60));
  console.log(session);
  console.log('─'.repeat(60));
  console.log('\n👆 Paste vào Railway Variable: TELEGRAM_SESSION\n');

  await client.disconnect();
  rl.close();
}

main().catch(console.error);

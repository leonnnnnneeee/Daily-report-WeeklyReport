require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

const TG_API_ID = 23444646;
const TG_API_HASH = '83816a4a3a3006b19549b2ba782acae0';
const SB_URL = process.env.SUPABASE_URL || 'https://rgtodxxuwdusaacipokt.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndG9keHh1d2R1c2FhY2lwb2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjkxMjcsImV4cCI6MjA5NDIwNTEyN30.8zORHPswWA-0uwJfmKN9TxbTrsNdEAdk4IB8pst7GzU';
const SBH = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

const logs = [];
function log(msg) {
  const line = '[' + new Date().toLocaleTimeString('vi-VN') + '] ' + msg;
  console.log(line); logs.push(line);
  if (logs.length > 500) logs.shift();
}
log('🚀 Coincu Sales v7');

// DB helpers
async function db(method, table, data, query='') {
  try {
    const url = SB_URL + '/rest/v1/' + table + (query ? '?' + query : '');
    const r = await axios({ method, url, headers: SBH, data });
    return r.data || [];
  } catch(e) { log('DB ' + method + ' ' + table + ': ' + e.message); return []; }
}

// Session
const SESSION_FILE = path.join(__dirname, 'data/tg.session');
let pendingClient = null;
function getSession() {
  try {
    if (process.env.TELEGRAM_SESSION && process.env.TELEGRAM_SESSION.length > 10) return process.env.TELEGRAM_SESSION;
    if (fs.existsSync(SESSION_FILE)) { const s = fs.readFileSync(SESSION_FILE,'utf8').trim(); if (s.length > 10) return s; }
  } catch(e) {}
  return null;
}
function saveSession(s) {
  try { fs.mkdirSync(path.dirname(SESSION_FILE),{recursive:true}); fs.writeFileSync(SESSION_FILE,s); process.env.TELEGRAM_SESSION=s; log('✅ Session saved'); }
  catch(e) { log('Save session error: '+e.message); }
}

// ── LEADS API ──────────────────────────────────────
app.get('/api/leads', async (req, res) => res.json(await db('get','leads','','order=created_at.asc')));

app.post('/api/leads', async (req, res) => {
  const lead = {
    id: 'lead_'+Date.now(), name: req.body.name||'', website: req.body.website||'',
    sources: req.body.sources||'', telegram_username: (req.body.telegram_username||'').replace('@','').trim(),
    lark_email: req.body.lark_email||'', research: req.body.research||'',
    status: req.body.status||'new', note: req.body.note||'',
    last_contacted: new Date().toISOString().slice(0,10),
    week: Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)
  };
  const r = await db('post','leads',lead);
  if (r) { log('➕ '+lead.name); res.json({ok:true,lead}); }
  else res.json({ok:false});
});

app.patch('/api/leads/:id', async (req, res) => {
  const data = {last_contacted:new Date().toISOString().slice(0,10), updated_at:new Date().toISOString()};
  if (req.body.status) data.status=req.body.status;
  if (req.body.note!==undefined) data.note=req.body.note;
  await db('patch','leads',data,'id=eq.'+req.params.id);
  res.json({ok:true});
});

app.delete('/api/leads/:id', async (req, res) => {
  await db('delete','leads',null,'id=eq.'+req.params.id);
  res.json({ok:true});
});

app.get('/api/stats', async (req, res) => {
  const leads = await db('get','leads','','order=created_at.asc');
  const counts = {};
  leads.forEach(l => { counts[l.status]=(counts[l.status]||0)+1; });
  res.json({total:leads.length, counts});
});

// ── REPORTS API ────────────────────────────────────
app.get('/api/reports', async (req, res) => {
  const reports = await db('get','reports','','order=created_at.desc&limit=30');
  res.json(reports);
});

app.get('/api/reports/latest', async (req, res) => {
  const reports = await db('get','reports','','order=created_at.desc&limit=1');
  res.json(reports[0] || null);
});

// ── LOGS API ───────────────────────────────────────
app.get('/api/logs', (req, res) => res.json(logs));

// ── AUTH API ───────────────────────────────────────
app.post('/api/auth/send-otp', async (req, res) => {
  const {TelegramClient}=require('telegram'); const {StringSession}=require('telegram/sessions');
  log('📱 Sending OTP to '+req.body.phone);
  try {
    const client=new TelegramClient(new StringSession(''),TG_API_ID,TG_API_HASH,{connectionRetries:5});
    await client.connect();
    await client.sendCode({apiId:TG_API_ID,apiHash:TG_API_HASH},req.body.phone);
    pendingClient=client; log('✅ OTP sent!'); res.json({ok:true});
  } catch(e) { log('❌ '+e.message); res.json({ok:false,message:e.message}); }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const {TelegramClient}=require('telegram'); const {StringSession}=require('telegram/sessions');
  log('🔑 Verifying OTP...');
  try {
    let client=pendingClient||new TelegramClient(new StringSession(''),TG_API_ID,TG_API_HASH,{connectionRetries:5});
    if (!pendingClient) await client.connect();
    await client.start({
      phoneNumber:()=>Promise.resolve(req.body.phone),
      phoneCode:()=>Promise.resolve(req.body.code),
      password:()=>Promise.resolve(''),
      onError:(e)=>{throw e}
    });
    saveSession(client.session.save()); pendingClient=null; res.json({ok:true});
  } catch(e) { log('❌ '+e.message); res.json({ok:false,message:e.message}); }
});

app.get('/api/auth/status', (req, res) => res.json({connected:!!getSession()}));

// ── SCAN API ───────────────────────────────────────
app.post('/api/scan', async (req, res) => {
  log('🔍 Manual scan triggered');
  res.json({ok:true});
  runScan().catch(e=>log('❌ '+e.message));
});

async function runScan() {
  const {TelegramClient}=require('telegram'); const {StringSession}=require('telegram/sessions');
  const Anthropic=require('@anthropic-ai/sdk');
  const session=getSession();
  log('🔐 Session: '+(session?'YES ✅':'NO ❌'));
  if (!session) { log('⚠️ No session'); return; }

  let client;
  try {
    client=new TelegramClient(new StringSession(session),TG_API_ID,TG_API_HASH,{connectionRetries:3});
    await client.connect(); log('✅ Telegram connected!');
  } catch(e) { log('❌ Connect: '+e.message); return; }

  const apiKey=process.env.ANTHROPIC_API_KEY;
  const ai=apiKey?new Anthropic({apiKey}):null;
  if (!ai) { log('⚠️ No ANTHROPIC_API_KEY'); }

  log('📥 Getting all DM conversations...');
  let dialogs=[];
  try { dialogs=await client.getDialogs({limit:200}); log('📬 '+dialogs.length+' conversations'); }
  catch(e) { log('❌ getDialogs: '+e.message); await client.disconnect(); return; }

  const dmDialogs=dialogs.filter(d=>d.isUser&&!d.entity.bot);
  log('👤 DM (non-bot): '+dmDialogs.length);

  const cutoff=Date.now()/1000-72*3600;
  let newLeads=0, updatedLeads=0;
  const scanResults=[];

  for (const dialog of dmDialogs) {
    try {
      const entity=dialog.entity;
      const username=entity.username||'';
      const name=((entity.firstName||'')+' '+(entity.lastName||'')).trim()||username||String(entity.id);

      const msgs=await client.getMessages(entity,{limit:20});
      const recent=msgs.filter(m=>m.date>cutoff&&m.message).map(m=>({fromMe:m.out,text:m.message}));
      if (!recent.length) continue;

      log('  💬 '+name+' (@'+username+'): '+recent.length+' msgs');
      if (!ai) continue;

      const msgText=recent.map(m=>'['+(m.fromMe?'TÔI':name)+']: '+m.text).join('\n');
      const res=await ai.messages.create({
        model:'claude-sonnet-4-20250514', max_tokens:300,
        system:`Bạn là sales analyst Coincu.com (crypto PR & media company).
Phân tích conversation và trả về JSON:
{"is_lead":true/false,"name":"tên dự án/người","status":"interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost|new","summary":"1 câu tiếng Việt","next_action":"việc cần làm"}
is_lead=true nếu họ là dự án crypto/Web3 tiềm năng cần PR/media services.`,
        messages:[{role:'user',content:'Conversation với: '+name+' (@'+username+')\n\n'+msgText}]
      });

      const r=JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
      if (!r.is_lead) { log('  ⏩ Not a lead'); continue; }

      log('  🎯 LEAD: '+r.name+' | '+r.status+' | '+r.summary);
      scanResults.push({name:r.name, status:r.status, summary:r.summary, next_action:r.next_action});

      // Check existing
      const existing=await db('get','leads','','telegram_username=eq.'+username);
      if (existing && existing.length>0) {
        await db('patch','leads',{status:r.status,note:r.summary,last_scanned:new Date().toISOString(),last_contacted:new Date().toISOString().slice(0,10)},'id=eq.'+existing[0].id);
        log('  🔄 Updated: '+r.name); updatedLeads++;
      } else {
        await db('post','leads',{
          id:'lead_tg_'+entity.id, name:r.name||name, telegram_username:username,
          status:r.status, note:r.summary, sources:'Telegram DM Auto Scan',
          website:'', lark_email:'', research:r.summary,
          last_contacted:new Date().toISOString().slice(0,10),
          last_scanned:new Date().toISOString(),
          week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)
        });
        log('  ✅ NEW lead: '+r.name); newLeads++;
      }
      await new Promise(r=>setTimeout(r,1500));
    } catch(e) { log('  ❌ '+e.message); }
  }

  try { await client.disconnect(); } catch {}
  log('✅ Scan done! New: '+newLeads+' | Updated: '+updatedLeads);

  // Generate + save daily report
  if (ai) await generateAndSaveReport(ai, scanResults, newLeads, updatedLeads);
}

async function generateAndSaveReport(ai, scanResults, newLeads, updatedLeads) {
  const leads=await db('get','leads','','order=updated_at.desc');
  if (!leads.length) return;
  log('📋 Generating standup report...');

  const today=new Date();
  const d=today.getDate(), m=today.getMonth()+1;
  const dateStr=d+'-'+m;

  const accomplished=leads.filter(l=>l.status!=='new');
  const followUps=leads.filter(l=>l.status==='follow_up_needed'||l.status==='waiting');
  const leadsDetail=accomplished.map(l=>{
    const note={interested:'quan tâm, đang discuss',waiting:'đã phản hồi, đang đợi discuss thêm',no_budget:'quan tâm nhưng chưa có budget',follow_up_needed:'cần follow up lại',closed_won:'đã chốt deal',closed_lost:'không quan tâm'}[l.status]||l.status;
    return '- '+l.name+': '+(l.note||note);
  }).join('\n');

  const prompt='Tạo standup note cho ngày '+dateStr+' theo ĐÚNG format sau:\n\n'+
    'E gửi Standup note ngày '+dateStr+':\n'+
    '1. What did you accomplish yesterday?\n'+
    '- Reach out các leads từ Telegram:\n'+
    (leadsDetail||'- Không có hoạt động mới')+
    (newLeads>0?'\n- Tìm được '+newLeads+' leads mới từ Telegram scan':'')+
    '\n2. What are you planning to do today?\n'+
    '- Reach out các lead trong Telegram\n'+
    '- Tìm thêm lead mới từ sản phẩm\n'+
    (followUps.length>0?'- Follow up: '+followUps.map(l=>l.name).join(', ')+'\n':'')+
    '- Collect lại date email gửi email remind\n\n'+
    'Chỉ viết đúng format trên, dùng dữ liệu thực tế, tiếng Việt ngắn gọn.';

  try {
    const res=await ai.messages.create({
      model:'claude-sonnet-4-20250514', max_tokens:600,
      system:'Bạn là sales assistant Coincu.com. Tạo standup note ĐÚNG format được yêu cầu, không thêm gì khác ngoài format.',
      messages:[{role:'user',content:prompt}]
    });
    const reportContent=res.content[0].text;
    await db('post','reports',{id:'report_'+Date.now(),date:today.toISOString().slice(0,10),content:reportContent,leads_scanned:leads.length,new_leads:newLeads,updated_leads:updatedLeads});
    log('✅ Standup report saved!');
    log('📊 Preview: '+reportContent.slice(0,150));
  } catch(e) { log('❌ Report: '+e.message); }
}

// Cron 8:00 sáng
cron.schedule('0 8 * * *',()=>{ log('[CRON] 8AM scan'); runScan().catch(e=>log('❌ '+e.message)); },{timezone:'Asia/Ho_Chi_Minh'});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));

app.listen(PORT,'0.0.0.0',()=>{
  log('✅ Ready on port '+PORT);
  db('get','leads','','order=created_at.asc').then(l=>log('📋 Leads: '+l.length));
});


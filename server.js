require('dotenv').config();
const express=require('express'),path=require('path'),fs=require('fs'),cron=require('node-cron'),axios=require('axios');
const app=express(),PORT=process.env.PORT||8080;
app.use(express.json());
app.use(express.static(path.join(__dirname,'dist')));

const TG_API_ID=23444646,TG_API_HASH='83816a4a3a3006b19549b2ba782acae0';
const SB_URL=process.env.SUPABASE_URL||'https://rgtodxxuwdusaacipokt.supabase.co';
const SB_KEY=process.env.SUPABASE_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndG9keHh1d2R1c2FhY2lwb2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjkxMjcsImV4cCI6MjA5NDIwNTEyN30.8zORHPswWA-0uwJfmKN9TxbTrsNdEAdk4IB8pst7GzU';
const LARK_APP_ID=process.env.LARK_APP_ID||'cli_aaac9256ca385e17';
const LARK_APP_SECRET=process.env.LARK_APP_SECRET||'gGPfGXRBBttVVTqobADg5d85rtusdYSl';
const SBH={'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':'return=representation'};

const logs=[];
function log(msg){const l='['+new Date().toLocaleTimeString('vi-VN')+'] '+msg;console.log(l);logs.push(l);if(logs.length>500)logs.shift();}
log('🚀 Coincu Sales v10');
// Install Python deps at startup
try{
  require('child_process').execSync('pip install openpyxl --break-system-packages -q',{timeout:60000});
  log('✅ openpyxl ready');
}catch(e){log('⚠️ pip install: '+e.message);}

async function db(method,table,data,query=''){
  try{const r=await axios({method,url:SB_URL+'/rest/v1/'+table+(query?'?'+query:''),headers:SBH,data});return r.data||[];}
  catch(e){log('DB '+method+' '+table+': '+e.message);return[];}
}

// SESSION
let pendingClient=null,_session=null;
async function getSession(){
  if(_session&&_session.length>10)return _session;
  try{const r=await axios.get(SB_URL+'/rest/v1/sessions?key=eq.telegram_session',{headers:SBH});if(r.data&&r.data[0]&&r.data[0].value&&r.data[0].value.length>10){_session=r.data[0].value;log('✅ Session loaded');return _session;}}catch(e){}
  return null;
}
async function saveSession(s){
  _session=s;
  try{const h={...SBH,'Prefer':'resolution=merge-duplicates'};await axios.post(SB_URL+'/rest/v1/sessions',{key:'telegram_session',value:s,updated_at:new Date().toISOString()},{headers:h});log('✅ Session saved persistently!');}
  catch(e){log('saveSession: '+e.message);}
}

// LARK TOKEN
let _larkToken=null,_larkExpiry=0;
async function getLarkToken(){
  if(_larkToken&&Date.now()<_larkExpiry)return _larkToken;
  try{const r=await axios.post('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',{app_id:LARK_APP_ID,app_secret:LARK_APP_SECRET});
    if(r.data.code===0){_larkToken=r.data.tenant_access_token;_larkExpiry=Date.now()+(r.data.expire-60)*1000;log('✅ Lark token OK');return _larkToken;}
    log('❌ Lark auth: '+r.data.msg);}catch(e){log('❌ Lark token: '+e.message);}
  return null;
}

// ── LEADS ──────────────────────────────────────────
app.get('/api/leads',async(req,res)=>res.json(await db('get','leads','','order=created_at.asc')));
app.post('/api/leads',async(req,res)=>{
  const lead={id:'lead_'+Date.now(),name:req.body.name||'',website:req.body.website||'',sources:req.body.sources||'',
    telegram_username:(req.body.telegram_username||'').replace('@','').trim(),lark_email:req.body.lark_email||'',
    research:req.body.research||'',status:req.body.status||'new',note:req.body.note||'',
    last_contacted:new Date().toISOString().slice(0,10),week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)};
  await db('post','leads',lead);log('➕ '+lead.name);res.json({ok:true,lead});
});
app.patch('/api/leads/:id',async(req,res)=>{
  const d={last_contacted:new Date().toISOString().slice(0,10),updated_at:new Date().toISOString()};
  if(req.body.status)d.status=req.body.status;if(req.body.note!==undefined)d.note=req.body.note;
  await db('patch','leads',d,'id=eq.'+req.params.id);res.json({ok:true});
});
app.delete('/api/leads/:id',async(req,res)=>{await db('delete','leads',null,'id=eq.'+req.params.id);res.json({ok:true});});
app.get('/api/stats',async(req,res)=>{
  const leads=await db('get','leads','','order=created_at.asc');
  const counts={};leads.forEach(l=>{counts[l.status]=(counts[l.status]||0)+1;});
  res.json({total:leads.length,counts});
});

// ── REPORTS ────────────────────────────────────────
app.get('/api/reports',async(req,res)=>res.json(await db('get','reports','','order=created_at.desc&limit=30')));
app.get('/api/reports/latest',async(req,res)=>{const r=await db('get','reports','','order=created_at.desc&limit=1');res.json(r[0]||null);});
app.delete('/api/reports/:id',async(req,res)=>{await db('delete','reports',null,'id=eq.'+req.params.id);res.json({ok:true});});

// ── WEEKLY EXCEL ──────────────────────────────────────
app.get('/api/weekly-excel',async(req,res)=>{
  const{execFileSync}=require('child_process');
  const pathMod=require('path');
  const fs=require('fs');
  try{
    const leads=await db('get','leads','','order=created_at.asc');
    if(!leads.length)return res.status(400).json({error:'No leads'});
    const tmpFile=pathMod.join('/tmp','weekly_'+Date.now()+'.xlsx');
    const inputFile=pathMod.join('/tmp','leads_'+Date.now()+'.json');
    const scriptPath=pathMod.join(__dirname,'scripts/generate_excel.py');
    // Write leads to temp JSON file (safe - no shell injection)
    fs.writeFileSync(inputFile,JSON.stringify(leads));
    execFileSync('python3',[scriptPath,inputFile,tmpFile],{timeout:30000});
    if(!fs.existsSync(tmpFile))return res.status(500).json({error:'File not created'});
    const today=new Date();
    const filename='weekly-report-'+today.toISOString().slice(0,10)+'.xlsx';
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="'+filename+'"');
    res.send(fs.readFileSync(tmpFile));
    try{fs.unlinkSync(tmpFile);fs.unlinkSync(inputFile);}catch{}
    log('📊 Weekly Excel: '+leads.length+' leads');
  }catch(e){log('❌ Excel: '+e.message);res.status(500).json({error:e.message});}
});

// ── LOGS ───────────────────────────────────────────
app.get('/api/logs',(req,res)=>res.json(logs));

// ── API KEY SAVE ───────────────────────────────────
app.post('/api/settings/apikey',async(req,res)=>{
  const key=req.body.key||'';
  if(!key.startsWith('sk-'))return res.json({ok:false,message:'Invalid key'});
  const h={...SBH,'Prefer':'resolution=merge-duplicates'};
  await axios.post(SB_URL+'/rest/v1/sessions',{key:'anthropic_key',value:key,updated_at:new Date().toISOString()},{headers:h});
  log('✅ API key saved');res.json({ok:true});
});

// ── AUTH ───────────────────────────────────────────
let pendingPhoneCodeHash=null;
app.post('/api/auth/send-otp',async(req,res)=>{
  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  log('📱 Sending OTP to '+req.body.phone);
  try{
    // Disconnect old client nếu có
    if(pendingClient){try{await pendingClient.disconnect();}catch{}}
    const client=new TelegramClient(new StringSession(''),TG_API_ID,TG_API_HASH,{connectionRetries:5});
    await client.connect();
    const result=await client.sendCode({apiId:TG_API_ID,apiHash:TG_API_HASH},req.body.phone);
    pendingClient=client;
    pendingPhoneCodeHash=result.phoneCodeHash;
    log('✅ OTP sent! Hash: '+pendingPhoneCodeHash.slice(0,10)+'...');
    res.json({ok:true});
  }catch(e){log('❌ '+e.message);res.json({ok:false,message:e.message});}
});
app.post('/api/auth/verify-otp',async(req,res)=>{
  log('🔑 Verifying OTP: '+req.body.code+' | pendingClient: '+(pendingClient?'YES':'NO'));
  if(!pendingClient){
    log('❌ No pending client - need to send OTP first');
    return res.json({ok:false,message:'Hết phiên - vui lòng bấm Gửi OTP lại'});
  }
  try{
    // Dùng signIn trực tiếp thay vì start()
    const{Api}=require('telegram');
    await pendingClient.invoke(new Api.auth.SignIn({
      phoneNumber: req.body.phone,
      phoneCodeHash: pendingPhoneCodeHash,
      phoneCode: req.body.code
    }));
    await saveSession(pendingClient.session.save());
    pendingClient=null; pendingPhoneCodeHash=null;
    log('✅ Signed in successfully!');
    res.json({ok:true});
  }catch(e){
    log('❌ SignIn error: '+e.message);
    // Nếu lỗi SESSION_PASSWORD_NEEDED thì cần 2FA
    if(e.message.includes('SESSION_PASSWORD_NEEDED')){
      res.json({ok:false,message:'Account có 2FA - vui lòng tắt 2FA trong Telegram rồi thử lại'});
    } else {
      res.json({ok:false,message:e.message});
    }
  }
});
app.get('/api/auth/status',async(req,res)=>{const s=await getSession();res.json({connected:!!s});});

// ── SCAN ───────────────────────────────────────────
app.post('/api/scan',async(req,res)=>{log('🔍 Scan triggered');res.json({ok:true});runScan().catch(e=>log('❌ '+e.message));});

// Scan 1 lead ngay sau khi add
app.post('/api/scan/lead/:id',async(req,res)=>{
  log('🔍 Scanning single lead: '+req.params.id);
  res.json({ok:true});
  scanOneLead(req.params.id).catch(e=>log('❌ '+e.message));
});

async function scanOneLead(leadId){
  const leads = await db('get','leads','','id=eq.'+leadId);
  if(!leads||!leads.length){log('Lead not found: '+leadId);return;}
  const lead = leads[0];
  if(!lead.telegram_username){log('Lead has no telegram_username');return;}

  const session = await getSession();
  if(!session){log('⚠️ No session');return;}

  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  let client;
  try{
    client=new TelegramClient(new StringSession(session),TG_API_ID,TG_API_HASH,{connectionRetries:3});
    await client.connect();
    log('  🔍 Scanning @'+lead.telegram_username+'...');
    const entity=await client.getEntity(lead.telegram_username);
    const msgs=await client.getMessages(entity,{limit:50});
    const cutoff=Date.now()/1000-30*24*3600; // 30 ngày
    const recent=msgs.filter(m=>m.date>cutoff&&m.message).map(m=>({fromMe:m.out,text:m.message}));
    log('  📨 '+recent.length+' recent messages');

    if(recent.length>0){
      log('  🤖 Analyzing with Gemini...');
      const analysis = await analyzeConversation(lead.name, lead.telegram_username, recent);
      let status='new', note='';
      if(analysis){
        status=analysis.status||'new';
        note=analysis.summary||'';
        log('  🎯 '+lead.name+': '+status+' (score:'+analysis.potential_score+') | '+note.slice(0,60));
      } else {
        const allText=recent.map(m=>m.text).join(' ').toLowerCase();
        const theirMsgs=recent.filter(m=>!m.fromMe);
        const myMsgs=recent.filter(m=>m.fromMe);
        const theirLast=(theirMsgs[theirMsgs.length-1]?.text||'').slice(0,150);
        const myLast=(myMsgs[myMsgs.length-1]?.text||'').slice(0,150);
        if(/không có budget|no budget/i.test(allText)){status='no_budget';note='Chưa có budget';}
        else if(/tuần sau|getback|bận/i.test(theirLast)){status='waiting';note=theirLast;}
        else if(/quan tâm|interested|giá|báo giá/i.test(theirLast)){status='interested';note=theirLast;}
        else if(!theirLast&&myLast){status='follow_up_needed';note='Chưa reply: '+myLast;}
        else{status='waiting';note=(theirLast||myLast||'').slice(0,100);}
      }
      await db('patch','leads',{status,note,last_scanned:new Date().toISOString(),last_contacted:new Date().toISOString().slice(0,10)},'id=eq.'+leadId);
      log('  ✅ '+lead.name+': '+status+' | '+note.slice(0,50));
    } else {
      // Chưa có conversation - mark là cần reach out
      await db('patch','leads',{
        status:'follow_up_needed',
        note:'Chưa có conversation - cần nhắn tin trên Telegram trước',
        last_scanned:new Date().toISOString()
      },'id=eq.'+leadId);
      log('  📭 '+lead.name+': No conversation yet → follow_up_needed');
    }
    await client.disconnect();
  }catch(e){log('  ❌ scanOneLead: '+e.message);try{await client?.disconnect();}catch{}}
}

// ── GEMINI AI ──────────────────────────────────────
let GEMINI_KEY = process.env.GEMINI_API_KEY || '';
// Load từ Supabase nếu không có trong env
async function loadGeminiKey(){
  if(GEMINI_KEY&&GEMINI_KEY.length>10)return GEMINI_KEY;
  try{
    const r=await axios.get(SB_URL+'/rest/v1/sessions?key=eq.gemini_key',{headers:SBH});
    if(r.data&&r.data[0]&&r.data[0].value&&r.data[0].value.length>10){
      GEMINI_KEY=r.data[0].value;
      return GEMINI_KEY;
    }
  }catch(e){}
  return null;
}

async function analyzeWithGemini(prompt){
  const key = await loadGeminiKey();
  if(!key){log('⚠️ No Gemini key');return null;}
  try{
    const r = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='+key,
      {contents:[{parts:[{text:prompt}]}]},
      {headers:{'Content-Type':'application/json'}}
    );
    const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text||'';
    // Extract JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if(match) return JSON.parse(match[0]);
    return null;
  }catch(e){
    log('❌ Gemini: '+e.message);
    return null;
  }
}

async function analyzeConversation(name, username, messages){
  const msgText = messages.map(m=>"["+(m.fromMe?"TÔI":name)+"]: "+m.text).join("\n");
  const prompt = 'Bạn là sales analyst cho Coincu.com - công ty cung cấp dịch vụ crypto PR & media (CoinMarketCap, CoinGecko, Cointelegraph...).\n\n'+
    'Phân tích TOÀN BỘ hội thoại với "'+name+'" (@'+username+') gồm '+messages.length+' tin nhắn:\n\n'+
    msgText+'\n\n'+
    'Hãy phân tích kỹ và trả về JSON (chỉ JSON, không text khác):\n'+
    '{\n'+
    '  "is_potential_lead": true/false,\n'+
    '  "status": "interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost|new",\n'+
    '  "potential_score": 1-10,\n'+
    '  "note": "Ghi chú chi tiết: [tên dự án nếu biết] - [tình trạng hiện tại cụ thể] - [điểm tiềm năng và lý do]",\n'+
    '  "summary": "1 câu tóm tắt ngắn gọn bằng tiếng Việt",\n'+
    '  "next_action": "Hành động cụ thể cần làm: [gửi gì / hỏi gì / follow up khi nào]"\n'+
    '}\n\n'+
    'Hướng dẫn chấm điểm tiềm năng (1-10):\n'+
    '- 8-10: Quan tâm rõ ràng, đang hỏi giá/dịch vụ, có budget\n'+
    '- 5-7: Quan tâm nhưng còn do dự, chưa rõ budget\n'+
    '- 3-4: Chưa có budget / đang bận / hẹn sau\n'+
    '- 1-2: Không quan tâm hoặc không phải crypto project\n\n'+
    'Lưu ý: is_potential_lead=true nếu họ là project crypto/Web3 hoặc cần PR/media/marketing.\n'+
    'Phân tích DỰA TRÊN NỘI DUNG THỰC TẾ, không đoán mò.';

  return await analyzeWithGemini(prompt);
}

async function scanLarkEmails(){
  log('📧 Scanning Lark Mail...');
  const token=await getLarkToken();
  if(!token){log('❌ No Lark token');return[];}
  try{
    const userRes=await axios.get('https://open.larksuite.com/open-apis/mail/v1/user_mailboxes',{headers:{Authorization:'Bearer '+token}});
    const mailboxes=userRes.data?.data?.items||[];
    log('📧 Mailboxes: '+mailboxes.length);
    if(!mailboxes.length){log('⚠️ No mailbox');return[];}
    const mbId=mailboxes[0].mailbox_id;
    const msgsRes=await axios.get('https://open.larksuite.com/open-apis/mail/v1/user_mailboxes/'+mbId+'/mails',{headers:{Authorization:'Bearer '+token},params:{page_size:50}});
    const emails=msgsRes.data?.data?.items||[];
    const since=Date.now()-72*3600*1000;
    const results=[];
    for(const email of emails){
      if(parseInt(email.receive_time||0)*1000<since)continue;
      try{
        const d=(await axios.get('https://open.larksuite.com/open-apis/mail/v1/user_mailboxes/'+mbId+'/mails/'+email.mail_id,{headers:{Authorization:'Bearer '+token}})).data?.data;
        if(d)results.push({id:email.mail_id,subject:d.subject||'',from:d.from?.mail_address||'',fromName:d.from?.name||d.from?.mail_address||'',snippet:(d.body_plain||'').slice(0,300)});
      }catch{}
    }
    log('📧 Found '+results.length+' emails');return results;
  }catch(e){log('❌ Lark: '+e.message);return[];}
}

async function runScan(){
  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  const session=await getSession();
  log('🔐 Session: '+(session?'YES ✅':'NO ❌'));
  if(!session){log('⚠️ Authenticate first');return;}
  let newLeads=0,updatedLeads=0;

  // TG SCAN
  let client;
  try{
    client=new TelegramClient(new StringSession(session),TG_API_ID,TG_API_HASH,{connectionRetries:3});
    await client.connect();log('✅ Telegram connected!');
    const dialogs=await client.getDialogs({limit:200});
    const dms=dialogs.filter(d=>d.isUser&&!d.entity.bot);
    log('👤 DMs: '+dms.length);
    const cutoff=Date.now()/1000-30*24*3600;
    for(const dialog of dms){
      try{
        const entity=dialog.entity;
        const username=entity.username||'';
        const name=((entity.firstName||'')+' '+(entity.lastName||'')).trim()||username||String(entity.id);
        const msgs=await client.getMessages(entity,{limit:50});
        const recent=msgs.filter(m=>m.date>cutoff&&m.message).map(m=>({fromMe:m.out,text:m.message}));
        if(!recent.length)continue;
        log('  💬 '+name+' (@'+username+'): '+recent.length+' msgs');

        log('  🤖 Analyzing with Gemini AI...');
        const analysis = await analyzeConversation(name, username, recent);
        
        let status='new', note='';
        if(analysis){
          status = analysis.status || 'new';
          note = analysis.summary || '';
          log('  🎯 '+name+': '+status+' ('+analysis.potential_score+'/10) | '+note.slice(0,80));
          if(!analysis.is_potential_lead){
            log('  ⏩ Not a potential lead, skipping');
            continue;
          }
        } else {
          // Fallback rule-based nếu Gemini lỗi
          const allText=recent.map(m=>m.text).join(' ').toLowerCase();
          const theirMsgs=recent.filter(m=>!m.fromMe);
          const myMsgs=recent.filter(m=>m.fromMe);
          const theirLast=(theirMsgs[theirMsgs.length-1]?.text||'').slice(0,150);
          const myLast=(myMsgs[myMsgs.length-1]?.text||'').slice(0,150);
          if(/không có budget|no budget/i.test(allText)){status='no_budget';note='Chưa có budget';}
          else if(/tuần sau|getback|bận|busy/i.test(theirLast)){status='waiting';note=theirLast;}
          else if(/quan tâm|interested|giá|báo giá/i.test(theirLast)){status='interested';note=theirLast;}
          else if(!theirLast&&myLast){status='follow_up_needed';note='Chưa reply: '+myLast;}
          else{status='waiting';note=(theirLast||myLast||'').slice(0,100);}
          log('  📊 '+name+': '+status+' (fallback rule-based)');
        }
        const ex=await db('get','leads','','telegram_username=eq.'+username);
        if(ex&&ex.length>0){const fullNote='['+analysis.potential_score+'/10] '+note;await db('patch','leads',{status,note:fullNote,last_scanned:new Date().toISOString(),last_contacted:new Date().toISOString().slice(0,10)},'id=eq.'+ex[0].id);updatedLeads++;log('  🔄 Updated: '+name+' | '+fullNote.slice(0,60));}
        else{const fullNote='['+analysis.potential_score+'/10] '+note;await db('post','leads',{id:'lead_tg_'+entity.id,name,telegram_username:username,status,note:fullNote,sources:'Telegram DM',website:'',lark_email:'',research:'',last_contacted:new Date().toISOString().slice(0,10),last_scanned:new Date().toISOString(),week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)});newLeads++;log('  ✅ NEW: '+name+' ('+status+')');}
        await new Promise(r=>setTimeout(r,500));
      }catch(e){log('  ❌ TG: '+e.message);}
    }
    await client.disconnect();
  }catch(e){log('❌ TG scan: '+e.message);try{await client?.disconnect();}catch{}}

  // LARK EMAIL SCAN
  const emails=await scanLarkEmails();
  for(const email of emails){
    try{
      const allText=(email.subject+' '+email.snippet).toLowerCase();
      let status='new',note='';
      if(/budget|chi phí|không có|no budget/i.test(allText)){status='no_budget';note='No budget - '+email.subject;}
      else if(/interested|quan tâm|muốn|want|need|cần|báo giá|quotation|price/i.test(allText)){status='interested';note=email.subject;}
      else if(/đồng ý|agree|confirm|ok|deal|chốt/i.test(allText)){status='closed_won';note=email.subject;}
      else if(/re:|reply/i.test(email.subject)){status='waiting';note='Reply: '+email.subject;}
      else{status='new';note=email.subject;}
      log('  📧 '+email.fromName+' | '+status);
      const ex=await db('get','leads','','lark_email=eq.'+email.from);
      if(ex&&ex.length>0){await db('patch','leads',{status,note,last_scanned:new Date().toISOString(),last_contacted:new Date().toISOString().slice(0,10)},'id=eq.'+ex[0].id);updatedLeads++;log('  🔄 Email updated: '+email.fromName);}
      else{await db('post','leads',{id:'lead_email_'+Date.now(),name:email.fromName,telegram_username:'',lark_email:email.from,status,note,sources:'Lark Email',website:'',research:email.snippet.slice(0,200),last_contacted:new Date().toISOString().slice(0,10),last_scanned:new Date().toISOString(),week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)});newLeads++;log('  ✅ NEW email: '+email.fromName);}
    }catch(e){log('  ❌ Email: '+e.message);}
  }

  log('✅ Done! New: '+newLeads+' | Updated: '+updatedLeads);
  await generateReport(newLeads,updatedLeads);
}

async function generateReport(newLeads,updatedLeads){
  const leads=await db('get','leads','','order=updated_at.desc');
  if(!leads.length)return;
  const today=new Date();
  const dateStr=today.getDate()+'-'+(today.getMonth()+1);
  const sn={interested:'quan tâm, đang discuss',waiting:'đã phản hồi, đang đợi',no_budget:'chưa có budget',follow_up_needed:'cần follow up',closed_won:'đã chốt deal',closed_lost:'không quan tâm'};
  const done=leads.filter(l=>l.status!=='new');
  const fu=leads.filter(l=>l.status==='follow_up_needed'||l.status==='waiting');
  const tgLeads=done.filter(l=>l.telegram_username);
  const emailLeads=done.filter(l=>l.lark_email&&!l.telegram_username);
  const tgDetail=tgLeads.map(l=>'  - '+l.name+' (@'+l.telegram_username+'): '+(l.note||sn[l.status]||l.status)).join('\n');
  const emailDetail=emailLeads.map(l=>'  - '+l.name+' ('+l.lark_email+'): '+(l.note||sn[l.status]||l.status)).join('\n');

  const content=`E gửi Standup note ngày ${dateStr}:

1. What did you accomplish yesterday?
- Reach out qua Telegram:
${tgDetail||'  - Không có hoạt động mới'}${newLeads>0?'\n- Tìm được '+newLeads+' leads mới từ scan':''}
- Reach out qua Lark Email:
${emailDetail||'  - Không có email mới'}

2. What are you planning to do today?
- Reach out các lead trong Telegram + Email
- Tìm thêm lead mới từ sản phẩm
${fu.length>0?'- Follow up: '+fu.map(l=>l.name+(l.telegram_username?' (@'+l.telegram_username+')':'')).join(', '):''}
- Collect lại date email gửi email remind`;

  try{
    await db('post','reports',{id:'report_'+Date.now(),date:today.toISOString().slice(0,10),content,leads_scanned:leads.length,new_leads:newLeads,updated_leads:updatedLeads});
    log('✅ Report saved!');
  }catch(e){log('❌ Report: '+e.message);}
}

cron.schedule('40 9 * * *',()=>{log('[CRON] 9:40AM daily scan');runScan().catch(e=>log('❌ '+e.message));},{timezone:'Asia/Ho_Chi_Minh'});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));
app.listen(PORT,'0.0.0.0',async()=>{
  log('✅ Ready on port '+PORT);
  const l=await db('get','leads','','order=created_at.asc');log('📋 Leads: '+l.length);
  const s=await getSession();log('🔐 Session: '+(s?'LOADED ✅':'NOT SET ❌'));
});












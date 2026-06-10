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
    const cutoff=Date.now()/1000-24*3600;
    const newMsgs=msgs.filter(m=>m.date>cutoff&&m.message);
    // Phân tích TOÀN BỘ 50 tin gần nhất để hiểu context đầy đủ
    const recent=msgs.filter(m=>m.message).map(m=>({fromMe:m.out,text:m.message}));
    log("  📨 "+newMsgs.length+" tin mới / "+recent.length+" tin tổng");
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
        if(/không có budget|no budget|chưa có budget/i.test(allText)){status='no_budget';note='Chưa có budget';}
        else if(/đã chốt|deal done|confirmed|paid/i.test(allText)){status='closed_won';note='Đã chốt deal';}
        else if(/không quan tâm|not interested|no thanks/i.test(allText)){status='closed_lost';note='Không quan tâm';}
        else if(/quan tâm|interested|price|giá|báo giá|package|how much/i.test(allText)){
          status='interested';
          const m=theirMsgs.find(function(m){return /quan tâm|interested|price|giá|package/i.test(m.text);});
          note=m?m.text.slice(0,100):'Đang quan tâm dịch vụ';
        }
        else if(/tuần sau|getback|bận|busy|later|will check/i.test(allText)){status='waiting';note=theirLast.slice(0,100)||'Hẹn lại sau';}
        else if(theirMsgs.length===0){status='follow_up_needed';note='Chưa reply: '+myLast.slice(0,80);}
        else{
          status='waiting';
          var best=theirMsgs.slice().sort(function(a,b){return b.text.length-a.text.length;})[0];
          note=best?best.text.slice(0,100):theirLast.slice(0,100);
        }
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
      log('✅ Gemini key loaded: '+GEMINI_KEY.slice(0,10)+'...');
      return GEMINI_KEY;
    }
  }catch(e){}
  return null;
}

async function analyzeWithGemini(prompt){
  const key = await loadGeminiKey();
  if(!key){log('⚠️ No Gemini key');return null;}
  try{
    let r;
    if(key.startsWith('AQ.')){
      // OAuth2 Bearer token format
      r = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {contents:[{parts:[{text:prompt}]}]},
        {headers:{'Content-Type':'application/json','Authorization':'Bearer '+key}}
      );
    } else {
      // API key format (AIzaSy...)
      r = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='+key,
        {contents:[{parts:[{text:prompt}]}]},
        {headers:{'Content-Type':'application/json'}}
      );
    }
    const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text||'';
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
    const cutoff=Date.now()/1000-24*3600;
    for(const dialog of dms){
      try{
        const entity=dialog.entity;
        const username=entity.username||'';
        const name=((entity.firstName||'')+' '+(entity.lastName||'')).trim()||username||String(entity.id);
        const msgs=await client.getMessages(entity,{limit:50});
        const newMsgs=msgs.filter(m=>m.date>cutoff&&m.message);
        if(!newMsgs.length)continue;
        // Phân tích TOÀN BỘ 50 tin gần nhất
        const recent=msgs.filter(m=>m.message).map(m=>({fromMe:m.out,text:m.message}));
        log("  💬 "+name+" (@"+username+"): "+newMsgs.length+" tin mới / "+recent.length+" tin tổng");
        // Smart rule-based - không cần AI
        var allT=recent.map(function(m){return m.text;}).join(' ').toLowerCase();
        var theirM=recent.filter(function(m){return !m.fromMe;});
        var myM=recent.filter(function(m){return m.fromMe;});
        var theirL=(theirM[theirM.length-1]||{text:''}).text;
        var myL=(myM[myM.length-1]||{text:''}).text;
        var status='new', note='';

        if(/không có budget|no budget|chưa có budget|cant afford/i.test(allT)){
          status='no_budget'; note='Chưa có budget';
        } else if(/đã chốt|deal done|confirmed|paid|ok deal/i.test(allT)){
          status='closed_won'; note='Đã chốt deal';
        } else if(/không quan tâm|not interested|no thanks|no need|decline/i.test(allT)){
          status='closed_lost'; note='Không quan tâm';
        } else if(/tuần sau|tháng sau|get back|getback|bận|busy|sau nhé|will check|come back|next week/i.test(allT)){
          status='waiting';
          var wm=theirM.find(function(m){return /tuần sau|tháng sau|get back|getback|bận|busy|sau nhé|come back|next week/i.test(m.text);});
          note=wm?'hẹn lại: '+wm.text.slice(0,80):'đang đợi reply';
        } else if(/price|giá|package|how much|chi phí|báo giá|quotation|offer|rate|fee/i.test(allT)){
          status='interested';
          var pm=theirM.find(function(m){return /price|giá|package|how much|chi phí|báo giá|quotation|offer|rate|fee/i.test(m.text);});
          note=pm?'đang hỏi về giá: '+pm.text.slice(0,80):'đang quan tâm giá/dịch vụ';
        } else if(/interested|quan tâm|want to know|tell me more|sounds good|would like/i.test(allT)){
          status='interested';
          var im=theirM.find(function(m){return /interested|quan tâm|want to know|tell me more|sounds good|would like/i.test(m.text);});
          note=im?'đang quan tâm: '+im.text.slice(0,80):'đang quan tâm dịch vụ';
        } else if(theirM.length===0 && myM.length>0){
          status='follow_up_needed';
          note='chưa reply: đã gửi offer, chờ phản hồi';
        } else if(myM.length>0 && theirM.length>0){
          status='waiting';
          var mf=theirM.filter(function(m){return m.text.length>20;}).sort(function(a,b){return b.text.length-a.text.length;})[0];
          note=mf?'đang discuss: '+mf.text.slice(0,80):'đang trao đổi';
        } else {
          status='new'; note=theirL?'lead nhắn: '+theirL.slice(0,80):'tin nhắn mới';
        }
        log('  📊 '+name+': '+status+' | '+note.slice(0,70));
        const ex=await db('get','leads','','telegram_username=eq.'+username);
        if(ex&&ex.length>0){// Chỉ update status + last_scanned, KHÔNG ghi đè note do user tự viết
        const updateData = {status:status,last_scanned:new Date().toISOString(),last_contacted:new Date().toISOString().slice(0,10)};
        // Chỉ ghi note nếu lead chưa có note
        if(!ex[0].note||ex[0].note.trim()===''){
          updateData.note = note;
        }
        await db('patch','leads',updateData,'id=eq.'+ex[0].id);
        updatedLeads++;log('  🔄 '+name+': '+status+(ex[0].note?' (note giữ nguyên)':' | '+note.slice(0,50)));}
        else{// Lead mới - dùng AI summary ngắn gọn làm note ban đầu (user có thể edit sau)
        var initNote = note||'';
        await db('post','leads',{id:'lead_tg_'+entity.id,name,telegram_username:username,status,note:initNote,sources:'Telegram DM',website:'',lark_email:'',research:'',last_contacted:new Date().toISOString().slice(0,10),last_scanned:new Date().toISOString(),week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)});newLeads++;log('  ✅ NEW: '+name+' ('+status+')');}
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
  await generateReport(newLeads,updatedLeads); // Always generate report
}

async function generateReport(newLeads, updatedLeads){
  const leads = await db('get','leads','','order=updated_at.desc');
  if(!leads.length) return;
  const today = new Date();
  const d = today.getDate()+'-'+(today.getMonth()+1);
  const activeLeads = leads.filter(l=>l.note&&l.note.trim()&&l.status!=='new');
  const fu = leads.filter(l=>l.status==='follow_up_needed'||l.status==='waiting');
  const lines = activeLeads.map(l=>{
    var rawNote = l.note||''; var note = rawNote.replace(/\[.+?\/10\]\s*/g,'').replace(/\[\?\/10\]\s*/g,'').trim(); if(!note) note = rawNote.trim();
    const tg = l.telegram_username?' (@'+l.telegram_username+')':'';
    return '- '+l.name+tg+': '+note;
  });
  const fuLine = fu.length>0?'- Follow up: '+fu.map(l=>l.name).join(', '):'- Reach out các lead mới';
  const sep = '\n';
  const content = 'E gửi Standup note ngày '+d+':'+sep+
    '1. What did you accomplish yesterday?'+sep+
    (lines.length>0?lines.join(sep):'- Không có hoạt động mới')+sep+sep+
    '2. What are you planning to do today?'+sep+
    fuLine+sep+
    '- Tìm thêm lead mới từ Telegram'+sep+
    '- Collect lại date email gửi email remind';
  try{
    await db('post','reports',{id:'report_'+Date.now(),date:today.toISOString().slice(0,10),content:content,leads_scanned:leads.length,new_leads:newLeads,updated_leads:updatedLeads});
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























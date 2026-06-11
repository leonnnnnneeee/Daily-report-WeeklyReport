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
log('🚀 Coincu Sales v11 - Clean Build');

// Install openpyxl at startup
try{require('child_process').execSync('pip3 install openpyxl --break-system-packages -q 2>/dev/null||true',{timeout:30000});}catch(e){}

// ── DB ─────────────────────────────────────────────
async function db(method,table,data,query=''){
  try{const r=await axios({method,url:SB_URL+'/rest/v1/'+table+(query?'?'+query:''),headers:SBH,data});return r.data||[];}
  catch(e){log('DB '+method+' '+table+': '+e.message);return[];}
}

// ── SESSION ────────────────────────────────────────
let pendingClient=null,_session=null;
async function getSession(){
  if(_session&&_session.length>10)return _session;
  try{const r=await axios.get(SB_URL+'/rest/v1/sessions?key=eq.telegram_session',{headers:SBH});
    if(r.data&&r.data[0]&&r.data[0].value&&r.data[0].value.length>10){_session=r.data[0].value;log('✅ TG session loaded');return _session;}}catch(e){}
  return null;
}
async function saveSession(s){
  _session=s;
  try{const h={...SBH,'Prefer':'resolution=merge-duplicates'};
    await axios.post(SB_URL+'/rest/v1/sessions',{key:'telegram_session',value:s,updated_at:new Date().toISOString()},{headers:h});
    log('✅ Session saved permanently');}catch(e){log('saveSession: '+e.message);}
}

// ── OPENAI ─────────────────────────────────────────
let _aiKey='';
async function getAIKey(){
  if(_aiKey.length>10)return {key:_aiKey,type:_aiKey.startsWith('gsk_')?'groq':'openai'};
  // Groq trước (miễn phí)
  if(process.env.GROQ_API_KEY&&process.env.GROQ_API_KEY.length>10){
    _aiKey=process.env.GROQ_API_KEY;
    log('✅ Groq key from Railway env');
    return {key:_aiKey,type:'groq'};
  }
  // OpenAI fallback
  if(process.env.OPENAI_API_KEY&&process.env.OPENAI_API_KEY.length>10){
    _aiKey=process.env.OPENAI_API_KEY;
    log('✅ OpenAI key from Railway env');
    return {key:_aiKey,type:'openai'};
  }
  // Supabase fallback
  try{
    const r=await axios.get(SB_URL+'/rest/v1/sessions?key=eq.openai_key',{headers:SBH});
    if(r.data&&r.data[0]&&r.data[0].value&&r.data[0].value.length>10){
      _aiKey=r.data[0].value;
      return {key:_aiKey,type:'openai'};
    }
  }catch(e){}
  return null;
}

async function analyzeConversation(name,username,messages){
  const aiInfo=await getAIKey();
  if(!aiInfo){log('No AI key - using fallback');return null;}
  const key=aiInfo.key, aiType=aiInfo.type;
  try{
    const msgText=messages.slice(0,40).map(function(m){return '['+(m.fromMe?'LEON':name)+']: '+m.text;}).join('\n');
    const sysPrompt='Ban la sales analyst cho Leon - sales Coincu.com (crypto PR & media Vietnam).\nDoc TOAN BO conversation va phan tich theo quy trinh:\n1. Leon dang outreach du an crypto/Web3 nao?\n2. Tinh trang hien tai: da gui offer chua, lead phan hoi nhu the nao\n3. Muc do tiem nang\n\nTra ve JSON: {"is_lead":true/false,"status":"interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost|new","note":"mo ta 1 cau tieng Viet ve tinh trang thuc te, vi du: dang offer dich vu PR CMC lead quan tam hoi gia; hoac: da gui gia $500 lead dang xem xet; hoac: lead bao chua co budget Q2; hoac: da chot deal goi CoinGecko","potential":"cao|trung binh|thap"}\nChi tra ve JSON.';
    const apiUrl=aiType==='groq'?'https://api.groq.com/openai/v1/chat/completions':'https://api.openai.com/v1/chat/completions';
    const model=aiType==='groq'?'llama-3.1-70b-versatile':'gpt-4o-mini';
    log('  🤖 Using '+aiType+' ('+model+')...');
    const r=await axios.post(apiUrl,{
      model:model,max_tokens:200,
      messages:[
        {role:'system',content:sysPrompt},
        {role:'user',content:'Conversation cua Leon voi '+name+' (@'+username+'):\n\n'+msgText}
      ]
    },{headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'}});
    const text=r.data.choices[0].message.content;
    const match=text.match(/\{[\s\S]*?\}/);
    if(match){
      const result=JSON.parse(match[0]);
      log('  🤖 '+name+': '+result.status+' ['+result.potential+'] | '+result.note);
      return result;
    }
    return null;
  }catch(e){
    const em=e.response&&e.response.data&&e.response.data.error?e.response.data.error.message:e.message;
    log('OpenAI error: '+em);
    return null;
  }
}
// ── LARK ───────────────────────────────────────────
let _larkToken=null,_larkExpiry=0;
async function getLarkToken(){
  if(_larkToken&&Date.now()<_larkExpiry)return _larkToken;
  try{const r=await axios.post('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',{app_id:LARK_APP_ID,app_secret:LARK_APP_SECRET});
    if(r.data.code===0){_larkToken=r.data.tenant_access_token;_larkExpiry=Date.now()+(r.data.expire-60)*1000;return _larkToken;}}catch(e){}
  return null;
}

async function scanLarkEmails(){
  log('📧 Scanning Lark Mail...');
  const token=await getLarkToken();
  if(!token){log('❌ No Lark token');return[];}
  try{
    const userRes=await axios.get('https://open.larksuite.com/open-apis/mail/v1/user_mailboxes',{headers:{Authorization:'Bearer '+token}});
    const mailboxes=userRes.data?.data?.items||[];
    if(!mailboxes.length){log('⚠️ No mailbox');return[];}
    const mbId=mailboxes[0].mailbox_id;
    const msgsRes=await axios.get('https://open.larksuite.com/open-apis/mail/v1/user_mailboxes/'+mbId+'/mails',{headers:{Authorization:'Bearer '+token},params:{page_size:30}});
    const emails=msgsRes.data?.data?.items||[];
    const since=Date.now()-72*3600*1000;
    const results=[];
    for(const email of emails){
      if(parseInt(email.receive_time||0)*1000<since)continue;
      try{const d=(await axios.get('https://open.larksuite.com/open-apis/mail/v1/user_mailboxes/'+mbId+'/mails/'+email.mail_id,{headers:{Authorization:'Bearer '+token}})).data?.data;
        if(d)results.push({id:email.mail_id,subject:d.subject||'',from:d.from?.mail_address||'',fromName:d.from?.name||d.from?.mail_address||'',snippet:(d.body_plain||'').slice(0,200)});}catch{}
    }
    log('📧 '+results.length+' emails (72h)');return results;
  }catch(e){log('❌ Lark: '+e.message);return[];}
}

// ── LEADS API ──────────────────────────────────────
app.get('/api/leads',async(req,res)=>res.json(await db('get','leads','','order=created_at.asc')));
app.post('/api/leads',async(req,res)=>{
  const lead={id:'lead_'+Date.now(),name:req.body.name||(req.body.telegram_username||req.body.lark_email||'Unknown'),
    website:req.body.website||'',sources:req.body.sources||'',
    telegram_username:(req.body.telegram_username||'').replace('@','').trim(),
    lark_email:req.body.lark_email||'',research:req.body.research||'',
    status:req.body.status||'new',note:req.body.note||'',
    last_contacted:new Date().toISOString().slice(0,10),
    week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)};
  await db('post','leads',lead);log('➕ '+lead.name);res.json({ok:true,lead});
});
app.patch('/api/leads/:id',async(req,res)=>{
  const data={last_contacted:new Date().toISOString().slice(0,10),updated_at:new Date().toISOString()};
  if(req.body.status)data.status=req.body.status;
  if(req.body.note!==undefined)data.note=req.body.note;
  await db('patch','leads',data,'id=eq.'+req.params.id);res.json({ok:true});
});
app.delete('/api/leads/:id',async(req,res)=>{await db('delete','leads',null,'id=eq.'+req.params.id);res.json({ok:true});});
app.get('/api/stats',async(req,res)=>{
  const leads=await db('get','leads','','order=created_at.asc');
  const counts={};leads.forEach(l=>{counts[l.status]=(counts[l.status]||0)+1;});
  res.json({total:leads.length,counts});
});

// ── REPORTS API ────────────────────────────────────
app.get('/api/reports',async(req,res)=>res.json(await db('get','reports','','order=created_at.desc&limit=30')));
app.get('/api/reports/latest',async(req,res)=>{const r=await db('get','reports','','order=created_at.desc&limit=1');res.json(r[0]||null);});
app.delete('/api/reports/:id',async(req,res)=>{await db('delete','reports',null,'id=eq.'+req.params.id);res.json({ok:true});});

// ── MANUAL REPORT ─────────────────────────────────
app.post('/api/reports/generate',async(req,res)=>{
  log('📋 Manual report generation triggered');
  res.json({ok:true});
  generateReport(0,0).catch(e=>log('❌ '+e.message));
});

// ── LOGS ───────────────────────────────────────────
app.get('/api/logs',(req,res)=>res.json(logs));

// ── API KEY SAVE ───────────────────────────────────
app.post('/api/settings/apikey',async(req,res)=>{
  const key=req.body.key||'';
  const h={...SBH,'Prefer':'resolution=merge-duplicates'};
  // Detect key type
  const keyName=key.startsWith('sk-')?'openai_key':key.startsWith('AQ.')||key.startsWith('AIza')?'gemini_key':'openai_key';
  await axios.post(SB_URL+'/rest/v1/sessions',{key:keyName,value:key,updated_at:new Date().toISOString()},{headers:h});
  _openaiKey=''; // reset cache
  log('✅ API key saved as '+keyName);res.json({ok:true});
});

// ── AUTH ───────────────────────────────────────────
app.post('/api/auth/send-otp',async(req,res)=>{
  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  log('📱 Sending OTP to '+req.body.phone);
  try{
    if(pendingClient){try{await pendingClient.disconnect();}catch{}}
    const client=new TelegramClient(new StringSession(''),TG_API_ID,TG_API_HASH,{connectionRetries:5});
    await client.connect();
    const result=await client.sendCode({apiId:TG_API_ID,apiHash:TG_API_HASH},req.body.phone);
    pendingClient=client;pendingClient._phoneCodeHash=result.phoneCodeHash;
    log('✅ OTP sent!');res.json({ok:true});
  }catch(e){log('❌ '+e.message);res.json({ok:false,message:e.message});}
});

app.post('/api/auth/verify-otp',async(req,res)=>{
  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  const{Api}=require('telegram');
  log('🔑 Verifying OTP: '+req.body.code);
  if(!pendingClient){return res.json({ok:false,message:'Hết phiên - bấm Gửi OTP lại'});}
  try{
    await pendingClient.invoke(new Api.auth.SignIn({
      phoneNumber:req.body.phone,
      phoneCodeHash:pendingClient._phoneCodeHash,
      phoneCode:req.body.code
    }));
    await saveSession(pendingClient.session.save());
    pendingClient=null;
    log('✅ Authenticated!');res.json({ok:true});
  }catch(e){
    log('❌ '+e.message);
    if(e.message.includes('SESSION_PASSWORD_NEEDED')){
      res.json({ok:false,message:'Account có 2FA - vui lòng tắt trong Telegram Settings'});
    }else{
      res.json({ok:false,message:e.message});
    }
  }
});

app.get('/api/auth/status',async(req,res)=>{const s=await getSession();res.json({connected:!!s});});

// ── SCAN ONE LEAD ──────────────────────────────────
app.post('/api/scan/lead/:id',async(req,res)=>{
  res.json({ok:true});
  const leads=await db('get','leads','','id=eq.'+req.params.id);
  if(!leads||!leads.length)return;
  const lead=leads[0];
  if(!lead.telegram_username)return;
  const session=await getSession();
  if(!session)return;
  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  try{
    const client=new TelegramClient(new StringSession(session),TG_API_ID,TG_API_HASH,{connectionRetries:3});
    await client.connect();
    const entity=await client.getEntity(lead.telegram_username);
    const msgs=await client.getMessages(entity,{limit:50});
    const recent=msgs.filter(m=>m.message).map(m=>({fromMe:m.out,text:m.message}));
    if(recent.length){
      const ai=await analyzeConversation(lead.name,lead.telegram_username,recent);
      if(ai){
        await db('patch','leads',{status:ai.status,note:ai.note||'',last_scanned:new Date().toISOString(),last_contacted:new Date().toISOString().slice(0,10)},'id=eq.'+lead.id);
        log('✅ '+lead.name+': '+ai.status+' | '+ai.note);
      }
    }
    await client.disconnect();
  }catch(e){log('❌ scanOneLead: '+e.message);}
});

// ── MAIN SCAN ──────────────────────────────────────
app.post('/api/scan',async(req,res)=>{log('🔍 Manual scan');res.json({ok:true});runScan().catch(e=>log('❌ '+e.message));});

async function runScan(){
  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  const session=await getSession();
  log('🔐 Session: '+(session?'YES ✅':'NO ❌'));
  if(!session){log('⚠️ No session - authenticate first');return;}

  const aiKey=await getOpenAIKey();
  log('🤖 OpenAI key: '+(aiKey?aiKey.slice(0,15)+'... ('+aiKey.length+' chars)':'NOT SET'));

  let newLeads=0,updatedLeads=0;

  // TG SCAN
  let client;
  try{
    client=new TelegramClient(new StringSession(session),TG_API_ID,TG_API_HASH,{connectionRetries:3});
    await client.connect();log('✅ Telegram connected!');
    const dialogs=await client.getDialogs({limit:200});
    const dms=dialogs.filter(d=>d.isUser&&!d.entity.bot);
    log('👤 DM conversations: '+dms.length);

    for(const dialog of dms){
      try{
        const entity=dialog.entity;
        const username=entity.username||'';
        const name=((entity.firstName||'')+' '+(entity.lastName||'')).trim()||username||String(entity.id);
        const msgs=await client.getMessages(entity,{limit:50});
        const cutoff=Date.now()/1000-24*3600;
        // Chỉ xử lý nếu có tin nhắn mới trong 24h
        const newMsgs=msgs.filter(m=>m.date>cutoff&&m.message);
        if(!newMsgs.length)continue;
        // Nhưng đưa vào AI toàn bộ 50 tin để hiểu context
        const recent=msgs.filter(m=>m.message).map(m=>({fromMe:m.out,text:m.message}));
        log('  💬 '+name+' (@'+username+'): '+newMsgs.length+' tin mới / '+recent.length+' tổng');

        // Phân tích với OpenAI
        const ai=await analyzeConversation(name,username,recent);
        let status='new',note='';
        if(ai&&ai.status){
          status=ai.status;note=ai.note||'';
          if(!ai.is_lead){log('  ⏩ Not a lead, skip');continue;}
        }else{
          // Fallback rule-based
          const allT=recent.map(m=>m.text).join(' ').toLowerCase();
          const theirM=recent.filter(m=>!m.fromMe);
          const myM=recent.filter(m=>m.fromMe);
          if(/không có budget|no budget/i.test(allT)){status='no_budget';note='chưa có budget';}
          else if(/đã chốt|deal done|confirmed|paid/i.test(allT)){status='closed_won';note='đã chốt deal';}
          else if(/không quan tâm|not interested|no thanks/i.test(allT)){status='closed_lost';note='không quan tâm';}
          else if(/tuần sau|get back|getback|bận|busy/i.test(allT)){status='waiting';note='hẹn lại sau';}
          else if(/price|giá|package|how much|báo giá/i.test(allT)){status='interested';note='đang hỏi về giá/dịch vụ';}
          else if(theirM.length===0&&myM.length>0){status='follow_up_needed';note='chưa reply: đã gửi offer';}
          else{status='waiting';note='đang trao đổi';}
          log('  📊 '+name+': '+status+' (fallback)');
        }

        const ex=await db('get','leads','','telegram_username=eq.'+username);
        if(ex&&ex.length>0){
          const updateData={status,last_scanned:new Date().toISOString(),last_contacted:new Date().toISOString().slice(0,10)};
          if(!ex[0].note||ex[0].note.trim()==='')updateData.note=note;
          await db('patch','leads',updateData,'id=eq.'+ex[0].id);
          updatedLeads++;log('  🔄 Updated: '+name);
        }else{
          await db('post','leads',{id:'lead_tg_'+entity.id,name,telegram_username:username,
            status,note,sources:'Telegram DM',website:'',lark_email:'',research:'',
            last_contacted:new Date().toISOString().slice(0,10),
            last_scanned:new Date().toISOString(),
            week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)});
          newLeads++;log('  ✅ NEW: '+name+' ('+status+')');
        }
        await new Promise(r=>setTimeout(r,800));
      }catch(e){log('  ❌ '+e.message);}
    }
    await client.disconnect();
  }catch(e){log('❌ TG: '+e.message);try{await client?.disconnect();}catch{}}

  // LARK SCAN
  const emails=await scanLarkEmails();
  for(const email of emails){
    try{
      const ai=await analyzeConversation(email.fromName,email.from,[{fromMe:false,text:email.subject+' '+email.snippet}]);
      let status='new',note='';
      if(ai&&ai.status){status=ai.status;note=ai.note||'';}
      else{
        const t=(email.subject+' '+email.snippet).toLowerCase();
        if(/budget|không có/i.test(t)){status='no_budget';note='chưa có budget';}
        else if(/interested|quan tâm|price|giá/i.test(t)){status='interested';note='đang quan tâm';}
        else{status='new';note=email.subject;}
      }
      const ex=await db('get','leads','','lark_email=eq.'+email.from);
      if(ex&&ex.length>0){await db('patch','leads',{status,note,last_scanned:new Date().toISOString()},'id=eq.'+ex[0].id);updatedLeads++;}
      else{await db('post','leads',{id:'lead_email_'+Date.now(),name:email.fromName,telegram_username:'',lark_email:email.from,status,note,sources:'Lark Email',website:'',research:'',last_contacted:new Date().toISOString().slice(0,10),last_scanned:new Date().toISOString(),week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)});newLeads++;}
    }catch(e){log('  ❌ Email: '+e.message);}
  }

  log('✅ Scan done! New: '+newLeads+' | Updated: '+updatedLeads);
  await generateReport(newLeads,updatedLeads);
}

// ── GENERATE REPORT ────────────────────────────────
async function generateReport(newLeads,updatedLeads){
  const leads=await db('get','leads','','order=updated_at.desc');
  if(!leads.length){log('⚠️ No leads');return;}
  const today=new Date();
  const d=today.getDate()+'-'+(today.getMonth()+1);
  
  // Chỉ đưa vào report những leads có hoạt động thực sự
  // Ưu tiên: interested, follow_up_needed, no_budget, closed
  // waiting chỉ hiện nếu có note cụ thể (không phải fallback)
  const activeLeads=leads.filter(l=>{
    if(l.status==='new')return false;
    if(l.status==='interested'||l.status==='follow_up_needed'||l.status==='no_budget'||l.status==='closed_won'||l.status==='closed_lost')return true;
    if(l.status==='waiting'){
      const note=l.note||'';
      return note&&note!=='đang trao đổi'&&note!=='đang đợi phản hồi'&&note.length>5;
    }
    return false;
  });
  const fu=leads.filter(l=>l.status==='follow_up_needed');
  
  log('📋 Report: '+activeLeads.length+' leads, '+fu.length+' follow ups');

  const statusNote={interested:'đang quan tâm dịch vụ',waiting:'đang đợi phản hồi',no_budget:'chưa có budget',follow_up_needed:'cần follow up',closed_won:'đã chốt deal',closed_lost:'không quan tâm'};
  
  const lines=activeLeads.map(function(l){
    var note=(l.note||'').trim();
    if(!note)note=statusNote[l.status]||l.status;
    var tg=l.telegram_username?' (@'+l.telegram_username+')':'';
    return '- '+l.name+tg+': '+note;
  });

  const fuLine=fu.length>0?'- Follow up: '+fu.map(l=>l.name).join(', '):'- Reach out các lead mới';
  const sep='\n';
  const content='E gửi Standup note ngày '+d+':'+sep+
    '1. What did you accomplish yesterday?'+sep+
    (lines.length>0?lines.join(sep):'- Không có hoạt động mới')+sep+sep+
    '2. What are you planning to do today?'+sep+
    fuLine+sep+
    '- Tìm thêm lead mới từ Telegram'+sep+
    '- Collect lại date email gửi email remind';

  try{
    await db('post','reports',{id:'report_'+Date.now(),date:today.toISOString().slice(0,10),content,leads_scanned:leads.length,new_leads:newLeads,updated_leads:updatedLeads});
    log('✅ Report saved!');
    log(content.slice(0,200));
  }catch(e){log('❌ Report: '+e.message);}
}

// ── WEEKLY EXCEL ───────────────────────────────────
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
    fs.writeFileSync(inputFile,JSON.stringify(leads));
    execFileSync('python3',[scriptPath,inputFile,tmpFile],{timeout:30000});
    if(!fs.existsSync(tmpFile))return res.status(500).json({error:'File not created'});
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="weekly-'+today_str()+'.xlsx"');
    res.send(fs.readFileSync(tmpFile));
    try{fs.unlinkSync(tmpFile);fs.unlinkSync(inputFile);}catch{}
    log('📊 Excel exported: '+leads.length+' leads');
  }catch(e){log('❌ Excel: '+e.message);res.status(500).json({error:e.message});}
});
function today_str(){return new Date().toISOString().slice(0,10);}

// ── CRON ───────────────────────────────────────────
cron.schedule('40 9 * * *',()=>{log('[CRON] 9:40AM daily scan');runScan().catch(e=>log('❌ '+e.message));},{timezone:'Asia/Ho_Chi_Minh'});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));

app.listen(PORT,'0.0.0.0',async()=>{
  log('✅ Ready on port '+PORT);
  const l=await db('get','leads','','order=created_at.asc');log('📋 Leads: '+l.length);
  const s=await getSession();log('🔐 Session: '+(s?'LOADED ✅':'NOT SET ❌'));
  const k=await getOpenAIKey();log('🤖 OpenAI: '+(k?'READY ✅':'NOT SET ❌'));
});







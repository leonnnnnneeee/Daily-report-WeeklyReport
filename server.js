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
function log(msg){const line='['+new Date().toLocaleTimeString('vi-VN')+'] '+msg;console.log(line);logs.push(line);if(logs.length>500)logs.shift();}
log('🚀 Coincu Sales v8');

async function db(method,table,data,query=''){
  try{const r=await axios({method,url:SB_URL+'/rest/v1/'+table+(query?'?'+query:''),headers:SBH,data});return r.data||[];}
  catch(e){log('DB '+method+' '+table+': '+e.message);return[];}
}

// SESSION - Persistent Supabase (upsert)
let pendingClient=null,_session=null;
async function getSession(){
  if(_session&&_session.length>10)return _session;
  try{
    const r=await axios.get(SB_URL+'/rest/v1/sessions?key=eq.telegram_session',{headers:SBH});
    if(r.data&&r.data[0]&&r.data[0].value&&r.data[0].value.length>10){
      _session=r.data[0].value;log('✅ Session loaded ('+_session.length+' chars)');return _session;
    }
  }catch(e){log('getSession: '+e.message);}
  return null;
}
async function saveSession(s){
  _session=s;
  try{
    const h={...SBH,'Prefer':'resolution=merge-duplicates'};
    await axios.post(SB_URL+'/rest/v1/sessions',{key:'telegram_session',value:s,updated_at:new Date().toISOString()},{headers:h});
    log('✅ Session saved to Supabase ('+s.length+' chars) - persistent!');
  }catch(e){log('saveSession: '+e.message);}
}

// LARK
let _larkToken=null,_larkExpiry=0;
async function getLarkToken(){
  if(_larkToken&&Date.now()<_larkExpiry)return _larkToken;
  try{
    const r=await axios.post('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',{app_id:LARK_APP_ID,app_secret:LARK_APP_SECRET});
    if(r.data.code===0){_larkToken=r.data.tenant_access_token;_larkExpiry=Date.now()+(r.data.expire-60)*1000;log('✅ Lark token OK');return _larkToken;}
    log('❌ Lark auth: '+r.data.msg);
  }catch(e){log('❌ Lark token: '+e.message);}
  return null;
}
async function scanLarkEmails(){
  log('📧 Scanning Lark Mail...');
  const token=await getLarkToken();
  if(!token){log('❌ No Lark token');return[];}
  try{
    const r=await axios.get('https://open.larksuite.com/open-apis/mail/v1/mailboxes/me/messages',{headers:{Authorization:'Bearer '+token},params:{page_size:50}});
    const items=r.data?.data?.items||[];
    const since=Date.now()-72*3600*1000;
    const results=[];
    for(const msg of items){
      if(msg.internal_date<since)continue;
      try{
        const d=(await axios.get('https://open.larksuite.com/open-apis/mail/v1/mailboxes/me/messages/'+msg.message_id,{headers:{Authorization:'Bearer '+token}})).data?.data;
        if(d)results.push({id:msg.message_id,subject:d.subject||'',from:d.from?.mail_address||'',fromName:d.from?.name||'',snippet:(d.body_plain||'').slice(0,300)});
      }catch{}
    }
    log('📧 '+results.length+' emails in 72h');
    return results;
  }catch(e){log('❌ Lark scan: '+e.message);return[];}
}

// LEADS API
app.get('/api/leads',async(req,res)=>res.json(await db('get','leads','','order=created_at.asc')));
app.post('/api/leads',async(req,res)=>{
  const lead={id:'lead_'+Date.now(),name:req.body.name||'',website:req.body.website||'',sources:req.body.sources||'',
    telegram_username:(req.body.telegram_username||'').replace('@','').trim(),lark_email:req.body.lark_email||'',
    research:req.body.research||'',status:req.body.status||'new',note:req.body.note||'',
    last_contacted:new Date().toISOString().slice(0,10),week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)};
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

// REPORTS API
app.get('/api/reports',async(req,res)=>res.json(await db('get','reports','','order=created_at.desc&limit=30')));
app.get('/api/reports/latest',async(req,res)=>{const r=await db('get','reports','','order=created_at.desc&limit=1');res.json(r[0]||null);});

// LOGS
app.get('/api/logs',(req,res)=>res.json(logs));

// Save API key vào Supabase
app.post('/api/settings/apikey',async(req,res)=>{
  const key=req.body.key||'';
  if(!key.startsWith('sk-'))return res.json({ok:false,message:'Invalid key format'});
  const h={...SBH,'Prefer':'resolution=merge-duplicates'};
  await axios.post(SB_URL+'/rest/v1/sessions',{key:'anthropic_key',value:key,updated_at:new Date().toISOString()},{headers:h});
  log('✅ Anthropic API key saved to Supabase');
  res.json({ok:true});
});

// AUTH
app.post('/api/auth/send-otp',async(req,res)=>{
  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  log('📱 Sending OTP to '+req.body.phone);
  try{
    const client=new TelegramClient(new StringSession(''),TG_API_ID,TG_API_HASH,{connectionRetries:5});
    await client.connect();
    await client.sendCode({apiId:TG_API_ID,apiHash:TG_API_HASH},req.body.phone);
    pendingClient=client;log('✅ OTP sent!');res.json({ok:true});
  }catch(e){log('❌ OTP: '+e.message);res.json({ok:false,message:e.message});}
});
app.post('/api/auth/verify-otp',async(req,res)=>{
  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  log('🔑 Verifying OTP...');
  try{
    let client=pendingClient||new TelegramClient(new StringSession(''),TG_API_ID,TG_API_HASH,{connectionRetries:5});
    if(!pendingClient)await client.connect();
    await client.start({phoneNumber:()=>Promise.resolve(req.body.phone),phoneCode:()=>Promise.resolve(req.body.code),password:()=>Promise.resolve(''),onError:(e)=>{throw e}});
    await saveSession(client.session.save());pendingClient=null;res.json({ok:true});
  }catch(e){log('❌ Verify: '+e.message);res.json({ok:false,message:e.message});}
});
app.get('/api/auth/status',async(req,res)=>{const s=await getSession();res.json({connected:!!s});});

// SCAN
app.post('/api/scan',async(req,res)=>{log('🔍 Manual scan');res.json({ok:true});runScan().catch(e=>log('❌ '+e.message));});

// TEST - xem raw conversations (debug)
app.get('/api/debug/conversations',async(req,res)=>{
  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  const session=await getSession();
  if(!session)return res.json({error:'No session'});
  try{
    const client=new TelegramClient(new StringSession(session),TG_API_ID,TG_API_HASH,{connectionRetries:3});
    await client.connect();
    const dialogs=await client.getDialogs({limit:50});
    const dms=dialogs.filter(d=>d.isUser&&!d.entity.bot).map(d=>({
      name:((d.entity.firstName||'')+' '+(d.entity.lastName||'')).trim(),
      username:d.entity.username||'',
      lastMessage:d.message?.message?.slice(0,100)||'',
      date:d.message?.date?new Date(d.message.date*1000).toLocaleDateString('vi-VN'):''
    }));
    await client.disconnect();
    res.json({total:dms.length,conversations:dms});
  }catch(e){res.json({error:e.message});}
});

async function runScan(){
  const{TelegramClient}=require('telegram');const{StringSession}=require('telegram/sessions');
  const Anthropic=require('@anthropic-ai/sdk');
  const session=await getSession();
  log('🔐 Session: '+(session?'YES ('+session.length+' chars) ✅':'NO ❌'));
  if(!session){log('⚠️ No session — authenticate first');return;}
  let apiKey=process.env.ANTHROPIC_API_KEY;
  // Thử load từ Supabase nếu không có trong env
  if(!apiKey){
    try{const r=await axios.get(SB_URL+'/rest/v1/sessions?key=eq.anthropic_key',{headers:SBH});if(r.data&&r.data[0]&&r.data[0].value)apiKey=r.data[0].value;}catch(e){}
  }
  const ai=apiKey?new Anthropic({apiKey}):null;
  if(!ai)log('⚠️ No ANTHROPIC_API_KEY - will add leads without AI analysis');
  else log('✅ AI ready');
  let newLeads=0,updatedLeads=0;

  // TG scan
  let client;
  try{
    client=new TelegramClient(new StringSession(session),TG_API_ID,TG_API_HASH,{connectionRetries:3});
    await client.connect();log('✅ Telegram connected!');
    const dialogs=await client.getDialogs({limit:200});
    const dms=dialogs.filter(d=>d.isUser&&!d.entity.bot);
    log('👤 DMs: '+dms.length);
    const cutoff=Date.now()/1000-72*3600;
    for(const dialog of dms){
      try{
        const entity=dialog.entity;
        const username=entity.username||'';
        const name=((entity.firstName||'')+' '+(entity.lastName||'')).trim()||username||String(entity.id);
        const msgs=await client.getMessages(entity,{limit:20});
        const recent=msgs.filter(m=>m.date>cutoff&&m.message).map(m=>({fromMe:m.out,text:m.message}));
        if(!recent.length)continue;
        log('  💬 '+name+' (@'+username+'): '+recent.length+' msgs');
        // Nếu không có AI, vẫn thêm lead với status 'new'
        if(!ai){
          const ex=await db('get','leads','','telegram_username=eq.'+username);
          if(!ex||!ex.length){
            await db('post','leads',{id:'lead_tg_'+entity.id,name:name,telegram_username:username,status:'new',note:'Auto-detected from DM (no AI analysis)',sources:'Telegram DM',website:'',lark_email:'',research:'',last_contacted:new Date().toISOString().slice(0,10),last_scanned:new Date().toISOString(),week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)});
            newLeads++;log('  ➕ Added (no AI): '+name);
          }
          continue;
        }
        const msgText=recent.map(m=>'['+(m.fromMe?'TÔI':name)+']: '+m.text).join('\n');
        const res=await ai.messages.create({model:'claude-sonnet-4-20250514',max_tokens:250,
          system:'Sales analyst Coincu.com. JSON: {"is_lead":true/false,"name":"tên","status":"interested|waiting|no_budget|follow_up_needed|new","summary":"1 câu tiếng Việt"}\nis_lead=true nếu là dự án crypto/Web3 cần PR/media.',
          messages:[{role:'user',content:'Chat: '+name+' (@'+username+')\n\n'+msgText}]});
        const r=JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
        if(!r.is_lead){log('  ⏩ '+name+': not lead');continue;}
        log('  🎯 LEAD: '+r.name+' | '+r.status);
        const ex=await db('get','leads','','telegram_username=eq.'+username);
        if(ex&&ex.length>0){await db('patch','leads',{status:r.status,note:r.summary,last_scanned:new Date().toISOString(),last_contacted:new Date().toISOString().slice(0,10)},'id=eq.'+ex[0].id);updatedLeads++;}
        else{await db('post','leads',{id:'lead_tg_'+entity.id,name:r.name||name,telegram_username:username,status:r.status,note:r.summary,sources:'Telegram DM',website:'',lark_email:'',research:r.summary,last_contacted:new Date().toISOString().slice(0,10),last_scanned:new Date().toISOString(),week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)});newLeads++;log('  ✅ NEW: '+r.name);}
        await new Promise(r=>setTimeout(r,1500));
      }catch(e){log('  ❌ TG: '+e.message);}
    }
    await client.disconnect();
  }catch(e){log('❌ TG scan: '+e.message);try{await client?.disconnect();}catch{}}

  // Lark email scan
  const emails=await scanLarkEmails();
  if(emails.length>0&&ai){
    for(const email of emails){
      try{
        const res=await ai.messages.create({model:'claude-sonnet-4-20250514',max_tokens:200,
          system:'Phân tích email cho Coincu.com. JSON: {"is_lead":true/false,"name":"tên","status":"interested|waiting|no_budget|new","summary":"1 câu tiếng Việt"}',
          messages:[{role:'user',content:'From: '+email.fromName+' <'+email.from+'>\nSubject: '+email.subject+'\n\n'+email.snippet}]});
        const r=JSON.parse(res.content[0].text.replace(/```json|```/g,'').trim());
        if(!r.is_lead)continue;
        log('  📧 EMAIL LEAD: '+r.name+' | '+r.status);
        const ex=await db('get','leads','','lark_email=eq.'+email.from);
        if(ex&&ex.length>0){await db('patch','leads',{status:r.status,note:r.summary,last_scanned:new Date().toISOString()},'id=eq.'+ex[0].id);updatedLeads++;}
        else{await db('post','leads',{id:'lead_email_'+Date.now(),name:r.name||email.fromName,telegram_username:'',lark_email:email.from,status:r.status,note:r.summary,sources:'Lark Email',website:'',research:r.summary,last_contacted:new Date().toISOString().slice(0,10),last_scanned:new Date().toISOString(),week:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/604800000)});newLeads++;log('  ✅ NEW email lead: '+r.name);}
        await new Promise(r=>setTimeout(r,1000));
      }catch(e){log('  ❌ Email: '+e.message);}
    }
  }

  log('✅ Done! New: '+newLeads+' | Updated: '+updatedLeads);
  if(ai)await generateReport(ai,newLeads,updatedLeads);
}

async function generateReport(ai,newLeads,updatedLeads){
  const leads=await db('get','leads','','order=updated_at.desc');
  if(!leads.length)return;
  const today=new Date();
  const dateStr=today.getDate()+'-'+(today.getMonth()+1);
  const done=leads.filter(l=>l.status!=='new');
  const fu=leads.filter(l=>l.status==='follow_up_needed'||l.status==='waiting');
  const sn={interested:'quan tâm, đang discuss',waiting:'đã phản hồi, đang đợi',no_budget:'chưa có budget',follow_up_needed:'cần follow up',closed_won:'đã chốt deal',closed_lost:'không quan tâm'};
  const detail=done.map(l=>'- '+l.name+': '+(l.note||sn[l.status]||l.status)).join('\n');
  try{
    const res=await ai.messages.create({model:'claude-sonnet-4-20250514',max_tokens:500,
      system:'Tạo standup note đúng format, không thêm gì khác.',
      messages:[{role:'user',content:'Format:\n\nE gửi Standup note ngày '+dateStr+':\n1. What did you accomplish yesterday?\n- Reach out các leads từ Telegram + Email:\n'+(detail||'- Không có hoạt động mới')+(newLeads>0?'\n- Tìm được '+newLeads+' leads mới':'')+'\n2. What are you planning to do today?\n- Reach out các lead trong Telegram\n- Tìm thêm lead mới từ sản phẩm\n'+(fu.length>0?'- Follow up: '+fu.map(l=>l.name).join(', ')+'\n':'')+'- Collect lại date email gửi email remind\n\nViết ngắn gọn, tiếng Việt.'}]});
    const content=res.content[0].text;
    await db('post','reports',{id:'report_'+Date.now(),date:today.toISOString().slice(0,10),content,leads_scanned:leads.length,new_leads:newLeads,updated_leads:updatedLeads});
    log('✅ Report saved! '+content.slice(0,80));
  }catch(e){log('❌ Report: '+e.message);}
}

cron.schedule('0 8 * * *',()=>{log('[CRON] 8AM scan');runScan().catch(e=>log('❌ '+e.message));},{timezone:'Asia/Ho_Chi_Minh'});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));
app.listen(PORT,'0.0.0.0',async()=>{
  log('✅ Ready on port '+PORT);
  const l=await db('get','leads','','order=created_at.asc');log('📋 Leads: '+l.length);
  const s=await getSession();log('🔐 Session: '+(s?'LOADED ✅ ('+s.length+' chars)':'NOT SET ❌'));
});



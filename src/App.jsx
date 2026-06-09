import { useState, useEffect, useCallback } from 'react'
import ScanTab from './ScanTab'

const STATUS = {
  new:{label:'New',color:'#6B7280',bg:'#F3F4F6'},
  interested:{label:'Interested',color:'#059669',bg:'#D1FAE5'},
  waiting:{label:'Waiting',color:'#D97706',bg:'#FEF3C7'},
  no_budget:{label:'No Budget',color:'#DC2626',bg:'#FEE2E2'},
  follow_up_needed:{label:'Follow Up',color:'#7C3AED',bg:'#EDE9FE'},
  closed_won:{label:'Won',color:'#065F46',bg:'#A7F3D0'},
  closed_lost:{label:'Lost',color:'#991B1B',bg:'#FECACA'},
}
const B = {
  p:{background:'#111',color:'#fff',border:'none',padding:'9px 20px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'},
  s:{background:'#fff',color:'#374151',border:'1px solid #D1D5DB',padding:'8px 16px',borderRadius:8,fontSize:13,cursor:'pointer'},
  g:{background:'transparent',color:'#6B7280',border:'none',padding:'6px 14px',borderRadius:7,fontSize:13,fontWeight:500,cursor:'pointer'},
  r:{background:'#FEF2F2',color:'#DC2626',border:'1px solid #FCA5A5',padding:'5px 12px',borderRadius:6,fontSize:12,cursor:'pointer'},
}
const inp = {width:'100%',padding:'8px 12px',border:'1px solid #D1D5DB',borderRadius:8,fontSize:13,background:'#F9FAFB'}

function Badge({status}) {
  const s=STATUS[status]||STATUS.new
  return <span style={{background:s.bg,color:s.color,padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>{s.label}</span>
}
function Stat({label,value,color}) {
  return (
    <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:'18px 20px',flex:1,minWidth:100}}>
      <div style={{fontSize:12,color:'#6B7280',marginBottom:4}}>{label}</div>
      <div style={{fontSize:26,fontWeight:700,color:color||'#111'}}>{value}</div>
    </div>
  )
}

const TABS = ['Dashboard','Leads','Daily Report','Auto Scan','Add Lead']

export default function App() {
  const [tab,setTab]=useState('Dashboard')
  const [leads,setLeads]=useState([])
  const [reports,setReports]=useState([])
  const [selectedReport,setSelectedReport]=useState(null)
  const [filterStatus,setFilterStatus]=useState('all')
  const [adding,setAdding]=useState(false)
  const [copied,setCopied]=useState(false)
  const [newLead,setNewLead]=useState({name:'',website:'',sources:'',telegram_username:'',lark_email:'',research:'',note:'',status:'new'})

  const loadLeads=useCallback(async()=>{
    try{const r=await fetch('/api/leads');const d=await r.json();if(Array.isArray(d))setLeads(d)}catch{}
  },[])

  const loadReports=useCallback(async()=>{
    try{
      const r=await fetch('/api/reports');const d=await r.json();
      if(Array.isArray(d)){setReports(d);if(d.length>0)setSelectedReport(prev=>prev||d[0])}
    }catch{}
  },[])

  useEffect(()=>{loadLeads();loadReports()},[])
  useEffect(()=>{
    const t=setInterval(()=>{loadLeads();loadReports()},10000)
    return()=>clearInterval(t)
  },[])

  const counts=Object.fromEntries(Object.keys(STATUS).map(s=>[s,leads.filter(l=>l.status===s).length]))
  const filtered=filterStatus==='all'?leads:leads.filter(l=>l.status===filterStatus)
  const followUps=leads.filter(l=>l.status==='follow_up_needed'||l.status==='waiting')

  async function addLead(){
    if(!newLead.name.trim())return alert('Nhập tên dự án!')
    setAdding(true)
    const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newLead)})
    const d=await r.json()
    setNewLead({name:'',website:'',sources:'',telegram_username:'',lark_email:'',research:'',note:'',status:'new'})
    await loadLeads();setAdding(false);setTab('Leads')
    // Tự động scan lead mới nếu có telegram_username
    if(d.ok && d.lead?.id && newLead.telegram_username){
      await fetch('/api/scan/lead/'+d.lead.id, {method:'POST'})
      setTimeout(loadLeads, 5000) // reload sau 5s để thấy status mới
    }
  }

  async function deleteLead(id){
    if(!confirm('Xóa lead này?'))return
    await fetch('/api/leads/'+id,{method:'DELETE'});await loadLeads()
  }

  async function deleteReport(id){
    if(!confirm('Xóa report này?'))return
    await fetch('/api/reports/'+id,{method:'DELETE'})
    await loadReports()
    setSelectedReport(null)
  }

  async function updateStatus(id,status){
    await fetch('/api/leads/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})})
    await loadLeads()
  }

  return (
    <div style={{minHeight:'100vh',background:'#F9FAFB',fontFamily:"'DM Sans','Helvetica Neue',sans-serif"}}>
      <div style={{background:'#111',color:'#fff',padding:'0 24px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:30,height:30,background:'#fff',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>⚡</div>
          <span style={{fontWeight:700,fontSize:15}}>Coincu Sales</span>
        </div>
        <div style={{display:'flex',gap:2}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{...B.g,background:tab===t?'rgba(255,255,255,0.15)':'transparent',color:tab===t?'#fff':'#999'}}>
              {t}{t==='Daily Report'&&reports.length>0?<span style={{background:'#7C3AED',fontSize:10,padding:'1px 5px',borderRadius:99,marginLeft:4}}>{reports.length}</span>:''}
            </button>
          ))}
        </div>
        <div style={{fontSize:12,color:'#555'}}>auto-refresh 10s</div>
      </div>

      <div style={{padding:24,maxWidth:1080,margin:'0 auto'}}>

        {/* DASHBOARD */}
        {tab==='Dashboard'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:20,fontWeight:700}}>Dashboard</h2>
              <span style={{fontSize:12,color:'#9CA3AF'}}>{leads.length} leads • {reports.length} reports</span>
            </div>
            <div style={{display:'flex',gap:12,marginBottom:22,flexWrap:'wrap'}}>
              <Stat label="Total" value={leads.length}/>
              <Stat label="Interested" value={counts.interested||0} color="#059669"/>
              <Stat label="Waiting" value={counts.waiting||0} color="#D97706"/>
              <Stat label="No Budget" value={counts.no_budget||0} color="#DC2626"/>
              <Stat label="Follow Up" value={counts.follow_up_needed||0} color="#7C3AED"/>
              <Stat label="Won" value={counts.closed_won||0} color="#065F46"/>
            </div>

            {reports.length>0&&(
              <div style={{background:'#EDE9FE',border:'1px solid #C4B5FD',borderRadius:12,padding:16,marginBottom:20,cursor:'pointer'}} onClick={()=>setTab('Daily Report')}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontWeight:600,color:'#5B21B6',fontSize:14}}>📊 Latest Report — {reports[0].date}</span>
                  <span style={{fontSize:12,color:'#7C3AED'}}>{reports[0].new_leads} new • {reports[0].updated_leads} updated</span>
                </div>
                <div style={{fontSize:12,color:'#374151',whiteSpace:'pre-wrap',maxHeight:60,overflow:'hidden'}}>{reports[0].content.slice(0,200)}...</div>
                <div style={{fontSize:12,color:'#7C3AED',marginTop:6}}>Xem full →</div>
              </div>
            )}

            {followUps.length>0&&(
              <div style={{background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:12,padding:16,marginBottom:20}}>
                <div style={{fontWeight:600,color:'#92400E',marginBottom:10,fontSize:14}}>🔁 Follow up ({followUps.length})</div>
                {followUps.map(l=>(
                  <div key={l.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #FED7AA'}}>
                    <div>
                      <span style={{fontWeight:600,fontSize:13}}>{l.name}</span>
                      <span style={{color:'#6B7280',fontSize:12,marginLeft:10}}>{l.note?.slice(0,80)}</span>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <Badge status={l.status}/>
                      <span style={{fontSize:11,color:'#9CA3AF'}}>{l.telegram_username?'📱':'📧'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,overflow:'hidden'}}>
              <div style={{padding:'14px 18px',borderBottom:'1px solid #E5E7EB',fontWeight:600,fontSize:14}}>All Leads</div>
              {leads.length===0&&<div style={{padding:24,color:'#9CA3AF',textAlign:'center',fontSize:13}}>Chưa có leads — bấm Auto Scan → Scan Now</div>}
              {leads.map(l=>(
                <div key={l.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 18px',borderBottom:'1px solid #F3F4F6'}}>
                  <div style={{width:32,height:32,background:'#F3F4F6',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,flexShrink:0}}>{l.name?.[0]||'?'}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13}}>{l.name}</div>
                    <div style={{fontSize:12,color:'#6B7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.note}</div>
                  </div>
                  <span style={{fontSize:11,color:'#9CA3AF'}}>{l.telegram_username?'📱 @'+l.telegram_username:l.lark_email?'📧 '+l.lark_email:''}</span>
                  <Badge status={l.status}/>
                  <div style={{fontSize:11,color:'#9CA3AF',flexShrink:0}}>{l.last_contacted}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEADS */}
        {tab==='Leads'&&(
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <h2 style={{fontSize:20,fontWeight:700}}>Leads ({filtered.length})</h2>
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{...inp,width:'auto'}}>
                <option value="all">All Status</option>
                {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {filtered.length===0&&<div style={{padding:40,color:'#9CA3AF',textAlign:'center',background:'#fff',borderRadius:12,border:'1px solid #E5E7EB'}}>Không có leads — bấm Auto Scan → Scan Now</div>}
            {filtered.map(l=>(
              <div key={l.id} style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:'14px 18px',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                      <span style={{fontWeight:700,fontSize:14}}>{l.name}</span>
                      <Badge status={l.status}/>
                      {l.sources&&<span style={{fontSize:11,background:'#F3F4F6',padding:'2px 8px',borderRadius:4,color:'#6B7280'}}>{l.sources}</span>}
                    </div>
                    {l.research&&<div style={{fontSize:13,color:'#6B7280',marginBottom:6,lineHeight:1.5}}>{l.research}</div>}
                    {l.note&&<div style={{fontSize:12,background:'#F9FAFB',padding:'4px 10px',borderRadius:6,display:'inline-block',marginBottom:6}}>📝 {l.note}</div>}
                    <div style={{fontSize:12,color:'#9CA3AF',display:'flex',gap:12,flexWrap:'wrap'}}>
                      {l.telegram_username&&<span>📱 @{l.telegram_username}</span>}
                      {l.lark_email&&<span>📧 {l.lark_email}</span>}
                      {l.website&&<a href={l.website} target="_blank" rel="noreferrer" style={{color:'#6366F1'}}>🌐</a>}
                      <span>Last: {l.last_contacted}</span>
                    </div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
                    <select value={l.status} onChange={e=>updateStatus(l.id,e.target.value)} style={{...inp,width:130,fontSize:12,padding:'5px 8px'}}>
                      {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={()=>deleteLead(l.id)} style={B.r}>🗑 Xóa</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DAILY REPORT */}
        {tab==='Daily Report'&&(
          <div>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:6}}>Daily Reports</h2>
            <p style={{color:'#6B7280',fontSize:13,marginBottom:20}}>Tổng hợp Telegram DM + Lark Email • Tự generate sau mỗi scan • 8:00 sáng hàng ngày</p>

            {reports.length===0?(
              <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:40,textAlign:'center',color:'#9CA3AF'}}>
                Chưa có report — bấm <strong>Auto Scan → Scan Now</strong>
              </div>
            ):(
              <div style={{display:'grid',gridTemplateColumns:'240px 1fr',gap:16}}>
                {/* Report list */}
                <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,overflow:'hidden',height:'fit-content'}}>
                  <div style={{padding:'12px 16px',borderBottom:'1px solid #E5E7EB',fontWeight:600,fontSize:13}}>History ({reports.length})</div>
                  {reports.map(r=>(
                    <div key={r.id} onClick={()=>setSelectedReport(r)}
                      style={{padding:'12px 16px',borderBottom:'1px solid #F3F4F6',cursor:'pointer',background:selectedReport?.id===r.id?'#F3F4F6':'#fff'}}>
                      <div style={{fontWeight:600,fontSize:13}}>{r.date}</div>
                      <div style={{fontSize:11,color:'#6B7280',marginTop:2}}>
                        📱{r.new_leads||0} new • 🔄{r.updated_leads||0} updated
                      </div>
                    </div>
                  ))}
                </div>

                {/* Report content */}
                {selectedReport&&(
                  <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:20}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:16}}>{selectedReport.date}</div>
                        <div style={{fontSize:12,color:'#6B7280',marginTop:2}}>
                          📱 Telegram + 📧 Lark Email • {selectedReport.leads_scanned} leads scanned
                        </div>
                      </div>
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>{navigator.clipboard.writeText(selectedReport.content);setCopied(true);setTimeout(()=>setCopied(false),2000)}}
                          style={{...B.s,fontSize:12,padding:'6px 14px'}}>{copied?'✅ Copied':'📋 Copy'}</button>
                        <button onClick={()=>deleteReport(selectedReport.id)} style={B.r}>🗑 Xóa</button>
                      </div>
                    </div>
                    <div style={{background:'#F9FAFB',borderRadius:8,padding:16,fontFamily:'monospace',fontSize:13,whiteSpace:'pre-wrap',lineHeight:1.8,color:'#111',maxHeight:500,overflowY:'auto'}}>
                      {selectedReport.content}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* AUTO SCAN */}
        {tab==='Auto Scan'&&<ScanTab leads={leads}/>}

        {/* ADD LEAD */}
        {tab==='Add Lead'&&(
          <div>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:6}}>Add Lead Thủ Công</h2>
            <p style={{color:'#6B7280',fontSize:13,marginBottom:16}}>Hoặc dùng <strong>Auto Scan</strong> để tự quét từ Telegram + Email</p>
            <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:20}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                {[['website','Website'],['telegram_username','Telegram username (không có @)'],['lark_email','Lark email']].map(([k,p])=>(
                  <input key={k} placeholder={p} value={newLead[k]} onChange={e=>setNewLead({...newLead,[k]:e.target.value})} style={inp}/>
                ))}
              </div>
              <button onClick={addLead} disabled={adding} style={{...B.p,width:'100%',opacity:adding?0.6:1}}>
                {adding?'Đang thêm...':'+ Add Lead'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

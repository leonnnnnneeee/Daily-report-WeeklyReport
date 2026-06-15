import { useState, useEffect, useCallback } from 'react'
import ScanTab from './ScanTab'
import Login from './Login'

const STATUS = {
  new:{label:'New',color:'#64748b',bg:'#f1f5f9'},
  interested:{label:'Interested',color:'#059669',bg:'#dcfce7'},
  waiting:{label:'Waiting',color:'#d97706',bg:'#fef3c7'},
  no_budget:{label:'No Budget',color:'#dc2626',bg:'#fee2e2'},
  follow_up_needed:{label:'Follow Up',color:'#7c3aed',bg:'#ede9fe'},
  closed_won:{label:'Won',color:'#15803d',bg:'#bbf7d0'},
  closed_lost:{label:'Lost',color:'#b91c1c',bg:'#fecaca'},
}

const B = {
  p: { background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.2)' },
  s: { background: '#fff', color: '#1e293b', border: '1px solid #e2e8f0', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  r: { background: '#ef4444', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  g: { background: 'transparent', color: '#64748b', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' },
}

function Badge({status}) {
  const s = STATUS[status] || STATUS.new
  return <span style={{background:s.bg, color:s.color, padding:'4px 12px', borderRadius:99, fontSize:11, fontWeight:700, letterSpacing:'0.02em', textTransform:'uppercase'}}>{s.label}</span>
}

function Stat({label, value, color}) {
  return (
    <div className="stat-card" style={{ flex: 1, minWidth: 140 }}>
      <div style={{fontSize:12, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em'}}>{label}</div>
      <div style={{fontSize:28, fontWeight:800, color:color || '#1e293b'}}>{value}</div>
    </div>
  )
}

function NoteEdit({lead, onSave}){
  const [editing,setEditing]=useState(false)
  const [val,setVal]=useState(lead.note||'')
  if(!editing) return (
    <div style={{fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:8}}>
      <span onClick={()=>setEditing(true)} style={{background:'#f8fafc', padding:'8px 14px', borderRadius:10, flex:1, color:val?'#334155':'#94a3b8', border:'1px solid #f1f5f9', cursor:'pointer'}}>
        <span style={{marginRight:6}}>📝</span> {val || 'Add an internal note...'}
      </span>
    </div>
  )
  return (
    <div style={{marginBottom:10, display:'flex', gap:8}}>
      <input value={val} onChange={e=>setVal(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter'){onSave(lead.id,val);setEditing(false);}if(e.key==='Escape')setEditing(false);}}
        placeholder="Type a note and press Enter..."
        style={{fontSize:13, padding:'8px 14px', border:'1px solid #6366f1', borderRadius:10, flex:1, background:'#fff'}}
        autoFocus/>
      <button onClick={()=>{onSave(lead.id,val);setEditing(false);}} style={{...B.p, padding:'8px 16px'}}>Save</button>
      <button onClick={()=>setEditing(false)} style={B.s}>Cancel</button>
    </div>
  )
}

const TABS = ['Dashboard','Leads','Reports','Scanning','Settings']

export default function App() {
  const [token,setToken]=useState(()=>localStorage.getItem('auth_token')||'')
  const [tab,setTab]=useState('Dashboard')
  const [leads,setLeads]=useState([])
  const [reports,setReports]=useState([])
  const [selectedReport,setSelectedReport]=useState(null)
  const [filterStatus,setFilterStatus]=useState('all')
  const [adding,setAdding]=useState(false)
  const [copied,setCopied]=useState(false)
  const [selectedLeads,setSelectedLeads]=useState(new Set())
  const [bulkDeleting,setBulkDeleting]=useState(false)
  const [editingNote,setEditingNote]=useState(null)
  const [editingReport,setEditingReport]=useState(false)
  const [editReportContent,setEditReportContent]=useState('')
  const [newLead,setNewLead]=useState({name:'',website:'',sources:'',telegram_username:'',lark_email:'',research:'',note:'',status:'new'})

  const loadLeads=useCallback(async()=>{
    try{const r=await fetch('/api/leads',{headers:{'x-auth-token':token}});const d=await r.json();if(Array.isArray(d))setLeads(d)}catch{}
  },[token])

  const loadReports=useCallback(async()=>{
    try{
      const r=await fetch('/api/reports',{headers:{'x-auth-token':token}});const d=await r.json();
      if(Array.isArray(d)){setReports(d);if(d.length>0)setSelectedReport(prev=>prev||d[0])}
    }catch{}
  },[])

  useEffect(()=>{if(token){loadLeads();loadReports();}},[token, loadLeads, loadReports])
  useEffect(()=>{
    if(!token) return
    const t=setInterval(()=>{loadLeads();loadReports()},15000)
    return()=>clearInterval(t)
  },[token, loadLeads, loadReports])

  const counts=Object.fromEntries(Object.keys(STATUS).map(s=>[s,leads.filter(l=>l.status===s).length]))
  const filtered=filterStatus==='all'?leads:leads.filter(l=>l.status===filterStatus)
  const followUps=leads.filter(l=>l.status==='follow_up_needed'||l.status==='waiting')

  async function addLead(){
    if(!newLead.telegram_username.trim()&&!newLead.lark_email.trim())return alert('Enter Telegram or Email!')
    setAdding(true)
    const leadData={...newLead,name:newLead.telegram_username||newLead.lark_email||'Unknown'}
    const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json','x-auth-token':token},body:JSON.stringify(leadData)})
    const d=await r.json()
    setNewLead({name:'',website:'',sources:'',telegram_username:'',lark_email:'',research:'',note:'',status:'new'})
    await loadLeads();setAdding(false);setTab('Leads')
    if(d.ok && d.lead?.id && newLead.telegram_username){
      await fetch('/api/scan/lead/'+d.lead.id, {method:'POST'})
      setTimeout(loadLeads, 5000)
    }
  }

  async function updateStatus(id,status){
    await fetch('/api/leads/'+id,{method:'PATCH',headers:{'Content-Type':'application/json','x-auth-token':token},body:JSON.stringify({status})})
    await loadLeads()
  }

  async function deleteLead(id){
    if(!confirm('Delete this lead?'))return
    await fetch('/api/leads/'+id,{method:'DELETE',headers:{'x-auth-token':token}});await loadLeads()
  }

  if(!token) return <Login onLogin={t=>{setToken(t);localStorage.setItem('auth_token',t);}} />

  return (
    <div style={{minHeight:'100vh'}}>
      {/* Sidebar/Header Navigation */}
      <div className="glass-header" style={{color:'#fff', padding:'0 32px', height:70, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <div style={{width:36, height:36, background:'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800}}>C</div>
          <span style={{fontWeight:800, fontSize:18, letterSpacing:'-0.02em'}}>COINCU <span style={{fontWeight:400, color:'#94a3b8'}}>SALES</span></span>
        </div>
        <div style={{display:'flex', gap:4}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`tab-btn ${tab===t?'active':''}`}>
              {t}
            </button>
          ))}
        </div>
        <div style={{display:'flex', gap:16, alignItems:'center'}}>
          <div style={{width:8, height:8, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 10px #22c55e'}}></div>
          <button onClick={()=>{localStorage.removeItem('auth_token');setToken('');}} style={{background:'transparent', border:'1px solid rgba(255,255,255,0.2)', padding:'6px 14px', borderRadius:8, color:'#94a3b8', fontSize:12, cursor:'pointer'}}>Sign Out</button>
        </div>
      </div>

      <div style={{padding:'40px 32px', maxWidth:1200, margin:'0 auto'}}>

        {/* DASHBOARD */}
        {tab==='Dashboard'&&(
          <div className="fade-in">
            <header style={{marginBottom:32}}>
              <h1 style={{fontSize:32, fontWeight:800, color:'#1e293b', marginBottom:8}}>Sales Overview</h1>
              <p style={{color:'#64748b', fontSize:15}}>Track your leads performance and latest updates across all channels.</p>
            </header>

            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:20, marginBottom:40}}>
              <Stat label="Total Leads" value={leads.length}/>
              <Stat label="Interested" value={counts.interested||0} color="#059669"/>
              <Stat label="Waiting" value={counts.waiting||0} color="#d97706"/>
              <Stat label="Follow Up" value={counts.follow_up_needed||0} color="#7c3aed"/>
              <Stat label="Won" value={counts.closed_won||0} color="#15803d"/>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:32}}>
              <section className="card" style={{padding:0, overflow:'hidden'}}>
                <div style={{padding:'20px 24px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <h3 style={{fontSize:16, fontWeight:700}}>Recent Activity</h3>
                  <button onClick={()=>setTab('Leads')} style={{fontSize:13, color:'#6366f1', fontWeight:600, background:'none', border:'none', cursor:'pointer'}}>View all</button>
                </div>
                <div style={{padding:'8px 0'}}>
                  {leads.slice(0, 6).map(l=>(
                    <div key={l.id} style={{display:'flex', alignItems:'center', gap:16, padding:'14px 24px', borderBottom:'1px solid #f8fafc'}}>
                      <div style={{width:40, height:40, background:'#f1f5f9', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#64748b', fontSize:14}}>{l.name?.[0]||'?'}</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700, fontSize:14, color:'#1e293b'}}>{l.name}</div>
                        <div style={{fontSize:12, color:'#64748b', marginTop:2}}>Last contact: {l.last_contacted}</div>
                      </div>
                      <Badge status={l.status}/>
                    </div>
                  ))}
                </div>
              </section>

              <aside style={{display:'flex', flexDirection:'column', gap:24}}>
                {reports.length > 0 && (
                  <div className="card" style={{padding:24, background:'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color:'#fff', border:'none'}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:16}}>
                      <span style={{fontSize:12, fontWeight:700, color:'#6366f1', textTransform:'uppercase', letterSpacing:'0.05em'}}>Latest Analysis</span>
                      <span style={{fontSize:12, color:'#94a3b8'}}>{reports[0].date}</span>
                    </div>
                    <h4 style={{fontSize:18, fontWeight:700, marginBottom:12}}>Daily Intelligence Report</h4>
                    <p style={{fontSize:14, color:'#94a3b8', lineHeight:1.6, marginBottom:20, opacity:0.8}}>{reports[0].content.slice(0, 150)}...</p>
                    <button onClick={()=>setTab('Reports')} style={{width:'100%', padding:'12px', background:'rgba(255,255,255,0.1)', border:'none', borderRadius:10, color:'#fff', fontWeight:600, cursor:'pointer'}}>Read Full Report</button>
                  </div>
                )}
                
                <div className="card" style={{padding:24}}>
                  <h3 style={{fontSize:16, fontWeight:700, marginBottom:16}}>Quick Actions</h3>
                  <div style={{display:'grid', gap:12}}>
                    <button onClick={()=>setTab('Scanning')} style={{...B.s, textAlign:'left', padding:'14px'}}>⚡ Start New Scan</button>
                    <button onClick={async()=>{await fetch('/api/reports/generate',{method:'POST'}); loadReports();}} style={{...B.s, textAlign:'left', padding:'14px'}}>📊 Force Generate Report</button>
                    <button onClick={async()=>{
                      const r=await fetch('/api/weekly-excel');
                      const blob=await r.blob();
                      const url=URL.createObjectURL(blob);
                      const a=document.createElement('a'); a.href=url; a.download='weekly.xlsx'; a.click();
                    }} style={{...B.s, textAlign:'left', padding:'14px'}}>📥 Download Weekly Excel</button>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}

        {/* LEADS LIST */}
        {tab==='Leads'&&(
          <div className="fade-in">
            <header style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:32}}>
              <div>
                <h1 style={{fontSize:32, fontWeight:800, color:'#1e293b', marginBottom:8}}>Leads Management</h1>
                <p style={{color:'#64748b', fontSize:15}}>Review and organize your potential leads and their current status.</p>
              </div>
              <div style={{display:'flex', gap:12}}>
                <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{width:180, fontWeight:500}}>
                  <option value="all">Filter by Status</option>
                  {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
                <button onClick={()=>setTab('Settings')} style={B.p}>+ New Lead</button>
              </div>
            </header>

            <div style={{display:'grid', gap:16}}>
              {filtered.map(l=>(
                <div key={l.id} className="card" style={{padding:24}}>
                  <div style={{display:'flex', alignItems:'flex-start', gap:20}}>
                    <div style={{width:50, height:50, background:'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800, color:'#475569'}}>{l.name?.[0]}</div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:8}}>
                        <h3 style={{fontSize:18, fontWeight:800, color:'#1e293b'}}>{l.name}</h3>
                        <Badge status={l.status}/>
                        {l.sources && <span style={{fontSize:11, color:'#64748b', fontWeight:600, padding:'2px 8px', background:'#f1f5f9', borderRadius:6}}>{l.sources}</span>}
                      </div>
                      <p style={{fontSize:14, color:'#475569', marginBottom:16, lineHeight:1.6}}>{l.research}</p>
                      
                      <NoteEdit lead={l} onSave={async(id,note)=>{
                        await fetch('/api/leads/'+id,{method:'PATCH',headers:{'Content-Type':'application/json','x-auth-token':token},body:JSON.stringify({note})});
                        loadLeads();
                      }}/>

                      <div style={{display:'flex', gap:24, alignItems:'center', marginTop:16, borderTop:'1px solid #f1f5f9', paddingTop:16}}>
                        <div style={{display:'flex', gap:8, alignItems:'center', fontSize:13, color:'#64748b'}}>
                          <span style={{opacity:0.6}}>📱</span> @{l.telegram_username || 'N/A'}
                        </div>
                        {l.website && (
                          <a href={l.website} target="_blank" rel="noreferrer" style={{fontSize:13, color:'#6366f1', fontWeight:600, display:'flex', gap:4, alignItems:'center'}}>
                            <span>🌐</span> Visit Website
                          </a>
                        )}
                        <div style={{fontSize:12, color:'#94a3b8', marginLeft:'auto'}}>Update: {l.last_contacted}</div>
                      </div>
                    </div>
                    <div style={{display:'flex', flexDirection:'column', gap:8}}>
                      <select value={l.status} onChange={e=>updateStatus(l.id, e.target.value)} style={{fontSize:12, padding:'6px 12px', width:140}}>
                        {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <button onClick={()=>deleteLead(l.id)} style={{...B.s, color:'#ef4444', borderColor:'#fee2e2', background:'#fef2f2', fontSize:12, padding:'6px 12px'}}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REPORTS */}
        {tab==='Reports'&&(
          <div className="fade-in">
             <header style={{marginBottom:32}}>
              <h1 style={{fontSize:32, fontWeight:800, color:'#1e293b', marginBottom:8}}>Intelligence Reports</h1>
              <p style={{color:'#64748b', fontSize:15}}>Browse daily automated summaries of your sales activity and outreach.</p>
            </header>

            <div style={{display:'grid', gridTemplateColumns:'300px 1fr', gap:32, alignItems:'start'}}>
              <div className="card" style={{padding:0, overflow:'hidden'}}>
                <div style={{padding:'16px 20px', background:'#f8fafc', borderBottom:'1px solid #f1f5f9', fontWeight:700, fontSize:14}}>History</div>
                {reports.map(r=>(
                  <div key={r.id} onClick={()=>setSelectedReport(r)} style={{padding:'16px 20px', borderBottom:'1px solid #f8fafc', cursor:'pointer', background:selectedReport?.id===r.id?'#f1f5f9':'#fff'}}>
                    <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>{r.date}</div>
                    <div style={{fontSize:11, color:'#64748b', fontWeight:600}}>
                      {r.new_leads} NEW • {r.updated_leads} UPDATED
                    </div>
                  </div>
                ))}
              </div>

              {selectedReport && (
                <div className="card" style={{padding:40}}>
                   <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:32}}>
                      <div>
                        <h2 style={{fontSize:24, fontWeight:800, color:'#1e293b'}}>{selectedReport.date}</h2>
                        <div style={{fontSize:13, color:'#64748b', marginTop:4, fontWeight:600}}>AUTOMATED SALES ANALYSIS</div>
                      </div>
                      <div style={{display:'flex', gap:10}}>
                        <button onClick={()=>{navigator.clipboard.writeText(selectedReport.content); setCopied(true); setTimeout(()=>setCopied(false),2000)}} style={B.s}>
                          {copied ? 'Copied ✓' : 'Copy Text'}
                        </button>
                        <button onClick={async()=>{if(confirm('Delete this report?')){await fetch('/api/reports/'+selectedReport.id,{method:'DELETE',headers:{'x-auth-token':token}}); loadReports(); setSelectedReport(null);}}} style={{...B.s, color:'#ef4444'}}>Delete</button>
                      </div>
                   </div>
                   <div style={{background:'#f8fafc', padding:'32px', borderRadius:20, fontFamily:'"Fira Code", monospace', fontSize:14, lineHeight:1.8, color:'#334155', border:'1px solid #f1f5f9', whiteSpace:'pre-wrap'}}>
                      {selectedReport.content}
                   </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCANNING / SETTINGS */}
        {tab==='Scanning' && <ScanTab leads={leads} token={token}/>}
        
        {tab==='Settings' && (
           <div className="fade-in" style={{maxWidth:600, margin:'0 auto'}}>
             <header style={{marginBottom:32, textAlign:'center'}}>
               <h1 style={{fontSize:32, fontWeight:800, color:'#1e293b', marginBottom:8}}>Configuration</h1>
               <p style={{color:'#64748b', fontSize:15}}>Manage your connection settings and lead intake.</p>
             </header>

             <div className="card" style={{padding:32}}>
                <h3 style={{fontSize:18, fontWeight:700, marginBottom:20}}>Add New Lead</h3>
                <div style={{display:'grid', gap:16, marginBottom:24}}>
                   <div>
                     <label style={{fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8, display:'block'}}>TELEGRAM USERNAME</label>
                     <input placeholder="username (without @)" value={newLead.telegram_username} onChange={e=>setNewLead({...newLead, telegram_username: e.target.value.replace('@','')})}/>
                   </div>
                   <div>
                     <label style={{fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8, display:'block'}}>WEBSITE</label>
                     <input placeholder="https://..." value={newLead.website} onChange={e=>setNewLead({...newLead, website: e.target.value})}/>
                   </div>
                   <div>
                     <label style={{fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8, display:'block'}}>SOURCES</label>
                     <input placeholder="e.g. TG Group, Event, Referral" value={newLead.sources} onChange={e=>setNewLead({...newLead, sources: e.target.value})}/>
                   </div>
                </div>
                <button onClick={addLead} disabled={adding} style={{...B.p, width:'100%', padding:16, fontSize:15}}>
                  {adding ? 'Analyzing Lead...' : 'Initialize & Scan Lead'}
                </button>
             </div>
           </div>
        )}

      </div>

      <style>{`
        .fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

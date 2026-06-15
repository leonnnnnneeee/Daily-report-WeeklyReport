import { useState, useEffect, useCallback } from 'react'
import ScanTab from './ScanTab'
import Login from './Login'
import MessagesTab from './MessagesTab'

const STATUS = {
  new:{label:'New',color:'#94a3b8',bg:'rgba(148, 163, 184, 0.1)'},
  interested:{label:'Interested',color:'#10b981',bg:'rgba(16, 185, 129, 0.1)'},
  waiting:{label:'Waiting',color:'#f59e0b',bg:'rgba(245, 158, 11, 0.1)'},
  no_budget:{label:'No Budget',color:'#ef4444',bg:'rgba(239, 68, 68, 0.1)'},
  follow_up_needed:{label:'Follow Up',color:'#8b5cf6',bg:'rgba(139, 92, 246, 0.1)'},
  closed_won:{label:'Won',color:'#10b981',bg:'rgba(16, 185, 129, 0.2)'},
  closed_lost:{label:'Lost',color:'#ef4444',bg:'rgba(239, 68, 68, 0.2)'},
}

function Badge({status}) {
  const s = STATUS[status] || STATUS.new
  return <span className="badge-pill" style={{background:s.bg, color:s.color}}>{s.label}</span>
}

function StatCard({label, value, color}) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{color: color || '#fff'}}>{value}</div>
    </div>
  )
}

function NoteEdit({lead, onSave}){
  const [editing,setEditing]=useState(false)
  const [val,setVal]=useState(lead.note||'')
  if(!editing) return (
    <div style={{fontSize:13, color:'#94a3b8', cursor:'pointer'}} onClick={()=>setEditing(true)}>
      <span style={{marginRight:8}}>📝</span> {val || 'Add a note...'}
    </div>
  )
  return (
    <div style={{display:'flex', gap:8, width:'100%'}}>
      <input value={val} onChange={e=>setVal(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter'){onSave(lead.id,val);setEditing(false);}if(e.key==='Escape')setEditing(false);}}
        style={{flex:1, fontSize:13}} autoFocus/>
      <button onClick={()=>{onSave(lead.id,val);setEditing(false);}} className="btn-primary" style={{padding:'4px 12px', fontSize:12}}>Save</button>
    </div>
  )
}

const TABS = [
  { id: 'Dashboard', icon: '📊' },
  { id: 'Leads', icon: '👥' },
  { id: 'Reports', icon: '📝' },
  { id: 'Weekly', icon: '📅' },
  { id: 'Scanning', icon: '⚡' },
  { id: 'Settings', icon: '⚙️' }
]

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

  useEffect(()=>{if(token){loadLeads();loadReports();}}, [token, loadLeads, loadReports])
  useEffect(()=>{
    if(!token) return
    const t=setInterval(()=>{loadLeads();loadReports()},20000)
    return()=>clearInterval(t)
  }, [token, loadLeads, loadReports])

  const counts=Object.fromEntries(Object.keys(STATUS).map(s=>[s,leads.filter(l=>l.status===s).length]))
  const filtered=filterStatus==='all'?leads:leads.filter(l=>l.status===filterStatus)

  async function updateStatus(id,status){
    await fetch('/api/leads/'+id,{method:'PATCH',headers:{'Content-Type':'application/json','x-auth-token':token},body:JSON.stringify({status})})
    loadLeads()
  }

  async function saveLeadNote(id,note){
    await fetch('/api/leads/'+id,{method:'PATCH',headers:{'Content-Type':'application/json','x-auth-token':token},body:JSON.stringify({note})})
    setEditingNote(null)
    loadLeads()
  }

  async function saveReport(id,content){
    await fetch('/api/reports/'+id,{method:'PATCH',headers:{'Content-Type':'application/json','x-auth-token':token},body:JSON.stringify({content})})
    setEditingReport(false)
    loadReports()
  }

  async function deleteReport(id){
    if(!confirm('Delete this report?'))return
    await fetch('/api/reports/'+id,{method:'DELETE',headers:{'x-auth-token':token}})
    await loadReports(); setSelectedReport(null)
  }

  async function deleteLead(id){
    if(!confirm('Delete this lead?'))return
    await fetch('/api/leads/'+id,{method:'DELETE',headers:{'x-auth-token':token}});await loadLeads()
  }

  function toggleLead(id){
    setSelectedLeads(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})
  }

  function toggleAllLeads(ls){
    if(selectedLeads.size===ls.length) setSelectedLeads(new Set())
    else setSelectedLeads(new Set(ls.map(l=>l.id)))
  }

  async function bulkDeleteLeads(){
    if(!selectedLeads.size)return
    if(!confirm('Delete '+selectedLeads.size+' leads?'))return
    setBulkDeleting(true)
    await Promise.all([...selectedLeads].map(id=>fetch('/api/leads/'+id,{method:'DELETE',headers:{'x-auth-token':token}})))
    setSelectedLeads(new Set())
    await loadLeads(); setBulkDeleting(false)
  }

  if(!token) return <Login onLogin={t=>{setToken(t);localStorage.setItem('auth_token',t);}} />

  return (
    <div id="root">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon" style={{ overflow: 'hidden' }}>
            <img src="https://pbs.twimg.com/profile_images/1902957820418592768/xnPqDY4i_400x400.jpg" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{fontWeight:800, fontSize:18, letterSpacing:'-0.02em'}}>COINCU</span>
        </div>
        
        <nav style={{flex:1}}>
          {TABS.map(t => (
            <div key={t.id} onClick={()=>setTab(t.id)} className={`nav-item ${tab===t.id?'active':''}`}>
              <span style={{fontSize:18}}>{t.icon}</span>
              <span>{t.id}</span>
            </div>
          ))}
        </nav>

        <div style={{padding:'20px 24px', borderTop:'1px solid var(--border)'}}>
           <div className="nav-item" onClick={()=>{localStorage.removeItem('auth_token'); setToken('');}} style={{padding:'12px 0'}}>
             <span>🚪</span> <span>Sign Out</span>
           </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="header-top">
          <h1 style={{fontSize:24, fontWeight:800}}>{tab}</h1>
          <div className="user-profile">
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:13, fontWeight:700}}>Leon</div>
              <div style={{fontSize:11, color:'var(--text-secondary)'}}>Sales Manager</div>
            </div>
            <div className="avatar">👤</div>
          </div>
        </header>

        {/* DASHBOARD */}
        {tab==='Dashboard' && (
          <div className="fade-in">
            <div className="grid-stats">
              <StatCard label="Total Leads" value={leads.length}/>
              <StatCard label="Interested" value={counts.interested||0} color="var(--success)"/>
              <StatCard label="Waiting" value={counts.waiting||0} color="#f59e0b"/>
              <StatCard label="Follow Up" value={counts.follow_up_needed||0} color="var(--accent)"/>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:32}}>
              <section className="section-card">
                <div className="section-header">
                  <h3 style={{fontSize:16, fontWeight:700}}>Recent Activity</h3>
                  <button onClick={()=>setTab('Leads')} style={{color:'var(--accent)', background:'none', border:'none', fontSize:13, fontWeight:600, cursor:'pointer'}}>View all</button>
                </div>
                {leads.slice(0, 8).map(l => (
                  <div key={l.id} className="data-row">
                    <div style={{width:36, height:36, background:'#27272a', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, marginRight:16}}>{l.name?.[0]}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14, fontWeight:700}}>{l.name}</div>
                      <div style={{fontSize:12, color:'var(--text-secondary)', marginTop:2}}>{l.last_contacted}</div>
                    </div>
                    <Badge status={l.status}/>
                  </div>
                ))}
              </section>

              <aside style={{display:'flex', flexDirection:'column', gap:24}}>
                {reports.length > 0 && (
                  <div className="section-card" style={{padding:24, background:'linear-gradient(135deg, #1e1e20 0%, #111112 100%)'}}>
                    <div style={{color:'var(--accent)', fontSize:12, fontWeight:800, marginBottom:8, textTransform:'uppercase'}}>Latest Intelligence</div>
                    <h4 style={{fontSize:18, fontWeight:800, marginBottom:12}}>{reports[0].date}</h4>
                    <p style={{fontSize:13, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:20}}>{reports[0].content.slice(0, 160)}...</p>
                    <button onClick={()=>setTab('Reports')} className="btn-primary" style={{width:'100%'}}>Open Report</button>
                  </div>
                )}
                
                <div className="section-card" style={{padding:24}}>
                  <h3 style={{fontSize:16, fontWeight:700, marginBottom:16}}>Quick Actions</h3>
                  <div style={{display:'grid', gap:10}}>
                    <button onClick={()=>setTab('Scanning')} className="btn-primary" style={{background:'rgba(255,255,255,0.05)', color:'#fff', textAlign:'left'}}>⚡ New Telegram Scan</button>
                    <button onClick={async()=>{await fetch('/api/reports/generate',{method:'POST'}); loadReports();}} className="btn-primary" style={{background:'rgba(255,255,255,0.05)', color:'#fff', textAlign:'left'}}>📊 Manual Report Gen</button>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}

        {/* LEADS */}
        {tab==='Leads' && (
          <div className="fade-in">
             <div style={{display:'flex', gap:12, marginBottom:32}}>
                <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{width:200}}>
                  <option value="all">All Status</option>
                  {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
                <button onClick={()=>setTab('Settings')} className="btn-primary">+ Add New Lead</button>
             </div>

             <div className="section-card">
                {filtered.map(l => (
                  <div key={l.id} className="data-row" style={{padding:'20px 24px'}}>
                    <div style={{width:44, height:44, background:'#27272a', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, marginRight:20}}>{l.name?.[0]}</div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:4}}>
                        <h3 style={{fontSize:16, fontWeight:800}}>{l.name}</h3>
                        <Badge status={l.status}/>
                        {l.sources && <span style={{fontSize:11, color:'var(--text-secondary)'}}>via {l.sources}</span>}
                      </div>
                      <div style={{fontSize:13, color:'var(--text-secondary)', marginBottom:12}}>{l.research}</div>
                      <NoteEdit lead={l} onSave={async(id,note)=>saveLeadNote(id,note)}/>
                    </div>
                    <div style={{display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end'}}>
                      <select value={l.status} onChange={e=>updateStatus(l.id, e.target.value)} style={{fontSize:12, padding:'6px 10px'}}>
                        {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <div style={{display:'flex', gap:10, alignItems:'center'}}>
                        <div style={{fontSize:11, color:'var(--text-secondary)'}}>@{l.telegram_username || 'n/a'}</div>
                        <button onClick={()=>deleteLead(l.id)} style={{background:'none', border:'none', cursor:'pointer', color:'rgba(239, 68, 68, 0.5)', fontSize:14}}>🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {/* REPORTS */}
        {tab==='Reports' && (
          <div className="fade-in" style={{display:'grid', gridTemplateColumns:'300px 1fr', gap:32}}>
            <div className="section-card" style={{height:'fit-content'}}>
              <div className="section-header"><h3 style={{fontSize:14, fontWeight:700}}>History</h3></div>
              {reports.map(r => (
                <div key={r.id} onClick={()=>{setSelectedReport(r); setEditingReport(false)}} 
                  style={{padding:'16px 20px', borderBottom:'1px solid var(--border)', cursor:'pointer', background:selectedReport?.id===r.id?'rgba(139, 92, 246, 0.1)':'transparent'}}>
                  <div style={{fontWeight:700, fontSize:14}}>{r.date}</div>
                  <div style={{fontSize:11, color:'var(--text-secondary)', marginTop:4}}>{r.new_leads} NEW • {r.updated_leads} UPDATED</div>
                </div>
              ))}
            </div>

            {selectedReport && (
              <div className="section-card" style={{padding:40}}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:32}}>
                  <div>
                    <h2 style={{fontSize:24, fontWeight:800}}>{selectedReport.date}</h2>
                    <div style={{fontSize:12, color:'var(--accent)', fontWeight:700, marginTop:4}}>AI-GENERATED SALES REPORT</div>
                  </div>
                  <div style={{display:'flex', gap:10}}>
                    <button onClick={()=>{navigator.clipboard.writeText(selectedReport.content); setCopied(true); setTimeout(()=>setCopied(false),2000)}} className="btn-primary" style={{background:'rgba(255,255,255,0.05)', color:'#fff'}}>{copied?'Copied ✓':'Copy'}</button>
                    <button onClick={()=>{setEditReportContent(selectedReport.content); setEditingReport(true);}} className="btn-primary" style={{background:'rgba(255,255,255,0.05)', color:'#fff'}}>Edit</button>
                    <button onClick={()=>deleteReport(selectedReport.id)} className="btn-primary" style={{background:'rgba(239, 68, 68, 0.1)', color:'var(--danger)', border:'1px solid rgba(239, 68, 68, 0.2)'}}>Delete</button>
                  </div>
                </div>

                {editingReport ? (
                  <div>
                    <textarea value={editReportContent} onChange={e=>setEditReportContent(e.target.value)} 
                      style={{width:'100%', minHeight:500, background:'#0a0a0b', border:'1px solid var(--accent)', color:'white', padding:24, borderRadius:16, fontFamily:'monospace', lineHeight:1.6}}/>
                    <div style={{display:'flex', gap:12, marginTop:20}}>
                      <button onClick={()=>saveReport(selectedReport.id, editReportContent)} className="btn-primary">Save Changes</button>
                      <button onClick={()=>setEditingReport(false)} className="btn-primary" style={{background:'#27272a'}}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{background:'rgba(255,255,255,0.02)', padding:32, borderRadius:20, whiteSpace:'pre-wrap', lineHeight:1.8, fontSize:14, color:'#d1d1d6', border:'1px solid var(--border)'}}>
                    {selectedReport.content}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* WEEKLY */}
        {tab==='Weekly' && (
          <div className="fade-in">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:32}}>
               <div style={{display:'flex', gap:20}}>
                  <StatCard label="Total Leads" value={leads.length}/>
                  <StatCard label="Won" value={counts.closed_won||0} color="var(--success)"/>
               </div>
               <button onClick={async()=>{
                 const r=await fetch('/api/weekly-excel');
                 const blob=await r.blob();
                 const url=URL.createObjectURL(blob);
                 const a=document.createElement('a'); a.href=url; a.download='weekly.xlsx'; a.click();
               }} className="btn-primary">📥 Download Excel Report</button>
            </div>

            {selectedLeads.size > 0 && (
              <div style={{background:'rgba(239, 68, 68, 0.1)', border:'1px solid rgba(239, 68, 68, 0.2)', padding:'12px 24px', borderRadius:12, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{fontSize:14, fontWeight:700, color:'#ef4444'}}>Selected {selectedLeads.size} leads</span>
                <div style={{display:'flex', gap:8}}>
                  <button onClick={()=>setSelectedLeads(new Set())} className="btn-primary" style={{background:'rgba(255,255,255,0.05)', color:'#fff'}}>Clear</button>
                  <button onClick={bulkDeleteLeads} disabled={bulkDeleting} className="btn-primary" style={{background:'#ef4444'}}>{bulkDeleting ? 'Deleting...' : 'Delete Selected'}</button>
                </div>
              </div>
            )}

            <div className="section-card" style={{overflowX:'auto', padding:0}}>
              <table style={{width:'100%', borderCollapse:'collapse', textAlign:'left'}}>
                <thead>
                  <tr style={{background:'rgba(255,255,255,0.02)', borderBottom:'1px solid var(--border)'}}>
                    <th style={{padding:'16px 24px', width:40}}>
                      <input type="checkbox" checked={selectedLeads.size===leads.length && leads.length > 0} onChange={()=>toggleAllLeads(leads)}/>
                    </th>
                    <th style={{padding:'16px 24px', fontSize:12, color:'var(--text-secondary)'}}>NAME</th>
                    <th style={{padding:'16px 24px', fontSize:12, color:'var(--text-secondary)'}}>SOURCE</th>
                    <th style={{padding:'16px 24px', fontSize:12, color:'var(--text-secondary)'}}>STATUS</th>
                    <th style={{padding:'16px 24px', fontSize:12, color:'var(--text-secondary)'}}>LATEST NOTE</th>
                    <th style={{padding:'16px 24px', fontSize:12, color:'var(--text-secondary)'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(l => (
                    <tr key={l.id} style={{borderBottom:'1px solid var(--border)', background:selectedLeads.has(l.id)?'rgba(139, 92, 246, 0.05)':'transparent'}}>
                      <td style={{padding:'16px 24px'}}>
                        <input type="checkbox" checked={selectedLeads.has(l.id)} onChange={()=>toggleLead(l.id)}/>
                      </td>
                      <td style={{padding:'16px 24px', fontWeight:700}}>{l.name}</td>
                      <td style={{padding:'16px 24px', color:'var(--text-secondary)', fontSize:13}}>{l.sources}</td>
                      <td style={{padding:'16px 24px'}}><Badge status={l.status}/></td>
                      <td style={{padding:'16px 24px'}}>
                        <div style={{fontSize:12, color:'#d1d1d6', cursor:'pointer'}} onClick={()=>setEditingNote({id:l.id, value:l.note||''})}>
                          {editingNote?.id===l.id ? (
                            <input value={editingNote.value} onChange={e=>setEditingNote({...editingNote, value:e.target.value})}
                              onKeyDown={e=>{if(e.key==='Enter')saveLeadNote(l.id, editingNote.value); if(e.key==='Escape')setEditingNote(null);}}
                              style={{fontSize:12, padding:'4px 8px', border:'1px solid var(--accent)', outline:'none', background:'#1c1c1e', color:'#fff'}} autoFocus/>
                          ) : (l.note || '---')}
                        </div>
                      </td>
                      <td style={{padding:'16px 24px', textAlign:'right'}}>
                        <button onClick={()=>deleteLead(l.id)} style={{background:'none', border:'none', cursor:'pointer', color:'rgba(239, 68, 68, 0.5)', fontSize:16}}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SCANNING */}
        {tab==='Scanning' && <ScanTab leads={leads} token={token}/>}

        {/* SETTINGS (ADD LEAD) */}
        {tab==='Settings' && (
          <div className="fade-in" style={{maxWidth:600, margin:'0 auto'}}>
            <div className="section-card" style={{padding:40}}>
              <h2 style={{fontSize:20, fontWeight:800, marginBottom:24}}>Manual Lead Entry</h2>
              <div style={{display:'grid', gap:20}}>
                <div>
                  <label style={{fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:8, display:'block'}}>TELEGRAM USERNAME</label>
                  <input placeholder="username (without @)" value={newLead.telegram_username} onChange={e=>setNewLead({...newLead, telegram_username: e.target.value.replace('@','')})}/>
                </div>
                <div>
                  <label style={{fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:8, display:'block'}}>WEBSITE</label>
                  <input placeholder="https://..." value={newLead.website} onChange={e=>setNewLead({...newLead, website: e.target.value})}/>
                </div>
                <button onClick={addLead} disabled={adding} className="btn-primary" style={{padding:16}}>
                  {adding ? 'Initializing Scan...' : 'Add & Scan Lead'}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      <style>{`
        .fade-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

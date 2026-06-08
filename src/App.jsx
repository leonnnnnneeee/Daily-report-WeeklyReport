import { useState, useEffect, useCallback } from 'react'

const STATUS = {
  new:              { label: 'New',        color: '#6B7280', bg: '#F3F4F6' },
  interested:       { label: 'Interested', color: '#059669', bg: '#D1FAE5' },
  waiting:          { label: 'Waiting',    color: '#D97706', bg: '#FEF3C7' },
  no_budget:        { label: 'No Budget',  color: '#DC2626', bg: '#FEE2E2' },
  follow_up_needed: { label: 'Follow Up',  color: '#7C3AED', bg: '#EDE9FE' },
  closed_won:       { label: 'Won',        color: '#065F46', bg: '#A7F3D0' },
  closed_lost:      { label: 'Lost',       color: '#991B1B', bg: '#FECACA' },
}

const B = {
  p: { background:'#111',color:'#fff',border:'none',padding:'9px 20px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer' },
  s: { background:'#fff',color:'#374151',border:'1px solid #D1D5DB',padding:'8px 16px',borderRadius:8,fontSize:13,cursor:'pointer' },
  g: { background:'transparent',color:'#6B7280',border:'none',padding:'6px 14px',borderRadius:7,fontSize:13,fontWeight:500,cursor:'pointer' },
}
const inp = { width:'100%',padding:'8px 12px',border:'1px solid #D1D5DB',borderRadius:8,fontSize:13,background:'#F9FAFB' }

function Badge({ status }) {
  const s = STATUS[status] || STATUS.new
  return <span style={{ background:s.bg,color:s.color,padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:600,whiteSpace:'nowrap' }}>{s.label}</span>
}
function Stat({ label, value, color }) {
  return (
    <div style={{ background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:'18px 20px',flex:1,minWidth:100 }}>
      <div style={{ fontSize:12,color:'#6B7280',marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:26,fontWeight:700,color:color||'#111' }}>{value}</div>
    </div>
  )
}

const TABS = ['Dashboard','Leads','Daily Report','Auto Scan','Setup','Add Lead']

export default function App() {
  const [tab, setTab] = useState('Dashboard')
  const [leads, setLeads] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [dailyNotes, setDailyNotes] = useState('')
  const [dailyReport, setDailyReport] = useState('')
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_ANTHROPIC_KEY || '')
  const [showApiInput, setShowApiInput] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')
  const [newLead, setNewLead] = useState({ name:'',website:'',sources:'',telegram_username:'',lark_email:'',research:'',note:'',status:'new' })
  const [adding, setAdding] = useState(false)

  // Setup / Auth state
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authMsg, setAuthMsg] = useState('')
  const [sessionSaved, setSessionSaved] = useState(false)

  const loadLeads = useCallback(async () => {
    try { const r = await fetch('/api/leads'); setLeads(await r.json()) } catch {}
  }, [])

  useEffect(() => { loadLeads() }, [loadLeads])
  useEffect(() => { const t = setInterval(loadLeads, 30000); return () => clearInterval(t) }, [loadLeads])

  const counts = Object.fromEntries(Object.keys(STATUS).map(s => [s, leads.filter(l => l.status === s).length]))
  const filtered = filterStatus === 'all' ? leads : leads.filter(l => l.status === filterStatus)
  const followUps = leads.filter(l => l.status === 'follow_up_needed' || l.status === 'waiting')

  async function sendOtp() {
    if (!phone.trim()) return
    setAuthLoading(true); setAuthMsg('')
    try {
      const r = await fetch('/api/auth/send-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ phone }) })
      const d = await r.json()
      if (d.ok) { setOtpSent(true); setAuthMsg('✅ OTP đã gửi về Telegram. Nhập code bên dưới.') }
      else setAuthMsg('❌ ' + d.message)
    } catch(e) { setAuthMsg('❌ ' + e.message) }
    setAuthLoading(false)
  }

  async function verifyOtp() {
    if (!otp.trim()) return
    setAuthLoading(true); setAuthMsg('')
    try {
      const r = await fetch('/api/auth/verify-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ phone, code: otp }) })
      const d = await r.json()
      if (d.ok) { setSessionSaved(true); setAuthMsg('✅ Xác thực thành công! Telegram session đã được lưu. Giờ bấm Scan Now.') }
      else setAuthMsg('❌ ' + d.message)
    } catch(e) { setAuthMsg('❌ ' + e.message) }
    setAuthLoading(false)
  }

  async function triggerScan() {
    setScanning(true); setScanMsg('⏳ Đang scan Telegram + Lark Mail...')
    try {
      const r = await fetch('/api/scan', { method:'POST' })
      const d = await r.json()
      setScanMsg(d.ok ? '✅ Scan đang chạy! Leads sẽ cập nhật sau ~1 phút.' : '⚠️ ' + d.message)
    } catch(e) { setScanMsg('❌ ' + e.message) }
    setScanning(false)
    setTimeout(loadLeads, 10000)
  }

  async function generateDaily() {
    if (!dailyNotes.trim() || !apiKey) return
    setGenerating(true); setDailyReport('')
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:1000,
          system:`Bạn là sales analyst Coincu.com. Phân tích notes tạo daily standup.
Trả về JSON: {"leads":[{"name":"...","status":"interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost","summary":"1 câu","next_action":"..."}],"other_tasks":["..."],"plan_today":["..."]}`,
          messages:[{ role:'user', content:dailyNotes }]
        })
      })
      const data = await res.json()
      const p = JSON.parse(data.content[0].text.replace(/```json|```/g,'').trim())
      const E = { interested:'🟢',waiting:'🟡',no_budget:'🔴',follow_up_needed:'🔁',closed_won:'✅',closed_lost:'❌' }
      const date = new Date().toLocaleDateString('vi-VN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
      let r = `📋 STANDUP NOTE — ${date}\n${'═'.repeat(48)}\n\n1. What did you accomplish yesterday?\n\n   Reach out các leads:\n`
      p.leads.forEach(l => { r += `   ${E[l.status]||'⚪'} ${l.name}: ${l.summary}\n` })
      if (p.other_tasks?.length) { r += `\n   Việc khác:\n`; p.other_tasks.forEach(t => r += `   • ${t}\n`) }
      r += `\n2. What are you planning to do today?\n\n`
      p.plan_today.forEach(t => { r += `   - ${t}\n` })
      const fu = p.leads.filter(l => l.status==='follow_up_needed'||l.status==='waiting')
      if (fu.length) { r += `\n3. Follow up:\n\n`; fu.forEach(l => r += `   🔁 ${l.name} → ${l.next_action}\n`) }
      setDailyReport(r)
    } catch(e) { setDailyReport('❌ Lỗi: '+e.message) }
    setGenerating(false)
  }

  async function addLead() {
    if (!newLead.name.trim()) return alert('Nhập tên dự án!')
    setAdding(true)
    await fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(newLead) })
    setNewLead({ name:'',website:'',sources:'',telegram_username:'',lark_email:'',research:'',note:'',status:'new' })
    await loadLeads(); setAdding(false); setTab('Leads')
  }

  async function deleteLead(id) {
    if (!confirm('Xóa lead này?')) return
    await fetch(`/api/leads/${id}`, { method:'DELETE' }); await loadLeads()
  }

  async function updateStatus(id, status) {
    await fetch(`/api/leads/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ status }) })
    await loadLeads()
  }

  return (
    <div style={{ minHeight:'100vh',background:'#F9FAFB',fontFamily:"'DM Sans','Helvetica Neue',sans-serif" }}>
      {/* Header */}
      <div style={{ background:'#111',color:'#fff',padding:'0 24px',height:56,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:10 }}>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <div style={{ width:30,height:30,background:'#fff',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16 }}>⚡</div>
          <span style={{ fontWeight:700,fontSize:15 }}>Coincu Sales</span>
        </div>
        <div style={{ display:'flex',gap:2 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ ...B.g,background:tab===t?'rgba(255,255,255,0.15)':'transparent',color:tab===t?'#fff':'#999' }}>{t}</button>
          ))}
        </div>
        <button onClick={() => setShowApiInput(!showApiInput)} style={{ ...B.s,fontSize:12,padding:'5px 12px',background:apiKey?'transparent':'#fff',color:apiKey?'#4ade80':'#374151',borderColor:apiKey?'#4ade80':'#D1D5DB' }}>
          {apiKey ? '🔑 Key ✓' : '🔑 API Key'}
        </button>
      </div>
      {showApiInput && (
        <div style={{ background:'#1a1a1a',padding:'10px 24px',display:'flex',gap:8 }}>
          <input type="password" placeholder="sk-ant-api03-..." defaultValue={apiKey} id="apiKeyInp" style={{ ...inp,maxWidth:380,background:'#333',border:'1px solid #444',color:'#fff' }} />
          <button onClick={() => { setApiKey(document.getElementById('apiKeyInp').value); setShowApiInput(false) }} style={B.p}>Save</button>
        </div>
      )}

      <div style={{ padding:24,maxWidth:1080,margin:'0 auto' }}>

        {/* DASHBOARD */}
        {tab==='Dashboard' && (
          <div>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
              <h2 style={{ fontSize:20,fontWeight:700 }}>Dashboard</h2>
              <span style={{ fontSize:12,color:'#9CA3AF' }}>{leads.length} leads • auto-refresh 30s</span>
            </div>
            <div style={{ display:'flex',gap:12,marginBottom:22,flexWrap:'wrap' }}>
              <Stat label="Total" value={leads.length} />
              <Stat label="Interested" value={counts.interested||0} color="#059669" />
              <Stat label="Waiting" value={counts.waiting||0} color="#D97706" />
              <Stat label="No Budget" value={counts.no_budget||0} color="#DC2626" />
              <Stat label="Follow Up" value={counts.follow_up_needed||0} color="#7C3AED" />
              <Stat label="Won" value={counts.closed_won||0} color="#065F46" />
            </div>
            {followUps.length > 0 && (
              <div style={{ background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:12,padding:16,marginBottom:20 }}>
                <div style={{ fontWeight:600,color:'#92400E',marginBottom:10,fontSize:14 }}>🔁 Follow up hôm nay ({followUps.length})</div>
                {followUps.map(l => (
                  <div key={l.id} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #FED7AA' }}>
                    <div><span style={{ fontWeight:600,fontSize:13 }}>{l.name}</span><span style={{ color:'#6B7280',fontSize:12,marginLeft:10 }}>{l.note}</span></div>
                    <Badge status={l.status} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,overflow:'hidden' }}>
              <div style={{ padding:'14px 18px',borderBottom:'1px solid #E5E7EB',fontWeight:600,fontSize:14 }}>All Leads</div>
              {leads.length === 0 && <div style={{ padding:24,color:'#9CA3AF',textAlign:'center',fontSize:13 }}>Chưa có leads — bấm "Add Lead" để thêm</div>}
              {leads.map(l => (
                <div key={l.id} style={{ display:'flex',alignItems:'center',gap:12,padding:'11px 18px',borderBottom:'1px solid #F3F4F6' }}>
                  <div style={{ width:32,height:32,background:'#F3F4F6',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,flexShrink:0 }}>{l.name[0]}</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontWeight:600,fontSize:13 }}>{l.name}</div>
                    <div style={{ fontSize:12,color:'#6B7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{l.note}</div>
                  </div>
                  <Badge status={l.status} />
                  <div style={{ fontSize:11,color:'#9CA3AF',flexShrink:0 }}>{l.last_contacted}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEADS */}
        {tab==='Leads' && (
          <div>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18 }}>
              <h2 style={{ fontSize:20,fontWeight:700 }}>Leads ({filtered.length})</h2>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp,width:'auto' }}>
                <option value="all">All Status</option>
                {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {filtered.map(l => (
              <div key={l.id} style={{ background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:'14px 18px',marginBottom:10 }}>
                <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:5 }}>
                      <span style={{ fontWeight:700,fontSize:14 }}>{l.name}</span>
                      <Badge status={l.status} />
                      {l.last_scanned && <span style={{ fontSize:11,color:'#9CA3AF' }}>🤖 scanned</span>}
                    </div>
                    <div style={{ fontSize:13,color:'#6B7280',marginBottom:6,lineHeight:1.5 }}>{l.research}</div>
                    <div style={{ fontSize:12,background:'#F9FAFB',padding:'4px 10px',borderRadius:6,display:'inline-block',marginBottom:6 }}>📝 {l.note}</div>
                    <div style={{ fontSize:12,color:'#9CA3AF',display:'flex',gap:12,flexWrap:'wrap' }}>
                      {l.telegram_username && <span>📱 @{l.telegram_username}</span>}
                      {l.lark_email && <span>📧 {l.lark_email}</span>}
                      {l.website && <a href={l.website} target="_blank" rel="noreferrer" style={{ color:'#6366F1' }}>🌐 Website</a>}
                    </div>
                  </div>
                  <div style={{ display:'flex',flexDirection:'column',gap:6,flexShrink:0 }}>
                    <select value={l.status} onChange={e => updateStatus(l.id, e.target.value)} style={{ ...inp,width:130,fontSize:12,padding:'5px 8px' }}>
                      {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => deleteLead(l.id)} style={{ ...B.s,fontSize:11,padding:'4px 10px',color:'#DC2626',borderColor:'#FCA5A5' }}>🗑 Xóa</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DAILY REPORT */}
        {tab==='Daily Report' && (
          <div>
            <h2 style={{ fontSize:20,fontWeight:700,marginBottom:6 }}>Daily Standup Report</h2>
            <p style={{ color:'#6B7280',fontSize:13,marginBottom:20 }}>Nhập notes → AI format thành standup chuẩn</p>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:20 }}>
              <div>
                <textarea value={dailyNotes} onChange={e => setDailyNotes(e.target.value)}
                  placeholder={"- lunarpr quan tâm nhưng chưa có budget\n- BC.Game đã reply đang đợi discuss\n- Stake bận world cup tuần sau getback"}
                  style={{ ...inp,height:200,resize:'vertical',lineHeight:1.6,marginBottom:10 }} />
                <button onClick={generateDaily} disabled={generating||!dailyNotes.trim()||!apiKey}
                  style={{ ...B.p,width:'100%',opacity:generating||!dailyNotes.trim()||!apiKey?0.5:1 }}>
                  {generating ? '⏳ Đang generate...' : '⚡ Generate Report'}
                </button>
                {!apiKey && <p style={{ fontSize:12,color:'#DC2626',marginTop:6 }}>⚠️ Set API Key ở góc trên phải</p>}
              </div>
              <div>
                <div style={{ display:'flex',justifyContent:'space-between',marginBottom:8 }}>
                  <span style={{ fontSize:13,fontWeight:600 }}>Output</span>
                  {dailyReport && <button onClick={() => { navigator.clipboard.writeText(dailyReport); setCopied(true); setTimeout(()=>setCopied(false),2000) }} style={{ ...B.s,fontSize:12,padding:'4px 12px' }}>{copied?'✅ Copied':'📋 Copy'}</button>}
                </div>
                <div style={{ background:dailyReport?'#F8FAFC':'#F3F4F6',border:'1px solid #E5E7EB',borderRadius:8,padding:14,minHeight:200,fontFamily:'monospace',fontSize:12,whiteSpace:'pre-wrap',color:dailyReport?'#111':'#9CA3AF',lineHeight:1.7 }}>
                  {dailyReport||'Report sẽ hiện ra ở đây...'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AUTO SCAN */}
        {tab==='Auto Scan' && (
          <div>
            <h2 style={{ fontSize:20,fontWeight:700,marginBottom:6 }}>Auto Scan</h2>
            <p style={{ color:'#6B7280',fontSize:13,marginBottom:20 }}>Quét Telegram DM + Lark Mail → AI cập nhật status lead tự động mỗi 2 giờ</p>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20 }}>
              {[['📱','Telegram DM','Đọc chat với từng lead 24h qua'],['📧','Lark Mail','Đọc email inbox 24h qua']].map(([icon,title,desc]) => (
                <div key={title} style={{ background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:18 }}>
                  <div style={{ fontSize:28,marginBottom:8 }}>{icon}</div>
                  <div style={{ fontWeight:600,marginBottom:4 }}>{title}</div>
                  <div style={{ fontSize:13,color:'#6B7280' }}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:20 }}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
                <div>
                  <div style={{ fontWeight:600,marginBottom:4 }}>Trigger Scan</div>
                  <div style={{ fontSize:12,color:'#6B7280' }}>Auto scan mỗi 2 giờ • hoặc bấm chạy ngay</div>
                </div>
                <button onClick={triggerScan} disabled={scanning} style={{ ...B.p,background:'#7C3AED',opacity:scanning?0.6:1,minWidth:130 }}>
                  {scanning ? '⏳ Scanning...' : '🔍 Scan Now'}
                </button>
              </div>
              <div style={{ background:'#0D0D0D',color:'#00FF88',padding:16,borderRadius:8,fontFamily:'monospace',fontSize:12,minHeight:100,whiteSpace:'pre-wrap',lineHeight:1.7 }}>
                {scanMsg || 'Chưa có kết quả scan.\n\n⚠️  Cần setup Telegram trước ở tab "Setup".\nSau đó bấm Scan Now để chạy thủ công.'}
              </div>
            </div>
          </div>
        )}

        {/* SETUP — Telegram Auth qua web */}
        {tab==='Setup' && (
          <div>
            <h2 style={{ fontSize:20,fontWeight:700,marginBottom:6 }}>Setup Telegram</h2>
            <p style={{ color:'#6B7280',fontSize:13,marginBottom:24 }}>Xác thực tài khoản Telegram để bot có thể đọc DM với leads — không cần Terminal</p>

            {sessionSaved ? (
              <div style={{ background:'#D1FAE5',border:'1px solid #6EE7B7',borderRadius:12,padding:24,textAlign:'center' }}>
                <div style={{ fontSize:40,marginBottom:12 }}>✅</div>
                <div style={{ fontWeight:700,fontSize:16,color:'#065F46',marginBottom:8 }}>Telegram đã kết nối!</div>
                <div style={{ color:'#047857',fontSize:13 }}>Session đã lưu. Bấm tab "Auto Scan" → Scan Now để chạy.</div>
              </div>
            ) : (
              <div style={{ background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:24,maxWidth:480 }}>
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontWeight:600,fontSize:14,marginBottom:12 }}>Bước 1 — Nhập số điện thoại Telegram</div>
                  <div style={{ display:'flex',gap:8 }}>
                    <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+84xxxxxxxxx" style={{ ...inp,flex:1 }} disabled={otpSent} />
                    <button onClick={sendOtp} disabled={authLoading||otpSent||!phone.trim()} style={{ ...B.p,opacity:authLoading||otpSent?0.5:1,whiteSpace:'nowrap' }}>
                      {authLoading && !otpSent ? '⏳...' : otpSent ? '✅ Sent' : 'Gửi OTP'}
                    </button>
                  </div>
                </div>

                {otpSent && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontWeight:600,fontSize:14,marginBottom:12 }}>Bước 2 — Nhập OTP từ Telegram</div>
                    <div style={{ background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:8,padding:12,fontSize:13,color:'#92400E',marginBottom:12 }}>
                      📱 Telegram vừa gửi code về ứng dụng Telegram trên điện thoại bạn. Mở app Telegram → xem thông báo.
                    </div>
                    <div style={{ display:'flex',gap:8 }}>
                      <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="12345" style={{ ...inp,flex:1,letterSpacing:4,fontSize:18,textAlign:'center' }} />
                      <button onClick={verifyOtp} disabled={authLoading||!otp.trim()} style={{ ...B.p,opacity:authLoading?0.5:1 }}>
                        {authLoading ? '⏳...' : 'Xác nhận'}
                      </button>
                    </div>
                  </div>
                )}

                {authMsg && (
                  <div style={{ padding:12,borderRadius:8,background:authMsg.startsWith('✅')?'#D1FAE5':'#FEE2E2',color:authMsg.startsWith('✅')?'#065F46':'#DC2626',fontSize:13 }}>
                    {authMsg}
                  </div>
                )}

                <div style={{ marginTop:20,padding:12,background:'#F9FAFB',borderRadius:8,fontSize:12,color:'#6B7280',lineHeight:1.6 }}>
                  <strong>Lưu ý:</strong> Dùng số điện thoại đang chat với leads trên Telegram.
                  Session được lưu an toàn trên server Railway.
                </div>
              </div>
            )}

            {/* Lark setup info */}
            <div style={{ marginTop:24,background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:20 }}>
              <div style={{ fontWeight:600,fontSize:14,marginBottom:12 }}>📧 Lark Mail Setup</div>
              <div style={{ fontSize:13,color:'#6B7280',marginBottom:12 }}>Thêm vào Railway Variables:</div>
              <div style={{ fontFamily:'monospace',fontSize:12,background:'#F9FAFB',padding:12,borderRadius:8,lineHeight:2 }}>
                LARK_APP_ID = cli_aaac9256ca385e17<br/>
                LARK_APP_SECRET = your_secret_here
              </div>
              <div style={{ fontSize:12,color:'#9CA3AF',marginTop:8 }}>Sau đó thêm <code>lark_email</code> vào từng lead để hệ thống match email đúng lead.</div>
            </div>
          </div>
        )}

        {/* ADD LEAD */}
        {tab==='Add Lead' && (
          <div>
            <h2 style={{ fontSize:20,fontWeight:700,marginBottom:20 }}>Add New Lead</h2>
            <div style={{ background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:20 }}>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
                {[['name','Tên dự án *'],['website','Website'],['sources','Nguồn'],['telegram_username','Telegram username (không có @)'],['lark_email','Lark email của lead'],['note','Ghi chú outreach']].map(([k,p]) => (
                  <input key={k} placeholder={p} value={newLead[k]} onChange={e => setNewLead({...newLead,[k]:e.target.value})} style={inp} />
                ))}
              </div>
              <select value={newLead.status} onChange={e => setNewLead({...newLead,status:e.target.value})} style={{ ...inp,marginBottom:10 }}>
                {Object.entries(STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <textarea placeholder="Research — mô tả ngắn về dự án" value={newLead.research} onChange={e => setNewLead({...newLead,research:e.target.value})} style={{ ...inp,height:80,resize:'vertical',marginBottom:12 }} />
              <button onClick={addLead} disabled={adding} style={{ ...B.p,width:'100%',opacity:adding?0.6:1 }}>
                {adding ? 'Đang thêm...' : '+ Add Lead'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

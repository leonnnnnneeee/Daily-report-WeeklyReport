import { useState, useEffect, useRef } from 'react'

export default function ScanTab({ leads }) {
  const [scanning, setScanning] = useState(false)
  const [logs, setLogs] = useState([])
  const [authStatus, setAuthStatus] = useState(null)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authMsg, setAuthMsg] = useState('')
  const logRef = useRef(null)

  // Poll logs mỗi 2 giây
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const r = await fetch('/api/logs')
        const data = await r.json()
        setLogs(data)
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      } catch {}
    }
    fetchLogs()
    const t = setInterval(fetchLogs, 2000)
    return () => clearInterval(t)
  }, [])

  // Check auth status
  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(d => setAuthStatus(d.connected))
  }, [])

  async function triggerScan() {
    setScanning(true)
    await fetch('/api/scan', { method: 'POST' })
    setTimeout(() => setScanning(false), 3000)
  }

  async function sendOtp() {
    setAuthLoading(true); setAuthMsg('')
    const r = await fetch('/api/auth/send-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ phone }) })
    const d = await r.json()
    if (d.ok) { setOtpSent(true); setAuthMsg('✅ OTP đã gửi về Telegram') }
    else setAuthMsg('❌ ' + d.message)
    setAuthLoading(false)
  }

  async function verifyOtp() {
    setAuthLoading(true); setAuthMsg('')
    const r = await fetch('/api/auth/verify-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ phone, code: otp }) })
    const d = await r.json()
    if (d.ok) { setAuthStatus(true); setAuthMsg('✅ Kết nối Telegram thành công!') }
    else setAuthMsg('❌ ' + d.message)
    setAuthLoading(false)
  }

  const inp = { width:'100%', padding:'8px 12px', border:'1px solid #D1D5DB', borderRadius:8, fontSize:13, background:'#F9FAFB' }
  const btn = (bg, col='#fff') => ({ background:bg, color:col, border:'none', padding:'9px 20px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' })

  const leadsWithTG = leads.filter(l => l.telegram_username)

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:700, marginBottom:6 }}>Auto Scan</h2>
      <p style={{ color:'#6B7280', fontSize:13, marginBottom:20 }}>Quét Telegram DM → AI phân tích → cập nhật status tự động mỗi 2 giờ</p>

      {/* Status cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, padding:16 }}>
          <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Telegram</div>
          <div style={{ fontWeight:700, color: authStatus ? '#059669' : '#DC2626' }}>
            {authStatus ? '🟢 Connected' : '🔴 Not connected'}
          </div>
        </div>
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, padding:16 }}>
          <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Leads có TG</div>
          <div style={{ fontWeight:700, fontSize:20 }}>{leadsWithTG.length} / {leads.length}</div>
        </div>
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, padding:16 }}>
          <div style={{ fontSize:12, color:'#6B7280', marginBottom:4 }}>Auto scan</div>
          <div style={{ fontWeight:700, color:'#059669' }}>🟢 Mỗi 2 giờ</div>
        </div>
      </div>

      {/* Telegram Auth */}
      {!authStatus && (
        <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:12, padding:20, marginBottom:20 }}>
          <div style={{ fontWeight:600, color:'#92400E', marginBottom:12 }}>⚠️ Cần xác thực Telegram trước khi scan</div>
          {!otpSent ? (
            <div style={{ display:'flex', gap:8 }}>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+84xxxxxxxxx" style={{ ...inp, flex:1 }} />
              <button onClick={sendOtp} disabled={authLoading || !phone} style={btn('#111')}>
                {authLoading ? '⏳...' : 'Gửi OTP'}
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', gap:8 }}>
              <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="Nhập OTP code" style={{ ...inp, flex:1, textAlign:'center', letterSpacing:4, fontSize:18 }} />
              <button onClick={verifyOtp} disabled={authLoading || !otp} style={btn('#059669')}>
                {authLoading ? '⏳...' : 'Xác nhận'}
              </button>
            </div>
          )}
          {authMsg && <div style={{ marginTop:10, fontSize:13, color: authMsg.startsWith('✅') ? '#059669' : '#DC2626' }}>{authMsg}</div>}
        </div>
      )}

      {/* Scan button */}
      <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, padding:20, marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <div style={{ fontWeight:600 }}>Manual Scan</div>
            <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>
              {leadsWithTG.length === 0
                ? '⚠️ Chưa có lead nào có Telegram username — thêm vào tab Add Lead'
                : `Sẽ scan ${leadsWithTG.length} leads: ${leadsWithTG.map(l => '@'+l.telegram_username).join(', ')}`}
            </div>
          </div>
          <button onClick={triggerScan} disabled={scanning || !authStatus} style={{ ...btn('#7C3AED'), opacity: scanning || !authStatus ? 0.5 : 1, minWidth:130 }}>
            {scanning ? '⏳ Scanning...' : '🔍 Scan Now'}
          </button>
        </div>

        {/* Live logs */}
        <div ref={logRef} style={{ background:'#0D0D0D', color:'#00FF88', padding:16, borderRadius:8, fontFamily:'monospace', fontSize:12, height:250, overflowY:'auto', lineHeight:1.7 }}>
          {logs.length === 0
            ? 'Chờ log...\n\nBấm Scan Now để bắt đầu.'
            : logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>

      {/* Warning nếu không có TG username */}
      {leadsWithTG.length < leads.length && (
        <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:14, fontSize:13, color:'#1E40AF' }}>
          💡 {leads.length - leadsWithTG.length} leads chưa có Telegram username. Vào tab <strong>Leads</strong> → chỉnh sửa để thêm @username.
        </div>
      )}
    </div>
  )
}

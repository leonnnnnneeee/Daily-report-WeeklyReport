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
  const [apiKey, setApiKey] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [apiKeyMsg, setApiKeyMsg] = useState('')
  const logRef = useRef(null)

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

  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(d => setAuthStatus(d.connected))
  }, [])

  async function saveApiKey() {
    if (!apiKey.startsWith('sk-')) { setApiKeyMsg('❌ Key không hợp lệ'); return }
    const r = await fetch('/api/settings/apikey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: apiKey }) })
    const d = await r.json()
    if (d.ok) { setApiKeySaved(true); setApiKeyMsg('✅ API Key đã lưu! Scan Now sẽ dùng AI phân tích.') }
    else setApiKeyMsg('❌ ' + d.message)
  }

  async function triggerScan() {
    setScanning(true)
    await fetch('/api/scan', { method: 'POST' })
    setTimeout(() => setScanning(false), 3000)
  }

  async function sendOtp() {
    setAuthLoading(true); setAuthMsg('')
    const r = await fetch('/api/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) })
    const d = await r.json()
    if (d.ok) { setOtpSent(true); setAuthMsg('✅ OTP đã gửi về Telegram') }
    else setAuthMsg('❌ ' + d.message)
    setAuthLoading(false)
  }

  async function verifyOtp() {
    setAuthLoading(true); setAuthMsg('')
    const r = await fetch('/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code: otp }) })
    const d = await r.json()
    if (d.ok) { setAuthStatus(true); setAuthMsg('✅ Kết nối thành công! Session đã lưu vĩnh viễn.') }
    else setAuthMsg('❌ ' + d.message)
    setAuthLoading(false)
  }

  const inp = { width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13, background: '#F9FAFB' }
  const btn = (bg) => ({ background: bg, color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' })

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Auto Scan</h2>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 20 }}>Tự động quét Telegram DM + Lark Email → AI phân tích → cập nhật leads + daily report</p>

      {/* Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Telegram</div>
          <div style={{ fontWeight: 700, color: authStatus ? '#059669' : '#DC2626' }}>{authStatus ? '🟢 Connected' : '🔴 Not connected'}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Leads found</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{leads.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Auto scan</div>
          <div style={{ fontWeight: 700, color: '#059669' }}>🟢 8:00 AM daily</div>
        </div>
      </div>

      {/* Anthropic API Key */}
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: 18, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, color: '#166534', marginBottom: 10, fontSize: 14 }}>🤖 Anthropic API Key (để AI phân tích leads)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-api03-..." style={{ ...inp, flex: 1 }} />
          <button onClick={saveApiKey} style={btn('#059669')}>Lưu Key</button>
        </div>
        {apiKeyMsg && <div style={{ marginTop: 8, fontSize: 13, color: apiKeyMsg.startsWith('✅') ? '#059669' : '#DC2626' }}>{apiKeyMsg}</div>}
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>Key được lưu vào Supabase — không cần nhập lại sau khi deploy. Lấy tại: console.anthropic.com/settings/keys</div>
      </div>

      {/* Telegram Auth */}
      {!authStatus && (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ fontWeight: 600, color: '#92400E', marginBottom: 12 }}>⚠️ Xác thực Telegram (1 lần duy nhất)</div>
          {!otpSent ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+84xxxxxxxxx" style={{ ...inp, flex: 1 }} />
              <button onClick={sendOtp} disabled={authLoading || !phone} style={{ ...btn('#111'), opacity: authLoading || !phone ? 0.5 : 1 }}>
                {authLoading ? '⏳...' : 'Gửi OTP'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="Nhập OTP code" style={{ ...inp, flex: 1, textAlign: 'center', letterSpacing: 4, fontSize: 18 }} />
              <button onClick={verifyOtp} disabled={authLoading || !otp} style={{ ...btn('#059669'), opacity: authLoading || !otp ? 0.5 : 1 }}>
                {authLoading ? '⏳...' : 'Xác nhận'}
              </button>
            </div>
          )}
          {authMsg && <div style={{ marginTop: 8, fontSize: 13, color: authMsg.startsWith('✅') ? '#059669' : '#DC2626' }}>{authMsg}</div>}
        </div>
      )}

      {/* Scan button + Live logs */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Manual Scan</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Quét Telegram DM + Lark Email → tự thêm leads + tạo daily report</div>
          </div>
          <button onClick={triggerScan} disabled={scanning || !authStatus}
            style={{ ...btn('#7C3AED'), opacity: scanning || !authStatus ? 0.5 : 1, minWidth: 130 }}>
            {scanning ? '⏳ Scanning...' : '🔍 Scan Now'}
          </button>
        </div>

        <div ref={logRef} style={{ background: '#0D0D0D', color: '#00FF88', padding: 14, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, height: 280, overflowY: 'auto', lineHeight: 1.7 }}>
          {logs.length === 0
            ? 'Chờ log...\n\n1. Lưu Anthropic API Key ở trên\n2. Xác thực Telegram OTP\n3. Bấm Scan Now'
            : logs.map((l, i) => <div key={i} style={{ color: l.includes('❌') ? '#FF6B6B' : l.includes('✅') ? '#00FF88' : l.includes('🎯') ? '#FFD700' : '#00FF88' }}>{l}</div>)}
        </div>
      </div>
    </div>
  )
}

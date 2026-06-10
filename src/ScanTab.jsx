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
  const [need2fa, setNeed2fa] = useState(false)
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyMsg, setApiKeyMsg] = useState('')
  const logRef = useRef(null)

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/logs')
        const d = await r.json()
        setLogs(d)
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      } catch {}
    }, 2000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetch('/api/auth/status').then(r => r.json()).then(d => setAuthStatus(d.connected))
  }, [])

  async function saveApiKey() {
    if (!apiKey.startsWith('AIza') && !apiKey.startsWith('sk-')) {
      setApiKeyMsg('❌ Key không hợp lệ')
      return
    }
    const r = await fetch('/api/settings/apikey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKey })
    })
    const d = await r.json()
    setApiKeyMsg(d.ok ? '✅ Đã lưu!' : '❌ ' + d.message)
  }

  async function sendOtp() {
    setAuthLoading(true); setAuthMsg('')
    const r = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    })
    const d = await r.json()
    if (d.ok) { setOtpSent(true); setAuthMsg('✅ OTP đã gửi về Telegram') }
    else setAuthMsg('❌ ' + d.message)
    setAuthLoading(false)
  }

  async function verifyOtp() {
    setAuthLoading(true); setAuthMsg('')
    const r = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code: otp, password: need2fa ? password : '' })
    })
    const d = await r.json()
    if (d.ok) {
      setAuthStatus(true)
      setAuthMsg('✅ Kết nối thành công! Session lưu vĩnh viễn.')
    } else if (d.need2fa) {
      setNeed2fa(true)
      setAuthMsg('🔐 Nhập mật khẩu 2FA của Telegram')
    } else {
      setAuthMsg('❌ ' + d.message)
    }
    setAuthLoading(false)
  }

  function resetAuth() {
    setAuthStatus(false)
    setOtpSent(false)
    setPhone('')
    setOtp('')
    setAuthMsg('Nhập SĐT mới để đổi account Telegram')
  }

  async function triggerScan() {
    setScanning(true)
    await fetch('/api/scan', { method: 'POST' })
    setTimeout(() => setScanning(false), 3000)
  }

  const inp = { width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13, background: '#F9FAFB' }
  const btn = (bg, col = '#fff') => ({ background: bg, color: col, border: 'none', padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' })

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Auto Scan</h2>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 20 }}>Quét Telegram DM + Lark Email → AI phân tích → cập nhật leads • 9:40 sáng hàng ngày</p>

      {/* Status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>Telegram Account</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: authStatus ? '#059669' : '#DC2626', fontSize: 13 }}>
              {authStatus ? '🟢 Connected' : '🔴 Not connected'}
            </span>
            {authStatus && (
              <button onClick={resetAuth} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #D1D5DB', borderRadius: 6, background: '#F9FAFB', cursor: 'pointer', color: '#374151' }}>
                🔄 Đổi SĐT
              </button>
            )}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Leads</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{leads.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Lịch tự động</div>
          <div style={{ fontWeight: 700, color: '#059669', fontSize: 13 }}>🕘 9:40 sáng/ngày</div>
        </div>
      </div>

      {/* Gemini API Key */}
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, color: '#166534', marginBottom: 8, fontSize: 13 }}>🤖 Gemini API Key (AI phân tích leads)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIzaSy..." style={{ ...inp, flex: 1 }} />
          <button onClick={saveApiKey} style={btn('#059669')}>Lưu</button>
        </div>
        {apiKeyMsg && <div style={{ marginTop: 6, fontSize: 12, color: apiKeyMsg.startsWith('✅') ? '#059669' : '#DC2626' }}>{apiKeyMsg}</div>}
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>Lấy miễn phí tại aistudio.google.com → API keys</div>
      </div>

      {/* Telegram Auth */}
      {!authStatus && (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, color: '#92400E', marginBottom: 10, fontSize: 13 }}>
            📱 {authMsg || 'Xác thực Telegram (1 lần — lưu vĩnh viễn)'}
          </div>
          {!otpSent ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+84xxxxxxxxx" style={{ ...inp, flex: 1 }} />
              <button onClick={sendOtp} disabled={authLoading || !phone.trim()} style={{ ...btn('#111'), opacity: authLoading || !phone.trim() ? 0.5 : 1 }}>
                {authLoading ? '⏳' : 'Gửi OTP'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: '#92400E', marginBottom: 8 }}>✅ OTP đã gửi — mở Telegram xem code</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: need2fa ? 8 : 0 }}>
                <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="Nhập OTP code" style={{ ...inp, flex: 1, textAlign: 'center', letterSpacing: 6, fontSize: 18 }} disabled={need2fa} />
                {!need2fa && <button onClick={verifyOtp} disabled={authLoading || !otp.trim()} style={{ ...btn('#059669'), opacity: authLoading || !otp.trim() ? 0.5 : 1 }}>
                  {authLoading ? '⏳' : 'Xác nhận'}
                </button>}
              </div>
              {need2fa && (
                <div>
                  <div style={{ fontSize: 12, color: '#92400E', marginBottom: 6 }}>🔐 Account có 2FA — nhập mật khẩu Telegram:</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mật khẩu 2FA Telegram" style={{ ...inp, flex: 1 }} />
                    <button onClick={verifyOtp} disabled={authLoading || !password.trim()} style={{ ...btn('#059669'), opacity: authLoading || !password.trim() ? 0.5 : 1 }}>
                      {authLoading ? '⏳' : 'Xác nhận'}
                    </button>
                  </div>
                </div>
              )}
              <button onClick={() => { setOtpSent(false); setPhone(''); setOtp('') }} style={{ fontSize: 12, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8, padding: 0 }}>
                ← Nhập lại SĐT
              </button>
            </div>
          )}
          {authMsg && authMsg.startsWith('❌') && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626' }}>{authMsg}</div>
          )}
        </div>
      )}

      {/* Scan button + logs */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Manual Scan</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Quét ngay không cần chờ 9:40 sáng</div>
          </div>
          <button onClick={triggerScan} disabled={scanning || !authStatus}
            style={{ ...btn('#7C3AED'), opacity: scanning || !authStatus ? 0.5 : 1, minWidth: 130 }}>
            {scanning ? '⏳ Scanning...' : '🔍 Scan Now'}
          </button>
        </div>

        <div ref={logRef} style={{ background: '#0D0D0D', color: '#00FF88', padding: 14, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, height: 260, overflowY: 'auto', lineHeight: 1.7 }}>
          {logs.length === 0
            ? 'Chờ log...\n\n1. Lưu Gemini API Key\n2. Xác thực SĐT Telegram\n3. Bấm Scan Now'
            : logs.map((l, i) => (
              <div key={i} style={{ color: l.includes('❌') ? '#FF6B6B' : l.includes('✅') || l.includes('🎯') ? '#00FF88' : l.includes('⚠️') ? '#FFD700' : '#00FF88' }}>
                {l}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

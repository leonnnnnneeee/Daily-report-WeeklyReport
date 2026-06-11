import { useState } from 'react'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!username || !password) return
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const d = await r.json()
      if (d.ok) {
        localStorage.setItem('auth_token', d.token)
        onLogin(d.token)
      } else {
        setError(d.message || 'Sai thông tin đăng nhập')
      }
    } catch(e) {
      setError('Lỗi kết nối')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#111', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans','Helvetica Neue',sans-serif" }}>
      <div style={{ background:'#1a1a1a', border:'1px solid #333', borderRadius:16, padding:40, width:360 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:48, height:48, background:'#fff', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 16px' }}>⚡</div>
          <div style={{ color:'#fff', fontSize:22, fontWeight:700 }}>Coincu Sales</div>
          <div style={{ color:'#666', fontSize:13, marginTop:4 }}>Đăng nhập để tiếp tục</div>
        </div>

        <div style={{ marginBottom:14 }}>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            style={{ width:'100%', padding:'10px 14px', background:'#222', border:'1px solid #333', borderRadius:8, color:'#fff', fontSize:14, boxSizing:'border-box' }}
          />
        </div>
        <div style={{ marginBottom:20 }}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            onKeyDown={e => e.key==='Enter' && handleLogin()}
            style={{ width:'100%', padding:'10px 14px', background:'#222', border:'1px solid #333', borderRadius:8, color:'#fff', fontSize:14, boxSizing:'border-box' }}
          />
        </div>

        {error && <div style={{ color:'#FF6B6B', fontSize:13, marginBottom:14, textAlign:'center' }}>{error}</div>}

        <button onClick={handleLogin} disabled={loading || !username || !password}
          style={{ width:'100%', padding:'11px', background:'#fff', color:'#111', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer', opacity: loading || !username || !password ? 0.5 : 1 }}>
          {loading ? '⏳ Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </div>
    </div>
  )
}

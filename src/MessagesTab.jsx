import { useState, useEffect, useRef } from 'react'

export default function MessagesTab({ token, initialChat }) {
  const [chats, setChats] = useState([])
  const [selectedChat, setSelectedChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  const msgEndRef = useRef(null)

  useEffect(() => {
    loadChats()
  }, [])

  useEffect(() => {
    if (initialChat) {
      handleOpenInitialChat(initialChat)
    }
  }, [initialChat])

  useEffect(() => {
    if (selectedChat) {
      loadMessages(selectedChat.id)
      const t = setInterval(() => loadMessages(selectedChat.id, true), 5000)
      return () => clearInterval(t)
    }
  }, [selectedChat])

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadChats() {
    setLoading(true)
    try {
      const r = await fetch('/api/chat/list', { headers: { 'x-auth-token': token } })
      const d = await r.json()
      if (Array.isArray(d)) setChats(d)
    } catch {}
    setLoading(false)
  }

  async function handleOpenInitialChat(target) {
    // target can be { id, name } or { username }
    if (target.id) {
      setSelectedChat(target)
    } else if (target.username) {
      setLoading(true)
      try {
        const r = await fetch(\`/api/chat/resolve/\${target.username}\`, { headers: { 'x-auth-token': token } })
        const d = await r.json()
        if (d.id) {
          setSelectedChat(d)
          // Add to chats list if not present
          setChats(prev => prev.some(c => c.id === d.id) ? prev : [d, ...prev])
        }
      } catch (e) { alert('Could not find Telegram user @' + target.username) }
      setLoading(false)
    }
  }

  async function loadMessages(chatId, silent = false) {
    try {
      const r = await fetch(\`/api/chat/messages/\${chatId}\`, { headers: { 'x-auth-token': token } })
      const d = await r.json()
      if (Array.isArray(d)) setMessages(d)
    } catch {}
  }

  async function sendMessage() {
    if (!text.trim() || !selectedChat) return
    setSending(true)
    try {
      const r = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ chatId: selectedChat.id, text })
      })
      if (r.ok) {
        setText('')
        loadMessages(selectedChat.id)
      }
    } catch {}
    setSending(false)
  }

  return (
    <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, height: 'calc(100vh - 180px)' }}>
      {/* CHAT LIST */}
      <div className="section-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="section-header">
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>Messages</h3>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>}
          {chats.map(c => (
            <div key={c.id} onClick={() => setSelectedChat(c)}
              style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: selectedChat?.id === c.id ? 'rgba(139, 92, 246, 0.1)' : 'transparent', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 40, height: 40, background: '#27272a', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{c.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMsg || 'No messages'}</div>
              </div>
              {c.unread > 0 && <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%' }}></div>}
            </div>
          ))}
        </div>
      </div>

      {/* CHAT WINDOW */}
      <div className="section-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {selectedChat ? (
          <>
            <div className="section-header" style={{ padding: '16px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, background: '#27272a', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{selectedChat.name[0]}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{selectedChat.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>CONNECTED</div>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {messages.length === 0 && !loading && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginTop: 40 }}>Start the conversation with @{selectedChat.name}</div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.fromMe ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                  <div style={{ 
                    background: m.fromMe ? 'var(--accent)' : 'rgba(255,255,255,0.05)', 
                    color: '#fff', 
                    padding: '12px 18px', 
                    borderRadius: m.fromMe ? '18px 18px 2px 18px' : '18px 18px 18px 2px',
                    fontSize: 14,
                    lineHeight: 1.5,
                    boxShadow: m.fromMe ? '0 4px 12px rgba(139, 92, 246, 0.2)' : 'none'
                  }}>
                    {m.text}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4, textAlign: m.fromMe ? 'right' : 'left' }}>
                    {new Date(m.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>

            <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
              <input value={text} onChange={e => setText(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..." 
                style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '12px 20px', borderRadius: 14 }} />
              <button onClick={sendMessage} disabled={sending || !text.trim()} className="btn-primary" style={{ padding: '0 24px' }}>
                {sending ? '...' : 'Send'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
            Select a contact to start messaging
          </div>
        )}
      </div>
    </div>
  )
}

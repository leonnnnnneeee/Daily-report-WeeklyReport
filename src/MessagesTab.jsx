import { useState, useEffect, useRef } from 'react'

export default function MessagesTab({ token, initialChat }) {
  const [chats, setChats] = useState([])
  const [selectedChat, setSelectedChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [text, setText] = useState('')
  
  const msgEndRef = useRef(null)
  const inputRef = useRef(null)
  const messagesLengthRef = useRef(0)

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
      const t = setInterval(() => loadMessages(selectedChat.id, true), 4000)
      return () => clearInterval(t)
    }
  }, [selectedChat])

  // Only auto-scroll if the number of messages increases, preventing forceful scroll every 4s
  useEffect(() => {
    if (messages.length > messagesLengthRef.current) {
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    messagesLengthRef.current = messages.length
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
    if (target.id) {
      setSelectedChat(target)
    } else if (target.username) {
      setLoading(true)
      try {
        const r = await fetch(`/api/chat/resolve/${target.username}`, { headers: { 'x-auth-token': token } })
        const d = await r.json()
        if (d.id) {
          setSelectedChat(d)
          setChats(prev => prev.some(c => c.id === d.id) ? prev : [d, ...prev])
        }
      } catch (e) { alert('Could not find Telegram user @' + target.username) }
      setLoading(false)
    }
  }

  async function loadMessages(chatId, silent = false) {
    try {
      const r = await fetch(`/api/chat/messages/${chatId}`, { headers: { 'x-auth-token': token } })
      const d = await r.json()
      if (Array.isArray(d)) setMessages(d)
    } catch {}
  }

  async function sendMessage() {
    if (!text.trim() || !selectedChat) return
    const currentText = text
    setText('')
    setSending(true)
    try {
      const r = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ chatId: selectedChat.id, text: currentText })
      })
      if (r.ok) {
        await loadMessages(selectedChat.id)
      } else {
        setText(currentText)
      }
    } catch {
      setText(currentText)
    }
    setSending(false)
    // Refocus the input after sending so user doesn't have to Shift+Tab
    setTimeout(() => {
      inputRef.current?.focus()
    }, 10)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault() // Prevent new line when sending
      sendMessage()
    }
  }

  return (
    <div className="chat-container fade-in">
      {/* CHAT LIST PANEL */}
      <div className="glass-panel chat-list">
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-glass)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Direct Messages</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Recent Telegram Conversations</div>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {loading && chats.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Syncing with Telegram...</div>}
          {chats.map(c => (
            <div key={c.id} onClick={() => setSelectedChat(c)}
              className={`chat-item ${selectedChat?.id === c.id ? 'active' : ''}`}>
              <div className="avatar-circle" style={{ borderColor: selectedChat?.id === c.id ? 'var(--accent)' : 'var(--border-glass)' }}>
                {c.name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: selectedChat?.id === c.id ? 'var(--text-main)' : 'var(--text-dim)' }}>{c.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.6 }}>Now</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.7 }}>{c.lastMsg || 'Tap to chat'}</div>
              </div>
              {c.unread > 0 && <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', boxShadow: '0 0 10px var(--accent)' }}></div>}
            </div>
          ))}
        </div>
      </div>

      {/* CHAT WINDOW PANEL */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {selectedChat ? (
          <>
            <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', gap: 16, background: 'rgba(255,255,255,0.01)' }}>
              <div className="avatar-circle" style={{ width: 42, height: 42, background: 'var(--bg-glass-active)', fontSize: 15 }}>{selectedChat.name[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{selectedChat.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }}></div>
                  <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700, letterSpacing: '0.05em' }}>LIVE CONNECTION</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                 <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: 0.5 }}>📞</button>
                 <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: 0.5 }}>ℹ️</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {messages.length === 0 && !loading && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginTop: 40 }}>Start the conversation with @{selectedChat.name}</div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`msg-bubble ${m.fromMe ? 'msg-me' : 'msg-them'}`}>
                  {m.text}
                  <div style={{ fontSize: 9, opacity: 0.6, marginTop: 6, textAlign: m.fromMe ? 'right' : 'left', fontWeight: 600 }}>
                    {new Date(m.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>

            <div style={{ padding: '24px 32px' }}>
              <div className="chat-input-area" style={{ alignItems: 'flex-end', borderRadius: 20 }}>
                <span style={{ fontSize: 20, opacity: 0.4, cursor: 'pointer', paddingBottom: 10 }}>📎</span>
                <textarea 
                  ref={inputRef}
                  value={text} 
                  onChange={e => setText(e.target.value)} 
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... (Shift + Enter for new line)" 
                  style={{ 
                    flex: 1, 
                    background: 'transparent', 
                    border: 'none', 
                    padding: '12px 14px', 
                    fontSize: 14, 
                    resize: 'none', 
                    height: 44, 
                    maxHeight: 120, 
                    fontFamily: 'inherit',
                    color: 'white'
                  }} 
                />
                <button onClick={sendMessage} disabled={sending || !text.trim()} className="btn-send" style={{ marginBottom: 0 }}>
                  <span style={{ fontSize: 18 }}>{sending ? '⏳' : '🚀'}</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: 0.4 }}>
            <div style={{ fontSize: 48 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Pick a conversation to start selling</div>
          </div>
        )}
      </div>
    </div>
  )
}

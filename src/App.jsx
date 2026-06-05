import { useState } from 'react'

const LEADS_INIT = [
  { id: 1, name: "Shardeum", website: "https://shardeum.org", sources: "Ethereum Community Events", tg: "https://t.me/richarpalani", research: "Layer 1 blockchain tương thích EVM, dynamic state sharding, phí thấp và ổn định.", note: "Quan tâm post bài nhưng chưa có budget", status: "no_budget", last_contacted: "2025-06-04" },
  { id: 2, name: "Cryptum", website: "https://cryptum.co.in", sources: "JANIBASE WEB3 HUB", tg: "https://t.me/Cryptum123", research: "Agency marketing, PR và tăng trưởng cộng đồng cho dự án crypto/Web3.", note: "Đang bước đầu discuss giới thiệu dịch vụ CMC", status: "waiting", last_contacted: "2025-06-04" },
  { id: 3, name: "FundOutreach", website: "https://fundoutreach.com", sources: "The Best Event with Tobi", tg: "https://t.me/alicealieva", research: "Nền tảng kết nối startup với nhà đầu tư VC qua outreach và networking.", note: "Đã trao đổi về hợp tác lead generation", status: "follow_up_needed", last_contacted: "2025-06-03" },
  { id: 4, name: "PayLink Capital", website: "https://paylinkcapital.com", sources: "Web3angels", tg: "https://t.me/GRAMNODEVAUL7", research: "Công ty đầu tư tập trung vào startup công nghệ, fintech và các công ty tiềm năng.", note: "Đang trong giai đoạn khám phá ban đầu", status: "interested", last_contacted: "2025-06-05" },
]

const STATUS = {
  new:              { label: "New",        color: "#6B7280", bg: "#F3F4F6" },
  interested:       { label: "Interested", color: "#059669", bg: "#D1FAE5" },
  waiting:          { label: "Waiting",    color: "#D97706", bg: "#FEF3C7" },
  no_budget:        { label: "No Budget",  color: "#DC2626", bg: "#FEE2E2" },
  follow_up_needed: { label: "Follow Up",  color: "#7C3AED", bg: "#EDE9FE" },
  closed_won:       { label: "Won",        color: "#065F46", bg: "#A7F3D0" },
  closed_lost:      { label: "Lost",       color: "#991B1B", bg: "#FECACA" },
}

const TABS = ["Dashboard", "Leads", "Daily Report", "Weekly Report"]

const BTN = {
  primary: { background: "#111", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  secondary: { background: "#fff", color: "#374151", border: "1px solid #D1D5DB", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  ghost: { background: "transparent", color: "#6B7280", border: "none", padding: "6px 14px", borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: "pointer" },
}

function Badge({ status }) {
  const s = STATUS[status] || STATUS.new
  return <span style={{ background: s.bg, color: s.color, padding: "2px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{s.label}</span>
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "18px 20px", flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || "#111" }}>{value}</div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState("Dashboard")
  const [leads, setLeads] = useState(LEADS_INIT)
  const [dailyNotes, setDailyNotes] = useState("")
  const [dailyReport, setDailyReport] = useState("")
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [filterStatus, setFilterStatus] = useState("all")
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_ANTHROPIC_KEY || "")
  const [showApiInput, setShowApiInput] = useState(false)
  const [copied, setCopied] = useState(false)
  const [newLead, setNewLead] = useState({ name: "", website: "", sources: "", tg: "", research: "", note: "", status: "new" })

  const counts = Object.fromEntries(Object.keys(STATUS).map(s => [s, leads.filter(l => l.status === s).length]))
  const followUps = leads.filter(l => l.status === "follow_up_needed" || l.status === "waiting")
  const filtered = filterStatus === "all" ? leads : leads.filter(l => l.status === filterStatus)

  async function generateDaily() {
    if (!dailyNotes.trim() || !apiKey) return
    setLoading(true); setDailyReport("")
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `Bạn là sales analyst cho Coincu.com. Phân tích notes về leads và tạo daily standup report.
Trả về JSON (không có text khác, không markdown):
{"leads":[{"name":"...","status":"interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost","summary":"1 câu tiếng Việt","next_action":"..."}],"other_tasks":["task đã làm"],"plan_today":["việc cần làm"]}`,
          messages: [{ role: "user", content: dailyNotes }]
        })
      })
      const data = await res.json()
      const text = data.content[0].text.replace(/```json|```/g, "").trim()
      const p = JSON.parse(text)
      const E = { interested: "🟢", waiting: "🟡", no_budget: "🔴", follow_up_needed: "🔁", closed_won: "✅", closed_lost: "❌" }
      const date = new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      let r = `📋 STANDUP NOTE — ${date}\n${"═".repeat(48)}\n\n`
      r += `1. What did you accomplish yesterday?\n\n   Reach out các leads:\n`
      p.leads.forEach(l => { r += `   ${E[l.status] || "⚪"} ${l.name}: ${l.summary}\n` })
      if (p.other_tasks?.length) { r += `\n   Việc khác:\n`; p.other_tasks.forEach(t => r += `   • ${t}\n`) }
      r += `\n2. What are you planning to do today?\n\n`
      p.plan_today.forEach(t => { r += `   - ${t}\n` })
      const fu = p.leads.filter(l => l.status === "follow_up_needed" || l.status === "waiting")
      if (fu.length) { r += `\n3. Follow up cần làm:\n\n`; fu.forEach(l => r += `   🔁 ${l.name} → ${l.next_action}\n`) }
      setDailyReport(r)
    } catch (e) { setDailyReport("❌ Lỗi: " + e.message) }
    setLoading(false)
  }

  function addLead() {
    if (!newLead.name.trim()) return
    setLeads([...leads, { ...newLead, id: Date.now(), last_contacted: new Date().toISOString().slice(0, 10) }])
    setNewLead({ name: "", website: "", sources: "", tg: "", research: "", note: "", status: "new" })
    setShowAdd(false)
  }

  function copyReport() {
    navigator.clipboard.writeText(dailyReport)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const inp = { width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, background: "#F9FAFB" }

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB" }}>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 28px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 58 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, background: "#111", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16 }}>⚡</div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Coincu Sales</span>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ ...BTN.ghost, background: tab === t ? "#111" : "transparent", color: tab === t ? "#fff" : "#6B7280" }}>{t}</button>
            ))}
          </div>
          <button onClick={() => setShowApiInput(!showApiInput)} style={{ ...BTN.secondary, fontSize: 12, padding: "6px 12px" }}>
            {apiKey ? "🔑 Key Set ✓" : "🔑 Set API Key"}
          </button>
        </div>
        {showApiInput && (
          <div style={{ paddingBottom: 10, display: "flex", gap: 8 }}>
            <input type="password" placeholder="sk-ant-api03-..." defaultValue={apiKey} id="keyInput" style={{ ...inp, maxWidth: 380 }} />
            <button onClick={() => { setApiKey(document.getElementById("keyInput").value); setShowApiInput(false) }} style={BTN.primary}>Save</button>
            <button onClick={() => setShowApiInput(false)} style={BTN.secondary}>Cancel</button>
          </div>
        )}
      </div>

      <div style={{ padding: "28px", maxWidth: 1080, margin: "0 auto" }}>

        {/* DASHBOARD */}
        {tab === "Dashboard" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Dashboard</h2>
              <span style={{ fontSize: 13, color: "#6B7280" }}>{new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              <StatCard label="Total Leads" value={leads.length} />
              <StatCard label="Interested" value={counts.interested || 0} color="#059669" />
              <StatCard label="Waiting" value={counts.waiting || 0} color="#D97706" />
              <StatCard label="No Budget" value={counts.no_budget || 0} color="#DC2626" />
              <StatCard label="Follow Up" value={counts.follow_up_needed || 0} color="#7C3AED" />
              <StatCard label="Won" value={counts.closed_won || 0} color="#065F46" />
            </div>

            {followUps.length > 0 && (
              <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 12, padding: 18, marginBottom: 22 }}>
                <div style={{ fontWeight: 600, color: "#92400E", marginBottom: 10, fontSize: 14 }}>🔁 Follow up hôm nay ({followUps.length})</div>
                {followUps.map(l => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #FED7AA" }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</span>
                      <span style={{ color: "#6B7280", fontSize: 12, marginLeft: 10 }}>{l.note}</span>
                    </div>
                    <Badge status={l.status} />
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #E5E7EB", fontWeight: 600, fontSize: 14 }}>All Leads</div>
              {leads.map(l => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 18px", borderBottom: "1px solid #F3F4F6" }}>
                  <div style={{ width: 34, height: 34, background: "#F3F4F6", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#374151", fontSize: 13, flexShrink: 0 }}>{l.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                    <div style={{ fontSize: 12, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.note}</div>
                  </div>
                  <Badge status={l.status} />
                  <div style={{ fontSize: 12, color: "#9CA3AF", flexShrink: 0 }}>{l.last_contacted}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEADS */}
        {tab === "Leads" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Leads ({filtered.length})</h2>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: "auto" }}>
                  <option value="all">All Status</option>
                  {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <button onClick={() => setShowAdd(!showAdd)} style={BTN.primary}>+ Add Lead</button>
              </div>
            </div>

            {showAdd && (
              <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 18, marginBottom: 18 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>New Lead</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[["name", "Tên dự án *"], ["website", "Website"], ["sources", "Nguồn (TG group, event...)"], ["tg", "Telegram link"], ["note", "Ghi chú outreach"]].map(([k, p]) => (
                    <input key={k} placeholder={p} value={newLead[k]} onChange={e => setNewLead({ ...newLead, [k]: e.target.value })} style={inp} />
                  ))}
                  <select value={newLead.status} onChange={e => setNewLead({ ...newLead, status: e.target.value })} style={inp}>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <textarea placeholder="Research — mô tả ngắn về dự án" value={newLead.research} onChange={e => setNewLead({ ...newLead, research: e.target.value })} style={{ ...inp, marginTop: 10, height: 76, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={addLead} style={BTN.primary}>Add Lead</button>
                  <button onClick={() => setShowAdd(false)} style={BTN.secondary}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(l => (
                <div key={l.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{l.name}</span>
                        <Badge status={l.status} />
                      </div>
                      <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 7, lineHeight: 1.5 }}>{l.research}</div>
                      <div style={{ fontSize: 12, color: "#374151", background: "#F9FAFB", padding: "5px 10px", borderRadius: 6, display: "inline-block" }}>📝 {l.note}</div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, color: "#9CA3AF", flexShrink: 0, lineHeight: 2 }}>
                      {l.website && <div><a href={l.website} target="_blank" rel="noreferrer" style={{ color: "#6366F1" }}>🌐 Website</a></div>}
                      {l.tg && <div><a href={l.tg} target="_blank" rel="noreferrer" style={{ color: "#6366F1" }}>✈️ Telegram</a></div>}
                      <div>{l.sources}</div>
                      <div>Last: {l.last_contacted}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DAILY REPORT */}
        {tab === "Daily Report" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Daily Standup Report</h2>
            <p style={{ color: "#6B7280", marginBottom: 22, fontSize: 13 }}>Nhập notes về leads hôm qua → AI tự format thành standup chuẩn</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>Notes hôm qua</label>
                <textarea value={dailyNotes} onChange={e => setDailyNotes(e.target.value)}
                  placeholder={"Ví dụ:\n- lunarpr quan tâm nhưng chưa có budget\n- BC.Game đã reply, đang đợi discuss\n- Stake bận world cup tuần sau getback\n- Hoàn thành weekly report\n\nHôm nay cần: reach out leads mới, collect email"}
                  style={{ ...inp, height: 200, resize: "vertical", lineHeight: 1.6 }} />
                <button onClick={generateDaily} disabled={loading || !dailyNotes.trim() || !apiKey}
                  style={{ ...BTN.primary, marginTop: 10, width: "100%", opacity: loading || !dailyNotes.trim() || !apiKey ? 0.5 : 1 }}>
                  {loading ? "⏳ Đang generate..." : "⚡ Generate Report"}
                </button>
                {!apiKey && <p style={{ fontSize: 12, color: "#DC2626", marginTop: 7 }}>⚠️ Set API Key ở góc trên phải trước</p>}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Output</label>
                  {dailyReport && (
                    <button onClick={copyReport} style={{ ...BTN.secondary, fontSize: 12, padding: "4px 12px" }}>
                      {copied ? "✅ Copied!" : "📋 Copy"}
                    </button>
                  )}
                </div>
                <div style={{ background: dailyReport ? "#F8FAFC" : "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 8, padding: 14, minHeight: 200, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", color: dailyReport ? "#111" : "#9CA3AF", lineHeight: 1.7 }}>
                  {dailyReport || "Report sẽ hiện ra ở đây sau khi generate..."}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* WEEKLY REPORT */}
        {tab === "Weekly Report" && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Weekly Lead Report</h2>
            <p style={{ color: "#6B7280", marginBottom: 22, fontSize: 13 }}>Preview toàn bộ leads tuần này</p>
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "auto", marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "40px 150px 1fr 120px 120px", background: "#F9FAFB", borderBottom: "2px solid #E5E7EB", fontWeight: 600, fontSize: 12, color: "#374151", minWidth: 700 }}>
                {["#", "Name", "Research / Note", "Status", "Last Contact"].map(h => (
                  <div key={h} style={{ padding: "11px 14px", borderRight: "1px solid #E5E7EB" }}>{h}</div>
                ))}
              </div>
              {leads.map((l, i) => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "40px 150px 1fr 120px 120px", borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA", minWidth: 700 }}>
                  <div style={{ padding: "11px 14px", color: "#9CA3AF", fontSize: 12, borderRight: "1px solid #F3F4F6" }}>{i + 1}</div>
                  <div style={{ padding: "11px 14px", borderRight: "1px solid #F3F4F6" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{l.sources}</div>
                  </div>
                  <div style={{ padding: "11px 14px", borderRight: "1px solid #F3F4F6" }}>
                    <div style={{ fontSize: 12, color: "#374151", marginBottom: 4, lineHeight: 1.4 }}>{l.research}</div>
                    <div style={{ fontSize: 11, color: "#6B7280", background: "#F3F4F6", padding: "2px 7px", borderRadius: 4, display: "inline-block" }}>{l.note}</div>
                  </div>
                  <div style={{ padding: "11px 14px", borderRight: "1px solid #F3F4F6", display: "flex", alignItems: "center" }}><Badge status={l.status} /></div>
                  <div style={{ padding: "11px 14px", fontSize: 12, color: "#6B7280", display: "flex", alignItems: "center" }}>{l.last_contacted}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button style={BTN.primary}>📊 Export Excel</button>
              <span style={{ fontSize: 12, color: "#6B7280" }}>
                {leads.length} leads • {Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => `${STATUS[k].label}: ${v}`).join(" • ")}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

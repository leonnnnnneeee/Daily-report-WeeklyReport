const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `Bạn là sales analyst cho Coincu.com — công ty crypto PR & media.
Phân tích tin nhắn và xác định trạng thái lead.
Trả về JSON (không có text khác):
{"status":"interested|waiting|no_budget|follow_up_needed|closed_won|closed_lost|no_change","summary":"1 câu tiếng Việt","next_action":"việc cần làm","confidence":"high|medium|low"}

- interested: lead hỏi về giá/dịch vụ, muốn biết thêm
- waiting: đã gửi info, chờ reply
- no_budget: chưa có budget, postpone
- follow_up_needed: chưa reply, cần nhắc lại
- closed_won: confirm deal
- closed_lost: từ chối rõ ràng
- no_change: không đủ thông tin`;

async function analyzeMessages(leadName, messages, currentStatus, source) {
  if (!messages?.length) return { status: 'no_change', summary: 'Không có tin nhắn mới', next_action: '', confidence: 'low' };
  const text = messages.map(m => `[${m.date}] ${m.fromMe ? 'TÔI' : leadName}: ${m.text || m.snippet}`).join('\n');
  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 300, system: SYSTEM,
      messages: [{ role: 'user', content: `Lead: ${leadName}\nSource: ${source}\nStatus hiện tại: ${currentStatus}\n\n${text}` }]
    });
    return JSON.parse(res.content[0].text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('[AI] error:', e.message);
    return { status: 'no_change', summary: 'Lỗi phân tích', next_action: '', confidence: 'low' };
  }
}

module.exports = { analyzeMessages };

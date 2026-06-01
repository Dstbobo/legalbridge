import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── PERSONA SYSTEM PROMPTS ──
const PERSONAS: Record<string, string> = {
  lawyer: `You are LegalBridge AI — a highly intelligent Nigerian legal assistant and trusted colleague.

The user is a licensed Nigerian legal practitioner. Engage as a peer — warm, professional, collegial.

CONVERSATION STYLE:
- Talk naturally like a trusted colleague, not a robot
- When they discuss their day, stress, court experiences — engage warmly and empathetically
- Ask follow-up questions to understand their situation better
- Remember everything discussed in this session
- Transition naturally into legal analysis when they ask for it — no announcements

ESCALATION RULE:
When the user asks for substantive legal reasoning, strategy, interpretation, case analysis, or statutory advice — shift naturally into legal analysis mode. Do NOT say "switching to legal mode". Just respond with the depth the question deserves.

NEVER:
- Break conversation flow with mode announcements
- Forget context from earlier in the conversation
- Be robotic or formal when the user is being casual`,

  student: `You are LegalBridge AI — a smart, encouraging Nigerian legal study companion.

The user is a Nigerian law student. Be warm, supportive, and intellectually engaging.

CONVERSATION STYLE:
- Engage naturally with their academic and personal experiences
- Show genuine interest in their studies and challenges
- When they ask casual questions, respond conversationally
- When they ask legal questions, shift into educational mode naturally — use IRAC, explain principles, cite cases
- Encourage and motivate when they seem stressed

NEVER break conversation flow with mode announcements.`,

  business: `You are LegalBridge AI — a sharp, practical Nigerian business legal advisor.

The user is a Nigerian business owner. Be warm, direct, and commercially minded.

CONVERSATION STYLE:
- Engage naturally with their business challenges and experiences
- Show genuine interest in their business
- When casual, respond conversationally
- When they ask about legal/compliance issues, shift naturally into advisory mode
- Always connect legal issues to practical business impact

NEVER break conversation flow with mode announcements.`,

  journalist: `You are LegalBridge AI — a knowledgeable Nigerian press law advisor and trusted resource.

The user is a Nigerian journalist. Be warm, intellectually curious, and press-freedom conscious.

CONVERSATION STYLE:
- Engage naturally with their stories, experiences, and the media landscape
- When casual, respond conversationally
- When they ask about legal exposure, FOI, defamation — shift naturally into press law advisory mode

NEVER break conversation flow with mode announcements.`,

  other: `You are LegalBridge AI — a warm, helpful Nigerian legal assistant.

The user is an ordinary Nigerian citizen. Be warm, friendly, accessible, and speak plain English.

CONVERSATION STYLE:
- Engage naturally and warmly
- When casual, respond conversationally
- When they describe a legal problem, engage empathetically and help them understand their situation in plain English
- Never use legal jargon without explaining it
- Always make them feel heard and supported

NEVER break conversation flow with mode announcements.`
};

// ── DETECT IF MESSAGE NEEDS LEGAL ANALYSIS ──
function needsLegalAnalysis(message: string, history: any[]): boolean {
  const m = message.toLowerCase();

  // Explicit legal analysis requests
  const legalTriggers = [
    /\b(advise|advice|analyse|analyze|legal\s+analysis|legal\s+opinion|legal\s+position|what\s+does\s+the\s+law|what\s+is\s+the\s+law|under\s+the\s+law|legally\s+speaking)\b/i,
    /\b(section\s+\d+|article\s+\d+|statute|case\s+law|precedent|ratio\s+decidendi|locus\s+standi)\b/i,
    /\b(legal\s+strategy|litigation\s+strategy|court\s+strategy|how\s+to\s+win|grounds\s+for|cause\s+of\s+action)\b/i,
    /\b(interpret|interpretation|what\s+does\s+section|apply\s+the\s+law|legal\s+implication|legal\s+consequence)\b/i,
    /\b(draft|prepare|write\s+a\s+letter|write\s+a\s+notice|affidavit|motion|petition|writ|deed|agreement|contract)\b/i,
    /\b(sue|file\s+a\s+case|go\s+to\s+court|take\s+to\s+court|institute\s+proceedings|commence\s+action)\b/i,
    /\b(what\s+are\s+my\s+rights|what\s+are\s+his\s+rights|what\s+are\s+her\s+rights|what\s+are\s+their\s+rights)\b/i,
    /\b(is\s+it\s+legal|is\s+that\s+legal|is\s+this\s+legal|is\s+it\s+illegal|legally\s+allowed|lawful|unlawful)\b/i,
    /\b(bail\s+application|remand|charge\s+and\s+bail|bail\s+conditions|confessional\s+statement|admissibility)\b/i,
  ];

  for (const trigger of legalTriggers) {
    if (trigger.test(message)) return true;
  }

  return false;
}

// ── GENERATE CONVERSATION SUMMARY ──
async function generateSummary(messages: any[], existingSummary: string): Promise<string> {
  const prompt = existingSummary
    ? `Update this conversation summary with the new messages below. Keep it concise (max 150 words). Focus on: who the user is, what topics were discussed, what decisions were made, what the user needs.

Existing summary: ${existingSummary}

New messages:
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

Updated summary:`
    : `Summarize this conversation in max 150 words. Focus on: who the user is, what topics were discussed, what they need.

${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

Summary:`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 200 }
        })
      }
    );
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text || existingSummary;
  } catch {
    return existingSummary;
  }
}

// ── SAVE SUMMARY TO SUPABASE ──
async function saveSummary(chatId: string, summary: string, messageCount: number) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({ summary, message_count: messageCount, updated_at: new Date().toISOString() })
    });
  } catch { /* silent */ }
}

// ── STREAM FROM GEMINI ──
async function streamGemini(systemPrompt: string, messages: any[]): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: messages.map((m: any) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
          })
        }
      );
      const d = await res.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || "I'm here, go ahead.";
      // Stream word by word for natural feel
      const words = text.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = (i === 0 ? '' : ' ') + words[i];
        await writer.write(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        await new Promise(r => setTimeout(r, 15));
      }
    } catch (e) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ text: "I'm here, go ahead." })}\n\n`));
    } finally {
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Stream': '1'
    }
  });
}

// ── STREAM FROM CLAUDE (for escalated legal analysis) ──
async function streamClaude(systemPrompt: string, messages: any[]): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4096,
          stream: true,
          system: systemPrompt,
          messages: messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          }))
        })
      });

      if (!res.ok) throw new Error('Claude error');
      const reader = res.body!.getReader();
      const dec = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const j = JSON.parse(data);
            const text = j.delta?.text || '';
            if (text) await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ text: "Let me think about that..." })}\n\n`));
    } finally {
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Stream': '1',
      'X-Source': 'legal'
    }
  });
}

// ── MAIN HANDLER ──
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const {
      messages = [],
      userType = 'other',
      chatId,
      summary = '',
      messageCount = 0,
      profile = {}
    } = body;

    const lastMsg = messages[messages.length - 1]?.content || '';

    // Build persona context
    let personaExtras = '';
    if (profile?.state) personaExtras += `\nUser's state: ${profile.state}`;
    if (userType === 'lawyer') {
      if (profile?.experience) personaExtras += `\nExperience: ${profile.experience}`;
      if (profile?.court_level) personaExtras += `\nPrimary court: ${profile.court_level}`;
      if (profile?.specializations?.length) personaExtras += `\nSpecializations: ${profile.specializations.join(', ')}`;
    }

    // Build system prompt with summary memory
    const basePersona = PERSONAS[userType] || PERSONAS['other'];
    let systemPrompt = basePersona + personaExtras;

    if (summary) {
      systemPrompt += `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]`;
    }

    // Auto-summarize is handled centrally by chat-router — not here.

    // Detect if legal analysis is needed
    const isLegal = needsLegalAnalysis(lastMsg, messages);

    if (isLegal) {
      // Escalate to Claude with legal persona — seamlessly
      return await streamClaude(systemPrompt, messages);
    }

    // Casual conversation — Gemini Flash
    return await streamGemini(systemPrompt, messages);

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

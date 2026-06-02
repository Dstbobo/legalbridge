// ════════════════════════════════════════════════════════════════════
// SUPABASE FUNCTION: chat-stream  (FAST CONVERSATION HUB)
//
// Consolidates: chat-conversational + chat-router + chat-status
//
// One endpoint, three modes:
//   mode = 'status'        → quick one-line status (JSON, no streaming)
//   mode = 'message' (def) → full conversational SSE stream
//                            • detects intent (router behaviour)
//                            • for documents → proxies chat-documents
//                            • for tools     → proxies chat-tools
//                            • else          → streams Claude Sonnet inline
//                              with role-based persona
//
// Single model rule: Claude Sonnet only. No tier splitting.
// JWT verification: ON  (frontend forwards the user's session JWT)
// ════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const MODEL = 'claude-sonnet-4-5';

// Internal hub URLs — chat-stream proxies to these for heavy work
const FN_DOCUMENTS = `https://api.legalbridge.ng/v1/documents`;
const FN_TOOLS     = `${SUPABASE_URL}/functions/v1/chat-tools`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Stream, X-Intent, Content-Type",
};

// ════════════════════════════════════════════════════════════════════
// IDENTITY + ROLE PERSONAS (preserved exactly from chat-conversational)
// ════════════════════════════════════════════════════════════════════
const IDENTITY = `
CRITICAL IDENTITY RULES — NEVER VIOLATE:
- You are LegalBridge AI, built by DST Global Innovative Nigeria Ltd, a Nigerian technology company based in Akwanga, Nasarawa State, founded by Daniel Thankgod.
- You are powered by advanced AI technology specifically trained on Nigerian law.
- NEVER mention Google, Gemini, Claude, Anthropic, OpenAI, or any underlying AI technology to users.
- NEVER say you were built by Google, Anthropic, or any other company.
- If asked who built you, say: "I am LegalBridge AI, built by DST Global Innovative Nigeria Ltd, a Nigerian technology company based in Akwanga, Nasarawa State, founded by Daniel Thankgod."
- NEVER mention any knowledge cutoff date. Always speak as if you have current Nigerian legal knowledge. If you genuinely don't know something recent, say "I'm not certain — please verify with a current source" without mentioning a cutoff.
- NEVER add casual sign-offs to formal documents. Documents must end professionally with the signature/jurat block only.
- If asked what AI you use, say: "I use proprietary AI technology specifically designed for Nigerian legal practice."
`;

const PERSONAS: Record<string, string> = {
  lawyer: IDENTITY + `You are LegalBridge AI — a highly intelligent Nigerian legal assistant and trusted colleague.

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

  student: IDENTITY + `You are LegalBridge AI — a smart, encouraging Nigerian legal study companion.

The user is a Nigerian law student. Be warm, supportive, and intellectually engaging.

CONVERSATION STYLE:
- Engage naturally with their academic and personal experiences
- Show genuine interest in their studies and challenges
- When they ask casual questions, respond conversationally
- When they ask legal questions, shift into educational mode naturally — use IRAC, explain principles, cite cases
- Encourage and motivate when they seem stressed

NEVER break conversation flow with mode announcements.`,

  business: IDENTITY + `You are LegalBridge AI — a sharp, practical Nigerian business legal advisor.

The user is a Nigerian business owner. Be warm, direct, and commercially minded.

CONVERSATION STYLE:
- Engage naturally with their business challenges and experiences
- Show genuine interest in their business
- When casual, respond conversationally
- When they ask about legal/compliance issues, shift naturally into advisory mode
- Always connect legal issues to practical business impact

NEVER break conversation flow with mode announcements.`,

  journalist: IDENTITY + `You are LegalBridge AI — a knowledgeable Nigerian press law advisor and trusted resource.

The user is a Nigerian journalist. Be warm, intellectually curious, and press-freedom conscious.

CONVERSATION STYLE:
- Engage naturally with their stories, experiences, and the media landscape
- When casual, respond conversationally
- When they ask about legal exposure, FOI, defamation — shift naturally into press law advisory mode

NEVER break conversation flow with mode announcements.`,

  individual: IDENTITY + `You are LegalBridge AI — a warm, helpful Nigerian legal assistant.

The user is an ordinary Nigerian citizen. Be warm, friendly, accessible, and speak plain English.

CONVERSATION STYLE:
- Engage naturally and warmly
- When casual, respond conversationally
- When they describe a legal problem, engage empathetically and help them understand their situation in plain English
- Never use legal jargon without explaining it
- Always make them feel heard and supported

NEVER break conversation flow with mode announcements.`,

  other: IDENTITY + `You are LegalBridge AI — a warm, helpful Nigerian legal assistant.

The user is an ordinary Nigerian citizen. Be warm, friendly, accessible, and speak plain English.

CONVERSATION STYLE:
- Engage naturally and warmly
- When casual, respond conversationally
- When they describe a legal problem, engage empathetically and help them understand their situation in plain English
- Never use legal jargon without explaining it
- Always make them feel heard and supported

NEVER break conversation flow with mode announcements.`,
};

// ════════════════════════════════════════════════════════════════════
// INTENT DETECTION (preserved exactly from chat-router)
// ════════════════════════════════════════════════════════════════════
function detectIntent(message: string, hasImages: boolean, history: any[] = []): string {
  if (hasImages) {
    if (/\b(evidence|exhibit|admissib|court|chain of custody|forgery|authentic|fingerprint|forensic|prove|proof)\b/i.test(message)) {
      return 'evidence';
    }
    return 'vision';
  }

  const m = message.toLowerCase().trim();

  // Context-aware document continuation
  const lastAssistant = [...history].reverse().find((h: any) => h.role === 'assistant');
  if (lastAssistant) {
    const a = (lastAssistant.content || '').slice(0, 1200);
    const askedForDetails =
      /NEED_DETAILS\s*:/i.test(a) ||
      (/\bI can draft\b.*\b(please provide|need .* details)/is.test(a)) ||
      (/^\s*\d+\.\s+/m.test(a) && /\b(landlord|tenant|deponent|petitioner|respondent|address|amount|rent|name|full name|date|signature)\b/i.test(a));
    if (askedForDetails && m.length > 5) return 'documents';
  }

  // Document drafting (checked FIRST, very permissive)
  const draftVerbs = /\b(draft|prepare|write|generate|create|produce|make|compose|do up|file|fill|build|put together|help me (draft|prepare|write|generate|create|file|produce|make|put together)|can you (draft|prepare|write|generate|create|produce|make)|could you (draft|prepare|write|generate|create|produce|make)|please (draft|prepare|write|generate|create|produce|make)|i need (a|an|to file)|i want (a|an|to file)|i'?d like (a|an)|need help (drafting|preparing|writing|with))\b/i;
  const docNouns = /\b(affidavit|agreement|contract|deed|petition|motion|writ|notice|memo(randum)?|letter|tenancy|lease|employment|offer\s+letter|divorce|petition\s+for\s+dissolution|power\s+of\s+attorney|MOU|NDA|non.?disclosure|consultancy|partnership|shareholders?|service\s+agreement|will|codicil|undertaking|guarantee|indemnity|loan\s+agreement|promissory\s+note|policy|terms\s+of\s+(use|service)|privacy\s+policy|cease\s+and\s+desist|demand\s+letter|FOI(\s+request)?|freedom\s+of\s+information|quit\s+notice|application|resolution|complaint|cover\s+letter|termination|warning|press\s+accreditation|response\s+letter|petition\s+letter|letter\s+of\s+demand|engagement\s+letter|bail\s+application|statement\s+of\s+claim|statement\s+of\s+defen[cs]e|originating\s+summons|trademark\s+assignment|brief|deposition|charge\s+sheet)\b/i;
  if (draftVerbs.test(m) && docNouns.test(m)) return 'documents';
  if (
    /\b(FOI\s+request\s+to|application\s+for\s+bail|notice\s+to\s+quit\b|letter\s+of\s+demand\b)\b/i.test(m) ||
    (/\b(agreement|contract|deed)\b\s+(?:between|for|with)\s+[A-Z]/i.test(message))
  ) return 'documents';

  // Live search (only when asking ABOUT recent things, not drafting)
  if (/\b(latest|recent|current|today|new law|new act|just passed|2024|2025|2026|amendment|breaking|news|update|gazette|just enacted|recently signed)\b/i.test(m)) {
    return 'search';
  }

  // Evidence analysis
  if (/\b(evidence|admissib|hearsay|confessional|chain of custody|exhibit|forensic|forgery|authentication|evidential weight|trial.?within.?trial|burden of proof|standard of proof|electronic evidence|computer certificate)\b/i.test(m)) {
    return 'evidence';
  }

  // Legal analysis (substantive legal questions)
  if (
    /\b(advise|advice|analyse|analyze|legal opinion|legal analysis|legal position|what does the law|what is the law|under the law|legally speaking|legal implication|legal consequence)\b/i.test(m) ||
    /\b(section \d+|article \d+|statute|case law|precedent|ratio decidendi|locus standi|nwlr|lpelr)\b/i.test(m) ||
    /\b(legal strategy|litigation strategy|court strategy|how to win|grounds for|cause of action)\b/i.test(m) ||
    /\b(sue|file a case|go to court|take to court|institute proceedings|commence action|fundamental rights)\b/i.test(m) ||
    /\b(is it legal|is that legal|is this legal|is it illegal|legally allowed|lawful|unlawful|criminal liability|civil liability)\b/i.test(m) ||
    /\b(remand|charge and bail|confessional statement|arraignment|plea)\b/i.test(m) ||
    /\b(landlord|tenant|eviction|quit notice|recovery of premises|mesne profit)\b/i.test(m) ||
    /\b(divorce|adultery|custody|matrimonial|nullity|decree|maintenance|spousal)\b/i.test(m) ||
    /\b(employment|wrongful dismissal|unfair termination|nicn|labour court|minimum wage)\b/i.test(m) ||
    /\b(land|property|c of o|certificate of occupancy|governor.?s consent|deed of assignment)\b/i.test(m) ||
    /\b(company|incorporation|cac|cama|director|shareholder|winding up)\b/i.test(m) ||
    (m.length > 60 && /\b(what are my rights|what are his rights|what are her rights|what happens if|what should i do|can he|can she|can they|is he allowed|is she allowed)\b/i.test(m))
  ) {
    return 'legal';
  }

  return 'conversational';
}

// ════════════════════════════════════════════════════════════════════
// USER DATA LOADING (preserved exactly from chat-router)
// ════════════════════════════════════════════════════════════════════
async function loadUserData(userId: string, chatId: string | null) {
  const [profileRes, historyRes, summaryRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }),
    chatId ? fetch(`${SUPABASE_URL}/rest/v1/messages?chat_id=eq.${chatId}&select=role,content&order=created_at.asc&limit=15`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }) : Promise.resolve(null),
    chatId ? fetch(`${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}&select=summary,message_count`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }) : Promise.resolve(null),
  ]);

  const profiles = await profileRes.json();
  const profile  = profiles?.[0] || {};
  const userType = profile.user_type || 'other';

  let history: any[] = [];
  if (historyRes) {
    const msgs = await historyRes.json();
    history = Array.isArray(msgs) ? msgs : [];
  }
  let summary = '';
  let messageCount = 0;
  if (summaryRes) {
    const chats = await summaryRes.json();
    summary = chats?.[0]?.summary || '';
    messageCount = chats?.[0]?.message_count || 0;
  }
  return { profile, userType, history, summary, messageCount };
}

// ════════════════════════════════════════════════════════════════════
// AUTO-SUMMARISE (Claude Sonnet — runs every 10 messages)
// ════════════════════════════════════════════════════════════════════
async function generateAndSaveSummary(chatId: string, messages: any[], existingSummary: string, messageCount: number) {
  if (!chatId || messageCount % 10 !== 0 || messageCount === 0) return;
  try {
    const prompt = existingSummary
      ? `Update this summary with new messages. Max 150 words. Focus on: who the user is, topics discussed, decisions made, what they need.\n\nExisting: ${existingSummary}\n\nNew messages:\n${messages.slice(-10).map((m: any) => `${m.role}: ${m.content}`).join('\n')}\n\nUpdated summary:`
      : `Summarize in max 150 words. Focus on: who the user is, topics discussed, what they need.\n\n${messages.map((m: any) => `${m.role}: ${m.content}`).join('\n')}\n\nSummary:`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 250,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return;
    const d = await res.json();
    const newSummary = (d.content?.[0]?.text || '').trim() || existingSummary;

    await fetch(`${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: newSummary,
        message_count: messageCount,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch { /* silent */ }
}

// ════════════════════════════════════════════════════════════════════
// MODE: status — short one-line "what am I about to do"
// ════════════════════════════════════════════════════════════════════
async function handleStatus(message: string, userType: string): Promise<Response> {
  const roleLabel: Record<string, string> = {
    lawyer: 'lawyer', student: 'law student', business: 'business owner',
    journalist: 'journalist', other: 'an ordinary person', individual: 'an ordinary person',
  };
  const role = roleLabel[userType] || 'a user';

  const prompt = `You are LegalBridge, a Nigerian legal AI assistant. The user (${role}) just sent you a message. Before you answer, you say ONE very short line telling them what you are about to do — like a person briefly saying what they're doing right now.

User's message: "${message.slice(0, 250)}"

Write that one short status line. Rules:
- Maximum 6 words. Usually 2-4 words.
- Present continuous, ending in "..." (e.g. "Drafting...", "Looking into that...").
- Match the message exactly. A greeting gets a greeting. A document request names the document. A legal question says you're checking the law.
- Sound natural and human, never robotic or generic. Do NOT say "Searching database" or "Processing request".
- No emojis. No quotes. Just the line.

Examples:
"It's going fine" -> Responding...
"Draft me a tenancy agreement" -> Drafting your tenancy agreement...
"What is the Land Use Act" -> Looking into that...
"Hello" -> Hello...
"My landlord locked me out" -> Checking your rights as a tenant...
"Thanks so much" -> You're welcome...

Now write ONLY the status line for the user's message:`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 24,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return new Response(JSON.stringify({ status: '' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    const d = await res.json();
    let status = (d.content?.[0]?.text || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
    if (status.length > 60) status = '';
    return new Response(JSON.stringify({ status }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ status: '' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
}

// ════════════════════════════════════════════════════════════════════
// CLAUDE SONNET STREAMING for conversational + legal modes
// ════════════════════════════════════════════════════════════════════
function streamClaude(systemPrompt: string, messages: any[], intent: string): Response {
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: intent === 'legal' ? 4096 : 2048,
          stream: true,
          system: systemPrompt,
          messages: messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error('Claude error: ' + res.status + ' — ' + errText.slice(0, 300));
      }

      const reader = res.body!.getReader();
      const dec    = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
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
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error('chat-stream error:', msg);
      const userFacing = /credit balance|billing|429|rate.limit/i.test(msg)
        ? 'I am temporarily unavailable due to a service issue. The team has been notified — please try again shortly.'
        : "I encountered an error. Please try again.";
      await writer.write(encoder.encode(`data: ${JSON.stringify({ text: userFacing })}\n\n`));
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
      'X-Intent': intent,
    },
  });
}

// ════════════════════════════════════════════════════════════════════
// PROXY a heavy-hub stream back to the client (chat-documents / chat-tools)
// Sets X-Intent on the outer response so the frontend can render the
// right UI (e.g. document card).
// ════════════════════════════════════════════════════════════════════
async function proxyHubStream(targetUrl: string, payload: any, intent: string, incomingAuth: string): Promise<Response> {
  const funcRes = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON,
      'Authorization': incomingAuth,
    },
    body: JSON.stringify(payload),
  });

  if (!funcRes.ok) {
    const err = await funcRes.text();
    return new Response(
      JSON.stringify({ error: `hub ${intent} failed`, detail: err.slice(0, 500) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(funcRes.body, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Stream': '1',
      'X-Intent': intent,
    },
  });
}

// ════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const {
      mode    = 'message',  // 'status' | 'message'
      message = '',
      images  = [],
      chatId  = null,
      // Frontend may pass userType when calling status mode unauthenticated
      // (e.g. parallel calls before chatId exists). For 'message' mode the
      // userType is always loaded from the profile.
      userType: bodyUserType = 'other',
    } = body;

    // ─── AUTH — resolve user from JWT ─────────────────────────────────
    let userId = '';
    try {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      if (token) {
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY },
        });
        const userData = await userRes.json();
        userId = userData?.id || '';
      }
    } catch { /* anonymous user */ }

    // ─── MODE: STATUS (fast, no streaming, no history needed) ─────────
    if (mode === 'status') {
      // For status mode we use the body-supplied userType if no user is
      // authenticated. Authenticated callers get their profile role.
      let resolvedType = bodyUserType;
      if (userId) {
        try {
          const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=user_type`, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          });
          const ps = await profRes.json();
          if (ps?.[0]?.user_type) resolvedType = ps[0].user_type;
        } catch { /* fall back to body */ }
      }
      return await handleStatus(message, resolvedType);
    }

    // ─── MODE: MESSAGE — full conversational pipeline ────────────────
    let profile: any = {};
    let userType = 'other';
    let history: any[] = [];
    let summary = '';
    let messageCount = 0;

    if (userId) {
      const u = await loadUserData(userId, chatId);
      profile      = u.profile;
      userType     = u.userType;
      history      = u.history;
      summary      = u.summary;
      messageCount = u.messageCount;
    }

    const currentMessages = [...history, { role: 'user', content: message }];
    const hasImages = images && images.length > 0;
    const intent    = detectIntent(message, hasImages, history);

    // Fire-and-forget auto-summarise
    if (chatId && messageCount > 0 && messageCount % 10 === 0) {
      generateAndSaveSummary(chatId, currentMessages, summary, messageCount).catch(() => {});
    }

    // Fire-and-forget message_count bump (the frontend's saveTurn owns
    // actual message persistence — we only nudge the count so the
    // summariser threshold stays accurate)
    if (chatId && userId) {
      fetch(`${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message_count: messageCount + 2, updated_at: new Date().toISOString() }),
      }).catch(() => {});
    }

    const incomingAuth = req.headers.get('Authorization') || `Bearer ${SUPABASE_ANON}`;
    const basePayload = {
      messages: currentMessages,
      userType,
      profile,
      summary,
      messageCount: messageCount + 1,
      chatId,
    };

    // ─── DOCUMENT GENERATION → proxy chat-documents ─────────────────
    if (intent === 'documents') {
      return await proxyHubStream(FN_DOCUMENTS, basePayload, 'documents', incomingAuth);
    }

    // ─── HEAVY TOOLS → proxy chat-tools with the tool field ─────────
    if (intent === 'search' || intent === 'vision' || intent === 'evidence') {
      const toolPayload = { ...basePayload, tool: intent };
      if (hasImages) toolPayload['images'] = images;
      return await proxyHubStream(FN_TOOLS, toolPayload, intent, incomingAuth);
    }

    // ─── CONVERSATIONAL / LEGAL → stream Claude Sonnet inline ───────
    let personaExtras = '';
    if (profile?.state) personaExtras += `\nUser's state: ${profile.state}`;
    if (userType === 'lawyer') {
      if (profile?.experience)            personaExtras += `\nExperience: ${profile.experience}`;
      if (profile?.court_level)           personaExtras += `\nPrimary court: ${profile.court_level}`;
      if (profile?.specializations?.length) personaExtras += `\nSpecializations: ${profile.specializations.join(', ')}`;
    }
    const basePersona = PERSONAS[userType] || PERSONAS.other;
    let systemPrompt = basePersona + personaExtras;
    if (summary) systemPrompt += `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]`;

    return streamClaude(systemPrompt, currentMessages, intent);

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

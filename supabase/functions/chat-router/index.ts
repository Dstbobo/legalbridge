import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

// ── FUNCTION URLS (internal Supabase calls) ──
const FUNCTIONS = {
  conversational: `${SUPABASE_URL}/functions/v1/chat-conversational`,
  legal: `${SUPABASE_URL}/functions/v1/chat-legal`,
  documents: `${SUPABASE_URL}/functions/v1/chat-documents`,
  search: `${SUPABASE_URL}/functions/v1/chat-search`,
  vision: `${SUPABASE_URL}/functions/v1/chat-vision`,
  evidence: `${SUPABASE_URL}/functions/v1/chat-evidence`,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "X-Stream, X-Intent, Content-Type",
};

// ══════════════════════════════════════════════════════
// INTENT DETECTION — routes to correct function
// ══════════════════════════════════════════════════════
function detectIntent(message: string, hasImages: boolean, history: any[] = []): string {
  if (hasImages) {
    // Images with evidence keywords → chat-evidence
    if (/\b(evidence|exhibit|admissib|court|chain of custody|forgery|authentic|fingerprint|forensic|prove|proof)\b/i.test(message)) {
      return 'evidence';
    }
    // All other images → chat-vision
    return 'vision';
  }

  const m = message.toLowerCase().trim();

  // ── CONTEXT-AWARE DOCUMENT CONTINUATION ──
  // If the last assistant message asked for document details (NEED_DETAILS
  // marker, or "please provide" + numbered list), and the user is now replying
  // with those details, continue routing to the documents function so the
  // actual draft is produced.
  const lastAssistant = [...history].reverse().find((h: any) => h.role === 'assistant');
  if (lastAssistant) {
    const a = (lastAssistant.content || '').slice(0, 1200);
    const askedForDetails =
      /NEED_DETAILS\s*:/i.test(a) ||
      (/\bI can draft\b.*\b(please provide|need .* details)/is.test(a)) ||
      (/^\s*\d+\.\s+/m.test(a) && /\b(landlord|tenant|deponent|petitioner|respondent|address|amount|rent|name|full name|date|signature)\b/i.test(a));
    if (askedForDetails && m.length > 5) {
      // Treat the user's response as the document details payload
      return 'documents';
    }
  }

  // ── DOCUMENT DRAFTING — checked FIRST and FAR more permissive ──
  // Any combination of a drafting verb / phrase + a document noun routes to chat-documents.
  // This intentionally overrides legal/search routing because the user has explicitly
  // asked for a document to be produced.
  const draftVerbs = /\b(draft|prepare|write|generate|create|produce|make|compose|do up|file|fill|build|put together|help me (draft|prepare|write|generate|create|file|produce|make|put together)|can you (draft|prepare|write|generate|create|produce|make)|could you (draft|prepare|write|generate|create|produce|make)|please (draft|prepare|write|generate|create|produce|make)|i need (a|an|to file)|i want (a|an|to file)|i'?d like (a|an)|need help (drafting|preparing|writing|with))\b/i;
  const docNouns = /\b(affidavit|agreement|contract|deed|petition|motion|writ|notice|memo(randum)?|letter|tenancy|lease|employment|offer\s+letter|divorce|petition\s+for\s+dissolution|power\s+of\s+attorney|MOU|NDA|non.?disclosure|consultancy|partnership|shareholders?|service\s+agreement|will|codicil|undertaking|guarantee|indemnity|loan\s+agreement|promissory\s+note|policy|terms\s+of\s+(use|service)|privacy\s+policy|cease\s+and\s+desist|demand\s+letter|FOI(\s+request)?|freedom\s+of\s+information|quit\s+notice|application|resolution|complaint|cover\s+letter|termination|warning|press\s+accreditation|response\s+letter|petition\s+letter|letter\s+of\s+demand|engagement\s+letter|bail\s+application|statement\s+of\s+claim|statement\s+of\s+defen[cs]e|originating\s+summons|trademark\s+assignment|brief|deposition|charge\s+sheet)\b/i;
  if (draftVerbs.test(m) && docNouns.test(m)) {
    return 'documents';
  }
  // Additional documents check: even WITHOUT a draft verb, certain phrasings clearly
  // signal a drafting request (e.g. "FOI request to NCC about ...", "tenancy agreement
  // between Mr X and Mrs Y").
  if (
    /\b(FOI\s+request\s+to|application\s+for\s+bail|notice\s+to\s+quit\b|letter\s+of\s+demand\b)\b/i.test(m) ||
    (/\b(agreement|contract|deed)\b\s+(?:between|for|with)\s+[A-Z]/i.test(message))
  ) {
    return 'documents';
  }

  // ── LIVE SEARCH (only when user is asking ABOUT recent things, not drafting) ──
  if (/\b(latest|recent|current|today|new law|new act|just passed|2024|2025|2026|amendment|breaking|news|update|gazette|just enacted|recently signed)\b/i.test(m)) {
    return 'search';
  }

  // ── EVIDENCE ANALYSIS ──
  if (/\b(evidence|admissib|hearsay|confessional|chain of custody|exhibit|forensic|forgery|authentication|evidential weight|trial.?within.?trial|burden of proof|standard of proof|electronic evidence|computer certificate)\b/i.test(m)) {
    return 'evidence';
  }

  // ── LEGAL ANALYSIS (substantive legal questions) ──
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

  // ── CONVERSATIONAL (default) ──
  return 'conversational';
}

// ══════════════════════════════════════════════════════
// LOAD USER DATA — profile + history + summary
// (runs in parallel for speed)
// ══════════════════════════════════════════════════════
async function loadUserData(userId: string, chatId: string) {
  const [profileRes, historyRes, summaryRes] = await Promise.all([
    // Load user profile
    fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    }),
    // Load last 15 messages
    chatId ? fetch(`${SUPABASE_URL}/rest/v1/messages?chat_id=eq.${chatId}&select=role,content&order=created_at.asc&limit=15`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    }) : Promise.resolve(null),
    // Load chat summary
    chatId ? fetch(`${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}&select=summary,message_count`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    }) : Promise.resolve(null)
  ]);

  const profiles = await profileRes.json();
  const profile = profiles?.[0] || {};
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

// ══════════════════════════════════════════════════════
// SAVE MESSAGE TO SUPABASE
// ══════════════════════════════════════════════════════
async function saveMessage(chatId: string, role: string, content: string) {
  if (!chatId) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        chat_id: chatId,
        role,
        content,
        created_at: new Date().toISOString()
      })
    });
  } catch { /* silent */ }
}

// ══════════════════════════════════════════════════════
// GENERATE SUMMARY (every 10 messages)
// ══════════════════════════════════════════════════════
async function generateAndSaveSummary(
  chatId: string,
  messages: any[],
  existingSummary: string,
  messageCount: number
) {
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
        model: 'claude-haiku-4-5',
        max_tokens: 250,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return;
    const d = await res.json();
    const newSummary = (d.content?.[0]?.text || '').trim() || existingSummary;

    // Save to Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: newSummary,
        message_count: messageCount,
        updated_at: new Date().toISOString()
      })
    });
  } catch { /* silent */ }
}

// ══════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const {
      message = '', // Current user message (text)
      images = [], // Uploaded images [{mimeType, data}]
      chatId = null, // Current chat session ID
    } = body;

    // ── AUTH — get user from JWT ──
    let userId = '';
    try {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      if (token && token !== '') {
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_KEY }
        });
        const userData = await userRes.json();
        userId = userData?.id || '';
      }
    } catch { /* anonymous user */ }

    // ── LOAD USER DATA IN PARALLEL ──
    let profile: any = {};
    let userType = 'other';
    let history: any[] = [];
    let summary = '';
    let messageCount = 0;

    if (userId) {
      const userData = await loadUserData(userId, chatId);
      profile = userData.profile;
      userType = userData.userType;
      history = userData.history;
      summary = userData.summary;
      messageCount = userData.messageCount;
    }

    // ── ADD CURRENT MESSAGE TO HISTORY ──
    const currentMessages = [
      ...history,
      { role: 'user', content: message }
    ];

    // ── DETECT INTENT ──
    const hasImages = images && images.length > 0;
    const intent = detectIntent(message, hasImages, history);

    // Message persistence is handled by the frontend's saveTurn.
    // Router only updates message_count so auto-summarize thresholds stay accurate.

    // ── AUTO-SUMMARIZE IF NEEDED (async, don't await) ──
    if (chatId && messageCount > 0 && messageCount % 10 === 0) {
      generateAndSaveSummary(chatId, currentMessages, summary, messageCount).catch(() => {});
    }

    // ── BUILD PAYLOAD FOR SPECIALIZED FUNCTION ──
    const payload: any = {
      messages: currentMessages,
      userType,
      profile,
      summary,
      messageCount: messageCount + 1,
      chatId,
    };

    // Add images for vision/evidence
    if (hasImages) payload.images = images;

    // ── CALL SPECIALIZED FUNCTION ──
    const targetUrl = FUNCTIONS[intent as keyof typeof FUNCTIONS];

    // Forward the user's JWT from the original request
    const incomingAuth = req.headers.get('Authorization') || `Bearer ${SUPABASE_ANON}`;
    const funcRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
        'Authorization': incomingAuth
      },
      body: JSON.stringify(payload)
    });

    if (!funcRes.ok) {
      const err = await funcRes.text();
      throw new Error(`Function ${intent} failed: ${err}`);
    }

    // ── UPDATE MESSAGE COUNT (fire-and-forget) ──
    // Frontend's saveTurn owns message persistence; router only tracks count for summarize.
    if (chatId && userId) {
      fetch(`${SUPABASE_URL}/rest/v1/chats?id=eq.${chatId}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_count: messageCount + 2, updated_at: new Date().toISOString() })
      }).catch(() => {});
    }

    // ── STREAM PASSTHROUGH — pipe directly to client ──
    return new Response(funcRes.body, {
      headers: {
        ...CORS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Stream': '1',
        'X-Intent': intent
      }
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
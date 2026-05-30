// SUPABASE FUNCTION: chat-status
// JWT verification: OFF
// Purpose: Ultra-fast lightweight status message generation
// Returns: JSON { status: "emoji + short message" }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { message = '', userType = 'other' } = await req.json();
    const roleLabel: Record<string, string> = {
      lawyer: 'lawyer', student: 'law student', business: 'business owner',
      journalist: 'journalist', other: 'individual', individual: 'individual'
    };
    const role = roleLabel[userType] || 'user';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `You are a status message generator for LegalBridge, a Nigerian legal AI platform.

The user (a ${role}) just sent: "${message.slice(0, 200)}"

Generate ONE short status message (max 8 words) describing what LegalBridge is about to do. Start with a relevant emoji. Be specific — never generic.

Good examples:
- "✍️ Drafting your tenancy agreement..."
- "⚖️ Checking bail requirements..."
- "📚 Searching Evidence Act provisions..."
- "🏛️ Looking up CAC registration steps..."
- "💬 Getting ready to chat..."
- "🔍 Finding landlord eviction case law..."

Reply with ONLY the status message.` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 25 }
        })
      }
    );

    const d = await res.json();
    const status = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '📚 Searching Nigerian law...';

    return new Response(
      JSON.stringify({ status: status.length < 80 ? status : '📚 Searching Nigerian law...' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch {
    return new Response(
      JSON.stringify({ status: '📚 Searching Nigerian law database...' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

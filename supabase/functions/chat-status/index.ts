// SUPABASE FUNCTION: chat-status
// JWT verification: OFF
// Purpose: Ultra-fast lightweight status message generation.
//          Uses Claude Haiku — the fastest and cheapest Claude model — so the
//          whole platform runs on a single Anthropic dependency.
//          On failure it returns an empty status so the UI simply keeps
//          showing its animated dots (never a hardcoded fallback message).
// Returns: JSON { status: "short natural message" }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

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
      journalist: 'journalist', other: 'an ordinary person', individual: 'an ordinary person'
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

Examples of the exact tone:
Message: "It's going fine" -> Responding...
Message: "Draft me a tenancy agreement" -> Drafting your tenancy agreement...
Message: "What is the Land Use Act" -> Looking into that...
Message: "Hello" -> Hello...
Message: "My landlord locked me out" -> Checking your rights as a tenant...
Message: "Thanks so much" -> You're welcome...
Message: "Help me register my business with CAC" -> Pulling up the CAC steps...

Now write the status line for the user's message. Reply with ONLY the status line, nothing else.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 24,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ status: '' }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const d = await res.json();
    let status = (d.content?.[0]?.text || '').trim();
    status = status.replace(/^["'`]+|["'`]+$/g, '').trim();
    if (status.length > 60) status = '';

    return new Response(
      JSON.stringify({ status }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch {
    return new Response(
      JSON.stringify({ status: '' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

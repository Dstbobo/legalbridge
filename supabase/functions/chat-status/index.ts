// SUPABASE FUNCTION: chat-status
// JWT verification: OFF
// Purpose: Ultra-fast lightweight status message generation.
//          The status string ALWAYS comes from the AI reading the actual
//          user message — there are NO hardcoded status strings anywhere.
//          On failure it returns an empty status so the UI simply keeps
//          showing its animated dots (never a generic fallback message).
// Returns: JSON { status: "short natural message" }

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
      journalist: 'journalist', other: 'an ordinary person', individual: 'an ordinary person'
    };
    const role = roleLabel[userType] || 'a user';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `You are LegalBridge, a Nigerian legal AI assistant. The user (${role}) just sent you a message. Before you answer, you say ONE very short line telling them what you are about to do — like a person briefly saying what they're doing right now.

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

Now write the status line for the user's message:` }] }],
          // thinkingBudget: 0 disables the model's internal reasoning so the
          // tiny token budget goes entirely to the visible status line (fast + cheap).
          generationConfig: { temperature: 0.4, maxOutputTokens: 24, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );

    const d = await res.json();
    let status = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    // Strip any surrounding quotes the model may add; reject anything too long.
    status = status.replace(/^["'`]+|["'`]+$/g, '').trim();
    if (status.length > 60) status = '';

    return new Response(
      JSON.stringify({ status }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch {
    // No hardcoded message — empty status keeps the UI on its animated dots.
    return new Response(
      JSON.stringify({ status: '' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

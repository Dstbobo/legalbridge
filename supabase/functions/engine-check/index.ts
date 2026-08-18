// One-off diagnostic: pings each AI provider with a tiny request and reports
// the exact HTTP status/error from each, so outages are diagnosed in seconds
// instead of guessing. Admin-only by capability (service key required).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GROQ_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const adminKey = req.headers.get('x-admin-key') ?? '';
  const admin = createClient(SUPABASE_URL, adminKey);
  const authCheck = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (authCheck.error) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const out: Record<string, unknown> = {
    keysPresent: { anthropic: !!ANTHROPIC_KEY, gemini: !!GEMINI_KEY, groq: !!GROQ_KEY },
  };

  // Groq
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    });
    out.groq = { status: r.status, body: (await r.text()).slice(0, 300) };
  } catch (e) { out.groq = { error: String(e) }; }

  // Groq model list (shows what models the key can actually use)
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${GROQ_KEY}` },
    });
    const j = await r.json();
    out.groqModels = Array.isArray(j?.data) ? j.data.map((m: any) => m.id).slice(0, 30) : (JSON.stringify(j).slice(0, 300));
  } catch (e) { out.groqModels = { error: String(e) }; }

  // Gemini available models (what this key can actually call)
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}&pageSize=100`);
    const j = await r.json();
    out.geminiModels = Array.isArray(j?.models)
      ? j.models.filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
                 .map((m: any) => m.name.replace('models/', ''))
      : JSON.stringify(j).slice(0, 300);
  } catch (e) { out.geminiModels = { error: String(e) }; }

  // Gemini — test each candidate model so we pick one that actually generates
  out.geminiTests = {};
  for (const model of ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview']) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 10 } }),
      });
      (out.geminiTests as any)[model] = r.status;
    } catch (e) { (out.geminiTests as any)[model] = String(e); }
  }

  // Claude
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
    });
    out.claude = { status: r.status, body: (await r.text()).slice(0, 300) };
  } catch (e) { out.claude = { error: String(e) }; }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});

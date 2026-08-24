// Generates (and caches) a plain-English AI report for a news article.
// Body: { articleId } → { summary } (markdown). Summary is produced once and
// stored on the article row; later readers get the cached copy instantly.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  consumeProviderQuota,
  fetchSafeExternalHttp,
  readJsonBody,
  requireMethod,
  requirePrincipal,
  securityErrorResponse,
} from '../_shared/security.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const db = createClient(SUPABASE_URL, SERVICE_KEY);
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = 'claude-sonnet-4-5';
// News reports run on Gemini's free tier; Claude stays reserved for chat/Ask-AI.
// Tried in order — free-tier models get transient 503s under load.
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-2.0-flash'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Pull readable text out of an article page (crude but effective). */
async function extractArticleText(url: string): Promise<string> {
  const res = await fetchSafeExternalHttp(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return '';
  let html = await res.text();
  html = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  // Prefer <article> or main content blocks when present.
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  const text = article
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 12000);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    requireMethod(req, 'POST');
    const principal = await requirePrincipal(req, {
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      serviceRoleKey: SERVICE_KEY,
      allowServiceRole: true,
    });
    if (principal.kind === 'user') {
      await consumeProviderQuota({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SERVICE_KEY,
        userId: principal.id,
        route: 'news-summarize',
        limit: 6,
        windowSeconds: 60,
      });
    }
    const { articleId } = await readJsonBody<{ articleId?: string }>(req, 8 * 1024);
    if (!articleId) return Response.json({ error: 'articleId required' }, { status: 400, headers: CORS });

    const { data: art, error } = await db
      .from('news_articles')
      .select('id,title,summary,source,category,article_url,ai_summary')
      .eq('id', articleId)
      .single();
    if (error || !art) return Response.json({ error: 'Article not found' }, { status: 404, headers: CORS });

    // Cached copies must be the new two-part format (summary + full report);
    // regenerate anything older.
    if (art.ai_summary && art.ai_summary.includes('---FULL REPORT---')) {
      return Response.json({ summary: art.ai_summary, cached: true }, { headers: CORS });
    }

    const pageText = await extractArticleText(art.article_url).catch(() => '');
    const basis = pageText.length > 400
      ? `FULL ARTICLE TEXT:\n${pageText}`
      : `Only the headline and a short summary are available.\nHEADLINE: ${art.title}\nSUMMARY: ${art.summary ?? '(none)'}`;

    const prompt =
      `You are LegalBridge AI writing news coverage for everyday Nigerians (including older readers and civil servants). ` +
      `Write in clear, simple English. Based ONLY on the material below, produce TWO parts.\n\n` +
      `PART 1 — SUMMARY (markdown):\n` +
      `- One lead paragraph (2-3 sentences: what happened).\n` +
      `- Then 3-5 short bullets. In each bullet, put the key names/figures in **bold**.\n\n` +
      `Then output this exact separator on its own line:\n---FULL REPORT---\n\n` +
      `PART 2 — FULL REPORT (markdown): a well-written 300-450 word news report with 2-4 sections, ` +
      `each starting with a short "## " heading (like a newspaper). Cover the background, the details, ` +
      `and end with a section on what it means for ordinary people or businesses in Nigeria ` +
      `(if it involves law or government policy, explain plainly).\n\n` +
      `Do not invent facts that are not in the material. Do not mention that you are an AI or reference "the material". ` +
      `Source: ${art.source}.\n\n${basis}`;

    // Primary: Gemini (free tier) — news reports must not consume Claude credits.
    let summary = '';
    let geminiErr = '';
    if (GEMINI_KEY) {
      for (const model of GEMINI_MODELS) {
        try {
          const gRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: 1600, temperature: 0.4 },
              }),
              signal: AbortSignal.timeout(45000),
            },
          );
          if (gRes.ok) {
            const out = await gRes.json();
            const parts = out?.candidates?.[0]?.content?.parts ?? [];
            summary = parts.map((p: any) => p?.text ?? '').join('').trim();
            if (summary) break;
          } else {
            geminiErr = `${model} ${gRes.status}: ${(await gRes.text()).slice(0, 120)}`;
          }
        } catch (e) {
          geminiErr = `${model}: ${String((e as Error)?.message ?? e)}`;
        }
      }
    }

    // Fallback: Groq (free tier) — keeps news reports alive without credits.
    if (!summary) {
      const GROQ_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
      if (GROQ_KEY) {
        try {
          const gq = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              max_tokens: 1600,
              temperature: 0.4,
              messages: [{ role: 'user', content: prompt }],
            }),
            signal: AbortSignal.timeout(45000),
          });
          if (gq.ok) {
            const out = await gq.json();
            summary = (out?.choices?.[0]?.message?.content ?? '').trim();
          }
        } catch { /* fall through to Claude */ }
      }
    }

    // Last resort: Claude (only if both free engines unavailable).
    if (!summary) {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1600,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!aiRes.ok) {
        return Response.json(
          { error: 'provider_unavailable' },
          { status: 502, headers: CORS },
        );
      }
      const out = await aiRes.json();
      summary = out?.content?.[0]?.text ?? '';
    }
    if (!summary) return Response.json({ error: 'Empty AI response' }, { status: 502, headers: CORS });

    await db.from('news_articles').update({ ai_summary: summary }).eq('id', articleId);
    return Response.json({ summary, cached: false }, { headers: CORS });
  } catch (error) {
    return securityErrorResponse(error, CORS);
  }
});

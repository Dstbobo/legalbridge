// SUPABASE FUNCTION: chat-search
// JWT verification: OFF
// Purpose: Live web search via Gemini Flash + Google Search grounding
// Returns: SSE stream with response text and clickable source links

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildSearchPrompt(userType: string, profile: any): string {
  const base = `You are LegalBridge AI, built by DST Global Innovative Nigeria Ltd (Akwanga, Nasarawa State), founded by Daniel Thankgod. Never mention Google, Gemini, Claude, Anthropic, or any underlying AI technology to users. You are a Nigerian legal news and current affairs assistant.

TASK: Answer questions about recent Nigerian legal developments, new legislation, amendments, court judgments, and regulatory updates.

SEARCH PRIORITIES (in order):
1. Official Federal Gazette (officialgazette.gov.ng)
2. NigeriaLII (nigerialii.org)
3. FIRS (firs.gov.ng)
4. CBN (cbn.gov.ng)
5. CAC (cac.gov.ng)
6. NCC (ncc.gov.ng)
7. Nigerian courts official portals
8. Reputable Nigerian legal news sources

RESPONSE FORMAT:
- Lead with the key legal development or answer
- Cite sources by name and date where available
- Note when a law was signed, gazette date, or effective date
- Flag if information is unverified or from unofficial sources
- Keep response focused and factual

JURISDICTION: Nigeria exclusively.`;

  if (userType === 'lawyer') {
    return base + `\nAUDIENCE: Licensed Nigerian lawyer — include exact commencement dates, gazette references, and practice implications.`;
  }
  if (userType === 'student') {
    return base + `\nAUDIENCE: Nigerian law student — explain the significance of the development for legal practice and academics.`;
  }
  if (userType === 'business') {
    return base + `\nAUDIENCE: Nigerian business owner — focus on compliance obligations, deadlines, and commercial impact.`;
  }
  if (userType === 'journalist') {
    return base + `\nAUDIENCE: Nigerian journalist — provide factual detail, official sources, and context for reporting.`;
  }
  return base + `\nAUDIENCE: General Nigerian public — explain in plain English what the development means for ordinary citizens.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const {
      messages = [],
      userType = 'other',
      profile = {},
      summary = '',
    } = body;

    const lastMsg = messages[messages.length - 1]?.content || '';
    const systemPrompt = buildSearchPrompt(userType, profile)
      + (profile?.state ? `\nUser's state: ${profile.state}.` : '')
      + (summary ? `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]` : '');

    // ── GEMINI WITH GOOGLE SEARCH GROUNDING ──
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 25000);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: messages.map((m: any) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
          })
        }
      );
      clearTimeout(timeout);

      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || 'Gemini search error');

      let responseText = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!responseText) throw new Error('Empty search response');

      // Append clickable source links
      const chunks = d.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const links = chunks
        .filter((c: any) => c?.web?.uri && !c.web.uri.includes('vertexaisearch'))
        .slice(0, 5)
        .map((c: any) => `<li><a href="${c.web.uri}" target="_blank" style="color:#4a8ef5">${c.web.title || c.web.uri}</a></li>`)
        .join('');

      if (links) {
        responseText += `\n\n<div style="margin-top:14px;padding:12px;background:rgba(74,142,245,0.08);border-radius:8px;border-left:3px solid #4a8ef5"><strong>📰 Sources:</strong><ul style="margin-top:6px;padding-left:16px">${links}</ul></div>`;
      }

      // Stream the response word by word
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      (async () => {
        try {
          const words = responseText.split(' ');
          for (let i = 0; i < words.length; i++) {
            const chunk = (i === 0 ? '' : ' ') + words[i];
            await writer.write(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
            await new Promise(r => setTimeout(r, 12));
          }
        } catch {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ text: '\n\n⚠ Search stream interrupted.' })}\n\n`));
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
          'X-Source': 'search'
        }
      });

    } catch (geminiErr) {
      // ── FALLBACK: Claude Sonnet without live search ──
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
              max_tokens: 2048,
              stream: true,
              system: systemPrompt + '\n\nNOTE: Live search is unavailable. Answer from your training knowledge and clearly state the knowledge cutoff date. Recommend the user check official sources for the latest updates.',
              messages: messages.map((m: any) => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
              }))
            })
          });

          if (!res.ok) throw new Error('Claude fallback error');
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
        } catch {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ text: '⚠ Search is temporarily unavailable. Please try again.' })}\n\n`));
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
          'X-Source': 'search-fallback'
        }
      });
    }

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

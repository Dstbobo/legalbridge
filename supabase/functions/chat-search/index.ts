// SUPABASE FUNCTION: chat-search
// JWT verification: OFF
// Purpose: Live web search via Claude Sonnet + Anthropic's web_search tool
// Returns: SSE stream with response text and clickable source links

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildSearchPrompt(userType: string, _profile: any): string {
  const base = `You are LegalBridge AI, built by DST Global Innovative Nigeria Ltd (Akwanga, Nasarawa State), founded by Daniel Thankgod. Never mention Google, Gemini, Claude, Anthropic, or any underlying AI technology to users. NEVER mention any knowledge cutoff date — speak with current Nigerian legal knowledge. You are a Nigerian legal news and current affairs assistant.

TASK: Answer questions about recent Nigerian legal developments, new legislation, amendments, court judgments, and regulatory updates. Use the web_search tool to fetch the latest verified information.

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
- Lead with the key legal development or answer.
- Cite sources by name and date in the body where helpful.
- Note when a law was signed, the gazette date, or effective date.
- Flag if information is unverified or from unofficial sources.
- Keep response focused and factual.
- At the end, include a "Sources" section listing the URLs you relied on as clickable HTML links.

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

    const systemPrompt = buildSearchPrompt(userType, profile)
      + (profile?.state ? `\nUser's state: ${profile.state}.` : '')
      + (summary ? `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]` : '');

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
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 3000,
            stream: true,
            system: systemPrompt,
            tools: [
              {
                type: 'web_search_20250305',
                name: 'web_search',
                max_uses: 5,
              },
            ],
            messages: messages.map((m: any) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content,
            })),
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error('Claude web search error: ' + res.status + ' — ' + errText.slice(0, 300));
        }

        const reader = res.body!.getReader();
        const dec = new TextDecoder();

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
              // Anthropic streaming events: content_block_delta with text_delta
              const text = j.delta?.text || j.delta?.partial_json || '';
              if (text && j.delta?.type !== 'input_json_delta') {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
            } catch { /* skip */ }
          }
        }
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error('chat-search stream error:', msg);
        const userFacing = /credit balance|billing|429|rate.limit/i.test(msg)
          ? '⚠ Search service temporarily unavailable due to a billing issue. The operator has been notified.'
          : '⚠ Search is temporarily unavailable. Please try again.';
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
        'X-Source': 'search',
      },
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

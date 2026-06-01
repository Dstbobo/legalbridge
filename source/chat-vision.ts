// SUPABASE FUNCTION: chat-vision
// JWT verification: OFF
// Purpose: Multi-page Nigerian document scanning, OCR, and legal analysis
// Returns: SSE stream
// Timeout: 55 seconds (Supabase default is 150s — set in function config)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 40+ Nigerian document types for identification
const DOCUMENT_TYPES = `
NIGERIAN DOCUMENT IDENTIFICATION GUIDE:

IDENTITY DOCUMENTS:
- National ID Card (NIN slip / Laminated card)
- International Passport (Green cover, gold eagle)
- Voter's Card (PVC — INEC issued)
- Driver's Licence (FRSC issued)
- Birth Certificate (NPC issued)
- Death Certificate
- Marriage Certificate (Registry / Church / Mosque)

LAND & PROPERTY:
- Certificate of Occupancy (C of O) — Governor signed
- Deed of Assignment
- Deed of Lease
- Survey Plan (licensed surveyor)
- Governor's Consent document
- Deed of Mortgage
- Tenancy Agreement
- Notice to Quit
- Statutory Notice (7-day)

COURT DOCUMENTS:
- Writ of Summons
- Statement of Claim / Defence
- Affidavit (Commissioner for Oaths stamp)
- Court Order / Judgment
- Motion on Notice / Ex Parte Motion
- Originating Summons
- Garnishee Order
- Warrant of Arrest / Possession
- Bail Bond

CORPORATE / BUSINESS:
- CAC Certificate of Incorporation
- Business Name Certificate
- MEMAT (CAC Form)
- Annual Returns (CAC)
- Tax Clearance Certificate (FIRS / State IRS)
- TIN Certificate
- NAFDAC Registration Certificate
- SON Certification

FINANCIAL:
- Bank Statement
- Cheque (crossed / bearer)
- Promissory Note
- Power of Attorney (financial)
- Insurance Policy / Certificate
- Pension Statement

EMPLOYMENT:
- Employment Letter / Offer Letter
- Letter of Dismissal / Termination
- Reference Letter
- Payslip / Salary Voucher
- Appointment Letter

CRIMINAL / POLICE:
- Police Bail Bond
- Charge Sheet
- Proof of Evidence
- Confessional Statement (endorsed by ASP+)
- First Information Report (FIR)

EDUCATION:
- WAEC / NECO Certificate
- University Degree Certificate
- NYSC Discharge Certificate
- Statement of Result

OTHER LEGAL:
- Power of Attorney (general / special)
- Deed of Gift
- Will / Testament
- Letters of Administration
- Grant of Probate
- Statutory Declaration`;

function buildVisionPrompt(userType: string, profile: any): string {
  const base = `You are LegalBridge Vision AI — Nigeria's most advanced legal document analysis system.

TASK: Analyse the uploaded document image(s) with the thoroughness of a senior Nigerian legal practitioner.

${DOCUMENT_TYPES}

SCANNING INSTRUCTIONS:
1. IDENTIFY the document type (match against the list above)
2. EXTRACT all text content — be exhaustive
3. MARK special elements:
   - [HANDWRITTEN] for handwritten portions
   - [STAMP] for official stamps or seals
   - [SIGNATURE] for signature blocks
   - [ILLEGIBLE] for unreadable text
   - [BLANK FIELD] for unfilled spaces
   - [DATE: XX/XX/XXXX] for dates found
4. NOTE physical condition: faded, torn, altered, overwritten text
5. FLAG suspicious elements that may indicate forgery or tampering

FORGERY INDICATORS TO CHECK:
- Inconsistent fonts or typefaces within the document
- Date tampering (correction fluid, overwriting)
- Mismatched signatures
- Stamp/seal irregularities
- Paper quality inconsistencies
- Serial number anomalies`;

  const formats: Record<string, string> = {
    lawyer: `

LAWYER FORMAT — provide:

**DOCUMENT IDENTIFICATION**
Full document type, issuing authority, jurisdiction.

**EXTRACTED CONTENT**
Complete text extraction with all markings.

**LEGAL VALIDITY ASSESSMENT**
- Formal requirements met? (statutory basis)
- Required signatures/stamps present?
- Execution/authentication proper?
- Limitation or expiry issues?

**AUTHENTICITY ANALYSIS**
- Forgery indicators present?
- Anomalies identified?
- Recommended verification steps

**LEGAL IMPLICATIONS**
- What rights/obligations does this document create or affect?
- Admissibility as evidence (Evidence Act 2011 s.83-86)?
- Applicable Nigerian statute

**RECOMMENDED ACTION**
Next legal steps based on this document.`,

    student: `

STUDENT FORMAT — IRAC:

**DOCUMENT IDENTIFICATION & EXTRACTION**
Full text extraction and document type.

**ISSUE** — What legal questions does this document raise?
**RULE** — Applicable Nigerian law governing this document type
**APPLICATION** — Apply rules to what you observe in the document
**CONCLUSION** — Legal validity and significance`,

    other: `

PLAIN ENGLISH FORMAT:

**WHAT IS THIS DOCUMENT?**
Simple explanation of what this document is.

**WHAT DOES IT SAY?**
Plain English summary of the key content.

**IS IT VALID?**
Simple assessment of whether it looks official and properly executed.

**ANY PROBLEMS?**
Flag anything that looks wrong or suspicious.

**WHAT SHOULD YOU DO?**
Practical next steps.`
  };

  let prompt = base + (formats[userType] || formats['other']);
  if (profile?.state) prompt += `\nUser's state: ${profile.state} — apply state-specific laws where relevant.`;
  return prompt;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const {
      messages = [],
      images = [],
      userType = 'other',
      profile = {},
      summary = '',
    } = body;

    if (!images || images.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No images provided' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const lastMsg = messages[messages.length - 1]?.content || '';
    const systemPrompt = buildVisionPrompt(userType, profile)
      + (summary ? `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]` : '');

    // Build multimodal parts — support multi-page documents
    const parts: any[] = [];
    for (let i = 0; i < images.length; i++) {
      if (images.length > 1) {
        parts.push({ text: `--- PAGE ${i + 1} OF ${images.length} ---` });
      }
      parts.push({
        inlineData: {
          mimeType: images[i].mimeType || 'image/jpeg',
          data: images[i].data
        }
      });
    }
    parts.push({
      text: lastMsg || 'Conduct a full legal analysis of this document under Nigerian law. Identify the document type, extract all text, and assess its legal validity.'
    });

    // ── PRIMARY: Gemini Vision ──
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 50000); // 50s for multi-page

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
          })
        }
      );
      clearTimeout(timeout);

      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || 'Gemini vision error');

      const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty vision response');

      // Stream word by word
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      (async () => {
        try {
          const words = text.split(' ');
          for (let i = 0; i < words.length; i++) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ text: (i === 0 ? '' : ' ') + words[i] })}\n\n`));
            await new Promise(r => setTimeout(r, 8));
          }
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
          'X-Source': 'vision'
        }
      });

    } catch (_geminiErr) {
      // ── FALLBACK: Claude Vision ──
      // Convert images to Claude format
      const claudeContent: any[] = [];
      for (const img of images) {
        claudeContent.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType || 'image/jpeg',
            data: img.data
          }
        });
      }
      claudeContent.push({
        type: 'text',
        text: lastMsg || 'Conduct a full legal analysis of this document under Nigerian law.'
      });

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
              messages: [{ role: 'user', content: claudeContent }]
            })
          });

          if (!res.ok) throw new Error('Claude vision error');
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
          await writer.write(encoder.encode(`data: ${JSON.stringify({ text: '⚠ Document analysis failed. Please ensure the image is clear and try again.' })}\n\n`));
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
          'X-Source': 'vision-fallback'
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

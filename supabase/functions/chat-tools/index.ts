// ════════════════════════════════════════════════════════════════════
// SUPABASE FUNCTION: chat-tools  (HEAVY CONTEXT HUB)
//
// Consolidates: chat-search + chat-vision + chat-evidence
//
// Dispatched by tool field in request body:
//   tool = 'search'   → Claude Sonnet + Anthropic web_search tool
//   tool = 'vision'   → Claude Sonnet vision (image input + OCR)
//   tool = 'evidence' → Claude Sonnet vision + Evidence Act knowledge
//                       + Voyage AI RAG over Nigerian case law
//
// Single model rule: Claude Sonnet only. No tier splitting.
// JWT verification: OFF (called internally by chat-stream)
// ════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const VOYAGE_KEY    = Deno.env.get("VOYAGE_API_KEY")!;
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL = 'claude-sonnet-4-5';

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ════════════════════════════════════════════════════════════════════
// VOYAGE AI RAG — Nigerian legal authorities (UNTOUCHED)
// ════════════════════════════════════════════════════════════════════
async function ragSearch(query: string, matchCount = 5): Promise<string> {
  try {
    const eRes = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${VOYAGE_KEY}` },
      body: JSON.stringify({ model: "voyage-law-2", input: [query.slice(0, 1500)], input_type: "query" }),
    });
    const eData = await eRes.json();
    const emb = eData?.data?.[0]?.embedding;
    if (!emb) return '';

    const sRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_legal_documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ query_embedding: emb, match_count: matchCount }),
    });
    const docs = await sRes.json();
    if (!docs?.length) return '';

    let ctx = '\n\n[RETRIEVED NIGERIAN LEGAL AUTHORITIES]\n';
    for (const d of docs) {
      if (d.similarity > 0.55) {
        ctx += `SOURCE: ${d.source}${d.section_number ? ' | ' + d.section_number : ''}\n${d.content}\n---\n`;
      }
    }
    return ctx + '[END AUTHORITIES]\n';
  } catch { return ''; }
}

// ════════════════════════════════════════════════════════════════════
// EVIDENCE ACT 2011 KNOWLEDGE BASE
// ════════════════════════════════════════════════════════════════════
const EVIDENCE_ACT_KNOWLEDGE = `
EVIDENCE ACT 2011 (Nigeria) — KEY PROVISIONS:

ADMISSIBILITY FRAMEWORK:
- s.1: Facts in issue and relevant facts are admissible
- s.4: Relevance is the primary test for admissibility
- s.7: Facts showing motive, preparation, conduct are relevant
- s.9: Facts necessary to explain or introduce relevant facts

DOCUMENTARY EVIDENCE:
- s.83: Primary evidence = original document
- s.84: Secondary evidence = copy, when admissible
- s.85: Cases where secondary evidence admissible (original lost, destroyed, in possession of adverse party)
- s.86: Proof of handwriting
- s.89: Stamp duty compliance required for admissibility of stamped instruments

ELECTRONIC EVIDENCE (Critical for modern practice):
- s.84(1)(b): Computer-generated documents admissible if conditions met
- s.84(2): Computer certificate conditions — device properly used, stored information, device operating properly
- s.104: Admissibility of statements in documents produced by computers
- s.104(2): Computer certificate signed by responsible officer required
- Landmark: Kubor v. Dickson (2012) 15 NWLR (Pt. 1324) 417 — electronic evidence admissibility
- Peter Obi v. INEC (2023) — electronic transmission of results, BVAS admissibility

CONFESSIONAL STATEMENTS:
- s.28: Confession admissible if voluntary
- s.29: Conditions for admissibility — not obtained by threat, inducement, promise
- s.29(3): Confession made to police officer not below rank of ASP
- Trial-within-trial (TWT): Conducted to determine voluntariness
- Key cases: Nwachukwu v. State (2002) 12 NWLR (Pt. 782) 543
- ACJA 2015 s.15(4): Confession must be recorded electronically where practicable

HEARSAY RULE:
- s.37: Oral evidence must be direct (first-hand)
- s.38: Hearsay generally inadmissible
- Exceptions: s.40 (admissions), s.41 (dying declarations), s.43 (against interest), s.44 (public documents), s.46 (ancient documents), s.48 (unavailable witnesses)

BURDEN & STANDARD OF PROOF:
- s.131: Burden of proof on party asserting fact
- s.132: Burden shifts on proof of primary fact
- s.134: Standard in criminal cases = beyond reasonable doubt
- s.135: Standard in civil cases = balance of probabilities
- Woolmington v. DPP [1935] AC 462 — golden thread principle (applied in Nigeria)

CHARACTER EVIDENCE:
- s.77: Character of accused in criminal cases
- s.78: Bad character admissible only in specific circumstances
- s.79: Good character of accused

EXPERT EVIDENCE:
- s.68: Opinions of experts admissible on scientific/technical matters
- s.69: Expert must give reasons for opinion

PRIVILEGED COMMUNICATIONS:
- s.192: Legal professional privilege
- s.195: Without prejudice communications
- s.196: Official communications — public interest immunity

WITNESSES:
- s.155: Competence
- s.157: Spouses competent but not always compellable
- s.180: Cross-examination on previous inconsistent statements

FORGERY INDICATORS:
- Inconsistent fonts/typefaces, date tampering, mismatched signatures, stamp irregularities, paper inconsistencies, serial anomalies.
- Section 465 Criminal Code: forgery defined. Section 467: uttering.`;

const CHAIN_OF_CUSTODY = `
CHAIN OF CUSTODY REQUIREMENTS (Nigerian Courts):
1. COLLECTION → 2. PRESERVATION → 3. TRANSFER (custody log) → 4. ANALYSIS → 5. COURT PRODUCTION
- Physical evidence: exhibit number, property register, custody log, no tampering.
- Digital evidence: hash verification (MD5/SHA-256), forensic copy, write blocker, qualified examiner, ISO 27037 / ACPO guidelines.
- Biological/forensic: DNA chain critical, storage temperature, accredited lab.
- Breaks in chain go to WEIGHT (not always inadmissibility); defence should raise and exploit.`;

// ════════════════════════════════════════════════════════════════════
// NIGERIAN DOCUMENT TYPES (for vision identification)
// ════════════════════════════════════════════════════════════════════
const DOCUMENT_TYPES = `
NIGERIAN DOCUMENT IDENTIFICATION GUIDE:

IDENTITY: National ID Card (NIN), International Passport (green/eagle), Voter's Card (PVC/INEC), Driver's Licence (FRSC), Birth Certificate (NPC), Death Certificate, Marriage Certificate.

LAND & PROPERTY: Certificate of Occupancy (Governor-signed), Deed of Assignment, Deed of Lease, Survey Plan, Governor's Consent, Deed of Mortgage, Tenancy Agreement, Notice to Quit, Statutory 7-day Notice.

COURT: Writ of Summons, Statement of Claim/Defence, Affidavit (Commissioner stamp), Court Order/Judgment, Motion on Notice / Ex Parte, Originating Summons, Garnishee Order, Warrant of Arrest/Possession, Bail Bond.

CORPORATE: CAC Certificate of Incorporation, Business Name Certificate, MEMAT, CAC Annual Returns, Tax Clearance (FIRS/State IRS), TIN, NAFDAC, SON.

FINANCIAL: Bank Statement, Cheque, Promissory Note, Power of Attorney, Insurance Policy.

EMPLOYMENT: Employment/Offer Letter, Termination Letter, Reference, Payslip.

CRIMINAL/POLICE: Police Bail Bond, Charge Sheet, Proof of Evidence, Confessional Statement (ASP+ endorsed), FIR.

EDUCATION: WAEC/NECO Certificate, Degree, NYSC Discharge, Statement of Result.

OTHER LEGAL: Power of Attorney, Deed of Gift, Will, Letters of Administration, Probate, Statutory Declaration.`;

// ════════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ════════════════════════════════════════════════════════════════════
const IDENTITY_LINE = `You are LegalBridge AI, built by DST Global Innovative Nigeria Ltd (Akwanga, Nasarawa State), founded by Daniel Thankgod. Never mention Google, Gemini, Claude, Anthropic, or any underlying AI technology. NEVER mention a knowledge cutoff date — speak with current Nigerian legal knowledge.`;

function buildSearchPrompt(userType: string, _profile: any): string {
  const base = `${IDENTITY_LINE} You are a Nigerian legal news and current affairs assistant.

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
- At the end include a "Sources" section listing the URLs you relied on as clickable HTML links.

JURISDICTION: Nigeria exclusively.`;

  if (userType === 'lawyer')     return base + `\nAUDIENCE: Licensed Nigerian lawyer — include exact commencement dates, gazette references, and practice implications.`;
  if (userType === 'student')    return base + `\nAUDIENCE: Nigerian law student — explain the significance for legal practice and academics.`;
  if (userType === 'business')   return base + `\nAUDIENCE: Nigerian business owner — focus on compliance obligations, deadlines, and commercial impact.`;
  if (userType === 'journalist') return base + `\nAUDIENCE: Nigerian journalist — provide factual detail, official sources, and context for reporting.`;
  return base + `\nAUDIENCE: General Nigerian public — explain in plain English what the development means for ordinary citizens.`;
}

function buildVisionPrompt(userType: string, profile: any): string {
  const base = `${IDENTITY_LINE} Nigeria's most advanced legal document analysis system.

TASK: Analyse the uploaded document image(s) with the thoroughness of a senior Nigerian legal practitioner.

${DOCUMENT_TYPES}

SCANNING INSTRUCTIONS:
1. IDENTIFY the document type (match against the list above)
2. EXTRACT all text content — be exhaustive
3. MARK special elements: [HANDWRITTEN], [STAMP], [SIGNATURE], [ILLEGIBLE], [BLANK FIELD], [DATE: XX/XX/XXXX]
4. NOTE physical condition: faded, torn, altered, overwritten text
5. FLAG suspicious elements that may indicate forgery or tampering

FORGERY INDICATORS:
- Inconsistent fonts/typefaces, date tampering, mismatched signatures, stamp irregularities, paper inconsistencies, serial anomalies.`;

  const formats: Record<string, string> = {
    lawyer: `

LAWYER FORMAT — provide:
**DOCUMENT IDENTIFICATION** — Full document type, issuing authority, jurisdiction.
**EXTRACTED CONTENT** — Complete text extraction with all markings.
**LEGAL VALIDITY ASSESSMENT** — Formal requirements met? Required signatures/stamps present? Execution proper? Limitation issues?
**AUTHENTICITY ANALYSIS** — Forgery indicators? Anomalies? Recommended verification steps.
**LEGAL IMPLICATIONS** — Rights/obligations created? Admissibility (Evidence Act 2011 s.83-86)? Applicable Nigerian statute.
**RECOMMENDED ACTION** — Next legal steps.`,

    student: `

STUDENT FORMAT — IRAC:
**DOCUMENT IDENTIFICATION & EXTRACTION** — Full text extraction and document type.
**ISSUE** — What legal questions does this document raise?
**RULE** — Applicable Nigerian law governing this document type.
**APPLICATION** — Apply rules to what you observe in the document.
**CONCLUSION** — Legal validity and significance.`,

    other: `

PLAIN ENGLISH FORMAT:
**WHAT IS THIS DOCUMENT?** — Simple explanation.
**WHAT DOES IT SAY?** — Plain English summary.
**IS IT VALID?** — Simple assessment of whether it looks official and properly executed.
**ANY PROBLEMS?** — Flag anything suspicious.
**WHAT SHOULD YOU DO?** — Practical next steps.`,
  };

  let prompt = base + (formats[userType] || formats['other']);
  if (profile?.state) prompt += `\nUser's state: ${profile.state} — apply state-specific laws where relevant.`;
  return prompt;
}

function buildEvidencePrompt(userType: string): string {
  const base = `${IDENTITY_LINE} Nigeria's most advanced legal evidence analysis system.

JURISDICTION: Nigerian law exclusively.
PRIMARY LAW: Evidence Act 2011; ACJA 2015; Criminal Code; Penal Code; Constitution of Nigeria 1999.

${EVIDENCE_ACT_KNOWLEDGE}

${CHAIN_OF_CUSTODY}`;

  const userFormats: Record<string, string> = {
    lawyer: `
FORMAT YOUR ANALYSIS AS:

**EVIDENCE OVERVIEW** — Type, source, what it purports to prove.

**ADMISSIBILITY ANALYSIS**
- Primary admissibility test (relevance — Evidence Act s.4)
- Specific admissibility rules applicable (cite exact sections)
- Conditions that must be satisfied for admission
- Likely objections and counter-arguments

**AUTHENTICATION & FOUNDATION** — How authenticated? Who lays foundation? Required accompanying documents.

**CHAIN OF CUSTODY ASSESSMENT** — Custody requirements; gaps; weight vs admissibility.

**FORGERY/INTEGRITY ANALYSIS** (if document) — Indicators, anomalies, recommended forensic exam.

**EVIDENTIAL WEIGHT** — Likely court weight; corroboration; cross-examination vulnerabilities.

**CASE LAW** — Relevant Nigerian authorities with full NWLR/LPELR citations and ratio decidendi.

**STRATEGIC RECOMMENDATIONS** — For prosecution/defence; additional evidence needed.

*Verify all citations on NigeriaLII or LawPavilion before reliance in court.*`,

    student: `
FORMAT YOUR ANALYSIS USING IRAC:

**ISSUE** — What evidentiary question does this raise?
**RULE** — Applicable Evidence Act provisions and case law
**APPLICATION** — Apply rules to the specific evidence
**CONCLUSION** — Admissibility determination and weight

Include: section numbers, case citations in NWLR format, legal principles.`,

    other: `
FORMAT YOUR ANALYSIS IN PLAIN ENGLISH:

**WHAT IS THIS EVIDENCE?** — Simple explanation of evidence type.
**CAN IT BE USED IN COURT?** — Admissibility in plain terms.
**HOW STRONG IS IT?** — Likely court weight.
**WHAT PROBLEMS EXIST?** — Issues with this evidence.
**WHAT SHOULD YOU DO?** — Practical next steps.`,
  };

  return base + (userFormats[userType] || userFormats['other']);
}

// ════════════════════════════════════════════════════════════════════
// TOOL: search — Claude Sonnet with Anthropic web_search tool
// ════════════════════════════════════════════════════════════════════
function handleSearch(systemPrompt: string, messages: any[]): Response {
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
          model: MODEL,
          max_tokens: 3000,
          stream: true,
          system: systemPrompt,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
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
            const text = j.delta?.text || '';
            if (text && j.delta?.type !== 'input_json_delta') {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          } catch { /* skip */ }
        }
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error('chat-tools search error:', msg);
      const userFacing = /credit balance|billing|429|rate.limit/i.test(msg)
        ? '⚠ Search service temporarily unavailable due to a billing issue.'
        : '⚠ Search is temporarily unavailable. Please try again.';
      await writer.write(encoder.encode(`data: ${JSON.stringify({ text: userFacing })}\n\n`));
    } finally {
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Stream': '1', 'X-Source': 'search' },
  });
}

// ════════════════════════════════════════════════════════════════════
// TOOL: vision — Claude Sonnet vision streaming
// ════════════════════════════════════════════════════════════════════
function handleVision(systemPrompt: string, images: any[], userText: string): Response {
  const claudeContent: any[] = [];
  for (let i = 0; i < images.length; i++) {
    if (images.length > 1) claudeContent.push({ type: 'text', text: `--- PAGE ${i + 1} OF ${images.length} ---` });
    claudeContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: images[i].mimeType || 'image/jpeg',
        data: images[i].data,
      },
    });
  }
  claudeContent.push({
    type: 'text',
    text: userText || 'Conduct a full legal analysis of this document under Nigerian law. Identify the document type, extract all text, and assess its legal validity.',
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
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: claudeContent }],
        }),
      });

      if (!res.ok) throw new Error('Claude vision error: ' + res.status);
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
            const text = j.delta?.text || '';
            if (text) await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          } catch { /* skip */ }
        }
      }
    } catch (e: any) {
      console.error('chat-tools vision error:', e?.message || e);
      await writer.write(encoder.encode(`data: ${JSON.stringify({ text: '⚠ Document analysis failed. Please ensure the image is clear and try again.' })}\n\n`));
    } finally {
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Stream': '1', 'X-Source': 'vision' },
  });
}

// ════════════════════════════════════════════════════════════════════
// TOOL: evidence — Claude Sonnet (vision when images, text otherwise)
//                   + Voyage AI RAG for relevant case law
// ════════════════════════════════════════════════════════════════════
async function handleEvidence(systemPrompt: string, images: any[], userText: string, messages: any[]): Promise<Response> {
  // Augment system prompt with RAG-retrieved authorities (timeout 4s)
  let ragCtx = '';
  try {
    const ragPromise = ragSearch(userText, 4);
    const timeout = new Promise<string>(r => setTimeout(() => r(''), 4000));
    ragCtx = await Promise.race([ragPromise, timeout]);
  } catch { ragCtx = ''; }
  const fullSystem = systemPrompt + ragCtx;

  // With images → use vision
  if (images && images.length > 0) {
    const claudeContent: any[] = [];
    for (let i = 0; i < images.length; i++) {
      if (images.length > 1) claudeContent.push({ type: 'text', text: `--- EXHIBIT ${i + 1} ---` });
      claudeContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: images[i].mimeType || 'image/jpeg',
          data: images[i].data,
        },
      });
    }
    claudeContent.push({
      type: 'text',
      text: userText || 'Conduct a full evidence analysis of this exhibit under Nigerian law.',
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
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 6000,
            stream: true,
            system: fullSystem,
            messages: [{ role: 'user', content: claudeContent }],
          }),
        });
        if (!res.ok) throw new Error('Claude evidence vision error: ' + res.status);
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
              const text = j.delta?.text || '';
              if (text) await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            } catch { /* skip */ }
          }
        }
      } catch (e: any) {
        console.error('chat-tools evidence vision error:', e?.message || e);
        await writer.write(encoder.encode(`data: ${JSON.stringify({ text: 'Evidence analysis failed. Please try again.' })}\n\n`));
      } finally {
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      }
    })();
    return new Response(readable, {
      headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Stream': '1', 'X-Source': 'evidence' },
    });
  }

  // Text-only evidence analysis
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
          model: MODEL,
          max_tokens: 6000,
          stream: true,
          system: fullSystem,
          messages: messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
      });
      if (!res.ok) throw new Error('Claude evidence error: ' + res.status);
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
            const text = j.delta?.text || '';
            if (text) await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          } catch { /* skip */ }
        }
      }
    } catch (e: any) {
      console.error('chat-tools evidence text error:', e?.message || e);
      await writer.write(encoder.encode(`data: ${JSON.stringify({ text: 'Evidence analysis failed. Please try again.' })}\n\n`));
    } finally {
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Stream': '1', 'X-Source': 'evidence' },
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
      tool     = 'search',
      messages = [],
      images   = [],
      userType = 'other',
      profile  = {},
      summary  = '',
    } = body;

    const lastMsg = messages[messages.length - 1]?.content || '';

    // Persona / state extras
    let stateExtras = '';
    if (profile?.state) stateExtras += `\nUser's state: ${profile.state}.`;
    if (userType === 'lawyer') {
      if (profile?.court_level)             stateExtras += `\nCourt level: ${profile.court_level}.`;
      if (profile?.specializations?.length) stateExtras += `\nSpecializations: ${profile.specializations.join(', ')}.`;
    }
    const summaryCtx = summary ? `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]` : '';

    if (tool === 'vision') {
      const systemPrompt = buildVisionPrompt(userType, profile) + stateExtras + summaryCtx;
      if (!images || images.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No images provided for vision tool' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
        );
      }
      return handleVision(systemPrompt, images, lastMsg);
    }

    if (tool === 'evidence') {
      const systemPrompt = buildEvidencePrompt(userType) + stateExtras + summaryCtx;
      return await handleEvidence(systemPrompt, images, lastMsg, messages);
    }

    // Default: search
    const systemPrompt = buildSearchPrompt(userType, profile) + stateExtras + summaryCtx;
    return handleSearch(systemPrompt, messages);

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

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
// JWT verification: ON; direct and proxied calls both carry the user's JWT.
// ════════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  readJsonBody,
  requireMethod,
  requirePrincipal,
  securityErrorResponse,
} from "../_shared/security.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const VOYAGE_KEY    = Deno.env.get("VOYAGE_API_KEY")!;
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const MAX_TOOLS_REQUEST_BYTES = 15 * 1024 * 1024;

const MODEL = 'claude-sonnet-4-5';

// Smart fallback chain (Claude → Gemini → Groq) so tools keep working
// through credit gaps while scaling. Gemini also covers images/PDFs.
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? '';
const GROQ_KEY = Deno.env.get("GROQ_API_KEY") ?? '';
const GEMINI_FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-2.0-flash'];
const GROQ_FALLBACK_MODEL = 'llama-3.3-70b-versatile';

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ════════════════════════════════════════════════════════════════════
// SHARED STREAMING WITH FALLBACK
// Accepts Claude-format messages (string content or content blocks) and
// streams via Claude → Gemini → Groq, emitting the same SSE the app expects.
// ════════════════════════════════════════════════════════════════════
function streamLLM(opts: {
  system: string;
  claudeMessages: any[];
  maxTokens: number;
  source: string;
  claudeTools?: any[];
  /** Use Gemini's Google Search grounding when falling back (for the search tool). */
  searchGrounding?: boolean;
  fallbackText: string;
}): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const emit = (text: string) => writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));

  async function pipeSSE(body: ReadableStream<Uint8Array>, pick: (j: any) => string): Promise<number> {
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let emitted = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const text = pick(JSON.parse(data)) || '';
          if (text) { emitted += text.length; await emit(text); }
        } catch { /* skip */ }
      }
    }
    return emitted;
  }

  async function tryClaude(): Promise<boolean> {
    const body: any = {
      model: MODEL,
      max_tokens: opts.maxTokens,
      stream: true,
      system: opts.system,
      messages: opts.claudeMessages,
    };
    if (opts.claudeTools) body.tools = opts.claudeTools;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`chat-tools ${opts.source}: claude unavailable`, res.status, (await res.text()).slice(0, 200));
      return false;
    }
    await pipeSSE(res.body!, (j) =>
      (j.delta?.type !== 'input_json_delta' ? j.delta?.text || '' : ''));
    return true;
  }

  // Convert Claude message content (string or blocks) to Gemini parts.
  function toGeminiParts(content: any): any[] {
    if (typeof content === 'string') return [{ text: content }];
    const parts: any[] = [];
    for (const block of content ?? []) {
      if (block.type === 'text') parts.push({ text: block.text });
      else if ((block.type === 'image' || block.type === 'document') && block.source?.data) {
        parts.push({ inlineData: { mimeType: block.source.media_type || 'image/jpeg', data: block.source.data } });
      }
    }
    return parts;
  }

  async function tryGemini(): Promise<boolean> {
    if (!GEMINI_KEY) return false;
    const contents = opts.claudeMessages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(m.content),
    }));
    const gBody: any = {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents,
      generationConfig: { maxOutputTokens: opts.maxTokens, temperature: 0.4 },
    };
    if (opts.searchGrounding) gBody.tools = [{ google_search: {} }];
    for (const model of GEMINI_FALLBACK_MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(gBody) },
        );
        if (!res.ok) { console.error(`chat-tools ${opts.source} gemini`, model, res.status); continue; }
        const emitted = await pipeSSE(res.body!, (j) =>
          (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join(''));
        if (emitted > 0) return true;
      } catch (e) { console.error(`chat-tools ${opts.source} gemini`, model, String(e)); }
    }
    return false;
  }

  async function tryGroq(): Promise<boolean> {
    if (!GROQ_KEY) return false;
    // Groq is text-only — skip when any message carries image/document blocks.
    const textOnly = opts.claudeMessages.every((m: any) => typeof m.content === 'string');
    if (!textOnly) return false;
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model: GROQ_FALLBACK_MODEL,
          stream: true,
          max_tokens: Math.min(opts.maxTokens, 8192),
          messages: [
            { role: 'system', content: opts.system },
            ...opts.claudeMessages.map((m: any) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: String(m.content ?? ''),
            })),
          ],
        }),
      });
      if (!res.ok) { console.error(`chat-tools ${opts.source} groq`, res.status); return false; }
      const emitted = await pipeSSE(res.body!, (j) => j?.choices?.[0]?.delta?.content || '');
      return emitted > 0;
    } catch (e) { console.error(`chat-tools ${opts.source} groq`, String(e)); return false; }
  }

  (async () => {
    try {
      if (await tryClaude()) return;
      if (await tryGemini()) return;
      if (await tryGroq()) return;
      await emit(opts.fallbackText);
    } catch (e: any) {
      console.error(`chat-tools ${opts.source} error:`, e?.message || String(e));
      await emit(opts.fallbackText);
    } finally {
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Stream': '1', 'X-Source': opts.source },
  });
}

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
  return streamLLM({
    system: systemPrompt,
    claudeMessages: messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    maxTokens: 3000,
    source: 'search',
    claudeTools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    searchGrounding: true, // Gemini fallback searches with Google grounding
    fallbackText: '⚠ Search is temporarily unavailable. Please try again.',
  });
}

// ════════════════════════════════════════════════════════════════════
// TOOL: vision — Claude Sonnet vision streaming
// ════════════════════════════════════════════════════════════════════
function handleVision(systemPrompt: string, images: any[], userText: string, documents: any[] = []): Response {
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
  // Native PDF documents (Claude reads PDFs directly).
  for (let i = 0; i < documents.length; i++) {
    claudeContent.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: documents[i].mimeType || 'application/pdf',
        data: documents[i].data,
      },
    });
  }
  claudeContent.push({
    type: 'text',
    text: userText || 'Conduct a full legal analysis of this document under Nigerian law. Identify the document type, extract all text, and assess its legal validity.',
  });

  return streamLLM({
    system: systemPrompt,
    claudeMessages: [{ role: 'user', content: claudeContent }],
    maxTokens: 4096,
    source: 'vision',
    fallbackText: '⚠ Document analysis failed. Please ensure the image is clear and try again.',
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

    return streamLLM({
      system: fullSystem,
      claudeMessages: [{ role: 'user', content: claudeContent }],
      maxTokens: 6000,
      source: 'evidence',
      fallbackText: 'Evidence analysis failed. Please try again.',
    });
  }

  // Text-only evidence analysis
  return streamLLM({
    system: fullSystem,
    claudeMessages: messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    maxTokens: 6000,
    source: 'evidence',
    fallbackText: 'Evidence analysis failed. Please try again.',
  });
}

// ════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    requireMethod(req, 'POST');
    const principal = await requirePrincipal(req, {
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON,
    });
    if (principal.kind !== 'user') throw new Error('unexpected principal');
    const body = await readJsonBody<any>(req, MAX_TOOLS_REQUEST_BYTES);
    const {
      tool      = 'search',
      messages  = [],
      images    = [],
      documents = [],
      summary   = '',
      language  = 'en',
    } = body;

    let userType = 'other';
    let profile: Record<string, any> = {};
    try {
      const profileResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${principal.id}&select=user_type,state,court_level,specializations`,
        {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          signal: AbortSignal.timeout(8_000),
        },
      );
      const rows = await profileResponse.json();
      if (rows?.[0]) {
        profile = rows[0];
        userType = rows[0].user_type || 'other';
      }
    } catch { /* retain least-privileged defaults */ }

    const lastMsg = messages[messages.length - 1]?.content || '';

    // Persona / state extras
    let stateExtras = '';
    if (profile?.state) stateExtras += `\nUser's state: ${profile.state}.`;
    if (userType === 'lawyer') {
      if (profile?.court_level)             stateExtras += `\nCourt level: ${profile.court_level}.`;
      if (profile?.specializations?.length) stateExtras += `\nSpecializations: ${profile.specializations.join(', ')}.`;
    }
    const summaryCtx = summary ? `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]` : '';

    // When the user chose a Nigerian language, explain everything in it.
    const LANG_NAMES: Record<string, string> = {
      en: 'English', pcm: 'Nigerian Pidgin', yo: 'Yoruba', ha: 'Hausa', ig: 'Igbo',
    };
    const langCode = String(language || 'en').toLowerCase();
    const langCtx = (langCode !== 'en' && LANG_NAMES[langCode])
      ? `\n\nLANGUAGE RULE (CRITICAL): Write your ENTIRE response in ${LANG_NAMES[langCode]}, clear and natural as spoken in Nigeria. Where a legal term has no clean ${LANG_NAMES[langCode]} word, keep the English term and explain it in brackets. Never sacrifice legal accuracy for language.`
      : '';

    if (tool === 'vision') {
      const systemPrompt = buildVisionPrompt(userType, profile) + stateExtras + summaryCtx + langCtx;
      if ((!images || images.length === 0) && (!documents || documents.length === 0)) {
        return new Response(
          JSON.stringify({ error: 'No images or documents provided for vision tool' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
        );
      }
      return handleVision(systemPrompt, images, lastMsg, documents);
    }

    if (tool === 'evidence') {
      const systemPrompt = buildEvidencePrompt(userType) + stateExtras + summaryCtx + langCtx;
      return await handleEvidence(systemPrompt, images, lastMsg, messages);
    }

    // Default: search
    const systemPrompt = buildSearchPrompt(userType, profile) + stateExtras + summaryCtx + langCtx;
    return handleSearch(systemPrompt, messages);

  } catch (err: unknown) {
    return securityErrorResponse(err, CORS);
  }
});

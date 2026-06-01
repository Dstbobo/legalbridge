import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const VOYAGE_KEY = Deno.env.get("VOYAGE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── EVIDENCE ACT 2011 KNOWLEDGE BASE ──
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
- Exceptions to hearsay:
  * s.40: Admissions and confessions
  * s.41: Statements in dying declarations
  * s.43: Statements against interest
  * s.44: Statements in public documents
  * s.46: Statements in ancient documents (over 30 years)
  * s.48: Statements by persons who cannot be called

BURDEN & STANDARD OF PROOF:
- s.131: Burden of proof on party asserting fact
- s.132: Burden shifts on proof of primary fact
- s.134: Standard in criminal cases = beyond reasonable doubt
- s.135: Standard in civil cases = balance of probabilities
- Woolmington v. DPP [1935] AC 462 — golden thread principle (applied in Nigeria)

CHARACTER EVIDENCE:
- s.77: Character of accused in criminal cases
- s.78: Evidence of bad character admissible only in specific circumstances
- s.79: Good character of accused — entitled to put in evidence

EXPERT EVIDENCE:
- s.68: Opinions of experts admissible on scientific/technical matters
- s.69: Expert must give reasons for opinion
- Applicable fields: medical, forensic, handwriting, digital forensics, ballistics

PRIVILEGED COMMUNICATIONS:
- s.192: Legal professional privilege — communications between lawyer and client
- s.195: Without prejudice communications
- s.196: Official communications — public interest immunity

WITNESSES:
- s.155: Competence of witnesses
- s.156: Every person competent unless court considers otherwise
- s.157: Spouses — competent but not compellable in most cases
- s.180: Cross-examination on previous inconsistent statements
- s.182: Refreshing memory from documents

FORGERY INDICATORS (Evidence Act + Criminal Code):
- Inconsistent fonts/typefaces within single document
- Date tampering (overwriting, correction fluid)
- Mismatched signatures on same document
- Stamp/seal irregularities (wrong format, faded inconsistently)
- Serial number anomalies
- Paper quality inconsistencies
- Section 465 Criminal Code: forgery defined
- Section 467 Criminal Code: uttering forged documents`;

// ── CHAIN OF CUSTODY FRAMEWORK ──
const CHAIN_OF_CUSTODY = `
CHAIN OF CUSTODY REQUIREMENTS (Nigerian Courts):

1. COLLECTION: Who collected? When? Where? Method used?
2. PRESERVATION: How stored? Conditions? Sealed/labelled?
3. TRANSFER: Log of every person who handled exhibit
4. ANALYSIS: Who examined? Methods used? Qualifications?
5. COURT PRODUCTION: Exhibit properly marked and identified

PHYSICAL EVIDENCE:
- Exhibit number assigned by police/court
- Property register entry required
- Continuous custody log
- No tampering/contamination

DIGITAL EVIDENCE:
- Hash verification (MD5/SHA-256) to prove integrity
- Forensic copy (bit-by-bit) of original
- Write blocker used during extraction
- Qualified forensic examiner
- ISO 27037 guidelines (international standard)
- ACPO guidelines (applied by Nigerian courts)

BIOLOGICAL/FORENSIC EVIDENCE:
- DNA chain of custody — critical
- Proper storage temperature
- No cross-contamination
- Accredited laboratory analysis
- Expert witness to testify on methodology

BREAKS IN CHAIN OF CUSTODY:
- Can go to weight of evidence (not necessarily inadmissible)
- Defence counsel should raise and exploit
- Court has discretion on admission`;

// ── RAG SEARCH FOR EVIDENCE CASES ──
async function searchEvidenceLaw(query: string): Promise<string> {
  try {
    const eRes = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${VOYAGE_KEY}` },
      body: JSON.stringify({ model: "voyage-law-2", input: [query.slice(0, 1500)], input_type: "query" })
    });
    const eData = await eRes.json();
    const emb = eData?.data?.[0]?.embedding;
    if (!emb) return '';

    const sRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_legal_documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ query_embedding: emb, match_count: 4 })
    });
    const docs = await sRes.json();
    if (!docs?.length) return '';

    let ctx = '\n\n[RETRIEVED EVIDENCE LAW AUTHORITIES]\n';
    for (const d of docs) {
      if (d.similarity > 0.55) {
        ctx += `SOURCE: ${d.source}${d.section_number ? ' | ' + d.section_number : ''}\n${d.content}\n---\n`;
      }
    }
    return ctx + '[END AUTHORITIES]\n';
  } catch { return ''; }
}

// ── BUILD EVIDENCE ANALYSIS PROMPT ──
function buildEvidencePrompt(userType: string, analysisType: string): string {
  const base = `You are LegalBridge Evidence AI — Nigeria's most advanced legal evidence analysis system.

JURISDICTION: Nigerian law exclusively.
PRIMARY LAW: Evidence Act 2011; ACJA 2015; Criminal Code; Penal Code; Constitution of Nigeria 1999.

${EVIDENCE_ACT_KNOWLEDGE}

${CHAIN_OF_CUSTODY}`;

  const userFormats: Record<string, string> = {
    lawyer: `
FORMAT YOUR ANALYSIS AS:

**EVIDENCE OVERVIEW**
Type of evidence, source, and what it purports to prove.

**ADMISSIBILITY ANALYSIS**
- Primary admissibility test (relevance — Evidence Act s.4)
- Specific admissibility rules applicable (cite exact sections)
- Conditions that must be satisfied for admission
- Likely objections from opposing counsel
- Counter-arguments to objections

**AUTHENTICATION & FOUNDATION**
- How must this evidence be authenticated?
- Who must testify to lay the foundation?
- Documents required to accompany the exhibit

**CHAIN OF CUSTODY ASSESSMENT**
- Custody requirements for this evidence type
- Identified gaps or weaknesses
- How breaks in custody affect weight vs admissibility

**FORGERY/INTEGRITY ANALYSIS** (if document)
- Indicators of authenticity or forgery
- Technical anomalies identified
- Recommended forensic examination

**EVIDENTIAL WEIGHT**
- How much weight will court likely give this evidence?
- Corroborating evidence needed
- Vulnerabilities under cross-examination

**CASE LAW**
- Relevant Nigerian authorities on this evidence type
- Full NWLR/LPELR citations
- Ratio decidendi applicable

**STRATEGIC RECOMMENDATIONS**
- For prosecution/claimant: how to maximize this evidence
- For defence/defendant: how to challenge or exclude it
- Additional evidence needed to strengthen position

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

**WHAT IS THIS EVIDENCE?**
Explain simply what type of evidence this is.

**CAN IT BE USED IN COURT?**
Explain whether this evidence is likely admissible.

**HOW STRONG IS IT?**
Explain how much weight a court will give it.

**WHAT PROBLEMS EXIST?**
Flag any issues with this evidence.

**WHAT SHOULD YOU DO?**
Practical next steps.`
  };

  return base + (userFormats[userType] || userFormats['other']);
}

// ── MAIN HANDLER ──
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const {
      messages = [],
      images = [], // For document/physical evidence images
      userType = 'other',
      analysisType = 'general', // admissibility | chain_of_custody | forgery | weight | general
      summary = '',
      profile = {}
    } = body;

    const lastMsg = messages[messages.length - 1]?.content || '';

    // Build system prompt
    let systemPrompt = buildEvidencePrompt(userType, analysisType);

    // Add profile context
    if (profile?.state) systemPrompt += `\nUser's state: ${profile.state}.`;
    if (userType === 'lawyer') {
      if (profile?.court_level) systemPrompt += `\nCourt level: ${profile.court_level}.`;
      if (profile?.specializations?.length) systemPrompt += `\nSpecializations: ${profile.specializations.join(', ')}.`;
    }

    // Add conversation summary
    if (summary) systemPrompt += `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]`;

    // RAG search for relevant evidence law
    let ragCtx = '';
    try {
      const ragPromise = searchEvidenceLaw(lastMsg);
      const timeout = new Promise<string>(r => setTimeout(() => r(''), 4000));
      ragCtx = await Promise.race([ragPromise, timeout]);
    } catch { ragCtx = ''; }

    systemPrompt += ragCtx;

    // If images provided — use vision + evidence analysis
    if (images && images.length > 0) {
      // Build multimodal request for Gemini Vision
      const parts: any[] = [];
      for (let i = 0; i < images.length; i++) {
        if (images.length > 1) parts.push({ text: `--- EXHIBIT ${i + 1} ---` });
        parts.push({ inlineData: { mimeType: images[i].mimeType || 'image/jpeg', data: images[i].data } });
      }
      parts.push({ text: lastMsg || 'Conduct a full evidence analysis of this exhibit under Nigerian law.' });

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              systemInstruction: { parts: [{ text: systemPrompt }] },
              generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
            })
          }
        );
        const d = await res.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to analyse exhibit.';

        // Stream the response
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
          headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Stream': '1', 'X-Source': 'evidence' }
        });
      } catch (e) { /* fall through to text-only analysis */ }
    }

    // Text-only evidence analysis — Claude Sonnet streaming
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 6000,
            stream: true,
            system: systemPrompt,
            messages: messages.map((m: any) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content
            }))
          })
        });

        if (!res.ok) throw new Error('Claude error');
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
      } catch (e) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ text: "Evidence analysis failed. Please try again." })}\n\n`));
      } finally {
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Stream': '1', 'X-Source': 'evidence' }
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
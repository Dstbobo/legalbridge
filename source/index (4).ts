import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;
const VOYAGE_KEY = Deno.env.get("VOYAGE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function searchLegalKnowledge(query: string): Promise<string> {
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
    let ctx = '\n\n[RETRIEVED NIGERIAN LEGAL AUTHORITIES]\n';
    for (const d of docs) {
      if (d.similarity > 0.55) {
        ctx += `SOURCE: ${d.source}${d.section_number ? ' | ' + d.section_number : ''}\n${d.content}\n---\n`;
      }
    }
    return ctx + '[END AUTHORITIES]\n';
  } catch { return ''; }
}

// ── BASE (shared by all prompts) ──
const BASE = `Nigerian legal AI. Apply Nigerian law exclusively. Cite precisely: "By virtue of Section X of [Act] [Year]..." Cases: Party v Party (Year) [Vol] NWLR (Pt. X) Page. Never fabricate citations. Verify uncertain citations on NigeriaLII/LawPavilion. Always complete every section — never stop mid-response.`;

// ── LAWYER: ADVISORY (Legal Opinion) ──
const LAWYER_OPINION = `${BASE}

USER: Licensed Nigerian Legal Practitioner — peer-level analysis.

FORMAT — LEGAL OPINION:
**INTRODUCTION** — Frame the legal question and scope.
**FACTS / BACKGROUND** — Relevant facts as presented.
**ISSUES FOR DETERMINATION** — Number each issue precisely.
**APPLICABLE LAW** — Governing statutes and constitutional provisions with exact section references.
**STATUTORY PROVISIONS** — Substance of critical provisions with section numbers.
**RELEVANT CASE LAW** — For each authority: full NWLR/LPELR citation | ratio decidendi | connection to issue.
**LEGAL ANALYSIS** — Apply law to facts. Address: legal principles, judicial policy, procedural requirements, consequences of non-compliance, constitutional implications (Chapter IV CFRN 1999 + FREP Rules 2009 where relevant). Use: locus standi, mesne profits, trespass, tenant at sufferance, interlocutory/perpetual injunction, equitable relief, res judicata, estoppel, ab initio as appropriate.
**REMEDIES / LEGAL POSITION** — Available remedies with forum and procedure.
**CONCLUSION** — Definitive position on each issue.

*Authorities should be verified on NigeriaLII, LawPavilion, or approved Nigerian law reports before reliance in litigation.*`;

// ── LAWYER: LITIGATION (Litigation Memo) ──
const LAWYER_LITIGATION = `${BASE}

USER: Licensed Nigerian Legal Practitioner — peer-level analysis.

FORMAT — LITIGATION MEMORANDUM:
**ISSUES** — Precise issues for litigation.
**APPLICABLE PROCEDURE** — Correct procedural vehicle (Writ/Originating Summons/Motion), applicable court rules, pre-action requirements.
**JURISDICTION** — Subject matter, territorial, parties (locus standi), applicable court, exclusive vs concurrent.
**EVIDENCE** — Facts to prove, documents required, burden/standard of proof, admissibility (Evidence Act 2011).
**STRATEGY** — Cause(s) of action, ex parte vs inter partes, interlocutory reliefs (injunctions, Mareva, Anton Piller), limitation issues.
**REMEDIES** — Declaratory, injunctive (interlocutory/perpetual), damages (general/special/exemplary), mesne profits, constitutional reliefs (FREP Rules 2009).
**RISKS** — Case weaknesses, limitation issues, jurisdiction risks, evidence gaps.
**CONCLUSION** — Strategic recommendation.

*Procedural rules and authorities should be verified against current court rules and NigeriaLII before filing.*`;

// ── STUDENT (Elevated IRAC) ──
const STUDENT = `${BASE}

USER: Nigerian Law Student — academic, educational.

FORMAT — IRAC:
**ISSUE** — Precise legal question(s).
**RULE** — Governing framework: constitutional provisions (CFRN 1999 exact sections), statutes with section numbers, common law principles in Nigeria.
**STATUTORY PROVISIONS** — Critical provisions with exact section numbers.
**CASE LAW** — For each authority: NWLR/LPELR citation, court, ratio decidendi, application to issue.
**APPLICATION** — Apply law to facts: statutory provisions, case connections, competing arguments, judicial policy.
**CONCLUSION** — Legal conclusion; acknowledge judicial uncertainty or academic debate.

*Verify all citations independently. Cross-check statutory texts against official sources such as NigeriaLII.*`;

// ── BUSINESS (Advisory Note) ──
const BUSINESS = `${BASE}

USER: Nigerian Business Owner — practical, commercial.

FORMAT — LEGAL ADVISORY NOTE:
**EXECUTIVE SUMMARY** — Legal position and key action in 2–3 sentences.
**LEGAL FRAMEWORK** — Governing laws with precise citations (CAMA 2020, FIRS, CBN, Labour Act, state laws).
**STATUTORY OBLIGATIONS** — Compliance requirements, deadlines, penalties with section references.
**LEGAL ANALYSIS** — Liability exposure, contractual implications, regulatory risk.
**COMPLIANCE CHECKLIST** — Numbered practical steps to comply with Nigerian law.
**RISK ASSESSMENT** — Legal, regulatory, and commercial risks.
**RECOMMENDATIONS** — Prioritised actions.
**CONCLUSION** — Clear recommendation.

⚠️ *This advisory note is for general information. Obtain independent legal advice from a qualified Nigerian legal practitioner before acting.*`;

// ── JOURNALIST (Press Law Advisory) ──
const JOURNALIST = `${BASE}

USER: Nigerian Journalist — press law, FOI, defamation.

FORMAT — PRESS LAW ADVISORY:
**LEGAL CONTEXT** — Governing framework: FOI Act 2011, Cybercrime Act 2015, Nigerian Press Council Act, defamation law, Official Secrets Act.
**PRESS RIGHTS** — Constitutional protections (Sections 22, 39 CFRN 1999) and statutory rights.
**LEGAL EXPOSURE** — Civil (defamation, privacy, breach of confidence) and criminal exposure with statutory references.
**PROTECTIVE MEASURES** — Responsible journalism defence, fair comment, justification, privilege, Section 7 FOI Act protections.
**PRACTICAL GUIDANCE** — Lawful reporting, source protection, FOI applications.
**CONCLUSION** — Legal position and precautions.

⚠️ *Consult a qualified Nigerian media lawyer before publication of sensitive material or when facing legal action.*`;

// ── INDIVIDUAL (Plain English) ──
const INDIVIDUAL = `You are LegalBridge AI — a helpful Nigerian legal assistant. User is an ordinary Nigerian citizen.

TONE: Plain English. Warm. Clear. NO legal jargon. NO Latin terms. NO law report citations.

FORMAT:
**WHAT IS HAPPENING** — Explain simply in everyday language.
**YOUR RIGHTS** — What the law entitles you to — explained simply.
**WHAT THE LAW SAYS** — The key rule in plain English. Mention the law name simply.
**WHAT YOU SHOULD DO** — Numbered practical steps.
**WATCH OUT FOR** — Important warnings in plain language.
**BOTTOM LINE** — 1–2 sentences summarising the key message.

⚠️ *This is legal information, not legal advice. For your specific situation, speak with a qualified Nigerian lawyer or contact the Legal Aid Council of Nigeria.*`;

// ── MODULES (concise, precise citations) ──
const MODULES: Record<string, string> = {
  TENANCY: `
[TENANCY MODULE]
Legislation: Lagos State Tenancy Law 2011 (No.13 of 2011); Recovery of Premises Act (Cap R4 LFN 2004); Land Use Act 1978 s.22.
Notice Periods (s.13 Lagos Tenancy Law): Weekly=1wk | Monthly=1mth | Quarterly=3mths | Yearly=6mths.
Eviction Procedure (s.44): Notice to Quit → 7-Day Notice of Intention → Court (Magistrate/High) → Judgment → Warrant of Possession (bailiff only).
Self-help eviction (s.45) = criminal offence: locking out, cutting utilities, removing belongings, physical ejection without Warrant of Possession.
Cases: Governor of Lagos State v. Ojukwu (1986) 1 NWLR (Pt.18) 621 — self-help illegal even where right to possession established; Danfulani v. Shekari (1994) 3 NWLR (Pt.330) 215 — validity of notice to quit.
Concepts: tenant at sufferance; trespass; breach of quiet enjoyment; mesne profits; interlocutory injunction.`,

  TRAFFIC: `
[TRAFFIC & LAW ENFORCEMENT MODULE]
Framework: Police Act 2020 (ss.38-45 — arrest powers); FRSC Act (Cap F19 LFN 2004); Constitution ss.35,36,37.
NPF: Criminal matters + document checks. Cannot search phones without warrant (s.37 CFRN; ss.29-30 Cybercrime Act 2015).
Armed Forces: Internal security ONLY — no traffic fines, no impounding civilian vehicles (Armed Forces Act; s.217 CFRN).
NSCDC: Infrastructure protection ONLY — no traffic enforcement powers.
FRSC: Primary highway authority — licences, speed limits, Notice of Offence Sheet on federal roads.
Extortion at checkpoints = criminal offence (s.408 Criminal Code / s.311 Penal Code). Report to PSC, NHRC, or DPP.`,

  SEXUAL: `
[SEXUAL OFFENCES MODULE]
Laws: VAPP Act 2015; Child Rights Act 2003; Criminal Code ss.357-360; Penal Code s.282; Trafficking Act 2015.
Penalties (VAPP): Rape s.1 = min 12yrs/life; Marital rape s.1(2) = 3yrs; FGM s.6 = 4yrs; Domestic violence s.4 = 3yrs/N200k.
Defilement (CRA s.31): Sex with person under 18 = 14yrs to life. Consent legally irrelevant.
Victim steps: Preserve evidence → Medical (72hrs, Mirabel Centre Lagos) → Police FSU or NAPTIP → Emergency Protection Order (Magistrate Court).
Emergency: NAPTIP 0800-NAPTIP | NHRC 09-523-0007 | Legal Aid 01-460-1797.`,

  RIGHTS: `
[FUNDAMENTAL RIGHTS MODULE]
Framework: Chapter IV CFRN 1999 (ss.33-46). Enforcement: FREP Rules 2009 — Originating Motion to High Court.
Key rights: s.33 life | s.34 dignity/no torture | s.35 liberty (max 24hrs detention, 48hrs terrorism) | s.36 fair hearing/right to counsel | s.40 assembly | s.41 movement.
Remedies: Release from detention; injunction; damages; declaration; compensation.
Authority: Ransome-Kuti v. AG Federation (1985) 2 NWLR (Pt.6) 211.
Emergency: NAPTIP 0800-NAPTIP | NHRC 09-523-0007 | Legal Aid 01-460-1797.`,

  POLITICAL: `
[POLITICAL ACCOUNTABILITY MODULE]
Laws: CFRN 1999 Fifth Schedule (Code of Conduct); Code of Conduct Bureau Act; EFCC Act 2004; ICPC Act 2000; Electoral Act 2022.
s.308 immunity: ONLY President, VP, Governors, Deputy Governors while in office. NOT Senators, Reps, LGA Chairmen.
Phantom contracts/diversion of funds = criminal liability under EFCC Act ss.14-18 and ICPC Act ss.8-9.
Electoral Act s.97: Campaign based on religion/tribe = criminal offence. s.132: Election petitions within 21 days of declaration.`,

  CRIMINAL: `
[CRIMINAL LAW MODULE]
Laws: Criminal Code (Cap C38 — South); Penal Code (Cap P3 — North); ACJA 2015.
Arrest rights (s.35 CFRN; ss.6-8 ACJA): Reason for arrest | Right to silence | Lawyer immediately | Max 24hrs detention | Bail right for non-capital offences.
Standard of proof: Beyond reasonable doubt (s.135 Evidence Act 2011).
Key offences: Murder = death (s.319 Criminal Code) | Armed robbery = death (Robbery & Firearms Act) | Rape = life (s.1 VAPP) | Kidnapping = life/death (state laws).
ACJA innovations: Plea bargaining (s.270); electronic confessions; victim impact statements; non-custodial sentencing (s.296).`,

  EMPLOYMENT: `
[EMPLOYMENT MODULE]
Laws: Labour Act (Cap L1 LFN 2004); National Industrial Court Act 2006; Employee's Compensation Act 2010; Pension Reform Act 2014.
Jurisdiction: NICN has EXCLUSIVE jurisdiction (s.254C CFRN 1999 Third Alteration).
Notice (Labour Act s.11): <3mths=1day | 3mths-2yrs=1wk | 2-5yrs=2wks | >5yrs=1mth. Summary dismissal requires fair hearing (Garba v. University of Maiduguri (1986) 1 NWLR (Pt.18) 550).
Minimum wage: N70,000/mth (2024). Pension: Employer 10% + Employee 8% (Pension Reform Act s.11). NSITF: 1% monthly payroll.`,

  PROPERTY: `
[LAND LAW MODULE]
Framework: Land Use Act 1978 (Cap L5 LFN 2004) — all land vested in Governor (s.1).
C of O (s.9): Strongest title. Governor's Consent (s.22): MANDATORY for any alienation — without it transaction void ab initio.
Authority: Savannah Bank v. Ajilo (1989) 1 NWLR (Pt.97) 305 — mortgage without consent void.
Five ways to prove title: Traditional evidence | Documents of title | Long possession | Connected land | Recent acts of ownership. (Idundun v. Okumagba (1976) 9-10 SC 227).
Due diligence: Land Registry search | Authenticate C of O | Verify Governor's Consent | Survey plan | Physical inspection.`,

  CORPORATE: `
[CORPORATE MODULE]
Law: CAMA 2020; FCCPA 2018; ISA 2007.
CAC incorporation: Name search → MEMAT → CAC 1.1 → Fees + stamp duty → Certificate.
Directors' duties (CAMA ss.265-270): Good faith | Skill/care/diligence | No conflicts | No secret profits | No unauthorized loans (s.311).
Annual obligations: Annual Returns to CAC (s.417) | Tax returns to FIRS | Sectoral compliance.
Contract validity: Offer + Acceptance + Consideration + Intention + Capacity + Legality.`
};

function detectModules(text: string): string[] {
  const t = text.toLowerCase();
  const m: string[] = [];
  if (/landlord|tenant|rent|evict|tenancy|lease|recovery of premises|mesne profit|warrant of possession/.test(t)) m.push('TENANCY');
  if (/police|soldier|army|frsc|lastma|checkpoint|roadblock|nscdc|law enforcement/.test(t)) m.push('TRAFFIC');
  if (/rape|sexual|molest|abuse|child|minor|vapp|naptip|defilement|trafficking|domestic violence/.test(t)) m.push('SEXUAL');
  if (/fundamental rights|chapter iv|section 3[3-6]|frep|torture|unlawful detention|habeas corpus/.test(t)) m.push('RIGHTS');
  if (/politician|governor|senator|efcc|icpc|corruption|bribe|election|public officer|section 308/.test(t)) m.push('POLITICAL');
  if (/crime|criminal|murder|robbery|theft|steal|arrested|charge|bail|prosecution|conviction|acja/.test(t)) m.push('CRIMINAL');
  if (/employment|fired|dismiss|sack|salary|wage|pension|labour|nicn|wrongful|redundan/.test(t)) m.push('EMPLOYMENT');
  if (/land|property|c of o|certificate of occupancy|governor.?s consent|deed|title|survey|land use act/.test(t)) m.push('PROPERTY');
  if (/company|cac|cama|register|business|startup|contract|trademark|patent|copyright|director/.test(t)) m.push('CORPORATE');
  return m;
}

function isLitigation(text: string): boolean {
  return /\b(procedure|court|file|enforce|strategy|litigation|sue|claim|injunction|appeal|motion|writ|originating summons|interlocutory|ex parte|jurisdiction|evidence|burden of proof|limitation|locus standi|pleading|execution|garnishee|contempt|certiorari|mandamus|habeas corpus)\b/i.test(text);
}

function needsClaude(text: string): boolean {
  return /\b(draft|generate|write|prepare|affidavit|memo|agreement|contract|deed|petition|motion|writ|notice to quit|letter of demand|analyse|interpret|section \d+|statute|case law|legal argument|constitutional|court procedure|appeal|advise|advisory|legal opinion)\b/i.test(text);
}

function needsLive(text: string): boolean {
  return /\b(latest|recent|current|today|new law|new act|just passed|2024|2025|2026|amendment|live|breaking|news|update)\b/i.test(text);
}

function buildPrompt(msg: string, uType: string, extras: string): string {
  let base: string;
  if (uType === 'lawyer') base = isLitigation(msg) ? LAWYER_LITIGATION : LAWYER_OPINION;
  else if (uType === 'student') base = STUDENT;
  else if (uType === 'business') base = BUSINESS;
  else if (uType === 'journalist') base = JOURNALIST;
  else base = INDIVIDUAL;

  const mods = detectModules(msg);
  let prompt = base;
  for (const m of mods) if (MODULES[m]) prompt += `\n${MODULES[m]}`;
  if (extras) prompt += extras;
  return prompt;
}

function getPersona(profile: any): { uType: string; extras: string } {
  const uType = profile?.user_type || 'other';
  let extras = '\n[USER PROFILE]';
  if (profile?.state) extras += ` State: ${profile.state}.`;
  if (uType === 'lawyer') {
    if (profile?.experience) extras += ` Experience: ${profile.experience}.`;
    if (profile?.court_level) extras += ` Court: ${profile.court_level}.`;
    if (profile?.specializations?.length) extras += ` Specializations: ${profile.specializations.join(', ')}.`;
    extras += ' Calibrate depth and tactical detail to this practitioner\'s court level and specialization.';
  } else if (uType === 'student') {
    if (profile?.study_year) extras += ` Year: ${profile.study_year}.`;
  } else if (uType === 'business') {
    if (profile?.biz_type) extras += ` Business: ${profile.biz_type}.`;
  }
  if (profile?.bio) extras += ` Context: ${profile.bio}`;
  return { uType, extras };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { messages, image } = body;

    // Load user profile
    let uType = 'other', extras = '';
    try {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      if (token && SUPABASE_URL && SUPABASE_KEY) {
        const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_KEY }
        });
        const uData = await uRes.json();
        if (uData?.id) {
          const pRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uData.id}&select=*`, {
            headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY }
          });
          const profiles = await pRes.json();
          if (profiles?.[0]) {
            const p = getPersona(profiles[0]);
            uType = p.uType;
            extras = p.extras;
          }
        }
      }
    } catch { /* silent */ }

    const lastMsg = messages?.[messages.length - 1]?.content || "";

    // Smart conversational mode — short non-legal messages use lightweight fast response
    const isConversational = (
      lastMsg.trim().length < 80 &&
      !/\b(section|act|statute|rights|court|charge|crime|offence|contract|land|property|evict|tenant|landlord|employ|dismiss|salary|arrest|bail|sue|claim|remedy|legal|illegal|lawful|penalty|liability|enforce|draft|prepare|advise|analyse|constitution|tribunal|jurisdiction|appeal|evidence|affidavit|deed|agreement|petition|writ|EFCC|ICPC|VAPP|ACJA|CAMA|FRSC|NWLR)\b/i.test(lastMsg)
    );

    if (isConversational) {
      const convPersona: Record<string, string> = {
        lawyer: "You are LegalBridge AI — a Nigerian legal assistant. The user is a licensed Nigerian lawyer. Be warm, professional and collegial. Engage naturally in conversation. If they need legal help, encourage them to ask their legal question. Keep responses short — no legal opinion format for casual chat.",
        student: "You are LegalBridge AI — a Nigerian legal assistant. The user is a Nigerian law student. Be warm, encouraging and helpful. Engage naturally. Guide them to ask their legal research question when ready. Keep responses short and friendly.",
        business: "You are LegalBridge AI — a Nigerian legal assistant. The user is a Nigerian business owner. Be warm, practical and engaging. Help them navigate to their business or legal question. Keep responses short and conversational.",
        journalist: "You are LegalBridge AI — a Nigerian legal assistant. The user is a Nigerian journalist. Be warm and professional. Engage naturally and guide them to their press law or FOI question when ready. Keep responses short.",
        other: "You are LegalBridge AI — a friendly Nigerian legal assistant. Be warm, helpful and accessible in plain English. Engage naturally in conversation and help the user navigate to their legal question when ready. Keep responses short and friendly. No jargon."
      };
      const sysConv = convPersona[uType] || convPersona["other"];
      try {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" + GEMINI_KEY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: messages.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
            systemInstruction: { parts: [{ text: sysConv }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
          })
        });
        const d = await res.json();
        const response = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (response) return new Response(JSON.stringify({ success: true, response }), { headers: { ...CORS, "Content-Type": "application/json" } });
      } catch(_) { /* fall through to main routes */ }
    }
    // RAG only for substantive legal queries — skip for greetings and simple questions
    const needsRAG = (
      lastMsg.length > 40 &&
      /(section|act|law|statute|rights|court|charge|crime|offence|contract|land|property|evict|tenant|landlord|employ|dismiss|salary|arrest|bail|court|sue|claim|remedy|legal|illegal|lawful|unlawful|penalty|liability|obligation|enforce|draft|prepare|advise|analyse|interpret|constitution|tribunal|jurisdiction|appeal|evidence|affidavit|deed|agreement|petition|writ|motion|EFCC|ICPC|VAPP|ACJA|CAMA|FRSC|NWLR|Lagos|Abuja|Nigeria law)/i.test(lastMsg)
    );

    // RAG with 4-second timeout — skip if slow
    let ragCtx = '';
    if (needsRAG) {
      try {
        const ragPromise = searchLegalKnowledge(lastMsg);
        const timeoutPromise = new Promise<string>(resolve => setTimeout(() => resolve(''), 4000));
        ragCtx = await Promise.race([ragPromise, timeoutPromise]);
      } catch { ragCtx = ''; }
    }
    const SYSTEM = buildPrompt(lastMsg, uType, extras) + ragCtx;

    // Route 1: Image
    if (image) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: lastMsg || "Analyse this document under Nigerian law." }] }],
          systemInstruction: { parts: [{ text: SYSTEM }] },
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || "Vision error");
      return new Response(JSON.stringify({ success: true, response: d.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to analyse." }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Route 2: Document drafting → Claude Sonnet
    if (/\b(draft|generate|write|prepare)\b.*\b(affidavit|agreement|contract|deed|letter|notice|memo|petition|writ|motion|brief|opinion)\b/i.test(lastMsg)) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 4000,
          system: SYSTEM + "\n\nDRAFTING MODE: Produce a complete Nigerian legal document. Apply Nigerian drafting conventions — recitals, operative clauses, schedules, signature blocks, clause numbering. Cite governing Nigerian statutes in recitals.",
          messages: messages.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || "Claude error");
      return new Response(JSON.stringify({ success: true, response: d.content?.[0]?.text || "Drafting failed." }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Route 3: Live data → Gemini + Search
    if (needsLive(lastMsg)) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 25000);
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: messages.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
            systemInstruction: { parts: [{ text: SYSTEM }] },
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
          })
        });
        clearTimeout(to);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error?.message);
        let response = d.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to retrieve.";
        const links = (d.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
          .filter((c: any) => c?.web?.uri && !c.web.uri.includes('vertexaisearch')).slice(0, 5)
          .map((c: any) => `<li><a href="${c.web.uri}" target="_blank" style="color:#4a8ef5">${c.web.title || c.web.uri}</a></li>`).join("");
        if (links) response += `<div style="margin-top:14px;padding:12px;background:rgba(74,142,245,0.08);border-radius:8px;border-left:3px solid #4a8ef5"><strong>📰 Sources:</strong><ul style="margin-top:6px;padding-left:16px">${links}</ul></div>`;
        return new Response(JSON.stringify({ success: true, response }), { headers: { ...CORS, "Content-Type": "application/json" } });
      } catch { /* fall through */ }
    }

    // Route 4: Statute-heavy → Claude Sonnet
    if (needsClaude(lastMsg)) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 4096,
          system: SYSTEM,
          messages: messages.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || "Claude error");
      return new Response(JSON.stringify({ success: true, response: d.content?.[0]?.text || "Unable to process." }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Route 5: General → Gemini Flash (with Claude fallback)
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: messages.map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          systemInstruction: { parts: [{ text: SYSTEM }] },
          generationConfig: { temperature: 0.4, maxOutputTokens: 4096 }
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || "Gemini error");
      const response = d.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!response) throw new Error("Empty Gemini response");
      return new Response(JSON.stringify({ success: true, response }), { headers: { ...CORS, "Content-Type": "application/json" } });
    } catch(_geminiErr) {
      // Gemini failed — fallback to Claude Sonnet
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5", max_tokens: 2048,
          system: SYSTEM,
          messages: messages.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error?.message || "Fallback error");
      return new Response(JSON.stringify({ success: true, response: d.content?.[0]?.text || "Unable to process." }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
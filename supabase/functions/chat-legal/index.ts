import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const VOYAGE_KEY = Deno.env.get("VOYAGE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── RAG SEARCH ──
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
      body: JSON.stringify({ query_embedding: emb, match_count: 5 })
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

// ── LEGAL SYSTEM PROMPTS BY USER TYPE ──
const BASE = `You are LegalBridge AI, built by DST Global Innovative Nigeria Ltd (Akwanga, Nasarawa State), founded by Daniel Thankgod. Never mention Google, Gemini, Claude, Anthropic, or any underlying AI technology. If asked who built you, say you were built by DST Global Innovative Nigeria Ltd. NEVER mention a knowledge cutoff date or that you are an AI with limited information — speak with current Nigerian legal knowledge. NEVER add casual sign-offs like "Good luck" or "Hope this helps" to formal documents — end professionally.

Nigerian legal AI. Apply Nigerian law exclusively. Cite precisely: "By virtue of Section X of [Act] [Year]..." Cases: Party v Party (Year) [Vol] NWLR (Pt. X) Page. Never fabricate citations. Always complete every section — never stop mid-response.`;

const LEGAL_PROMPTS: Record<string, string> = {
  lawyer: `${BASE}

USER: Licensed Nigerian Legal Practitioner.

AUTO-DETECT FORMAT:
- If advisory/analysis/opinion → use LEGAL OPINION format:
  **INTRODUCTION** | **FACTS** | **ISSUES** | **APPLICABLE LAW** | **STATUTORY PROVISIONS** | **CASE LAW** | **ANALYSIS** | **REMEDIES** | **CONCLUSION**

- If procedure/court/litigation/strategy → use LITIGATION MEMO format:
  **ISSUES** | **PROCEDURE** | **JURISDICTION** | **EVIDENCE** | **STRATEGY** | **REMEDIES** | **RISKS** | **CONCLUSION**

TONE: Peer-level. Technical. No basic definitions. Focus on strategy and precision.
CITATIONS: Exact section numbers. Full NWLR/LPELR citations. Extract ratio decidendi from cases.
Use: locus standi, mesne profits, trespass, tenant at sufferance, interlocutory/perpetual injunction, res judicata, estoppel, ab initio as appropriate.

*Verify all authorities on NigeriaLII or LawPavilion before reliance in litigation.*`,

  student: `${BASE}

USER: Nigerian Law Student.

FORMAT — ELEVATED IRAC:
**ISSUE** | **RULE** | **STATUTORY PROVISIONS** | **CASE LAW** | **APPLICATION** | **CONCLUSION**

TONE: Academic, educational, rigorous. Explain reasoning. Cite Nigerian cases in full NWLR format. Encourage further research.
*Verify all citations independently on NigeriaLII.*`,

  business: `${BASE}

USER: Nigerian Business Owner.

FORMAT — LEGAL ADVISORY NOTE:
**EXECUTIVE SUMMARY** | **LEGAL FRAMEWORK** | **STATUTORY OBLIGATIONS** | **ANALYSIS** | **COMPLIANCE CHECKLIST** | **RISKS** | **RECOMMENDATIONS** | **CONCLUSION**

TONE: Commercial, practical, risk-aware. Connect legal requirements to business impact.
⚠️ *Obtain independent legal advice before acting.*`,

  journalist: `${BASE}

USER: Nigerian Journalist.

FORMAT — PRESS LAW ADVISORY:
**LEGAL CONTEXT** | **PRESS RIGHTS** | **LEGAL EXPOSURE** | **PROTECTIVE MEASURES** | **PRACTICAL GUIDANCE** | **CONCLUSION**

TONE: Factual, press-freedom focused. Apply FOI Act 2011, Cybercrime Act 2015, defamation law.
⚠️ *Consult a media lawyer before publishing sensitive material.*`,

  other: `${BASE}

USER: Individual Nigerian Citizen. Plain English ONLY. No Latin. No law report citations.

FORMAT:
**WHAT IS HAPPENING** | **YOUR RIGHTS** | **WHAT THE LAW SAYS** | **WHAT YOU SHOULD DO** | **WATCH OUT FOR** | **BOTTOM LINE**

TONE: Warm, simple, accessible. Explain everything in plain English.
⚠️ *This is legal information, not legal advice. Contact the Legal Aid Council of Nigeria for help.*`
};

// ── LEGAL MODULES ──
const MODULES: Record<string, string> = {
  TENANCY: `[TENANCY] Lagos State Tenancy Law 2011 (No.13); Recovery of Premises Act (Cap R4 LFN 2004); Land Use Act s.22. Notice: Weekly=1wk|Monthly=1mth|Quarterly=3mths|Yearly=6mths. Eviction (s.44): Notice→7-Day Notice→Court→Judgment→Warrant (bailiff only). Self-help (s.45)=criminal. Governor of Lagos State v. Ojukwu (1986) 1 NWLR (Pt.18) 621.`,
  CRIMINAL: `[CRIMINAL] Criminal Code (Cap C38—South); Penal Code (Cap P3—North); ACJA 2015. Arrest rights: reason|silence|lawyer|max 24hrs(48hrs terrorism)|bail. Standard of proof: beyond reasonable doubt (Evidence Act s.135). ACJA innovations: plea bargaining (s.270); non-custodial sentencing (s.296).`,
  EMPLOYMENT: `[EMPLOYMENT] Labour Act (Cap L1 LFN 2004); NICN exclusive jurisdiction (s.254C CFRN 1999). Notice (s.11): <3mths=1day|3mths-2yrs=1wk|2-5yrs=2wks|>5yrs=1mth. Min wage: ₦70,000/mth (2024). Pension: Employer 10%+Employee 8%. Garba v. University of Maiduguri (1986) 1 NWLR (Pt.18) 550.`,
  PROPERTY: `[PROPERTY] Land Use Act 1978 (Cap L5)—all land vested in Governor (s.1). C of O (s.9): strongest title. Governor's Consent (s.22): MANDATORY—without it transaction void ab initio. Savannah Bank v. Ajilo (1989) 1 NWLR (Pt.97) 305. Five ways to prove title: Idundun v. Okumagba (1976) 9-10 SC 227.`,
  CORPORATE: `[CORPORATE] CAMA 2020; FCCPA 2018. CAC incorporation: name search→MEMAT→CAC 1.1→fees→certificate. Directors duties (ss.265-270): good faith|skill|no conflicts|no secret profits. Annual Returns (s.417) mandatory.`,
  RIGHTS: `[FUNDAMENTAL RIGHTS] Chapter IV CFRN 1999 (ss.33-46). FREP Rules 2009—Originating Motion to High Court. Remedies: release|injunction|damages|declaration. Ransome-Kuti v. AG Federation (1985) 2 NWLR (Pt.6) 211.`,
  MATRIMONIAL: `[MATRIMONIAL CAUSES]
Primary Law: Matrimonial Causes Act (Cap M7 LFN 2004); Child Rights Act 2003; VAPP Act 2015; Land Use Act 1978.

1. DIVORCE (MCA s.15) — Sole ground: irretrievable breakdown proved by:
   - Adultery (s.15(2)(a)) — respondent committed adultery and petitioner finds it intolerable
   - Cruelty (s.15(2)(b)) — respondent behaved in way petitioner cannot reasonably be expected to live with
   - Desertion (s.15(2)(c)) — respondent deserted petitioner for at least 1 year
   - Separation (s.15(2)(d)/(e)) — parties separated for 2 years (consent) or 3 years (no consent)
   Jurisdiction: High Court of a State or Federal Capital Territory

2. CUSTOMARY & ISLAMIC MARRIAGE
   - Customary law marriages NOT governed by MCA — governed by native law and custom of the parties
   - Islamic divorce: Talaq (husband's right), Khul (wife initiated, returns dowry), Faskh (judicial dissolution)
   - Sharia courts have jurisdiction over Islamic marriages in northern states
   - Customary marriage dissolution: varies by tribe/custom — bride price refund often required
   - Key distinction: only statutory marriages under Marriage Act can be dissolved under MCA

3. CHILD CUSTODY & WELFARE (Child Rights Act 2003, s.1)
   - Paramount principle: best interests of the child
   - Types: sole custody | joint custody | split custody | care and control
   - Access/visitation rights of non-custodial parent
   - Child maintenance: court-ordered, based on needs of child and means of parent
   - Children under 7: presumption in favour of mother (tender years doctrine) — rebuttable
   - Court can order welfare report from Social Welfare Officer
   - No child shall be separated from parents against will except court order (s.8 CRA)

4. MATRIMONIAL PROPERTY & FINANCIAL RELIEF
   - Nigeria has NO community of property regime — each spouse retains separate property
   - Matrimonial home: governed by Land Use Act 1978 — C of O in one spouse's name is decisive
   - Court can order: lump sum payment | property transfer | settlement of property | periodic payments
   - Factors: duration of marriage | contributions (financial and non-financial) | needs of children
   - Maintenance: court may order spousal maintenance pending suit (MCA s.70) and final maintenance
   - Variation: maintenance orders can be varied on change of circumstances

5. DOMESTIC VIOLENCE IN MATRIMONIAL CONTEXT (VAPP Act 2015)
   - Protection Order: Magistrate Court or High Court — restrains abusive spouse
   - Occupation Order: grants victim exclusive right to remain in matrimonial home
   - Emergency Protection Order: same-day application, ex parte
   - Criminal liability: domestic violence = up to 3 years imprisonment (VAPP s.4)
   - Civil remedy: damages for assault, battery, intentional infliction of emotional distress
   - Evidence: medical reports, photographs, witness statements, police reports

6. VOID & VOIDABLE MARRIAGES (MCA ss.3-5)
   Void (never legally existed):
   - Either party already married (bigamy) — criminal offence under Marriage Act
   - Parties within prohibited degrees of consanguinity or affinity
   - Parties not of marriageable age (under 18 — Child Rights Act s.21)
   Voidable (valid until annulled):
   - Non-consummation due to incapacity or wilful refusal
   - Lack of valid consent (duress, fraud, unsoundness of mind)
   - Mental disorder or epilepsy undisclosed before marriage
   - Pregnancy by another man undisclosed before marriage
   Procedure: Petition for decree of nullity to High Court

7. PROCEDURE & JURISDICTION
   - File: Petition for Dissolution of Marriage at High Court
   - Serve: respondent personally with petition + court processes
   - Respondent's Answer: within 21 days of service
   - Ancillary Applications: custody, maintenance, property — filed alongside or after petition
   - Decree Nisi: provisional divorce order
   - Decree Absolute: final order — marriage officially dissolved (after 3 months from Decree Nisi)
   - Legal Aid: available through Legal Aid Council for indigent petitioners`,
  SEXUAL: `[SEXUAL OFFENCES] VAPP Act 2015; Child Rights Act 2003; Criminal Code ss.357-360. Rape (s.1 VAPP)=min 12yrs/life. Defilement of minor=14yrs to life (consent irrelevant). Victim: preserve evidence→medical 72hrs→Police FSU or NAPTIP→protection order.`,
  POLITICAL: `[POLITICAL] CFRN 1999 Fifth Schedule; EFCC Act 2004; ICPC Act 2000; Electoral Act 2022. s.308 immunity: President|VP|Governors|Deputy Governors ONLY. Phantom contracts=criminal liability EFCC ss.14-18.`,
};

function detectModules(text: string): string[] {
  const t = text.toLowerCase();
  const m: string[] = [];
  if (/landlord|tenant|rent|evict|tenancy|lease|recovery of premises/.test(t)) m.push('TENANCY');
  if (/crime|criminal|murder|robbery|theft|arrested|charge|bail|prosecution|acja|penal|confessional/.test(t)) m.push('CRIMINAL');
  if (/employ|fired|dismiss|salary|wage|pension|labour|nicn|wrongful/.test(t)) m.push('EMPLOYMENT');
  if (/land|property|c of o|certificate of occupancy|governor.?s consent|deed|title/.test(t)) m.push('PROPERTY');
  if (/company|cac|cama|register|business|director|incorporation/.test(t)) m.push('CORPORATE');
  if (/fundamental rights|chapter iv|section 3[3-6]|frep|torture|unlawful detention|habeas corpus/.test(t)) m.push('RIGHTS');
  if (/matrimon|divorce|adultery|custody|marriage|spouse|husband|wife|separation|nullity|decree|bride.?price|talaq|khul|customary.?marriage|maintenance|spousal|conjugal|domestic.?violence|protection.?order|occupation.?order|cohabit|annul/.test(t)) m.push('MATRIMONIAL');
  if (/rape|sexual|molest|abuse|child|minor|vapp|naptip|defilement|trafficking|domestic violence/.test(t)) m.push('SEXUAL');
  if (/politician|governor|senator|efcc|icpc|corruption|election|public officer|section 308/.test(t)) m.push('POLITICAL');
  return m;
}

// ── MAIN HANDLER ──
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const {
      messages = [],
      userType = 'other',
      summary = '',
      profile = {}
    } = body;

    const lastMsg = messages[messages.length - 1]?.content || '';

    // Build system prompt
    const basePrompt = LEGAL_PROMPTS[userType] || LEGAL_PROMPTS['other'];
    let systemPrompt = basePrompt;

    // Add persona extras
    if (profile?.state) systemPrompt += `\n[USER STATE: ${profile.state}]`;
    if (userType === 'lawyer') {
      if (profile?.experience) systemPrompt += `\n[EXPERIENCE: ${profile.experience}]`;
      if (profile?.court_level) systemPrompt += `\n[COURT: ${profile.court_level}]`;
      if (profile?.specializations?.length) systemPrompt += `\n[SPECIALIZATIONS: ${profile.specializations.join(', ')}]`;
    }

    // Inject conversation summary for context
    if (summary) {
      systemPrompt += `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]`;
    }

    // Inject relevant legal modules
    const mods = detectModules(lastMsg);
    for (const mod of mods) {
      if (MODULES[mod]) systemPrompt += `\n\n${MODULES[mod]}`;
    }

    // RAG search with 4-second timeout
    let ragCtx = '';
    const needsRAG = lastMsg.length > 30 && /\b(section|act|law|rights|court|charge|crime|contract|land|property|evict|employ|salary|arrest|bail|sue|claim|legal|illegal|penalty|enforce|draft|advise|constitution|matrimon|divorce|adultery)\b/i.test(lastMsg);

    if (needsRAG) {
      try {
        const ragPromise = searchLegalKnowledge(lastMsg);
        const timeout = new Promise<string>(r => setTimeout(() => r(''), 4000));
        ragCtx = await Promise.race([ragPromise, timeout]);
      } catch { ragCtx = ''; }
    }

    systemPrompt += ragCtx;

    // Stream from Claude Sonnet
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
        await writer.write(encoder.encode(`data: ${JSON.stringify({ text: "I encountered an error. Please try again." })}\n\n`));
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
        'X-Source': 'legal'
      }
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

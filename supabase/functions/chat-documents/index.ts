import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  readJsonBody,
  requireMethod,
  requirePrincipal,
  securityErrorResponse,
} from "../_shared/security.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
// Smart fallback chain (Claude → Gemini → Groq) so document drafting keeps
// working through credit gaps while scaling.
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? '';
const GROQ_KEY = Deno.env.get("GROQ_API_KEY") ?? '';
const GEMINI_FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-2.0-flash'];
const GROQ_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const MAX_DOCUMENT_REQUEST_BYTES = 512 * 1024;

// ══════════════════════════════════════════════════════
// TEMPLATE LOOKUP — fetch a stored template that matches
// the user's request. Returns null if no template matches.
// ══════════════════════════════════════════════════════
const TEMPLATE_ALIASES: Record<string, string> = {
  // Map common phrasings → canonical document_type values stored in the DB
  'affidavit': 'general affidavit',
  'loss affidavit': 'affidavit of loss',
  'name change': 'affidavit of change of name',
  'change of name': 'affidavit of change of name',
  'next of kin': 'affidavit of next of kin',
  'age declaration': 'statutory declaration of age',
  'bail': 'bail application',
  'writ': 'writ of summons',
  'statement of claim': 'statement of claim',
  'statement of defence': 'statement of defence',
  'statement of defense': 'statement of defence',
  'motion': 'motion on notice',
  'ex parte': 'motion ex parte',
  'appeal': 'notice of appeal',
  'fundamental rights': 'fundamental rights enforcement application',
  'frep': 'fundamental rights enforcement application',
  'tenancy': 'tenancy agreement',
  'lease': 'tenancy agreement',
  'deed of assignment': 'deed of assignment',
  'land assignment': 'deed of assignment',
  'power of attorney': 'power of attorney',
  'poa': 'power of attorney',
  'quit notice': 'notice to quit',
  'notice to quit': 'notice to quit',
  'deed of gift': 'deed of gift',
  'partnership': 'partnership agreement',
  'nda': 'non-disclosure agreement',
  'non-disclosure': 'non-disclosure agreement',
  'non disclosure': 'non-disclosure agreement',
  'confidentiality agreement': 'non-disclosure agreement',
  'board resolution': 'board resolution',
  'service agreement': 'service agreement',
  'consultancy': 'service agreement',
  'mou': 'memorandum of understanding',
  'memorandum of understanding': 'memorandum of understanding',
  'employment contract': 'employment contract',
  'contract of employment': 'employment contract',
  'appointment letter': 'offer letter',
  'offer letter': 'offer letter',
  'termination': 'termination letter',
  'termination letter': 'termination letter',
  'query letter': 'query letter',
  'will': 'last will and testament',
  'last will': 'last will and testament',
  'divorce': 'divorce petition',
  'dissolution of marriage': 'divorce petition',
  'loan': 'loan agreement',
  'loan agreement': 'loan agreement',
  'promissory note': 'promissory note',
  'foi': 'FOI request',
  'foi request': 'FOI request',
  'freedom of information': 'FOI request',
  'press accreditation': 'press accreditation letter',
  'demand letter': 'letter of demand',
  'letter of demand': 'letter of demand',
  'cease and desist': 'cease and desist letter',
  'copyright assignment': 'copyright assignment',
  'cac business name': 'CAC business name registration application',
  'business name registration': 'CAC business name registration application',
  'invitation letter': 'invitation letter',
  'visa invitation': 'invitation letter',
};

function canonicaliseDocType(message: string): string | null {
  const m = message.toLowerCase();
  // Sort aliases longest first so "non-disclosure agreement" beats "non-disclosure"
  const keys = Object.keys(TEMPLATE_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    // word-boundary match
    const rx = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (rx.test(m)) return TEMPLATE_ALIASES[k];
  }
  return null;
}

async function fetchTemplate(docType: string): Promise<{ content: string; title: string; is_official: boolean; applicable_law?: string } | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/document_templates?document_type=eq.${encodeURIComponent(docType)}&select=content,title,is_official,applicable_law&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows && rows[0] ? rows[0] : null;
  } catch { return null; }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The legal document itself always stays in Nigerian legal English (for
// validity), but when the user has chosen a Nigerian language we ask any
// NEED_DETAILS clarifying questions in that language so the chat feels native.
const LANG_NAMES: Record<string, string> = {
  en: 'English', pcm: 'Nigerian Pidgin', yo: 'Yoruba', ha: 'Hausa', ig: 'Igbo',
};
function documentLanguageDirective(lang?: string): string {
  const code = (lang || 'en').toLowerCase();
  if (code === 'en' || !LANG_NAMES[code]) return '';
  const name = LANG_NAMES[code];
  return `\n\nLANGUAGE RULE:\n- The finished legal document MUST be written in standard Nigerian legal English — never translate the document itself, as that would harm its legal validity.\n- BUT if you need to ask NEED_DETAILS clarifying questions first, ask those questions in ${name} (warm and clear). The literal token "NEED_DETAILS:" must still appear in English as the very first characters, but the questions after it should be in ${name}.`;
}

// ── NIGERIAN DATE HELPER (server-side) ──
function nigerianToday(): string {
  const d = new Date();
  const day = d.getDate();
  const suffix = (day >= 11 && day <= 13) ? 'th'
    : day % 10 === 1 ? 'st'
    : day % 10 === 2 ? 'nd'
    : day % 10 === 3 ? 'rd'
    : 'th';
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${day}${suffix} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

// ── DOCUMENT TYPES & TEMPLATES ──
const DOCUMENT_PROMPTS: Record<string, string> = {
  affidavit: `Draft a complete Nigerian affidavit. Include:
- Title: AFFIDAVIT OF [NAME]
- Deponent details (name, address, occupation)
- Sworn statement opening: "I, [NAME], make oath and say as follows:"
- Numbered paragraphs for each fact
- Jurat: "SWORN at [PLACE] this <ACTUAL TODAY'S DATE>" with signature lines for deponent and Commissioner for Oaths
- Apply Evidence Act 2011 (ss.107-119) requirements`,

  agreement: `Draft a complete Nigerian agreement/contract. Include:
- Title and parties (full legal names, addresses)
- Recitals (WHEREAS clauses)
- Definitions clause
- Operative clauses (numbered)
- Representations and warranties
- Obligations of each party
- Term and termination
- Dispute resolution (arbitration/litigation)
- Governing law: Laws of [State], Nigeria
- Execution block with signature lines, dates, witnesses
- Apply Contract Law principles and CAMA 2020 where relevant`,

  deed: `Draft a complete Nigerian deed. Include:
- THIS DEED is made this <ACTUAL TODAY'S DATE>
- Full parties with capacity statement
- Recitals
- Operative words ("NOW THIS DEED WITNESSES")
- Consideration
- Operative clauses
- Covenants
- Execution: signed, sealed and delivered
- Attestation clause with witnesses
- Apply Land Use Act 1978 and Stamp Duties Act requirements`,

  petition: `Draft a complete Nigerian court petition. Include:
- Court heading (full court name, division, case number)
- Parties (Petitioner vs Respondent)
- Introduction paragraph
- Numbered grounds/paragraphs
- Statement of facts
- Legal basis (statute + section numbers)
- Relief sought (numbered)
- Prayer
- Petitioner signature block and date
- Apply relevant Nigerian court rules`,

  motion: `Draft a complete Nigerian court motion. Include:
- Court heading
- MOTION ON NOTICE / EX PARTE MOTION
- Parties
- TAKE NOTICE that [Applicant] will move the court
- Grounds (numbered)
- Relief sought
- Supporting affidavit reference
- Written address reference
- Counsel signature block
- Apply relevant court rules (Federal/State High Court Civil Procedure Rules)`,

  letter: `Draft a complete Nigerian legal letter. Include:
- Letterhead (Law firm name, address, phone, email)
- Date
- Addressee (full name and address)
- Our Ref / Your Ref
- Subject line (bold/underlined)
- Salutation
- Body paragraphs (clear, professional)
- Closing
- Signatory name, qualification (BL), and designation
- Apply Nigerian Bar Association professional standards`,

  notice: `Draft a complete Nigerian legal notice. Include:
- TAKE NOTICE / NOTICE TO QUIT / STATUTORY NOTICE (as applicable)
- Parties
- Clear statement of the notice
- Legal basis (statute and section)
- Time period given
- Consequences of non-compliance
- Date and signature
- Witness/service details
- Apply relevant Nigerian statute`,

  memo: `Draft a complete Nigerian legal memorandum. Include:
- LEGAL MEMORANDUM
- TO / FROM / DATE / RE: headers
- EXECUTIVE SUMMARY
- BACKGROUND FACTS
- ISSUES FOR CONSIDERATION (numbered)
- APPLICABLE LAW (statutes, sections, cases)
- ANALYSIS (issue by issue)
- RECOMMENDATIONS
- CONCLUSION
- Author signature
- Apply Nigerian law and professional drafting standards`,

  writ: `Draft a complete Nigerian Writ of Summons. Include:
- Court heading (full court name)
- Suit No: [TO BE ASSIGNED]
- WRIT OF SUMMONS
- Plaintiff details
- Defendant details
- ENDORSEMENT OF CLAIM (statement of claim summary)
- INDORSEMENT AS TO SERVICE
- Issued by the Registrar
- Apply relevant High Court Civil Procedure Rules`,

  tenancy: `Draft a complete Nigerian Tenancy Agreement. Include:
- Parties (Landlord and Tenant — full names, addresses)
- Property description
- Term of tenancy (start date, duration)
- Rent amount and payment schedule
- Security deposit
- Tenant obligations (maintenance, no subletting, etc.)
- Landlord obligations (quiet enjoyment, repairs)
- Prohibited uses
- Termination provisions (notice periods per Lagos Tenancy Law 2011 or applicable state law)
- Dispute resolution
- Execution block (signatures, witnesses, date)
- Apply Lagos State Tenancy Law 2011 or relevant state tenancy law`,

  employment: `Draft a complete Nigerian Employment Contract. Include:
- Parties (Employer and Employee)
- Position and job description
- Commencement date
- Probation period
- Remuneration (salary, allowances, benefits)
- Working hours
- Leave entitlements (annual, sick, maternity/paternity)
- Confidentiality and non-disclosure
- Intellectual property assignment
- Termination (notice periods per Labour Act s.11)
- Post-employment restrictions
- Governing law: Laws of Nigeria / Labour Act (Cap L1 LFN 2004)
- Execution block
- Apply Labour Act (Cap L1 LFN 2004) and Pension Reform Act 2014`,

  divorce: `Draft a complete Nigerian Petition for Dissolution of Marriage. Include:
- Court heading (High Court)
- PETITION FOR DISSOLUTION OF MARRIAGE
- Petitioner and Respondent details
- Date and place of marriage
- Children of the marriage
- Grounds: irretrievable breakdown of marriage
- Particulars of breakdown (adultery/cruelty/desertion/separation)
- History of the marriage
- Prayers (dissolution, custody, maintenance, property)
- Petitioner's verification
- Apply Matrimonial Causes Act (Cap M7 LFN 2004)`,
};

// ── DETECT DOCUMENT TYPE ──
function detectDocumentType(message: string): string {
  const m = message.toLowerCase();
  if (/affidavit/.test(m)) return 'affidavit';
  if (/tenancy|tenancy\s+agreement|lease\s+agreement/.test(m)) return 'tenancy';
  if (/employment\s+contract|contract\s+of\s+employment|offer\s+letter/.test(m)) return 'employment';
  if (/divorce|dissolution\s+of\s+marriage|matrimonial\s+petition/.test(m)) return 'divorce';
  if (/deed/.test(m)) return 'deed';
  if (/petition/.test(m)) return 'petition';
  if (/motion|application\s+to\s+court/.test(m)) return 'motion';
  if (/writ|writ\s+of\s+summons/.test(m)) return 'writ';
  if (/notice\s+to\s+quit|quit\s+notice|legal\s+notice/.test(m)) return 'notice';
  if (/memorandum|legal\s+memo/.test(m)) return 'memo';
  if (/agreement|contract|mou|memorandum\s+of\s+understanding/.test(m)) return 'agreement';
  if (/letter\s+of\s+demand|demand\s+letter|legal\s+letter/.test(m)) return 'letter';
  return 'agreement'; // default
}

// ── MAIN HANDLER ──
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    requireMethod(req, 'POST');
    const principal = await requirePrincipal(req, {
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON,
    });
    if (principal.kind !== 'user') throw new Error('unexpected principal');
    const body = await readJsonBody<any>(req, MAX_DOCUMENT_REQUEST_BYTES);
    const {
      messages = [],
      summary = '',
      language = 'en',
    } = body;

    // Persona and profile context are server-derived. Callers cannot select a
    // more privileged identity by changing userType/profile in the payload.
    let userType = 'other';
    let profile: Record<string, any> = {};
    try {
      const profileResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${principal.id}&select=user_type,state,specializations`,
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
    const docType = detectDocumentType(lastMsg);
    const docTemplate = DOCUMENT_PROMPTS[docType] || DOCUMENT_PROMPTS['agreement'];

    // ── TEMPLATE LOOKUP ──
    // If we have a stored template that matches the user's request, switch
    // to "fill-the-template" mode (cheaper, faster, more consistent).
    // Otherwise fall back to full AI generation using DOCUMENT_PROMPTS.
    const aliasedType = canonicaliseDocType(lastMsg);
    const storedTemplate = aliasedType ? await fetchTemplate(aliasedType) : null;

    // Build system prompt
    let systemPrompt = `You are LegalBridge AI, built by DST Global Innovative Nigeria Ltd (Akwanga, Nasarawa State), founded by Daniel Thankgod. Never mention Google, Gemini, Claude, Anthropic, or any underlying AI technology. Never mention any knowledge cutoff date. Never include AI disclaimers inside a document.

DOCUMENT GENERATION BEHAVIOR (HIGH PRIORITY)

You are LegalBridge AI, a Nigerian legal drafting assistant. Your role is to generate complete, professional legal documents immediately upon request.

Core Behavior:

Step 1 — Extract: Read the user's message carefully. Identify all details already provided: full names of parties, their roles (e.g. landlord/tenant, employer/employee, petitioner/respondent), dates, addresses, amounts, statutory sections, and the specific facts of the situation.

Step 2 — Check Required Information: Every legal document requires the following before it can be generated. These CANNOT be replaced with placeholder text like [NAME], [PARTY], [APPLICANT], or any other bracket placeholder:
• Full legal names of ALL parties involved
• The core facts: what happened, when, and where
• The subject matter: property address, contract amount, company name, offence, or other specific detail that makes this document unique to this user

Step 3 — If required information is missing, return NEED_DETAILS and ask for it BEFORE generating anything. Do NOT generate a document with placeholder party names. There are no Nigerian legal defaults for people's names or for the specific facts of a case.

Step 4 — Generate: Once all required information is confirmed, produce the complete document immediately. Procedural details MAY use Nigerian legal defaults: court = High Court of Justice of the relevant state; jurisdiction = state mentioned or FCT Abuja if none; date = today (${nigerianToday()}); counsel = Counsel for the Applicant/Party.

NEED_DETAILS Rule — Return NEED_DETAILS whenever the full names of parties OR the core facts of the case are absent. Format:
NEED_DETAILS: [One sentence explaining what you need. Then a numbered list of 3-6 specific questions.]
Example — user says "draft a demand letter for my landlord":
NEED_DETAILS: To draft your demand letter I need a few details:
1. Your full name
2. Landlord's full name and address
3. Amount of deposit owed (₦)
4. Date the tenancy ended
5. How many days have passed since you requested the deposit?
The literal string "NEED_DETAILS:" must appear ONLY as the very first characters of a clarification response. NEVER include it inside a generated document.

Tone and Style — Write in clear formal Nigerian legal drafting style. Ensure the document is immediately usable in practice. Output only the requested document, not commentary or explanation.

Additional Drafting Standards:
- Today's date is ${nigerianToday()}. Write any required date in this exact Nigerian format. Never use placeholder text like [DATE], [TODAY'S DATE], or [INSERT DATE].
- For court reference numbers that don't exist yet, write "Suit No: [TO BE ASSIGNED]" only.
- Number all clauses properly.
- Include execution/signature blocks (signature lines, witnesses, jurat where applicable).
- Cite governing Nigerian statutes in relevant clauses by exact section number.
- NEVER add casual sign-offs ("Good luck", "Hope this helps", "Best wishes", "Feel free to reach out"). Documents end with the signature/jurat/execution block only.

DOCUMENT TYPE DETECTED: ${docType.toUpperCase()}
${docTemplate}`;

    // Add persona context — state only. NO role-conditional output shape.
    // Every role gets a PURE document with no conversational framing and no
    // appended plain-English explanation. This is THE one rule that ensures
    // the document card renders identically for all 6 user types. The
    // previous "non-lawyer → add explanation" branch directly contradicted
    // the "Output only the requested document" rule above, causing Claude
    // to inconsistently wrap docs in prose for non-lawyer roles — which
    // broke document-shape detection and the card never rendered.
    if (profile?.state) systemPrompt += `\nUser's state: ${profile.state} — apply state-specific laws where relevant.`;
    if (userType === 'lawyer' && profile?.specializations?.length) {
      systemPrompt += `\nUser's practice specializations: ${profile.specializations.join(', ')}.`;
    }
    systemPrompt += `\n\nIMPORTANT: Output ONLY the legal document. No introduction sentence ("Here is your..."), no closing prose ("This document means...", "Let me know if..."), no plain-English explanation appended. The document must START with the formal heading (e.g. "# AFFIDAVIT", "IN THE HIGH COURT...", "THIS TENANCY AGREEMENT...") and END with the signature/jurat/execution block. Nothing else.

NEVER wrap the document in markdown code fences (\`\`\`). Output the document directly as plain markdown content with # / ## / **bold** formatting — never as a code block.`;

    // ── TEMPLATE-FILL MODE ──
    // If we have a stored Nigerian legal template, switch Claude into a
    // "fill the placeholders" task — much cheaper and more consistent than
    // full generation. Official court forms preserve their structure exactly.
    if (storedTemplate) {
      const fillInstruction = storedTemplate.is_official
        ? `\n\n[FILL-TEMPLATE MODE — OFFICIAL FORM]\nThe following is a Nigerian legal template that MUST be followed structurally without modification. Fill in every \`{{PLACEHOLDER}}\` with the actual value from the user's message or the Nigerian-context default (today's date is ${nigerianToday()}). Do NOT add new sections, do NOT remove sections, do NOT rewrite paragraphs. ONLY substitute placeholders.\n\n${storedTemplate.applicable_law ? `Applicable Law: ${storedTemplate.applicable_law}\n\n` : ''}TEMPLATE:\n${storedTemplate.content}\n[END TEMPLATE]`
        : `\n\n[FILL-TEMPLATE MODE — LAWYER-DRAFTED]\nThe following is a Nigerian legal template authored by senior practitioners. Use it as the structural basis for your draft. Fill in every \`{{PLACEHOLDER}}\` with the actual value from the user's message or a sensible Nigerian-context default (today's date is ${nigerianToday()}). You may add minor extra clauses if the user's facts clearly require them, but you must preserve the template's structure, headings, and legal language. Do NOT rewrite sections that are already complete.\n\n${storedTemplate.applicable_law ? `Applicable Law: ${storedTemplate.applicable_law}\n\n` : ''}TEMPLATE:\n${storedTemplate.content}\n[END TEMPLATE]`;
      systemPrompt += fillInstruction;
    }

    // Inject conversation summary for context
    if (summary) {
      systemPrompt += `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]`;
    }

    // Document stays English; clarifying questions go in the user's language.
    systemPrompt += documentLanguageDirective(language);

    // ── DETERMINISTIC EXTRACTION HELPER ──
    // Extract candidate proper-noun names + key facts from the user message and
    // re-state them inside the system prompt as an explicit FACTS block. This
    // forces the model to use the actual names rather than emitting placeholders
    // like [APPLICANT'S NAME] when it gets distracted.
    const facts: string[] = [];
    // Person names — sequences of 2-3 capitalised words
    const namesFound = new Set<string>();
    const nameRx = /\b((?:Mr\.?|Mrs\.?|Miss|Ms\.?|Dr\.?|Hon\.?|Chief|Alhaji|Barr\.?|Prof\.?|Engr\.?)\s+)?([A-Z][a-z]{1,}\s+[A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})?)/g;
    let nm;
    while ((nm = nameRx.exec(lastMsg)) !== null) {
      const full = (nm[1] || '') + nm[2];
      // Skip common false positives
      if (!/^(Criminal Code|Penal Code|Police Station|High Court|Federal High|State High|Court of Appeal|Supreme Court|Magistrate Court|Area Command|Land Use|Evidence Act|Labour Act|Section|Lagos State|Rivers State|Kano State|Nasarawa State|FCT Abuja)/.test(full)) {
        namesFound.add(full.trim());
      }
    }
    if (namesFound.size > 0) facts.push(`PERSON NAMES MENTIONED: ${[...namesFound].join(' | ')}`);

    // Charges / sections of law
    const chargeMatches = lastMsg.match(/\b(?:Section|Sec\.?|s\.?)\s*\d+[A-Z]?(?:\(\d+\))?(?:\s+of\s+the\s+[A-Z][\w\s]+?(?:Act|Code|Law|CFRN|Constitution))?/gi) || [];
    if (chargeMatches.length) facts.push(`LAW/STATUTE REFERENCES: ${[...new Set(chargeMatches)].join(' | ')}`);

    // Police station / location
    const stationMatch = lastMsg.match(/\b([A-Z][\w\s]+?(?:Police Station|Area Command|Divisional Headquarters|Police Headquarters))\b/);
    if (stationMatch) facts.push(`POLICE LOCATION: ${stationMatch[0]}`);

    // Detention / duration ("held for 2 days", "detained for 3 weeks")
    const detMatch = lastMsg.match(/\b(?:held|detained|in custody|locked up|remanded)\s+(?:for\s+)?(\d+\s+(?:day|days|week|weeks|month|months|hour|hours))/i);
    if (detMatch) facts.push(`DETENTION DURATION: ${detMatch[1]}`);

    // Courts mentioned
    const courtMatch = lastMsg.match(/\b((?:High|Federal High|State High|Magistrate|Supreme|Customary|Sharia|National Industrial|Court of Appeal)\s+Court(?:\s+of\s+[A-Z][\w\s]+)?)/i);
    if (courtMatch) facts.push(`COURT MENTIONED: ${courtMatch[1]}`);

    // Amounts (₦, NGN, naira)
    const amountMatch = lastMsg.match(/(?:₦|NGN\s*|N\s*)\s*[\d,]+(?:\.\d+)?(?:\s*(?:million|m|thousand|k|billion|b))?/gi);
    if (amountMatch) facts.push(`AMOUNTS: ${[...new Set(amountMatch.map(a => a.trim()))].join(' | ')}`);

    // Addresses (rough)
    const addressMatch = lastMsg.match(/(?:Plot|No\.|Number)\s+[\w\s,-]+?(?:Street|Road|Avenue|Close|Crescent|Drive|Way|Estate|Lane|Boulevard)[\w\s,]*/gi);
    if (addressMatch) facts.push(`ADDRESSES: ${[...new Set(addressMatch.map(a => a.trim()))].join(' | ')}`);

    if (facts.length > 0) {
      systemPrompt += `\n\n[FACTS PROVIDED BY USER — YOU MUST USE THESE EXACT VALUES IN THE DRAFT]\n`
        + facts.map(f => '• ' + f).join('\n')
        + `\n\nUse these EXACT names and details in the document. NEVER substitute them with [APPLICANT'S NAME], [PETITIONER'S NAME], [DEPONENT'S NAME], [NAME], or any other placeholder. The person named above is the Applicant/Petitioner/Deponent/Party — use their actual name in every field where that role appears.\n[END FACTS]\n\nUser's original request: "${lastMsg.slice(0, 600)}"`;
    } else {
      systemPrompt += `\n\nUser's original request: "${lastMsg.slice(0, 600)}"`;
    }

    // Stream from Claude Sonnet with high token limit for long documents
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const emit = (text: string) => writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));

    // Pipe an SSE body, extracting text with `pick`; returns chars emitted.
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

    const mappedMessages = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    async function tryClaude(): Promise<boolean> {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          // 8192 supports long bail applications, partnership agreements,
          // full divorce petitions etc. without cut-off.
          max_tokens: 8192,
          // Low temperature so name/charge/court extraction is DETERMINISTIC.
          temperature: 0.2,
          stream: true,
          system: systemPrompt,
          messages: mappedMessages,
        })
      });
      if (!res.ok) {
        console.error('chat-documents: claude unavailable', res.status, (await res.text()).slice(0, 200));
        return false;
      }
      await pipeSSE(res.body!, (j) => j.delta?.text || '');
      return true;
    }

    async function tryGemini(): Promise<boolean> {
      if (!GEMINI_KEY) return false;
      const contents = mappedMessages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content ?? '') }],
      }));
      for (const model of GEMINI_FALLBACK_MODELS) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
              }),
            },
          );
          if (!res.ok) { console.error('chat-documents gemini', model, res.status); continue; }
          const emitted = await pipeSSE(res.body!, (j) =>
            (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join(''));
          if (emitted > 0) return true;
        } catch (e) { console.error('chat-documents gemini', model, String(e)); }
      }
      return false;
    }

    async function tryGroq(): Promise<boolean> {
      if (!GROQ_KEY) return false;
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
          body: JSON.stringify({
            model: GROQ_FALLBACK_MODEL,
            stream: true,
            max_tokens: 8192,
            temperature: 0.2,
            messages: [
              { role: 'system', content: systemPrompt },
              ...mappedMessages.map((m: any) => ({ role: m.role, content: String(m.content ?? '') })),
            ],
          }),
        });
        if (!res.ok) { console.error('chat-documents groq', res.status, (await res.text()).slice(0, 200)); return false; }
        const emitted = await pipeSSE(res.body!, (j) => j?.choices?.[0]?.delta?.content || '');
        return emitted > 0;
      } catch (e) { console.error('chat-documents groq', String(e)); return false; }
    }

    (async () => {
      try {
        // Cost-first: Groq leads (free tier), Gemini second, Claude last so
        // credits are only spent when the free engines are down.
        if (await tryGroq()) return;
        if (await tryGemini()) return;
        if (await tryClaude()) return;
        await emit('Document service is temporarily unavailable. Please try again shortly.');
      } catch (e: any) {
        console.error('chat-documents stream error:', e?.message || String(e));
        await emit('Document drafting failed. Please try again.');
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
        'X-Source': 'documents'
      }
    });

  } catch (err: unknown) {
    return securityErrorResponse(err, CORS);
  }
});

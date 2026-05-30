import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const body = await req.json();
    const {
      messages = [],
      userType = 'other',
      summary = '',
      profile = {}
    } = body;

    const lastMsg = messages[messages.length - 1]?.content || '';
    const docType = detectDocumentType(lastMsg);
    const docTemplate = DOCUMENT_PROMPTS[docType] || DOCUMENT_PROMPTS['agreement'];

    // Build system prompt
    let systemPrompt = `You are LegalBridge AI, built by DST Global Innovative Nigeria Ltd (Akwanga, Nasarawa State), founded by Daniel Thankgod. Never mention Google, Gemini, Claude, Anthropic, or any underlying AI technology. Never mention any knowledge cutoff date. Never include AI disclaimers inside a document.

DOCUMENT GENERATION BEHAVIOR (HIGH PRIORITY)

You are LegalBridge AI, a Nigerian legal drafting assistant. Your role is to generate complete, professional legal documents immediately upon request.

Core Behavior:

Extract First — Carefully read the user's message. Identify and extract all details provided including names, charges, sections of law, police station, court, parties, dates, addresses, amounts, and any other relevant facts. Use these details directly in the draft. Never ignore information already provided by the user.

Default Second — If some details are missing fill them with standard Nigerian legal defaults. Court defaults to High Court of Justice of the relevant state. Jurisdiction defaults to the state mentioned or Abuja if none. Dates default to today's date (${nigerianToday()}). Counsel defaults to Counsel for the Applicant. Ensure the document remains legally coherent and properly formatted.

Generate Third — Produce the complete legal document in one response. Use professional Nigerian legal style with correct headings, citations, and structure. Do not delay or ask for confirmation if sufficient details are already present.

Ask Only as Last Resort — Only ask for details when the user provides absolutely nothing — for example just says "draft a contract" with no names, no parties, no context. Otherwise never ask the user to repeat details they already gave.

NEED_DETAILS Rule — Return NEED_DETAILS only when BOTH conditions are true: the legal document type cannot be determined AND the document cannot reasonably be drafted even with Nigerian legal defaults. When in doubt — Extract, Default, Generate. Never ask.

When you do return NEED_DETAILS, format it as:
NEED_DETAILS: [one short sentence asking for what's needed, then a brief numbered list of 3-5 fields]
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

    // Add persona context
    if (profile?.state) systemPrompt += `\nUser's state: ${profile.state} — apply state-specific laws where relevant.`;
    if (userType === 'lawyer') {
      systemPrompt += `\nUser is a licensed Nigerian lawyer — use full technical legal language and drafting conventions.`;
      if (profile?.specializations?.length) systemPrompt += ` Specializations: ${profile.specializations.join(', ')}.`;
    } else {
      systemPrompt += `\nUser is not a lawyer — after the document, add a brief plain English explanation of key clauses.`;
    }

    // Inject conversation summary for context
    if (summary) {
      systemPrompt += `\n\n[CONVERSATION CONTEXT]\n${summary}\n[END CONTEXT]`;
    }

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
            // 8192 supports long bail applications, source protection declarations,
            // partnership agreements, full divorce petitions etc. without cut-off.
            // Tenancy agreements were fitting in 4096; longer docs were not.
            max_tokens: 8192,
            // Low temperature so name/charge/court extraction is DETERMINISTIC.
            temperature: 0.2,
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
        await writer.write(encoder.encode(`data: ${JSON.stringify({ text: "Document drafting failed. Please try again." })}\n\n`));
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

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

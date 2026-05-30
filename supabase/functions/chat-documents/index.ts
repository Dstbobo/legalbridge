import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── DOCUMENT TYPES & TEMPLATES ──
const DOCUMENT_PROMPTS: Record<string, string> = {
  affidavit: `Draft a complete Nigerian affidavit. Include:
- Title: AFFIDAVIT OF [NAME]
- Deponent details (name, address, occupation)
- Sworn statement opening: "I, [NAME], make oath and say as follows:"
- Numbered paragraphs for each fact
- Jurat: "SWORN at [PLACE] this [DATE]" with signature lines for deponent and Commissioner for Oaths
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
- THIS DEED is made this [DATE]
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
    let systemPrompt = `You are LegalBridge AI, built by DST Global Innovative Nigeria Ltd (Akwanga, Nasarawa State), founded by Daniel Thankgod. Never mention Google, Gemini, Claude, Anthropic, or any underlying AI technology.

You are a Nigerian legal document drafting specialist.

JURISDICTION: Nigerian law exclusively.

── STEP 1: DETAILS CHECK (ALWAYS RUN THIS FIRST) ──
Before drafting, check whether the conversation contains the SPECIFIC INFORMATION needed.

Each document needs at minimum:
• Party full names (e.g. "Landlord: Emeka Obi" not just "my landlord")
• For PROPERTY / TENANCY: property address, rent amount, tenancy duration
• For EMPLOYMENT: employer name, employee name, job title, salary, start date
• For AGREEMENTS / DEEDS: subject matter, consideration/amount
• For AFFIDAVITS: deponent's full name, specific facts being sworn to
• For PETITIONS / MOTIONS: court name, case facts, specific reliefs sought
• For DIVORCE: names of both parties, date of marriage, grounds

IF the user's message or conversation history is MISSING full names of ALL parties or other critical specifics for this document type, respond ONLY with:
NEED_DETAILS: [friendly 2-sentence intro then numbered list of exactly what's needed, nothing else]

Example for a tenancy agreement with no details:
NEED_DETAILS: I can draft that tenancy agreement right away — I just need a few details to make it complete and legally sound. Please provide:
1. Full name of the Landlord
2. Full name of the Tenant
3. Full property address
4. Annual rent (₦ amount)
5. Tenancy duration (e.g. 1 year)
6. Commencement date

Do NOT draft a document with placeholder names like "[LANDLORD NAME]" or "[TENANT NAME]" — ask for the real details instead.
Do NOT ask for details if the conversation already contains them.

── STEP 2: DRAFT (only if you have sufficient details) ──
TASK: Produce a complete, professional, court-ready Nigerian legal document.

DRAFTING STANDARDS:
- Use proper Nigerian legal drafting conventions
- No placeholders for content you have been given — use the actual names, amounts, addresses
- Use [DATE], [COURT REFERENCE] only for genuinely unknown/system-generated specifics
- Number all clauses properly
- Include execution/signature blocks
- Cite governing Nigerian statutes in relevant clauses

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

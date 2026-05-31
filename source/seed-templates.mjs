// LegalBridge — bulk seed for document_templates
// Run: SUPABASE_SERVICE_KEY=... node source/seed-templates.mjs
// Uses direct fetch to PostgREST so no external deps required.

const SUPABASE_URL = 'https://qcutjnsxiawnejiqwwix.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) { console.error('Set SUPABASE_SERVICE_KEY env var'); process.exit(1); }

async function upsertTemplate(tpl) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/document_templates?on_conflict=document_type,source_url`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(tpl)
  });
  if (!res.ok) return { error: { message: `HTTP ${res.status}: ${await res.text()}` } };
  return { error: null };
}
const sb = { from: () => ({ upsert: (tpl) => upsertTemplate(tpl) }) };

// ──────────────────────────────────────────────────────────────────
// Template library — Nigerian legal documents with placeholders
// ──────────────────────────────────────────────────────────────────
const T = [];

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 1 — COURT DOCUMENTS
// ═══════════════════════════════════════════════════════════════════
T.push({
  document_type: 'bail application',
  category: 'court',
  title: 'Motion on Notice for Bail',
  description: 'Application for bail of an accused person held in police custody or remand.',
  applicable_law: 'Sections 35, 36 CFRN 1999; ACJA 2015 ss.158, 161-165',
  is_official: false,
  content: `# IN THE HIGH COURT OF JUSTICE OF {{STATE}}
# IN THE {{JUDICIAL_DIVISION}} JUDICIAL DIVISION
# HOLDEN AT {{COURT_TOWN}}

## SUIT NO: [TO BE ASSIGNED]

---

### IN THE MATTER OF AN APPLICATION FOR BAIL

### AND

### IN THE MATTER OF {{APPLICANT_NAME}} (APPLICANT)

---

## MOTION ON NOTICE FOR BAIL

### BETWEEN:

**{{APPLICANT_NAME}}** ......................................................... APPLICANT

**AND**

**COMMISSIONER OF POLICE, {{STATE}}** ......... RESPONDENT

---

## NOTICE OF APPLICATION FOR BAIL

**TAKE NOTICE** that this Honourable Court will be moved on {{HEARING_DATE}} or any other date convenient to this Honourable Court by **Counsel for the Applicant** for an Order of this Honourable Court granting the following reliefs:

### RELIEFS SOUGHT

1. **AN ORDER** of this Honourable Court admitting the Applicant, {{APPLICANT_NAME}}, to bail on liberal and reasonable terms pending the hearing and determination of the charge(s) preferred against him/her.

2. **AND FOR SUCH FURTHER ORDER(S)** as this Honourable Court may deem fit to make in the circumstances of this application.

---

## GROUNDS OF APPLICATION

This application is brought pursuant to:

1. Sections 35 and 36 of the Constitution of the Federal Republic of Nigeria 1999 (as amended);
2. Sections 158, 161, 162, 163, 164, 165, and 341 of the Administration of Criminal Justice Act/Law of {{STATE}};
3. The inherent jurisdiction of this Honourable Court;
4. The Rules of this Honourable Court.

---

## PARTICULARS OF GROUNDS

1. That the Applicant was arrested and detained on {{ARREST_DATE}} at {{POLICE_STATION}} in connection with an alleged offence under {{OFFENCE_SECTION}}.

2. That the Applicant has been in custody for {{DETENTION_DURATION}} without being formally arraigned before any court of competent jurisdiction, contrary to the constitutional safeguards under Section 35(4) and (5) of the Constitution of the Federal Republic of Nigeria 1999 (as amended).

3. That the alleged offence is bailable and the Applicant is presumed innocent until proven guilty as guaranteed by Section 36(5) of the Constitution.

4. That the Applicant has reliable sureties willing and able to stand for him/her and has fixed place of abode at {{APPLICANT_ADDRESS}}.

5. That the Applicant undertakes not to interfere with the investigation, witnesses, or any evidence in this matter.

6. That the Applicant will be available to attend trial whenever required to do so by this Honourable Court.

7. That granting this bail will not prejudice the prosecution's case in any manner whatsoever.

---

## CONCLUSION

In view of the foregoing, the Applicant most respectfully prays this Honourable Court for an Order admitting the Applicant to bail on such terms and conditions as the Court may deem just.

---

Dated this {{TODAY}}.

________________________________
**{{COUNSEL_NAME}}**
Counsel for the Applicant
{{COUNSEL_FIRM}}
{{COUNSEL_ADDRESS}}

---

## FOR SERVICE ON:

The Commissioner of Police
{{STATE}} State Police Command
{{POLICE_COMMAND_ADDRESS}}`
});

T.push({
  document_type: 'writ of summons',
  category: 'court',
  title: 'Writ of Summons (High Court Civil Action)',
  description: 'Originating process for civil action at the High Court.',
  applicable_law: 'High Court Civil Procedure Rules of the relevant state',
  is_official: true,
  content: `# IN THE HIGH COURT OF JUSTICE OF {{STATE}}
# IN THE {{JUDICIAL_DIVISION}} JUDICIAL DIVISION
# HOLDEN AT {{COURT_TOWN}}

## SUIT NO: [TO BE ASSIGNED]

---

### BETWEEN:

**{{CLAIMANT_NAME}}** ........................................................ CLAIMANT

### AND

**{{DEFENDANT_NAME}}** ...................................................... DEFENDANT

---

# WRIT OF SUMMONS

**TO:** {{DEFENDANT_NAME}}
        Of {{DEFENDANT_ADDRESS}}

**YOU ARE HEREBY COMMANDED** in His/Her Excellency the Governor of {{STATE}}'s name to enter an appearance, by yourself or a Legal Practitioner, within {{DAYS_TO_APPEAR}} days from the date of service of this Writ of Summons on you, inclusive of the day of such service, in the suit at the instance of {{CLAIMANT_NAME}}.

**AND TAKE NOTICE** that in default of your so doing, the Claimant may proceed therein and judgment may be given in your absence.

---

## ENDORSEMENT OF CLAIM

The Claimant's claim against the Defendant is for:

{{CLAIM_PARTICULARS}}

Plus interest, costs of this action, and such further or other relief as this Honourable Court may deem fit to grant.

---

**Issued at the Registry of the High Court** of {{STATE}}, this {{TODAY}}.

________________________________
**REGISTRAR**

---

## TAKE FURTHER NOTICE

This Writ is to be served within {{SERVICE_PERIOD_DAYS}} days from the date hereof. The Claimant's address for service is:

**{{CLAIMANT_NAME}}**
c/o {{CLAIMANT_COUNSEL}}
{{COUNSEL_ADDRESS}}

________________________________
**{{COUNSEL_NAME}}**
Counsel for the Claimant
{{COUNSEL_FIRM}}`
});

T.push({
  document_type: 'statement of claim',
  category: 'court',
  title: 'Statement of Claim',
  description: 'Particulars of claim filed by claimant in civil proceedings.',
  applicable_law: 'High Court Civil Procedure Rules',
  is_official: false,
  content: `# IN THE HIGH COURT OF JUSTICE OF {{STATE}}
# IN THE {{JUDICIAL_DIVISION}} JUDICIAL DIVISION
# HOLDEN AT {{COURT_TOWN}}

## SUIT NO: {{SUIT_NO}}

---

### BETWEEN:

**{{CLAIMANT_NAME}}** ........................................................ CLAIMANT

### AND

**{{DEFENDANT_NAME}}** ...................................................... DEFENDANT

---

# STATEMENT OF CLAIM

The Claimant, {{CLAIMANT_NAME}}, by his/her Counsel, states the case as follows:

1. The Claimant is {{CLAIMANT_DESCRIPTION}} resident at {{CLAIMANT_ADDRESS}}.

2. The Defendant is {{DEFENDANT_DESCRIPTION}} with offices at {{DEFENDANT_ADDRESS}}.

3. {{FACTS_PARAGRAPH_1}}

4. {{FACTS_PARAGRAPH_2}}

5. {{FACTS_PARAGRAPH_3}}

6. The Claimant has demanded compensation/performance from the Defendant but the Defendant has neglected and/or refused to pay/perform.

7. The cause of action arose at {{CAUSE_OF_ACTION_LOCATION}} on or about {{CAUSE_OF_ACTION_DATE}}.

---

## RELIEFS SOUGHT

WHEREOF the Claimant claims against the Defendant as follows:

A. {{RELIEF_1}}

B. {{RELIEF_2}}

C. Interest on the sum claimed at the prevailing CBN Monetary Policy Rate from the date of cause of action until final liquidation;

D. Cost of this action;

E. Such further or other order(s) as this Honourable Court may deem fit to make in the circumstances.

---

Dated this {{TODAY}}.

________________________________
**{{COUNSEL_NAME}}**
Counsel for the Claimant
{{COUNSEL_FIRM}}
{{COUNSEL_ADDRESS}}

---

**FOR SERVICE ON:**
{{DEFENDANT_NAME}}
{{DEFENDANT_ADDRESS}}`
});

T.push({
  document_type: 'statement of defence',
  category: 'court',
  title: 'Statement of Defence',
  description: 'Defendant\'s formal response to the Statement of Claim.',
  applicable_law: 'High Court Civil Procedure Rules',
  is_official: false,
  content: `# IN THE HIGH COURT OF JUSTICE OF {{STATE}}
# IN THE {{JUDICIAL_DIVISION}} JUDICIAL DIVISION
# HOLDEN AT {{COURT_TOWN}}

## SUIT NO: {{SUIT_NO}}

---

### BETWEEN:

**{{CLAIMANT_NAME}}** ........................................................ CLAIMANT

### AND

**{{DEFENDANT_NAME}}** ...................................................... DEFENDANT

---

# STATEMENT OF DEFENCE

The Defendant, by his/her Counsel, hereby states the case as follows:

1. The Defendant **DENIES** each and every allegation contained in the Claimant's Statement of Claim as if same were herein set out and traversed seriatim, save those expressly admitted.

2. The Defendant **ADMITS** paragraph(s) {{ADMITTED_PARAGRAPHS}} of the Statement of Claim only to the extent that {{ADMISSION_CONTEXT}}.

3. The Defendant **DENIES** paragraph(s) {{DENIED_PARAGRAPHS}} of the Statement of Claim and puts the Claimant to strictest proof thereof.

4. In specific response to paragraph(s) {{SPECIFIC_RESPONSE_PARAGRAPHS}}, the Defendant avers that {{DEFENDANT_VERSION_OF_FACTS}}.

5. {{ADDITIONAL_FACTS_1}}

6. {{ADDITIONAL_FACTS_2}}

---

## DEFENCES IN LAW

The Defendant relies on the following legal defences:

A. {{LEGAL_DEFENCE_1}}

B. {{LEGAL_DEFENCE_2}}

---

## PRAYER

WHEREFORE the Defendant prays this Honourable Court for:

i. AN ORDER dismissing the Claimant's claim in its entirety;

ii. AN ORDER awarding costs of this action against the Claimant;

iii. SUCH FURTHER OR OTHER ORDER(S) as this Honourable Court may deem fit.

---

Dated this {{TODAY}}.

________________________________
**{{COUNSEL_NAME}}**
Counsel for the Defendant
{{COUNSEL_FIRM}}
{{COUNSEL_ADDRESS}}`
});

T.push({
  document_type: 'motion on notice',
  category: 'court',
  title: 'Motion on Notice (Generic)',
  description: 'Interlocutory application on notice to opposing party.',
  applicable_law: 'High Court Civil Procedure Rules / FHC Rules',
  is_official: false,
  content: `# IN THE {{COURT_NAME}}
# IN THE {{JUDICIAL_DIVISION}} JUDICIAL DIVISION
# HOLDEN AT {{COURT_TOWN}}

## SUIT NO: {{SUIT_NO}}

---

### BETWEEN:

**{{APPLICANT_NAME}}** ........................................................ APPLICANT/{{PARTY_DESIGNATION_APPLICANT}}

### AND

**{{RESPONDENT_NAME}}** ...................................................... RESPONDENT/{{PARTY_DESIGNATION_RESPONDENT}}

---

# MOTION ON NOTICE

Brought pursuant to {{LEGAL_BASIS}} and under the inherent jurisdiction of this Honourable Court.

**TAKE NOTICE** that this Honourable Court will be moved on {{HEARING_DATE}} at the hour of 9 O'clock in the forenoon or so soon thereafter as Counsel for the Applicant can be heard, by Counsel for the Applicant for the following reliefs:

## RELIEFS SOUGHT

1. AN ORDER {{PRIMARY_RELIEF}};

2. {{ADDITIONAL_RELIEF_1}};

3. {{ADDITIONAL_RELIEF_2}};

4. AND FOR SUCH FURTHER OR OTHER ORDER(S) as this Honourable Court may deem fit to make in the circumstances of this application.

---

## GROUNDS OF APPLICATION

The grounds upon which this application is based are:

(i) {{GROUND_1}}

(ii) {{GROUND_2}}

(iii) {{GROUND_3}}

---

This motion is supported by:

(a) The Affidavit of {{DEPONENT_NAME}} sworn to on {{TODAY}};

(b) The Written Address attached hereto.

---

Dated this {{TODAY}}.

________________________________
**{{COUNSEL_NAME}}**
Counsel for the Applicant
{{COUNSEL_FIRM}}
{{COUNSEL_ADDRESS}}

---

**FOR SERVICE ON:**
{{RESPONDENT_NAME}}
c/o {{RESPONDENT_COUNSEL}}
{{RESPONDENT_COUNSEL_ADDRESS}}`
});

T.push({
  document_type: 'motion ex parte',
  category: 'court',
  title: 'Motion Ex Parte',
  description: 'Urgent application without notice to opposing party.',
  applicable_law: 'High Court Civil Procedure Rules; FHC Rules',
  is_official: false,
  content: `# IN THE {{COURT_NAME}}
# IN THE {{JUDICIAL_DIVISION}} JUDICIAL DIVISION
# HOLDEN AT {{COURT_TOWN}}

## SUIT NO: {{SUIT_NO}}

---

### BETWEEN:

**{{APPLICANT_NAME}}** ........................................................ APPLICANT

### AND

**{{RESPONDENT_NAME}}** ...................................................... RESPONDENT

---

# MOTION EX PARTE

Brought pursuant to {{LEGAL_BASIS}} and under the inherent jurisdiction of this Honourable Court.

**TAKE NOTICE** that this Honourable Court will be moved EX PARTE on {{HEARING_DATE}} or any subsequent date this Honourable Court is sitting, for the following reliefs:

## RELIEFS SOUGHT

1. AN ORDER OF INTERIM INJUNCTION restraining the Respondent {{INJUNCTION_TERMS}};

2. AN ORDER granting leave to the Applicant to {{LEAVE_SOUGHT}};

3. AN ORDER abridging the time within which the Respondent shall be put on notice;

4. AND FOR SUCH FURTHER OR OTHER ORDER(S) as this Honourable Court may deem fit to make in the circumstances.

---

## GROUNDS OF APPLICATION

(i) The matter is of utmost urgency and granting notice to the Respondent would defeat the purpose of this application.

(ii) {{URGENCY_GROUND_2}}

(iii) {{URGENCY_GROUND_3}}

(iv) The Applicant undertakes to pay damages to the Respondent should it be subsequently found that this order ought not to have been made.

---

This motion is supported by the Affidavit of Urgency of {{DEPONENT_NAME}} sworn to on {{TODAY}}.

Dated this {{TODAY}}.

________________________________
**{{COUNSEL_NAME}}**
Counsel for the Applicant
{{COUNSEL_FIRM}}
{{COUNSEL_ADDRESS}}`
});

T.push({
  document_type: 'general affidavit',
  category: 'court',
  title: 'General Affidavit',
  description: 'All-purpose sworn statement before a Commissioner for Oaths.',
  applicable_law: 'Evidence Act 2011 ss.107-119; Oaths Act',
  is_official: true,
  content: `# AFFIDAVIT OF {{DEPONENT_NAME}}

---

**STATE OF {{STATE}}**

**LOCAL GOVERNMENT AREA: {{LGA}}**

---

I, **{{DEPONENT_NAME}}**, {{DEPONENT_OCCUPATION}}, of Nigerian Citizenship, an adult of {{DEPONENT_RELIGION}} religion, residing at {{DEPONENT_ADDRESS}}, do hereby make oath and state as follows:

1. That I am the deponent herein and by virtue of which I am conversant with the facts of this case.

2. That I have the consent and authority of {{CONSENTING_PARTY}} to depose to this affidavit. [delete if not applicable]

3. {{FACT_PARAGRAPH_1}}

4. {{FACT_PARAGRAPH_2}}

5. {{FACT_PARAGRAPH_3}}

6. {{FACT_PARAGRAPH_4}}

7. That I depose to this affidavit in good faith, believing the contents to be true and correct, and in accordance with the Oaths Act, Laws of the Federation of Nigeria.

---

________________________________
**DEPONENT**
{{DEPONENT_NAME}}

---

## JURAT

**SWORN to at the Registry of the High Court of {{STATE}}, {{COURT_TOWN}}**, this {{TODAY}}.

**BEFORE ME:**

________________________________
**COMMISSIONER FOR OATHS**`
});

T.push({
  document_type: 'affidavit of loss',
  category: 'court',
  title: 'Affidavit of Loss',
  description: 'Sworn statement of loss of a document, certificate, or item.',
  applicable_law: 'Evidence Act 2011; Oaths Act',
  is_official: true,
  content: `# AFFIDAVIT OF LOSS

---

**STATE OF {{STATE}}**

**LOCAL GOVERNMENT AREA: {{LGA}}**

---

I, **{{DEPONENT_NAME}}**, {{DEPONENT_OCCUPATION}}, a Nigerian citizen, of {{DEPONENT_RELIGION}} religion, residing at {{DEPONENT_ADDRESS}}, do hereby make oath and state as follows:

1. That I am the bonafide owner of the {{LOST_ITEM}} bearing reference number/serial number {{LOST_ITEM_REFERENCE}}, issued by {{ISSUING_AUTHORITY}} on {{ITEM_ISSUE_DATE}}.

2. That on or about {{LOSS_DATE}}, I discovered that the said {{LOST_ITEM}} could not be found.

3. That the said {{LOST_ITEM}} was {{CIRCUMSTANCES_OF_LOSS}}.

4. That despite diligent and thorough search, the said {{LOST_ITEM}} could not be traced and recovered.

5. That the said {{LOST_ITEM}} was not pledged, sold, transferred, or otherwise disposed of by me to any person whatsoever.

6. That I hereby declare that the said {{LOST_ITEM}} is genuinely lost.

7. That I make this affidavit in support of my application to {{ISSUING_AUTHORITY}} for the issuance of a duplicate/replacement of the lost {{LOST_ITEM}}.

8. That I depose to this affidavit in good faith, believing the contents to be true and correct, and in accordance with the Oaths Act, Laws of the Federation of Nigeria.

---

________________________________
**DEPONENT**
{{DEPONENT_NAME}}

---

## JURAT

**SWORN to at the Registry of the High Court of {{STATE}}**, this {{TODAY}}.

**BEFORE ME:**

________________________________
**COMMISSIONER FOR OATHS**`
});

T.push({
  document_type: 'affidavit of change of name',
  category: 'court',
  title: 'Affidavit of Change of Name',
  description: 'Sworn declaration of change of name for official records.',
  applicable_law: 'Evidence Act 2011; Oaths Act',
  is_official: true,
  content: `# AFFIDAVIT OF CHANGE OF NAME

---

**STATE OF {{STATE}}**

**LOCAL GOVERNMENT AREA: {{LGA}}**

---

I, **{{NEW_NAME}}** (formerly known as **{{OLD_NAME}}**), {{DEPONENT_OCCUPATION}}, a Nigerian citizen, of {{DEPONENT_RELIGION}} religion, residing at {{DEPONENT_ADDRESS}}, do hereby make oath and state as follows:

1. That I am the deponent herein and I am the same person formerly known and called **{{OLD_NAME}}** but now wish to be known and called **{{NEW_NAME}}** for all purposes.

2. That the change of name was occasioned by {{REASON_FOR_CHANGE}}.

3. That all documents previously issued in my former name **{{OLD_NAME}}** including but not limited to {{LIST_OF_DOCUMENTS}}, remain valid and belong to me.

4. That I henceforth abandon the use of the name **{{OLD_NAME}}** and wish to be known and called **{{NEW_NAME}}** in all my dealings, transactions, and records.

5. That all authorities, banks, schools, employers, and persons concerned are hereby requested to take note of this change of name and to make the necessary corrections in their records.

6. That I depose to this affidavit in good faith, believing the contents to be true and correct, and in accordance with the Oaths Act, Laws of the Federation of Nigeria.

---

________________________________
**DEPONENT**
{{NEW_NAME}}
(formerly {{OLD_NAME}})

---

## JURAT

**SWORN to at the Registry of the High Court of {{STATE}}**, this {{TODAY}}.

**BEFORE ME:**

________________________________
**COMMISSIONER FOR OATHS**`
});

T.push({
  document_type: 'affidavit of next of kin',
  category: 'court',
  title: 'Affidavit of Next of Kin',
  description: 'Declaration identifying the next of kin for official purposes.',
  applicable_law: 'Evidence Act 2011; Oaths Act',
  is_official: true,
  content: `# AFFIDAVIT OF NEXT OF KIN

---

**STATE OF {{STATE}}**

**LOCAL GOVERNMENT AREA: {{LGA}}**

---

I, **{{DEPONENT_NAME}}**, {{DEPONENT_OCCUPATION}}, a Nigerian citizen, of {{DEPONENT_RELIGION}} religion, residing at {{DEPONENT_ADDRESS}}, do hereby make oath and state as follows:

1. That I am the deponent herein and by virtue of my position, I am competent to depose to this affidavit.

2. That I hereby nominate and appoint the following person as my Next of Kin:

   **Name:** {{NEXT_OF_KIN_NAME}}
   **Relationship:** {{RELATIONSHIP}}
   **Date of Birth:** {{NEXT_OF_KIN_DOB}}
   **Address:** {{NEXT_OF_KIN_ADDRESS}}
   **Phone Number:** {{NEXT_OF_KIN_PHONE}}
   **Occupation:** {{NEXT_OF_KIN_OCCUPATION}}

3. That the said {{NEXT_OF_KIN_NAME}} is in every respect a fit and proper person to be my Next of Kin and is hereby authorised to receive my benefits, take decisions on my behalf in the event of my incapacitation, and represent my interests where required.

4. That I am of sound mind and disposing capacity at the time of making this declaration.

5. That this nomination shall remain in force until revoked by me in writing or by another affidavit.

6. That I depose to this affidavit in good faith, believing the contents to be true and correct, and in accordance with the Oaths Act.

---

________________________________
**DEPONENT**
{{DEPONENT_NAME}}

---

## JURAT

**SWORN to at the Registry of the High Court of {{STATE}}**, this {{TODAY}}.

**BEFORE ME:**

________________________________
**COMMISSIONER FOR OATHS**`
});

T.push({
  document_type: 'notice of appeal',
  category: 'court',
  title: 'Notice of Appeal',
  description: 'Notice commencing appeal from a lower court judgment.',
  applicable_law: 'Court of Appeal Act; Court of Appeal Rules',
  is_official: false,
  content: `# IN THE COURT OF APPEAL OF NIGERIA
# IN THE {{COURT_OF_APPEAL_DIVISION}} JUDICIAL DIVISION
# HOLDEN AT {{COA_TOWN}}

## APPEAL NO: [TO BE ASSIGNED]

(On Appeal from the Judgment of the {{LOWER_COURT_NAME}}, Suit No. {{LOWER_COURT_SUIT_NO}}, delivered on {{JUDGMENT_DATE}} by the Hon. Justice {{TRIAL_JUDGE}})

---

### BETWEEN:

**{{APPELLANT_NAME}}** ........................................................ APPELLANT

### AND

**{{RESPONDENT_NAME}}** ...................................................... RESPONDENT

---

# NOTICE OF APPEAL

**TAKE NOTICE** that the Appellant, being dissatisfied with the decision of the {{LOWER_COURT_NAME}}, dated {{JUDGMENT_DATE}}, hereby appeals to the Court of Appeal upon the grounds set out hereunder and prays the reliefs set out below.

The whole decision is appealed against.

## PART I — GROUNDS OF APPEAL

**GROUND ONE — Error in Law:**
The learned trial Judge erred in law when {{GROUND_1_FACTS}}.

**PARTICULARS OF ERROR:**
(i) {{PARTICULAR_1A}}
(ii) {{PARTICULAR_1B}}

**GROUND TWO — {{GROUND_2_TYPE}}:**
{{GROUND_2_FACTS}}.

**PARTICULARS:**
(i) {{PARTICULAR_2A}}
(ii) {{PARTICULAR_2B}}

**GROUND THREE — {{GROUND_3_TYPE}}:**
{{GROUND_3_FACTS}}.

---

## PART II — RELIEFS SOUGHT FROM THE COURT OF APPEAL

(a) AN ORDER allowing this appeal;

(b) AN ORDER setting aside the judgment of the {{LOWER_COURT_NAME}} delivered on {{JUDGMENT_DATE}};

(c) {{ADDITIONAL_RELIEF}};

(d) Costs of this appeal.

---

## PART III — PERSONS DIRECTLY AFFECTED BY THIS APPEAL

| Name | Address |
|------|---------|
| {{APPELLANT_NAME}} (Appellant) | {{APPELLANT_ADDRESS}} |
| {{RESPONDENT_NAME}} (Respondent) | {{RESPONDENT_ADDRESS}} |

---

Dated this {{TODAY}}.

________________________________
**{{COUNSEL_NAME}}**
Counsel for the Appellant
{{COUNSEL_FIRM}}
{{COUNSEL_ADDRESS}}`
});

T.push({
  document_type: 'fundamental rights enforcement application',
  category: 'court',
  title: 'Fundamental Rights (Enforcement Procedure) Application',
  description: 'Originating motion for enforcement of fundamental human rights.',
  applicable_law: 'Sections 33-46 CFRN 1999; Fundamental Rights (Enforcement Procedure) Rules 2009',
  is_official: false,
  content: `# IN THE FEDERAL HIGH COURT OF NIGERIA
# IN THE {{FHC_JUDICIAL_DIVISION}} JUDICIAL DIVISION
# HOLDEN AT {{COURT_TOWN}}

## SUIT NO: FHC/{{SUIT_REF}}

---

### BETWEEN:

**{{APPLICANT_NAME}}** ........................................................ APPLICANT

### AND

1. **{{RESPONDENT_1}}** ...................................................... 1ST RESPONDENT
2. **{{RESPONDENT_2}}** ...................................................... 2ND RESPONDENT

---

# ORIGINATING MOTION FOR ENFORCEMENT OF FUNDAMENTAL HUMAN RIGHTS

Brought pursuant to:
- Sections 35, 36, 37, 41, 44 and 46 of the Constitution of the Federal Republic of Nigeria 1999 (as amended);
- The Fundamental Rights (Enforcement Procedure) Rules, 2009;
- Article 6 of the African Charter on Human and Peoples' Rights (Ratification and Enforcement) Act, Cap A9 LFN 2004;
- The inherent jurisdiction of this Honourable Court.

**TAKE NOTICE** that this Honourable Court will be moved on {{HEARING_DATE}} for the following reliefs:

## RELIEFS SOUGHT

1. **A DECLARATION** that the arrest, detention, and continued harassment of the Applicant by the Respondents at {{INCIDENT_LOCATION}} from {{INCIDENT_START_DATE}} to date, without charge or arraignment before a competent court, constitutes a gross violation of the Applicant's fundamental rights to:
   (a) Personal liberty under Section 35 CFRN 1999;
   (b) Dignity of the human person under Section 34 CFRN 1999;
   (c) Fair hearing under Section 36 CFRN 1999.

2. **AN ORDER** for the immediate release of the Applicant from the unlawful custody of the Respondents.

3. **AN ORDER** of perpetual injunction restraining the Respondents, their agents, servants, privies, and successors-in-title from further arresting, detaining, harassing, or in any manner whatsoever interfering with the Applicant's fundamental rights.

4. **AN ORDER** awarding the Applicant the sum of ₦{{DAMAGES_AMOUNT}} as general and exemplary damages against the Respondents jointly and severally.

5. **AN ORDER** directing the Respondents to render a public apology to the Applicant to be published in {{NEWSPAPER}}.

6. Cost of this action.

7. Such further or other order(s) as this Honourable Court may deem fit.

---

## GROUNDS OF APPLICATION

(i) The Applicant is a Nigerian citizen entitled to the protection of the fundamental rights guaranteed under Chapter IV of the Constitution of the Federal Republic of Nigeria 1999.

(ii) {{GROUND_OF_VIOLATION}}.

(iii) The continued detention of the Applicant violates Section 35(4) of the Constitution which mandates that any person arrested be brought before a court within a reasonable time.

(iv) The Applicant has not been charged with any offence known to law.

This application is supported by the Affidavit of {{DEPONENT_NAME}} sworn to on {{TODAY}} and the Statement of Facts attached.

---

Dated this {{TODAY}}.

________________________________
**{{COUNSEL_NAME}}**
Counsel for the Applicant
{{COUNSEL_FIRM}}
{{COUNSEL_ADDRESS}}`
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 2 — PROPERTY DOCUMENTS
// ═══════════════════════════════════════════════════════════════════
T.push({
  document_type: 'tenancy agreement',
  category: 'property',
  title: 'Tenancy Agreement',
  description: 'Residential or commercial tenancy agreement under Nigerian state tenancy laws.',
  applicable_law: 'Lagos State Tenancy Law 2011; Recovery of Premises Act / state equivalents',
  is_official: false,
  content: `# TENANCY AGREEMENT

**THIS TENANCY AGREEMENT** is made this {{TODAY}}.

## BETWEEN:

**{{LANDLORD_NAME}}** of {{LANDLORD_ADDRESS}} (hereinafter referred to as **"the Landlord"** which expression shall where the context so admits include his/her heirs, executors, administrators, and assigns) of the ONE PART;

**AND**

**{{TENANT_NAME}}** of {{TENANT_ADDRESS}} (hereinafter referred to as **"the Tenant"** which expression shall where the context so admits include his/her heirs, executors, administrators, and assigns) of the OTHER PART.

## WHEREAS:

A. The Landlord is the owner and is in lawful possession of the property described in the Schedule hereto (the "Premises").

B. The Tenant has requested to rent the said Premises from the Landlord for {{PURPOSE_OF_TENANCY}}.

C. The Landlord has agreed to let and the Tenant has agreed to take the Premises upon the terms and conditions hereinafter appearing.

---

## NOW THIS AGREEMENT WITNESSES AS FOLLOWS:

### 1. PREMISES
The Landlord lets to the Tenant ALL THAT property situated at {{PREMISES_ADDRESS}}, more particularly described in the Schedule hereto.

### 2. TERM
The tenancy shall be for a term of {{TENANCY_DURATION}} commencing from {{TENANCY_START_DATE}} and terminating on {{TENANCY_END_DATE}}, subject to renewal upon mutual agreement of the parties.

### 3. RENT
The Tenant shall pay rent of **₦{{ANNUAL_RENT_AMOUNT}}** ({{ANNUAL_RENT_WORDS}} Naira only) per annum, payable {{RENT_PAYMENT_TERMS}}.

### 4. CAUTION DEPOSIT / SECURITY DEPOSIT
The Tenant shall pay a refundable caution deposit of **₦{{CAUTION_DEPOSIT}}** which shall be refunded at the end of the tenancy, subject to deductions for damages beyond fair wear and tear.

### 5. TENANT'S COVENANTS
The Tenant covenants with the Landlord as follows:
(a) To pay the rent reserved at the times and in the manner aforesaid without any deduction whatsoever;
(b) To pay all charges for electricity, water, refuse disposal, and other utilities consumed at the Premises;
(c) To keep the interior of the Premises in good and tenantable repair, fair wear and tear excepted;
(d) NOT to assign, sublet, or part with possession of the Premises or any part thereof without the prior written consent of the Landlord;
(e) NOT to use the Premises for any illegal, immoral, or noxious purpose;
(f) NOT to make any structural alterations to the Premises without the prior written consent of the Landlord;
(g) To permit the Landlord or his agents, with reasonable notice, to enter and inspect the Premises;
(h) At the determination of the tenancy, to yield up the Premises in the same good and tenantable repair as at the commencement.

### 6. LANDLORD'S COVENANTS
The Landlord covenants with the Tenant as follows:
(a) That the Tenant, paying the rent and observing the covenants herein, shall peacefully hold and enjoy the Premises during the term;
(b) To keep the structure and exterior of the Premises in good repair;
(c) To pay all government rates, taxes, and assessments on the Premises.

### 7. TERMINATION
(a) Either party may terminate this Agreement by giving the requisite statutory notice under the {{APPLICABLE_TENANCY_LAW}}: weekly tenancy — 1 week, monthly — 1 month, quarterly — 3 months, half-yearly — 3 months, yearly — 6 months.
(b) In the event of breach by the Tenant of any covenant herein, the Landlord may, after due statutory notice and order of court, recover possession of the Premises.

### 8. SELF-HELP PROHIBITED
The parties acknowledge that any attempt at eviction without due process of law is unlawful under Section 44 of the Lagos State Tenancy Law 2011 (or equivalent state law) and shall expose the offending party to criminal liability.

### 9. ARBITRATION & GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of {{STATE}}. Any dispute arising hereunder shall first be referred to mediation, failing which it shall be referred to arbitration under the Arbitration and Conciliation Act, Cap A18 LFN 2004.

---

## THE SCHEDULE

**Description of Premises:** {{PREMISES_DESCRIPTION}}

**Inventory of Fixtures and Fittings:** {{INVENTORY}}

---

**IN WITNESS WHEREOF** the parties hereto have executed this Agreement the day and year first above written.

**SIGNED** by the within-named LANDLORD
**{{LANDLORD_NAME}}**

Signature: ________________________________

In the presence of:
Name: ________________________________
Address: ________________________________
Signature: ________________________________
Date: ________________________________

**SIGNED** by the within-named TENANT
**{{TENANT_NAME}}**

Signature: ________________________________

In the presence of:
Name: ________________________________
Address: ________________________________
Signature: ________________________________
Date: ________________________________`
});

T.push({
  document_type: 'deed of assignment',
  category: 'property',
  title: 'Deed of Assignment (Land/Property)',
  description: 'Transfer of legal interest in land or real property.',
  applicable_law: 'Land Use Act 1978; Stamp Duties Act; Land Instruments Registration Law',
  is_official: false,
  content: `# DEED OF ASSIGNMENT

**THIS DEED OF ASSIGNMENT** is made this {{TODAY}}.

## BETWEEN:

**{{ASSIGNOR_NAME}}** of {{ASSIGNOR_ADDRESS}} (hereinafter called **"the Assignor"** which expression shall where the context so admits include his/her heirs, executors, administrators, and assigns) of the ONE PART;

**AND**

**{{ASSIGNEE_NAME}}** of {{ASSIGNEE_ADDRESS}} (hereinafter called **"the Assignee"** which expression shall where the context so admits include his/her heirs, executors, administrators, and assigns) of the OTHER PART.

## RECITALS

A. The Assignor is the lawful holder of a statutory/customary right of occupancy over ALL THAT parcel of land more particularly described in the Schedule hereto (hereinafter "the Property"), being seized in fee simple absolute in possession thereof.

B. The Assignor's title is evidenced by {{TITLE_DOCUMENT}} dated {{TITLE_DATE}} and registered as No. {{TITLE_REG_NO}} at Page {{TITLE_PAGE}} in Volume {{TITLE_VOLUME}} of the Lands Registry, {{STATE}}.

C. The Assignor has agreed with the Assignee for the assignment to the Assignee of the residue of his/her right of occupancy in the Property for the consideration hereinafter appearing.

## NOW THIS DEED WITNESSES AS FOLLOWS:

### 1. CONSIDERATION
In consideration of the sum of **₦{{CONSIDERATION_AMOUNT}}** ({{CONSIDERATION_WORDS}} Naira only) paid by the Assignee to the Assignor (the receipt whereof the Assignor hereby acknowledges):

### 2. ASSIGNMENT
The Assignor as BENEFICIAL OWNER hereby ASSIGNS, TRANSFERS, and CONVEYS unto the Assignee ALL THAT property described in the Schedule hereto TO HOLD the same unto the Assignee absolutely, subject only to the conditions of the original grant under the Land Use Act, 1978.

### 3. ASSIGNOR'S COVENANTS
The Assignor covenants with the Assignee as follows:
(a) That the Assignor has good right and full power to assign the Property in the manner aforesaid;
(b) That the Property is free from all encumbrances, mortgages, charges, liens, or third-party claims whatsoever;
(c) That the Assignor will, at the Assignee's cost, do and execute all such further acts, deeds, and assurances as may be required to perfect the Assignee's title to the Property;
(d) That the Assignor warrants and shall forever defend the Assignee's title against all lawful claims.

### 4. POSSESSION
The Assignee shall be put into immediate vacant possession of the Property upon execution of this Deed.

### 5. GOVERNOR'S CONSENT
The parties acknowledge that pursuant to Section 22 of the Land Use Act, 1978, this assignment shall be submitted to the Governor of {{STATE}} for consent, without which the transaction may be voidable.

### 6. STAMP DUTY AND REGISTRATION
The Assignee shall bear the cost of stamp duties, registration fees, and consent fees in respect of this Deed.

---

## THE SCHEDULE

**Description of Property:**
ALL THAT piece or parcel of land measuring approximately {{LAND_SIZE}} square metres and situate at {{PROPERTY_ADDRESS}}, in {{LGA}} Local Government Area of {{STATE}}, with the following beacon numbers/coordinates: {{BEACON_NUMBERS}}.

**Survey Plan No.:** {{SURVEY_PLAN_NO}} dated {{SURVEY_DATE}} drawn by {{SURVEYOR_NAME}}.

---

**IN WITNESS WHEREOF** the parties hereto have executed this Deed the day and year first above written.

**SIGNED, SEALED AND DELIVERED** by the within-named ASSIGNOR
**{{ASSIGNOR_NAME}}**

Signature: ________________________________
Date: ________________________________

In the presence of:
Name: ________________________________
Address: ________________________________
Occupation: ________________________________
Signature: ________________________________

**SIGNED, SEALED AND DELIVERED** by the within-named ASSIGNEE
**{{ASSIGNEE_NAME}}**

Signature: ________________________________
Date: ________________________________

In the presence of:
Name: ________________________________
Address: ________________________________
Occupation: ________________________________
Signature: ________________________________

---

**GOVERNOR'S CONSENT** (to be appended)`
});

T.push({
  document_type: 'power of attorney',
  category: 'property',
  title: 'General Power of Attorney',
  description: 'Authority granted by Donor to Donee to act on Donor\'s behalf.',
  applicable_law: 'Land Use Act 1978; Conveyancing Act',
  is_official: false,
  content: `# POWER OF ATTORNEY

**KNOW ALL MEN BY THESE PRESENTS** that I, **{{DONOR_NAME}}** of {{DONOR_ADDRESS}} (hereinafter called **"the Donor"**), do hereby make, constitute, and appoint **{{DONEE_NAME}}** of {{DONEE_ADDRESS}} (hereinafter called **"the Donee"** or **"my Attorney"**) to be my true and lawful Attorney for me and in my name to do and execute the following acts, deeds, and things:

## POWERS GRANTED

1. **{{POWER_1}}** including all necessary acts ancillary thereto.

2. **{{POWER_2}}** with full authority to receive monies, sign receipts, and give valid discharge.

3. **To represent me** before any government department, ministry, agency, court, tribunal, or other authority for {{REPRESENTATION_PURPOSE}}.

4. **To engage, instruct, and pay** legal practitioners, surveyors, accountants, and other professionals as may be necessary.

5. **To sign, execute, and deliver** any document, deed, or instrument necessary or expedient for carrying into effect any of the foregoing powers.

6. **And generally** to do all such acts and things as my Attorney may consider necessary or expedient in or about the premises as fully and effectually as I myself could do if personally present.

## RATIFICATION

I HEREBY AGREE to ratify and confirm whatsoever my said Attorney shall lawfully do or cause to be done by virtue of these presents.

## DURATION

This Power of Attorney shall {{DURATION_CLAUSE — e.g. remain in force until revoked in writing by me / be valid for a period of [X] years from the date hereof / continue until completion of [SPECIFIC TRANSACTION]}}.

## REVOCATION

This Power of Attorney may be revoked by me at any time by giving written notice of revocation to the Donee and publishing notice of revocation in a national daily newspaper.

---

**IN WITNESS WHEREOF** I have hereunto set my hand and seal this {{TODAY}}.

**SIGNED, SEALED AND DELIVERED** by the within-named DONOR
**{{DONOR_NAME}}**

Signature: ________________________________

In the presence of:
Name: ________________________________
Address: ________________________________
Occupation: ________________________________
Signature: ________________________________

---

**I ACCEPT THE APPOINTMENT** as Attorney under this Power of Attorney.

**{{DONEE_NAME}}** (Donee/Attorney)
Signature: ________________________________
Date: ________________________________`
});

T.push({
  document_type: 'notice to quit',
  category: 'property',
  title: 'Notice to Quit',
  description: 'Statutory notice terminating a tenancy under Nigerian state tenancy law.',
  applicable_law: 'Lagos State Tenancy Law 2011 / Recovery of Premises Act / state equivalents',
  is_official: true,
  content: `# NOTICE TO QUIT

**TO: {{TENANT_NAME}}**
**Of: {{PREMISES_ADDRESS}}**

**FROM: {{LANDLORD_NAME}}**
**Of: {{LANDLORD_ADDRESS}}**

---

I, **{{LANDLORD_NAME}}**, your Landlord, hereby give you notice to QUIT, deliver up, and yield possession to me of:

**ALL THAT property situate at {{PREMISES_ADDRESS}}**

which you currently hold as my Tenant.

## TERMINATION DATE

You are required to give up possession of the said premises on or before **{{QUIT_DATE}}**.

This Notice is given pursuant to:
- Section {{TENANCY_LAW_SECTION}} of the {{APPLICABLE_TENANCY_LAW}};
- The terms of the Tenancy Agreement dated {{TENANCY_DATE}} between us;
- The applicable notice period for a {{TENANCY_TYPE}} tenancy.

## STATUTORY NOTICE PERIODS

Under Nigerian tenancy law, the notice period applicable to your tenancy is:
- Weekly tenancy: 1 week
- Monthly tenancy: 1 month
- Quarterly tenancy: 3 months
- Half-yearly tenancy: 3 months
- Yearly tenancy: 6 months

Your tenancy is **{{TENANCY_TYPE}}** and accordingly the notice period of **{{NOTICE_PERIOD}}** applies.

## CONSEQUENCES OF NON-COMPLIANCE

**TAKE NOTICE** that should you fail to vacate the premises on or before the date specified above, I shall be obliged to take further legal steps including, but not limited to:

1. Serving you with a 7-day Statutory Notice of Intention to Recover Premises;
2. Commencing legal proceedings in the appropriate court for an Order of Recovery of Possession;
3. Claiming all mesne profits (rent due) from the date of expiration of this Notice to the date of actual recovery of possession;
4. Claiming costs of the action.

## NO SELF-HELP

Nothing in this Notice authorises self-help eviction. Recovery of possession shall be by due process of law only.

---

Dated this {{TODAY}}.

________________________________
**{{LANDLORD_NAME}}**
Landlord

Or by Counsel:

________________________________
**{{COUNSEL_NAME}}**
Solicitor for the Landlord
{{COUNSEL_FIRM}}
{{COUNSEL_ADDRESS}}`
});

T.push({
  document_type: 'deed of gift',
  category: 'property',
  title: 'Deed of Gift',
  description: 'Voluntary transfer of property without monetary consideration.',
  applicable_law: 'Conveyancing Act; Land Use Act 1978; Stamp Duties Act',
  is_official: false,
  content: `# DEED OF GIFT

**THIS DEED OF GIFT** is made this {{TODAY}}.

## BETWEEN:

**{{DONOR_NAME}}** of {{DONOR_ADDRESS}} (hereinafter called **"the Donor"** which expression shall where the context so admits include the Donor's heirs, executors, administrators, and assigns) of the ONE PART;

**AND**

**{{DONEE_NAME}}** of {{DONEE_ADDRESS}} (hereinafter called **"the Donee"** which expression shall where the context so admits include the Donee's heirs, executors, administrators, and assigns) of the OTHER PART.

## RECITALS

A. The Donor is the absolute owner of the property/assets described in the Schedule hereto (the "Gift Property").

B. Out of natural love and affection for the Donee {{RELATIONSHIP_TO_DONEE}}, and without any monetary consideration whatsoever, the Donor desires to make a gift of the Gift Property to the Donee.

C. The Donee has accepted the gift.

## NOW THIS DEED WITNESSES AS FOLLOWS:

### 1. GIFT
In consideration of natural love and affection that the Donor bears for the Donee, the Donor HEREBY GIVES, GRANTS, TRANSFERS, AND CONVEYS unto the Donee absolutely all the Gift Property described in the Schedule hereto TO HAVE AND TO HOLD the same unto the Donee as absolute owner.

### 2. DELIVERY
Possession of the Gift Property has been delivered to the Donee on the date hereof.

### 3. DONOR'S COVENANTS
The Donor covenants with the Donee:
(a) That the Donor is the lawful and beneficial owner of the Gift Property;
(b) That the Gift Property is free from all encumbrances, charges, mortgages, or third-party claims;
(c) That the Donor will execute all further documents necessary to perfect the Donee's title.

### 4. IRREVOCABILITY
This gift is absolute, unconditional, and **IRREVOCABLE**. The Donor expressly acknowledges that upon execution and delivery, the Donor retains no interest, right, or claim whatsoever over the Gift Property.

### 5. GOVERNOR'S CONSENT (if land)
Where the Gift Property is land, the parties acknowledge that the consent of the Governor of {{STATE}} under Section 22 of the Land Use Act 1978 shall be obtained.

---

## THE SCHEDULE

**Description of Gift Property:** {{PROPERTY_DESCRIPTION}}

---

**IN WITNESS WHEREOF** the parties have executed this Deed the day and year first above written.

**SIGNED, SEALED AND DELIVERED** by the within-named DONOR
**{{DONOR_NAME}}**

Signature: ________________________________

In the presence of:
Name: ________________________________
Address: ________________________________
Signature: ________________________________

**ACCEPTED BY** the within-named DONEE
**{{DONEE_NAME}}**

Signature: ________________________________
Date: ________________________________

In the presence of:
Name: ________________________________
Address: ________________________________
Signature: ________________________________`
});

T.push({
  document_type: 'statutory declaration of age',
  category: 'court',
  title: 'Statutory Declaration of Age',
  description: 'Sworn statement of age for official records when no birth certificate exists.',
  applicable_law: 'Oaths Act; Evidence Act 2011',
  is_official: true,
  content: `# STATUTORY DECLARATION OF AGE

---

**STATE OF {{STATE}}**

**LOCAL GOVERNMENT AREA: {{LGA}}**

---

I, **{{DEPONENT_NAME}}**, {{DEPONENT_OCCUPATION}}, a Nigerian citizen, of {{DEPONENT_RELIGION}} religion, residing at {{DEPONENT_ADDRESS}}, do hereby make oath and state as follows:

1. That I am the deponent herein.

2. That I was born on {{DATE_OF_BIRTH}} ({{DATE_OF_BIRTH_WORDS}}) at {{PLACE_OF_BIRTH}} in {{LGA_OF_BIRTH}} Local Government Area, {{STATE_OF_BIRTH}} State, Nigeria.

3. That my parents are **{{FATHER_NAME}}** (father) and **{{MOTHER_NAME}}** (mother).

4. That at the time of my birth, no birth certificate was issued to my parents because {{REASON_NO_CERTIFICATE — e.g. it was a home birth in a rural area where registration was uncommon at the time}}.

5. That I am, as at the date of this declaration, {{CURRENT_AGE}} years old.

6. That this declaration is required for the purpose of {{PURPOSE — e.g. obtaining a National Identity Card, school enrolment, employment, pension, etc.}}.

7. That I depose to this affidavit in good faith, believing the contents to be true and correct, and in accordance with the Oaths Act, Laws of the Federation of Nigeria.

---

________________________________
**DEPONENT**
{{DEPONENT_NAME}}

---

## JURAT

**SWORN to at the Registry of the High Court of {{STATE}}**, this {{TODAY}}.

**BEFORE ME:**

________________________________
**COMMISSIONER FOR OATHS**`
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 3 — BUSINESS DOCUMENTS
// ═══════════════════════════════════════════════════════════════════
T.push({
  document_type: 'partnership agreement',
  category: 'business',
  title: 'Partnership Agreement',
  description: 'Agreement establishing a business partnership under Nigerian law.',
  applicable_law: 'Partnership Act (Cap P3 LFN 2004) / state partnership laws; CAMA 2020',
  is_official: false,
  content: `# PARTNERSHIP AGREEMENT

**THIS PARTNERSHIP AGREEMENT** is made this {{TODAY}}.

## BETWEEN:

**{{PARTNER_1_NAME}}** of {{PARTNER_1_ADDRESS}} (hereinafter referred to as **"the First Partner"**) of the ONE PART;

**AND**

**{{PARTNER_2_NAME}}** of {{PARTNER_2_ADDRESS}} (hereinafter referred to as **"the Second Partner"**) of the OTHER PART;

(Collectively referred to as **"the Partners"**).

## WHEREAS:

A. The Partners have agreed to carry on business in partnership under the firm name and style of **{{PARTNERSHIP_NAME}}**.

B. The Partners desire to record the terms of their partnership in writing.

## NOW THIS AGREEMENT WITNESSES AS FOLLOWS:

### 1. NAME AND OBJECTS
The Partnership shall be carried on under the name and style of **"{{PARTNERSHIP_NAME}}"** with its principal place of business at {{BUSINESS_ADDRESS}}.

The objects of the Partnership shall be {{BUSINESS_OBJECTS}}.

### 2. COMMENCEMENT AND DURATION
The Partnership shall commence on {{COMMENCEMENT_DATE}} and shall continue until terminated in accordance with the provisions of this Agreement.

### 3. CAPITAL CONTRIBUTIONS
The initial capital of the Partnership shall be **₦{{TOTAL_CAPITAL}}** contributed as follows:

- {{PARTNER_1_NAME}}: ₦{{PARTNER_1_CONTRIBUTION}} ({{PARTNER_1_PERCENTAGE}}%)
- {{PARTNER_2_NAME}}: ₦{{PARTNER_2_CONTRIBUTION}} ({{PARTNER_2_PERCENTAGE}}%)

### 4. PROFIT AND LOSS SHARING
Profits and losses of the Partnership shall be shared between the Partners in the ratio of their capital contributions, namely {{PARTNER_1_PERCENTAGE}}% to the First Partner and {{PARTNER_2_PERCENTAGE}}% to the Second Partner.

### 5. MANAGEMENT
(a) The Partners shall jointly manage the day-to-day affairs of the Partnership.
(b) Major decisions including the following shall require unanimous consent of all Partners:
   (i) Borrowing or lending money exceeding ₦{{BORROWING_THRESHOLD}};
   (ii) Acquisition or disposal of fixed assets exceeding ₦{{ASSET_THRESHOLD}};
   (iii) Admission of new partners;
   (iv) Engagement of legal proceedings on behalf of the Partnership;
   (v) Amendment of this Agreement.

### 6. BANKING
The Partnership shall maintain a bank account with {{BANK_NAME}}. Cheques and withdrawals shall require the signatures of {{SIGNATORY_REQUIREMENT — e.g. both Partners / any one Partner up to ₦X / both Partners above ₦X}}.

### 7. BOOKS OF ACCOUNT
Proper books of account shall be maintained at the principal place of business and shall be open to inspection by any Partner at all reasonable times. Annual accounts shall be prepared by {{ACCOUNTANT_OR_FIRM}}.

### 8. DRAWINGS
Each Partner may draw against his/her share of profits a monthly sum not exceeding ₦{{MONTHLY_DRAWING_LIMIT}}, subject to year-end reconciliation.

### 9. RESTRICTIONS ON PARTNERS
No Partner shall, without the prior written consent of the other Partner(s):
(a) Engage in any business that competes with the Partnership;
(b) Assign, mortgage, or charge his/her share in the Partnership;
(c) Bind the Partnership beyond the ordinary course of business;
(d) Disclose confidential information of the Partnership.

### 10. DISSOLUTION
The Partnership shall be dissolved upon:
(a) Mutual agreement of all Partners;
(b) Death, bankruptcy, or permanent incapacity of any Partner;
(c) Service of a written notice of dissolution by any Partner giving not less than {{DISSOLUTION_NOTICE_PERIOD}} months' notice;
(d) Court order.

### 11. ACCOUNTS ON DISSOLUTION
Upon dissolution, the assets of the Partnership shall be applied in the following order:
(i) Payment of debts to third parties;
(ii) Repayment of loans by Partners;
(iii) Repayment of capital contributions;
(iv) Distribution of surplus (if any) among Partners in their profit-sharing ratios.

### 12. DISPUTE RESOLUTION
Any dispute arising out of or relating to this Agreement shall first be referred to mediation. If mediation fails, the dispute shall be referred to arbitration under the Arbitration and Conciliation Act, Cap A18 LFN 2004, before a sole arbitrator in {{ARBITRATION_VENUE}}.

### 13. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria.

---

**IN WITNESS WHEREOF** the Partners have executed this Agreement the day and year first above written.

**SIGNED** by the within-named FIRST PARTNER
**{{PARTNER_1_NAME}}**

Signature: ________________________________

In the presence of:
Name: ________________________________
Signature: ________________________________

**SIGNED** by the within-named SECOND PARTNER
**{{PARTNER_2_NAME}}**

Signature: ________________________________

In the presence of:
Name: ________________________________
Signature: ________________________________`
});

T.push({
  document_type: 'non-disclosure agreement',
  category: 'business',
  title: 'Non-Disclosure Agreement (NDA)',
  description: 'Mutual or one-way NDA protecting confidential information.',
  applicable_law: 'Contract law; CAMA 2020',
  is_official: false,
  content: `# NON-DISCLOSURE AGREEMENT

**THIS NON-DISCLOSURE AGREEMENT** ("Agreement") is made this {{TODAY}}.

## BETWEEN:

**{{DISCLOSING_PARTY_NAME}}** of {{DISCLOSING_PARTY_ADDRESS}} (hereinafter referred to as **"the Disclosing Party"**); AND

**{{RECEIVING_PARTY_NAME}}** of {{RECEIVING_PARTY_ADDRESS}} (hereinafter referred to as **"the Receiving Party"**).

(Each a "Party" and together "the Parties").

## RECITALS

A. The Disclosing Party possesses certain confidential and proprietary information relating to {{NATURE_OF_INFORMATION}}.

B. In connection with discussions regarding {{PURPOSE}}, the Disclosing Party may disclose Confidential Information to the Receiving Party.

C. The Parties wish to set out the terms upon which such Confidential Information shall be treated.

## NOW THIS AGREEMENT WITNESSES AS FOLLOWS:

### 1. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means all non-public information disclosed by the Disclosing Party to the Receiving Party, whether before or after the date of this Agreement, including but not limited to:
- Trade secrets, know-how, formulae, designs, drawings, and technical data;
- Financial information, business plans, customer lists, pricing, and marketing strategies;
- Personnel information, partnership details, and any information marked or designated as "confidential"; and
- All copies, notes, summaries, analyses, and derivatives of the above.

### 2. EXCLUSIONS
Confidential Information shall NOT include information that:
(a) Is or becomes publicly available through no fault of the Receiving Party;
(b) Was known to the Receiving Party prior to disclosure;
(c) Is rightfully received from a third party without obligation of confidentiality;
(d) Is independently developed by the Receiving Party without use of the Confidential Information;
(e) Is required to be disclosed by law, court order, or regulatory authority, provided that the Receiving Party gives prompt notice to the Disclosing Party.

### 3. OBLIGATIONS OF THE RECEIVING PARTY
The Receiving Party undertakes:
(a) To hold the Confidential Information in strict confidence;
(b) To use the Confidential Information solely for the Purpose stated above;
(c) Not to disclose the Confidential Information to any third party without the prior written consent of the Disclosing Party;
(d) To restrict access to the Confidential Information to those of its employees, agents, or advisers who have a need to know for the Purpose and who are bound by similar obligations of confidentiality;
(e) To take all reasonable measures to safeguard the Confidential Information including no less than the standard of care it applies to its own confidential information.

### 4. RETURN OR DESTRUCTION
Upon the earlier of (a) termination of this Agreement or (b) the written request of the Disclosing Party, the Receiving Party shall promptly return or destroy all Confidential Information and certify in writing such return or destruction.

### 5. NO LICENCE
This Agreement does not grant the Receiving Party any licence or right (express or implied) in or to the Confidential Information or any intellectual property of the Disclosing Party.

### 6. TERM
This Agreement shall come into force on the date hereof and the obligations of confidentiality shall continue for a period of **{{CONFIDENTIALITY_TERM}}** years from the date of disclosure, save that obligations relating to trade secrets shall continue indefinitely.

### 7. REMEDIES
The Receiving Party acknowledges that any breach of this Agreement may cause irreparable harm to the Disclosing Party for which damages may not be an adequate remedy, and that the Disclosing Party shall be entitled to seek injunctive relief in addition to any other remedies available at law or in equity.

### 8. GOVERNING LAW AND DISPUTE RESOLUTION
This Agreement shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria. Any dispute shall be referred to arbitration in {{ARBITRATION_VENUE}} under the Arbitration and Conciliation Act, Cap A18 LFN 2004.

### 9. ENTIRE AGREEMENT
This Agreement constitutes the entire understanding between the Parties relating to the subject matter and supersedes all prior negotiations, representations, and agreements.

---

**IN WITNESS WHEREOF** the Parties have executed this Agreement the day and year first above written.

**SIGNED** for and on behalf of THE DISCLOSING PARTY
**{{DISCLOSING_PARTY_NAME}}**

By: ________________________________
Name: ________________________________
Title: ________________________________
Date: ________________________________

**SIGNED** for and on behalf of THE RECEIVING PARTY
**{{RECEIVING_PARTY_NAME}}**

By: ________________________________
Name: ________________________________
Title: ________________________________
Date: ________________________________`
});

T.push({
  document_type: 'board resolution',
  category: 'business',
  title: 'Board Resolution',
  description: 'Formal resolution of a Nigerian company\'s board of directors.',
  applicable_law: 'CAMA 2020',
  is_official: false,
  content: `# {{COMPANY_NAME}}

(RC No. {{RC_NUMBER}})

# BOARD RESOLUTION

Passed at the meeting of the Board of Directors of **{{COMPANY_NAME}}** held at {{MEETING_VENUE}} on {{MEETING_DATE}} at {{MEETING_TIME}}.

## DIRECTORS PRESENT

1. {{DIRECTOR_1_NAME}} — {{DIRECTOR_1_DESIGNATION}}
2. {{DIRECTOR_2_NAME}} — {{DIRECTOR_2_DESIGNATION}}
3. {{DIRECTOR_3_NAME}} — {{DIRECTOR_3_DESIGNATION}}

(quorum confirmed in accordance with the Articles of Association of the Company)

---

## RESOLUTIONS

**IT WAS RESOLVED THAT:**

### RESOLUTION 1
{{RESOLUTION_1_TEXT}}.

### RESOLUTION 2
{{RESOLUTION_2_TEXT}}.

### RESOLUTION 3
That **{{AUTHORISED_SIGNATORY_NAME}}**, {{AUTHORISED_SIGNATORY_DESIGNATION}}, be and is hereby authorised to execute, sign, deliver, and do all such acts, deeds, things, and documents as may be necessary or expedient to give full effect to the foregoing resolutions on behalf of the Company.

---

These resolutions are passed in accordance with the Companies and Allied Matters Act, 2020 and the Articles of Association of the Company.

---

**CERTIFIED TRUE COPY:**

________________________________
**{{CHAIRMAN_NAME}}**
Chairman, Board of Directors

________________________________
**{{COMPANY_SECRETARY_NAME}}**
Company Secretary

**Date:** {{TODAY}}
**Company Seal:** [AFFIX HERE]`
});

T.push({
  document_type: 'service agreement',
  category: 'business',
  title: 'Service Agreement',
  description: 'General service provision agreement between two parties.',
  applicable_law: 'Contract law; Consumer Protection Council Act',
  is_official: false,
  content: `# SERVICE AGREEMENT

**THIS SERVICE AGREEMENT** is made this {{TODAY}}.

## BETWEEN:

**{{CLIENT_NAME}}** of {{CLIENT_ADDRESS}} (hereinafter referred to as **"the Client"**); AND

**{{SERVICE_PROVIDER_NAME}}** of {{SERVICE_PROVIDER_ADDRESS}} (hereinafter referred to as **"the Service Provider"**).

## RECITALS

A. The Client requires the services described in the First Schedule (the "Services").

B. The Service Provider has the necessary skill, experience, and resources to provide the Services and has agreed to do so on the terms set out below.

## NOW THIS AGREEMENT WITNESSES AS FOLLOWS:

### 1. SERVICES
The Service Provider shall provide the Services to the Client as more particularly described in the First Schedule, in a professional manner and to a standard reasonably expected of a competent provider.

### 2. COMMENCEMENT AND DURATION
The Services shall commence on {{COMMENCEMENT_DATE}} and continue until {{COMPLETION_DATE}}, unless terminated earlier in accordance with Clause 9 below.

### 3. FEES
(a) The Client shall pay the Service Provider the total sum of **₦{{TOTAL_FEE}}** ({{TOTAL_FEE_WORDS}} Naira only) for the Services.
(b) Payment shall be made as follows: {{PAYMENT_SCHEDULE}}.
(c) All invoices shall be settled within {{PAYMENT_TERMS_DAYS}} days of receipt.
(d) Late payment shall attract interest at the rate of 1.5% per month or the CBN MPR plus 5%, whichever is higher.

### 4. EXPENSES
{{EXPENSES_CLAUSE — e.g. The Service Provider's fee includes all expenses / The Client shall reimburse pre-approved out-of-pocket expenses on production of receipts}}.

### 5. SERVICE PROVIDER'S OBLIGATIONS
The Service Provider shall:
(a) Devote such time and attention as is necessary to perform the Services efficiently;
(b) Comply with all applicable Nigerian laws and regulations;
(c) Hold valid all licences, permits, and registrations required to perform the Services;
(d) Maintain professional indemnity insurance of not less than ₦{{INSURANCE_AMOUNT}} where applicable;
(e) Promptly inform the Client of any matter likely to affect the performance of the Services.

### 6. CLIENT'S OBLIGATIONS
The Client shall:
(a) Provide the Service Provider with timely access to all information, premises, personnel, and resources reasonably required;
(b) Make all payments in accordance with Clause 3;
(c) Co-operate with the Service Provider in good faith.

### 7. INTELLECTUAL PROPERTY
{{IP_CLAUSE — e.g. All intellectual property created in the course of providing the Services shall vest in the Client upon full payment of the Fees / The Service Provider retains ownership of pre-existing IP and grants the Client a non-exclusive licence to use the deliverables}}.

### 8. CONFIDENTIALITY
Each Party undertakes to keep confidential all information of the other Party received in the course of this Agreement and not to disclose such information to any third party without prior written consent, save where required by law.

### 9. TERMINATION
This Agreement may be terminated:
(a) By either Party giving the other not less than {{TERMINATION_NOTICE}} days' written notice;
(b) Immediately by either Party in the event of a material breach by the other Party which is not remedied within 14 days of written notice to do so;
(c) Immediately by either Party in the event of insolvency, winding-up, or appointment of a receiver in respect of the other Party.

### 10. LIMITATION OF LIABILITY
Save for fraud, gross negligence, or wilful misconduct, the Service Provider's total aggregate liability under this Agreement shall not exceed the total Fees paid or payable under this Agreement.

### 11. DISPUTE RESOLUTION
Any dispute shall be referred to mediation, and failing settlement within 30 days, to arbitration in {{ARBITRATION_VENUE}} under the Arbitration and Conciliation Act, Cap A18 LFN 2004.

### 12. GOVERNING LAW
This Agreement shall be governed by the laws of the Federal Republic of Nigeria.

---

## FIRST SCHEDULE — DESCRIPTION OF SERVICES

{{DETAILED_SERVICE_DESCRIPTION}}

---

**IN WITNESS WHEREOF** the Parties have executed this Agreement the day and year first above written.

**SIGNED** for and on behalf of THE CLIENT
**{{CLIENT_NAME}}**

By: ________________________________
Name: ________________________________
Title: ________________________________

**SIGNED** for and on behalf of THE SERVICE PROVIDER
**{{SERVICE_PROVIDER_NAME}}**

By: ________________________________
Name: ________________________________
Title: ________________________________`
});

T.push({
  document_type: 'memorandum of understanding',
  category: 'business',
  title: 'Memorandum of Understanding (MOU)',
  description: 'Non-binding statement of intent between parties.',
  applicable_law: 'General principles of contract',
  is_official: false,
  content: `# MEMORANDUM OF UNDERSTANDING

**THIS MEMORANDUM OF UNDERSTANDING** ("MOU") is made this {{TODAY}}.

## BETWEEN:

**{{PARTY_1_NAME}}** of {{PARTY_1_ADDRESS}} ("Party A"); AND

**{{PARTY_2_NAME}}** of {{PARTY_2_ADDRESS}} ("Party B").

(Each a "Party" and together "the Parties").

## RECITALS

A. The Parties wish to record their mutual understanding regarding {{COLLABORATION_PURPOSE}}.

B. This MOU is intended to set out the framework for further negotiations and detailed agreements.

## TERMS OF UNDERSTANDING:

### 1. PURPOSE
The Parties intend to collaborate in respect of {{COLLABORATION_SCOPE}}.

### 2. ROLES AND CONTRIBUTIONS
(a) Party A shall: {{PARTY_A_CONTRIBUTIONS}}
(b) Party B shall: {{PARTY_B_CONTRIBUTIONS}}

### 3. EXCLUSIVITY
{{EXCLUSIVITY_CLAUSE — e.g. The Parties shall not enter into similar arrangements with third parties during the term of this MOU / The Parties remain free to pursue other opportunities}}.

### 4. CONFIDENTIALITY
The Parties shall keep all information shared in connection with this MOU confidential and shall not disclose such information without prior written consent of the other Party.

### 5. NON-BINDING NATURE
Except for the provisions on Confidentiality (Clause 4), Governing Law (Clause 9), and Dispute Resolution (Clause 10), this MOU is **NON-BINDING** and is a statement of intent only. It does not create any legally enforceable obligation to enter into any definitive agreement.

### 6. NO PARTNERSHIP
Nothing in this MOU shall constitute or be deemed to constitute a partnership, joint venture, agency, or employment relationship between the Parties.

### 7. COSTS
Each Party shall bear its own costs in connection with this MOU and any negotiations contemplated hereunder.

### 8. TERM
This MOU shall remain in force from the date hereof until {{MOU_EXPIRY_DATE}} or until superseded by a definitive agreement, whichever is earlier.

### 9. GOVERNING LAW
This MOU shall be governed by the laws of the Federal Republic of Nigeria.

### 10. DISPUTE RESOLUTION
The Parties shall use reasonable endeavours to resolve any dispute amicably through good-faith discussions.

---

**IN WITNESS WHEREOF** the Parties have executed this MOU the day and year first above written.

**SIGNED** for and on behalf of PARTY A
**{{PARTY_1_NAME}}**

By: ________________________________
Name: ________________________________
Title: ________________________________

**SIGNED** for and on behalf of PARTY B
**{{PARTY_2_NAME}}**

By: ________________________________
Name: ________________________________
Title: ________________________________`
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 4 — EMPLOYMENT DOCUMENTS
// ═══════════════════════════════════════════════════════════════════
T.push({
  document_type: 'employment contract',
  category: 'employment',
  title: 'Employment Contract',
  description: 'Full employment contract under Nigerian Labour Act.',
  applicable_law: 'Labour Act (Cap L1 LFN 2004); Pension Reform Act 2014; Employee Compensation Act 2010',
  is_official: false,
  content: `# CONTRACT OF EMPLOYMENT

**THIS CONTRACT OF EMPLOYMENT** is made this {{TODAY}}.

## BETWEEN:

**{{EMPLOYER_NAME}}** (RC No: {{EMPLOYER_RC}}) of {{EMPLOYER_ADDRESS}} (hereinafter referred to as **"the Employer"**); AND

**{{EMPLOYEE_NAME}}** of {{EMPLOYEE_ADDRESS}} (hereinafter referred to as **"the Employee"**).

## 1. POSITION AND DUTIES
(a) The Employer hereby employs the Employee in the position of **{{JOB_TITLE}}**.
(b) The Employee shall report to **{{REPORTING_MANAGER}}**.
(c) The Employee's duties and responsibilities are as set out in the Schedule attached hereto, but may be varied from time to time by the Employer subject to reasonable notice.

## 2. COMMENCEMENT
The Employee's employment shall commence on **{{COMMENCEMENT_DATE}}**.

## 3. PROBATION
The Employee shall serve a probationary period of **{{PROBATION_PERIOD}}** from the commencement date. During probation, employment may be terminated by either Party giving {{PROBATION_NOTICE}} weeks' written notice.

## 4. REMUNERATION
(a) The Employer shall pay the Employee a gross annual salary of **₦{{ANNUAL_SALARY}}** ({{SALARY_WORDS}} Naira only), payable in equal monthly instalments of ₦{{MONTHLY_SALARY}} on or before the {{PAY_DAY}}th day of each month.
(b) Statutory deductions including PAYE, Pension (8% employee + 10% employer under the Pension Reform Act 2014), NHF, NHIS, and ITF contributions shall apply.
(c) The salary shall be reviewed annually, subject to performance and the Employer's discretion.

## 5. ALLOWANCES AND BENEFITS
The Employee shall be entitled to:
- Housing allowance: ₦{{HOUSING_ALLOWANCE}} per annum
- Transport allowance: ₦{{TRANSPORT_ALLOWANCE}} per annum
- Medical allowance/HMO cover: {{MEDICAL_BENEFIT}}
- 13th month bonus: {{BONUS_TERMS}}
- {{OTHER_BENEFITS}}

## 6. WORKING HOURS
The Employee's normal working hours shall be 8:00 a.m. to 5:00 p.m., Monday to Friday, with a one-hour lunch break. The Employee may be required to work additional hours as the role demands.

## 7. LEAVE ENTITLEMENTS
(a) **Annual Leave:** {{ANNUAL_LEAVE_DAYS}} working days per annum after completion of one full year of service (Section 18 Labour Act).
(b) **Sick Leave:** Up to 12 working days per annum (Section 16 Labour Act), with medical certificate from a registered practitioner.
(c) **Maternity Leave:** 12 weeks (or as may be applicable under state law) at full pay.
(d) **Paternity Leave:** {{PATERNITY_LEAVE_DAYS}} days (where state law applies).
(e) **Public Holidays:** All days declared public holidays by the Federal Government.

## 8. CONFIDENTIALITY
The Employee shall not, during or after the employment, disclose to any third party any confidential information of the Employer.

## 9. INTELLECTUAL PROPERTY
All intellectual property created by the Employee in the course of employment shall vest absolutely in the Employer.

## 10. NON-COMPETE
For a period of **{{NON_COMPETE_PERIOD}}** months following termination, the Employee shall not engage in any business that directly competes with the Employer within {{NON_COMPETE_TERRITORY}}.

## 11. TERMINATION
(a) After confirmation, employment may be terminated by either Party giving the following notice as required by Section 11 of the Labour Act:
   - Less than 3 months' service: 1 day
   - 3 months — 2 years: 1 week
   - 2 — 5 years: 2 weeks
   - 5+ years: 1 month
(b) The Employer may, in lieu of notice, pay the Employee the equivalent salary for the notice period.
(c) The Employer may terminate the employment summarily without notice or payment in lieu of notice for gross misconduct including but not limited to fraud, dishonesty, insubordination, or breach of fundamental terms.

## 12. PENSION
The Employer shall remit pension contributions to the Employee's PFA (Pension Fund Administrator) — {{EMPLOYEE_PFA}} — in accordance with the Pension Reform Act 2014.

## 13. DISPUTE RESOLUTION
Any dispute between the Parties shall first be referred to internal grievance procedures. If unresolved, it shall be referred to the National Industrial Court of Nigeria, which has exclusive jurisdiction over employment matters under Section 254C of the Constitution of the Federal Republic of Nigeria 1999 (as amended).

## 14. GOVERNING LAW
This Contract shall be governed by the Labour Act (Cap L1 LFN 2004) and other applicable Nigerian laws.

---

## SCHEDULE — DUTIES AND RESPONSIBILITIES

{{DETAILED_JOB_DESCRIPTION}}

---

**SIGNED** for and on behalf of THE EMPLOYER
**{{EMPLOYER_NAME}}**

By: ________________________________
Name: ________________________________
Title: ________________________________

**SIGNED** by THE EMPLOYEE
**{{EMPLOYEE_NAME}}**

Signature: ________________________________
Date: ________________________________`
});

T.push({
  document_type: 'offer letter',
  category: 'employment',
  title: 'Offer Letter / Letter of Appointment',
  description: 'Formal job offer to a new employee.',
  applicable_law: 'Labour Act (Cap L1 LFN 2004)',
  is_official: false,
  content: `# {{EMPLOYER_LETTERHEAD}}

{{TODAY}}

**{{CANDIDATE_NAME}}**
{{CANDIDATE_ADDRESS}}

Dear {{CANDIDATE_TITLE_AND_NAME}},

## RE: OFFER OF EMPLOYMENT — {{JOB_TITLE}}

We are pleased to offer you the position of **{{JOB_TITLE}}** at **{{EMPLOYER_NAME}}** on the following terms and conditions:

### 1. POSITION
You shall serve as {{JOB_TITLE}}, reporting to **{{REPORTING_MANAGER}}**, with a place of work at {{WORK_LOCATION}}.

### 2. COMMENCEMENT
Your employment shall commence on **{{COMMENCEMENT_DATE}}**.

### 3. PROBATION
You shall be on probation for **{{PROBATION_PERIOD}}**, during which time the engagement may be terminated by either party with {{PROBATION_NOTICE}} weeks' written notice.

### 4. REMUNERATION
- **Gross Annual Salary:** ₦{{ANNUAL_SALARY}}, payable monthly in arrears
- **Housing Allowance:** ₦{{HOUSING_ALLOWANCE}} per annum
- **Transport Allowance:** ₦{{TRANSPORT_ALLOWANCE}} per annum
- **Other Benefits:** {{OTHER_BENEFITS}}

All statutory deductions (PAYE, Pension, NHF) shall apply.

### 5. WORKING HOURS
Monday to Friday, 8:00 a.m. to 5:00 p.m., with reasonable flexibility as the role requires.

### 6. LEAVE
- Annual leave: {{ANNUAL_LEAVE_DAYS}} working days
- Sick leave, maternity leave, and public holidays in accordance with Nigerian law

### 7. CONFIDENTIALITY
You shall be bound by strict obligations of confidentiality during and after employment, as set out in the full Contract of Employment.

### 8. TERMINATION
After confirmation, employment may be terminated by either party giving the statutory notice under Section 11 of the Labour Act.

### 9. ACCEPTANCE
This offer is open for acceptance until **{{OFFER_EXPIRY_DATE}}**. Please indicate your acceptance by signing the duplicate copy of this letter and returning it to us, together with:
- A copy of your relevant academic certificates and credentials
- Two passport photographs
- Two referees (one being your immediate past employer)
- Evidence of National Identity Number (NIN), BVN, and Tax Identification Number (TIN)
- Pension Fund Administrator (PFA) details

We look forward to welcoming you to **{{EMPLOYER_NAME}}** and to a mutually rewarding working relationship.

Yours sincerely,

________________________________
**{{HR_SIGNATORY_NAME}}**
{{HR_SIGNATORY_TITLE}}
For: {{EMPLOYER_NAME}}

---

## ACCEPTANCE

I, **{{CANDIDATE_NAME}}**, hereby accept the offer of employment on the terms and conditions stated above.

Signature: ________________________________
Date: ________________________________`
});

T.push({
  document_type: 'termination letter',
  category: 'employment',
  title: 'Letter of Termination of Employment',
  description: 'Notice terminating an employment relationship.',
  applicable_law: 'Labour Act (Cap L1 LFN 2004) s.11',
  is_official: false,
  content: `# {{EMPLOYER_LETTERHEAD}}

{{TODAY}}

**{{EMPLOYEE_NAME}}**
{{EMPLOYEE_DEPARTMENT}}
{{EMPLOYER_NAME}}

Dear {{EMPLOYEE_NAME}},

## RE: TERMINATION OF EMPLOYMENT

We refer to your Contract of Employment dated {{CONTRACT_DATE}} and write to formally notify you of the termination of your employment with **{{EMPLOYER_NAME}}**, effective **{{TERMINATION_EFFECTIVE_DATE}}**.

### REASON
{{TERMINATION_REASON — e.g. The Company is restructuring its operations and your role has been declared redundant / Repeated poor performance despite warnings / Mutual decision following discussions}}.

### NOTICE PERIOD
In accordance with Section 11 of the Labour Act (Cap L1 LFN 2004) and your Contract of Employment, you are entitled to **{{NOTICE_PERIOD}}** notice. {{NOTICE_TREATMENT — e.g. You are required to work through your notice period / Your salary in lieu of notice will be paid into your account on the effective date}}.

### TERMINAL ENTITLEMENTS
You shall receive the following final entitlements:
1. Salary up to the effective date of termination
2. Payment in lieu of any unused annual leave: {{LEAVE_PAYOUT}}
3. Pro-rated 13th month (if applicable): {{BONUS_PAYOUT}}
4. {{SEVERANCE_OR_REDUNDANCY_PAYMENT}}
5. Refund of any pension contributions held by your PFA
6. {{ANY_OTHER_ENTITLEMENT}}

### POST-EMPLOYMENT OBLIGATIONS
You are reminded of the following obligations that survive termination:
(a) Confidentiality of the Company's proprietary information
(b) Non-solicitation of clients and employees for the period specified in your Contract
(c) Return of all Company property including laptops, ID cards, files, keys, and access cards

### EXIT FORMALITIES
Please report to the HR Department on **{{EXIT_DATE}}** to:
- Complete exit clearance forms
- Return all Company property
- Receive your terminal payments
- Collect your Certificate of Service and reference letter

### APPRECIATION
We thank you for your service to **{{EMPLOYER_NAME}}** and wish you well in your future endeavours.

Yours sincerely,

________________________________
**{{HR_SIGNATORY_NAME}}**
{{HR_SIGNATORY_TITLE}}
For: {{EMPLOYER_NAME}}`
});

T.push({
  document_type: 'query letter',
  category: 'employment',
  title: 'Query Letter to Employee',
  description: 'Formal disciplinary query requiring written response from an employee.',
  applicable_law: 'Labour Act; Common law fair-hearing requirements',
  is_official: false,
  content: `# {{EMPLOYER_LETTERHEAD}}

**Ref: HR/QRY/{{REF_NUMBER}}**
{{TODAY}}

**{{EMPLOYEE_NAME}}**
{{EMPLOYEE_DEPARTMENT}}
{{EMPLOYER_NAME}}

Dear {{EMPLOYEE_NAME}},

## RE: FORMAL QUERY — {{NATURE_OF_OFFENCE}}

It has been brought to the attention of Management that on **{{INCIDENT_DATE}}** at approximately {{INCIDENT_TIME}}, you allegedly:

{{DETAILED_DESCRIPTION_OF_INCIDENT}}

This conduct, if true, constitutes a breach of:
- Section {{HANDBOOK_SECTION}} of the Staff Handbook
- Clause {{CONTRACT_CLAUSE}} of your Contract of Employment
- {{COMPANY_POLICY_REFERENCED}}

You are hereby required to give a written explanation within **{{RESPONSE_DEADLINE}}** working hours from the receipt of this query, addressing the following:

1. Whether the allegations are true
2. Your explanation/justification (if any) for the conduct
3. Steps you propose to ensure non-repetition
4. Any other relevant facts you wish Management to consider

Please note that failure to respond within the stipulated period will be construed as an admission of the allegations and Management shall proceed to take such disciplinary action as it deems appropriate without further reference to you.

This query is issued without prejudice to any other disciplinary measure that Management may consider appropriate after considering your response.

Yours sincerely,

________________________________
**{{HR_SIGNATORY_NAME}}**
{{HR_SIGNATORY_TITLE}}
For: {{EMPLOYER_NAME}}

---

## ACKNOWLEDGMENT OF RECEIPT

I, **{{EMPLOYEE_NAME}}**, acknowledge receipt of this query.

Signature: ________________________________
Date: ________________________________
Time: ________________________________`
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 5 — PERSONAL DOCUMENTS
// ═══════════════════════════════════════════════════════════════════
T.push({
  document_type: 'last will and testament',
  category: 'personal',
  title: 'Last Will and Testament',
  description: 'Legal will distributing the testator\'s estate.',
  applicable_law: 'Wills Act 1837 (applicable); Wills Law of various states',
  is_official: false,
  content: `# THIS IS THE LAST WILL AND TESTAMENT OF
# {{TESTATOR_NAME}}

I, **{{TESTATOR_NAME}}**, of {{TESTATOR_ADDRESS}}, a Nigerian citizen, being of sound mind, memory, and understanding, do HEREBY MAKE, PUBLISH, AND DECLARE this to be my Last Will and Testament, hereby revoking all wills, codicils, and testamentary dispositions previously made by me.

## 1. APPOINTMENT OF EXECUTOR(S)

I HEREBY APPOINT the following as the Executor(s) and Trustee(s) of this my Will:

1. **{{EXECUTOR_1_NAME}}** of {{EXECUTOR_1_ADDRESS}}
2. **{{EXECUTOR_2_NAME}}** of {{EXECUTOR_2_ADDRESS}}

(hereinafter together called "my Executors") and direct them to carry out the provisions of this my Will.

## 2. PAYMENT OF DEBTS AND FUNERAL EXPENSES

I DIRECT my Executors to pay all my just debts, funeral, and testamentary expenses out of my estate as soon as conveniently may be after my decease.

## 3. SPECIFIC GIFTS

I GIVE, DEVISE, AND BEQUEATH the following specific gifts:

(a) To **{{BENEFICIARY_1_NAME}}** ({{RELATIONSHIP_1}}), my {{ITEM_1_DESCRIPTION}}.

(b) To **{{BENEFICIARY_2_NAME}}** ({{RELATIONSHIP_2}}), the sum of ₦{{AMOUNT_2}}.

(c) To **{{BENEFICIARY_3_NAME}}** ({{RELATIONSHIP_3}}), ALL THAT property situate at {{PROPERTY_3_ADDRESS}}.

## 4. RESIDUARY ESTATE

I GIVE, DEVISE, AND BEQUEATH all the rest, residue, and remainder of my estate of whatsoever nature and wheresoever situate (real and personal) to **{{RESIDUARY_BENEFICIARY}}** ({{RESIDUARY_RELATIONSHIP}}) absolutely.

## 5. GUARDIANSHIP OF MINOR CHILDREN

In the event that I am survived by minor children, I appoint **{{GUARDIAN_NAME}}** of {{GUARDIAN_ADDRESS}} to be the Guardian of my minor children, with full authority to provide for their welfare, education, and upbringing.

## 6. POWERS OF EXECUTORS

I grant my Executors the following powers in addition to those conferred by law:
(a) To sell, lease, mortgage, or otherwise dispose of any property of my estate at such price and on such terms as they may consider expedient;
(b) To compromise, settle, or submit to arbitration any claim by or against my estate;
(c) To invest trust monies in any authorised investment;
(d) To employ professional advisers at the expense of my estate.

## 7. SURVIVORSHIP

Any bequest or devise to a beneficiary who shall die before me or fail to survive me by 30 days shall lapse and form part of my residuary estate, unless otherwise expressly provided.

## 8. SEVERABILITY

If any provision of this Will is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.

---

**IN WITNESS WHEREOF** I have hereunto set my hand to this my Last Will and Testament this {{TODAY}}.

________________________________
**{{TESTATOR_NAME}}**
Testator

---

## ATTESTATION

**SIGNED** by the above-named Testator, **{{TESTATOR_NAME}}**, as and for his/her Last Will and Testament in the presence of us, both being present at the same time, who in his/her presence and at his/her request and in the presence of each other have hereunto subscribed our names as witnesses:

**WITNESS 1**
Name: ________________________________
Address: ________________________________
Occupation: ________________________________
Signature: ________________________________
Date: ________________________________

**WITNESS 2**
Name: ________________________________
Address: ________________________________
Occupation: ________________________________
Signature: ________________________________
Date: ________________________________

---

**NOTE:** This Will should be lodged with the Probate Registry of the High Court of {{STATE}} or kept in safe custody with the Testator's solicitor or in a sealed envelope at home where the Executors can locate it after death.`
});

T.push({
  document_type: 'divorce petition',
  category: 'personal',
  title: 'Petition for Dissolution of Marriage',
  description: 'Petition for divorce under the Matrimonial Causes Act.',
  applicable_law: 'Matrimonial Causes Act (Cap M7 LFN 2004); Matrimonial Causes Rules',
  is_official: false,
  content: `# IN THE HIGH COURT OF JUSTICE OF {{STATE}}
# IN THE {{JUDICIAL_DIVISION}} JUDICIAL DIVISION
# HOLDEN AT {{COURT_TOWN}}

## SUIT NO: [TO BE ASSIGNED]

---

### BETWEEN:

**{{PETITIONER_NAME}}** ........................................................ PETITIONER

### AND

**{{RESPONDENT_NAME}}** ...................................................... RESPONDENT

---

# PETITION FOR DISSOLUTION OF MARRIAGE

The Petitioner, **{{PETITIONER_NAME}}**, by his/her Counsel, respectfully states as follows:

### 1. THE PARTIES
The Petitioner is **{{PETITIONER_NAME}}**, a Nigerian citizen of {{PETITIONER_OCCUPATION}}, currently residing at {{PETITIONER_ADDRESS}}.

The Respondent is **{{RESPONDENT_NAME}}**, a Nigerian citizen of {{RESPONDENT_OCCUPATION}}, currently residing at {{RESPONDENT_ADDRESS}}.

### 2. THE MARRIAGE
The Petitioner and the Respondent were lawfully married on **{{MARRIAGE_DATE}}** at **{{MARRIAGE_LOCATION}}** under the Marriage Act, as evidenced by Marriage Certificate No. {{MARRIAGE_CERT_NO}}.

### 3. RESIDENCE/DOMICILE
At all material times to this petition, the Petitioner has been domiciled in {{STATE}}, Nigeria, and has resided there for a continuous period of not less than three years preceding the presentation of this petition.

### 4. CHILDREN OF THE MARRIAGE
{{CHILDREN_DETAILS — e.g. There are TWO children of the marriage, namely: (i) [Name], aged [X] years; (ii) [Name], aged [X] years. / There are no children of the marriage.}}

### 5. PARTICULARS OF THE BREAKDOWN
The marriage has broken down irretrievably for one or more of the grounds set out in Section 15(2) of the Matrimonial Causes Act, particularly:

{{GROUND_FOR_DIVORCE}}.

The Petitioner specifically relies on the following facts:

(a) {{FACT_1}}
(b) {{FACT_2}}
(c) {{FACT_3}}
(d) {{FACT_4}}

### 6. ATTEMPTS AT RECONCILIATION
{{RECONCILIATION_ATTEMPTS}}.

### 7. PREVIOUS PROCEEDINGS
{{PREVIOUS_PROCEEDINGS — e.g. There are no previous proceedings in any court relating to the marriage / The following previous proceedings have taken place: [details]}}.

### 8. JURISDICTION
This Honourable Court has jurisdiction to entertain this petition pursuant to Sections 2 and 7 of the Matrimonial Causes Act.

---

## RELIEFS SOUGHT

WHEREFORE the Petitioner humbly prays this Honourable Court for:

A. A **DECREE NISI** of Dissolution of Marriage on the ground that the marriage has broken down irretrievably;

B. A **DECREE ABSOLUTE** in due course;

C. AN ORDER awarding custody of the children of the marriage to the Petitioner with reasonable access to the Respondent {{CUSTODY_TERMS}};

D. AN ORDER for maintenance of the children of the marriage in the sum of ₦{{CHILD_MAINTENANCE}} per month;

E. AN ORDER for spousal maintenance/settlement of property as follows: {{ANCILLARY_RELIEFS}};

F. Costs of this petition;

G. Such further or other order(s) as this Honourable Court may deem fit to make.

---

## VERIFICATION

I, **{{PETITIONER_NAME}}**, the Petitioner herein, hereby verify the truth of the contents of this Petition.

Dated this {{TODAY}}.

________________________________
**{{PETITIONER_NAME}}**
Petitioner

________________________________
**{{COUNSEL_NAME}}**
Counsel for the Petitioner
{{COUNSEL_FIRM}}
{{COUNSEL_ADDRESS}}`
});

T.push({
  document_type: 'loan agreement',
  category: 'finance',
  title: 'Loan Agreement',
  description: 'Personal or commercial loan agreement between two parties.',
  applicable_law: 'Contract law; Money Lenders Act / state equivalents; CBN regulations where applicable',
  is_official: false,
  content: `# LOAN AGREEMENT

**THIS LOAN AGREEMENT** is made this {{TODAY}}.

## BETWEEN:

**{{LENDER_NAME}}** of {{LENDER_ADDRESS}} (hereinafter called **"the Lender"**); AND

**{{BORROWER_NAME}}** of {{BORROWER_ADDRESS}} (hereinafter called **"the Borrower"**).

## NOW THIS AGREEMENT WITNESSES AS FOLLOWS:

### 1. LOAN
The Lender hereby lends to the Borrower the sum of **₦{{LOAN_PRINCIPAL}}** ({{LOAN_AMOUNT_WORDS}} Naira only) (the "Principal") on the terms and conditions set out below.

### 2. DISBURSEMENT
The Principal shall be disbursed to the Borrower on {{DISBURSEMENT_DATE}} by {{DISBURSEMENT_METHOD — e.g. bank transfer to the Borrower's account: [bank, account no.] / cash}}.

### 3. INTEREST
The Loan shall attract simple interest at the rate of **{{INTEREST_RATE}}%** per annum, calculated on the outstanding balance.

### 4. REPAYMENT
The Borrower shall repay the Loan together with accrued interest as follows:

(a) **Repayment Schedule:** {{REPAYMENT_SCHEDULE — e.g. 12 equal monthly instalments of ₦[X] commencing on [date]}};

(b) **Final Repayment Date:** {{FINAL_REPAYMENT_DATE}};

(c) All payments shall be made to the Lender's account: {{LENDER_BANK_ACCOUNT}};

(d) Payment shall be deemed made when received and cleared in the Lender's account.

### 5. EARLY REPAYMENT
The Borrower may repay all or any part of the Principal before the due date without penalty. Interest shall be adjusted accordingly.

### 6. DEFAULT
A default shall occur if:
(a) The Borrower fails to make any payment when due and such failure continues for {{GRACE_PERIOD}} days;
(b) The Borrower makes any false representation under this Agreement;
(c) The Borrower becomes insolvent or has a receiver appointed.

Upon default, the entire outstanding Principal and accrued interest shall become immediately due and payable, and the Lender may:
(i) Charge default interest at {{DEFAULT_INTEREST_RATE}}% per annum on the outstanding sum;
(ii) Enforce any security provided;
(iii) Commence legal action to recover the debt with all incidental costs.

### 7. SECURITY (where applicable)
{{SECURITY_CLAUSE — e.g. The Borrower deposits with the Lender [SECURITY DESCRIPTION] as security for the Loan / The Loan is guaranteed by [GUARANTOR NAME] under a separate Deed of Guarantee / The Loan is unsecured}}.

### 8. ACCELERATION
Upon any default that is not remedied within the grace period, the entire outstanding balance shall, at the Lender's option, become immediately due and payable.

### 9. NOTICES
All notices shall be in writing and delivered by hand, registered post, or email to the addresses stated above.

### 10. ASSIGNMENT
The Borrower shall not assign its obligations under this Agreement. The Lender may assign its rights upon notice to the Borrower.

### 11. GOVERNING LAW & DISPUTE RESOLUTION
This Agreement shall be governed by Nigerian law. Any dispute shall first be referred to mediation, and failing settlement, to the {{COMPETENT_COURT — e.g. High Court of [State]}}.

---

**IN WITNESS WHEREOF** the parties have executed this Agreement the day and year first above written.

**SIGNED** by the within-named LENDER
**{{LENDER_NAME}}**

Signature: ________________________________

In the presence of:
Name: ________________________________
Signature: ________________________________

**SIGNED** by the within-named BORROWER
**{{BORROWER_NAME}}**

Signature: ________________________________

In the presence of:
Name: ________________________________
Signature: ________________________________`
});

T.push({
  document_type: 'promissory note',
  category: 'finance',
  title: 'Promissory Note',
  description: 'Unconditional written promise to pay a sum of money.',
  applicable_law: 'Bills of Exchange Act (Cap B8 LFN 2004) ss.83-89',
  is_official: false,
  content: `# PROMISSORY NOTE

**Principal Amount:** ₦{{PRINCIPAL_AMOUNT}} ({{AMOUNT_IN_WORDS}} Naira only)

**Place of Execution:** {{PLACE_OF_EXECUTION}}

**Date:** {{TODAY}}

---

**FOR VALUE RECEIVED**, I, **{{MAKER_NAME}}** of {{MAKER_ADDRESS}} (hereinafter called **"the Maker"**), HEREBY UNCONDITIONALLY PROMISE TO PAY to **{{PAYEE_NAME}}** of {{PAYEE_ADDRESS}} (hereinafter called **"the Payee"**) or order, the principal sum of **₦{{PRINCIPAL_AMOUNT}}** ({{AMOUNT_IN_WORDS}} Naira only), together with interest thereon at the rate of **{{INTEREST_RATE}}%** per annum, on **{{DUE_DATE}}**.

## TERMS

1. **Repayment:** {{REPAYMENT_TERMS — e.g. The Principal shall be repaid in full on the Due Date / The Principal shall be repaid in [X] equal monthly instalments commencing [date]}}.

2. **Interest:** Interest shall accrue from the date hereof and shall be calculated on the outstanding balance.

3. **Method of Payment:** All payments shall be made by bank transfer to: {{PAYEE_BANK_ACCOUNT}}, OR by such other means as may be acceptable to the Payee.

4. **Default Interest:** In the event of default, the outstanding sum shall attract default interest at the rate of **{{DEFAULT_RATE}}%** per annum from the due date until full payment.

5. **Acceleration:** If the Maker fails to make any payment when due, the entire outstanding amount shall, at the option of the Payee, become immediately due and payable.

6. **Waiver:** The Maker hereby waives presentment for payment, notice of dishonour, and protest.

7. **Costs:** The Maker shall be liable for all costs of collection, including reasonable legal fees, in the event of default.

8. **Governing Law:** This Promissory Note shall be governed by the laws of the Federal Republic of Nigeria, particularly the Bills of Exchange Act.

---

**EXECUTED** by the Maker this {{TODAY}}.

________________________________
**{{MAKER_NAME}}**
Maker

In the presence of:

**WITNESS:**
Name: ________________________________
Address: ________________________________
Occupation: ________________________________
Signature: ________________________________
Date: ________________________________`
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 6 — MEDIA & PRESS
// ═══════════════════════════════════════════════════════════════════
T.push({
  document_type: 'FOI request',
  category: 'press',
  title: 'Freedom of Information Request Letter',
  description: 'Formal request for information from a Nigerian public institution.',
  applicable_law: 'Freedom of Information Act 2011',
  is_official: false,
  content: `# FREEDOM OF INFORMATION REQUEST

**Date:** {{TODAY}}

**To:**
The {{ADDRESSEE_TITLE}}
{{PUBLIC_INSTITUTION}}
{{INSTITUTION_ADDRESS}}

**From:**
{{REQUESTER_NAME}}
{{REQUESTER_ADDRESS}}
Email: {{REQUESTER_EMAIL}}
Phone: {{REQUESTER_PHONE}}

---

**RE: REQUEST FOR INFORMATION PURSUANT TO THE FREEDOM OF INFORMATION ACT, 2011**

Dear Sir/Madam,

## 1. INTRODUCTION

I, **{{REQUESTER_NAME}}**, hereby make this application pursuant to **Section 1(1) of the Freedom of Information Act, 2011** (the "FOI Act"), which grants every Nigerian citizen the right of access to records or information held by any public institution.

## 2. INFORMATION REQUESTED

I respectfully request access to the following records/information held by your office:

1. {{INFORMATION_1}}

2. {{INFORMATION_2}}

3. {{INFORMATION_3}}

4. {{INFORMATION_4}}

The records should cover the period from **{{DATE_RANGE_FROM}}** to **{{DATE_RANGE_TO}}**.

## 3. PURPOSE OF REQUEST

The information is sought for the purpose of {{PURPOSE_OF_REQUEST — e.g. journalistic investigation into public expenditure / academic research / public interest accountability / personal records}}.

## 4. PREFERRED FORMAT

I would prefer to receive the information in the following format:
- {{PREFERRED_FORMAT — e.g. Electronic copies via the email provided above / Certified hard copies / Inspection at your office}}.

## 5. STATUTORY TIMELINE

Pursuant to **Section 4 of the FOI Act**, you are required to respond to this request within **seven (7) days** of receipt by either:
(a) Providing the requested information; or
(b) Notifying me in writing of any extension required (not exceeding seven additional days); or
(c) Giving notice in writing of refusal, stating the specific section of the Act relied upon and detailing your right to challenge the refusal.

## 6. RIGHT OF APPEAL

I am aware that under **Section 20 of the FOI Act**, where this request is denied or any deemed denial occurs, I have the right to apply to a court of competent jurisdiction for judicial review.

## 7. COST

I undertake to pay any reasonable cost permitted under the FOI Act for the reproduction and supply of the information requested. Kindly provide a fee schedule before incurring any cost.

## 8. CONTACT

Please direct your response to me at the address above, or via email at {{REQUESTER_EMAIL}}, or by phone on {{REQUESTER_PHONE}}.

Yours faithfully,

________________________________
**{{REQUESTER_NAME}}**
Applicant

**Date:** {{TODAY}}`
});

T.push({
  document_type: 'press accreditation letter',
  category: 'press',
  title: 'Press Accreditation Letter',
  description: 'Letter requesting press accreditation for an event or institution.',
  applicable_law: 'General media practice',
  is_official: false,
  content: `# {{MEDIA_ORGANISATION_LETTERHEAD}}

{{TODAY}}

**The {{ADDRESSEE_TITLE}}**
{{HOSTING_ORGANISATION}}
{{ORGANISATION_ADDRESS}}

Dear Sir/Madam,

## RE: REQUEST FOR PRESS ACCREDITATION — {{EVENT_OR_PURPOSE}}

We write on behalf of **{{MEDIA_ORGANISATION_NAME}}**, a duly registered Nigerian media organisation, to request press accreditation for the following journalist(s) to cover {{EVENT_OR_PURPOSE}} scheduled to take place on {{EVENT_DATE}} at {{EVENT_VENUE}}.

## JOURNALIST DETAILS

**1. Name:** {{JOURNALIST_NAME}}
   **Designation:** {{JOURNALIST_DESIGNATION}}
   **Outlet:** {{MEDIA_ORGANISATION_NAME}}
   **NUJ Membership No.:** {{NUJ_NUMBER}}
   **Phone:** {{JOURNALIST_PHONE}}
   **Email:** {{JOURNALIST_EMAIL}}

**2. {{ADDITIONAL_JOURNALIST_IF_ANY}}**

## ABOUT THE MEDIA ORGANISATION

**{{MEDIA_ORGANISATION_NAME}}** is a {{MEDIA_TYPE — e.g. national daily newspaper / online publication / television station / radio station}} with reach covering {{COVERAGE_AREA}} and an audience of approximately {{AUDIENCE_SIZE}}. We have been in operation since {{YEAR_FOUNDED}} and are registered with:
- Corporate Affairs Commission (RC No: {{RC_NUMBER}})
- Nigerian Press Council
- {{OTHER_REGULATORY_BODIES}}

## COVERAGE FOCUS

Our coverage will focus on {{COVERAGE_FOCUS — e.g. policy announcements / public interest issues / development reportage / business and economy}}. We commit to professional, balanced, and accurate reporting in line with the Nigerian Press Council Code of Ethics.

## REQUIREMENTS

We would be grateful for:
1. Confirmation of accreditation
2. Press kit (if available)
3. Schedule of media-relevant events
4. Designated press area information
5. Contact person for media liaison

## UNDERTAKING

We hereby undertake that our journalist(s) shall:
(a) Conduct themselves professionally and respect all security and protocol arrangements;
(b) Display issued press credentials at all times;
(c) Comply with all reasonable directives of your organisation;
(d) Practise responsible journalism consistent with Nigerian press law and ethics.

We appreciate your cooperation and look forward to a favourable response.

Yours faithfully,

________________________________
**{{EDITOR_NAME}}**
{{EDITOR_TITLE}}
{{MEDIA_ORGANISATION_NAME}}

**Telephone:** {{EDITOR_PHONE}}
**Email:** {{EDITOR_EMAIL}}`
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 7 — DEMAND LETTERS & NOTICES
// ═══════════════════════════════════════════════════════════════════
T.push({
  document_type: 'letter of demand',
  category: 'demand',
  title: 'Letter of Demand (Debt Recovery)',
  description: 'Formal pre-action demand letter requiring payment of a debt.',
  applicable_law: 'Contract law; pre-action notice requirements',
  is_official: false,
  content: `# {{SOLICITOR_FIRM_LETTERHEAD}}

**Our Ref:** {{FILE_REFERENCE}}
**Your Ref:** -
**Date:** {{TODAY}}

**By Registered Post / Hand Delivery / Email**

**{{DEBTOR_NAME}}**
{{DEBTOR_ADDRESS}}

Dear Sir/Madam,

## RE: DEMAND FOR PAYMENT OF THE SUM OF ₦{{DEBT_AMOUNT}} OWED TO OUR CLIENT, {{CREDITOR_NAME}}

We act as Solicitors to **{{CREDITOR_NAME}}** of {{CREDITOR_ADDRESS}} (hereinafter "our Client"), upon whose instructions we write to you in the following terms.

## 1. BACKGROUND

Our Client informs us — and we verily believe — that:

1.1. Pursuant to {{TRANSACTION_DESCRIPTION — e.g. an agreement dated [X] / goods supplied on [X] / a loan advanced on [X]}}, you are indebted to our Client in the sum of **₦{{DEBT_AMOUNT}}** ({{DEBT_AMOUNT_WORDS}} Naira only).

1.2. The said debt became due and payable on **{{DEBT_DUE_DATE}}**.

1.3. Despite repeated demands (both oral and written) on {{PREVIOUS_DEMAND_DATES}}, you have failed, refused, and/or neglected to pay the said sum or any part thereof.

## 2. DEMAND

**TAKE NOTICE** that we are by this letter formally demanding payment of the sum of **₦{{DEBT_AMOUNT}}**, together with interest accruing at the rate of {{INTEREST_RATE}}% per annum from {{INTEREST_FROM_DATE}}, within **{{DEMAND_PERIOD}}** days from the date of this letter.

## 3. PAYMENT INSTRUCTIONS

Payment should be made to our Client's account:

- Bank: {{CREDITOR_BANK}}
- Account Name: {{CREDITOR_ACCOUNT_NAME}}
- Account Number: {{CREDITOR_ACCOUNT_NUMBER}}

OR by bank draft drawn in favour of {{CREDITOR_NAME}} delivered to our offices at the address above.

## 4. CONSEQUENCES OF NON-COMPLIANCE

**TAKE FURTHER NOTICE** that should you fail to comply with this demand within the period stated, our Client has instructed us to:

(a) Commence legal proceedings against you for recovery of the debt;

(b) Claim interest on the outstanding sum at the prevailing rate;

(c) Claim costs of the action including our Client's legal fees;

(d) Apply for such ancillary orders as may be appropriate, including garnishee orders, charging orders, or freezing orders;

(e) Report the matter to the appropriate authorities where the circumstances disclose criminal conduct.

## 5. WITHOUT PREJUDICE

This letter is written without prejudice to any other rights, remedies, or claims that our Client may have against you, all of which are expressly reserved.

## 6. SETTLEMENT

Our Client remains open to amicable resolution. Should you require clarification or wish to discuss a structured repayment arrangement, kindly contact the undersigned within {{SETTLEMENT_WINDOW}} days.

Yours faithfully,

________________________________
**{{SOLICITOR_NAME}}, ESQ.**
Principal/Partner
{{SOLICITOR_FIRM}}
{{SOLICITOR_PHONE}}
{{SOLICITOR_EMAIL}}

**c.c.** {{CREDITOR_NAME}}`
});

T.push({
  document_type: 'cease and desist letter',
  category: 'demand',
  title: 'Cease and Desist Letter',
  description: 'Demand to stop an unlawful or infringing activity.',
  applicable_law: 'Tort law; IP law where applicable',
  is_official: false,
  content: `# {{SOLICITOR_FIRM_LETTERHEAD}}

**Our Ref:** {{FILE_REFERENCE}}
**Date:** {{TODAY}}

**By Registered Post / Hand Delivery / Email**

**{{ADDRESSEE_NAME}}**
{{ADDRESSEE_ADDRESS}}

Dear Sir/Madam,

## RE: CEASE AND DESIST — {{NATURE_OF_INFRINGEMENT}}

We are Solicitors to **{{CLIENT_NAME}}** of {{CLIENT_ADDRESS}} (hereinafter "our Client"), on whose instructions we write.

## 1. FACTS

Our Client informs us that:

(a) {{FACT_1 — describe ownership/right being infringed}}.

(b) {{FACT_2 — describe the infringing conduct in detail}}.

(c) The infringing conduct came to our Client's attention on {{INFRINGEMENT_DISCOVERY_DATE}}.

(d) Evidence of the infringement is documented in {{EVIDENCE_REFERENCE}}.

## 2. LEGAL POSITION

Your conduct constitutes:

(a) {{LEGAL_VIOLATION_1 — e.g. Trade mark infringement under the Trade Marks Act / Copyright infringement under the Copyright Act / Defamation / Breach of contract / Tortious interference}};

(b) {{LEGAL_VIOLATION_2}};

(c) Actionable injury to our Client's rights and interests entitling our Client to relief at law and in equity.

## 3. DEMAND

**TAKE NOTICE** that you are hereby required to:

3.1. **IMMEDIATELY CEASE AND DESIST** from {{INFRINGING_CONDUCT}};

3.2. **DELIVER UP** to our Client all {{ITEMS_TO_BE_DELIVERED — e.g. infringing materials / unauthorised copies / documents}};

3.3. **PROVIDE A WRITTEN UNDERTAKING** within **{{COMPLIANCE_PERIOD}}** days from the date hereof that:
   (i) You shall not repeat or continue the infringing conduct;
   (ii) You shall destroy or surrender all infringing materials in your possession or control;
   (iii) You shall account to our Client for any profit made from the infringement;

3.4. **PAY OUR CLIENT'S LEGAL COSTS** incurred in addressing this matter.

## 4. CONSEQUENCES

If you fail to comply with this demand within the period specified, our Client has instructed us to commence legal proceedings against you seeking:

(a) Injunctive relief restraining the infringing conduct;

(b) Damages for the loss suffered;

(c) An account of profits made from the infringement;

(d) Delivery up or destruction of infringing materials;

(e) Costs of the action.

## 5. WITHOUT PREJUDICE

This letter is written without prejudice to any other rights and remedies of our Client, all of which are expressly reserved.

Please govern yourself accordingly.

Yours faithfully,

________________________________
**{{SOLICITOR_NAME}}, ESQ.**
Principal/Partner
{{SOLICITOR_FIRM}}
{{SOLICITOR_PHONE}}
{{SOLICITOR_EMAIL}}

**c.c.** {{CLIENT_NAME}}`
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 8 — INTELLECTUAL PROPERTY
// ═══════════════════════════════════════════════════════════════════
T.push({
  document_type: 'copyright assignment',
  category: 'ip',
  title: 'Copyright Assignment Agreement',
  description: 'Transfer of copyright in a creative work.',
  applicable_law: 'Copyright Act (Cap C28 LFN 2004); Nigerian Copyright Act 2022',
  is_official: false,
  content: `# COPYRIGHT ASSIGNMENT AGREEMENT

**THIS COPYRIGHT ASSIGNMENT** is made this {{TODAY}}.

## BETWEEN:

**{{ASSIGNOR_NAME}}** of {{ASSIGNOR_ADDRESS}} (hereinafter called **"the Assignor"**); AND

**{{ASSIGNEE_NAME}}** of {{ASSIGNEE_ADDRESS}} (hereinafter called **"the Assignee"**).

## RECITALS

A. The Assignor is the author and owner of the original work described in the Schedule (the "Work").

B. The Assignor has agreed to assign all rights in the Work to the Assignee on the terms set out below.

## NOW THIS AGREEMENT WITNESSES AS FOLLOWS:

### 1. ASSIGNMENT
In consideration of the sum of **₦{{CONSIDERATION}}** ({{CONSIDERATION_WORDS}} Naira only) paid by the Assignee to the Assignor (receipt of which is hereby acknowledged), the Assignor HEREBY ASSIGNS to the Assignee absolutely, throughout the world, in perpetuity, ALL copyright and other intellectual property rights subsisting in the Work, including without limitation:

(a) The exclusive right to reproduce the Work in any form;
(b) The right to publish, distribute, sell, lease, lend, or rent copies of the Work;
(c) The right to perform, display, broadcast, or communicate the Work to the public;
(d) The right to make adaptations, translations, or derivative works;
(e) The right to authorise or prohibit any of the above acts;
(f) All ancillary rights including merchandising and licensing rights;
(g) The right to sue for and recover damages for past infringements.

### 2. WARRANTIES
The Assignor warrants that:
(a) The Work is original and was created by the Assignor;
(b) The Assignor is the sole owner of all rights assigned;
(c) The Work does not infringe any third-party rights;
(d) The rights have not been previously assigned or licensed to any third party.

### 3. MORAL RIGHTS
The Assignor:
(a) Asserts the moral right to be identified as the author of the Work; OR
(b) Waives the moral right to be identified as author for commercial use of the Work by the Assignee. [Select one]

### 4. FURTHER ASSURANCE
The Assignor shall, at the Assignee's cost, execute all such further documents and do all such further acts as the Assignee may reasonably require to perfect the assignment, including registration with the Nigerian Copyright Commission.

### 5. GOVERNING LAW
This Agreement shall be governed by the Copyright Act of Nigeria and Nigerian law generally.

---

## THE SCHEDULE — THE WORK

**Title:** {{WORK_TITLE}}
**Description:** {{WORK_DESCRIPTION}}
**Date of Creation:** {{CREATION_DATE}}
**Form:** {{WORK_FORM — e.g. Manuscript / Musical composition / Photograph / Software / Film}}

---

**SIGNED, SEALED AND DELIVERED** by the within-named ASSIGNOR
**{{ASSIGNOR_NAME}}**

Signature: ________________________________

In the presence of:
Name: ________________________________
Signature: ________________________________

**SIGNED, SEALED AND DELIVERED** by the within-named ASSIGNEE
**{{ASSIGNEE_NAME}}**

Signature: ________________________________

In the presence of:
Name: ________________________________
Signature: ________________________________`
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 9 — REGISTRATIONS & COMPLIANCE (guides, not strict templates)
// ═══════════════════════════════════════════════════════════════════
T.push({
  document_type: 'CAC business name registration application',
  category: 'registrations',
  title: 'CAC Business Name Registration Application Letter',
  description: 'Cover letter / application for business name registration with the CAC.',
  applicable_law: 'CAMA 2020 Part C',
  is_official: false,
  content: `# {{TODAY}}

**The Registrar-General**
Corporate Affairs Commission
Plot 420 Tigris Crescent
Off Aguiyi Ironsi Street
Maitama, Abuja

Dear Sir/Madam,

## RE: APPLICATION FOR REGISTRATION OF BUSINESS NAME — "{{PROPOSED_BUSINESS_NAME}}"

I, **{{APPLICANT_NAME}}**, of {{APPLICANT_ADDRESS}}, hereby apply for the registration of the business name "**{{PROPOSED_BUSINESS_NAME}}**" pursuant to Part C of the Companies and Allied Matters Act, 2020.

## PARTICULARS OF THE BUSINESS

| Item | Details |
|------|---------|
| **Proposed Business Name** | {{PROPOSED_BUSINESS_NAME}} |
| **Alternative Name 1** | {{ALTERNATIVE_NAME_1}} |
| **Alternative Name 2** | {{ALTERNATIVE_NAME_2}} |
| **Nature of Business** | {{BUSINESS_NATURE}} |
| **Principal Place of Business** | {{BUSINESS_ADDRESS}} |
| **State of Operation** | {{STATE}} |
| **Date of Commencement** | {{COMMENCEMENT_DATE}} |

## PROPRIETOR DETAILS

**Full Name:** {{PROPRIETOR_NAME}}
**Date of Birth:** {{PROPRIETOR_DOB}}
**Sex:** {{PROPRIETOR_SEX}}
**Nationality:** Nigerian
**Residential Address:** {{PROPRIETOR_ADDRESS}}
**Phone:** {{PROPRIETOR_PHONE}}
**Email:** {{PROPRIETOR_EMAIL}}
**Occupation:** {{PROPRIETOR_OCCUPATION}}
**NIN:** {{PROPRIETOR_NIN}}
**Tax Identification Number:** {{PROPRIETOR_TIN}}

## DOCUMENTS ATTACHED

1. Completed CAC/BN Form 1
2. Photocopy of valid identification (National ID / International Passport / Driver's Licence)
3. Two passport-sized photographs of the proprietor
4. Evidence of payment of statutory fees
5. Stamp duty payment receipt
6. {{ANY_OTHER_DOCUMENTS}}

## STATUTORY FEES

The applicable statutory fees of ₦{{FEES_AMOUNT}} have been paid via {{PAYMENT_METHOD}}, evidence whereof is attached.

## DECLARATION

I HEREBY DECLARE that:
(a) The information furnished in this application and attached documents is true to the best of my knowledge;
(b) The proposed business name is not identical or similar to any existing registered name;
(c) I shall comply with all post-registration requirements under CAMA 2020 including filing of annual returns.

I look forward to your favourable consideration of this application and the issuance of the Certificate of Registration.

Yours faithfully,

________________________________
**{{APPLICANT_NAME}}**
Proprietor

**Date:** {{TODAY}}`
});

// ═══════════════════════════════════════════════════════════════════
// CATEGORY 10 — IMMIGRATION
// ═══════════════════════════════════════════════════════════════════
T.push({
  document_type: 'invitation letter',
  category: 'immigration',
  title: 'Visa Invitation Letter',
  description: 'Letter inviting a foreign national to visit Nigeria.',
  applicable_law: 'Immigration Act 2015; Nigeria Immigration Service Regulations',
  is_official: false,
  content: `# {{HOST_LETTERHEAD_OR_ADDRESS}}

{{TODAY}}

**The Consular Officer**
Embassy/High Commission of the Federal Republic of Nigeria
{{EMBASSY_LOCATION}}

**Through:**
The Comptroller-General
Nigeria Immigration Service
Sauka, Airport Road
Abuja

Dear Sir/Madam,

## RE: LETTER OF INVITATION FOR VISA — {{INVITEE_NAME}}

I, **{{HOST_NAME}}**, a Nigerian citizen with International Passport No. **{{HOST_PASSPORT_NO}}**, residing at {{HOST_ADDRESS}}, write to formally invite the following person to visit me/the undersigned organisation in Nigeria:

## PARTICULARS OF INVITEE

| Item | Details |
|------|---------|
| **Full Name** | {{INVITEE_NAME}} |
| **Date of Birth** | {{INVITEE_DOB}} |
| **Nationality** | {{INVITEE_NATIONALITY}} |
| **Passport Number** | {{INVITEE_PASSPORT}} |
| **Passport Issue Date** | {{PASSPORT_ISSUE}} |
| **Passport Expiry Date** | {{PASSPORT_EXPIRY}} |
| **Residential Address** | {{INVITEE_ADDRESS}} |
| **Relationship to Host** | {{RELATIONSHIP}} |

## PURPOSE OF VISIT

The invitee shall visit Nigeria for the purpose of: **{{PURPOSE_OF_VISIT — e.g. Business meetings / Family visit / Tourism / Attendance at conference / Cultural event}}**.

## DURATION OF STAY

The proposed visit shall commence on **{{ARRIVAL_DATE}}** and end on **{{DEPARTURE_DATE}}**, being a total period of **{{DURATION}}**.

## ACCOMMODATION

During the stay, the invitee shall reside at:
**{{ACCOMMODATION_ADDRESS}}**

## FINANCIAL UNDERTAKING

I HEREBY UNDERTAKE that:

(a) I shall be financially responsible for the invitee throughout the duration of the visit, including accommodation, feeding, local transportation, medical, and incidental expenses;

(b) The invitee shall fully comply with all Nigerian immigration laws and shall not engage in any employment or activity contrary to the visa conditions;

(c) The invitee shall depart Nigeria on or before the expiration of the visa duration;

(d) I shall promptly notify the Nigeria Immigration Service of any change in the invitee's status, address, or purpose of stay.

## ABOUT THE HOST

I am a {{HOST_OCCUPATION}} {{HOST_BACKGROUND_BRIEF}} and have the financial capacity to fulfil the undertakings above, as evidenced by the documents attached.

## DOCUMENTS ATTACHED

1. Photocopy of host's international passport / National ID / Driver's licence
2. Evidence of residential address (utility bill / tenancy agreement)
3. Bank statements / Letter of employment / Business registration certificate (CAC)
4. {{ANY_ADDITIONAL_DOCUMENTS}}

I respectfully request that the visa application be granted to enable the invitee visit Nigeria as proposed.

Yours faithfully,

________________________________
**{{HOST_NAME}}**
Host

**Phone:** {{HOST_PHONE}}
**Email:** {{HOST_EMAIL}}`
});

// ═══════════════════════════════════════════════════════════════════
// Insert all templates
// ═══════════════════════════════════════════════════════════════════
console.log(`Seeding ${T.length} templates...`);

// Extract placeholders from each template's content for the placeholders array
function extractPlaceholders(content) {
  const matches = content.match(/\{\{([A-Z_0-9]+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

let ok = 0, fail = 0;
for (const tpl of T) {
  tpl.placeholders = extractPlaceholders(tpl.content);
  // Upsert on (document_type, source_url) to avoid duplicates on re-run
  const { error } = await sb.from('document_templates').upsert(tpl, { onConflict: 'document_type,source_url' });
  if (error) { console.error('FAIL', tpl.document_type, error.message); fail++; }
  else { ok++; }
}
console.log(`Done — ok: ${ok}, failed: ${fail}`);

-- First curated batch of verified opportunities (official portals only,
-- all URLs checked live on 2026-07-03). Deadlines left null where the
-- programme is rolling or the next window is not yet announced.
insert into public.opportunities
  (kind, title, organization, summary, amount, deadline, eligibility, apply_url, is_published)
values
  ('grant',
   'SMEDAN Student Entrepreneurship Grant Scheme',
   'SMEDAN (Federal Government)',
   'SMEDAN is disbursing a ₦5 billion grant scheme supporting student entrepreneurs across Nigeria, rolled out zone by zone. Check the official portal for your zone''s window and requirements.',
   'Up to ₦5 billion scheme', null,
   'Nigerian student entrepreneurs with a registered or registrable business idea',
   'https://smedan.gov.ng', true),

  ('grant',
   'Bank of Industry SME Financing',
   'Bank of Industry (BOI)',
   'Low-interest loans and financing programmes for Nigerian SMEs and manufacturers — including youth, women and agro-processing windows. Applications are accepted year-round on the official portal.',
   'Varies by programme', null,
   'Registered Nigerian businesses (CAC certificate required)',
   'https://www.boi.ng', true),

  ('grant',
   'Tony Elumelu Foundation Entrepreneurship Programme',
   'Tony Elumelu Foundation',
   '$5,000 non-refundable seed capital plus training and mentorship for African entrepreneurs. Applications open every January on TEFConnect — create your profile now to be ready.',
   '$5,000 seed capital', null,
   'African entrepreneurs with a business or idea 0-3 years old',
   'https://www.tefconnect.net', true),

  ('scholarship',
   'PTDF Overseas & In-Country Scholarship Scheme',
   'Petroleum Technology Development Fund',
   'Federal scholarships for undergraduate (up to ₦500,000/yr) and postgraduate (₦700,000/yr plus laptop) students in oil and gas related courses. The 2026/27 window has closed; applications typically reopen around April each year.',
   '₦500,000–₦700,000 per year', null,
   'Nigerians studying PTDF-approved oil, gas and allied courses; NIN required',
   'https://scholarship.ptdf.gov.ng', true),

  ('scholarship',
   'NNPC / SNEPCo National University Scholarship',
   'NNPC / Shell Nigeria Exploration & Production',
   'Annual scholarship of about ₦200,000 per year for Nigerian undergraduates in Engineering, Geosciences and ICT. The 2026 application window is expected to open between July and August — watch the official page.',
   '₦200,000 per year', null,
   'Full-time undergraduates in Engineering, Geosciences or ICT at Nigerian universities',
   'https://www.shell.com.ng/sustainability/communities/education-programmes.html', true),

  ('scholarship',
   'Federal Government Scholarship Awards (FSB)',
   'Federal Scholarship Board, Ministry of Education',
   'Bursary and scholarship awards (about ₦450,000 per year) for Nigerian undergraduates in federal and state universities. Application windows are usually announced between April and July on the Ministry of Education website.',
   'About ₦450,000 per year', null,
   'Nigerian undergraduates in public universities with strong academic records',
   'https://education.gov.ng', true),

  ('job',
   'Federal Civil Service Commission Recruitment',
   'Federal Civil Service Commission',
   'Official portal for federal ministry and agency vacancies. All genuine federal civil service recruitment is announced here — beware of any site or agent charging a fee; applications are always free.',
   null, null,
   'Nigerians meeting the advertised requirements per vacancy',
   'https://www.fedcivilservice.gov.ng', true);

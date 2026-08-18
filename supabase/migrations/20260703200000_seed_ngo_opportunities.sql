-- Second curated batch: NGO, foundation and international opportunities
-- (URLs verified live 2026-07-03). These rarely reach ordinary Nigerians.
insert into public.opportunities
  (kind, title, organization, summary, amount, deadline, eligibility, apply_url, is_published)
values
  ('grant',
   'Mastercard Foundation — Young Africa Works Nigeria',
   'Mastercard Foundation (NGO)',
   'Major foundation programmes creating work for young Nigerians (70% young women): funding, training and MSME support in agriculture, creative industry and the digital economy. Its FAST programme offers up to $15,000 for alumni entrepreneurs. Multiple programmes open through the year.',
   'Up to $15,000 (FAST); varies by programme', null,
   'Young Nigerians and youth-led MSMEs; some programmes target women specifically',
   'https://mastercardfdn.org/en/where-we-work/nigeria/', true),

  ('grant',
   'Flourish Africa Grant for Female Entrepreneurs',
   'Flourish Africa (NGO)',
   'Up to ₦3 million per entrepreneur plus mentoring and training for female-owned Nigerian businesses. One of the largest private women-focused grant programmes in Nigeria — cohorts open periodically.',
   'Up to ₦3,000,000', null,
   'Female entrepreneurs in Nigeria with a registered or growing business',
   'https://flourishafrica.com', true),

  ('grant',
   'SheTrades — UN/ITC Support for Women Entrepreneurs',
   'International Trade Centre (United Nations)',
   'A United Nations initiative connecting women entrepreneurs to training, finance opportunities and international buyers. Free to join; Nigerian women-owned businesses can register and access programmes year-round.',
   'Training + market access (free)', null,
   'Women-owned businesses in Nigeria',
   'https://www.shetrades.com', true),

  ('grant',
   'FundsforNGOs — Grants Directory for Nigeria',
   'FundsforNGOs (resource)',
   'A constantly updated directory of NGO, foundation and international grants open to Nigerians — many with deadlines every month. If you run an NGO, community project or small business, check this page regularly.',
   'Varies by grant', null,
   'NGOs, community organisations, entrepreneurs and individuals',
   'https://www2.fundsforngos.org/tag/nigeria/', true),

  ('scholarship',
   'Opportunity Desk — Scholarships, Fellowships & Contests',
   'Opportunity Desk (resource)',
   'Daily-updated listings of scholarships, fellowships, competitions and fully-funded programmes open to young Nigerians and Africans — including international opportunities most people never hear about.',
   'Varies by opportunity', null,
   'Young Nigerians; requirements vary per listing',
   'https://opportunitydesk.org', true);

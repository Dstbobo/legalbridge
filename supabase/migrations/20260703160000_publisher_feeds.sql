-- Publisher RSS feeds (carry real images, unlike Google News RSS).
insert into public.news_sources (name, feed_url, category) values
  ('Punch Nigeria', 'https://punchng.com/feed/', 'general'),
  ('Vanguard News', 'https://www.vanguardngr.com/feed/', 'general'),
  ('Premium Times', 'https://www.premiumtimesng.com/feed', 'general'),
  ('The Guardian Nigeria', 'https://guardian.ng/feed/', 'general'),
  ('Channels TV', 'https://www.channelstv.com/feed/', 'general'),
  ('BusinessDay', 'https://businessday.ng/feed/', 'business'),
  ('Nairametrics', 'https://nairametrics.com/feed/', 'economy')
on conflict (feed_url) do nothing;

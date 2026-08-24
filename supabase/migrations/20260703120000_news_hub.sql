-- ── LegalBridge News & Information Hub ─────────────────────────────────────
-- news_sources: config-driven feed list (add a row = new source, no deploy)
create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  feed_url text not null unique,
  category text not null default 'general',   -- legal | government | business | economy | general
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- news_articles: headline + summary + link-out ONLY (never full copyrighted body)
create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  image_url text,
  source text not null,
  author text,
  category text not null default 'general',
  article_url text not null,
  content_hash text not null unique,           -- dedupe (hash of url|title)
  is_published boolean not null default true,  -- moderation gate
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists news_articles_feed_idx
  on public.news_articles (is_published, category, published_at desc);

-- opportunities: CURATED grants / jobs / scholarships / tenders
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                          -- grant | job | scholarship | tender
  title text not null,
  organization text not null,
  summary text,
  amount text,
  deadline date,
  eligibility text,
  apply_url text not null,
  is_published boolean not null default false, -- admin approves before it shows
  created_at timestamptz not null default now()
);
create index if not exists opportunities_feed_idx
  on public.opportunities (is_published, kind, deadline);

-- bookmarks: per-user saved articles
create table if not exists public.news_bookmarks (
  user_id uuid not null references auth.users (id) on delete cascade,
  article_id uuid not null references public.news_articles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.news_sources enable row level security;
alter table public.news_articles enable row level security;
alter table public.opportunities enable row level security;
alter table public.news_bookmarks enable row level security;

-- Published content is readable by any signed-in user; writes are service-role only.
create policy "read published articles" on public.news_articles
  for select to authenticated using (is_published);
create policy "read published opportunities" on public.opportunities
  for select to authenticated using (is_published);
create policy "read sources" on public.news_sources
  for select to authenticated using (true);
create policy "own bookmarks" on public.news_bookmarks
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Retention: drop unbookmarked articles older than 30 days ───────────────
create or replace function public.news_prune() returns void
language sql security definer as $$
  delete from public.news_articles a
  where a.created_at < now() - interval '30 days'
    and not exists (select 1 from public.news_bookmarks b where b.article_id = a.id);
$$;

-- ── Scheduling prerequisites ────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- Do not create an anonymous HTTP job here. The later secure-news migration
-- schedules ingestion only after a matching Vault/Edge shared secret exists.

-- ── Seed sources (Google News RSS = stable, image-light but reliable) ──────
insert into public.news_sources (name, feed_url, category) values
  ('Legal — Courts & Rulings', 'https://news.google.com/rss/search?q=Nigeria%20(%22Supreme%20Court%22%20OR%20%22Court%20of%20Appeal%22%20OR%20%22Federal%20High%20Court%22%20OR%20judgment%20OR%20ruling)&hl=en-NG&gl=NG&ceid=NG:en', 'legal'),
  ('Legal — Laws & NBA', 'https://news.google.com/rss/search?q=Nigeria%20(law%20OR%20%22National%20Assembly%22%20bill%20OR%20%22Nigerian%20Bar%20Association%22)&hl=en-NG&gl=NG&ceid=NG:en', 'legal'),
  ('Government', 'https://news.google.com/rss/search?q=Nigeria%20(President%20OR%20%22Federal%20Government%22%20OR%20ministry%20OR%20%22executive%20order%22)&hl=en-NG&gl=NG&ceid=NG:en', 'government'),
  ('Business & Regulation', 'https://news.google.com/rss/search?q=Nigeria%20(CAC%20OR%20FIRS%20OR%20CBN%20OR%20SEC%20OR%20NAFDAC%20OR%20FCCPC%20OR%20regulation)&hl=en-NG&gl=NG&ceid=NG:en', 'business'),
  ('Economy', 'https://news.google.com/rss/search?q=Nigeria%20(inflation%20OR%20budget%20OR%20naira%20OR%20%22exchange%20rate%22%20OR%20economy)&hl=en-NG&gl=NG&ceid=NG:en', 'economy'),
  ('Nigeria News', 'https://news.google.com/rss?hl=en-NG&gl=NG&ceid=NG:en', 'general')
on conflict (feed_url) do nothing;

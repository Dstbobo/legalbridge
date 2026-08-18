-- Cached AI report per article (generated once, on first read).
alter table public.news_articles add column if not exists ai_summary text;

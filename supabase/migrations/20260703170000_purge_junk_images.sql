-- Clear icon/avatar/tracking-pixel "images" so the backfill replaces them
-- with real article photos (og:image).
update public.news_articles
set image_url = null
where image_url ~* '(gravatar|emoji|avatar|favicon|logo|icon|pixel|badge|feedburner|1x1|spacer|blank\.|\.svg)';

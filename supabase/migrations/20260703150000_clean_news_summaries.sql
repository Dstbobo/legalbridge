-- Clean up summaries that contain leaked markup/links from the first ingest run.
update public.news_articles
set summary = null
where summary ~* '(https?://|href=|news\.google\.com|&lt;|<a )'
   or length(trim(summary)) < 30;

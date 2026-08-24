-- Replace the anonymous news cron invocation with an explicit shared-secret
-- schedule. The secret must exist in Supabase Vault under the same name and
-- as the Edge Function secret NEWS_INGEST_SECRET. If it is absent, ingestion
-- remains safely disabled instead of reverting to anonymous execution.
do $$
declare
  ingest_secret text;
begin
  perform cron.unschedule(jobid)
    from cron.job
   where jobname = 'news-ingest';

  begin
    select decrypted_secret
      into ingest_secret
      from vault.decrypted_secrets
     where name = 'legalbridge_news_ingest_secret'
     limit 1;
  exception when undefined_table or invalid_schema_name then
    ingest_secret := null;
  end;

  if ingest_secret is null or length(ingest_secret) < 32 then
    raise notice 'news-ingest schedule disabled: configure the Vault secret before scheduling';
    return;
  end if;

  perform cron.schedule(
    'news-ingest',
    '*/45 * * * *',
    $cron$
      select net.http_post(
        url := 'https://qcutjnsxiawnejiqwwix.supabase.co/functions/v1/news-ingest',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-news-ingest-secret', (
            select decrypted_secret
              from vault.decrypted_secrets
             where name = 'legalbridge_news_ingest_secret'
             limit 1
          )
        ),
        body := '{}'::jsonb
      )
    $cron$
  );
exception when others then
  raise notice 'secure news-ingest scheduling skipped: %', sqlerrm;
end $$;

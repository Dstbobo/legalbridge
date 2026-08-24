-- Atomic, multi-instance provider quota control used only by server-side code.
create table if not exists public.provider_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  route text not null check (route ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, route)
);

alter table public.provider_rate_limits enable row level security;
revoke all on table public.provider_rate_limits from public, anon, authenticated;

create or replace function public.consume_provider_quota(
  p_user_id uuid,
  p_route text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_count integer;
begin
  if p_user_id is null
     or p_route !~ '^[a-z0-9][a-z0-9_-]{0,63}$'
     or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid quota parameters' using errcode = '22023';
  end if;

  insert into public.provider_rate_limits as quota (
    user_id,
    route,
    window_started_at,
    request_count
  ) values (
    p_user_id,
    p_route,
    clock_timestamp(),
    1
  )
  on conflict (user_id, route) do update
  set
    window_started_at = case
      when quota.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
        then clock_timestamp()
      else quota.window_started_at
    end,
    request_count = case
      when quota.window_started_at <= clock_timestamp() - make_interval(secs => p_window_seconds)
        then 1
      else quota.request_count + 1
    end
  returning request_count into current_count;

  return current_count <= p_limit;
end;
$$;

revoke all on function public.consume_provider_quota(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_provider_quota(uuid, text, integer, integer)
  to service_role;

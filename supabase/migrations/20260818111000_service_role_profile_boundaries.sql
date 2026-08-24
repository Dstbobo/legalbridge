-- Remove a production policy whose name implied service-role-only access but
-- whose role was actually PUBLIC, and protect user-editable profile authority.

drop policy if exists "Service role full access" on public.legal_documents;
revoke insert, update, delete, truncate, references, trigger
  on public.legal_documents from anon, authenticated;

-- news_prune() deletes rows and was originally SECURITY DEFINER with default
-- PUBLIC execute. Keep the maintenance operation service-side only.
alter function public.news_prune() set search_path = public, pg_temp;
revoke all on function public.news_prune() from public, anon, authenticated;
grant execute on function public.news_prune() to service_role;

create or replace function public.enforce_profile_authority_boundary()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Service-role and migration sessions retain explicit administrative paths.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.plan <> 'free'
       or new.verification_status <> 'unverified'
       or new.verification_decided_at is not null
       or new.verification_rejection_reason is not null then
      raise exception 'privileged profile fields require server authorization'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.plan is distinct from old.plan then
    raise exception 'profile plan requires server authorization'
      using errcode = '42501';
  end if;
  if old.user_type is not null and new.user_type is distinct from old.user_type then
    raise exception 'profile role cannot be reassigned'
      using errcode = '42501';
  end if;
  if new.verification_status is distinct from old.verification_status then
    if new.verification_status <> 'pending'
       or old.verification_status not in ('unverified', 'rejected')
       or new.verification_decided_at is not null
       or new.verification_rejection_reason is not null then
      raise exception 'verification decision requires server authorization'
        using errcode = '42501';
    end if;
  elsif new.verification_decided_at is distinct from old.verification_decided_at
     or new.verification_rejection_reason is distinct from old.verification_rejection_reason then
    raise exception 'verification review fields require server authorization'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_authority_boundary on public.profiles;
create trigger enforce_profile_authority_boundary
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_authority_boundary();

create or replace function public.enforce_direct_message_identity_boundary()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at then
    raise exception 'message identity and content are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_direct_message_identity_boundary
  on public.direct_messages;
create trigger enforce_direct_message_identity_boundary
  before update on public.direct_messages
  for each row execute function public.enforce_direct_message_identity_boundary();

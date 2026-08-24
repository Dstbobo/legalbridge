-- Conversation ownership and lawyer-certificate privacy boundaries.

create or replace function public.enforce_conversation_participant_boundary()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.client_id := coalesce(new.client_id, new.user_a);
    new.lawyer_id := coalesce(new.lawyer_id, new.user_b);
    new.user_a := coalesce(new.user_a, new.client_id);
    new.user_b := coalesce(new.user_b, new.lawyer_id);

    if new.client_id is null
       or new.lawyer_id is null
       or new.user_a is distinct from new.client_id
       or new.user_b is distinct from new.lawyer_id
       or new.client_id = new.lawyer_id then
      raise exception 'conversation participants are invalid'
        using errcode = '42501';
    end if;
  elsif new.client_id is distinct from old.client_id
     or new.lawyer_id is distinct from old.lawyer_id
     or new.user_a is distinct from old.user_a
     or new.user_b is distinct from old.user_b then
    raise exception 'conversation participants cannot be reassigned'
      using errcode = '42501';
  end if;

  if new.last_sender is not null
     and new.last_sender not in (new.client_id, new.lawyer_id) then
    raise exception 'last sender must be a conversation participant'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_conversation_participant_boundary
  on public.conversations;
create trigger enforce_conversation_participant_boundary
  before insert or update on public.conversations
  for each row execute function public.enforce_conversation_participant_boundary();

drop policy if exists "client starts conversation" on public.conversations;
create policy "client starts conversation" on public.conversations
  for insert to authenticated
  with check (
    auth.uid() = client_id
    and client_id <> lawyer_id
    and (last_sender is null or last_sender in (client_id, lawyer_id))
  );

drop policy if exists "participants update conversation" on public.conversations;
create policy "participants update conversation" on public.conversations
  for update to authenticated
  using (auth.uid() in (client_id, lawyer_id))
  with check (
    auth.uid() in (client_id, lawyer_id)
    and client_id <> lawyer_id
    and (last_sender is null or last_sender in (client_id, lawyer_id))
  );

-- Directory consumers use list_lawyer_directory(), which deliberately omits
-- certificate paths and admin review notes. Direct rows remain owner-only.
drop policy if exists "read verified lawyers" on public.lawyer_verifications;

drop policy if exists "submit own verification" on public.lawyer_verifications;
create policy "submit own verification" on public.lawyer_verifications
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and admin_note is null
    and (
      cert_path is null
      or (storage.foldername(cert_path))[1] = auth.uid()::text
    )
  );

drop policy if exists "edit own pending verification" on public.lawyer_verifications;
create policy "edit own pending verification" on public.lawyer_verifications
  for update to authenticated
  using (auth.uid() = user_id and status in ('pending', 'rejected'))
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and admin_note is null
    and (
      cert_path is null
      or (storage.foldername(cert_path))[1] = auth.uid()::text
    )
  );

-- Force the bucket private even if it was misconfigured after initial setup.
update storage.buckets
   set public = false
 where id = 'verification-docs';

drop policy if exists "upload own verification doc" on storage.objects;
create policy "upload own verification doc" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "read own verification doc" on storage.objects;
create policy "read own verification doc" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "replace own verification doc" on storage.objects;
create policy "replace own verification doc" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "delete own verification doc" on storage.objects;
create policy "delete own verification doc" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

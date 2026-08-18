-- ── Lawyer verification (anti-fraud) ────────────────────────────────────────
-- A lawyer submits their SCN (Supreme Court enrolment number) + call-to-bar
-- certificate. Only status='verified' lawyers appear in the public directory.
create table if not exists public.lawyer_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null,
  scn_number text not null unique,            -- SCN / enrolment number
  year_of_call int,
  state text,                                  -- state of practice
  firm text,
  whatsapp text,
  specializations text[] default '{}',
  bio text,
  cert_path text,                              -- storage path of call-to-bar certificate
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  admin_note text,                             -- reason on rejection
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lawyer_verifications_status_idx
  on public.lawyer_verifications (status);

alter table public.lawyer_verifications enable row level security;

-- A lawyer can submit their own application (always starts pending).
create policy "submit own verification" on public.lawyer_verifications
  for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');

-- A lawyer can see their own application at any status.
create policy "read own verification" on public.lawyer_verifications
  for select to authenticated using (auth.uid() = user_id);

-- Everyone signed-in can browse VERIFIED lawyers (the public directory).
create policy "read verified lawyers" on public.lawyer_verifications
  for select to authenticated using (status = 'verified');

-- A lawyer may correct their submission ONLY while it is still pending;
-- they can never set their own status to verified.
create policy "edit own pending verification" on public.lawyer_verifications
  for update to authenticated
  using (auth.uid() = user_id and status in ('pending','rejected'))
  with check (auth.uid() = user_id and status = 'pending');

-- ── Private storage for call-to-bar certificates ───────────────────────────
insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

-- Each lawyer uploads into their own folder: {user_id}/cert.jpg
create policy "upload own verification doc" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "read own verification doc" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "replace own verification doc" on storage.objects
  for update to authenticated
  using (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);

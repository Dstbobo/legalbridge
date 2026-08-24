-- Core schema recovered from the production catalog through Supabase's
-- read-only database endpoint. This must precede all preserved feature
-- migrations so a fresh environment can replay the repository from zero.

create extension if not exists vector with schema public;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  user_type text,
  state text,
  bio text,
  experience text,
  court_level text,
  specializations text[],
  nba_number text,
  primary_concern text,
  institution text,
  study_year text,
  biz_type text,
  media_type text,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  verification_status text default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  verification_submitted_at timestamptz,
  verification_decided_at timestamptz,
  verification_rejection_reason text,
  law_school text,
  consultation_fee integer,
  states_covered text[],
  bar_cert_url text,
  govt_id_url text,
  profile_photo_url text,
  phone text,
  sub_role text,
  plan text not null default 'free'
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  title text default 'New Case',
  case_type text,
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  summary text,
  message_count integer default 0
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  agent_used text check (agent_used in ('openai', 'claude', 'gemini', 'grok', 'deepseek')),
  tokens_used integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  category text not null,
  title text not null,
  description text,
  content text not null,
  placeholders text[] default '{}',
  source_url text not null default 'LegalBridge internal',
  is_official boolean not null default false,
  jurisdiction text not null default 'Nigeria',
  applicable_law text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint document_templates_type_source_unique unique (document_type, source_url)
);

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text,
  url text,
  content text,
  content_hash text,
  embedding vector(1024),
  doc_type text,
  jurisdiction text,
  section_number text,
  year_enacted text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  chat_id uuid references public.chats (id) on delete set null,
  title text not null,
  template_id uuid,
  content text not null,
  file_url text,
  created_at timestamptz default now()
);

-- Legacy browser messaging columns are preserved because the original web
-- source still consumes them. A later migration adds the mobile aliases and a
-- trigger that keeps both participant representations consistent.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'consultation'
    check (kind in ('consultation', 'mentorship', 'inquiry')),
  status text not null default 'unlocked'
    check (status in ('locked', 'pending', 'unlocked', 'closed')),
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz default now(),
  constraint distinct_users check (user_a <> user_b),
  constraint pair_unique unique (user_a, user_b, kind)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_chats_user_id on public.chats (user_id);
create index if not exists idx_messages_chat_id on public.messages (chat_id);
create index if not exists idx_doc_templates_category on public.document_templates (category);
create index if not exists idx_doc_templates_type on public.document_templates (lower(document_type));
create index if not exists legal_documents_embedding_idx
  on public.legal_documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
create index if not exists idx_conv_a on public.conversations (user_a);
create index if not exists idx_conv_b on public.conversations (user_b);
create index if not exists idx_dm_conv on public.direct_messages (conversation_id);

create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_chats_updated_at on public.chats;
create trigger update_chats_updated_at
  before update on public.chats
  for each row execute function public.update_updated_at();

create or replace function public.search_legal_documents(
  query_embedding vector,
  match_count integer default 5,
  filter_jurisdiction text default null
)
returns table (
  id uuid,
  source text,
  title text,
  content text,
  url text,
  doc_type text,
  jurisdiction text,
  section_number text,
  similarity double precision
)
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return query
  select
    document.id,
    document.source,
    document.title,
    document.content,
    document.url,
    document.doc_type,
    document.jurisdiction,
    document.section_number,
    1 - (document.embedding <=> query_embedding) as similarity
  from public.legal_documents as document
  where document.is_active = true
    and document.embedding is not null
    and (filter_jurisdiction is null or document.jurisdiction = filter_jurisdiction)
  order by document.embedding <=> query_embedding
  limit match_count;
end;
$$;

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.document_templates enable row level security;
alter table public.legal_documents enable row level security;
alter table public.generated_documents enable row level security;
alter table public.conversations enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can manage own chats" on public.chats;
create policy "Users can manage own chats" on public.chats
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can manage own messages" on public.messages;
create policy "Users can manage own messages" on public.messages
  for all to authenticated
  using (exists (
    select 1 from public.chats as chat
    where chat.id = chat_id and chat.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.chats as chat
    where chat.id = chat_id and chat.user_id = auth.uid()
  ));
drop policy if exists "Users can manage own generated documents" on public.generated_documents;
create policy "Users can manage own generated documents" on public.generated_documents
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "templates_read" on public.document_templates;
create policy "templates_read" on public.document_templates
  for select to authenticated using (true);
drop policy if exists "legal_documents_read" on public.legal_documents;
create policy "legal_documents_read" on public.legal_documents
  for select to anon, authenticated using (is_active = true);

drop policy if exists "conversations_insert" on public.conversations;
create policy "conversations_insert" on public.conversations
  for insert to authenticated
  with check (auth.uid() in (user_a, user_b));
drop policy if exists "conversations_read" on public.conversations;
create policy "conversations_read" on public.conversations
  for select to authenticated
  using (auth.uid() in (user_a, user_b));
drop policy if exists "conversations_update" on public.conversations;
create policy "conversations_update" on public.conversations
  for update to authenticated
  using (auth.uid() in (user_a, user_b))
  with check (auth.uid() in (user_a, user_b));

drop policy if exists "dm_read" on public.direct_messages;
create policy "dm_read" on public.direct_messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations as conversation
    where conversation.id = conversation_id
      and auth.uid() in (conversation.user_a, conversation.user_b)
  ));
drop policy if exists "dm_insert" on public.direct_messages;
create policy "dm_insert" on public.direct_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations as conversation
      where conversation.id = conversation_id
        and auth.uid() in (conversation.user_a, conversation.user_b)
        and conversation.status = 'unlocked'
    )
  );
drop policy if exists "dm_update" on public.direct_messages;
create policy "dm_update" on public.direct_messages
  for update to authenticated
  using (exists (
    select 1 from public.conversations as conversation
    where conversation.id = conversation_id
      and auth.uid() in (conversation.user_a, conversation.user_b)
  ))
  with check (exists (
    select 1 from public.conversations as conversation
    where conversation.id = conversation_id
      and auth.uid() in (conversation.user_a, conversation.user_b)
  ));

revoke all on public.document_templates, public.legal_documents from anon, authenticated;
grant select on public.legal_documents to anon, authenticated;
grant select on public.document_templates to authenticated;
revoke all on function public.search_legal_documents(vector, integer, text) from public;
grant execute on function public.search_legal_documents(vector, integer, text) to authenticated, service_role;

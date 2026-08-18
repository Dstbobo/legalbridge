-- ── In-app messaging (keep client↔lawyer conversations INSIDE LegalBridge) ──
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users (id) on delete cascade,
  lawyer_id uuid not null references auth.users (id) on delete cascade,
  client_name text not null default 'Client',
  lawyer_name text not null default 'Lawyer',
  last_message text,
  last_sender uuid,
  last_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (client_id, lawyer_id)
);
-- Tables may pre-exist from an old scaffold — heal missing columns.
alter table public.conversations add column if not exists client_id uuid references auth.users (id) on delete cascade;
alter table public.conversations add column if not exists lawyer_id uuid references auth.users (id) on delete cascade;
alter table public.conversations add column if not exists client_name text not null default 'Client';
alter table public.conversations add column if not exists lawyer_name text not null default 'Lawyer';
alter table public.conversations add column if not exists last_message text;
alter table public.conversations add column if not exists last_sender uuid;
alter table public.conversations add column if not exists last_at timestamptz not null default now();
alter table public.conversations add column if not exists created_at timestamptz not null default now();

create index if not exists conversations_client_idx on public.conversations (client_id, last_at desc);
create index if not exists conversations_lawyer_idx on public.conversations (lawyer_id, last_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.chat_messages add column if not exists conversation_id uuid references public.conversations (id) on delete cascade;
alter table public.chat_messages add column if not exists sender_id uuid references auth.users (id) on delete cascade;
alter table public.chat_messages add column if not exists content text;
alter table public.chat_messages add column if not exists created_at timestamptz not null default now();

create index if not exists chat_messages_convo_idx on public.chat_messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.chat_messages enable row level security;

-- Only the two participants can see or touch a conversation.
do $$ begin
  create policy "participants read conversations" on public.conversations
    for select to authenticated using (auth.uid() in (client_id, lawyer_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "client starts conversation" on public.conversations
    for insert to authenticated with check (auth.uid() = client_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "participants update conversation" on public.conversations
    for update to authenticated
    using (auth.uid() in (client_id, lawyer_id))
    with check (auth.uid() in (client_id, lawyer_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "participants read messages" on public.chat_messages
    for select to authenticated using (
      exists (select 1 from public.conversations c
              where c.id = conversation_id and auth.uid() in (c.client_id, c.lawyer_id))
    );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "participants send messages" on public.chat_messages
    for insert to authenticated with check (
      sender_id = auth.uid() and
      exists (select 1 from public.conversations c
              where c.id = conversation_id and auth.uid() in (c.client_id, c.lawyer_id))
    );
exception when duplicate_object then null; end $$;

-- ── Lawyer credibility: ratings & reviews ────────────────────────────────────
create table if not exists public.lawyer_reviews (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references auth.users (id) on delete cascade,
  client_name text not null default 'Client',
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (client_id, lawyer_id)               -- one review per client per lawyer
);
alter table public.lawyer_reviews add column if not exists lawyer_id uuid references auth.users (id) on delete cascade;
alter table public.lawyer_reviews add column if not exists client_id uuid references auth.users (id) on delete cascade;
alter table public.lawyer_reviews add column if not exists client_name text not null default 'Client';
alter table public.lawyer_reviews add column if not exists rating int;
alter table public.lawyer_reviews add column if not exists comment text;
alter table public.lawyer_reviews add column if not exists created_at timestamptz not null default now();

create index if not exists lawyer_reviews_lawyer_idx on public.lawyer_reviews (lawyer_id);

alter table public.lawyer_reviews enable row level security;

do $$ begin
  create policy "read reviews" on public.lawyer_reviews
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "client writes own review" on public.lawyer_reviews
    for insert to authenticated with check (auth.uid() = client_id and auth.uid() <> lawyer_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "client edits own review" on public.lawyer_reviews
    for update to authenticated
    using (auth.uid() = client_id) with check (auth.uid() = client_id);
exception when duplicate_object then null; end $$;

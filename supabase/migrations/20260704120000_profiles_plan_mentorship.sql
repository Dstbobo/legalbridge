-- ── Profiles: editable user info + premium groundwork ──────────────────────
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists state text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists sub_role text;
alter table public.profiles add column if not exists plan text not null default 'free';

-- Users may read/update their own profile row (guarded: policies may already exist).
do $$ begin
  create policy "read own profile" on public.profiles
    for select to authenticated using (auth.uid() = id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "update own profile" on public.profiles
    for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "insert own profile" on public.profiles
    for insert to authenticated with check (auth.uid() = id);
exception when duplicate_object then null; end $$;

-- ── Mentorship ──────────────────────────────────────────────────────────────
-- Lawyers offer mentorship; law students browse and request.
create table if not exists public.mentor_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  focus_areas text[] default '{}',
  bio text,
  capacity int not null default 3,             -- how many mentees they can take
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mentorship_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  mentor_id uuid not null references public.mentor_profiles (user_id) on delete cascade,
  student_name text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  mentor_note text,
  created_at timestamptz not null default now(),
  unique (student_id, mentor_id)               -- one open request per mentor
);
-- Tables may pre-exist from an old scaffold with different columns — heal them.
alter table public.mentor_profiles add column if not exists full_name text;
alter table public.mentor_profiles add column if not exists focus_areas text[] default '{}';
alter table public.mentor_profiles add column if not exists bio text;
alter table public.mentor_profiles add column if not exists capacity int not null default 3;
alter table public.mentor_profiles add column if not exists is_active boolean not null default true;
alter table public.mentor_profiles add column if not exists created_at timestamptz not null default now();
alter table public.mentor_profiles add column if not exists updated_at timestamptz not null default now();

alter table public.mentorship_requests add column if not exists student_id uuid references auth.users (id) on delete cascade;
alter table public.mentorship_requests add column if not exists mentor_id uuid;
alter table public.mentorship_requests add column if not exists student_name text;
alter table public.mentorship_requests add column if not exists message text;
alter table public.mentorship_requests add column if not exists status text not null default 'pending';
alter table public.mentorship_requests add column if not exists mentor_note text;
alter table public.mentorship_requests add column if not exists created_at timestamptz not null default now();

create index if not exists mentorship_requests_mentor_idx
  on public.mentorship_requests (mentor_id, status);

alter table public.mentor_profiles enable row level security;
alter table public.mentorship_requests enable row level security;

-- Mentor profiles: owner manages their own; everyone signed-in sees active mentors.
do $$ begin
  create policy "manage own mentor profile" on public.mentor_profiles
    for all to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "browse active mentors" on public.mentor_profiles
    for select to authenticated using (is_active);
exception when duplicate_object then null; end $$;

-- Requests: students create + see their own; mentors see + respond to theirs.
do $$ begin
  create policy "student creates request" on public.mentorship_requests
    for insert to authenticated
    with check (auth.uid() = student_id and status = 'pending');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "student reads own requests" on public.mentorship_requests
    for select to authenticated using (auth.uid() = student_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "mentor reads own requests" on public.mentorship_requests
    for select to authenticated using (auth.uid() = mentor_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "mentor responds" on public.mentorship_requests
    for update to authenticated
    using (auth.uid() = mentor_id) with check (auth.uid() = mentor_id);
exception when duplicate_object then null; end $$;

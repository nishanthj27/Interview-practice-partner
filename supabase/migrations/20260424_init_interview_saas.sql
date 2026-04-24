create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

create table if not exists public.profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    full_name text,
    organization text,
    degree text,
    current_role_name text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.interview_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    job_id text not null,
    job_title text not null,
    mode text not null check (mode in ('chat', 'voice')),
    status text not null default 'active' check (status in ('active', 'completed', 'abandoned', 'error')),
    candidate_full_name text,
    candidate_organization text,
    candidate_degree text,
    candidate_current_role text,
    duration_seconds integer not null default 0,
    question_count integer not null default 0,
    response_count integer not null default 0,
    average_response_length integer not null default 0,
    average_response_latency_ms integer,
    filler_rate numeric(6, 3) not null default 0,
    topics_covered text[] not null default '{}',
    response_quality jsonb not null default '[]'::jsonb,
    overall_score integer,
    feedback_summary text,
    feedback_generated_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    started_at timestamptz not null default timezone('utc', now()),
    ended_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.interview_messages (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.interview_sessions(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('user', 'assistant')),
    source text not null default 'client',
    model_name text,
    content text not null,
    message_order integer not null,
    created_at timestamptz not null default timezone('utc', now()),
    unique (session_id, message_order)
);

create table if not exists public.interview_feedback (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null unique references public.interview_sessions(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    overall text not null,
    strengths jsonb not null default '[]'::jsonb,
    improvements jsonb not null default '[]'::jsonb,
    technical text,
    communication text,
    recommendations jsonb not null default '[]'::jsonb,
    scores jsonb not null default '{}'::jsonb,
    evidence jsonb not null default '[]'::jsonb,
    confidence numeric(5, 3) not null default 0.5,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_interview_sessions_user_id on public.interview_sessions(user_id);
create index if not exists idx_interview_sessions_started_at on public.interview_sessions(started_at desc);
create index if not exists idx_interview_messages_session_id on public.interview_messages(session_id);
create index if not exists idx_interview_feedback_user_id on public.interview_feedback(user_id);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_interview_sessions_updated_at on public.interview_sessions;
create trigger set_interview_sessions_updated_at
before update on public.interview_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists set_interview_feedback_updated_at on public.interview_feedback;
create trigger set_interview_feedback_updated_at
before update on public.interview_feedback
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_messages enable row level security;
alter table public.interview_feedback enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "sessions_select_own" on public.interview_sessions;
create policy "sessions_select_own"
on public.interview_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "sessions_insert_own" on public.interview_sessions;
create policy "sessions_insert_own"
on public.interview_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "sessions_update_own" on public.interview_sessions;
create policy "sessions_update_own"
on public.interview_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "messages_select_own" on public.interview_messages;
create policy "messages_select_own"
on public.interview_messages
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "messages_insert_own" on public.interview_messages;
create policy "messages_insert_own"
on public.interview_messages
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "feedback_select_own" on public.interview_feedback;
create policy "feedback_select_own"
on public.interview_feedback
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "feedback_insert_own" on public.interview_feedback;
create policy "feedback_insert_own"
on public.interview_feedback
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "feedback_update_own" on public.interview_feedback;
create policy "feedback_update_own"
on public.interview_feedback
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

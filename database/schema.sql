-- =====================================================================
-- NEUSTGLE - database/schema.sql      (run this FIRST)
-- Tables, foreign keys, constraints and indexes.
-- No personal information is stored anywhere.
-- =====================================================================

create extension if not exists pgcrypto;

-- 1. Anonymous sessions (one per visitor, temporary) --------------------
create table if not exists public.anonymous_sessions (
    id                 uuid primary key default gen_random_uuid(),
    session_token_hash text not null unique,              -- SHA-256 of the cookie token (never the token itself)
    status             text not null default 'idle'
                       check (status in ('idle','searching','connected','disconnected','stopped')),
    created_at         timestamptz not null default now(),
    last_active_at     timestamptz not null default now(),
    expires_at         timestamptz not null
);
create index if not exists idx_sessions_expires   on public.anonymous_sessions (expires_at);
create index if not exists idx_sessions_status    on public.anonymous_sessions (status, last_active_at);

-- 2. Matchmaking queue ---------------------------------------------------
create table if not exists public.matchmaking_queue (
    id         uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.anonymous_sessions(id) on delete cascade,
    status     text not null default 'waiting' check (status in ('waiting','matched','cancelled')),
    created_at timestamptz not null default now()
);
-- A session can only be waiting ONCE (prevents duplicate matching)
create unique index if not exists uq_queue_one_waiting
    on public.matchmaking_queue (session_id) where status = 'waiting';
create index if not exists idx_queue_status_created on public.matchmaking_queue (status, created_at);

-- 3. Chat rooms ----------------------------------------------------------
create table if not exists public.chat_rooms (
    id         uuid primary key default gen_random_uuid(),
    status     text not null default 'active' check (status in ('active','ended')),
    created_at timestamptz not null default now(),
    ended_at   timestamptz
);
create index if not exists idx_rooms_status_ended on public.chat_rooms (status, ended_at);

-- 4. Chat participants ---------------------------------------------------
create table if not exists public.chat_participants (
    id         uuid primary key default gen_random_uuid(),
    room_id    uuid not null references public.chat_rooms(id) on delete cascade,
    session_id uuid not null references public.anonymous_sessions(id) on delete cascade,
    joined_at  timestamptz not null default now(),
    left_at    timestamptz,
    unique (room_id, session_id)
);
create index if not exists idx_participants_session on public.chat_participants (session_id);
create index if not exists idx_participants_room    on public.chat_participants (room_id);

-- 5. Messages ------------------------------------------------------------
create table if not exists public.messages (
    id                uuid primary key default gen_random_uuid(),
    room_id           uuid not null references public.chat_rooms(id) on delete cascade,
    sender_session_id uuid not null references public.anonymous_sessions(id) on delete cascade,
    message           text not null check (char_length(message) between 1 and 500),
    created_at        timestamptz not null default now()
);
create index if not exists idx_messages_room_created on public.messages (room_id, created_at);

-- 6. Reports (kept even after sessions expire, so moderators can review) --
create table if not exists public.reports (
    id                  uuid primary key default gen_random_uuid(),
    reporter_session_id uuid not null,
    reported_session_id uuid not null,
    room_id             uuid,
    reason              text not null
                        check (reason in ('Harassment','Inappropriate messages','Spam','Bullying','Suspicious behavior','Other')),
    description         text check (description is null or char_length(description) <= 500),
    created_at          timestamptz not null default now(),
    status              text not null default 'pending'
                        check (status in ('pending','reviewed','dismissed','actioned'))
);
create index if not exists idx_reports_reported on public.reports (reported_session_id);
create index if not exists idx_reports_status   on public.reports (status, created_at);

-- 7. Blocked sessions ----------------------------------------------------
create table if not exists public.blocked_sessions (
    id                 uuid primary key default gen_random_uuid(),
    blocker_session_id uuid not null,
    blocked_session_id uuid not null,
    created_at         timestamptz not null default now(),
    unique (blocker_session_id, blocked_session_id)
);
create index if not exists idx_blocked_blocked on public.blocked_sessions (blocked_session_id);

-- 8. Rate limit counters (used by the PHP API) ---------------------------
create table if not exists public.rate_limits (
    key    text        not null,
    action text        not null,
    bucket timestamptz not null,
    hits   int         not null default 0,
    primary key (key, action, bucket)
);

-- =====================================================================
-- NEUSTGLE - database/policies.sql     (run this THIRD)
-- Row Level Security.
--
-- The browser only ever receives a short-lived JWT whose "sub" is the
-- anonymous session id (auth.uid()). It may ONLY READ:
--   * its own participant row
--   * the room it belongs to
--   * the messages of that room
-- It can NOT write anything. All writes go through the PHP backend.
-- =====================================================================

alter table public.anonymous_sessions enable row level security;
alter table public.matchmaking_queue  enable row level security;
alter table public.chat_rooms         enable row level security;
alter table public.chat_participants  enable row level security;
alter table public.messages           enable row level security;
alter table public.reports            enable row level security;
alter table public.blocked_sessions   enable row level security;
alter table public.rate_limits        enable row level security;

-- Remove every default permission, then grant read-only access to 3 tables
revoke all on all tables in schema public from anon, authenticated;
grant select on public.chat_rooms, public.chat_participants, public.messages to authenticated;

-- Helper: "am I a member of this room?" (security definer avoids policy loops)
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.chat_participants
         where room_id = p_room_id and session_id = auth.uid()
    );
$$;
revoke all on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated, service_role;

-- Policies (tables without a policy are completely closed to the browser)
drop policy if exists "read own participant row" on public.chat_participants;
create policy "read own participant row" on public.chat_participants
    for select to authenticated
    using (session_id = auth.uid());

drop policy if exists "members read their room" on public.chat_rooms;
create policy "members read their room" on public.chat_rooms
    for select to authenticated
    using (public.is_room_member(id));

drop policy if exists "members read room messages" on public.messages;
create policy "members read room messages" on public.messages
    for select to authenticated
    using (public.is_room_member(room_id));

-- Turn on Supabase Realtime for the three tables the browser listens to
do $$
begin
    begin alter publication supabase_realtime add table public.chat_rooms;        exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.chat_participants; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.messages;          exception when duplicate_object then null; end;
end $$;

-- =====================================================================
-- NEUSTGLE - database/functions.sql    (run this SECOND)
-- Secure database functions. Only the PHP backend (service_role) may
-- call them. Every matching/ending operation takes the same advisory
-- lock, so two people can never be matched twice or in a conflicting
-- way (no race conditions).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------
create or replace function public.create_anonymous_session(p_token_hash text, p_ttl_seconds int default 7200)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    insert into public.anonymous_sessions (session_token_hash, expires_at)
    values (p_token_hash, now() + make_interval(secs => p_ttl_seconds))
    returning id into v_id;
    return v_id;
end;
$$;

-- Finds the session for a token hash, marks it active and extends its life.
-- Returns NULL if the session does not exist or has expired.
create or replace function public.authenticate_session(p_token_hash text, p_ttl_seconds int default 7200)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    update public.anonymous_sessions
       set last_active_at = now(),
           expires_at     = now() + make_interval(secs => p_ttl_seconds)
     where session_token_hash = p_token_hash
       and expires_at > now()
    returning id into v_id;
    return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Rate limiting (fixed time window). Returns TRUE if the call is allowed.
-- ---------------------------------------------------------------------
create or replace function public.rate_limit_check(p_key text, p_action text, p_max int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
    v_bucket timestamptz;
    v_hits   int;
begin
    v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

    insert into public.rate_limits as rl (key, action, bucket, hits)
    values (p_key, p_action, v_bucket, 1)
    on conflict (key, action, bucket) do update set hits = rl.hits + 1
    returning rl.hits into v_hits;

    return v_hits <= p_max;
end;
$$;

-- ---------------------------------------------------------------------
-- Ending chats (internal helper: caller must already hold the lock)
-- ---------------------------------------------------------------------
create or replace function public.end_chat_internal(p_session_id uuid, p_new_status text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_room uuid;
begin
    -- Remove the user from the matchmaking queue
    update public.matchmaking_queue
       set status = 'cancelled'
     where session_id = p_session_id and status = 'waiting';

    -- Find the active room of this user (if any)
    select p.room_id into v_room
      from public.chat_participants p
      join public.chat_rooms r on r.id = p.room_id
     where p.session_id = p_session_id
       and p.left_at is null
       and r.status = 'active'
     limit 1;

    if v_room is not null then
        update public.chat_participants set left_at = now() where room_id = v_room and left_at is null;
        update public.chat_rooms set status = 'ended', ended_at = now() where id = v_room;

        -- The other stranger is now disconnected
        update public.anonymous_sessions
           set status = 'disconnected'
         where status = 'connected'
           and id in (select session_id from public.chat_participants
                       where room_id = v_room and session_id <> p_session_id);
    end if;

    update public.anonymous_sessions set status = p_new_status where id = p_session_id;
    return v_room;
end;
$$;

-- Disconnects people who closed their browser (no activity for 90 seconds)
create or replace function public.cleanup_inactive_internal()
returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
    for r in
        select id from public.anonymous_sessions
         where status in ('searching','connected')
           and last_active_at < now() - interval '90 seconds'
    loop
        perform public.end_chat_internal(r.id, 'disconnected');
    end loop;
end;
$$;

-- Deletes expired sessions and old data
create or replace function public.cleanup_expired()
returns void
language plpgsql security definer set search_path = public as $$
begin
    perform pg_advisory_xact_lock(727001);

    delete from public.anonymous_sessions where expires_at < now();   -- cascades to queue/participants/messages
    delete from public.chat_rooms where status = 'ended' and ended_at < now() - interval '1 day';
    delete from public.chat_rooms r
     where r.created_at < now() - interval '10 minutes'
       and not exists (select 1 from public.chat_participants p where p.room_id = r.id);
    delete from public.matchmaking_queue where status <> 'waiting' and created_at < now() - interval '1 hour';
    delete from public.rate_limits where bucket < now() - interval '1 hour';
    delete from public.blocked_sessions b
     where not exists (select 1 from public.anonymous_sessions s where s.id = b.blocker_session_id)
        or not exists (select 1 from public.anonymous_sessions s where s.id = b.blocked_session_id);
end;
$$;

-- Public version used by Stop / Next / page reload
create or replace function public.end_chat(p_session_id uuid, p_new_status text default 'idle')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_room uuid;
begin
    if p_new_status not in ('idle','stopped','disconnected') then
        p_new_status := 'idle';
    end if;
    perform pg_advisory_xact_lock(727001);
    v_room := public.end_chat_internal(p_session_id, p_new_status);
    return jsonb_build_object('room_id', v_room);
end;
$$;

-- ---------------------------------------------------------------------
-- Random matching
--   p_start = true  : put me in the queue (or match me right now)
--   p_start = false : only check whether somebody matched me
-- ---------------------------------------------------------------------
create or replace function public.find_match(p_session_id uuid, p_start boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_status text;
    v_room   uuid;
    v_cand   uuid;
begin
    perform pg_advisory_xact_lock(727001);       -- one matchmaking operation at a time
    perform public.cleanup_inactive_internal();  -- drop people who closed their browser

    select status into v_status
      from public.anonymous_sessions
     where id = p_session_id and expires_at > now();
    if not found then
        return jsonb_build_object('status', 'expired');
    end if;

    -- Already in an active room? (e.g. somebody matched me while I was waiting)
    select p.room_id into v_room
      from public.chat_participants p
      join public.chat_rooms r on r.id = p.room_id
     where p.session_id = p_session_id and p.left_at is null and r.status = 'active'
     limit 1;
    if v_room is not null then
        return jsonb_build_object('status', 'connected', 'room_id', v_room);
    end if;

    if p_start then
        update public.anonymous_sessions set status = 'searching' where id = p_session_id;
        if not exists (select 1 from public.matchmaking_queue
                        where session_id = p_session_id and status = 'waiting') then
            insert into public.matchmaking_queue (session_id) values (p_session_id);
        end if;
    elsif v_status <> 'searching' then
        return jsonb_build_object('status', v_status);   -- stopped / idle: do NOT search again
    end if;

    -- Pick a random waiting stranger: not me, still online, not blocked either way
    select q.session_id into v_cand
      from public.matchmaking_queue q
      join public.anonymous_sessions s on s.id = q.session_id
     where q.status = 'waiting'
       and q.session_id <> p_session_id
       and s.status = 'searching'
       and s.expires_at > now()
       and s.last_active_at > now() - interval '60 seconds'
       and not exists (
            select 1 from public.blocked_sessions b
             where (b.blocker_session_id = p_session_id and b.blocked_session_id = q.session_id)
                or (b.blocker_session_id = q.session_id and b.blocked_session_id = p_session_id))
     order by random()
     limit 1;

    if v_cand is null then
        return jsonb_build_object('status', 'searching');
    end if;

    -- Match! Create the room and add both participants.
    insert into public.chat_rooms default values returning id into v_room;
    insert into public.chat_participants (room_id, session_id)
    values (v_room, p_session_id), (v_room, v_cand);

    update public.matchmaking_queue
       set status = 'matched'
     where session_id in (p_session_id, v_cand) and status = 'waiting';

    update public.anonymous_sessions
       set status = 'connected'
     where id in (p_session_id, v_cand);

    return jsonb_build_object('status', 'connected', 'room_id', v_room);
end;
$$;

-- ---------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------
create or replace function public.send_message(p_session_id uuid, p_room_id uuid, p_message text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_text text := btrim(coalesce(p_message, ''));
    v_msg  public.messages%rowtype;
begin
    if char_length(v_text) = 0 then
        return jsonb_build_object('ok', false, 'error', 'Message cannot be empty.');
    end if;
    if char_length(v_text) > 500 then
        return jsonb_build_object('ok', false, 'error', 'Message is too long.');
    end if;

    -- Caller must be a member of an ACTIVE room
    if not exists (
        select 1
          from public.chat_participants p
          join public.chat_rooms r on r.id = p.room_id
         where p.room_id = p_room_id
           and p.session_id = p_session_id
           and p.left_at is null
           and r.status = 'active') then
        return jsonb_build_object('ok', false, 'error', 'This chat is no longer active.');
    end if;

    insert into public.messages (room_id, sender_session_id, message)
    values (p_room_id, p_session_id, v_text)
    returning * into v_msg;

    return jsonb_build_object('ok', true, 'message',
           jsonb_build_object('id', v_msg.id, 'message', v_msg.message, 'created_at', v_msg.created_at));
end;
$$;

-- Messages of a room WITHOUT exposing session ids ("mine" true/false only)
create or replace function public.get_room_messages(p_session_id uuid, p_room_id uuid, p_after timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_room_status text;
    v_messages    jsonb;
begin
    if not exists (select 1 from public.chat_participants
                    where room_id = p_room_id and session_id = p_session_id) then
        return jsonb_build_object('ok', false, 'error', 'not_in_room');
    end if;

    select status into v_room_status from public.chat_rooms where id = p_room_id;

    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
      into v_messages
      from (
            select id,
                   (sender_session_id = p_session_id) as mine,
                   message,
                   created_at
              from public.messages
             where room_id = p_room_id
               and (p_after is null or created_at >= p_after)
             order by created_at
             limit 200
           ) m;

    return jsonb_build_object('ok', true, 'room_status', v_room_status, 'messages', v_messages);
end;
$$;

-- ---------------------------------------------------------------------
-- Reporting + blocking
-- ---------------------------------------------------------------------
create or replace function public.report_stranger(p_session_id uuid, p_room_id uuid, p_reason text, p_description text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_other uuid;
begin
    perform pg_advisory_xact_lock(727001);

    if not exists (select 1 from public.chat_participants
                    where room_id = p_room_id and session_id = p_session_id) then
        return jsonb_build_object('ok', false, 'error', 'not_in_room');
    end if;

    select session_id into v_other
      from public.chat_participants
     where room_id = p_room_id and session_id <> p_session_id
     limit 1;
    if v_other is null then
        return jsonb_build_object('ok', false, 'error', 'no_stranger');
    end if;

    insert into public.reports (reporter_session_id, reported_session_id, room_id, reason, description)
    values (p_session_id, v_other, p_room_id, p_reason, p_description);

    -- They can never be matched with each other again
    insert into public.blocked_sessions (blocker_session_id, blocked_session_id)
    values (p_session_id, v_other)
    on conflict do nothing;

    -- End the conversation
    perform public.end_chat_internal(p_session_id, 'idle');

    return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Lock the functions down: ONLY the PHP backend (service_role) can run them
-- ---------------------------------------------------------------------
revoke all on function public.create_anonymous_session(text, int)              from public, anon, authenticated;
revoke all on function public.authenticate_session(text, int)                  from public, anon, authenticated;
revoke all on function public.rate_limit_check(text, text, int, int)           from public, anon, authenticated;
revoke all on function public.end_chat_internal(uuid, text)                    from public, anon, authenticated;
revoke all on function public.cleanup_inactive_internal()                       from public, anon, authenticated;
revoke all on function public.cleanup_expired()                                from public, anon, authenticated;
revoke all on function public.end_chat(uuid, text)                             from public, anon, authenticated;
revoke all on function public.find_match(uuid, boolean)                        from public, anon, authenticated;
revoke all on function public.send_message(uuid, uuid, text)                   from public, anon, authenticated;
revoke all on function public.get_room_messages(uuid, uuid, timestamptz)       from public, anon, authenticated;
revoke all on function public.report_stranger(uuid, uuid, text, text)         from public, anon, authenticated;

grant execute on function public.create_anonymous_session(text, int)           to service_role;
grant execute on function public.authenticate_session(text, int)               to service_role;
grant execute on function public.rate_limit_check(text, text, int, int)        to service_role;
grant execute on function public.end_chat_internal(uuid, text)                 to service_role;
grant execute on function public.cleanup_inactive_internal()                   to service_role;
grant execute on function public.cleanup_expired()                             to service_role;
grant execute on function public.end_chat(uuid, text)                          to service_role;
grant execute on function public.find_match(uuid, boolean)                     to service_role;
grant execute on function public.send_message(uuid, uuid, text)               to service_role;
grant execute on function public.get_room_messages(uuid, uuid, timestamptz)    to service_role;
grant execute on function public.report_stranger(uuid, uuid, text, text)      to service_role;

notify pgrst, 'reload schema';

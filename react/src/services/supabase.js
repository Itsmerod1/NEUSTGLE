// Supabase Realtime (browser side).
// The browser uses ONLY the public anon key plus a short-lived token for its anonymous session.
// It can read its own room/messages (Row Level Security) but cannot write anything.
import { createClient } from '@supabase/supabase-js';

let client = null;

export function initSupabase(url, anonKey, realtimeToken) {
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  client.realtime.setAuth(realtimeToken);
  return client;
}

export function updateRealtimeToken(token) {
  if (client) client.realtime.setAuth(token);
}

/** Fires when the server puts me in a chat room (a stranger was found). */
export function subscribeToMatches(sessionId, onMatch) {
  const channel = client
    .channel(`match:${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_participants', filter: `session_id=eq.${sessionId}` },
      (payload) => {
        if (payload.new && payload.new.room_id) onMatch(payload.new.room_id);
      }
    )
    .subscribe();

  return { unsubscribe: () => client.removeChannel(channel) };
}

/** Live messages, "stranger left" events and typing indicator for one room. */
export function subscribeToRoom(roomId, handlers) {
  const channel = client
    .channel(`room:${roomId}`, { config: { broadcast: { self: false } } })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
      (payload) => handlers.onMessage && handlers.onMessage(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_rooms', filter: `id=eq.${roomId}` },
      (payload) => {
        if (payload.new && payload.new.status === 'ended' && handlers.onEnded) handlers.onEnded();
      }
    )
    .on('broadcast', { event: 'typing' }, () => handlers.onTyping && handlers.onTyping())
    .subscribe();

  return {
    sendTyping: () => channel.send({ type: 'broadcast', event: 'typing', payload: {} }),
    unsubscribe: () => client.removeChannel(channel),
  };
}

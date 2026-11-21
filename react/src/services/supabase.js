
// Supabase Realtime (browser side).
// The browser uses ONLY the public anon key plus a short-lived token.
// It cannot write directly to the database.

import { createClient } from '@supabase/supabase-js';

let client = null;

export function initSupabase(url, anonKey, realtimeToken) {
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  client.realtime.setAuth(realtimeToken);

  return client;
}

export function updateRealtimeToken(token) {
  if (client) {
    client.realtime.setAuth(token);
  }
}

/**
 * Fires when the server puts me in a chat room.
 */
export function subscribeToMatches(sessionId, onMatch) {
  const channel = client
    .channel(`match:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_participants',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        if (payload.new?.room_id) {
          onMatch(payload.new.room_id);
        }
      }
    )
    .subscribe();

  return {
    unsubscribe: () => client.removeChannel(channel),
  };
}

/**
 * Live messages, reactions, stranger-left events and typing.
 */
export function subscribeToRoom(roomId, handlers) {
  const channel = client
    .channel(`room:${roomId}`, {
      config: {
        broadcast: {
          self: false,
        },
      },
    })

    // New messages
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        handlers.onMessage?.(payload.new);
      }
    )

    // New, updated, or deleted reactions
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'message_reactions',
      },
      (payload) => {
        handlers.onReaction?.(payload);
      }
    )

    // Chat room status
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_rooms',
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        if (
          payload.new?.status === 'ended' &&
          handlers.onEnded
        ) {
          handlers.onEnded();
        }
      }
    )

    // Typing indicator
    .on('broadcast', { event: 'typing' }, () => {
      handlers.onTyping?.();
    })

    .subscribe();

  return {
    sendTyping: () =>
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {},
      }),

    unsubscribe: () => client.removeChannel(channel),
  };
}

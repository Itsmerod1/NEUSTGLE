// Talks to the PHP backend (api/*.php). Every call is a JSON POST.
// The anonymous session token travels in an HttpOnly cookie, so JavaScript never sees it.

const BASE = 'api/';

async function post(endpoint, body = {}) {
  const res = await fetch(BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }

  if (!res.ok || !data || data.ok === false) {
    const err = new Error((data && data.error) || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const createSession = (refresh = false) => post('create_session.php', { refresh });
export const findStranger = (poll = false) => post('find_stranger.php', { poll });
export const nextStranger = () => post('next_stranger.php');
export const stopChat = () => post('stop_chat.php');
export const sendMessage = (roomId, message) => post('send_message.php', { room_id: roomId, message });
export const getMessages = (roomId, after = null) => post('get_messages.php', { room_id: roomId, after });
export const reportStranger = (roomId, reason, description) =>
  post('report_stranger.php', { room_id: roomId, reason, description });
export const getOnlineCount = () => post('get_online_count.php');
export const reactToMessage = (roomId, messageId, reaction) =>
  post('react_message.php', {
    room_id: roomId,
    message_id: messageId,
    reaction,
  });
// Used when the tab is closing: tells the server to end the chat.
export function stopChatBeacon() {
  try {
    const blob = new Blob(['{}'], { type: 'application/json' });
    navigator.sendBeacon(BASE + 'stop_chat.php', blob);
  } catch {
    /* ignore */
  }
}

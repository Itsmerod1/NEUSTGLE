<?php
/**
 * POST api/get_messages.php
 * Body: { "room_id": "<uuid>", "after": "<timestamp or null>" }
 * Used for loading history, as a backup if Realtime drops, and as a "still here" heartbeat.
 * Messages never contain real session ids: only "mine": true/false.
 */
declare(strict_types=1);

require_once __DIR__ . '/../config/session.php';

$body      = require_json_post();
$sessionId = authenticate_request();
enforce_rate_limit('sid:' . $sessionId, 'get_messages', 40, 60);

$roomId = $body['room_id'] ?? null;
$after  = $body['after'] ?? null;

if (!is_uuid($roomId)) {
    json_error('Invalid request.', 422);
}
if ($after !== null && (!is_string($after)
    || !preg_match('/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/', $after))) {
    json_error('Invalid request.', 422);
}

$result = supabase_rpc('get_room_messages', [
    'p_session_id' => $sessionId,
    'p_room_id'    => $roomId,
    'p_after'      => $after,
]);

if (!is_array($result) || empty($result['ok'])) {
    json_error('You are not part of this chat.', 403);
}

json_response([
    'ok'          => true,
    'room_status' => $result['room_status'],
    'messages'    => $result['messages'],
]);

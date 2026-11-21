<?php
/**
 * POST api/send_message.php
 * Body: { "room_id": "<uuid>", "message": "Hello" }
 * The database function checks that the caller is in an ACTIVE room.
 */
declare(strict_types=1);

require_once __DIR__ . '/../config/session.php';

$body      = require_json_post();
$sessionId = authenticate_request();
enforce_rate_limit('sid:' . $sessionId, 'send', 30, 60);

$roomId  = $body['room_id'] ?? null;
$message = $body['message'] ?? null;

if (!is_uuid($roomId) || !is_string($message)) {
    json_error('Invalid request.', 422);
}

// Remove invisible control characters, then trim.
$message = trim((string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $message));

if ($message === '') {
    json_error('Message cannot be empty.', 422);
}
if (mb_strlen($message) > MAX_MESSAGE_LENGTH) {
    json_error('Message is too long (max ' . MAX_MESSAGE_LENGTH . ' characters).', 422);
}

$result = supabase_rpc('send_message', [
    'p_session_id' => $sessionId,
    'p_room_id'    => $roomId,
    'p_message'    => $message,
]);

if (!is_array($result) || empty($result['ok'])) {
    json_error($result['error'] ?? 'Message could not be sent.', 409);
}

json_response(['ok' => true, 'message' => $result['message']]);

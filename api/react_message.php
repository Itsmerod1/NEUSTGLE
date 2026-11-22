<?php
/**
 * POST api/react_message.php
 * Body:
 * {
 *   "room_id": "UUID",
 *   "message_id": "UUID",
 *   "reaction": "❤️"
 * }
 *
 * Use reaction = null to remove a reaction.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/session.php';

$body = require_json_post();

$sessionId = authenticate_request();

enforce_rate_limit('sid:' . $sessionId, 'react', 60, 60);

$roomId = $body['room_id'] ?? null;
$messageId = $body['message_id'] ?? null;
$reaction = $body['reaction'] ?? null;

if (!is_uuid($roomId) || !is_uuid($messageId)) {
    json_error('Invalid request.', 422);
}

$allowedReactions = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

if ($reaction !== null) {
    if (!is_string($reaction) ||
        !in_array($reaction, $allowedReactions, true)) {
        json_error('Invalid reaction.', 422);
    }
}

$result = supabase_rpc('react_to_message', [
    'p_session_id' => $sessionId,
    'p_room_id' => $roomId,
    'p_message_id' => $messageId,
    'p_reaction' => $reaction,
]);

if (!is_array($result) || empty($result['ok'])) {
    $error = $result['error'] ?? 'Reaction could not be saved.';

    json_error($error, 409);
}

json_response([
    'ok' => true,
    'action' => $result['action'] ?? null,
    'reaction' => $result['reaction'] ?? null,
]);

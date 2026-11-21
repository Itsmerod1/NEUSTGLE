<?php
/**
 * POST api/report_stranger.php
 * Body: { "room_id": "<uuid>", "reason": "Harassment", "description": "optional" }
 * Saves the report, blocks the reported stranger from matching with the reporter
 * again, and ends the conversation.
 */
declare(strict_types=1);

require_once __DIR__ . '/../config/session.php';

const REPORT_REASONS = [
    'Harassment',
    'Inappropriate messages',
    'Spam',
    'Bullying',
    'Suspicious behavior',
    'Other',
];

$body      = require_json_post();
$sessionId = authenticate_request();
enforce_rate_limit('sid:' . $sessionId, 'report', 5, 300);

$roomId      = $body['room_id'] ?? null;
$reason      = $body['reason'] ?? null;
$description = $body['description'] ?? '';

if (!is_uuid($roomId) || !is_string($reason) || !in_array($reason, REPORT_REASONS, true)) {
    json_error('Please choose a valid report reason.', 422);
}
if (!is_string($description)) {
    $description = '';
}
$description = trim((string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $description));
$description = mb_substr($description, 0, 500);

$result = supabase_rpc('report_stranger', [
    'p_session_id'  => $sessionId,
    'p_room_id'     => $roomId,
    'p_reason'      => $reason,
    'p_description' => $description === '' ? null : $description,
]);

if (!is_array($result) || empty($result['ok'])) {
    json_error('This chat could not be reported.', 403);
}

json_response(['ok' => true]);

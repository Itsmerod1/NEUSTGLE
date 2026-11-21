<?php
/**
 * POST api/find_stranger.php
 * Body: { "poll": false } -> start searching (or match immediately)
 *       { "poll": true }  -> just check whether a match has been found
 * Returns: { ok, status: "searching" | "connected", room_id? }
 */
declare(strict_types=1);

require_once __DIR__ . '/../config/session.php';

$body      = require_json_post();
$sessionId = authenticate_request();
enforce_rate_limit('sid:' . $sessionId, 'find', 60, 60);

$result = supabase_rpc('find_match', [
    'p_session_id' => $sessionId,
    'p_start'      => empty($body['poll']),
]);

json_response(array_merge(['ok' => true], is_array($result) ? $result : []));

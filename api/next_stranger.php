<?php
/**
 * POST api/next_stranger.php
 * Leaves the current stranger (who is notified) and immediately searches for a new one.
 */
declare(strict_types=1);

require_once __DIR__ . '/../config/session.php';

require_json_post();
$sessionId = authenticate_request();
enforce_rate_limit('sid:' . $sessionId, 'next', 20, 60);

supabase_rpc('end_chat', ['p_session_id' => $sessionId, 'p_new_status' => 'idle']);
$result = supabase_rpc('find_match', ['p_session_id' => $sessionId, 'p_start' => true]);

json_response(array_merge(['ok' => true], is_array($result) ? $result : []));

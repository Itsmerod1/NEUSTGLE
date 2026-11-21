<?php
/**
 * POST api/stop_chat.php
 * Cancels the search or ends the current chat. Does NOT search again.
 * Also called by the browser (sendBeacon) when the tab is closed.
 */
declare(strict_types=1);

require_once __DIR__ . '/../config/session.php';

require_json_post();
$sessionId = authenticate_request();
enforce_rate_limit('sid:' . $sessionId, 'stop', 30, 60);

supabase_rpc('end_chat', ['p_session_id' => $sessionId, 'p_new_status' => 'stopped']);

json_response(['ok' => true, 'status' => 'stopped']);

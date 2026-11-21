<?php
/**
 * POST api/create_session.php
 * Creates (or re-uses) the visitor's anonymous temporary session.
 * Body: { "refresh": true }  -> only renews the realtime token (keeps the current chat).
 */
declare(strict_types=1);

require_once __DIR__ . '/../config/session.php';

$body = require_json_post();
enforce_rate_limit(client_key(), 'create_session', 40, 300);

$refresh   = !empty($body['refresh']);
$sessionId = null;
$token     = read_token();

if ($token !== null) {
    $existing = supabase_rpc('authenticate_session', [
        'p_token_hash'  => hash_session_token($token),
        'p_ttl_seconds' => SESSION_TTL_SECONDS,
    ]);
    if (is_string($existing)) {
        $sessionId = $existing;
        if (!$refresh) {
            // Page was reloaded: leave any old chat so the other stranger is not left hanging.
            supabase_rpc('end_chat', ['p_session_id' => $sessionId, 'p_new_status' => 'idle']);
        }
    }
}

if ($sessionId === null) {
    supabase_rpc('cleanup_expired'); // housekeeping: remove expired sessions
    $token = generate_session_token();
    $created = supabase_rpc('create_anonymous_session', [
        'p_token_hash'  => hash_session_token($token),
        'p_ttl_seconds' => SESSION_TTL_SECONDS,
    ]);
    if (!is_string($created)) {
        json_error('Could not create an anonymous session.', 500);
    }
    $sessionId = $created;
}

set_token_cookie($token);

json_response([
    'ok'                => true,
    'session_id'        => $sessionId,
    'realtime_token'    => mint_realtime_jwt($sessionId),
    'supabase_url'      => SUPABASE_URL,
    'supabase_anon_key' => SUPABASE_ANON_KEY,
]);

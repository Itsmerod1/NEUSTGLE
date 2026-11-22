<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/session.php';

require_json_post();

$sessionId = authenticate_request();

enforce_rate_limit(
    'sid:' . $sessionId,
    'online_count',
    60,
    60
);

$result = supabase_rpc('get_online_count');

if (!is_numeric($result) || (int) $result < 0) {
    error_log('NEUSTGLE: Invalid get_online_count response.');
    json_error('Unable to retrieve online count.', 500);
}

json_response([
    'ok' => true,
    'online_count' => (int) $result
]);

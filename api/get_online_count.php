
<?php

require_once __DIR__ . '/../config/session.php';

require_json_post();

enforce_rate_limit(client_key(), 'online_count', 60, 60);

authenticate_request();

$result = supabase_rpc('get_online_count');

if ($result === null || !is_numeric($result)) {
    json_response([
        'ok' => false,
        'error' => 'Unable to retrieve online count.'
    ], 500);
}

json_response([
    'ok' => true,
    'online_count' => (int) $result
]);

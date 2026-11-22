
<?php

/**
 * NEUSTGLE - api/get_online_count.php
 *
 * Returns the number of currently active anonymous visitors.
 *
 * Active visitor:
 * - last_active_at is within the last 90 seconds
 * - expires_at is still in the future
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/session.php';

/* =========================================================
   1. REQUIRE POST REQUEST
========================================================= */

require_json_post();

/* =========================================================
   2. AUTHENTICATE ANONYMOUS SESSION
========================================================= */

$sessionId = authenticate_request();

/* =========================================================
   3. RATE LIMIT
========================================================= */

enforce_rate_limit(
    'sid:' . $sessionId,
    'online_count',
    60,
    60
);

/* =========================================================
   4. GET ONLINE COUNT
========================================================= */

try {

    $result = supabase_rpc('get_online_count');

    if (
        !is_numeric($result) ||
        (int) $result < 0
    ) {
        error_log(
            'NEUSTGLE: Invalid response from get_online_count RPC.'
        );

        json_error(
            'Unable to retrieve online count.',
            500
        );
    }

    $onlineCount = (int) $result;

    /* =====================================================
       5. RETURN RESPONSE
    ===================================================== */

    json_response([
        'ok' => true,
        'online_count' => $onlineCount
    ]);

} catch (Throwable $e) {

    error_log(
        'NEUSTGLE online count error: ' . $e->getMessage()
    );

    json_error(
        'Unable to retrieve online count.',
        500
    );
}

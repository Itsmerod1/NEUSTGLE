<?php
declare(strict_types=1);

/**
 * NEUSTGLE - config/supabase.php
 * Secure server-side Supabase REST API helpers.
 */

/* =========================================================
   1. LOAD ENVIRONMENT VARIABLES
========================================================= */

function load_env(string $path): void
{
    if (!is_readable($path)) {
        return;
    }

    $lines = file(
        $path,
        FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES
    );

    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);

        if (
            $line === '' ||
            $line[0] === '#' ||
            strpos($line, '=') === false
        ) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);

        $key = trim($key);
        $value = trim($value);

        if (
            strlen($value) >= 2 &&
            (
                ($value[0] === '"' && substr($value, -1) === '"') ||
                ($value[0] === "'" && substr($value, -1) === "'")
            )
        ) {
            $value = substr($value, 1, -1);
        }

        if (getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

load_env(__DIR__ . '/../.env');


/* =========================================================
   2. CONFIGURATION
========================================================= */

if (!defined('SUPABASE_URL')) {
    define('SUPABASE_URL', rtrim((string) getenv('SUPABASE_URL'), '/'));
}

if (!defined('SUPABASE_SERVICE_ROLE_KEY')) {
    define('SUPABASE_SERVICE_ROLE_KEY', (string) getenv('SUPABASE_SERVICE_ROLE_KEY'));
}

if (!defined('SUPABASE_ANON_KEY')) {
    define('SUPABASE_ANON_KEY', (string) getenv('SUPABASE_ANON_KEY'));
}

if (!defined('APP_ENV')) {
    define('APP_ENV', getenv('APP_ENV') ?: 'development');
}

if (!defined('SESSION_TTL_SECONDS')) {
    define('SESSION_TTL_SECONDS', 60 * 60 * 2);
}

if (!defined('MAX_MESSAGE_LENGTH')) {
    define('MAX_MESSAGE_LENGTH', 500);
}


/* =========================================================
   3. CONFIGURATION VALIDATION
========================================================= */

if (SUPABASE_URL === '' || SUPABASE_SERVICE_ROLE_KEY === '') {
    error_log('NEUSTGLE: Supabase environment configuration missing.');

    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode([
        'ok' => false,
        'error' => 'Server is not configured.'
    ]);

    exit;
}


/* =========================================================
   4. SECURITY HEADERS
========================================================= */

function send_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');

    if (APP_ENV === 'production') {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
}


/* =========================================================
   5. JSON RESPONSE HELPERS
========================================================= */

function json_response(array $data, int $status = 200): void
{
    send_security_headers();

    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );

    exit;
}

function json_error(string $message, int $status = 400): void
{
    json_response([
        'ok' => false,
        'error' => $message
    ], $status);
}


/* =========================================================
   6. REQUEST HELPERS
========================================================= */

function require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        json_error('Method not allowed.', 405);
    }
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');

    if ($raw === false || $raw === '') {
        return [];
    }

    $data = json_decode($raw, true);

    return is_array($data) ? $data : [];
}


/* =========================================================
   7. SUPABASE REST REQUEST
========================================================= */

function supabase_request(
    string $method,
    string $path,
    ?array $body = null,
    array $query = []
): array {

    $url = SUPABASE_URL . $path;

    if (!empty($query)) {
        $url .= '?' . http_build_query($query);
    }

    $ch = curl_init($url);

    if ($ch === false) {
        error_log('NEUSTGLE: Unable to initialize cURL.');
        json_error('Database connection could not be initialized.', 502);
    }

    $headers = [
        'apikey: ' . SUPABASE_SERVICE_ROLE_KEY,
        'Authorization: Bearer ' . SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type: application/json',
        'Accept: application/json',
    ];

    $options = [
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ];

    if ($body !== null) {
        $jsonBody = json_encode(
            $body,
            JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
        );

        $options[CURLOPT_POSTFIELDS] = $jsonBody;
    }

    curl_setopt_array($ch, $options);

    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);

    curl_close($ch);

    if ($response === false) {
        error_log('NEUSTGLE Supabase cURL error: ' . $curlError);
        json_error('Could not reach the database. Please try again.', 502);
    }

    $decoded = json_decode($response, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        error_log('NEUSTGLE Supabase returned invalid JSON. HTTP status: ' . $status);
        $decoded = null;
    }

    return [
        'status' => $status,
        'data' => $decoded
    ];
}


/* =========================================================
   8. SUPABASE RPC
========================================================= */

function supabase_rpc(string $function, array $params = []): mixed
{
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $function)) {
        error_log('NEUSTGLE: Invalid RPC function name.');
        json_error('Invalid database request.', 400);
    }

    $result = supabase_request(
        'POST',
        '/rest/v1/rpc/' . $function,
        $params
    );

    if ($result['status'] < 200 || $result['status'] >= 300) {
        error_log(
            'NEUSTGLE Supabase RPC error (' .
            $function .
            ') HTTP ' .
            $result['status'] .
            ': ' .
            json_encode($result['data'], JSON_UNESCAPED_UNICODE)
        );

        json_error('Database request failed. Please try again.', 500);
    }

    return $result['data'];
}


/* =========================================================
   9. SUPABASE SELECT
========================================================= */

function supabase_select(string $table, array $filters = []): array
{
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) {
        json_error('Invalid database request.', 400);
    }

    $result = supabase_request(
        'GET',
        '/rest/v1/' . $table,
        null,
        $filters
    );

    if ($result['status'] < 200 || $result['status'] >= 300) {
        error_log(
            'NEUSTGLE Supabase SELECT error (' .
            $table .
            ') HTTP ' .
            $result['status'] .
            ': ' .
            json_encode($result['data'], JSON_UNESCAPED_UNICODE)
        );

        json_error('Database request failed. Please try again.', 500);
    }

    return is_array($result['data']) ? $result['data'] : [];
}


/* =========================================================
   10. SESSION TOKEN HELPERS
========================================================= */

function generate_session_token(): string
{
    return bin2hex(random_bytes(32));
}

function hash_session_token(string $token): string
{
    return hash('sha256', $token);
}

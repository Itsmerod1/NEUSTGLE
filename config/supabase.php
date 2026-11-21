<?php
/**
 * NEUSTGLE - config/supabase.php
 *
 * Loads secrets from the .env file, connects to Supabase (server side only),
 * and provides small helper functions used by every API endpoint.
 *
 * IMPORTANT: The SERVICE ROLE key lives ONLY here (backend). Never put it in
 * React or any file inside assets/.
 */

declare(strict_types=1);

/* ---------------------------------------------------------------
 * 1. Load the .env file (placed in the neustgle/ root folder)
 * ------------------------------------------------------------- */
function load_env(string $path): void
{
    if (!is_readable($path)) {
        return; // Fall back to real server environment variables
    }
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key   = trim($key);
        $value = trim($value, " \t\n\r\0\x0B\"'");
        if (getenv($key) === false) {
            putenv("$key=$value");
            $_ENV[$key] = $value;
        }
    }
}

load_env(__DIR__ . '/../.env');

/* ---------------------------------------------------------------
 * 2. Configuration constants
 * ------------------------------------------------------------- */
define('SUPABASE_URL', rtrim((string) getenv('SUPABASE_URL'), '/'));
define('SUPABASE_SERVICE_ROLE_KEY', (string) getenv('SUPABASE_SERVICE_ROLE_KEY')); // backend only
define('SUPABASE_ANON_KEY', (string) getenv('SUPABASE_ANON_KEY'));                 // safe for frontend

define('APP_ENV', getenv('APP_ENV') ?: 'development');   // development | production
define('SESSION_TTL_SECONDS', 60 * 60 * 2);              // anonymous session lifetime: 2 hours
define('MAX_MESSAGE_LENGTH', 500);                       // character limit per message

if (SUPABASE_URL === '' || SUPABASE_SERVICE_ROLE_KEY === '') {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => 'Server is not configured. Check your .env file.']);
    exit;
}

/* ---------------------------------------------------------------
 * 3. Secure headers (applied to every API response)
 * ------------------------------------------------------------- */
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

/* ---------------------------------------------------------------
 * 4. JSON helpers
 * ------------------------------------------------------------- */
function json_response(array $data, int $status = 200): void
{
    send_security_headers();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $status = 400): void
{
    json_response(['ok' => false, 'error' => $message], $status);
}

function require_post(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
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

/* ---------------------------------------------------------------
 * 5. Supabase REST client (cURL)
 * ------------------------------------------------------------- */

/**
 * Low-level request to the Supabase REST API using the service role key.
 *
 * @return array{status:int, data:mixed}
 */
function supabase_request(string $method, string $path, ?array $body = null, array $query = []): array
{
    $url = SUPABASE_URL . $path;
    if ($query) {
        $url .= '?' . http_build_query($query);
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        
CURLOPT_HTTPHEADER => [
    'apikey: ' . SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type: application/json',
    'Prefer: return=representation',
],

    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $response = curl_exec($ch);
    $status   = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        error_log('Supabase cURL error: ' . $error);
        json_error('Could not reach the database. Please try again.', 502);
    }

    return ['status' => $status, 'data' => json_decode($response, true)];
}

/**
 * Call a PostgreSQL function (created in database/functions.sql).
 * Example: supabase_rpc('find_match', ['p_session_id' => $id]);
 */
function supabase_rpc(string $function, array $params = []): mixed
{
    $result = supabase_request('POST', '/rest/v1/rpc/' . $function, $params);

    if ($result['status'] >= 400) {
        error_log('Supabase RPC error (' . $function . '): ' . json_encode($result['data']));
        json_error('Something went wrong. Please try again.', 500);
    }
    return $result['data'];
}

/** Select rows from a table, e.g. supabase_select('messages', ['room_id' => 'eq.' . $id]) */
function supabase_select(string $table, array $filters = []): array
{
    $result = supabase_request('GET', '/rest/v1/' . $table, null, $filters);
    if ($result['status'] >= 400) {
        error_log('Supabase select error (' . $table . '): ' . json_encode($result['data']));
        json_error('Something went wrong. Please try again.', 500);
    }
    return is_array($result['data']) ? $result['data'] : [];
}

/* ---------------------------------------------------------------
 * 6. Security helpers (used by the session system in Phase 3)
 * ------------------------------------------------------------- */

/** Cryptographically secure random token (sent to the browser only). */
function generate_session_token(): string
{
    return bin2hex(random_bytes(32)); // 64 hex characters
}

/** Only this hash is stored in the database - never the raw token. */
function hash_session_token(string $token): string
{
    return hash('sha256', $token);
}

<?php
/**
 * NEUSTGLE - config/session.php
 *
 * The anonymous temporary session system (no login, no accounts).
 *
 *  - The browser gets a random 64-character token in an HttpOnly cookie.
 *  - The database stores ONLY the SHA-256 hash of that token.
 *  - A short-lived signed JWT (sub = anonymous session id) lets the browser
 *    listen to Supabase Realtime, and nothing else. Row Level Security makes
 *    sure it can only see its own chat room.
 */

declare(strict_types=1);

require_once __DIR__ . '/supabase.php';

const TOKEN_COOKIE       = 'neustgle_token';
const REALTIME_TOKEN_TTL = 3600; // 1 hour; the browser refreshes it automatically

function base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/** Cookie path = the folder of the site (e.g. /neustgle) so other localhost projects do not share it. */
function cookie_base_path(): string
{
    $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/');
    $base   = rtrim(dirname(dirname($script)), '/');
    return $base === '' ? '/' : $base;
}

function set_token_cookie(string $token): void
{
    setcookie(TOKEN_COOKIE, $token, [
        'expires'  => time() + SESSION_TTL_SECONDS,
        'path'     => cookie_base_path(),
        'secure'   => APP_ENV === 'production',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function read_token(): ?string
{
    $token = $_COOKIE[TOKEN_COOKIE] ?? '';
    return is_string($token) && preg_match('/^[a-f0-9]{64}$/', $token) ? $token : null;
}

/** Returns the anonymous session id of the caller, or stops with HTTP 401. */
function authenticate_request(): string
{
    $token = read_token();
    if ($token === null) {
        json_error('No session. Please reload the page.', 401);
    }
    $id = supabase_rpc('authenticate_session', [
        'p_token_hash'  => hash_session_token($token),
        'p_ttl_seconds' => SESSION_TTL_SECONDS,
    ]);
    if (!is_string($id)) {
        json_error('Your session expired. Please reload the page.', 401);
    }
    return $id;
}

/**
 * Every API call must be a POST with Content-Type: application/json.
 * Together with the SameSite cookie this blocks cross-site request forgery.
 */
function require_json_post(): array
{
    require_post();
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') === false) {
        json_error('Unsupported content type.', 415);
    }
    return read_json_body();
}

function is_uuid(mixed $value): bool
{
    return is_string($value)
        && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value) === 1;
}

/** Anonymous key for rate limiting by visitor address (salted + hashed, never stored in plain text). */
function client_key(): string
{
    return 'ip:' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . (string) getenv('SUPABASE_JWT_SECRET'));
}

/** Allow at most $max calls of $action per $windowSeconds for this key. */
function enforce_rate_limit(string $key, string $action, int $max, int $windowSeconds): void
{
    $allowed = supabase_rpc('rate_limit_check', [
        'p_key'            => $key,
        'p_action'         => $action,
        'p_max'            => $max,
        'p_window_seconds' => $windowSeconds,
    ]);
    if ($allowed !== true) {
        json_error('You are doing that too fast. Please slow down.', 429);
    }
}

/** Create the signed token that lets the browser use Supabase Realtime for this session only. */
function mint_realtime_jwt(string $sessionId): string
{
    $secret = (string) getenv('SUPABASE_JWT_SECRET');
    if ($secret === '') {
        json_error('Server is not configured (missing SUPABASE_JWT_SECRET).', 500);
    }

    $now     = time();
    $header  = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64url_encode(json_encode([
        'aud'  => 'authenticated',
        'role' => 'authenticated',
        'sub'  => $sessionId,
        'iat'  => $now,
        'exp'  => $now + REALTIME_TOKEN_TTL,
    ]));
    $signature = base64url_encode(hash_hmac('sha256', "$header.$payload", $secret, true));

    return "$header.$payload.$signature";
}

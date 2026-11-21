<?php
/**
 * NEUSTGLE - index.php
 * The ONLY page of the site. It opens the chat immediately:
 * no login, no registration, no account.
 */
declare(strict_types=1);

require_once __DIR__ . '/config/supabase.php';

send_security_headers();

$host = (string) parse_url(SUPABASE_URL, PHP_URL_HOST);
header(
    "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; " .
    "img-src 'self' data:; connect-src 'self' https://$host wss://$host; " .
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
);

$cssVersion = @filemtime(__DIR__ . '/assets/css/style.css') ?: 1;
$jsVersion  = @filemtime(__DIR__ . '/assets/js/neustgle.js') ?: 1;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="description" content="NEUSTGLE - Meet Someone New. Stay Anonymous.">
    <meta name="theme-color" content="#2563eb">
    <title>NEUSTGLE - Meet Someone New. Stay Anonymous.</title>
    <link rel="icon" type="image/svg+xml" href="assets/images/logo.svg">
    <link rel="stylesheet" href="assets/css/style.css?v=<?= $cssVersion ?>">
</head>
<body>
    <div id="root"></div>
    <noscript>
        <p class="noscript">NEUSTGLE needs JavaScript to work. Please enable JavaScript and reload.</p>
    </noscript>
    <script src="assets/js/neustgle.js?v=<?= $jsVersion ?>"></script>
</body>
</html>

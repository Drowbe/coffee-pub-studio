<?php
declare(strict_types=1);

/** Per-install secret used to sign form tokens and hash IPs. Created on first use. */
function app_secret(): string
{
    $s = read_secrets();
    if (!empty($s['secret'])) {
        return (string)$s['secret'];
    }
    $file = DATA_DIR . '/.secret';
    if (!is_file($file)) {
        if (!is_dir(DATA_DIR)) {
            @mkdir(DATA_DIR, 0775, true);
        }
        file_put_contents($file, bin2hex(random_bytes(32)), LOCK_EX);
        @chmod($file, 0600);
    }
    return trim((string)file_get_contents($file));
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $dir = DATA_DIR . '/sessions';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    session_save_path($dir);
    session_name('cpsid');
    session_set_cookie_params([
        'lifetime' => 0, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Strict',
    ]);
    session_start();
}

function csrf_token(): string
{
    start_session();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
    return $_SESSION['csrf'];
}

function csrf_ok(mixed $token): bool
{
    start_session();
    return is_string($token) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
}

/**
 * Client IP. Behind the reverse proxy REMOTE_ADDR is a private address, so the
 * first X-Forwarded-For entry is trusted only in that case.
 */
function client_ip(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $fwd = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    $public = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    if ($fwd !== '' && !$public) {
        $first = trim(explode(',', $fwd)[0]);
        if (filter_var($first, FILTER_VALIDATE_IP)) {
            return $first;
        }
    }
    return $ip;
}

/** Stored instead of the raw IP address. */
function ip_hash(): string
{
    return hash_hmac('sha256', client_ip(), app_secret());
}

/** Signed timestamp, so a submit that comes back too fast can be rejected. */
function form_token(): string
{
    $t = (string)time();
    return $t . '.' . hash_hmac('sha256', $t, app_secret());
}

function form_token_age(mixed $token): ?int
{
    if (!is_string($token) || !str_contains($token, '.')) {
        return null;
    }
    [$t, $sig] = explode('.', $token, 2);
    if (!ctype_digit($t) || !hash_equals(hash_hmac('sha256', $t, app_secret()), $sig)) {
        return null;
    }
    return time() - (int)$t;
}

function no_cache_headers(): void
{
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
}

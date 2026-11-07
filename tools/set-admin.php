<?php
declare(strict_types=1);

/**
 * Sets (or resets) the admin login for the Coffee Pub site.
 *
 * Usage:  php set-admin.php <username> [--out <file>]     (generates a password)
 *         php set-admin.php <username> --prompt           (you type your own password, 12+ characters)
 *
 * A strong random password is generated and written to <file> (default:
 * admin-password.txt next to this script), never printed to the terminal.
 * The bcrypt hash is stored in <data>/secrets.php next to this script's folder.
 * Delete the password file once you have saved it in your password manager.
 */
if (PHP_SAPI !== 'cli') {
    exit("Run this from the command line.\n");
}

$user = $argv[1] ?? '';
if ($user === '' || str_starts_with($user, '--')) {
    exit("Usage: php set-admin.php <username> [--out <file>] | --prompt\n");
}
$outIdx = array_search('--out', $argv, true);
$out = $outIdx !== false && isset($argv[$outIdx + 1]) ? $argv[$outIdx + 1] : __DIR__ . '/admin-password.txt';

$dataDir = dirname(__DIR__) . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0775, true);
}
$file = $dataDir . '/secrets.php';
$secrets = is_file($file) ? (array)(include $file) : [];

$custom = in_array('--prompt', $argv, true);
if ($custom) {
    $ask = function (string $label): string {
        echo $label;
        @shell_exec('stty -echo');
        $v = rtrim((string)fgets(STDIN), "\r\n");
        @shell_exec('stty echo');
        echo "\n";
        return $v;
    };
    $password = $ask('New password (12 or more characters): ');
    if ($password !== $ask('Type it again: ')) {
        exit("The two passwords differ. Nothing was changed.\n");
    }
    if (strlen($password) < 12) {
        exit("Too short: use 12 or more characters. Nothing was changed.\n");
    }
} else {
    $alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $password = '';
    for ($i = 0; $i < 20; $i++) {
        $password .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
}

$secrets['admin_user'] = $user;
$secrets['admin_hash'] = password_hash($password, PASSWORD_DEFAULT);
if (empty($secrets['secret'])) {
    $secrets['secret'] = bin2hex(random_bytes(32));
}
file_put_contents($file, "<?php\nreturn " . var_export($secrets, true) . ";\n", LOCK_EX);
@chmod($file, 0600);
// The website runs as the container's "abc" user; if this tool runs as root, hand the data folder to it.
if (function_exists('exec') && is_dir('/config/data') && $dataDir === '/config/data') {
    @exec('chown -R abc:abc ' . escapeshellarg($dataDir) . ' 2>&1');
}
if ($custom) {
    echo "Admin login saved for '{$user}' with the password you typed. No password file was written.\n";
} else {
    file_put_contents($out, "username: {$user}\npassword: {$password}\n", LOCK_EX);
    @chmod($out, 0600);
    echo "Admin login saved for '{$user}'.\nThe password was written to: {$out}\n";
}

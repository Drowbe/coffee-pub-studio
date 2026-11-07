<?php
// Dev-only router for `php -S`. In production nginx does this job via try_files.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . '/site' . $path;
if ($path !== '/' && is_file($file) && !str_ends_with($file, '.php')) {
    return false;
}
if (str_starts_with($path, '/app/')) {
    http_response_code(403);
    exit('Forbidden');
}
require __DIR__ . '/site/index.php';

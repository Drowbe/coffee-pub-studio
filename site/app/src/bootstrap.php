<?php
declare(strict_types=1);

// Layout: <root>/site/app/src/bootstrap.php. In production <root> is /config
// (site = /config/www, data = /config/data); in staging <root> is .../staging.
define('APP_DIR', dirname(__DIR__));
define('DATA_DIR', dirname(__DIR__, 3) . '/data');

function h(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function read_json(string $path): array
{
    $raw = @file_get_contents($path);
    $data = $raw === false ? null : json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function site(): array
{
    static $site = null;
    return $site ??= read_json(APP_DIR . '/content/site.json');
}

/** All products, flagship first is handled by callers; list is A-Z by name. */
function products(): array
{
    static $all = null;
    if ($all === null) {
        $all = [];
        foreach (glob(APP_DIR . '/products/*/product.json') ?: [] as $file) {
            $p = read_json($file);
            // A product owner edits their own file, so a broken one must only hide that product, never break the site.
            $ok = !empty($p['slug']) && empty($p['hidden'])
                && $p['slug'] === basename(dirname($file))
                && !array_filter(['name', 'short', 'tagline', 'category'], fn($k) => !isset($p[$k]) || !is_string($p[$k]) || $p[$k] === '');
            if ($ok) {
                $all[$p['slug']] = $p;
            } elseif (!empty($p['slug']) && empty($p['hidden'])) {
                error_log('Product ' . basename(dirname($file)) . ': product.json is invalid or incomplete, page hidden');
            }
        }
        uasort($all, fn($a, $b) => strcasecmp($a['name'], $b['name']));
    }
    return $all;
}

function product(string $slug): ?array
{
    return products()[$slug] ?? null;
}

/** HTTP GET with a file cache. Serves stale data when GitHub is unreachable. */
function cached_get(string $url, int $ttl = 3600): ?string
{
    $dir = DATA_DIR . '/cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $file = $dir . '/' . sha1($url) . '.cache';
    $fresh = is_file($file) && (time() - filemtime($file) < $ttl);
    if ($fresh) {
        return file_get_contents($file) ?: null;
    }
    $body = http_get($url);
    if ($body !== null) {
        @file_put_contents($file, $body, LOCK_EX);
        return $body;
    }
    if (is_file($file)) {
        @touch($file, time() - $ttl + 300); // back off for 5 minutes
        return file_get_contents($file) ?: null;
    }
    return null;
}

function http_get(string $url): ?string
{
    if (!function_exists('curl_init')) {
        return null;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_USERAGENT => 'coffeepub-site/1.0',
        CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json, text/plain'],
    ]);
    $secrets = read_secrets();
    if (!empty($secrets['github_token']) && str_contains($url, 'api.github.com')) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: application/vnd.github+json',
            'Authorization: Bearer ' . $secrets['github_token'],
        ]);
    }
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ($body !== false && $code === 200) ? (string)$body : null;
}

function read_secrets(): array
{
    static $s = null;
    if ($s === null) {
        $f = DATA_DIR . '/secrets.php';
        $s = is_file($f) ? (array)(include $f) : [];
    }
    return $s;
}

/** Live facts for a Foundry module product: version, release, manifest. Never throws. */
function live_info(array $p): array
{
    $info = ['version' => $p['fallbackVersion'] ?? null, 'released' => null,
             'release_url' => null, 'manifest' => null, 'live' => false];
    if (empty($p['repo']) || !empty($p['external'])) {
        return $info;
    }
    $rel = cached_get('https://api.github.com/repos/' . $p['repo'] . '/releases/latest');
    if ($rel !== null && ($j = json_decode($rel, true)) && !empty($j['tag_name'])) {
        $info['version'] = ltrim((string)$j['tag_name'], 'v');
        $info['released'] = !empty($j['published_at']) ? substr((string)$j['published_at'], 0, 10) : null;
        $info['release_url'] = $j['html_url'] ?? null;
        $info['live'] = true;
    }
    $branch = $p['branch'] ?? 'master';
    if (!empty($p['app'])) {
        return $info;
    }
    $mod = cached_get('https://raw.githubusercontent.com/' . $p['repo'] . '/' . $branch . '/module.json');
    if ($mod !== null && ($m = json_decode($mod, true)) && is_array($m)) {
        $info['manifest'] = $m['manifest'] ?? null;
        if (!$info['live'] && !empty($m['version'])) {
            $info['version'] = (string)$m['version'];
        }
    }
    return $info;
}

function render(string $template, array $vars = []): string
{
    extract($vars, EXTR_SKIP);
    ob_start();
    // A leading slash means an absolute path (a product's own template.php); otherwise a shared template.
    include $template[0] === '/' ? $template : APP_DIR . '/templates/' . $template . '.php';
    return (string)ob_get_clean();
}

function page(string $template, array $vars = [], int $status = 200): void
{
    http_response_code($status);
    $content = render($template, $vars);
    echo external_links(render('layout', $vars + ['content' => $content]));
}

/** Open links to other sites in a new tab. */
function external_links(string $html): string
{
    $self = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]);
    return preg_replace_callback('/<a\s[^>]*>/i', function ($m) use ($self) {
        $tag = $m[0];
        if (stripos($tag, 'target=') !== false) return $tag;
        if (!preg_match('/href="(https?:)?\/\/([^\/"#?:]+)/i', $tag, $h)) return $tag;
        if (strtolower($h[2]) === $self) return $tag;
        return rtrim(substr($tag, 0, -1)) . ' target="_blank" rel="noopener">';
    }, $html) ?? $html;
}

function initials(string $name): string
{
    $name = preg_replace('/^Coffee Pub\s+/i', '', $name) ?? $name;
    return mb_strtoupper(mb_substr($name, 0, 1));
}

/** Flat illustration for a product category (used when there is no screenshot). */
function art_for(string $category): string
{
    $map = [
        'core' => 'core', 'character tools' => 'character', 'combat' => 'combat', 'gm tools' => 'gm',
        'lore and journals' => 'lore', 'maps and planning' => 'maps', 'utility' => 'utility', 'audio' => 'audio',
        'streaming' => 'streaming', 'ai' => 'ai', 'crafting' => 'crafting', 'maps and scenes' => 'scenes',
        'collaboration' => 'collaboration',
    ];
    return '/assets/art/' . ($map[strtolower($category)] ?? 'core') . '.svg';
}

require __DIR__ . '/security.php';
require __DIR__ . '/db.php';
require __DIR__ . '/mail.php';
require __DIR__ . '/contact.php';
require __DIR__ . '/admin.php';

/** The kinds of problems the studio solves, with the products that show each one. */
function capabilities(): array
{
    static $c = null;
    if ($c === null) {
        $raw = @file_get_contents(APP_DIR . '/content/capabilities.json');
        $c = is_string($raw) ? (json_decode($raw, true) ?: []) : [];
    }
    return $c;
}

/** Brand mark as a light/dark image pair. $key: studio | chameleon | showrunner | gaming. */
function mark_img(string $key, int $size = 56, string $class = 'mk'): string
{
    $f = '/assets/brand/coffee-pub-' . $key . '-mark';
    return '<img class="' . $class . ' mk-l" src="' . $f . '.svg" width="' . $size . '" height="' . $size . '" alt="">'
         . '<img class="' . $class . ' mk-d" src="' . $f . '-dark.svg" width="' . $size . '" height="' . $size . '" alt="">';
}

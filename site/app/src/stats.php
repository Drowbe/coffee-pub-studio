<?php
declare(strict_types=1);

/**
 * Live numbers from the studio's public GitHub repositories, for the home page.
 * Cached for six hours; a stale or missing cache never slows a page, the refresh runs after the response is sent.
 */

const GH_STATS_TTL = 21600;

function gh_stats_file(): string { return DATA_DIR . '/ghstats.json'; }

/** @return array{repos:int,releases:int,capped:bool,latest:int,at:int}|null */
function gh_stats(): ?array
{
    $f = gh_stats_file();
    $c = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    $c = is_array($c) && isset($c['at'], $c['repos'], $c['releases']) ? $c : null;
    $age = $c ? time() - (int)$c['at'] : PHP_INT_MAX;
    if ($age > 86400) {
        // Missing or a day old: refresh now (about four seconds, once), so the numbers can never go stale.
        gh_stats_refresh();
        $c = is_file($f) ? json_decode((string)file_get_contents($f), true) : $c;
        $c = is_array($c) && isset($c['at'], $c['repos'], $c['releases']) ? $c : null;
    } elseif ($age > GH_STATS_TTL) {
        $lock = $f . '.lock';
        if (!is_file($lock) || time() - (int)@filemtime($lock) > 120) {
            @touch($lock);
            register_shutdown_function(function () { if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); } gh_stats_refresh(); });
        }
    }
    return $c;
}

function gh_stats_refresh(): void
{
    ignore_user_abort(true);
    @set_time_limit(120);
    $fail = gh_stats_file() . '.fail';
    if (is_file($fail) && time() - (int)@filemtime($fail) < 1800) { return; }
    try {
        $repos = 0; $releases = 0; $capped = false; $latest = 0;
        $ctx = stream_context_create(['http' => ['timeout' => 4, 'header' => "User-Agent: coffeepub-site\r\nAccept: application/vnd.github+json\r\n", 'ignore_errors' => true]]);
        foreach (products() as $p) {
            if (empty($p['repo'])) { continue; }
            $raw = @file_get_contents('https://api.github.com/repos/' . $p['repo'] . '/releases?per_page=100', false, $ctx);
            $list = $raw ? json_decode($raw, true) : null;
            if (!is_array($list) || (isset($list['message']))) { @touch($fail); return; }   // rate limited or failed: keep the old numbers, retry in half an hour
            $repos++;
            $releases += count($list);
            if (count($list) >= 100) { $capped = true; }
            foreach ($list as $r) { $latest = max($latest, (int)strtotime((string)($r['published_at'] ?? ''))); }
        }
        if ($repos === 0) { @touch($fail); return; }
        if (!is_dir(DATA_DIR)) { @mkdir(DATA_DIR, 0700, true); }
        file_put_contents(gh_stats_file(), json_encode(['repos' => $repos, 'releases' => $releases, 'capped' => $capped, 'latest' => $latest, 'at' => time()]), LOCK_EX);
        @unlink($fail);
    } catch (Throwable $e) {
        // Numbers are decoration; a failed refresh just keeps the last ones.
    }
}

function ago(int $ts): string
{
    $d = max(0, time() - $ts);
    if ($d < 86400) { return 'today'; }
    $days = intdiv($d, 86400);
    if ($days === 1) { return 'yesterday'; }
    if ($days < 14) { return $days . ' days ago'; }
    if ($days < 60) { return intdiv($days, 7) . ' weeks ago'; }
    return intdiv($days, 30) . ' months ago';
}

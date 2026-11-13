<?php
declare(strict_types=1);

/** Adds a small icon to each .btn link so the button says what it does. Applied to page content in the layout. */

function btn_icon_svg(string $name, string $extra = ''): string
{
    $paths = [
        'download' => '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
        'arrow'    => '<path d="M5 12h14M13 6l6 6-6 6"/>',
        'back'     => '<path d="M19 12H5M11 6l-6 6 6 6"/>',
        'ext'      => '<path d="M7 17L17 7M8 7h9v9"/>',
        'play'     => '<path d="M8 5v14l11-7z"/>',
        'book'     => '<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v14h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4zM12 5v14"/>',
        'mail'     => '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
        'send'     => '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
        'code'     => '<path d="M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
        'help'     => '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
        'patreon'  => '<rect x="3" y="3" width="3.8" height="18" fill="currentColor" stroke="none"/><circle cx="15" cy="9.8" r="6.6" fill="currentColor" stroke="none"/>',
    ];
    if (!isset($paths[$name])) { return ''; }
    return '<svg class="bi bi-' . $name . $extra . '" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' . $paths[$name] . '</svg>';
}

/** Chooses an icon from the button's label and link. Returns [name, trailing]. */
function btn_icon_for(string $label, string $attrs, bool $isLink): ?array
{
    $t = strtolower(trim(html_entity_decode(strip_tags($label))));
    $href = '';
    if (preg_match('/href="([^"]*)"/', $attrs, $m)) { $href = strtolower(html_entity_decode($m[1])); }
    if (str_contains($attrs, ' download') || preg_match('/download|install|downloads/', $t)) { return ['download', false]; }
    if (str_contains($t, 'patreon')) { return ['patreon', false]; }
    if (str_contains($t, 'github')) { return ['code', false]; }
    if (preg_match('/documentation|docs|guide/', $t)) { return ['book', false]; }
    if (str_starts_with($t, 'back to')) { return ['back', false]; }
    if (!$isLink) { return preg_match('/send/', $t) ? ['send', false] : null; }
    if (preg_match('/contact|get in touch/', $t) || str_starts_with($href, 'mailto:')) { return ['mail', false]; }
    if (str_contains($t, 'see it in action') || preg_match('/watch|demo/', $t)) { return ['play', false]; }
    if (preg_match('/get help|support$/', $t)) { return ['help', false]; }
    if (preg_match('~^https?://~', $href) && !str_contains($href, 'coffeepubstudio.com')) { return ['ext', true]; }
    return ['arrow', true];
}

function btn_icons(string $html): string
{
    $do = function (array $m, bool $isLink): string {
        [$all, $cls, $attrs, $inner] = $m;
        if (str_contains($cls, 'soon') || str_contains($inner, '<svg')) { return $all; }
        $pick = btn_icon_for($inner, $attrs, $isLink);
        if (!$pick) { return $all; }
        [$name, $trail] = $pick;
        $svg = btn_icon_svg($name);
        if ($svg === '') { return $all; }
        $tag = $isLink ? 'a' : 'button';
        $body = $trail ? $inner . $svg : $svg . $inner;
        return '<' . $tag . ' class="btn' . $cls . '"' . $attrs . '>' . $body . '</' . $tag . '>';
    };
    $html = preg_replace_callback('~<a class="btn((?: [a-z]+)*)"([^>]*)>(.*?)</a>~s', fn($m) => $do($m, true), $html) ?? $html;
    $html = preg_replace_callback('~<button class="btn((?: [a-z]+)*)"([^>]*)>(.*?)</button>~s', fn($m) => $do($m, false), $html) ?? $html;
    return $html;
}

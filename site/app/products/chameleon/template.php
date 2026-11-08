<?php
// The Chameleon overview: a standalone page (its own header, palette and footer), not the shared product page.
// The travel and games pages are served by a route in index.php from page-travel.html and page-games.html.
while (ob_get_level() > 0) {
    ob_end_clean();
}
header('Content-Type: text/html; charset=utf-8');
echo external_links((string)file_get_contents(__DIR__ . '/page-overview.html'));
exit;

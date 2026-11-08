<?php
declare(strict_types=1);

require __DIR__ . '/app/src/bootstrap.php';

$path = rtrim((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/') ?: '/';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch (true) {
    case $path === '/robots.txt':
        header('Content-Type: text/plain; charset=utf-8');
        echo "User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: " . site()['url'] . "/sitemap.xml\n";
        break;

    case $path === '/sitemap.xml':
        header('Content-Type: application/xml; charset=utf-8');
        $urls = ['/', '/products', '/about', '/support', '/contact', '/design-system', '/privacy.html', '/terms.html'];
        foreach (products() as $slug => $_) {
            $urls[] = '/products/' . $slug;
        }
        echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
        foreach ($urls as $u) {
            echo '  <url><loc>' . h(site()['url'] . $u) . "</loc></url>\n";
        }
        echo "</urlset>\n";
        break;

    case $path === '/':
        page('home', ['title' => site()['name'], 'desc' => site()['description'], 'products' => products()]);
        break;

    case $path === '/products':
        page('products', ['title' => 'Products', 'desc' => 'Every Coffee Pub module and app.', 'products' => products()]);
        break;

    case $path === '/products/collaborator':
        header('Location: /products/chameleon', true, 301);
        break;

    case preg_match('#^/products/([a-z0-9-]+)$#', $path, $m) === 1:
        $p = product($m[1]);
        if ($p === null) {
            page('404', ['title' => 'Not found'], 404);
            break;
        }
        $own = APP_DIR . '/products/' . $p['slug'] . '/template.php';   // optional: a product may replace the shared page
        page(is_file($own) ? $own : 'product', ['title' => $p['name'], 'desc' => $p['tagline'], 'p' => $p, 'live' => live_info($p)]);
        break;

    case $path === '/contact':
        no_cache_headers();
        $view = ['title' => 'Contact', 'desc' => 'Get in touch with Coffee Pub Studio.', 'sent' => false, 'errors' => [], 'old' => []];
        if ($method === 'POST') {
            $res = handle_contact_post();
            if ($res['ok']) {
                header('Location: /contact?sent=1', true, 303);
                exit;
            }
            $view['errors'] = $res['errors'];
            $view['old'] = $res['old'];
        } else {
            $view['sent'] = isset($_GET['sent']);
        }
        $view['csrf'] = csrf_token();
        $view['ft'] = form_token();
        page('contact', $view, $view['errors'] ? 422 : 200);
        break;

    case $path === '/admin' || str_starts_with($path, '/admin/'):
        admin_route($path);
        break;

    case $path === '/brand':
        header('Location: /design-system#marks', true, 301);
        break;

    case $path === '/privacy.html' || $path === '/terms.html':
        $k = $path === '/privacy.html' ? 'privacy' : 'terms';
        page($k, ['title' => $k === 'privacy' ? 'Privacy policy' : 'Terms of service', 'desc' => site()['description']]);
        break;

    case $path === '/design-system':
        page('design-system', ['title' => 'Design system', 'desc' => 'The marks, colours, type, components and voice behind Coffee Pub.']);
        break;

    case in_array($path, ['/about', '/support'], true):
        $name = ltrim($path, '/');
        page($name, ['title' => ucfirst($name), 'desc' => site()['description']]);
        break;

    default:
        page('404', ['title' => 'Not found'], 404);
}

<?php
$s = site();
$cur = rtrim((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/') ?: '/';
$studio = trim((string)preg_replace('/^Coffee Pub\s*/i', '', $s['name']));
$full = ($title === $s['name']) ? $s['name'] : $title . ' · ' . $s['name'];
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= h($full) ?></title>
  <meta name="description" content="<?= h($desc ?? $s['description']) ?>">
  <link rel="canonical" href="<?= h(rtrim($s['url'], '/') . ($cur === '/' ? '/' : $cur)) ?>">
  <?php if (!empty($noindex)): ?><meta name="robots" content="noindex, nofollow"><?php endif; ?>
  <meta property="og:title" content="<?= h($full) ?>">
  <meta property="og:description" content="<?= h($desc ?? $s['description']) ?>">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="<?= h($s['name']) ?>">
  <meta property="og:url" content="<?= h(rtrim($s['url'], '/') . ($cur === '/' ? '/' : $cur)) ?>">
  <meta property="og:image" content="<?= h(rtrim($s['url'], '/') . '/assets/brand/og-image.png') ?>">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Coffee Pub Studio: apps and Foundry VTT modules that solve real problems">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preload" href="/assets/fonts/fraunces/latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/figtree/latin.woff2" as="font" type="font/woff2" crossorigin>
  <script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
  <link rel="icon" href="/assets/brand/favicon.ico" sizes="any">
  <link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg">
  <link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
  <link rel="stylesheet" href="/assets/style.css?v=<?= @filemtime(dirname(__DIR__, 2) . "/assets/style.css") ?: 1 ?>">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="wrap">
    <a class="brand" href="/" aria-label="<?= h($s['name']) ?>"><?= mark_img('studio', 56) ?><span class="wm"><b>Coffee Pub</b> <i><?= h($studio) ?></i></span></a>
    <nav class="main" aria-label="Main">
      <div class="dd" id="dd-products">
        <button type="button" class="link dd-btn<?= str_starts_with($cur, '/products') ? ' cur' : '' ?>" aria-expanded="false" aria-controls="dd-menu-products" aria-haspopup="true">Products <span aria-hidden="true">&#9662;</span></button>
        <div class="dd-menu" id="dd-menu-products">
          <a href="/products/chameleon"><?= mark_img('chameleon', 40, 'mk') ?><span><b>Coffee Pub Chameleon</b><small>Plan, chat and call together</small></span></a>
          <a href="/products/showrunner"><?= mark_img('showrunner', 40, 'mk') ?><span><b>Showrunner</b><small>Feed OBS from your game and players</small></span></a>
          <a href="/products#modules"><?= mark_img('gaming', 40, 'mk') ?><span><b>Foundry VTT modules</b><small>The suite built on Blacksmith</small></span></a>
          <a class="all" href="/products">All products</a>
        </div>
      </div>
      <?php foreach (['/about' => 'About', '/support' => 'Support'] as $href => $label): ?>
        <a class="link" href="<?= h($href) ?>"<?= str_starts_with($cur, $href) ? ' aria-current="page"' : '' ?>><?= h($label) ?></a>
      <?php endforeach; ?>
      <?php if (!empty($_COOKIE['cpsid']) && function_exists('admin_logged_in') && admin_logged_in()):
        $unread = (int)db()->query('SELECT COUNT(*) FROM messages WHERE is_read = 0')->fetchColumn(); ?>
        <a class="link inbox<?= $unread ? ' has' : '' ?>" href="/admin"><?= $unread ? 'Inbox <span class="count" aria-label="' . $unread . ' unread messages">' . $unread . '</span>' : 'Inbox' ?></a>
      <?php endif; ?>
      <?php if (!empty($s['links']['patreon'])): ?><a class="iconbtn" href="<?= h($s['links']['patreon']) ?>" target="_blank" rel="noopener" aria-label="Support on Patreon" title="Support on Patreon"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6.1 5c2.1 0 3.6 1.2 5.9 3.5C14.3 6.2 15.8 5 17.9 5c3.4 0 5.2 3.4 3.7 6.8C19.5 16.4 12 21 12 21z" fill="currentColor"/></svg></a><?php endif; ?>
      <button id="theme" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">&#9680;</button>
    </nav>
  </div>
</header>
<main id="main"><?= $content ?></main>
<footer class="site">
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-about">
        <a class="brand" href="/" aria-label="<?= h($s['name']) ?>"><?= mark_img('studio', 32) ?><span class="wm"><b>Coffee Pub</b> <i><?= h($studio) ?></i></span></a>
        <p>Boutique design and development. We build apps and Foundry VTT modules for people who plan trips, stream and run tabletop games.</p>
      </div>
      <nav aria-label="Products">
        <h2>Products</h2>
        <a href="/products/chameleon">Coffee Pub Chameleon</a>
        <a href="/products/showrunner">Showrunner</a>
        <a href="/products#modules">Foundry VTT modules</a>
        <a href="/products">All products</a>
      </nav>
      <nav aria-label="Studio">
        <h2>Studio</h2>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/support">Get help</a>
        <a href="/design-system">Design system</a>
      </nav>
      <nav aria-label="Elsewhere">
        <h2>Elsewhere</h2>
        <a href="https://willhavebeen.com" target="_blank" rel="noopener">willhavebeen.com</a>
        <?php if (!empty($s['links']['patreon'])): ?><a href="<?= h($s['links']['patreon']) ?>" target="_blank" rel="noopener">Patreon</a><?php endif; ?>
        <?php if (!empty($s['links']['github'])): ?><a href="<?= h($s['links']['github']) ?>" target="_blank" rel="noopener">GitHub</a><?php endif; ?>
        <?php if (!empty($s['links']['youtube'])): ?><a href="<?= h($s['links']['youtube']) ?>" target="_blank" rel="noopener">YouTube</a><?php endif; ?>
      </nav>
    </div>
    <div class="foot-base">
      <div class="buildnote"><?= h($s["buildNote"]) ?></div>
      <div class="legal">&copy; <?= (int)$s['year'] ?> <?= h($s['legal']) ?> &middot; <a href="/privacy.html">Privacy</a> &middot; <a href="/terms.html">Terms</a> &middot; <a href="/admin" rel="nofollow">Admin</a></div>
    </div>
  </div>
</footer>
<script>
(function () {
  var imgs = document.querySelectorAll('.show-shot img, .gallery img'); if (!imgs.length) return;
  var box = document.createElement('div'); box.className = 'lightbox'; box.hidden = true;
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Screenshot');
  box.innerHTML = '<button type="button" class="lb-x" aria-label="Close">&times;</button><img alt="">';
  document.body.appendChild(box);
  var big = box.querySelector('img'), last = null;
  function open(img) { last = img; big.src = img.currentSrc || img.src; big.alt = img.alt; box.hidden = false; document.documentElement.classList.add('lb-open'); box.querySelector('.lb-x').focus(); }
  function close() { box.hidden = true; document.documentElement.classList.remove('lb-open'); big.removeAttribute('src'); if (last) last.focus(); }
  imgs.forEach(function (img) {
    img.tabIndex = 0; img.setAttribute('role', 'button'); img.setAttribute('aria-label', 'View larger: ' + (img.alt || 'screenshot'));
    img.addEventListener('click', function () { open(img); });
    img.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(img); } });
  });
  box.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !box.hidden) close(); });
})();
(function () {
  var dd = document.getElementById('dd-products'); if (!dd) return;
  var b = dd.querySelector('.dd-btn');
  function set(o) { dd.classList.toggle('open', o); b.setAttribute('aria-expanded', o ? 'true' : 'false'); }
  b.addEventListener('click', function (e) { e.stopPropagation(); set(!dd.classList.contains('open')); });
  document.addEventListener('click', function (e) { if (!dd.contains(e.target)) set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); b.focus(); } });
})();
document.getElementById('theme').addEventListener('click', function () {
  var r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  var next = dark ? 'light' : 'dark'; r.dataset.theme = next;
  try { localStorage.setItem('theme', next) } catch (e) {}
});
</script>
</body>
</html>

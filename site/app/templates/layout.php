<?php
$s = site();
$cur = rtrim((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/') ?: '/';
$nav = ['/products' => 'Products', '/about' => 'About', '/support' => 'Support'];
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
  <link rel="preload" href="/assets/fonts/fraunces/latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/figtree/latin.woff2" as="font" type="font/woff2" crossorigin>
  <script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
  <link rel="icon" href="/assets/brand/favicon.ico" sizes="any">
  <link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg">
  <link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="wrap">
    <a class="brand" href="/" aria-label="<?= h($s['name']) ?>"><?= mark_img('studio', 56) ?><span class="wm"><b>Coffee Pub</b> <i><?= h($studio) ?></i></span></a>
    <nav class="main" aria-label="Main">
      <?php foreach ($nav as $href => $label): ?>
        <a class="link" href="<?= h($href) ?>"<?= str_starts_with($cur, $href) ? ' aria-current="page"' : '' ?>><?= h($label) ?></a>
      <?php endforeach; ?>
      <?php if (!empty($s['links']['patreon'])): ?><a class="pill" href="<?= h($s['links']['patreon']) ?>">Support on Patreon</a><?php endif; ?>
      <button id="theme" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">&#9680;</button>
    </nav>
  </div>
</header>
<main id="main"><?= $content ?></main>
<footer class="site">
  <div class="wrap">
    <a class="brand" href="/" aria-label="<?= h($s['name']) ?>"><?= mark_img('studio', 32) ?><span class="wm"><b>Coffee Pub</b> <i><?= h($studio) ?></i></span></a>
    <div class="row">
      <div>&copy; <?= (int)$s['year'] ?> <?= h($s['legal']) ?></div>
      <nav aria-label="Footer">
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
        <a href="/design-system">Design system</a>
        <a href="https://willhavebeen.com">willhavebeen.com</a>
        <a href="/privacy.html">Privacy</a>
        <a href="/terms.html">Terms</a>
        <?php if (!empty($s['links']['patreon'])): ?><a href="<?= h($s['links']['patreon']) ?>">Patreon</a><?php endif; ?>
        <?php if (!empty($s['links']['github'])): ?><a href="<?= h($s['links']['github']) ?>">GitHub</a><?php endif; ?>
        <?php if (!empty($s['links']['youtube'])): ?><a href="<?= h($s['links']['youtube']) ?>">YouTube</a><?php endif; ?>
      </nav>
    </div>
    <div><?= h($s['buildNote']) ?></div>
  </div>
</footer>
<script>
document.getElementById('theme').addEventListener('click', function () {
  var r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  var next = dark ? 'light' : 'dark'; r.dataset.theme = next;
  try { localStorage.setItem('theme', next) } catch (e) {}
});
</script>
</body>
</html>

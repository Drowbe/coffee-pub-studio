<?php
$root = dirname(__DIR__, 2) . '/assets';
$groups = [];
foreach (glob($root . '/icons/*.svg') ?: [] as $f) { $groups['Shared library'][basename($f)] = '/assets/icons/' . basename($f); }
$have = $groups['Shared library'] ?? [];
foreach (glob($root . '/products/*', GLOB_ONLYDIR) ?: [] as $d) {
  $slug = basename($d);
  foreach (glob($d . '/*.svg') ?: [] as $f) {
    if (isset($have[basename($f)])) continue;
    $groups['From ' . ucfirst($slug)][basename($f)] = '/assets/products/' . $slug . '/' . basename($f);
  }
}
$count = array_sum(array_map('count', $groups));
?>
<div class="wrap ds">
  <section style="padding-top:56px">
    <div class="eyebrow"><a href="/design-system" style="text-decoration:none">Design system</a> &middot; Icons</div>
    <h1>Icons</h1>
    <p class="lead">Every icon the products use, <?= (int)$count ?> in all. Each is a 64 px SVG on a cream tile, so it drops in anywhere. Click one to open the file, or link to it straight from your module or app.</p>
    <nav class="ds-nav" aria-label="Design system">
      <a href="/design-system">Overview</a><a href="/design-system#marks">Brand marks</a><a href="/design-system/icons" aria-current="page">Icons</a><a href="/design-system/illustrations">Illustrations and animation</a>
    </nav>
    <?php foreach ($groups as $title => $files): ksort($files); ?>
      <h2 class="ds-h"><?= h($title) ?></h2>
      <div class="icon-grid">
        <?php foreach ($files as $name => $url): $label = ucwords(str_replace('-', ' ', basename($name, '.svg'))); ?>
          <a class="icon-tile" href="<?= h($url) ?>" download="<?= h($name) ?>">
            <img src="<?= h($url) ?>" width="64" height="64" alt="" loading="lazy">
            <b><?= h($label) ?></b>
            <code><?= h($url) ?></code>
          </a>
        <?php endforeach; ?>
      </div>
    <?php endforeach; ?>
  </section>
</div>

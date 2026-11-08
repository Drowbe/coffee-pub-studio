<?php
$root = dirname(__DIR__, 2) . '/assets';
$art = array_map('basename', glob($root . '/art/*.svg') ?: []);
sort($art);
$scenes = [1 => 'Trip', 2 => 'Game', 3 => 'Design jam', 4 => 'Mentoring', 5 => 'Real estate', 6 => 'Anything imaginable', 7 => 'Showrunner'];
?>
<div class="wrap ds">
  <section style="padding-top:56px">
    <div class="eyebrow"><a href="/design-system" style="text-decoration:none">Design system</a> &middot; Illustration and motion</div>
    <h1>Illustrations and animation</h1>
    <p class="lead">The flat illustrations and animated scenes used across the studio and the products. Use them as they are; if something new is needed, add it here so every product can share it.</p>
    <nav class="ds-nav" aria-label="Design system">
      <a href="/design-system">Overview</a><a href="/design-system#marks">Brand marks</a><a href="/design-system/icons">Icons</a><a href="/design-system/illustrations" aria-current="page">Illustrations and animation</a>
    </nav>

    <h2 id="scenes" class="ds-h">Animated scenes</h2>
    <p class="lead">Pure CSS inside inline SVG, no scripts or video. They stop on a still frame when reduced motion is on. Scenes 1 to 3 also play together as the home page loop. To use one, include <code>_hero_art.php</code> with <code>$only</code> set to its number.</p>
    <div class="scene-grid">
      <?php foreach ($scenes as $n => $name): ?>
        <figure class="scene"><div class="phead-art"><?php $only = $n; include __DIR__ . '/_hero_art.php'; unset($only); ?></div>
          <figcaption><b>Scene <?= $n ?></b> &middot; <?= h($name) ?></figcaption></figure>
      <?php endforeach; ?>
    </div>

    <h2 id="art" class="ds-h">Flat illustrations</h2>
    <p class="lead">Used on product and capability cards. Each is a 320 &times; 200 SVG. Click to open the file.</p>
    <div class="art-grid">
      <?php foreach ($art as $name): $url = '/assets/art/' . $name; $label = ucwords(str_replace('-', ' ', basename($name, '.svg'))); ?>
        <a class="art-tile" href="<?= h($url) ?>" download="<?= h($name) ?>">
          <img src="<?= h($url) ?>" alt="" loading="lazy"><b><?= h($label) ?></b><code><?= h($url) ?></code>
        </a>
      <?php endforeach; ?>
    </div>
  </section>
</div>

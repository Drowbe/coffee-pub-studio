<?php
// One "area" of a product: a deeper page inside the product's own space, in the shared site layout.
$mk = $p['mark'] ?? null;
?>
<div class="wrap">
  <div class="crumbs"><a href="/products">Products</a> / <a href="/products/<?= h($p['slug']) ?>"><?= h($p['short']) ?></a> / <?= h($a['title']) ?></div>
  <div class="phead">
    <div class="eyebrow pm">
      <?php if ($mk): ?><?= mark_img($mk, 56, 'mk pmk') ?><?php endif; ?>
      <span><?= h($a['eyebrow'] ?? $p['short']) ?></span>
    </div>
    <h1><?= h($a['title']) ?></h1>
    <?php if (!empty($a['lead'])): ?><p class="lead"><?= h($a['lead']) ?></p><?php endif; ?>
    <div class="actions">
      <?php if (!empty($p['external'])): ?><a class="btn" href="<?= h($p['external']) ?>"><?= h($p['cta'] ?? 'Open') ?></a><?php endif; ?>
      <a class="btn ghost" href="/products/<?= h($p['slug']) ?>">Back to <?= h($p['short']) ?></a>
    </div>
  </div>
  <?php $sections = $a['sections'] ?? []; include __DIR__ . '/_sections.php'; ?>
  <?php if (!empty($a['features'])): ?>
  <section>
    <div class="features">
      <?php foreach ($a['features'] as $i => $f): ?>
        <div class="feature"><div class="n"><?= sprintf('%02d', $i + 1) ?></div><h3><?= h($f['title']) ?></h3><p><?= h($f['text']) ?></p></div>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>
  <?php $others = array_filter($p['areas'] ?? [], fn($o) => $o['slug'] !== $a['slug']); if ($others): ?>
  <section>
    <h2>More about <?= h($p['short']) ?></h2>
    <div class="features">
      <?php foreach ($others as $o): ?>
        <a class="feature" href="/products/<?= h($p['slug']) ?>/<?= h($o['slug']) ?>"><h3><?= h($o['title']) ?></h3><p><?= h($o['summary'] ?? '') ?></p></a>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>
</div>

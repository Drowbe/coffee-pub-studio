<?php
// One "area" of a product: a deeper page inside the product's own space, in the shared site layout.
$mk = $p['mark'] ?? null;
?>
<div class="wrap">
  <div class="crumbs"><a href="/products">Products</a> / <a href="/products/<?= h($p['slug']) ?>"><?= h($p['short']) ?></a> / <?= h($a['title']) ?></div>
  <?php $art = (int)($a['art'] ?? 0); if ($art >= 1 && $art <= 6): ?><div class="phead-split"><?php endif; ?>
  <div class="phead">
    <div class="eyebrow pm">
      <?php if ($mk): ?><?= mark_img($mk, 56, 'mk pmk') ?><?php endif; ?>
      <span><?= h($a['eyebrow'] ?? $p['short']) ?><?= !empty($a['comingSoon']) ? ' &middot; ' . h($a['statusLabel'] ?? $p['statusLabel'] ?? 'Coming soon') : '' ?></span>
    </div>
    <h1><?= h($a['title']) ?></h1>
    <?php if (!empty($a['lead'])): ?><p class="lead"><?= h($a['lead']) ?></p><?php endif; ?>
    <div class="actions">
      <?php if (!empty($p['external'])): ?><a class="btn" href="<?= h($p['external']) ?>"><?= h($p['cta'] ?? 'Open') ?></a><?php endif; ?>
      <a class="btn ghost" href="/products/<?= h($p['slug']) ?>">Back to <?= h($p['short']) ?></a>
    </div>
  </div>
  <?php if ($art >= 1 && $art <= 6): ?>
    <div class="phead-art"><?php $only = $art; include __DIR__ . '/_hero_art.php'; unset($only); ?></div>
  </div>
  <?php endif; ?>
  <?php $sections = $a['sections'] ?? []; include __DIR__ . '/_sections.php'; ?>
  <?php if (!empty($a['features'])): ?>
  <section>
    <div class="features">
      <?php foreach ($a['features'] as $i => $f): ?>
        <div class="feature"><?php if (!empty($f['image'])): ?><img class="feat-img" src="<?= h($f['image']) ?>" alt="" width="48" height="48" loading="lazy"><?php else: ?><div class="n"><?= sprintf('%02d', $i + 1) ?></div><?php endif; ?><h3><?= h($f['title']) ?></h3><p><?= h($f['text']) ?></p></div>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>
  <?php $others = array_filter($p['areas'] ?? [], fn($o) => $o['slug'] !== $a['slug']); if ($others): ?>
  <section>
    <h2>Other ways to use <?= h($p['short']) ?></h2>
    <div class="more-row">
      <?php foreach ($others as $o): ?>
        <a class="more-tile" href="/products/<?= h($p['slug']) ?>/<?= h($o['slug']) ?>">
          <?php if (!empty($o['image'])): ?><img src="<?= h($o['image']) ?>" alt="" width="56" height="56" loading="lazy"><?php elseif ($mk): ?><?= mark_img($mk, 56, 'mk') ?><?php endif; ?>
          <b><?= h($o['title']) ?></b><?php if (!empty($o['comingSoon'])): ?><span class="soon-tag"><?= h($p['statusLabel'] ?? 'Coming soon') ?></span><?php endif; ?>
          <span><?= h($o['blurb'] ?? '') ?></span>
        </a>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>
</div>

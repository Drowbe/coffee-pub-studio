<a class="card" href="/products/<?= h($p['slug']) ?>">
  <div class="thumb">
    <?php if (!empty($p['cardImage'])): ?>
      <img class="art" src="<?= h($p['cardImage']) ?>" alt="" loading="lazy">
    <?php elseif (!empty($p['hero'])): ?>
      <img src="<?= h($p['hero']) ?>" alt="" loading="lazy">
    <?php else: ?>
      <img class="art" src="<?= h(art_for($p['category'])) ?>" alt="" loading="lazy">
    <?php endif; ?>
  </div>
  <div class="body">
    <h3><?= h($p['short']) ?></h3>
    <p><?= h($p['pitch'] ?? $p['tagline']) ?></p>
    <div class="badges">
      <span class="badge"><?= h($p['category']) ?></span>
      <?php if (!empty($p['hub'])): ?><span class="badge hub">Flagship</span><?php endif; ?>
      <?php if (($p['status'] ?? '') === 'early'): ?><span class="badge early">Early</span><?php endif; ?>
      <?php if (!empty($p['comingSoon'])): ?><span class="badge soon">Coming soon</span><?php endif; ?>
    </div>
  </div>
</a>

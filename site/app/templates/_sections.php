<?php foreach (($sections ?? []) as $sec): if (empty($sec['title'])) continue; ?>
  <section<?= !empty($sec['id']) && preg_match('/^[a-z0-9-]+$/', $sec['id']) ? ' id="' . h($sec['id']) . '"' : '' ?>>
    <?php if (!empty($sec['eyebrow'])): ?><div class="eyebrow"><?= h($sec['eyebrow']) ?></div><?php endif; ?>
    <h2><?= h($sec['title']) ?></h2>
    <?php if (!empty($sec['text'])): ?><p class="lead"><?= h($sec['text']) ?></p><?php endif; ?>
    <?php if (!empty($sec['points'])): ?>
      <ul class="ticks"><?php foreach ($sec['points'] as $pt): ?><li><?= h($pt) ?></li><?php endforeach; ?></ul>
    <?php endif; ?>
  </section>
<?php endforeach; ?>

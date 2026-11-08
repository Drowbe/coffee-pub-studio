<?php
// A dark highlight band: optional image, a title, a sentence or two and one link. Expects $co.
$lk = $co['link'] ?? null;
?>
<section class="callout-wrap">
  <div class="callout">
    <?php if (!empty($co['image'])): ?><img class="callout-img" src="<?= h($co['image']) ?>" alt="" width="96" height="96" loading="lazy"><?php endif; ?>
    <div>
      <h2><?= h($co['title']) ?></h2>
      <?php if (!empty($co['text'])): ?><p><?= h($co['text']) ?></p><?php endif; ?>
      <?php if (!empty($lk['url']) && !empty($lk['label'])): ?><a class="callout-link" href="<?= h($lk['url']) ?>"><?= h($lk['label']) ?></a><?php endif; ?>
    </div>
  </div>
</section>

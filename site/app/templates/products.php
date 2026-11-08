<?php
$flag = array_filter($products, fn($p) => !empty($p['flagship']));
$hub = array_filter($products, fn($p) => !empty($p['hub']));
$apps = array_filter($products, fn($p) => !empty($p['app']));
$modules = array_filter($products, fn($p) => empty($p['flagship']) && empty($p['hub']) && empty($p['app']));
?>
<div class="wrap">
  <section style="padding-top:56px">
    <div class="eyebrow">Products</div>
    <h1>Everything we make</h1>
    <p class="lead">A collaboration app, an app for streamers, and a suite of Foundry VTT modules for tabletop games, all built on one platform. Modules marked Early are new and still settling in.</p>

    <h2 style="margin-top:56px;font-size:1.5rem">Flagships</h2>
    <div class="grid">
      <?php foreach ($flag + $apps as $p): include APP_DIR . '/templates/_card.php'; endforeach; ?>
      <a class="card" href="#modules">
        <div class="thumb"><img class="art" src="/assets/art/blacksmith-card.svg" alt="" loading="lazy"></div>
        <div class="body">
          <h3 class="hm"><?= mark_img('gaming', 56, 'mk') ?>Foundry VTT Modules</h3>
          <p>A suite of modules for Foundry VTT tabletop games, from the toolbar and combat stats to crafting, lore and audio, all built on Coffee Pub Blacksmith.</p>
          <div class="badges"><span class="badge">Modules</span></div>
        </div>
      </a>
    </div>

    <h2 id="modules" class="hmark" style="margin-top:56px;font-size:1.5rem"><?= mark_img('gaming', 56, 'mk') ?>Foundry VTT modules</h2>
    <p class="muted" style="margin:0">Every module here except Monarch builds on Coffee Pub Blacksmith, the first one below.</p>
    <div class="grid">
      <?php foreach ($hub + $modules as $p): include APP_DIR . '/templates/_card.php'; endforeach; ?>
    </div>
  </section>
</div>

<?php
$isFlag = !empty($p['flagship']);
$isApp = !empty($p['app']);
$manifest = $live['manifest'] ?? ($p['manifestFallback'] ?? null);
$features = $p['features'] ?? [];
if (!$features && !empty($p['highlights'])) {
    $features = array_map(fn($t) => ['title' => '', 'text' => $t], $p['highlights']);
}
$wiki = fn(string $page) => $p['wiki'] . '/' . $page;
?>
<div class="wrap">
  <div class="crumbs"><a href="/products">Products</a> / <?= h($p['short']) ?></div>

  <div class="phead">
    <?php $mk = $p['mark'] ?? ($isApp ? null : 'gaming'); ?>
    <div class="eyebrow pm">
      <?php if ($mk): ?><?= mark_img($mk, 56, 'mk pmk') ?><?php endif; ?>
      <span><?= h($p['category']) ?>
      <?php if (($p['status'] ?? '') === 'early'): ?> &middot; Early<?php endif; ?>
      <?php if (!empty($p['comingSoon'])): ?> &middot; Coming soon<?php endif; ?></span>
    </div>
    <h1><?= h($p['name']) ?></h1>
    <p class="lead"><?= h($p['pitch'] ?? $p['tagline']) ?></p>

    <div class="actions">
      <?php if (!empty($p['comingSoon']) && !empty($p['external'])): ?>
        <span class="btn soon" aria-disabled="true">Coming soon</span>
        <a class="btn ghost" href="<?= h($p['external']) ?>">See it in action</a>
      <?php elseif (!empty($p['external'])): ?>
        <a class="btn" href="<?= h($p['external']) ?>"><?= h($p['cta'] ?? 'Open') ?></a>
      <?php elseif ($isApp): ?>
        <a class="btn" href="<?= !empty($p['downloads']) ? '#install' : h($p['download']) ?>">Download</a>
      <?php elseif ($manifest): ?>
        <a class="btn" href="#install">Install</a>
      <?php endif; ?>
      <?php if (!$isFlag): ?>
        <a class="btn ghost" href="<?= h($p['wiki']) ?>">Documentation</a>
        <a class="btn ghost" href="<?= h($p['github']) ?>">GitHub</a>
      <?php endif; ?>
    </div>
    <?php if (!empty($p['ctaNote'])): ?><p class="muted" style="margin:14px 0 0"><?= h($p['ctaNote']) ?></p><?php endif; ?>
    <?php if ($isFlag): ?><p class="muted" style="margin:10px 0 0">Your own environment at <code>yourname.coffeepubstudio.live</code>: your people, your spaces, your tools.</p><?php endif; ?>

    <div class="facts">
      <?php if (!$isFlag): ?>
        <?php if (!empty($live['version'])): ?><div class="fact"><span>Version</span><b><?= h($live['version'] ?? 'n/a') ?></b><?php if (!empty($live['live'])): ?> <span class="badge live" style="display:inline">live</span><?php endif; ?></div><?php endif; ?>
        <?php if (!empty($live['released'])): ?><div class="fact"><span>Released</span><b><?= h($live['released']) ?></b></div><?php endif; ?>
        <?php if ($isApp): ?>
          <div class="fact"><span>Runs on</span><b><?= h($p['platforms']) ?></b></div>
          <div class="fact"><span>Price</span><b>Free</b></div>
        <?php else: ?>
          <div class="fact"><span>Foundry VTT</span><b><?= h($p['foundry'] ?? 'v13 and v14') ?></b></div>
          <div class="fact"><span>Price</span><b>Free for now</b></div>
        <?php endif; ?>
      <?php else: ?>
        <div class="fact"><span>Runs</span><b>In your browser</b></div>
        <div class="fact"><span>Status</span><b>Coming soon</b></div>
      <?php endif; ?>
    </div>
  </div>

  <div class="frame<?= empty($p['hero']) ? ' art-frame' : '' ?>">
    <div class="bar"><i></i><i></i><i></i></div>
    <?php if (!empty($p['hero'])): ?>
      <img src="<?= h($p['hero']) ?>" alt="<?= h($p['name']) ?> screenshot">
    <?php else: ?>
      <img class="art wide" src="<?= h(art_for($p['category'])) ?>" alt="">
      <div class="art-note">Screenshot coming soon</div>
    <?php endif; ?>
  </div>

  <?php if ($features): ?>
  <section>
    <h2><?= $isFlag ? 'What it does' : 'What you get' ?></h2>
    <div class="features">
      <?php foreach ($features as $i => $f): ?>
        <div class="feature">
          <div class="n"><?= sprintf('%02d', $i + 1) ?></div>
          <?php if ($f['title'] !== ''): ?><h3><?= h($f['title']) ?></h3><p><?= h($f['text']) ?></p>
          <?php else: ?><h3 style="font-weight:600"><?= h($f['text']) ?></h3><?php endif; ?>
        </div>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>

  <?php if (!empty($p['platform'])): $pl = $p['platform']; ?>
  <section id="developers">
    <div class="eyebrow">For developers</div>
    <h2>The engine under the suite</h2>
    <p class="lead">Almost every Coffee Pub module builds on Blacksmith. It does the plumbing once, so each module can focus on its own experience.</p>
    <div class="stats" style="margin-top:36px">
      <?php foreach ($pl['stats'] as $st): ?><div class="stat"><b><?= h($st['n']) ?></b><span><?= h($st['l']) ?></span></div><?php endforeach; ?>
    </div>
    <div class="points">
      <?php foreach ($pl['points'] as $pt): ?><div><h3><?= h($pt['t']) ?></h3><p><?= h($pt['x']) ?></p></div><?php endforeach; ?>
    </div>
    <h3 style="margin-top:56px">What the API covers</h3>
    <div class="areas">
      <?php foreach ($pl['areas'] as $ar): ?><div><b><?= h($ar['t']) ?></b><span><?= h($ar['x']) ?></span></div><?php endforeach; ?>
    </div>
    <h3 style="margin-top:56px">Read the docs</h3>
    <ul class="linklist" style="max-width:36rem">
      <?php foreach ($pl['docs'] as $d): ?><li><a href="<?= h($wiki($d['page'])) ?>"><?= h($d['t']) ?></a></li><?php endforeach; ?>
    </ul>
  </section>
  <?php endif; ?>

  <?php if (!$isFlag && ($p['steps'] ?? [])): ?>
  <section>
    <h2>Up and running in three steps</h2>
    <div class="steps">
      <?php foreach ($p['steps'] as $step): ?><div class="step"><p><?= h($step) ?></p></div><?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>

  <?php if (!empty($p['gallery'])): ?>
  <section>
    <h2>See it in action</h2>
    <div class="gallery" tabindex="0" aria-label="Screenshots">
      <?php foreach ($p['gallery'] as $g): ?>
        <figure><img src="<?= h($g['url']) ?>" alt="<?= h($g['caption']) ?>" loading="lazy"><figcaption><?= h($g['caption']) ?></figcaption></figure>
      <?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>

  <?php if ($isApp): ?>
  <section id="install">
    <h2>Download and install</h2>
    <div class="install">
      <div>
        <?php if (!empty($p['downloads'])): ?>
          <p class="muted" style="margin-top:0">Version <?= h((string)($p['appVersion'] ?? '')) ?>. Pick your system, then follow the first-launch steps.</p>
          <div class="actions" style="margin:0">
            <?php foreach ($p['downloads'] as $i => $d): ?>
              <a class="btn<?= $i ? ' ghost' : '' ?>" href="<?= h($d['url']) ?>"><?= h($d['label']) ?></a>
            <?php endforeach; ?>
          </div>
          <?php foreach ($p['downloads'] as $d): if (!empty($d['note'])): ?>
            <p class="muted" style="margin:12px 0 0;font-size:.98rem"><strong><?= h($d['os']) ?>:</strong> <?= h($d['note']) ?></p>
          <?php endif; endforeach; ?>
          <p class="muted" style="margin:12px 0 0;font-size:.98rem"><a href="<?= h($p['download']) ?>">All releases</a></p>
        <?php else: ?>
        <p class="muted" style="margin-top:0">Download the .dmg for macOS or the installer for Windows from the latest release, then follow the first-launch steps.</p>
        <div class="actions" style="margin:0"><a class="btn" href="<?= h($p['download']) ?>">Go to downloads</a></div>
        <?php endif; ?>
        <?php if (!empty($p['needs'])): ?>
          <h3 style="margin-top:24px">What you need</h3>
          <ul style="margin:6px 0 0;padding-left:1.2rem" class="muted">
            <?php foreach ($p['needs'] as $n): ?><li><?= h($n) ?></li><?php endforeach; ?>
          </ul>
        <?php endif; ?>
        <?php if (!empty($p['firstLaunch'])): ?>
          <h3 style="margin-top:24px">First launch</h3>
          <p class="muted" style="margin:6px 0 0">The builds are not code-signed, so each system shows a one-time warning.</p>
          <ul style="margin:6px 0 0;padding-left:1.2rem" class="muted">
            <?php foreach ($p['firstLaunch'] as $n): ?><li><?= h($n) ?></li><?php endforeach; ?>
          </ul>
        <?php endif; ?>
      </div>
      <div>
        <?php if (!empty($p['docs'])): ?>
          <h3>Learn more</h3>
          <ul class="linklist">
            <?php foreach ($p['docs'] as $d): ?><li><a href="<?= h($wiki($d['page'])) ?>"><?= h($d['title']) ?></a></li><?php endforeach; ?>
            <li><a href="<?= h($p['wiki']) ?>">All documentation</a></li>
          </ul>
        <?php endif; ?>
      </div>
    </div>
    <?php if (!empty($p['note'])): ?><div class="note"><?= h($p['note']) ?></div><?php endif; ?>
  </section>
  <?php endif; ?>

  <?php if (!$isFlag && !$isApp): ?>
  <section id="install">
    <h2>Install in Foundry</h2>
    <div class="install">
      <div>
        <p class="muted" style="margin-top:0">In Foundry, open Add-on Modules, choose Install Module, paste the manifest URL below, then enable the module in your world.</p>
        <?php if ($manifest): ?>
          <div class="copyrow">
            <input readonly value="<?= h($manifest) ?>" id="manifest" aria-label="Manifest URL">
            <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('manifest').value);this.textContent='Copied'">Copy</button>
          </div>
        <?php endif; ?>
        <?php if (!empty($p['needs'])): ?>
          <h3 style="margin-top:24px">What you need</h3>
          <ul style="margin:6px 0 0;padding-left:1.2rem" class="muted">
            <?php foreach ($p['needs'] as $n): ?><li><?= h($n) ?></li><?php endforeach; ?>
          </ul>
        <?php endif; ?>
      </div>
      <div>
        <?php if (!empty($p['docs'])): ?>
          <h3>Learn more</h3>
          <ul class="linklist">
            <?php foreach ($p['docs'] as $d): ?><li><a href="<?= h($wiki($d['page'])) ?>"><?= h($d['title']) ?></a></li><?php endforeach; ?>
            <li><a href="<?= h($p['wiki']) ?>">All documentation</a></li>
          </ul>
        <?php endif; ?>
      </div>
    </div>
    <div class="note">
      <?php if (($p['status'] ?? '') === 'early'): ?><strong>New and still settling in.</strong> Expect rough edges, and tell me what you find. <?php endif; ?>
      Free for now; some features may later be limited to <a href="<?= h(site()['links']['patreon']) ?>">Patreon</a> supporters. A personal project, so back up your world first.
    </div>
  </section>
  <?php endif; ?>
</div>

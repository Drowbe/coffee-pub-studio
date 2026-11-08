<?php
$s = site();
$flag = $products[$s['flagship']] ?? null;
$modules = array_filter($products, fn($p) => empty($p['flagship']) && empty($p['app']));
$featured = array_filter($modules, fn($p) => !empty($p['featured']));
?>
<div class="home-top"><div class="hero-bg" aria-hidden="true"></div>
<div class="wrap">
  <section class="hero">
    <div>
      <div class="eyebrow">Boutique design and development</div>
      <h1><?= h($s['tagline']) ?></h1>
      <p class="lead">I have solved hundreds of problems. Some of them grew into the products below.</p>
      <div class="actions">
        <a class="btn" href="#more">See what I have made</a>
        <a class="btn ghost" href="/about">About the studio</a>
      </div>
    </div>
    <?php include APP_DIR . "/templates/_hero_art.php"; ?>
  </section>
</div></div>

<div class="wrap" id="problems">
<section style="padding-top:24px">
  <div class="eyebrow">What I am good at</div>
  <h2>The kinds of problems I solve</h2>
  <p class="lead">Mapping, drawing, calls, collaboration, APIs and more. Here is where each one shows up in the work.</p>
  <div class="grid four">
    <?php foreach (capabilities() as $cap): ?>
      <div class="card cap">
        <div class="thumb"><img class="art" src="/assets/art/<?= h($cap['art']) ?>.svg" alt="" loading="lazy"></div>
        <div class="body">
          <h3><?= h($cap['title']) ?></h3>
          <p><?= h($cap['text']) ?></p>
          <div class="badges">
            <?php foreach ($cap['seen'] as $slug):
              if (isset($products[$slug])) { $label = $products[$slug]['short']; $href = '/products/' . $slug; }
              else { continue; } ?>
              <a class="badge" href="<?= h($href) ?>"><?= h($label) ?></a>
            <?php endforeach; ?>
          </div>
        </div>
      </div>
    <?php endforeach; ?>
  </div>
</section>
</div>

<div class="wrap" id="more">
<section style="padding-top:24px">
  <div class="eyebrow">The work</div>
  <h2>Two apps and <?= count($modules) ?> Foundry modules</h2>
  <p class="lead">A few of the things that grew out of that work.</p>
</section>
<?php if ($flag): ?>
<section id="chameleon">
  <div class="band">
    <div>
      <div class="eyebrow pm"><?= mark_img("chameleon", 56, "mk pmk") ?><span>Chameleon &middot; Coming soon</span></div>
      <h2>Plan the trip together</h2>
      <p class="lead"><?= h($flag['pitch']) ?></p>
      <ul class="ticks">
        <?php foreach (array_slice($flag['highlights'] ?? [], 1, 3) as $line): ?><li><?= h($line) ?></li><?php endforeach; ?>
      </ul>
      <div class="actions">
        <a class="btn" href="/products/chameleon"><?= h($flag["cta"] ?? "See Chameleon") ?></a>
        <a class="btn ghost" href="<?= h($flag['external']) ?>">See it in action</a>
      </div>
    </div>
    <a class="shot" href="/products/chameleon" aria-label="About Chameleon">
      <?php $only = 1; include APP_DIR . "/templates/_hero_art.php"; unset($only); ?>
    </a>
  </div>
</section>
<?php endif; ?>

<section id="showrunner">
  <div class="band">
    <div>
      <div class="eyebrow pm"><?= mark_img("showrunner", 56, "mk pmk") ?><span>For streamers</span></div>
      <h2>Feed OBS what it needs</h2>
      <p class="lead"><?= h($s['studioApp']['text']) ?></p>
      <ul class="ticks">
        <li>Wraps your game window and other web pages so OBS captures them cleanly, and keeps every source pointed and cropped after each launch.</li>
        <li>Publishes each player from a Chameleon table as their own OBS source.</li>
        <li>Lets Herald and other suite tools cue scene switches, text sources, session titles and recording start and stop in OBS.</li>
        <li>Optionally uploads the finished recording to your own YouTube channel.</li>
      </ul>
      <div class="actions"><a class="btn" href="/products/showrunner">See Showrunner</a>
        <a class="btn ghost" href="<?= h($s['studioApp']['url']) ?>">Download</a></div>
    </div>
    <div class="shot">
      <div class="frame art-frame" style="max-width:none"><div class="bar"><i></i><i></i><i></i></div>
        <img class="art wide" src="<?= h(art_for('Streaming')) ?>" alt=""></div>
    </div>
  </div>
</section>

<?php $bs = $products['blacksmith'] ?? null; if ($bs && !empty($bs['platform'])): $pl = $bs['platform']; ?>
<section id="platform">
  <div class="band">
    <div>
      <div class="eyebrow pm"><?= mark_img("gaming", 56, "mk pmk") ?><span>The platform</span></div>
      <h2>Blacksmith, the engine under the suite</h2>
      <p class="lead">One flagship module does the heavy lifting for the rest: hook management, sockets, windows, tools, shared data and design. Everything else is an experience built on top.</p>
      <div class="actions">
        <a class="btn" href="/products/blacksmith">See Blacksmith</a>
        <a class="btn ghost" href="<?= h($bs['wiki']) ?>/api-core">Read the API docs</a>
      </div>
    </div>
    <div class="stats">
      <?php foreach ($pl['stats'] as $st): ?><div class="stat"><b><?= h($st['n']) ?></b><span><?= h($st['l']) ?></span></div><?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<section id="modules">
  <div class="eyebrow pm"><?= mark_img("gaming", 56, "mk pmk") ?><span>For tabletop games</span></div>
  <h2>Run the game</h2>
  <p class="lead"><?= count($modules) ?> Foundry VTT modules that each solve dozens of small problems at the table, from a core toolbar to character and combat tools, journals, maps, audio and crafting. They share one look and one hub, Coffee Pub Blacksmith.</p>
  <div class="grid">
    <?php foreach ($featured as $p): include APP_DIR . '/templates/_card.php'; endforeach; ?>
  </div>
  <div class="actions"><a class="btn ghost" href="/products">See all <?= count($modules) ?> modules</a></div>
</section>

<section>
  <div class="band">
    <div>
      <div class="eyebrow">Free for now</div>
      <h2>Back the work on Patreon</h2>
      <p class="lead">Every module is free today. Some features may later be limited to supporters.</p>
    </div>
    <div class="actions" style="margin:0">
      <?php if (!empty($s['links']['patreon'])): ?><a class="btn" href="<?= h($s['links']['patreon']) ?>">Support on Patreon</a><?php endif; ?>
      <a class="btn ghost" href="/support">Get help</a>
    </div>
  </div>
</section>
</div>

<div class="wrap">
  <section style="padding-top:56px">
    <div class="eyebrow">Support</div>
    <h1>Need a hand?</h1>
    <p class="lead">Start with the module's documentation and its Known issues page. If that does not solve it, open an issue on GitHub. For anything else, <a href="/contact">contact us</a>.</p>

    <h2 style="margin-top:48px;font-size:1.5rem">Foundry modules</h2>
    <div class="cols">
      <?php foreach (products() as $p): if (!empty($p['flagship']) || !empty($p['app'])) continue; ?>
        <div class="panel" style="padding:18px 20px">
          <h3><?= h($p['short']) ?></h3>
          <a href="<?= h($p['wiki']) ?>">Documentation</a> &middot; <a href="<?= h($p['github']) ?>/issues">Report an issue</a>
        </div>
      <?php endforeach; ?>
    </div>

    <h2 style="margin-top:48px;font-size:1.5rem">Showrunner</h2>
    <p class="muted">Read the <a href="https://github.com/Drowbe/coffee-pub-showrunner/wiki">documentation</a> and its <a href="https://github.com/Drowbe/coffee-pub-showrunner/wiki/known-issues">Known issues</a>, or <a href="https://github.com/Drowbe/coffee-pub-showrunner/issues">report an issue</a>.</p>

    <h2 style="margin-top:48px;font-size:1.5rem">Chameleon</h2>
    <p class="muted">Account and environment questions are handled on <a href="https://chameleon.coffeepubstudio.com/">chameleon.coffeepubstudio.com</a>. For anything else, use the <a href="/contact">contact page</a>.</p>

    <h2 style="margin-top:48px;font-size:1.5rem">Anything else</h2>
    <p class="muted">A question, an idea, or a project you want to talk about? <a href="/contact">Send us a message</a> and we will reply by email.</p>
    <div class="actions"><a class="btn" href="/contact">Contact us</a></div>

    <div class="band" style="margin-top:48px">
      <div>
        <h2 style="font-size:1.6rem">Help us keep building</h2>
        <p class="lead">You can support the work on Patreon.</p>
      </div>
      <div class="actions" style="margin:0"><a class="btn" href="<?= h(site()['links']['patreon']) ?>">Support on Patreon</a></div>
    </div>
  </section>
</div>

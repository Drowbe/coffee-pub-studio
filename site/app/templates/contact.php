<?php $old = $old ?? []; $errors = $errors ?? []; ?>
<div class="wrap">
  <section style="padding-top:56px">
    <div class="eyebrow">Contact</div>
    <h1>Say hello</h1>
    <p class="lead">Tell me what you are working on or what is not working. I read every message.</p>

    <?php if (!empty($sent)): ?>
      <div class="panel" role="status" style="margin-top:40px;max-width:40rem">
        <h3>Message sent</h3>
        <p style="margin:0">Thank you. I will reply by email.</p>
      </div>
    <?php else: ?>
      <form class="form" method="post" action="/contact" style="margin-top:40px" novalidate>
        <?php if ($errors): ?>
          <div class="alert" role="alert">
            <strong>Please fix this:</strong>
            <ul><?php foreach ($errors as $e): ?><li><?= h($e) ?></li><?php endforeach; ?></ul>
          </div>
        <?php endif; ?>
        <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
        <input type="hidden" name="ft" value="<?= h($ft) ?>">
        <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>

        <div class="field">
          <label for="name">Your name</label>
          <input id="name" name="name" type="text" maxlength="100" autocomplete="name" required value="<?= h($old['name'] ?? '') ?>">
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" maxlength="190" autocomplete="email" required value="<?= h($old['email'] ?? '') ?>">
        </div>
        <div class="field">
          <label for="topic">What is it about?</label>
          <select id="topic" name="topic" required>
            <option value="">Choose one</option>
            <?php foreach (CONTACT_TOPICS as $t): ?>
              <option value="<?= h($t) ?>"<?= ($old['topic'] ?? '') === $t ? ' selected' : '' ?>><?= h($t) ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="field">
          <label for="message">Message</label>
          <textarea id="message" name="message" rows="7" maxlength="4000" required><?= h($old['message'] ?? '') ?></textarea>
        </div>
        <button class="btn" type="submit">Send message</button>
        <p class="muted" style="font-size:.92rem;margin:18px 0 0">For module bugs, a <a href="/support">GitHub issue</a> is the fastest way to get help.</p>
      </form>
    <?php endif; ?>
  </section>
</div>

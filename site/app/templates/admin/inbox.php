<div class="wrap">
  <section style="padding-top:56px">
    <div class="eyebrow">Admin</div>
    <div class="admin-head">
      <h1 style="margin:0">Inbox</h1>
      <form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><button class="btn ghost" type="submit">Sign out</button></form>
    </div>
    <p class="muted" style="margin:12px 0 24px"><?= (int)$unread ?> unread of <?= (int)$total ?> messages &middot;
      <a href="/admin"<?= $filter === 'all' ? ' aria-current="true"' : '' ?>>All</a> &middot;
      <a href="/admin?show=unread"<?= $filter === 'unread' ? ' aria-current="true"' : '' ?>>Unread</a> &middot;
      <a href="/admin/mail">Email alerts<?= mail_enabled() ? ' (on)' : '' ?></a></p>

    <?php if (!$rows): ?>
      <div class="panel"><p style="margin:0">No messages yet.</p></div>
    <?php else: ?>
      <ul class="inbox">
        <?php foreach ($rows as $r): ?>
          <li class="<?= $r['is_read'] ? '' : 'unread' ?>">
            <a href="/admin/message?id=<?= (int)$r['id'] ?>">
              <span class="who"><?= h($r['name']) ?></span>
              <span class="topic"><?= h($r['topic']) ?></span>
              <span class="prev"><?= h($r['preview']) ?></span>
              <time><?= h(date('M j, g:i a', (int)$r['created_at'])) ?></time>
            </a>
          </li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </section>
</div>

<div class="wrap">
  <section style="padding-top:56px;max-width:48rem">
    <div class="crumbs" style="padding:0 0 16px"><a href="/admin">Inbox</a> / Message</div>
    <h1 style="font-size:2rem"><?= h($m['topic']) ?></h1>
    <p class="muted" style="margin:8px 0 28px">From <strong><?= h($m['name']) ?></strong> &lt;<a href="mailto:<?= h($m['email']) ?>"><?= h($m['email']) ?></a>&gt; &middot; <?= h(date('F j, Y, g:i a', (int)$m['created_at'])) ?></p>
    <div class="panel"><p style="margin:0;color:var(--text);white-space:pre-wrap;word-break:break-word"><?= h($m['message']) ?></p></div>
    <div class="actions">
      <a class="btn" href="mailto:<?= h($m['email']) ?>?subject=<?= h(rawurlencode('Re: ' . $m['topic'])) ?>">Reply by email</a>
      <form method="post" action="/admin/action" style="display:inline">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="id" value="<?= (int)$m['id'] ?>">
        <button class="btn ghost" name="do" value="unread" type="submit">Mark unread</button>
      </form>
      <form method="post" action="/admin/action" style="display:inline" onsubmit="return confirm('Delete this message for good?')">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>"><input type="hidden" name="id" value="<?= (int)$m['id'] ?>">
        <button class="btn ghost" name="do" value="delete" type="submit">Delete</button>
      </form>
    </div>
  </section>
</div>

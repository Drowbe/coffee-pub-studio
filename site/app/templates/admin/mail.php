<div class="wrap">
  <section style="padding-top:56px">
    <div class="eyebrow">Admin</div>
    <div class="admin-head"><h1 style="margin:0">Email alerts</h1><a class="btn ghost" href="/admin">Back to inbox</a></div>
    <p class="lead" style="margin-top:12px">Optional. When someone sends a message, the site can email you through your Gmail account. Messages always land in the inbox either way.</p>
    <?php if (!empty($notice)): ?><div class="alert" role="status" style="max-width:34rem;margin-top:16px"><?= h($notice) ?></div><?php endif; ?>
    <p class="muted">Status: <b><?= $enabled ? 'On' : 'Off' ?></b></p>
    <form class="form" method="post" action="/admin/mail" style="margin-top:20px;max-width:30rem">
      <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
      <div class="field"><label for="user">Gmail address that sends</label><input id="user" name="user" type="email" value="<?= h($cfg['user'] ?? '') ?>" autocomplete="off" required></div>
      <div class="field"><label for="pass">Gmail app password</label><input id="pass" name="pass" type="password" autocomplete="new-password" placeholder="<?= $enabled ? 'Saved. Leave blank to keep it.' : '16 letters, spaces are fine' ?>"<?= $enabled ? '' : ' required' ?>></div>
      <div class="field"><label for="to">Send alerts to</label><input id="to" name="to" type="email" value="<?= h($cfg['to'] ?? ($cfg['user'] ?? '')) ?>" autocomplete="off" required></div>
      <div class="actions"><button class="btn" type="submit" name="do" value="save">Save and send a test</button>
      <?php if ($enabled): ?><button class="btn ghost" type="submit" name="do" value="off" formnovalidate>Turn off</button><?php endif; ?></div>
    </form>
    <p class="muted" style="margin-top:24px;max-width:34rem">The app password is a separate password Google makes for apps (Google Account, Security, 2-Step Verification, App passwords). It is stored on the server only, never in the code.</p>
  </section>
</div>

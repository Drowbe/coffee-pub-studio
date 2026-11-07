<div class="wrap">
  <section style="padding-top:56px">
    <div class="eyebrow">Admin</div>
    <h1>Sign in</h1>
    <?php if (!$configured): ?>
      <div class="alert" role="alert" style="max-width:34rem">The admin login has not been set up yet. Run the setup tool described in the deployment notes.</div>
    <?php else: ?>
      <form class="form" method="post" action="/admin/login" style="margin-top:32px;max-width:28rem">
        <?php if (!empty($error)): ?><div class="alert" role="alert"><?= h($error) ?></div><?php endif; ?>
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
        <div class="field"><label for="user">Username</label><input id="user" name="user" type="text" autocomplete="username" required></div>
        <div class="field"><label for="pass">Password</label><input id="pass" name="pass" type="password" autocomplete="current-password" required></div>
        <button class="btn" type="submit">Sign in</button>
      </form>
    <?php endif; ?>
  </section>
</div>

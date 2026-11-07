<?php
declare(strict_types=1);

const ADMIN_IDLE_SECONDS = 7200;
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW = 900;

function admin_configured(): bool
{
    $s = read_secrets();
    return !empty($s['admin_user']) && !empty($s['admin_hash']);
}

function admin_logged_in(): bool
{
    start_session();
    if (empty($_SESSION['admin']) || empty($_SESSION['admin_seen'])) {
        return false;
    }
    if (time() - (int)$_SESSION['admin_seen'] > ADMIN_IDLE_SECONDS) {
        unset($_SESSION['admin'], $_SESSION['admin_seen']);
        return false;
    }
    $_SESSION['admin_seen'] = time();
    return true;
}

function login_blocked(): bool
{
    $st = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip_hash = ? AND ts > ?');
    $st->execute([ip_hash(), time() - LOGIN_WINDOW]);
    return (int)$st->fetchColumn() >= LOGIN_MAX_FAILS;
}

/** Returns an error message, or null on success. */
function admin_login(string $user, string $pass): ?string
{
    if (!admin_configured()) {
        return 'The admin login has not been set up yet.';
    }
    if (login_blocked()) {
        return 'Too many attempts. Try again in a few minutes.';
    }
    $s = read_secrets();
    $dummy = '$2y$10$usesomesillystringforsaltuQ3qXnKZ3m9XkYb8h1sGJ3S4gQe0yq5W';
    $userOk = hash_equals((string)$s['admin_user'], $user);
    $passOk = password_verify($pass, $userOk ? (string)$s['admin_hash'] : $dummy);
    if ($userOk && $passOk) {
        db()->prepare('DELETE FROM login_attempts WHERE ip_hash = ?')->execute([ip_hash()]);
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['admin_seen'] = time();
        return null;
    }
    db()->prepare('INSERT INTO login_attempts (ip_hash, ts) VALUES (?, ?)')->execute([ip_hash(), time()]);
    return 'That username or password is not right.';
}

function admin_redirect(string $to): never
{
    header('Location: ' . $to, true, 303);
    exit;
}

function admin_route(string $path): void
{
    no_cache_headers();
    start_session();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $base = ['noindex' => true];

    if ($path === '/admin/login' && $method === 'POST') {
        if (!csrf_ok($_POST['csrf'] ?? null)) {
            page('admin/login', $base + ['title' => 'Admin', 'error' => 'Your session expired. Reload and try again.', 'configured' => admin_configured()]);
            return;
        }
        $err = admin_login(trim((string)($_POST['user'] ?? '')), (string)($_POST['pass'] ?? ''));
        if ($err === null) {
            admin_redirect('/admin');
        }
        page('admin/login', $base + ['title' => 'Admin', 'error' => $err, 'configured' => admin_configured()], 401);
        return;
    }

    if ($path === '/admin/logout' && $method === 'POST') {
        if (csrf_ok($_POST['csrf'] ?? null)) {
            $_SESSION = [];
            session_destroy();
        }
        admin_redirect('/admin');
    }

    if (!admin_logged_in()) {
        page('admin/login', $base + ['title' => 'Admin', 'error' => null, 'configured' => admin_configured()], $path === '/admin' ? 200 : 401);
        return;
    }

    $pdo = db();

    if ($path === '/admin/action' && $method === 'POST') {
        if (csrf_ok($_POST['csrf'] ?? null)) {
            $id = (int)($_POST['id'] ?? 0);
            $do = (string)($_POST['do'] ?? '');
            if ($do === 'delete') {
                $pdo->prepare('DELETE FROM messages WHERE id = ?')->execute([$id]);
                admin_redirect('/admin');
            }
            if ($do === 'read' || $do === 'unread') {
                $pdo->prepare('UPDATE messages SET is_read = ? WHERE id = ?')->execute([$do === 'read' ? 1 : 0, $id]);
                admin_redirect($do === 'unread' ? '/admin' : '/admin/message?id=' . $id);
            }
        }
        admin_redirect('/admin');
    }

    if ($path === '/admin/message') {
        $id = (int)($_GET['id'] ?? 0);
        $st = $pdo->prepare('SELECT * FROM messages WHERE id = ?');
        $st->execute([$id]);
        $m = $st->fetch();
        if (!$m) {
            admin_redirect('/admin');
        }
        if (!(int)$m['is_read']) {
            $pdo->prepare('UPDATE messages SET is_read = 1 WHERE id = ?')->execute([$id]);
            $m['is_read'] = 1;
        }
        page('admin/message', $base + ['title' => 'Message', 'm' => $m]);
        return;
    }

    $filter = ($_GET['show'] ?? '') === 'unread' ? 'unread' : 'all';
    $sql = 'SELECT id, created_at, name, email, topic, substr(message, 1, 140) AS preview, is_read FROM messages'
        . ($filter === 'unread' ? ' WHERE is_read = 0' : '') . ' ORDER BY created_at DESC, id DESC LIMIT 200';
    $rows = $pdo->query($sql)->fetchAll();
    $unread = (int)$pdo->query('SELECT COUNT(*) FROM messages WHERE is_read = 0')->fetchColumn();
    $total = (int)$pdo->query('SELECT COUNT(*) FROM messages')->fetchColumn();
    page('admin/inbox', $base + ['title' => 'Inbox', 'rows' => $rows, 'unread' => $unread, 'total' => $total, 'filter' => $filter]);
}

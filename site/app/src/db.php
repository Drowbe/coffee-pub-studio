<?php
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    if (!is_dir(DATA_DIR)) {
        @mkdir(DATA_DIR, 0775, true);
    }
    $pdo = new PDO('sqlite:' . DATA_DIR . '/coffeepub.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA busy_timeout = 3000');
    $pdo->exec('CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        topic TEXT NOT NULL,
        message TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_messages_ip ON messages (ip_hash, created_at)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_hash TEXT NOT NULL,
        ts INTEGER NOT NULL
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts (ip_hash, ts)');
    return $pdo;
}

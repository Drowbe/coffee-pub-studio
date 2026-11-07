<?php
declare(strict_types=1);

const CONTACT_TOPICS = [
    'Foundry module support',
    'Chameleon',
    'Showrunner',
    'A design or development project',
    'Something else',
];

/**
 * Validates and stores a contact message.
 * Returns ['ok' => bool, 'errors' => string[], 'old' => array].
 */
function handle_contact_post(): array
{
    $old = [
        'name' => trim((string)($_POST['name'] ?? '')),
        'email' => trim((string)($_POST['email'] ?? '')),
        'topic' => (string)($_POST['topic'] ?? ''),
        'message' => trim((string)($_POST['message'] ?? '')),
    ];
    $fail = fn(string ...$e) => ['ok' => false, 'errors' => $e, 'old' => $old];

    if (!csrf_ok($_POST['csrf'] ?? null)) {
        return $fail('Your session expired. Please reload the page and try again.');
    }
    // Honeypot: a real visitor never sees this field. Pretend it worked.
    if (trim((string)($_POST['website'] ?? '')) !== '') {
        return ['ok' => true, 'errors' => [], 'old' => []];
    }
    $age = form_token_age($_POST['ft'] ?? null);
    if ($age === null || $age > 6 * 3600) {
        return $fail('That form is out of date. Please reload the page and try again.');
    }
    if ($age < 4) {
        return $fail('That was quick. Give it a few seconds and send again.');
    }

    $errors = [];
    $len = fn(string $s) => mb_strlen($s);
    if ($len($old['name']) < 1 || $len($old['name']) > 100) {
        $errors[] = 'Enter your name (up to 100 characters).';
    }
    if ($len($old['email']) > 190 || !filter_var($old['email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Enter a valid email address so I can reply.';
    }
    if (!in_array($old['topic'], CONTACT_TOPICS, true)) {
        $errors[] = 'Pick what your message is about.';
    }
    if ($len($old['message']) < 10 || $len($old['message']) > 4000) {
        $errors[] = 'Write a message between 10 and 4,000 characters.';
    }
    if ($errors) {
        return ['ok' => false, 'errors' => $errors, 'old' => $old];
    }

    $pdo = db();
    $ip = ip_hash();
    $hour = (int)$pdo->query("SELECT COUNT(*) FROM messages WHERE ip_hash = " . $pdo->quote($ip) . " AND created_at > " . (time() - 3600))->fetchColumn();
    $day = (int)$pdo->query("SELECT COUNT(*) FROM messages WHERE ip_hash = " . $pdo->quote($ip) . " AND created_at > " . (time() - 86400))->fetchColumn();
    if ($hour >= 3 || $day >= 10) {
        return $fail('You have sent a few messages already. Please try again later.');
    }

    $st = $pdo->prepare('INSERT INTO messages (created_at, name, email, topic, message, ip_hash) VALUES (?, ?, ?, ?, ?, ?)');
    $st->execute([time(), $old['name'], $old['email'], $old['topic'], $old['message'], $ip]);
    return ['ok' => true, 'errors' => [], 'old' => []];
}

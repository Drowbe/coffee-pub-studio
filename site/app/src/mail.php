<?php
declare(strict_types=1);

/** Optional email alerts through the studio's own Gmail account. Off until set up at /admin/mail. */

function mail_file(): string { return DATA_DIR . '/mail.json'; }

function mail_config(): array
{
    $f = mail_file();
    $c = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    return is_array($c) ? $c : [];
}

function mail_enabled(): bool
{
    $c = mail_config();
    return !empty($c['user']) && !empty($c['pass']) && !empty($c['to']);
}

function mail_save(array $c): void
{
    if (!is_dir(DATA_DIR)) { @mkdir(DATA_DIR, 0700, true); }
    file_put_contents(mail_file(), json_encode($c), LOCK_EX);
    @chmod(mail_file(), 0600);
}

/** Sends one plain-text email through smtp.gmail.com (SSL, port 465). Returns null on success, else an error. */
function smtp_send(string $user, string $pass, string $to, string $subject, string $body, ?string $replyTo = null): ?string
{
    $errno = 0; $errstr = '';
    $fp = @stream_socket_client('ssl://smtp.gmail.com:465', $errno, $errstr, 8);
    if (!$fp) { return 'Could not reach Gmail (' . $errstr . ').'; }
    stream_set_timeout($fp, 8);
    $read = function () use ($fp): string {
        $out = '';
        while (($line = fgets($fp, 515)) !== false) { $out .= $line; if (strlen($line) < 4 || $line[3] === ' ') break; }
        return $out;
    };
    $cmd = function (string $c, string $ok) use ($fp, $read): ?string {
        fwrite($fp, $c . "\r\n");
        $r = $read();
        return str_starts_with($r, $ok) ? null : trim($r);
    };
    $read();
    $err = $cmd('EHLO coffeepubstudio.com', '250')
        ?? $cmd('AUTH LOGIN', '334')
        ?? $cmd(base64_encode($user), '334')
        ?? $cmd(base64_encode($pass), '235');
    if ($err !== null) { fclose($fp); return str_contains($err, '535') ? 'Gmail did not accept that address and app password.' : $err; }
    $err = $cmd('MAIL FROM:<' . $user . '>', '250') ?? $cmd('RCPT TO:<' . $to . '>', '250') ?? $cmd('DATA', '354');
    if ($err !== null) { fclose($fp); return $err; }
    $clean = fn(string $s) => trim(str_replace(["\r", "\n"], ' ', $s));
    $headers = [
        'From: Coffee Pub Studio <' . $user . '>',
        'To: <' . $to . '>',
        'Subject: =?UTF-8?B?' . base64_encode($clean($subject)) . '?=',
        'Date: ' . date('r'),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ];
    if ($replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) { $headers[] = 'Reply-To: <' . $replyTo . '>'; }
    $data = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($body));
    fwrite($fp, $data . "\r\n.\r\n");
    $r = $read();
    $cmd('QUIT', '221');
    fclose($fp);
    return str_starts_with($r, '250') ? null : trim($r);
}

/** Emails the admin about a new contact message. Never throws, never blocks the visitor for long. */
function notify_new_message(array $m): void
{
    if (!mail_enabled()) { return; }
    try {
        $c = mail_config();
        $body = "New message on coffeepubstudio.com\n\nFrom: {$m['name']} <{$m['email']}>\nAbout: {$m['topic']}\n\n{$m['message']}\n\nOpen the inbox: " . rtrim(site()['url'], '/') . "/admin\n";
        smtp_send((string)$c['user'], (string)$c['pass'], (string)$c['to'], 'New message: ' . $m['topic'] . ' from ' . $m['name'], $body, $m['email']);
    } catch (Throwable $e) {
        // The message is already saved in the inbox, so a failed email is not an error for the visitor.
    }
}

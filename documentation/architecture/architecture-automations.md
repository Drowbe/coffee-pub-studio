# Automations Architecture

**Audience:** developers changing Coffee Pub Studio's Automations feature.

How the Automations HTTPS server is built and why. What it lets a caller do is
[api-automations](../api/api-automations.md); this document is everything you can only learn by
reading the code.

## Why a server, not a client

Every other integration Studio has is the other way around: Studio is the client polling
Coffee Pub Tavern's HTTP API, and OBS's WebSocket connection is loopback-only because OBS and
Studio share a Mac. Foundry, running Coffee Pub Herald, is typically on a different machine on the
same LAN. For a Foundry module to reach Studio at all, something has to be listening, and Foundry
cannot be that thing -- so `AutomationsServer` (`src/automations.js:47`) runs its own HTTPS server,
bound to every network interface rather than only localhost.

## Why a local Certificate Authority, not a single self-signed certificate

The first working version served a single self-signed certificate directly. That has a real cost:
a browser's trust exception for a self-signed certificate is tied to that exact certificate, so it
had to be re-established by hand in every browser, and again whenever the certificate was
regenerated because the Mac's LAN address changed -- confirmed live during cross-machine testing,
where a certificate regenerated mid-session broke a trust exception established minutes earlier.

`ensureCert` (`src/automations.js:280`) instead generates a CA once (`generateCa`, line 322) and
signs the server's actual certificate with it (`generateLeafCert`, line 353), both via the
`openssl` CLI every Mac already has -- no dependency added. `certIssuedBy` (line 309) detects a
leaf that is not signed by the current CA (including a leftover self-signed leaf from before this
design existed) and regenerates it. The CA's certificate, not the leaf, is what a device installs
once; every leaf that CA ever signs is trusted after that, including one regenerated later.

## Trusting Studio's own windows automatically

If the calling code runs inside one of Studio's own windows -- Coffee Pub Herald's "cameraman"
client, if that is the Stream window rather than a separate browser -- there is no page navigation
for a certificate warning to attach to; a `fetch()` call failing on a certificate error has no
"proceed anyway" link at all. `app.on('certificate-error')` (`src/main.js:2108`) handles this:
Electron fires that event for every webContents request, navigation or not, so Studio can
recognize and vouch for its own certificate there. `trustsOwnAutomationsCert`
(`src/main.js:546`) compares actual certificate bytes (`X509Certificate.raw`), not the
certificate's fingerprint string (whose exact format Electron does not document precisely enough
to trust a string match), and only while the Automations server that certificate belongs to is
actually the one running. Every other certificate error -- Tavern, a real Foundry HTTPS
connection, anything else -- still gets Electron's normal validation.

## CORS

A browser sends a preflight `OPTIONS` request before a `fetch()` call carrying a JSON body and an
`Authorization` header, both "non-simple" by CORS's own rules -- exactly the shape of a Foundry
module's call. `handle` (`src/automations.js:136`) answers `OPTIONS` with the needed
`Access-Control-Allow-*` headers before the auth check, since a preflight carries no credentials
of its own to check.

## Rule dispatch

`recordEvent` (`src/automations.js:236`) is shared by a real incoming `POST` and the control
panel's own "send test event" button, so a manual test exercises the same path a real call would.
It emits an `event`; `syncAutomationsServer` (`src/main.js:525`) wires that to
`runAutomationRules` (`src/main.js:510`), which matches every rule whose `event` field equals the
incoming one and runs each through `runAutomationAction` (`src/main.js:482`) -- one rule failing
does not stop the others. All seven actions reuse the OBS WebSocket connection Studio already
maintains; there is no separate connection for Automations.

## Token and event log

The token is read fresh on every request (`getToken`, passed into `start`) rather than captured
once, so rotating it in settings takes effect without restarting the server. Comparison is
timing-safe (`timingSafeEqualStr`). The last 50 received events are kept in memory
(`EVENT_LOG_LIMIT`) for the control panel's own log; nothing is persisted to disk beyond the
certificate files and the configured rules.

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
"proceed anyway" link at all. `app.on('certificate-error')` (`src/main.js:2202`) handles this:
Electron fires that event for every webContents request, navigation or not, so Studio can
recognize and vouch for its own certificate there. `trustsOwnAutomationsCert`
(`src/main.js:629`) compares actual certificate bytes (`X509Certificate.raw`), not the
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

## Rule sets and dispatch

`recordEvent` (`src/automations.js:236`) is shared by a real incoming `POST` and the control
panel's own "send test event" button, so a manual test exercises the same path a real call would.
It emits an `event`; `syncAutomationsServer` (`src/main.js:607`) wires that to
`runAutomationRuleSets` (`src/main.js:595`), which matches every *enabled* rule set whose `event`
field equals the incoming one and starts each one's sequence (`runRuleSet`, `src/main.js:574`)
independently -- one rule set's sequence does not wait for another's, and nothing tracks or
cancels a rule set that is still mid-sequence when it matches again.

A rule set's steps are grouped into stages before running (`stagesFor`, `src/main.js:549`): a
plain step, or any delay step, starts a new stage; a step marked `and` joins the stage before it
instead of starting its own, but only if that stage is itself an action stage -- a delay step
always starts a fresh stage, since there is nothing for a following `and` step to run alongside.
`runRuleSet` then walks the stages in order: a delay stage is a plain `setTimeout`-based wait
(`sleep`, next to `stagesFor`) and nothing more -- OBS's WebSocket API has no "this scene change
is done" event to wait on instead, so every delay is Studio's own clock, not a confirmation from
OBS; an action stage runs every step in it at once (`Promise.all`), each going through
`runAutomationAction` (`src/main.js:488`). One step failing does not stop the rest of its stage or
the stages after it. `src/control/control.js`'s `stageNumbers` reimplements the same grouping
logic (deliberately kept in lockstep with `stagesFor`, verified to agree via a standalone script
during development) purely to compute the numbers shown next to each step -- it does not affect
execution.

`runAutomationAction`'s switch covers two families: OBS actions (`sceneSwitch`, `sourceShow`,
`sourceHide`, `sourceToggle`, `setText`, and the recording/streaming controls) all require
`obs.connected` and reuse the OBS WebSocket connection Studio already maintains elsewhere; Studio
actions (`wakeAudio`, `startAll`, `stopAll`, `dockAll`, `undockAll`, `syncObs`,
`incrementEpisode`, `applyEpisodeText`, `applySessionFilename`) reach into Studio's own state
instead and need no OBS connection at all, except `syncObs`/`applyEpisodeText`/
`applySessionFilename`. Which Studio actions are even reachable is gated by
`automations.studioActions` (config.js) -- off by default, since they reach further than an OBS
action does -- and `syncAutomationsServer` folds only the currently-enabled ones into the
`actions` list `GET /api/automations/capabilities` returns.

## Event data reaching a step: setText and the session templates

Every other action's `param` is fixed at edit time (a scene name, a source name) -- `setText`
needs an actual value nobody types into a step, since the whole point is Herald (or whoever)
supplying it per event. `runAutomationAction` (`src/main.js:512`) takes two more arguments beyond
`action`/`param` for exactly this: `eventData` (whatever triggered the run -- `entry.data` from a
real `POST /event`, whatever a direct `POST /action` call supplied in its own `data`, or
`undefined` for a manual "Time it" run, which has no real trigger) and `dataField` (only read by
`setText`, naming which key of `eventData` to write, defaulting to `"text"`). Threading this
through cost three call sites: `runAutomationRuleSets` (`src/main.js:643`) passes `entry.data`
into `runRuleSet` (`src/main.js:622`), which passes it and each step's own `dataField` into every
`runAutomationAction` call; the "Time it" IPC handler and the `/action` route's `runAction` wiring
both just supply whatever they actually have (`undefined`, or the caller-provided `data`).

`formatSessionTemplate` (`src/main.js:490`) is the other consumer: `applyEpisodeText` and
`applySessionFilename` both call it to substitute `{season}`/`{episode}` (from `session.season`/
`.episode`, read fresh from `configStore` and zero-padded) and `{title}`/`{campaign}` (from
`eventData`, blank if absent) into a user-configured template, leaving anything else in the string
-- OBS's own `%CCYY`-style recording macros, in `applySessionFilename`'s case -- untouched. Both
were verified against the real OBS instance this was built against: reading the actual live
`FilenameFormatting` value and the actual live text-source settings before writing anything,
confirming `SetProfileParameter`/`SetInputSettings` were the right calls before committing to the
design, not assumed from the protocol docs alone.

## Migrating an older config

A config saved before rule sets existed has the old flat shape: `automations.rules`, an array of
`{id, event, action, param}` with exactly one action per event and no concept of a sequence.
`sanitizeAutomations` (`src/config.js`) migrates each old rule into an equivalent one-step rule set
the first time it runs against such a config, rather than silently discarding real configured
automations -- `ruleSets` wins if a config somehow has both keys. This only ever reads the old
shape; nothing writes it again once migrated.

## Token and event log

The token is read fresh on every request (`getToken`, passed into `start`) rather than captured
once, so rotating it in settings takes effect without restarting the server. Comparison is
timing-safe (`timingSafeEqualStr`). The last 50 received events are kept in memory
(`EVENT_LOG_LIMIT`) for the control panel's own log; nothing is persisted to disk beyond the
certificate files and the configured rule sets.

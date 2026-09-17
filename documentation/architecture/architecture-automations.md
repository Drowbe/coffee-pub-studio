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

## Where setText's value actually comes from

Every other action's `param` is fixed at edit time (a scene name, a source name) -- `setText`
needs an actual value nobody necessarily types into a step at all, and there are three genuinely
different sources for it, not one: a fixed value typed once (no external caller involved), a
local file Studio re-reads on every run, or a key read from whatever triggered this. Conflating
these into one free-text field was tried first and rejected live: it made a user type a literal
test value into a box that was actually a lookup key, and testing it sent no data at all to look
the key up against regardless, so every test wrote blank text no matter what was typed -- both
confirmed by reproducing them against the real app before redesigning.

`resolveTextValue` (`src/main.js:517`) is the single place that decides: given `stepContext` (a
rule-set step, or `undefined` for a direct `POST /action` call or a "Time it" run with no step to
consult) and `eventData` (whatever triggered this -- `entry.data` from a real `POST /event`, a
direct call's own `data`, or `undefined`), it returns `stepContext.value` for `"literal"`, reads
`stepContext.filePath` off disk for `"file"`, or indexes `eventData[stepContext.dataField]` for
`"dataField"` -- falling back to the original `eventData.text` convention when there's no
`stepContext` at all, since a direct caller already fully controls what it sends. Getting the
whole step (not just a resolved value) to `runAutomationAction` (`src/main.js:546`) cost the same
three call sites as before: `runAutomationRuleSets` (`src/main.js:675`) passes `entry.data` into
`runRuleSet` (`src/main.js:654`), which now passes the step object itself (not just its
`dataField`) into every
`runAutomationAction` call; the "Time it" IPC handler does the same, which is also why "Time it"
on a `"literal"`/`"file"` setText step now actually works (it never could before, since it always
ran with no data at all to read from).

`formatSessionTemplate` (`src/main.js:533`) is the other consumer of `eventData`: `applyEpisodeText`
and `applySessionFilename` both call it to substitute a user-configured template. `{season}`,
`{episode}`, `{title}`, and `{campaign}` are kept as their own fixed `legacy` aliases (every
template written before Data Fields existed uses them, and `{title}`/`{campaign}` read `eventData`
directly rather than through `resolveDataField`'s fallback-to-`eventData` branch -- same outcome,
skipping the key-parsing that only makes sense for an actual Data Field key). Any *other* `{name}`
found in the template is resolved through `resolveDataField` -- the exact same function a
`setText` step's `dataField` goes through -- so `{sessionCampaign}` or `{sessionDaysLeft+1}` work
in a filename or episode-text template exactly as they would from a `setText` step, including a
`+1`/`-1` variant's mutate-and-persist behavior. Anything left in the string that isn't a
`{...}`-bracketed name -- OBS's own `%CCYY`-style recording macros, in `applySessionFilename`'s
case -- is untouched either way. Both actions were verified against the real OBS instance this was
built against: reading the actual live `FilenameFormatting` value and the actual live text-source
settings before writing anything, confirming `SetProfileParameter`/`SetInputSettings` were the
right calls before committing to the design, not assumed from the protocol docs alone.

## Field registration: making "Data Field" a real dropdown

A `dataField` key typed blind is a name guessed against an undocumented contract -- the user has
no way to know what Herald will actually send without reading Herald's own source. `POST
/api/automations/fields` (`src/automations.js`) is the fix: a connected module declares its
fields (`{key, label}` pairs), and Studio's step editor (`src/control/control.js`'s
`dataFieldGroups`) builds the "Data Field" dropdown from them -- the same discoverability pattern
already used for scene/source pickers, just running in the other direction (a caller telling
Studio about itself, instead of Studio telling a caller about itself).

Registration is scoped per module, not one flat list: the request body carries a required
`module` name, and `registeredFieldsByModule` (a `Map<module, fields[]>` on `AutomationsServer`)
replaces only that module's own previous batch -- a flat wholesale-replace was fine with exactly
one caller in mind, and breaks the moment a second module registers (each reconnect would wipe the
other's fields). `registeredFields()` flattens the map for every consumer that wants the merged
list (`status()`, same as `events` already exposes), tagging each entry with `source: <module>` so
the dropdown (and Studio's own metadata fields sharing the same list, `source: 'studio'`, see
below) can tell two similarly-named fields apart. In memory only, same as `events`: reset on a
Studio restart, repopulated whenever a module reconnects and registers again. A request missing
`module` is rejected (`400`), a breaking change from the original single-caller design -- see
`api-automations.md` and `plan-session-metadata-fields.md` for the full reasoning and the module-facing contract.

## Studio's own Data Field entries

Not every value a `setText` step wants comes from a connected module -- the person running Studio
might want their own campaign name, a countdown, or Season/Episode itself available the same way.
`config.metadataFields` (`src/config.js`) is a persisted list the Session tab's Metadata card
creates and edits directly -- unlike `registeredFieldsByModule` above, this is real config, not
in-memory state, since the whole point of a Number field is that Studio remembers its last value
across restarts. The key freezes at creation (`sanitizeMetadataField` never re-derives it from a
label): confirmed directly, renaming means deleting the field and creating a new one, not editing
one in place -- editing the key on every label change would be a second, silent way for it to
drift out from under a rule set already pointing at it, on top of the one an OBS source rename
already creates.

Four field types, all sharing the same `{id, label, key, type, ...}` shape: `"text"`/`"number"`
carry a single `value`; `"textNumber"`/`"numberText"` carry `text`, `separator`, `number`, and
`padding` instead -- a fixed text segment glued to a number segment via a typed separator ("Chapter"
+ `""` + `5` -> `"Chapter 5"`), the number segment optionally zero-padded (`padding`, one of
`0`/`2`/`3`/`4`). Order (which segment comes first), the separator, and the padding are all fixed
at creation same as the key -- only `text` and `number` (or `value`, for the simple types) are
ever edited in place afterward. A compound field's number segment is exactly as
`"+1"`/`"-1"`-capable as a plain Number field's `value` -- `METADATA_COMPOUND_TYPES` in
`src/control/control.js` (kept in lockstep with `METADATA_FIELD_TYPES` in `src/config.js`) is
where both the dropdown's derived-variant generation and the "New" form's conditional
separator/padding fields check for that.

`resolveDataField` (`src/main.js:586`) is where a `dataField` key actually resolves, in order:
an evergreen built-in (`sessionTime`/`Date`/`Day`/`Month`/`Year`, computed fresh, no storage), the
two Season/Episode aliases (`sessionSeasonNumber`/`sessionEpisodeNumber`, backed by
`session.season`/`.episode` -- the same numbers the Episode card edits), a `metadataFields` entry
by key (composing `text`/`separator`/`number` for the two compound types), then falling through to
`eventData[key]` -- the original, only behavior before any of this existed, still exactly how a
module's own registered fields resolve.

**A trailing `+1`/`-1` is not a pure read.** Confirmed directly, with the user's own example: "In
the automation, they choose 'sessionDaysLeft + 1'... we change the value for 'Days Left' from '3'
to '4' in the session area." `resolveDataField` parses the suffix off the key, and on a
Number-shaped result (the two Season/Episode aliases, or a `metadataFields` entry with
`type: 'number'`) computes the new number, persists it (`configStore.save` + `broadcastStatus`),
and returns the new value as the resolved text -- so selecting a `+1` variant in a rule-set step
both writes the incremented number to OBS and leaves it incremented for next time, generalizing
what `incrementEpisode` already did for the episode counter specifically to any Number field, and
folded into resolution itself rather than needing a dedicated action per field. A delta against an
evergreen field, a Text-typed field, or a key that doesn't resolve to anything Studio-known at all
is silently ignored (evergreen: delta makes no sense against a value with no stored state to
increment; Text: same; unknown: falls through to `eventData` with no delta parsing at all, since a
triggering event was never going to send an arithmetic-suffixed key) -- matching `dataField`'s
existing "an unresolvable key returns `''`, never throws" posture, so a stale reference degrades a
rule set's output rather than breaking its run.

This reuses the *engine's* existing overlap behavior, not a new risk of its own: nothing dedupes
or cancels an in-flight rule-set run that matches again mid-sequence (see "Rule sets and dispatch"
above), so two overlapping runs referencing the same `+1` field would genuinely double-increment
it, the same way `incrementEpisode` already could. Worth knowing, not a reason this was built
differently -- it is an existing property of the engine, just more visible now that it can touch a
value the user is actively watching.

`src/control/control.js`'s `dataFieldGroups()` is the renderer-side merge that actually builds the
picker: Studio's built-ins and `config.metadataFields` (each Number field contributing its own
`+1`/`-1` entries alongside the plain key), then one `<optgroup>` per module in
`status.automations.registeredFields`. `RESERVED_FIELD_KEYS` there is a hand-kept copy of the same
constant `src/config.js` exports -- small and static enough that duplicating it beats a round trip
through IPC, the same reasoning `stageNumbers` reimplementing `stagesFor`'s grouping logic already
established for this file.

`dataFieldGroups()` has a second caller besides the `setText` step editor: the small "insert a
Data Field" panel next to the Episode Format and Filename format inputs (`renderDataFieldPicker`,
toggled by the info button next to each), so the same registered/Metadata/built-in fields
`formatSessionTemplate` can already resolve by name are also discoverable without knowing the key
by heart -- clicking one inserts `{key}` at the input's current cursor position
(`insertAtCursor`), not just appended, so it works mid-edit. A module's own registered fields show
up here too, one caveat worth knowing: a field only *resolves* correctly here if whatever
triggered the rule set that runs `applySessionFilename`/`applyEpisodeText` actually sent that key
in its event `data` -- registering a field only makes it discoverable and offers it as a template
placeholder, it does not give Studio a value for it outside of an actual triggering event.

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
(`EVENT_LOG_LIMIT`) for `automations.js`'s own `status().events`; nothing is persisted to disk
beyond the certificate files and the configured rule sets.

## The Connections activity log

A separate, smaller log than `automations.js`'s own `events` -- `activityLog`
(`src/main.js:167`, capped at `ACTIVITY_LOG_LIMIT` = 100) exists so the Connections card on the
Session tab can answer "what just happened" across all three services at a glance, not just
Automations' own. `logActivity(source, event, level)` (`src/main.js:169`) pushes an entry and
broadcasts; fed from four places: OBS's and Tavern's `'status'` listeners
(`src/main.js:180`/`204`) only log when `state` itself changed (not every status ping -- OBS/Tavern
emit `'status'` on routine polling too, e.g. input or output list refreshes, which would otherwise
spam the log on a timer), Automations' own `'status'` listener the same way (`src/main.js:506`),
and its `'event'` listener logging every event received (`src/main.js:515`) plus every rule-set
step or dispatch failure as a `level: 'error'` entry (`src/main.js:518`, `:708`, `:727`) -- the one
place those failures were previously only a `console.warn`, invisible outside the main process's
own stdout. The Automations tab's rule-set "Test" button and the "Time it" button both still work
exactly as before; their effects just show up here instead of (or now, in addition to) the tab
they were run from. Not persisted, same as `automations.js`'s own log -- resets on restart.

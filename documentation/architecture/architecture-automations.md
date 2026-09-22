# Automations Architecture

**Audience:** developers changing Coffee Pub Studio's Automations feature.

How the Automations HTTPS server is built and why. What it lets a caller do is
[api-automations](../api/api-automations.md); this document is everything you can only learn by
reading the code.

## Where things live in the control panel's tabs

Cards moved, on purpose, away from where the code that runs them (`runAutomationAction`) or their
own internal names suggested they belonged. The visible tab labels and the internal `data-tab`
keys/`src/control/control.js` identifiers no longer match one-for-one for "Session" -- same kind of
mismatch "CP Tavern" already had with its internal key `tavern`, deliberately *not* repeated for
"Configuration": that key was `session` immediately after the Session/Configuration split, which
inverted rather than just abbreviated -- `data-tab="session"`/`tab-session` meant Configuration,
while the actual Session tab was keyed `metadata` -- confirmed as a real hygiene problem (a `grep
session` while working on the Session tab would land on the wrong code) and renamed to
`configuration` the same session it was introduced. `recallTab()` maps a `localStorage` value of
the old `'session'` key to `'configuration'`, so anyone who had a tab preference saved before the
rename still lands somewhere real instead of every panel hidden:

| Visible tab | Internal `data-tab` key | Holds |
| --- | --- | --- |
| Configuration | `configuration` | Connections (status + activity log), OBS Control (manual remote), YouTube (connection/auth settings), Layout & Startup, Reset & Diagnostics |
| Session | `metadata` | Metadata only -- this session's own data (`config.metadataFields`) |
| Automations | `automations` | Recording Filename, Rule Sets, Test Events |

Nav order matches this table left to right, then CP Tavern (only once connected) and each
window's own tab -- Configuration first since `recallTab()`'s fresh-install default is
`'configuration'`, the same key. `config.session` (`filenameFormat`, on disk) is a separate,
untouched thing -- a data key, not a tab key; it just no longer lives on a tab of the same name.

Why: OBS Control (start/pause/stop recording and streaming, scene buttons) is something a person
does live, during a session -- it was never really about automation, just built alongside the
Automations feature and left there out of proximity, not because it belonged there, so it moved to
Configuration and is always available regardless of whether the separate Automations *feature* is
even turned on. Recording Filename is the opposite kind of move: its one and only consumer is
`applySessionFilename`, a Studio Control action -- nothing works with its `filenameFormat` template
except by adding that action as a rule-set step -- so it now sits at the top of the Automations tab,
next to the thing that actually uses it, rather than sitting somewhere with no visible connection to
how it gets applied at all (exactly the confusion that originally led to this). Metadata got split
out to its own tab (labelled "Session", internal key `metadata`) once it became the *only* thing on
the old Session tab that was actual session data rather than status or configuration -- everything
else remaining there (Connections, OBS Control, Layout & Startup, Reset & Diagnostics) is either
live status/action or settings, hence that tab's new label, "Configuration".

YouTube's card is a third pattern, distinct from both: it's connection/auth setup (Client ID/Secret,
Connect/Disconnect), the same kind of thing OBS's host/port/password and Automations' port/token
already are, so it lives on Configuration alongside them -- moved there after first being placed on
Automations (reasoning by proximity to `uploadToYouTube`, the same mistake OBS Control's original
placement made). The *action* itself is still only ever added as a step from the Automations tab's
rule-set editor, same as every other Studio action; only where you connect the account moved.

None of this touched `session.filenameFormat`, `config.metadataFields`, or any element id --
`src/control/control.js` lookups (`$('metadata-fields')`, `$('session-filename-format')`, ...) are
unchanged, so this was purely a `src/control/index.html` relocation plus `selectTab`
(`src/control/control.js`) gaining a fourth `hidden`-toggle branch for `tab-metadata`. One real
behavior fix rode along: `refreshAutomationsScenes()` used to run only when the Automations *tab*
was selected; now that OBS Control's scene/source pickers live on Configuration, selecting either
tab triggers a refresh, since both read the same `automationsScenes`/`automationsSources`.

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

Each step (action or delay) also carries its own `enabled` flag, independent of the rule set's own
-- unlike a disabled rule set (which is skipped entirely while its event keeps arriving, so it
does not get deleted just to stop it firing for a session), a disabled *step* lets someone turn
off one part of an otherwise-working sequence -- skip a scene switch while testing something else,
say -- without losing that step's configuration. `stagesFor` skips a disabled step outright, as if
it weren't in the array at all (`src/main.js`) -- which means an `and` step immediately after a
disabled one joins whichever enabled step actually precedes it, not the disabled one. This is the
one place `stageNumbers` deliberately stops matching `stagesFor`: the displayed step numbers stay
based on position, not enabled state, so toggling a step off and back on doesn't shuffle the
numbers everyone else's mental model of "step 3" depends on -- numbering is cosmetic, only
`stagesFor` needs to be correct.

### Knowing a rule set is running, and stopping it early

`ruleSetRunState` (`src/main.js`) is a `Map<ruleSetId, {count, cancelled, activeStepIds}>`,
ref-counted rather than a boolean `count` since the same rule set can genuinely be running more
than once at once -- a real trigger firing again while a manual "Run Automation" of it is still
going, or two different callers both reaching it via the `runRuleSet` Studio action. `runRuleSet`
itself calls `beginRuleSetRun`/`endRuleSetRun` around its own stage loop (a `try`/`finally`, so a
step throwing still ends the run cleanly), which is also what makes this work automatically for a
*nested* `runRuleSet` call -- the child gets its own entry, tracked and stoppable independently of
its parent. Before running each stage, `runRuleSet` also writes that stage's step id(s) -- plural
for an AND-grouped action stage, since those steps really do run together -- into
`state.activeStepIds` and broadcasts, so the highlight tracks the *specific* step (or Wait) actually
executing, not just "this rule set is running somewhere." `fullStatus` exposes the run-state map's
keys as `runningRuleSetIds` and its `activeStepIds` per id, and the Automations tab's own
`updateRulesetRunState` (`src/control/control.js`) reads both on every status push: a plain static
accent border on the card (enough to spot which one, out of a long list, is mid-run) and a pulsing
one on whichever step row(s) are the current stage -- the pulse belongs on the specific thing
happening right now, not the whole card, which is why the two are styled differently
(`.ruleset-card.running` vs. `.automation-step-current`, `src/control/control.css`). The "Run
Automation" button also swaps to "Stop" while running -- clicking it then calls the
`automations:cancelRuleSet` IPC handler instead of starting a redundant second run.

Cancelling sets `state.cancelled` on the shared entry; `runRuleSet`'s loop checks it before each
stage, and a delay stage uses `sleepCancellable` (the same wait, but polled every 200ms instead of
one long `setTimeout`) so Stop takes effect within a fraction of a second even mid-delay, not only
between stages. Each `ruleSetRunState` entry also holds an `AbortController`; `cancelRuleSetRun`
aborts it, and `runYouTubeUpload` hands its signal to `uploadVideo`, so a YouTube upload that's
mid-flight is cancelled too (the chunk `fetch` throws, the retry backoff wakes early, and it ends
as "Upload cancelled."). **What Stop still does not do**: abort other actions already dispatched in
the current stage -- an OBS call in flight runs to completion, the same way a step failing doesn't
roll back the ones before it. Those are single quick calls with nothing worth aborting, so no
signal is threaded through them.

`updateRulesetRunState` is deliberately not `renderAutomationsRuleSets` -- it never rebuilds a
card, only toggles a class and rewrites one button's label/one progress bar's width, because a
full rebuild on every passive status push is exactly what `firstLoad`'s own comment already
explains is unsafe (it would wipe a step added but not yet saved, mid-typing in a name field, or a
"Time it" run in progress). Highlighting a running card had to be built as a second, narrower
update path for that reason, not folded into the existing one.

### YouTube upload progress

`youtubeUploadProgress` (`src/main.js`) is a `Map<ruleSetId, percent>`, set from `runYouTubeUpload`'s
existing progress callback (the same one that already logged "Upload progress: NN%" to the
activity log) and cleared in a `finally` once the upload settles either way. `ruleSetId` is threaded
down from `runRuleSet` through `runAutomationAction`'s new `ruleSetId` parameter -- optional, since
a direct `POST /action` call or a "Time it" run has no rule set to key progress against, and the
upload still works either way, just with nothing to update. `fullStatus` exposes the map as
`youtubeUploadProgress`; `buildStepRow` renders a hidden-by-default progress bar
(`[data-youtube-progress="<ruleSetId>"]`) on an `uploadToYouTube` step, and `updateRulesetRunState`
fills in its width and percentage text on every status push -- the same non-rebuilding update path
the running-highlight uses, for the same reason.

Each rule-set card can collapse to just its header (`collapsedRulesetIds`, `src/control/control.js`
-- a `Set`, remembered in `localStorage` the same way `activeTab` is, not sent to the server since
it's a pure display preference rather than config) and shows a live step count next to its name
either way, so a long list of rule sets can be scanned without
opening every one. Reordering the cards (`move-ruleset-up`/`-down`, same splice-and-resave pattern
as a Metadata field's reorder buttons) is purely how the page lays out to match whatever grouping
makes sense to whoever is reading it -- a rule set's own matching and execution never consult its
position in the array.

`runAutomationAction`'s switch covers two families: OBS actions (`sceneSwitch`, `sourceShow`,
`sourceHide`, `sourceToggle`, `setText`, and the recording/streaming controls) all require
`obs.connected` and reuse the OBS WebSocket connection Studio already maintains elsewhere; Studio
actions (`wakeAudio`, `startAll`, `stopAll`, `dockAll`, `undockAll`, `syncObs`,
`applySessionFilename`, `runRuleSet`) reach into Studio's own state instead and need no OBS
connection at all, except `syncObs`/`applySessionFilename`. Both families are always reachable -- a
rule-set step's
action dropdown (`availableActions()`, `src/control/control.js`) and `GET
/api/automations/capabilities` (`syncAutomationsServer`) both list every OBS and Studio action
unconditionally, same token-only gate either way.

This replaced a per-Studio-action opt-in (`automations.studioActions`, off by default) that lived
here through most of this feature's life -- removed once it became clear it had no working
justification. Confirmed directly: it gated two unrelated things with one checkbox (whether a
rule set you wrote yourself could use an action, and whether an external caller holding your token
could) under a section that read, to the person who owns this feature, as being about the second
thing only -- so `applySessionFilename` sat unused in their own "Record Session" rule set because
they had no reason to find a checkbox about third-party access just to use their own filename
action. The
category split itself (OBS actions = always on, Studio actions = opt-in, because they're "a bigger
blast radius") also didn't survive: `Studio Control` already renders as a fourth co-equal group
right in the same step-action dropdown as Scenes/Sources/Controls, no visual distinction, so
whatever risk tiering the split was meant to signal was never actually communicated -- a user just
sees a menu group that's mysteriously missing most of its items. Every automations call, OBS or
Studio, external or from a rule set you wrote, was already behind `automations.token`; that's the
one gate that does real work, so it's the only one left.

`applySessionFilename` also dropped its own second gate, `session.filenameFormatEnabled` -- a
checkbox on the Session tab that did nothing but make the action throw a runtime error if left
unticked, on top of the already-required non-empty `filenameFormat` check. Not a permission
boundary, just a landmine with no upside: adding the step to a rule set (or calling it directly)
already *is* the opt-in, the same way it is for every other action here -- a second "are you sure"
toggle elsewhere added a place to forget, not any actual safety.

## Composing rule sets: `runRuleSet`, and retiring the `+1`/`-1` Data Field suffix

Two changes that landed together because they're the same fix. `runRuleSet` lets one rule set's
own step call another by id, so a small reusable sequence ("Bump Numbers": a couple of Increment
steps, see below) can be shared by several bigger ones ("Record Session" calling it once, ahead of
"Set Session Info" and the actual recording steps) instead of either duplicating those steps
everywhere or hoping several independent Herald-fired events happen to land in the right order.

The other half is what made that worth building: a Number (or a compound field's number segment)
used to be bumped by resolving a Data Field key with a trailing `+1`/`-1` -- a mutation hiding
inside what looked like a read, so the same key referenced from two different places that both
fired as part of one logical action (a rule set's own step, and, say, a filename template's own
`{key+1}`) would silently double-increment. Retired entirely: `resolveDataField` is a pure read
now, always. Bumping a field is its own explicit action, `incrementMetadataField` /
`decrementMetadataField` (`runAutomationAction`, `src/main.js`), added the same time as
`runRuleSet` -- composition is what makes "bump exactly once, from one place" actually arrangeable
instead of just theoretically correct. See "Studio's own Data Field entries" below for the
Increment/Decrement action itself.

`param` is the target rule set's `id`, not its `name` -- names aren't required to be unique, ids
are (`sanitizeRuleSet`, `src/config.js`). The step editor's picker (`buildStepRow`,
`src/control/control.js`) shows names but stores ids, its own small branch alongside the generic
scene/source picker since its options are `{id, name}` pairs, not the flat name list
`optionsForParamType` returns for every other `paramType`. A stale id (the target rule set got
deleted) surfaces the same front-loaded `[!] ... not found` treatment used everywhere else a saved
reference might not resolve.

The one real risk composition adds -- A calls B calls A, forever -- is guarded, not just hoped
around: `runAutomationAction` (`src/main.js`) takes a `chain`, the `Set` of rule-set ids already
running further up this same call stack, defaulting to empty for every top-level entry point (a
real trigger, a manual run, a direct `POST /action`, a "Time it" test). `runRuleSet` itself defaults
`chain` to just its own id -- a fresh top-level run. Its `runRuleSet` case in `runAutomationAction`
checks `chain.has(target.id)` before recursing; a hit throws instead of running, refusing the loop
with a clear error rather than hanging or blowing the stack. No depth cap beyond that -- unnecessary
given `AUTOMATIONS_LIMITS.maxRuleSets` (40) already bounds how long any cycle-free chain can
possibly get.

Deliberately *not* discoverable externally: `GET /api/automations/capabilities`'s `ruleSets` only
ever carries `name`/`group`/`event` (`src/automations.js`, by design -- see its own comment), so an
outside caller has no way to obtain a valid id even though `runRuleSet` appears in `actions` like
every other Studio action now does. That is intentional, not an oversight: this action exists to
let a rule set call another rule set from inside Studio's own step editor, not for a third party to
reach in and pick one; an external caller wanting to run a specific rule set already has the
supported path, `POST /event` with its `event` string.

## Conditional steps: `runIf` -- On Success / On Failure

Raised directly from a real limitation this session's own `clearMetadataField` steps had: they run
unconditionally at the end of `"Upload to Youtube"`, so a failed upload still clears
`sessionTitle`/`youtubeDescription`, forcing a re-type on retry. The engine had no way to say "only
if the step before this one failed" at all -- every stage in `stagesFor`'s sequence always ran,
`Promise.all`'s per-step `.catch()` existing only to keep one step's failure from crashing the whole
rule set, not to let a *later* step react to it.

`runIf` (`src/config.js`, step sanitizer -- `"always"`/`"onSuccess"`/`"onFailure"`, default
`"always"`) is a small, deliberately narrow answer: not a general if/then over arbitrary conditions
(the "if `data.player` is Nik Melok" kind of thing TODO.md already lists as a real idea, not built)
-- just "did the *previous stage* succeed or fail." Only meaningful on a step that opens its own
stage (`and: false`); a step joining the current stage via `and` has no distinct "previous" of its
own, so the step editor (`buildStepRow`, `src/control/control.js`) hides the control whenever `and`
is on, showing it right next to the With/After toggle otherwise -- same visual language (a small
tinted button, cycling through its states on click), `--ok` green for On Success and `--danger` red
for On Failure, an untinted "Always" for the default so most steps, which never need this, don't
compete for attention with it.

`stagesFor` now also carries each action stage's `runIf` (taken from whichever step opened it,
`src/main.js`). `runRuleSet`'s own stage loop tracks `lastOutcome` -- `'success'` until an action
stage's `Promise.all` actually catches a step failure, at which point it flips to `'failure'` for the
*next* stage's gate to check. A delay stage, or a stage skipped by its own gate, leaves `lastOutcome`
untouched -- "previous" always means the last stage that actually *ran* something, not merely the
one immediately before it in the list, so several gated stages in a row (or a gated stage after a
`[Wait]`) can all key off one real outcome further back. Starts `'success'` (vacuously -- nothing has
failed yet) so a gate on an early stage doesn't spuriously skip for lack of anything to check yet. A
skipped stage logs a plain info-level activity entry (not an error -- skipping on purpose is not a
failure) saying which gate skipped it and what the previous outcome actually was.

Verified live with three throwaway rule sets (config restored and diffed clean afterward, same
verification discipline as every other feature in this document): an unconditionally-succeeding
first step correctly ran its On Success branch and skipped its On Failure branch; a guaranteed-to-
fail first step (`incrementMetadataField` on a made-up key) correctly flipped that -- On Failure ran,
On Success was skipped, and the field the On Success branch would have written was confirmed
untouched; a `[Wait]` stage placed between a successful first step and an On Success-gated third step
did not reset the tracked outcome -- the gated step still ran.

### `showToast`, and a real chaining gotcha it surfaced

Raised directly as `runIf`'s first real use: a toast in Studio's own control panel when a YouTube
upload fails, so it doesn't just sit quietly in the Connections log until someone happens to check.
`showToast` (`param`: the message, `{token}`-expanded through `formatSessionTemplate` the same way
`applySessionFilename`'s template already is) pushes an IPC `'toast'` event to `controlWindow` if
it's open (silently a no-op otherwise -- a toast with nobody to show it to just doesn't display) and
always logs to the Connections activity feed regardless, so nothing's lost if the window wasn't open
at the moment. `paramType: "text"` is new too (`src/config.js`'s schema, `src/control/control.js`'s
step editor) -- every other action's `param` is a picker; this is the first one that's genuinely
free text, so the step editor needed its own plain-input branch instead of the `<select>` every
other `paramType` renders, reusing the same "Insert a Data Field" picker a Text Metadata field's own
value input already has.

Wiring it into the real `"Upload to Youtube"` rule set surfaced a genuine correctness trap in
`runIf` chaining: the natural-looking order -- upload, then the toast (On Failure), then
`clearMetadataField` (On Success) -- is wrong. `showToast` itself always *succeeds* (it doesn't
throw), so if it sat between the upload and the clear step, its own successful completion would
overwrite `lastOutcome` back to `'success'` right before the clear step's own gate checks it,
erasing the upload's real failure. The fix is ordering, not code: **`clearMetadataField` (On
Success) has to come immediately after the upload, and `showToast` (On Failure) last** -- when the
upload fails, the On Success clear step is skipped (its gate isn't met), which leaves `lastOutcome`
untouched per `runRuleSet`'s "skipped stages don't touch the tracked outcome" rule (see above), so
the toast at the end still correctly sees the *original* failure, not whatever the clear step (which
never ran) would have produced. This is exactly the "skip preserves outcome, not merely 'true skips
straight to the next thing'" design already verified above -- this is its first real payoff, not a
new mechanism.

## A plain Number field's own zero-padding

A second real gap the same review surfaced: a Text+Number/Number+Text field's own number segment
always had an optional zero-padding width (`METADATA_PADDING_OPTIONS`, `[0, 2, 3, 4]`), but a plain
Number field never did. This mattered once season/episode got restructured from one `textNumber`
field each (`text: "S"`, `number: 3`, `padding: 2` -> `"S03"`) into a separate raw counter (a plain
Number, `sessionSeasonCounter`) plus a Text field composing a display string from it
(`sessionSeasonShort`, value `"S{sessionSeasonCounter}"`) -- the raw counter had nowhere to carry
padding at all, so the composed result silently lost its leading zero (`"S3"`, not `"S03"`).

`sanitizeMetadataField` (`src/config.js`) now accepts an optional `padding` on a plain `"number"`
field, same `METADATA_PADDING_OPTIONS` validation the compound types already use.
`resolveDataField` (`src/main.js`) applies it the same way it already applies a compound field's own
padding (`String(value).padStart(padding, '0')`) -- the renderer's own read-mode display
(`composeMetadataFieldValue`) and its Data Field preview mirror (`previewDataField`,
`src/control/control.js`) both do the same, so what's shown on the Metadata card matches what a real
run actually produces. The New-field form's existing Padding selector (previously shown only for the
two compound types) now shows for a plain Number too. The user's own real `sessionSeasonCounter`/
`sessionEpisodeCounter` were given `padding: 2` directly, restoring `"S03"`/`"E28"` -- verified live
by resolving the padded field's value through a throwaway `setMetadataField` step and reading the
result back (`"03"`), config restored afterward.

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

`formatSessionTemplate` (`src/main.js:533`) is the other consumer of `eventData`: `applySessionFilename`
calls it to substitute a user-configured template. `{title}` and `{campaign}` are kept as their own
fixed `legacy` aliases, reading `eventData` directly rather than through `resolveDataField`'s
fallback-to-`eventData` branch (same outcome, skipping the key-parsing that only makes sense for an
actual Data Field key). Any *other* `{name}` found in the template is resolved through
`resolveDataField` -- the exact same function a `setText` step's `dataField` goes through -- so
`{sessionCampaign}` or any other Metadata field's key work in a filename template exactly as they
would from a `setText` step: a pure read, same as everywhere else now. Anything left in the
string that isn't a `{...}`-bracketed name -- OBS's own `%CCYY`-style recording macros -- is
untouched either way. Verified against the real OBS instance this was built against: reading the
actual live `FilenameFormatting` value before writing anything, confirming `SetProfileParameter`
was the right call before committing to the design, not assumed from the protocol docs alone.

`formatSessionTemplate` used to also carry `{season}`/`{episode}` as fixed aliases, backing a
dedicated Episode card (Studio-tracked season/episode numbers, a `applyEpisodeText` action writing
them to a text source, an `incrementEpisode` action bumping the counter). Retired once Metadata
fields made the same job possible without a second, parallel system for tracking a number --
confirmed unused in practice before removal, including by the person who owned the feature: the
card's own season/episode counter had already drifted out of sync with equivalent Metadata fields
they'd started maintaining by hand instead.

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
might want their own campaign name, a countdown, or anything else available the same way.
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
Increment/Decrement-capable as a plain Number field's `value` -- `METADATA_COMPOUND_TYPES` in
`src/control/control.js` (kept in lockstep with `METADATA_FIELD_TYPES` in `src/config.js`) is
where both the Increment/Decrement step picker's type filter and the "New" form's conditional
separator/padding fields check for that.

`resolveDataField` (`src/main.js`) is where a `dataField` key actually resolves, in order: an
evergreen built-in (`sessionTime`/`Date`/`Day`/`Month`/`Year`, computed fresh, no storage), a
`metadataFields` entry by key (composing `text`/`separator`/`number` for the two compound types),
then falling through to `eventData[key]` -- the original, only behavior before any of this existed,
still exactly how a module's own registered fields resolve. Always a pure read -- see "Composing
rule sets" above for why the trailing `+1`/`-1` it used to parse off the key is gone.

Bumping a field is `incrementMetadataField`/`decrementMetadataField` instead: `param` is the
field's `key`, filtered in the step editor's picker (`buildStepRow`, `src/control/control.js`) to
Number and compound types only, same `METADATA_COMPOUND_TYPES` check as above. The action case in
`runAutomationAction` looks the field up fresh, mutates `value` (Number) or `number` (compound) by
±1, and saves -- structurally identical to what resolving a `+1` key used to do, just as its own
explicit step instead of a side effect of a read. A field that isn't Number-shaped, or doesn't
resolve at all, throws a clear error rather than silently doing nothing -- unlike `dataField`'s
"unresolvable key returns `''`" posture, this is an action a user placed on purpose, so silently
no-op-ing would hide a real mistake (a deleted field a step still points at) rather than degrade
gracefully the way a missing read does.

This doesn't touch the *engine's* existing overlap behavior: nothing dedupes or cancels an
in-flight rule-set run that matches again mid-sequence (see "Rule sets and dispatch" above), so two
overlapping runs both reaching an Increment step for the same field would still double-bump it.
What changed is how many places can trigger that bump at all -- it used to be anywhere a Data Field
key was read; now it's only wherever an Increment/Decrement step was deliberately placed, which is
the actual point: composing the bump into one rule set, called from one place (`runRuleSet`), makes
"exactly once" something you can arrange, not something you have to hope stays true.

### `setMetadataField`: an explicit set, for Text fields

Increment/decrement gives a Number-shaped field persistence across separate calls (bump it now,
read the bumped value later). Nothing gave a Text field the same until `setMetadataField`, added
for a Herald use case that needed exactly this: prompt for a title before recording starts (used
later, by a *different* call, in the filename), and let the description be updated independently
at any point up to Stop (used later still, by the YouTube upload step). Both need somewhere durable
to land between "when it's set" and "when it's read" -- `data` on a triggering event doesn't
survive past that one request, so a Text field's own `resolveDataField` read was never going to be
enough on its own; something had to be able to write one.

`setMetadataField` mirrors increment/decrement's shape (`param` is the field's `key`) but takes an
explicit value instead of a fixed ±1, and is scoped the other way: Text fields only, rejecting
Number/Text+Number/Number+Text (which already have their own action) and checkbox (whose only
sensible values are boolean, not a string this action's sources would produce) with the same "throw
a clear error rather than silently doing nothing" posture increment/decrement already established.

The value itself reuses `setText`'s existing three-source shape --literal/file/Data-Field-- almost
verbatim: `resolveMetadataFieldValue` (`src/main.js`) is `resolveTextValue`'s logic copied rather
than parameterized, differing only in what a direct API call (no step context) reads literally --
`data.value`, not `setText`'s `data.text`, since "the value to store in this field" reads more
plainly than reusing an unrelated action's own key name. The step editor's own value-source block
(`buildStepRow`) is shared between the two actions outright, not copied, since the UI genuinely is
identical either way. The Metadata-field picker (`buildStepRow`) filters by action -- Number/
compound types for Increment/Decrement, Text only for `setMetadataField` -- the same
`METADATA_COMPOUND_TYPES` split the picker already made, just inverted for this one case.

Verified live against the real automations HTTP server: `setMetadataField` on `sessionTitle`
(including a value containing its own literal `/`, to confirm a Metadata field's stored value is
never itself sanitized -- only what a *filename* template substitutes is, see the note under
"POST /api/automations/action" in `api-automations.md`) landed in `config.json` and was read back
correctly by `applySessionFilename`; an unknown field key, a non-Text field, and a missing `param`
each failed with the same `500 {error}` shape increment/decrement already use, and left the target
field untouched.

One gap this surfaced immediately: a `param` naming a Metadata field's `key` only works for a
caller that already knows the key, and nothing ever told an external caller what it was --
`incrementMetadataField`/`decrementMetadataField` got away with this because they're only ever
wired up *inside* Studio's own step editor, by a human who already sees the field list there.
`setMetadataField` breaks that assumption the moment a module like Herald calls it directly with
no Studio human in the loop, hardcoding a key it was told out of band -- which breaks silently the
moment it talks to a different Studio setup with differently-named fields. Fixed by giving
`GET /api/automations/capabilities` a `metadataFields` array (`key`/`label`/`type`, read fresh
from config every request, same treatment `ruleSets` already gets) -- see "GET
/api/automations/capabilities" in `api-automations.md`. Wired through `automations.js`'s existing
`getX()` callback pattern (`getMetadataFields`, alongside `getScenes`/`getSources`), supplied by
`syncAutomationsServer` in `main.js`. Lets a caller build its own settings picker instead of
hardcoding a guess, the same way Studio's own rule-set editor already turns this into a dropdown
rather than a name typed blind.

That settings-picker approach was then superseded, not layered alongside, by a better design: a
new `"prompt"` Metadata field type with no value except by answering it, `GET /capabilities`'s
`ruleSets` gaining a recursively-computed `prompts` list (walking into any nested `runRuleSet`
target, so a rule set that only *transitively* touches a prompt field -- `"Begin Session
Recording"` via its call to `"Set Session Info"`, say -- still reports it correctly), and
`POST /api/automations/event` refusing to run at all unless every required prompt is answered in
that same call. This turns "Herald pre-configures a field mapping for concepts it invents" into
"Herald asks Studio what a rule set needs, generically, every time" -- full design, the exact
recursion problem this raised, and what was verified live (including the "answered once doesn't
exempt a later call" semantics) in `documentation/plans/plan-automation-prompts.md`.

The Metadata card itself has no inline bump buttons -- removed deliberately, since their presence
implied a human needs to click one every time, when the entire point of Increment/Decrement as a
Studio action is that a rule set does the bumping with nobody touching the card at all. Each row is
read-only by default (`composeMetadataFieldValue` renders the same string `resolveDataField` would);
a pencil-icon "Edit" button (`editingMetadataFieldId` in `src/control/control.js`, only one row at a
time) swaps it for its editable input(s) and a "Save" checkmark, so a value only ever changes when
someone deliberately opens a row, types, and commits -- glancing at the card can't mutate it. A
freshly-created field starts in edit mode (nothing worth reading yet), everything else starts read.

`src/control/control.js`'s `dataFieldGroups()` is the renderer-side merge that actually builds the
picker: Studio's built-ins and `config.metadataFields` (one entry per field, its own key), then
one `<optgroup>` per module in
`status.automations.registeredFields`. `RESERVED_FIELD_KEYS` there is a hand-kept copy of the same
constant `src/config.js` exports -- small and static enough that duplicating it beats a round trip
through IPC, the same reasoning `stageNumbers` reimplementing `stagesFor`'s grouping logic already
established for this file.

`dataFieldGroups()` has a second caller besides the `setText` step editor: the small "insert a
Data Field" panel next to the Filename format input (`renderDataFieldPicker`, toggled by the info
button beside it), so the same registered/Metadata/built-in fields `formatSessionTemplate` can
already resolve by name are also discoverable without knowing the key by heart -- clicking one
inserts `{key}` at the input's current cursor position (`insertAtCursor`), not just appended, so
it works mid-edit. A module's own registered fields show up here too, one caveat worth knowing: a
field only *resolves* correctly here if whatever triggered the rule set that runs
`applySessionFilename` actually sent that key in its event `data` -- registering a field only
makes it discoverable and offers it as a template placeholder, it does not give Studio a value for
it outside of an actual triggering event.

That caveat is exactly what `run-ruleset`'s test-data prompt exists for, and exactly why it must
not fire more often than that. `isStudioOwnedDataField` (`src/control/control.js`) checks, for each
`setText` step's Data Field key, whether it's an evergreen built-in or a `metadataFields` entry --
either resolves straight from Studio's own config with no `eventData` at all, same as a real trigger
would resolve it. Only a key that fails both checks (a module's registered field) actually depends
on whatever triggered the run, so only those go into the prompt's JSON skeleton; a rule set built
entirely from Studio-owned keys (the common case) now runs with no prompt at all. Confirmed live:
prompting unconditionally for *any* Data Field step, regardless of where its value actually came
from, was a bug wearing the shape of a feature -- caught only because a user asked why a button
they clicked was popping up a dialog meant for something else entirely.

## `window.prompt()` does not exist in this renderer

Found live, the hard way: Electron's renderer does not implement `window.prompt()` at all --
calling it throws `Error: prompt() is not supported`, synchronously, which meant the "Run
Automation" button's own "this rule set has a Data Field step, enter test data as JSON" prompt
(`automationsEls.rulesets`'s `run-ruleset` handler, `src/control/control.js`) threw before ever
reaching the `api.automationsTestEvent(...)` call beneath it -- so clicking the button on a rule
set with any Data Field `setText` step did nothing at all: no event sent, nothing in the activity
log, no error surfaced anywhere a user would see it, because the throw happened inside an `async`
click handler with nothing awaiting or catching it. `window.confirm()` is used in several places
elsewhere in this file and does work (Chromium's blocking `confirm`/`alert` are supported here;
only `prompt`, which needs a text-input dialog, is not) -- this is not a reason to suspect those.

`promptModal` (`src/control/control.js`, next to `insertAtCursor`) replaces it: a real overlay
(`#prompt-modal-overlay` in `index.html`, hidden by default) with a textarea, OK/Cancel, Escape and
Cmd/Ctrl+Enter, resolving a Promise with the typed text or `null` -- the same contract
`window.prompt()` had, so its one call site needed nothing else changed beyond `await`ing it.
Everywhere else in this app already avoided native dialogs in favor of inline UI for other reasons
(consistency, not needing a text-input prompt at all); this was the one place that still did, and
it turned out `window.prompt()` was never going to work in the first place -- worth remembering
before reaching for it again anywhere in this codebase.

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
Configuration tab can answer "what just happened" across all three services at a glance, not just
Automations' own. `logActivity(source, event, level)` (`src/main.js:169`) pushes an entry and
broadcasts; fed from four places: OBS's and Tavern's `'status'` listeners
(`src/main.js:180`/`204`) only log when `state` itself changed (not every status ping -- OBS/Tavern
emit `'status'` on routine polling too, e.g. input or output list refreshes, which would otherwise
spam the log on a timer), Automations' own `'status'` listener the same way (`src/main.js:506`),
and its `'event'` listener logging every event received (`src/main.js:515`) plus every rule-set
step or dispatch failure as a `level: 'error'` entry (`src/main.js:518`, `:708`, `:727`) -- the one
place those failures were previously only a `console.warn`, invisible outside the main process's
own stdout. The Automations tab's rule-set "Run Automation" button and the "Time it" button both
still work exactly as before; their effects just show up here instead of (or now, in addition to)
the tab they were run from. Not persisted, same as `automations.js`'s own log -- resets on restart.

A fifth place feeds it now: `syncObs()` (`src/main.js`) logs its own sync report -- which sources
got re-pointed, had their capture restarted, got cropped, were newly linked, or are missing in OBS
-- but only when at least one of those actually happened. This used to be Studio's one real
exception to "log entries are short": the full report was rebuilt into one long sentence and shoved
into the OBS card's own status hint on the Configuration tab, rewritten on every sync, drifting
further from that hint's job (a glanceable one-liner) with every source added. `obs.js`'s
`this.lastSync` existed only to carry that detail to the renderer for this one purpose; removed
along with it; `syncObs()` already had the same report as a local variable; nothing else read
`lastSync`, so nothing else needed touching (confirmed by grep before deleting it).
`obsSyncTimer`'s debounced auto-sync (`src/main.js:1181`) fires on ordinary view/region edits, often
several times in quick succession -- exactly the "routine polling" case the state-change-only rule
elsewhere in this log exists to avoid spamming, so the same discipline applies here: nothing logged
when a sync found nothing to do.

## Uploading a recording to YouTube

**Built overnight, unattended, from a design discussion earlier the same session -- see the
addendum to `plan-session-text-and-youtube-upload.md` for the full account of what's confirmed
working versus what genuinely could not be verified without live Google credentials. Read that
addendum before touching this code; the short version is repeated here.**

`uploadToYouTube` is a Studio action, same family as `applySessionFilename`/`runRuleSet`/
increment-decrement -- never automatic, added as a rule-set step like everything else here. What
makes it different from every other action is that it needs four separate pieces of per-run data
(title, description, a COPPA "made for kids" declaration, and whether to actually publish), and
the person who owns this feature was explicit that these should come from Metadata fields *they*
create and wire up per step, not a static config template Studio guesses at. That single
requirement shaped most of what follows. A fifth piece, adding the upload to a playlist, was tried
and removed -- see "Playlist support" below.

### Auth: OAuth's device flow, not a loopback redirect

`src/youtube.js`'s `YouTubeUploader` handles this. The obvious approach -- spin up a local HTTP
server, register `http://localhost:<port>` as the OAuth redirect URI in Google Cloud Console --
was deliberately not used. Two reasons: it needs a free port and an exact registered redirect URI,
both extra failure surface for zero benefit here; and this session had already spent considerable
time fighting flaky local UI automation, which made "one more local server that has to bind
correctly" an easy thing to want to avoid. The Device Authorization Grant (RFC 8628) instead: Studio
asks Google for a short code (`requestDeviceCode`), shows it, and the person visits a URL -- on
*any* device, not necessarily the Mac running Studio -- and approves. `pollForToken` then polls
Google's token endpoint until approval, denial, or expiry. This requires the Google Cloud OAuth
client to be the **"TVs and Limited Input devices"** type specifically; **"Desktop app"** and
**"Web application"** client types do not support this grant at all -- confirmed against Google's
own OAuth documentation, not assumed, since getting the client type wrong is the single most likely
way this fails on first setup.

The setup card itself walks through this rather than assuming it's obvious: a collapsible
"How to get a Client ID and Secret" (`.cert-trust-help`, the same collapsible class the OBS
CA-certificate install steps already use, `src/control/index.html`) with three links -- enable the
YouTube Data API, configure the OAuth consent screen (explicitly telling the person to leave
**Publishing status** at **Testing** and add themselves as a **Test user**, since Google's full
verification review is a slow process not worth it for personal use), and create the credentials --
plus a shortcut icon button next to the Client ID field for anyone who's already done the first two
steps. All four open a *fixed* Google Cloud Console URL via dedicated IPC handlers
(`youtube:openApiLibrary`/`openConsentScreen`/`openCredentials`, `src/main.js`, each calling
`shell.openExternal` with a hardcoded string) rather than one generic "open this URL" handler
accepting a value from the renderer -- deliberately narrower than it needed to be functionally, so
there's nothing here for a compromised renderer to redirect elsewhere.

`clientId` lives in `config.youtube` (plain, unencrypted -- not meaningfully secret, same posture
as `obs.host`). `clientSecret` and the refresh token share one `safeStorage`-encrypted file,
`YOUTUBE_SECRET_PATH` (`src/main.js`), same keychain-backed pattern the OBS and Tavern passwords
already use (`readSecret`/`writeSecret`, reused directly rather than reimplemented). The access
token is never persisted -- held in memory on the `YouTubeUploader` instance, refreshed
automatically via the stored refresh token whenever it's stale or missing (`getAccessToken`).

`youtubeConnectState` (`src/main.js`) holds the in-progress device code/verification URL while a
connect is waiting on approval, included in `fullStatus()`'s `youtube` object so a control-panel
reload mid-flow doesn't lose it, and is why `renderYoutubeStatus` (`src/control/control.js`) is
called unconditionally on every status push rather than gated by `isDirty()` the way
`applyYoutubeConfig`'s config-driven fields are -- approval can take a while, and shouldn't wait on
the user finishing an unrelated edit elsewhere in the app (same split
`applyAutomationsConfig`/`renderAutomationsStatus` already established).

### Upload: resumable, chunked, no SDK

Plain `fetch` calls against the Data API v3's resumable upload protocol -- no `googleapis` package.
That library is large for what amounts to a handful of REST calls, and this codebase has exactly
one dependency (`obs-websocket-js`, for a protocol not reasonably hand-rolled); OAuth token
exchange and a resumable-upload PUT loop are both well-specified enough to hand-roll the same way
`automations.js`'s own HTTPS server already does.

The protocol: POST to start a resumable session (`uploadType=resumable`, video metadata as the
JSON body, `X-Upload-Content-Length` telling Google the total size up front), which returns a
session URL in its `Location` header; then PUT the file in fixed-size chunks (`CHUNK_SIZE` = 8 MiB,
a multiple of the required 256 KiB) with a `Content-Range` header per chunk, reading each chunk into
a `Buffer` via `fs.readSync` rather than streaming (simpler and safer against Node's
stream-to-fetch-body edge cases than it was worth debugging blind, without a real upload to test
against). A `308 Resume Incomplete` means "chunk accepted, keep going"; `200`/`201` means done, with
the created video's `id` in the response body. Each chunk retries up to 5 times with exponential
backoff on failure before giving up -- resumable *within* one `uploadToYouTube` run, not *across*
Studio restarts; the session URL isn't persisted, so an app restart mid-upload starts over. A
documented gap, not an oversight -- see "What's not built" below.

Progress reports to the Connections activity log every ~10% (`runYouTubeUpload`, `src/main.js`),
same destination the OBS sync report uses, for the same reason: a multi-GB upload over a home
connection can run long, and "Studio looks stuck" is a worse experience than a few log lines.

### Where the file comes from

`obs.js`'s `stopRecording()` now captures `StopRecord`'s own response -- the one place OBS actually
tells Studio which file it just finished writing (`outputPath`), stored as `this.lastRecordingPath`.
`uploadToYouTube` uses that unless the step's own `filePath` overrides it (the same step property
`setText`'s "File" value type already uses -- one field, one meaning, reused rather than duplicated).
No other code read `obs.js`'s prior `lastSync` field that this replaces functionally in spirit
(different field, unrelated purpose) -- worth noting only because both are "OBS told us something
after an action completed" patterns now living in this file.

### Five Data Field slots, not one shared param

Every other action's `param` (or `setText`'s `dataField`) is one value. `uploadToYouTube` needs
five, each wired to a *different* Metadata field, because the person who owns this feature wants to
fill in Title/Description/Category/"made for kids"/Visibility themselves, per session, the same
way they already fill in Campaign/Party/Title today. So the step object carries
`titleField`/`descriptionField`/`categoryField`/`madeForKidsField`/`visibilityField` (each a
Metadata field `key`, sanitized in `sanitizeAutomationStep`, `src/config.js`) instead of a single
`param`. The step editor's UI (`buildStepRow`'s `youtubeUpload` branch, `src/control/control.js`)
renders five labeled pickers via a shared helper, `appendDataFieldPicker` -- built because five
inline picker blocks would have been five near-identical copies of the same 25-line pattern
`runRuleSet`/`incrementMetadataField` each already have their own copy of; worth the extraction
here specifically because of the repetition, not a blanket "always extract" call. (A sixth slot,
Playlist, existed briefly -- see "Playlist support" below for why it was removed.)

`titleField`/`descriptionField`/`categoryField`/`visibilityField` all resolve through the ordinary
`resolveDataField` -- any Metadata field, any evergreen built-in, same as a `setText` step.
`categoryField` is fully permissive (empty falls back to `config.youtube.categoryId`, whatever it
resolves to otherwise is trusted as-is -- YouTube's category list is large enough that there's no
small, meaningful set to validate against). `visibilityField` is permissive about *where* it comes
from but strict about *what it resolves to*: empty falls back to `config.youtube.privacyStatus`
same as Category does, but a non-empty result that isn't exactly `"private"`/`"unlisted"`/`"public"`
(case-insensitive) makes `runYouTubeUpload` throw rather than silently falling back or guessing --
this used to be a checkbox-only `publicField` ("make public" or nothing), which could only ever
force *toward* public, never explicitly select private or unlisted; a real string value covering
all three states is what visibility actually needs, and unlike Category, a wrong value here
(a typo, a field that resolves to something unexpected) is exactly the kind of mistake that
shouldn't quietly publish something at the wrong visibility.

`madeForKidsField` stays the one field that's type-gated rather than just value-validated: it
**must** point at the "checkbox" Metadata field type (below), and `runYouTubeUpload` throws if it
doesn't -- deliberately stricter than `dataField`'s usual "an unresolvable key returns `''`, never
throws" posture, and stricter even than Visibility's string-matching. Reasoning: a stale
Number-field reference degrading a filename is cosmetic; a stale reference silently defaulting a
COPPA "made for kids" declaration is not the kind of mistake this should paper over, and a
checkbox is the one Metadata field type that can't accidentally hold an unrelated string the way a
Text field pointed at the wrong key could. Same posture `incrementMetadataField` already
established for a field that isn't Number-shaped -- applied here because the stakes are
considerably higher.

`selfDeclaredMadeForKids` sent to the API is a **direct** read of the "made for kids" field's value
(checked = made for kids = `selfDeclaredMadeForKids: true`) -- matches both the field's own label
and the API's own field name, deliberately. This used to be inverted (a "Not made for kids" field,
checked meaning the opposite of what it now means) -- flipped after it read as a double negative in
practice ("checked = yes, it is not made for kids" is a harder question to answer at a glance than
"checked = yes, it is made for kids"), a live piece of feedback from actually using the feature, not
a hypothetical concern caught in review.

### Playlist support (tried, removed)

A fifth step slot, Playlist, existed briefly and was removed after a real live run showed it can't
work through this feature's auth flow. `youtube.upload` (`src/youtube.js`'s `SCOPE`) authorizes
`videos.insert` but not `playlistItems.insert`, which needs the broader `youtube` or
`youtube.force-ssl` scope. Upload succeeded on a real run, then `addToPlaylist` failed with
"Request had insufficient authentication scopes" -- so `youtube.force-ssl` was added alongside
`youtube.upload` (space-separated in the one `scope` parameter, not a second request) and tried
live. Google's device-code endpoint rejected it outright with `Invalid device flow scope`, before
the app's own Google Cloud Console configuration was even reached. Broader/sensitive YouTube
scopes appear to be blocked from the Device Authorization Grant flow specifically -- plausibly why
the original design only ever requested `youtube.upload` -- which means playlist support isn't
reachable at all through the auth flow this feature is built on (see "Auth: OAuth's device flow"
above for why that flow was chosen over a loopback redirect, which would very likely support the
broader scope, at the cost of the local-server complexity the device flow exists to avoid). `youtube`
(the other, even broader scope) was not separately tried, but it's the same sensitivity tier as
`force-ssl` and almost certainly blocked the same way.

Given that, the whole feature was removed rather than left half-working: the `playlistField` step
slot, its `appendDataFieldPicker` row, the Quick Add bundle's Playlist entry, `youtube.js`'s
`addToPlaylist`/`extractPlaylistId`/`PLAYLIST_ITEMS_URL`, and the unused `config.youtube.playlistId`
(a vestigial field from an earlier design, never actually read by `runYouTubeUpload`, cleaned up
alongside). The video itself still uploads correctly with title, description, and privacy status;
adding it to a playlist is a manual step in YouTube Studio afterward, called out in the in-app
walkthrough (`src/control/index.html`).

**Confirmed live while investigating, worth keeping in case a future scope change is attempted:**
on the "Google Auth Platform" redesign, clicking through from Studio's "OAuth consent screen" link
lands on **Overview**, not a scopes page -- scopes are configured from a separate **Data Access**
tab in that same left sidebar (Overview/Branding/Audience/Clients/**Data Access**/Verification
Center/Settings), via its own **Add or remove scopes** button and a **manually add scopes** entry
box for a scope not in the common list it shows by default. This specific attempt never got far
enough to need it, since Google's device-code endpoint rejected the scope before any Console
change would have mattered.

### The "checkbox" Metadata field type

Added specifically to make `madeForKidsField` possible (`publicField`, the other original reason,
was since replaced by the string-valued `visibilityField` above) -- Metadata previously had no
boolean-shaped field (`text`/`number`/`textNumber`/`numberText` only). `sanitizeMetadataField`
(`src/config.js`) gives it the same `{id, label, key, type, value}` shape as `text`, just with
`value` coerced to `Boolean` instead of a string. Composes to `"Yes"`/`"No"` wherever a string
representation is needed (`composeMetadataFieldValue` and `previewDataField` in
`src/control/control.js`, `resolveDataField` in `src/main.js`) -- deliberately not `"true"`/`"false"`,
matching the read-mode display's own voice rather than a raw type coercion. Edit mode renders a
real `<input type="checkbox">` (`renderMetadataFields`, `src/control/control.js`) instead of the
text/number `<input>` every other simple type gets; `.metadata-field-checkbox` in `control.css`
strips the shared text-input box styling (background/border/padding) that would otherwise wrap a
native checkbox in an odd-looking frame.

`checkboxMetadataFieldGroups()` (`src/control/control.js`) is `dataFieldGroups()`'s narrower
cousin, used only by the "Made for kids" picker (the one checkbox-only slot left after
`visibilityField` replaced the checkbox-typed `publicField`) -- it skips Date & Time and every
registered-fields group entirely, since only a Metadata field can ever be `checkbox`-typed, listing
options that could never validly be picked would just be noise.

### Text became template-aware; "Template" as a separate type is gone

A "Template" Metadata field type existed briefly, for composing other fields into one value the
way `applySessionFilename`'s format string does (`{sessionParty} {sessionSeason}{sessionEpisode} -
{sessionCampaign} - {sessionTitle}`). It never earned its own type: its stored shape was already
identical to Text's (`{id, label, key, type, value}`, same limits), and the only difference was
what `resolveDataField` did with that string at read time -- Text returned it as-is, Template
expanded any `{token}` in it first. Since a plain value with no `{..}` in it passes through that
expansion completely unchanged, Template was a strict superset of Text's behavior, not a genuinely
different capability -- a distinction that added a choice to the "New" field form without adding
anything a Text field couldn't already do once expansion applied to it too.

Merged: `resolveDataField` (`src/main.js`) and its two client-side mirrors (`previewDataField`,
`composeMetadataFieldValue`, `src/control/control.js`) now expand `{token}`s for any `text`-typed
field unconditionally, with the same cycle guard (a `chain` `Set` of keys already being expanded on
this branch) a self- or circularly-referencing field always needed. `sanitizeMetadataField`
(`src/config.js`) dropped `'template'` from `METADATA_FIELD_TYPES` entirely -- since that list is
also the allow-list a field's stored `type` is checked against, any existing `template`-typed field
gets coerced back to `text` automatically (falls through to the `'text'` default) the next time
config is sanitized, with no separate migration step needed. `Number` deliberately stays a plain
passthrough, not expansion-aware -- it's a number, not a composable string, and nothing asked for
`{token}`s inside a numeric value.

### What's not built, or not verified

Said plainly, because this landed unattended and needs a real pass with actual Google credentials
before anyone trusts it against a real recording:

- **Confirmed working end-to-end against the real API, including a real upload.** The person who
  owns this feature went through setup live: `requestDeviceCode` got a real code from Google
  (`YBD-VQW-NKWN`, then `BDQ-CHT-MPF` after a second request after the first was accidentally
  invalidated -- see below), approval completed at `google.com/device`, `pollForToken` returned
  real tokens, and a full recording upload completed for real (`youtube.uploadVideo`'s resumable
  chunked PUT loop confirmed working against the actual API, landing at a real
  `https://youtu.be/...` URL). The one real failure the live run surfaced was the playlist step,
  covered below. One real, live-confirmed correction already made: Google is mid-rollout of a
  redesigned console UI ("Google Auth Platform" -- a left-sidebar layout with
  Overview/Branding/**Audience**/**Clients**/Data Access/Verification Center/Settings tabs) that
  some accounts see instead of the classic single-page "OAuth consent screen" wizard this was
  originally written against. In the new layout, **Test users** moves to the **Audience** tab,
  separate from the branding/scope fields -- confirmed the hard way: skipping it produces `Error
  403: access_denied` on sign-in even though every other step was done correctly. The in-app setup
  walkthrough (`src/control/index.html`) now mentions both layouts; this doc is the fuller
  account. The **Audience** tab's own layout, confirmed live: **Publishing status** (Testing/Publish
  app) and **User type** (External/Internal) at the top, an **OAuth user cap** meter (100 users
  total over the app's lifetime while in Testing, test users counted against it), then **Test
  users** with its own **+ Add users** button opening a slide-out panel -- one email address per
  entry, up to 100 characters, a plain **Save** button beneath it. No approval step of its own;
  saving there is enough. Two more screens confirmed as normal, expected parts of the flow for an
  unverified test app (not errors): a "Google hasn't verified this app" interstitial (shown to
  every test user because the app was never submitted for full verification -- Continue past it),
  then the actual scope-grant screen ("Coffee Pub Studio wants access to your Google Account... Manage
  your YouTube videos") which is what the Test User membership actually gates.
- **One real mistake worth recording so it isn't repeated**: clicking "Connect" in Studio to
  inspect the device-code UI while a real approval was already pending invalidated that pending
  code -- `requestDeviceCode` always asks Google for a brand-new code, there is no "just show me
  the current one" request. Don't click Connect to test the UI while a real connect attempt from
  the person who owns this feature might be in flight; ask first.
- **A real bug the live test surfaced**: clicking the verification-URL link did nothing, with no
  feedback of any kind. Root cause -- `youtube:openVerificationUrl` (main.js) silently no-ops when
  `youtubeConnectState` is already `null` (code expired, or the connect already finished), and the
  renderer showed nothing when that happened. Fixed by having the handler return `{ ok }` and the
  renderer show an error toast ("That code has expired -- click Connect again") on `ok: false`.
  This also surfaced a broader gap: one-off confirmations like "Code copied" only ever wrote to the
  small footer status line, which is easy to miss. Added a proper toast notification system
  (`showToast()` in `src/control/control.js`, `#toast-container` in `src/control/index.html`,
  `.toast` rules in `src/control/control.css`) -- bottom-right, auto-dismissing, stackable -- and
  moved all one-off clipboard/link confirmations (view link, token, region address, the YouTube
  device code, opening the verification URL) onto it instead of the footer.
- **Quick Add for Metadata fields.** Hand-creating whatever fields the Recording Filename template
  references (and getting each key exactly right) was real setup friction, so the Metadata tab has
  a "Quick Add" section above the field list (`QUICK_ADD_BUNDLES` in `src/control/control.js`) --
  one button per bundle, shown only when it would actually add something. Today there's one bundle:
  it parses `config.session.filenameFormat` for `{field}` tokens and offers to create whichever
  aren't reserved built-ins and don't already exist, so it never goes stale as the template
  changes. A second bundle, for the (then five, now four) fields `uploadToYouTube` expects, existed
  briefly and was removed once the field-key naming question below made it unnecessary -- with only
  two YouTube-only fields left after Playlist was removed, a bulk-add button wasn't worth its own
  upkeep next to the plain "New" flow.
- **The "Category" selector, `New` field form.** Every field created through "New" used to get an
  auto-slugged `session*` key unconditionally (`slugMetadataKey`, `src/control/control.js`), which
  fits Title/Description/etc. since those are genuinely session-wide data reused elsewhere
  (filenames, overlays). But "Made For Kids" and "Public" (as it was called then) aren't session
  data at all -- they're COPPA/publish-status flags meaningful only to YouTube -- so a field like
  that ending up `sessionNotMadeForKids` (its name at the time) was actively misleading, not just
  inconsistently named. `slugMetadataKey`
  and `uniqueMetadataKey` now take a `category` ("session", the default, or "youtube") and prefix
  the key accordingly; the New field form's **Category** dropdown sets it, defaulting to Session so
  existing muscle memory (label in, key out) is unchanged unless YouTube is deliberately picked.
  Safe to do because keys freeze at creation and are never regenerated from the label (see the
  comment on `slugMetadataKey`) -- this is a parameter on the same generation function, not a
  special case bolted on beside it.
- **No thumbnail upload.** Scoped out deliberately to land a working core rather than a sprawling
  half-finished one -- `videos.insert` doesn't take a thumbnail directly; it needs a separate
  `thumbnails.set` call with its own image upload, a reasonable follow-up once the core path is
  confirmed working.
- **Interrupted uploads resume (built, not yet exercised live).** `uploadVideo` saves the resumable
  session URL, plus a fingerprint (file path, size, mtime, and the metadata JSON), into the same
  encrypted `youtube-secret.bin` blob as the refresh token -- the URL is a bearer capability, so it
  isn't kept in a plain file. On the next upload it's reused only if the fingerprint matches
  exactly (the title and the rest are fixed when a session starts, so resuming one made for
  different metadata would publish the old title), after asking YouTube how much it already has
  (a zero-length `PUT` with `Content-Range: bytes */total`). A 404/410 (expired session) or any
  probe failure falls back to a fresh start; a completed upload, or a chunk answered with 404/410,
  clears the saved session. Cancelled, crashed, app-quit and out-of-retries uploads all leave it
  in place. Token expiry is not a concern: the access token is used only to start the session,
  and every chunk `PUT` and the resume probe go to the self-authenticating session URL with no
  `Authorization` header, so an upload can outlast the token's roughly one-hour life. What does
  expire is the session itself (about a week for an unfinished one), which falls back to a fresh
  start as described above.
- **No playlist support.** Tried, and removed after Google's device-code endpoint rejected the
  broader scope it needs -- see "Playlist support (tried, removed)" above for the full account.
- **Quota was not re-confirmed against a real project.** The original planning doc flagged
  YouTube's Data API daily quota as worth checking before building; per Google's publicly documented
  cost table a resumable video upload costs roughly 1600 units against a 10,000-unit default daily
  quota, so one upload per session (the stated use case) has wide headroom -- but this is read from
  documentation, not confirmed against the user's own Google Cloud project, which could have a
  different quota depending on its history.

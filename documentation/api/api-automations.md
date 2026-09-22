# Automations API

**Audience:** anyone writing a Foundry module (or anything else) that reports events to Coffee
Pub Studio, or driving Studio's manual OBS remote directly.

Studio runs a small local HTTPS server that a Foundry module -- Coffee Pub Herald first -- calls
to report an event (combat starting, a scene changing), which a user-configured rule set on
Studio's Automations tab turns into a numbered sequence of OBS and Studio actions. See
[Automations architecture](../architecture/architecture-automations.md) for how the server itself
is built.

## Where it runs

Foundry usually runs on a different machine than Studio, so the server listens on every network
interface Studio's Mac has, not just localhost, and is reachable at
`https://<studio-host>:<port>` -- the address and port are shown on Studio's Configuration tab,
under Automations, once it is enabled. The port defaults to 9500 and is configurable there.

Every request needs a Bearer token, generated and shown in the same place. There is no
unauthenticated route except `GET /ca.crt`, described below.

## HTTPS, not HTTP

Foundry is commonly served over HTTPS itself, and a browser flatly blocks an HTTPS page from
making a plain-HTTP request at all ("mixed content"); no CORS header gets around it. Studio runs
its own small local Certificate Authority for this: a root generated once and reused, which signs
the server's actual certificate. The server only ever presents that signed certificate, never the
CA's private key.

A browser calling this API for the first time needs to trust that certificate once, in one of two
ways -- both are click-by-click in Studio's own Automations settings card, not repeated here since
they change as the UI does:

- Open the server's address directly in the browser once and click through the warning. Quick, but
  tied to that one browser and to the current certificate -- it stops working the moment Studio's
  Mac address changes and the certificate is regenerated to match.
- Install the CA's certificate (`GET /ca.crt`, unauthenticated -- a CA's public certificate is not
  a secret, only its private key is, which never leaves Studio's Mac) into the calling machine's
  trust store once. Every certificate this CA ever issues is trusted after that, in every browser
  on that machine, permanently.

Neither step is needed when the calling code runs inside one of Studio's own windows: Studio
recognizes its own certificate for its own webContents and trusts it automatically. See
[Automations architecture](../architecture/architecture-automations.md) for why that case needs
no manual step at all.

## POST /api/automations/event

Reports that something happened, running whichever rule set(s) are configured to react to it. To
run a single action directly, with no rule set involved, see
[`POST /api/automations/action`](#post-apiautomationsaction) below instead.

```
POST https://<studio-host>:<port>/api/automations/event
Authorization: Bearer <token>
Content-Type: application/json

{"event": "combat:start", "data": {"sceneId": "..."}}
```

- `event` (string, required) is matched against a rule set's trigger event exactly, case-sensitive,
  no wildcards. Studio does not interpret the string beyond comparing it, so the vocabulary
  (`combat:start`, `combat:end`, `scene:change`, and so on) is decided and documented on the
  calling module's side. This is also how a caller triggers a rule set on demand, by name, from a
  menu built from `GET /api/automations/capabilities` below: just POST the same event a rule set
  is configured to react to.
- `data` (object, optional) is shown back in Studio's Recent Events log for a human to read, and
  is also what a `setText` step reads its value from (see the actions table below) and what
  `applySessionFilename`'s `{title}`/`{campaign}` placeholders come from. Sending whatever is
  cheaply available (a scene name, a combat id) beyond what a rule set actually uses still costs
  nothing.
- `prompts` (object, optional) answers whatever a matched rule set's `prompts` (see
  `GET /capabilities` below) says it needs -- `{"sessionTitle": "Darn Skarn"}`. **Checked before
  anything else happens**: if any matched rule set (or anything it reaches via a `runRuleSet` step,
  recursively) requires a "prompt"-type Metadata field that is *currently blank*, and this object
  doesn't supply a real (non-blank) value for it, the whole request is refused --
  `400 {"error": "Missing required prompt value(s): Title"}` -- and nothing is recorded or
  dispatched. This check happens synchronously, before the response, unlike everything else about
  this endpoint. A required field that already holds *any* value (answered by an earlier, different
  call) is satisfied without being supplied again -- a title answered once at the start of a
  recording is not demanded a second time just because a later step, in a later call, also reads it.
  A value supplied here still always overwrites whatever's currently stored, so re-answering (or
  updating) a field that already has a value works exactly the same as answering it for the first
  time. See "Metadata field types" below for what makes a field require this at all, and for
  `clearMetadataField` -- the action that resets a Prompt field back to blank, which is what makes
  it ask fresh again the *next* time, rather than silently reusing one answer forever.
- The response is always JSON: `{"ok": true}` on success, `{"error": "..."}` with a 400 (bad
  request, including a failed prompts check above), 401 (missing or wrong token), or 404 (wrong
  path or method) otherwise.
- A 200 means Studio accepted and logged the event, not that a matched rule set's sequence
  succeeded, or even finished -- rule set dispatch is asynchronous and independent of this
  response, runs every matched rule set at once (one does not wait for another), and a step that
  fails (OBS not connected, a scene that does not exist) is logged on Studio's side and does not
  stop the rest of that rule set's sequence. The `prompts` check above is the one exception to
  "asynchronous and independent" -- it has to happen before the response, since the whole point is
  refusing to run at all, not running with a blank.
- The body is capped at 16 KB and must be valid JSON with a string `event` field, or the request
  is rejected before anything is recorded.

## GET /api/automations/ping

Same auth as the event endpoint. Returns `{"ok": true}`. A cheap way to check the token and the
connection alone, without reporting an event.

## GET /api/automations/status

Same auth. OBS's actual current state, for something like a live recording indicator -- not
whatever a caller last told itself happened, which would drift the moment someone starts or stops
recording from inside OBS directly, or an automation action fails silently on Studio's side.

```json
{ "obsConnected": true, "recording": true, "recordingPaused": false, "streaming": false, "scene": "3. PLAY VIEW" }
```

Answered from Studio's own already-polled cache (`src/obs.js` polls OBS every 2 seconds while
connected) -- this never makes a fresh OBS round trip of its own, so polling it faster than every
2-3 seconds gains nothing. When `obsConnected` is `false`, the rest are all their empty/false
defaults, not an error -- there is nothing to report yet, the same as everywhere else this API
behaves that way. No push option (WebSocket/SSE) exists for this today; the whole server is a
plain stateless HTTPS request/response server by design (see
[Automations architecture](../architecture/architecture-automations.md)), and a 2-3 second poll is
more than fast enough for a menu bar indicator.

## GET /api/automations/capabilities

Same auth. Returns what Studio can actually do right now, so a caller does not have to hardcode
or guess either:

```json
{
  "actions": [
    { "action": "sceneSwitch", "param": "scene name", "paramType": "scene", "group": "Scenes" },
    { "action": "sourceShow", "param": "source name", "paramType": "source", "group": "Sources" },
    { "action": "startRecording", "param": null, "paramType": "none", "group": "Controls" },
    { "action": "wakeAudio", "label": "Wake audio (every open window)", "param": null, "paramType": "none", "group": "Studio Control" }
  ],
  "ruleSets": [
    { "name": "Combat Start", "group": "Combat", "event": "combat:start" },
    { "name": "Begin Session Recording", "group": "Recording", "event": "session:StartRecording",
      "prompts": [{ "key": "sessionTitle", "label": "Title" }] }
  ],
  "scenes": [
    { "name": "1. Title Sequence", "current": false },
    { "name": "3. PLAY VIEW", "current": true }
  ],
  "sources": ["Window: Game (CP Studio)", "Region: Stream>Chat Feed (CP Studio)"],
  "metadataFields": [
    { "key": "sessionTitle", "label": "Title", "type": "prompt" },
    { "key": "sessionSeason", "label": "Season", "type": "textNumber" }
  ]
}
```

`actions` is the fixed vocabulary of every action available right now -- OBS actions (see the
table below) plus every Studio action, unconditionally (a Studio action carries a `label` since
there's no single verb for most of them). The only gate on either kind is the `token` this
request itself needs.
`group` on each is meant for building a menu -- `"Controls"`, `"Scenes"`, `"Sources"`, or
`"Studio Control"` -- grouped the same way Studio's own OBS Control card is laid out. `paramType`
says what kind of thing `param` holds (`"scene"`, `"source"`, `"ruleSet"`, `"metadataField"`,
`"youtubeUpload"`, or `"none"`) -- `youtubeUpload` (`uploadToYouTube` alone) is the one exception to
"one param": it has five named fields instead (see the Studio actions table below), not
discoverable or callable meaningfully via this API at all -- Studio's own step editor is the only
place that builds it. `scenes` and `sources` below are the actual live values to offer for those two kinds, the same way Studio's own
step editor turns a `param` field into a dropdown instead of free text. Both are read from OBS
fresh on every capabilities request (a real round trip, not cached), so `scenes[].current` always
reflects whichever scene is live right now, matching Studio's own OBS Control card highlighting
it. Empty arrays, not an error, when OBS isn't connected -- there is nothing to offer yet, same as
Studio's own card in that state.

`metadataFields` is every Metadata field configured on Studio's Session tab right now -- its
`key` (what a `metadataField`-typed `param` actually needs), `label` (what a human named it), and
`type` (`"text"`, `"number"`, `"textNumber"`, `"numberText"`, `"checkbox"`, or `"prompt"` -- see
"Prompt fields" below). This is what makes `incrementMetadataField`/`decrementMetadataField`/
`setMetadataField` genuinely usable by an external caller instead of only from Studio's own step
editor: without it, a module like Herald would have to hardcode a field key it was told out of
band (`"sessionTitle"`), which breaks the moment it talks to a different Studio setup where the
person running it named things differently. With it, a caller can build its own settings picker --
"Which Studio field should hold the Title?" -- filtered to whichever `type` its own action needs
(`setMetadataField` only ever accepts `"text"`; increment/decrement only accept `"number"`/
`"textNumber"`/`"numberText"`), populated from this list, the same way Studio's own rule-set
editor already filters its Metadata-field picker by type. Read fresh from config on every
capabilities request, same as `ruleSets` below -- not cached, so a field renamed or deleted on
Studio's Session tab shows up (or disappears) the next time a caller re-checks.

`ruleSets` is whatever is actually configured and enabled on the Automations tab right now: each
one's `name`, `group`, `event`, and `prompts` -- not its internal step sequence, which is Studio's
own business. A caller can use this to build a menu of rule sets grouped the same way
(`"Combat" > "Combat Start"`), where clicking one simply POSTs its `event` to
`/api/automations/event` -- the same request an automatic trigger would send, and the same way a
manual "run this rule set now" and an automatic trigger both work. It is also useful for
validating that an event name is wired to something before sending it.

`prompts` is every `"prompt"`-type Metadata field this rule set needs answered to run -- `{key,
label}`, same shape as `metadataFields` entries. A caller doesn't need to inspect a rule set's
steps or understand what any of them do: an empty array means "just POST the event," a non-empty
one means "collect an answer for each label, then POST the event with those answers in `prompts`
(see below), or the request will be refused." This is computed by walking the rule set's actual
steps -- including recursively into anything it reaches via a `runRuleSet` step -- so a rule set
like `"Begin Session Recording"` in the example above correctly shows `sessionTitle` as required
even though nothing in its own steps mentions that key directly; only a rule set it calls does.

## Prompt fields: fields with no value except by asking

A Metadata field's `type` can be `"prompt"` -- stored and resolved exactly like `"text"`, with one
restriction: it has no other way to get a value. It isn't editable on Studio's own Session tab, and
`setMetadataField` refuses to target one directly (Text only). The *only* way a Prompt field's
value ever changes is by supplying it in `prompts` on a `POST /api/automations/event` call that
triggers a rule set needing it -- see that endpoint above -- or by `clearMetadataField` resetting it
back to blank (below).

A field already holding a value is satisfied without being asked again -- a title answered once
stays answered until something explicitly clears it, not just until the next call. That "something"
is **`clearMetadataField`** (`param`: a Prompt field's key), a Studio action like any other,
available as a rule-set step or via `POST /api/automations/action`: it resets the field straight
back to blank, with no other effect. Without ever calling it, a Prompt field would only ever be
asked once, the first time -- every later run touching it would just keep reusing that same answer
forever, which defeats the point of a Prompt field for anything that's meant to change per
recording. Placing a `clearMetadataField` step wherever a prompted value's own lifecycle is actually
over (the end of an upload step, say) is what makes the *next* recording ask fresh again, instead of
silently carrying the last one's answer forward. Studio has no built-in notion of "this episode is
over" -- that placement is a deliberate choice on whoever builds the rule set, not something
inferred automatically.

This whole mechanism is the intended replacement for hardcoding a Metadata field mapping in a
module's own settings: rather than Herald's settings screen asking "which Studio field is Title?"
once, up front, Herald's *menu* can be fully generic -- list whatever `GET /capabilities` returns,
and for any rule set with a non-empty `prompts`, ask for those labels right before firing it, only
when actually needed (blank), reusing an answer it already has in hand otherwise. Neither Herald nor
its settings screen ever needs to know a specific key like `"sessionTitle"` exists.

## POST /api/automations/action

Runs one action from the `actions` list right now, no rule set involved -- the bare-action
counterpart to `/api/automations/event`'s rule-set matching. This is what actually makes the
Controls/Scenes/Sources/Studio Control groups in `GET /api/automations/capabilities` clickable
rather than only informational: without it, an action is only reachable if a rule set happens to
be configured with a step that uses it.

```
POST https://<studio-host>:<port>/api/automations/action
Authorization: Bearer <token>
Content-Type: application/json

{"action": "sceneSwitch", "param": "Combat"}
```

- `action` (string, required) must be one of the `action` values `GET /capabilities` returns -- a
  made-up name is rejected: `400 {"error": "Unknown or currently disabled action: ..."}`.
- `param` (string, optional) means whatever that action's `paramType` says -- a scene name, a
  source name, or unused. Missing where one is required fails the same way it would from a rule
  set's own step (`sceneSwitch` needs a scene name, and so on).
- Unlike `/event`, this **is** synchronous: the response reflects whether the action actually
  succeeded, not just whether Studio accepted the request. `200 {"ok": true}` means it ran;
  otherwise `400` (bad request) or `500` (the action itself failed -- OBS not connected, a scene
  that doesn't exist) with `{"error": "..."}` explaining why.
- `data` (object, optional): for `setText`, an alternative to `param` alone -- reads `data.text`
  as the literal value to write. There is no way to pick a different key from a direct call the
  way a saved rule-set step's own `dataField` can; that only matters once a rule set is involved.

## POST /api/automations/fields

Declares which fields a caller will actually put in a future `POST /event`'s `data` -- the other
half of the discovery `GET /capabilities` already gives a caller about Studio. Without this, a
`setText` step's "Data Field" option has nothing to offer but a blind free-text box, guessing
against an undocumented contract; with it, that becomes a real dropdown of what a connected module
says it provides, the same way scene/source pickers work from live OBS data.

```
POST https://<studio-host>:<port>/api/automations/fields
Authorization: Bearer <token>
Content-Type: application/json

{
  "module": "herald",
  "fields": [
    {"key": "title", "label": "Episode Title"},
    {"key": "campaign", "label": "Campaign Name"}
  ]
}
```

- `module` (string, required) -- a short, stable name identifying *your* module (`"herald"`, not
  `"Herald v2.3"` -- pick one name and keep calling with that same name). **Required as of this
  version**; a request without it gets `400 {"error": "\"module\" is required"}`. This exists
  because registration is scoped per module (see below) -- Studio needs to know whose list it's
  replacing.
- `fields` (array, required) -- each entry needs a `key` (string; what actually appears in a
  future `data` object) and may include a human-readable `label` (defaults to `key` if omitted or
  blank).
- This call is **wholesale replacement of your own module's fields only**, not additive and not
  global -- send your full current list every time, not just what changed, and it will not affect
  what any other module has registered. Call it once when connecting, and again whenever the set of
  fields you provide changes; there's no need to track what was registered last time.
- Kept in memory only, like the recent-events log -- reset on a Studio restart, gone until your
  module reconnects and registers again. There is nothing to read back over HTTP; this is
  Studio-UI-facing state (the "Data Field" dropdown), not something a caller queries.
- Response: `200 {"ok": true, "fields": [...]}` (the sanitized list actually stored for *your*
  module) or `400` for a malformed body or a missing `module`.

**Reserved keys.** Studio has its own built-in Data Field entries that always exist, plus whatever
the person running Studio creates themselves on the Session tab -- `sessionTime`, `sessionDate`,
`sessionDay`, `sessionMonth`, `sessionYear`, and any `session<Something>` key a user-created field
has claimed. If your module registers a field using one of those exact keys, Studio's own field of
that name wins in the "Data Field" dropdown -- yours is not deleted or rejected, just shadowed.
Pick a more specific key if this matters to you (`heraldSessionYear` rather than `sessionYear`).

## GET /ca.crt

Unauthenticated. Downloads the CA's certificate (`coffee-pub-studio-ca.crt`), described above
under HTTPS.

## Actions a rule set step can run

| Action | Group | What it does | `param` |
| --- | --- | --- | --- |
| `sceneSwitch` | Scenes | Switches OBS to the named scene | the exact scene name |
| `sourceShow` | Sources | Makes a source visible in every scene it is used in | the exact OBS source name |
| `sourceHide` | Sources | Hides a source in every scene it is used in | the exact OBS source name |
| `sourceToggle` | Sources | Flips a source's current visibility -- one event both shows and hides, so a caller does not need to track state itself or send two different events | the exact OBS source name |
| `setText` | Sources | Overwrites a text source's displayed text | the exact OBS source name |
| `startRecording` | Controls | Starts OBS recording | not used |
| `pauseRecording` | Controls | Pauses OBS recording (recording must already be running) | not used |
| `resumeRecording` | Controls | Resumes a paused OBS recording | not used |
| `stopRecording` | Controls | Stops OBS recording | not used |
| `startStreaming` | Controls | Starts OBS streaming | not used |
| `stopStreaming` | Controls | Stops OBS streaming | not used |

All eleven reuse the same OBS WebSocket connection Studio already keeps for everything else; there
is no separate connection or credential for Automations to reach OBS, and all eleven need it
connected.

`setText`'s actual text does not come from `param` (that names which source to write to) -- a
rule-set step picks one of three sources for it, entirely Studio's own business, not part of this
API's contract: a fixed value typed once, a local file Studio re-reads every run, or a key read
from the triggering event's own `data`. Only that last kind involves a caller at all -- and only
a key that's actually been declared via `POST /api/automations/fields` shows up as a choice in
Studio's own step editor, rather than being typed blind. A direct `POST /api/automations/action`
call is simpler: it always just reads `data.text` literally (see above), no per-request key choice
the way a saved step's own field selection gives it.

So `{"event": "session:start", "data": {"title": "Darn Skarn", "campaign": "The Burden of
Knowledge"}}`, after registering `title` and `campaign` via `POST /api/automations/fields`, can
drive two different `setText` steps in one rule set -- one reading `title`, one reading
`campaign` -- each writing a different source.

`sceneSwitch` restarts the scene if it is already the active one, rather than the no-op OBS itself
makes of "switch to the scene already showing" -- otherwise nothing in that scene (a media source,
a browser source set to refresh when the scene becomes active) would restart just because the same
event fired again. It does this by briefly switching to another scene first; only `sceneSwitch`
does this, and only when the target is already current -- Studio's own manual scene buttons stay a
genuine no-op.

## Studio actions

Always available, same as OBS actions -- the token on this request is the only gate. Reach into
Studio itself, not OBS, so (`syncObs`/`applySessionFilename` aside) they work even while OBS is
disconnected:

| Action | What it does |
| --- | --- |
| `wakeAudio` | Sends every currently open window the same interaction FoundryVTT needs to unlock its own audio, the same as the **Wake audio** button |
| `startAll` | Opens every window configured to start |
| `stopAll` | Closes every open window |
| `dockAll` | Slides every open window into the edge dock |
| `undockAll` | Brings every docked window back out |
| `syncObs` | Re-points every OBS source at its window/region/Tavern source, the same as **Sync OBS** |
| `applySessionFilename` | Writes the Automations tab's Recording Filename card's **Filename format** template into OBS's own Filename Formatting setting. Fails with a clear error rather than doing anything if no template is set |
| `runRuleSet` | Runs another rule set by id (`param`), inline -- its stages run in order same as a real trigger, and the caller's own run doesn't continue until it finishes. Refuses with an error rather than looping if the target is already running further up the same call chain |
| `incrementMetadataField` / `decrementMetadataField` | Adds or subtracts 1 from a Metadata field (`param`, its `key`) -- a plain Number field's value, or a Text+Number/Number+Text field's number segment. Fails with a clear error if the field doesn't exist or isn't a Number-shaped type |
| `setMetadataField` | Writes an explicit value into a Text-type Metadata field (`param`, its `key`), replacing whatever was there -- the persistence increment/decrement give Number fields, generalized to an explicit set. This is what lets a value outlive a single request: set a Metadata field now, and a *later, separate* call (a different event, run minutes afterward) that reads the same field back -- `applySessionFilename`'s `{sessionTitle}`, say, or `uploadToYouTube`'s `descriptionField` -- sees it. Fails with a clear error if the field doesn't exist or isn't Text-shaped (a Number/Text+Number/Number+Text field already has increment/decrement; a checkbox's only sensible values are boolean) |
| `clearMetadataField` | Resets a Prompt-type Metadata field (`param`, its `key`) back to blank -- the other half of "Prompt fields" above: what makes a field ask fresh again the *next* time it's needed, instead of an old answer silently satisfying every future run forever. Fails with a clear error if the field doesn't exist or isn't Prompt-shaped |
| `uploadToYouTube` | Uploads a recording (the most recent one OBS reported, unless the step overrides it) to YouTube. Not driven by `param` at all -- five separate Metadata field keys instead (`titleField`, `descriptionField`, `categoryField`, `madeForKidsField`, `visibilityField`), configured on the step, not passable through this API. No playlist support -- see `architecture-automations.md`'s "Uploading a recording to YouTube" for why |

`setMetadataField`'s value, on a direct `POST /api/automations/action` call, comes from `data.value`
(a literal string) -- the same shape `setText` uses for `data.text`, just a different key name since
"the value to store in this field" reads more plainly than reusing `setText`'s own key for an
unrelated action:

```
POST https://<studio-host>:<port>/api/automations/action
Authorization: Bearer <token>
Content-Type: application/json

{"action": "setMetadataField", "param": "sessionTitle", "data": {"value": "Darn Skarn"}}
```

A Metadata field's `key` isn't listed anywhere in this API today (no endpoint enumerates
`config.metadataFields`), so in practice these (and `uploadToYouTube`'s five) are picked from
Studio's own step editor, which already has the list, rather than typed blind by an external caller.

`runRuleSet` is really a Studio-internal composition primitive -- built so one rule set's own steps
can call another (a small "Bump Numbers" rule set called from a bigger "Record Session" one, say),
picked from a dropdown in Studio's own step editor. Its `param` is a rule set's `id`, deliberately
*not* discoverable from `GET /capabilities` -- that endpoint's `ruleSets` only ever carries
`name`/`group`/`event`, on purpose (see the comment at its call site), since a caller doesn't need
a rule set's internals to trigger it by name. An external caller wanting to run a specific rule set
should keep using `POST /event` with its `event` string, same as always; `runRuleSet` still appears
in `actions` since every Studio action is now listed unconditionally, but there is no supported way
for an external caller to obtain a valid id for it.

The template accepts `{title}`/`{campaign}` (the triggering event's `data.title`/`data.campaign`,
blank if absent) as fixed names, kept for backward compatibility. Any *other* `{name}` in the
template is resolved the same way a `setText` step's Data Field picker would: a Studio-defined
Metadata field by its own key (`{sessionCampaign}`) or an evergreen field (`{sessionTime}`,
`{sessionDate}`, ...) -- always a plain read. Changing a Metadata field's value is a separate,
explicit action (`incrementMetadataField`/`decrementMetadataField`/`setMetadataField`, in the
Studio actions table below), not something referencing it in a template can trigger. A name that
doesn't resolve to anything Studio knows about is left as the literal triggering event's
`data[name]` if present, blank otherwise. OBS's own `%`-style recording macros (`%CCYY`, `%MM`,
and so on) in the filename format pass through untouched either way -- only `{...}`-bracketed
names are ever substituted; any value that *is* substituted in, though, has filesystem-reserved
characters (`\ / : * ? " < > |` and control characters) stripped first -- a Metadata field or an
evergreen field like `{sessionDate}` (a US-locale date reads `9/18/2026`) can otherwise put a
literal `/` into the composed string, which OBS then writes as a real directory separator instead
of text, silently turning one recording into several nested folders. Only the substituted value is
sanitized; a literal character typed directly into the template itself is left alone.

## Sequences, delays, and running steps together

A rule set's steps run in the numbered order shown on the Automations tab. A delay step is a
plain timer Studio keeps itself -- there is no OBS WebSocket event for "this scene change is
done," so nothing here waits on OBS to confirm anything, only on the clock. A step marked AND
fires at the same time as the step before it instead of waiting for it, so "switch to scene Wide
AND show source Lower Third" is one stage, not two. A step can also be gated on whether the stage
before it succeeded or failed ("On Success"/"On Failure", the default being "Always") -- a stage
whose gate isn't met is skipped outright, and a delay or another skipped stage doesn't reset which
outcome the *next* gated stage checks against. All of this is Studio-side sequencing, invisible to
a caller of this API, which only ever sees the rule set's name/group/event/prompts via
`GET /api/automations/capabilities`.

## Example: reporting combat start

This is a suggested starting point, not a contract Studio enforces -- the actual hook names and
timing are the calling module's call, and worth confirming against a live client the same way any
Foundry hook usage should be, since a hook that silently does not fire in a given version fails
quiet, not loud.

Coffee Pub Herald already depends on Coffee Pub Blacksmith and its HookManager (see Blacksmith's
own `api-hookmanager` page), so registering through that is a natural fit, alongside two settings
for Studio's address and token:

```javascript
BlacksmithHookManager.registerHook({
  name: 'combatStart',
  description: 'Tell Coffee Pub Studio combat has started',
  context: 'herald-automations',
  callback: async (combat) => {
    const url = game.settings.get('coffee-pub-herald', 'studioAutomationsUrl'); // e.g. https://10.0.0.5:9500
    const token = game.settings.get('coffee-pub-herald', 'studioAutomationsToken');
    if (!url || !token) return;
    try {
      await fetch(`${url}/api/automations/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event: 'combat:start', data: { combatId: combat.id, sceneId: combat.scene?.id } }),
      });
    } catch (err) {
      console.warn('Herald | Could not reach Coffee Pub Studio', err);
    }
  },
});
```

Fire-and-forget is deliberate: a game should never stall or throw because Studio is unreachable,
and the 16 KB/JSON-shape check on Studio's side means a malformed or oversized body just gets a
400 rather than doing anything unexpected. `deleteCombat` is the natural pair for a `combat:end`
event; `canvasReady` fires on every scene change (`data: {sceneId: canvas.scene?.id}`) for a
`scene:change` event. None of the three are specific to Herald -- any module could report them
the same way.

## Example: session start with title and campaign

Register the fields once (at connect time is fine), so Studio's own rule-set editor can offer them
as a real dropdown instead of someone typing `title`/`campaign` blind:

```javascript
await fetch(`${url}/api/automations/fields`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    module: 'herald',
    fields: [
      { key: 'title', label: 'Episode Title' },
      { key: 'campaign', label: 'Campaign Name' },
    ],
  }),
});
```

Then a `session:start` event carrying both, for a rule set with two `setText` steps (each set to
"Data Field" in Studio's step editor, one picking `title`, one picking `campaign`) plus
`applySessionFilename` all AND-grouped into one stage:

```javascript
await fetch(`${url}/api/automations/event`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    event: 'session:start',
    data: { title: 'Darn Skarn', campaign: 'The Burden of Knowledge' },
  }),
});
```

Everything on Studio's side -- which sources get `title`/`campaign`, whether the episode number
increments, whether the filename format gets touched at all -- is entirely the rule set's own
configuration; this call looks identical regardless of what Studio does with it.

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
`https://<studio-host>:<port>` -- the address and port are shown on Studio's Session tab, under
Automations, once it is enabled. The port defaults to 9500 and is configurable there.

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
  `applyEpisodeText`/`applySessionFilename`'s `{title}`/`{campaign}` placeholders come from.
  Sending whatever is cheaply available (a scene name, a combat id) beyond what a rule set
  actually uses still costs nothing.
- The response is always JSON: `{"ok": true}` on success, `{"error": "..."}` with a 400 (bad
  request), 401 (missing or wrong token), or 404 (wrong path or method) otherwise.
- A 200 means Studio accepted and logged the event, not that a matched rule set's sequence
  succeeded, or even finished -- rule set dispatch is asynchronous and independent of this
  response, runs every matched rule set at once (one does not wait for another), and a step that
  fails (OBS not connected, a scene that does not exist) is logged on Studio's side and does not
  stop the rest of that rule set's sequence.
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
    { "name": "Combat Start", "group": "Combat", "event": "combat:start" }
  ],
  "scenes": [
    { "name": "1. Title Sequence", "current": false },
    { "name": "3. PLAY VIEW", "current": true }
  ],
  "sources": ["Window: Game (CP Studio)", "Region: Stream>Chat Feed (CP Studio)"]
}
```

`actions` is the fixed vocabulary of every action available right now -- OBS actions (see the
table below) plus whichever Studio actions are currently ticked on in the Studio Control card (off
by default; a Studio action carries a `label` since there's no single verb for most of them).
`group` on each is meant for building a menu -- `"Controls"`, `"Scenes"`, `"Sources"`, or
`"Studio Control"` -- grouped the same way Studio's own OBS Control card is laid out. `paramType`
says what kind of thing `param` holds (`"scene"`, `"source"`, or `"none"`) -- `scenes` and
`sources` below are the actual live values to offer for those two kinds, the same way Studio's own
step editor turns a `param` field into a dropdown instead of free text. Both are read from OBS
fresh on every capabilities request (a real round trip, not cached), so `scenes[].current` always
reflects whichever scene is live right now, matching Studio's own OBS Control card highlighting
it. Empty arrays, not an error, when OBS isn't connected -- there is nothing to offer yet, same as
Studio's own card in that state.

`ruleSets` is whatever is actually configured and enabled on the Automations tab right now: each
one's `name`, `group`, and the `event` that fires it -- not its internal step sequence, which is
Studio's own business. A caller can use this to build a menu of rule sets grouped the same way
(`"Combat" > "Combat Start"`), where clicking one simply POSTs its `event` to
`/api/automations/event` -- the same request an automatic trigger would send, and the same way a
manual "run this rule set now" and an automatic trigger both work. It is also useful for
validating that an event name is wired to something before sending it.

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

- `action` (string, required) must be one of the `action` values `GET /capabilities` currently
  returns -- that list already reflects which Studio actions are ticked on, so an action missing
  from it is rejected the same way a made-up name would be: `400 {"error": "Unknown or currently
  disabled action: ..."}`.
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
`sessionDay`, `sessionMonth`, `sessionYear`, `sessionSeasonNumber`, `sessionEpisodeNumber`, and any
`session<Something>` key a user-created field has claimed. If your module registers a field using
one of those exact keys, Studio's own field of that name wins in the "Data Field" dropdown --
yours is not deleted or rejected, just shadowed. Pick a more specific key if this matters to you
(`heraldSessionYear` rather than `sessionYear`).

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

Off by default -- see the Studio Control card on the Automations tab. Reach into Studio itself,
not OBS, so (`syncObs`/`applyEpisodeText`/`applySessionFilename` aside) they work even while OBS
is disconnected:

| Action | What it does |
| --- | --- |
| `wakeAudio` | Sends every currently open window the same interaction FoundryVTT needs to unlock its own audio, the same as the **Wake audio** button |
| `startAll` | Opens every window configured to start |
| `stopAll` | Closes every open window |
| `dockAll` | Slides every open window into the edge dock |
| `undockAll` | Brings every docked window back out |
| `syncObs` | Re-points every OBS source at its window/region/Tavern source, the same as **Sync OBS** |
| `incrementEpisode` | Bumps Studio's own stored episode number by 1 (season is untouched -- there is no auto-increment for that) |
| `applyEpisodeText` | Writes Studio's stored season/episode into the named text source, formatted by the Session tab's **Format** template |
| `applySessionFilename` | Writes the Session tab's Recording Filename card's **Filename format** template into OBS's own Filename Formatting setting. Fails with a clear error rather than doing anything unless **Enable filename automation** is ticked there and a template is set -- both off by default, deliberately, since this overwrites a real OBS setting |

Both templates accept `{season}` and `{episode}` (Studio's own stored numbers, Session tab, always
zero-padded to 2 digits) and `{title}`/`{campaign}` (the triggering event's `data.title`/
`data.campaign`, blank if absent) -- these four are kept as fixed names for backward compatibility.
Any *other* `{name}` in either template is resolved the same way a `setText` step's Data Field
picker would: a Studio-defined Metadata field by its own key (`{sessionCampaign}`), an evergreen
field (`{sessionTime}`, `{sessionDate}`, ...), or Season/Episode by their Data Field names
(`{sessionSeasonNumber}`, `{sessionEpisodeNumber}`) -- including their `+1`/`-1` variants
(`{sessionDaysLeft+1}`), which mutate and persist the field's stored value exactly as selecting
that variant from a `setText` step's picker would, not just a read. A name that doesn't resolve to
anything Studio knows about is left as the literal triggering event's `data[name]` if present,
blank otherwise. OBS's own `%`-style recording macros (`%CCYY`, `%MM`, and so on) in the filename
format pass through untouched either way -- only `{...}`-bracketed names are ever substituted.

## Sequences, delays, and running steps together

A rule set's steps run in the numbered order shown on the Automations tab. A delay step is a
plain timer Studio keeps itself -- there is no OBS WebSocket event for "this scene change is
done," so nothing here waits on OBS to confirm anything, only on the clock. A step marked AND
fires at the same time as the step before it instead of waiting for it, so "switch to scene Wide
AND show source Lower Third" is one stage, not two -- this is Studio-side sequencing, invisible to
a caller of this API, which only ever sees the rule set's name/group/event via
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
`incrementEpisode`, `applyEpisodeText`, and `applySessionFilename` all AND-grouped into one stage:

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

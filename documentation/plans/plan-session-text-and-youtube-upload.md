# Session text updates and automated YouTube upload

**Audience:** whoever picks this work up next (most likely me, next session).

Two related but separately-scoped pieces of post-production automation, both growing out of the
rule-sets rebuild: Herald-driven text sources plus Studio-managed season/episode numbering (this
one gets built tonight), and automated YouTube upload once a recording finishes (planned only,
explicitly on hold until the approach is nailed down).

## Part 1: Session text updates -- done

Built and verified live against the real OBS instance this was designed against (every write
captured beforehand and restored to its exact original value afterward): `applyEpisodeText`
reproduced the existing `Episode NUMBER` text byte-for-byte from the seeded season/episode;
`setText` round-tripped a test value through `Episode NAME` and back to `"Darn Skarn"`;
`applySessionFilename` substituted all four placeholders (`{season}`, `{episode}`, `{title}`,
`{campaign}`) correctly, zero-padding season/episode and leaving OBS's own `%CCYY`-style macros
untouched, then the real `FilenameFormatting` was restored exactly. `incrementEpisode`'s disabled
state was also confirmed to reject correctly once testing was done and `studioActions` was reset
to its original set -- these three new Studio actions are opt-in, same as every other one, and
start off.

Season/episode were seeded to `3`/`27` (matching the real, already-live `Episode NUMBER` text)
and `episodeSourceName` to `"Episode NUMBER"` (the real source), since that's just correctly
adopting the feature, not a guess. `filenameFormat` was deliberately left empty -- that one
determines whether `applySessionFilename` touches a real OBS setting at all, and typing the
right template (which needs to fold in the existing `%CCYY`-style macros by hand) is a decision
for whoever actually owns that recording setup, not something to seed with a guess.

### Addendum: `setText`'s value redesigned after real-world use

The first pass gave `setText` a single free-text `dataField` box (a key name to read from the
triggering event's `data`). Tried against the real app, it broke two ways: the rule set's own
"Test" button sent no data at all regardless of what was configured, so testing a `setText` step
always wrote blank text no matter what; and a literal test value ("Some title") got typed into
what was actually a lookup-key field, which just meant looking up a key that didn't exist -- also
blank. The deeper problem underneath both: there was no way for someone configuring a rule set to
know what keys a connected module would actually send, short of reading that module's own source.

Redesigned as a genuine three-way choice, "where it goes" (`param`, unchanged) kept separate from
"what it is": **Free Text** (a fixed value typed once, no external caller involved at all -- the
"swap between text presets" case), **File** (a local text file Studio re-reads every run, with a
native Browse dialog), and **Data Field** (a key read from the triggering event's `data`, now
populated as a real dropdown instead of typed blind). That last one needed the other half of the
handshake: `POST /api/automations/fields`, letting a connected module declare which fields it
actually provides (`{key, label}` pairs), the same discoverability `GET /capabilities` already
gives in the other direction for scenes/sources/actions. The rule set's Test button now only
prompts for data when a step is genuinely `"dataField"`-typed -- Free Text and File need none.

All three value types verified live: Free Text and File round-tripped through a real rule-set
trigger against `Episode NAME`/`Campaign Name` and were restored to their originals afterward; the
direct `POST /action` endpoint's existing `data.text` convention (unchanged, no step config to
consult there) reconfirmed still working; the field-registration endpoint confirmed storing and
returning what was registered.

Below is the original design write-up this was built from.

### What it needs to do

Three things, observed directly against the user's real OBS setup:
- `Episode NAME` (text source, e.g. "Darn Skarn") and `Campaign Name` (text source, e.g. "The
  Burden of Knowledge") should be settable from Herald, per event -- these come from Foundry/the
  session itself, not something Studio tracks.
- `Episode NUMBER` (text source, currently hand-typed as `"SEASON 03              EPISODE 27"`)
  should be Studio-managed: a season and episode number Studio persists, with the episode number
  auto-incrementing via an action.
- The recording's filename -- currently hand-typed into OBS's Output > Recording > Filename
  Formatting as `Elegant Eight S03EXX - The Burden of Knowledge - Y%CCYYM%MMD%DDT%hh%mm%ss` --
  should be assembled from the same season/episode/title/campaign, leaving OBS's own `%` timecode
  macros untouched.

### Verified against the live OBS instance before designing this

- `SetInputSettings` with `inputSettings: {text: "..."}` is the right call for a text source --
  confirmed against `Episode NAME`, `Episode NUMBER`, and `Campaign Name` directly (all
  `obs_text_pthread_source_v2`, all carry a plain `text` field).
- `GetProfileParameter`/`SetProfileParameter` with `parameterCategory: "Output"`,
  `parameterName: "FilenameFormatting"` is the real, currently-in-use mechanism for the recording
  filename template -- read the user's actual live value to confirm the key name and behavior.
  There is no way to set a literal one-off filename via the API, only this format string (OBS
  expands its own `%` macros at record time) and the output directory (`SetRecordDirectory`).

### Design

**New persisted config, `session`:** `season`, `episode` (both plain integers, zero-padded to 2
digits wherever substituted into a template), `episodeSourceName` (which OBS text source gets the
season/episode text), `episodeFormat` (a template, defaulting to
`SEASON {season}              EPISODE {episode}` -- matching what's already live), and
`filenameFormat` (a template, empty by default since it's riskier to guess at than a text source).

**Four placeholders**, available in both `episodeFormat` and `filenameFormat`: `{season}` and
`{episode}` come from Studio's own stored `session` state; `{title}` and `{campaign}` come from
whatever triggered the rule set -- the incoming event's `data.title` / `data.campaign`.

**New actions:**
- `setText` (always available, group Sources, like `sourceShow`/`sourceHide`) -- writes into a
  named OBS text source. Its value comes from the triggering event's `data`, not a fixed param:
  a rule-set step gets a new optional field, `dataField` (default `"text"`), naming which key of
  `data` to read. Two separate `setText` steps on one event -- one with `dataField: "title"`
  targeting `Episode NAME`, one with `dataField: "campaign"` targeting `Campaign Name` -- is how
  Herald's one event sets both.
- `incrementEpisode` (Studio Control, opt-in) -- bumps the stored `episode` by 1. `season` is
  left alone; there's no "auto-increment season" concept, that's a manual edit on the Session
  tab.
- `applyEpisodeText` (Studio Control, opt-in, param = OBS text source name) -- writes the
  composed `episodeFormat` (season/episode substituted) into that source.
- `applySessionFilename` (Studio Control, opt-in) -- writes the composed `filenameFormat`
  (all four placeholders substituted, `%` macros left alone) into OBS via `SetProfileParameter`.
  Throws a clear error if `filenameFormat` is empty, rather than silently doing nothing.

A rule set on something like `session:start` can run all of this in one AND-grouped stage:
increment the episode, write both text sources from Herald's `data`, and update the filename
format, all off one event.

### Where event data has to be threaded through

`runAutomationAction` gains two more parameters -- `eventData` and `dataField` -- flowing from
`automations.on('event', ...)` through `runAutomationRuleSets` and `runRuleSet` down to each
step's execution. The manual paths (the Automations tab's "Time it", and a direct
`POST /api/automations/action` call) have no real triggering event, so `eventData` is whatever
they're explicitly given (`POST /action` accepts an optional `data` object in its body, mirroring
`POST /event`'s shape; "Time it" always runs with `eventData` undefined, meaning a `setText` step
being timed shows an empty string rather than crashing).

### API documentation to add once built

`api-automations.md` needs: the four new actions in the actions table, the `data`-driven
behavior of `setText` explained (including the `dataField` convention, even though rule-set step
internals stay Studio's own business), and a worked example alongside the existing `combatStart`
one.

## Part 2: Automated YouTube upload -- planning only, not started

Explicitly on hold per the user ("hold off on the YouTube until we nail down how that will
work") -- this section is the starting point for that conversation, not a build order.

### What's genuinely known already

- OBS tells Studio the actual output file path when a recording stops (`StopRecord`'s response,
  or the `RecordStateChanged` event's data) -- so "which file" is solvable with what Studio
  already has a WebSocket connection for.
- YouTube's Data API v3 supports resumable uploads (`videos.insert`, chunked), which is the right
  shape for a large recording file.
- The metadata a video needs (title, description, maybe season/episode) overlaps heavily with
  what Part 1 is already collecting from Herald and the Session tab -- this is a natural
  second consumer of that same data, not a reason to invent a parallel metadata story.

### What's genuinely open, and needs a real decision before any code gets written

- **Auth.** YouTube upload needs OAuth 2.0 (a Google Cloud project, a client ID/secret, a
  one-time consent screen, a stored refresh token) -- categorically different from the
  token-in-a-field pattern every other credential in Studio uses (OBS password, Tavern login).
  This needs its own design: where the OAuth flow actually runs (a loopback redirect handled by
  Electron's own `net`/a temporary local server, most likely), and where the refresh token is
  stored (same keychain-backed pattern as the OBS/Tavern secrets, presumably, but confirm before
  building).
- **Trigger.** Automatically on every `StopRecord`? Only for rule sets that explicitly include an
  "upload" step? A recording the user doesn't want public (a false start, a technical test)
  uploading itself automatically is a real failure mode to design against, not an edge case to
  patch later.
- **Video metadata and privacy.** Title/description from Herald's `data`, presumably -- but
  privacy status (`private`/`unlisted`/`public`), thumbnail, playlist assignment, and whether any
  of that is itself Studio-configurable or always private-by-default until a human publishes it,
  are all open. Defaulting to `private` and requiring an explicit separate action (or a human
  click) to actually publish is the safer starting assumption, but that's a recommendation to
  confirm, not a decision already made.
- **Upload duration and failure handling.** A multi-GB file over a home upload connection can
  take a long time and can fail partway through -- needs actual progress reporting (the
  Automations tab's event log, at minimum) and resumability, not a fire-and-forget HTTP call the
  rest of the automation model otherwise favors.
- **Quota.** YouTube's Data API has a daily quota; an upload is quota-expensive per Google's own
  published cost table. Worth confirming this is a non-issue for expected usage (one upload per
  session) before building rather than after.

### Suggested next step, when picked back up

A short design pass answering the auth/trigger/privacy questions above, written up the same way
this document is, before any code -- this is a bigger, more externally-facing feature (a Google
OAuth app, a public YouTube channel) than anything built in Studio so far, and deserves that
pass on its own rather than being sized up mid-implementation.

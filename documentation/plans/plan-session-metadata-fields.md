# Session metadata fields and multi-module Data Field registration -- done

**Audience:** whoever picks this work up next (most likely me, next session), and Foundry module
authors (Herald and any other Coffee Pub module) who want to register their own Data Fields with
Studio.

Built and verified live against the real running app, including a real HTTP round trip through
the actual automations server (not a simulated call): a Text field ("Campaign") and a Number field
("Days Left", seeded at 3) created via config, both appeared correctly in a `setText` step's Data
Field dropdown -- grouped exactly as designed (Date & Time, Season & Episode, Metadata, one
`optgroup` per connected module), the Number field additionally offering its `+1`/`-1` variants.
Firing a real `POST /api/automations/event` against a step reading `sessionDaysLeft+1` moved the
stored value 3 -> 4 -> 5 across two fires, matching the exact worked example in the design below,
and the Session tab's own Metadata card updated live to show it -- confirmed via the status
broadcast, not just the config file. The same mutate-and-persist behavior was separately confirmed
for `sessionEpisodeNumber+1` (32 -> 33 against the real, already-seeded episode counter). The
`[!] <name> — not in OBS` treatment (built for stale source/scene references) was exercised for
free during this: the probe step's target source didn't exist in OBS, and read exactly as
designed. All test rule sets, test metadata fields, and the bumped episode number were removed
and restored afterward; a `diff` against a config snapshot taken before testing confirmed nothing
else changed.

### Addendum: two more field types -- "Text + Number" and "Number + Text"

Raised directly after shipping the above, working from a real example already in production use:
the user's own `episodeFormat` composes two placeholders into one string ("SEASON 03
EPISODE 32"), a capability plain Text/Number metadata fields didn't have -- a `setText` step's
Data Field type is a single key lookup, no template. Rather than build a general `{..}`-template
engine for arbitrary metadata (more machinery, and the one genuinely multi-number case -- Season
*and* Episode combined -- already has `episodeFormat` for it), added two narrower field types that
cover the common "label glued to a counter" pattern directly: **Text + Number** and **Number +
Text**, a fixed text segment and a number segment joined by a separator typed once at creation
("Chapter" + `""` + `5` -> "Chapter 5"; `3` + `""` + " Days Left" -> "3 Days Left"), the number
segment optionally zero-padded (a dropdown: none/2/3/4 digits -- the user's own suggestion, after
first proposing a separator dropdown and self-correcting to a free-text input for the separator
itself, "now that I typed all those, maybe it is just an input box"). The number segment gets the
exact same `+1`/`-1` Data Field treatment a plain Number field's value already has; the text
segment, separator, and padding are all fixed at creation like the key itself.

Verified live: a `textNumber` field ("Chapter", text `"Chapter "`, number `5`) and a `numberText`
field ("Days Left 2", number `3`, padding `2`, text `" Days Left"`) both rendered correctly in the
Metadata card with the composed order right for each type (text-then-number vs. number-then-text,
separator shown as an em dash when empty rather than an invisible gap) and appeared correctly in a
`setText` step's Data Field dropdown with their own `+1`/`-1` entries. A real `POST /event` firing
a step reading `sessionChapter+1` moved the stored number 5 -> 6, confirmed via the same
activity-log error trail (the probe step's OBS target still didn't exist) as the original addendum
above. All test data removed and diffed clean afterward, alongside the user's own real fields
(`sessionCampaign`, `sessionParty`) created independently during this same window and left
untouched throughout.

### Addendum: the dedicated Episode card is retired

Once Text+Number/Number+Text existed, the Episode card (`session.season`/`.episode`/
`.episodeSourceName`/`.episodeFormat`, the `incrementEpisode`/`applyEpisodeText` actions, and the
`sessionSeasonNumber`/`sessionEpisodeNumber` built-in Data Field aliases) was doing nothing a
Metadata field couldn't already do -- raised directly by the person who owned the feature,
observing that Season/Episode as generic Number (or Number+Text) fields covered everything except
a one-click manual bump, since the Data Field `+1`/`-1` variant was only reachable from within an
automation. Confirmed unused in practice before removing it: `incrementEpisode`/`applyEpisodeText`
weren't in the real, live `automations.studioActions` list, and the real Episode card's own
`session.episode` (32) had already drifted out of sync with an equivalent Metadata field the user
had started maintaining by hand instead (28) -- the built-in system wasn't just theoretically
redundant, it had already been abandoned in favor of Metadata fields.

Removed entirely (`session.season`/`.episode`/`.episodeSourceName`/`.episodeFormat`,
`incrementEpisode`, `applyEpisodeText`, the two reserved Season/Episode Data Field aliases, the
Episode card UI) with no migration -- confirmed directly that the real season/episode values and
the `Episode NUMBER` source binding didn't need preserving. `applySessionFilename` and the
Recording Filename card are untouched; they were never Episode-specific, just a generic
`formatSessionTemplate` consumer that happened to also support the legacy `{season}`/`{episode}`
aliases (now removed along with everything else backing them -- a bare `{season}`/`{episode}` in
an existing template now falls through to the triggering event's own data, same as `{title}`/
`{campaign}` already did, rather than resolving to nothing).

The one genuine gap -- a manual, one-click bump without needing to fire an automation -- is filled
by new inline `+1`/`-1` buttons directly on a Metadata Number (or compound) field's row, next to
its number segment. Same mutate-and-persist path `resolveDataField` already uses, just triggered by
a click in `src/control/control.js` (`config` mutated locally, `renderMetadataFields()` +
`scheduleSave()`) instead of a rule-set run.

## Why

`setText`'s "Data Field" value type only ever sees whatever a *connected module* has registered via
`POST /api/automations/fields` -- there was no way for the person running Studio to define a value
of their own (a campaign name, a "days left" countdown, anything they want to track across a
session) without a Foundry module in the loop to send it. This closes that gap: Studio gets its own
metadata fields, registered into the same "Data Field" dropdown Herald's fields already populate,
plus a handful of built-in fields (today's date/time, and Season/Episode as live-tracked numbers)
that need no setup at all.

Doing this surfaced a second, real problem: `POST /api/automations/fields` wholesale-replaces the
*entire* registered-fields list on every call. That's fine for exactly one caller. The user expects
several of their own Foundry modules to eventually register fields with Studio -- the moment a
second one does, each reconnect wipes out the other's fields. Studio registering its own fields
into that same list would make this worse, not better, unless registration stops being "here is the
whole list now" and becomes "here is my list" per caller. Part 2 below is that fix, and it is a
breaking protocol change module authors need to know about before they build against it -- hence
this doc also going to the wiki.

## Part 1: Studio-defined metadata fields

### What it is

A new list, created and edited entirely from the Session tab, of `label: value` pairs the person
running Studio defines themselves. Two types for now:

- **Text** -- a plain string, typed once, edited any time (a campaign name, a location, anything
  that doesn't change on a fixed schedule).
- **Number** -- same idea, but because it's a number, an automation can also read it as "+1" or
  "-1" of its current value (a countdown, a running tally) -- see [Derived
  variants](#derived-1-1-variants) below.

**Image was considered and deliberately cut from this pass.** The use case is real -- flashing a
graphic for a big moment ("POW!"), or an episode-specific image for a holiday episode -- but there
is no OBS action today that would *do* anything with an image-typed field (no `setImageSource`
equivalent to `setText`). Building the field type before the action that consumes it just means a
picker with nowhere to send its value. Revisit once (if) an image-swap action gets designed.

### Data model

New top-level config section, `metadataFields`, an array:

```js
{
  id: 'field<timestamp36>',   // generated client-side, same convention as a rule set's own id
  label: 'Days Left',         // shown as-is next to the value input; never auto-regenerated
  key: 'sessionDaysLeft',     // frozen at creation -- see below
  type: 'number',             // 'text' | 'number'
  value: 3,                   // string for text, number for number
}
```

**The key freezes at creation and is never regenerated.** Confirmed directly: *"if they want to
rename it, they delete and create a new one."* The label is editable only in the sense that deleting
and recreating the field gives it a new label (and a new key to match) -- there is no in-place
"rename" that would leave old rule sets pointing at a key that no longer means what its label now
says.

**Key generation:** PascalCase every alphanumeric word in the label, join, prefix with `session` --
"Days Left" -> `sessionDaysLeft`, "Campcampaign Name" -> `sessionCampaignName`. Collides with an
existing key (another metadata field, or one of the reserved built-in names below)? Append `2`, `3`,
... until unique, the same numeric-suffix fallback already used for OBS source names. Generated
once, client-side, when "Add" is clicked -- no round trip needed, since the renderer already holds
every existing key locally the same way it already holds every rule set.

**A field pointing at a rule-set step that's later deleted is not a special case to build.** It's the
same "stale reference" situation a renamed/deleted OBS source already is, and reuses the exact same
UI: the step's Data Field picker keeps the missing key selectable (so nothing is silently discarded
on save) and shows it with the `[!] <key> — not registered` front-loaded warning and red border
already built for the source/scene and dataField pickers. No new mechanism.

### Built-in fields (nothing to create)

Always present in the Data Field dropdown, resolved specially rather than read from
`metadataFields`:

| Key | Value |
| --- | --- |
| `sessionTime` | Current time, computed fresh on every read |
| `sessionDate` | Current date |
| `sessionDay` | Day name (`Monday`, ...) |
| `sessionMonth` | Month name |
| `sessionYear` | Current year |
| `sessionSeasonNumber` | Studio's own stored `session.season` (the same number the Episode card edits), zero-padded |
| `sessionEpisodeNumber` | Studio's own stored `session.episode`, zero-padded |

The evergreen date/time fields have no derived `+1`/`-1` variants -- there is nothing to increment,
they're just read fresh. `sessionSeasonNumber`/`sessionEpisodeNumber` are Number-shaped like any
user-created Number field, so they *do* get derived variants, and behave exactly like a user-created
countdown -- see below. This means `incrementEpisode` (the existing Studio Control action) and
"select `sessionEpisodeNumber + 1` in a Data Field picker" become two different ways to do the same
underlying thing (bump `session.episode` by 1 and persist it). Both stay, for now: `incrementEpisode`
as a standalone action for a rule-set step that isn't writing text anywhere, the field form for a
`setText` step that wants the bumped number *in* the text it writes. No plan to remove either.

These seven names, plus every key any `metadataFields` entry currently has, are reserved -- a new
metadata field whose generated key would collide with one gets the numeric-suffix treatment same as
any other collision.

### Derived (`+1`/`-1`) variants

For every Number-shaped field (user-created, or the two Season/Episode aliases), the Data Field
dropdown offers three entries, not one: the plain key, `<key>+1`, and `<key>-1`. Confirmed semantics,
in the user's own example:

> In the automation, they choose "sessionDaysLeft + 1". We read it, and it is "3", so based on their
> choice, it becomes "4". We send "4" to OBS. We change the value for "Days Left" from "3" to "4" in
> the session area. That way it will be properly incremented for next time.

So resolving a derived variant is **not a pure read** -- it computes the new number, persists it back
into the field's stored `value` (or `session.episode`/`session.season` for the two aliases), and
*that* new value is both what gets sent to OBS and what the Session tab now shows. Resolving the
plain key (no `+`/`-` suffix) stays a pure read, same as today. This is the same shape of behavior
`incrementEpisode` already has, generalized to any Number field and folded into Data Field resolution
itself rather than needing its own separate action per field.

**Known, pre-existing overlap risk, not a new one:** nothing in the rule-set engine dedupes or
cancels an in-flight run when the same event fires again before the first run finishes (documented
already in `architecture-automations.md`, under "Rule sets and dispatch"). A derived-variant field
referenced by two overlapping runs of the same rule set would genuinely double-increment, the same
way `incrementEpisode` already can. Worth knowing going in, not a reason to hold this back -- it's an
existing property of the engine, not something this feature makes worse in kind, only more visible
because it now touches a value the user is looking at (a countdown) rather than one that mostly just
needs to be roughly right (an episode number).

### Where this plugs into `setText`

`resolveTextValue`'s `dataField` branch (`src/main.js`) currently does one thing: `eventData[field]`,
a straight string lookup against whatever the triggering event sent. It grows a resolution order,
checked in this sequence for a given key (after stripping and remembering a trailing `+1`/`-1`):

1. An evergreen field (`sessionTime`/`Date`/`Day`/`Month`/`Year`) -- computed fresh, delta ignored.
2. `sessionSeasonNumber` / `sessionEpisodeNumber` -- read (and, with a delta, mutate + persist)
   `configStore`'s `session.season`/`session.episode`.
3. A `metadataFields` entry by key -- read (and, with a delta, on a Number-typed field, mutate +
   persist) its stored `value`.
4. Fall through to today's behavior: `eventData[key]` (no delta parsing here -- a module sending
   live event data was never going to send an arithmetic-suffixed key).
5. Nothing matched -- return `''`, same silent-miss behavior `dataField` already has today for an
   unknown key. (Not a behavior change; keeping it means a stale/renamed key doesn't start throwing
   where it previously didn't.)

`formatSessionTemplate` (the `{season}`/`{episode}`/`{title}`/`{campaign}` substitution used by
`applyEpisodeText`/`applySessionFilename`) is untouched -- it's a different, narrower mechanism
(exactly four placeholders, no Data Field concept at all) and nothing here needs to change that.

### UI

New "Metadata" card on the Session tab, below Episode. "New" reveals an inline label + type (Text /
Number) + Add row (not a native dialog -- matches how the rest of this app avoids `window.prompt`
except the one existing JSON-test-data case). Each existing field renders as one row: `<label>:`,
an editable value input (`type="number"` for Number fields, plain text otherwise), a dim
`(data field: <key>)` hint, and a delete button. Deleting is immediate, no confirmation -- matches
every other single-item delete already in this app (a rule-set step, a rule set itself).

## Part 2: Multi-module field registration (breaking change)

### The problem

`POST /api/automations/fields` (`src/automations.js`) today: `this.registeredFields = fields...`,
a flat wholesale replace. One connected module, this is fine -- "here is my current full list" was a
deliberate design choice earlier (see `architecture-automations.md`) *because* there was only ever
one caller in mind. The user expects several of their own modules to eventually register fields.
The moment a second module calls this endpoint, it silently erases the first module's fields --
worse, reconnecting (which every module does on its own schedule) means two modules registering
normally, in the ordinary course of things, keep stomping each other.

### The fix

The request body gains a required `module` field: `{module: "herald", fields: [...]}`. Server-side,
`registeredFields` (a flat array) becomes `registeredFieldsByModule` (a `Map<module, fields[]>`) --
a call replaces only that module's own previous batch, same "wholesale replace, but scoped to me"
semantics as before, just correctly scoped now. `status()`'s `registeredFields` becomes the flattened
merge across every registered module, each entry additionally carrying `source: <module>` so the
Data Field dropdown (and anyone debugging) can tell a field apart from another module's field of a
similar name, and so Studio's own metadata fields (which populate the same dropdown, `source:
'studio'`) are visually distinguishable from anything a Foundry module sent.

### This is a breaking change, on purpose

A request with no `module` (or an empty one) gets `400 { error: '"module" is required' }` -- the
same shape of validation `POST /api/automations/event` already does for a missing `event` name. No
silent default, no back-compat fallback: every module calling this endpoint today needs a one-line
update (add `module: "<its own name>"` to the request body) before this ships. That's exactly why
this doc is going to the wiki now, ahead of Studio's own implementation landing -- so module authors
(Herald, and whatever else the user builds) can make that change on their own schedule rather than
discovering it as a sudden 400 after an update.

## API contract for module authors

`POST /api/automations/fields` -- **request body shape changes:**

```jsonc
// Before
{ "fields": [{ "key": "title", "label": "Episode Title" }] }

// After -- "module" is now required
{
  "module": "herald",
  "fields": [{ "key": "title", "label": "Episode Title" }]
}
```

Everything else about the endpoint is unchanged: authenticated the same way, still a wholesale
replace of *that module's own* fields (call it again with your current full list whenever it
changes, or once at connect time -- no need to track what you last sent), still capped at 100 fields
and the same per-field `key`/`label` length limits. A request with no `module` now gets rejected with
`400 { "error": "\"module\" is required" }` instead of silently succeeding.

`GET /api/automations/capabilities` and the control panel's own status now show each registered
field's `source` (the module name that registered it, or `"studio"` for one of Studio's own
metadata fields) alongside its `key`/`label` -- informational only, nothing a module needs to read or
act on.

Studio's own built-in fields (`sessionTime`, `sessionDate`, `sessionDay`, `sessionMonth`,
`sessionYear`, `sessionSeasonNumber`, `sessionEpisodeNumber`) and anything the person running Studio
creates themselves are **reserved key names** -- a module registering a field with one of these exact
keys will have its field silently shadowed by Studio's own built-in or user-created one of the same
name in the Data Field dropdown (Studio's own fields resolve first, per the resolution order above).
Pick a more specific key if this matters (`heraldSessionYear` rather than `sessionYear`, say).

## Verification plan

- `npm run check` for the syntax pass, `node tools/check-docs-structure.mjs` for the docs.
- Config round-trip: a metadata field survives a save/reload with its key unchanged; a `number`
  field's value stays a number, not a string, after reload.
- Live against the real running app: create a Text field and a Number field, confirm both appear in
  a `setText` step's Data Field dropdown (plain key, plus `+1`/`-1` for the Number one), confirm the
  evergreen and Season/Episode built-ins are always present even with zero metadata fields created.
- Trigger a rule set using a Number field's `+1` variant twice in a row (two separate test-event
  sends, not overlapping) and confirm the Session tab's own displayed value advances each time,
  matching what got written to OBS.
- Delete a field a rule-set step is still pointing at; confirm the step's picker falls back to the
  existing `[!] <key> — not registered` treatment rather than silently clearing the step's config.
- `POST /api/automations/fields` with no `module`: confirm `400`. With two different `module` values
  in two separate calls: confirm both modules' fields are present afterward (neither wiped the
  other's out), each tagged with the right `source`.
- Publish this doc's api-automations.md changes to the wiki (`node tools/wiki-sync.mjs publish`,
  then push the wiki clone) ahead of finishing the Studio-side implementation, so module authors can
  start updating their own `POST /fields` calls without waiting on this to ship.

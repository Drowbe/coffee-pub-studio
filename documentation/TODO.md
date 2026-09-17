# To do

Things agreed on but not built yet, roughly in order.

## Tavern

Bigger Tavern-side design work (multi-admin "who drives the stream," multiple simultaneous
asides with a director-style switch, per-room character settings, room types, the admin page's
editing moving to each user's own profile) lives in that repo's own TODO.md now, not here.

- ~~**Rooms, phase 2: pull aside.**~~ Done: an admin pulls one or more people in their current
  room into a private room together, everyone moves automatically, a "Back to the table" button
  returns them together to the room they were pulled from (not always the Lobby), and the room
  disappears on its own once everyone has left. The one-conversation rule is in too: everyone
  not in the admin's current room is "off stream" (or "aside" for those with the admin in a
  pull-aside room) -- a pull-aside room is private from the rest of the table, not from the
  recording, so while the admin is aside with someone that conversation is what's on stream,
  same as any other room they could be in.
- ~~**Room switching in Studio.**~~ Was "Follow the admin" (on by default): the Tavern tab and
  the OBS sources tracked whatever room the admin was actually in, live. Reverted -- with no
  admin online, that room fell back to the Lobby and read as the picker randomly jumping there on
  its own, with no way to pin it. The room picker is a plain manual choice now ("this room is for
  this OBS session"), same as before this feature existed; the checkbox survives, renamed to
  **Enable Asides**, purely arming whether anyone live in a *different* room than the picked one
  gets muted/dimmed as "aside" -- it no longer touches which room is picked.
- ~~**"Private Conversations", distinct from Asides.**~~ Done: Tavern rooms now carry a
  `private` flag on `ephemeral` rooms, set via a separate "Privately" button (distinct from the
  ordinary "Step aside") at pull time. Studio hides (not mutes/dims) anyone currently live in an
  `ephemeral && private` room, unconditionally -- a privacy guarantee, not gated behind "Enable
  Asides" the way ordinary aside muting/dimming is, so it can't be left accidentally off. Also
  added while in there: offline users are always muted/dimmed regardless of "Enable Asides", and
  the dim level (separate for Offline vs. Aside) is a Session-tab setting now, not a hardcoded
  value. A tint colour on top of the dim was tried and pulled back out: OBS's Color Correction
  filter multiplies the image by the tint colour unconditionally, with no usable blend-strength
  control, so even a faint tint came out as a solid colour wash -- not worth chasing further
  against a filter that "never works right." If a tint is still wanted, it belongs on the Tavern
  side (e.g. baked into the video/image itself), not as an OBS filter.

## Studio

- ~~**An "Automations" tab.**~~ Studio's side is done: a local HTTP server (`src/automations.js`,
  bound to every network interface, not just localhost, since Foundry usually runs on a
  different machine than Studio) that a Foundry module POSTs `{event, data}` to
  (`/api/automations/event`, token-authed), matched against user-configured, named and grouped
  rule sets, each a numbered sequence of OBS and Studio actions and delays (steps marked AND run
  together instead of waiting) -- verified live end to end, including a real OBS WebSocket round
  trip, and against a real Herald build: Herald now calls `/capabilities` and `/event`, hit and
  helped fix the `rules` -> `ruleSets` rename, and 4 real rule sets are configured and firing.
  The Automations tab also works as a plain manual OBS remote with no Foundry module involved,
  and a Studio Control card exposes Studio's own commands (wake audio, start/stop/dock all
  windows, sync OBS, plus season/episode text and filename actions -- see below) opt-in per
  command. Full HTTP contract and a worked Herald example (`combatStart` via Blacksmith's
  `HookManager`) are on the wiki, at `api-automations`. Still open: a bare action (`sceneSwitch`,
  `setText`, and so on) is only reachable via a matching rule set or a direct
  `POST /api/automations/action` call -- there is still no conditional ("if/then") trigger, where
  a rule set would match on a field inside an event's `data`, not just the event name alone (e.g.
  "if `data.player` is Nik Melok, show source X for 5 seconds"). That needs real payload matching,
  not just a delay-then-hide step sequence, and stays an idea, not a build, until a real use case
  needs it.
- ~~**Herald-driven text sources, and Studio-managed season/episode.**~~ `setText` writes a value
  from an event's own `data` into a named OBS text source (which key of `data` is configurable
  per step, so one event can drive two different sources); `incrementEpisode`,
  `applyEpisodeText`, and `applySessionFilename` are Studio-side season/episode tracking (a new
  Session-tab card) applied to a text source and to OBS's own recording Filename Formatting via
  two editable templates. Full design and what was verified live (every write captured and
  restored) in `documentation/plans/plan-session-text-and-youtube-upload.md`.
- ~~**Studio-defined metadata fields, and multi-module Data Field registration.**~~ The Session
  tab's Metadata card lets the person running Studio create their own Text/Number values (a
  campaign name, a countdown), each registered into the same "Data Field" dropdown a connected
  module's own fields already populate, alongside built-in evergreen fields (today's date/time)
  and Season/Episode as two live-tracked numbers. A Number field's "+1"/"-1" variant is a real
  mutation, not a pure read -- selecting it both writes the incremented value and persists it for
  next time, generalizing what `incrementEpisode` already did for the episode counter to any
  Number field. Doing this surfaced that `POST /api/automations/fields` wholesale-replaced the
  entire registered list on every call; fixed to scope replacement per module (a required
  `module` field in the request body) so a second connected module can't wipe out the first's
  fields -- a breaking API change, published to the wiki ahead of the Studio-side implementation
  landing. Full design and what was verified live in
  `documentation/plans/plan-session-metadata-fields.md`.
- **Automated YouTube upload.** Explicitly on hold -- "hold off... until we nail down how that
  will work." What's already known (OBS gives Studio the output file path, YouTube's Data API
  supports resumable uploads) and what's still a real, unmade decision (OAuth flow and token
  storage, upload trigger, privacy default, progress/failure handling, quota) are both in
  `documentation/plans/plan-session-text-and-youtube-upload.md`. Needs its own short design pass
  before any code.
- **Unify the control panel's design system.** Fixing the CP Tavern tab's layout surfaced a
  pattern: styling for the same kind of thing (a sub-section heading partway down a card, a
  divider row, spacing around a title) kept getting re-declared per instance instead of shared,
  and drifted out of sync when only one copy got updated -- `.regions-section` and `.session-row`
  had both gone fully dead (styled, unreferenced by any markup) while a near-duplicate got
  invented next to them with a slightly different padding value. `.card-subsection` now
  consolidates the divider treatment, but that was one spot-fix, not an audit: go through
  control.css for the rest of this (titles, chips/tags, spacing scale, button variants) and
  land on one small set of reusable classes, removing anything unreferenced as it's found.
- **Windows build.** Packaging is done: an NSIS target and a `windows-latest` job building and
  uploading the installer alongside the macOS dmg (also on tagged releases), plus a menu fix
  (Hide/Hide Others/Unhide are macOS-only roles now). ~~A SmartScreen note in the README.~~ Done,
  alongside the rest of the README's Windows coverage (Requirements, Get the app, First launch).
  Recorded as a real gap, not guessed at, in `documentation/known-issues.md`: the OBS side needs
  `window_capture` (window named by `Title:Class:Exe`) instead of macOS `screen_capture` with an
  integer window ID -- a different input kind, a different settings shape, and a different way of
  resolving "this app window" to "this OBS capture target" -- and is genuinely untestable without
  a Windows machine running OBS, so left unbuilt rather than guessed at. Also open: Windows
  display scaling in the captured-size readout, a colour tray icon at 16 and 32 px (the current
  one is a macOS template image), and quit on close instead of living in the Dock.

## Documentation

This adoption pass covers the API (`api/api-automations.md`), one paired architecture document
(`architecture/architecture-automations.md`), and the floor user guide
(`userguides/userguide-getting-started.md`) -- the rest of the standard's checklist is still
open:

- ~~**README is not yet the strict product-page template.**~~ Done: the deep walkthrough moved
  out into `userguide-settings.md`, `userguide-obs.md`, `userguide-tavern.md` and
  `userguide-configuration.md`; README now keeps only the short version plus links to the wiki
  guides, alongside the Automations section (already a wiki pointer) and the maintainer-facing
  sections (requirements, install, releasing, dev setup, project layout).
- **`documentation/assets/` has no screenshots yet.** A product screenshot for `home.md` and
  README, and any screenshots a future user guide needs, are still owed.
- **No `CHANGELOG.md` exists yet.** The standard requires one at the repository root; this
  adoption pass did not attempt to reconstruct history for it, only added the file structure
  the wiki publisher needs.
- **`architecture/` covers only the Automations feature.** The rest of Studio (window
  management, the OBS bridge, the Tavern bridge, the control panel's own structure) has no
  architecture documentation yet.

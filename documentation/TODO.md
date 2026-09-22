# To do

Things agreed on but not built yet, roughly in order.

## App windows

- **App windows, phase 1 is built and confirmed on macOS: capture and keep-pointed only.** A separate
  `appWindows` config list (not a web-window "view" -- those are tied to Electron windows Studio
  owns) with a saved match rule (app + title substring against OBS's own window list) and a managed
  OBS source, re-pointed on every sync alongside the web windows. Not yet built:
  - **Cropping is built as manual numbers** (Left/Top/Right/Bottom, plus a "Trim title bar"
    button and a Show cursor toggle) -- confirmed working live on macOS. **Still open: a drag-to-select
    crop picker and named regions for app windows.** The region picker takes its snapshot from
    Studio's own page; an app window would need a snapshot from `desktopCapturer`, which means
    Studio needs its own Screen Recording permission (unchecked whether it has it). Capture
    method is deliberately fixed at Window Capture.
  - **Windows.** OBS uses `window_capture` with a `Title:Class:Exe` string instead of a numeric
    ID, so source creation and re-pointing need a second path -- the same gap already listed under
    Known issues for web windows.
  - **Moving/resizing/docking another app's window.** Needs Accessibility permission (macOS) or
    Win32 calls; deliberately out of scope.
  - **First use needs an existing window source.** OBS only exposes its window list through an
    existing input; with none, the picker says so instead of listing.
  - **Confirmed working live on macOS**: pick, Add to OBS, and re-pointing on sync. Two things
    it surfaced and fixed: card handlers edited a stale copy of the entry after a save round-trip
    (they now look it up by id), and matching by app name alone could land on an app's hidden,
    untitled helper window, leaving a source with nothing selected (it now prefers the exact
    window picked, then a titled match, and the tab shows which window is being captured).

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
  and Studio's own commands (wake audio, start/stop/dock all windows, sync OBS, apply the session
  filename) are available the same as any OBS action -- no separate opt-in, the automations token
  is the only gate, same as everything else here. Full HTTP contract and a worked Herald example
  (`combatStart` via Blacksmith's
  `HookManager`) are on the wiki, at `api-automations`. Still open: a bare action (`sceneSwitch`,
  `setText`, and so on) is only reachable via a matching rule set or a direct
  `POST /api/automations/action` call -- there is still no conditional ("if/then") trigger, where
  a rule set would match on a field inside an event's `data`, not just the event name alone (e.g.
  "if `data.player` is Nik Melok, show source X for 5 seconds"). That needs real payload matching,
  not just a delay-then-hide step sequence, and stays an idea, not a build, until a real use case
  needs it.
- ~~**Herald-driven text sources, and Studio-managed season/episode.**~~ `setText` writes a value
  from an event's own `data` into a named OBS text source (which key of `data` is configurable
  per step, so one event can drive two different sources); `applySessionFilename` applies a
  template to OBS's own recording Filename Formatting. Full design and what was verified live
  (every write captured and restored) in
  `documentation/plans/plan-session-text-and-youtube-upload.md`. The season/episode-tracking half
  of this (a dedicated Episode card, `incrementEpisode`, `applyEpisodeText`) was later retired --
  see the next item.
- ~~**Studio-defined metadata fields, and multi-module Data Field registration.**~~ The Session
  tab's Metadata card lets the person running Studio create their own Text, Number, or Text+Number
  values (a campaign name, a countdown, "Chapter 5"), each registered into the same "Data Field"
  dropdown a connected module's own fields already populate, alongside built-in evergreen fields
  (today's date/time). Doing this surfaced that `POST /api/automations/fields` wholesale-replaced
  the entire registered list on every call; fixed to scope replacement per module (a required
  `module` field in the request body) so a second connected module can't wipe out the first's
  fields -- a breaking API change, published to the wiki ahead of the Studio-side implementation
  landing. Full design and what was verified live in
  `documentation/plans/plan-session-metadata-fields.md`. Made the dedicated Episode card
  (season/episode as their own tracked numbers, separate from this system) redundant -- see the
  item above. A Number field's "+1"/"-1" Data Field suffix (a mutation hiding inside a read) was
  later retired in favor of explicit `incrementMetadataField`/`decrementMetadataField` Studio
  actions, once it caused a real double-increment bug -- see the addendum in that same plan file
  and "Composing rule sets" in `architecture-automations.md`.
- **A rule-set stage's concurrent steps can race on `configStore`.** Noticed while building the
  Increment/Decrement actions above, not fixed: a stage's steps run together via `Promise.all`
  (`runRuleSet`, `src/main.js`), and any two of them that both read-modify-write
  `configStore` state (two Increment steps for different Metadata fields in the same `and`-joined
  stage, say) can race -- both read the same "before" state, and whichever saves second silently
  overwrites the first's change rather than merging it. Worked around for the one place it matters
  today by keeping the two Increment steps this session added to "Set Session Info" as separate
  sequential stages (`and: false`) instead of one concurrent one, but the engine itself has no
  guard against a user building a rule set that hits this. A real fix (an in-process mutex around
  `configStore.save`, or making the read-modify-write atomic some other way) needs its own design
  pass, not a quick patch here.
- ~~**Naming convention enforcement for Window Source names.**~~ Done: Window Source now gets the
  same treatment as Region -- a `.name-compose` chip splits the fixed `Window: `/` (CP Studio)`
  wrapper from the editable label, the field only ever edits the label, and saving always composes
  the full name (`commitWindowSourceName`, `WINDOW_SOURCE_NAME_RE`, `src/control/control.js`). A
  legacy or adopted name that doesn't match the pattern displays unwrapped until next edited, then
  gets wrapped like everything else -- auto-adoption itself is untouched, so an adopted hand-made
  OBS name never risks diverging from what's actually in OBS. The unclaimed-name datalist this
  field used to offer was dropped along with it, since suggesting full wrapped or hand-made names
  into a label-only field no longer made sense.
- ~~**Automated YouTube upload.**~~ Confirmed working end-to-end against the real API, including a
  real completed upload (`uploadToYouTube`, a Studio action, opt-in rule-set step only, never
  automatic) -- device-flow OAuth, the resumable upload endpoint, title/description/privacy all
  confirmed live. **No playlist support** -- tried, then removed after Google's device-code endpoint
  rejected the broader OAuth scope playlist support needs ("Invalid device flow scope"), a live-
  confirmed Google restriction on this auth flow, not a bug here; add an upload to a playlist by
  hand afterward in YouTube Studio. See "Uploading a recording to YouTube" in
  `documentation/architecture/architecture-automations.md` for the full account, including what
  else was found live (a UI bug in the device-code link, the Metadata Quick Add feature it led to,
  and the Google Auth Platform console UI's actual layout).
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

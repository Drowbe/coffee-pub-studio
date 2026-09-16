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
  (`/api/automations/event`, token-authed), matched against user-configured rules that trigger
  an OBS action (switch scene, show/hide a source, start/stop recording or streaming) --
  verified live end to end, including a real OBS WebSocket round trip. The Automations tab also
  works as a plain manual OBS remote with no Foundry module involved. Full HTTP contract and a
  worked Herald example (`combatStart` via Blacksmith's `HookManager`) are on the wiki, at
  `api-automations`. What's still open: nothing on Herald's side actually calls this yet -- that's
  a real feature to build in `coffee-pub-herald`, not just a settings toggle, and the hook names in
  that example are a suggested starting point, not verified against a live v14 client the way the
  rest of Herald's own wiki insists on. Also open here: only `event`/`data` are read today, no
  Studio -> Foundry direction exists (not needed for the stated goals: "Herald tells Studio" and
  "Studio drives OBS directly" both only need this one direction), and the Rules UI is a flat
  list with no per-rule enable/disable or event-name autocomplete against what's actually been
  received.
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
  (Hide/Hide Others/Unhide are macOS-only roles now). Still open, and genuinely untestable
  without a Windows machine running OBS, so left alone rather than guessed at: the OBS side
  needs `window_capture` (window named by `Title:Class:Exe`) instead of macOS `screen_capture`
  with an integer window ID -- a different input kind, a different settings shape, and a
  different way of resolving "this app window" to "this OBS capture target". Also open: Windows
  display scaling in the captured-size readout, a colour tray icon at 16 and 32 px (the current
  one is a macOS template image), quit on close instead of living in the Dock, and a SmartScreen
  note in the README.

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

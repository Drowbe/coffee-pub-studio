# "Prompt" Metadata fields and required-prompt discovery -- done

**Audience:** whoever picks this up next, and Foundry module authors (Herald first) who want to
build a generic "run this automation" menu without hardcoding any of Studio's own Metadata field
names.

## The problem this replaces

`setMetadataField` (see `architecture-automations.md`) gave a Text-type Metadata field
persistence across separate calls -- set a title now, read it back later, by a different request
entirely. It solved Herald's stated need (prompt for a title before recording starts; let the
description be updated independently, any time, up to Stop) but left a real gap: `param` is a
field's `key`, and nothing told an external caller what key to use. `incrementMetadataField`/
`decrementMetadataField` got away with the same shape because they're only ever wired up *inside*
Studio's own step editor, by a human who already sees the field list there. `setMetadataField`
called directly by Herald has no Studio human in the loop at call time -- a hardcoded key
(`"sessionTitle"`) breaks silently the moment it talks to a different Studio setup with
differently-named fields.

The first fix considered was extending `GET /capabilities` with a `metadataFields` list (key/
label/type) so a caller could build its own settings picker -- "which Studio field holds the
Title?" -- mapped once, by a human, at connect time. Built, verified live, and still true (see
"Discovering Metadata fields externally" below) -- but a better design followed directly from it:
instead of a caller pre-configuring a field mapping for concepts it invents ("Title", "Description"),
have Studio's own rule sets *declare what they need* and have a caller ask generically, discovering
requirements per rule set rather than per concept. That's what this document covers.

## The design

**A new Metadata field type, `"prompt"`.** Stored and read exactly like Text (`sanitizeMetadataField`
falls through to the same branch; `resolveDataField` expands `{token}`s in it the same way), but
with one deliberate restriction: there is no other way to give it a value. It has no editable input
on the Session tab's Metadata card (no edit button rendered for it at all), and `setMetadataField`
already refused anything that isn't `type === 'text'`, which excludes `prompt` for free. The *only*
way a Prompt field's value ever changes is by answering it as part of running whatever rule set
actually needs it.

**`GET /api/automations/capabilities`'s `ruleSets` entries gain a `prompts: [{key, label}]`.**
Computed by `collectRequiredPrompts` (`src/main.js`): a static walk of a rule set's own steps,
looking at exactly the same places a real run would actually read a Data Field key from --
`setText`/`setMetadataField`'s `dataField` (when `valueType: "dataField"`), `applySessionFilename`'s
current filename template, and `uploadToYouTube`'s four field pickers -- resolving each key against
`config.metadataFields`: a `prompt`-type field is added to the result; a `text`-type field has its
own `{token}`s walked recursively (cycle-guarded, matching `resolveDataField`'s own chain), since a
Text field composing a Prompt field's key still means the rule set needs an answer for it. Critically,
**a `runRuleSet` step recurses into its target rule set's own steps** (also cycle-guarded, by rule
set id this time), bubbling nested requirements up to the outer, externally-triggerable rule set.
This is what makes the design correct for the shape this project's own rule sets are actually built
in: `"Begin Session Recording"` never references `sessionTitle` directly at all -- only its nested
`runRuleSet` call to `"Set Session Info"` does -- so a non-recursive scan would have missed it
entirely.

**`POST /api/automations/event` gains an optional `prompts: {key: value}`, checked synchronously
before anything runs.** `checkAndApplyPrompts` (`src/main.js`) re-matches the event against enabled
rule sets (same filter `runAutomationRuleSets` itself uses), unions every matched rule set's
`collectRequiredPrompts` result, and refuses the request outright -- `400 {"error": "Missing
required prompt value(s): ..."}`, nothing dispatched, nothing recorded -- if any required key is
missing or blank from the supplied `prompts`. If satisfied, it writes each supplied value into its
field (the same underlying write `setMetadataField` does) *before* the event is recorded, so every
step downstream -- this run and any future one -- reads the fresh value already in place. This is
enforced every single time, unconditionally: there is no "already answered, don't ask again" state
inside Studio at all. A Prompt field's stored value is never treated as "still good" by Studio
itself; whether to bother a human again or silently resupply a cached answer is entirely the
caller's own call (Herald tracking locally whether the GM already typed a description this session,
say) -- Studio's contract stays exactly "supply it fresh, every time, or the run refuses."

**Studio's own "Run Automation" button gets the identical gate**, not a side door around it. The
existing external-Data-Field test-data prompt (added earlier for a step reading a key some other
module registers) is joined by a second pass -- a renderer-side mirror of `collectRequiredPrompts`
(`collectRequiredPromptsPreview`, same dual-copy convention as `resolveDataField`/`previewDataField`
elsewhere in this file) walks the rule set (recursively, same as the server), and for each required
key pops a `promptModal` asking for that field's actual value -- a real answer, written for keeps,
not throwaway test data. Cancelling, or leaving one blank, aborts the run before
`automations:testEvent` is even called. The IPC handler itself calls the exact same
`checkAndApplyPrompts` the HTTP endpoint uses, so the renderer-side dialog is UX only -- the real
enforcement is server-side and can't be bypassed by a stale or buggy renderer copy.

## Discovering Metadata fields externally

Built alongside this (and still valid on its own, independent of Prompt fields): `GET /capabilities`
also returns `metadataFields: [{key, label, type}]`, the live list of every Metadata field configured
right now, read fresh from config on every request (same treatment `ruleSets` already gets). This is
what makes `prompts`' `label`s meaningful to a caller (Herald renders "This rule set needs a value
for Title" using the label straight from `GET /capabilities`, never a key it had to already know),
and is also the general-purpose answer for any future action needing a Metadata field key from an
external caller.

## Verified live

Against the real running automations HTTPS server, using an isolated fixture (a throwaway
`"prompt"`-type field and two throwaway rule sets, one calling the other via `runRuleSet`) --
never the user's real fields or rule sets -- added directly to `config.json`, restored via `diff`
against a pre-fixture backup afterward (confirmed byte-identical):

- `GET /capabilities` correctly listed the fixture field as `{"type": "prompt"}`.
- The **inner** rule set (which references the field directly) showed `"prompts": [{"key":
  "testPromptField", "label": "Test Prompt"}]`.
- The **outer** rule set (which only calls the inner one via `runRuleSet`, never referencing the
  field itself) showed the *identical* `prompts` entry -- confirming the recursive bubble-up works,
  the exact case `"Begin Session Recording"` / `"Set Session Info"` needed.
- `POST /api/automations/event` on the outer event with no `prompts` -> `400 {"error": "Missing
  required prompt value(s): Test Prompt"}`, config untouched.
- The same event with `prompts: {"testPromptField": "..."}` supplied -> `200 {"ok": true}`, and the
  value landed in `config.json`.
- The same event fired again immediately afterward, still with no `prompts` -> still `400`, same
  error -- confirming a field's stored value is never treated as "already answered" by Studio
  itself; a fresh answer is required every single time, unconditionally.

## Also fixed in this pass, adjacent

While tracing how a filename actually reaches OBS (needed to make `applySessionFilename`'s prompt
discovery correct), found and fixed a real live bug, unrelated to prompts but caught along the way:
a `{sessionDate}` substitution (US-locale `toLocaleDateString()`, e.g. `9/18/2026`) went into OBS's
`FilenameFormatting` with no sanitization, and OBS wrote the literal `/` as a real directory
separator -- silently turning one recording into three nested folders on disk instead of one file.
`sanitizeFilenameValue`/`sanitizeFilenamePreviewValue` (`src/main.js`, `src/control/control.js`) now
strip filesystem-reserved characters from each *substituted* value (never literal characters typed
directly into the template) before it reaches OBS -- confirmed against the user's real, already-
affected folder structure, which they then deleted by hand.

## Left alone, deliberately

- The free-form "Test Events" textbox (the Automations tab's manual event tester, not the
  per-rule-set Run Automation button) still calls `automationsTestEvent` with no prompt-collection
  UI of its own. It gets the real enforcement (a typed event matching a rule set with unmet prompts
  throws, surfaced via the ordinary error toast) but not a friendly per-field dialog -- acceptable
  for an exploratory/debug tool, not worth the UI investment there today.
- Converting the user's own real `sessionTitle`/`sessionDescription` fields from `"text"` to
  `"prompt"` was **not** done as part of this change -- that's a real behavior change to their
  live, working configuration (loses the ability to edit them by hand on the Session tab) and
  belongs with actually wiring up Herald's side, not bundled into landing the mechanism itself.

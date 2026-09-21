# Design Components

**Audience:** anyone adding a new card, row, or control to Studio's control panel.

The recurring markup/class patterns already in use in `src/control/index.html` and
`src/control/control.css`. Reuse these rather than inventing a new shape for the same kind of thing --
the control panel currently has one card layout, one chip, one row, and one collapsible-help pattern, all
reused across OBS, Tavern, Automations, YouTube and Metadata. A new feature that invents its own instead
is what starts the drift this page exists to prevent.

Tokens (colors, radius, spacing) are on the Design tokens page.

## Card

The base container for every tab section. `.card` (`control.css:124`): `var(--bg-card)` background,
`var(--border)` border, `var(--radius)` corners, a column flex layout with `12px` gap between children.

Structure is loose, not load-bearing -- a card is just `<div class="card">`, conventionally an `<h2>`
title, an optional `<p class="hint">` intro sentence, then whatever rows/controls the card needs:

```html
<div class="card">
  <h2>YouTube</h2>
  <p class="hint">One sentence saying what this card is for.</p>
  <!-- rows, chips, forms -->
</div>
```

## Row

`.row` (`control.css:342`): a flex-wrap container with `8px` gap, for laying a label + control(s) +
button(s) out horizontally without them overlapping on a narrow window. This is the default wrapper for
any inline group of controls; reach for it before writing a one-off flex rule.

`.row.checks-column` (`control.css:305`) is the vertical variant, for a stack of checkboxes.

## Chip

`.chip` (`control.css:437`): a small pill -- `24px` tall, `var(--bg-input)` background, bordered,
`12px`/`600` text -- for a single labeled unit of removable or status-bearing data (a Tavern player, an
OBS source). Modifiers are separate classes layered on top, matched by intent, not by a fixed enum:

| Modifier | Meaning |
|---|---|
| `.chip-missing` | The thing this chip refers to no longer exists in OBS |
| `.chip-dim` | Present but inactive/disabled |
| `.chip-user-online` / `.chip-user-offline` | Tavern-specific: whether the *person* is at the table right now -- independent of whether the OBS source itself is missing |

A chip's own `<button>` child (`control.css:468`) is borderless/transparent until hover -- the "remove"
affordance, not a general button.

`.tag` (`control.css:155`) is the smaller, non-removable sibling -- a fixed status label like the
`CONNECTED` badge on the YouTube card. Reach for `.chip` when the thing can be removed or represents an
item in a list; `.tag` when it's just a status word next to a heading.

## Buttons

`.btn` (`control.css:349`) is the base; `.btn-primary` / `.btn-danger` are color variants, `.btn-small`
(`control.css:482`) is the size variant (used on nearly every in-card button -- the bare `.btn` size is
for the few full-width/standalone actions), `.btn-icon` (`control.css:1169`) is for an icon-only square
button (used for move-up/move-down/delete controls, always paired with `title`/`aria-label` since there's
no visible text). Combine freely: `class="btn btn-small btn-danger"`.

## Metadata field row

`.metadata-field-row` (`control.css:840`): the read/edit row pattern used for every user-created Metadata
field. Bordered box, wrapping flex layout, a fixed-width (`160px`) label (`.metadata-field-label`) on the
left and a flexible value area (`.metadata-field-value`, `120px` min-width) on the right. If you add a new
kind of "list of editable named things" (not metadata-specific), this is the pattern to copy rather than
reinvent -- see `renderMetadataFields()` in `control.js` for the read/edit-toggle behavior that goes with
it.

## Collapsible walkthrough

`.cert-trust-help` (`control.css:1477`) on a `<details>` element: bordered box, bold clickable `<summary>`,
an `<ol>` of numbered steps inside once open. The name is historical -- it was written for the
OBS-certificate-trust instructions first -- but it's the generic "collapsible numbered how-to" pattern now
and is reused as-is for the YouTube setup walkthrough (`index.html:366, 370, 401`). Use this class (despite
the name) for any step-by-step instructions that should default to collapsed; don't create a
differently-named duplicate for a non-certificate use.

```html
<details class="cert-trust-help">
  <summary>One-line summary of what this unlocks</summary>
  <ol class="hint">
    <li>Step one.</li>
    <li>Step two.</li>
  </ol>
</details>
```

## Toast

`#toast-container` (`control.css:531`) + `.toast` (`control.css:542`): a fixed bottom-right stack of
auto-dismissing confirmations, driven by `showToast(message, { type })` in `control.js`. Use this for a
one-off confirmation of something the user just did (copied, opened, created) -- anything that would
otherwise only show up in the quiet footer `#save-state` line and be easy to miss. Pass `{ type: 'error' }`
for a failure. Do not call `setSaveState()` for this kind of one-off feedback; that line is for the
durable, ongoing "are my edits saved" status, not a transient action confirmation.

## Quick Add

`.metadata-quick-add` / `.quick-add-item` (`control.css:492, 503`): a button + one-line hint, for a
one-click action that creates a starter set of something (currently: Metadata fields). See
`QUICK_ADD_BUNDLES` in `control.js` for the bundle-list shape if you're adding another one -- each bundle
says what it would add right now and renders nothing when there's nothing left to add, rather than a
button that's sometimes a no-op.

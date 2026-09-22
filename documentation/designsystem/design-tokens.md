# Design Tokens

**Audience:** anyone styling Coffee Pub Studio's own UI (the control panel, the edge dock, the bar).

Studio is a standalone Electron app, not a Foundry module -- there is no host page for these tokens to
integrate with, and no other module consumes them. They exist for one reason: so the app's three
independent renderers stay visually one product instead of drifting apart as features get added to each
separately.

## Three renderers, three `:root` blocks

Each surface is its own Electron window with its own HTML document and stylesheet, loaded with no shared
CSS and no build step -- so each declares its full token set on its own `:root`, rather than importing a
shared `vars.css` the way Blacksmith's modules do.

| Surface | Stylesheet | Renders |
|---|---|---|
| Control panel | `src/control/control.css` | The main window -- every tab, every card |
| Edge dock | `src/dock/dock.css` | The always-on-top floating transport controls |
| Bar | `src/bar/bar.css` | The thin per-window title bar overlay |

Keeping them in sync is manual -- there is no equivalent of Blacksmith's `check-design-tokens.mjs` here.
When you add or change a token in one, check whether the other two need the same change.

## Color: core palette

The same warm coffee-brown/amber palette across all three, though not every surface defines every token
(the dock's floating context needs translucency the other two don't).

| Token | control.css | bar.css | dock.css | Use |
|---|---|---|---|---|
| `--bg` | `#1a1410` | `#1a1410` | `rgba(30, 22, 17, 0.96)` | Window/page background -- opaque on the two full windows, near-opaque on the floating dock |
| `--bg-card` | `#241c16` | -- | `rgba(44, 33, 25, 0.9)` | Card / panel surface |
| `--bg-input` | `#140f0c` | -- | -- | Form field background |
| `--bg-hover` | -- | `#2b211a` | `rgba(58, 44, 33, 0.95)` | Hover state background |
| `--border` | `#3b2e24` | `#3b2e24` | `rgba(200, 135, 58, 0.35)` | Default border -- the dock's is accent-tinted since it floats over arbitrary content |
| `--text` | `#f1e6d8` | `#f1e6d8` | `#f1e6d8` | Primary text -- identical everywhere |
| `--text-dim` | `#a8998a` | `#a8998a` | `#b3a293` | Secondary / muted text |
| `--accent` | `#c8873a` | `#c8873a` | `#c8873a` | Brand accent -- identical everywhere, the one token that must never drift |
| `--accent-hover` | `#dd9a48` | -- | -- | Accent hover state |

## Color: status

| Token | control.css | dock.css | Use |
|---|---|---|---|
| `--ok` | `#6fae6b` | `#6fae6b` | Success / connected state |
| `--danger` | `#b8503f` | -- | Destructive action, error text |
| `--danger-hover` | `#d15e4c` | -- | Destructive action hover |
| `--rec` | -- | `#d9534f` | Dock-only: recording indicator |
| `--live` | -- | `#4f8fd9` | Dock-only: streaming-live indicator |

`--rec`/`--live` exist only on the dock because only the dock renders those two indicator dots; there was
no reason to declare them on the other two surfaces.

## Layout

| Token | Where | Value | Use |
|---|---|---|---|
| `--radius` | control.css | `8px` | The one shared corner radius -- cards, inputs, buttons all use it. Bar and dock have no equivalent token; their few rounded corners are literal. |

## Typography

Not tokenized -- each `:root` sets `font-family`/`font-size` directly rather than through a variable,
since nothing downstream needs to read or override them.

| Surface | font-family | font-size |
|---|---|---|
| Control panel | `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif` | `13px` |
| Bar | same stack | `12px` |
| Dock | same stack | `12px` |

## Naming

Tokens are bare (`--accent`, not `--studio-accent`) -- there is no collision risk to guard against, since
nothing outside Studio's own three stylesheets ever reads them. Do not add a prefix; it would just be
noise here, unlike in Blacksmith where the prefix is load-bearing (it is the thing that stops a token from
colliding with a Foundry core variable or another module's).

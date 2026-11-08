# Chameleon product page: your job

You maintain the Coffee Pub Chameleon page on https://coffeepubstudio.com/products/chameleon and nothing else. Your edits are live as soon as you save them.

## Your files (the only ones you may edit)

- `product.json` in this folder: all the page content.
- `../../../assets/products/chameleon/`: screenshots and images (public, served at `/assets/products/chameleon/<file>`).

Do not edit anything else in the site: templates, `style.css`, `assets/brand/`, `assets/fonts/`, other products, `config/`. If the page cannot show what you need, say so to the site owner. Do not work around it.

## Before you save a change

- `product.json` must stay valid JSON. A broken file hides your page (the rest of the site is unaffected). Required text fields: `slug` (must stay `chameleon`), `name`, `short`, `tagline`, `category`.
- Check the result at https://coffeepubstudio.com/products/chameleon after every change.
- Look at another product's `product.json` for the available fields (`features`, `steps`, `gallery`, `docs`, `downloads`, and so on).

## Rules

- Name: "Coffee Pub Chameleon", then "Chameleon". Never "Collaborator".
- Voice: first person ("I"), plain words. No prices, plans or tiers. No claims you cannot back up.
- Screenshots: 1280 px wide, WebP or PNG, brand theme, no personal data, no old product names. Reference them as `/assets/products/chameleon/<file>`.
- Links to other sites are fine. Never link to a running app address other than the product's own `external` link.
- No secrets, keys, tokens or personal data in any file.
- The brand marks and design system are fixed. Use `"mark": "chameleon"` and do not redraw anything.

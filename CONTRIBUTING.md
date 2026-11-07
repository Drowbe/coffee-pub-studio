# Working on a product page

Each product owns two folders and nothing else:

| What | Where |
|---|---|
| Content: name, pitch, features, steps, downloads, docs links | `site/app/products/<slug>/product.json` |
| Public files: screenshots, product images | `site/assets/products/<slug>/` |
| Optional: your own page layout | `site/app/products/<slug>/template.php` |

Without a `template.php`, your page uses the shared product template, which is driven by `product.json`. Start there. Only add your own template if the shared one cannot show what you need.

## Rules

- **The design system is shared.** Use the tokens and components documented at `/design-system`. Do not edit `site/assets/style.css`, `site/assets/brand/`, `site/assets/fonts/`, `site/app/templates/` or `brand/`. If you need something new, open an issue describing it.
- **Marks and names.** Use the product mark and name exactly as in the design system. Chameleon, Showrunner and Gaming each have a mark. Do not redraw them.
- **Screenshots.** WebP or PNG, 1280 px wide, light theme for the page, no personal data, no old product names. Put them in your assets folder and reference them as `/assets/products/<slug>/<file>`.
- **Copy.** First person ("I"), plain words, no prices or tiers, no claims you cannot back up.
- **No secrets, ever.** No keys, tokens, passwords or personal data in any file. A pre-commit hook blocks the obvious ones; do not rely on it.

## Changing something

1. Branch from `main`, change only your folders.
2. Run the site locally if you can: `php -c php-dev.ini -S 127.0.0.1:8090 -t site router.php` from the repo root (see README).
3. Open a pull request. A change outside your folders needs the site owner's approval.
4. Merging does not publish. The site owner publishes after merge.

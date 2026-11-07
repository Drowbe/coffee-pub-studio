# Coffee Pub Studio site

The company site for Coffee Pub Studio: a small PHP site with JSON content, plus the brand work behind it.

- `site/` the website (PHP front controller, templates, content JSON, assets). Copy to the live web root to publish.
  - `site/app/products/<slug>/` and `site/assets/products/<slug>/` belong to each product. See `CONTRIBUTING.md` and `CODEOWNERS`.
- `tools/` command-line helpers that run on the server (`set-admin.php`).
- `golive/` scripts and notes for publishing and rolling back.
- `brand/` brand exploration rounds and the scripts that build the brand kit (`build_kit.py`, `build_v3.py`).
- `router.php`, `php-dev.ini` local development server settings.

## Run locally

```
php -c php-dev.ini -S 127.0.0.1:8090 -t site router.php
```

## What is not in this repository, on purpose

Live data and secrets: `data/`, `secrets.php`, the contact database, admin and nginx passwords, and generated files
(`brand-kit/`, the zip download). A pre-commit check in `.githooks/` blocks files and text that look like secrets.
Enable it once per clone: `git config core.hooksPath .githooks`.

## Brand kit

Run `python -I brand/build_kit.py` to rebuild `brand-kit/` and the zip, then copy `assets/brand/` and `downloads/` into `site/`.

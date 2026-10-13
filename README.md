# Pantau Musubi

Read-only family page for Iron & Rice, in Indonesian. Hosted on GitHub Pages.

- `index.html` is the page. It loads `data.json` and decrypts it in the browser with the key after `#` in the family link.
- `data.json` is encrypted (AES-256-GCM). Without the link's key it can't be read, even though this repo is public.
- `tools/sync.mjs` rebuilds `data.json` from the Iron & Rice family export. A Claude scheduled task runs it every hour and commits only when something changed.
- To cut off an old link: make a new key, rerun the sync with it, and share the new link.

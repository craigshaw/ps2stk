# PS2STK

PS2 Save Toolkit. A desktop browser app for managing PS2 memory card images.

**[Open PS2STK](https://ps2stk.craigshaw.com)**

Card data stays in your browser. There are no accounts, uploads, or saved
workspaces. Download results before closing or refreshing the page.
Original input files stay unchanged.

## Features

- Open up to two standard 8 MiB cards, or create an empty formatted card.
- Browse original 3D save icons, inspect files, and view icon models.
- Copy or delete complete saves, replace individual files, and use Undo/Redo.
- Import PSU, MAX, SPS, XPS, CBS, and signed PS2 PSV packages.
- Export PSU, MAX, or signed PS2 PSV. MAX and PSV require acknowledgement of
  metadata loss. Packages support flat saves; nested saves need raw-folder
  output or a complete-card download.
- Download exact raw files or complete cards. Chrome and Edge also support
  complete-save folder output when directory access is available.

Input layout is detected from bytes. **Download card** keeps the displayed
filename. `.ps2` output includes ECC spare bytes; `.mc2` and `.bin` omit them.
**Download as** selects an extension. Inline renaming keeps the extension.
Package exports and raw dumps do not clear the whole card's changed status.
Firefox and Safari support editing and file, package, and card downloads.
Undo/Redo retains at most 64 MiB of card snapshots across both cards;
parsed cards and temporary buffers use additional memory.

## Status

The features above are implemented. Automated tests and independent format
checks provide byte-level evidence. Game-load validation on PCSX2, PS2 through
MemCard PRO2, and PS3 remains pending. PS3 compatibility is not yet verified.
Installed-browser permissions, minimum versions, and detailed hosted checks
remain open. See [release requirements](PRODUCT.md#release-validation).

## Development

Use Node.js 24. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run dev
npm run check
npx playwright install chromium firefox webkit
npm run test:browser
```

`check` runs TypeScript checks, unit/CLI tests, and the production build.
Engine, session, and format code also compile without DOM or Node types.
There is no separate lint command. Browser tests use synthetic cards in
Playwright Chromium, Firefox, and WebKit. Native OS picker flows are separate
manual checks. See [fixture provenance](tests/fixtures/README.md) for independent
reference checks and fixture generation.

## Command-line harness

```sh
npm run card -- inspect source.ps2
npm run card -- create new-card.ps2 ecc
npm run card -- copy source.ps2 destination.mc2 SAVE-NAME edited.mc2
npm run card -- delete source.ps2 edited.ps2 SAVE-NAME
npm run card -- replace source.ps2 /SAVE-NAME/data replacement.bin edited.ps2
npm run card -- extract source.ps2 /SAVE-NAME/data extracted.bin
npm run card -- import-save destination.ps2 save.psu edited.ps2
npm run card -- export-save source.ps2 SAVE-NAME exported.psu
npm run card -- export-save source.ps2 SAVE-NAME exported.max max --allow-metadata-loss
npm run card -- export-save source.ps2 SAVE-NAME exported.PSV psv --allow-metadata-loss
```

CLI output paths must be new files. Card mutations keep the destination layout;
the browser's extension-based download conversion is a separate policy.
Run `npm run card --` for command syntax.

## Hosting and records

Public [save guides](https://ps2stk.craigshaw.com/guides/) cover imports,
save formats, and copying between cards. Their HTML sources are in `guides/`,
with one shared stylesheet in `public/guides/`. Vite builds them alongside the app.
When adding a guide, include its entry in `vite.config.ts` and `public/sitemap.xml`.
After deployment, verify the site in Google Search Console and submit
`https://ps2stk.craigshaw.com/sitemap.xml`. Search Console setup and live indexing
checks are not part of the local build.

Cloudflare Pages uses the existing `ps2stk` Git project and `main` branch.
Setup values: Node 24, `NODE_VERSION=24`, `SKIP_DEPENDENCY_INSTALL=1`, build
command `npm ci && npm run check`, output `dist`. Hosting was confirmed by the
owner on 2026-09-22; final dashboard settings and the deployed commit still need
independent recording. The app needs no runtime secrets or server bindings.

[PRODUCT.md](PRODUCT.md) defines scope and release requirements.
[CONTEXT.md](CONTEXT.md) defines terms. [DESIGN.md](DESIGN.md) records the visual
system. [AGENTS.md](AGENTS.md) gives development rules.
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) identifies distributed third-party
material and its licence texts.

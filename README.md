<p align="center">
  <img src="public/wordmark.svg" width="360" alt="PS2STK">
</p>

<h1 align="center">PS2 Save Toolkit</h1>

<p align="center">
  Browse, copy, and manage your PlayStation 2 saves in your browser.<br>
  No installation. No accounts. No uploads.
</p>

<p align="center">
  <strong><a href="https://ps2stk.craigshaw.com">Open PS2STK</a></strong>
  · <a href="https://ps2stk.craigshaw.com/guides/">Read the guides</a>
</p>

![Two memory card images open in PS2STK, with original game icons and the save inspector.](docs/screenshots/workspace.png)

## Your saves, at a glance

- **Memory cards.** Open up to two card images, create empty cards, and copy saves between them.
- **3D icons.** View original save icons with animation, rotation, zoom, pause, and frame controls.
- **Raw save export.** Download exact file bytes without package headers, or dump complete saves to folders for hex editing, comparison, and game hacking.
- **Editing.** Delete saves and replace individual files, with separate Undo and Redo for each card.
- **Import.** Load save packages directly or from ZIP and RAR archives, with space and conflict checks.
- **Export.** Download save packages or complete memory card images.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/icon-viewer.png" alt="Icon Viewer showing an original game icon with playback and Free View controls."></td>
    <td width="50%"><img src="docs/screenshots/import-review.png" alt="Import review showing the save preview, destination card, file list, and space needed."></td>
  </tr>
  <tr>
    <td align="center">3D icon viewer</td>
    <td align="center">Save import review</td>
  </tr>
</table>

## Get started

1. **Open a card.** Open [PS2STK](https://ps2stk.craigshaw.com) in a desktop browser and load a memory card image, or create an empty card.
2. **Copy, import, or edit saves.** Open a second card to copy saves between cards. Use **Import save** to add a package, or select a save to inspect its files.
3. **Download your changes.** Use **Download card** to save the complete edited card.

All processing stays in your browser. Original files stay unchanged.
**Closing or refreshing the page discards open cards and edits.** Exporting one
save does not save the rest of the card.

For individual raw files, select a file under **Save files** in the inspector
and choose **Dump file**. For a complete raw save dump, choose **Export selected
save**, then **Raw files to folder** in Chrome or Edge.

Guides: [Importing saves](https://ps2stk.craigshaw.com/guides/import-ps2-saves/),
[copying between cards](https://ps2stk.craigshaw.com/guides/copy-ps2-saves/), and
[save formats](https://ps2stk.craigshaw.com/guides/ps2-save-formats/).

## Supported formats

Open and download standard **8 MiB memory card images** as `.ps2`, `.mc2`, or
`.bin`, with or without ECC spare bytes. `.ps2` downloads include ECC; `.mc2`
and `.bin` downloads omit it.

| Save package | Import | Export |
| --- | :---: | :---: |
| PSU | Yes | Yes |
| MAX | Yes | Yes |
| SPS / XPS | Yes | No |
| CBS | Yes | No |
| PS2 PSV | Yes, with signature verification | Yes, signed |

ZIP and RAR archives can contain several packages; choose one save per import.
MAX and PSV exports ask you to acknowledge metadata loss. Packages support
saves without subfolders. For saves with subfolders, download the complete card
or use folder export.

Chrome and Edge support folder export when directory access is available.
Firefox and Safari support editing and file, package, and card downloads.
Game-load checks on PCSX2, PS2 through MemCard PRO2, and PS3 remain pending.
See [validation status](PRODUCT.md#release-validation) for the current limits.

## Run locally

Install **Node.js 24**, which includes npm. Then run:

```sh
git clone https://github.com/craigshaw/ps2stk.git
cd ps2stk
npm ci
npm run dev
```

Open the local URL printed in the terminal, usually `http://localhost:5173`.

### Build for production

```sh
npm run build
```

The built site is in `dist/`. It is a static site with no backend or runtime
secrets. To preview the build locally:

```sh
npm run preview
```

### Run checks

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:browser
```

`check` runs TypeScript checks, unit and CLI tests, and the production build.
The browser suite runs in Playwright Chromium, Firefox, and WebKit.
See [test fixtures](tests/fixtures/README.md) for independent format checks and
fixture sources.

### Command line

A CLI is included for local scripts and card operations:

```sh
npm run card -- inspect source.ps2
npm run card -- export-save source.ps2 SAVE-NAME exported.psu
```

Run `npm run card --` to see all commands. Output paths must be new files.

## Project

Built with React, TypeScript, Vite, and Three.js.
See [product scope](PRODUCT.md) and [third-party notices](THIRD_PARTY_NOTICES.md).
The screenshots show real game saves; the save files are not included.

Licensed under the [MIT License](LICENSE).

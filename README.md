# PS2STK

A local browser application for managing PS2 memory card images. Open up to two cards, browse their original save icons, copy or delete saves, replace individual files, dump raw contents, and download edited card images.

Repository: [craigshaw/ps2stk](https://github.com/craigshaw/ps2stk).

The first version targets standard 8 MiB images with or without ECC spare bytes and compatibility with PCSX2 and MemCard PRO2. Card processing and Undo/Redo stay in memory during the current page session.

## Project status

Milestones 1 through 3 are implemented. The browser explorer uses the tested card engine and session API, with two card panes, grid/list views, a shared inspector, animated icon previews, and complete editing and download controls. Milestones 3A and 3B save-package support are also implemented. Milestone 3C signed PSV export is implemented; PS3 import and game-load validation remain pending. Release validation and Cloudflare deployment remain in milestone 4.

PSU, MAX, SPS, XPS, CBS, and signed PS2 PSV imports are available, with PSU/MAX and signed PSV exports. PS3 compatibility is not yet verified. See [the delivery plan](docs/save-format-plan.md) for scope and acceptance criteria. Raw dumps and whole-card downloads remain supported. See [milestone 3A validation](docs/milestone-3a-validation.md), [milestone 3B validation](docs/milestone-3b-validation.md), and [milestone 3C validation](docs/milestone-3c-validation.md) for evidence and the PS3 test procedure.

Milestone 1 is accepted for further development. Automated and independent-tool checks pass, and the user checked both prepared card images in existing tooling. Game-load tests on PCSX2 and a PS2 through MemCard PRO2 are deferred to milestone 4 release validation. See the [validation record](docs/milestone-1-validation.md).

Implementation decisions and test evidence are in the [milestone 2](docs/milestone-2-validation.md) and [milestone 3](docs/milestone-3-validation.md) validation records.

- [Product decisions](docs/planning.md)
- [Implementation plan and acceptance criteria](docs/implementation-plan.md)
- [Save-format milestones 3A through 3C](docs/save-format-plan.md)
- [Domain glossary](CONTEXT.md)
- [Project instructions for coding agents](AGENTS.md)

The agreed stack is React, TypeScript, Vite, Three.js, and Lucide, deployed as a static SPA on Cloudflare Pages through Git integration.

## Development

Use Node.js 24 and npm. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run check
npm run dev
```

`check` runs TypeScript checks, the Node test suite, and the production build. Engine and session code also compile without DOM or Node types. `npm run build` writes the static site to `dist/`. There is no separate lint command yet. Three.js is loaded when an icon preview is needed. Lucide supplies interface icons.

## Use the explorer

1. Run `npm run dev`, then open the local URL printed by Vite.
2. Choose **Open memory card** and select a complete 8 MiB image, with or without ECC. Open a second image to copy between cards.
3. Select a save to inspect its icon and files. Use the checkboxes, Ctrl/Command click, Shift click, or Select all for batches.
4. Use the card's Copy or Delete buttons. Copy conflicts default to Skip; Replace removes the entire destination save.
5. Select an individual file in the inspector to dump its exact bytes or replace it. To export a complete save as separate files in Chrome or Edge, use **Export save → Raw files to folder**.
6. Use **Save card** to retain the opened layout and filename, or **Save as** to choose an ECC layout and extension. Downloads leave the original image unchanged.

**Import save** on a card detects PSU, MAX, SPS/XPS, CBS, or PS2 PSV from its contents and opens a review with its icon, file count, capacity, metadata notices, and conflict choice. **Export save** offers PSU (default), MAX, signed PS2 PSV, and **Raw files to folder** for one selected save. PSU/MAX/PSV downloads work in every supported browser. Raw folder export requires Chrome or Edge with directory access and always creates a new save folder. MAX requires acknowledgement because it drops timestamps, flags, and attributes. PSV export requires acknowledgement because it omits extended attributes, opaque card metadata, and dot entries. It preserves file bytes, names, timestamps, and mode flags. PSV imports require a valid signature. Packages support flat saves; select **Raw files to folder** or download the whole card for nested directories. Extract ZIP downloads before selecting a package. Package exports do not clear the whole card's changed status.

Undo/Redo is per card. Ctrl/Command+Z, Shift+Ctrl/Command+Z, and Ctrl/Command+S act on the active card. Arrow keys move between save tiles; Enter or Space selects. The inspector can be hidden, and narrow desktop panes scroll independently. Reduced motion stops icon animation.

Firefox and Safari retain editing and individual file/card downloads. The interface explains when folder dumping is unavailable. Nothing is restored after a refresh. A browser leave-page warning is requested for undownloaded edits, but it is not recovery.

## Browser tests

```sh
npx playwright install chromium firefox webkit
npm run test:browser
```

The suite uses synthetic card data and isolated browser profiles. Folder writes use a test-only directory picker connected to real Chromium file streams. Native OS picker permissions, installed Edge/Safari, and destination game loads remain release checks. See [the evidence and limits](docs/milestone-3-validation.md).

## Card harness

```sh
npm run card -- import-save destination.ps2 save.psu edited.ps2
npm run card -- export-save edited.ps2 SAVE-DIRECTORY exported.psu
npm run card -- export-save edited.ps2 SAVE-DIRECTORY exported.max max --allow-metadata-loss
npm run card -- export-save edited.ps2 SAVE-DIRECTORY exported.PSV psv --allow-metadata-loss
npm run card -- inspect source.ps2
npm run card -- extract source.ps2 /SAVE-NAME/data extracted.bin
npm run card -- copy source.ps2 destination.mc2 SAVE-NAME edited.mc2
npm run card -- copy source.ps2 destination.mc2 SAVE-NAME replaced.mc2 replace
npm run card -- delete source.ps2 deleted.ps2 SAVE-NAME ANOTHER-SAVE
npm run card -- replace source.ps2 /SAVE-NAME/data replacement.bin replaced.ps2
npm run card -- convert source.ps2 data converted.mc2
npm run card -- convert source.mc2 ecc converted.ps2
npm run card -- copy-batch source.ps2 destination.mc2 plan.json batch.mc2
```

Use existing, complete card images as inputs. Output paths must not already exist. A copy retains the destination's binary layout, regardless of the filename extension. The single-copy command reports conflicts by default; its optional final argument can be `skip`, `replace`, or `error`. Insufficient capacity leaves both input cards unchanged. Replacement retains the existing file name and metadata, including timestamps and flags.

A batch plan resolves each conflict before the operation. Omitted conflict choices default to Skip. For example:

```json
[
  { "name": "SAVE-A", "onConflict": "skip" },
  { "name": "SAVE-B", "onConflict": "replace" }
]
```

The whole batch succeeds or fails. Replace uses the entire source save, with no merge. The plan file is a CLI test aid, not a save-package format.

## Session API

`src/session/session.ts` provides `CardSession` for the explorer. Open slots 0 and 1, then use `copySaves`, `deleteSaves`, `replaceFile`, or `convertLayout`. `importSave` commits a validated save against an expected card identity; `prepareSaveExport` creates PSU or explicitly acknowledged MAX/PSV output without marking the card downloaded. The browser uses a package worker for compression and decoding, then commits validated imports through the session API. `undo` and `redo` restore exact card bytes. History retains at most 64 MiB of byte buffers across both cards; current parsed cards and temporary operation buffers use additional memory. State and history disappear with the session.

`prepareDownload` defaults to the original filename and current layout. Optional `layout` and `extension` produce Save as output without changing the working card. Call `markDownloadOffered` only after initiating a whole-card download. It records the exported revision, not verified disk persistence. Raw file dumps do not change download status. The explorer acknowledges the prepared revision after initiating its download.

The engine has no dependency on the sibling repository, browser APIs, or reference tools. Personal cards and extracted files must remain outside Git. See [fixture provenance](tests/fixtures/README.md) for synthetic test data and independent verification commands.

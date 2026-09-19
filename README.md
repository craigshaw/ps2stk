# PS2STK

A browser application in development for managing PS2 memory card images. The planned explorer opens up to two cards, shows animated save icons, copies or deletes saves, replaces individual files, dumps raw contents, and downloads edited card images.

Repository: [craigshaw/ps2stk](https://github.com/craigshaw/ps2stk).

The first version targets standard 8 MiB images with or without ECC spare bytes and compatibility with PCSX2 and MemCard PRO2. Card processing and Undo/Redo stay in memory during the current page session.

## Project status

Milestones 1 and 2 have a TypeScript card engine, a command-line harness, and session state for two cards. The engine reads standard 8 MiB images with or without ECC, extracts exact file bytes, copies or deletes complete saves, replaces files, and converts card layouts. Session state adds bounded Undo/Redo and download revision tracking. The browser page is still a static development shell; the production explorer is milestone 3.

Milestone 1 is accepted for further development. Automated and independent-tool checks pass, and the user checked both prepared card images in existing tooling. Game-load tests on PCSX2 and a PS2 through MemCard PRO2 are deferred to milestone 4 release validation. See the [validation record](docs/milestone-1-validation.md).

Milestone 2 implementation decisions, checks, and remaining integration work are in the [milestone 2 validation record](docs/milestone-2-validation.md).

- [Product decisions](docs/planning.md)
- [Implementation plan and acceptance criteria](docs/implementation-plan.md)
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

`check` runs TypeScript checks, the Node test suite, and the production build. Engine and session code also compile without DOM or Node types. `npm run build` writes the static site to `dist/`. There is no separate lint command yet. Three.js and Lucide will be added when the explorer and icon rendering are implemented.

## Card harness

```sh
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

`src/session/session.ts` provides `CardSession` for the forthcoming explorer. Open slots 0 and 1, then use `copySaves`, `deleteSaves`, `replaceFile`, or `convertLayout`. `undo` and `redo` restore exact card bytes. History retains at most 64 MiB of byte buffers across both cards; current parsed cards and temporary operation buffers use additional memory. State and history disappear with the session.

`prepareDownload` defaults to the original filename and current layout. Optional `layout` and `extension` produce Save as output without changing the working card. Call `markDownloadOffered` only after initiating a whole-card download. It records the exported revision, not verified disk persistence. Raw file dumps do not change download status. Browser download controls will be connected in milestone 3.

The engine has no dependency on the sibling repository, browser APIs, or reference tools. Personal cards and extracted files must remain outside Git. See [fixture provenance](tests/fixtures/README.md) for synthetic test data and independent verification commands.

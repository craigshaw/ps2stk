# PS2STK

A browser application in development for managing PS2 memory card images. The planned explorer opens up to two cards, shows animated save icons, copies or deletes saves, replaces individual files, dumps raw contents, and downloads edited card images.

Repository: [craigshaw/ps2stk](https://github.com/craigshaw/ps2stk).

The first version targets standard 8 MiB images with or without ECC spare bytes and compatibility with PCSX2 and MemCard PRO2. Card processing and Undo/Redo stay in memory during the current page session.

## Project status

Milestone 1 has a TypeScript card engine and command-line harness. It reads standard 8 MiB images with or without ECC, extracts exact file bytes, exports unchanged images, and copies one complete save into another card without changing either input. The browser page is a static development shell. The explorer and remaining editing operations are not implemented yet.

Automated and independent-tool checks pass. PCSX2 and MemCard PRO2 execution are still required before milestone 1 compatibility can be signed off. See the [validation record](docs/milestone-1-validation.md).

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

`check` runs TypeScript checks, the Node test suite, and the production build. `npm run build` writes the static site to `dist/`. There is no separate lint command yet. Three.js and Lucide will be added when the explorer and icon rendering are implemented.

## Card harness

```sh
npm run card -- inspect source.ps2
npm run card -- extract source.ps2 /SAVE-NAME/data extracted.bin
npm run card -- copy source.ps2 destination.mc2 SAVE-NAME edited.mc2
```

Use existing, complete card images as inputs. Output paths must not already exist. A copy retains the destination's binary layout, regardless of the filename extension. It fails on a name conflict or insufficient capacity. Replace, delete, layout conversion, and Undo/Redo belong to milestone 2.

The engine has no dependency on the sibling repository, browser APIs, or reference tools. Personal cards and extracted files must remain outside Git. See [fixture provenance](tests/fixtures/README.md) for synthetic test data and independent verification commands.

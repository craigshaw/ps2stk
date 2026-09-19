# PS2STK

A planned browser application for managing PS2 memory card images. Open up to two cards, browse animated save icons, copy or delete saves, replace individual files, dump raw contents, and download edited card images.

Repository: [craigshaw/ps2stk](https://github.com/craigshaw/ps2stk).

The first version targets standard 8 MiB images with or without ECC spare bytes and compatibility with PCSX2 and MemCard PRO2. Card processing and Undo/Redo stay in memory during the current page session.

## Project status

Product planning and an interactive UI layout study are complete enough to begin the card-engine milestone. The production application is not implemented yet.

- [Product decisions](docs/planning.md)
- [Implementation plan and acceptance criteria](docs/implementation-plan.md)
- [Domain glossary](CONTEXT.md)
- [Project instructions for coding agents](AGENTS.md)

The agreed stack is React, TypeScript, Vite, Three.js, and Lucide, deployed as a static SPA on Cloudflare Pages through Git integration.

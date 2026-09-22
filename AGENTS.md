# Project instructions

## Communication

- Use Simplified Technical English.
- Do not use em dashes in responses, documentation, or other written artifacts.
- Report what changed, the checks performed, and any remaining limitations. Distinguish test evidence from assumptions.

## Read before working

- Read `README.md` for project status.
- Read `CONTEXT.md` for domain terminology. Keep it a glossary, not an implementation specification.
- Read `docs/planning.md` for agreed product decisions.
- Read `docs/implementation-plan.md` for milestone work and acceptance criteria.
- Follow the current user request. Do not start later milestones merely because they appear in the plan.

Milestones 1 through 3 are implemented: the card engine, editing/session API, and browser explorer. The command-line harness remains usable. Milestones 3A and 3B are implemented; signed PSV export in 3C is implemented, with PS3 validation pending; read `docs/save-format-plan.md` before that work. Start only the milestone requested by the user. Release validation and deployment are milestone 4. The user deferred game-load tests to milestone 4. Read the existing `docs/milestone-*-validation.md` records, including milestones 3A through 3C, for evidence and remaining release tests.

Use Node.js 24 and `npm ci`. Run `npm run check` for TypeScript checks, unit tests, and the production build. Individual commands are `npm run typecheck`, `npm test`, and `npm run build`. Run `npm run test:browser` for explorer regression tests in Playwright Chromium, Firefox, and WebKit. Install those engines with `npx playwright install chromium firefox webkit`. There is no separate lint command. `npm run test:reference -- /path/to/mymcplus` runs the optional independent checks against the pinned external tool documented in `tests/fixtures/README.md`.

## First-release boundaries

- Build a desktop SPA using React, TypeScript, Vite, Three.js, and Lucide.
- Process card data locally in the browser. Cloudflare Pages serves static assets through Git integration.
- Support up to two standard 8 MiB PS2 card images, with or without ECC spare bytes.
- Keep cards, edits, and Undo/Redo history in memory for the current page session only.
- Support complete-save copy and deletion, individual file replacement, raw file/save dumps, and complete edited-card downloads.
- The approved expansion adds PSU, MAX, SPS, XPS, CBS, and PS2 PSV package imports; PSU/MAX export first, then signed PSV export. All listed imports and PSU/MAX/PSV exports are implemented; PS3 transfer and game-load tests remain pending. Follow the scope, metadata policy, bounds, and independent-validation requirements in `docs/save-format-plan.md`.
- Preserve the source image's layout and extension by default. Explicit Save as can change the ECC layout and select .ps2, .mc2, or .bin.
- Keep a save distinct from a save file and a whole memory card image, as defined in `CONTEXT.md`.
- Do not add a backend, accounts, persistent workspaces, ZIP save packages, damaged-card recovery, or game-specific editing without a scope change from the user.

## Implementation approach

- Establish reading and writing correctness through independent-tool checks before most production UI work. Game-load testing on PCSX2 and a PS2 through MemCard PRO2 is deferred to milestone 4 by user agreement.
- Keep the TypeScript card engine independent of React, the DOM, and browser file pickers.
- Keep card operations, session state, browser I/O, and icon rendering separate.
- Keep save-format readers/writers in `src/formats`, independent of browser and Node APIs. Add validated external-save import to the engine; do not manufacture a temporary card to reuse card-to-card copying. Preserve the existing copy and metadata regressions.
- Preserve the documented milestone 2 metadata policy and 64 MiB shared history-byte limit. Engine and session TypeScript must compile without DOM or Node types.
- Prefer the smallest implementation that meets the agreed scope. Use evidence before adding workers, caches, or other architectural complexity.
- The optional sibling checkout `../ps2mcs/icon_browser/` is a reference for parsing and rendering. It is not a runtime or build dependency of this repository.
- Validate reused code, preserve its attribution and license notices, and do not assume the existing parser is safe for writing cards.
- Package imports detect PSU, MAX, SPS/XPS, CBS, and signed PS2 PSV contents. PSU is the default export; MAX and PSV require metadata-loss acknowledgement. PSV uses a deterministic public seed; no user keys or backend are needed. Do not claim PS3 compatibility before destination tests pass. Browser codecs run in short-lived workers; core/session/formats remain free of browser types.
- Browser I/O lives in `src/browser`, previews in `src/icons`, and React components in `src/ui`. Folder dumping requires a new output save folder and never merges existing dumps.
- The renderer uses one shared WebGL context and disposes offscreen previews. Keep parsing bounded and preserve the animation/reduced-motion tests. Refresh `public/third-party-notices.txt` from the attribution file and installed runtime licenses if their content changes.
- Use Lucide for interface icons. Use the original save assets for PS2 icon previews, with fallback previews for unsupported or broken icons.

## Binary data correctness

- Treat memory card bytes as untrusted input. Bound reads, allocations, and traversal; reject unsupported layouts and structurally invalid images with clear errors.
- Never silently return incomplete file contents or treat a filename extension as proof of binary layout.
- Account for spare bytes between pages and generate valid ECC values when changed output includes ECC.
- Preserve original input files. Apply edits to working copies.
- Resolve copy conflicts and capacity requirements before committing changes. A copy action completes in full or leaves both cards unchanged.
- Calculate capacity from allocation requirements, including directory overhead, rather than file-byte totals alone.
- Preserve unrelated files and metadata. Do not silently merge conflicting saves or strip attributes to make a copy succeed.
- Each successful content action is one Undo step. Failed operations do not add history.
- Dump raw files without added headers or metadata wrappers. A complete save dump contains separate original files and retains their directory structure.
- Save-package export is a separate operation and does not clear whole-card download status. Preserve payload bytes, report format metadata loss, and reject unrepresentable structures. Package import follows atomic conflict/capacity/history rules.
- Folder dumping must validate output paths and report partial external writes accurately. It is separate from atomic in-memory card edits.

## Validation

- Add meaningful tests for binary parsing and mutation, including malformed images and operation failures.
- Verify exact file bytes, unchanged exports, unaffected content, and Undo/Redo restoration.
- Compare results with independent tools or independently derived fixtures. A reader and writer agreeing with each other is not sufficient evidence.
- Record fixture provenance and distinguish synthetic, independent-tool, emulator, and hardware results.
- PCSX2 and MemCard PRO2 compatibility requires destination testing. If hardware is unavailable, document the remaining manual test and do not claim that it passed.
- Test the agreed browser support split: Chrome and Edge include folder dumps; Firefox and Safari retain editing and individual file/card downloads.
- Check keyboard operation, reduced motion, and narrow desktop layouts when changing the UI.
- Run checks relevant to the change. Documentation-only changes need link and diff checks, not invented application tests.

## Repository hygiene

- Do not commit credentials, environment secrets, personal card images, game-save dumps, or generated build output.
- Use synthetic fixtures where possible. Add real binary fixtures only when their inclusion and distribution are explicitly authorised; document their source.
- Do not put test card images or personal save assets in public application assets.
- Keep reference repositories unchanged unless the user asks for changes there.
- Update the planning documents when agreed scope changes. Record new domain terms in `CONTEXT.md` as they are resolved.
- Use ADRs only for consequential decisions with a real trade-off and a meaningful reversal cost. Do not create one for every library or routine implementation choice.
- Before a commit, inspect the staged files and diff. Do not include unrelated work or force-push over remote history.

## Hosting

- The GitHub repository is `https://github.com/craigshaw/ps2stk`.
- Cloudflare Pages Git hosting is live at `https://ps2stk.craigshaw.com`, confirmed by the user on 2026-09-22. Use the existing project in the account that manages `craigshaw.com`; do not create a duplicate project for routine changes.
- Read `docs/deployment.md` for setup values, user-reported hosting evidence, and remaining hosted checks. Dashboard configuration and the deployed commit have not been independently recorded. Milestone 4 release validation and destination game-load tests remain open.

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

The project has an accepted milestone 1 engine and implemented milestone 2 editing, conversion, and session history. The command-line harness is usable; the browser remains a minimal shell. The production explorer is milestone 3. The user deferred game-load tests to milestone 4. Read `docs/milestone-1-validation.md` and `docs/milestone-2-validation.md` for evidence and remaining release tests.

Use Node.js 24 and `npm ci`. Run `npm run check` for TypeScript checks, unit tests, and the production build. Individual commands are `npm run typecheck`, `npm test`, and `npm run build`. There is no separate lint command. `npm run test:reference -- /path/to/mymcplus` runs the optional independent checks against the pinned external tool documented in `tests/fixtures/README.md`.

## First-release boundaries

- Build a desktop SPA using React, TypeScript, Vite, Three.js, and Lucide.
- Process card data locally in the browser. Cloudflare Pages serves static assets through Git integration.
- Support up to two standard 8 MiB PS2 card images, with or without ECC spare bytes.
- Keep cards, edits, and Undo/Redo history in memory for the current page session only.
- Support complete-save copy and deletion, individual file replacement, raw file/save dumps, and complete edited-card downloads.
- Preserve the source image's layout and extension by default. Explicit Save as can change the ECC layout and select .ps2, .mc2, or .bin.
- Keep a save distinct from a save file and a whole memory card image, as defined in `CONTEXT.md`.
- Do not add a backend, accounts, persistent workspaces, ZIP save packages, damaged-card recovery, or game-specific editing without a scope change from the user.

## Implementation approach

- Establish reading and writing correctness through independent-tool checks before most production UI work. Game-load testing on PCSX2 and a PS2 through MemCard PRO2 is deferred to milestone 4 by user agreement.
- Keep the TypeScript card engine independent of React, the DOM, and browser file pickers.
- Keep card operations, session state, browser I/O, and icon rendering separate.
- Preserve the documented milestone 2 metadata policy and 64 MiB shared history-byte limit. Engine and session TypeScript must compile without DOM or Node types.
- Prefer the smallest implementation that meets the agreed scope. Use evidence before adding workers, caches, or other architectural complexity.
- The optional sibling checkout `../ps2mcs/icon_browser/` is a reference for parsing and rendering. It is not a runtime or build dependency of this repository.
- Validate reused code, preserve its attribution and license notices, and do not assume the existing parser is safe for writing cards.
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
- Cloudflare Pages Git integration is agreed. Account, project name, production configuration, and custom domain are deployment-time details.
- Initial repository setup does not require creating a Cloudflare project or changing DNS.

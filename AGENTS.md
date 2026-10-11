# Project instructions

## Read first

- Read `README.md` for status, commands, and hosting values; `CONTEXT.md` for
  terms; `PRODUCT.md` for scope and release requirements; `DESIGN.md` for UI work.
- Follow the current request. Do not start later work merely because it is listed.
- Use Simplified Technical English. Do not use em dashes.
- Report changes, checks, and limits. Distinguish test results from assumptions.

## Development

- Use Node.js 24 and `npm ci`. Run `npm run check` for TypeScript, unit/CLI tests,
  and the production build. There is no separate lint command.
- Run `npm run test:browser` for UI changes. Install Chromium, Firefox, and WebKit
  with `npx playwright install chromium firefox webkit` if needed.
- Documentation-only changes need link and diff checks. Run other checks when
  their inputs or behaviour change.
- See `tests/fixtures/README.md` for external tool pins and reproduction commands.
  A same-parser round trip is not independent evidence of binary correctness.

## Architecture

- Keep `src/core`, `src/session`, and `src/formats` independent of React, DOM,
  Node APIs, and file pickers. Preserve their separate TypeScript check.
- Browser I/O and short-lived package workers belong in `src/browser`, previews
  in `src/icons`, and React components in `src/ui`.
- Import validated saves directly; do not construct temporary cards for copying.
- Keep data and history in browser memory for the page session. Preserve per-card
  Undo/Redo and the shared 64 MiB history-byte limit.
- Use one shared WebGL context and dispose unused previews. Preserve parser bounds,
  animation, pause, reduced motion, keyboard access, and narrow-desktop behaviour.
- Use Lucide for interface icons and original save assets for previews, with fallbacks.
- Prefer the smallest implementation that meets scope. Measure before adding
  workers, caches, or architectural complexity.

## Binary correctness

- Treat bytes as untrusted. Bound reads, allocation, decompression, and traversal.
  Reject invalid structures and unsupported layouts with clear errors.
- Detect input layout and package format from contents. Never silently return
  incomplete files or treat an extension as proof of input format.
- Preserve inputs. Edit candidate working copies and commit only after complete
  validation. Resolve conflicts and capacity first, including directory overhead
  and reclaimed replacement space.
- Preserve unrelated content and metadata. Follow `PRODUCT.md` for replacement
  and package metadata policies. Never merge, rename, or strip protection flags
  to make an operation succeed.
- Failures and no-ops leave both cards and history unchanged. Each successful
  content action is one Undo step. Verify exact Undo/Redo restoration.
- Account for spare bytes between pages; generate valid ECC on changed output.
  `.ps2` downloads include ECC; `.mc2` and `.bin` omit it. Do not expose ECC choices
  in the UI. Filename renaming changes download status, not bytes or history.
- Raw dumps have no wrappers. Folder dumps preserve structure, validate paths,
  require a new save folder, and report partial external writes accurately.
- Package exports do not clear whole-card download status. Preserve payloads,
  report metadata loss, and reject unrepresentable structures.
- Reject stale asynchronous import reviews. Verify PSV signatures. Exports use
  the fixed public seed, with no user keys or backend.

## Repository and release

- Keep credentials, personal cards, game-save dumps, and generated output out of
  Git and public assets. Use synthetic fixtures with recorded provenance.
- Keep reference repositories unchanged. They are not build dependencies.
- Preserve upstream attribution and licences. Keep `THIRD_PARTY_NOTICES.md`,
  `public/third-party-notices.txt`, and asset licences aligned with shipped material.
- Update `PRODUCT.md` for agreed scope, `CONTEXT.md` for terms, and `DESIGN.md` for
  styling. Do not add progress journals or duplicate plans. Use ADRs only for
  consequential trade-offs with meaningful reversal cost.
- Inspect staged files and diff before committing. Exclude unrelated work and
  do not force-push over remote history.
- GitHub: `https://github.com/craigshaw/ps2stk`. Hosting:
  `https://ps2stk.craigshaw.com`. Reuse the existing Cloudflare Pages project.
- Destination game-load tests and detailed hosted checks remain open. Do not
  claim PCSX2, MemCard PRO2, or PS3 compatibility from format checks alone.

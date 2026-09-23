# Milestone 3 explorer implementation and validation

Implemented on 2026-09-19. Release validation and deployment remain milestone 4.

Deployment update, 2026-09-22: the user confirmed the Pages site working at [ps2stk.craigshaw.com](https://ps2stk.craigshaw.com). This supersedes the pending deployment status in the original record below. Detailed hosted and destination checks remain open; see [deployment notes](./deployment.md).

## Delivered

- Dark desktop explorer with up to two cards, comfortable icon grid, list view, title/directory search, batch selection, and a collapsible right inspector.
- Visible card identity, free capacity, download status, and per-card Undo/Redo. Copy names its destination explicitly. A batch review shows source/destination details and defaults conflicts to Skip.
- Complete-save copy, replacement and deletion; individual file replacement; exact raw file downloads; and whole-card Save/Save as. These use the existing immutable engine and session API. No card mutation code was added to React.
- File-tree folder dumps in browsers with `showDirectoryPicker`. Preflight rejects unsafe names and case/Unicode-normalization collisions. Dumps require a new save folder and never silently merge or overwrite. A failed write reports the number of completed files and whether partial output can remain.
- Third-card slot choice, validation before replacing an open card, discard confirmation, download revision acknowledgement, and a leave-page warning request. Refresh starts a new, empty session.
- Original normal icons, textures, lighting, and stored morph keys. Missing, unsupported or malformed icons use a fallback without blocking file operations. One shared WebGL context serves visible previews. Offscreen resources are disposed. Only the inspector and hovered/focused saves animate. Pause and reduced motion are supported.
- Lucide interface icons, locally served assets, keyboard selection/navigation, dialog focus restoration, and independent pane scrolling at narrow desktop widths. Interface buttons cover every workflow.

## Validation evidence

| Check | Evidence |
| --- | --- |
| Application and engine TypeScript | `npm run check`; the engine/session configuration still excludes DOM and Node types. |
| Unit and CLI checks | 97 tests, including 89 existing engine/session tests and new icon and folder-write cases. |
| Production build | Static Vite build. Three.js is a separate lazy-loaded preview chunk. No test cards, personal icons, external fonts, or backend calls are included. |
| Browser regression suite | 22 checks passed across Playwright Chromium, Firefox, and WebKit. Two folder-write cases are intentionally skipped in the unsupported browser families. Covers binary output comparisons, copy conflicts, whole-save replacement, failed replacement rollback, Undo/Redo, third-card choice, invalid input preservation, keyboard controls, dialog focus, reduced motion, fuller-card scrolling, and empty state after reload. |
| Folder write integration | Chromium uses a test-only picker backed by real origin-private directory handles and file streams. Tests compare extracted bytes and reject an existing output folder. The native OS picker and permission UI are not automated by this check. |
| Folder failure cases | Unit tests cover invalid paths, case collisions, existing folders, stream abortion, and exact partial completion counts. |
| Download status | Raw file dumping retains changed status. Whole-card download initiation clears it for the prepared revision. The browser leave-page handler follows that status. Disk persistence is not claimed. |
| Animation | A hand-authored two-shape fixture checks non-uniform key times, cyclic interpolation and pixel changes. Browser tests check still tiles, hover playback, inspector playback, Pause and runtime reduced motion. |
| Local icon reference comparison | Ten normal icon models from the existing OutRun and homebrew cards match pinned mymc+ geometry, normals, UVs, decoded texture hashes, animation headers and stored keys. Extracted bytes were passed to the independent icon parser. This does not constitute another card file-system or game-load check. |
| Installed Chrome | Chrome 153.0.8010.52 displayed both local cards and the OutRun preview without console errors. Layouts were inspected at 1440 and 850 pixels. Personal assets stayed local. |
| Narrow windows | Automated overflow checks at 1024, 850, 640 and 400 pixels, plus a fuller two-card regression at 850 pixels. |
| Local processing | Browser request checks observe no card-data requests. Production assets contain no fixtures. Application code has no persistence, upload, fetch or backend API. |

The icon format was checked against Martin Akesson's original
[PS2 Icon Format v0.5](https://www.ps2savetools.com/ps2icon-0.5.pdf), the sibling
MIT-licensed parser/renderer, and the pinned external mymc+ parser. Attribution
is in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and the distributed
[license file](../public/third-party-notices.txt).

## Reproduce

```sh
npm ci
npm run check
npx playwright install chromium firefox webkit
npm run test:browser
npm run dev
```

Browser tests use generated/synthetic data from `tests/icon-helper.ts` and the
existing synthetic fixtures. Folder-picker integration runs in Chromium only;
the unsupported-capability notice and all editing/download paths are tested
across the three engines. WebKit is test-engine evidence, not a claim that the
installed Safari release has passed.

## Limits and release checks

- Test native directory selection, permission denial/revocation, and downloads in installed Chrome and Edge over HTTPS. The automated folder test substitutes only the picker; it does not prove native permission behaviour.
- Complete installed Safari/Edge checks and set minimum browser versions. Browser families without directory picking retain editing and individual file/card downloads.
- The local real icons have one shape each. Multi-shape playback is covered with synthetic keys, not a broad collection of animated game icons. Add representative animated-icon checks during release validation.
- The historical icon format documentation leaves timing fields partly unresolved. Playback interpolates the stored weights at eight ticks per second multiplied by the speed field, with its play offset. The preview also rotates gently. Console-exact timing and rendering are not claimed. The background uses the application's dark stage rather than the icon.sys background colours.
- Preview limits reject icons over 2 MiB, more than 64 shapes or 65,535 vertices, over one million shape/vertex pairs, or invalid animation/texture bounds. A rejected preview remains a normal editable save. These limits are not memory-card format restrictions.
- Folder writes are external side effects, cannot be undone by card Undo, and are not atomic. A failed dump can leave a partial new output folder. No automatic renaming or overwrite is attempted.
- The build reports Lucide's client-directive warning in this client-only SPA and a size advisory for the lazy Three.js chunk (about 132 kB gzip). Neither is a build failure. Further performance work belongs to measured release validation.
- PCSX2 and PS2/MemCard PRO2 game-load checks remain deferred as agreed. Cloudflare Pages configuration and deployment have not started.

## Follow-up: card download formats

On 2026-09-23, the user set the whole-card format by filename extension. Save card
keeps the opened filename; Save as selects only `.ps2`, `.mc2`, or `.bin`.
`.ps2` downloads include calculated ECC spare bytes. `.mc2` and `.bin` downloads
omit them. Input layout is still detected from bytes. The working card, history,
and original input file remain unchanged by download conversion. The card pane
and Save as dialog no longer expose ECC or a layout control. Invalid image
messages also avoid the ECC term.

Validation after the change: `npm run check` passed 136 unit/CLI tests,
TypeScript, and the production build. `npm run test:browser` passed 52 tests
across Chromium, Firefox, and WebKit, with two expected folder-access skips.
Six focused browser checks passed after the final Save as copy change. The
independent mymc+ reference suite passed structural, metadata, file-byte, and
ECC checks in both layouts. The Save as dialog was visually inspected at 1440
and 390 pixels; the narrow dialog had no horizontal overflow. Destination
game-load tests remain part of milestone 4.

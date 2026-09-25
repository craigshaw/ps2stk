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

## Follow-up: inline card filename editing

On 2026-09-24, the card pane gained an inline filename editor. It edits the
filename stem and keeps the extension fixed. Save card uses the displayed name;
Save as uses that stem with the selected extension. A rename changes download
status and close protection, but leaves card bytes and Undo history unchanged.
The editor supports keyboard entry, Enter to apply, Escape to cancel, and
inline validation of unsafe filenames.

Validation after the change: `npm run check` passed 139 unit/CLI tests,
TypeScript, and the production build. `npm run test:browser` passed 55 tests
across Chromium, Firefox, and WebKit, with two expected folder-access skips.
The new browser check verified both download filenames and the binary layout of
`.ps2` and `.bin` downloads. The editor was visually inspected at 1440 and 390
pixels; automated checks found no overflow at 390 and with two cards at 850
pixels. Destination game-load tests remain part of milestone 4.

## Follow-up: expanded icon viewing

On 2026-09-24, the explorer gained a larger icon viewer. It reads the Normal,
Copy, and Delete filenames from `icon.sys`, as defined by the
[icon.sys format](https://www.ps2savetools.com/documents/iconsys-format/).
It also offers extra `.ico` and `.icn` files in the save. The inspector retains
the Normal preview; View icons opens the viewer, and a selected icon save file
can open directly in it. Choices with missing files show a fallback. The viewer
uses the existing shared renderer, pause state, and reduced-motion setting.
Card bytes, history, and download state are unchanged.

`npm run check` passed TypeScript, 139 unit/CLI tests, and the production build.
The full `npm run test:browser` run passed 58 tests across Chromium, Firefox,
and WebKit, with the two existing folder-access skips. A final focused run
passed in all three engines after adding nested extra-file discovery. A
synthetic save checked three `icon.sys` roles, one nested extra icon, rendered
pixel differences, animation, pause, reduced motion, keyboard entry and focus
return. The local OutRun sample
resolved `icon.ico`, `copy.ico`,
and `del.ico`; desktop and 390-pixel viewer screenshots showed no horizontal
overflow or page errors. The sample and screenshots were not added to the
repository. These checks do not establish console-exact icon playback or
destination game-load compatibility.

The viewer's canvas initially stretched wide models because its width and
height were capped separately. A shared scale now preserves the CSS aspect
ratio. A focused Playwright check passed in Chromium, Firefox, and WebKit at
desktop and 390-pixel widths. Corrected desktop and narrow screenshots of the
local OutRun save showed no visible stretch or horizontal overflow.

The local OutRun `icon.ico`, `copy.ico`, and `del.ico` files are byte-identical:
each is 64,302 bytes and parses as one model shape with one static animation
track. The viewer now identifies Copy or Delete files that match Normal. This
sample contains no distinct file animation for those roles. The PS2 browser
adds motion during copy or delete. That motion cannot be derived from the
three icon files alone.

The user then provided a PNG and a 41-second PS2 Browser recording on
2026-09-24. They remain local reference files outside Git. The PNG shows the
OutRun car from above in the card overview, while the recording shows the same
car from the side in the save detail and action screens. The local `icon.sys`
names `icon.ico` as Normal and stores lighting data; its four background
colours are all zero. The grey overview background and bright selection glow
are Browser presentation, while the car geometry and texture come from
`icon.ico`. At that point, the application used one camera and a dark stage, so
its view differed from both console screens. The user deferred further action
animation work until a save with custom animation is available.

## Follow-up: PS2 Browser icon views

On 2026-09-25, the user selected a fixed 40-degree camera as the closest
overview candidate from the render sweep. The card panes initially used that view and
remain still on hover and keyboard focus. The inspector and enlarged viewer
retain moving playback. The selected stages blend the bounded `icon.sys`
corner colours at its stored opacity over the app's dark background. Burnout 3's
one-shape, no-keyframe track with shape ID 1 now displays its stored shape;
other out-of-range IDs still fail.

`npm run check` passed TypeScript, 140 unit/CLI tests, and the production build.
`npm run test:browser` passed 58 tests in Chromium, Firefox, and WebKit, with
two expected folder-access skips. A focused three-engine run then passed after
adding assertions for the selected background gradients. The local `TEST.ps2`
rendered all three overview icons with no fallback. Desktop and 390-pixel
screenshots showed no horizontal overflow. Selected stages matched the stored
opacity values: OutRun 128, Sega Rally 64, and Burnout 0. The reference card
and screenshots were not added to the app or test fixtures.

The supplied PS2 screenshots support a visual comparison, not an exact camera
matrix or playback rate. Its translucent selected backgrounds reveal the PS2
Browser scene; this app blends them over its own dark stage. Custom Copy and
Delete animation still awaits a suitable reference save.

The user then compared angles with a temporary desktop slider and chose 45
degrees. The slider was removed and the card-pane camera was fixed at 45
degrees. `npm run typecheck` passed after this change. The earlier three-engine
browser and screenshot results above were recorded at 40 degrees; they were
not repeated for the five-degree adjustment, at the user's request to keep
testing light. The 45-degree match is the user's visual judgement, not an
independent measurement of the console camera.

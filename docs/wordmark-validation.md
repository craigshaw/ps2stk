# PS2-style wordmark integration

Date: 2026-10-04.

## Scope

The user selected [this wordmark reference](logo-concepts/ps2-reference-proposals/wordmark-selected.png)
and requested preparation, application integration and a dedicated remote branch.
The final design has no memory card or separate header symbol. It replaces Relay
without changing the Orbital browser's layout or card operations.

- [Production wordmark](../public/wordmark.svg) uses thin open geometric paths,
  square joins and the selected blue-to-cyan ink. It has no background rectangle,
  embedded caption or external font dependency. SVG keeps this geometric design
  sharp without the damaged edges seen in the earlier generated cutout.
- The header loads it as an image with the accessible name PS2STK. PS2 Save
  Toolkit is separate live Sora text at 12px at every supported width.
- The wordmark is 216px wide on desktop, 180px at widths up to 760px, and 160px
  at widths up to 520px. The centered descriptor remains beneath it with a 5px gap.
- [The favicon](../public/favicon.svg) uses the wordmark's open numeral 2, with
  a thicker stroke for small rendering on the existing midnight tile.
- Only the selected raster reference is retained with this change. Earlier
  generated concept artwork is not shipped in public assets.

## Validation

Node.js 24.21.0 was used. No engine, session, format or icon-renderer code changed.

| Check | Evidence |
| --- | --- |
| Dependency installation | `npm ci` passed. |
| TypeScript, unit tests and build | `npm run check` passed: both TypeScript targets, 141 unit/CLI tests and the production build. |
| Production asset delivery | Built `dist/wordmark.svg` and `dist/favicon.svg` match the public source files byte for byte. Generated build output is not committed. |
| Existing browser regressions | The full browser run passed all 73 existing runnable cases in Playwright Chromium, Firefox and WebKit. Two folder-output cases are deliberately skipped outside Chromium. |
| Brand regression | After correcting the new test's scope, `npm run test:browser -- --grep 'brand artwork'` passed in all three engines. It checks image loading, the accessible image name, visible live descriptor, minimum 12px type and brand boundaries at 1440, 1024, 768, 760, 390 and 360px, with empty and loaded card states. |
| Visual inspection | Chromium captures show the empty and loaded application at 1440px and 390px, plus a loaded narrow desktop at 768px. The descriptor reads clearly and header controls do not overlap the wordmark. |
| Small favicon | A browser-rendered comparison shows the favicon at 16, 32 and 64px. Its open numeral remains identifiable. |
| Independent design review | The Impeccable finish reviewer inspected all six saved captures, the selected reference, component, CSS and SVG source. Disposition: ship, with no material visual findings. |
| Documentation | Product and planning records reflect the selected identity. The design system and local Impeccable sidecar record its durable visual rules. |

The existing browser regressions include keyboard navigation, reduced motion,
card edits, package operations, Undo/Redo and download byte checks. Browser card
data is synthetic. Local review captures are under
`.impeccable/review/wordmark/`, which is ignored by Git.

The initial new brand test also asserted page-wide overflow at every width. At
1024px it exposed existing landing-page orbit artwork extending the document to
1043px. A Chromium check with the previous committed stylesheet returned the
same 1043px width. That assertion was removed from the brand test, which now
checks the wordmark and descriptor boundaries directly. The unrelated orbit
overflow was not changed or treated as a passing global-layout check.

The detector reported existing advisory stylesheet colours and font sizes outside
the older design record. It found no deterministic issue in Brand.tsx. Unrelated
design drift was not repaired as part of this identity change.

## Limits

This record covers local source, build output and Playwright engines. It does not
confirm a hosted deployment, the installed browser's cached tab icon, native OS
permission flows or destination game loads. Existing release validation remains
open.

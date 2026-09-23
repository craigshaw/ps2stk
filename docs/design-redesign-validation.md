# Orbital browser redesign validation

Date: 2026-09-23.

## Scope

The user requested a contemporary single-page application inspired by the
PlayStation 2, with a distinct identity. They retained the PS2STK name, selected
the system browser as the main reference, and chose the Orbital browser
direction with a code-first workflow.

The implementation adds an original paired-orbit symbol, geometric wordmark,
matching favicon, locally served Sora heading font, new empty card bays, and a
midnight-blue visual system. Open cards use save-icon galleries, explicit active
card state, selection orbits, and a separate inspector. Dialogs use the same
typography, controls, focus treatment, and spacing. The export and import format
labels have dedicated form spacing. A single save now uses the singular label.
The brand caption, accessible name, and page title use the full name, PS2 Save
Toolkit. The caption remains visible on narrow screens. Scrollbars use the blue
and midnight palette.

Card engine, session, package codecs, browser file I/O, and the icon renderer
were not changed. The existing one/two-card workflow and all edit operations
remain in scope. The new empty bay controls use the existing explicit slot
opening path.

## Checks performed

| Check | Result |
| --- | --- |
| Node.js and dependencies | Node 24.21.0; `npm ci` passed. |
| `npm run check` | Application and engine TypeScript passed, 129 unit/CLI tests passed, production build passed. Repeated after the final dialog changes. |
| Full `npm run test:browser` | 46 passed across Chromium, Firefox, and WebKit; two expected folder-access skips. |
| Final dialog regression | 12 targeted tests passed across the three engines, covering PSU review, legacy imports, unified export, and signed PSV output. |
| Final brand and scrollbar regression | Production build passed; 12 targeted browser tests passed across the three engines, covering keyboard selection, narrow layouts, fuller-card scrolling, unified export, and signed PSV review. |
| Desktop and narrow visual review | Empty and loaded views inspected at 1440 and 390 pixels; loaded views also at 850 pixels and the 768-pixel user viewport. Export dialogs inspected at desktop and narrow widths. |
| Direct empty-slot opening | Opened card B from its empty bay, then opened another card into A using the header action. Both card identities and the inspector were checked. |
| Existing interaction coverage | Browser suite covers keyboard navigation, focus, reduced motion, animation, copy/import conflicts, replacement, byte-checked downloads, Undo/Redo, and fuller-card pane scrolling. |
| Sample text contrast | Five key foreground/background pairs measured from CSS values: 7.32:1 to 17.27:1. This is a token check, not a complete accessibility audit. |
| Diff hygiene | `git diff --check` passed. |

The full browser run preceded the final form-spacing and singular-label edits.
The final check and targeted browser runs cover those subsequent changes.
Existing Lucide client-directive and Three.js chunk-size build advisories remain.

The independent Impeccable finish reviewer requested two changes: keep the brand
caption visible at narrow widths and theme browser scrollbars. The verdict pass
scored both fixes resolved with disposition `ship`. That verdict covers the two
listed fixes, not a new full-surface audit. No comparison comp was used because
the user selected the code-first workflow.

Visual review used existing local reference cards. The cards, original save
assets, and review screenshots are not added to public application assets or
Git. Sora is served locally; its source and licence are recorded in
[third-party notices](../THIRD_PARTY_NOTICES.md).

## Remaining limits

This work does not complete milestone 4 or establish destination compatibility.
PCSX2, PS2/MemCard PRO2, and PS3 game-load tests remain open. Installed-browser
native folder permission flows and hosted HTTPS checks remain open. The redesign
has not been deployed as part of this task.

The current visual system is recorded in [DESIGN.md](../DESIGN.md). Formal
accessibility conformance and console-exact icon rendering are not claimed.

## Relay brand follow-up, 2026-09-23

The user selected Relay from four original vector concepts. The header symbol
and favicon now use its two-card geometry and diagonal transfer path. The
geometric PS2STK wordmark and visible PS2 Save Toolkit caption remain.

| Check | Result |
| --- | --- |
| Node.js and dependencies | Node 24.21.0; `npm ci` passed on the feature branch. |
| `npm run check` | TypeScript checks, 135 unit/CLI tests, and production build passed. The test count includes the separately committed empty-card work. |
| Header render | Chromium captures at 1440 × 900 and 390 × 844 were inspected. Relay renders at the existing 45 px desktop and 29 px narrow mark widths. The caption remains visible, and neither viewport has horizontal overflow. |
| Favicon | The local server returned the new SVG with status 200; its Relay paths and colours match the selected vector. A 16 px browser-tab rendering was not captured. |
| Independent visual review | A fresh Impeccable finish review of the two captures and source files returned `ship`, with no material fixes for this logo change. |
| Diff hygiene | `git diff --check` passed. |

This follow-up validates the logo integration on the feature branch. It does
not repeat the full browser regression suite or change the remaining release
and destination tests above.

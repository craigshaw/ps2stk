---
name: "PS2STK"
description: "Orbital browser for PS2 memory card images and saves."
colors:
  ground: "#060914"
  surface: "#0d1425"
  raised: "#141f35"
  selection: "#172c51"
  text: "#e9efff"
  muted: "#9daecb"
  border: "#273550"
  accent: "#8eafff"
  action: "#a5c0ff"
  action-ink: "#08152f"
  warning: "#efc78f"
  danger: "#ffb0bd"
  focus: "#bad2ff"
  scroll-track: "#0b1120"
  scroll-thumb: "#526b96"
  brand-blue: "#093df8"
  brand-cyan: "#02d7f9"
  field: "#090f1d"
  dialog: "#101b30"
  destructive: "#a83955"
typography:
  display: {"fontFamily": "Sora, sans-serif", "fontSize": "42px", "fontWeight": 400, "lineHeight": 1.2, "letterSpacing": "-0.035em"}
  headline: {"fontFamily": "Sora, sans-serif", "fontSize": "22px", "fontWeight": 450, "lineHeight": 1.5, "letterSpacing": "-0.03em"}
  title: {"fontFamily": "Sora, sans-serif", "fontSize": "17px", "fontWeight": 450, "lineHeight": 1.45}
  dialog: {"fontFamily": "Sora, sans-serif", "fontSize": "19px", "fontWeight": 450, "lineHeight": 1.5}
  body: {"fontFamily": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", "fontSize": "14px", "fontWeight": 400, "lineHeight": 1.5}
  label: {"fontFamily": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", "fontSize": "12px", "fontWeight": 550, "lineHeight": 1.45}
  identity: {"fontFamily": "ui-monospace, SFMono-Regular, monospace", "fontSize": "11px", "lineHeight": 1.6}
  brand-caption: {"fontFamily": "Sora, sans-serif", "fontSize": "12px", "lineHeight": 1.4, "letterSpacing": "0.01em"}
  guide-body: {"fontFamily": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", "fontSize": "16px", "fontWeight": 400, "lineHeight": 1.75}
  guide-title: {"fontFamily": "Sora, sans-serif", "fontSize": "23px", "fontWeight": 450, "lineHeight": 1.35, "letterSpacing": "-0.03em"}
rounded:
  control: "6px"
  surface: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "18px"
  lg: "24px"
  xl: "32px"
components:
  button-primary: {"backgroundColor": "{colors.action}", "textColor": "{colors.action-ink}", "rounded": "{rounded.control}", "padding": "8px 12px"}
  button-primary-hover: {"backgroundColor": "#c1d4ff"}
  button-secondary: {"backgroundColor": "{colors.surface}", "textColor": "{colors.text}", "rounded": "{rounded.control}", "padding": "8px 12px"}
  button-danger: {"backgroundColor": "{colors.destructive}", "textColor": "#ffffff", "rounded": "{rounded.control}", "padding": "8px 12px"}
  field: {"backgroundColor": "{colors.field}", "textColor": "{colors.text}", "rounded": "{rounded.control}", "padding": "9px 11px"}
  view-switch: {"backgroundColor": "#0c1426", "rounded": "{rounded.control}", "padding": "3px"}
  card-tag: {"textColor": "#bfd3ff"}
  card-bay: {"backgroundColor": "#111d34", "rounded": "{rounded.surface}", "padding": "22px"}
  save-tile: {"backgroundColor": "transparent", "rounded": "{rounded.surface}"}
  import-files: {"textColor": "{colors.text}", "padding": "8px 0 0"}
---

# Design System: PS2STK

## Overview

**Creative North Star: "Orbital browser"**

The Orbital browser uses the PS2 system browser as a visual reference: midnight
space, luminous blue selection, calm motion, and original save icons.
Open galleries give save icons room. Thin borders and tonal layers organise the
workspace. Controls support the card task without competing with save artwork.

**Key Characteristics:**

- Midnight ground with cool, readable text.
- Blue selection light and elliptical icon floors.
- Open galleries, precise controls, and short state transitions.

## Colors

Cool blue surfaces, pale text, and blue actions carry the existing system.
The frontmatter records the source values used in the application and guides.

| Role | Value |
| --- | --- |
| Ground / surface | `#060914` / `#0d1425` |
| Selection / border | `#172c51` / `#273550` |
| Text / muted | `#e9efff` / `#9daecb` |
| Accent / action / action ink | `#8eafff` / `#a5c0ff` / `#08152f` |
| Focus | `#bad2ff` |
| Warning / danger | `#efc78f` / `#ffb0bd` |
| Scroll track / thumb | `#0b1120` / `#526b96` |
| Brand blue / cyan | `#093df8` / `#02d7f9` |

**The Selection Light Rule.** Use a blue edge and elliptical floor to identify
the focused or selected save. Keep its original icon visible.

## Typography

Sora is served locally for headings and the caption. Controls and descriptions
use system UI text; directory identities and filenames use monospace.
The wordmark is SVG geometry, not a font. Body text is 14px with 1.5 line height;
labels are 12px. Headings: 42px display, 22px workspace, 17px inspector, 19px
dialogs. The landing heading reduces to 36px/30px as space narrows. Supporting
metadata uses 10px to 12px and tabular numerals where useful.

The import save title uses 15px Sora at weight 550. Its summary uses 13px system
text; capacity and file rows use 12px, with tabular numerals for sizes.
Guide body text is 16px with 1.75 line height; introductions use 18px, then 17px
below 520px. Guide headings use 42px/36px/30px across the existing breakpoints;
section headings use 23px. The frontmatter records default role sizes; responsive
overrides remain in the source stylesheets.

**The Visible Name Rule.** Keep PS2 Save Toolkit as readable live text beneath
the open-line wordmark at every supported width.

## Layout

Use 32px desktop horizontal insets. One or two equal card panes share the main
column; a collapsible inspector starts at 296px. Gallery columns start at 145px.
Above 760px, panes have a 480px minimum height and scroll internally; the header
and footer stay in normal flow. At 1600px, the inspector grows to 330px and gallery
columns to 170px. At 1150px, spacing contracts; at 950px, the inspector is 230px
and each two-card grid has one column. At 760px, the inspector moves below the
cards; at 520px, cards stack. The page has a 360px minimum width.

The empty view has one heading, short supporting copy, two actions, and offset
card bays. It becomes one column below 761px. Keep card actions separate from
save content. Titles lead; directory names and byte/file counts support them.
Use a comfortable grid with a list alternative and one shared inspector.

### Public guides

The guides keep the existing palette, wordmark, Sora headings, and thin dividers.
Use three linked rows for the index and a reading column (72ch maximum) for each
guide. A sticky contents rail (200px) moves above the article at 760px and below.

Reused spacing steps are 8, 12, 18, 24, and 32px. Component-specific spacing stays
as implemented, including dialog padding and the gap between preview and capacity.

## Elevation & Depth

Use tonal layers, thin borders, and elliptical icon floors for depth. Avoid
repeated boxed panels and decorative perpetual motion.
Transitions settle in 180ms. Reduced motion removes CSS animation/transitions
and stops icon playback. Preserve pause controls and manual Free View.

The application uses no box shadows. Tonal surfaces, borders, radial backgrounds,
and elliptical floors provide depth. The dialog backdrop uses dark shading and
6px blur. That existing modal treatment is separate from surface elevation.

**The Calm Depth Rule.** Use tonal layers, thin borders, and orbit lines for depth.
Reserve movement for interaction feedback and original save animation.

## Shapes

Controls use 6px corners; large surfaces use 12px. Save preview floors are
ellipses. Keep the wordmark and numeral 2 as SVG geometry, preserving their aspect
ratios. Use Lucide for interface icons and original save assets for previews,
with fallbacks.

## Components

### Brand

The Orbital browser uses the PS2 system browser as a visual reference: midnight
space, luminous blue selection, calm motion, and original save icons.
Use [wordmark.svg](public/wordmark.svg) with PS2STK alternative text and live
PS2 Save Toolkit text centred beneath it. Use the open numeral 2 in
[favicon.svg](public/favicon.svg). No separate header symbol or memory card logo.

Wordmark widths: 216px desktop, 180px at 760px and below, 160px at 520px and
below. Preserve its aspect ratio. The caption is 12px Sora with a 5px gap and
stays on one line. The landing heading is "The Swiss Army knife for PS2 saves".

### Buttons and fields

Primary controls use Action with Action ink; secondary controls use Surface and
Border. Destructive confirmations use rose `#a83955` with white text. Ordinary
Delete actions use Danger. Disabled controls use 0.4 opacity. Keyboard focus is
a 2px Focus outline with a 3px offset. Fields use `#090f1d`; search is an open
underline. Theme all page, pane, file-list, and dialog scrollbars.

Grid/list controls form a compact segmented group. Selected controls have a
blue tonal fill. Tags are small supporting labels without an added container.

### Save gallery and previews

Active cards use blue top borders and selected slot controls. Save selection
adds a bright boundary, checkbox, tinted fill, and elliptical floor. Keep original
artwork visible. Card-pane icons remain still; inspector and viewer playback can
animate at 60 animation frames per second multiplied by the model's stored speed.
Stored icon backgrounds blend over detail stages. Rendering is a visual
approximation, not a claim of console-exact presentation.
Cap stored lighting colour channels above 1 for previews, including games that
use values up to 255. Preserve negative channels and stored save bytes.

### Dialogs and accessibility

Use bounded dark dialogs (`#101b30`) with Sora titles, focus handling, and aligned
actions. Most dialogs scroll when needed; Icon Viewer fits its preview around
mode controls, model choices, and instructions. Free View stops automatic rotation
and allows bounded rotation/zoom while the model animation can play or pause.
Keep Play/Pause below the model in both modes; its label names the next action.
Place Reset view beside the mode switch in Free View. It resets only the angle
and zoom. Keep playback state when switching modes or models, and keep animation
paused under reduced motion. Identical model files share one choice.
Import/export limits and metadata acknowledgement use plain readable text.
Import review leads with the save icon and title, then format, file count, and
payload size. Show the destination in one muted line below the dialog title.
Use Required space and Available space for capacity. A native, initially collapsed
Files disclosure lists exact relative file names and right-aligned sizes in a
bounded scrolling area. Omit internal directory IDs, preservation statements,
routine metadata defaults, and archive source paths. Keep conflicts, replacement
consequences, space errors, integrity warnings, and excluded archive-file counts
visible. Archive import uses the same review.
For several packages, use a labelled select and a Review save action before
the existing import review. Long paths must fit narrow dialogs. Keep selection
available after a failed review and return focus to Import save on dismissal.

Keep PS2 Save Toolkit visible at narrow widths, all operations available through
controls and keyboard, and original icons replaceable by fallbacks. Errors and
status must remain readable. Do not use personal save assets as public demos.
Do not add a dedicated phone workflow or claim accessibility conformance.

The current implementation is in [style.css](src/style.css),
[App.tsx](src/ui/App.tsx), and [Brand.tsx](src/ui/Brand.tsx).

## Do's and Don'ts

### Do

- Do use original save assets with a clear fallback when an icon cannot render.
- Do retain visible keyboard focus, pause controls, and reduced-motion behaviour.
- Do use Lucide for interface actions, the open-line PS2STK wordmark in the header,
  and the compact numeral 2 for the favicon.
- Do use the blue scrollbar theme for page, gallery, inspector, file, and dialog
  overflow.
- Do keep import warnings visible and routine file details behind Files.

### Don't

- Don't hide the PS2 Save Toolkit caption at narrow widths.
- Don't add a memory card or separate symbol to the header wordmark.
- Don't add decorative perpetual motion or a page-load sequence.
- Don't use personal save assets as public demonstration content.
- Don't treat technical directory names as the primary save title when a game
  title is available.

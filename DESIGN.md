# PS2STK design

## Identity

The Orbital browser uses the PS2 system browser as a visual reference: midnight
space, luminous blue selection, calm motion, and original save icons.
Use [wordmark.svg](public/wordmark.svg) with PS2STK alternative text and live
PS2 Save Toolkit text centred beneath it. Use the open numeral 2 in
[favicon.svg](public/favicon.svg). No separate header symbol or memory card logo.

Wordmark widths: 216px desktop, 180px at 760px and below, 160px at 520px and
below. Preserve its aspect ratio. The caption is 12px Sora with a 5px gap and
stays on one line. The landing heading is "The Swiss Army knife for PS2 saves".

## Colour and type

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

Sora is served locally for headings and the caption. Controls and descriptions
use system UI text; directory identities and filenames use monospace.
The wordmark is SVG geometry, not a font. Body text is 14px with 1.5 line height;
labels are 12px. Headings: 42px display, 22px workspace, 17px inspector, 19px
dialogs. The landing heading reduces to 36px/30px as space narrows. Supporting
metadata uses 10px to 12px and tabular numerals where useful.

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

## Public guides

The Read layout keeps the existing palette, wordmark, Sora headings, and thin dividers.
Use three linked rows for the index and a reading column (72ch maximum) for each guide.
A sticky contents rail (200px) moves above the article at 760px and below.
Guide body text is 16px with 1.75 line height; introductions use 18px, then 17px below 520px.
Guide headings use 42px/36px/30px across the existing breakpoints; section headings use 23px.

## Controls and states

Use tonal layers, thin borders, and elliptical icon floors for depth. Avoid
repeated boxed panels and decorative perpetual motion. Controls use 6px corners;
large surfaces use 12px. Reused spacing steps are 8, 12, 18, 24, and 32px.
Transitions settle in 180ms. Reduced motion removes CSS animation/transitions
and stops icon playback. Preserve pause controls and manual Free View.

Primary controls use Action with Action ink; secondary controls use Surface and
Border. Destructive confirmations use rose `#a83955` with white text. Ordinary
Delete actions use Danger. Disabled controls use 0.4 opacity. Keyboard focus is
a 2px Focus outline with a 3px offset. Fields use `#090f1d`; search is an open
underline. Theme all page, pane, file-list, and dialog scrollbars.

Active cards use blue top borders and selected slot controls. Save selection
adds a bright boundary, checkbox, tinted fill, and elliptical floor. Keep original
artwork visible. Card-pane icons remain still; inspector and viewer playback can
animate at 60 animation frames per second multiplied by the model's stored speed.
Stored icon backgrounds blend over detail stages. Rendering is a visual
approximation, not a claim of console-exact presentation.
Cap stored lighting colour channels above 1 for previews, including games that
use values up to 255. Preserve negative channels and stored save bytes.

## Dialogs and accessibility

Use bounded dark dialogs (`#101b30`) with Sora titles, focus handling, and aligned
actions. Most dialogs scroll when needed; Icon Viewer fits its preview around
mode controls, model choices, and instructions. Free View freezes the pose for
bounded rotation/zoom and reset. Identical model files share one choice.
Import/export limits and metadata acknowledgement use plain readable text.
Archive import uses the same review. Show the archive type and contained path.
For several packages, use a labelled select and a Review save action before
the existing import review. Long paths must fit narrow dialogs. Keep selection
available after a failed review and return focus to Import save on dismissal.

Keep PS2 Save Toolkit visible at narrow widths, all operations available through
controls and keyboard, and original icons replaceable by fallbacks. Errors and
status must remain readable. Do not use personal save assets as public demos.
Do not add a dedicated phone workflow or claim accessibility conformance.

The current implementation is in [style.css](src/style.css),
[App.tsx](src/ui/App.tsx), and [Brand.tsx](src/ui/Brand.tsx).

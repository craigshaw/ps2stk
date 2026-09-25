---
name: PS2STK
description: PS2 Save Toolkit, an orbital browser for local memory card saves.
colors:
  ground: "#060914"
  surface: "#0d1425"
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
typography:
  display:
    fontFamily: "Sora, sans-serif"
    fontSize: "42px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-.035em"
  headline:
    fontFamily: "Sora, sans-serif"
    fontSize: "22px"
    fontWeight: 450
    lineHeight: 1.5
    letterSpacing: "-.03em"
  title:
    fontFamily: "Sora, sans-serif"
    fontSize: "17px"
    fontWeight: 450
    lineHeight: 1.45
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "12px"
    lineHeight: 1.45
    fontWeight: 550
  identity:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
    fontSize: "10px"
    lineHeight: 1.5
rounded:
  control: "6px"
  surface: "12px"
  orbit: "50%"
spacing:
  compact: "8px"
  control: "12px"
  inset: "18px"
  section: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-danger:
    backgroundColor: "#a83955"
    textColor: "#fff"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    padding: "4px 0"
  field:
    backgroundColor: "#090f1d"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 11px"
  view-switch:
    backgroundColor: "#0c1426"
    rounded: "{rounded.control}"
    padding: "3px"
  card-tag:
    textColor: "#bfd3ff"
  card-bay:
    backgroundColor: "#111d34"
    rounded: "{rounded.surface}"
    padding: "22px"
  save-tile:
    backgroundColor: "transparent"
    rounded: "{rounded.surface}"
  dialog:
    backgroundColor: "#101b30"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "26px"
---
# Design System: PS2STK

## Overview

**Creative North Star: "Orbital browser"**

Orbital browser draws on the PS2 system browser: deep space, luminous blue selection, calm motion, and original save icons. The Relay symbol links two memory card forms with a transfer path beside the geometric PS2STK wordmark. PS2 Save Toolkit remains visible beneath the wordmark at narrow widths.

Open galleries give save icons room. Thin lines, pale controls, and a darker inspector organise the working surface. Shape and colour clarify selection without competing with the original save artwork.

**Key Characteristics:**

- Midnight ground with cool, readable text.
- Blue selection light and elliptical icon floors.
- Open galleries, precise controls, and short state transitions.

Extracted from [the stylesheet](src/style.css), [the explorer](src/ui/App.tsx),
[the identity](src/ui/Brand.tsx), import/export reviews, and the original SVG
favicon. The selected world is recorded in [PRODUCT.md](PRODUCT.md).
Existing desktop and narrow screenshots support the visual record; this document
is not a new UI audit. No shipping raster assets were generated.

## Colors

The palette places luminous blue on a nearly black, cool ground. The frontmatter
owns the exact colour values.

### Primary

- **Accent:** links, active-card edges, and interface details.
- **Action / Action ink:** pale blue primary controls with dark text.
- **Selection / Focus:** filled selection states and a distinct keyboard outline.

### Neutral

- **Ground / Surface:** page and default control surfaces.
- **Text / Muted:** main content and supporting metadata.
- **Border:** quiet structural separation.
- **Scroll track / Scroll thumb:** thin blue overflow controls; WebKit uses a
  rounded thumb with a track-coloured inset border.
- **Warning / Danger:** changed-card status and destructive-action text.

**The Selection Light Rule.** Use a blue edge and elliptical floor to identify the focused or selected save. Keep its original icon visible.

## Typography

Sora provides the display, workspace, inspector, and dialog headings. Readable
system UI text supports controls and descriptions. Monospace identifies save
directories and filenames. The wordmark is original SVG geometry, not a font.

- **Display:** the empty-state heading; reduces to 36px or 30px as space narrows.
- **Headline:** the workspace heading; reduces to 19px on narrow desktop.
- **Title:** the inspector save title; dialog titles use 19px.
- **Body:** instructions and default control text. The welcome description uses
  a 1.85 line height and a 48ch maximum width.
- **Label:** save titles. Supporting metadata generally uses 10px to 12px;
  numeric capacity and file details use tabular numerals.
- **Identity:** directory labels; inspector directory text uses 11px and can wrap.

**The Visible Name Rule.** Keep PS2 Save Toolkit beneath the geometric wordmark at every supported width.

## Layout

The desktop frame uses 32px horizontal insets. One or two equal card panes share
the main column; the inspector starts at 296px. The gallery fills available width
with columns of at least 145px. Card action bars stay separate from save content.
Above 760px, galleries and the inspector scroll internally and card panes have
a 480px minimum height. The header and footer remain in normal page flow.

At 1600px and above, the inspector grows to 330px and gallery columns to 170px.
At 1150px, page spacing and gallery density contract. At 950px, the inspector
uses 230px and two-card grids use one icon column per pane. At 760px and below,
the inspector moves below the panes and toolbar controls wrap. At 520px and
below, card panes stack. The page has a 360px minimum width. These adaptations
preserve the desktop tool; they do not define separate phone workflows.

The empty view pairs explanatory text with two offset card bays. It becomes
one column below 761px. Reused gaps are compact and consistent; larger space
around icons and empty bays gives the orbital motif room.

## Elevation & Depth

Depth comes from a soft radial blue page light, translucent pane fills, and
fine dividing lines. There is no box-shadow vocabulary. Save previews sit over
an elliptical floor; the selected floor brightens and expands. Dialogs use a
near-black translucent backdrop with a 6px blur.

**The Calm Depth Rule.** Use tonal layers, thin borders, and orbit lines for depth. Reserve movement for interaction feedback and original save animation.

Controls, selected floors, and the inspector settle in 180ms using the shared
easing curve. Reduced motion removes CSS animations and transitions. Original
save animation retains its own pause and reduced-motion controls.

## Shapes

Controls have small rounded corners. Save tiles, large previews, card bays,
and dialogs use the larger surface radius. Ellipses belong to icon floors and
bay decoration; the brand uses two upright card outlines and a diagonal transfer path.
Card panes remain open, with a top edge and tonal fill rather than a repeated
rounded outer shell. Most boundaries use a single thin line.

## Components

### Buttons

Primary buttons use Action and Action ink, with semibold labels. Secondary
buttons use Surface and a thin Border. Transparent toolbar and text actions
reduce visual weight. Destructive confirmation uses a rose fill; ordinary Delete
actions use Danger text. Hover changes the fill and edge, active state deepens
the fill, and disabled buttons use 0.4 opacity. Keyboard focus is a 2px Focus
outline with a 3px offset.

### Inputs and view controls

Fields use a dark inset fill, small corners, and the same focus outline.
Search is an open underline with a Lucide search icon. The grid/list switch
uses two compact icon buttons on one dark strip; its active button has a blue
fill. Inspector visibility is a separate labelled toggle. This single-screen
app has no route navigation system.

### Tags and card panes

The inspector's Card A or Card B tag is plain blue text, without a pill shell.
Card slot buttons combine a small Card label with a larger letter. The active
card has a blue top border and selected slot control. Capacity remains a thin
meter with text above it; changed status uses Warning.

### Save gallery and inspector

At rest, save tiles have a transparent boundary. Hover reveals a subtle fill
and edge. Selection adds a stronger blue boundary, tinted fill, checkbox, and
elliptical floor. Titles lead, directory names support, and byte/file counts
follow. List mode uses the same information beside a smaller preview.
The inspector enlarges the original icon and puts save actions before file rows.
View icons opens a wider, bounded dialog with one large preview and compact model choices beneath it. The viewer and inspector blend the save's `icon.sys` background over their dark stages and share the pause state.

### Dialogs and feedback

Dialogs use a bounded, scrollable dark surface, a Sora title, and actions aligned
to the end. Import and export reviews use normal paragraphs, select fields,
and explicit acknowledgement controls. Do not turn metadata-loss or format
limits into decorative labels. Errors use a rose-toned fixed banner with a
close action; status and session information sit in the footer.

## Do's and Don'ts

### Do:

- Do use original save assets with a clear fallback when an icon cannot render.
- Do retain visible keyboard focus, pause controls, and reduced-motion behaviour.
- Do use Lucide SVG icons for interface actions and Relay for the brand.
- Do use the blue scrollbar theme for page, gallery, inspector, file, and dialog overflow.

### Don't:

- Don't hide the PS2 Save Toolkit caption at narrow widths.
- Don't add decorative perpetual motion or a page-load sequence.
- Don't use personal save assets as public demonstration content.
- Don't treat technical directory names as the primary save title.

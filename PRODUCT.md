# PS2STK Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

PS2STK serves a broad range of PS2 players, including people unfamiliar with
memory card images and save-package formats. This audience was confirmed on
2026-09-23. Users work on a desktop to inspect and manage saves, including card
images intended for PCSX2 and MemCard PRO2.

Do not assume format expertise. Explain the difference between a complete card,
a save, and an individual save file at the point where that difference affects
an action. Use the terms in [CONTEXT.md](CONTEXT.md).

## Product Purpose

Provide a local browser utility for managing PS2 memory card images. A successful
session lets a user open cards, identify saves through their names and original
icons, make deliberate changes, and download the intended result while keeping
the original input files intact.

The product is a short-session tool. Users open cards, perform actions, download
results, and leave. It is not a persistent workspace.

## Operating Context

- A desktop browser runs a static React, TypeScript, and Vite application.
  Three.js renders original save icons; Lucide supplies interface icons.
- All card processing runs locally. Card contents, edits, and Undo/Redo history
  stay in memory for the current page session. Refresh or close discards them.
- Users open one or two complete card images. They browse saves, inspect files,
  copy saves between cards, import packages, delete saves, or replace files with
  versions edited elsewhere.
- Save card downloads the complete edited image. Save as can select another
  supported extension, which determines the output layout. Export save produces
  a save package or separate raw files. Package exports and raw dumps do not
  save the whole card.
- Chrome and Edge support raw save-folder output when directory access is
  available. Firefox and Safari retain editing, package output, and individual
  file and whole-card downloads. Minimum browser versions remain undecided.
- PCSX2 and a PS2 through MemCard PRO2 are required card compatibility targets.
  PS2 PSV output adds a PS3 transfer target. Destination validation remains open.
- Cloudflare Pages serves static assets through Git integration. The user
  confirmed hosting on 2026-09-22. See [deployment notes](docs/deployment.md) for
  the evidence and remaining hosted checks.

## Capabilities and Constraints

- Support up to two standard 8 MiB PS2 card images, with or without ECC spare
  bytes. Preserve the input filename by default. Whole-card `.ps2` downloads
  include calculated ECC; `.mc2` and `.bin` downloads omit it. Save as selects
  the extension without exposing the binary layout.
- Let users edit the displayed card filename inline while retaining its extension.
  A changed filename needs another whole-card download, without changing card
  contents or adding an Undo step.
- Create a formatted empty card in an available slot for save imports or copying.
  New cards need a download even before their first edit.
- Treat each save directory and its contents as one save, including when several
  saves belong to the same game. Keep save files distinct from complete saves.
- Support complete-save copy and deletion, individual file replacement, exact
  raw file downloads, raw save-folder output, and complete-card downloads.
- Import PSU, MAX, SPS, XPS, CBS, and signed PS2 PSV packages by detected contents.
  Export PSU, MAX, and signed PS2 PSV. PSU is the default; MAX and PSV require
  acknowledgement of metadata loss. Packages support flat saves. Nested saves
  retain raw-folder and whole-card output options.
- Resolve conflicts and capacity before committing changes. Default conflicts
  to Skip; Replace entire save is explicit and does not merge contents. A failed
  in-memory operation leaves both cards unchanged and adds no Undo step.
- Preserve exact file payloads and unrelated content. Each successful content
  action is one Undo step, with per-card history and a shared 64 MiB history-byte
  limit. New edits affect only that card's Redo branch.
- Folder output requires a new save folder. It must not merge with existing
  output. External writes can fail after partial completion and are separate
  from in-memory Undo. Report partial output accurately.
- Show which card has edits that need downloading and warn before discarding
  them. Download initiation does not prove that a file was saved to disk.
- Reject unsupported or structurally invalid cards with clear errors. An
  unsupported or broken icon uses a fallback and does not block valid card work.
- Exclude accounts, a backend, persistent workspaces, damaged-card recovery,
  direct device synchronisation, game-specific editing, ZIP packages, larger
  cards, more than two open cards, and dedicated phone workflows from version 1.
  PS1 saves, native PS3 saves, and encrypted PS2 Classics cards are also outside
  the agreed package scope.

Detailed product decisions remain in [planning](docs/planning.md), format policy
in the [save-format plan](docs/save-format-plan.md), and milestone acceptance
criteria in the [implementation plan](docs/implementation-plan.md). This record
summarises those decisions for design work; it does not replace them or authorise
later milestones.

## Brand Commitments

- PS2STK is short for PS2 Save Toolkit. Use the full name as the brand descriptor,
  including beneath the wordmark and in the browser title. The user confirmed
  this meaning on 2026-09-23. Use Simplified Technical English and no em dashes.
  Explain actions and limits with direct, familiar language.
- On 2026-09-23, the user selected a new Orbital browser identity inspired by
  the PS2 system browser: deep space, luminous blue selection, calm motion,
  and original save icons. Keep PS2STK with its geometric wordmark. The user
  then selected the Relay symbol, two memory cards linked by a transfer path,
  for the header and favicon. This replaces the earlier generic dark explorer
  treatment. The built design system is recorded in [DESIGN.md](DESIGN.md).
- Preserve the approved one- or two-card explorer, comfortable icon grid with a
  list alternative, and shared collapsible inspector on the right.
- Use original save assets for previews, with fallbacks when needed. Do not ship
  personal card images or save assets as public demonstration content.
- Keep source attribution and distributed third-party licence notices.

## Evidence on Hand

The existing explorer, card engine, session API, and save-format implementation
provide working product evidence. Recorded checks include synthetic fixtures,
independent-tool comparisons, exact byte comparisons, browser regressions,
keyboard operation, reduced motion, and narrow-window checks.

- [Card-engine validation](docs/milestone-1-validation.md)
- [Editing and session validation](docs/milestone-2-validation.md)
- [Explorer validation](docs/milestone-3-validation.md)
- [PSU validation](docs/milestone-3a-validation.md)
- [Additional package validation](docs/milestone-3b-validation.md)
- [Signed PSV validation](docs/milestone-3c-validation.md)
- [Fixture provenance](tests/fixtures/README.md)
- [Source attribution](THIRD_PARTY_NOTICES.md)

These are recorded results, not proof of all destination behaviour. PCSX2 and
PS2/MemCard PRO2 game loads, PS3 transfer and game loads, installed-browser
permission flows, and detailed hosted checks remain release work. Do not claim
verified destination compatibility before its results are recorded. Do not
invent testimonials, adoption figures, performance guarantees, or endorsements.

## Product Principles

1. Protect the user's data. Keep input files intact and make in-memory changes
   complete, reversible, and explicit.
2. Make the scope of each action clear. Distinguish the active card, destination,
   complete save, contained file, and downloaded result.
3. Keep short sessions understandable for people with different experience
   levels. Explain format choices and limits where they affect the task.
4. Keep processing local and session-only. Never imply recovery or persistence
   that the product does not provide.
5. Make compatibility claims from evidence. Separate implementation, independent
   format checks, browser tests, and actual destination tests.

## Accessibility & Inclusion

Complete workflows must work through visible controls and keyboard input.
Preserve accessible labels, dialog focus handling, keyboard save selection,
pause controls, and reduced-motion support. Keep controls usable at narrow
desktop widths. An icon rendering failure must not prevent access to valid
save contents. Do not claim a formal accessibility conformance level without
an agreed standard and supporting validation.

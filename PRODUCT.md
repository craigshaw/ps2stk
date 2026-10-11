# PS2STK product

## Purpose and scope

PS2 Save Toolkit is a short-session desktop browser utility for PS2 players,
including people unfamiliar with card images and package formats. Users open
cards, identify saves through original icons, change contents, download results,
and leave. Use the terms in [CONTEXT.md](CONTEXT.md).

React, TypeScript, Vite, Three.js, and Lucide provide a static SPA on Cloudflare
Pages. Processing is local. Cards, edits, and Undo/Redo stay in memory for the
page session. Refresh or close discards them. Original inputs stay intact.
Card editing, the explorer, and the formats below are implemented. Release
validation remains open. Hosting was confirmed by the owner on 2026-09-22.

## Cards and editing

- Open at most two standard 8 MiB cards, with or without ECC spare bytes. Detect
  geometry and layout from contents. Reject invalid structures; no repair mode.
- Create a formatted empty card in the first available slot, named
  `new-card-a.ps2` or `new-card-b.ps2`. Never replace occupied slots implicitly.
  Creation adds no Undo step. New cards need a download even before their first edit.
- Copy/delete complete saves, replace individual files of different sizes when
  they fit, and download exact raw files or complete edited cards.
- Resolve capacity and conflicts before committing. Default to Skip; Replace
  entire save is explicit and removes destination-only files. A batch completes
  in full or leaves both cards unchanged, excluding explicitly skipped saves.
- Preserve byte names, timestamps, mode/protection flags, attributes, and opaque
  metadata. File replacement changes only bytes, length, and allocation, keeping
  the destination name and metadata. Whole-save replacement takes source metadata.
  Copy-protection flags remain intact without enforcing console copy restrictions.
  Deletion frees allocations; it is not secure erasure.
- Each successful content action is one Undo step. Failures/no-ops preserve Redo.
  A new edit clears only that card's Redo branch. Evict the oldest retained boundary
  as needed under the shared 64 MiB history-byte cap. Parsed cards and temporary
  buffers use additional memory.
- Download card keeps the displayed filename. `.ps2` includes ECC; `.mc2` and
  `.bin` omit it. Unknown extensions retain the detected layout. Download as
  selects an extension without changing working bytes or history.
- Inline rename edits the filename stem only. It changes download status, not
  bytes or history. Confirm before discarding undownloaded changes. Download
  acknowledgement records the prepared revision and filename after initiation,
  without proving disk persistence. Dumps and packages do not clear card status.
- Validate replacement input cards before removing the old card. Invalidate an
  import review if its destination is closed, replaced, edited, or restored.

## Save formats

Import one package per action into an open card. Review the destination, icon or
fallback, capacity, metadata notices, and conflict choice first. Export one selected
save. PSU is the default. All package formats support flat saves. Reject nested
structures without flattening or omission; offer raw-folder or whole-card output.

| Format | Import | Export | Integrity and metadata |
| --- | --- | --- | --- |
| PSU | Yes | Yes | No checksum. Retain full directory and dot records; rebuild allocation/parent references. Ignore input padding; zero-fill output padding. |
| MAX | Yes | Yes | Verify whole-package CRC-32 with its CRC field zeroed. Accept compressed-length and documented decoded-length header variants. Names/payloads only; export requires loss acknowledgement. |
| SPS/XPS | Yes | No | Retain names, flags, and timestamps. Verify populated body checksums; accept absent/zero checksums with a notice. Tested entries include 98 and 250 bytes. |
| CBS | Yes | No | Verify zlib/Adler-32 and exactly one deflate stream. Retain names, flags, and timestamps. Support mode offsets 72/76 and body/whole-file sizes; reject conflicting valid modes. |
| PS2 PSV | Yes | Signed | Verify AES-derived HMAC-SHA1, type 2, version 0, header size 44, tables, and payload ranges. Retain names, flags, and timestamps. Export requires loss acknowledgement. PS3 acceptance is unverified. |

Missing attributes and opaque fields become zero. Missing dot records use standard
directory defaults. Missing dates use 2000-01-01 00:00:00; modes use directory
`0x8427` and file `0x8417`. Preserve explicit represented zero values. Reviews
report defaults. PSV exports omit extended attributes, opaque metadata, and dot
records. Its fixed public seed makes output reproducible. Signatures verify
integrity under the published scheme, without proving authorship or game validity.

Bounds: 16 MiB encoded packages, 8 MiB file payloads and save allocation each,
16,384 entries including dot entries, 32-byte names, and 9 MiB MAX/CBS decoded
buffers. Destination capacity includes directory/root growth. Card traversal is
limited to 128 directory levels. LZARI uses a 4,096-byte history, 60-byte maximum
match, and at most 64 match candidates per token.

## Browser and interface

Use one/two card panes, a comfortable icon grid with a list alternative, and one
shared collapsible inspector. Card-pane icons stay still at the fixed 45-degree
overview approximation. Inspector and Icon Viewer support animation, pause, and
reduced motion, with stored `icon.sys` backgrounds. Normal, Copy, Delete, and extra
icon files can be viewed; byte-identical models share one choice. Free View freezes
the pose for bounded rotation/zoom, reset, and keyboard controls. Broken icons use
fallbacks without blocking card work. Console-exact camera/timing are unverified;
action-specific Copy/Delete motion remains deferred.

Chrome and Edge support raw-folder output when directory access is available.
Firefox and Safari retain editing and file/package/card downloads. Folder output
preflights the complete tree, portable paths, and case/normalisation collisions.
Require a new save folder; never merge or overwrite. Preserve names, structure,
and bytes. Report partial writes accurately; external writes are separate from Undo.

Keep visible controls, complete keyboard workflows, focus handling, accessible
labels, pause, reduced motion, and narrow desktop layouts. Do not claim formal
accessibility conformance without validation. The brand is PS2STK with live
PS2 Save Toolkit text, the gradient line wordmark, and numeral 2 favicon.
The landing heading is "The Swiss Army knife for PS2 saves". See
[DESIGN.md](DESIGN.md). Do not invent endorsements or adoption figures.

## Release validation

Existing evidence includes synthetic fixtures, independent mymc+/converter
comparisons, exact byte/metadata/ECC checks, failures, Undo/Redo restoration, and
Playwright Chromium/Firefox/WebKit regressions. [Fixture provenance](tests/fixtures/README.md)
records pins and reproduction. These checks do not prove destination compatibility
or native OS permissions. Release requires no known data-loss defects in supported
operations and evidence for the following remaining checks:

- Load edited cards and package-imported saves in PCSX2 and on PS2 through
  MemCard PRO2. Check copied progress, unrelated saves, and saving/reloading new
  progress. Record game/region, versions, layouts, hashes, and results. Keep originals.
- Test original signed PSV on a suitable PS3: keep its suggested filename, place
  it under USB `PS3/EXPORT/PSV/`, copy through Memory Card Utility to an internal
  PS2 card, assign a slot, load expected progress, then save/reload new progress.
  Record model, firmware, game/region, hashes, and transfer path. External
  re-signing does not prove our signature was accepted. Decide release scope
  with the owner if this stays untested.
- Test installed Chrome, Edge, Firefox, and Safari, native downloads/pickers,
  keyboard controls, reduced motion, narrow desktops, full cards, and complex
  icons. Set minimum versions from results. Broader real-save coverage and
  original transfer-peripheral captures remain unverified.
- Record deployed commit and final Pages settings. Check HTTPS assets, workers,
  exact downloaded bytes, folder permissions, and absence of card-data network
  traffic. Record required GitHub checks and preview settings.

## Exclusions

Version 1 excludes a backend, accounts, persistent workspaces/recovery, damaged-card
recovery, more than two cards, larger cards, ZIP packages, multi-package batches,
arbitrary file/folder import, save renaming, standalone package conversion, online
databases, direct device synchronisation, hex/game-specific editing, region/checksum
conversion, advanced icon editing, and dedicated phone workflows. PS1 saves,
native PS3 saves, and encrypted PS2 Classics cards are outside scope.
Scope changes require an explicit user request.

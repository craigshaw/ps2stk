# PS2STK Implementation Plan

Status: milestones 1 through 3 are implemented and tested. Milestones 3A and 3B package import/export are implemented; signed PSV export is implemented in 3C, with PS3 destination validation pending. Milestone 4 hosting is complete on the user's confirmation of 2026-09-22; release validation remains open. The user deferred PCSX2 and PS2/MemCard PRO2 game-load tests to milestone 4. See the [milestone 1](./milestone-1-validation.md), [milestone 2](./milestone-2-validation.md), and [milestone 3](./milestone-3-validation.md) validation records. The [save-format plan](./save-format-plan.md) records the scope expansion accepted on 2026-09-20.

Product decisions: [planning.md](./planning.md). Domain terms: [CONTEXT.md](../CONTEXT.md).

## Architecture

Use a single React, TypeScript, and Vite application with a separate TypeScript card engine. Cloudflare Pages serves the static application through Git integration. Card bytes and edit history stay in memory for the current page session.

Proposed module boundaries:

| Area | Responsibility |
| --- | --- |
| Card image I/O | Detect the supported binary layout, map pages and spare bytes, and encode complete images. |
| Card file system | Validate directories and allocation, enumerate saves and files, and read exact file contents. |
| Card operations | Plan and apply copy, replace, and delete operations without partial changes. |
| Save formats | Detect and decode established save packages into validated save content; encode supported exports with explicit metadata limits. |
| Session | Own up to two open cards, selections, bounded Undo/Redo history, and downloaded revision status. |
| Icons | Parse icon assets and render previews independently of file system validity. |
| Browser I/O | Open images, download binary files and cards, and dump saves into chosen folders where supported. |
| Explorer UI | Present the agreed panes, inspector, dialogs, and keyboard controls. |

Keep the card engine independent of React, the DOM, and browser file pickers. Use byte-oriented interfaces that can also run in a command-line test harness. Adapt proven parts of the sibling icon browser after validation. Keep third-party source attribution and license notices when reusing code.

## Milestone 1: prove the card engine

Deliverable: a small test harness that opens two supported cards, copies one save, and emits a valid binary destination image. Most production UI work follows this milestone.

### Work

1. Establish the project tooling, TypeScript checks, and a test runner. Pin compatible dependency versions. Keep the browser shell minimal.
2. Retrieve and verify the file system reference and the ps2mcd source. Evaluate an independent reader/writer such as mymc for comparison, checking its provenance and license before reuse.
3. Build a fixture inventory with provenance, source layout, hashes, and expected directories and file bytes. Keep personal card images out of published assets and do not assume they are suitable for a public test repository.
4. Implement bounded parsing of the supported 8 MiB layouts. Validate image size and geometry, references, directory structure, allocation chains, file lengths, and relevant spare-byte fields. Distinguish unsupported layouts from malformed images.
5. Implement page-aware access for images with spare bytes. The existing contiguous cluster slice is not adequate evidence of correct ECC-layout handling.
6. Extract exact file contents and expose names and metadata. Stop on incomplete data rather than silently returning partial file contents.
7. Export an unchanged card in its original layout without changing its bytes.
8. Implement one complete-save copy into a valid destination with enough space. Preserve the source and unrelated destination content. Generate valid ECC values when output includes spare bytes.
9. Check the output with independent tooling. Game-load checks on PCSX2 and a PS2 through MemCard PRO2 are deferred to milestone 4 by user agreement on 2026-09-19.

### Acceptance criteria

- Supported images with and without spare bytes can be read and exported without changes, byte for byte.
- Extracted file lengths and hashes agree with independent expected results.
- Truncated images, invalid references, allocation cycles, and incomplete file chains are rejected with bounded execution and useful errors.
- A copied save contains every source file with identical names and bytes. The source card and unrelated destination saves remain unchanged.
- The exported destination passes structural checks from an independent implementation.
- Independent tooling confirms output integrity. A same-parser round trip alone is insufficient. Successful game loads on both agreed targets remain a release requirement, not a milestone 1 acceptance requirement.

### Current evidence and dependencies

On 2026-09-19, the existing ps2mcs parser/icon test passed against `icon_browser/samples/SLUS-21274-1.ps2.bin`. Its assertions cover one specific OutRun save on an image without ECC spare bytes. The other local sample, `MemoryCard1-1.mc2`, is also an 8 MiB file without spare bytes and contains homebrew/system directories.

Four synthetic reference images now cover both layouts. They were generated with a pinned external mymc+ checkout, not the new engine. Their provenance, image hashes, file hashes, and metadata are recorded in [the fixture inventory](../tests/fixtures/README.md). Exact extraction from both local samples also matches ps2mcd.

The file system document was retrieved from the mymc+ source tree, and ps2mcd was retrieved and reviewed. Independent checks validate copied images, every output file, metadata, and ECC. The user also checked both prepared images in existing tooling. This is sufficient to proceed to milestone 2 under the revised delivery sequence. Follow the manual game-load test in [the validation record](./milestone-1-validation.md) during milestone 4; target compatibility remains unverified until those results are recorded.

## Milestone 2: complete editing and binary output

Implemented in the card engine, session API, and CLI harness. Browser controls belong to milestone 3. The [validation record](./milestone-2-validation.md) defines metadata preservation, copy preflight, history limits, and download acknowledgement semantics.

### Work

- Add complete-save deletion, copy with explicit Skip/Replace choices, and individual file replacement, including different-size replacements.
- Calculate required destination space using allocation and directory overhead, including space reclaimed by an approved replacement.
- Plan a batch before mutation, then apply it to a candidate working copy. Commit only after the whole operation succeeds and the candidate validates.
- Add ECC layout conversion and the agreed Save/Save as defaults. The 2026-09-23 revision maps output extension to layout: `.ps2` includes ECC; `.mc2` and `.bin` omit it. Input layout is still detected from bytes.
- Add session-only Undo/Redo with one step per successful user action. Bound memory use and document the limit before implementing it.
- Track each card's current revision and the revision last offered as a complete-card download. A raw file dump does not save the card. Browser download initiation must not be represented as verified disk persistence.
- Resolve timestamp, attribute, copy-protection, and unusual allocation cases against the format and compatibility evidence. Propose conservative preservation of unrelated metadata; do not silently strip flags or rename saves to avoid conflicts.

### Acceptance criteria

- Copy, delete, and replacement produce valid cards and preserve unrelated content and metadata.
- Insufficient space and other operation failures leave both cards byte-identical to their pre-operation state and create no history step.
- Undo restores exact prior card contents; Redo restores the successful result.
- Conversion preserves logical file contents and emits valid layout-specific data. Tests distinguish meaningful data from layout-specific spare bytes.
- Original input files remain unchanged.

## Milestone 3: implement the explorer

Implemented. See the [milestone 3 validation record](./milestone-3-validation.md) for browser, icon, and folder-write evidence, plus the remaining release checks.

### Work

- Build the approved dark desktop layout: one or two card panes, comfortable icon grid with a list alternative, and a collapsible inspector on the right.
- Connect save selection and batch selection to card operations. Make the active card and copy destination explicit.
- Show capacity, changed status, directory identity, and file details without treating every save as a separate game.
- Let users edit the whole-card download filename inline while keeping its extension. A name change affects download status and close protection, without changing card bytes or Undo history.
- Adapt the icon parser/renderer. Animate the inspector and hovered or keyboard-focused tile only. Include pause, reduced motion, and fallback previews.
- Check animation fidelity against the real icon format; the existing renderer simplifies keyframe playback. Dispose of unused rendering resources when cards or selections change.
- Add direct binary file downloads and complete-card downloads. Add full-save folder dumping in browsers with directory write support.
- Keep each extracted file's bytes and directory structure. Reject unsafe output paths and handle existing destination files explicitly. Report incomplete folder dumps accurately; external disk writes are not the same transaction as in-memory card editing.
- Add conflict choices, operation errors, and warnings before discarding undownloaded changes. Do not add session recovery.
- Complete keyboard navigation, focus handling, accessible labels, and narrow desktop layouts. Buttons must provide a complete workflow even if drag and drop is added.

### Acceptance criteria

- The two-card copy, file replacement, dump, download, and Undo/Redo workflows work through visible controls and keyboard input.
- A failed or unsupported icon does not block valid card operations.
- Chrome and Edge support full-save folder dumps. Firefox and Safari retain card editing and individual file/card downloads, with a clear folder-dump limitation.
- Refresh or close ends the session; a new visit does not restore card contents.
- No card data is sent to the host. Do not bundle user card fixtures into the deployed application.

## Milestones 3A through 3C: save-format support

These are new work, not part of the completed milestone 3 evidence. Follow [the save-format implementation plan](./save-format-plan.md) for dependencies, module boundaries, and acceptance checks.

| Milestone | Deliverable | Depends on |
| --- | --- | --- |
| 3A | Validated external-save import API, PSU import/export, CLI and explorer controls, independent integrity checks | Completed milestone 3 |
| 3B | MAX, SPS, XPS, CBS, and PS2 PSV imports; MAX export; per-format interoperability evidence | 3A |
| 3C | Signed PS2 PSV export, independent signature checks, and PS3 acceptance testing | 3B |

Milestone 3A is implemented. See [its validation record](./milestone-3a-validation.md) for independent PSU/card checks and browser evidence. Milestone 3B is also implemented; see [its validation record](./milestone-3b-validation.md). Milestone 3C implementation and independent checks are complete; PS3 validation is pending. See [its validation record and manual procedure](./milestone-3c-validation.md). Keep raw dumps and whole-card operations intact. A package export does not save the whole card.

## Milestone 4: validate and release

Hosting is complete: the user confirmed the Pages site working at [ps2stk.craigshaw.com](https://ps2stk.craigshaw.com) on 2026-09-22. See [deployment evidence and remaining hosted checks](./deployment.md). Release validation remains open.

- Run the complete workflow on the supported desktop browser families. Set and document minimum versions based on tested dependencies and required features.
- Complete the deferred game-load tests on PCSX2 and a PS2 through MemCard PRO2, including images with and without spare bytes as appropriate to each destination. Check copied progress, unrelated saves, and saving new progress back to the edited card.
- Extend the destination matrix to saves imported from the supported packages, and verify exported packages through independent tools. Include package downloads in installed-browser checks and carry forward the separate PS3 validation result from 3C.
- Check responsiveness with full cards and representative icon complexity. Measure before adding background-thread or caching complexity.
- [x] Complete Cloudflare Pages Git setup and the first deployment for [craigshaw/ps2stk](https://github.com/craigshaw/ps2stk). Completed by the user on 2026-09-22.
- [x] Configure `ps2stk.craigshaw.com`. The user reported the site working on 2026-09-22.
- [ ] Record the deployed commit, assigned Pages hostname, and final dashboard settings. Verify required GitHub checks and preview configuration.
- [ ] Verify deployed downloads, package workers, folder permissions, and local-only card processing over HTTPS. Follow [the hosted checklist](./deployment.md).

Release requires evidence for the agreed compatibility targets, no known data-loss defects in supported operations, and clear statements of the format and browser limits.

## Scope controls

Do not add persistent workspaces, accounts, a backend, ZIP save packages, damaged-card recovery, game-specific editors, a hex editor, dedicated phone workflows, more than two open cards, or larger card capacities to version 1.

Empty-card creation was added by user request on 2026-09-23. It creates a formatted standard 8 MiB image in an available slot, ready for import or copying. Acceptance covers independent format bytes and ECC, empty root and capacity, import/copy, exact Undo restoration, download status, occupied-slot protection, and keyboard/narrow layouts. See [validation](empty-card-validation.md). Destination game-load tests remain in milestone 4.

The 2026-09-24 icon viewing extension reads all three icon filenames from `icon.sys` and offers a larger viewer for each available model. It also lists extra `.ico` and `.icn` save files. The normal icon remains the gallery default. Viewer work stays in the icon and UI layers, uses the shared renderer, and does not change card bytes or history. Acceptance covers the OutRun three-icon save, synthetic extra icons, switching and playback in the supported browser engines, keyboard focus, reduced motion, and narrow layouts.

On 2026-09-24, the user provided PS2 Browser reference media and deferred action-specific Copy and Delete animation until a save with custom icon animation is available. The OutRun role files are identical and have one static model shape. Its Browser action motion is separate from stored model animation. Keep console action effects outside this icon-viewing change.

The user then requested PS2 Browser-like icon presentation in the card panes and selected inspector. The [icon Browser research](./icon-browser-research.md) records the three-save card evidence, `icon.sys` background values, the render sweep, and the remaining camera uncertainty. On 2026-09-25, the user refined the overview angle with a temporary slider and chose 45 degrees. Card panes now use that fixed view and remain still; the inspector and enlarged viewer retain animation and show the stored selected-screen background over the app stage. Burnout's one-shape, empty out-of-range animation track is handled narrowly. The research record also links the user's animation rendering reference for later work. Compare against the supplied screenshots as a visual approximation; exact console camera and scene behaviour remain unverified.

Arbitrary file/folder import, save renaming, direct device synchronisation, and advanced icon-editing tools remain outside the agreed scope.

Established save-package import/export is now in scope as specified in the save-format plan. This does not authorise arbitrary folder import, ZIP support, PS1/native PS3 saves, or encrypted PS2 Classics whole-card support.

Use the engine milestone to resolve format details. Ask the user one focused question when a finding changes supported behaviour or adds material scope. Do not treat minor implementation choices as new product decisions.

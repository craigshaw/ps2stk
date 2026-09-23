# Milestone 2 implementation and validation

Follow-up, 2026-09-23: the user replaced the original independent extension and
layout choice for whole-card downloads. Current Save and Save as output uses the
filename extension to determine layout. `.ps2` includes ECC; `.mc2` and `.bin`
omit it. The original validation statements below describe the policy tested at
milestone 2. See [current product decisions](./planning.md#agreed-whole-card-save-defaults).

Status: implemented and validated on 2026-09-19. Browser controls are milestone 3 work. Game-load tests remain deferred to milestone 4.

Subsequent integration is recorded in [milestone 3 validation](./milestone-3-validation.md). The limits below describe the milestone 2 delivery.

## Implementation decisions

- Preserve existing timestamps, mode flags (including copy protection), attributes, names, and opaque metadata. Replace only file bytes, length and allocation fields. A complete-save replacement takes the source save's metadata. Deletion clears the live-entry flag and frees allocations; it is not secure erasure.
- Plan copy batches before writing. Resolve each conflict as Skip (default), Replace entire save, or an explicit error. Reclaim all approved replacements before calculating capacity. Preserve directory slots and unrelated metadata; no automatic directory compaction.
- Keep per-card Undo/Redo within a maximum of two open cards. Retain at most 64 MiB of history byte buffers across both cards. Evict the oldest available history boundary when needed, expose an eviction count, and retain one step per successful action. Failed operations and no-ops do not alter history. Current parsed cards and temporary operation buffers are additional memory, not part of the history-byte limit.
- Save preserves the current card layout and original filename by default. Save as may convert the output layout and choose .ps2, .mc2, or .bin without changing the working card. Explicit working-card conversion is separately undoable.
- Track the revision last offered as a whole-card download. Preparing bytes or dumping a raw file does not mark a revision as offered. Acknowledgement means the browser initiated the download, not that the bytes were persisted to disk.

## Evidence

| Check | Result |
| --- | --- |
| Unit and CLI tests | 89 tests pass, including all 47 milestone 1 tests. |
| TypeScript | Pass for the application and a separate engine/session configuration with no DOM or Node types. |
| Production build | Pass. The deployed page remains a minimal shell and does not import test cards. |
| Independent milestone 1 copy matrix | All four source/destination layout combinations pass with unchanged expected output hashes. |
| Independent milestone 2 checks | 24 mutation and conversion checks pass across data-only and ECC layouts. |
| Local OutRun copy regression | Both output layouts match the exact hashes of the milestone 1 outputs already checked independently and reviewed by the user. |
| Local OutRun deletion and whole-save replacement | Reparsed successfully; unrelated directory metadata and restored save file bytes match. This is engine-level regression evidence, not another independent-tool or game-load test. |
| Game-load tests | Deferred to milestone 4, as agreed. |

The independent checks use the same external mymc+ revision documented in [fixture provenance](../tests/fixtures/README.md). Each edited card is checked for file-system structure, every file's hash, and metadata. ECC output is checked page by page against the independent ECC calculation. Conversion is also checked for preservation of every data byte, including unused space.

The 24 cases include repeated replacements from zero bytes through page and cluster boundaries to 25,000 bytes, replacement of a hidden/copy-protected file, complete-save replacement, mixed Skip/Replace batches, multi-save deletion, and conversions in both directions. The independent writer adds a destination-only file before whole-save replacement; the exported replacement must remove it.

mymc+ can print ECC correction messages for the unused ECC bits of erased all-`FF` pages. The separate strict comparison accepts erased all-`FF` pages and requires exact ECC on all other pages. These messages are not used to excuse an incorrect data byte or incorrect ECC on a non-erased page.

## Failure and history coverage

- A batch that cannot fit or contains an invalid selection leaves both cards unchanged. Replacement capacity includes space reclaimed by later selections in the same batch.
- Root directory growth, reuse of deleted slots, bad-block exclusion, and existing allocation reuse are tested. A full-card file replacement can succeed using its own current clusters.
- Complete-save replacement removes destination-only files, preserves source metadata, and does not merge directories.
- Exact Undo/Redo restoration is tested for batch copy, complete-save replacement, file replacement, deletion, and layout conversion.
- Failed operations and no-ops preserve revision, changed status, and Redo. New edits discard only that card's Redo branch.
- The shared history-byte cap is tested across two cards, including eviction, full Undo/Redo traversal of retained history, and changing image sizes through conversion.
- Save defaults preserve uppercase input extensions and use binary layout independently of extension. Save as produces the selected layout and extension without changing working bytes or history.
- A delayed download acknowledgement marks the revision that was prepared, not a later edit. Stale acknowledgements cannot apply to a newly opened card in the same slot.
- The CLI refuses to overwrite cards, replacement input files, or existing dumps. Failed batches, deletion requests, and invalid conversions create no output file.

## Reproduce

```sh
npm run check
npm run test:reference -- /path/to/mymcplus
```

The [README](../README.md) lists CLI examples for deletion, replacement, copy batches, and conversion. `tests/session.test.ts` exercises the session API until browser controls are added.

## Limits and next work

- There are no production browser controls for these operations yet. Keyboard access, download initiation, leave-page warnings, and history-eviction notices must be connected and tested in milestone 3.
- The 64 MiB limit applies to retained history buffers. It is not a claim about total browser heap use. Current cards, parsed metadata, prepared downloads, and temporary candidates consume additional memory. Caller-held output buffers are outside session ownership.
- History retains whole image snapshots for simple, exact restoration. No persistence, workers, or compression service has been added.
- Deletion does not securely erase freed storage. Existing directory slots and their allocated overhead are retained for reuse.
- Conversion preserves all data bytes. Unused spare fields are layout-specific and need not survive an ECC-to-data-to-ECC conversion. Same-layout exports remain byte-identical unless an edit changes the card.
- Save as changes the output only. Subsequent normal Save uses the original filename and current working layout; explicit working-card conversion is an Undo step.
- Timestamps are retained rather than rewritten to wall-clock time. This is the current conservative editing policy, not evidence of game-specific timestamp semantics.
- Compatibility on PCSX2 and PS2/MemCard PRO2 remains a release validation requirement. No game-specific payload editing or checksum repair is implemented.

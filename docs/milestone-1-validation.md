# Milestone 1 validation

Date: 2026-09-19. Milestone 1 accepted for further development. Game-load testing is deferred to milestone 4 by user agreement.

## Implemented

- React, TypeScript, and Vite tooling with pinned dependencies and a Node test runner. Node 24.21.0 and npm 11.19.0 were used.
- A pure TypeScript engine in `src/core/`, separate from the browser shell and CLI filesystem access.
- Exact-length detection for 8,388,608-byte data-only and 8,650,752-byte ECC images. File extensions do not select the binary layout.
- Bounded directory and FAT parsing, allocation ownership checks, parent-link checks, and exact file extraction. ECC is checked for the superblock, active FAT structures, backup transaction marker, and all live directory/file pages. Stale bytes in free clusters are not treated as live files or repaired.
- Byte-identical unchanged export. Inputs and returned buffers cannot alter an open card.
- One complete-save copy, including nested directories, into a separate destination working image. Conflicts and insufficient space fail without changing either card. Existing deleted directory slots can be reused.
- Valid ECC generation on changed pages. Unchanged pages and unused spare fields retain their original bytes.
- A command-line harness for inspection, raw individual-file extraction, and copy. It refuses to overwrite any existing output path.

## Evidence

| Check | Result |
| --- | --- |
| `npm run check` | Pass: TypeScript, 47 tests, and the static production build. |
| Synthetic source/destination layout matrix | All four combinations pass independent mymc+ structural checks, exact file hashes, metadata comparison, and raw CLI extraction. |
| ECC output | Every non-erased page in independently checked ECC output matches mymc+'s ECC calculation. No automatic repair is accepted as validation. |
| Local OutRun card | All 6 files match ps2mcd; unchanged export is identical. Copy into both destination layouts passes mymc+ checks. |
| Local homebrew/system card | All 49 files match ps2mcd; unchanged export is identical. |
| Minimal browser shell | Rendered in the in-app browser at a 960 by 720 desktop viewport; no console errors or warnings. No interactive controls or animation exist yet. |
| User checks of both prepared OutRun cards | Passed in existing tooling, as reported by the user. Tool names and versions were not supplied. |
| PCSX2 game load | Not run. Deferred to milestone 4. |
| PS2 game load through MemCard PRO2 | Not run. Deferred to milestone 4. |
| Full browser editing, keyboard and reduced-motion workflows | Deferred to the explorer milestone. |

The unit tests cover page and cluster boundaries, a fragmented file spanning FAT clusters, empty files, metadata, unchanged unrelated content, all layout combinations, destination root expansion, slot reuse, exact-fit capacity, bad-block exclusion, immutable buffers, malformed geometry, invalid references, cycles, cross-links, orphan allocations, incomplete/excess chains, duplicate names, invalid parent links, pending flash transactions, and ECC faults. CLI tests verify that existing card files cannot be overwritten.

The synthetic fixture inventory and reproduction commands are in [tests/fixtures/README.md](../tests/fixtures/README.md). The local game images remain in the sibling checkout and are not included in this repository or the browser build.

On 2026-09-19, the user confirmed that both prepared OutRun test images passed checks in existing tooling. The saves were not loaded into OutRun through PCSX2 or a real PS2. The user agreed to defer game-load testing to a later stage. Milestone 1 is accepted on the current integrity evidence; game-load testing remains in milestone 4 release validation. The prepared images remain local and excluded from Git.

### Local input provenance

These checks identify existing local samples. They do not establish how each original card was produced or prove device compatibility.

| Local filename | SHA-256 |
| --- | --- |
| `SLUS-21274-1.ps2.bin` | `bfa329e3b8c4872538e1d876b0c79a8ece52e14a15526fa0ea24041e8b6791a5` |
| `MemoryCard1-1.mc2` | `a19277ce4095fbdb27646f3a153053f7e19684adac00ec7116caba65d385236e` |

### Independent tools

- Ross Ridge's PS2 memory card file system reference, retrieved from `docs/ps2mcfs.html` in the pinned mymc+ checkout. The original university URL was unavailable during this work.
- [mymc+](https://git.sr.ht/~thestr4ng3r/mymcplus), `5e58891fd036d9f39a6c3076f998514c8f1cb8f9`, for synthetic formatting, structural checks, file/metadata comparisons, and ECC verification.
- [ps2mcd](https://github.com/craigshaw/ps2mcd), `950d98b353c2899d5d9d20687e2fc4bb9b7599ea`, for a separate extraction comparison on the two local samples.
- Original public-domain [mymc](https://github.com/ps2dev/mymc), `db5d9e1c141cbbc4ba4e374f73a0518a8d75b7ef`, for ECC calculation provenance.

mymc+ attempts ECC detection before recognising a data-only image, which prints misleading correction messages during the initial probe. The reference-check script suppresses only that constructor output, asserts the detected layout, and independently compares every ECC page before opening ECC images. The tool does not write to the input files.

## Current format decisions and limits

- The parser recognises standard geometry and format versions 1.0, 1.1, and 1.2. Recorded fixtures and local samples use 1.2. Earlier versions still require representative testing.
- The allocator respects the PS2 driver's capacity rounded down to 1000-cluster units. It excludes bad blocks and leaves the replacement reserve available for its intended use. Existing readable allocations in bad blocks remain readable.
- Unreferenced allocations and shared file clusters are rejected. This includes unusual homebrew layouts if they deliberately share clusters. There is no recovery mode.
- Nesting is limited to 128 directories. Filenames are exposed as lossless byte strings, not decoded game titles. The original name bytes are retained.
- Copy preserves modes, copy-protection flags, attributes, timestamps, and opaque entry bytes. Allocation pointers and required parent references change. Root entry count changes when needed; timestamps are not rewritten in this milestone. Replacement/deletion timestamp policy remains milestone 2 work.
- ECC mismatches on live data fail explicitly, including errors that another tool could correct. Erased all-`FF` pages are accepted without rewriting them.
- The engine owns image buffers and uses temporary candidate copies. No workers, cache service, persistence, or backend have been added. Full-session memory and Undo history bounds remain milestone 2 work.
- The browser shell does not import fixture data or offer card operations yet. Three.js and Lucide are deferred until they are used.

## Deferred release compatibility checks

Complete this during milestone 4 for PCSX2 and for a PS2 using MemCard PRO2. These checks do not block milestone 2. Use copies of card images and retain the originals.

1. Record the emulator/device firmware version, game and region, source and destination card origin, input layout, and SHA-256 hashes.
2. Confirm that the source save already loads in the target game. Choose a destination card with enough space and no directory of the same name.
3. Run `npm run card -- copy SOURCE DESTINATION SAVE_NAME NEW_OUTPUT`. Retain the destination's supported layout and filename extension.
4. Run `npm run test:reference -- /path/to/mymcplus SOURCE SAVE_NAME` for an independent comparison. Check the actual target output with mymc+ as well if it uses a different destination.
5. Load `NEW_OUTPUT` into PCSX2 or place it on MemCard PRO2 using its normal card-image workflow. Confirm that the PS2 browser shows the copied save and that an unrelated destination save is still present.
6. Start the matching game and load the copied progress. Record a concrete checkpoint such as the displayed slot, progress, or game state. Check an unrelated save as well.
7. Save new progress in the game, reopen the resulting card with the harness, and verify that it remains readable. Record results, output hashes, and any evidence in this document.

The current checks provide evidence of card integrity. Emulator and hardware game-load compatibility remain unverified until these release checks pass.

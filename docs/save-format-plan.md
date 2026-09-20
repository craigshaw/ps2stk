# Save-format implementation plan

Status: milestone 3A is implemented; 3B and 3C remain planned. See [3A validation](./milestone-3a-validation.md). On 2026-09-20, the user accepted the recommended format expansion and requested an executable plan. These milestones follow the completed milestone 3 explorer and precede milestone 4 release validation. They are labelled 3A, 3B, and 3C to preserve existing milestone numbers and validation records.

Product scope is recorded in [planning.md](./planning.md). The terms save, save file, save dump, and save package are defined in [CONTEXT.md](../CONTEXT.md).

## Delivery target

| Format | Import into an open card | Export a selected save | Delivery |
| --- | --- | --- | --- |
| EMS `.psu` | Yes | Yes, default package format | 3A |
| MAX Drive `.max` | Yes | Yes | 3B |
| SharkPort `.sps` | Yes | Deferred | 3B |
| X-Port `.xps` | Yes | Deferred | 3B |
| Code Breaker `.cbs` | Yes | Deferred | 3B |
| PS2 `.psv` | Yes | Signed export | Import in 3B; export in 3C |

Raw file downloads, complete-save folder dumps, and complete-card downloads remain separate operations. Package exports work through ordinary downloads in all supported browser families. Their availability does not depend on folder-write support.

The initial workflow imports one package per action and exports one selected save per download. Multi-package batches, standalone conversion without an open card, automatic database downloads, and direct ZIP import are deferred. Users extract ZIP downloads before importing a supported package. No new custom package format is introduced.

PS1 PSV packages, native PS3 saves, and encrypted PS2 Classics `.VME` whole-card support are outside this expansion. Conversion preserves game payload bytes; it does not convert regions, editions, game checksums, or game-specific progress.

## Implementation boundaries

The current `MemoryCard.copySavesTo` copies private card nodes and their allocated clusters. It cannot accept external save data. `CardEntry` also omits opaque directory-record bytes. Do not assume that copying public entries provides lossless package metadata.

Add these boundaries, with final API names chosen during implementation:

| Area | Planned work |
| --- | --- |
| `src/core` | An owned, validated save-content model and methods to extract a save and atomically import it. Preserve byte-oriented names, exact file data, supported metadata, and metadata provenance. |
| `src/formats` | Byte-based format detection, readers, writers, capability checks, and metadata-loss reports. No React, browser pickers, or Node dependencies. |
| `src/session` | Import commit and export preparation. Use existing per-card history, revision, and 64 MiB history-budget rules. |
| `src/browser` | Bounded package reads and binary downloads, with destination identity/revision checks around asynchronous work. |
| `src/ui` | Import review and export format selection using existing dialogs, inspector, and icon renderer. |
| CLI and tests | Repeatable import/export commands and independent-tool comparisons without a browser. |

Reuse the existing allocator and candidate-validation approach. Extend or extract helpers only where needed; do not construct a temporary fake memory card to turn a package into a copy source. Preserve current copy behaviour, including metadata and allocation regression results, during any refactor.

Include `src/formats` in the TypeScript configuration that excludes DOM and Node types. Compression and signing must have a browser-compatible implementation and a testable byte interface. Audit provenance and file-level licences before adapting source or selecting dependencies. External reference tools are not runtime dependencies. Pin reference revisions and record any reuse in the attribution files.

## Common correctness contract

- Detect formats from validated contents. Extensions are hints. Distinguish unsupported input, malformed packages, unsupported structures, and insufficient card space. PSU has no simple magic signature, so validate its structure rather than guessing from `.psu`.
- Bound encoded input, decompressed output, record counts, filenames, arithmetic, offsets, traversal, and processing work. Before implementing readers, record numeric limits derived from the supported 8 MiB card and each format's overhead. Reject oversized input before allocation and stop decompression at the output budget.
- Preserve exact file bytes and filename bytes. Reject duplicate identities, invalid names, overlapping or out-of-range records, incomplete payloads, and unsafe structures. Do not apply host filename normalization to card identities.
- Preserve timestamps, attributes, and flags where the source format represents them. Record absent metadata separately from zero values. Define deterministic, documented defaults for absent fields before the first import reader ships. Never copy source allocation pointers into the destination.
- Do not claim all formats are lossless. MAX lacks metadata represented by PSU. Export review must describe known metadata loss; require acknowledgement when loss applies. Reject structures a format cannot represent, such as unsupported nested directories, rather than flattening or omitting files.
- Validate checksums and signatures where applicable. Establish each format's integrity policy from reference evidence and negative fixtures. A bad PSV signature must not silently become a trusted import; record the supported verification policy before exposing PSV import.
- Import review names the destination card, detected format, save directory, title/icon when available, file count, file bytes, required allocation, and metadata notices. A broken icon uses the normal fallback and does not invalidate save contents.
- Conflicts use existing Skip and Replace entire save behaviour, defaulting to Skip. Never merge saves, strip protection flags, or rename a save automatically. Calculate capacity including directory overhead and space reclaimed by an approved replacement.
- Import commits only after the complete candidate validates. Failure, cancellation, and Skip leave card bytes, revision, dirty state, and Undo/Redo unchanged. A successful import is one Undo step.
- Export creates a package from the current selected save without changing card bytes, history, or whole-card download status. Generate a safe output filename without changing names inside the package.
- If the destination card is closed, replaced, or edited while a package is being read or reviewed, invalidate that review and revalidate against the current destination. Never commit to a stale slot identity or capacity calculation.

## Milestone 3A: save-package foundation and PSU

Deliverable: import one PSU into either open card and export one save as PSU through the CLI and explorer.

Work, in dependency order:

1. Pin reference tools and build a fixture inventory with hashes, provenance, format variants, expected file bytes, and represented metadata. Resolve the shared model, metadata defaults, numeric parser limits, and PSU directory support against the reference implementation.
2. Add save extraction and validated import to the engine. Reuse allocation, replacement, ECC generation, and candidate validation. Keep existing card-to-card copying stable.
3. Implement PSU detection, decoding, encoding, and export representability checks. Validate the shared model again at the engine boundary even if a format reader already validated it.
4. Add session import/export APIs and CLI commands. CLI output must retain the existing refusal to overwrite input or output files.
5. Add an **Import save** button per card and **Export save** for a single selected save. Opening a card remains a separate action. An unopened slot prompts the user to open a card rather than silently creating one. Imported saves become selected after commit; cancellation restores focus.
6. Complete independent comparisons and browser regression tests. Write `docs/milestone-3a-validation.md` when results exist.

Acceptance:

- Independently generated PSU fixtures import into both data-only and ECC cards with exact expected file bytes, names, and represented metadata.
- An independent reader accepts our PSU exports and extracts the expected contents. Test both external-to-app and app-to-external directions; our own round trip is supplementary evidence.
- New-save import, Skip, Replace entire save, reclaimed-space replacement, exact-fit capacity, root growth, and insufficient space are covered. Unrelated card content and metadata remain unchanged, and ECC output passes independent checks.
- Undo and Redo restore exact card images. Failure and no-op tests preserve existing Redo and the whole-card download status.
- Unsupported nested exports fail clearly without partial output. Zero-byte files, filename boundaries, unusual valid metadata, malformed lengths/counts, and truncated input have meaningful tests.
- Import/export work through buttons and keyboard controls in Chromium, Firefox, and WebKit. Package downloads contain the expected bytes and do not clear the card's changed status. Narrow layouts, focus, fallback icons, and reduced motion remain usable.

## Milestone 3B: legacy imports, PSV import, and MAX export

Depends on 3A. Deliverable: the complete import matrix and PSU/MAX export in the same explorer workflow.

Work:

1. Add and independently verify SPS/XPS readers, including actual fixtures for both extensions and their supported variants.
2. Add CBS decryption/decompression with strict input/output limits and malformed-stream coverage.
3. Add MAX decompression and export compression/checksums. Define metadata defaults and loss notices using the shared policy. Verify known header variants instead of accepting arbitrary inconsistencies.
4. Add a PS2 PSV reader and its integrity checks. Validate PS2 type, file-table ranges and payloads; reject the PS1 variant with a specific explanation. Keep signing support separate from parsing.
5. Extend detection, import review, CLI commands, and the export selector. Measure a near-capacity compressed save in the browser before deciding whether workers are needed. Add one only if measured responsiveness requires it.
6. Write `docs/milestone-3b-validation.md` with per-format evidence, supported variants, metadata losses, and remaining destination checks.

Acceptance:

- Every import extension has independent positive fixtures and negative cases. A renamed extension cannot bypass validation or change the detected format.
- Decoded bytes and supported metadata match an independent implementation. Equivalent saves packaged in different formats produce equivalent payloads, with explicitly documented metadata differences.
- Truncated/invalid compression, excessive advertised sizes, bad offsets, duplicate names, integrity failures, and unsupported variants fail within recorded limits and leave the destination unchanged.
- Our MAX exports are accepted by an independent tool and contain the exact file bytes. PSU remains the default export; metadata-loss notices and unsupported-structure errors are tested.
- Representative Apollo downloads are checked locally after extraction, with actual inner formats recorded. Website descriptions alone do not establish compatibility. Do not commit downloaded saves without explicit redistribution authorisation.
- Browser tests cover each reader reaching the shared import flow and the additional MAX download. Common conflict/history tests remain shared rather than duplicated mechanically for every codec.

## Milestone 3C: signed PS2 PSV export

Depends on 3B. Deliverable: PS2 PSV export with valid signing and independent acceptance evidence.

Work:

1. Pin and inspect the PSV signing reference and its dependencies. Confirm key/seed handling, signed byte ranges, output naming, metadata mapping, browser feasibility, and licence obligations before porting or adapting code.
2. Add a deterministic test vector and an independent signature verification path. Test altered headers and payloads, not just valid output. Make any required randomness injectable for reproducible tests.
3. Add the PSV writer to the format layer, CLI, and existing export selector. Export operates locally and does not alter the source save.
4. Check our output with an independent verifier/converter, then import it through the intended PS3 workflow. Record the PS3 model, firmware/software, game/region, file hashes, and observed results. Load the affected save and save new progress where supported.
5. Write `docs/milestone-3c-validation.md`, distinguishing converter acceptance, signature verification, PS3 import acceptance, and actual game-load evidence.

Acceptance:

- Independent verification accepts the signature, and independent extraction returns every expected file byte and represented metadata field.
- Exported files are accepted through the documented PS3 transfer path. A matching supported game loads the progress before we claim end-to-end PS3 compatibility.
- Browser export remains local, works in all supported families, and preserves card history and changed status.

PS3 access is a validation dependency, not assumed available. If it is unavailable, implementation and independent tests can finish, but destination validation stays explicitly pending. Do not advertise verified PS3 compatibility or silently drop the test. Decide with the user whether to hold PSV export from the release if that dependency remains unresolved.

## Evidence and release integration

Use synthetic payloads and independently produced packages where possible. Record fixture hashes, producer version/commit, construction commands, expected names/data/metadata, and redistribution status in `tests/fixtures/README.md`. Do not copy real saves into public assets. Tests generated only by our new writers cannot establish interoperability.

For each implementation increment run `npm run check`; run `npm run test:browser` when browser behaviour changes. Extend optional reference checks for package imports/exports, pin their dependencies, and record the commands in each validation report. Run existing independent card/ECC checks after engine changes.

Milestone 4 still covers installed-browser permission/download behaviour, minimum browser versions, broader icon/performance checks, PCSX2 and PS2/MemCard PRO2 game-load tests, and Cloudflare Pages Git deployment. Expand its game-load matrix to saves imported from the supported package formats, with both card layouts checked as appropriate to each destination. Include export and re-import through independent tooling. Native hardware/emulator acceptance must be recorded separately from parser checks.

Milestones **3A and 3B** are complete. See [3B validation](./milestone-3b-validation.md) for the format policy, worker decision, and independent evidence. The next implementation task is **3C**, when requested. Do not begin 3C or deployment merely because this document exists. These are delivery milestones, not calendar estimates; refine effort after the 3A fixture and metadata audit.

## Research basis

Reviewed on 2026-09-20 for feasibility. These references establish existing format implementations, not validation of PS2STK support:

- [Original mymc save-format code](https://github.com/ps2dev/mymc/blob/master/ps2save.py): PSU, MAX, CBS, and SharkPort parsing; PSU/MAX writing and metadata differences.
- [PSV Save Converter](https://github.com/bucanero/psv-save-converter): conversion/signing to PSV and extraction back to PSU; inspect file-level provenance before reuse.
- [Apollo PS3](https://github.com/bucanero/apollo-ps3): supported save formats and the distinction between PSV packages and encrypted PS2 Classics cards.
- [Apollo PS2 database](https://bucanero.github.io/apollo-saves/PS2/) and [a ZIP download listing](https://bucanero.github.io/apollo-saves/PS2/SLUS21050/): sample acquisition leads. Package contents still require inspection during implementation.

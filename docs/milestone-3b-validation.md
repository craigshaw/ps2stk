# Milestone 3B implementation and validation

Implemented on 2026-09-20. This delivery adds MAX, SharkPort/X-Port, Code Breaker,
and signed PS2 PSV imports, plus MAX export. PSU remains the default export.
Signed PSV export remains milestone 3C. Game-load and hardware tests remain
milestone 4; this record claims format and tool interoperability only.

## Delivered behaviour

- Import save detects binary contents, including renamed packages. The review
  shows the format, destination, icon or fallback, capacity, and metadata defaults.
  SPS and XPS use the same container and display a combined format label.
- Imports use the existing atomic card operation, conflict policy, immutable
  destination identity check, and one-step Undo/Redo. Raw dumps and whole-card
  downloads retain their existing behaviour.
- Export save offers PSU and MAX. MAX requires an explicit metadata-loss
  acknowledgement. Nested directories are rejected with a visible alternative.
  Export uses a snapshot of the selected save and does not change card history
  or the whole-card download status.
- Browser package processing runs in a short-lived worker. Owned buffers are
  transferred, caller buffers remain intact, and workers terminate on completion
  or error. The page remains responsive; controls prevent concurrent edits.
- The CLI detects all supported imports. MAX export uses
  `export-save CARD SAVE NEW_OUTPUT max --allow-metadata-loss`. Without those
  options, export remains PSU. All output paths must be new files.

## Format policy

| Format | Supported structure and integrity | Metadata |
| --- | --- | --- |
| PSU | Existing flat records and padding; no format checksum | Full directory records as documented in 3A |
| MAX | 92-byte header, LZARI stream, 36-byte file headers, 16-byte alignment with an 8-byte bias. CRC-32 covers the entire package with its CRC field zeroed. Accept normal compressed length including its 4-byte decoded-size word, and the documented variant that stores decoded length there. Other length mismatches fail. | Names and payloads only. Mode defaults: directory 0x8427, file 0x8417. Dates: 2000-01-01 00:00:00. Attributes and opaque fields: zero. |
| SPS/XPS | Three bounded variable header strings; entries of at least 98 bytes, including tested 98- and 250-byte variants. Declared body length must match parsed records. A populated 4-byte body checksum must match. A missing or zero checksum is accepted with a visible integrity notice, following the converter reference. Other trailers fail. | Byte names, swapped mode flags, creation and modification timestamps retained. Extended attributes and opaque card fields absent. Header display text is not card metadata. |
| CBS | Bounded header and RC4-permuted zlib stream. Compressed size can mean body size or whole package size. Decode exactly one raw deflate stream inside a checked zlib wrapper, verify Adler-32, and reject truncation, extra streams, and excess output. Directory mode offsets 72 and 76 are supported; conflicting valid values fail. Both zero means absent mode and gets an explicit default notice. | Names, mode flags, and both timestamps retained, including explicit zero timestamps. Extended attributes and unknown container words are not assumed to be card metadata. Invalid nonzero modes are rejected, not repaired. |
| PS2 PSV | Type 2, version 0, header size 44; bounded directory/file tables. Verify AES-derived HMAC-SHA1 over the complete package with the signature bytes zeroed. Reject unsigned or mismatched signatures, PS1 packages, invalid counts, overlapping files, ranges inside the table, and invalid icon references. | Names, flags, and timestamps retained. Extended attributes and opaque card fields absent. |

All new formats are flat save containers. Missing extended attributes and opaque
record bytes become zero. Missing dot entries use standard directory records and
fixed dates. Import review lists these defaults at the save level; they apply to
all affected entries. Represented zero timestamps are retained. Allocation pointers
are rebuilt by the card engine. MAX loss acknowledgement covers timestamps,
permission/protection flags, attributes, and opaque metadata even if a particular
save currently uses default values.

PSV signature verification detects damaged/unsigned containers under the published
scheme. It does not establish authorship or game validity. A missing SPS/XPS
checksum also limits integrity assurance. No game checksums, regions, or progress
values are converted.

## Numeric bounds and work limits

- Encoded input/output: 16 MiB. Browser/CLI check before reading; codecs check again.
- File bytes and save allocation: each at most 8 MiB, then destination-specific
  capacity checks include root growth and replacement reclamation.
- Entries: 16,384 including the two dot entries, so at most 16,382 files.
- MAX/CBS decompressed buffer: 9 MiB, derived from 8 MiB payload plus 16,384
  records at up to 64 bytes each. MAX padding fits within that per-record allowance.
- Names: 1 through 32 bytes. Wider SPS/XPS fields must contain a name that fits;
  no silent truncation, case folding, or Unicode conversion.
- CBS output is checked in 16 KiB chunks and must equal its advertised length.
- LZARI has a 4,096-byte history, maximum 60-byte match, fixed-size hash tables,
  and at most 64 match candidates per token. Output and arithmetic input reads
  are bounded, including at most 17 implicit zero termination bits. Decoded
  record lengths must consume the declared body exactly.
- PSV file ranges are sorted before overlap checks. Icon pointers must reference
  whole file ranges. Non-file padding is not imported as content.

## Evidence

| Check | Result |
| --- | --- |
| `npm run check` | 121 unit/CLI tests pass, both TypeScript configurations pass, production build passes. Core/session/formats need no DOM or Node types. |
| `npm run test:browser` | 37 passed across Chromium, Firefox, WebKit; 2 expected folder-access skips. Each new extension reaches import review and commits. MAX acknowledgement, keyboard operation, downloads, unchanged dirty status, invalid PSV handling, narrow dialogs, and worker responsiveness pass. |
| `npm run test:reference -- /private/tmp/ps2stk-mymcplus` | Existing card/edit/PSU checks and 10 additional format/layout cases pass. Independent card parsing, metadata, exact payload hashes, and ECC agree. mymc+ reads our MAX exports with exact file bytes. |
| Production preview | Bundled worker loads and imports PSV, then downloads valid MAX output in Chromium, Firefox, and WebKit. Tested against the built static site on port 4173. |
| Independent fixtures | Seven synthetic packages: normal/size-variant MAX, separate SPS/XPS record variants, two CBS variants, and externally signed PSV. Generation and hashes are recorded in the fixture manifest. |
| Signature cross-check | External converter PSV signature agrees with Node/OpenSSL AES/HMAC and the browser-compatible verifier. Header, seed, signature, and payload corruption fail. Re-signed malformed vectors still fail structural validation. |
| Negative cases | Truncation, excessive sizes/counts, incomplete compression, invalid checksums, duplicate names, bad modes, malformed names, PSV overlaps/icon offsets, extra data, unsupported PS1, and output bombs are rejected. Failed imports leave bytes, revision, and Redo intact. |
| Visual review | Inspected the Chromium screenshot of the MAX dialog at 400 px width. Label, acknowledgement, and download button remain visible without horizontal overflow. Existing icon and reduced-motion tests pass. |

Reference pins:

- Original mymc: `db5d9e1c141cbbc4ba4e374f73a0518a8d75b7ef`.
- mymc+: `5e58891fd036d9f39a6c3076f998514c8f1cb8f9`.
- PSV Save Converter: `0e142d2e1a83788dcdd3f4066f6d13b2c1beb467`.

mymc+ exposes zero file-entry lengths in its PSV adapter while returning the
complete file bytes. Independent comparisons use actual returned byte lengths
for that field. This reference limitation is not copied into the application.
SPS/XPS and CBS test packages are independently packed synthetic containers,
checked by the external reader; they are not captures from original peripherals.

## Apollo sample inspection

Downloaded two archives from the [Burnout 3 listing](https://bucanero.github.io/apollo-saves/PS2/SLUS21050/):
[00000001.zip](https://bucanero.github.io/apollo-saves/PS2/SLUS21050/00000001.zip)
and [00000002.zip](https://bucanero.github.io/apollo-saves/PS2/SLUS21050/00000002.zip).
Both contain `BASLUS-21050.PSV`, 78,310 bytes, rather than the MAX files named in
the listing descriptions. Each signature verifies. Each decodes three files
and 77,970 payload bytes. mymc+ extraction matches every file byte, and it also
reads our MAX exports of both samples with identical payloads.

Extracted PSV SHA-256:

- Archive 1: `dd210e9829e5fb42a89242ffe42ff761d29c7c1f620a94ca0cdc3e526f262ef3`.
- Archive 2: `d99fea9d3d13d35d234232f84b779649560c4fdf9e3fc595414c422334c05779`.

Downloads and converted copies remain in temporary local storage. They are not
Git fixtures or public application assets. This checks two real PSV packages,
not the complete Apollo database or game-load compatibility.

## Worker decision and measurement

On this development Mac, a 7,800,000-byte deterministic incompressible payload
blocked Chromium's main thread for 939 ms during LZARI compression and 1,162 ms
during decompression. This measured delay justified the package worker.

Reproduce the worker measurement with the Vite server running:

```sh
node scripts/benchmark-packages.mjs
```

| Browser engine | MAX export | MAX import | Timer ticks during export/import | Largest observed timer gap |
| --- | --- | --- | --- | --- |
| Chromium | 951 ms | 1,200 ms | 59 / 73 | 17.7 ms |
| Firefox | 1,684 ms | 1,494 ms | 88 / 77 | 21 ms |
| WebKit | 1,059 ms | 1,258 ms | 53 / 62 | 21 ms |

These are single local measurements, not minimum-device guarantees. Exact
payloads and caller-buffer ownership were checked. Production output includes
a separate package worker asset of approximately 76 kB before compression.

## Remaining release validation

Signed PSV export and PS3 transfer acceptance remain milestone 3C. PCSX2 game
loads, PS2/MemCard PRO2 loads, original transfer peripherals, installed-browser
OS download/picker behaviour, broader real-save samples, and Cloudflare Pages
Git deployment remain pending. No emulator, console, or original-peripheral
acceptance is claimed. Existing Lucide directive build warnings remain harmless
build warnings; they are not test failures.

## Follow-up: Kingdom Hearts static icon

The local `kingdom-hearts.1889.sps` package contains `icon.sys` and
`mc_icon.bin`. The icon has one shape, 36 vertices, a zero-key animation track,
and a compressed 128 by 128 texture. The parser previously required at least
one key and rejected the preview. Zero-key tracks have no reserved pair; the
texture follows the 8-byte track header immediately. The parser now accepts
that layout while retaining shape, count, and texture bounds.

A synthetic regression covers the static texture, truncation, invalid shape
IDs, and an empty track before another keyed track. The real local package
renders in Chromium import review and the card inspector. The inspected
preview shows the textured Kingdom Hearts cube. No real save assets were
added to Git. The source package SHA-256 is
`a6fff323a899e0a5d8701125a0ecee0e50d55fa67e79bfb7290fd4f24173bbda`.

After this fix, `npm run check` passes 122 unit/CLI tests and the production
build. Nine targeted browser checks pass across Chromium, Firefox, and WebKit,
covering static previews, package icon previews, animation, and reduced motion.
The full 37-pass browser run above predates this focused fix; it was not rerun.

## Follow-up: unified Export save dialog

The separate Dump save to folder action is now part of Export save. Its Output
type selector offers EMS package (.psu), MAX Drive package (.max), and Raw files
to folder. PSU remains the default. Raw output uses Choose folder, supports
nested directories, and shows the Chrome/Edge requirement when directory access
is unavailable. Save card remains a separate whole-image action.

Package and folder output use the selected save snapshot. Folder output retains
safe-path validation, exact file bytes, new-folder-only writes, and partial-write
error reporting. Cancelling the picker leaves the export review open. Errors
appear inside that review without a duplicate background alert.

Validation: `npm run check` passes 122 unit/CLI tests, TypeScript, and the build.
The full browser run passed 42 checks, skipped the two unsupported folder-write
cases, and exposed one test selector that matched both progress messages during
a write. The test now waits for completion. A focused rerun passes seven checks
with the same two platform skips, covering folder writes and cancellation,
existing-folder refusal, nested exports, unsupported-browser guidance, keyboard
focus, and 400/850 px layouts. Across those runs all 43 distinct browser checks
pass. The final TypeScript/build and diff checks also pass. The 400 px raw-export
dialog screenshot was inspected. Native OS picker permissions remain a release
check; folder tests use real Chromium file streams behind a test picker.

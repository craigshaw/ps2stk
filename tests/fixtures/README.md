# Synthetic card fixtures

## Empty-card format vectors

`empty-card-vectors.json` records SHA-256 values for empty cards formatted by
the pinned mymc+ revision below at `2001-02-03T04:05:06Z`. The data-only vector
strips spare bytes from the external ECC output, as for the existing fixtures.
These are independently generated expected values, not hashes from our writer.
No new binary fixture is bundled. Reproduce the format comparison, independent
structure/ECC checks, and package-import payload checks with:

```sh
python3 scripts/reference-empty-card.py /path/to/mymcplus
```

## Existing source and destination images

These four compressed images contain only generated test bytes. They contain no game saves, personal data, or PS2 icon assets. They are test inputs only and are not imported by the browser build.

`manifest.json` records the source tool revision, image layout, decompressed size and SHA-256, and expected entry metadata and file hashes. Compression keeps each 8 MiB card small in Git. The files are named `.ps2.gz` to distinguish them from local card images, which `.gitignore` excludes.

| Fixture | Content |
| --- | --- |
| `source-data.ps2.gz` | One generated save with nested directories, a fragmented file, page and cluster boundary sizes, an empty file, a 32-byte name, hidden/copy-protected flags, and nonzero attributes. |
| `source-ecc.ps2.gz` | The same logical content with ECC spare bytes. |
| `destination-data.ps2.gz` | Two existing directories, one with a file to preserve. The root must grow to insert another save. |
| `destination-ecc.ps2.gz` | The same destination with ECC spare bytes. |

## Reproduce

The generator uses [mymc+](https://git.sr.ht/~thestr4ng3r/mymcplus), commit `5e58891fd036d9f39a6c3076f998514c8f1cb8f9`, as a separate Python tool. It is GPL-3.0-or-later; its code is not copied into the application. See [third-party notices](../../THIRD_PARTY_NOTICES.md).

Clone the tool outside this repository and check out the specified commit. Then run:

```sh
python3 scripts/reference-fixtures.py /path/to/mymcplus
npm test
npm run test:reference -- /path/to/mymcplus
```

Python 3.14.5 was used for the recorded run. The generator fixes timestamps to 2001-02-03 04:05:06 in card-local time. Decompressed hashes must match the manifest after regeneration. Gzip container bytes can depend on the Python/compression version.

The pinned tool's data-only formatter incorrectly retains the physical 528-byte page offset when erasing a backup block. That extends a data-only image past 8 MiB. The generator therefore formats with ECC and removes each page's 16 spare bytes to produce the data-only fixtures. Both layouts then pass an independent reopen and structural check. No application engine code participates in fixture generation.

The source save needs 315 clusters: 306 for files and 9 for directories. Copying it into the destination needs one further root-directory cluster. Capacity tests cover both 315 free clusters (failure) and 316 free clusters (success).

## Local game saves

Keep personal images in `tests/fixtures/local/` or outside this repository. Do not add them to public assets or Git. To validate a local save without copying it into the fixture set:

```sh
npm run test:reference -- /path/to/mymcplus /path/to/local-card.ps2 SAVE-NAME
```

This performs the synthetic copy matrix and, when supplied, copies the local save into each synthetic destination layout. It checks all files and metadata with the external reader and tests the CLI extraction command. It then checks milestone 2 deletion, repeated file replacement, whole-save replacement, mixed batch choices, and layout conversion against the synthetic fixtures. The independent writer inserts a destination-only file to verify that replacement does not merge saves. Temporary card outputs and raw files are removed after the check. Emulator and hardware execution are separate manual tests.

## Synthetic icon and browser fixtures

`tests/icon-helper.ts` creates a hand-authored triangle with two shapes and
non-uniform animation keys. The texture tests add a single RLE run with a known
colour. Browser tests insert these generated assets into synthetic card images
in memory. They are not personal save assets or application build inputs.
The existing local OutRun/homebrew icons were checked separately and remain
outside Git and public assets.

## Synthetic PSU packages (milestone 3A)

`flat.psu.gz` and `empty.psu.gz` are produced with the same pinned external
mymc+ revision above. The application writer does not generate these inputs.
`psu-manifest.json` records package hashes and expected names, lengths, flags,
attributes, and file hashes. Names are encoded as hex so byte identities are
unambiguous. Both packages use 2001-02-03 04:05:06 timestamps, directory mode
0x8427, directory attributes 0x10203040, and a nonzero opaque 16-bit field.
The flat package includes zero-, 513-, 1024-, and 1025-byte files, a 32-byte
name, hidden/copy-protected modes, and nonzero file attributes. The empty
package contains a directory and no files. All payloads are generated, with
no personal or game assets; these fixtures can be distributed with the tests.

```sh
python3 scripts/reference-psu-fixtures.py /path/to/mymcplus
npm run test:reference -- /path/to/mymcplus
```

Reference checks now cover package import and replacement in both card
layouts, exact files/metadata/ECC, and application-produced PSU exports read
by mymc+. New unit tests also mutate these fixtures to exercise high-byte
names, opaque bytes, malformed records, bounds, and capacity. Browser preview
tests use the existing synthetic icon model in an application-produced package;
that is UI evidence, not independent PSU-format evidence.


## Synthetic legacy packages (milestone 3B)

`legacy-manifest.json` pins the external tool revisions and SHA-256 for seven
packages. All use the generated PSU-FLAT file bytes from `psu-manifest.json`.
No game assets or personal saves are included, so these fixtures can be distributed.

- `flat.max.gz`: produced by pinned mymc+; `size-variant.max.gz` changes the
  compressed-size word to the documented decoded-size variant and recomputes CRC.
- `flat.sps.gz` and `flat.xps.gz`: independently packed Python containers with
  98- and 250-byte entries, respectively, nonempty header comments, and valid
  body checksums. Both are read back with external mymc+.
- `flat.cbs.gz`: Python struct/zlib plus external mymc+ RC4, mode at offset 76,
  compressed-body size. `mode72-total.cbs.gz`: mode at offset 72 (converter
  layout), whole-file size. External reads verify exact payloads; unit tests
  check the mode mapping against the documented layouts.
- `flat.psv.gz`: PSU converted and signed by external PSV Save Converter
  `0e142d2e1a83788dcdd3f4066f6d13b2c1beb467`, then extracted independently to
  verify payloads. Node/OpenSSL supplies a second signature implementation.

```sh
make -C /path/to/psv-save-converter
python3 scripts/reference-legacy-fixtures.py /path/to/mymcplus /path/to/psv-save-converter
npm run test:reference -- /path/to/mymcplus
```

MAX/CBS/SPS/XPS/PSV lack the full opaque records and extended attributes of PSU.
MAX also lacks flags and dates. See [3B validation](../../docs/milestone-3b-validation.md)
for expected defaults, parser limits, negative cases, measurements, and locally
checked Apollo packages. Original-peripheral captures and destination game loads
remain release work. Real Apollo samples remain outside Git and public assets.

`staticModel()` in `tests/icon-helper.ts` adds an entirely synthetic triangle
with a zero-key animation track and an immediately following RLE texture. It
covers the compact static layout found while inspecting a local Kingdom Hearts
SPS, without including any bytes from that game's icon or save.

## PSV export vector and independent checks (milestone 3C)

`psv-export-vector.json` records the SHA-256, size, seed, and signature of
`flat.psu.gz` converted by the pinned PSV Save Converter, then re-signed by
that same external implementation using our public seed. The application
writer does not generate the expected vector. Only hashes and metadata are
added; the payload remains the existing synthetic flat-save fixture.

```sh
python3 scripts/reference-psv-export.py /path/to/mymcplus /path/to/psv-save-converter
```

Add `--write-vector` only when intentionally regenerating the recorded vector.
The script requires the same pinned revisions listed above and a C compiler.
It builds unmodified external sources in a temporary directory, invokes the
reference signer through a small adapter, and compares the saved signature
with the independently calculated value. Altered seeds, signatures, headers,
and payloads must fail comparison. Reference checkouts remain unchanged.

Three cases run from both card layouts: the existing flat and empty packages,
and a synthetic package with a 976-byte icon.sys, distinct view/copy icons,
and shared copy/delete references. Our PSV output must match the independent
converter byte for byte after selecting the same seed. Both mymc+ and the
external converter extract it; names, payloads, modes, and timestamps must
match. Extended attributes and opaque metadata are intentionally absent.
The synthetic icon payloads test container references, not PS2 rendering.

The normal test suite checks the recorded vector with Node/OpenSSL as a second
crypto implementation. It also covers full-width/high-byte names, empty files,
missing/broken icons, nested rejection, near-capacity data, output filename
safety, acknowledgement, and unchanged source/history. Hardware results are
separate in [3C validation](../../docs/milestone-3c-validation.md).

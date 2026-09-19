# Synthetic card fixtures

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

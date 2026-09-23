# Empty memory card creation

Date: 2026-09-23.

The user requested empty cards as a starting point for save imports. New memory
card now creates a formatted standard 8 MiB image in the first available slot.
It uses a `.ps2` filename and an 8 MiB data-only working image. Under the later
2026-09-23 save policy, Save card downloads it with calculated ECC spare bytes.
Save as selects the output extension. Both occupied slots disable creation.
New cards need a download until one is offered, including after Undo returns
them to empty. Creation itself is not a content-history step.

The DOM-free engine creates the superblock, indirect FAT, FAT, root dot entries,
and erased transaction block directly. No template card, personal asset, or
reference-tool code is bundled. Root timestamps use the current UTC date.
Creation is also available in the CLI with `create NEW_CARD [data|ecc]` and
refuses to overwrite existing files.

## Independent evidence

The formatter uses the standard geometry described in Ross Ridge's
[PS2 memory card file system reference](https://git.sr.ht/~thestr4ng3r/mymcplus/tree/5e58891fd036d9f39a6c3076f998514c8f1cb8f9/item/docs/ps2mcfs.html).
The reference copy in the pinned mymc+ checkout was inspected locally.
The existing independent [mymc+ tool](https://git.sr.ht/~thestr4ng3r/mymcplus),
commit `5e58891fd036d9f39a6c3076f998514c8f1cb8f9`, supplies the comparison.

`python3 scripts/reference-empty-card.py /tmp/ps2stk-mymcplus` passed:

- Entire empty images match independent formatter output byte for byte with a
  fixed root timestamp, in both data-only and ECC layouts.
- Independent structure checks pass before and after importing a synthetic PSU.
- Every non-erased ECC page matches independent ECC calculation.
- The independent reader returns the exact package file bytes after import.

The expected hashes and provenance are recorded in
[`empty-card-vectors.json`](../tests/fixtures/empty-card-vectors.json).
Our displayed free capacity follows the existing PS2 driver quota: 7999 KiB
after the root cluster, rather than all physically unallocated clusters.

## Application checks

- Node 24.21.0 and `npm ci` passed.
- `npm run check` passed: TypeScript, 135 unit/CLI tests, and production build.
- The final production build passed after the close-warning copy update.
- Full `npm run test:browser` passed in Chromium, Firefox, and WebKit: 52 passed
  and two expected folder-access skips. This includes all six new-card cases.
- New engine/session tests cover format vectors, package and nested-save copying,
  source preservation, invalid creation arguments, occupied slots, initial
  download status, exact empty-card Undo, Redo, and download acknowledgement.
- Browser coverage includes empty creation, import, Undo/Redo, empty download,
  ECC Save as, close protection, two-slot limits, and keyboard use at 390 pixels.
- Visual checks covered the welcome view at 1440 and 390 pixels, and the created
  empty-card workspace at 850 pixels. Existing brand, buttons, and focus rules
  are reused. The header wraps its two actions at narrow widths.
- Changed documentation links and `git diff --check` passed.

## Remaining limits

Newly created cards have not been tested by loading or saving a game in PCSX2
or on a PS2 through MemCard PRO2. Those destination checks remain milestone 4.
Browser download acknowledgement does not prove persistence to disk. This work
does not add session recovery, arbitrary folder import, or larger cards, and
has not been deployed.

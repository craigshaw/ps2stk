# Milestone 3C: signed PS2 PSV export

Date: 2026-09-20. Implementation and independent checks are complete.
PS3 import acceptance and game-load validation remain pending. The user
confirmed access to a PS3; no hardware result has been reported yet.

## Delivered

- Signed PS2 PSV output in the format layer, session API, CLI, and Export save
  dialog. The existing short-lived package worker handles browser encoding.
- Local processing with no new dependencies, user keys, accounts, or server.
- PSU remains the default. PSV requires acknowledgement of metadata loss.
  Changing output type resets acknowledgement, including between MAX and PSV.
- Exact file data and original byte-oriented names, timestamps, and mode flags.
  PSV cannot retain extended attributes, opaque card metadata, or dot records.
  These omissions are explicit in the UI and CLI acknowledgement policy.
- Export retains card bytes, history, revision, and whole-card download status.
  CLI writes refuse existing output paths, including the input card.

## Format and signing policy

The reference is PSV Save Converter at
`0e142d2e1a83788dcdd3f4066f6d13b2c1beb467`. Its C signer, header definitions,
PSU writer, filename convention, and dependencies were inspected. The
application uses an independently written TypeScript implementation and the
existing MIT-licensed noble crypto libraries. The GPL reference is used only
as an external test tool; its application code is not bundled. Attribution
and public notices describe the reference.

- Type 2, version 0 PSV, with a 64-byte container header, 40-byte PS2 header,
  56-byte directory record, and 60-byte records for each file.
- Data is packed after the table with no inter-file padding. Display size is
  the sum of file lengths. Counts and offsets are derived from validated
  `SaveContent`, never copied from card allocations.
- Seed: the fixed 20 ASCII bytes `PS2STK PSV export v1`. The seed and format
  constants are public. No randomness is required and no private key is stored.
- AES-128-CBC derives the 20-byte HMAC key from the seed padded to 64 bytes.
  HMAC-SHA1 covers the complete package with bytes 28 through 47 zeroed. Its
  20-byte result is written at offset 28. This checks container integrity;
  it is not evidence of authorship or game-level correctness.
- Output filename: keep the first 12 directory-name bytes, encode any suffix
  as uppercase hexadecimal, then append `.PSV`. Unsafe host filename characters
  and reserved names are sanitized without changing the internal save name.
  Nonstandard save names remain exportable; PS3 acceptance is not assumed.
- Resolve icon.sys plus the normal, copy, and delete icon names to exact file
  offsets and sizes. Shared references are supported. Missing or malformed
  assets remain unchanged; unresolved icon pointers are zero. A broken preview
  does not prevent exporting otherwise valid save contents.
- Nested directories are rejected. Existing limits remain: 8 MiB of file
  bytes and allocation, at most 16,382 files in a flat save, 32-byte names,
  and a 16 MiB package limit checked before output allocation. In practice,
  card allocation constrains a PSV below the package ceiling.

## Evidence

| Check | Result |
| --- | --- |
| `npm ci`, Node 24.21.0 | Passed with the existing lockfile and dependencies. |
| `npm run check` | 129 unit/CLI tests passed; application and DOM-free engine TypeScript passed; production build passed. |
| Independent PSV checks | Six cases passed: flat, empty, and icon-bearing saves exported from data-only and ECC cards. |
| Independent container comparison | Exact byte equality with the external converter for all six cases after selecting the same public seed. |
| Independent signature checks | External C signer accepts each export; modified seeds, signatures, headers, and payloads fail comparison. Node/OpenSSL agrees with the stored test vector and downloaded browser signatures. |
| Independent extraction | mymc+ and PSV Save Converter recover exact file bytes, names, modes, and timestamps for all six cases. |
| Browser export review | Targeted tests passed in Chromium, Firefox, and WebKit: acknowledgement, keyboard download, 850/400-pixel dialogs, focus restoration, exact output, unchanged history/status, and no external network requests. |
| Full browser regression | 46 passed in Chromium, Firefox, and WebKit; 2 expected folder-access skips in Firefox/WebKit. Includes reduced motion and existing copy/import/export/history workflows. |
| Production preview | PSV download checks passed in all three engines against the built Vite site on port 5174. Downloaded signatures and file bytes match; the bundled worker runs locally. |
| PS3 USB import | Pending user test. |
| PS3 game load and new progress | Pending user test. |

The deterministic vector, reference revisions, and reproduction instructions
are in [fixture provenance](../tests/fixtures/README.md). New unit tests cover
32-byte and high-byte names, zero-byte files, empty saves, missing and malformed
icon.sys files, shared/missing icon references, unsafe download names, nested
rejection, and near-capacity output. They also verify that a PSV export preserves
an existing Redo branch and exact card images in both layouts.

```sh
npm run check
npm run test:browser
python3 scripts/reference-psv-export.py /path/to/mymcplus /path/to/psv-save-converter
```

No core card mutation code changed. Existing card integrity/ECC tests remain
in the suite; the new independent checks focus on package output. Native
browser permission flows, PCSX2, and PS2/MemCard PRO2 game-load tests remain
milestone 4 work.

## Pending PS3 test procedure

Use a PS3 and game combination that supports the chosen PS2 title. Record the
console model, firmware, game title/product code/region, and any transfer
software/version. PS2 disc support depends on the PS3 model. Sony documents
the internal-card and slot workflow in its
[PS3 saved-data guide](https://manuals.playstation.net/document/en/ps3/current/game/2savedata.html).

1. Choose a known working save for the matching game/region. Keep its original
   card and a separate backup of any existing PS3 save. Record the source hash
   and a visible progress checkpoint.
2. Open the card in PS2STK, select the save, choose Export save, and select
   PS2 PSV package (.PSV). Read and acknowledge the format limits, then download.
   Keep the suggested filename and record its SHA-256.
3. Place the file on USB under `PS3/EXPORT/PSV/`. This is the PSV location
   documented by [Apollo PS3](https://github.com/bucanero/apollo-ps3#save-data-folders).
4. In the PS3's Game > Memory Card Utility, open the USB device and copy the
   save to a separate internal PS2 memory card. Record whether the save is
   listed, whether its icon/title appear, and whether import succeeds. Retain
   the original exported file. Do not re-sign or convert it before this check.
5. Assign that internal card to the required slot. Start the matching game,
   load the save, and confirm the expected progress. Record this separately
   from successful USB import.
6. Save new progress, restart the game, and load it again. If possible, export
   the resulting save back to USB, record its hash, and check its contents
   through PS2STK and an independent reader.

If an alternative transfer path such as Apollo is used, record it explicitly.
Acceptance after another tool re-signs or converts the output does not prove
that our original signature was accepted by the PS3.

| Manual evidence | Result |
| --- | --- |
| Console model and firmware | Pending |
| Game/product code/region and known progress | Pending |
| Original source and exported PSV hashes | Pending |
| Transfer path and software version | Pending |
| USB listing and direct copy acceptance | Pending |
| Expected progress loaded | Pending |
| New progress saved and reloaded | Pending |

Do not claim verified PS3 compatibility until those results are recorded.
If testing remains unresolved at release time, decide with the user whether
to hold PSV export from that release, as required by the agreed plan.

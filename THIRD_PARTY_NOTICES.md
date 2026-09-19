# Third-party references

## ECC calculation

`src/core/ecc.ts` adapts the ECC calculation in Ross Ridge's `ps2mc_ecc.py`,
from [mymc](https://github.com/ps2dev/mymc), commit
`db5d9e1c141cbbc4ba4e374f73a0518a8d75b7ef`.
The original file states: "By Ross Ridge" and "Public Domain".

## Independent verification tools

[mymc+](https://git.sr.ht/~thestr4ng3r/mymcplus), commit
`5e58891fd036d9f39a6c3076f998514c8f1cb8f9`, is GPL-3.0-or-later.
It is used as an external test tool and synthetic fixture producer.
Its source is not included in this application or its runtime dependencies.

[ps2mcd](https://github.com/craigshaw/ps2mcd), commit
`950d98b353c2899d5d9d20687e2fc4bb9b7599ea`, is MIT licensed,
copyright Craig Shaw, 2024. It was reviewed as an independent extraction reference.
No ps2mcd source is included in this application.

The file system implementation follows Ross Ridge's PS2 memory card file system
description. A copy of that reference is available in the pinned mymc+ checkout
at `docs/ps2mcfs.html`. Reference tools are development aids, not build dependencies.

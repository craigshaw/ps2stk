# Third-party notices

Full runtime and adapted-source notices are in
[public/third-party-notices.txt](public/third-party-notices.txt), served by the app's
Licenses link. The unmodified Sora font has its full licence beside it at
[public/fonts/OFL-Sora.txt](public/fonts/OFL-Sora.txt).

| Material | Use | Licence |
| --- | --- | --- |
| React, React DOM, Scheduler | Browser UI | MIT |
| Three.js, including OrbitControls | Icon rendering | MIT |
| Lucide React, including Feather-derived icons | Interface icons | ISC and MIT |
| pako and its zlib-derived modules | CBS and ZIP decompression | MIT and zlib |
| [node-unrar-js](https://github.com/YuJianrong/node-unrar.js) and its bundled UnRAR | Local RAR extraction; cap WebAssembly memory at runtime | MIT wrapper and UnRAR licence |
| noble ciphers and hashes | PSV integrity | MIT |
| Sora | Locally served typeface | SIL OFL 1.1 |
| [Primer Octicons](https://github.com/primer/octicons/blob/97825f832c98f817867f770d084c08e3edc6f78c/LICENSE) | GitHub mark in `src/ui/GitHubMark.tsx` | MIT |
| [caol64/ps2mc-browser](https://github.com/caol64/ps2mc-browser/blob/206920b995f6edfb779dbfae7072d988e68bf58c/LICENSE) | Upstream icon parsing/rendering pipeline, adapted through the author's ps2mcs browser | MIT |
| [Ross Ridge's mymc](https://github.com/ps2dev/mymc/tree/db5d9e1c141cbbc4ba4e374f73a0518a8d75b7ef) | Adapted ECC calculation and Code Breaker permutation; card/save-format reference | ECC and save-format source files are marked Public Domain |
| [Haruhiko Okumura's LZARI](https://github.com/bucanero/psv-save-converter/blob/0e142d2e1a83788dcdd3f4066f6d13b2c1beb467/src/lzari.c) | MAX compression wire format and arithmetic model | Original permission notice retained |

Runtime versions are pinned in `package-lock.json`. Keep notices aligned with
installed licences when dependencies or distributed assets change.

External test-tool pins and fixture provenance are in
[tests/fixtures/README.md](tests/fixtures/README.md).

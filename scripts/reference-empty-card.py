"""Validate new cards against pinned mymc+, without copying its code into the app.

Usage: python3 scripts/reference-empty-card.py /path/to/mymcplus
"""
import contextlib
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
vectors = json.loads((root / 'tests/fixtures/empty-card-vectors.json').read_text())
checkout = Path(sys.argv[1]).resolve()
assert subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], text=True).strip() == vectors['revision']
sys.path.insert(0, str(checkout))
from mymcplus import ps2mc
from mymcplus.ps2mc_ecc import ecc_calculate_page
from mymcplus.save.ps2save import PS2SaveFile
from mymcplus.save import format_ems

ps2mc.tod_now = lambda: (6, 5, 4, 3, 2, 2001)
stream = io.BytesIO()
reference = ps2mc.ps2mc(stream, params=(True, 512, 16, 16384))
reference.flush()
assert reference.check()
formatted = stream.getvalue()


def inspect(path):
    data = path.read_bytes()
    if len(data) == 8650752:
        for offset in range(0, len(data), 528):
            page = data[offset:offset + 528]
            if page == b'\xff' * 528:
                continue
            assert page[512:524] == b''.join(bytes(x) for x in ecc_calculate_page(page[:512]))
    # Suppress only the reference tool's ECC probe of data-only images.
    with contextlib.redirect_stdout(io.StringIO()):
        card = ps2mc.ps2mc(io.BytesIO(data))
    assert card.check()
    return card


with tempfile.TemporaryDirectory(prefix='ps2stk-empty-reference-') as directory:
    temp = Path(directory)
    package = temp / 'flat.psu'
    package.write_bytes(gzip.decompress((root / 'tests/fixtures/flat.psu.gz').read_bytes()))
    save = PS2SaveFile()
    format_ems.load(save, io.BytesIO(package.read_bytes()))
    for layout in ('data', 'ecc'):
        expected = formatted if layout == 'ecc' else b''.join(formatted[i:i + 512] for i in range(0, len(formatted), 528))
        assert hashlib.sha256(expected).hexdigest() == vectors[layout]['sha256']
        output = temp / f'empty-{layout}.ps2'
        subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e',
            "import {MemoryCard} from './src/core/index.ts'; import {writeFileSync} from 'node:fs';"
            "writeFileSync(process.argv[1],MemoryCard.create(process.argv[2],new Date(process.argv[3])).export());",
            str(output), layout, vectors['createdAt']], cwd=root, check=True)
        assert output.read_bytes() == expected
        card = inspect(output)
        directory = card.dir_open('/')
        assert len(directory) == 2
        directory.close()
        card.close()
        imported = temp / f'imported-{layout}.ps2'
        subprocess.run(['npm', 'run', 'card', '--', 'import-save', str(output), str(package), str(imported)],
                       cwd=root, check=True, capture_output=True)
        card = inspect(imported)
        for entry, payload in save:
            path = '/' + save.dirent[8].decode('ascii') + '/' + entry[8].decode('ascii')
            file = card.open(path, 'rb')
            assert file.read() == payload
            file.close()
        card.close()
        print(f'{layout}: exact independent format, structure, ECC, and imported payload checks passed')
reference.close()
print('No emulator or hardware game-load checks were performed.')

"""Generate redistributable synthetic PSU packages with pinned external mymc+."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys

REVISION = '5e58891fd036d9f39a6c3076f998514c8f1cb8f9'
checkout = Path(sys.argv[1]).resolve()
assert subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], text=True).strip() == REVISION
sys.path.insert(0, str(checkout))
from mymcplus.save.ps2save import PS2SaveFile
from mymcplus.save import format_ems

out = Path(__file__).resolve().parent.parent / 'tests/fixtures'
timestamp = (6, 5, 4, 3, 2, 2001)
manifest = {'producer': 'mymc+', 'revision': REVISION, 'content': 'Generated synthetic bytes only', 'packages': {}}
for label, names_sizes in [('flat', [(b'empty', 0), (b'bytes-513', 513), (b'12345678901234567890123456789012', 1025), (b'last', 1024)]), ('empty', [])]:
    save = PS2SaveFile()
    save.set_directory([0x8427, 123, len(names_sizes), timestamp, 0, 0, timestamp, 0x10203040, b'PSU-' + label.upper().encode()])
    files = []
    for i, (name, size) in enumerate(names_sizes):
        data = bytes((j * 31 + i) % 256 for j in range(size))
        entry = [0xa41f, 456, size, timestamp, 0, 0, timestamp, 0x12345678, name]
        save.set_file(i, entry, data)
        files.append({'nameHex': name.hex(), 'size': size, 'sha256': hashlib.sha256(data).hexdigest(), 'mode': entry[0], 'attributes': entry[7]})
    stream = io.BytesIO()
    format_ems.save(save, stream)
    data = stream.getvalue()
    (out / f'{label}.psu.gz').write_bytes(gzip.compress(data, mtime=0))
    manifest['packages'][label] = {'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data), 'name': save.dirent[8].decode(), 'files': files}
(out / 'psu-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Generated two independent synthetic PSU fixtures.')

"""Generate synthetic archive fixtures with Python ZIP and an external RAR tool.
Usage: python3 scripts/reference-archive-fixtures.py /path/to/rar
No personal save data is used. RAR4 uses independently packed stored records.
"""
import gzip
import hashlib
import json
import pathlib
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib

fixtures = pathlib.Path(__file__).resolve().parents[1] / 'tests' / 'fixtures'
payload = gzip.decompress((fixtures / 'flat.psu.gz').read_bytes())
manifest = {'zipTool': sys.version.split()[0], 'rarTool': 'RAR 7.23 macOS ARM', 'archives': {}}

def store(name, data):
    (fixtures / (name + '.gz')).write_bytes(gzip.compress(data, mtime=0))
    manifest['archives'][name] = {'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data), 'payloadSha256': hashlib.sha256(payload).hexdigest()}

with tempfile.TemporaryDirectory(prefix='ps2stk-archive-fixtures-') as temporary:
    root = pathlib.Path(temporary)
    for compression, label in [(zipfile.ZIP_STORED, 'stored'), (zipfile.ZIP_DEFLATED, 'deflated')]:
        path = root / 'test.zip'
        with zipfile.ZipFile(path, 'w') as archive:
            info = zipfile.ZipInfo('nested/renamed.data', (2001, 2, 3, 4, 5, 6))
            info.compress_type = compression
            archive.writestr(info, payload)
            archive.writestr('readme.txt', 'Synthetic archive test. No game data.')
        store('flat-' + label + '.zip', path.read_bytes())

    def block(kind, flags, body):
        header = struct.pack('<BHH', kind, flags, 7 + len(body)) + body
        return struct.pack('<H', zlib.crc32(header) & 0xffff) + header
    name = b'nested\\renamed.data'
    main = block(0x73, 0, bytes(6))
    file = block(0x74, 0x8000, struct.pack('<IIBIIBBHI', len(payload), len(payload), 2, zlib.crc32(payload), 0, 29, 0x30, len(name), 0x20) + name)
    store('flat-stored.rar', b'Rar!\x1a\x07\x00' + main + file + payload + block(0x7b, 0, b''))

    (root / 'first.psu').write_bytes(payload)
    (root / 'second.data').write_bytes(payload)
    for label, switches, names in [
        ('flat-deflated.rar', ['-ma5', '-m3', '-md4m'], ['first.psu']),
        ('flat-solid.rar', ['-ma5', '-m3', '-md4m', '-s'], ['first.psu', 'second.data']),
        ('encrypted.rar', ['-ma5', '-m3', '-md4m', '-ptest'], ['first.psu']),
        ('headers-encrypted.rar', ['-ma5', '-m3', '-md4m', '-hptest'], ['first.psu']),
    ]:
        path = root / label
        subprocess.run([sys.argv[1], 'a', '-idq', '-ep', '-ts-', '-oi-', *switches, str(path), *names], cwd=root, check=True)
        store(label, path.read_bytes())

(fixtures / 'archive-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')

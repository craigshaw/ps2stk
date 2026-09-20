"""Synthetic packages: independent Python packing, mymc+ MAX, external PSV signing.
No application codec is used. Requires the pinned checkouts, and a built PSV converter.
"""
import gzip
import hashlib
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import zlib

MYMC = '5e58891fd036d9f39a6c3076f998514c8f1cb8f9'
PSV = '0e142d2e1a83788dcdd3f4066f6d13b2c1beb467'
mymc, converter = map(lambda p: Path(p).resolve(), sys.argv[1:3])
for checkout, revision in [(mymc, MYMC), (converter, PSV)]:
    assert subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], text=True).strip() == revision
sys.path.insert(0, str(mymc))
from mymcplus.save import format_ems, format_max_drive, format_sharkport, format_codebreaker
from mymcplus.save.ps2save import PS2SaveFile

out = Path(__file__).resolve().parent.parent / 'tests/fixtures'
psu = gzip.decompress((out / 'flat.psu.gz').read_bytes())
save = PS2SaveFile()
format_ems.load(save, io.BytesIO(psu))
packages = {}
stream = io.BytesIO()
format_max_drive.save(save, stream)
packages['flat.max'] = stream.getvalue()
variant = bytearray(packages['flat.max'])
struct.pack_into('<I', variant, 80, struct.unpack_from('<I', variant, 88)[0])
struct.pack_into('<I', variant, 12, 0)
struct.pack_into('<I', variant, 12, zlib.crc32(variant))
packages['size-variant.max'] = bytes(variant)
created = psu[8:16]

def shark_entry(name, length, mode, size):
    entry = bytearray(size)
    struct.pack_into('<H64sI', entry, 0, size, name, length)
    struct.pack_into('>H', entry, 78, mode)
    entry[82:90] = created
    entry[90:98] = created
    return entry

for extension, header_size in [('sps', 98), ('xps', 250)]:
    body = shark_entry(save.dirent[8], len(save) + 2, save.dirent[0], header_size)
    for entry, data in save:
        body += shark_entry(entry[8], len(data), entry[0], header_size) + data
    checksum = 0
    for byte in body:
        checksum = (checksum + (byte << (checksum % 24))) & 0xffffffff
    header = b'\x0d\0\0\0SharkPortSave' + struct.pack('<I', 0)
    for text in [b'Synthetic save', b'2001-02-03', b'PS2STK fixture comment']:
        header += struct.pack('<I', len(text)) + text
    packages['flat.' + extension] = header + struct.pack('<I', len(body)) + body + struct.pack('<I', checksum)
    external = PS2SaveFile()
    format_sharkport.load(external, io.BytesIO(packages['flat.' + extension]))
    assert list(external) == list(save) or all(a[1] == b[1] for a, b in zip(external, save))

body = bytearray()
for entry, data in save:
    body += struct.pack('<8s8sIIII32s', created, created, len(data), entry[0], 0, 0, entry[8]) + data
compressed = bytes(format_codebreaker._rc4_crypt(format_codebreaker.PS2SAVE_CBS_RC4S, zlib.compress(body)))
for label, mode_offset, total_size in [('flat', 76, False), ('mode72-total', 72, True)]:
    header = bytearray(296)
    struct.pack_into('<4sIIII32s8s8s', header, 0, b'CFU\0', 0, len(header), len(body), len(compressed) + (len(header) if total_size else 0), save.dirent[8], created, created)
    struct.pack_into('<I', header, mode_offset, save.dirent[0])
    packages[label + '.cbs'] = bytes(header) + compressed
    external = PS2SaveFile()
    format_codebreaker.load(external, io.BytesIO(packages[label + '.cbs']))
    assert all(a[1] == b[1] for a, b in zip(external, save))

with tempfile.TemporaryDirectory() as directory:
    tmp = Path(directory)
    (tmp / 'flat.psu').write_bytes(psu)
    subprocess.run([str(converter / 'psv-save-converter'), 'flat.psu'], cwd=tmp, check=True, stdout=subprocess.DEVNULL)
    psv = next(tmp.glob('*.PSV'))
    packages['flat.psv'] = psv.read_bytes()
    subprocess.run([str(converter / 'psv-save-converter'), psv.name], cwd=tmp, check=True, stdout=subprocess.DEVNULL)
    recovered = next(p for p in tmp.glob('*.psu') if p.name != 'flat.psu')
    external = PS2SaveFile()
    format_ems.load(external, io.BytesIO(recovered.read_bytes()))
    assert all(a[1] == b[1] for a, b in zip(external, save))

manifest = {'mymcRevision': MYMC, 'psvConverterRevision': PSV, 'content': 'Synthetic PSU-FLAT payloads only; see psu-manifest.json for file hashes.', 'packages': {}}
for name, data in packages.items():
    (out / (name + '.gz')).write_bytes(gzip.compress(data, mtime=0))
    manifest['packages'][name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
(out / 'legacy-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Generated', len(packages), 'independent legacy packages.')

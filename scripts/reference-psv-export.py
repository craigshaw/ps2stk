"""Independent PSV export checks. Requires pinned mymc+ and PSV Save Converter.

Usage: python3 scripts/reference-psv-export.py MYMC_CHECKOUT PSV_CHECKOUT [--write-vector]
Builds the unmodified external C sources in a temporary directory. No game data.
"""
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile

MYMC = '5e58891fd036d9f39a6c3076f998514c8f1cb8f9'
PSV = '0e142d2e1a83788dcdd3f4066f6d13b2c1beb467'
root = Path(__file__).resolve().parent.parent
mymc, converter = (Path(arg).resolve() for arg in sys.argv[1:3])
for checkout, revision in [(mymc, MYMC), (converter, PSV)]:
    assert subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], text=True).strip() == revision
    assert not subprocess.check_output(['git', '-C', str(checkout), 'diff', 'HEAD', '--', 'src', 'include', 'mymcplus']), 'Modified reference source'
sys.path.insert(0, str(mymc))
from mymcplus.save import format_ems, format_psv
from mymcplus.save.ps2save import PS2SaveFile


def run(*args, cwd=root):
    result = subprocess.run(list(map(str, args)), cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result


def load(data, codec):
    save = PS2SaveFile()
    codec.load(save, io.BytesIO(data))
    return save


def compare(actual, expected):
    # PSV represents mode flags, timestamps and byte-oriented names, but not
    # extended attributes or opaque card fields. mymc+'s PSV entry size is 0.
    for a, b in [(actual.dirent, expected.dirent)] + [(a, b) for (a, _), (b, _) in zip(actual, expected, strict=True)]:
        assert [a[i] for i in (0, 3, 6, 8)] == [b[i] for i in (0, 3, 6, 8)]
    assert [data for _, data in actual] == [data for _, data in expected]


with tempfile.TemporaryDirectory(prefix='ps2stk-psv-reference-') as directory:
    temp = Path(directory)
    # A small adapter calls the reference's signer. Its converter normally
    # re-signs without checking the old value, so compare before/after explicitly.
    wrapper = temp / 'verify.c'
    wrapper.write_text(r'''
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
void generateHash(uint8_t *, size_t, int);
int psv_reference_main(int, char **);
int main(int argc, char **argv) {
    if (argc != 3) return 2;
    if (!strcmp(argv[1], "convert")) return psv_reference_main(argc - 1, argv + 1);
    FILE *f = fopen(argv[2], "rb");
    if (!f) return 2;
    fseek(f, 0, SEEK_END); long size = ftell(f); rewind(f);
    if (size < 64 || size > 16777216) { fclose(f); return 2; }
    uint8_t *bytes = malloc(size), original[20];
    if (!bytes || fread(bytes, 1, size, f) != (size_t)size) return 2;
    fclose(f);
    memcpy(original, bytes + 28, 20);
    generateHash(bytes, size, 2);
    int result = memcmp(original, bytes + 28, 20) ? 1 : 0;
    if (!strcmp(argv[1], "sign")) {
        f = fopen(argv[2], "wb");
        if (!f || fwrite(bytes, 1, size, f) != (size_t)size) return 2;
        fclose(f); result = 0;
    }
    free(bytes); return result;
}
''')
    include = '-I' + str(converter / 'include')
    run('cc', '-O2', include, '-Dmain=psv_reference_main', '-c', converter / 'src/main.c', '-o', temp / 'main.o')
    sources = ['psu', 'armax', 'cbs', 'aes', 'mcs', 'lzari', 'miniz_tinfl', 'sha1', 'xps']
    reference = temp / 'reference'
    run('cc', '-O2', include, wrapper, temp / 'main.o', *(converter / ('src/' + name + '.c') for name in sources), '-o', reference)

    packages = {name: gzip.decompress((root / f'tests/fixtures/{name}.psu.gz').read_bytes()) for name in ['flat', 'empty']}
    # Independently construct a valid icon.sys with three references. The copy
    # and delete references deliberately share one payload.
    template = load(packages['flat'], format_ems)
    icons = PS2SaveFile()
    ent = list(template.dirent); ent[8] = b'BASLUS-12345TEST'; ent[2] = 3
    icons.set_directory(ent)
    sys_bytes = bytearray(976)
    sys_bytes[:4] = b'PS2D'
    for at, name in [(260, b'view.ico'), (324, b'copy.ico'), (388, b'copy.ico')]:
        sys_bytes[at:at+len(name)] = name
    for i, (name, data) in enumerate([(b'icon.sys', bytes(sys_bytes)), (b'view.ico', b'synthetic view'), (b'copy.ico', b'synthetic copy')]):
        ent = list(template[1][0]); ent[8] = name; ent[2] = len(data)
        icons.set_file(i, ent, data)
    stream = io.BytesIO(); format_ems.save(icons, stream); packages['icons'] = stream.getvalue()

    for label, psu in packages.items():
        work = temp / label; work.mkdir()
        source = work / 'source.psu'; source.write_bytes(psu)
        expected = load(psu, format_ems)
        run(reference, 'convert', source, cwd=work)
        external = next(work.glob('*.PSV'))
        vector = bytearray(external.read_bytes())
        vector[8:28] = b'PS2STK PSV export v1'
        external.write_bytes(vector); run(reference, 'sign', external)
        vector = external.read_bytes()
        if label == 'flat':
            manifest = {'psvConverterRevision': PSV, 'source': 'flat.psu.gz',
                        'seedHex': vector[8:28].hex(), 'bytes': len(vector),
                        'signatureHex': vector[28:48].hex(), 'sha256': hashlib.sha256(vector).hexdigest()}
            path = root / 'tests/fixtures/psv-export-vector.json'
            if '--write-vector' in sys.argv[3:]:
                path.write_text(json.dumps(manifest, indent=2) + '\n')
            assert json.loads(path.read_text()) == manifest
        for layout in ['data', 'ecc']:
            base = work / f'base-{layout}.ps2'
            base.write_bytes(gzip.decompress((root / f'tests/fixtures/destination-{layout}.ps2.gz').read_bytes()))
            card, output = work / f'edited-{layout}.ps2', work / f'export-{layout}.PSV'
            run('npm', 'run', 'card', '--', 'import-save', base, source, card)
            before = card.read_bytes()
            run('npm', 'run', 'card', '--', 'export-save', card, expected.dirent[8].decode('ascii'), output, 'psv', '--allow-metadata-loss')
            actual = output.read_bytes()
            assert actual == vector, f'{label}/{layout}: differs from independent converter: sizes {len(actual)}/{len(vector)}, bytes {[(i, a, b) for i, (a, b) in enumerate(zip(actual, vector)) if a != b][:50]}'
            assert card.read_bytes() == before
            run(reference, 'verify', output)
            compare(load(actual, format_psv), expected)
            run(reference, 'convert', output, cwd=work)
            compare(load(output.with_suffix('.psu').read_bytes(), format_ems), expected)
            for at in [8, 28, 64, 104, len(actual)-1]:
                bad = bytearray(actual); bad[at] ^= 1
                damaged = work / 'damaged.PSV'; damaged.write_bytes(bad)
                assert subprocess.run([reference, 'verify', damaged], stdout=subprocess.DEVNULL).returncode == 1
            print(json.dumps({'case': label, 'layout': layout, 'signature': 'external C verified',
                              'container': 'byte-identical to external converter with fixed seed',
                              'extraction': 'mymc+ and PSV converter bytes/metadata match'}))
print('PSV independent checks passed. No PS3 import or game-load test was performed.')

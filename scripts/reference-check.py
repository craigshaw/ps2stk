"""Check CLI output with external mymc+, including metadata and every file byte.

Usage: python3 scripts/reference-check.py /path/to/mymcplus [LOCAL_CARD SAVE_NAME]
The optional card stays local. Temporary output is removed after checking.
"""
import gzip
import copy
import hashlib
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile

checkout = Path(sys.argv[1]).resolve()
revision = subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True).strip()
assert revision == "5e58891fd036d9f39a6c3076f998514c8f1cb8f9", "Unexpected reference tool revision"
sys.path.insert(0, str(checkout))
from mymcplus.ps2mc import ps2mc  # noqa: E402
from mymcplus.ps2mc_ecc import ecc_calculate_page  # noqa: E402

root = Path(__file__).resolve().parent.parent


def inspect(path):
    image = path.read_bytes()
    if len(image) == 8650752:
        for offset in range(0, len(image), 528):
            page = image[offset:offset + 528]
            if page == b"\xff" * 528:
                continue
            expected = b"".join(bytes(chunk) for chunk in ecc_calculate_page(page[:512]))
            assert page[512:524] == expected, f"Independent ECC mismatch on page {offset // 528}"
    with path.open("rb") as stream:
        # The tool probes for ECC before detecting data-only images. Its probe
        # prints "corrected" while interpreting ordinary bytes as spare bytes.
        # Suppress that probe output only. Real ECC was checked strictly above.
        with contextlib.redirect_stdout(io.StringIO()):
            card = ps2mc(stream)
        assert card.spare_size == (16 if len(image) == 8650752 else 0)
        assert card.check(), f"Independent structural check failed: {path.name}"
        entries = {}

        def visit(directory):
            d = card.dir_open(directory)
            children = [d[i] for i in range(2, len(d))]
            d.close()
            for entry in children:
                if not entry[0] & 0x8000:
                    continue
                name = directory.rstrip("/") + "/" + entry[8].decode("ascii")
                # Allocation addresses differ on copy. Every other exposed field must match.
                values = [entry[i] for i in (0, 1, 2, 3, 5, 6, 7, 8)]
                if entry[0] & 0x20:
                    entries[name] = values
                    visit(name)
                else:
                    f = card.open(name, "rb")
                    content = f.read()
                    f.close()
                    entries[name] = values + [hashlib.sha256(content).hexdigest()]
            return entries
        visit("/")
        card.close()
        return entries


def run_cli(*args):
    result = subprocess.run(["npm", "run", "card", "--", *map(str, args)], cwd=root, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)


def assert_card(path, expected):
    assert inspect(path) == expected, f"Independent file/metadata mismatch: {path.name}"


def data_bytes(path):
    image = path.read_bytes()
    if len(image) == 8650752:
        return b"".join(image[i:i + 512] for i in range(0, len(image), 528))
    return image


with tempfile.TemporaryDirectory(prefix="ps2stk-reference-") as directory:
    temp = Path(directory)
    for file in (root / "tests/fixtures").glob("*.ps2.gz"):
        (temp / file.stem).write_bytes(gzip.decompress(file.read_bytes()))
    sources = [(temp / f"source-{layout}.ps2", "SAVE-A") for layout in ("data", "ecc")]
    if len(sys.argv) == 4:
        sources.append((Path(sys.argv[2]).resolve(), sys.argv[3]))
    for source, save in sources:
        source_inventory = inspect(source)
        for layout in ("data", "ecc"):
            destination = temp / f"destination-{layout}.ps2"
            original_inventory = inspect(destination)
            output = temp / f"result-{len(list(temp.glob('result-*')))}.ps2"
            subprocess.run(["npm", "run", "card", "--", "copy", str(source), str(destination), save, str(output)], cwd=root, check=True, capture_output=True)
            expected = dict(original_inventory)
            expected.update({p: e for p, e in source_inventory.items() if p == "/" + save or p.startswith("/" + save + "/")})
            actual = inspect(output)
            assert actual == expected, f"Independent file/metadata mismatch in {output.name}"
            # Independently verify the CLI raw-byte export too, including empty files.
            for path, fields in actual.items():
                if fields[0] & 0x10:
                    extracted = temp / "extracted"
                    subprocess.run(["npm", "run", "card", "--", "extract", str(output), path, str(extracted)], cwd=root, check=True, capture_output=True)
                    assert hashlib.sha256(extracted.read_bytes()).hexdigest() == fields[-1]
                    extracted.unlink()
            assert inspect(source) == source_inventory
            assert inspect(destination) == original_inventory
            print(json.dumps({"source": source.name, "destination": layout, "structural_check": "passed",
                              "entries_checked": len(actual), "files_and_metadata": "matched",
                              "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest()}))
    # Milestone 2: independent checks for all new mutation and conversion paths.
    for layout in ("data", "ecc"):
        base = temp / f"destination-{layout}.ps2"
        source = temp / f"source-{layout}.ps2"
        base_expected = inspect(base)
        source_expected = inspect(source)
        before_hashes = [hashlib.sha256(p.read_bytes()).hexdigest() for p in (base, source)]
        current = base
        expected = copy.deepcopy(base_expected)
        checks = 0
        for size in (0, 1, 513, 1024, 1025, 25000):
            payload = bytes((i * 17 + 21) % 256 for i in range(size))
            payload_path = temp / "replacement.bin"
            payload_path.write_bytes(payload)
            output = temp / f"m2-{layout}-replace-{size}.ps2"
            run_cli("replace", current, "/KEEP/original", payload_path, output)
            expected["/KEEP/original"][2] = size
            expected["/KEEP/original"][-1] = hashlib.sha256(payload).hexdigest()
            assert_card(output, expected)
            current = output
            checks += 1

        # Replace a protected/hidden file while preserving all other metadata.
        protected = temp / f"m2-{layout}-protected.ps2"
        run_cli("replace", source, "/SAVE-A/bytes-513", payload_path, protected)
        protected_expected = copy.deepcopy(source_expected)
        protected_expected["/SAVE-A/bytes-513"][2] = len(payload)
        protected_expected["/SAVE-A/bytes-513"][-1] = hashlib.sha256(payload).hexdigest()
        assert_card(protected, protected_expected)
        checks += 1

        copied = temp / f"m2-{layout}-copied.ps2"
        run_cli("copy", source, base, "SAVE-A", copied)
        # Use the independent writer to add a destination-only file. Whole-save
        # replacement must remove it, rather than silently merge the directory.
        with copied.open("r+b") as stream:
            with contextlib.redirect_stdout(io.StringIO()):
                card = ps2mc(stream)
            extra = card.open("/SAVE-A/destination-only", "wb")
            extra.write(b"Only in the old destination save")
            extra.close()
            card.close()
        assert "/SAVE-A/destination-only" in inspect(copied)
        replaced = temp / f"m2-{layout}-whole-save.ps2"
        run_cli("copy", protected, copied, "SAVE-A", replaced, "replace")
        assert_card(replaced, {**base_expected, **protected_expected})
        checks += 1

        # A mixed batch skips a changed KEEP, replaces ALSO-KEEP, and adds SAVE-A.
        plan = temp / "plan.json"
        plan.write_text(json.dumps([{"name": "KEEP", "onConflict": "skip"},
                                    {"name": "ALSO-KEEP", "onConflict": "replace"}, {"name": "SAVE-A"}]))
        batch = temp / f"m2-{layout}-batch.ps2"
        run_cli("copy-batch", replaced, current, plan, batch)
        assert_card(batch, {**expected, **protected_expected})
        checks += 1

        deleted = temp / f"m2-{layout}-deleted.ps2"
        run_cli("delete", batch, deleted, "SAVE-A", "ALSO-KEEP")
        assert_card(deleted, {p: v for p, v in expected.items() if not p.startswith("/ALSO-KEEP")})
        checks += 1

        opposite = "ecc" if layout == "data" else "data"
        converted = temp / f"m2-{layout}-converted.ps2"
        run_cli("convert", replaced, opposite, converted)
        assert_card(converted, {**base_expected, **protected_expected})
        assert data_bytes(converted) == data_bytes(replaced)
        roundtrip = temp / f"m2-{layout}-roundtrip.ps2"
        run_cli("convert", converted, layout, roundtrip)
        assert_card(roundtrip, {**base_expected, **protected_expected})
        assert data_bytes(roundtrip) == data_bytes(replaced)
        checks += 2
        assert [hashlib.sha256(p.read_bytes()).hexdigest() for p in (base, source)] == before_hashes
        print(json.dumps({"milestone": 2, "layout": layout, "mutation_and_conversion_checks": checks,
                          "structural_checks": "passed", "files_metadata_and_ecc": "matched"}))
    # Milestone 3A: external PSU -> our cards -> external parser, and our
    # package exports -> external PSU parser. No app decoder supplies expectations.
    from mymcplus.save.ps2save import PS2SaveFile
    from mymcplus.save import format_ems
    for label in ('flat', 'empty'):
        package = temp / f'{label}.psu'
        package.write_bytes(gzip.decompress((root / f'tests/fixtures/{label}.psu.gz').read_bytes()))
        reference = PS2SaveFile()
        format_ems.load(reference, io.BytesIO(package.read_bytes()))
        name = reference.dirent[8].decode('ascii')
        for layout in ('data', 'ecc'):
            base = temp / f'destination-{layout}.ps2'
            output = temp / f'psu-{label}-{layout}.ps2'
            run_cli('import-save', base, package, output)
            expected = inspect(base)
            ent = reference.dirent[:]
            ent[2] += 2
            expected['/' + name] = [ent[i] for i in (0, 1, 2, 3, 5, 6, 7, 8)]
            for ent, payload in reference:
                expected['/' + name + '/' + ent[8].decode('ascii')] = [ent[i] for i in (0, 1, 2, 3, 5, 6, 7, 8)] + [hashlib.sha256(payload).hexdigest()]
            assert_card(output, expected)
            exported = temp / f'psu-{label}-{layout}-export.psu'
            run_cli('export-save', output, name, exported)
            decoded = PS2SaveFile()
            format_ems.load(decoded, io.BytesIO(exported.read_bytes()))
            fields = (0, 1, 2, 3, 6, 7, 8)  # Ignore allocation addresses and parent locations.
            assert [decoded.dirent[i] for i in fields] == [reference.dirent[i] for i in fields]
            for (actual_ent, actual_data), (ref_ent, ref_data) in zip(decoded, reference, strict=True):
                assert [actual_ent[i] for i in fields] == [ref_ent[i] for i in fields]
                assert actual_data == ref_data
            # Replacement must remove a destination-only file.
            changed = temp / f'psu-{label}-{layout}-changed.ps2'
            changed.write_bytes(output.read_bytes())
            with changed.open('r+b') as stream:
                with contextlib.redirect_stdout(io.StringIO()):
                    card = ps2mc(stream)
                f = card.open('/' + name + '/destination-only', 'wb')
                f.write(b'extra'); f.close(); card.close()
            replaced = temp / f'psu-{label}-{layout}-replaced.ps2'
            run_cli('import-save', changed, package, replaced, 'replace')
            assert_card(replaced, expected)
            print(json.dumps({'milestone': '3A', 'package': label, 'layout': layout,
                              'import_export_replace': 'passed', 'files_metadata_and_ecc': 'matched'}))
print("Independent checks passed. No emulator or hardware execution was performed.")

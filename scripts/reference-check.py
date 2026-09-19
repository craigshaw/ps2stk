"""Check CLI output with external mymc+, including metadata and every file byte.

Usage: python3 scripts/reference-check.py /path/to/mymcplus [LOCAL_CARD SAVE_NAME]
The optional card stays local. Temporary output is removed after checking.
"""
import gzip
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
print("Independent checks passed. No emulator or hardware execution was performed.")

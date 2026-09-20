import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { MemoryCard, SaveContent } from '../src/core/index';
import { makeRecord, recordView } from '../src/core/save';
import { decodePsu } from '../src/formats/psu';
import { encodePsv, decodePsv, verifyPsv, psvFilename } from '../src/formats/psv';
import { exportSavePackage } from '../src/formats/index';
import { CardSession } from '../src/session/session';
import { fixture } from './helpers';
import { psvDigest } from './psv-helper';

const source = () => decodePsu(new Uint8Array(gunzipSync(readFileSync('tests/fixtures/flat.psu.gz'))));

test('PSV writer matches the independent converter vector and OpenSSL signature', () => {
  const vector = JSON.parse(readFileSync('tests/fixtures/psv-export-vector.json', 'utf8'));
  const save = source(), before = save.snapshot(), bytes = encodePsv(save);
  assert.equal(bytes.length, vector.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), vector.sha256);
  assert.equal(Buffer.from(bytes.subarray(28, 48)).toString('hex'), vector.signatureHex);
  assert.deepEqual(bytes.subarray(28, 48), new Uint8Array(psvDigest(bytes)));
  assert.deepEqual(encodePsv(save), bytes);
  assert.deepEqual(save.snapshot(), before);
  for (const at of [8, 28, 64, 104, 160, bytes.length - 1]) {
    const changed = bytes.slice(); changed[at]! ^= 1;
    assert.equal(verifyPsv(changed), false);
    assert.notDeepEqual(changed.subarray(28, 48), new Uint8Array(psvDigest(changed)));
  }
});

test('PSV preserves represented metadata and exact payloads, with explicit loss acknowledgement', () => {
  const save = source();
  assert.throws(() => exportSavePackage(save, 'psv'), /Acknowledge metadata loss/);
  const { bytes, filename } = exportSavePackage(save, 'psv', true), decoded = decodePsv(bytes);
  assert.equal(filename, 'PSU-FLAT.PSV');
  for (const [actual, expected] of [[decoded.entry, save.entry], ...decoded.entry.children.map((child, i) => [child, save.entry.children[i]!])] as const) {
    for (const key of ['name', 'mode', 'length', 'created', 'modified'] as const) assert.deepEqual(actual![key], expected![key]);
    assert.equal(actual!.attributes, 0);
  }
  for (const child of save.entry.children) assert.deepEqual(decoded.readFile(child.path), save.readFile(child.path));
  assert.notEqual(save.entry.attributes, 0);
  assert.match(decoded.notices.join(' '), /extended attributes/);
});

test('PSV export preserves card bytes, changed status and Undo/Redo in both layouts', () => {
  for (const layout of ['data', 'ecc'] as const) {
    const session = new CardSession(); session.open(0, fixture('destination', layout), 'card.ps2');
    session.importSave(0, source(), session.state(0).card);
    session.deleteSaves(0, ['KEEP']); session.undo(0);
    const before = session.state(0), bytes = before.card.export();
    assert.equal(before.needsDownload, true);
    assert.throws(() => session.prepareSaveExport(0, 'PSU-FLAT', 'psv'), /Acknowledge/);
    assert.ok(verifyPsv(session.prepareSaveExport(0, 'PSU-FLAT', 'psv', true).bytes));
    assert.deepEqual(session.state(0), before);
    assert.deepEqual(session.state(0).card.export(), bytes);
    session.redo(0); assert.equal(session.state(0).card.entries.some(e => e.name === 'KEEP'), false);
    session.undo(0); assert.deepEqual(session.state(0).card.export(), bytes);
  }
});

test('PSV icon references resolve exact files, including shared icons and 32-byte names', () => {
  const sys = new Uint8Array(976); sys.set([80, 83, 50, 68]);
  const fullName = 'i'.repeat(32);
  for (const [at, name] of [[260, fullName], [324, 'copy.ico'], [388, 'copy.ico']] as const) sys.set(Buffer.from(name), at);
  const root = source().snapshot();
  const children = [['icon.sys', sys], [fullName, new Uint8Array([1, 2, 3])], ['copy.ico', new Uint8Array([4, 5])]].map(([name, data]) => {
    const bytes = data as Uint8Array, record = makeRecord(name as string, false);
    recordView(record).setUint32(4, bytes.length, true);
    return { kind: 'file' as const, record, bytes };
  });
  recordView(root.record).setUint32(4, 5, true);
  const save = new SaveContent({ ...root, children }), encoded = encodePsv(save), v = recordView(encoded);
  const start = 160 + 3 * 60;
  assert.equal(v.getUint32(64, true), 981);
  for (const [at, offset, size] of [[68, start, 976], [76, start + 976, 3], [84, start + 979, 2], [92, start + 979, 2]]) {
    assert.equal(v.getUint32(at!, true), offset); assert.equal(v.getUint32(at! + 4, true), size);
  }
  assert.deepEqual(decodePsv(encoded).readFile('/PSU-FLAT/icon.sys'), sys);
  // Missing copy/delete asset: keep its original name in icon.sys, zero its pointers.
  const missing = save.snapshot(); const last = missing.children[2]!; last.record[64] = 120;
  const missingBytes = encodePsv(new SaveContent(missing));
  assert.deepEqual(missingBytes.subarray(84, 100), new Uint8Array(16));
  // Invalid and short icon.sys still exports exact file bytes without guessing references.
  for (const replacement of [new Uint8Array(976), new Uint8Array([80, 83, 50, 68])]) {
    const modified = save.snapshot(), file = modified.children[0]!;
    recordView(file.record).setUint32(4, replacement.length, true);
    const result = encodePsv(new SaveContent({ ...modified, children: [{ ...file, kind: 'file', bytes: replacement }, ...modified.children.slice(1)] }));
    assert.deepEqual(result.subarray(76, 100), new Uint8Array(24));
    assert.deepEqual(decodePsv(result).readFile('/PSU-FLAT/icon.sys'), replacement);
  }
});

test('PSV naming follows the transfer convention without changing internal name bytes', () => {
  assert.equal(psvFilename('BASLUS-20370-02'), 'BASLUS-203702D3032.PSV');
  assert.equal(psvFilename('BASLUS-20370\x82\xa0'), 'BASLUS-2037082A0.PSV');
  for (const name of ['CON', 'a\\b:*?', '\x82name', 'A'.repeat(32)]) {
    const root = source().snapshot(); root.record.fill(0, 64, 96); root.record.set(Buffer.from(name, 'latin1'), 64);
    const output = exportSavePackage(new SaveContent(root), 'psv', true);
    assert.doesNotMatch(output.filename, /[\\/:*?\x80-\xff]/);
    assert.equal(decodePsv(output.bytes).name, name);
  }
});

test('PSV rejects nested saves, supports empty saves and bounds near-capacity output', () => {
  assert.throws(() => encodePsv(new MemoryCard(fixture()).extractSave('SAVE-A')), /nested/);
  const empty = decodePsu(gunzipSync(readFileSync('tests/fixtures/empty.psu.gz')));
  assert.equal(decodePsv(encodePsv(empty)).fileCount, 0);
  assert.equal(encodePsv(empty).length, 160);
  const root = empty.snapshot(), record = makeRecord('large', false), bytes = new Uint8Array(8386560).fill(0xa5);
  recordView(root.record).setUint32(4, 3, true); recordView(record).setUint32(4, bytes.length, true);
  const output = encodePsv(new SaveContent({ ...root, children: [{ kind: 'file', record, bytes }] }));
  assert.equal(output.length, 220 + bytes.length);
  assert.deepEqual(output.subarray(28, 48), new Uint8Array(psvDigest(output)));
  assert.deepEqual(decodePsv(output).readFile('/PSU-EMPTY/large'), bytes);
});

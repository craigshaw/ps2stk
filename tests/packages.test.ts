import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { MemoryCard, SaveContent } from '../src/core/index';
import { makeRecord, recordView } from '../src/core/save';
import { decodePsu, decodeSavePackage, encodePsu, packageFilename, MAX_PACKAGE_BYTES } from '../src/formats/psu';
import { CardSession } from '../src/session/session';
import { fixture, nearlyFull, set32 } from './helpers';

export const psu = (name = 'flat'): Uint8Array => new Uint8Array(gunzipSync(readFileSync(`tests/fixtures/${name}.psu.gz`)));
const manifest = JSON.parse(readFileSync('tests/fixtures/psu-manifest.json', 'utf8'));

test('independent PSU fixtures retain names, byte hashes, flags, dates and opaque records in both card layouts', () => {
  for (const label of ['flat', 'empty']) {
    const bytes = psu(label), expected = manifest.packages[label];
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
    const save = decodeSavePackage(bytes).save;
    assert.equal(save.name, expected.name);
    assert.equal(save.entry.attributes, 0x10203040);
    assert.equal(recordView(save.snapshot().record).getUint16(2, true), 123);
    for (const file of expected.files) {
      const name = Buffer.from(file.nameHex, 'hex').toString('latin1');
      const entry = save.entry.children.find(e => e.name === name)!;
      assert.equal(entry.mode, file.mode);
      assert.equal(entry.attributes, file.attributes);
      assert.deepEqual(entry.created, [0, 6, 5, 4, 3, 2, 0xd1, 7]);
      assert.equal(createHash('sha256').update(save.readFile(`/${save.name}/${name}`)).digest('hex'), file.sha256);
    }
    for (const layout of ['data', 'ecc'] as const) {
      const original = fixture('destination', layout), card = new MemoryCard(original);
      const imported = card.importSave(save);
      assert.equal(imported.layout, layout);
      assert.deepEqual(imported.entries.filter(e => e.name !== save.name), card.entries);
      assert.deepEqual(imported.readFile('/KEEP/original'), card.readFile('/KEEP/original'));
      assert.deepEqual(card.export(), original);
      const extracted = imported.extractSave(save.name);
      assert.deepEqual(extracted.entry, save.entry);
      for (const child of save.entry.children) assert.deepEqual(extracted.readFile(child.path), save.readFile(child.path));
      assert.equal(card.freeBytes - imported.freeBytes, save.allocatedBytes + 1024); // destination root grows
    }
  }
});

test('PSU limits, truncation, duplicate names, types, trailing data and nested structures fail explicitly', () => {
  const original = psu();
  for (const length of [0, 1, 512, 1024, 1535, 1536, original.length - 1]) assert.throws(() => decodePsu(original.slice(0, length)));
  for (const mutation of [
    (b: Uint8Array) => set32(b, 4, 0xffffffff),
    (b: Uint8Array) => set32(b, 1536 + 4, 0xffffffff),
    (b: Uint8Array) => b.fill(0, 512 + 64, 512 + 96),
    (b: Uint8Array) => b.fill(0, 1024, 1026),
    (b: Uint8Array) => b.set(b.subarray(1536 + 64, 1536 + 96), 2048 + 64),
    (b: Uint8Array) => b.fill(65, 1536 + 64, 1536 + 97),
    (b: Uint8Array) => b.set([0x27, 0x84], 1536),
    (b: Uint8Array) => b.set([0x17, 0x04], 1536),
  ]) { const bytes = original.slice(); mutation(bytes); assert.throws(() => decodePsu(bytes)); }
  assert.throws(() => decodePsu(new Uint8Array([...original, 0])), /trailing/);
  assert.throws(() => decodeSavePackage(new Uint8Array(MAX_PACKAGE_BYTES + 1)), /limit/);
  for (const magic of ['PK\x03\x04', 'Ps2PowerSave', 'CFU\0', 'Sony PS2 Memory Card Format ']) assert.throws(() => decodeSavePackage(Buffer.from(magic)), /Unsupported/);
  assert.throws(() => encodePsu(new MemoryCard(fixture()).extractSave('SAVE-A')), /nested/);
});

test('save buffers are owned; high-byte names and opaque bytes survive; default metadata is deterministic', () => {
  const bytes = psu(); bytes[64] = 0x82; bytes[36] = 0xfe;
  const save = decodePsu(bytes);
  bytes.fill(0);
  const copy = save.snapshot(); copy.record.fill(0); copy.children[1]!.record.fill(0);
  assert.equal(save.name.charCodeAt(0), 0x82);
  assert.equal(save.snapshot().record[36], 0xfe);
  const data = save.readFile(`/${save.name}/bytes-513`); data.fill(0);
  assert.notDeepEqual(save.readFile(`/${save.name}/bytes-513`), data);
  const imported = new MemoryCard(fixture('destination')).importSave(save);
  assert.equal(imported.extractSave(save.name).snapshot().record[36], 0xfe);
  const output = decodePsu(encodePsu(imported.extractSave(save.name)));
  assert.equal(output.name, save.name);
  assert.equal(output.snapshot().record[36], 0xfe);
  assert.equal(packageFilename('CON'), 'save_CON.psu');
  assert.equal(packageFilename('a/b\\c'), 'a_b_c.psu');
  assert.deepEqual(makeRecord('name', true).subarray(8, 16), Uint8Array.from([0,0,0,0,1,1,0xd0,7]));
});

test('engine validates external models and can import a nested extracted save without flattening it', () => {
  const save = new MemoryCard(fixture()).extractSave('SAVE-A');
  const card = new MemoryCard(fixture('destination')).importSave(save);
  assert.deepEqual(card.readFile('/SAVE-A/NESTED/12345678901234567890123456789012'), save.readFile('/SAVE-A/NESTED/12345678901234567890123456789012'));
  const root = decodePsu(psu()).snapshot();
  set32(root.record, 4, 100);
  assert.throws(() => new SaveContent(root), /count/);
  const invalid = decodePsu(psu()).snapshot();
  const first = invalid.children[0]!;
  set32(first.record, 4, 17);
  assert.throws(() => new SaveContent(invalid), /Incomplete/);
});

test('capacity includes directory allocation and replacement reclamation; failed imports retain bytes', () => {
  const save = decodePsu(psu()), needed = save.allocatedBytes / 1024 + 1;
  const short = new MemoryCard(nearlyFull(needed - 1)), before = short.export();
  assert.equal(short.planImport(save).shortageBytes, 1024);
  assert.throws(() => short.importSave(save), /1024 more bytes/);
  assert.deepEqual(short.export(), before);
  const exact = new MemoryCard(nearlyFull(needed)).importSave(save);
  assert.equal(exact.freeBytes, 0);
  assert.equal(exact.importSave(save), exact);
  const replaced = exact.importSave(save, 'replace');
  assert.equal(replaced.freeBytes, 0);
  assert.deepEqual(replaced.readFile('/PSU-FLAT/bytes-513'), save.readFile('/PSU-FLAT/bytes-513'));
  assert.throws(() => exact.importSave(save, 'error'), /already contains/);
});

test('session imports have one exact Undo/Redo step, remove destination-only files, and preserve download status', () => {
  const session = new CardSession(), original = fixture('destination', 'ecc'), save = decodePsu(psu());
  session.open(0, original, 'destination.ps2');
  assert.equal(session.importSave(0, save, session.state(0).card), true);
  const imported = session.state(0).card.export();
  session.prepareSaveExport(0, save.name);
  assert.equal(session.state(0).needsDownload, true);
  session.undo(0); assert.deepEqual(session.state(0).card.export(), original);
  assert.equal(session.state(0).needsDownload, false);
  session.redo(0); assert.deepEqual(session.state(0).card.export(), imported);
  const root = decodePsu(psu('empty')).snapshot();
  root.record.fill(0, 64, 96); root.record.set(Buffer.from(save.name), 64);
  const empty = new SaveContent(root);
  const expected = session.state(0).card;
  assert.equal(session.importSave(0, empty, expected), false);
  assert.equal(session.importSave(0, empty, expected, 'replace'), true);
  assert.equal(session.state(0).card.extractSave(save.name).fileCount, 0);
  session.undo(0); assert.deepEqual(session.state(0).card.export(), imported);
  assert.equal(session.importSave(0, save, session.state(0).card), false);
  assert.equal(session.state(0).canRedo, true);
  assert.throws(() => session.importSave(0, save, expected, 'replace'), /changed/);
  assert.equal(session.state(0).canRedo, true);
  session.close(0, true); session.open(0, imported, 'reopened.ps2');
  assert.throws(() => session.importSave(0, save, expected, 'replace'), /changed/);
});

test('package imports reuse deleted slots and avoid marked bad blocks, including reclaimed space', async () => {
  const { raw, get32 } = await import('./helpers');
  const save = decodePsu(psu());
  const original = new MemoryCard(fixture('destination'));
  const deleted = original.deleteSaves(['ALSO-KEEP']);
  const imported = deleted.importSave(save);
  assert.equal(deleted.freeBytes - imported.freeBytes, save.allocatedBytes);
  const data = imported.export(), r = raw(data);
  const block = Math.floor((r.offset + get32(data, r.entry('/PSU-FLAT/bytes-513') + 16)) / 8);
  set32(data, 208, block);
  const bad = new MemoryCard(data), result = bad.importSave(save, 'replace').export();
  const rootClusters = new Set(r.chain(0));
  for (let i = 1; i < 8000; i++) if (!rootClusters.has(i) && Math.floor((r.offset + i) / 8) === block) {
    // Other saves already in the marked block retain their readable allocation.
    const ownedBySave = [r.entry('/PSU-FLAT'), ...save.entry.children.map(e => r.entry(e.path))]
      .some(at => r.chain(get32(data, at + 16)).includes(i));
    if (ownedBySave) assert.equal(get32(result, r.fatOffset(i)) & 0x80000000, 0);
  }
  assert.deepEqual(new MemoryCard(result).readFile('/PSU-FLAT/bytes-513'), save.readFile('/PSU-FLAT/bytes-513'));
});

test('failed session import preserves revision, Undo/Redo, and dirty status', () => {
  const session = new CardSession();
  session.open(0, nearlyFull(0), 'full.bin');
  session.deleteSaves(0, ['ALSO-KEEP']);
  session.undo(0);
  const state = session.state(0), before = state.card.export();
  assert.throws(() => session.importSave(0, decodePsu(psu()), state.card), /more bytes/);
  assert.deepEqual(session.state(0), state);
  assert.deepEqual(session.state(0).card.export(), before);
});

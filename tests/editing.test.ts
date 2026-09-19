import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryCard } from '../src/core/index';
import type { CardEntry } from '../src/core/index';
import { fixture, raw, hash, nearlyFull, set32, get32 } from './helpers';
import { pageEcc } from '../src/core/ecc';

const flatten = (entries: readonly CardEntry[]): CardEntry[] => entries.flatMap(e => [e, ...flatten(e.children)]);
function sameSave(actual: MemoryCard, expected: MemoryCard, name: string): void {
  const a = actual.entries.find(e => e.name === name), b = expected.entries.find(e => e.name === name);
  assert.deepEqual(a, b);
  for (const file of flatten(b ? [b] : []).filter(e => e.kind === 'file')) assert.deepEqual(actual.readFile(file.path), expected.readFile(file.path));
}
function renamedSave(name: string): MemoryCard {
  const bytes = fixture();
  const offset = raw(bytes).entry('/SAVE-A') + 64;
  bytes.fill(0, offset, offset + 32);
  bytes.set(new TextEncoder().encode(name), offset);
  return new MemoryCard(bytes);
}

for (const layout of ['data', 'ecc'] as const) {
  test(`${layout}: delete a nested save and retain unrelated bytes and directory slots`, () => {
    const source = new MemoryCard(fixture('source', layout));
    const base = new MemoryCard(fixture('destination', layout));
    const before = source.copySaveTo(base, 'SAVE-A');
    const after = before.deleteSaves(['SAVE-A']);
    assert.deepEqual(after.entries, base.entries);
    sameSave(after, before, 'KEEP');
    assert.equal(after.freeBytes - before.freeBytes, 315 * 1024);
    assert.deepEqual(before.entries.at(-1), source.entries[0]);
    assert.equal(source.copySaveTo(after, 'SAVE-A').freeBytes, before.freeBytes);
  });

  for (const size of [0, 1, 512, 1024, 1025, 20000]) {
    test(`${layout}: file replacement at ${size} bytes preserves name and metadata`, () => {
      const source = new MemoryCard(fixture('source', layout));
      const path = '/SAVE-A/bytes-513';
      const replacement = Uint8Array.from({ length: size }, (_, i) => i % 251);
      const before = source.export();
      const result = source.replaceFile(path, replacement);
      assert.deepEqual(result.readFile(path), replacement);
      assert.deepEqual(source.export(), before);
      const oldEntries = flatten(source.entries), newEntries = flatten(result.entries);
      for (let i = 0; i < oldEntries.length; i++) {
        const old = oldEntries[i]!, updated = newEntries[i]!;
        assert.equal(updated.path, old.path);
        assert.equal(updated.mode, old.mode);
        assert.equal(updated.attributes, old.attributes);
        assert.deepEqual(updated.created, old.created);
        assert.deepEqual(updated.modified, old.modified);
        if (old.kind === 'file' && old.path !== path) assert.deepEqual(result.readFile(old.path), source.readFile(old.path));
      }
      assert.equal(result.freeBytes - source.freeBytes, (1 - Math.ceil(size / 1024)) * 1024);
    });
  }

  test(`${layout}: replace an empty file and replace a nested file`, () => {
    const source = new MemoryCard(fixture('source', layout));
    const nested = '/SAVE-A/NESTED/12345678901234567890123456789012';
    const after = source.replaceFile('/SAVE-A/bytes-0', new Uint8Array([1, 2, 3])).replaceFile(nested, new Uint8Array());
    assert.deepEqual(after.readFile('/SAVE-A/bytes-0'), new Uint8Array([1, 2, 3]));
    assert.equal(after.readFile(nested).length, 0);
  });

  test(`${layout}: full-save replacement uses only source contents and metadata`, () => {
    const original = new MemoryCard(fixture('destination', layout));
    const changed = original.replaceFile('/KEEP/original', new Uint8Array(32000).fill(76));
    const result = original.copySavesTo(changed, [{ name: 'KEEP', onConflict: 'replace' }]);
    sameSave(result, original, 'KEEP');
    sameSave(result, changed, 'ALSO-KEEP');
    assert.equal(changed.readFile('/KEEP/original').length, 32000);
  });
}

test('Skip is the default; mixed batch skips conflicts and copies all other saves', () => {
  const destination = new MemoryCard(fixture('destination'));
  const source = new MemoryCard(fixture()).copySaveTo(destination, 'SAVE-A');
  const result = source.copySavesTo(destination, [{ name: 'KEEP' }, { name: 'SAVE-A' }]);
  sameSave(result, destination, 'KEEP');
  sameSave(result, source, 'SAVE-A');
  assert.equal(source.copySavesTo(destination, [{ name: 'KEEP' }]), destination);
  assert.equal(destination.deleteSaves([]), destination);
  assert.equal(destination.replaceFile('/KEEP/original', destination.readFile('/KEEP/original')), destination);
});

test('batch preflight reclaims a later replacement before an earlier new copy', () => {
  const source = new MemoryCard(fixture()).copySaveTo(new MemoryCard(fixture('destination')), 'SAVE-A');
  const target = new MemoryCard(nearlyFull(0));
  assert.equal(target.freeBytes, 0);
  const result = source.copySavesTo(target, [{ name: 'SAVE-A' }, { name: 'KEEP', onConflict: 'replace' }]);
  sameSave(result, source, 'SAVE-A');
  sameSave(result, source, 'KEEP');
  sameSave(result, target, 'ALSO-KEEP');
});

test('batch failure, missing names and duplicate choices leave both inputs unchanged', () => {
  const source = renamedSave('SAVE-B').copySaveTo(new MemoryCard(fixture()), 'SAVE-B');
  const target = new MemoryCard(nearlyFull(316));
  const before = [hash(source.export()), hash(target.export())];
  assert.throws(() => source.copySavesTo(target, [{ name: 'SAVE-A' }, { name: 'SAVE-B' }]), /more bytes/);
  assert.throws(() => source.copySavesTo(target, [{ name: 'SAVE-A' }, { name: 'missing' }]), /No save/);
  assert.throws(() => source.copySavesTo(target, [{ name: 'SAVE-A' }, { name: 'SAVE-A' }]), /only once/);
  assert.throws(() => source.deleteSaves(['SAVE-A', 'missing']), /No save/);
  assert.throws(() => source.deleteSaves(['SAVE-A', 'SAVE-A']), /only once/);
  assert.deepEqual([hash(source.export()), hash(target.export())], before);
});

test('replace failure does not change the file or unrelated bytes', () => {
  const card = new MemoryCard(fixture());
  const before = hash(card.export());
  assert.throws(() => card.replaceFile('/SAVE-A/bytes-513', new Uint8Array(8388608)), /more bytes/);
  assert.throws(() => card.replaceFile('/SAVE-A', new Uint8Array()), /No file/);
  assert.equal(hash(card.export()), before);
});

test('replacement on a full card reuses its current clusters', () => {
  const card = new MemoryCard(nearlyFull(0));
  const replacement = new Uint8Array(card.readFile('/KEEP/original').length).fill(63);
  const result = card.replaceFile('/KEEP/original', replacement);
  assert.equal(result.freeBytes, 0);
  assert.deepEqual(result.readFile('/KEEP/original'), replacement);
});

test('copy replacement removes destination-only files rather than merging', () => {
  const full = new MemoryCard(fixture());
  const bytes = fixture('destination');
  const r = raw(bytes), offset = r.entry('/KEEP') + 64;
  bytes.fill(0, offset, offset + 32);
  bytes.set(new TextEncoder().encode('SAVE-A'), offset);
  const small = new MemoryCard(bytes);
  const result = small.copySavesTo(full, [{ name: 'SAVE-A', onConflict: 'replace' }]);
  sameSave(result, small, 'SAVE-A');
  assert.throws(() => result.readFile('/SAVE-A/fragmented'), /No file/);
});

test('conversion preserves every data byte and produces independent fixture content', () => {
  const data = new MemoryCard(fixture());
  const ecc = new MemoryCard(fixture('source', 'ecc'));
  assert.deepEqual(ecc.export('data'), data.export());
  const converted = data.withLayout('ecc');
  assert.deepEqual(converted.export('data'), data.export());
  assert.deepEqual(converted.entries, ecc.entries);
  const bytes = converted.export();
  for (let i = 0; i < bytes.length; i += 528) {
    const page = bytes.subarray(i, i + 528);
    if (!page.every(b => b === 255)) assert.deepEqual(page.subarray(512, 524), pageEcc(page.subarray(0, 512)));
  }
  assert.equal(data.withLayout('data'), data);
  assert.deepEqual(ecc.export(), fixture('source', 'ecc'));
});

test('conversion retains data from free space and handles spare fields separately', () => {
  const input = fixture('source', 'ecc');
  const freePage = 15000;
  input[freePage * 528] = 71;
  input[freePage * 528 + 524] = 99;
  // Stale ECC in free space is outside live-data validation. Conversion retains
  // the data byte, and newly generated spare bytes must match that data.
  const card = new MemoryCard(input);
  const data = card.export('data');
  assert.equal(data[freePage * 512], 71);
  const again = new MemoryCard(data).export('ecc');
  assert.equal(again[freePage * 528], 71);
  assert.equal(again[freePage * 528 + 524], 0);
  assert.deepEqual(card.export(), input);
});

test('save replacement excludes freed bad-block clusters from new allocation', () => {
  const bytes = fixture();
  const r = raw(bytes);
  const block = Math.floor((r.offset + get32(bytes, r.entry('/SAVE-A/fragmented') + 16)) / 8);
  set32(bytes, 208, block);
  const source = new MemoryCard(fixture());
  const destination = new MemoryCard(bytes);
  const output = source.copySavesTo(destination, [{ name: 'SAVE-A', onConflict: 'replace' }]).export();
  const rootClusters = new Set(r.chain(0));
  for (let i = 1; i < 8000; i++) {
    if (!rootClusters.has(i) && Math.floor((r.offset + i) / 8) === block) assert.equal(get32(output, r.fatOffset(i)) & 0x80000000, 0);
  }
  sameSave(new MemoryCard(output), source, 'SAVE-A');
});

test('explicit conflict errors and invalid choices fail before applying a batch', () => {
  const source = new MemoryCard(fixture('destination'));
  const target = new MemoryCard(fixture('destination'));
  const before = hash(target.export());
  assert.throws(() => source.copySavesTo(target, [{ name: 'KEEP', onConflict: 'replace' }, { name: 'ALSO-KEEP', onConflict: 'error' }]), /already contains/);
  assert.throws(() => source.copySavesTo(target, [{ name: 'KEEP', onConflict: 'merge' as 'replace' }]), /Invalid conflict/);
  assert.equal(hash(target.export()), before);
});

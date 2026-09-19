import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MemoryCard, CardError } from '../src/core/index';
import type { CardEntry } from '../src/core/index';
import { pageEcc } from '../src/core/ecc';
import { fixture, hash, raw, get32, set32, nearlyFull } from './helpers';

interface ExpectedEntry {
  kind: string; length: number; mode: number; attributes: number;
  created: number[]; modified: number[]; sha256?: string;
}
const manifest = JSON.parse(readFileSync(new URL('./fixtures/manifest.json', import.meta.url), 'utf8')) as {
  cards: Record<string, { sha256: string; entries: Record<string, ExpectedEntry> }>;
};
const flatten = (entries: readonly CardEntry[]): CardEntry[] => entries.flatMap(entry => [entry, ...flatten(entry.children)]);
const date = (raw: readonly number[]) => [raw[1], raw[2], raw[3], raw[4], raw[5], raw[6]! | raw[7]! << 8];

function verifyInventory(card: MemoryCard, expected: Record<string, ExpectedEntry>): void {
  const entries = flatten(card.entries);
  assert.deepEqual(entries.map(e => e.path).sort(), Object.keys(expected).sort());
  for (const entry of entries) {
    const reference = expected[entry.path]!;
    for (const key of ['kind', 'length', 'mode', 'attributes'] as const) assert.equal(entry[key], reference[key], `${entry.path} ${key}`);
    assert.deepEqual(date(entry.created), reference.created);
    assert.deepEqual(date(entry.modified), reference.modified);
    if (entry.kind === 'file') assert.equal(hash(card.readFile(entry.path)), reference.sha256, entry.path);
  }
}

for (const role of ['source', 'destination']) for (const layout of ['data', 'ecc']) {
  test(`${role} ${layout}: independent inventory and exact unchanged export`, () => {
    const bytes = fixture(role, layout);
    const reference = manifest.cards[`${role}-${layout}.ps2.gz`]!;
    assert.equal(hash(bytes), reference.sha256);
    const card = new MemoryCard(bytes);
    assert.equal(card.layout, layout);
    verifyInventory(card, reference.entries);
    assert.deepEqual(card.export(), bytes);
  });
}

for (const sourceLayout of ['data', 'ecc']) for (const targetLayout of ['data', 'ecc']) {
  test(`copy ${sourceLayout} into ${targetLayout}: all bytes, metadata and unrelated entries`, () => {
    const sourceBytes = fixture('source', sourceLayout), targetBytes = fixture('destination', targetLayout);
    const source = new MemoryCard(sourceBytes), target = new MemoryCard(targetBytes);
    const result = source.copySaveTo(target, 'SAVE-A');
    assert.equal(result.layout, targetLayout);
    assert.deepEqual(source.export(), sourceBytes);
    assert.deepEqual(target.export(), targetBytes);
    verifyInventory(result, { ...manifest.cards['source-data.ps2.gz']!.entries, ...manifest.cards['destination-data.ps2.gz']!.entries });
    assert.equal(target.freeBytes - result.freeBytes, 323584); // 315 source clusters + one root expansion cluster.
    if (targetLayout === 'ecc') {
      const output = result.export();
      for (let offset = 0; offset < output.length; offset += 528) {
        const page = output.subarray(offset, offset + 528);
        if (!page.every(b => b === 255)) assert.deepEqual(page.subarray(512, 524), pageEcc(page.subarray(0, 512)));
        assert.deepEqual(page.subarray(524), targetBytes.subarray(offset + 524, offset + 528));
      }
    } else {
      const before = raw(targetBytes), output = result.export();
      const unchanged = before.chain(get32(targetBytes, before.entry('/KEEP') + 16))
        .concat(before.chain(get32(targetBytes, before.entry('/KEEP/original') + 16)))
        .concat(before.chain(get32(targetBytes, before.entry('/ALSO-KEEP') + 16)));
      for (const cluster of unchanged) {
        const offset = before.cluster(cluster);
        assert.deepEqual(output.subarray(offset, offset + 1024), targetBytes.subarray(offset, offset + 1024));
      }
    }
  });
}

test('input, output and extracted buffers cannot mutate an open card', () => {
  const bytes = fixture();
  const card = new MemoryCard(bytes);
  const initial = hash(card.export());
  bytes.fill(0);
  card.export().fill(0);
  card.readFile('/SAVE-A/bytes-513').fill(0);
  assert.equal(hash(card.export()), initial);
  assert.ok(Object.isFrozen(card.entries[0]!.children[0]!.created));
});

test('accepts a typed array slice with a nonzero byte offset', () => {
  const bytes = fixture();
  const outer = new Uint8Array(bytes.length + 17);
  outer.set(bytes, 9);
  assert.deepEqual(new MemoryCard(outer.subarray(9, 9 + bytes.length)).export(), bytes);
});

test('deleted root slot is reused without growing the root directory', () => {
  const bytes = fixture('destination');
  const r = raw(bytes), deleted = r.entry('/ALSO-KEEP');
  bytes[deleted + 1]! &= 0x7f;
  set32(bytes, r.fatOffset(get32(bytes, deleted + 16)), 0x7fffffff);
  const target = new MemoryCard(bytes);
  const result = new MemoryCard(fixture()).copySaveTo(target, 'SAVE-A');
  assert.equal(get32(result.export(), r.cluster(0) + 4), 4);
  assert.equal(target.freeBytes - result.freeBytes, 322560);
});

test('conflict and missing save fail without changing either card', () => {
  const source = new MemoryCard(fixture()), target = new MemoryCard(fixture());
  const before = hash(source.export());
  assert.throws(() => source.copySaveTo(target, 'SAVE-A'), (e: unknown) => e instanceof CardError && e.code === 'conflict');
  assert.throws(() => source.copySaveTo(target, 'missing'), /No save/);
  assert.throws(() => source.readFile('/SAVE-A'), /No file/);
  assert.equal(hash(source.export()), before);
  assert.equal(hash(target.export()), before);
});

test('capacity preflight includes root expansion and preserves inputs on failure', () => {
  const source = new MemoryCard(fixture());
  const bytes = nearlyFull(315); // Save fits, but its new root slot needs another cluster.
  const target = new MemoryCard(bytes);
  assert.equal(target.freeBytes, 315 * 1024);
  const sourceBefore = hash(source.export());
  assert.throws(() => source.copySaveTo(target, 'SAVE-A'), (e: unknown) => e instanceof CardError && e.code === 'capacity' && /1024 more/.test(e.message));
  assert.deepEqual(target.export(), bytes);
  assert.equal(hash(source.export()), sourceBefore);
});

test('exact remaining capacity succeeds and does not allocate replacement reserve', () => {
  const source = new MemoryCard(fixture()), target = new MemoryCard(nearlyFull(316));
  const result = source.copySaveTo(target, 'SAVE-A');
  assert.equal(result.freeBytes, 0);
  assert.deepEqual(result.readFile('/SAVE-A/fragmented'), source.readFile('/SAVE-A/fragmented'));
});

test('allocator excludes bad blocks but keeps existing readable data in them', () => {
  const bytes = fixture('destination');
  const r = raw(bytes);
  const badBlock = Math.floor(r.offset / 8); // Includes the live root and some free clusters.
  set32(bytes, 208, badBlock);
  const target = new MemoryCard(bytes);
  const result = new MemoryCard(fixture()).copySaveTo(target, 'SAVE-A');
  const output = result.export();
  for (let i = 0; i < 8000; i++) {
    if (Math.floor((r.offset + i) / 8) === badBlock && !(get32(bytes, r.fatOffset(i)) & 0x80000000)) {
      assert.equal(get32(output, r.fatOffset(i)), get32(bytes, r.fatOffset(i)));
    }
  }
});

test('preserves opaque directory-entry fields while relocating a file', () => {
  const bytes = fixture(), r = raw(bytes);
  const position = r.entry('/SAVE-A/bytes-513');
  bytes[position + 2] = 0x91;
  bytes[position + 8] = 0x73; // Unused timestamp byte.
  bytes[position + 201] = 0x56; // Opaque directory-entry padding.
  const source = new MemoryCard(bytes);
  const output = source.copySaveTo(new MemoryCard(fixture('destination')), 'SAVE-A').export();
  const copiedPosition = raw(output).entry('/SAVE-A/bytes-513');
  const before = bytes.slice(position, position + 512), after = output.slice(copiedPosition, copiedPosition + 512);
  before.fill(0, 16, 20);
  after.fill(0, 16, 20); // Only the first-cluster pointer changes.
  assert.deepEqual(after, before);
});

test('appends to an unused half-cluster in the root without allocating another', () => {
  const bytes = fixture('destination'), r = raw(bytes);
  const removed = r.entry('/ALSO-KEEP');
  set32(bytes, r.fatOffset(get32(bytes, removed + 16)), 0x7fffffff);
  set32(bytes, r.cluster(0) + 4, 3);
  bytes.fill(0, removed, removed + 512);
  const destination = new MemoryCard(bytes);
  const result = new MemoryCard(fixture()).copySaveTo(destination, 'SAVE-A');
  assert.equal(destination.freeBytes - result.freeBytes, 315 * 1024);
  assert.deepEqual(result.entries.map(e => e.name), ['KEEP', 'SAVE-A']);
});

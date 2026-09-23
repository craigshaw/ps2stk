import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryCard, CardError } from '../src/core/index';
import { fixture, raw, get32, set32 } from './helpers';

function corrupt(name: string, change: (bytes: Uint8Array, r: ReturnType<typeof raw>) => void, message: RegExp): void {
  test(`rejects ${name}`, () => {
    const bytes = fixture();
    change(bytes, raw(bytes));
    assert.throws(() => new MemoryCard(bytes), (error: unknown) => error instanceof CardError && error.code === 'corrupt' && message.test(error.message));
  });
}

test('rejects truncated and oversized images before reading headers', () => {
  for (const size of [0, 511, 8388607, 8388609, 8650751, 8650753, 16777216]) {
    assert.throws(() => new MemoryCard(new Uint8Array(size)), (e: unknown) => e instanceof CardError && e.code === 'unsupported');
  }
});
test('distinguishes unsupported geometry and version from corruption', () => {
  for (const offset of [28, 40, 42, 44, 48, 336]) {
    const bytes = fixture();
    bytes[offset] = 99;
    assert.throws(() => new MemoryCard(bytes), (e: unknown) => e instanceof CardError && e.code === 'unsupported');
  }
});
corrupt('wrong signature', bytes => { bytes[0] = 0; }, /signature/);
corrupt('invalid backup block', bytes => set32(bytes, 64, 1024), /backup/);
corrupt('allocation overlap', bytes => set32(bytes, 56, 8192), /Allocation area/);
corrupt('nonzero root reference', bytes => set32(bytes, 60, 1), /root directory/);
corrupt('unfinished flash transaction', bytes => set32(bytes, get32(bytes, 68) * 8192, 5), /unfinished/);
corrupt('invalid bad-block table', bytes => set32(bytes, 208, 1024), /bad-block/);
corrupt('duplicate bad-block entries', bytes => { set32(bytes, 208, 10); set32(bytes, 212, 10); }, /bad-block/);
corrupt('out of range indirect FAT', bytes => set32(bytes, 80, 9000), /FAT structure/);
corrupt('overlapping FAT clusters', bytes => {
  const indirect = get32(bytes, 80) * 1024;
  set32(bytes, indirect + 4, get32(bytes, indirect));
}, /FAT structure/);
corrupt('zero directory length', (bytes, r) => set32(bytes, r.cluster(0) + 4, 0), /directory length/);
corrupt('oversized directory length', (bytes, r) => set32(bytes, r.cluster(0) + 4, 0xffffffff), /directory length/);
corrupt('root file type', (bytes, r) => { bytes[r.cluster(0)] = 0x17; }, /root entry/);
corrupt('missing dot entry', (bytes, r) => { bytes[r.cluster(0) + 64] = 88; }, /Missing/);
corrupt('invalid parent link', (bytes, r) => {
  const record = r.entry('/SAVE-A/NESTED');
  set32(bytes, r.cluster(get32(bytes, record + 16)) + 16, 777);
}, /parent link/);
corrupt('duplicate filenames', (bytes, r) => {
  const a = r.entry('/SAVE-A/fragmented'), b = r.entry('/SAVE-A/separator');
  bytes.set(bytes.slice(a + 64, a + 96), b + 64);
}, /Duplicate/);
corrupt('path separator in name', (bytes, r) => { bytes[r.entry('/SAVE-A/separator') + 64] = 47; }, /filename/);
corrupt('invalid entry mode', (bytes, r) => { bytes[r.entry('/SAVE-A/separator')] = 0x37; }, /entry type/);
corrupt('allocation cycle', (bytes, r) => {
  const first = get32(bytes, r.entry('/SAVE-A/fragmented') + 16);
  set32(bytes, r.fatOffset(first), 0x80000000 | first);
}, /cycle/);
corrupt('shared file allocation', (bytes, r) => {
  const first = get32(bytes, r.entry('/SAVE-A/fragmented') + 16);
  set32(bytes, r.entry('/SAVE-A/separator') + 16, first);
}, /shared/);
corrupt('out of bounds next cluster', (bytes, r) => {
  const first = get32(bytes, r.entry('/SAVE-A/fragmented') + 16);
  set32(bytes, r.fatOffset(first), 0x8000ffff);
}, /outside/);
corrupt('free cluster in a file chain', (bytes, r) => {
  const first = get32(bytes, r.entry('/SAVE-A/fragmented') + 16);
  set32(bytes, r.fatOffset(first), 0x7fffffff);
}, /free cluster/);
corrupt('incomplete file chain', (bytes, r) => {
  const first = get32(bytes, r.entry('/SAVE-A/fragmented') + 16);
  set32(bytes, r.fatOffset(first), 0xffffffff);
}, /Incomplete/);
corrupt('excess file allocation', (bytes, r) => set32(bytes, r.entry('/SAVE-A/fragmented') + 4, 1), /longer/);
corrupt('oversized recorded file length', (bytes, r) => set32(bytes, r.entry('/SAVE-A/fragmented') + 4, 0xffffffff), /too large/);
corrupt('unreferenced allocated cluster', (bytes, r) => set32(bytes, r.fatOffset(7999), 0xffffffff), /Unreferenced/);
corrupt('a cluster on an empty file', (bytes, r) => set32(bytes, r.entry('/SAVE-A/bytes-0') + 16, 7999), /longer/);

test('ECC faults are rejected on the header, FAT and second page of a live data cluster', () => {
  const data = fixture(), r = raw(data);
  const fileCluster = get32(data, r.entry('/SAVE-A/fragmented') + 16) + r.offset;
  for (const offset of [0, get32(data, 80) * 2 * 528, (fileCluster * 2 + 1) * 528 + 99, (fileCluster * 2 + 1) * 528 + 512]) {
    const bytes = fixture('source', 'ecc');
    bytes[offset]! ^= 1;
    assert.throws(() => new MemoryCard(bytes), /Card data is damaged/);
  }
});

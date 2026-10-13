import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { inspectSaveInput } from '../src/formats/archives';
import { readZip } from '../src/formats/zip';
import { preflightRar } from '../src/formats/rar';
import { crc32 } from '../src/formats/common';
import { decodeSavePackage } from '../src/formats/index';
import { CardSession } from '../src/session/session';
import { MemoryCard } from '../src/core/card';
import { fixture, set32 } from './helpers';
import { zip } from './archive-helper';
const load = (name: string) => new Uint8Array(gunzipSync(readFileSync(`tests/fixtures/${name}.gz`)));
const psu = load('flat.psu'), wasm = readFileSync('node_modules/node-unrar-js/esm/js/unrar.wasm');
const wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
const manifest = JSON.parse(readFileSync('tests/fixtures/archive-manifest.json', 'utf8'));

test('independent stored/deflated ZIP and RAR4/RAR5/solid RAR preserve package payloads, metadata and exact history', async () => {
  for (const name of ['flat-stored.zip', 'flat-deflated.zip', 'flat-stored.rar', 'flat-deflated.rar', 'flat-solid.rar']) {
    const input = load(name), before = input.slice();
    assert.equal(createHash('sha256').update(input).digest('hex'), manifest.archives[name].sha256);
    const initial = await inspectSaveInput(input, wasmBinary);
    const result = initial.kind === 'choices' ? await inspectSaveInput(input, wasmBinary, initial.paths[1]) : initial;
    assert.equal(result.kind, 'decoded'); if (result.kind !== 'decoded') throw new Error('Missing save');
    assert.equal(result.format, 'psu'); assert.ok(result.archive);
    assert.deepEqual(result.save.snapshot(), decodeSavePackage(psu).save.snapshot());
    assert.deepEqual(input, before);
    for (const layout of ['data', 'ecc'] as const) {
      const session = new CardSession(), original = fixture('destination', layout);
      session.open(0, original, 'test.ps2');
      session.importSave(0, result.save, session.state(0).card);
      const output = session.state(0).card.export();
      assert.deepEqual(session.state(0).card.readFile('/KEEP/original'), new MemoryCard(original).readFile('/KEEP/original'));
      assert.equal(session.undo(0), true); assert.deepEqual(session.state(0).card.export(), original);
      assert.equal(session.state(0).canUndo, false);
      assert.equal(session.redo(0), true); assert.deepEqual(session.state(0).card.export(), output);
    }
  }
});

test('archive detection uses bytes, returns explicit choices and reports ignored files', async () => {
  const input = zip([{ path: '資料/one.wrong', bytes: psu, descriptor: true }, { path: 'two.psv', bytes: load('flat.max') }, { path: 'readme.txt', bytes: Buffer.from('read me') }, { path: '__MACOSX/._one.psu', bytes: psu }]);
  const choices = await inspectSaveInput(input);
  assert.equal(choices.kind, 'choices'); if (choices.kind !== 'choices') throw new Error('Missing choice');
  assert.deepEqual(choices.paths, ['資料/one.wrong', 'two.psv']); assert.equal(choices.ignoredFiles, 2);
  const selected = await inspectSaveInput(input, undefined, 'two.psv');
  assert.equal(selected.kind, 'decoded'); if (selected.kind !== 'decoded') throw new Error('Missing save');
  assert.equal(selected.format, 'max'); assert.equal(selected.archive?.path, 'two.psv');
  await assert.rejects(inspectSaveInput(input, undefined, 'missing.psu'), /not in this archive/);
  for (const content of [Buffer.from('raw bytes'), zip([{ path: 'nested.psu', bytes: psu }])]) {
    await assert.rejects(inspectSaveInput(zip([{ path: 'pretend.psu', bytes: content }])), /no supported save packages/);
  }
});

test('ZIP rejects unsafe and duplicate paths, encryption, unsupported methods, split/ZIP64 and bounds', () => {
  for (const path of ['../save.psu', '/save.psu', 'C:/save.psu', 'a/./save.psu', 'a\\save.psu', 'a//save.psu', 'a\0save.psu']) assert.throws(() => readZip(zip([{ path, bytes: psu }])), /path/);
  assert.throws(() => readZip(zip([{ path: 'a', bytes: psu }, { path: 'a', bytes: psu }])), /Duplicate/);
  assert.throws(() => readZip(zip([{ path: 'a', bytes: psu, method: 99 }])), /compression/);
  assert.throws(() => readZip(zip(Array.from({ length: 257 }, (_, i) => ({ path: `${i}`, bytes: new Uint8Array() })))), /entry limit/);
  const input = zip([{ path: 'save', bytes: psu }]), central = new DataView(input.buffer).getUint32(input.length - 6, true);
  for (const mutate of [
    (b: Uint8Array) => new DataView(b.buffer).setUint16(central + 8, 1, true),
    (b: Uint8Array) => new DataView(b.buffer).setUint16(b.length - 18, 1, true),
    (b: Uint8Array) => set32(b, central + 24, 0xffffffff),
    (b: Uint8Array) => set32(b, central + 24, 16 * 1024 * 1024 + 1),
  ]) { const b = input.slice(); mutate(b); assert.throws(() => readZip(b)); }
  assert.throws(() => readZip(zip(Array.from({ length: 3 }, (_, i) => ({ path: `${i}`, bytes: new Uint8Array(12 * 1024 * 1024) })))), /total extraction limit/);
});

test('ZIP validates every member, matching headers and exact compressed streams before import', async () => {
  const input = zip([{ path: 'save', bytes: psu, method: 0 }, { path: 'readme', bytes: Buffer.from('hello'), method: 0 }]);
  for (const length of [0, 4, 21, input.length - 1]) assert.throws(() => readZip(input.slice(0, length)));
  const bad = input.slice(); bad[34 + psu.length + 36]! ^= 1;
  assert.throws(() => readZip(bad), /checksum/);
  const mismatch = input.slice(); mismatch[30] = 65; assert.throws(() => readZip(mismatch), /filename/);
  const bomb = zip([{ path: 'save', bytes: psu }]), c = new DataView(bomb.buffer).getUint32(bomb.length - 6, true);
  set32(bomb, 22, 1); set32(bomb, c + 24, 1);
  assert.throws(() => readZip(bomb), /declared size/);
  const trailing = zip([{ path: 'save', bytes: psu }]), directory = new DataView(trailing.buffer).getUint32(trailing.length - 6, true);
  const enlarged = new Uint8Array(trailing.length + 1); enlarged.set(trailing.subarray(0, directory)); enlarged.set(trailing.subarray(directory), directory + 1);
  set32(enlarged, 18, new DataView(trailing.buffer).getUint32(18, true) + 1); set32(enlarged, directory + 1 + 20, new DataView(trailing.buffer).getUint32(18, true) + 1); set32(enlarged, enlarged.length - 6, directory + 1);
  assert.throws(() => readZip(enlarged), /trailing/);
  const invalidPsv = load('flat.psv'); invalidPsv[invalidPsv.length - 1]! ^= 1;
  await assert.rejects(inspectSaveInput(zip([{ path: 'bad.psv', bytes: invalidPsv }])), /signature does not match/);
});

test('RAR rejects corruption, incomplete archives, encryption, split members and declared-size attacks', async () => {
  for (const name of ['encrypted.rar', 'headers-encrypted.rar']) await assert.rejects(inspectSaveInput(load(name), wasmBinary), /Password-protected/);
  for (const name of ['flat-stored.rar', 'flat-deflated.rar']) {
    const input = load(name);
    assert.throws(() => preflightRar(input.slice(0, input.length - 1)));
    const corrupt = input.slice(); corrupt[12]! ^= 1; assert.throws(() => preflightRar(corrupt), /checksum/);
    const data = input.slice(); data[name === 'flat-stored.rar' ? 100 : 70]! ^= 1;
    await assert.rejects(inspectSaveInput(data, wasmBinary));
  }
  const input = load('flat-stored.rar'), file = 20, size = new DataView(input.buffer).getUint16(file + 5, true);
  for (const mutation of [
    (b: Uint8Array) => { b[file + 3]! |= 1; },
    (b: Uint8Array) => set32(b, file + 11, 16 * 1024 * 1024 + 1),
    (b: Uint8Array) => set32(b, file + 11, 1),
  ]) {
    const b = input.slice(); mutation(b); new DataView(b.buffer).setUint16(file, crc32(b.subarray(file + 2, file + size)) & 0xffff, true);
    await assert.rejects(inspectSaveInput(b, wasmBinary));
  }
});

test('RAR5 rejects oversized dictionaries and newer compression before extraction', () => {
  // The independently generated file header starts at 24, with its two-byte
  // compression vint at 45. Preserve header CRC so the policy is exercised.
  for (const [compression, message] of [[10 * 1024 + 128, /dictionary/], [385, /compression version/]] as const) {
    const input = load('flat-deflated.rar');
    input[45] = (compression & 127) | 128; input[46] = compression >>> 7;
    set32(input, 24, crc32(input.subarray(28, 58)));
    assert.throws(() => preflightRar(input), message);
  }
});

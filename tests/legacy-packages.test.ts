import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync, deflateSync } from 'node:zlib';
import { createHash, createHmac, createDecipheriv } from 'node:crypto';
import { MemoryCard, SaveContent } from '../src/core/index';
import { recordView } from '../src/core/save';
import { decodeSavePackage, exportSavePackage } from '../src/formats/index';
import { decodeMax, encodeMax } from '../src/formats/max';
import { decodePsv, verifyPsv } from '../src/formats/psv';
import { cbsCrypt, inflateCbs } from '../src/formats/cbs';
import { maxCrc, MAX_DECODED_BYTES, view } from '../src/formats/common';
import { decodeLzari, encodeLzari } from '../src/formats/lzari';
import { CardSession } from '../src/session/session';
import { fixture } from './helpers';

const packed = (name: string): Uint8Array => new Uint8Array(gunzipSync(readFileSync(`tests/fixtures/${name}.gz`)));
const manifest = JSON.parse(readFileSync('tests/fixtures/legacy-manifest.json', 'utf8'));
const files = JSON.parse(readFileSync('tests/fixtures/psu-manifest.json', 'utf8')).packages.flat.files;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
for (const name of Object.keys(manifest.packages)) test(`independent ${name} imports exact contents and represented metadata in both layouts`, () => {
  const bytes = packed(name); assert.equal(hash(bytes), manifest.packages[name].sha256);
  const { save, format } = decodeSavePackage(bytes);
  assert.equal(save.name, 'PSU-FLAT'); assert.equal(save.fileCount, 4);
  assert.equal(save.entry.mode, 0x8427); assert.equal(save.entry.attributes, 0);
  for (const file of files) {
    const name = Buffer.from(file.nameHex, 'hex').toString('latin1'), entry = save.entry.children.find(c => c.name === name)!;
    assert.equal(hash(save.readFile(entry.path)), file.sha256);
    assert.equal(entry.mode, format === 'max' ? 0x8417 : file.mode);
    assert.deepEqual(entry.created, format === 'max' ? [0,0,0,0,1,1,0xd0,7] : [0,6,5,4,3,2,0xd1,7]);
    assert.equal(entry.attributes, 0);
  }
  for (const layout of ['data', 'ecc'] as const) {
    const session = new CardSession(), original = fixture('destination', layout);
    session.open(0, original, 'destination.ps2');
    const before = session.state(0).card;
    session.importSave(0, save, before); const after = session.state(0).card.export();
    assert.deepEqual(session.state(0).card.readFile('/KEEP/original'), before.readFile('/KEEP/original'));
    session.undo(0); assert.deepEqual(session.state(0).card.export(), original);
    session.redo(0); assert.deepEqual(session.state(0).card.export(), after);
  }
});

test('all package signatures reject truncation and damaged integrity without changing session state', () => {
  const session = new CardSession(); session.open(0, fixture('destination'), 'card.ps2');
  session.deleteSaves(0, ['KEEP']); session.undo(0); const before = session.state(0), bytes = before.card.export();
  for (const name of ['flat.max', 'flat.sps', 'flat.xps', 'flat.cbs', 'flat.psv']) {
    const original = packed(name);
    for (const length of [0, 1, 17, 64, 91, 123, original.length - 1]) assert.throws(() => session.importSave(0, decodeSavePackage(original.slice(0, length)).save, before.card), name);
    const damaged = original.slice(); damaged[damaged.length - 5] = damaged[damaged.length - 5]! ^ 1;
    assert.throws(() => decodeSavePackage(damaged), name);
  }
  assert.deepEqual(session.state(0), before); assert.deepEqual(session.state(0).card.export(), bytes);
});

function repairMax(bytes: Uint8Array): Uint8Array { view(bytes).setUint32(12, maxCrc(bytes), true); return bytes; }
function maxWithBody(body: Uint8Array, count: number): Uint8Array {
  const compressed = encodeLzari(body), bytes = new Uint8Array(92 + compressed.length);
  bytes.set(packed('flat.max').subarray(0, 92)); bytes.set(compressed, 92);
  const v = view(bytes); v.setUint32(80, compressed.length + 4, true); v.setUint32(84, count, true); v.setUint32(88, body.length, true);
  return repairMax(bytes);
}
test('MAX checks declared limits, compressed termination, duplicates, lengths and record padding', () => {
  for (const [at, value] of [[80,1], [84,0xffffffff], [88,MAX_DECODED_BYTES+1]]) {
    const b = packed('flat.max'); view(b).setUint32(at!, value!, true); assert.throws(() => decodeMax(repairMax(b)));
  }
  const b = packed('flat.max'), body = decodeLzari(b.subarray(92), view(b).getUint32(88, true));
  const tooLong = body.slice(); view(tooLong).setUint32(0, 0xffffffff, true); assert.throws(() => decodeMax(maxWithBody(tooLong, 4)));
  const duplicate = body.slice(); duplicate.set(duplicate.subarray(4,36),44); assert.throws(() => decodeMax(maxWithBody(duplicate, 4)), /Duplicate/);
  assert.throws(() => decodeMax(maxWithBody(body.slice(0,-1), 4)), /padding/);
  const truncated = b.slice(0, -30); view(truncated).setUint32(80, truncated.length - 88, true); assert.throws(() => decodeMax(repairMax(truncated)), /Truncated|match|arithmetic/);
  assert.throws(() => decodeMax(maxWithBody(body, 3)), /Unexpected/);
});

test('MAX export requires explicit loss acknowledgement and does not alter card history or payloads', () => {
  const session = new CardSession(); session.open(0, fixture('destination'), 'card.ps2');
  session.importSave(0, decodeSavePackage(packed('flat.psu')).save, session.state(0).card);
  const before = session.state(0), image = before.card.export();
  assert.throws(() => session.prepareSaveExport(0, 'PSU-FLAT', 'max'), /Acknowledge/);
  const output = session.prepareSaveExport(0, 'PSU-FLAT', 'max', true), decoded = decodeMax(output.bytes);
  assert.equal(output.filename, 'PSU-FLAT.max');
  for (const child of decoded.entry.children) assert.deepEqual(decoded.readFile(child.path), before.card.readFile(child.path));
  assert.deepEqual(session.state(0), before); assert.deepEqual(session.state(0).card.export(), image);
  assert.throws(() => exportSavePackage(new MemoryCard(fixture()).extractSave('SAVE-A'), 'max', true), /nested/);
  assert.equal(decodeMax(encodeMax(decodeSavePackage(packed('empty.psu')).save)).fileCount, 0);
  const root = decoded.snapshot(); root.record[64] = 0x82;
  assert.equal(decodeMax(encodeMax(new SaveContent(root))).name.charCodeAt(0), 0x82);
});

test('CBS rejects output bombs, invalid deflate, truncation, trailing streams and Adler failures', () => {
  const input = new Uint8Array(50000).fill(71), compressed = deflateSync(input);
  assert.deepEqual(inflateCbs(compressed, input.length), input);
  assert.throws(() => inflateCbs(compressed, 1), /exceeds/);
  assert.throws(() => inflateCbs(compressed, MAX_DECODED_BYTES + 1), /limit/);
  assert.throws(() => inflateCbs(compressed.subarray(0, -1), input.length));
  const bad = Buffer.from(compressed); bad[bad.length-1]! ^= 1; assert.throws(() => inflateCbs(bad, input.length), /checksum/);
  assert.throws(() => inflateCbs(Buffer.concat([compressed, compressed]), input.length));
  const cbs = packed('flat.cbs'), header = cbs.subarray(0,296);
  const body = inflateCbs(cbsCrypt(cbs.subarray(296)), view(cbs).getUint32(12,true));
  // Exact zlib output with an invalid inner record must still fail.
  view(body).setUint32(16,0xffffffff,true);
  const data = cbsCrypt(deflateSync(body)), changed = new Uint8Array(header.length+data.length); changed.set(header); changed.set(data,296);
  view(changed).setUint32(16,data.length,true); assert.throws(() => decodeSavePackage(changed), /range/);
});

// Independent Node/OpenSSL verification and signing of malformed structural test vectors.
function psvDigest(bytes: Uint8Array): Buffer {
  const input = bytes.slice(); input.fill(0,28,48);
  const seed = Buffer.alloc(64); seed.set(input.subarray(8,28));
  const cipher = createDecipheriv('aes-128-cbc', Buffer.from('ea02ceef5bb4d2998f611910d77f51c6','hex'), Buffer.from('b30ffeedb7dc5eb7133da60d1b6b2cdc','hex')); cipher.setAutoPadding(false);
  const key = Buffer.concat([cipher.update(seed), cipher.final()]).subarray(0,20);
  return createHmac('sha1',key).update(input).digest();
}
test('PSV external signature agrees with OpenSSL; bad signature, PS1, counts, overlaps and icon offsets fail', () => {
  const original = packed('flat.psv'); assert.deepEqual(original.subarray(28,48), new Uint8Array(psvDigest(original))); assert.ok(verifyPsv(original));
  for (const at of [8, 28, 64, 128, original.length-1]) { const bad = original.slice(); bad[at]! ^= 1; assert.equal(verifyPsv(bad),false); assert.throws(() => decodePsv(bad), /signature/); }
  const ps1 = original.slice(); view(ps1).setUint32(60,1,true); assert.throws(() => decodePsv(ps1), /PS1/);
  for (const mutate of [
    (b: Uint8Array) => view(b).setUint32(100,0xffffffff,true),
    (b: Uint8Array) => view(b).setUint32(120,3,true),
    (b: Uint8Array) => view(b).setUint32(276,0,true),
    (b: Uint8Array) => view(b).setUint32(336,view(b).getUint32(276,true),true),
    (b: Uint8Array) => view(b).setUint32(176,0xffffffff,true),
    (b: Uint8Array) => view(b).setUint32(68,1,true),
    (b: Uint8Array) => b.set(b.subarray(184,216),244),
  ]) { const b=original.slice(); mutate(b); b.set(psvDigest(b),28); assert.throws(() => decodePsv(b)); }
});

test('SharkPort variants accept absent/zero checksum with notice, reject bad trailer, record lengths and duplicate names', () => {
  for (const name of ['flat.sps','flat.xps']) {
    const original=packed(name);
    assert.match(decodeSavePackage(original.slice(0,-4)).save.notices.join(' '), /no populated checksum/);
    const zero=original.slice();zero.fill(0,zero.length-4); assert.match(decodeSavePackage(zero).save.notices.join(' '),/checksum/);
    assert.throws(() => decodeSavePackage(original.slice(0,-2)),/trailer/);
    let at=21; for(let i=0;i<3;i++) at+=4+view(original).getUint32(at,true); const start=at+4;
    for(const mutate of [
      (b:Uint8Array)=>view(b).setUint16(start,97,true),
      (b:Uint8Array)=>view(b).setUint32(start+66,0xffffffff,true),
      (b:Uint8Array)=>b.fill(65,start+2,start+66),
      (b:Uint8Array)=>{ const file=start+view(b).getUint16(start,true);const next=file+view(b).getUint16(file,true);b.set(b.subarray(file+2,file+66),next+2); },
    ]) {const b=zero.slice();mutate(b);assert.throws(()=>decodeSavePackage(b));}
  }
});

test('LZARI arithmetic rescaling and history wrap preserve incompressible and repetitive streams', () => {
  let state=1234;
  for(const input of [new Uint8Array(100000).fill(32), Uint8Array.from({length:100000},()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state&255;})]) {
    assert.deepEqual(decodeLzari(encodeLzari(input), input.length),input);
  }
  assert.throws(()=>decodeLzari(new Uint8Array([0]), MAX_DECODED_BYTES+1),/limit/);
  const defaults=decodeSavePackage(packed('flat.max')).save.snapshot(); assert.equal(recordView(defaults.record).getUint32(32,true),0);
});

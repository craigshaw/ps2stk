import { cbc } from '@noble/ciphers/aes.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { hmac } from '@noble/hashes/hmac.js';
import { CardError, requireValid } from '../core/errors';
import { MAX_SAVE_ENTRIES } from '../core/save';
import type { SaveContent, SaveNode } from '../core/save';
import { flatSave, metadata, nameAt, range, signature, view } from './common';
import { MAX_PACKAGE_BYTES } from './psu';
// PS2 PSV integrity scheme documented by ps3-psvresigner and PSV Save Converter.
// These public format constants provide compatibility, not proof of authorship.
const KEY = Uint8Array.from([0xea,0x02,0xce,0xef,0x5b,0xb4,0xd2,0x99,0x8f,0x61,0x19,0x10,0xd7,0x7f,0x51,0xc6]);
const IV = Uint8Array.from([0xb3,0x0f,0xfe,0xed,0xb7,0xdc,0x5e,0xb7,0x13,0x3d,0xa6,0x0d,0x1b,0x6b,0x2c,0xdc]);
export function verifyPsv(bytes: Uint8Array): boolean {
  range(bytes, 0, 64);
  const seed = new Uint8Array(64); seed.set(bytes.subarray(8, 28));
  const key = cbc(KEY, IV, { disablePadding: true }).decrypt(seed).subarray(0, 20);
  const hash = hmac.create(sha1, key).update(bytes.subarray(0, 28)).update(new Uint8Array(20)).update(bytes.subarray(48)).digest();
  let difference = 0;
  for (let i = 0; i < 20; i++) difference |= hash[i]! ^ bytes[28 + i]!;
  return difference === 0;
}
export function decodePsv(bytes: Uint8Array): SaveContent {
  requireValid(bytes.length <= MAX_PACKAGE_BYTES && signature(bytes, '\0VSP'), 'Invalid PSV package.');
  const header = view(range(bytes, 0, 64)), type = header.getUint32(60, true);
  if (type === 1) throw new CardError('unsupported', 'PS1 PSV saves cannot be imported into a PS2 memory card.');
  requireValid(type === 2 && header.getUint32(4, true) === 0 && header.getUint32(56, true) === 44, 'Unsupported PSV type or header.');
  range(bytes, 64, 96);
  requireValid(verifyPsv(bytes), 'PSV signature does not match. The package may be damaged or unsigned.');
  const v = view(bytes), count = v.getUint32(100, true), tableEnd = 160 + count * 60;
  requireValid(count + 2 <= MAX_SAVE_ENTRIES && v.getUint32(120, true) === count + 2, 'Invalid PSV file count.');
  range(bytes, 160, count * 60);
  const children: SaveNode[] = [], ranges: { start: number; end: number }[] = [];
  for (let i = 0; i < count; i++) {
    const at = 160 + i * 60, size = v.getUint32(at + 16, true), start = v.getUint32(at + 56, true);
    requireValid(start >= tableEnd, 'PSV file overlaps its header or table.');
    const data = range(bytes, start, size);
    ranges.push({ start, end: start + size });
    children.push({ kind: 'file', record: metadata(nameAt(bytes, at + 24), false, size, v.getUint32(at + 20, true), bytes.subarray(at, at + 8), bytes.subarray(at + 8, at + 16)), bytes: data });
  }
  const nonempty = ranges.filter(r => r.end > r.start).sort((a, b) => a.start - b.start);
  for (let i = 1; i < nonempty.length; i++) requireValid(nonempty[i]!.start >= nonempty[i - 1]!.end, 'Overlapping PSV file contents.');
  for (let at = 68; at <= 92; at += 8) {
    const start = v.getUint32(at, true), size = v.getUint32(at + 4, true);
    requireValid((start === 0 && size === 0) || ranges.some(r => r.start === start && r.end === start + size), 'Invalid PSV icon reference.');
  }
  return flatSave(metadata(nameAt(bytes, 128), true, count + 2, v.getUint32(124, true), bytes.subarray(104, 112), bytes.subarray(112, 120)), children);
}

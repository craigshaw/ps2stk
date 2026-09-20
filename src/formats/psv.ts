import { cbc } from '@noble/ciphers/aes.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { hmac } from '@noble/hashes/hmac.js';
import { CardError, requireValid } from '../core/errors';
import { MAX_SAVE_ENTRIES, recordName, recordView } from '../core/save';
import type { SaveContent, SaveNode } from '../core/save';
import { flatSave, metadata, nameAt, range, signature, view } from './common';
import { MAX_PACKAGE_BYTES, packageFilename } from './psu';
// PS2 PSV integrity scheme documented by ps3-psvresigner and PSV Save Converter.
// These public format constants provide compatibility, not proof of authorship.
const KEY = Uint8Array.from([0xea,0x02,0xce,0xef,0x5b,0xb4,0xd2,0x99,0x8f,0x61,0x19,0x10,0xd7,0x7f,0x51,0xc6]);
const IV = Uint8Array.from([0xb3,0x0f,0xfe,0xed,0xb7,0xdc,0x5e,0xb7,0x13,0x3d,0xa6,0x0d,0x1b,0x6b,0x2c,0xdc]);
export const PSV_LOSS_NOTICE = 'PSV preserves file contents, names, timestamps, and permission/protection flags. It does not store extended attributes, opaque card metadata, or dot-entry records. Use PSU to retain those fields.';

function psvDigest(bytes: Uint8Array): Uint8Array {
  range(bytes, 0, 64);
  const seed = new Uint8Array(64); seed.set(bytes.subarray(8, 28));
  const key = cbc(KEY, IV, { disablePadding: true }).decrypt(seed).subarray(0, 20);
  return hmac.create(sha1, key).update(bytes.subarray(0, 28)).update(new Uint8Array(20)).update(bytes.subarray(48)).digest();
}
export function verifyPsv(bytes: Uint8Array): boolean {
  const hash = psvDigest(bytes);
  let difference = 0;
  for (let i = 0; i < 20; i++) difference |= hash[i]! ^ bytes[28 + i]!;
  return difference === 0;
}

export function psvFilename(name: string): string {
  // The PS3 transfer convention keeps the first 12 name bytes and hex-encodes
  // the suffix. Sanitize only the host filename, never the internal identity.
  const suffix = Array.from(name.slice(12), c => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join('');
  return packageFilename(name.slice(0, 12) + suffix, 'psv').replace(/\.psv$/, '.PSV');
}

export function encodePsv(save: SaveContent): Uint8Array {
  const root = save.snapshot();
  if (root.children.some(child => child.kind !== 'file')) throw new CardError('unsupported', 'PSV cannot export nested directories. Use a raw folder dump or a whole-card download.');
  const tableEnd = 160 + root.children.length * 60, size = tableEnd + save.fileBytes;
  requireValid(size <= MAX_PACKAGE_BYTES, 'PSV package exceeds the 16 MiB output limit.');
  const output = new Uint8Array(size), v = view(output);
  output.set([0, 86, 83, 80]);
  // A public, fixed 20-byte seed makes output reproducible. This is an
  // integrity scheme, not a secret or a proof of authorship. No entropy needed.
  output.set(Array.from('PS2STK PSV export v1', c => c.charCodeAt(0)), 8);
  v.setUint32(56, 44, true); v.setUint32(60, 2, true);
  v.setUint32(64, save.fileBytes, true); v.setUint32(100, root.children.length, true);
  const writeMetadata = (record: Uint8Array, at: number, length: number): void => {
    output.set(record.subarray(8, 16), at);
    output.set(record.subarray(24, 32), at + 8);
    v.setUint32(at + 16, length, true);
    v.setUint32(at + 20, recordView(record).getUint16(0, true), true);
    output.set(record.subarray(64, 96), at + 24);
  };
  writeMetadata(root.record, 104, root.children.length + 2);
  const locations = new Map<string, { offset: number; size: number }>();
  let offset = tableEnd;
  for (const [i, child] of root.children.entries()) {
    if (child.kind !== 'file') continue;
    const at = 160 + i * 60;
    writeMetadata(child.record, at, child.bytes.length);
    v.setUint32(at + 56, offset, true);
    output.set(child.bytes, offset);
    locations.set(recordName(child.record), { offset, size: child.bytes.length });
    offset += child.bytes.length;
  }
  const reference = (name: string, at: number): void => {
    const file = locations.get(name);
    if (file) { v.setUint32(at, file.offset, true); v.setUint32(at + 4, file.size, true); }
  };
  reference('icon.sys', 68);
  const sys = root.children.find(child => recordName(child.record) === 'icon.sys');
  // Broken or absent icon assets do not prevent exporting the save. Only map
  // complete, named references that resolve to a file in this package.
  if (sys?.kind === 'file' && sys.bytes.length >= 452 && signature(sys.bytes, 'PS2D')) {
    for (const [index, start] of [260, 324, 388].entries()) {
      const field = sys.bytes.subarray(start, start + 64), end = field.indexOf(0);
      const name = String.fromCharCode(...field.subarray(0, end < 0 ? 64 : end));
      reference(name, 76 + index * 8);
    }
  }
  output.set(psvDigest(output), 28);
  return output;
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

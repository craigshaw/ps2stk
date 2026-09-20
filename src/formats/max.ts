import { CardError, requireValid } from '../core/errors';
import { MAX_SAVE_ENTRIES, recordName, SaveContent } from '../core/save';
import type { SaveNode } from '../core/save';
import { flatSave, maxCrc, MAX_DEFAULTS, MAX_DECODED_BYTES, metadata, nameAt, range, signature, view } from './common';
import { decodeLzari, encodeLzari } from './lzari';
import { MAX_PACKAGE_BYTES } from './psu';
const MAGIC = 'Ps2PowerSave';
const align = (offset: number) => Math.ceil((offset + 8) / 16) * 16 - 8;
export const MAX_LOSS_NOTICE = 'MAX preserves file contents and names. It does not store timestamps, permission/protection flags, extended attributes, or opaque directory metadata. Importing MAX uses standard mode flags, zero attributes, and dates of 2000-01-01.';
export function decodeMax(bytes: Uint8Array): SaveContent {
  requireValid(bytes.length <= MAX_PACKAGE_BYTES && signature(bytes, MAGIC), 'Invalid MAX package.');
  const v = view(range(bytes, 0, 92)), compressed = v.getUint32(80, true), count = v.getUint32(84, true), length = v.getUint32(88, true);
  requireValid(count + 2 <= MAX_SAVE_ENTRIES && length <= MAX_DECODED_BYTES, 'Invalid MAX size or file count.');
  requireValid(compressed === bytes.length - 88 || compressed === length, 'Invalid MAX compressed size.');
  requireValid(v.getUint32(12, true) === maxCrc(bytes), 'MAX checksum does not match.');
  const body = decodeLzari(bytes.subarray(92), length), children: SaveNode[] = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const header = range(body, offset, 36), size = view(header).getUint32(0, true);
    const record = metadata(nameAt(header, 4), false, size);
    offset += 36;
    children.push({ kind: 'file', record, bytes: range(body, offset, size) });
    offset = align(offset + size);
    requireValid(offset <= body.length, 'Truncated MAX file padding.');
  }
  requireValid(offset === body.length, 'Unexpected MAX decompressed data.');
  return flatSave(metadata(nameAt(bytes, 16), true, count + 2), children, MAX_DEFAULTS);
}
export function encodeMax(save: SaveContent): Uint8Array {
  const root = save.snapshot();
  if (root.children.some(c => c.kind !== 'file')) throw new CardError('unsupported', 'MAX cannot export nested directories. Use a raw folder dump or a whole-card download.');
  let length = 0;
  for (const child of root.children) if (child.kind === 'file') length = align(length + 36 + child.bytes.length);
  requireValid(length <= MAX_DECODED_BYTES, 'MAX decompressed size exceeds the limit.');
  const body = new Uint8Array(length), v = view(body);
  let offset = 0;
  for (const child of root.children) {
    if (child.kind !== 'file') continue;
    v.setUint32(offset, child.bytes.length, true); body.set(child.record.subarray(64, 96), offset + 4);
    body.set(child.bytes, offset + 36); offset = align(offset + 36 + child.bytes.length);
  }
  const compressed = encodeLzari(body), output = new Uint8Array(92 + compressed.length), header = view(output);
  requireValid(output.length <= MAX_PACKAGE_BYTES, 'MAX package exceeds the output limit.');
  output.set(Array.from(MAGIC, c => c.charCodeAt(0)));
  output.set(root.record.subarray(64, 96), 16);
  // A display label only; game title and icon assets remain unchanged inside the save.
  output.set(Array.from(recordName(root.record), c => c.charCodeAt(0)), 48);
  header.setUint32(80, compressed.length + 4, true); header.setUint32(84, root.children.length, true); header.setUint32(88, length, true);
  output.set(compressed, 92); header.setUint32(12, maxCrc(output), true);
  return output;
}

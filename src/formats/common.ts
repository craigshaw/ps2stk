import { requireValid } from '../core/errors';
import { makeRecord, MAX_SAVE_BYTES, MAX_SAVE_ENTRIES, recordView, SaveContent } from '../core/save';
import type { SaveNode } from '../core/save';

// At most 16,382 files plus their 64-byte decompressed container records.
export const MAX_DECODED_BYTES = MAX_SAVE_BYTES + MAX_SAVE_ENTRIES * 64;
export const LEGACY_DEFAULTS = ['extended attributes and opaque record fields = zero', 'dot entries = standard directory defaults'];
export const MAX_DEFAULTS = [...LEGACY_DEFAULTS, 'timestamps = 2000-01-01 00:00:00', 'mode flags = standard read/write defaults'];
export function view(bytes: Uint8Array): DataView { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
export function range(bytes: Uint8Array, offset: number, length: number): Uint8Array {
  requireValid(Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= bytes.length, 'Truncated or invalid save package range.');
  return bytes.subarray(offset, offset + length);
}
export function nameAt(bytes: Uint8Array, offset: number, width = 32): string {
  const field = range(bytes, offset, width), end = field.indexOf(0), length = end < 0 ? width : end;
  requireValid(length > 0 && length <= 32, 'Invalid save package filename length.');
  return String.fromCharCode(...field.subarray(0, length));
}
export function metadata(name: string, directory: boolean, length: number, mode?: number, created?: Uint8Array, modified?: Uint8Array): Uint8Array {
  const record = makeRecord(name, directory), v = recordView(record);
  v.setUint32(4, length, true);
  if (mode !== undefined) { requireValid(mode <= 0xffff, 'Unsupported save mode flags.'); v.setUint16(0, mode, true); }
  if (created) record.set(created, 8);
  if (modified) record.set(modified, 24);
  return record;
}
export function flatSave(record: Uint8Array, children: SaveNode[], defaults = LEGACY_DEFAULTS): SaveContent {
  requireValid(children.length + 2 <= MAX_SAVE_ENTRIES, 'Too many save package entries.');
  recordView(record).setUint32(4, children.length + 2, true);
  return new SaveContent({ kind: 'directory', record, dot: makeRecord('.', true), dotdot: makeRecord('..', true), children, defaultedFields: defaults });
}
export function signature(bytes: Uint8Array, magic: string): boolean {
  return bytes.length >= magic.length && [...magic].every((c, i) => bytes[i] === c.charCodeAt(0));
}
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  return c >>> 0;
});
export function maxCrc(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ (i >= 12 && i < 16 ? 0 : bytes[i]!)) & 255]!;
  return (crc ^ 0xffffffff) >>> 0;
}

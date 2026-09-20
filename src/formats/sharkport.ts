import { requireValid } from '../core/errors';
import { MAX_SAVE_ENTRIES } from '../core/save';
import type { SaveContent, SaveNode } from '../core/save';
import { flatSave, LEGACY_DEFAULTS, metadata, nameAt, range, signature, view } from './common';
import { MAX_PACKAGE_BYTES } from './psu';
export function sharkChecksum(bytes: Uint8Array): number {
  let sum = 0;
  for (const byte of bytes) sum = (sum + (byte << (sum % 24))) >>> 0;
  return sum;
}
export function decodeSharkport(bytes: Uint8Array): SaveContent {
  requireValid(bytes.length <= MAX_PACKAGE_BYTES && signature(bytes, '\x0d\0\0\0SharkPortSave'), 'Invalid SharkPort/X-Port package.');
  range(bytes, 0, 21);
  let offset = 21;
  for (let i = 0; i < 3; i++) { const size = view(range(bytes, offset, 4)).getUint32(0, true); offset += 4; range(bytes, offset, size); offset += size; }
  const bodySize = view(range(bytes, offset, 4)).getUint32(0, true); offset += 4;
  const start = offset, end = start + bodySize;
  range(bytes, start, bodySize);
  requireValid(end === bytes.length || end + 4 === bytes.length, 'Invalid SharkPort/X-Port trailer.');
  const stored = end === bytes.length ? 0 : view(bytes).getUint32(end, true);
  requireValid(stored === 0 || stored === sharkChecksum(bytes.subarray(start, end)), 'SharkPort/X-Port checksum does not match.');
  const body = bytes.subarray(0, end);
  function entry(directory: boolean): { record: Uint8Array; size: number } {
    const header = range(body, offset, 98), v = view(header), length = v.getUint16(0, true), size = v.getUint32(66, true);
    requireValid(length >= 98, 'Invalid SharkPort/X-Port record size.');
    range(body, offset, length); offset += length;
    return { record: metadata(nameAt(header, 2, 64), directory, size, v.getUint16(78, false), header.subarray(82, 90), header.subarray(90, 98)), size };
  }
  const root = entry(true), children: SaveNode[] = [];
  requireValid(root.size >= 2 && root.size <= MAX_SAVE_ENTRIES, 'Invalid SharkPort/X-Port file count.');
  for (let i = 2; i < root.size; i++) {
    const file = entry(false); children.push({ kind: 'file', record: file.record, bytes: range(body, offset, file.size) }); offset += file.size;
  }
  requireValid(offset === end, 'Unexpected SharkPort/X-Port body data.');
  const defaults = stored === 0 ? [...LEGACY_DEFAULTS, 'integrity notice: this package has no populated checksum'] : LEGACY_DEFAULTS;
  return flatSave(root.record, children, defaults);
}

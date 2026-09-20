import { CardError, requireValid } from '../core/errors';
import { MAX_SAVE_BYTES, MAX_SAVE_ENTRIES, SaveContent, recordView, recordName } from '../core/save';
import type { SaveNode } from '../core/save';

// File records plus padded data are bounded by card allocation; allow container overhead.
export const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
export function decodePsu(bytes: Uint8Array): SaveContent {
  requireValid(bytes.length <= MAX_PACKAGE_BYTES, 'Save package exceeds the 16 MiB input limit.');
  requireValid(bytes.length >= 1536, 'Truncated PSU directory records.');
  const record = bytes.slice(0, 512), dot = bytes.slice(512, 1024), dotdot = bytes.slice(1024, 1536);
  const count = recordView(record).getUint32(4, true);
  requireValid(count >= 2 && count <= MAX_SAVE_ENTRIES, 'Invalid PSU file count.');
  requireValid(recordName(dot) === '.' && recordName(dotdot) === '..', 'Invalid PSU dot entries.');
  let offset = 1536, total = 0;
  const children: SaveNode[] = [];
  for (let i = 2; i < count; i++) {
    requireValid(offset + 512 <= bytes.length, 'Truncated PSU file record.');
    const file = bytes.slice(offset, offset + 512), v = recordView(file);
    if ((v.getUint16(0, true) & 0x8030) === 0x8020) throw new CardError('unsupported', 'PSU nested directories are unsupported. Use a raw folder dump or a whole-card download.');
    requireValid((v.getUint16(0, true) & 0x8030) === 0x8010, 'Invalid PSU file type.');
    const size = v.getUint32(4, true), padded = Math.ceil(size / 1024) * 1024;
    total += size;
    requireValid(total <= MAX_SAVE_BYTES && offset + 512 + padded <= bytes.length, 'Truncated or oversized PSU file contents.');
    offset += 512;
    children.push({ kind: 'file', record: file, bytes: bytes.subarray(offset, offset + size) });
    offset += padded;
  }
  requireValid(offset === bytes.length, 'Unexpected trailing data in PSU package.');
  return new SaveContent({ kind: 'directory', record, dot, dotdot, children });
}
export function encodePsu(save: SaveContent): Uint8Array {
  const root = save.snapshot();
  if (root.children.some(child => child.kind !== 'file')) throw new CardError('unsupported', 'PSU cannot export nested directories. Use a raw folder dump or a whole-card download.');
  const size = 1536 + root.children.reduce((n, child) => n + 512 + (child.kind === 'file' ? Math.ceil(child.bytes.length / 1024) * 1024 : 0), 0);
  requireValid(size <= MAX_PACKAGE_BYTES, 'Save package exceeds the 16 MiB output limit.');
  const output = new Uint8Array(size);
  output.set(root.record); output.set(root.dot, 512); output.set(root.dotdot, 1024);
  let offset = 1536;
  for (const child of root.children) {
    if (child.kind !== 'file') continue;
    output.set(child.record, offset); offset += 512;
    output.set(child.bytes, offset); offset += Math.ceil(child.bytes.length / 1024) * 1024;
  }
  return output;
}
export function packageFilename(name: string, format: 'psu' | 'max' = 'psu'): string {
  let stem = name.replace(/[\x00-\x1f\x7f-\xff<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '');
  if (!stem || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `save_${stem}`;
  return `${stem}.${format}`;
}

import { CardError, requireValid } from './errors';
import type { CardEntry } from './card';

export const MAX_SAVE_BYTES = 8 * 1024 * 1024;
export const MAX_SAVE_ENTRIES = 16384;
export const recordView = (record: Uint8Array): DataView => new DataView(record.buffer, record.byteOffset, record.byteLength);
export function recordName(record: Uint8Array): string {
  const bytes = record.subarray(64, 96), end = bytes.indexOf(0);
  return String.fromCharCode(...bytes.subarray(0, end < 0 ? 32 : end));
}
export function makeRecord(name: string, directory: boolean): Uint8Array {
  const record = new Uint8Array(512), v = recordView(record);
  v.setUint16(0, directory ? 0x8427 : 0x8417, true);
  for (const offset of [8, 24]) record.set([0, 0, 0, 0, 1, 1, 0xd0, 7], offset); // 2000-01-01, no host clock.
  requireValid(name.length <= 32 && [...name].every(c => c.charCodeAt(0) <= 255), 'Invalid byte-oriented save name.');
  record.set(Uint8Array.from(name, c => c.charCodeAt(0)), 64);
  return record;
}
export type SaveNode = { readonly record: Uint8Array; readonly defaultedFields?: readonly string[] } & (
  { readonly kind: 'file'; readonly bytes: Uint8Array } |
  { readonly kind: 'directory'; readonly dot: Uint8Array; readonly dotdot: Uint8Array; readonly children: readonly SaveNode[] }
);
export type SaveDirectory = Extract<SaveNode, { kind: 'directory' }>;

/** Owned, bounded content, without source card allocations. Public buffers are copies. */
export class SaveContent {
  readonly #root: SaveDirectory;
  readonly #files = new Map<string, Uint8Array>();
  readonly name: string;
  readonly fileCount: number;
  readonly fileBytes: number;
  readonly allocatedBytes: number;
  readonly notices: readonly string[];
  constructor(root: SaveDirectory) {
    let entries = 0, bytes = 0, clusters = 0;
    const notices = new Set<string>();
    const copyRecord = (record: Uint8Array, directory: boolean, special?: string): Uint8Array => {
      requireValid(record instanceof Uint8Array && record.length === 512, 'Save records must contain 512 bytes.');
      const v = recordView(record);
      requireValid((v.getUint16(0, true) & 0x8030) === (directory ? 0x8020 : 0x8010), 'Invalid save entry type.');
      const name = recordName(record);
      requireValid(special ? name === special : !!name && name !== '.' && name !== '..' && !/[\x00-\x1f/]/.test(name), 'Invalid save filename.');
      // Names longer than the card engine's 32-byte identity are not truncated.
      if (!record.subarray(64, 96).includes(0) && record[96] !== 0) throw new CardError('unsupported', 'Save filenames longer than 32 bytes are unsupported.');
      const result = record.slice();
      recordView(result).setUint32(16, 0xffffffff, true);
      recordView(result).setUint32(20, 0, true);
      return result;
    };
    const visit = (node: SaveNode, parent: string, depth: number): SaveNode => {
      requireValid(++entries <= MAX_SAVE_ENTRIES && depth < 128, 'Save contains too many entries or nested directories.');
      requireValid(node?.kind === 'file' || node?.kind === 'directory', 'Invalid save node.');
      const record = copyRecord(node.record, node.kind === 'directory');
      const path = `${parent}/${recordName(record)}`;
      const defaultedFields = Object.freeze([...(node.defaultedFields ?? [])]);
      for (const field of defaultedFields) notices.add(`${path}: default ${field}.`);
      if (node.kind === 'file') {
        requireValid(node.bytes instanceof Uint8Array && recordView(record).getUint32(4, true) === node.bytes.length, `Incomplete save file: ${path}.`);
        bytes += node.bytes.length;
        clusters += Math.ceil(node.bytes.length / 1024);
        requireValid(bytes <= MAX_SAVE_BYTES && clusters <= MAX_SAVE_BYTES / 1024, 'Save exceeds the 8 MiB content limit.');
        const data = node.bytes.slice();
        this.#files.set(path, data);
        return { kind: 'file', record, bytes: data, defaultedFields };
      }
      requireValid(Array.isArray(node.children) && node.children.length <= MAX_SAVE_ENTRIES - 2, 'Invalid save directory count.');
      requireValid(recordView(record).getUint32(4, true) === node.children.length + 2, 'Save directory count does not match its contents.');
      clusters += Math.ceil((node.children.length + 2) / 2);
      requireValid(clusters <= MAX_SAVE_BYTES / 1024, 'Save allocation exceeds the 8 MiB limit.');
      const names = new Set<string>();
      const children = node.children.map(child => {
        const result = visit(child, path, depth + 1), name = recordName(result.record);
        requireValid(!names.has(name), `Duplicate save filename: ${name}.`);
        names.add(name);
        return result;
      });
      return { kind: 'directory', record, children, defaultedFields,
        dot: copyRecord(node.dot, true, '.'), dotdot: copyRecord(node.dotdot, true, '..') };
    };
    requireValid(root?.kind === 'directory', 'A save must be a directory.');
    this.#root = visit(root, '', 0) as SaveDirectory;
    this.name = recordName(this.#root.record);
    this.fileCount = this.#files.size;
    this.fileBytes = bytes;
    this.allocatedBytes = clusters * 1024;
    this.notices = Object.freeze([...notices]);
    Object.freeze(this);
  }
  snapshot(): SaveDirectory {
    const clone = (node: SaveNode): SaveNode => node.kind === 'file'
      ? { ...node, record: node.record.slice(), bytes: node.bytes.slice() }
      : { ...node, record: node.record.slice(), dot: node.dot.slice(), dotdot: node.dotdot.slice(), children: node.children.map(clone) };
    return clone(this.#root) as SaveDirectory;
  }
  readFile(path: string): Uint8Array {
    const bytes = this.#files.get(path);
    if (!bytes) throw new CardError('not-found', `No save file at ${path}.`);
    return bytes.slice();
  }
  get entry(): CardEntry {
    const entry = (node: SaveNode, parent: string): CardEntry => {
      const name = recordName(node.record), path = `${parent}/${name}`, v = recordView(node.record);
      return { name, path, kind: node.kind, length: v.getUint32(4, true), mode: v.getUint16(0, true),
        attributes: v.getUint32(32, true), created: Array.from(node.record.subarray(8, 16)), modified: Array.from(node.record.subarray(24, 32)),
        children: node.kind === 'directory' ? node.children.map(child => entry(child, path)) : [] };
    };
    return entry(this.#root, '');
  }
}

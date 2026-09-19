import { CardError, requireValid } from './errors';
import { CardImage, CLUSTER_SIZE } from './image';
import type { CardLayout } from './image';

const END = 0xffffffff;
const ALLOCATED = 0x80000000;
const EXISTS = 0x8000;
const FILE = 0x10;
const DIRECTORY = 0x20;
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const u32 = (bytes: Uint8Array, offset: number) => view(bytes).getUint32(offset, true);
const put32 = (bytes: Uint8Array, offset: number, value: number) => view(bytes).setUint32(offset, value, true);

export interface CardEntry {
  /** Lossless byte string: each character represents one filename byte. */
  readonly name: string;
  readonly path: string;
  readonly kind: 'file' | 'directory';
  /** File bytes, or directory entry count including deleted slots and dot entries. */
  readonly length: number;
  readonly mode: number;
  readonly attributes: number;
  readonly created: readonly number[];
  readonly modified: readonly number[];
  readonly children: readonly CardEntry[];
}

interface Node {
  name: string;
  path: string;
  record: Uint8Array;
  index: number;
  chain: number[];
  children: Node[];
}

function nameOf(record: Uint8Array): string {
  const bytes = record.subarray(64, 96);
  const end = bytes.indexOf(0);
  return String.fromCharCode(...bytes.subarray(0, end < 0 ? 32 : end));
}
function isDirectory(node: Node): boolean { return (view(node.record).getUint16(0, true) & DIRECTORY) !== 0; }
function lengthOf(node: Node): number { return u32(node.record, 4); }
function publicEntry(node: Node): CardEntry {
  return Object.freeze({
    name: node.name, path: node.path, kind: isDirectory(node) ? 'directory' : 'file',
    length: lengthOf(node), mode: view(node.record).getUint16(0, true), attributes: u32(node.record, 32),
    created: Object.freeze(Array.from(node.record.subarray(8, 16))),
    modified: Object.freeze(Array.from(node.record.subarray(24, 32))),
    children: Object.freeze(node.children.map(publicEntry)),
  });
}

/** Validated, immutable memory card. Mutations return a new card. No browser APIs. */
export class MemoryCard {
  readonly #image: CardImage;
  readonly #offset: number;
  readonly #limit: number;
  readonly #fat: number[] = [];
  readonly #fatClusters: number[] = [];
  readonly #badBlocks = new Set<number>();
  readonly #root: Node;
  readonly #paths = new Map<string, Node>();
  readonly #free: number[] = [];

  constructor(bytes: Uint8Array) {
    this.#image = new CardImage(bytes);
    const sb = this.#image.page(0);
    requireValid(String.fromCharCode(...sb.subarray(0, 28)) === 'Sony PS2 Memory Card Format ', 'Invalid PS2 memory card signature.');
    const version = String.fromCharCode(...sb.subarray(28, 40)).split('\0')[0]!;
    if (!/^1\.[012]\.0\.0$/.test(version)) throw new CardError('unsupported', `Unsupported card format version: ${version}.`);
    const header = view(sb);
    if (header.getUint16(40, true) !== 512 || header.getUint16(42, true) !== 2 ||
        header.getUint16(44, true) !== 16 || u32(sb, 48) !== 8192 || sb[336] !== 2) {
      throw new CardError('unsupported', 'Only standard 8 MiB PS2 geometry is supported (512-byte pages, 2 pages per cluster, 16 pages per block).');
    }
    this.#offset = u32(sb, 52);
    this.#limit = u32(sb, 56);
    const backup1 = u32(sb, 64), backup2 = u32(sb, 68);
    requireValid(backup1 < 1024 && backup2 < 1024 && backup1 !== backup2, 'Invalid backup block references.');
    requireValid(this.#offset > 0 && this.#limit > 0 && this.#offset + this.#limit <= Math.min(backup1, backup2) * 8,
      'Allocation area overlaps reserved backup blocks or lies outside the card.');
    requireValid(u32(sb, 60) === 0, 'The root directory must use allocation cluster zero.');
    // A non-erased first word records a flash transaction that needs recovery.
    requireValid(u32(this.#image.page(backup2 * 16), 0) === END, 'The card has an unfinished flash transaction. Recovery is not supported.');
    for (let i = 0; i < 32; i++) {
      const block = u32(sb, 208 + i * 4);
      if (block === END) continue;
      requireValid(block < 1024 && block !== backup1 && block !== backup2 && !this.#badBlocks.has(block), 'Invalid bad-block table.');
      this.#badBlocks.add(block);
    }

    const structures = new Set<number>([0]);
    const readStructure = (cluster: number): Uint8Array => {
      requireValid(cluster > 0 && cluster < this.#offset && !structures.has(cluster), `Invalid or overlapping FAT structure at cluster ${cluster}.`);
      structures.add(cluster);
      return this.#image.cluster(cluster);
    };
    const count = Math.ceil(this.#limit / 256);
    // An 8 MiB card needs at most 32 FAT clusters, so exactly one indirect cluster.
    const indirect = readStructure(u32(sb, 80));
    for (let i = 0; i < count; i++) {
      const physical = u32(indirect, i * 4);
      this.#fatClusters.push(physical);
      const fat = readStructure(physical);
      for (let j = 0; j < 256 && this.#fat.length < this.#limit; j++) this.#fat.push(u32(fat, j * 4));
    }

    const owned = new Set<number>();
    const chain = (first: number, size: number, label: string): number[] => {
      requireValid(size <= this.#limit * CLUSTER_SIZE, `Declared length is too large: ${label}.`);
      const expected = Math.ceil(size / CLUSTER_SIZE);
      const result: number[] = [];
      let current = first;
      while (current !== END) {
        requireValid(current < this.#limit, `Allocation reference outside the card: ${label}.`);
        requireValid(!owned.has(current), `Allocation cycle or shared cluster: ${label}.`);
        requireValid(result.length < expected, `Allocation chain is longer than the recorded length: ${label}.`);
        owned.add(current);
        result.push(current);
        const next = this.#fat[current]!;
        requireValid((next & ALLOCATED) !== 0, `File uses a free cluster: ${label}.`);
        this.#image.cluster(this.#offset + current); // Validate ECC for all live data, including tail pages.
        current = next === END ? END : next & 0x7fffffff;
      }
      requireValid(result.length === expected, `Incomplete allocation chain: ${label}.`);
      return result;
    };
    const rootRecord = this.#image.cluster(this.#offset).slice(0, 512);
    this.#root = { name: '', path: '', record: rootRecord, index: 0, chain: [], children: [] };
    requireValid(isDirectory(this.#root), 'The root entry must be a directory.');
    const parse = (node: Node, parent: Node | undefined, depth: number): void => {
      if (depth > 128) throw new CardError('unsupported', 'Directory nesting exceeds the supported limit of 128.');
      const mode = view(node.record).getUint16(0, true);
      requireValid((mode & EXISTS) !== 0 && ((mode & (FILE | DIRECTORY)) === FILE || (mode & (FILE | DIRECTORY)) === DIRECTORY), `Invalid entry type: ${node.path || '/'}.`);
      const directory = isDirectory(node);
      const length = lengthOf(node);
      requireValid(!directory || (length >= 2 && length <= this.#limit * 2), `Invalid directory length: ${node.path || '/'}.`);
      node.chain = chain(parent ? u32(node.record, 16) : 0, directory ? length * 512 : length, node.path || '/');
      this.#paths.set(node.path, node);
      if (!directory) return;
      const records = this.#readNode(node);
      const dot = records.subarray(0, 512), dotdot = records.subarray(512, 1024);
      for (const [entry, name] of [[dot, '.'], [dotdot, '..']] as const) {
        requireValid(nameOf(entry) === name && (view(entry).getUint16(0, true) & (EXISTS | DIRECTORY | FILE)) === (EXISTS | DIRECTORY), `Missing ${name} directory entry: ${node.path || '/'}.`);
      }
      requireValid(u32(dot, 16) === (parent?.chain[0] ?? 0) && u32(dot, 20) === node.index, `Invalid parent link: ${node.path || '/'}.`);
      const names = new Set<string>();
      for (let i = 2; i < length; i++) {
        const record = records.slice(i * 512, (i + 1) * 512);
        if (!(view(record).getUint16(0, true) & EXISTS)) continue;
        const name = nameOf(record);
        requireValid(name.length > 0 && name !== '.' && name !== '..' && !/[\x00-\x1f/]/.test(name), `Invalid filename in ${node.path || '/'}.`);
        requireValid(!names.has(name), `Duplicate filename in ${node.path || '/'}.`);
        names.add(name);
        const child: Node = { name, path: `${node.path}/${name}`, record, index: i, chain: [], children: [] };
        node.children.push(child);
        parse(child, node, depth + 1);
      }
    };
    parse(this.#root, undefined, 0);

    // Match the PS2 driver's rounded capacity. Bad blocks do not consume this quota.
    const quota = Math.floor(this.#limit / 1000) * 1000;
    let goodCount = 0;
    for (let i = 0; i < this.#limit; i++) {
      const bad = this.#badBlocks.has(Math.floor((this.#offset + i) / 8));
      const allocated = (this.#fat[i]! & ALLOCATED) !== 0;
      requireValid(!allocated || owned.has(i) || (bad && this.#fat[i] === END), `Unreferenced allocated cluster ${i}.`);
      if (!bad && ++goodCount <= quota && !allocated) this.#free.push(i);
    }
  }

  get layout(): CardLayout { return this.#image.layout; }
  get entries(): readonly CardEntry[] { return Object.freeze(this.#root.children.map(publicEntry)); }
  get freeBytes(): number { return this.#free.length * CLUSTER_SIZE; }
  export(): Uint8Array { return this.#image.export(); }

  #readNode(node: Node): Uint8Array {
    const size = isDirectory(node) ? lengthOf(node) * 512 : lengthOf(node);
    const result = new Uint8Array(size);
    for (let i = 0; i < node.chain.length; i++) {
      const part = this.#image.cluster(this.#offset + node.chain[i]!);
      result.set(part.subarray(0, Math.min(CLUSTER_SIZE, size - i * CLUSTER_SIZE)), i * CLUSTER_SIZE);
    }
    return result;
  }

  readFile(path: string): Uint8Array {
    const node = this.#paths.get(path.startsWith('/') ? path : `/${path}`);
    if (!node || isDirectory(node)) throw new CardError('not-found', `No file at ${path}.`);
    return this.#readNode(node);
  }

  /** One whole top-level save, with no replacement. The two input cards stay unchanged. */
  copySaveTo(destination: MemoryCard, name: string): MemoryCard {
    const save = this.#root.children.find(node => node.name === name && isDirectory(node));
    if (!save) throw new CardError('not-found', `No save named ${name}.`);
    if (destination.#root.children.some(node => node.name === name)) throw new CardError('conflict', `The destination already contains ${name}.`);
    const root = destination.#root;
    const rootData = destination.#readNode(root);
    let slot = lengthOf(root);
    for (let i = 2; i < lengthOf(root); i++) {
      if (!(view(rootData).getUint16(i * 512, true) & EXISTS)) { slot = i; break; }
    }
    const growRoot = slot === lengthOf(root) && slot % 2 === 0;
    const nodes: Node[] = [];
    const collect = (node: Node) => { nodes.push(node); node.children.forEach(collect); };
    collect(save);
    const needed = nodes.reduce((sum, node) => sum + node.chain.length, growRoot ? 1 : 0);
    if (needed > destination.#free.length) {
      throw new CardError('capacity', `Copy needs ${needed * CLUSTER_SIZE} bytes including directories; ${destination.freeBytes} bytes are available. Need ${(needed - destination.#free.length) * CLUSTER_SIZE} more bytes.`);
    }

    const candidate = new CardImage(destination.export());
    let cursor = 0;
    const chains = new Map<Node, number[]>();
    for (const node of nodes) chains.set(node, node.chain.map(() => destination.#free[cursor++]!));
    const fatChanges = new Map<number, Uint8Array>();
    const setFat = (logical: number, value: number): void => {
      const physical = destination.#fatClusters[Math.floor(logical / 256)]!;
      let bytes = fatChanges.get(physical);
      if (!bytes) { bytes = candidate.cluster(physical); fatChanges.set(physical, bytes); }
      put32(bytes, (logical % 256) * 4, value);
    };
    for (const [node, newChain] of chains) {
      for (let i = 0; i < newChain.length; i++) {
        candidate.writeCluster(destination.#offset + newChain[i]!, this.#image.cluster(this.#offset + node.chain[i]!));
        setFat(newChain[i]!, i + 1 === newChain.length ? END : (newChain[i + 1]! | ALLOCATED) >>> 0);
      }
    }
    const rootChain = root.chain.slice();
    if (growRoot) {
      const extra = destination.#free[cursor++]!;
      setFat(rootChain.at(-1)!, (extra | ALLOCATED) >>> 0);
      setFat(extra, END);
      candidate.writeCluster(destination.#offset + extra, new Uint8Array(CLUSTER_SIZE));
      rootChain.push(extra);
    }
    const writeEntry = (targetChain: number[], index: number, record: Uint8Array) => {
      const physical = destination.#offset + targetChain[Math.floor(index / 2)]!;
      const bytes = candidate.cluster(physical);
      bytes.set(record, (index % 2) * 512);
      candidate.writeCluster(physical, bytes);
    };
    const copyEntries = (node: Node, parentChain: number[], index: number): void => {
      const newChain = chains.get(node)!;
      const record = node.record.slice();
      put32(record, 16, newChain[0] ?? END);
      writeEntry(parentChain, index, record);
      if (isDirectory(node)) {
        const dot = this.#readNode(node).slice(0, 512);
        put32(dot, 16, parentChain[0]!);
        put32(dot, 20, index);
        writeEntry(newChain, 0, dot);
        for (const child of node.children) copyEntries(child, newChain, child.index);
      }
    };
    copyEntries(save, rootChain, slot);
    if (slot === lengthOf(root)) {
      const dot = root.record.slice();
      put32(dot, 4, slot + 1);
      writeEntry(rootChain, 0, dot);
    }
    for (const [physical, bytes] of fatChanges) candidate.writeCluster(physical, bytes);
    return new MemoryCard(candidate.export());
  }
}

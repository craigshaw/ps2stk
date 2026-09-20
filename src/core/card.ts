import { CardError, requireValid } from './errors';
import { SaveContent, recordName } from './save';
import type { SaveNode, SaveDirectory } from './save';
import { CardWriter } from './writer';
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

export interface SaveSelection {
  readonly name: string;
  readonly onConflict?: 'skip' | 'replace' | 'error';
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
  readonly #eligible = new Set<number>();

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
      if (!bad && ++goodCount <= quota) {
        this.#eligible.add(i);
        if (!allocated) this.#free.push(i);
      }
    }
  }

  get layout(): CardLayout { return this.#image.layout; }
  get entries(): readonly CardEntry[] { return Object.freeze(this.#root.children.map(publicEntry)); }
  get freeBytes(): number { return this.#free.length * CLUSTER_SIZE; }
  get byteLength(): number { return this.layout === 'data' ? 8388608 : 8650752; }
  export(layout: CardLayout = this.layout): Uint8Array { return this.#image.export(layout); }
  withLayout(layout: CardLayout): MemoryCard {
    return layout === this.layout ? this : new MemoryCard(this.export(layout));
  }

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

  #save(name: string): Node {
    const node = this.#root.children.find(child => child.name === name && isDirectory(child));
    if (!node) throw new CardError('not-found', `No save named ${name}.`);
    return node;
  }

  #subtree(node: Node): Node[] { return [node, ...node.children.flatMap(child => this.#subtree(child))]; }
  #writer(): CardWriter { return new CardWriter(this.export(), this.#offset, this.#fatClusters); }

  #unique(names: readonly string[]): void {
    if (new Set(names).size !== names.length) throw new CardError('invalid-operation', 'Select each save only once.');
  }

  #capacity(needed: number, available: number): void {
    if (needed > available) throw new CardError('capacity',
      `Operation needs ${needed * CLUSTER_SIZE} bytes including directories; ${available * CLUSTER_SIZE} bytes are available. Need ${(needed - available) * CLUSTER_SIZE} more bytes.`);
  }

  #remove(writer: CardWriter, node: Node): void {
    for (const child of this.#subtree(node)) writer.free(child.chain);
    const record = node.record.slice();
    view(record).setUint16(0, view(record).getUint16(0, true) & ~EXISTS, true);
    writer.entry(this.#root.chain, node.index, record);
  }

  /** Delete complete top-level saves as one atomic operation. */
  deleteSaves(names: readonly string[]): MemoryCard {
    this.#unique(names);
    const nodes = names.map(name => this.#save(name));
    if (!nodes.length) return this;
    const writer = this.#writer();
    nodes.forEach(node => this.#remove(writer, node));
    return new MemoryCard(writer.export());
  }

  /** Retain the destination name and metadata, including timestamps and mode flags. */
  replaceFile(path: string, bytes: Uint8Array): MemoryCard {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const node = this.#paths.get(normalized);
    if (!node || isDirectory(node)) throw new CardError('not-found', `No file at ${path}.`);
    const needed = Math.ceil(bytes.length / CLUSTER_SIZE);
    // Existing allocations can be retained, including readable clusters in a bad block.
    this.#capacity(needed, node.chain.length + this.#free.length);
    if (lengthOf(node) === bytes.length && this.#readNode(node).every((b, i) => b === bytes[i])) return this;
    const chain = node.chain.slice(0, needed);
    chain.push(...this.#free.slice(0, Math.max(0, needed - chain.length)));
    const parent = this.#paths.get(normalized.slice(0, normalized.lastIndexOf('/')))!;
    const writer = this.#writer();
    writer.free(node.chain.slice(needed));
    writer.file(chain, bytes);
    const record = node.record.slice();
    put32(record, 4, bytes.length);
    put32(record, 16, chain[0] ?? END);
    writer.entry(parent.chain, node.index, record);
    return new MemoryCard(writer.export());
  }

  extractSave(name: string): SaveContent {
    const extract = (node: Node): SaveNode => {
      const record = node.record.slice();
      if (!isDirectory(node)) return { kind: 'file', record, bytes: this.#readNode(node) };
      put32(record, 4, node.children.length + 2);
      const data = this.#readNode(node);
      return { kind: 'directory', record, dot: data.slice(0, 512), dotdot: data.slice(512, 1024), children: node.children.map(extract) };
    };
    return new SaveContent(extract(this.#save(name)) as SaveDirectory);
  }

  #importPlan(content: SaveContent, conflict: 'skip' | 'replace' | 'error') {
    if (!['skip', 'replace', 'error'].includes(conflict)) throw new CardError('invalid-operation', 'Invalid conflict choice.');
    const existing = this.#root.children.find(node => node.name === content.name);
    if (existing && conflict === 'skip') return { existing, skip: true, needed: 0, available: this.#free, slot: 0, rootLength: 0 };
    if (existing && (conflict === 'error' || !isDirectory(existing))) throw new CardError('conflict', `The destination already contains ${content.name}.`);
    const occupied = new Set(this.#root.children.filter(node => node !== existing).map(node => node.index));
    let slot = 2;
    while (occupied.has(slot)) slot++;
    const rootLength = Math.max(lengthOf(this.#root), slot + 1);
    const rootGrowth = Math.ceil(rootLength / 2) - this.#root.chain.length;
    const freed = existing ? this.#subtree(existing).flatMap(node => node.chain).filter(c => this.#eligible.has(c)) : [];
    return { existing, skip: false, needed: content.allocatedBytes / CLUSTER_SIZE + rootGrowth,
      available: [...this.#free, ...freed].sort((a, b) => a - b), slot, rootLength };
  }

  planImport(save: SaveContent, conflict: 'skip' | 'replace' | 'error' = 'skip') {
    const content = new SaveContent(save.snapshot());
    const plan = this.#importPlan(content, conflict);
    return Object.freeze({ conflict: !!plan.existing, skipped: plan.skip, requiredBytes: plan.needed * CLUSTER_SIZE,
      availableBytes: plan.available.length * CLUSTER_SIZE,
      shortageBytes: Math.max(0, plan.needed - plan.available.length) * CLUSTER_SIZE });
  }

  /** Validate externally supplied content again, then commit a complete candidate. */
  importSave(save: SaveContent, conflict: 'skip' | 'replace' | 'error' = 'skip'): MemoryCard {
    const content = new SaveContent(save.snapshot());
    const plan = this.#importPlan(content, conflict);
    if (plan.skip) return this;
    this.#capacity(plan.needed, plan.available.length);
    const writer = this.#writer();
    if (plan.existing) this.#remove(writer, plan.existing);
    let cursor = 0;
    const allocate = (count: number): number[] => {
      const chain = plan.available.slice(cursor, cursor + count);
      cursor += count;
      for (const cluster of chain) writer.cluster(cluster, new Uint8Array(CLUSTER_SIZE));
      writer.link(chain);
      return chain;
    };
    const rootChain = this.#root.chain.slice();
    rootChain.push(...allocate(Math.ceil(plan.rootLength / 2) - rootChain.length));
    writer.link(rootChain);
    const write = (node: SaveNode, parent: number[], index: number): void => {
      const length = node.kind === 'file' ? node.bytes.length : (node.children.length + 2) * 512;
      const chain = allocate(Math.ceil(length / CLUSTER_SIZE));
      const record = node.record.slice();
      put32(record, 16, chain[0] ?? END);
      writer.entry(parent, index, record);
      if (node.kind === 'file') writer.file(chain, node.bytes);
      else {
        const dot = node.dot.slice(), dotdot = node.dotdot.slice();
        put32(dot, 16, parent[0]!); put32(dot, 20, index);
        // Dot entries retain metadata, but never package/source allocation links.
        put32(dotdot, 16, 0); put32(dotdot, 20, 0);
        writer.entry(chain, 0, dot); writer.entry(chain, 1, dotdot);
        node.children.forEach((child, i) => write(child, chain, i + 2));
      }
    };
    const root = content.snapshot();
    requireValid(recordName(root.record) === content.name, 'Save identity changed during import.');
    write(root, rootChain, plan.slot);
    if (plan.rootLength !== lengthOf(this.#root)) {
      const record = this.#root.record.slice(); put32(record, 4, plan.rootLength);
      writer.entry(rootChain, 0, record);
    }
    return new MemoryCard(writer.export());
  }

  /** Compatibility wrapper: single-save copying still reports name conflicts. */
  copySaveTo(destination: MemoryCard, name: string): MemoryCard {
    return this.copySavesTo(destination, [{ name, onConflict: 'error' }]);
  }

  /** Resolve all choices and capacity before writing a candidate. Skip is the default. */
  copySavesTo(destination: MemoryCard, selections: readonly SaveSelection[]): MemoryCard {
    this.#unique(selections.map(selection => selection.name));
    const selected: { node: Node; removed: Node | undefined; slot: number; nodes: Node[] }[] = [];
    for (const selection of selections) {
      const node = this.#save(selection.name);
      const conflict = selection.onConflict ?? 'skip';
      if (!['skip', 'replace', 'error'].includes(conflict)) throw new CardError('invalid-operation', 'Invalid conflict choice.');
      const existing = destination.#root.children.find(child => child.name === node.name);
      if (existing) {
        if (conflict === 'skip') continue;
        if (conflict === 'error') throw new CardError('conflict', `The destination already contains ${node.name}.`);
        if (!isDirectory(existing)) throw new CardError('conflict', `Cannot replace a root file with save ${node.name}.`);
        if (destination === this) continue;
      }
      selected.push({ node, removed: existing, slot: -1, nodes: this.#subtree(node) });
    }
    if (!selected.length) return destination;

    const removed = new Set(selected.flatMap(item => item.removed ? [item.removed] : []));
    const occupied = new Set(destination.#root.children.filter(node => !removed.has(node)).map(node => node.index));
    let rootLength = lengthOf(destination.#root);
    let nextSlot = 2;
    for (const item of selected) {
      while (occupied.has(nextSlot)) nextSlot++;
      item.slot = nextSlot;
      occupied.add(nextSlot);
      rootLength = Math.max(rootLength, nextSlot + 1);
    }
    const rootGrowth = Math.ceil(rootLength / 2) - destination.#root.chain.length;
    const needed = rootGrowth + selected.reduce((sum, item) => sum + item.nodes.reduce((count, node) => count + node.chain.length, 0), 0);
    const freed = [...removed].flatMap(node => destination.#subtree(node).flatMap(child => child.chain));
    const available = [...destination.#free, ...freed.filter(cluster => destination.#eligible.has(cluster))].sort((a, b) => a - b);
    destination.#capacity(needed, available.length);

    // No caller-visible data changes until the complete candidate validates.
    const writer = destination.#writer();
    removed.forEach(node => destination.#remove(writer, node));
    let cursor = 0;
    const chains = new Map<Node, number[]>();
    for (const item of selected) for (const node of item.nodes) {
      const chain = node.chain.map(() => available[cursor++]!);
      chains.set(node, chain);
      chain.forEach((cluster, i) => writer.cluster(cluster, this.#image.cluster(this.#offset + node.chain[i]!)));
      writer.link(chain);
    }
    const rootChain = destination.#root.chain.slice();
    for (let i = 0; i < rootGrowth; i++) {
      const cluster = available[cursor++]!;
      writer.cluster(cluster, new Uint8Array(CLUSTER_SIZE));
      rootChain.push(cluster);
    }
    if (rootGrowth) writer.link(rootChain);
    const copyEntry = (node: Node, parentChain: number[], index: number): void => {
      const chain = chains.get(node)!;
      const record = node.record.slice();
      put32(record, 16, chain[0] ?? END);
      writer.entry(parentChain, index, record);
      if (isDirectory(node)) {
        const dot = this.#readNode(node).slice(0, 512);
        put32(dot, 16, parentChain[0]!);
        put32(dot, 20, index);
        writer.entry(chain, 0, dot);
        node.children.forEach(child => copyEntry(child, chain, child.index));
      }
    };
    selected.forEach(item => copyEntry(item.node, rootChain, item.slot));
    if (rootLength !== lengthOf(destination.#root)) {
      const record = destination.#root.record.slice();
      put32(record, 4, rootLength);
      writer.entry(rootChain, 0, record);
    }
    return new MemoryCard(writer.export());
  }
}

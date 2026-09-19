import { CardImage, CLUSTER_SIZE } from './image';

/** Private candidate writes, used only after an operation's complete preflight. */
export class CardWriter {
  readonly #image: CardImage;
  readonly #offset: number;
  readonly #fatClusters: readonly number[];
  readonly #fatChanges = new Map<number, Uint8Array>();

  constructor(bytes: Uint8Array, offset: number, fatClusters: readonly number[]) {
    this.#image = new CardImage(bytes);
    this.#offset = offset;
    this.#fatClusters = fatClusters;
  }

  fat(logical: number, value: number): void {
    const physical = this.#fatClusters[Math.floor(logical / 256)]!;
    let bytes = this.#fatChanges.get(physical);
    if (!bytes) { bytes = this.#image.cluster(physical); this.#fatChanges.set(physical, bytes); }
    new DataView(bytes.buffer).setUint32((logical % 256) * 4, value, true);
  }

  link(chain: readonly number[]): void {
    chain.forEach((cluster, i) => this.fat(cluster, i + 1 === chain.length ? 0xffffffff : (chain[i + 1]! | 0x80000000) >>> 0));
  }

  free(chain: readonly number[]): void { chain.forEach(cluster => this.fat(cluster, 0x7fffffff)); }
  cluster(logical: number, bytes: Uint8Array): void { this.#image.writeCluster(this.#offset + logical, bytes); }

  entry(chain: readonly number[], index: number, record: Uint8Array): void {
    const physical = this.#offset + chain[Math.floor(index / 2)]!;
    const bytes = this.#image.cluster(physical);
    bytes.set(record, (index % 2) * 512);
    this.#image.writeCluster(physical, bytes);
  }

  file(chain: readonly number[], bytes: Uint8Array): void {
    chain.forEach((cluster, i) => {
      const part = new Uint8Array(CLUSTER_SIZE);
      part.set(bytes.subarray(i * CLUSTER_SIZE, (i + 1) * CLUSTER_SIZE));
      this.cluster(cluster, part);
    });
    this.link(chain);
  }

  export(): Uint8Array {
    for (const [physical, bytes] of this.#fatChanges) this.#image.writeCluster(physical, bytes);
    return this.#image.export();
  }
}

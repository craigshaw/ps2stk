import { CardError, requireValid } from './errors';
import { pageEcc } from './ecc';

export type CardLayout = 'data' | 'ecc';
export const PAGE_SIZE = 512;
export const CLUSTER_SIZE = 1024;
export const PAGE_COUNT = 16384;
export const CLUSTER_COUNT = 8192;

/** Physical image access. All returned buffers are detached copies. */
export class CardImage {
  readonly layout: CardLayout;
  readonly #bytes: Uint8Array;
  readonly #checked = new Set<number>();
  readonly #stride: number;

  constructor(bytes: Uint8Array) {
    if (bytes.length !== PAGE_COUNT * 512 && bytes.length !== PAGE_COUNT * 528) {
      throw new CardError('unsupported', 'Expected a complete 8 MiB card: 8388608 data bytes or 8650752 bytes with ECC.');
    }
    this.layout = bytes.length === PAGE_COUNT * 512 ? 'data' : 'ecc';
    this.#stride = this.layout === 'data' ? 512 : 528;
    this.#bytes = Uint8Array.from(bytes);
  }

  page(page: number): Uint8Array {
    requireValid(Number.isInteger(page) && page >= 0 && page < PAGE_COUNT, `Page ${page} is outside the card.`);
    const offset = page * this.#stride;
    const data = this.#bytes.slice(offset, offset + 512);
    if (this.layout === 'ecc' && !this.#checked.has(page)) {
      const spare = this.#bytes.subarray(offset + 512, offset + 528);
      const erased = data.every(b => b === 255) && spare.every(b => b === 255);
      requireValid(erased || pageEcc(data).every((b, i) => b === spare[i]), `ECC mismatch on page ${page}. Repair is not supported.`);
      this.#checked.add(page);
    }
    return data;
  }

  cluster(cluster: number): Uint8Array {
    const bytes = new Uint8Array(CLUSTER_SIZE);
    bytes.set(this.page(cluster * 2));
    bytes.set(this.page(cluster * 2 + 1), 512);
    return bytes;
  }

  writeCluster(cluster: number, bytes: Uint8Array): void {
    requireValid(bytes.length === CLUSTER_SIZE && Number.isInteger(cluster) && cluster >= 0 && cluster < CLUSTER_COUNT,
      'Invalid cluster write.');
    for (let part = 0; part < 2; part++) {
      const page = cluster * 2 + part;
      const data = bytes.subarray(part * 512, (part + 1) * 512);
      const offset = page * this.#stride;
      this.#bytes.set(data, offset);
      if (this.layout === 'ecc') this.#bytes.set(pageEcc(data), offset + 512);
      // The last four spare bytes are unused and retained from the destination.
      this.#checked.add(page);
    }
  }

  export(): Uint8Array { return this.#bytes.slice(); }
}

import { CardError } from './errors';
import { CLUSTER_SIZE, PAGE_COUNT, PAGE_SIZE } from './image';
import { pageEcc } from './ecc';
import type { CardLayout } from './image';

/** Standard 8 MiB geometry from Ross Ridge's PS2 memory card file system reference.
 * No input image or bundled template is used. See docs/empty-card-validation.md.
 */
export function formatCard(layout: CardLayout, createdAt: Date): Uint8Array {
  if (layout !== 'data' && layout !== 'ecc') throw new CardError('unsupported', 'Expected data or ecc layout.');
  const year = createdAt.getUTCFullYear();
  if (!Number.isFinite(createdAt.getTime()) || year < 1 || year > 9999) {
    throw new CardError('invalid-operation', 'Expected a valid card creation date with a year from 1 to 9999.');
  }
  const bytes = new Uint8Array(PAGE_COUNT * PAGE_SIZE);
  const view = new DataView(bytes.buffer);
  const put32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  const allocationStart = 41, allocationCount = 8135;
  text(0, 'Sony PS2 Memory Card Format ');
  text(28, '1.2.0.0');
  view.setUint16(40, PAGE_SIZE, true);
  view.setUint16(42, 2, true);
  view.setUint16(44, 16, true);
  view.setUint16(46, 0xff00, true);
  put32(48, 8192);
  put32(52, allocationStart);
  put32(56, allocationCount);
  put32(64, 1023);
  put32(68, 1022);
  put32(80, 8); // One indirect FAT cluster, after the reserved first erase block.
  bytes.fill(0xff, 208, 336); // No bad blocks.
  bytes[336] = 2;
  bytes[337] = 0x2b; // Standard flash card capabilities; independent of image layout.

  bytes.fill(0xff, 8 * CLUSTER_SIZE, 9 * CLUSTER_SIZE);
  for (let i = 0; i < 32; i++) put32(8 * CLUSTER_SIZE + i * 4, 9 + i);
  for (let i = 0; i < 8192; i++) {
    // Root is allocated, other usable clusters are free, tail entries are reserved.
    put32(9 * CLUSTER_SIZE + i * 4, i === 0 || i >= allocationCount ? 0xffffffff : 0x7fffffff);
  }
  const timestamp = (offset: number) => {
    bytes.set([0, createdAt.getUTCSeconds(), createdAt.getUTCMinutes(), createdAt.getUTCHours(),
      createdAt.getUTCDate(), createdAt.getUTCMonth() + 1], offset);
    view.setUint16(offset + 6, year, true);
  };
  for (const [index, name, mode, length] of [[0, '.', 0x8427, 2], [1, '..', 0xa426, 0]] as const) {
    const offset = allocationStart * CLUSTER_SIZE + index * PAGE_SIZE;
    view.setUint16(offset, mode, true);
    put32(offset + 4, length);
    timestamp(offset + 8);
    timestamp(offset + 24);
    text(offset + 64, name);
  }
  // An erased transaction block means no flash write needs recovery.
  bytes.fill(0xff, 1022 * 16 * PAGE_SIZE, 1023 * 16 * PAGE_SIZE);
  if (layout === 'data') return bytes;
  const output = new Uint8Array(PAGE_COUNT * 528);
  for (let page = 0; page < PAGE_COUNT; page++) {
    const data = bytes.subarray(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    output.set(data, page * 528);
    if (page >= 1022 * 16 && page < 1023 * 16) output.fill(0xff, page * 528 + 512, (page + 1) * 528);
    else output.set(pageEcc(data), page * 528 + 512);
  }
  return output;
}

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

export const fixture = (role = 'source', layout = 'data'): Uint8Array =>
  Uint8Array.from(gunzipSync(readFileSync(new URL(`./fixtures/${role}-${layout}.ps2.gz`, import.meta.url))));
export const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const get32 = (bytes: Uint8Array, offset: number): number => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
export const set32 = (bytes: Uint8Array, offset: number, value: number): void => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);

/** Direct offsets for deliberate mutations of independently generated data-only fixtures. */
export function raw(bytes: Uint8Array) {
  const offset = get32(bytes, 52);
  const cluster = (logical: number) => (offset + logical) * 1024;
  const fatOffset = (logical: number) => {
    const indirect = get32(bytes, 80) * 1024;
    return get32(bytes, indirect + Math.floor(logical / 256) * 4) * 1024 + logical % 256 * 4;
  };
  const chain = (first: number): number[] => {
    const result: number[] = [];
    while (first !== 0xffffffff) {
      if (result.includes(first) || result.length > 8192) throw new Error('Invalid test fixture chain');
      result.push(first);
      const next = get32(bytes, fatOffset(first));
      first = next === 0xffffffff ? next : next & 0x7fffffff;
    }
    return result;
  };
  const slot = (first: number, index: number) => cluster(chain(first)[Math.floor(index / 2)]!) + index % 2 * 512;
  const entry = (path: string): number => {
    let record = cluster(0);
    for (const name of path.split('/').filter(Boolean)) {
      const first = get32(bytes, record + 16), length = get32(bytes, record + 4);
      let found: number | undefined;
      for (let i = 2; i < length; i++) {
        const p = slot(first, i);
        const candidate = String.fromCharCode(...bytes.subarray(p + 64, p + 96)).split('\0')[0];
        if (candidate === name) { found = p; break; }
      }
      if (found === undefined) throw new Error(`Missing test entry ${path}`);
      record = found;
    }
    return record;
  };
  return { offset, cluster, fatOffset, chain, slot, entry };
}

/** Fill /KEEP/original using free clusters in the PS2 driver's 8000-cluster region. */
export function nearlyFull(freeCount: number): Uint8Array {
  const bytes = fixture('destination');
  const r = raw(bytes);
  const record = r.entry('/KEEP/original');
  const chain = r.chain(get32(bytes, record + 16));
  const free = Array.from({ length: 8000 }, (_, i) => i).filter(i => !(get32(bytes, r.fatOffset(i)) & 0x80000000));
  chain.push(...free.slice(0, free.length - freeCount));
  chain.forEach((cluster, i) => set32(bytes, r.fatOffset(cluster), i + 1 === chain.length ? 0xffffffff : chain[i + 1]! | 0x80000000));
  set32(bytes, record + 4, chain.length * 1024);
  return bytes;
}

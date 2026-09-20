// LZARI arithmetic model and wire format: Haruhiko Okumura, Ross Ridge's mymc.
// See THIRD_PARTY_NOTICES.md. Bounded hash-chain matching is specific to this implementation.
import { requireValid } from '../core/errors';
import { MAX_DECODED_BYTES } from './common';

const N = 314, Q1 = 32768, Q2 = 65536, Q3 = 98304, Q4 = 131072;
class Model {
  low = 0; high = Q4;
  readonly freq = new Uint32Array(N + 1).fill(1);
  readonly cumulative = Uint32Array.from({ length: N + 1 }, (_, i) => N - i);
  readonly symbol = Uint16Array.from({ length: N }, (_, i) => i + 1);
  readonly character = Uint16Array.from({ length: N + 1 }, (_, i) => i - 1);
  readonly positions = new Uint32Array(4097);
  constructor() {
    this.freq[0] = 0;
    for (let i = 4096; i > 0; i--) this.positions[i - 1] = this.positions[i]! + Math.floor(10000 / (200 + i));
  }
  update(symbol: number): void {
    if (this.cumulative[0]! >= Q1 - 1) {
      let sum = 0;
      for (let i = N; i > 0; i--) {
        this.cumulative[i] = sum; this.freq[i] = (this.freq[i]! + 1) >>> 1; sum += this.freq[i]!;
      }
      this.cumulative[0] = sum;
    }
    let next = symbol;
    while (this.freq[next - 1] === this.freq[symbol]) next--;
    if (next !== symbol) {
      const char = this.character[symbol]!, other = this.character[next]!;
      this.character[next] = char; this.character[symbol] = other;
      this.symbol[char] = next; this.symbol[other] = symbol;
    }
    this.freq[next] = this.freq[next]! + 1;
    for (let i = 0; i < next; i++) this.cumulative[i] = this.cumulative[i]! + 1;
  }
  interval(table: Uint32Array, index: number): void {
    const width = this.high - this.low;
    this.high = this.low + Math.floor(width * table[index - 1]! / table[0]!);
    this.low += Math.floor(width * table[index]! / table[0]!);
  }
}
export function decodeLzari(input: Uint8Array, length: number): Uint8Array {
  requireValid(length >= 0 && length <= MAX_DECODED_BYTES, 'MAX decompressed size exceeds the limit.');
  if (!length) { requireValid(!input.length, 'Unexpected empty MAX stream.'); return new Uint8Array(); }
  requireValid(input.length > 0, 'Truncated MAX compressed stream.');
  const model = new Model(), output = new Uint8Array(length), history = new Uint8Array(4096);
  history.fill(32, 0, 4096 - 60);
  let bit = 0, code = 0, out = 0, head = 4096 - 60;
  function readBit(): number {
    // Arithmetic termination needs up to 17 zero bits beyond its final byte.
    requireValid(bit < input.length * 8 + 17, 'Truncated MAX compressed stream.');
    const value = ((input[bit >>> 3] ?? 0) >>> (7 - (bit & 7))) & 1; bit++; return value;
  }
  for (let i = 0; i < 17; i++) code = code * 2 + readBit();
  function decode(table: Uint32Array): number {
    const value = Math.floor(((code - model.low + 1) * table[0]! - 1) / (model.high - model.low));
    requireValid(value >= 0 && value < table[0]!, 'Invalid MAX arithmetic stream.');
    let lo = 1, hi = table.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (table[mid]! > value) lo = mid + 1; else hi = mid; }
    model.interval(table, lo);
    while (true) {
      if (model.low >= Q2) { model.low -= Q2; model.high -= Q2; code -= Q2; }
      else if (model.low >= Q1 && model.high <= Q3) { model.low -= Q1; model.high -= Q1; code -= Q1; }
      else if (model.high > Q2) break;
      model.low *= 2; model.high *= 2; code = code * 2 + readBit();
    }
    return lo;
  }
  function append(byte: number): void { output[out++] = byte; history[head] = byte; head = (head + 1) & 4095; }
  while (out < length) {
    const symbol = decode(model.cumulative), char = model.character[symbol]!;
    model.update(symbol);
    if (char < 256) append(char);
    else {
      const position = decode(model.positions) - 1, count = char - 253;
      requireValid(out + count <= length, 'MAX match exceeds decompressed size.');
      const base = (head - position - 1) & 4095;
      for (let i = 0; i < count; i++) append(history[(base + i) & 4095]!);
    }
  }
  requireValid(bit >= (input.length - 2) * 8, 'Unexpected trailing MAX compressed data.');
  return output;
}
export function encodeLzari(input: Uint8Array): Uint8Array {
  requireValid(input.length <= MAX_DECODED_BYTES, 'MAX decompressed size exceeds the limit.');
  if (!input.length) return new Uint8Array();
  const model = new Model(), output = new Uint8Array(input.length * 2 + 64);
  let bits = 0, pending = 0;
  function bit(value: number): void {
    requireValid(bits < output.length * 8, 'MAX compressed output exceeds the limit.');
    output[bits >>> 3] = output[bits >>> 3]! | (value << (7 - (bits & 7))); bits++;
  }
  function emit(value: number): void { bit(value); while (pending > 0) { bit(value ^ 1); pending--; } }
  function encode(table: Uint32Array, index: number): void {
    model.interval(table, index);
    while (true) {
      if (model.high <= Q2) emit(0);
      else if (model.low >= Q2) { emit(1); model.low -= Q2; model.high -= Q2; }
      else if (model.low >= Q1 && model.high <= Q3) { pending++; model.low -= Q1; model.high -= Q1; }
      else break;
      model.low *= 2; model.high *= 2;
    }
  }
  // Fixed-size tables and at most 64 candidates per token bound work and memory.
  const heads = new Int32Array(65536).fill(-1), previous = new Int32Array(4096).fill(-1);
  function hash(at: number): number { return ((input[at]! * 251 + input[at + 1]!) * 251 + input[at + 2]!) & 65535; }
  function insert(at: number): void {
    if (at + 2 >= input.length) return;
    const key = hash(at); previous[at & 4095] = heads[key]!; heads[key] = at;
  }
  let at = 0;
  while (at < input.length) {
    let count = 0, distance = 0;
    const limit = Math.min(60, input.length - at);
    if (limit >= 3) {
      let candidate = heads[hash(at)]!, tried = 0;
      while (candidate >= 0 && candidate >= at - 4096 && tried++ < 64) {
        let match = 0;
        while (match < limit && input[candidate + match] === input[at + match]) match++;
        if (match > count) { count = match; distance = at - candidate - 1; if (count === limit) break; }
        candidate = previous[candidate & 4095]!;
      }
    }
    const consumed = count >= 3 ? count : 1, char = count >= 3 ? count + 253 : input[at]!;
    const symbol = model.symbol[char]!; encode(model.cumulative, symbol); model.update(symbol);
    if (count >= 3) encode(model.positions, distance + 1);
    for (let i = 0; i < consumed; i++) insert(at + i);
    at += consumed;
  }
  pending++; emit(model.low < Q1 ? 0 : 1);
  return output.slice(0, Math.ceil(bits / 8));
}

import { Inflate } from 'pako';
import { requireValid } from '../core/errors';
import { MAX_SAVE_ENTRIES } from '../core/save';
import type { SaveContent, SaveNode } from '../core/save';
import { flatSave, LEGACY_DEFAULTS, MAX_DECODED_BYTES, metadata, nameAt, range, signature, view } from './common';
import { MAX_PACKAGE_BYTES } from './psu';
// Public Code Breaker permutation from Ross Ridge's mymc (see attribution).
const PERMUTATION = Uint8Array.from([0x5f, 0x1f, 0x85, 0x6f, 0x31, 0xaa, 0x3b, 0x18,
  0x21, 0xb9, 0xce, 0x1c, 0x07, 0x4c, 0x9c, 0xb4,
  0x81, 0xb8, 0xef, 0x98, 0x59, 0xae, 0xf9, 0x26,
  0xe3, 0x80, 0xa3, 0x29, 0x2d, 0x73, 0x51, 0x62,
  0x7c, 0x64, 0x46, 0xf4, 0x34, 0x1a, 0xf6, 0xe1,
  0xba, 0x3a, 0x0d, 0x82, 0x79, 0x0a, 0x5c, 0x16,
  0x71, 0x49, 0x8e, 0xac, 0x8c, 0x9f, 0x35, 0x19,
  0x45, 0x94, 0x3f, 0x56, 0x0c, 0x91, 0x00, 0x0b,
  0xd7, 0xb0, 0xdd, 0x39, 0x66, 0xa1, 0x76, 0x52,
  0x13, 0x57, 0xf3, 0xbb, 0x4e, 0xe5, 0xdc, 0xf0,
  0x65, 0x84, 0xb2, 0xd6, 0xdf, 0x15, 0x3c, 0x63,
  0x1d, 0x89, 0x14, 0xbd, 0xd2, 0x36, 0xfe, 0xb1,
  0xca, 0x8b, 0xa4, 0xc6, 0x9e, 0x67, 0x47, 0x37,
  0x42, 0x6d, 0x6a, 0x03, 0x92, 0x70, 0x05, 0x7d,
  0x96, 0x2f, 0x40, 0x90, 0xc4, 0xf1, 0x3e, 0x3d,
  0x01, 0xf7, 0x68, 0x1e, 0xc3, 0xfc, 0x72, 0xb5,
  0x54, 0xcf, 0xe7, 0x41, 0xe4, 0x4d, 0x83, 0x55,
  0x12, 0x22, 0x09, 0x78, 0xfa, 0xde, 0xa7, 0x06,
  0x08, 0x23, 0xbf, 0x0f, 0xcc, 0xc1, 0x97, 0x61,
  0xc5, 0x4a, 0xe6, 0xa0, 0x11, 0xc2, 0xea, 0x74,
  0x02, 0x87, 0xd5, 0xd1, 0x9d, 0xb7, 0x7e, 0x38,
  0x60, 0x53, 0x95, 0x8d, 0x25, 0x77, 0x10, 0x5e,
  0x9b, 0x7f, 0xd8, 0x6e, 0xda, 0xa2, 0x2e, 0x20,
  0x4f, 0xcd, 0x8f, 0xcb, 0xbe, 0x5a, 0xe0, 0xed,
  0x2c, 0x9a, 0xd4, 0xe2, 0xaf, 0xd0, 0xa9, 0xe8,
  0xad, 0x7a, 0xbc, 0xa8, 0xf2, 0xee, 0xeb, 0xf5,
  0xa6, 0x99, 0x28, 0x24, 0x6c, 0x2b, 0x75, 0x5d,
  0xf8, 0xd3, 0x86, 0x17, 0xfb, 0xc0, 0x7b, 0xb3,
  0x58, 0xdb, 0xc7, 0x4b, 0xff, 0x04, 0x50, 0xe9,
  0x88, 0x69, 0xc9, 0x2a, 0xab, 0xfd, 0x5b, 0x1b,
  0x8a, 0xd9, 0xec, 0x27, 0x44, 0x0e, 0x33, 0xc8,
  0x6b, 0x93, 0x32, 0x48, 0xb6, 0x30, 0x43, 0xa5]);
export function cbsCrypt(input: Uint8Array): Uint8Array {
  const state = PERMUTATION.slice(), output = new Uint8Array(input.length);
  let j = 0;
  for (let at = 0; at < input.length; at++) {
    const i = (at + 1) & 255; j = (j + state[i]!) & 255;
    const old = state[i]!; state[i] = state[j]!; state[j] = old;
    output[at] = input[at]! ^ state[(state[i]! + state[j]!) & 255]!;
  }
  return output;
}
export function inflateCbs(input: Uint8Array, length: number): Uint8Array {
  requireValid(length <= MAX_DECODED_BYTES && length >= 0, 'CBS decompressed size exceeds the limit.');
  requireValid(input.length >= 6 && (input[0]! & 15) === 8 && (input[0]! >>> 4) <= 7 && ((input[0]! * 256 + input[1]!) % 31) === 0 && !(input[1]! & 32), 'Invalid CBS zlib header.');
  const output = new Uint8Array(length), inflater = new Inflate({ raw: true, chunkSize: 16384 });
  let written = 0, ended = false, status = -1;
  inflater.onData = chunk => {
    requireValid(chunk instanceof Uint8Array && written + chunk.length <= length, 'CBS decompression exceeds its declared size.');
    output.set(chunk as Uint8Array, written); written += chunk.length;
  };
  inflater.onEnd = code => { ended = true; status = code; };
  const body = input.subarray(2, input.length - 4);
  inflater.push(body, true);
  // Pin pako 2.1.0: raw mode stops at the first stream and exposes unused input.
  const remaining = (inflater as unknown as { strm: { avail_in: number } }).strm.avail_in;
  requireValid(ended && status === 0 && remaining === 0 && written === length, 'Truncated, trailing, or invalid CBS compressed stream.');
  let a = 1, b = 0;
  for (const byte of output) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  requireValid(view(input).getUint32(input.length - 4, false) === ((b * 65536 + a) >>> 0), 'CBS zlib checksum does not match.');
  return output;
}
export function decodeCbs(bytes: Uint8Array): SaveContent {
  requireValid(bytes.length <= MAX_PACKAGE_BYTES && signature(bytes, 'CFU\0'), 'Invalid CBS package.');
  const v = view(range(bytes, 0, 124)), headerSize = v.getUint32(8, true), length = v.getUint32(12, true), compressed = v.getUint32(16, true);
  requireValid(headerSize >= 124 && headerSize <= bytes.length && (compressed === bytes.length || compressed === bytes.length - headerSize), 'Invalid CBS header or compressed size.');
  const body = inflateCbs(cbsCrypt(bytes.subarray(headerSize)), length), children: SaveNode[] = [];
  // Producers place the directory mode at 72 (CheatDevice) or 76 (mymc).
  const mode72 = v.getUint32(72, true), mode76 = v.getUint32(76, true);
  const isDirectory = (mode: number) => mode <= 0xffff && (mode & 0x8030) === 0x8020;
  requireValid(!(isDirectory(mode72) && isDirectory(mode76) && mode72 !== mode76), 'Ambiguous CBS directory flags.');
  const mode = isDirectory(mode76) ? mode76 : isDirectory(mode72) ? mode72 : undefined;
  requireValid(mode !== undefined || (mode72 === 0 && mode76 === 0), 'Unsupported CBS directory flags.');
  let offset = 0;
  while (offset < body.length) {
    requireValid(children.length + 2 < MAX_SAVE_ENTRIES, 'Too many CBS entries.');
    const entry = range(body, offset, 64), e = view(entry), size = e.getUint32(16, true);
    children.push({ kind: 'file', record: metadata(nameAt(entry, 32), false, size, e.getUint32(20, true), entry.subarray(0, 8), entry.subarray(8, 16)), bytes: range(body, offset + 64, size) });
    offset += 64 + size;
  }
  return flatSave(metadata(nameAt(bytes, 20), true, children.length + 2, mode, bytes.subarray(52, 60), bytes.subarray(60, 68)), children,
    mode === undefined ? [...LEGACY_DEFAULTS, 'missing directory mode = standard directory flags'] : LEGACY_DEFAULTS);
}

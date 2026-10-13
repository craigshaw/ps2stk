import { Inflate } from 'pako';
import { CardError, requireValid } from '../core/errors';
import { crc32, range, signature, view } from './common';
import { MAX_PACKAGE_BYTES } from './psu';
import { MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_DECODED_BYTES, validateArchivePath } from './archive-common';
import type { ArchiveFile } from './archive-common';

export function isZip(bytes: Uint8Array): boolean {
  return signature(bytes, 'PK\x03\x04') || signature(bytes, 'PK\x05\x06');
}
function unsupported(condition: boolean, message: string): void {
  if (condition) throw new CardError('unsupported', message);
}
function extraFields(bytes: Uint8Array): void {
  for (let at = 0; at < bytes.length;) {
    const header = view(range(bytes, at, 4)), id = header.getUint16(0, true), size = header.getUint16(2, true);
    unsupported(id === 1, 'ZIP64 archives are unsupported. Extract the save package first.');
    range(bytes, at + 4, size); at += 4 + size;
  }
}
// Standard ZIP legacy filename encoding. Names identify archive members only.
const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
function pathName(bytes: Uint8Array, utf8: boolean): string {
  let path: string;
  try {
    path = utf8 ? decodeURIComponent(Array.from(bytes, b => `%${b.toString(16).padStart(2, '0')}`).join(''))
      : Array.from(bytes, b => b < 128 ? String.fromCharCode(b) : CP437[b - 128]!).join('');
  } catch { throw new CardError('corrupt', 'Invalid UTF-8 ZIP filename.'); }
  validateArchivePath(path);
  return path;
}
function inflate(input: Uint8Array, length: number): Uint8Array {
  const output = new Uint8Array(length), inflater = new Inflate({ raw: true, chunkSize: 16384 });
  let written = 0, ended = false, status = -1;
  inflater.onData = chunk => {
    requireValid(chunk instanceof Uint8Array && written + chunk.length <= length, 'ZIP decompression exceeds its declared size.');
    output.set(chunk as Uint8Array, written); written += chunk.length;
  };
  inflater.onEnd = code => { ended = true; status = code; };
  inflater.push(input, true);
  // Pinned pako raw mode stops at the first stream and exposes unused input.
  const remaining = (inflater as unknown as { strm: { avail_in: number } }).strm.avail_in;
  requireValid(ended && status === 0 && remaining === 0 && written === length, 'Truncated, trailing, or invalid ZIP compressed stream.');
  return output;
}

/** Read ordinary stored/deflated ZIPs entirely in memory, with no external writes.
 * Layout reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 */
export function readZip(bytes: Uint8Array): ArchiveFile[] {
  requireValid(isZip(bytes) && bytes.length >= 22, 'Invalid or truncated ZIP archive.');
  requireValid(bytes.length <= MAX_PACKAGE_BYTES, 'ZIP exceeds the 16 MiB input limit.');
  const v = view(bytes);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (v.getUint32(end, true) === 0x06054b50 && end + 22 + v.getUint16(end + 20, true) === bytes.length) break;
  }
  requireValid(end >= Math.max(0, bytes.length - 65557), 'Missing or invalid ZIP end record.');
  const count = v.getUint16(end + 10, true), start = v.getUint32(end + 16, true), size = v.getUint32(end + 12, true);
  unsupported(count === 0xffff || size === 0xffffffff || start === 0xffffffff, 'ZIP64 archives are unsupported. Extract the save package first.');
  unsupported(v.getUint16(end + 4, true) !== 0 || v.getUint16(end + 6, true) !== 0 || v.getUint16(end + 8, true) !== count, 'Split ZIP archives are unsupported.');
  requireValid(count <= MAX_ARCHIVE_ENTRIES, 'ZIP exceeds the 256-entry limit.');
  requireValid(start + size === end, 'Invalid ZIP central directory range.');
  range(bytes, start, size);
  const entries: { path: string; flags: number; method: number; crc: number; compressed: number; length: number; offset: number; name: Uint8Array; directory: boolean }[] = [];
  const paths = new Set<string>();
  let at = start, total = 0;
  for (let i = 0; i < count; i++) {
    const h = view(range(bytes, at, 46));
    requireValid(h.getUint32(0, true) === 0x02014b50, 'Invalid ZIP central directory entry.');
    const flags = h.getUint16(8, true), method = h.getUint16(10, true), compressed = h.getUint32(20, true), length = h.getUint32(24, true), offset = h.getUint32(42, true);
    unsupported(!!(flags & ~0x080e), 'Encrypted or unsupported ZIP flags. Extract an unencrypted save package first.');
    unsupported(method !== 0 && method !== 8, 'Unsupported ZIP compression. Use stored or deflated ZIP files.');
    unsupported(h.getUint16(6, true) > 20 || compressed === 0xffffffff || length === 0xffffffff || offset === 0xffffffff, 'Unsupported ZIP version or ZIP64 layout.');
    unsupported(h.getUint16(34, true) !== 0, 'Split ZIP archives are unsupported.');
    requireValid(length <= MAX_PACKAGE_BYTES && (total += length) <= MAX_ARCHIVE_DECODED_BYTES, 'ZIP exceeds the 16 MiB member or 32 MiB total extraction limit.');
    const nameLength = h.getUint16(28, true), extraLength = h.getUint16(30, true), commentLength = h.getUint16(32, true);
    requireValid(nameLength > 0 && nameLength <= 1024, 'ZIP filename exceeds the 1024-byte limit.');
    const name = range(bytes, at + 46, nameLength), path = pathName(name, !!(flags & 0x800));
    const identity = path.endsWith('/') ? path.slice(0, -1) : path;
    requireValid(!paths.has(identity), 'Duplicate ZIP path.'); paths.add(identity);
    const unixType = h.getUint16(4, true) >>> 8 === 3 ? (h.getUint32(38, true) >>> 16) & 0xf000 : 0;
    unsupported(unixType !== 0 && unixType !== 0x8000 && unixType !== 0x4000, 'ZIP links and special files are unsupported.');
    const directory = path.endsWith('/');
    requireValid((unixType !== 0x4000 || directory) && (!(h.getUint32(38, true) & 0x10) || directory) && (!directory || length === 0), 'Invalid ZIP directory entry.');
    extraFields(range(bytes, at + 46 + nameLength, extraLength));
    at += 46 + nameLength + extraLength + commentLength;
    requireValid(at <= end, 'ZIP directory entry exceeds the central directory.');
    entries.push({ path, flags, method, crc: h.getUint32(16, true), compressed, length, offset, name, directory });
  }
  requireValid(at === end, 'ZIP entry count or central directory size does not match.');
  entries.sort((a, b) => a.offset - b.offset);
  const files: ArchiveFile[] = [];
  at = 0;
  for (const e of entries) {
    requireValid(e.offset === at, 'ZIP contains overlapping, missing, or unsupported local records.');
    const h = view(range(bytes, at, 30));
    requireValid(h.getUint32(0, true) === 0x04034b50 && h.getUint16(6, true) === e.flags && h.getUint16(8, true) === e.method && h.getUint16(4, true) <= 20, 'ZIP local and central headers do not match.');
    const nameLength = h.getUint16(26, true), extraLength = h.getUint16(28, true), name = range(bytes, at + 30, nameLength);
    requireValid(name.length === e.name.length && name.every((b, i) => b === e.name[i]), 'ZIP local filename does not match.');
    extraFields(range(bytes, at + 30 + nameLength, extraLength));
    for (const [field, expected] of [[14, e.crc], [18, e.compressed], [22, e.length]] as const) {
      const actual = h.getUint32(field, true);
      requireValid(actual === expected || (!!(e.flags & 8) && actual === 0), 'ZIP local sizes or checksum do not match.');
    }
    const dataStart = at + 30 + nameLength + extraLength;
    at = dataStart + e.compressed;
    requireValid(at <= start, 'ZIP member overlaps the central directory.');
    if (e.flags & 8) {
      // Accept descriptors with and without their optional signature.
      const descriptorAt = at;
      const matches = (offset: number) => offset + 12 <= start && v.getUint32(offset, true) === e.crc && v.getUint32(offset + 4, true) === e.compressed && v.getUint32(offset + 8, true) === e.length;
      if (at + 16 <= start && v.getUint32(at, true) === 0x08074b50 && matches(at + 4)) at += 16;
      else { requireValid(matches(descriptorAt), 'Invalid ZIP data descriptor.'); at += 12; }
    }
    const input = range(bytes, dataStart, e.compressed);
    requireValid(e.method !== 0 || e.compressed === e.length, 'Invalid stored ZIP member size.');
    const output = e.method === 0 ? input.slice() : inflate(input, e.length);
    requireValid(crc32(output) === e.crc, `ZIP checksum does not match: ${e.path}.`);
    if (!e.directory) files.push({ path: e.path, bytes: output });
  }
  requireValid(at === start, 'ZIP contains unlisted or unsupported local records.');
  return files;
}

/*
UnRAR source code may be used in any software to handle
      RAR archives without limitations free of charge, but cannot be
      used to develop RAR (WinRAR) compatible archiver and to
      re-create RAR compression algorithm, which is proprietary.
      Distribution of modified UnRAR source code in separate form
      or as a part of other software is permitted, provided that
      full text of this paragraph, starting from "UnRAR source code"
      words, is included in license, or in documentation if license
      is not available, and in source code comments of resulting package.
*/
import { createExtractorFromData } from 'node-unrar-js/esm/index.esm.js';
import { CardError, requireValid } from '../core/errors';
import { crc32, range, signature, view } from './common';
import { MAX_PACKAGE_BYTES } from './psu';
import { MAX_ARCHIVE_ENTRIES, MAX_ARCHIVE_DECODED_BYTES, validateArchivePath } from './archive-common';
import type { ArchiveFile } from './archive-common';

export function isRar(bytes: Uint8Array): boolean {
  return signature(bytes, 'Rar!\x1a\x07\x00') || signature(bytes, 'Rar!\x1a\x07\x01\x00');
}
function supported(condition: boolean, message: string): void {
  if (!condition) throw new CardError('unsupported', message);
}
/** Preflight allocation-driving fields before passing untrusted bytes to UnRAR.
 * RAR5: https://www.rarlab.com/technote.htm; RAR4: UnRAR headers.hpp.
 */
export function preflightRar(bytes: Uint8Array): number {
  requireValid(isRar(bytes) && bytes.length <= MAX_PACKAGE_BYTES, 'Invalid RAR or archive exceeds the 16 MiB input limit.');
  const rar5 = bytes[6] === 1;
  let at = rar5 ? 8 : 7, blocks = 0, entries = 0, total = 0, main = false, ended = false;
  const boundedSize = (length: number) => {
    requireValid(length <= MAX_PACKAGE_BYTES && (total += length) <= MAX_ARCHIVE_DECODED_BYTES, 'RAR exceeds the 16 MiB member or 32 MiB total extraction limit.');
  };
  while (at < bytes.length) {
    requireValid(++blocks <= 1024 && !ended, 'RAR contains too many blocks or trailing data.');
    if (!rar5) {
      const base = view(range(bytes, at, 7)), type = bytes[at + 2]!, flags = base.getUint16(3, true), size = base.getUint16(5, true);
      requireValid(size >= 7, 'Invalid RAR header size.');
      const header = range(bytes, at, size), h = view(header);
      requireValid((crc32(header.subarray(2)) & 0xffff) === h.getUint16(0, true), 'RAR header checksum does not match.');
      let packed = flags & 0x8000 ? view(range(header, 7, 4)).getUint32(0, true) : 0;
      if (type === 0x73) {
        requireValid(!main && blocks === 1 && size >= 13, 'Invalid RAR main header.'); main = true;
        supported(!(flags & 1), 'Split RAR archives are unsupported.');
        supported(!(flags & 0x80), 'Password-protected RAR archives are unsupported.');
        supported(!(flags & 2), 'Legacy embedded RAR comments are unsupported.');
      } else if (type === 0x74 || type === 0x7a) {
        requireValid(main && size >= 32, 'Invalid RAR file header.');
        if (type === 0x74) requireValid(++entries <= MAX_ARCHIVE_ENTRIES, 'RAR exceeds the 256-entry limit.');
        supported(!(flags & 3), 'Split RAR members are unsupported.');
        supported(!(flags & 4), 'Password-protected RAR members are unsupported.');
        supported(!(flags & 8), 'Legacy embedded RAR comments are unsupported.');
        let length = h.getUint32(11, true);
        packed = h.getUint32(7, true);
        if (flags & 0x100) {
          const high = view(range(header, 32, 8));
          supported(high.getUint32(0, true) === 0 && high.getUint32(4, true) === 0, 'Large RAR members are unsupported.');
        }
        const nameLength = h.getUint16(26, true);
        requireValid(nameLength > 0 && nameLength <= 1024, 'Invalid or oversized RAR filename.');
        range(header, flags & 0x100 ? 40 : 32, nameLength);
        supported(header[24]! <= 29 && header[25]! >= 0x30 && header[25]! <= 0x35, 'Unsupported RAR compression version.');
        const unixType = header[15] === 3 ? h.getUint32(28, true) & 0xf000 : 0;
        supported(unixType === 0 || unixType === 0x8000 || unixType === 0x4000, 'RAR links and special files are unsupported.');
        if ((flags & 0xe0) === 0xe0) { requireValid(length === 0, 'Invalid RAR directory size.'); length = 0; }
        boundedSize(length);
      } else if (type === 0x7b) {
        requireValid(main, 'RAR has no main header.'); supported(!(flags & 1), 'Split RAR archives are unsupported.'); ended = true;
      } else supported(false, 'Unsupported RAR block. Extract the save package first.');
      range(bytes, at + size, packed); at += size + packed;
    } else {
      const blockStart = at, expectedCrc = view(range(bytes, at, 4)).getUint32(0, true);
      at += 4;
      let limit = bytes.length;
      const vint = () => {
        let value = 0, factor = 1;
        for (let i = 0; i < 8; i++) {
          requireValid(at < limit, 'Truncated RAR variable integer.');
          const byte = bytes[at++]!; value += (byte & 127) * factor;
          requireValid(Number.isSafeInteger(value), 'RAR integer exceeds the safe limit.');
          if (!(byte & 128)) return value;
          factor *= 128;
        }
        throw new CardError('corrupt', 'Oversized RAR variable integer.');
      };
      const size = vint(), headerEnd = at + size;
      requireValid(size > 0 && size <= 2 * 1024 * 1024, 'Invalid RAR header size.');
      const header = range(bytes, blockStart + 4, headerEnd - blockStart - 4);
      requireValid(crc32(header) === expectedCrc, 'RAR header checksum does not match.');
      limit = headerEnd;
      const type = vint(), flags = vint(), extraSize = flags & 1 ? vint() : 0, packed = flags & 2 ? vint() : 0;
      supported(!(flags & 0x18), 'Split RAR members are unsupported.');
      const extraStart = headerEnd - extraSize;
      requireValid(extraStart >= at, 'Invalid RAR extra area.');
      limit = extraStart;
      if (type === 1) {
        requireValid(!main && blocks === 1, 'Invalid RAR main header.'); main = true;
        supported(!(vint() & 3), 'Split RAR archives are unsupported.');
      } else if (type === 2 || type === 3) {
        requireValid(main, 'RAR has no main header.');
        if (type === 2) requireValid(++entries <= MAX_ARCHIVE_ENTRIES, 'RAR exceeds the 256-entry limit.');
        const fileFlags = vint(), length = vint(), attributes = vint();
        supported(!(fileFlags & 8), 'RAR members with unknown sizes are unsupported.'); boundedSize(length);
        if (fileFlags & 2) at += 4;
        if (fileFlags & 4) at += 4;
        requireValid(at <= limit, 'Truncated RAR file fields.');
        const compression = vint(), host = vint(), nameLength = vint();
        supported(compression <= 0x7fff && (compression & 63) === 0 && ((compression >>> 7) & 7) <= 5, 'Unsupported RAR compression version.');
        supported(((compression >>> 10) & 31) <= 9, 'RAR dictionary exceeds the 64 MiB limit.');
        requireValid(nameLength > 0 && nameLength <= 1024 && at + nameLength <= limit, 'Invalid or oversized RAR filename.');
        const unixType = host === 1 ? attributes & 0xf000 : 0;
        supported(unixType === 0 || unixType === 0x8000 || unixType === 0x4000, 'RAR links and special files are unsupported.');
        requireValid(!(fileFlags & 1) || length === 0, 'Invalid RAR directory size.');
        at = extraStart; limit = headerEnd;
        while (at < headerEnd) {
          const recordSize = vint(), recordEnd = at + recordSize;
          requireValid(recordSize > 0 && recordEnd <= headerEnd, 'Invalid RAR extra record.');
          const recordType = vint();
          requireValid(at <= recordEnd, 'Invalid RAR extra record type.');
          supported(recordType !== 1, 'Password-protected RAR members are unsupported.');
          supported(recordType !== 5, 'RAR links and file references are unsupported.');
          at = recordEnd;
        }
      } else if (type === 5) {
        requireValid(main, 'RAR has no main header.'); supported(!(vint() & 1), 'Split RAR archives are unsupported.'); ended = true;
      } else supported(false, type === 4 ? 'Password-protected RAR archives are unsupported.' : 'Unsupported RAR block.');
      range(bytes, headerEnd, packed); at = headerEnd + packed;
    }
  }
  requireValid(main && ended && at === bytes.length, 'RAR archive is incomplete.');
  return entries;
}

// Cap the bundled module's exported linear memory at 128 MiB. Keep section sizes
// unchanged by padding the replacement LEB128 maximum to its existing width.
function boundedWasm(input: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(input.slice(0));
  let at = 8;
  const integer = () => {
    let value = 0, shift = 0;
    for (let i = 0; i < 5; i++) {
      requireValid(at < bytes.length, 'Invalid RAR decoder module.');
      const b = bytes[at++]!; value += (b & 127) * 2 ** shift;
      if (!(b & 128)) return value;
      shift += 7;
    }
    throw new CardError('corrupt', 'Invalid RAR decoder module integer.');
  };
  while (at < bytes.length) {
    const id = bytes[at++]!, size = integer(), end = at + size;
    requireValid(end <= bytes.length, 'Invalid RAR decoder section.');
    if (id === 5) {
      requireValid(integer() === 1 && integer() === 1 && integer() <= 2048, 'Unsupported RAR decoder memory layout.');
      const start = at, maximum = integer(), width = at - start;
      let replacement = Math.min(maximum, 2048);
      for (let i = 0; i < width; i++) {
        bytes[start + i] = (replacement & 127) | (i + 1 < width ? 128 : 0); replacement >>>= 7;
      }
      requireValid(replacement === 0 && at === end, 'Invalid RAR decoder memory limit.');
      return bytes.buffer;
    }
    at = end;
  }
  throw new CardError('corrupt', 'RAR decoder has no memory limits.');
}

export async function readRar(bytes: Uint8Array, wasmBinary: ArrayBuffer): Promise<ArchiveFile[]> {
  const expectedCount = preflightRar(bytes);
  const extractor = await createExtractorFromData({ data: bytes.slice().buffer, wasmBinary: boundedWasm(wasmBinary) });
  const list = extractor.getFileList(), paths = new Map<string, number>();
  supported(!list.arcHeader.flags.volume && !list.arcHeader.flags.headerEncrypted, 'Split or encrypted RAR archives are unsupported.');
  let count = 0, total = 0;
  for (const header of list.fileHeaders) {
    requireValid(++count <= MAX_ARCHIVE_ENTRIES, 'RAR exceeds the 256-entry limit.');
    supported(!header.flags.encrypted, 'Password-protected RAR members are unsupported.');
    requireValid(Number.isSafeInteger(header.unpSize) && header.unpSize >= 0 && header.unpSize <= MAX_PACKAGE_BYTES && (total += header.unpSize) <= MAX_ARCHIVE_DECODED_BYTES, 'RAR extraction exceeds its size limits.');
    // RAR4 uses backslashes as directory separators. No files reach the host FS.
    const path = validateArchivePath(header.name.replaceAll('\\', '/'));
    requireValid(!paths.has(path), 'Duplicate RAR path.'); paths.set(path, header.unpSize);
  }
  requireValid(count === expectedCount, 'RAR file list is incomplete.');
  const files: ArchiveFile[] = [];
  // Guard the decoder's output callback before it copies any native output into
  // growing JS buffers. Declared sizes alone do not bound a corrupt stream.
  const io = extractor as unknown as { write(fd: number, buf: number, size: number): boolean };
  const originalWrite = io.write.bind(extractor);
  let memberLimit = 0, written = 0, extractedTotal = 0;
  io.write = (fd, buf, size) => {
    requireValid(Number.isSafeInteger(size) && size >= 0 && written + size <= memberLimit && extractedTotal + size <= MAX_ARCHIVE_DECODED_BYTES, 'RAR decompression exceeds its declared size.');
    written += size; extractedTotal += size;
    return originalWrite(fd, buf, size);
  };
  // UnRAR checks file integrity. Exhaust its iterator to release native handles.
  for (const { fileHeader, extraction } of extractor.extract({ files: header => {
    const path = validateArchivePath(header.name.replaceAll('\\', '/'));
    requireValid(paths.get(path) === header.unpSize, 'RAR extraction does not match its file list.');
    paths.delete(path); memberLimit = header.unpSize; written = 0; return true;
  } }).files) {
    if (!fileHeader.flags.directory) {
      requireValid(extraction instanceof Uint8Array && extraction.length === fileHeader.unpSize, 'Incomplete RAR member.');
      files.push({ path: fileHeader.name.replaceAll('\\', '/'), bytes: extraction });
    }
  }
  requireValid(paths.size === 0, 'RAR extraction is incomplete.');
  return files;
}

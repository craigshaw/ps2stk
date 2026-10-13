import { CardError } from '../core/errors';
import type { SaveContent } from '../core/save';
import { decodeSavePackage, detectSavePackage, MAX_PACKAGE_BYTES } from './index';
import type { ImportFormat } from './index';
import { isZip, readZip } from './zip';
import { isRar, readRar } from './rar';

export type ArchiveInfo = { format: 'ZIP' | 'RAR'; path: string; ignoredFiles: number };
export type DecodedInput = { kind: 'decoded'; format: ImportFormat; save: SaveContent; archive?: ArchiveInfo };
export type ArchiveChoices = { kind: 'choices'; archiveFormat: 'ZIP' | 'RAR'; paths: string[]; ignoredFiles: number };
export async function inspectSaveInput(bytes: Uint8Array, wasmBinary?: ArrayBuffer, archivePath?: string): Promise<DecodedInput | ArchiveChoices> {
  if (bytes.length > MAX_PACKAGE_BYTES) throw new CardError('unsupported', 'Save input exceeds the 16 MiB input limit.');
  const archiveFormat = isZip(bytes) ? 'ZIP' : isRar(bytes) ? 'RAR' : null;
  if (!archiveFormat) return { kind: 'decoded', ...decodeSavePackage(bytes) };
  if (archiveFormat === 'RAR' && !wasmBinary) throw new CardError('unsupported', 'RAR decoder is unavailable. Please try the archive again.');
  const files = archiveFormat === 'ZIP' ? readZip(bytes) : await readRar(bytes, wasmBinary!);
  // macOS resource forks are not save packages, even when their suffix matches.
  const packages = files.filter(file => !file.path.split('/').some(part => part === '__MACOSX' || part.startsWith('._')) && detectSavePackage(file.bytes));
  const ignoredFiles = files.length - packages.length;
  if (!packages.length) throw new CardError('unsupported', `${archiveFormat} contains no supported save packages. Use PSU, MAX, SPS, XPS, CBS, or signed PS2 PSV. Raw folders and nested archives are unsupported.`);
  if (archivePath === undefined && packages.length > 1) return { kind: 'choices', archiveFormat, paths: packages.map(p => p.path), ignoredFiles };
  const selected = archivePath === undefined ? packages[0]! : packages.find(p => p.path === archivePath);
  if (!selected) throw new CardError('not-found', 'The selected save package is not in this archive.');
  return { kind: 'decoded', ...decodeSavePackage(selected.bytes), archive: { format: archiveFormat, path: selected.path, ignoredFiles } };
}

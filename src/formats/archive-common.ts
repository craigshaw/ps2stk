import { requireValid } from '../core/errors';
export const MAX_ARCHIVE_ENTRIES = 256;
export const MAX_ARCHIVE_DECODED_BYTES = 32 * 1024 * 1024;
export type ArchiveFile = { path: string; bytes: Uint8Array };
export function validateArchivePath(path: string): string {
  const identity = path.endsWith('/') ? path.slice(0, -1) : path;
  requireValid(path.length > 0 && path.length <= 1024 && !/[\x00-\x1f\x7f\\:]/.test(path) && identity.split('/').every(p => p !== '' && p !== '.' && p !== '..'), 'Unsafe archive path. Use relative paths without traversal.');
  return identity;
}

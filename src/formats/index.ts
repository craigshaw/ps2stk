import { CardError } from '../core/errors';
import type { SaveContent } from '../core/save';
import { signature, view } from './common';
import { decodePsu, encodePsu, MAX_PACKAGE_BYTES, packageFilename } from './psu';
import { decodeMax, encodeMax, MAX_LOSS_NOTICE } from './max';
import { decodeSharkport } from './sharkport';
import { decodeCbs } from './cbs';
import { decodePsv, encodePsv, psvFilename, PSV_LOSS_NOTICE } from './psv';
export { MAX_PACKAGE_BYTES, packageFilename, MAX_LOSS_NOTICE, PSV_LOSS_NOTICE };
export type ImportFormat = 'psu' | 'max' | 'sharkport' | 'cbs' | 'psv';
export type ExportFormat = 'psu' | 'max' | 'psv';
export const FORMAT_LABELS: Record<ImportFormat, string> = {
  psu: 'EMS (.psu)', max: 'MAX Drive (.max)', sharkport: 'SharkPort / X-Port (.sps / .xps)', cbs: 'Code Breaker (.cbs)', psv: 'PS2 PSV (.psv), signature verified',
};
export function decodeSavePackage(bytes: Uint8Array): { format: ImportFormat; save: SaveContent } {
  if (bytes.length > MAX_PACKAGE_BYTES) throw new CardError('unsupported', 'Save package exceeds the 16 MiB input limit.');
  if (signature(bytes, 'Ps2PowerSave')) return { format: 'max', save: decodeMax(bytes) };
  if (signature(bytes, '\x0d\0\0\0SharkPortSave')) return { format: 'sharkport', save: decodeSharkport(bytes) };
  if (signature(bytes, 'CFU\0')) return { format: 'cbs', save: decodeCbs(bytes) };
  if (signature(bytes, '\0VSP')) return { format: 'psv', save: decodePsv(bytes) };
  if (bytes.length >= 2 && (view(bytes).getUint16(0, true) & 0x8030) === 0x8020) return { format: 'psu', save: decodePsu(bytes) };
  throw new CardError('unsupported', 'Unsupported save package. Import PSU, MAX, SPS, XPS, CBS, or PS2 PSV. Extract ZIP downloads first.');
}
export function exportSavePackage(save: SaveContent, format: ExportFormat = 'psu', acknowledgeLoss = false): { bytes: Uint8Array; filename: string } {
  if (format === 'max' && !acknowledgeLoss) throw new CardError('invalid-operation', MAX_LOSS_NOTICE + ' Acknowledge metadata loss before export.');
  if (format === 'psv') {
    if (!acknowledgeLoss) throw new CardError('invalid-operation', PSV_LOSS_NOTICE + ' Acknowledge metadata loss before export.');
    return { bytes: encodePsv(save), filename: psvFilename(save.name) };
  }
  if (format !== 'psu' && format !== 'max') throw new CardError('unsupported', 'Unsupported save export format.');
  return { bytes: format === 'max' ? encodeMax(save) : encodePsu(save), filename: packageFilename(save.name, format) };
}

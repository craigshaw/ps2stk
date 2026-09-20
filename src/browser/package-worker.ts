import { SaveContent } from '../core/save';
import { decodeSavePackage, exportSavePackage } from '../formats/index';
import { saveBuffers } from './package-protocol';
import type { PackageRequest, PackageResult } from './package-protocol';
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<PackageRequest>) => void; postMessage(value: PackageResult, transfer?: ArrayBuffer[]): void };
scope.onmessage = ({ data }) => {
  try {
    if (data.type === 'decode') {
      const { format, save } = decodeSavePackage(data.bytes), root = save.snapshot();
      scope.postMessage({ type: 'decoded', format, root }, saveBuffers(root));
    } else {
      const output = exportSavePackage(new SaveContent(data.root), data.format, data.acknowledgeLoss);
      scope.postMessage({ type: 'encoded', ...output }, [output.bytes.buffer as ArrayBuffer]);
    }
  } catch (error) { scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
};

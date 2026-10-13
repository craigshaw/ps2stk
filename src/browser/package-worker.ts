import { SaveContent } from '../core/save';
import { exportSavePackage } from '../formats/index';
import { inspectSaveInput } from '../formats/archives';
import { isRar } from '../formats/rar';
import rarWasmUrl from 'node-unrar-js/esm/js/unrar.wasm?url';
import { saveBuffers } from './package-protocol';
import type { PackageRequest, PackageResult } from './package-protocol';
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<PackageRequest>) => void; postMessage(value: PackageResult, transfer?: ArrayBuffer[]): void };
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'decode') {
      let wasmBinary: ArrayBuffer | undefined;
      if (isRar(data.bytes)) {
        const response = await fetch(rarWasmUrl);
        if (!response.ok) throw new Error('Could not load the RAR decoder. Please try again.');
        wasmBinary = await response.arrayBuffer();
      }
      const result = await inspectSaveInput(data.bytes, wasmBinary, data.archivePath);
      if (result.kind === 'choices') scope.postMessage({ type: 'choices', ...result });
      else {
        const root = result.save.snapshot();
        scope.postMessage({ type: 'decoded', format: result.format, root, ...(result.archive ? { archive: result.archive } : {}) }, saveBuffers(root));
      }
    } else {
      const output = exportSavePackage(new SaveContent(data.root), data.format, data.acknowledgeLoss);
      scope.postMessage({ type: 'encoded', ...output }, [output.bytes.buffer as ArrayBuffer]);
    }
  } catch (error) { scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
};

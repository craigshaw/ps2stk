import { SaveContent } from '../core/save';
import type { ExportFormat, ImportFormat } from '../formats/index';
import type { PackageRequest, PackageResult } from './package-protocol';
import { saveBuffers } from './package-protocol';
function processPackage(request: PackageRequest, transfer: ArrayBuffer[]): Promise<PackageResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./package-worker.ts', import.meta.url), { type: 'module' });
    const fail = (message: string) => { worker.terminate(); reject(new Error(message)); };
    worker.onerror = () => fail('Save package processing failed. Please try the package again.');
    worker.onmessageerror = () => fail('Could not read the save package result.');
    worker.onmessage = ({ data }: MessageEvent<PackageResult>) => {
      worker.terminate();
      if (data.type === 'error') reject(new Error(data.message)); else resolve(data);
    };
    try { worker.postMessage(request, transfer); } catch (error) { worker.terminate(); reject(error); }
  });
}
export async function decodePackage(bytes: Uint8Array): Promise<{ format: ImportFormat; save: SaveContent }> {
  // Transfer an owned copy, never detach a caller's input or card data.
  const input = bytes.slice(), result = await processPackage({ type: 'decode', bytes: input }, [input.buffer]);
  if (result.type !== 'decoded') throw new Error('Invalid save package result.');
  return { format: result.format, save: new SaveContent(result.root) };
}
export async function encodePackage(save: SaveContent, format: ExportFormat, acknowledgeLoss: boolean): Promise<{ bytes: Uint8Array; filename: string }> {
  const root = save.snapshot(), result = await processPackage({ type: 'encode', root, format, acknowledgeLoss }, saveBuffers(root));
  if (result.type !== 'encoded') throw new Error('Invalid save export result.');
  return result;
}

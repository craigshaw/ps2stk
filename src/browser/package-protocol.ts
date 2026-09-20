import type { SaveDirectory } from '../core/save';
import type { ExportFormat, ImportFormat } from '../formats/index';
export type PackageRequest = { type: 'decode'; bytes: Uint8Array } | { type: 'encode'; root: SaveDirectory; format: ExportFormat; acknowledgeLoss: boolean };
export type PackageResult = { type: 'decoded'; root: SaveDirectory; format: ImportFormat } | { type: 'encoded'; bytes: Uint8Array; filename: string } | { type: 'error'; message: string };
export function saveBuffers(root: SaveDirectory): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  function visit(node: import('../core/save').SaveNode): void {
    buffers.add(node.record.buffer as ArrayBuffer);
    if (node.kind === 'file') buffers.add(node.bytes.buffer as ArrayBuffer);
    else { buffers.add(node.dot.buffer as ArrayBuffer); buffers.add(node.dotdot.buffer as ArrayBuffer); for (const child of node.children) visit(child); }
  }
  visit(root); return [...buffers];
}

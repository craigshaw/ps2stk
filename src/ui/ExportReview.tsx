import { useState } from 'react';
import type { ExportFormat } from '../formats/index';
import { MAX_LOSS_NOTICE } from '../formats/index';
import type { SaveContent } from '../core/index';

export function ExportReview({ save, busy, supportedFolders, onDownload, onFolder }: {
  save: SaveContent;
  busy: boolean;
  supportedFolders: boolean;
  onDownload(format: ExportFormat, acknowledgeLoss: boolean): void;
  onFolder(): void;
}) {
  const [format, setFormat] = useState<ExportFormat | 'folder'>('psu');
  const [acknowledged, setAcknowledged] = useState(false);
  const folder = format === 'folder';
  const nested = save.entry.children.some(child => child.kind === 'directory');
  const blocked = folder ? !supportedFolders : nested || (format === 'max' && !acknowledged);
  return <fieldset className="package-export-controls" disabled={busy}>
    <p>Export <strong>{save.name}</strong>.</p>
    <label>Output type<select aria-label="Output type" value={format} onChange={e => { setFormat(e.target.value as ExportFormat | 'folder'); setAcknowledged(false); }}>
      <option value="psu">EMS package (.psu)</option>
      <option value="max">MAX Drive package (.max)</option>
      <option value="folder">Raw files to folder</option>
    </select></label>
    {format === 'psu' && <p>One file containing the save files and their recorded metadata. This does not save the complete memory card.</p>}
    {format === 'max' && <>
      <p>{MAX_LOSS_NOTICE}</p>
      <label className="loss-acknowledgement"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I accept the metadata loss in this MAX export.</label>
    </>}
    {folder && <>
      <p>A new <strong>{save.name}</strong> folder will contain {save.fileCount} {save.fileCount === 1 ? 'file' : 'separate files'}, preserving exact bytes and the original directory structure. Card metadata is not included.</p>
      <p>Existing save folders are never overwritten. If permission is lost or a write fails, a partial folder can remain. This does not save the complete memory card.</p>
      {!supportedFolders && <p className="capability-note">Raw files to folder requires Chrome or Edge with directory access. PSU and MAX downloads are available here.</p>}
    </>}
    {nested && !folder && <p role="alert">This save contains nested directories. Select Raw files to folder or download the whole card.</p>}
    <div className="dialog-actions"><button className="primary" disabled={blocked} onClick={() => folder ? onFolder() : onDownload(format, acknowledged)}>{folder ? 'Choose folder' : 'Download save'}</button></div>
    {busy && <p role="status">{folder ? 'Exporting raw files…' : 'Preparing save package…'}</p>}
  </fieldset>;
}

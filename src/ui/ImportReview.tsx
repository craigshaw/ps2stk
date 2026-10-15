import { FORMAT_LABELS } from '../formats/index';
import type { ImportFormat } from '../formats/index';
import { useMemo, useState } from 'react';
import type { MemoryCard, SaveContent } from '../core/index';
import { IconPreview } from './IconPreview';
import { bytesLabel, saveInfo, fileBytes, flattenFiles } from './model';
import type { ArchiveInfo } from '../formats/archives';

export function ImportReview({ save, format, card, destination, archive, onApply }: {
  save: SaveContent; format: ImportFormat; card: MemoryCard; destination: string;
  archive?: ArchiveInfo | undefined;
  onApply(choice: 'skip' | 'replace'): void;
}) {
  const [choice, setChoice] = useState<'skip' | 'replace'>('skip');
  const info = useMemo(() => saveInfo(save, save.entry), [save]);
  const files = useMemo(() => flattenFiles(info.entry), [info.entry]);
  const uncheckedIntegrity = save.notices.some(notice => notice.includes('integrity notice: this package has no populated checksum'));
  const existing = card.entries.find(e => e.name === save.name);
  const plan = useMemo(() => {
    try { return { result: card.planImport(save, 'replace'), error: null }; }
    catch (e) { return { result: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [card, save]);
  const skipped = !!existing && choice === 'skip';
  const blocked = !skipped && (!!plan.error || !!plan.result?.shortageBytes);
  return <>
    <p className="import-destination">To <strong>{destination}</strong></p>
    <div className="package-preview"><IconPreview card={save} info={info} animate={false} /><div><h3>{info.title}</h3><p>{FORMAT_LABELS[format]} · {save.fileCount} {save.fileCount === 1 ? 'file' : 'files'} · {bytesLabel(save.fileBytes)}</p></div></div>
    <dl className="save-details">
      <div><dt>Required space</dt><dd>{plan.result ? bytesLabel(plan.result.requiredBytes) : 'Unavailable'}</dd></div>
      <div><dt>{existing ? "Available after replacement" : "Available space"}</dt><dd>{plan.result ? bytesLabel(plan.result.availableBytes) : bytesLabel(card.freeBytes)}</dd></div>
    </dl>
    <details className="import-files">
      <summary>Files ({save.fileCount})</summary>
      {files.length ? <dl className="import-file-list" tabIndex={0} aria-label="Save files">
        {files.map(file => <div key={file.path}><dt><code>{file.path.slice(info.entry.path.length + 1)}</code></dt><dd>{bytesLabel(file.length)}</dd></div>)}
      </dl> : <p>This save contains no files.</p>}
    </details>
    {!!archive?.ignoredFiles && <p className="import-notice">{archive.ignoredFiles} other archive {archive.ignoredFiles === 1 ? 'file will' : 'files will'} not be imported.</p>}
    {uncheckedIntegrity && <p className="import-notice">This package has no checksum. Its integrity could not be checked.</p>}
    {existing && <><p>A save with this directory name already exists: {flattenFiles(existing).length} files, {bytesLabel(fileBytes(existing))}. Replacement removes all of it.</p><label className="form-field">Existing save<select aria-label="Import conflict" value={choice} onChange={e => setChoice(e.target.value as 'skip' | 'replace')}><option value="skip">Skip</option><option value="replace">Replace entire save</option></select></label></>}
    {plan.error && <p role="alert">{plan.error}</p>}
    {!!plan.result?.shortageBytes && <p role="alert">Need {bytesLabel(plan.result.shortageBytes)} more space, including directory allocation. No changes will be made.</p>}
    <div className="dialog-actions"><button className="primary" disabled={blocked} onClick={() => onApply(choice)}>{skipped ? 'Skip import' : choice === 'replace' && existing ? 'Replace entire save' : 'Import save'}</button></div>
  </>;
}

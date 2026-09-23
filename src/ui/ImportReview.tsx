import { FORMAT_LABELS } from '../formats/index';
import type { ImportFormat } from '../formats/index';
import { useMemo, useState } from 'react';
import type { MemoryCard, SaveContent } from '../core/index';
import { IconPreview } from './IconPreview';
import { bytesLabel, saveInfo, fileBytes, flattenFiles } from './model';

export function ImportReview({ save, format, card, destination, onApply }: {
  save: SaveContent; format: ImportFormat; card: MemoryCard; destination: string;
  onApply(choice: 'skip' | 'replace'): void;
}) {
  const [choice, setChoice] = useState<'skip' | 'replace'>('skip');
  const info = useMemo(() => saveInfo(save, save.entry), [save]);
  const existing = card.entries.find(e => e.name === save.name);
  const plan = useMemo(() => {
    try { return { result: card.planImport(save, 'replace'), error: null }; }
    catch (e) { return { result: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [card, save]);
  const skipped = !!existing && choice === 'skip';
  const blocked = !skipped && (!!plan.error || !!plan.result?.shortageBytes);
  return <>
    <p>Import into <strong>{destination}</strong>. The original files stay unchanged.</p>
    <div className="package-preview"><IconPreview card={save} info={info} animate={false} /><div><h3>{info.title}</h3><code>{save.name}</code><p>{FORMAT_LABELS[format]} · {save.fileCount} files · {bytesLabel(save.fileBytes)}</p></div></div>
    <dl className="save-details">
      <div><dt>Required allocation</dt><dd>{plan.result ? bytesLabel(plan.result.requiredBytes) : 'Unavailable'}</dd></div>
      <div><dt>{existing ? "Available after replacement" : "Available space"}</dt><dd>{plan.result ? bytesLabel(plan.result.availableBytes) : bytesLabel(card.freeBytes)}</dd></div>
    </dl>
    <p className="capability-note">{format === 'psu' ? 'File contents, names, timestamps, and attributes will be preserved.' : 'File contents and names will be preserved. Metadata available in this format will be retained; defaults are listed below.'}</p>
    {save.notices.map(notice => <p key={notice}>{notice}</p>)}
    {existing && <><p>A save with this directory name already exists: {flattenFiles(existing).length} files, {bytesLabel(fileBytes(existing))}. Replacement removes all of it.</p><label className="form-field">Existing save<select aria-label="Import conflict" value={choice} onChange={e => setChoice(e.target.value as 'skip' | 'replace')}><option value="skip">Skip</option><option value="replace">Replace entire save</option></select></label></>}
    {plan.error && <p role="alert">{plan.error}</p>}
    {!!plan.result?.shortageBytes && <p role="alert">Need {bytesLabel(plan.result.shortageBytes)} more space, including directory allocation. No changes will be made.</p>}
    <div className="dialog-actions"><button className="primary" disabled={blocked} onClick={() => onApply(choice)}>{skipped ? 'Skip import' : choice === 'replace' && existing ? 'Replace entire save' : 'Import save'}</button></div>
  </>;
}

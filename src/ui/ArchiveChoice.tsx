import { useState } from 'react';
import type { ArchiveChoices } from '../formats/archives';
export function ArchiveChoice({ choices, busy, onReview }: {
  choices: ArchiveChoices; busy: boolean; onReview(path: string): void;
}) {
  const [path, setPath] = useState(choices.paths[0]!);
  return <>
    <p>This {choices.archiveFormat} contains {choices.paths.length} save packages. Choose one to review and import.</p>
    <div className="form-field"><label htmlFor="archive-package">Save package</label><select id="archive-package" value={path} disabled={busy} onChange={event => setPath(event.target.value)}>
      {choices.paths.map(name => <option key={name} value={name}>{name}</option>)}
    </select></div>
    {!!choices.ignoredFiles && <p>{choices.ignoredFiles} other archive {choices.ignoredFiles === 1 ? 'file' : 'files'} will not be imported.</p>}
    <div className="dialog-actions"><button className="primary" disabled={busy} onClick={() => onReview(path)}>Review save</button></div>
  </>;
}

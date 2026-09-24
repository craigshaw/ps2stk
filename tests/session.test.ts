import assert from 'node:assert/strict';
import test from 'node:test';
import { CardSession, DEFAULT_HISTORY_BYTES } from '../src/session/session';
import type { CardSlot, CardDownload } from '../src/session/session';
import { MemoryCard } from '../src/core/index';
import { fixture, hash } from './helpers';

function session(): CardSession {
  const result = new CardSession();
  result.open(0, fixture(), 'source.BIN');
  result.open(1, fixture('destination', 'ecc'), 'destination.ps2');
  return result;
}

test('session allows two cards, rejects occupied slots, and does not persist between instances', () => {
  const s = session();
  assert.throws(() => s.open(2 as CardSlot, fixture(), 'third.ps2'), /two card slots/);
  assert.throws(() => s.open(0, fixture(), 'third.ps2'), /Close/);
  assert.equal(s.state(0).needsDownload, false);
  assert.equal(s.state(0).lastOfferedRevision, null);
  assert.throws(() => new CardSession().state(0), /No card/);
});

test('batch copy is one exact Undo step on the destination only', () => {
  const s = session();
  const before0 = s.state(0).card.export(), before1 = s.state(1).card.export();
  assert.equal(s.copySaves(1, 0, [{ name: 'KEEP' }, { name: 'ALSO-KEEP' }]), true);
  const after = s.state(0).card.export();
  assert.equal(s.state(0).needsDownload, true);
  assert.equal(s.state(1).canUndo, false);
  assert.deepEqual(s.state(1).card.export(), before1);
  assert.equal(s.undo(0), true);
  assert.deepEqual(s.state(0).card.export(), before0);
  assert.equal(s.state(0).needsDownload, false);
  assert.equal(s.undo(0), false);
  assert.equal(s.redo(0), true);
  assert.deepEqual(s.state(0).card.export(), after);
  assert.equal(s.state(0).needsDownload, true);
});

test('Undo and Redo restore deletion, replacement and conversion byte for byte', () => {
  const s = session();
  const snapshots = [hash(s.state(0).card.export())];
  s.replaceFile(0, '/SAVE-A/bytes-513', new Uint8Array(30000).fill(78));
  snapshots.push(hash(s.state(0).card.export()));
  s.convertLayout(0, 'ecc');
  snapshots.push(hash(s.state(0).card.export()));
  s.deleteSaves(0, ['SAVE-A']);
  snapshots.push(hash(s.state(0).card.export()));
  for (let i = snapshots.length - 2; i >= 0; i--) {
    assert.equal(s.undo(0), true);
    assert.equal(hash(s.state(0).card.export()), snapshots[i]);
  }
  for (let i = 1; i < snapshots.length; i++) {
    assert.equal(s.redo(0), true);
    assert.equal(hash(s.state(0).card.export()), snapshots[i]);
  }
});

test('whole-save replacement is restored exactly by Undo', () => {
  const s = session();
  s.copySaves(0, 1, [{ name: 'SAVE-A' }]);
  s.replaceFile(1, '/SAVE-A/fragmented', new Uint8Array(9).fill(19));
  const previous = s.state(1).card.export();
  s.copySaves(0, 1, [{ name: 'SAVE-A', onConflict: 'replace' }]);
  const replaced = s.state(1).card.export();
  assert.deepEqual(s.state(1).card.readFile('/SAVE-A/fragmented'), s.state(0).card.readFile('/SAVE-A/fragmented'));
  s.undo(1);
  assert.deepEqual(s.state(1).card.export(), previous);
  s.redo(1);
  assert.deepEqual(s.state(1).card.export(), replaced);
});

test('failures and no-ops do not change revisions, history, dirty state or Redo', () => {
  const s = session();
  s.deleteSaves(0, ['SAVE-A']);
  s.undo(0);
  const before = s.state(0), historyBytes = s.historyBytes;
  assert.throws(() => s.deleteSaves(0, ['SAVE-A', 'missing']), /No save/);
  assert.throws(() => s.replaceFile(0, '/SAVE-A/bytes-513', new Uint8Array(8388608)), /more bytes/);
  assert.throws(() => s.copySaves(0, 0, [{ name: 'SAVE-A' }]), /other card/);
  assert.equal(s.deleteSaves(0, []), false);
  assert.equal(s.convertLayout(0, 'data'), false);
  assert.equal(s.replaceFile(0, '/SAVE-A/bytes-513', before.card.readFile('/SAVE-A/bytes-513')), false);
  assert.deepEqual(s.state(0), before);
  assert.equal(s.historyBytes, historyBytes);
  s.redo(0);
  assert.deepEqual(s.state(0).card.entries, []);
});

test('a new edit discards only that card\'s Redo branch', () => {
  const s = session();
  s.deleteSaves(0, ['SAVE-A']); s.undo(0);
  s.deleteSaves(1, ['KEEP']); s.undo(1);
  s.replaceFile(0, '/SAVE-A/bytes-1', new Uint8Array([93]));
  assert.equal(s.state(0).canRedo, false);
  assert.equal(s.state(1).canRedo, true);
});

test('history byte budget is shared across both cards and old boundaries are evicted', () => {
  const s = session();
  assert.equal(s.historyLimitBytes, DEFAULT_HISTORY_BYTES);
  for (let i = 0; i < 12; i++) {
    const slot = i % 2 as CardSlot;
    s.replaceFile(slot, slot === 0 ? '/SAVE-A/bytes-1' : '/KEEP/original', new Uint8Array([i + 60]));
    assert.ok(s.historyBytes <= DEFAULT_HISTORY_BYTES);
  }
  assert.ok(s.historyEvictions > 0);
  for (const slot of [0, 1] as const) {
    const latest = hash(s.state(slot).card.export());
    let count = 0;
    while (s.undo(slot)) { count++; assert.ok(s.historyBytes <= DEFAULT_HISTORY_BYTES); }
    while (s.redo(slot)) assert.ok(s.historyBytes <= DEFAULT_HISTORY_BYTES);
    assert.ok(count > 0 && count < 6);
    assert.equal(hash(s.state(slot).card.export()), latest);
  }
});

test('minimum history budget retains the latest action and handles layout size changes', () => {
  const s = new CardSession(8650752);
  s.open(0, fixture(), 'test.bin');
  const before = s.state(0).card.export();
  s.convertLayout(0, 'ecc');
  assert.equal(s.undo(0), true);
  assert.deepEqual(s.state(0).card.export(), before);
  assert.equal(s.redo(0), true);
  assert.equal(s.state(0).card.layout, 'ecc');
  assert.ok(s.historyBytes <= 8650752);
  for (const limit of [0, -1, Infinity, 8650751, DEFAULT_HISTORY_BYTES + 1]) assert.throws(() => new CardSession(limit), /History limit/);
});

test('Save uses the opened filename extension to choose the output layout', () => {
  const s = session();
  s.replaceFile(0, '/SAVE-A/bytes-1', new Uint8Array([44]));
  const download = s.prepareDownload(0);
  assert.equal(download.filename, 'source.BIN');
  assert.equal(download.bytes.length, 8388608);
  const ps2 = s.prepareDownload(1);
  assert.equal(ps2.filename, 'destination.ps2');
  assert.equal(ps2.bytes.length, 8650752);
  assert.equal(s.state(0).needsDownload, true);
  s.state(0).card.readFile('/SAVE-A/bytes-1'); // A raw dump never marks the card as downloaded.
  assert.equal(s.state(0).needsDownload, true);
  s.markDownloadOffered(download);
  assert.equal(s.state(0).needsDownload, false);
  assert.equal(s.state(0).lastOfferedRevision, download.revision);
  s.undo(0);
  assert.equal(s.state(0).needsDownload, true);
  s.redo(0);
  assert.equal(s.state(0).needsDownload, false);
});

test('Save as converts output without editing the working card or history', () => {
  const s = session();
  const before = s.state(0);
  for (const extension of ['.ps2', '.mc2', '.bin'] as const) {
    const output = s.prepareDownload(0, { extension });
    assert.equal(output.filename, `source${extension}`);
    assert.equal(output.bytes.length, extension === '.ps2' ? 8650752 : 8388608);
    assert.deepEqual(new MemoryCard(output.bytes).export('data'), s.state(0).card.export('data'));
  }
  assert.deepEqual(s.state(0), before);
  assert.equal(s.historyBytes, 0);
});

test('Save converts a mismatched opened filename to its file format', () => {
  const s = new CardSession();
  s.open(0, fixture(), 'data.ps2');
  s.open(1, fixture('destination', 'ecc'), 'spare.MC2');
  const ps2 = s.prepareDownload(0);
  const mc2 = s.prepareDownload(1);
  assert.equal(ps2.filename, 'data.ps2');
  assert.equal(ps2.bytes.length, 8650752);
  assert.equal(mc2.filename, 'spare.MC2');
  assert.deepEqual(mc2.bytes, fixture('destination'));
  assert.equal(s.state(0).card.layout, 'data');
  assert.equal(s.state(1).card.layout, 'ecc');
  assert.equal(s.historyBytes, 0);
});

test('renaming changes the download name without changing card bytes or Undo history', () => {
  const s = session();
  const before = s.state(0);
  const bytes = before.card.export();
  assert.equal(s.renameCard(0, 'My Memory Card'), true);
  assert.equal(s.state(0).filename, 'My Memory Card.BIN');
  assert.equal(s.state(0).needsDownload, true);
  assert.equal(s.state(0).revision, before.revision);
  assert.equal(s.state(0).canUndo, false);
  assert.equal(s.historyBytes, 0);
  assert.deepEqual(s.state(0).card.export(), bytes);
  assert.equal(s.prepareDownload(0).filename, 'My Memory Card.BIN');
  const saveAs = s.prepareDownload(0, { extension: '.ps2' });
  assert.equal(saveAs.filename, 'My Memory Card.ps2');
  assert.equal(saveAs.bytes.length, 8650752);
  s.markDownloadOffered(saveAs);
  assert.equal(s.state(0).needsDownload, false);
  assert.equal(s.renameCard(0, 'Other Card'), true);
  assert.equal(s.state(0).needsDownload, true);
  assert.equal(s.renameCard(0, 'My Memory Card'), true);
  assert.equal(s.state(0).needsDownload, false);
  assert.equal(s.renameCard(0, 'My Memory Card'), false);
});

test('an old download does not acknowledge a later rename', () => {
  const s = session();
  const old = s.prepareDownload(0);
  s.renameCard(0, 'Renamed');
  s.markDownloadOffered(old);
  assert.equal(s.state(0).needsDownload, true);
  assert.throws(() => s.close(0), /not been offered/);
  const current = s.prepareDownload(0);
  assert.equal(current.filename, 'Renamed.BIN');
  s.markDownloadOffered(current);
  assert.equal(s.state(0).needsDownload, false);
  s.close(0);
});

test('renaming rejects unsafe stems without changing the card state', () => {
  const s = session();
  const before = s.state(0);
  for (const name of ['', ' leading', 'trailing ', 'bad/name', 'bad\\name', 'bad?', 'end.', 'CON', 'con.txt', 'a'.repeat(121)]) {
    assert.throws(() => s.renameCard(0, name), /name|characters|reserved/i);
    assert.deepEqual(s.state(0), before);
  }
  assert.equal(s.renameCard(0, 'Card 2026.09'), true);
  assert.equal(s.state(0).filename, 'Card 2026.09.BIN');
});

test('a delayed download marks its prepared revision, not later edits', () => {
  const s = session();
  s.replaceFile(0, '/SAVE-A/bytes-1', new Uint8Array([23]));
  const output = s.prepareDownload(0);
  s.deleteSaves(0, ['SAVE-A']);
  s.markDownloadOffered(output);
  assert.equal(s.state(0).needsDownload, true);
  s.undo(0);
  assert.equal(s.state(0).needsDownload, false);
});

test('close requires an explicit discard for undownloaded edits and clears history', () => {
  const s = session();
  s.deleteSaves(0, ['SAVE-A']);
  assert.throws(() => s.close(0), /changes/);
  s.close(0, true);
  assert.equal(s.historyBytes, 0);
  assert.throws(() => s.state(0), /No card/);
});

test('download acknowledgements cannot apply to a different open card or be forged', () => {
  const s = session();
  const old = s.prepareDownload(0);
  s.close(0);
  s.open(0, fixture('destination'), 'other.bin');
  assert.throws(() => s.markDownloadOffered(old), /currently open/);
  assert.throws(() => s.markDownloadOffered({ ...s.prepareDownload(0) } as CardDownload), /currently open/);
  assert.equal(s.state(0).lastOfferedRevision, null);
});

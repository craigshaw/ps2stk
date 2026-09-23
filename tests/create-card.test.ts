import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { MemoryCard } from '../src/core/index';
import type { CardLayout } from '../src/core/index';
import { decodePsu } from '../src/formats/psu';
import { CardSession } from '../src/session/session';
import { fixture, hash } from './helpers';

const vectors = JSON.parse(readFileSync(new URL('./fixtures/empty-card-vectors.json', import.meta.url), 'utf8'));
const packageSave = () => decodePsu(gunzipSync(readFileSync(new URL('./fixtures/flat.psu.gz', import.meta.url))));

for (const layout of ['data', 'ecc'] as const) {
  test(`empty ${layout} card matches every byte of the independent formatter`, () => {
    const card = MemoryCard.create(layout, new Date(vectors.createdAt));
    assert.equal(card.layout, layout);
    assert.equal(card.byteLength, vectors[layout].bytes);
    assert.equal(hash(card.export()), vectors[layout].sha256);
    assert.deepEqual(card.entries, []);
    assert.equal(card.freeBytes, 7999 * 1024); // Driver quota, minus the root cluster.
    assert.equal(hash(new MemoryCard(card.export()).export()), vectors[layout].sha256);
  });

  test(`empty ${layout} card accepts packages and complete nested saves without changing the source`, () => {
    const empty = MemoryCard.create(layout, new Date(vectors.createdAt));
    const save = packageSave();
    const imported = empty.importSave(save);
    for (const file of save.snapshot().children) if (file.kind === 'file') {
      const name = String.fromCharCode(...file.record.subarray(64, 96)).split('\0')[0];
      assert.deepEqual(imported.readFile(`/${save.name}/${name}`), Uint8Array.from(file.bytes));
    }
    const source = new MemoryCard(fixture());
    const copied = source.copySaveTo(imported, 'SAVE-A');
    assert.deepEqual(copied.readFile('/SAVE-A/NESTED/12345678901234567890123456789012'), source.readFile('/SAVE-A/NESTED/12345678901234567890123456789012'));
    assert.deepEqual(copied.readFile('/PSU-FLAT/bytes-513'), Uint8Array.from(save.readFile('/PSU-FLAT/bytes-513')));
    assert.equal(hash(empty.export()), vectors[layout].sha256);
    assert.equal(hash(source.export()), hash(fixture()));
  });
}

test('creation rejects invalid layout and timestamps', () => {
  assert.throws(() => MemoryCard.create('wrong' as CardLayout), /layout/);
  assert.throws(() => MemoryCard.create('data', new Date(NaN)), /creation date/);
  assert.throws(() => MemoryCard.create('data', new Date('0000-01-01T00:00:00Z')), /creation date/);
});

test('new session cards need a download, protect occupied slots, and undo import to exact empty bytes', () => {
  const session = new CardSession();
  session.create(0, 'new-card-a.ps2');
  const empty = session.state(0);
  assert.equal(empty.needsDownload, true);
  assert.equal(empty.canUndo, false);
  assert.equal(session.historyBytes, 0);
  assert.throws(() => session.close(0), /not been offered/);
  assert.throws(() => session.create(0), /Close/);
  assert.equal(session.state(0).card, empty.card);
  session.create(1, 'new-card-b.ps2');
  assert.notEqual(session.state(1).card, empty.card);
  assert.throws(() => session.create(2 as 0), /two card slots/);
  session.importSave(0, packageSave(), empty.card);
  const imported = session.state(0).card.export();
  session.undo(0);
  assert.deepEqual(session.state(0).card.export(), empty.card.export());
  assert.equal(session.state(0).needsDownload, true);
  const output = session.prepareDownload(0);
  assert.equal(output.filename, 'new-card-a.ps2');
  assert.equal(session.state(0).needsDownload, true);
  session.markDownloadOffered(output);
  assert.equal(session.state(0).needsDownload, false);
  session.redo(0);
  assert.deepEqual(session.state(0).card.export(), imported);
  assert.equal(session.state(0).needsDownload, true);
  session.undo(0);
  assert.equal(session.state(0).needsDownload, false);
  session.close(0);
  session.create(0);
  assert.equal(session.state(0).canRedo, false);
  assert.equal(session.state(0).needsDownload, true);
  assert.throws(() => session.markDownloadOffered(output), /does not belong/);
});

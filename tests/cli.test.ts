import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fixture } from './helpers';

test('CLI refuses to overwrite input cards or an existing raw dump', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ps2stk-cli-'));
  try {
    const source = join(directory, 'source.ps2'), destination = join(directory, 'destination.ps2');
    const sourceBytes = fixture(), destinationBytes = fixture('destination');
    writeFileSync(source, sourceBytes);
    writeFileSync(destination, destinationBytes);
    for (const args of [
      ['copy', source, destination, 'SAVE-A', destination],
      ['copy', source, destination, 'SAVE-A', source],
      ['extract', source, '/SAVE-A/bytes-513', source],
    ]) {
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/card.ts', ...args], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /EEXIST/);
      assert.deepEqual(Uint8Array.from(readFileSync(source)), sourceBytes);
      assert.deepEqual(Uint8Array.from(readFileSync(destination)), destinationBytes);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

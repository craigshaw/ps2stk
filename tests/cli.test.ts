import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    const replacement = join(directory, 'replacement.bin'), plan = join(directory, 'plan.json');
    writeFileSync(replacement, new Uint8Array([1, 2, 3]));
    writeFileSync(plan, JSON.stringify([{ name: 'SAVE-A' }]));
    for (const args of [
      ['copy', source, destination, 'SAVE-A', destination],
      ['copy', source, destination, 'SAVE-A', source],
      ['extract', source, '/SAVE-A/bytes-513', source],
      ['delete', source, source, 'SAVE-A'],
      ['replace', source, '/SAVE-A/bytes-513', replacement, source],
      ['replace', source, '/SAVE-A/bytes-513', replacement, replacement],
      ['convert', source, 'ecc', source],
      ['copy-batch', source, destination, plan, source],
    ]) {
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/card.ts', ...args], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /EEXIST/);
      assert.deepEqual(Uint8Array.from(readFileSync(source)), sourceBytes);
      assert.deepEqual(Uint8Array.from(readFileSync(destination)), destinationBytes);
      assert.deepEqual(readFileSync(replacement), Buffer.from([1, 2, 3]));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI failed batches and invalid conversion produce no output file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ps2stk-cli-failure-'));
  try {
    const source = join(directory, 'source.ps2'), destination = join(directory, 'destination.ps2');
    const plan = join(directory, 'plan.json'), output = join(directory, 'result.ps2');
    writeFileSync(source, fixture());
    writeFileSync(destination, fixture('destination'));
    writeFileSync(plan, JSON.stringify([{ name: 'SAVE-A' }, { name: 'missing' }]));
    for (const args of [
      ['copy-batch', source, destination, plan, output],
      ['delete', source, output, 'SAVE-A', 'missing'],
      ['convert', source, 'unknown', output],
    ]) {
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/card.ts', ...args], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.equal(existsSync(output), false);
    }
    assert.deepEqual(Uint8Array.from(readFileSync(source)), fixture());
    assert.deepEqual(Uint8Array.from(readFileSync(destination)), fixture('destination'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

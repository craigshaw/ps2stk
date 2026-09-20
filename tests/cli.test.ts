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

test('PSU CLI import/export preserves inputs and refuses overwrites or partial output', async () => {
  const { gunzipSync } = await import('node:zlib');
  const { MemoryCard } = await import('../src/core/index');
  const { decodePsu } = await import('../src/formats/psu');
  const directory = mkdtempSync(join(tmpdir(), 'ps2stk-psu-cli-'));
  try {
    const card = join(directory, 'card.ps2'), psu = join(directory, 'save.psu'), result = join(directory, 'result.ps2'), output = join(directory, 'output.psu');
    writeFileSync(card, fixture('destination'));
    writeFileSync(psu, gunzipSync(readFileSync('tests/fixtures/flat.psu.gz')));
    const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/card.ts', ...args], { encoding: 'utf8' });
    assert.equal(run('import-save', card, psu, result).status, 0);
    assert.equal(run('export-save', result, 'PSU-FLAT', output).status, 0);
    const save = decodePsu(new Uint8Array(readFileSync(output)));
    assert.deepEqual(new MemoryCard(new Uint8Array(readFileSync(result))).readFile('/PSU-FLAT/bytes-513'), save.readFile('/PSU-FLAT/bytes-513'));
    for (const path of [card, psu, result, output]) {
      const before = readFileSync(path);
      assert.match(run('import-save', card, psu, path).stderr, /EEXIST/);
      assert.match(run('export-save', result, 'PSU-FLAT', path).stderr, /EEXIST/);
      assert.deepEqual(readFileSync(path), before);
    }
    const failed = join(directory, 'failed.ps2');
    assert.equal(run('import-save', card, output, failed, 'merge').status, 1);
    assert.equal(existsSync(failed), false);
    writeFileSync(psu, new Uint8Array([1,2,3]));
    assert.equal(run('import-save', card, psu, failed).status, 1);
    assert.equal(existsSync(failed), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('legacy CLI content detection and acknowledged MAX export preserve input and reject overwrites', async () => {
  const { gunzipSync } = await import('node:zlib');
  const { decodeSavePackage } = await import('../src/formats/index');
  const directory = mkdtempSync(join(tmpdir(), 'ps2stk-legacy-cli-'));
  try {
    const card=join(directory,'card.ps2'), input=join(directory,'renamed.psu'), result=join(directory,'result.ps2'), output=join(directory,'output.max');
    writeFileSync(card,fixture('destination'));writeFileSync(input,gunzipSync(readFileSync('tests/fixtures/flat.psv.gz')));
    const run=(...args:string[])=>spawnSync(process.execPath,['--import','tsx','scripts/card.ts',...args],{encoding:'utf8'});
    assert.equal(run('import-save',card,input,result).status,0);
    assert.equal(run('export-save',result,'PSU-FLAT',output,'max','no').status,1);assert.equal(existsSync(output),false);
    assert.equal(run('export-save',result,'PSU-FLAT',output,'max','--allow-metadata-loss').status,0);
    assert.equal(decodeSavePackage(readFileSync(output)).format,'max');
    assert.match(run('export-save',result,'PSU-FLAT',output,'max','--allow-metadata-loss').stderr,/EEXIST/);
    assert.deepEqual(new Uint8Array(readFileSync(card)),fixture('destination'));
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('PSV CLI requires acknowledgement, preserves source bytes and refuses overwrites', async () => {
  const { gunzipSync } = await import('node:zlib');
  const { MemoryCard } = await import('../src/core/index');
  const { decodePsu } = await import('../src/formats/psu');
  const { psvDigest } = await import('./psv-helper');
  const directory = mkdtempSync(join(tmpdir(), 'ps2stk-psv-cli-'));
  try {
    const card = join(directory, 'card.ps2'), output = join(directory, 'output.PSV');
    const source = new MemoryCard(fixture('destination', 'ecc')).importSave(decodePsu(new Uint8Array(gunzipSync(readFileSync('tests/fixtures/flat.psu.gz')))));
    writeFileSync(card, source.export());
    const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/card.ts', ...args], { encoding: 'utf8' });
    assert.match(run('export-save', card, 'PSU-FLAT', output, 'psv').stderr, /Acknowledge/);
    assert.equal(existsSync(output), false);
    assert.match(run('export-save', card, 'PSU-FLAT', output, 'psv', '--unknown').stderr, /Unknown export option/);
    assert.equal(existsSync(output), false);
    assert.equal(run('export-save', card, 'PSU-FLAT', output, 'psv', '--allow-metadata-loss').status, 0);
    const exported = readFileSync(output);
    assert.deepEqual(exported.subarray(28, 48), psvDigest(exported));
    for (const existing of [card, output]) {
      const original = readFileSync(existing);
      assert.match(run('export-save', card, 'PSU-FLAT', existing, 'psv', '--allow-metadata-loss').stderr, /EEXIST/);
      assert.deepEqual(readFileSync(existing), original);
    }
    const reimported = join(directory, 'reimported.ps2');
    assert.equal(run('import-save', card, output, reimported, 'replace').status, 0);
    const restored = new MemoryCard(readFileSync(reimported));
    for (const entry of source.extractSave('PSU-FLAT').entry.children) assert.deepEqual(restored.readFile(entry.path), source.readFile(entry.path));
    assert.deepEqual(new Uint8Array(readFileSync(card)), source.export());
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

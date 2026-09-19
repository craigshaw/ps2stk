import { readFile, stat, writeFile } from 'node:fs/promises';
import { MemoryCard } from '../src/core/index';
import type { CardLayout, SaveSelection } from '../src/core/index';

async function open(path: string): Promise<MemoryCard> {
  const { size } = await stat(path);
  if (size !== 8388608 && size !== 8650752) throw new Error('Expected an 8 MiB PS2 image with or without ECC.');
  return new MemoryCard(await readFile(path));
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'inspect' && args.length === 1) {
    const card = await open(args[0]!);
    console.log(JSON.stringify({ layout: card.layout, freeBytes: card.freeBytes, entries: card.entries }, null, 2));
  } else if (command === 'extract' && args.length === 3) {
    const card = await open(args[0]!);
    await writeFile(args[2]!, card.readFile(args[1]!), { flag: 'wx' });
    console.log(`Wrote raw file bytes to ${args[2]}.`);
  } else if (command === 'copy' && (args.length === 4 || args.length === 5)) {
    const [source, destination] = await Promise.all([open(args[0]!), open(args[1]!)]);
    const choice = args[4] ?? 'error';
    if (!['skip', 'replace', 'error'].includes(choice)) throw new Error('Conflict choice must be skip, replace, or error.');
    const result = source.copySavesTo(destination, [{ name: args[2]!, onConflict: choice as NonNullable<SaveSelection['onConflict']> }]);
    await writeFile(args[3]!, result.export(), { flag: 'wx' });
    console.log(`${result === destination ? 'Skipped existing save; wrote unchanged card' : 'Copied save'} to ${args[3]} (${result.layout} layout). Input cards are unchanged.`);
  } else if (command === 'copy-batch' && args.length === 4) {
    const [source, destination] = await Promise.all([open(args[0]!), open(args[1]!)]);
    if ((await stat(args[2]!)).size > 1024 * 1024) throw new Error('Copy plan is too large.');
    const plan: unknown = JSON.parse(await readFile(args[2]!, 'utf8'));
    if (!Array.isArray(plan) || !plan.every(item => item && typeof item.name === 'string' &&
      (item.onConflict === undefined || ['skip', 'replace', 'error'].includes(item.onConflict)))) {
      throw new Error('Copy plan must be an array of {name, onConflict?} entries.');
    }
    const result = source.copySavesTo(destination, plan as SaveSelection[]);
    await writeFile(args[3]!, result.export(), { flag: 'wx' });
    console.log(`Wrote complete batch result to ${args[3]}. Input cards are unchanged.`);
  } else if (command === 'delete' && args.length >= 3) {
    const card = await open(args[0]!);
    const result = card.deleteSaves(args.slice(2));
    await writeFile(args[1]!, result.export(), { flag: 'wx' });
    console.log(`Wrote card after deletion to ${args[1]}. Input card is unchanged.`);
  } else if (command === 'replace' && args.length === 4) {
    const card = await open(args[0]!);
    if ((await stat(args[2]!)).size > 8388608) throw new Error('Replacement file exceeds the card capacity.');
    const result = card.replaceFile(args[1]!, await readFile(args[2]!));
    await writeFile(args[3]!, result.export(), { flag: 'wx' });
    console.log(`Wrote card after file replacement to ${args[3]}. Input files are unchanged.`);
  } else if (command === 'convert' && args.length === 3) {
    const card = await open(args[0]!);
    const result = card.withLayout(args[1]! as CardLayout);
    await writeFile(args[2]!, result.export(), { flag: 'wx' });
    console.log(`Wrote ${result.layout} card to ${args[2]}. Input card is unchanged.`);
  } else {
    throw new Error('Usage: npm run card -- inspect CARD\n' +
      '       npm run card -- extract CARD /SAVE/FILE NEW_OUTPUT\n' +
      '       npm run card -- copy SOURCE DESTINATION SAVE_NAME NEW_OUTPUT [skip|replace|error]\n' +
      '       npm run card -- copy-batch SOURCE DESTINATION PLAN.json NEW_OUTPUT\n' +
      '       npm run card -- delete CARD NEW_OUTPUT SAVE_NAME [SAVE_NAME...]\n' +
      '       npm run card -- replace CARD /SAVE/FILE REPLACEMENT_FILE NEW_OUTPUT\n' +
      '       npm run card -- convert CARD data|ecc NEW_OUTPUT');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

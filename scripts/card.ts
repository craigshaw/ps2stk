import { readFile, stat, writeFile } from 'node:fs/promises';
import { MemoryCard } from '../src/core/index';

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
  } else if (command === 'copy' && args.length === 4) {
    const [source, destination] = await Promise.all([open(args[0]!), open(args[1]!)]);
    const result = source.copySaveTo(destination, args[2]!);
    await writeFile(args[3]!, result.export(), { flag: 'wx' });
    console.log(`Copied ${args[2]} to ${args[3]} (${result.layout} layout). Input cards are unchanged.`);
  } else {
    throw new Error('Usage: npm run card -- inspect CARD\n       npm run card -- extract CARD /SAVE/FILE NEW_OUTPUT\n       npm run card -- copy SOURCE DESTINATION SAVE_NAME NEW_OUTPUT');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

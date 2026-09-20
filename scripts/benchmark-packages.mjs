// Run against the local Vite server: node scripts/benchmark-packages.mjs [URL]
import { chromium, firefox, webkit } from '@playwright/test';
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173');
    const result = await page.evaluate(async () => {
      const { encodePackage, decodePackage } = await import('/src/browser/packages.ts');
      const { SaveContent, makeRecord, recordView } = await import('/src/core/save.ts');
      let seed = 123;
      const bytes = Uint8Array.from({ length: 7800000 }, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed & 255; });
      const record = makeRecord('LARGE', true), file = makeRecord('payload', false);
      recordView(record).setUint32(4, 3, true); recordView(file).setUint32(4, bytes.length, true);
      const save = new SaveContent({ kind: 'directory', record, dot: makeRecord('.', true), dotdot: makeRecord('..', true), children: [{ kind: 'file', record: file, bytes }] });
      let ticks = 0, gap = 0, last = performance.now();
      const timer = setInterval(() => { const now = performance.now(); gap = Math.max(gap, now - last); last = now; ticks++; }, 16);
      const start = performance.now();
      try {
        const output = await encodePackage(save, 'max', true), middle = performance.now(), encodeTicks = ticks;
        ticks = 0;
        const decoded = await decodePackage(output.bytes), actual = decoded.save.readFile('/LARGE/payload');
        if (!actual.every((b, i) => b === bytes[i])) throw new Error('Payload mismatch');
        return { bytes: bytes.length, encodeMs: middle - start, decodeMs: performance.now() - middle, encodeTicks, decodeTicks: ticks, largestTimerGapMs: gap };
      } finally { clearInterval(timer); }
    });
    console.log(JSON.stringify({ browser: name, ...result }));
  } finally { await browser.close(); }
}

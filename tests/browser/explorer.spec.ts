import { expect, test } from "@playwright/test";
import type { Page, Download } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixture } from "../helpers";
import { MemoryCard } from "../../src/core/index";

async function open(page: Page, bytes: Uint8Array, name: string) {
  await page.locator("#open-card").click();
  await page.getByLabel("Memory card image", { exact: true }).setInputFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function downloaded(download: Download) {
  return new Uint8Array(await readFile((await download.path())!));
}

test("two-card copy, replace, raw dump, Undo/Redo and converted download preserve bytes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const source = fixture(),
    destination = fixture("destination", "ecc");
  await page.goto("/");
  await open(page, source, "source.bin");
  await open(page, destination, "destination.ps2");
  const a = page.getByRole("region", { name: "Card A", exact: true }),
    b = page.getByRole("region", { name: "Card B", exact: true });
  await a
    .getByRole("button", { name: "Select SAVE-A (SAVE-A)", exact: true })
    .click();
  await a.getByRole("button", { name: "Copy to B", exact: true }).click();
  await page.getByRole("button", { name: "Apply copy choices" }).click();
  await expect(
    b.getByRole("button", { name: "Select SAVE-A (SAVE-A)", exact: true }),
  ).toBeVisible();
  await b.getByRole("button", { name: "Undo card B" }).click();
  await expect(
    b.getByRole("button", { name: "Select SAVE-A (SAVE-A)", exact: true }),
  ).toHaveCount(0);
  await b.getByRole("button", { name: "Redo card B" }).click();
  await b
    .getByRole("button", { name: "Select SAVE-A (SAVE-A)", exact: true })
    .click();
  await page.getByRole("button", { name: /^bytes-513 / }).click();
  const replacement = Buffer.alloc(2100, 73);
  await page.getByRole("button", { name: "Replace file", exact: true }).click();
  await page.getByLabel("Replacement file", { exact: true }).setInputFiles({
    name: "replacement.dat",
    mimeType: "application/octet-stream",
    buffer: replacement,
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Replace file", exact: true })
    .click();
  const raw = page.waitForEvent("download");
  await page.getByRole("button", { name: "Dump file", exact: true }).click();
  expect(await downloaded(await raw)).toEqual(new Uint8Array(replacement));
  await expect(b.getByText("● Download needed")).toBeVisible();
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  const output = page.waitForEvent("download");
  await b.getByRole("button", { name: "Save card", exact: true }).click();
  const result = new MemoryCard(await downloaded(await output));
  expect(result.layout).toBe("ecc");
  expect(result.readFile("/SAVE-A/bytes-513")).toEqual(
    new Uint8Array(replacement),
  );
  expect(result.readFile("/KEEP/original")).toEqual(
    new MemoryCard(destination).readFile("/KEEP/original"),
  );
  await expect(b.getByText("Download offered")).toBeVisible();
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  await b.getByRole("button", { name: "Save as", exact: true }).click();
  await page.getByLabel("Binary layout").selectOption("data");
  await page.getByLabel("Filename extension").selectOption(".mc2");
  const converted = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download card", exact: true })
    .click();
  const download = await converted;
  expect(download.suggestedFilename()).toBe("destination.mc2");
  expect(await downloaded(download)).toEqual(result.export("data"));
  expect(errors).toEqual([]);
});

test("conflicts default to Skip and explicit Replace can be undone; close protects edits", async ({
  page,
}) => {
  await page.goto("/");
  const bytes = fixture();
  await open(page, bytes, "one.bin");
  await open(page, bytes, "two.bin");
  const a = page.getByRole("region", { name: "Card A", exact: true }),
    b = page.getByRole("region", { name: "Card B", exact: true });
  await a
    .getByRole("button", { name: "Select SAVE-A (SAVE-A)", exact: true })
    .click();
  await a.getByRole("button", { name: "Copy to B" }).click();
  await expect(page.getByLabel("Conflict for SAVE-A")).toHaveValue("skip");
  await page.getByRole("button", { name: "Apply copy choices" }).click();
  await expect(b.getByRole("button", { name: "Undo card B" })).toBeDisabled();
  await b
    .getByRole("button", { name: "Select SAVE-A (SAVE-A)", exact: true })
    .click();
  await b.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete saves", exact: true }).click();
  await b.getByRole("button", { name: "Close card B" }).click();
  await expect(page.getByRole("dialog")).toContainText("not been downloaded");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await b.getByRole("button", { name: "Undo card B" }).click();
  const saved = page.waitForEvent("download");
  await b.getByRole("button", { name: "Save card" }).click();
  expect(await downloaded(await saved)).toEqual(bytes);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Pick up where you left off." }),
  ).toBeVisible();
});

test("keyboard selection, inspector toggle, unsupported folder notice and narrow desktop", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined });
  });
  await page.goto("/");
  await open(page, fixture("destination"), "keyboard.bin");
  const pane = page.getByRole("region", { name: "Card A", exact: true });
  const first = pane.getByRole("button", {
    name: "Select KEEP (KEEP)",
    exact: true,
  });
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Folder dumps require Chrome or Edge", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(
    pane.getByRole("button", {
      name: "Select ALSO-KEEP (ALSO-KEEP)",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Control+a");
  await expect(pane.getByText("2 selected")).toBeVisible();
  await pane.getByRole("button", { name: "Delete", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    pane.getByRole("button", { name: "Delete", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(page.getByRole("complementary")).toHaveCount(0);
  for (const width of [1024, 850, 640, 400]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play icon animation" }),
  ).toBeDisabled();
});

test("invalid card does not replace an open card and third-card flow chooses a slot", async ({
  page,
}) => {
  await page.goto("/");
  await open(page, fixture(), "one.bin");
  await open(page, fixture("destination"), "two.bin");
  await page.locator("#open-card").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Both card slots are in use",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Card A/ })
    .click();
  await page.getByLabel("Memory card image", { exact: true }).setInputFiles({
    name: "invalid.ps2",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(8388608),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("heading", { name: "one.bin" })).toBeVisible();
});

test("folder dump writes exact files through the browser and refuses an existing save folder", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Folder dumps require a Chromium directory picker; fallback coverage is separate.",
  );
  // The picker is replaced with a test-only origin-private directory. The app
  // still exercises real browser directory handles and writable file streams.
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", {
      value: () => navigator.storage.getDirectory(),
    });
  });
  await page.goto("/");
  await open(page, fixture(), "dump.bin");
  await page
    .getByRole("button", { name: "Select SAVE-A (SAVE-A)", exact: true })
    .click();
  await page.getByRole("button", { name: "Dump save to folder" }).click();
  await page.getByRole("button", { name: "Choose destination folder" }).click();
  await expect(page.getByRole("status")).toContainText("Dumped 11 raw files");
  const hashes = await page.evaluate(async () => {
    const root = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle("SAVE-A");
    const paths = [
      "bytes-0",
      "bytes-513",
      "NESTED/12345678901234567890123456789012",
    ];
    const output: Record<string, number[]> = {};
    for (const path of paths) {
      const parts = path.split("/");
      let dir = root;
      for (const part of parts.slice(0, -1))
        dir = await dir.getDirectoryHandle(part);
      output[path] = [
        ...new Uint8Array(
          await (
            await (await dir.getFileHandle(parts.at(-1)!)).getFile()
          ).arrayBuffer(),
        ),
      ];
    }
    return output;
  });
  const card = new MemoryCard(fixture());
  for (const [path, bytes] of Object.entries(hashes))
    expect(new Uint8Array(bytes)).toEqual(card.readFile(`/SAVE-A/${path}`));
  await page.getByRole("button", { name: "Dump save to folder" }).click();
  await page.getByRole("button", { name: "Choose destination folder" }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await expect(page.getByRole("alert")).toContainText("No files were written");
  await expect(page.getByText("Unchanged", { exact: true })).toBeVisible();
});

test("explicit whole-save replacement and capacity failure preserve the correct history", async ({
  page,
}) => {
  const source = new MemoryCard(fixture());
  const changed = source.replaceFile("/SAVE-A/bytes-513", new Uint8Array([90]));
  await page.goto("/");
  await open(page, source.export(), "source.bin");
  await open(page, changed.export(), "changed.bin");
  const a = page.getByRole("region", { name: "Card A", exact: true }),
    b = page.getByRole("region", { name: "Card B", exact: true });
  await a
    .getByRole("button", { name: "Select SAVE-A (SAVE-A)", exact: true })
    .click();
  await a.getByRole("button", { name: "Copy to B" }).click();
  await page.getByLabel("Conflict for SAVE-A").selectOption("replace");
  await page.getByRole("button", { name: "Apply copy choices" }).click();
  let output = page.waitForEvent("download");
  await b.getByRole("button", { name: "Save card" }).click();
  expect(
    new MemoryCard(await downloaded(await output)).readFile(
      "/SAVE-A/bytes-513",
    ),
  ).toEqual(source.readFile("/SAVE-A/bytes-513"));
  await b.getByRole("button", { name: "Undo card B" }).click();
  output = page.waitForEvent("download");
  await b.getByRole("button", { name: "Save card" }).click();
  expect(await downloaded(await output)).toEqual(changed.export());
  await b
    .getByRole("button", { name: "Select SAVE-A (SAVE-A)", exact: true })
    .click();
  await page.getByRole("button", { name: /^bytes-513 / }).click();
  await page.getByRole("button", { name: "Replace file", exact: true }).click();
  await page.getByLabel("Replacement file", { exact: true }).setInputFiles({
    name: "huge.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(8388608),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Replace file", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("more bytes");
  await expect(b.getByRole("button", { name: "Redo card B" })).toBeEnabled();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  output = page.waitForEvent("download");
  await b.getByRole("button", { name: "Save card" }).click();
  expect(await downloaded(await output)).toEqual(changed.export());
});

test("icons animate only on demand, pause, and stop for reduced motion", async ({
  page,
}) => {
  const { animatedCard } = await import("../icon-helper");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await open(page, animatedCard(), "animated.bin");
  const tile = page.locator(".save-select canvas");
  await expect(page.getByText("Loading icon", { exact: true })).toHaveCount(0);
  const pixels = (which: typeof tile) =>
    which.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await expect
    .poll(() => tile.evaluate((c: HTMLCanvasElement) => c.width))
    .toBeGreaterThan(1);
  const still = await pixels(tile);
  await page.waitForTimeout(150);
  expect(await pixels(tile)).toBe(still);
  await page.locator(".save-select").hover();
  await expect.poll(() => pixels(tile)).not.toBe(still);
  await page.locator(".save-select").click();
  const preview = page.locator(".large-preview canvas");
  await expect
    .poll(() => preview.evaluate((c: HTMLCanvasElement) => c.width))
    .toBeGreaterThan(1);
  const start = await pixels(preview);
  await expect.poll(() => pixels(preview)).not.toBe(start);
  await page.getByRole("button", { name: "Pause icon animation" }).click();
  await page.waitForTimeout(100);
  const paused = await pixels(preview);
  await page.waitForTimeout(150);
  expect(await pixels(preview)).toBe(paused);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByRole("button", { name: "Play icon animation" }),
  ).toBeDisabled();
  await page.locator(".save-select").hover();
  await page.waitForTimeout(100);
  const reduced = await pixels(tile);
  await page.waitForTimeout(150);
  expect(await pixels(tile)).toBe(reduced);
  expect(errors).toEqual([]);
});

test("fuller card panes scroll without clipping save labels at a narrow desktop width", async ({
  page,
}) => {
  const { raw } = await import("../helpers");
  let card = new MemoryCard(fixture("destination"));
  for (let i = 0; i < 8; i++) {
    const bytes = fixture(),
      offset = raw(bytes).entry("/SAVE-A") + 64,
      name = `SAVE-${i}`;
    bytes.fill(0, offset, offset + 32);
    bytes.set(new TextEncoder().encode(name), offset);
    card = new MemoryCard(bytes).copySaveTo(card, name);
  }
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      !request.url().startsWith("http://127.0.0.1:5173/")
    )
      requests.push(request.url());
  });
  await page.setViewportSize({ width: 850, height: 900 });
  await page.goto("/");
  await open(page, card.export(), "fuller.bin");
  await open(page, fixture(), "second.bin");
  const pane = page.getByRole("region", { name: "Card A", exact: true });
  const first = pane.locator(".save-tile").first();
  expect((await first.boundingBox())!.height).toBeGreaterThan(150);
  expect(
    await pane
      .locator(".save-items")
      .evaluate((e) => e.scrollHeight > e.clientHeight),
  ).toBe(true);
  await pane
    .getByRole("button", { name: "Select SAVE-7 (SAVE-7)", exact: true })
    .click();
  await expect(
    page
      .getByRole("complementary")
      .getByRole("heading", { name: "SAVE-7", exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([]);
});

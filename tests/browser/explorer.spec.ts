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

test('landing page fits a roomy window and scrolls on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('brand artwork loads and its live descriptor stays readable at desktop and narrow widths', async ({ page }) => {
  await page.goto('/');
  const wordmark = page.getByRole('banner').getByRole('img', { name: 'PS2STK', exact: true });
  const caption = page.getByRole('banner').getByText('PS2 Save Toolkit', { exact: true });
  await expect(wordmark).toBeVisible();
  await expect.poll(() => wordmark.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);

  for (const loaded of [false, true]) {
    if (loaded) await open(page, fixture(), 'brand-layout.ps2');
    for (const width of [1440, 1024, 768, 760, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(caption).toBeVisible();
      const layout = await caption.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const header = element.closest('header')!.getBoundingClientRect();
        return {
          fontSize: parseFloat(getComputedStyle(element).fontSize),
          left: rect.left, right: rect.right, bottom: rect.bottom,
          headerBottom: header.bottom, clipped: element.scrollWidth > element.clientWidth,
        };
      });
      expect(layout.fontSize).toBeGreaterThanOrEqual(12);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.bottom).toBeLessThanOrEqual(layout.headerBottom);
      expect(layout.clipped).toBe(false);
      const artwork = await wordmark.boundingBox();
      expect(artwork).not.toBeNull();
      expect(artwork!.x).toBeGreaterThanOrEqual(0);
      expect(artwork!.x + artwork!.width).toBeLessThanOrEqual(width);
    }
  }
});

test('create an empty card, import a package, undo and download both layouts', async ({ page }, testInfo) => {
  const { gunzipSync } = await import('node:zlib');
  const { decodePsu } = await import('../../src/formats/psu');
  const bytes = gunzipSync(await readFile('tests/fixtures/flat.psu.gz'));
  await page.goto('/');
  await page.getByRole('main').getByRole('button', { name: 'New memory card', exact: true }).click();
  const a = page.getByRole('region', { name: 'Card A', exact: true });
  await expect(a.getByRole('heading', { name: 'new-card-a.ps2' })).toBeVisible();
  await expect(a.getByText('No saves on this card.', { exact: true })).toBeVisible();
  await expect(a.getByText('● Download card to keep it', { exact: true })).toBeVisible();
  await expect(a.getByRole('button', { name: 'Undo card A' })).toBeDisabled();
  await a.getByRole('button', { name: 'Close card A' }).click();
  await expect(page.getByRole('button', { name: 'Discard and close' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await a.getByRole('button', { name: 'Import save', exact: true }).click();
  await page.getByLabel('Save package', { exact: true }).setInputFiles({ name: 'save.psu', mimeType: 'application/octet-stream', buffer: bytes });
  await page.getByRole('dialog').getByRole('button', { name: 'Import save', exact: true }).click();
  await expect(a.getByRole('button', { name: 'Select PSU-FLAT (PSU-FLAT)', exact: true })).toBeVisible();
  await a.getByRole('button', { name: 'Undo card A' }).click();
  await expect(a.getByText('No saves on this card.', { exact: true })).toBeVisible();
  await expect(a.getByText('● Download card to keep it', { exact: true })).toBeVisible();
  const emptyDownload = page.waitForEvent('download');
  await a.getByRole('button', { name: 'Download card', exact: true }).click();
  const empty = await emptyDownload;
  expect(empty.suggestedFilename()).toBe('new-card-a.ps2');
  const emptyCard = new MemoryCard(await downloaded(empty));
  expect(emptyCard.layout).toBe('ecc');
  expect(emptyCard.entries).toHaveLength(0);
  await expect(a.getByText('Download started', { exact: true })).toBeVisible();
  await a.getByRole('button', { name: 'Redo card A' }).click();
  await a.getByRole('button', { name: 'Download as', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).not.toContainText('ECC');
  await expect(dialog).not.toContainText('Binary layout');
  await page.screenshot({ path: testInfo.outputPath('save-as-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('save-as-narrow.png') });
  await page.getByLabel('Card file type').selectOption('.bin');
  const editedDownload = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Download card', exact: true }).click();
  const editedFile = await editedDownload;
  expect(editedFile.suggestedFilename()).toBe('new-card-a.bin');
  const edited = new MemoryCard(await downloaded(editedFile));
  expect(edited.layout).toBe('data');
  expect(edited.readFile('/PSU-FLAT/bytes-513')).toEqual(decodePsu(bytes).readFile('/PSU-FLAT/bytes-513'));
});

test('new cards use only empty slots and remain keyboard accessible at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await open(page, fixture(), 'existing.ps2');
  const create = page.getByRole('banner').getByRole('button', { name: 'New memory card', exact: true });
  await create.focus();
  await page.keyboard.press('Enter');
  const b = page.getByRole('region', { name: 'Card B', exact: true });
  await expect(b.getByRole('heading', { name: 'new-card-b.ps2' })).toBeVisible();
  await expect(create).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'existing.ps2' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await b.getByRole('button', { name: 'Close card B' }).click();
  await page.getByRole('button', { name: 'Discard and close', exact: true }).click();
  await expect(create).toBeEnabled();
});

test('loaded cards fit a roomy window and scroll in a short window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await open(page, fixture(), 'first.ps2');
  const pageOverflow = () => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(await pageOverflow()).toBeLessThanOrEqual(1);

  const first = page.getByRole('region', { name: 'Card A', exact: true });
  await first.getByRole('button', { name: 'Select SAVE-A (SAVE-A)', exact: true }).click();
  expect(await pageOverflow()).toBeLessThanOrEqual(1);
  expect(await page.locator('.inspector').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.getByRole('banner').getByRole('button', { name: 'New memory card', exact: true }).click();
  await first.getByRole('button', { name: 'Activate card A' }).click();
  expect(await pageOverflow()).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1920, height: 850 });
  expect(await pageOverflow()).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1024, height: 600 });
  expect(await pageOverflow()).toBeGreaterThan(0);
  await page.setViewportSize({ width: 761, height: 720 });
  expect(await pageOverflow()).toBeGreaterThan(0);
  const paneFooterBottom = await page.locator('.pane-footer').evaluateAll(elements =>
    Math.max(...elements.map(element => element.getBoundingClientRect().bottom)),
  );
  const pageFooterTop = await page.locator('.statusbar').evaluate(element => element.getBoundingClientRect().top);
  expect(paneFooterBottom).toBeLessThanOrEqual(pageFooterTop);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await pageOverflow()).toBeGreaterThan(0);
});

test('card names can be edited inline and used for both card download actions', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('main').getByRole('button', { name: 'New memory card', exact: true }).click();
  const card = page.getByRole('region', { name: 'Card A', exact: true });
  const rename = card.getByRole('button', { name: 'Rename card A' });
  await rename.focus();
  await page.keyboard.press('Enter');
  const name = card.getByRole('textbox', { name: 'Card A name' });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('new-card-a');
  await expect(card.getByText('.ps2', { exact: true })).toBeVisible();
  await name.fill('bad/name');
  await name.press('Enter');
  await expect(card.getByRole('alert')).toContainText('reserved filename characters');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await name.press('Escape');
  await expect(rename).toBeFocused();
  await expect(card.getByRole('heading', { name: 'new-card-a.ps2' })).toBeVisible();
  await rename.click();
  await name.fill('My Memory Card');
  await page.screenshot({ path: testInfo.outputPath('rename-card-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('rename-card-narrow.png') });
  await expect(card.getByRole('button', { name: 'Download card', exact: true })).toBeDisabled();
  await name.press('Enter');
  await expect(card.getByRole('heading', { name: 'My Memory Card.ps2' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Undo card A' })).toBeDisabled();
  const first = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Download card', exact: true }).click();
  const firstFile = await first;
  expect(firstFile.suggestedFilename()).toBe('My Memory Card.ps2');
  expect(new MemoryCard(await downloaded(firstFile)).layout).toBe('ecc');
  await expect(card.getByText('Download started', { exact: true })).toBeVisible();
  await rename.click();
  await name.fill('Another Card');
  await card.getByRole('button', { name: 'Apply card A name' }).click();
  await expect(card.getByText('● Download card to keep it', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Close card A' }).click();
  await expect(page.getByRole('button', { name: 'Discard and close' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await card.getByRole('button', { name: 'Download as', exact: true }).click();
  await page.getByLabel('Card file type').selectOption('.bin');
  const second = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Download card', exact: true }).click();
  const secondFile = await second;
  expect(secondFile.suggestedFilename()).toBe('Another Card.bin');
  expect(new MemoryCard(await downloaded(secondFile)).layout).toBe('data');
  await expect(card.getByText('Download started', { exact: true })).toBeVisible();
  await page.getByRole('banner').getByRole('button', { name: 'New memory card', exact: true }).click();
  await page.setViewportSize({ width: 850, height: 900 });
  await rename.click();
  expect(await card.locator('.card-header').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

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
  await expect(page.getByRole('dialog')).not.toContainText('Replace removes');
  await expect(page.getByRole('dialog')).toContainText('Insufficient space leaves both cards unchanged.');
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
  await expect(b.getByText("● Download card to keep it")).toBeVisible();
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  const output = page.waitForEvent("download");
  await b.getByRole("button", { name: "Download card", exact: true }).click();
  const result = new MemoryCard(await downloaded(await output));
  expect(result.layout).toBe("ecc");
  expect(result.readFile("/SAVE-A/bytes-513")).toEqual(
    new Uint8Array(replacement),
  );
  expect(result.readFile("/KEEP/original")).toEqual(
    new MemoryCard(destination).readFile("/KEEP/original"),
  );
  await expect(b.getByText("Download started")).toBeVisible();
  expect(
    await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  await b.getByRole("button", { name: "Download as", exact: true }).click();
  await expect(page.getByRole('dialog')).not.toContainText('ECC');
  await page.getByLabel("Card file type").selectOption(".mc2");
  const converted = page.waitForEvent("download");
  await page.getByRole('dialog')
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
  await expect(page.getByRole('dialog')).toContainText('Replace removes the entire destination save.');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const conflict = page.getByLabel('Conflict for SAVE-A');
    await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(conflict).toBeFocused();
    // The complete keyboard focus ring must fit within the scroll container.
    expect(await conflict.evaluate((element) => {
      const plan = element.closest('.copy-plan')!;
      const bounds = plan.getBoundingClientRect();
      const control = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const ring = parseFloat(style.outlineWidth) + Math.max(0, parseFloat(style.outlineOffset));
      return style.outlineStyle !== 'none' && control.left - ring >= bounds.left &&
        control.right + ring <= bounds.left + plan.clientWidth;
    })).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await b.getByRole("button", { name: "Download card" }).click();
  expect(await downloaded(await saved)).toEqual(bytes);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The Swiss Army knife for PS2 saves" }),
  ).toBeVisible();
});

test("keyboard selection, inspector toggle and narrow desktop", async ({
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
    let cancelled = false;
    Object.defineProperty(window, "showDirectoryPicker", {
      value: () => {
        if (!cancelled) { cancelled = true; return Promise.reject(new DOMException('Cancelled', 'AbortError')); }
        return navigator.storage.getDirectory();
      },
    });
  });
  await page.goto("/");
  await open(page, fixture(), "dump.bin");
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await page
    .getByRole("button", { name: "Select SAVE-A (SAVE-A)", exact: true })
    .click();
  await page.getByRole("button", { name: "Export selected save", exact: true }).click();
  await page.getByLabel('Output type').selectOption('folder');
  await page.getByRole("button", { name: "Choose folder", exact: true }).click();
  // Cancelling the picker preserves the review and makes no card or folder changes.
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose folder', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo card A' })).toBeDisabled();
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Exported 11 raw files");
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
  await page.getByRole("button", { name: "Export selected save", exact: true }).click();
  await page.getByLabel('Output type').selectOption('folder');
  await page.getByRole("button", { name: "Choose folder", exact: true }).click();
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
  await b.getByRole("button", { name: "Download card" }).click();
  expect(
    new MemoryCard(await downloaded(await output)).readFile(
      "/SAVE-A/bytes-513",
    ),
  ).toEqual(source.readFile("/SAVE-A/bytes-513"));
  await b.getByRole("button", { name: "Undo card B" }).click();
  output = page.waitForEvent("download");
  await b.getByRole("button", { name: "Download card" }).click();
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
  await b.getByRole("button", { name: "Download card" }).click();
  expect(await downloaded(await output)).toEqual(changed.export());
});

test("card icons stay still; inspector animation pauses and respects reduced motion", async ({
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
  await page.waitForTimeout(150);
  expect(await pixels(tile)).toBe(still);
  await page.locator(".save-select").click();
  expect(await pixels(tile)).toBe(still);
  await expect(page.locator(".view-icon-button")).toHaveText("View icon");
  const preview = page.locator(".large-preview canvas");
  const background = page.locator(".large-preview .icon-sys-background");
  await expect(background).toHaveCSS("opacity", "0.5");
  await expect(background).toHaveCSS("background-image", /rgb\(10, 20, 30\).*rgb\(40, 50, 60\)/);
  await expect(background.locator("span")).toHaveCSS("background-image", /rgb\(70, 80, 90\).*rgb\(100, 110, 120\)/);
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

test("icon viewer shows each referenced icon and extra models", async ({ page }) => {
  const { iconGalleryCard } = await import("../icon-helper");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await open(page, iconGalleryCard(), "icons.bin");
  await page.getByRole("button", { name: /Select Synthetic icon gallery/ }).click();
  const openViewer = page.getByRole("button", { name: "View icons", exact: true });
  await openViewer.focus();
  await page.keyboard.press("Enter");
  const viewer = page.getByRole("dialog", { name: "Icon Viewer" });
  await expect(viewer.getByRole("button", { name: "Normal icon.ico" })).toHaveAttribute("aria-pressed", "true");
  const canvas = viewer.locator("canvas");
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBeGreaterThan(1);
  const moving = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement, before) => element.toDataURL() !== before, moving)).toBe(true);
  await viewer.getByRole("button", { name: "Pause icon animation" }).click();
  await page.waitForTimeout(100);
  const normal = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.waitForTimeout(150);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(normal);
  await viewer.getByRole("button", { name: "Copy copy.ico" }).click();
  await expect(viewer.getByText("copy.ico", { exact: true }).first()).toBeVisible();
  await expect(viewer.getByRole("img", { name: /Copy icon/ })).toBeVisible();
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement, before) => element.toDataURL() !== before, normal)).toBe(true);
  await viewer.getByRole("button", { name: "Delete del.ico" }).click();
  await expect(viewer.getByRole("img", { name: /Delete icon/ })).toBeVisible();
  await viewer.getByRole("button", { name: "Other BONUS/extra.ico" }).click();
  await expect(viewer.getByRole("img", { name: /Other icon/ })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(viewer.getByRole("button", { name: "Play icon animation" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(openViewer).toBeFocused();
  await page.getByRole("button", { name: "copy.ico" }).click();
  await page.getByRole("button", { name: "View icon", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Icon Viewer" }).getByRole("button", { name: "Copy copy.ico" })).toHaveAttribute("aria-pressed", "true");
  const resized = page.getByRole("dialog", { name: "Icon Viewer" }).locator("canvas");
  const ratioError = () => resized.evaluate((element: HTMLCanvasElement) =>
    Math.abs(element.width / element.height - element.clientWidth / element.clientHeight));
  await expect.poll(ratioError).toBeLessThan(0.01);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(ratioError).toBeLessThan(0.01);
});

test("icon viewer free view freezes, rotates, zooms, and resets", async ({ page }, testInfo) => {
  const { iconGalleryCard } = await import("../icon-helper");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await open(page, iconGalleryCard(), "icons.bin");
  await page.getByRole("button", { name: /Select Synthetic icon gallery/ }).click();
  await page.getByRole("button", { name: "View icons", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "Icon Viewer" });
  const canvas = viewer.locator("canvas");
  const pixels = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const paintedPixels = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext("2d")!.getImageData(0, 0, element.width, element.height).data;
    let count = 0;
    for (let at = 3; at < data.length; at += 4) if (data[at]! > 0) count++;
    return count;
  });
  const dialogBox = () => viewer.evaluate((dialog) => {
    const { x, y, width, height } = dialog.getBoundingClientRect();
    return { x, y, width, height };
  });
  const free = viewer.getByRole("button", { name: "Free View" });
  await expect(free).toBeEnabled();
  const playbackBox = await dialogBox();
  await free.click();
  expect(await dialogBox()).toEqual(playbackBox);
  await expect(free).toHaveAttribute("aria-pressed", "true");
  await expect(canvas).toHaveAttribute("tabindex", "0");
  await viewer.getByRole("button", { name: "Reset view" }).click();
  await page.waitForTimeout(60);
  const home = await pixels();
  await page.waitForTimeout(150);
  expect(await pixels()).toBe(home);

  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 35, { steps: 5 });
  await page.mouse.up();
  await expect.poll(pixels).not.toBe(home);
  const rotated = await pixels();
  await canvas.hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(pixels).not.toBe(rotated);

  await viewer.getByRole("button", { name: "Reset view" }).click();
  await expect.poll(pixels).toBe(home);
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(pixels).not.toBe(home);
  await page.keyboard.press("0");
  await expect.poll(pixels).toBe(home);
  const homeSize = await paintedPixels();
  await page.keyboard.press("=");
  await expect.poll(paintedPixels).toBeGreaterThan(homeSize);
  await page.keyboard.press("0");
  await expect.poll(pixels).toBe(home);
  await page.keyboard.press("-");
  await expect.poll(paintedPixels).toBeLessThan(homeSize);

  await viewer.getByRole("button", { name: "Playback" }).click();
  expect(await dialogBox()).toEqual(playbackBox);
  await expect(viewer.getByRole("button", { name: "Pause icon animation" })).toBeVisible();
  const playback = await pixels();
  await expect.poll(pixels).not.toBe(playback);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(viewer.getByRole("button", { name: "Play icon animation" })).toBeDisabled();
  const reducedPlaybackBox = await dialogBox();
  await free.click();
  expect(await dialogBox()).toEqual(reducedPlaybackBox);
  await viewer.getByRole("button", { name: "Reset view" }).click();
  await page.waitForTimeout(60);
  const still = await pixels();
  await page.waitForTimeout(150);
  expect(await pixels()).toBe(still);
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(pixels).not.toBe(still);

  await viewer.getByRole("button", { name: "Copy copy.ico" }).click();
  await expect(free).toHaveAttribute("aria-pressed", "true");
  await expect(viewer.getByRole("button", { name: "Reset view" })).toBeEnabled();
  if (testInfo.project.name === "chromium") {
    await viewer.screenshot({ path: testInfo.outputPath("free-view-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await viewer.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await viewer.screenshot({ path: testInfo.outputPath("free-view-narrow.png") });
    const narrowFreeBox = await dialogBox();
    await viewer.getByRole("button", { name: "Playback" }).click();
    expect(await dialogBox()).toEqual(narrowFreeBox);
    await viewer.screenshot({ path: testInfo.outputPath("playback-narrow.png") });
  }
});

test("icon viewer hides choices when all icon roles use the same model", async ({ page }, testInfo) => {
  const { iconGalleryCard } = await import("../icon-helper");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 914, height: 743 });
  await page.goto("/");
  await open(page, iconGalleryCard("shared"), "shared-icons.bin");
  await page.getByRole("button", { name: /Select Synthetic icon gallery/ }).click();
  await page.getByRole("button", { name: "View icons", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "Icon Viewer" });
  await expect(viewer.getByRole("group", { name: "Icons in this save" })).toHaveCount(0);
  await expect(viewer).not.toContainText("identical to the Normal icon");
  expect(await viewer.evaluate((dialog) => dialog.scrollHeight <= dialog.clientHeight)).toBe(true);
  await expect(viewer.getByRole("button", { name: "Pause icon animation" })).toBeVisible();
  await viewer.screenshot({ path: testInfo.outputPath("shared-icon-viewer.png") });
  await page.keyboard.press("Escape");

  await open(page, iconGalleryCard("identical"), "identical-icons.bin");
  await page.getByRole("button", { name: /Select Synthetic icon gallery/ }).last().click();
  await page.getByRole("button", { name: "View icons", exact: true }).click();
  const identical = page.getByRole("dialog", { name: "Icon Viewer" });
  await expect(identical.getByRole("group", { name: "Icons in this save" })).toHaveCount(0);
  expect(await identical.evaluate((dialog) => dialog.scrollHeight <= dialog.clientHeight)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await identical.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
});

test("icon viewer fits distinct model choices without a dialog scrollbar", async ({ page }) => {
  const { iconGalleryCard } = await import("../icon-helper");
  await page.goto("/");
  await open(page, iconGalleryCard(), "distinct-icons.bin");
  await page.getByRole("button", { name: /Select Synthetic icon gallery/ }).click();
  await page.getByRole("button", { name: "View icons", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "Icon Viewer" });
  await expect(viewer.getByRole("group", { name: "Icons in this save" }).getByRole("button")).toHaveCount(4);
  const free = viewer.getByRole("button", { name: "Free View" });
  await expect(free).toBeEnabled();

  for (const viewport of [{ width: 928, height: 752 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const heights: number[] = [];
    const layout = () => viewer.evaluate((dialog) => {
      const stage = dialog.querySelector(".icon-viewer-stage")!;
      const choices = dialog.querySelector(".icon-viewer-choices")!;
      return {
        dialogHeight: dialog.getBoundingClientRect().height,
        scrollHeight: dialog.scrollHeight,
        clientHeight: dialog.clientHeight,
        stageHeight: stage.getBoundingClientRect().height,
        choicesBottom: choices.getBoundingClientRect().bottom,
        dialogBottom: dialog.getBoundingClientRect().bottom,
      };
    });
    for (const mode of ["Playback", "Free View"]) {
      await viewer.getByRole("button", { name: mode, exact: true }).click();
      const bounds = await layout();
      heights.push(bounds.dialogHeight);
      expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.clientHeight);
      expect(bounds.stageHeight).toBeGreaterThan(180);
      expect(bounds.choicesBottom).toBeLessThan(bounds.dialogBottom);
    }
    expect(heights[1]).toBe(heights[0]);
  }
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

test("PSU import review, cancel, export and exact Undo/Redo work without folder access", async ({ page }) => {
  const { gunzipSync } = await import('node:zlib');
  const { decodePsu } = await import('../../src/formats/psu');
  const packageBytes = gunzipSync(await readFile('tests/fixtures/flat.psu.gz'));
  const original = fixture('destination', 'ecc');
  await page.addInitScript(() => Object.defineProperty(window, 'showDirectoryPicker', { value: undefined }));
  await page.goto('/');
  await open(page, fixture('destination'), 'first.bin');
  await open(page, original, 'second.ps2');
  const pane = page.getByRole('region', { name: 'Card B', exact: true });
  const firstPane = page.getByRole('region', { name: 'Card A', exact: true });
  const load = async (buffer = packageBytes) => {
    await pane.getByRole('button', { name: 'Import save', exact: true }).click();
    await page.getByLabel('Save package', { exact: true }).setInputFiles({ name: 'renamed.bin', mimeType: 'application/octet-stream', buffer });
  };
  await load();
  await expect(page.getByRole('dialog')).toContainText('Card B: second.ps2');
  await expect(page.getByRole('dialog')).toContainText('EMS (.psu)');
  await expect(page.getByRole('dialog')).toContainText('Required allocation');
  await page.keyboard.press('Escape');
  await expect(pane.getByRole('button', { name: 'Import save', exact: true })).toBeFocused();
  await expect(pane.getByRole('button', { name: 'Undo card B' })).toBeDisabled();
  await load();
  await page.getByRole('dialog').getByRole('button', { name: 'Import save', exact: true }).click();
  await expect(pane.getByRole('button', { name: 'Select PSU-FLAT (PSU-FLAT)', exact: true })).toBeVisible();
  await expect(firstPane.getByRole('button', { name: 'Select PSU-FLAT (PSU-FLAT)', exact: true })).toHaveCount(0);
  await expect(page.getByRole('complementary').getByRole('heading', { name: 'PSU-FLAT', exact: true })).toBeVisible();
  await expect(pane.getByText('● Download card to keep it')).toBeVisible();
  await pane.getByRole('button', { name: 'Export selected save', exact: true }).click();
  await expect(page.getByLabel('Output type')).toHaveValue('psu');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download save', exact: true }).click();
  const output = await download;
  expect(output.suggestedFilename()).toBe('PSU-FLAT.psu');
  const exported = decodePsu(await downloaded(output));
  expect(exported.readFile('/PSU-FLAT/bytes-513')).toEqual(decodePsu(packageBytes).readFile('/PSU-FLAT/bytes-513'));
  await expect(pane.getByText('● Download card to keep it')).toBeVisible();
  await pane.getByRole('button', { name: 'Undo card B' }).click();
  const whole = page.waitForEvent('download');
  await pane.getByRole('button', { name: 'Download card', exact: true }).click();
  expect(await downloaded(await whole)).toEqual(original);
  await pane.getByRole('button', { name: 'Redo card B' }).click();
  await load();
  await expect(page.getByLabel('Import conflict')).toHaveValue('skip');
  await page.getByRole('button', { name: 'Skip import', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Skipped');
  // A valid smaller package with the same identity removes all old files on replacement.
  const empty = gunzipSync(await readFile('tests/fixtures/empty.psu.gz'));
  empty.fill(0, 64, 96); empty.set(Buffer.from('PSU-FLAT'), 64);
  await load(empty);
  await page.getByLabel('Import conflict').selectOption('replace');
  await page.getByRole('button', { name: 'Replace entire save', exact: true }).click();
  const replaced = page.waitForEvent('download');
  await pane.getByRole('button', { name: 'Download card', exact: true }).click();
  expect(new MemoryCard(await downloaded(await replaced)).extractSave('PSU-FLAT').fileCount).toBe(0);
  await pane.getByRole('button', { name: 'Undo card B' }).click();
  const restored = page.waitForEvent('download');
  await pane.getByRole('button', { name: 'Download card', exact: true }).click();
  expect(new MemoryCard(await downloaded(await restored)).readFile('/PSU-FLAT/bytes-513')).toEqual(exported.readFile('/PSU-FLAT/bytes-513'));
  await expect(pane.getByRole('button', { name: 'Redo card B' })).toBeEnabled();
  await load(Buffer.from([0, 1, 2]));
  await expect(page.getByRole('alert')).toContainText('Unsupported save package');
  await expect(pane.getByRole('button', { name: 'Redo card B' })).toBeEnabled();
});

test("PSU capacity failure and nested export leave the card intact; narrow review remains usable", async ({ page }) => {
  const { nearlyFull } = await import('../helpers');
  const { gunzipSync } = await import('node:zlib');
  await page.goto('/');
  await open(page, nearlyFull(0), 'full.bin');
  const pane = page.getByRole('region', { name: 'Card A', exact: true });
  await pane.getByRole('button', { name: 'Import save', exact: true }).click();
  await page.getByLabel('Save package', { exact: true }).setInputFiles({ name: 'test.psu', mimeType: 'application/octet-stream', buffer: gunzipSync(await readFile('tests/fixtures/flat.psu.gz')) });
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('more space');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Import save', exact: true })).toBeDisabled();
  for (const width of [850, 400]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.getByRole('dialog').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(pane.getByRole('button', { name: 'Undo card A' })).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, fixture(), 'nested.bin');
  const b = page.getByRole('region', { name: 'Card B', exact: true });
  await b.getByRole('button', { name: 'Select SAVE-A (SAVE-A)', exact: true }).click();
  await b.getByRole('button', { name: 'Export selected save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('nested directories');
  await expect(b.getByRole('button', { name: 'Undo card B' })).toBeDisabled();
});

test('PSU review renders contained icon assets with reduced motion and preserves them on import', async ({ page }, testInfo) => {
  const { animatedCard } = await import('../icon-helper');
  const { SaveContent } = await import('../../src/core/index');
  const { encodePsu } = await import('../../src/formats/psu');
  const root = new MemoryCard(animatedCard()).extractSave('SAVE-A').snapshot();
  const children = root.children.filter(e => e.kind === 'file');
  new DataView(root.record.buffer).setUint32(4, children.length + 2, true);
  const bytes = encodePsu(new SaveContent({ ...root, children }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await open(page, fixture('destination'), 'destination.bin');
  await page.getByRole('button', { name: 'Import save', exact: true }).click();
  await page.getByLabel('Save package', { exact: true }).setInputFiles({ name: 'animated.psu', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  const dialog = page.getByRole('dialog'), canvas = dialog.locator('canvas');
  await expect(dialog.getByRole('heading', { name: 'Synthetic animated icon' })).toBeVisible();
  await expect(dialog.getByText('Loading icon', { exact: true })).toHaveCount(0);
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(1);
  const pixels = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.waitForTimeout(150);
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(pixels);
  await page.screenshot({ path: testInfo.outputPath('psu-import-review.png') });
  await dialog.getByRole('button', { name: 'Import save', exact: true }).click();
  await expect(page.getByRole('complementary').getByRole('heading', { name: 'Synthetic animated icon' })).toBeVisible();
  const output = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download card', exact: true }).click();
  expect(new MemoryCard(await downloaded(await output)).readFile('/SAVE-A/icon.ico')).toEqual(new MemoryCard(animatedCard()).readFile('/SAVE-A/icon.ico'));
});

test('legacy imports use content detection and MAX export requires loss acknowledgement', async ({ page }, testInfo) => {
  const { gunzipSync } = await import('node:zlib');
  const { decodeSavePackage } = await import('../../src/formats/index');
  await page.goto('/');
  await open(page, fixture('destination'), 'destination.ps2');
  const pane = page.getByRole('region', { name: 'Card A', exact: true });
  for (const [extension, label] of [['max','MAX Drive'],['sps','SharkPort / X-Port'],['xps','SharkPort / X-Port'],['cbs','Code Breaker'],['psv','signature verified']]) {
    await pane.getByRole('button', { name: 'Import save', exact: true }).click();
    await page.getByLabel('Save package', { exact: true }).setInputFiles({ name: 'renamed.wrong', mimeType: 'application/octet-stream', buffer: gunzipSync(await readFile(`tests/fixtures/flat.${extension}.gz`)) });
    await expect(page.getByRole('dialog')).toContainText(label!);
    await expect(page.getByRole('dialog')).toContainText('defaults are listed below');
    await page.getByRole('dialog').getByRole('button', { name: 'Import save', exact: true }).click();
    await expect(pane.getByRole('button', { name: 'Select PSU-FLAT (PSU-FLAT)', exact: true })).toBeVisible();
    await pane.getByRole('button', { name: 'Undo card A' }).click();
  }
  await pane.getByRole('button', { name: 'Redo card A' }).click();
  await pane.getByRole('button', { name: 'Select PSU-FLAT (PSU-FLAT)', exact: true }).click();
  await pane.getByRole('button', { name: 'Export selected save', exact: true }).click();
  const dialog=page.getByRole('dialog');
  await expect(page.getByLabel('Output type')).toHaveValue('psu');
  await page.getByLabel('Output type').selectOption('max');
  await expect(dialog).toContainText('2000-01-01');
  await expect(page.getByRole('button', { name: 'Download save', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'I accept the metadata loss in this MAX export.' }).focus();
  await page.keyboard.press('Space');
  for(const width of [850,400]) { await page.setViewportSize({width,height:900});expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true); }
  await page.screenshot({ path: testInfo.outputPath('max-export-review.png') });
  const pending=page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download save', exact: true }).click();
  const output=await pending; expect(output.suggestedFilename()).toBe('PSU-FLAT.max');
  const exported=decodeSavePackage(await downloaded(output));expect(exported.format).toBe('max');
  expect(exported.save.readFile('/PSU-FLAT/bytes-513')).toEqual(decodeSavePackage(gunzipSync(await readFile('tests/fixtures/flat.psu.gz'))).save.readFile('/PSU-FLAT/bytes-513'));
  await expect(pane.getByText('● Download card to keep it')).toBeVisible();
  await page.setViewportSize({width:1440,height:1000});
  await pane.getByRole('button', { name: 'Import save', exact: true }).click();
  const corrupt=gunzipSync(await readFile('tests/fixtures/flat.psv.gz'));corrupt[corrupt.length-1]!^=1;
  await page.getByLabel('Save package', {exact:true}).setInputFiles({name:'bad.psv',mimeType:'application/octet-stream',buffer:corrupt});
  await expect(page.getByRole('alert')).toContainText('signature does not match');
  await expect(pane.getByRole('button', {name:'Undo card A'})).toBeEnabled();
});

test('package worker keeps near-capacity processing responsive and preserves caller buffers', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.goto('/');
  const measurements=await page.evaluate(async()=>{
    // Vite resolves these browser modules; the worker is the production I/O adapter.
    // @ts-expect-error absolute Vite module URL
    const {encodePackage,decodePackage}=await import('/src/browser/packages.ts');
    // @ts-expect-error absolute Vite module URL
    const {SaveContent,makeRecord,recordView}=await import('/src/core/save.ts');
    let seed=123;const bytes=Uint8Array.from({length:7800000},()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed&255;});
    const record=makeRecord('LARGE',true), file=makeRecord('payload',false);recordView(record).setUint32(4,3,true);recordView(file).setUint32(4,bytes.length,true);
    const save=new SaveContent({kind:'directory',record,dot:makeRecord('.',true),dotdot:makeRecord('..',true),children:[{kind:'file',record:file,bytes}]});
    let ticks=0;const timer=setInterval(()=>ticks++,16);const start=performance.now();
    try {
      const output=await encodePackage(save,'max',true), encoded=performance.now();const encodeTicks=ticks;ticks=0;
      const originalLength=output.bytes.length;const decoded=await decodePackage(output.bytes);
      const actual=decoded.save.readFile('/LARGE/payload');let identical=actual.length===bytes.length;
      for(let i=0;identical&&i<bytes.length;i++) identical=actual[i]===bytes[i];
      return {encodeMs:encoded-start,decodeMs:performance.now()-encoded,encodeTicks,decodeTicks:ticks,identical,bufferPreserved:output.bytes.length===originalLength,sourcePreserved:save.fileBytes===bytes.length};
    } finally {clearInterval(timer);}
  });
  expect(measurements.identical).toBe(true);expect(measurements.bufferPreserved).toBe(true);expect(measurements.sourcePreserved).toBe(true);
  expect(measurements.encodeTicks).toBeGreaterThan(3);expect(measurements.decodeTicks).toBeGreaterThan(3);
  await testInfo.attach('package-worker-measurements', {body:JSON.stringify(measurements),contentType:'application/json'});
});

test('zero-keyframe static icon renders its texture instead of the fallback', async ({ page }) => {
  const { animatedCard, staticModel } = await import('../icon-helper');
  const card = new MemoryCard(animatedCard()).replaceFile('/SAVE-A/icon.ico', staticModel());
  await page.goto('/');
  await open(page, card.export(), 'static-icon.ps2');
  const preview = page.locator('.save-select .icon-preview');
  await expect(preview.locator('.icon-fallback')).toHaveCount(0);
  await expect(preview).toHaveAttribute('aria-label', /PS2 save icon$/);
  await expect.poll(() => preview.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(1);
  await page.locator('.save-select').click();
  await expect(page.locator('.large-preview .icon-fallback')).toHaveCount(0);
});

test('unified export explains folder support while retaining package downloads', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showDirectoryPicker', { value: undefined });
  });
  await page.goto('/');
  await open(page, fixture('destination'), 'export-options.ps2');
  await page.getByRole('button', { name: 'Select KEEP (KEEP)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dump save to folder' })).toHaveCount(0);
  const button = page.getByRole('button', { name: 'Export selected save', exact: true });
  await button.click();
  const dialog = page.getByRole('dialog');
  await expect(page.getByLabel('Output type')).toHaveValue('psu');
  await page.getByLabel('Output type').selectOption('folder');
  await expect(dialog).toContainText('requires Chrome or Edge with directory access');
  await expect(dialog).toContainText('Existing save folders are never overwritten');
  await expect(page.getByRole('button', { name: 'Choose folder', exact: true })).toBeDisabled();
  for (const width of [850, 400]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('raw-folder-export.png') });
  await page.getByLabel('Output type').selectOption('max');
  await expect(page.getByRole('button', { name: 'Download save', exact: true })).toBeDisabled();
  await page.getByLabel('Output type').selectOption('psu');
  await expect(page.getByRole('button', { name: 'Download save', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  await expect(page.getByRole('button', { name: 'Undo card A' })).toBeDisabled();
});

test('signed PSV downloads preserve contents and history, with keyboard review at narrow widths', async ({ page, baseURL }, testInfo) => {
  const { gunzipSync } = await import('node:zlib');
  const { SaveContent } = await import('../../src/core/index');
  const { decodePsu, encodePsu } = await import('../../src/formats/psu');
  const { decodePsv } = await import('../../src/formats/psv');
  const { psvDigest } = await import('../psv-helper');
  const root = decodePsu(new Uint8Array(gunzipSync(await readFile('tests/fixtures/flat.psu.gz')))).snapshot();
  root.record.fill(0, 64, 96); root.record.set(Buffer.from('BASLUS-20370-02'), 64);
  const source = new SaveContent(root), errors: string[] = [], remoteRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) remoteRequests.push(request.url()); });
  await page.goto('/');
  await open(page, fixture('destination'), 'psv-export.ps2');
  const pane = page.getByRole('region', { name: 'Card A', exact: true });
  await pane.getByRole('button', { name: 'Import save', exact: true }).click();
  await page.getByLabel('Save package', { exact: true }).setInputFiles({ name: 'source.psu', mimeType: 'application/octet-stream', buffer: Buffer.from(encodePsu(source)) });
  await page.getByRole('dialog').getByRole('button', { name: 'Import save', exact: true }).click();
  await expect(pane.getByText('● Download card to keep it')).toBeVisible();
  const exportButton = pane.getByRole('button', { name: 'Export selected save', exact: true });
  await exportButton.click();
  const dialog = page.getByRole('dialog'), outputType = page.getByLabel('Output type');
  await expect(outputType).toHaveValue('psu');
  await outputType.selectOption('psv');
  await expect(dialog).toContainText('PS3 import and game loading have not yet been verified');
  await expect(dialog).toContainText('does not store extended attributes');
  const download = page.getByRole('button', { name: 'Download save', exact: true });
  await expect(download).toBeDisabled();
  const accept = page.getByRole('checkbox', { name: 'I accept the metadata loss in this PSV export.' });
  await accept.focus(); await page.keyboard.press('Space');
  // Changing the format never reuses an acknowledgement for another format.
  await outputType.selectOption('max'); await expect(download).toBeDisabled();
  await outputType.selectOption('psv'); await expect(accept).not.toBeChecked();
  await accept.focus(); await page.keyboard.press('Space');
  for (const width of [850, 400]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('psv-export-review.png') });
  const pending = page.waitForEvent('download');
  await download.focus(); await page.keyboard.press('Enter');
  const result = await pending, bytes = await downloaded(result);
  expect(result.suggestedFilename()).toBe('BASLUS-203702D3032.PSV');
  expect(bytes.subarray(28, 48)).toEqual(new Uint8Array(psvDigest(bytes)));
  const save = decodePsv(bytes);
  for (const child of source.entry.children) expect(save.readFile(child.path)).toEqual(source.readFile(child.path));
  await expect(dialog).toHaveCount(0);
  await expect(exportButton).toBeFocused();
  await expect(pane.getByText('● Download card to keep it')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await pane.getByRole('button', { name: 'Undo card A' }).click();
  await expect(pane.getByRole('button', { name: 'Select BASLUS-20370-02 (BASLUS-20370-02)', exact: true })).toHaveCount(0);
  await expect(pane.getByRole('button', { name: 'Undo card A' })).toBeDisabled();
  await pane.getByRole('button', { name: 'Redo card A' }).click();
  const whole = page.waitForEvent('download');
  await pane.getByRole('button', { name: 'Download card', exact: true }).click();
  const wholeBytes = await downloaded(await whole);
  const expectedCard = new MemoryCard(fixture('destination')).importSave(source).export('ecc');
  expect(wholeBytes.length).toBe(expectedCard.length);
  expect(Buffer.compare(Buffer.from(wholeBytes), Buffer.from(expectedCard))).toBe(0);
  expect(errors).toEqual([]); expect(remoteRequests).toEqual([]);
});

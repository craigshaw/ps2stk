import { expect, test } from '@playwright/test';

const paths = ['/guides/', '/guides/import-ps2-saves/', '/guides/ps2-save-formats/', '/guides/copy-ps2-saves/'];

test('guides work without JavaScript, with complete metadata, links and narrow layouts', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL! });
  const page = await context.newPage();
  const titles = new Set<string>();
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    titles.add(await page.title());
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://ps2stk.craigshaw.com${path}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://ps2stk.craigshaw.com/social-preview.png');
    const links = await page.locator('a[href^="/"], img').evaluateAll(elements => elements.map(element => element.getAttribute(element.tagName === 'IMG' ? 'src' : 'href')!));
    for (const link of new Set(links)) expect((await context.request.get(link)).status(), link).toBe(200);
    for (const width of [1440, 760, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      const sizes = await page.locator('body').boundingBox();
      expect(sizes!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole('link', { name: 'Open toolkit (new tab)', exact: true })).toBeVisible();
    }
  }
  expect(titles.size).toBe(paths.length);
  const sitemap = await context.request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  for (const path of ['/', ...paths]) expect(await sitemap.text()).toContain(`<loc>https://ps2stk.craigshaw.com${path}</loc>`);
  expect(await (await context.request.get('/robots.txt')).text()).toContain('Sitemap: https://ps2stk.craigshaw.com/sitemap.xml');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PS2 Save Toolkit', exact: true })).toBeVisible();
  await expect(page.getByText('Enable JavaScript to use the toolkit.', { exact: false })).toBeVisible();
  await context.close();
});

test('opening guides preserves the active card session', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('main').getByRole('button', { name: 'New memory card', exact: true }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('banner').getByRole('link', { name: 'Guides (opens in a new tab)', exact: true }).click();
  const guide = await popup;
  await expect(guide.getByRole('heading', { name: 'PS2 save guides', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'new-card-a.ps2', exact: true })).toBeVisible();
  for (const width of [1440, 1024, 768, 760, 390, 360]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `App width ${width}`).toBe(true);
  }
  await guide.close();
});

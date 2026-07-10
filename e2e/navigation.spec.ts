import { expect, test } from '@playwright/test';

test('bottom navigation survives repeated Pixi unmount and remount cycles', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByText('Luminous Verge', { exact: true })).toBeVisible();
  await expect(page.locator('.rift-pixi-canvas')).toHaveCount(1);

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.getByRole('button', { name: 'Summon', exact: true }).click();
    await expect(page.getByText('Void Summon', { exact: true })).toBeVisible();
    await expect(page.locator('#root')).not.toBeEmpty();

    await page.getByRole('button', { name: 'Heroes', exact: true }).click();
    await expect(page.getByText('Warband', { exact: true })).toBeVisible();
    await expect(page.locator('#root')).not.toBeEmpty();

    await page.getByRole('button', { name: 'Rift', exact: true }).click();
    await expect(page.getByText('Luminous Verge', { exact: true })).toBeVisible();
    await expect(page.locator('.rift-pixi-canvas')).toHaveCount(1);
  }

  await expect(page.getByTestId('game-crash-fallback')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('rift loads production art without overflowing narrow Telegram viewports', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Attack Mirefang Stalker' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mirefang Stalker' })).toBeVisible();
  await expect(page.locator('.rift-pixi-canvas')).toHaveCount(1);
  await expect(page.locator('.rift-pixi-scene')).toHaveAttribute('data-enemy-id', 'mirefang-stalker');
  await expect(page.locator('.rift-pixi-scene')).toHaveAttribute('data-art-loaded', 'true');
  await expect.poll(() => page.evaluate(() => {
    return getComputedStyle(document.querySelector('.app-shell')!).backgroundImage;
  })).toContain('/assets/rift/luminous-verge.webp');

  for (const viewport of [{ width: 390, height: 720 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      panelWidth: document.querySelector('.enemy-panel')?.getBoundingClientRect().width ?? 0,
    }));

    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.panelWidth).toBeGreaterThan(280);
    expect(layout.panelWidth).toBeLessThanOrEqual(layout.viewportWidth);
  }
});

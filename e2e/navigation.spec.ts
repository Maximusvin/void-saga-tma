import { expect, test } from '@playwright/test';

test('bottom navigation survives repeated Pixi unmount and remount cycles', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByText('Void Rift', { exact: true })).toBeVisible();
  await expect(page.locator('.rift-pixi-canvas')).toHaveCount(1);

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.getByRole('button', { name: 'Summon', exact: true }).click();
    await expect(page.getByText('Void Summon', { exact: true })).toBeVisible();
    await expect(page.locator('#root')).not.toBeEmpty();

    await page.getByRole('button', { name: 'Heroes', exact: true }).click();
    await expect(page.getByText('Warband', { exact: true })).toBeVisible();
    await expect(page.locator('#root')).not.toBeEmpty();

    await page.getByRole('button', { name: 'Rift', exact: true }).click();
    await expect(page.getByText('Void Rift', { exact: true })).toBeVisible();
    await expect(page.locator('.rift-pixi-canvas')).toHaveCount(1);
  }

  await expect(page.getByTestId('game-crash-fallback')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

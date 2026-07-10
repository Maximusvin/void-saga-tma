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

test('boss attempt exposes phases and resets through the shared engine after enrage', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Math.random = () => 0.5;
    const now = Date.now();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 4,
      bossEncounterEndsAt: new Date(now - 1_000).toISOString(),
      comboCount: 0,
      comboExpiresAt: null,
      gems: 50,
      gold: '1000',
      heroes: [],
      stage: 5,
      monsterMaxHealth: '1035',
      monsterHealth: '100',
      lastSeenAt: new Date(now - 2_000).toISOString(),
      updatedAt: new Date(now - 2_000).toISOString(),
    }));
  });
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Attack Crowned Rift Sovereign' })).toBeVisible();
  await expect(page.getByText('Phase 3 · Cataclysm', { exact: true })).toBeVisible();
  await expect(page.getByRole('timer')).toContainText('0s');

  await page.getByRole('button', { name: 'Attack Crowned Rift Sovereign' }).click();

  await expect(page.getByRole('status')).toContainText('HP restored');
  await expect(page.getByText('Phase 1 · Dominion', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem('rift_heroes_save') ?? '{}');
    return snapshot.monsterHealth;
  })).toBe('1034');
  await expect(page.getByRole('timer')).toContainText(/3[45]s/);
});

test('authoritative passive volleys animate every hero without overflowing the combat footer', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 4,
      bossEncounterEndsAt: null,
      comboCount: 0,
      comboExpiresAt: null,
      gems: 50,
      gold: '1000',
      heroes: [
        { ascension: 0, id: 'grunt-1', name: 'Void Grunt', rarity: 'Common', level: 3, power: '1', shards: 0, templateId: 'void-grunt' },
        { ascension: 0, id: 'mage-1', name: 'Void Mage', rarity: 'Rare', level: 4, power: '2', shards: 0, templateId: 'void-mage' },
        { ascension: 0, id: 'knight-1', name: 'Void Knight', rarity: 'Epic', level: 5, power: '3', shards: 0, templateId: 'void-knight' },
        { ascension: 0, id: 'lord-1', name: 'Void Lord', rarity: 'Legendary', level: 6, power: '4', shards: 0, templateId: 'void-lord' },
      ],
      stage: 1,
      monsterMaxHealth: '100',
      monsterHealth: '100',
      lastSeenAt: now,
      updatedAt: now,
    }));
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');

  await expect(page.locator('.warband-slot')).toHaveCount(4);
  await expect(page.getByRole('img', { name: 'Void Lord, level 6, Sovereign' })).toBeVisible();
  await expect.poll(() => page.locator(
    '.warband-slot:not([data-last-volley="0"])',
  ).count()).toBe(4);
  await expect(page.locator('.warband-damage-pop')).toContainText('-10');
  await expect.poll(() => page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem('rift_heroes_save') ?? '{}');
    return Number(snapshot.monsterHealth);
  })).toBeLessThan(100);

  const layout = await page.evaluate(() => {
    const footer = document.querySelector('.rift-combat-footer')?.getBoundingClientRect();
    return {
      bodyWidth: document.body.scrollWidth,
      footerLeft: footer?.left ?? -1,
      footerRight: footer?.right ?? Number.POSITIVE_INFINITY,
      viewportWidth: window.innerWidth,
    };
  });
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.footerLeft).toBeGreaterThanOrEqual(0);
  expect(layout.footerRight).toBeLessThanOrEqual(layout.viewportWidth);
});

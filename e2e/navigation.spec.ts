import { expect, test, type Page } from '@playwright/test';

const seedVoidLordCollection = async (page: Page) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 5,
      activeHeroIds: ['void-lord'],
      bossEncounterEndsAt: null,
      comboCount: 0,
      comboExpiresAt: null,
      gems: 50,
      gold: '1000000',
      heroes: [
        {
          ascension: 2,
          id: 'void-lord',
          level: 60,
          name: 'Void Lord',
          power: '950000',
          rarity: 'Legendary',
          shards: 40,
          templateId: 'void-lord',
        },
      ],
      stage: 150,
      monsterMaxHealth: '100000',
      monsterHealth: '100000',
      lastSeenAt: now,
      updatedAt: now,
    }));
  });
};

const seedIronrootEncounter = async (page: Page, monsterHealth = '120') => {
  await page.addInitScript(health => {
    Math.random = () => 0.5;
    const now = new Date().toISOString();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 7,
      activeHeroIds: [],
      bossEncounterEndsAt: null,
      comboCount: 0,
      comboExpiresAt: null,
      enemyIndex: 0,
      gems: 50,
      gold: '1000',
      heroes: [],
      lastPassiveTickAt: now,
      lastSeenAt: now,
      monsterHealth: health,
      monsterMaxHealth: '120',
      stage: 2,
      summonPity: 0,
      updatedAt: now,
    }));
  }, monsterHealth);
};

test('requests Telegram fullscreen on mobile and configures immersive host colors', async ({ page }) => {
  await page.route('https://telegram.org/js/telegram-web-app.js?62', route => route.fulfill({
    body: '',
    contentType: 'application/javascript',
    status: 200,
  }));
  await page.addInitScript(() => {
    const calls: string[] = [];
    Reflect.set(window, '__telegramBridgeCalls', calls);
    window.Telegram = {
      WebApp: {
        expand: () => calls.push('expand'),
        isFullscreen: false,
        isVersionAtLeast: () => true,
        platform: 'android',
        ready: () => calls.push('ready'),
        requestFullscreen: () => calls.push('fullscreen'),
        setBackgroundColor: color => calls.push(`background:${color}`),
        setBottomBarColor: color => calls.push(`bottom:${color}`),
        setHeaderColor: color => calls.push(`header:${color}`),
      },
    };
  });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__telegramBridgeCalls'))).toEqual([
    'ready',
    'expand',
    'header:#071315',
    'background:#071315',
    'bottom:#071315',
    'fullscreen',
  ]);
});

test('reloads once when an active client references a stale deployment chunk', async ({ page }) => {
  await page.addInitScript(() => {
    const navigationCount = Number(sessionStorage.getItem('__test_navigation_count') ?? '0');
    sessionStorage.setItem('__test_navigation_count', String(navigationCount + 1));
  });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('__test_navigation_count'))).toBe('1');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.evaluate(() => {
      setTimeout(() => {
        window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
      }, 0);
    }),
  ]);

  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('__test_navigation_count'))).toBe('2');
  const secondEventWasNotPrevented = await page.evaluate(() => (
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
  ));
  await page.waitForTimeout(250);

  expect(secondEventWasNotPrevented).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('__test_navigation_count'))).toBe('2');
});

test('preloads a lazy view on the first navigation press', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(window, 'requestIdleCallback', () => 1);
    Reflect.set(window, 'cancelIdleCallback', () => undefined);
  });
  await page.goto('/');

  const summonChunkWasRequested = () => page.evaluate(() => (
    performance.getEntriesByType('resource')
      .some(entry => entry.name.includes('/SummonCircle-'))
  ));

  expect(await summonChunkWasRequested()).toBe(false);
  await page.getByRole('button', { name: 'Summon', exact: true }).dispatchEvent('pointerdown', {
    pointerType: 'touch',
  });
  await expect.poll(summonChunkWasRequested).toBe(true);
});

test('keeps Telegram Desktop inside a centered phone viewport', async ({ page }, testInfo) => {
  await page.route('https://telegram.org/js/telegram-web-app.js?62', route => route.fulfill({
    body: '',
    contentType: 'application/javascript',
    status: 200,
  }));
  await seedVoidLordCollection(page);
  await page.addInitScript(() => {
    const calls: string[] = [];
    Reflect.set(window, '__telegramBridgeCalls', calls);
    window.Telegram = {
      WebApp: {
        exitFullscreen: () => calls.push('exit-fullscreen'),
        expand: () => calls.push('expand'),
        isFullscreen: true,
        isVersionAtLeast: () => true,
        platform: 'tdesktop',
        ready: () => calls.push('ready'),
        requestFullscreen: () => calls.push('fullscreen'),
        setBackgroundColor: color => calls.push(`background:${color}`),
        setBottomBarColor: color => calls.push(`bottom:${color}`),
        setHeaderColor: color => calls.push(`header:${color}`),
        viewportStableHeight: 1152,
      },
    };
  });
  await page.setViewportSize({ width: 2048, height: 1152 });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__telegramBridgeCalls'))).toEqual([
    'ready',
    'expand',
    'header:#071315',
    'background:#071315',
    'bottom:#071315',
    'exit-fullscreen',
  ]);
  await expect(page.locator('html')).toHaveAttribute('data-app-layout', 'desktop');
  await expect(page.locator('.rift-pixi-scene')).toHaveAttribute('data-art-loaded', 'true', {
    timeout: 8_000,
  });

  const layout = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell')!.getBoundingClientRect();
    const frame = document.querySelector('.game-frame')!.getBoundingClientRect();
    const navigation = document.querySelector('.bottom-nav')!.getBoundingClientRect();
    const monster = document.querySelector('.monster-button')!.getBoundingClientRect();
    return {
      frame: { bottom: frame.bottom, height: frame.height, left: frame.left, right: frame.right, top: frame.top, width: frame.width },
      monster: { left: monster.left, right: monster.right },
      navigation: { left: navigation.left, right: navigation.right, width: navigation.width },
      shell: { height: shell.height, width: shell.width },
    };
  });

  expect(layout.shell).toEqual({ height: 1152, width: 2048 });
  expect(layout.frame.width).toBe(430);
  expect(layout.frame.height).toBe(900);
  expect(layout.frame.left).toBe(809);
  expect(layout.frame.top).toBe(126);
  expect(layout.frame.right).toBe(1239);
  expect(layout.frame.bottom).toBe(1026);
  expect(layout.navigation.width).toBe(430);
  expect(layout.navigation.left).toBe(layout.frame.left);
  expect(layout.navigation.right).toBe(layout.frame.right);
  expect(layout.monster.left).toBeGreaterThanOrEqual(layout.frame.left);
  expect(layout.monster.right).toBeLessThanOrEqual(layout.frame.right);
  await page.screenshot({ path: testInfo.outputPath('telegram-desktop-2048x1152.png') });

  await page.getByRole('button', { name: 'Heroes', exact: true }).click();
  await page.getByRole('button', { name: 'Preview Void Lord animation' }).click();
  const showcase = page.getByRole('dialog', { name: 'Void Lord' });
  await expect(showcase).toBeVisible();
  await expect.poll(async () => (await showcase.boundingBox())?.width ?? 0).toBe(430);
  const showcaseBounds = await showcase.boundingBox();
  expect(showcaseBounds?.width).toBe(430);
  expect(showcaseBounds?.height).toBe(900);
  expect(showcaseBounds?.x).toBe(809);
  expect(showcaseBounds?.y).toBe(126);
});

test('keeps the shell full height when Telegram reports a zero stable viewport', async ({ page }) => {
  await page.route('https://telegram.org/js/telegram-web-app.js?62', route => route.fulfill({
    body: '',
    contentType: 'application/javascript',
    status: 200,
  }));
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        contentSafeAreaInset: { bottom: 0, left: 0, right: 0, top: 0 },
        isFullscreen: false,
        isVersionAtLeast: () => true,
        onEvent: () => undefined,
        ready: () => undefined,
        safeAreaInset: { bottom: 0, left: 0, right: 0, top: 0 },
        // Telegram can report this before the viewport is measured. Clamping it
        // to a 1px minimum used to collapse the entire game shell.
        viewportStableHeight: 0,
      },
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const layout = await page.evaluate(() => ({
    runtimeViewport: document.documentElement.style.getPropertyValue('--app-runtime-viewport-stable-height'),
    shellHeight: document.querySelector('.app-shell')!.getBoundingClientRect().height,
  }));

  expect(layout.runtimeViewport).not.toBe('1px');
  expect(layout.shellHeight).toBe(844);
});

test('keeps interactive HUD controls inside dynamic Telegram safe areas', async ({ page }) => {
  await page.route('https://telegram.org/js/telegram-web-app.js?62', route => route.fulfill({
    body: '',
    contentType: 'application/javascript',
    status: 200,
  }));
  await page.addInitScript(() => {
    const handlers: Record<string, () => void> = {};
    const webApp = {
      contentSafeAreaInset: { bottom: 0, left: 0, right: 0, top: 28 },
      isFullscreen: true,
      isVersionAtLeast: () => true,
      platform: 'android',
      onEvent: (eventType: string, handler: () => void) => {
        handlers[eventType] = handler;
      },
      ready: () => undefined,
      safeAreaInset: { bottom: 34, left: 8, right: 12, top: 28 },
      setBackgroundColor: () => undefined,
      setBottomBarColor: () => undefined,
      setHeaderColor: () => undefined,
      viewportStableHeight: 844,
    };
    Reflect.set(window, '__telegramSafeAreaHandlers', handlers);
    window.Telegram = { WebApp: webApp };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const initialLayout = await page.evaluate(() => {
    const topbar = document.querySelector('.topbar')!.getBoundingClientRect();
    const navigation = document.querySelector('.bottom-nav')!.getBoundingClientRect();
    const navigationButtons = [...document.querySelectorAll('.bottom-nav .nav-btn')]
      .map(button => button.getBoundingClientRect());
    const rootStyle = document.documentElement.style;
    return {
      buttonBottom: Math.max(...navigationButtons.map(button => button.bottom)),
      navigationBottom: navigation.bottom,
      runtimeBottom: rootStyle.getPropertyValue('--app-runtime-safe-area-inset-bottom'),
      runtimeTop: rootStyle.getPropertyValue('--app-runtime-content-safe-area-inset-top'),
      topbarLeft: topbar.left,
      topbarRight: topbar.right,
      topbarTop: topbar.top,
    };
  });

  // safeAreaInset is measured from the screen edge and contentSafeAreaInset from
  // the content edge, so the HUD has to clear their sum (28 + 28), and the
  // mirrored runtime token holds the reported content inset unchanged.
  expect(initialLayout.runtimeTop).toBe('28px');
  expect(initialLayout.runtimeBottom).toBe('34px');
  expect(initialLayout.topbarTop).toBeGreaterThanOrEqual(56);
  expect(initialLayout.topbarLeft).toBeGreaterThanOrEqual(8);
  expect(initialLayout.topbarRight).toBeLessThanOrEqual(378);
  expect(initialLayout.navigationBottom).toBe(844);
  expect(initialLayout.buttonBottom).toBeLessThanOrEqual(810);

  await page.evaluate(() => {
    const webApp = window.Telegram!.WebApp!;
    webApp.contentSafeAreaInset = { bottom: 0, left: 0, right: 0, top: 102 };
    webApp.safeAreaInset = { bottom: 48, left: 0, right: 0, top: 32 };
    const handlers = Reflect.get(window, '__telegramSafeAreaHandlers') as Record<string, () => void>;
    handlers.contentSafeAreaChanged?.();
    handlers.safeAreaChanged?.();
  });

  // 32px screen inset + 102px content inset.
  await expect.poll(() => page.locator('.topbar').evaluate(element => (
    element.getBoundingClientRect().top
  ))).toBeGreaterThanOrEqual(134);
  await expect.poll(() => page.locator('.bottom-nav .nav-btn').last().evaluate(element => (
    element.getBoundingClientRect().bottom
  ))).toBeLessThanOrEqual(796);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    const webApp = window.Telegram!.WebApp!;
    webApp.contentSafeAreaInset = { bottom: 0, left: 0, right: 0, top: 72 };
    webApp.safeAreaInset = { bottom: 24, left: 8, right: 8, top: 24 };
    webApp.viewportStableHeight = 568;
    const handlers = Reflect.get(window, '__telegramSafeAreaHandlers') as Record<string, () => void>;
    handlers.contentSafeAreaChanged?.();
    handlers.safeAreaChanged?.();
    handlers.viewportChanged?.();
  });

  const compactLayout = await page.evaluate(() => {
    const navigationButtons = [...document.querySelectorAll('.bottom-nav .nav-btn')]
      .map(button => button.getBoundingClientRect());
    return {
      appHeight: document.querySelector('.app-shell')!.getBoundingClientRect().height,
      bodyHeight: document.body.scrollHeight,
      bodyWidth: document.body.scrollWidth,
      buttonBottom: Math.max(...navigationButtons.map(button => button.bottom)),
      minButtonHeight: Math.min(...navigationButtons.map(button => button.height)),
      topbarTop: document.querySelector('.topbar')!.getBoundingClientRect().top,
    };
  });
  expect(compactLayout.appHeight).toBe(568);
  expect(compactLayout.bodyHeight).toBe(568);
  expect(compactLayout.bodyWidth).toBe(320);
  // 24px screen inset + 72px content inset.
  expect(compactLayout.topbarTop).toBeGreaterThanOrEqual(96);
  expect(compactLayout.buttonBottom).toBeLessThanOrEqual(544);
  expect(compactLayout.minButtonHeight).toBeGreaterThanOrEqual(44);

  await page.getByRole('button', { name: /server S-1.*Open server selection/ }).click();
  const dialog = page.getByRole('dialog', { name: 'World Servers' });
  await expect(dialog).toBeVisible();
  const safeDialogLayout = await dialog.evaluate(element => {
    const action = element.querySelector<HTMLButtonElement>('.realm-row > button')!;
    return {
      actionBottom: action.getBoundingClientRect().bottom,
      dialogBottom: element.getBoundingClientRect().bottom,
    };
  });
  expect(Math.abs(safeDialogLayout.dialogBottom - 568)).toBeLessThan(1);
  expect(safeDialogLayout.actionBottom).toBeLessThanOrEqual(544);
});

test('keeps the modal fallback clean on older Telegram clients', async ({ page }) => {
  await page.route('https://telegram.org/js/telegram-web-app.js?62', route => route.fulfill({
    body: '',
    contentType: 'application/javascript',
    status: 200,
  }));
  await page.addInitScript(() => {
    const calls: string[] = [];
    Reflect.set(window, '__telegramBridgeCalls', calls);
    window.Telegram = {
      WebApp: {
        expand: () => calls.push('expand'),
        isFullscreen: false,
        isVersionAtLeast: () => false,
        ready: () => calls.push('ready'),
        requestFullscreen: () => calls.push('fullscreen'),
        setBackgroundColor: () => calls.push('background'),
        setBottomBarColor: () => calls.push('bottom'),
        setHeaderColor: () => calls.push('header'),
      },
    };
  });
  await page.goto('/');

  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__telegramBridgeCalls'))).toEqual([
    'ready',
    'expand',
  ]);
});

test('player HUD renders Telegram identity, game level, and a compact narrow layout', async ({ page }) => {
  await page.route('https://telegram.org/js/telegram-web-app.js?62', route => route.fulfill({
    body: '',
    contentType: 'application/javascript',
    status: 200,
  }));
  await page.route('https://assets.example.test/player-avatar.svg', route => route.fulfill({
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#d8a45d"/><circle cx="32" cy="25" r="13" fill="#f6dfc2"/><path d="M12 64c2-17 11-25 20-25s18 8 20 25" fill="#2d797d"/></svg>',
    contentType: 'image/svg+xml',
    status: 200,
  }));
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initDataUnsafe: {
          user: {
            first_name: 'Oleksandr',
            id: 778899,
            last_name: 'Very Long Riftwalker Name',
            photo_url: 'https://assets.example.test/player-avatar.svg',
            username: 'rift_commander',
          },
        },
      },
    };
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');

  const playerHud = page.locator('.player-hud');
  await expect(playerHud).toContainText('Oleksandr Very Long Riftwalker Name');
  await expect(playerHud).toContainText('LV 1');
  await expect(playerHud.locator('.player-avatar-image')).toBeVisible();
  await expect(playerHud).toHaveAttribute('data-profile-source', 'telegram');

  const layout = await page.evaluate(() => {
    const topbar = document.querySelector('.topbar')?.getBoundingClientRect();
    const player = document.querySelector('.player-hud')?.getBoundingClientRect();
    const resources = document.querySelector('.resource-cluster')?.getBoundingClientRect();
    return {
      bodyWidth: document.body.scrollWidth,
      playerRight: player?.right ?? Number.POSITIVE_INFINITY,
      resourcesLeft: resources?.left ?? -1,
      topbarRight: topbar?.right ?? Number.POSITIVE_INFINITY,
      viewportWidth: window.innerWidth,
    };
  });

  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.playerRight).toBeLessThanOrEqual(layout.resourcesLeft);
  expect(layout.topbarRight).toBeLessThanOrEqual(layout.viewportWidth);
});

test('player HUD falls back to initials when Telegram has no usable photo', async ({ page }) => {
  await page.route('https://telegram.org/js/telegram-web-app.js?62', route => route.fulfill({
    body: '',
    contentType: 'application/javascript',
    status: 200,
  }));
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initDataUnsafe: {
          user: {
            first_name: 'Marta',
            id: 112233,
            last_name: 'Nova',
            photo_url: 'http://insecure.example.test/avatar.jpg',
          },
        },
      },
    };
  });
  await page.goto('/');

  await expect(page.locator('.player-avatar-fallback')).toHaveText('MN');
  await expect(page.locator('.player-avatar-image')).toHaveCount(0);
});

test('player HUD opens a bounded logical realm switcher', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');

  const profileButton = page.getByRole('button', { name: /server S-1.*Open server selection/ });
  await profileButton.click();
  const dialog = page.getByRole('dialog', { name: 'World Servers' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Active realm', { exact: true })).toBeVisible();
  await expect(dialog.getByText('S-1', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Active', exact: true })).toBeDisabled();

  const bounds = await dialog.evaluate(element => {
    const box = element.getBoundingClientRect();
    return { bottom: box.bottom, left: box.left, right: box.right, viewportHeight: innerHeight, viewportWidth: innerWidth };
  });
  expect(bounds.left).toBe(0);
  expect(bounds.right).toBe(bounds.viewportWidth);
  expect(Math.abs(bounds.bottom - bounds.viewportHeight)).toBeLessThan(1);
  const realmAction = await dialog.locator('.realm-row > button').first().boundingBox();
  const closeAction = await dialog.getByRole('button', { name: 'Close server selection' }).boundingBox();
  expect(realmAction?.height ?? 0).toBeGreaterThanOrEqual(43.9);
  expect(closeAction?.height ?? 0).toBeGreaterThanOrEqual(43.9);

  await dialog.getByRole('button', { name: 'Close server selection' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(profileButton).toBeFocused();
});

test('bottom navigation exposes campaign and leagues while surviving Pixi remount cycles', async ({ page }) => {
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

    await page.getByRole('button', { name: 'Leagues', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Rift Leagues' })).toBeVisible();
    await expect(page.getByText('Bronze', { exact: true })).toBeVisible();
    await expect(page.getByText('Practice ranking', { exact: true })).toBeVisible();
    await expect(page.locator('.league-player-row.current')).toHaveCount(1);
    await expect(page.locator('.league-player-row.current')).toContainText('Riftwalker');

    await page.getByRole('button', { name: 'Campaign', exact: true }).click();
    await expect(page.getByText('Luminous Verge', { exact: true })).toBeVisible();
    await expect(page.locator('.rift-pixi-canvas')).toHaveCount(1);
  }

  await expect(page.getByTestId('game-crash-fallback')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('Heroes builds and persists a four-slot Warband without overflowing mobile viewports', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 5,
      activeHeroIds: ['void-lord', 'void-knight', 'void-mage', 'void-grunt'],
      bossEncounterEndsAt: null,
      comboCount: 0,
      comboExpiresAt: null,
      gems: 50,
      gold: '1000000000',
      heroes: [
        { ascension: 1, id: 'void-grunt', name: 'Void Grunt', rarity: 'Common', level: 62, power: '9000000', shards: 4, templateId: 'void-grunt' },
        { ascension: 1, id: 'void-mage', name: 'Void Mage', rarity: 'Rare', level: 58, power: '41000', shards: 7, templateId: 'void-mage' },
        { ascension: 2, id: 'void-knight', name: 'Void Knight', rarity: 'Epic', level: 91, power: '283000', shards: 11, templateId: 'void-knight' },
        { ascension: 3, id: 'void-lord', name: 'Void Lord', rarity: 'Legendary', level: 137, power: '3300000', shards: 18, templateId: 'void-lord' },
      ],
      stage: 150,
      monsterMaxHealth: '1000000000',
      monsterHealth: '1000000000',
      lastSeenAt: now,
      updatedAt: now,
    }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Heroes', exact: true }).click();

  await expect(page.locator('.active-hero-slot:not(.empty)')).toHaveCount(4);
  await expect(page.locator('.hero-card')).toHaveCount(4);
  await expect.poll(() => page.locator('.hero-portrait-art img').evaluateAll(images => (
    images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 512)
  ))).toBe(true);

  await page.getByRole('button', { name: 'Remove Void Mage from Warband' }).click();
  await expect(page.locator('.active-hero-slot:not(.empty)')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('rift_heroes_save') ?? '{}').activeHeroIds
  ))).toEqual(['void-lord', 'void-knight', 'void-grunt']);

  await page.getByRole('button', { name: 'Add Void Mage to Warband' }).click();
  await expect(page.locator('.active-hero-slot:not(.empty)')).toHaveCount(4);
  await page.getByRole('combobox', { name: 'Sort heroes' }).selectOption('power');
  await expect(page.locator('.hero-card h3').first()).toHaveText('Void Grunt');

  const layout = await page.evaluate(() => {
    const navigation = document.querySelector('.bottom-nav')!.getBoundingClientRect();
    const slots = [...document.querySelectorAll('.active-hero-slot')].map(slot => slot.getBoundingClientRect());
    const cards = [...document.querySelectorAll('.hero-card')].map(card => card.getBoundingClientRect());
    return {
      bodyWidth: document.body.scrollWidth,
      cardMinWidth: Math.min(...cards.map(card => card.width)),
      navigationBottom: navigation.bottom,
      portraitAnimations: [...document.querySelectorAll('.hero-portrait-art')]
        .reduce((total, portrait) => total + portrait.getAnimations({ subtree: true }).length, 0),
      slotMinWidth: Math.min(...slots.map(slot => slot.width)),
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
    };
  });
  expect(layout.bodyWidth).toBe(layout.viewportWidth);
  expect(layout.navigationBottom).toBe(layout.viewportHeight);
  expect(layout.slotMinWidth).toBeGreaterThanOrEqual(68);
  expect(layout.cardMinWidth).toBeGreaterThanOrEqual(140);
  expect(layout.portraitAnimations).toBeLessThanOrEqual(8);
});

test('Heroes keeps a 120-item collection contained and activates only visible portrait effects', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    const knownHeroes = [
      { ascension: 0, id: 'void-grunt', name: 'Void Grunt', rarity: 'Common', level: 10, power: '50', shards: 0, templateId: 'void-grunt' },
      { ascension: 0, id: 'void-mage', name: 'Void Mage', rarity: 'Rare', level: 10, power: '100', shards: 0, templateId: 'void-mage' },
      { ascension: 0, id: 'void-knight', name: 'Void Knight', rarity: 'Epic', level: 10, power: '200', shards: 0, templateId: 'void-knight' },
      { ascension: 0, id: 'void-lord', name: 'Void Lord', rarity: 'Legendary', level: 10, power: '500', shards: 0, templateId: 'void-lord' },
    ];
    const rarities = ['Common', 'Rare', 'Epic', 'Legendary'] as const;
    const legacyHeroes = Array.from({ length: 116 }, (_, index) => ({
      ascension: 0,
      id: `legacy-${index}`,
      name: `Riftbound ${String(index + 1).padStart(3, '0')}`,
      rarity: rarities[index % rarities.length],
      level: (index % 50) + 1,
      power: String((index + 1) * 17),
      shards: 0,
      templateId: `legacy:${index}`,
    }));
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 5,
      activeHeroIds: knownHeroes.map(hero => hero.id),
      bossEncounterEndsAt: null,
      comboCount: 0,
      comboExpiresAt: null,
      gems: 50,
      gold: '1000000',
      heroes: [...knownHeroes, ...legacyHeroes],
      stage: 20,
      monsterMaxHealth: '100000',
      monsterHealth: '100000',
      lastSeenAt: now,
      updatedAt: now,
    }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Heroes', exact: true }).click();

  const grid = page.locator('.roster-grid');
  await expect(grid).toHaveAttribute('data-hero-count', '120');
  await expect(page.locator('.hero-card')).toHaveCount(120);
  const renderBudget = await page.locator('.hero-card').first().evaluate(card => ({
    animations: [...document.querySelectorAll('.hero-portrait-art')]
      .reduce((total, portrait) => total + portrait.getAnimations({ subtree: true }).length, 0),
    contain: getComputedStyle(card).contain,
    contentVisibility: getComputedStyle(card).contentVisibility,
    viewportWidth: innerWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(renderBudget.contentVisibility).toBe('auto');
  expect(['content', 'layout paint style']).toContain(renderBudget.contain);
  expect(renderBudget.bodyWidth).toBe(renderBudget.viewportWidth);
  expect(renderBudget.animations).toBeLessThanOrEqual(8);

  await page.locator('.roster-view').evaluate(view => {
    view.scrollTop = view.scrollHeight;
  });
  await expect(page.locator('.hero-card').last()).toBeVisible();
  await expect(page.getByTestId('game-crash-fallback')).toHaveCount(0);
});

test.describe('high-end Telegram Android angel showcase', () => {
  test.use({
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; K) AppleWebKit/537.36 Mobile '
      + 'Telegram-Android/11.3.3 (Flagship Phone; Android 15; SDK 35; HIGH)',
  });

  test('is lazy, animated, full-screen, and releases its canvas', async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    const showcaseRequests: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (request.url().includes('/assets/heroes/showcase/')) {
        showcaseRequests.push(request.url());
      }
    });
    await seedVoidLordCollection(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Heroes', exact: true }).click();

    const previewAction = page.getByRole('button', { name: 'Preview Void Lord animation' });
    await expect(previewAction).toBeVisible();
    expect(showcaseRequests).toEqual([]);

    await previewAction.click();
    const dialog = page.getByRole('dialog', { name: 'Void Lord' });
    const scene = dialog.locator('.angel-showcase-scene');
    await expect(dialog).toBeVisible();
    await expect(scene).toHaveAttribute('data-art-loaded', 'true', { timeout: 8_000 });
    await expect(scene).toHaveAttribute('data-render-quality', 'high');
    await expect(scene).toHaveAttribute('data-asset-variant', 'high');
    await expect(scene).toHaveAttribute('data-particle-count', '14');
    await expect(scene).toHaveAttribute('data-ticker-max-fps', '60');
    await expect(scene).toHaveAttribute('data-scene-build-count', '1');
    await expect(scene).toHaveAttribute('data-living-idle', 'active');
    await expect(scene).toHaveAttribute('data-mesh-vertex-count', '91');
    await expect(page.locator('.angel-showcase-canvas')).toHaveCount(1);
    await expect.poll(() => showcaseRequests.length).toBe(3);
    expect(showcaseRequests.every(url => !url.endsWith('-low.webp'))).toBe(true);

    const canvasScreenshot = await page.locator('.angel-showcase-canvas').screenshot();
    const renderedPixels = await page.evaluate(async screenshotUrl => {
      const image = new Image();
      image.src = screenshotUrl;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = 64;
      sample.height = 96;
      const context = sample.getContext('2d', { willReadFrequently: true });
      context?.drawImage(image, 0, 0, sample.width, sample.height);
      const pixels = context?.getImageData(0, 0, sample.width, sample.height).data ?? [];
      let colored = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] > 12 && pixels[index] + pixels[index + 1] + pixels[index + 2] > 45) {
          colored += 1;
        }
      }
      return colored;
    }, `data:image/png;base64,${canvasScreenshot.toString('base64')}`);
    expect(renderedPixels).toBeGreaterThan(180);

    const blinkCountBefore = Number(await scene.getAttribute('data-blink-count'));
    await scene.evaluate((element, previousBlinkCount) => new Promise<void>((resolve, reject) => {
      const startedAt = performance.now();
      const waitForClosedEyes = () => {
        const blinkCount = Number((element as HTMLElement).dataset.blinkCount ?? 0);
        const eyesAreClosed = (element as HTMLElement).dataset.eyeState === 'closed';
        if (eyesAreClosed && blinkCount > previousBlinkCount) {
          Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: true,
          });
          document.dispatchEvent(new Event('visibilitychange'));
          resolve();
          return;
        }
        if (performance.now() - startedAt > 7_000) {
          reject(new Error('Angel did not complete a visible blink within the idle window.'));
          return;
        }
        requestAnimationFrame(waitForClosedEyes);
      };
      waitForClosedEyes();
    }), blinkCountBefore);
    expect(Number(await scene.getAttribute('data-blink-count'))).toBeGreaterThan(blinkCountBefore);
    await page.locator('.angel-showcase-canvas').screenshot({
      path: testInfo.outputPath('void-lord-living-blink.png'),
    });
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    const initialSurge = Number(await dialog.getAttribute('data-surge-signal'));
    await dialog.getByRole('button', { name: 'Unleash Celestial Surge' }).click();
    await expect(dialog).toHaveAttribute('data-surge-signal', String(initialSurge + 1));

    for (const viewport of [{ width: 390, height: 720 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport);
      const layout = await dialog.evaluate(element => {
        const close = element.querySelector('.angel-showcase-close')!.getBoundingClientRect();
        const footer = element.querySelector('.angel-showcase-footer')!.getBoundingClientRect();
        return {
          bodyWidth: document.body.scrollWidth,
          closeRight: close.right,
          closeTop: close.top,
          dialogHeight: element.getBoundingClientRect().height,
          footerBottom: footer.bottom,
          footerLeft: footer.left,
          footerRight: footer.right,
          viewportHeight: innerHeight,
          viewportWidth: innerWidth,
        };
      });
      expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.dialogHeight).toBe(layout.viewportHeight);
      expect(layout.closeTop).toBeGreaterThanOrEqual(0);
      expect(layout.closeRight).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.footerLeft).toBeGreaterThanOrEqual(0);
      expect(layout.footerRight).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.footerBottom).toBeLessThanOrEqual(layout.viewportHeight);
    }

    await page.screenshot({ path: testInfo.outputPath('void-lord-showcase-320x568.png') });
    await dialog.getByRole('button', { name: 'Close hero showcase' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.angel-showcase-canvas')).toHaveCount(0);
    await expect(previewAction).toBeFocused();
    expect(pageErrors).toEqual([]);
  });
});

test('closing the angel during asset loading does not resurrect a WebGL canvas', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/assets/heroes/showcase/*.webp', async route => {
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.continue();
  });
  await seedVoidLordCollection(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Heroes', exact: true }).click();

  const firstAssetRequest = page.waitForRequest(request => (
    request.url().includes('/assets/heroes/showcase/')
  ));
  await page.getByRole('button', { name: 'Preview Void Lord animation' }).click();
  await firstAssetRequest;
  await page.getByRole('button', { name: 'Close hero showcase' }).click();

  await expect(page.locator('.angel-showcase')).toHaveCount(0);
  await page.waitForTimeout(700);
  await expect(page.locator('.angel-showcase-canvas')).toHaveCount(0);
  await expect(page.getByTestId('game-crash-fallback')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test.describe('low-end Telegram Android angel showcase', () => {
  test.use({
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 11; K) AppleWebKit/537.36 Mobile '
      + 'Telegram-Android/11.3.3 (Budget Phone; Android 11; SDK 30; LOW)',
  });

  test('loads only compact hero layers and caps GPU work automatically', async ({ page }) => {
    const pageErrors: string[] = [];
    const showcaseRequests: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
      if (request.url().includes('/assets/heroes/showcase/')) {
        showcaseRequests.push(request.url());
      }
    });
    await seedVoidLordCollection(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Heroes', exact: true }).click();
    expect(showcaseRequests).toEqual([]);

    await page.getByRole('button', { name: 'Preview Void Lord animation' }).click();
    const scene = page.locator('.angel-showcase-scene');
    await expect(scene).toHaveAttribute('data-art-loaded', 'true', { timeout: 8_000 });
    await expect(scene).toHaveAttribute('data-render-quality', 'low');
    await expect(scene).toHaveAttribute('data-asset-variant', 'low');
    await expect(scene).toHaveAttribute('data-particle-count', '5');
    await expect(scene).toHaveAttribute('data-ticker-max-fps', '30');
    await expect(scene).toHaveAttribute('data-render-resolution', '1');
    await expect(scene).toHaveAttribute('data-living-idle', 'active');
    await expect(scene).toHaveAttribute('data-mesh-vertex-count', '91');
    await expect.poll(() => showcaseRequests.length).toBe(3);
    expect(showcaseRequests.every(url => url.endsWith('-low.webp'))).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});

test('rift loads production art without overflowing narrow Telegram viewports', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Attack Mirefang Stalker' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mirefang Stalker' })).toBeVisible();
  await expect(page.locator('.rift-pixi-canvas')).toHaveCount(1);
  await expect(page.locator('.rift-pixi-scene')).toHaveAttribute('data-enemy-id', 'mirefang-stalker');
  await expect(page.locator('.rift-pixi-scene')).toHaveAttribute('data-art-loaded', 'true');
  // The rift background is now the procedural biome world, not a static backdrop
  // image, so the scene advertises which biome it is rendering.
  await expect(page.locator('.rift-pixi-scene')).toHaveAttribute('data-biome', 'luminous-verge');

  for (const viewport of [{ width: 390, height: 720 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const navigation = document.querySelector('.bottom-nav')?.getBoundingClientRect();
      const navigationButtons = [...document.querySelectorAll('.bottom-nav .nav-btn')]
        .map(button => button.getBoundingClientRect());

      return {
        bodyWidth: document.body.scrollWidth,
        buttonCount: navigationButtons.length,
        minButtonHeight: Math.min(...navigationButtons.map(button => button.height)),
        minButtonWidth: Math.min(...navigationButtons.map(button => button.width)),
        navigationBottom: navigation?.bottom ?? -1,
        navigationLeft: navigation?.left ?? -1,
        navigationRight: navigation?.right ?? Number.POSITIVE_INFINITY,
        panelWidth: document.querySelector('.enemy-panel')?.getBoundingClientRect().width ?? 0,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });

    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.panelWidth).toBeGreaterThan(280);
    expect(layout.panelWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.buttonCount).toBe(4);
    expect(layout.minButtonHeight).toBeGreaterThanOrEqual(44);
    expect(layout.minButtonWidth).toBeGreaterThanOrEqual(70);
    expect(layout.navigationLeft).toBe(0);
    expect(layout.navigationRight).toBe(layout.viewportWidth);
    expect(layout.navigationBottom).toBe(layout.viewportHeight);
  }
});

test('animates the skinned Ironroot model without rebuilding the Three.js scene', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await seedIronrootEncounter(page);
  await page.goto('/');

  const scene = page.locator('.rift-three-scene');
  const monster = page.locator('.monster-button');
  await expect(scene).toHaveAttribute('data-enemy-id', 'ironroot-marauder');
  await expect(scene).toHaveAttribute('data-enemy-rig', 'skinned-three');
  await expect(scene).toHaveAttribute('data-art-loaded', 'true');
  await expect(scene.locator('canvas')).toHaveCount(1);
  await expect(scene).toHaveAttribute('data-scene-build-count', '1');

  const triggerObservedImpact = async (horizontalPosition: number, expectedDirection: 'left' | 'right') => (
    page.evaluate(async ({ direction, position }) => {
      const button = document.querySelector<HTMLButtonElement>('.monster-button')!;
      const rig = document.querySelector<HTMLElement>('.rift-three-scene')!;
      const bounds = button.getBoundingClientRect();
      const startedAt = performance.now();

      return new Promise<{ direction: string; latencyMs: number; phase: string }>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled || rig.dataset.hitReactionPhase !== 'impact' || rig.dataset.hitDirection !== direction) {
            return;
          }
          settled = true;
          observer.disconnect();
          resolve({
            direction: rig.dataset.hitDirection ?? '',
            latencyMs: performance.now() - startedAt,
            phase: rig.dataset.hitReactionPhase ?? '',
          });
        };
        const observer = new MutationObserver(finish);
        observer.observe(rig, { attributes: true });
        button.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left + bounds.width * position,
          clientY: bounds.top + bounds.height * 0.46,
          pointerType: 'touch',
        }));
        finish();
        window.setTimeout(() => {
          if (!settled) {
            settled = true;
            observer.disconnect();
            resolve({
              direction: rig.dataset.hitDirection ?? '',
              latencyMs: Number.POSITIVE_INFINITY,
              phase: rig.dataset.hitReactionPhase ?? '',
            });
          }
        }, 250);
      });
    }, { direction: expectedDirection, position: horizontalPosition })
  );

  const leftImpact = await triggerObservedImpact(0.2, 'left');
  expect(leftImpact).toMatchObject({ direction: 'left', phase: 'impact' });
  expect(leftImpact.latencyMs).toBeLessThanOrEqual(80);
  await page.waitForTimeout(450);

  const rightImpact = await triggerObservedImpact(0.8, 'right');
  expect(rightImpact).toMatchObject({ direction: 'right', phase: 'impact' });
  expect(rightImpact.latencyMs).toBeLessThanOrEqual(80);

  const initialSceneBuilds = await scene.getAttribute('data-scene-build-count');
  await monster.evaluate(async button => {
    const bounds = button.getBoundingClientRect();
    for (let index = 0; index < 10; index += 1) {
      button.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + bounds.width * (index % 2 === 0 ? 0.2 : 0.8),
        clientY: bounds.top + bounds.height * 0.46,
        pointerType: 'touch',
      }));
      await new Promise(resolve => window.setTimeout(resolve, 20));
    }
  });

  await expect(scene).toHaveAttribute('data-scene-build-count', initialSceneBuilds ?? '1');
  await expect(scene.locator('canvas')).toHaveCount(1);
  await expect(scene).toHaveAttribute('data-rig-root-scale', '1.0000');
  await expect(scene).toHaveAttribute('data-enemy-rig', 'skinned-three');
  await page.waitForTimeout(700);
  await expect(scene).toHaveAttribute('data-hit-reaction-phase', 'idle');
  expect(pageErrors).toEqual([]);
});

test('plays Ironroot death before handing the canvas to the next enemy', async ({ page }) => {
  await seedIronrootEncounter(page, '1');
  await page.goto('/');

  const scene = page.locator('.rift-three-scene');
  await expect(scene).toHaveAttribute('data-enemy-rig', 'skinned-three');
  await page.locator('.monster-button').click({ position: { x: 90, y: 180 } });

  await expect(scene).toHaveAttribute('data-hit-reaction-phase', 'death', { timeout: 1_000 });
  await expect(page.locator('.stage-mark strong')).toHaveText('2');
  await expect(page.locator('.stage-mark')).toContainText('Wave 2/3');
  await expect(scene).toHaveAttribute('data-enemy-id', 'ironroot-marauder');
  await page.waitForTimeout(720);
  await expect(scene).toHaveCount(0);
  const nextScene = page.locator('.rift-pixi-scene');
  await expect(nextScene).toHaveAttribute('data-enemy-id', 'ashveil-oracle');
  await expect(nextScene).toHaveAttribute('data-enemy-rig', 'static-sprite');
  await expect(nextScene.locator('canvas')).toHaveCount(1);
});

test('falls back to the static Ironroot sprite when its GLB cannot load', async ({ page }) => {
  await page.route('**/assets/rift/ironroot-3d/**', route => route.abort());
  await seedIronrootEncounter(page);
  await page.goto('/');

  const scene = page.locator('.rift-three-scene');
  await expect(scene).toHaveAttribute('data-enemy-id', 'ironroot-marauder');
  await expect(scene).toHaveAttribute('data-enemy-rig', 'static-sprite');
  await expect(scene).toHaveAttribute('data-art-loaded', 'true');
  await expect(scene.locator('canvas')).toHaveCount(0);
  await expect(scene.locator('.rift-three-fallback')).toHaveCount(1);
});

test('advances through enemy waves before increasing the campaign stage', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 7,
      activeHeroIds: [],
      bossEncounterEndsAt: null,
      comboCount: 0,
      comboExpiresAt: null,
      enemyIndex: 0,
      gems: 30,
      gold: '1000',
      heroes: [],
      stage: 1,
      summonPity: 0,
      monsterMaxHealth: '1',
      monsterHealth: '1',
      lastSeenAt: now,
      updatedAt: now,
    }));
  });
  await page.goto('/');

  await expect(page.locator('.stage-mark strong')).toHaveText('1');
  await expect(page.locator('.stage-mark')).toContainText('Wave 1/3');
  await page.locator('.monster-button').click();

  await expect(page.locator('.stage-mark strong')).toHaveText('1');
  await expect(page.locator('.stage-mark')).toContainText('Wave 2/3');
  await expect(page.locator('.rift-clear-banner')).toContainText('Enemy Defeated');
  await expect(page.locator('.rift-clear-banner')).toContainText('Wave 2/3');
  expect(pageErrors).toEqual([]);
});

test.describe('average Telegram Android performance profile', () => {
  test.use({
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 Mobile '
      + 'Telegram-Android/11.3.3 (Google Pixel 6a; Android 14; SDK 34; AVERAGE)',
  });

  test('keeps the stage 149 to 150 boss transition within its render budget', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      const now = new Date().toISOString();
      localStorage.setItem('rift_heroes_save', JSON.stringify({
        schemaVersion: 5,
        // No active warband on purpose: a passive tick would otherwise kill the
        // one-health enemy within a second, racing the async art load, so the
        // pre-boss scene sometimes never rendered and the transition below could
        // not be observed. With no idle damage the enemy waits for an explicit
        // tap, making the 149 -> 150 handoff deterministic.
        activeHeroIds: [],
        bossEncounterEndsAt: null,
        comboCount: 0,
        comboExpiresAt: null,
        enemyIndex: 2,
        gems: 50,
        gold: '1000',
        heroes: [
          { ascension: 0, id: 'grunt-150', name: 'Void Grunt', rarity: 'Common', level: 3, power: '15000000000000', shards: 0, templateId: 'void-grunt' },
          { ascension: 0, id: 'mage-150', name: 'Void Mage', rarity: 'Rare', level: 4, power: '15000000000000', shards: 0, templateId: 'void-mage' },
          { ascension: 0, id: 'knight-150', name: 'Void Knight', rarity: 'Epic', level: 5, power: '15000000000000', shards: 0, templateId: 'void-knight' },
          { ascension: 0, id: 'lord-150', name: 'Void Lord', rarity: 'Legendary', level: 6, power: '15000000000000', shards: 0, templateId: 'void-lord' },
        ],
        stage: 149,
        monsterMaxHealth: '52338878808753',
        monsterHealth: '1',
        lastSeenAt: now,
        updatedAt: now,
      }));
    });
    await page.goto('/');

    const scene = page.locator('.rift-pixi-scene');
    await expect(scene).toHaveAttribute('data-art-loaded', 'true');
    await expect(scene).toHaveAttribute('data-render-quality', 'balanced');
    await expect(scene).toHaveAttribute('data-scene-build-count', '1');
    await expect(page.locator('.rift-spark')).toHaveCount(8);

    const initialSceneBuilds = Number(await scene.getAttribute('data-scene-build-count'));

    // Drive the boss transition with an explicit tap. The one-health enemy dies
    // to a single hit, advancing to the stage 150 sovereign, so the rebuild is
    // caused by a test-controlled event rather than a timer racing asset loads.
    await page.locator('.monster-button').click();

    await expect(page.locator('.stage-mark strong')).toHaveText('150', { timeout: 4_000 });
    await expect(scene).toHaveAttribute('data-enemy-id', 'crowned-rift-sovereign');
    await expect(scene).toHaveAttribute('data-art-loaded', 'true');
    await expect(scene).toHaveAttribute('data-particle-count', '24');

    const renderBudget = await scene.evaluate(element => {
      const canvas = element.querySelector('canvas')!;
      const bounds = canvas.getBoundingClientRect();
      const beastShell = document.querySelector('.rift-beast-shell')!;
      return {
        canvasWidth: canvas.width,
        canvasCssWidth: bounds.width,
        renderQuality: document.documentElement.dataset.renderQuality,
        sceneBuilds: Number(element.getAttribute('data-scene-build-count')),
        shellAnimations: beastShell.getAnimations().length,
      };
    });

    expect(renderBudget.renderQuality).toBe('balanced');
    expect(renderBudget.canvasWidth).toBeLessThanOrEqual(Math.ceil(renderBudget.canvasCssWidth * 1.5));
    expect(renderBudget.sceneBuilds - initialSceneBuilds).toBe(1);
    expect(renderBudget.shellAnimations).toBe(0);
    expect(pageErrors).toEqual([]);
  });

  test('keeps the summon loop inside the narrowest supported mobile viewport', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => {
      Math.random = () => 0;
      const now = new Date().toISOString();
      localStorage.setItem('rift_heroes_save', JSON.stringify({
        schemaVersion: 4,
        bossEncounterEndsAt: null,
        comboCount: 0,
        comboExpiresAt: null,
        enemyIndex: 0,
        gems: 500,
        gold: '1000',
        heroes: [],
        stage: 1,
        summonPity: 59,
        monsterMaxHealth: '100',
        monsterHealth: '100',
        lastSeenAt: now,
        updatedAt: now,
      }));
    });
    await page.goto('/');

    await page.getByRole('button', { name: 'Summon', exact: true }).click();
    const summonView = page.locator('.summon-view');
    const summonAction = page.locator('.summon-action');
    await expect(summonView).toHaveAttribute('data-render-quality', 'balanced');
    await expect(summonView).toHaveAttribute('data-celebration-particle-count', '98');
    await expect(summonAction).toContainText('Legendary guaranteed in 1');
    await expect(summonView.getByText('2%', { exact: true })).toBeVisible();
    await expect(summonView.getByLabel('Legendary 2%')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (
      getComputedStyle(document.querySelector('.app-shell')!).backgroundImage
    ))).toContain('/assets/summon/rift-sanctuary.webp');

    const idleLayout = await page.evaluate(() => {
      const action = document.querySelector('.summon-action')!.getBoundingClientRect();
      const navigation = document.querySelector('.bottom-nav')!.getBoundingClientRect();
      const rates = document.querySelector('.summon-rates')!.getBoundingClientRect();
      return {
        actionBottom: action.bottom,
        actionHeight: action.height,
        bodyHeight: document.body.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        navigationTop: navigation.top,
        ratesBottom: rates.bottom,
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
      };
    });
    expect(idleLayout.bodyHeight).toBe(idleLayout.viewportHeight);
    expect(idleLayout.bodyWidth).toBe(idleLayout.viewportWidth);
    expect(idleLayout.actionHeight).toBeGreaterThanOrEqual(44);
    expect(idleLayout.ratesBottom).toBeLessThan(idleLayout.actionBottom);
    expect(idleLayout.actionBottom).toBeLessThanOrEqual(idleLayout.navigationTop);

    await summonAction.click();
    await expect(summonView).toHaveAttribute('data-summon-phase', 'charging');
    const resultDialog = page.getByRole('dialog', { name: 'Void Lord' });
    await expect(resultDialog).toBeVisible({ timeout: 5_000 });
    await expect(resultDialog.getByText('Legendary champion', { exact: true })).toBeVisible();
    await expect(resultDialog.getByText('Starting power', { exact: true })).toBeVisible();
    const claimButton = resultDialog.getByRole('button', { name: 'Claim champion' });
    const repeatButton = resultDialog.getByRole('button', { name: 'Summon again for 10 gems' });
    await expect(claimButton).toBeVisible();
    await expect(claimButton).toBeFocused();
    await expect(repeatButton).toBeEnabled();
    await expect(page.locator('.resource-item.gem .amount')).toHaveText('490');
    await page.keyboard.press('Tab');
    await expect(repeatButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(claimButton).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(repeatButton).toBeFocused();

    const resultLayout = await resultDialog.locator('.summon-result-card').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const navigation = document.querySelector('.bottom-nav')!.getBoundingClientRect();
      const topbar = document.querySelector('.topbar')!.getBoundingClientRect();
      const claim = element.querySelector('button')!.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        claimHeight: claim.height,
        navigationTop: navigation.top,
        top: bounds.top,
        topbarBottom: topbar.bottom,
      };
    });
    expect(resultLayout.top).toBeGreaterThanOrEqual(resultLayout.topbarBottom);
    expect(resultLayout.bottom).toBeLessThanOrEqual(resultLayout.navigationTop);
    expect(resultLayout.claimHeight).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => {
      const navigation = document.querySelector('.bottom-nav')!.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(navigation.left + 20, navigation.top + 20);
      return hitTarget?.closest('.summon-result-backdrop') !== null;
    })).toBe(true);

    await repeatButton.click();
    await expect(summonView).toHaveAttribute('data-summon-phase', 'charging');
    await expect(summonView).toHaveAttribute('data-summon-phase', 'result', { timeout: 5_000 });
    const repeatResultDialog = page.getByRole('dialog');
    await expect(repeatResultDialog).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.resource-item.gem .amount')).toHaveText('480');
    await page.keyboard.press('Escape');
    await expect(repeatResultDialog).toHaveCount(0);
    await expect(summonView).toHaveAttribute('data-summon-phase', 'idle');
    expect(pageErrors).toEqual([]);
  });
});

test('boss attempt exposes phases and resets through the shared engine after enrage', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Math.random = () => 0.5;
    const now = Date.now();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 5,
      activeHeroIds: [],
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
  await expect(page.getByRole('timer')).toContainText(/4[0-5]s/);
});

test('authoritative passive volleys animate every hero without overflowing the combat footer', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 5,
      activeHeroIds: ['grunt-1', 'mage-1', 'knight-1', 'lord-1'],
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

const seedRiftSave = (page: import('@playwright/test').Page, overrides: { lastSeenMsAgo: number }) => (
  page.addInitScript(msAgo => {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 6,
      activeHeroIds: ['idle-hero'],
      bossEncounterEndsAt: null,
      comboCount: 0,
      comboExpiresAt: null,
      gems: 50,
      gold: '1000',
      heroes: [{ ascension: 0, id: 'idle-hero', name: 'Idle Hero', rarity: 'Rare', level: 3, power: '10', shards: 0, templateId: 'void-mage' }],
      stage: 1,
      monsterMaxHealth: '1000000000',
      monsterHealth: '1000000000',
      lastPassiveTickAt: iso(now),
      lastSeenAt: iso(now - msAgo),
      updatedAt: iso(now - msAgo),
    }));
  }, overrides.lastSeenMsAgo)
);

test('welcomes the player back with the offline reward after a long absence', async ({ page }) => {
  await seedRiftSave(page, { lastSeenMsAgo: 60 * 60 * 1000 }); // an hour away
  await page.goto('/');

  const modal = page.locator('.welcome-back-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(/хв|г/); // away duration label
  await expect(page.locator('.welcome-back-gold')).toContainText('+');

  await page.getByRole('button', { name: 'Забрати' }).click();
  await expect(modal).toHaveCount(0);
});

test('does not interrupt a returning player who was only away briefly', async ({ page }) => {
  await seedRiftSave(page, { lastSeenMsAgo: 90 * 1000 }); // 90s — under the 5 min modal threshold
  await page.goto('/');

  await expect(page.locator('.health-track')).toBeVisible();
  // The gold is still credited silently; the modal must never appear.
  await expect(page.locator('.welcome-back-modal')).toHaveCount(0);
});

test('crosses into a new biome with a banner as the journey advances', async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 6,
      activeHeroIds: ['crusher'],
      bossEncounterEndsAt: null,
      comboCount: 0,
      comboExpiresAt: null,
      gems: 50,
      gold: '1000',
      heroes: [{ ascension: 0, id: 'crusher', name: 'Crusher', rarity: 'Legendary', level: 60, power: '1000000000000', shards: 0, templateId: 'void-lord' }],
      stage: 10,
      monsterMaxHealth: '1',
      monsterHealth: '1',
      lastPassiveTickAt: iso(now),
      lastSeenAt: iso(now),
      updatedAt: iso(now),
    }));
  });
  await page.goto('/');

  const scene = page.locator('.rift-pixi-scene');
  await expect(scene).toHaveAttribute('data-biome', 'luminous-verge', { timeout: 8_000 });
  // The one-health stage-10 boss dies to the auto passive tick, advancing to
  // stage 11 — the first stage of the next biome.
  await expect(scene).toHaveAttribute('data-biome', 'ember-deep', { timeout: 10_000 });
  await expect(page.locator('.biome-enter-banner')).toContainText('Ember Deep');
});

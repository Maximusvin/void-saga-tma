import { expect, test } from '@playwright/test';

test('requests Telegram fullscreen and configures immersive host colors when supported', async ({ page }) => {
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
  expect(realmAction?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(closeAction?.height ?? 0).toBeGreaterThanOrEqual(44);

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
    await expect(page.getByText('Unranked', { exact: true })).toBeVisible();
    await expect(page.locator('.leaderboard-row')).toHaveCount(0);

    await page.getByRole('button', { name: 'Campaign', exact: true }).click();
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
        schemaVersion: 4,
        bossEncounterEndsAt: null,
        comboCount: 0,
        comboExpiresAt: null,
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
    await expect(page.locator('.stage-mark strong')).toHaveText('150', { timeout: 4_000 });
    await expect(scene).toHaveAttribute('data-enemy-id', 'crowned-rift-sovereign');
    await expect(scene).toHaveAttribute('data-art-loaded', 'true');
    await expect(scene).toHaveAttribute('data-particle-count', '24');

    const renderBudget = await scene.evaluate(element => {
      const canvas = element.querySelector('canvas')!;
      const bounds = canvas.getBoundingClientRect();
      const beastShell = document.querySelector('.rift-beast-shell')!;
      return {
        canvasResolution: canvas.width / bounds.width,
        renderQuality: document.documentElement.dataset.renderQuality,
        sceneBuilds: Number(element.getAttribute('data-scene-build-count')),
        shellAnimations: beastShell.getAnimations().length,
      };
    });

    expect(renderBudget.renderQuality).toBe('balanced');
    expect(renderBudget.canvasResolution).toBeLessThanOrEqual(1.51);
    expect(renderBudget.sceneBuilds - initialSceneBuilds).toBe(1);
    expect(renderBudget.shellAnimations).toBe(0);
    expect(pageErrors).toEqual([]);
  });

  test('keeps the summon sanctuary and legendary reveal inside a short mobile viewport', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.setViewportSize({ width: 360, height: 640 });
    await page.addInitScript(() => {
      Math.random = () => 0.95;
      const now = new Date().toISOString();
      localStorage.setItem('rift_heroes_save', JSON.stringify({
        schemaVersion: 4,
        bossEncounterEndsAt: null,
        comboCount: 0,
        comboExpiresAt: null,
        gems: 500,
        gold: '1000',
        heroes: [],
        stage: 1,
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
    await expect(claimButton).toBeVisible();
    await expect(claimButton).toBeFocused();
    await expect(page.locator('.resource-item.gem .amount')).toHaveText('490');

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
    expect(pageErrors).toEqual([]);
  });
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

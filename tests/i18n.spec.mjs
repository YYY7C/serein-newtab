import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather, trackPageErrors } from './helpers.mjs';

test.describe('english interface', () => {
  test.use({ locale: 'en-US' });

  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('main screen, seed content and Intl formatting are English', async ({ page }) => {
    const errors = trackPageErrors(page);
    await gotoNewTab(page);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-locale', 'en');

    await expect(page.locator('#greeting')).toContainText(
      /Good morning|Good afternoon|Good evening|Late night/
    );
    const dateText = await page.locator('#dateline').innerText();
    expect(dateText).toMatch(/^[A-Z][a-z]+ \d{1,2}/);

    await expect(page.locator('#search-input')).toHaveAttribute(
      'placeholder',
      'Search, or enter a URL'
    );
    await expect(page.locator('#search-hint')).toContainText('Focus search');
    await expect(page.locator('.tile-label').first()).toHaveText('Baidu');
    await expect(page.locator('.tile[data-kind="group"] .tile-label').first()).toHaveText('Tools');

    const titles = (await page.locator('#sidebar .card-title').allInnerTexts()).join(' | ').toLowerCase();
    expect(titles).toContain('weather');
    expect(titles).toContain('to-dos');
    expect(titles).toContain('notes');
    await expect(page.locator('.city-name')).toHaveText('Beijing');
    await expect(page.locator('.weather-body')).toContainText('Clear');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/[\u4e00-\u9fff]/);

    expect(errors).toEqual([]);
  });

  test('engine menu uses translated names and Latin badges', async ({ page }) => {
    await gotoNewTab(page);
    await page.locator('#engine-btn').click();
    const menu = page.locator('.menu');
    await expect(menu).toContainText('Bing');
    await expect(menu).toContainText('Bilibili');
    await expect(menu).not.toContainText('必应');
    await expect(menu).not.toContainText('哔哩哔哩');
    await page.mouse.click(10, 10);
    await expect(page.locator('.menu.is-open')).toHaveCount(0);
  });

  test('city picker searches pinyin and stores the English city name', async ({ page }) => {
    await gotoNewTab(page);
    await page.locator('.weather-city').click();
    const picker = page.locator('.modal.is-open');
    await expect(picker.locator('.modal-title')).toHaveText('Choose a city');

    const input = picker.getByRole('combobox');
    await input.fill('Xiamen');
    await expect(picker.locator('.city-result').first()).toContainText('Xiamen', { timeout: 8000 });
    await expect(picker.locator('.city-result').first()).toContainText('Fujian');

    await picker.locator('.city-result').first().click();
    await expect(page.locator('.city-name')).toHaveText('Xiamen');

    const saved = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return { city: store.state.weather.city, cityEn: store.state.weather.cityEn };
    });
    expect(saved).toEqual({ city: '厦门', cityEn: 'Xiamen' });
  });

  test('settings sections, modals and runtime dictionary stay English', async ({ page }) => {
    const errors = trackPageErrors(page);
    await gotoNewTab(page);
    await page.locator('button[data-action="settings"]').click();
    await expect(page.locator('.settings-title')).toHaveText('Appearance');
    await expect(page.locator('.settings-nav .nav-item')).toHaveText([
      'Appearance',
      'Wallpaper',
      'Layout',
      'Shortcuts',
      'Widgets',
      'Search',
      'Data',
      'About',
    ]);

    for (const id of ['wallpaper', 'layout', 'shortcuts', 'widgets', 'search', 'data', 'about']) {
      await page.locator(`.settings-nav [data-tab="${id}"]`).click();
      await expect(page.locator('.settings-body')).not.toBeEmpty();
      const sectionText = await page.locator('.settings-body').innerText();
      expect(sectionText).not.toMatch(/[\u4e00-\u9fff]/);
    }
    await page.locator('.settings-nav [data-tab="appearance"]').click();
    const appearanceText = (await page.locator('.settings-body').innerText()).replace('简体中文', '');
    expect(appearanceText).not.toMatch(/[\u4e00-\u9fff]/);

    await page.evaluate(async () => {
      const tiles = await import('/assets/js/tiles.js');
      tiles.addShortcut();
    });
    const dialog = page.locator('.modal.is-open');
    await expect(dialog.locator('.modal-title')).toHaveText('Add shortcut');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    const missing = await page.evaluate(async () => {
      const i18n = await import('/assets/js/i18n.js');
      return i18n.missingI18nKeys();
    });
    expect(missing).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('switches language in place and remembers the choice', async ({ page }) => {
    await gotoNewTab(page);
    await page.locator('button[data-action="settings"]').click();
    await page.locator('.settings-body [data-value="zh-CN"]').click();
    await expect(page.locator('.settings-title')).toHaveText('外观');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

    const preference = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return store.state.config.language;
    });
    expect(preference).toBe('zh-CN');

    await page.locator('.settings-body [data-value="en"]').click();
    await expect(page.locator('.settings-title')).toHaveText('Appearance');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#search-hint')).toContainText('Focus search');
  });
});

test.describe('english onboarding', () => {
  test.use({ locale: 'en-US' });

  test('first run speaks English end to end', async ({ page }) => {
    await mockWeather(page);
    await page.goto('/newtab.html', { waitUntil: 'load' });
    const dialog = page.locator('.modal.is-open');
    await expect(dialog).toHaveCount(1, { timeout: 5000 });
    await expect(dialog.locator('.modal-title')).toHaveText('Welcome to Serein');
    await expect(dialog.getByRole('button', { name: 'Beijing' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Get started' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Beijing' }).click();
    await expect(dialog.locator('.field label')).toContainText('Beijing');
    await dialog.getByRole('button', { name: 'Get started' }).click();
    await expect(page.locator('.modal.is-open')).toHaveCount(0);

    const weather = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.flushNow();
      return { city: store.state.weather.city, cityEn: store.state.weather.cityEn };
    });
    expect(weather).toEqual({ city: '北京', cityEn: 'Beijing' });
  });
});

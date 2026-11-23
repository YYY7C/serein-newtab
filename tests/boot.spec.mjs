import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather, trackPageErrors } from './helpers.mjs';

test.describe('启动', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('首屏渲染种子网格、时钟与搜索框', async ({ page }) => {
    const errors = trackPageErrors(page);
    await gotoNewTab(page);

    await expect(page).toHaveTitle('Serein');
    await expect(page.locator('#clock-time')).toBeVisible();
    await expect(page.locator('#dateline')).toContainText('11月');
    await expect(page.locator('#search-form')).toBeVisible();
    await expect(page.locator('#grid .tile')).toHaveCount(13);
    await expect(page.locator('#grid .tile--add')).toBeVisible();
    await expect(page.locator('#sidebar .card')).toHaveCount(3);

    expect(errors).toEqual([]);
  });

  test('设置持久化：改强调色后刷新仍在', async ({ page }) => {
    await gotoNewTab(page);
    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.state.config.accent = '#22c55e';
      store.commit('config');
      store.flushNow();
    });
    await expect(page.locator('html')).toHaveCSS('--accent', '#22c55e');

    await page.reload({ waitUntil: 'load' });
    const accent = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return store.state.config.accent;
    });
    expect(accent).toBe('#22c55e');
  });
});

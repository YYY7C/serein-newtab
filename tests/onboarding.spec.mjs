import { test, expect } from '@playwright/test';
import { mockWeather } from './helpers.mjs';

test.describe('首次启动引导', () => {
  test('选城市并完成，刷新后不再出现', async ({ page }) => {
    await mockWeather(page);
    await page.goto('/newtab.html', { waitUntil: 'load' });

    const dialog = page.locator('.modal.is-open');
    await expect(dialog).toHaveCount(1, { timeout: 4000 });
    await expect(dialog.locator('.modal-title')).toHaveText('欢迎使用 Serein');
    await expect(dialog.getByRole('button', { name: '北京' })).toBeVisible();

    await dialog.getByRole('button', { name: '上海' }).click();
    await expect(dialog.locator('.field label')).toContainText('上海');

    await dialog.getByRole('button', { name: '开始使用' }).click();
    await expect(page.locator('.modal.is-open')).toHaveCount(0);

    const onboarded = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.flushNow();
      return store.state.meta.onboarded;
    });
    expect(onboarded).toBe(true);

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await expect(page.locator('.modal.is-open')).toHaveCount(0);
  });

  test('跳过也会记录完成，不阻塞首屏', async ({ page }) => {
    await mockWeather(page);
    await page.goto('/newtab.html', { waitUntil: 'load' });

    const dialog = page.locator('.modal.is-open');
    await expect(dialog).toHaveCount(1, { timeout: 4000 });
    await dialog.getByRole('button', { name: '跳过' }).click();

    const onboarded = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return store.state.meta.onboarded;
    });
    expect(onboarded).toBe(true);
    await expect(page.locator('#grid .tile')).toHaveCount(13);
  });
});

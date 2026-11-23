import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather } from './helpers.mjs';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function openWallpaper(page) {
  await page.locator('button[data-action="settings"]').click();
  await page.locator('.settings .nav-item', { hasText: '壁纸' }).click();
  await expect(page.locator('.settings-title')).toHaveText('壁纸');
}

const bgState = (page) =>
  page.evaluate(async () => {
    const store = await import('/assets/js/store.js');
    const bg = store.state.config.background;
    return { type: bg.type, fileId: bg.fileId, pool: bg.pool, rotation: bg.rotation };
  });

test.describe('本地壁纸池与轮换', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('多选上传、切换、轮换与删除', async ({ page }) => {
    await gotoNewTab(page);
    await openWallpaper(page);

    await page.locator('.wallpaper-type button', { hasText: '本地' }).click();
    const fileInput = page.locator('.settings input[type="file"]');
    await fileInput.setInputFiles([
      { name: 'one.png', mimeType: 'image/png', buffer: PNG },
      { name: 'two.png', mimeType: 'image/png', buffer: PNG },
    ]);
    await expect(page.locator('.toast-text').last()).toContainText('已添加 2 张本地壁纸');
    await expect(page.locator('.pool-item')).toHaveCount(2);

    let state = await bgState(page);
    expect(state.pool).toHaveLength(2);
    expect(state.fileId).toBe(state.pool[0].id);
    expect(state.pool.map((item) => item.name)).toEqual(['one.png', 'two.png']);

    await page.locator('.pool-thumb').nth(1).click();
    state = await bgState(page);
    expect(state.fileId).toBe(state.pool[1].id);

    await page.getByRole('button', { name: '每个新标签页' }).click();
    await page.getByRole('button', { name: '换一张', exact: true }).click();
    state = await bgState(page);
    expect(state.fileId).toBe(state.pool[0].id);
    expect(state.rotation).toBe('newtab');

    await page.waitForTimeout(300);
    await page.reload({ waitUntil: 'load' });
    await openWallpaper(page);
    await expect(page.locator('.pool-item')).toHaveCount(2);

    await page.getByRole('button', { name: '删除壁纸 one.png' }).click();
    await expect(page.locator('.pool-item')).toHaveCount(1);
    state = await bgState(page);
    expect(state.pool).toHaveLength(1);
    expect(state.pool[0].name).toBe('two.png');
    await expect(page.getByRole('button', { name: '换一张', exact: true })).toBeDisabled();
  });

  test('每个新标签页模式会在新页面换一张', async ({ page, context }) => {
    await gotoNewTab(page);
    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      const bg = store.state.config.background;
      bg.type = 'file';
      bg.pool = [
        { id: 'wtest1', name: '第一张', addedAt: 1 },
        { id: 'wtest2', name: '第二张', addedAt: 2 },
      ];
      bg.fileId = 'wtest1';
      bg.rotation = 'newtab';
      bg.rotatedAt = 0;
      store.commit('config');
      store.flushNow();
    });
    await page.waitForTimeout(200);

    const second = await context.newPage();
    await second.goto('/newtab.html?no-onboard', { waitUntil: 'load' });
    await expect(second.locator('#grid .tile').first()).toBeVisible();
    const fileId = await second.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return store.state.config.background.fileId;
    });
    expect(fileId).toBe('wtest2');
    await second.close();
  });
});

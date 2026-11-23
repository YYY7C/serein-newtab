import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather } from './helpers.mjs';

const TITLE = '__pw_multitab__';

test.describe('多标签页数据安全', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('新标签页采纳写入，旧标签页关闭不覆盖', async ({ page, context }) => {
    await gotoNewTab(page);
    const second = await context.newPage();
    await mockWeather(second);
    await gotoNewTab(second);

    // A 写入
    await page.evaluate(async (title) => {
      const store = await import('/assets/js/store.js');
      store.addShortcut({ title, url: 'https://example.com/multitab', iconType: 'auto', iconValue: '' });
      store.flushNow();
    }, TITLE);

    // B 无需刷新即可看到，并完成版本号同步
    await expect(second.locator(`.tile[title^="${TITLE}"]`)).toBeVisible();
    const revs = await second.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return { rev: store.state.meta.rev, disk: JSON.parse(localStorage.getItem('serein.state.v1')).meta.rev };
    });
    expect(revs.rev).toBe(revs.disk);

    // 模拟「另一个标签页写入后，本页仍空闲」：flush 不得覆盖
    const marker = await second.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      const key = 'serein.state.v1';
      const disk = JSON.parse(localStorage.getItem(key));
      disk.meta.rev = (Number(disk.meta.rev) || 0) + 100;
      disk.meta.marker = 'external-write';
      localStorage.setItem(key, JSON.stringify(disk));
      store.flushNow();
      return JSON.parse(localStorage.getItem(key)).meta.marker;
    });
    expect(marker).toBe('external-write');

    await second.close();
    await page.waitForTimeout(300);
    const persisted = await page.evaluate((title) => {
      const disk = JSON.parse(localStorage.getItem('serein.state.v1'));
      return disk.shortcuts.some((item) => item.title === title);
    }, TITLE);
    expect(persisted).toBe(true);
  });

  test('本页有用户改动时，本地编辑胜出', async ({ page, context }) => {
    await gotoNewTab(page);
    const second = await context.newPage();
    await mockWeather(second);
    await gotoNewTab(second);

    await second.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.update((state) => {
        state.config.accent = '#22c55e';
      }, 'config');
    });
    // 另一页在这 180ms 防抖窗口内写入
    await page.evaluate(() => {
      const key = 'serein.state.v1';
      const disk = JSON.parse(localStorage.getItem(key));
      disk.meta.rev = (Number(disk.meta.rev) || 0) + 200;
      disk.meta.marker = 'parent';
      localStorage.setItem(key, JSON.stringify(disk));
    });
    await page.waitForTimeout(500);

    const disk = await second.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.flushNow();
      return JSON.parse(localStorage.getItem('serein.state.v1'));
    });
    expect(disk.config.accent).toBe('#22c55e');
    expect(disk.meta.marker).toBeUndefined();
  });
});

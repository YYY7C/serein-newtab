import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather } from './helpers.mjs';

const enableWidgets = (page, keys) =>
  page.evaluate(async (list) => {
    const store = await import('/assets/js/store.js');
    for (const key of list) store.state.config.widgets[key] = true;
    store.commit('config');
    store.flushNow();
  }, keys);

test.describe('专注 / 世界时钟 / 倒计时', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('专注计时可以开始并在结束时切到休息', async ({ page }) => {
    await gotoNewTab(page);
    await enableWidgets(page, ['pomodoro']);
    const card = page.locator('.card.is-pomodoro');
    await expect(card).toBeVisible();
    await expect(card.locator('.pomo-time')).toHaveText('25:00');

    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.state.pomodoro.remaining = 2;
      store.commit('pomodoro');
    });
    await expect(card.locator('.pomo-time')).toHaveText('00:02');
    await card.locator('.pomo-toggle').click();
    await expect(card.locator('.pomo-phase')).toHaveText('休息', { timeout: 6000 });
    await expect(page.locator('.toast-text').last()).toContainText('休息 5 分钟');
    await expect(card.locator('.pomo-time')).toHaveText('05:00');
    const pomodoro = await page.evaluate(async () => (await import('/assets/js/store.js')).state.pomodoro);
    expect(pomodoro.running).toBe(false);
  });

  test('世界时钟默认三城并可增删', async ({ page }) => {
    await gotoNewTab(page);
    await enableWidgets(page, ['worldClock']);
    const card = page.locator('.card.is-worldclock');
    await expect(card.locator('.worldclock-row')).toHaveCount(3);
    await expect(card).toContainText('纽约');
    await expect(card).toContainText('伦敦');
    await expect(card).toContainText('东京');

    await card.getByRole('button', { name: '选择世界时钟城市' }).click();
    const dialog = page.getByRole('dialog', { name: '选择世界时钟城市' });
    await dialog.getByRole('checkbox', { name: '伦敦' }).uncheck();
    await dialog.getByRole('checkbox', { name: '首尔' }).check();
    await dialog.getByRole('button', { name: '保存' }).click();
    await expect(card.locator('.worldclock-row')).toHaveCount(3);
    await expect(card).toContainText('首尔');
    await expect(card).not.toContainText('伦敦');
  });

  test('老数据没有 worldClocks 时回落到默认三城', async ({ page }) => {
    await gotoNewTab(page);
    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      delete store.state.worldClocks;
      store.commit('all');
      store.flushNow();
    });
    await page.reload({ waitUntil: 'load' });
    const zones = await page.evaluate(async () => (await import('/assets/js/store.js')).state.worldClocks);
    expect(zones).toEqual(['America/New_York', 'Europe/London', 'Asia/Tokyo']);
  });

  test('倒计时可以创建、显示并清除', async ({ page }) => {
    await gotoNewTab(page);
    await enableWidgets(page, ['countdown']);
    const card = page.locator('.card.is-countdown');
    await expect(card).toContainText('还没有倒计时');

    await card.getByRole('button', { name: '设置一个' }).click();
    const dialog = page.getByRole('dialog', { name: '新建倒计时' });
    await dialog.getByLabel('倒计时名称').fill('项目截止');
    // 加 2 小时抵消 datetime-local 截断到分钟带来的借位，天数稳定落在 2
    const target = new Date(Date.now() + 2 * 86400000 + 2 * 3600000);
    const pad = (value) => String(value).padStart(2, '0');
    const value = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(
      target.getHours()
    )}:${pad(target.getMinutes())}`;
    await dialog.getByLabel('倒计时时间').fill(value);
    await dialog.getByRole('button', { name: '保存' }).click();

    await expect(card).toContainText('项目截止');
    await expect(card.locator('.countdown-grid')).toBeVisible();
    await expect(card.locator('.countdown-value').first()).toHaveText('02');
    const state = await page.evaluate(async () => (await import('/assets/js/store.js')).state.countdown);
    expect(state.title).toBe('项目截止');
    expect(state.target).toBeGreaterThan(Date.now());

    await card.getByRole('button', { name: '清除倒计时' }).click();
    await expect(card).toContainText('还没有倒计时');
  });
});

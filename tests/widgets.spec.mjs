import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather, trackPageErrors } from './helpers.mjs';

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
    await expect(page.locator('.toast-text', { hasText: '休息 5 分钟' })).toHaveCount(1);
    await expect(card.locator('.pomo-time')).toHaveText('05:00');
    const pomodoro = await page.evaluate(async () => (await import('/assets/js/store.js')).state.pomodoro);
    expect(pomodoro.running).toBe(false);
  });

  test('进度条用 transform 推进，不再每秒触发 width 重排', async ({ page }) => {
    await gotoNewTab(page);
    await enableWidgets(page, ['pomodoro']);
    const bar = page.locator('.card.is-pomodoro .pomo-bar i');
    await expect(bar).toHaveCSS('width', /px$/);
    expect(await bar.evaluate((node) => node.style.transform)).toContain('scaleX(0)');

    await page.locator('.card.is-pomodoro .pomo-toggle').click();
    await expect
      .poll(() => bar.evaluate((node) => node.style.transform), { timeout: 4000 })
      .toMatch(/scaleX\(0\.\d+\)/);
  });

  test('收起侧栏后停止秒级刷新，展开时立即补一帧', async ({ page }) => {
    await gotoNewTab(page);
    await enableWidgets(page, ['countdown']);
    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.state.countdown = { title: '刷新测试', target: Date.now() + 3600 * 1000 };
      store.commit('countdown');
    });
    const card = page.locator('.card.is-countdown');
    await expect(card).toContainText('刷新测试');

    const snapshot = () => card.evaluate((node) => node.textContent);
    const before = await snapshot();
    await page.locator('[data-action="sidebar"]').click();
    await expect(page.locator('#sidebar')).toHaveClass(/is-hidden/);
    await page.waitForTimeout(1800);
    expect(await snapshot()).toBe(before);

    await page.locator('[data-action="sidebar"]').click();
    await expect(page.locator('#sidebar')).not.toHaveClass(/is-hidden/);
    await expect.poll(snapshot, { timeout: 4000 }).not.toBe(before);
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

  test('专注计时状态会同步到其它标签页', async ({ page, context }) => {
    await gotoNewTab(page);
    await enableWidgets(page, ['pomodoro']);
    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.state.pomodoro = { phase: 'focus', remaining: 120, endsAt: Date.now() + 120000, running: true };
      store.commit('pomodoro');
      store.flushNow();
    });

    const second = await context.newPage();
    await second.goto('/newtab.html?no-onboard', { waitUntil: 'load' });
    const card = second.locator('.card.is-pomodoro');
    await expect(card).toHaveClass(/is-running/);
    await expect(card.locator('.pomo-time')).toHaveText(/01:5\d/);
    await second.close();
  });

  test('倒计时到期后显示「时间到了」且不再每秒重绘', async ({ page }) => {
    const errors = trackPageErrors(page);
    await gotoNewTab(page);
    await enableWidgets(page, ['countdown']);
    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.state.countdown = { title: '已结束', target: Date.now() - 2000 };
      store.commit('countdown');
    });
    const card = page.locator('.card.is-countdown');
    await expect(card).toContainText('时间到了');
    await expect(card.locator('.countdown-grid')).toHaveCount(0);
    expect(errors).toEqual([]);
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

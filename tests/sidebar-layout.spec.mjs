import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather } from './helpers.mjs';

async function enableTallSidebar(page) {
  await page.setViewportSize({ width: 1024, height: 640 });
  await gotoNewTab(page);
  await page.evaluate(async () => {
    const store = await import('/assets/js/store.js');
    Object.assign(store.state.config.widgets, {
      todo: true,
      notes: true,
      pomodoro: true,
      worldClock: true,
      countdown: true,
    });
    store.state.config.layout.showWeather = true;
    store.commit('config');
    store.flushNow();
  });
  const sidebar = page.locator('#sidebar');
  await expect.poll(() => sidebar.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  return sidebar;
}

test.describe('侧栏布局与滚动', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('滚动位置在小组件重建后保留', async ({ page }) => {
    const sidebar = await enableTallSidebar(page);
    await expect(page.locator('.sidebar-scroll-rail')).toHaveClass(/is-visible/);

    await sidebar.evaluate((node) => {
      node.scrollTop = 180;
    });
    await expect.poll(() => sidebar.evaluate((node) => node.scrollTop)).toBe(180);

    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.state.config.widgets.countdown = !store.state.config.widgets.countdown;
      store.commit('config');
    });
    await expect.poll(() => sidebar.evaluate((node) => node.scrollTop)).toBe(180);

    const topbarRight = await page.locator('#topbar-right').boundingBox();
    const card = await page.locator('#sidebar > .card').first().boundingBox();
    expect(Math.abs(topbarRight.x + topbarRight.width - (card.x + card.width))).toBeLessThan(1);
  });

  test('滚到底后撤掉渐隐，滚动指示条随侧栏一起隐藏', async ({ page }) => {
    const sidebar = await enableTallSidebar(page);
    await sidebar.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect(sidebar).toHaveClass(/is-scroll-end/);

    await sidebar.evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect(sidebar).not.toHaveClass(/is-scroll-end/);

    await page.locator('[data-action="sidebar"]').click();
    await expect(sidebar).toHaveClass(/is-hidden/);
    await expect(page.locator('.sidebar-scroll-rail')).not.toHaveClass(/is-visible/);
  });

  test('窄屏把侧栏排成横向卡片带', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoNewTab(page);
    const sidebar = page.locator('#sidebar');
    const layout = await sidebar.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        direction: style.flexDirection,
        overflowX: style.overflowX,
        rail: getComputedStyle(document.querySelector('.sidebar-scroll-rail')).display,
      };
    });
    expect(layout.direction).toBe('row');
    expect(layout.overflowX).toBe('auto');
    expect(layout.rail).toBe('none');
  });
});

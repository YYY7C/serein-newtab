import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gotoNewTab, mockWeather, setStyle, trackPageErrors } from './helpers.mjs';

const STYLES = ['glass', 'noir', 'paper', 'native', 'editorial', 'terminal'];

test.describe('六套视觉风格', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
    await page.setViewportSize({ width: 1366, height: 768 });
  });

  for (const style of STYLES) {
    test(`${style}：无横向溢出、无 critical 可访问性问题`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await gotoNewTab(page);
      await setStyle(page, style);

      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
        grid: document.querySelector('#grid').getBoundingClientRect().right <= window.innerWidth + 1,
      }));
      expect(overflow.horizontal).toBe(false);
      expect(overflow.grid).toBe(true);

      if (style === 'noir' || style === 'paper') {
        const veil = await page.evaluate(() => document.querySelector('#bg-veil').style.opacity);
        expect(veil).toBe('0.45');
      }
      if (style === 'glass' || style === 'native') {
        const veil = await page.evaluate(() => document.querySelector('#bg-veil').style.opacity);
        expect(veil).toBe('0');
      }

      const { violations } = await new AxeBuilder({ page }).analyze();
      const critical = violations.filter((item) => item.impact === 'critical');
      expect(critical, JSON.stringify(critical.map((v) => v.id))).toEqual([]);

      expect(errors).toEqual([]);
    });
  }
});

test.describe('密度自适应', () => {
  test('1366×768 自动使用紧凑密度且不再纵向裁切', async ({ page }) => {
    await mockWeather(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoNewTab(page);

    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    const fit = await page.evaluate(() => {
      const content = document.querySelector('#content');
      return {
        overflow: content.scrollHeight > content.clientHeight + 2,
        icon: getComputedStyle(document.documentElement).getPropertyValue('--icon-size'),
      };
    });
    expect(fit.overflow).toBe(false);
    expect(parseInt(fit.icon, 10)).toBeLessThan(72);
  });

  test('1920×1080 保持常规密度', async ({ page }) => {
    await mockWeather(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoNewTab(page);

    await expect(page.locator('html')).toHaveAttribute('data-density', 'cozy');
    const icon = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--icon-size')
    );
    expect(parseInt(icon, 10)).toBe(72);
  });

  test('1024×640 下设置面板不溢出、侧栏可滚动', async ({ page }) => {
    await mockWeather(page);
    await page.setViewportSize({ width: 1024, height: 640 });
    await gotoNewTab(page);
    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      Object.assign(store.state.config.widgets, { pomodoro: true, worldClock: true, countdown: true });
      store.state.countdown = { title: '布局测试', target: Date.now() + 86400000 };
      store.commit('config');
      store.commit('countdown');
      store.flushNow();
    });

    await page.locator('[data-action="settings"]').click();
    await expect(page.locator('.settings.is-open')).toHaveCount(1);
    await page.waitForTimeout(400);
    const box = await page.locator('.settings-panel').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1024.5);
    expect(box.y + box.height).toBeLessThanOrEqual(640.5);

    await page.keyboard.press('Escape');
    await expect(page.locator('.settings.is-open')).toHaveCount(0);
    const sidebar = await page.locator('#sidebar').evaluate((node) => ({
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      overflowY: getComputedStyle(node).overflowY,
    }));
    expect(sidebar.scrollHeight).toBeGreaterThan(sidebar.clientHeight);
    expect(sidebar.overflowY).toBe('auto');
  });
});

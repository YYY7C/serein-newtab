import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gotoNewTab, mockWeather, setStyle } from './helpers.mjs';

const TABS = ['外观', '壁纸', '布局', '快捷方式', '小组件', '搜索', '数据', '关于'];

const serious = async (page) => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((item) => item.impact === 'critical' || item.impact === 'serious')
    .map((item) => ({ id: item.id, nodes: item.nodes.slice(0, 2).map((node) => node.target.join(' ')) }));
};

test.describe('设置面板可访问性', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await gotoNewTab(page);
    await page.locator('[data-action="settings"]').click();
    await expect(page.locator('.settings.is-open')).toHaveCount(1);
  });

  for (const tab of TABS) {
    test(`${tab} 分区无 critical/serious 违规`, async ({ page }) => {
      await page.locator('.settings .nav-item', { hasText: tab }).click();
      await expect(page.locator('.settings-title')).toHaveText(tab);
      const issues = await serious(page);
      expect(issues, JSON.stringify(issues)).toEqual([]);
    });
  }

  test('新建搜索引擎弹窗无 critical/serious 违规', async ({ page }) => {
    await page.locator('.settings .nav-item', { hasText: '搜索' }).click();
    await page.getByRole('button', { name: '添加引擎' }).click();
    await expect(page.getByRole('dialog', { name: '添加搜索引擎' })).toBeVisible();
    const issues = await serious(page);
    expect(issues, JSON.stringify(issues)).toEqual([]);
  });

  // 首页文字叠在壁纸 + 面纱上，axe 不合成多层背景，会误报；这里只验证实色面板。
  for (const style of ['glass', 'paper', 'native', 'editorial', 'terminal']) {
    test(`${style} 风格下设置面板无 critical/serious 违规`, async ({ page }) => {
      await page.keyboard.press('Escape');
      await expect(page.locator('.settings.is-open')).toHaveCount(0);
      await setStyle(page, style);
      await page.locator('[data-action="settings"]').click();
      await expect(page.locator('.settings.is-open')).toHaveCount(1);
      for (const tab of ['外观', '搜索', '关于']) {
        await page.locator('.settings .nav-item', { hasText: tab }).click();
        await expect(page.locator('.settings-title')).toHaveText(tab);
        const issues = await serious(page);
        expect(issues, `${style}/${tab}: ${JSON.stringify(issues)}`).toEqual([]);
      }
    });
  }
});

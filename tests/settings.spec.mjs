import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather, trackPageErrors } from './helpers.mjs';

const SECTIONS = [
  ['外观', '外观'],
  ['壁纸', '壁纸'],
  ['布局', '布局'],
  ['快捷方式', '快捷方式'],
  ['小组件', '小组件'],
  ['搜索', '搜索'],
  ['数据', '数据'],
  ['关于', '关于'],
];

test.describe('设置面板', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('8 个分区都能打开且无运行错误', async ({ page }) => {
    const errors = trackPageErrors(page);
    await gotoNewTab(page);
    await page.locator('button[data-action="settings"]').click();
    await expect(page.locator('.settings.is-open')).toHaveCount(1);
    await expect(page.locator('.settings .nav-item')).toHaveCount(8);

    for (const [nav, heading] of SECTIONS) {
      await page.locator('.settings .nav-item', { hasText: nav }).click();
      await expect(page.locator('.settings-title')).toHaveText(heading);
      await expect(page.locator('.settings-body')).not.toBeEmpty();
    }

    expect(errors).toEqual([]);
  });

  test('数据页说明包含 zip 备份与旧 JSON 兼容', async ({ page }) => {
    await gotoNewTab(page);
    await page.locator('button[data-action="settings"]').click();
    await page.locator('.settings .nav-item', { hasText: '数据' }).click();

    const rows = page.locator('.settings .row');
    const exportRow = rows.filter({ hasText: '导出配置' });
    const importRow = rows.filter({ hasText: '导入配置' });
    await expect(exportRow).toContainText('zip 备份');
    await expect(importRow).toContainText('旧版 JSON');
    await expect(importRow.locator('input[type="file"]')).toHaveAttribute(
      'accept',
      /application\/zip.*application\/json/
    );
  });
});

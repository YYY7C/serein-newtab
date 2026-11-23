import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather } from './helpers.mjs';

test.describe('文件夹与弹窗栈', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('打开文件夹、重命名、Esc 只关最上层', async ({ page }) => {
    await gotoNewTab(page);

    await page.locator('.tile[data-kind="group"]').click();
    const folder = page.locator('.modal.is-open');
    await expect(folder).toHaveCount(1);
    await expect(folder.locator('.modal-title')).toHaveText('工具');
    await expect(folder.locator('.tile')).toHaveCount(5);

    await folder.getByRole('button', { name: '重命名' }).click();
    await expect(page.locator('.modal.is-open')).toHaveCount(2);
    const rename = page.locator('.modal.is-open').last();
    await expect(rename.locator('.modal-card')).toHaveAttribute('aria-label', '重命名文件夹');
    await expect(rename.locator('input.text-input')).toBeFocused();
    await expect(rename.locator('input.text-input')).toHaveValue('工具');

    await page.keyboard.press('Escape');
    await expect(page.locator('.modal.is-open')).toHaveCount(1);
    await expect(page.locator('.modal.is-open .modal-title')).toHaveText('工具');

    await page.keyboard.press('Escape');
    await expect(page.locator('.modal.is-open')).toHaveCount(0);
  });

  test('底栏空白处点击不产生文本光标', async ({ page }) => {
    await gotoNewTab(page);
    await page.locator('.tile[data-kind="group"]').click();
    const foot = page.locator('.modal.is-open .modal-foot');
    const box = await foot.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    const selection = await page.evaluate(() => {
      const sel = getSelection();
      return { type: sel?.type || 'None', text: sel?.toString() || '' };
    });
    expect(selection.type).toBe('None');
    expect(selection.text).toBe('');
  });
});

import { test, expect } from '@playwright/test';
import { gotoNewTab, mockBaiduSuggest, mockWeather, trackPageErrors } from './helpers.mjs';

test.describe('搜索与联想', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
    await mockBaiduSuggest(page);
  });

  test('联想面板紧贴搜索框、键盘可选择与关闭', async ({ page }) => {
    const errors = trackPageErrors(page);
    await gotoNewTab(page);

    await page.fill('#search-input', '111');
    const items = page.locator('.suggest-item');
    await expect(items).toHaveCount(9);
    await expect(items.first()).toContainText('111135cm');

    const gap = await page.evaluate(() => {
      const form = document.querySelector('#search-form').getBoundingClientRect();
      const panel = document.querySelector('#suggest').getBoundingClientRect();
      return Number((panel.top - form.bottom).toFixed(1));
    });
    expect(gap).toBeLessThan(10);
    expect(gap).toBeGreaterThan(4);

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.suggest-item.is-active')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('#suggest')).not.toHaveClass(/is-open/);
    await expect(page.locator('#search-input')).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#suggest')).toHaveClass(/is-open/);

    expect(errors).toEqual([]);
  });

  test('输入法组合期不请求、不重绘', async ({ page }) => {
    await gotoNewTab(page);
    let requests = 0;
    await page.route('https://suggestion.baidu.com/**', (route) => {
      requests += 1;
      return route.abort();
    });

    await page.evaluate(() => {
      const input = document.querySelector('#search-input');
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      input.value = 'nihao';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    });
    await page.waitForTimeout(400);
    expect(requests).toBe(0);
    await expect(page.locator('#suggest')).not.toHaveClass(/is-open/);
  });
});

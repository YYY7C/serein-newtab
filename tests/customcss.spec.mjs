import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather } from './helpers.mjs';

async function openAppearance(page) {
  await page.locator('button[data-action="settings"]').click();
  await expect(page.locator('.settings.is-open')).toHaveCount(1);
}

test.describe('自定义 CSS', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('即时生效、清洗 @import 并持久化', async ({ page }) => {
    await gotoNewTab(page);
    await openAppearance(page);

    const area = page.getByLabel('自定义 CSS');
    const cssText = () => page.locator('#custom-css').evaluate((node) => node.textContent);
    await area.fill('.clock-time { color: rgb(1, 2, 3) !important; }');
    expect(await cssText()).toContain('rgb(1, 2, 3)');
    await expect(page.locator('#clock-time')).toHaveCSS('color', 'rgb(1, 2, 3)');

    await area.fill(
      '@import url("https://evil.example.com/x.css");\n' +
        '.clock-time { color: rgb(4, 5, 6) !important; }\n' +
        '.x { width: expression(alert(1)); }'
    );
    const css = await cssText();
    expect(css).not.toContain('@import');
    expect(css).not.toContain('expression(');
    await expect(page.locator('#clock-time')).toHaveCSS('color', 'rgb(4, 5, 6)');
    await expect(page.locator('.custom-css-count')).toContainText('/ 20000');

    await page.waitForTimeout(350);
    await page.reload({ waitUntil: 'load' });
    await expect.poll(cssText).toContain('rgb(4, 5, 6)');
    await expect(page.locator('#clock-time')).toHaveCSS('color', 'rgb(4, 5, 6)');

    await openAppearance(page);
    await expect(page.getByLabel('自定义 CSS')).toHaveValue(/rgb\(4, 5, 6\)/);
    await page.getByRole('button', { name: '清空', exact: true }).click();
    await expect(page.locator('#custom-css')).toHaveCount(0);
    await expect(page.getByLabel('自定义 CSS')).toHaveValue('');

    const value = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return store.state.config.customCss;
    });
    expect(value).toBe('');
  });
});

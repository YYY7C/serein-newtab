import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather } from './helpers.mjs';

async function openAppearance(page) {
  await page.locator('button[data-action="settings"]').click();
  await page.locator('.settings .nav-item', { hasText: '外观' }).click();
  await expect(page.locator('.settings-title')).toHaveText('外观');
}

test.describe('自定义字体与主题', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('字体上传、持久化与恢复系统字体', async ({ page }) => {
    await page.addInitScript(() => {
      window.FontFace = class {
        constructor(family, source, descriptors) {
          this.family = family;
          this.source = source;
          this.descriptors = descriptors;
        }
        async load() {
          return this;
        }
      };
      window.__addedFonts = [];
      document.fonts.add = (face) => {
        window.__addedFonts.push(face.family);
        return face;
      };
      document.fonts.delete = () => true;
    });
    await gotoNewTab(page);
    await openAppearance(page);

    const input = page.locator('.settings input[type="file"][accept*="woff2"]');
    await input.setInputFiles({
      name: 'custom.woff2',
      mimeType: 'font/woff2',
      buffer: Buffer.from('fake-font-data'),
    });
    await expect(page.locator('.toast-text', { hasText: '已应用自定义字体' })).toHaveCount(1);
    const font = await page.evaluate(async () => (await import('/assets/js/store.js')).state.config.customFont);
    expect(font.name).toBe('custom.woff2');
    expect(font.id).toBeTruthy();
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim()
      )
    ).toContain('Serein Custom Font');

    await page.reload({ waitUntil: 'load' });
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim()
        )
      )
      .toContain('Serein Custom Font');

    await openAppearance(page);
    await page.getByRole('button', { name: '恢复系统字体' }).click();
    await expect
      .poll(() =>
        page.evaluate(async () => (await import('/assets/js/store.js')).state.config.customFont.id)
      )
      .toBe('');
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim()
      )
    ).not.toContain('Serein Custom Font');
  });

  test('导出主题后再导入可恢复外观', async ({ page }, testInfo) => {
    await gotoNewTab(page);
    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.state.config.style = 'paper';
      store.state.config.accent = '#123456';
      store.state.config.radius = 8;
      store.state.config.customCss = '.clock-time { color: rgb(7, 8, 9) !important; }';
      store.commit('config');
      store.flushNow();
    });
    await openAppearance(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出主题' }).click();
    const download = await downloadPromise;
    const path = testInfo.outputPath('theme.json');
    await download.saveAs(path);

    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.state.config.style = 'noir';
      store.state.config.accent = '#7c8cff';
      store.state.config.radius = 30;
      store.state.config.customCss = '';
      store.commit('config');
      store.flushNow();
    });
    await expect(page.locator('html')).toHaveAttribute('data-style', 'noir');

    await page.locator('.settings input[type="file"][accept*="json"]').setInputFiles(path);
    // 首屏的「右键图标…」提示条可能在之后才出现，别用 last() 断言
    await expect(page.locator('.toast-text', { hasText: '主题已应用' })).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('data-style', 'paper');
    await expect(page.locator('#clock-time')).toHaveCSS('color', 'rgb(7, 8, 9)');
    const config = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return {
        accent: store.state.config.accent,
        radius: store.state.config.radius,
        customCss: store.state.config.customCss,
      };
    });
    expect(config.accent).toBe('#123456');
    expect(config.radius).toBe(8);
    expect(config.customCss).toContain('rgb(7, 8, 9)');
  });

  test('无关 JSON 不会被当成主题接受', async ({ page }, testInfo) => {
    await gotoNewTab(page);
    await openAppearance(page);
    const before = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return { accent: store.state.config.accent, style: store.state.config.style };
    });

    const path = testInfo.outputPath('not-a-theme.json');
    writeFileSync(path, JSON.stringify({ hello: 'world', shortcuts: [] }), 'utf8');
    await page.locator('.settings input[type="file"][accept*="json"]').setInputFiles(path);
    await expect(page.locator('.toast-text', { hasText: '没有可识别的外观设置' })).toHaveCount(1);

    const after = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return { accent: store.state.config.accent, style: store.state.config.style };
    });
    expect(after).toEqual(before);
  });

  test('损坏的字体文件会被拒绝，不写入配置与存储', async ({ page }) => {
    await gotoNewTab(page);
    await openAppearance(page);

    await page.locator('.settings input[type="file"][accept*="woff2"]').setInputFiles({
      name: 'broken.woff2',
      mimeType: 'font/woff2',
      buffer: Buffer.from('this is not a real font'),
    });
    await expect(page.locator('.toast-text', { hasText: '无法解析' })).toHaveCount(1);

    const state = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      const { files } = await import('/assets/js/storage.js');
      const keys = await files.keys();
      return { font: store.state.config.customFont, fontKeys: keys.filter((key) => key.startsWith('font:')) };
    });
    expect(state.font).toEqual({ id: '', name: '' });
    expect(state.fontKeys).toEqual([]);
    await expect(page.getByRole('button', { name: '选择字体' })).toHaveCount(1);
  });
});

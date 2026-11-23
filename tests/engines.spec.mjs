import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather, trackPageErrors } from './helpers.mjs';

async function openSearchSettings(page) {
  await page.locator('button[data-action="settings"]').click();
  await page.locator('.settings .nav-item', { hasText: '搜索' }).click();
}

test.describe('自定义搜索引擎', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('添加、选用并持久化自定义引擎', async ({ page }) => {
    const errors = trackPageErrors(page);
    await gotoNewTab(page);
    await openSearchSettings(page);

    await page.getByRole('button', { name: '添加引擎' }).click();
    const dialog = page.getByRole('dialog', { name: '添加搜索引擎' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('引擎名称').fill('示例搜索');
    await dialog.getByLabel('搜索地址模板').fill('https://search.example.com/find?q=%s');
    await dialog.getByRole('button', { name: '添加' }).click();

    const engineButton = page.locator('[data-engine-id^="custom-"]', { hasText: '示例搜索' });
    await expect(engineButton).toHaveCount(1);
    await engineButton.click();
    await expect(engineButton).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(page.locator('.settings.is-open')).toHaveCount(0);
    await expect(page.locator('#engine-btn')).toContainText('示例搜索');

    await page.route('https://search.example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>ok' })
    );
    await page.locator('#search-input').fill('serein');
    await page.locator('#search-input').press('Enter');
    await page.waitForURL('https://search.example.com/find?q=serein');

    expect(errors).toEqual([]);
  });

  test('拒绝缺少占位符或非 http(s) 的地址', async ({ page }) => {
    await gotoNewTab(page);
    await openSearchSettings(page);
    await page.getByRole('button', { name: '添加引擎' }).click();

    const dialog = page.getByRole('dialog', { name: '添加搜索引擎' });
    await dialog.getByLabel('引擎名称').fill('坏引擎');
    await dialog.getByLabel('搜索地址模板').fill('https://example.com/search');
    await dialog.getByRole('button', { name: '添加' }).click();
    await expect(dialog.getByRole('alert')).toContainText('%s');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('搜索地址模板').fill('javascript:alert(%s)');
    await dialog.getByRole('button', { name: '添加' }).click();
    await expect(dialog.getByRole('alert')).toContainText('http(s)');
    await expect(page.locator('[data-engine-id^="custom-"]')).toHaveCount(0);

    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(page.locator('.settings .row', { hasText: '还没有自定义引擎' })).toHaveCount(1);
  });

  test('重复的搜索地址会被拒绝', async ({ page }) => {
    await gotoNewTab(page);
    await openSearchSettings(page);
    const add = async (name) => {
      await page.getByRole('button', { name: '添加引擎' }).click();
      const dialog = page.getByRole('dialog', { name: '添加搜索引擎' });
      await dialog.getByLabel('引擎名称').fill(name);
      await dialog.getByLabel('搜索地址模板').fill('https://dup.example.com/?q=%s');
      await dialog.getByRole('button', { name: '添加' }).click();
    };

    await add('第一个');
    await expect(page.locator('[data-engine-id^="custom-"]')).toHaveCount(1);

    await add('重复的');
    await expect(page.locator('.toast-text', { hasText: '已经添加过了' })).toHaveCount(1);
    await expect(page.locator('[data-engine-id^="custom-"]')).toHaveCount(1);
  });

  test('达到 12 个自定义引擎后禁用添加入口', async ({ page }) => {
    await gotoNewTab(page);
    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.state.config.search.engines = Array.from({ length: 12 }, (_, i) => ({
        id: `custom-limit-${i}`,
        name: `引擎 ${i + 1}`,
        url: `https://limit${i}.example.com/?q=%s`,
        color: '#6c8cff',
        letter: '引',
        custom: true,
        suggest: null,
      }));
      store.commit('config');
      store.flushNow();
    });
    await openSearchSettings(page);

    const addRow = page.locator('.settings .row', { hasText: '添加搜索引擎' });
    await expect(addRow).toContainText('12 / 12');
    await expect(addRow.getByRole('button', { name: '添加引擎' })).toBeDisabled();
    await expect(page.locator('[data-engine-id^="custom-"]')).toHaveCount(12);
  });

  test('导入数据里的非法自定义引擎会被清洗', async ({ page }) => {
    await gotoNewTab(page);
    await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      store.state.config.search.engines = [
        { id: 'custom-ok', name: '正常引擎', url: 'https://ok.example.com/?q=%s' },
        { id: 'custom-x', name: '缺少占位符', url: 'https://bad.example.com/search' },
        { id: 'baidu', name: '冒充内置', url: 'https://evil.example.com/?q=%s' },
      ];
      store.state.config.search.engine = 'custom-missing';
      store.commit('config');
    });
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('#grid .tile').first()).toBeVisible();

    const state = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return {
        engines: store.state.config.search.engines,
        engine: store.state.config.search.engine,
      };
    });
    expect(state.engines).toHaveLength(2);
    expect(state.engines.map((engine) => engine.name)).toEqual(['正常引擎', '冒充内置']);
    expect(state.engines[1].id).not.toBe('baidu');
    expect(state.engine).toBe('baidu');
  });
});

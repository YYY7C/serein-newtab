import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gotoNewTab, mockWeather } from './helpers.mjs';

const mockGeocoding = (page) =>
  page.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ results: [] }),
    })
  );

async function openPicker(page) {
  await page.locator('.weather-city').click();
  return page.getByRole('dialog', { name: '选择城市' });
}

test.describe('城市选择器', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
    await mockGeocoding(page);
    await gotoNewTab(page);
  });

  test('中文城市名直接命中本地城市库', async ({ page }) => {
    const dialog = await openPicker(page);
    const input = dialog.getByRole('combobox', { name: '搜索城市' });
    await input.fill('厦门');

    const option = dialog.getByRole('option', { name: /厦门/ });
    await expect(option).toBeVisible();
    await expect(option).toContainText('福建省');
    await expect(option).toHaveAttribute('aria-selected', 'true');

    await option.click();
    await expect(page.locator('.weather-city')).toContainText('厦门');
    await expect(page.locator('.modal.is-open')).toHaveCount(0);
  });

  test('拼音、英文和繁体中文都能匹配', async ({ page }) => {
    const dialog = await openPicker(page);
    const input = dialog.getByRole('combobox', { name: '搜索城市' });
    const option = dialog.getByRole('option', { name: /厦门/ });

    await input.fill('xiamen');
    await expect(option).toBeVisible();

    await input.fill('XIAMEN');
    await expect(option).toBeVisible();

    await input.fill('廈門');
    await expect(option).toBeVisible();
  });

  test('键盘回车选择第一个结果', async ({ page }) => {
    const dialog = await openPicker(page);
    const input = dialog.getByRole('combobox', { name: '搜索城市' });
    await input.fill('厦门');
    await expect(dialog.getByRole('option', { name: /厦门/ })).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.locator('.weather-city')).toContainText('厦门');
    await expect(page.locator('.modal.is-open')).toHaveCount(0);
  });

  test('无结果时给出提示并保留常用城市，清空后恢复热榜', async ({ page }) => {
    const dialog = await openPicker(page);
    const input = dialog.getByRole('combobox', { name: '搜索城市' });
    await input.fill('不存在的城市');

    await expect(dialog.locator('.city-empty-title')).toContainText('没有找到');
    await expect(dialog.getByRole('button', { name: '北京' })).toBeVisible();

    await dialog.getByRole('button', { name: '清空搜索' }).click();
    await expect(input).toHaveValue('');
    await expect(dialog.locator('.city-results')).toBeHidden();
    await expect(dialog.getByRole('button', { name: '上海' })).toBeVisible();
  });

  test('城市弹窗无 critical/serious 可访问性问题', async ({ page }) => {
    const dialog = await openPicker(page);
    await dialog.getByRole('combobox', { name: '搜索城市' }).fill('厦门');
    await expect(dialog.getByRole('option', { name: /厦门/ })).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).analyze();
    const issues = violations
      .filter((item) => item.impact === 'critical' || item.impact === 'serious')
      .map((item) => ({ id: item.id, nodes: item.nodes.slice(0, 2).map((node) => node.target.join(' ')) }));
    expect(issues, JSON.stringify(issues)).toEqual([]);
  });
});

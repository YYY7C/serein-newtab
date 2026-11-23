import { test, expect } from '@playwright/test';
import { gotoNewTab, mockBaiduSuggest, mockWeather, trackPageErrors } from './helpers.mjs';

test.describe('命令面板', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
    await mockBaiduSuggest(page);
  });

  test('todo / note / copy 带参数命令回车即执行', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:8123',
    });
    const errors = trackPageErrors(page);
    await gotoNewTab(page);
    const input = page.locator('#search-input');

    await input.fill('todo 买牛奶');
    await expect(page.locator('#suggest .suggest-item').first()).toContainText('添加待办「买牛奶」');
    await input.press('Enter');
    await expect(page.locator('.toast-text').last()).toContainText('已添加待办');

    await input.fill('note 第二条便签');
    await input.press('Enter');
    await expect(page.locator('.toast-text').last()).toContainText('已追加到便签');

    await input.fill('copy 复制一段测试文本');
    await input.press('Enter');
    await expect(page.locator('.toast-text').last()).toContainText('已复制');

    const state = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      return { todo: store.state.todos.at(-1)?.text, notes: store.state.notes };
    });
    expect(state.todo).toBe('买牛奶');
    expect(state.notes).toContain('第二条便签');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('复制一段测试文本');
    expect(errors).toEqual([]);
  });

  test('本地预览下标签页 / 书签 / 历史搜索给出明确状态', async ({ page }) => {
    await gotoNewTab(page);
    const input = page.locator('#search-input');

    await input.fill('tab 文档');
    await expect(page.locator('#suggest .suggest-status-text')).toContainText('只在安装扩展后可用');

    await input.fill('bookmark 收藏');
    await expect(page.locator('#suggest .suggest-status-text')).toContainText('只在安装扩展后可用');

    await input.fill('history 昨天');
    await expect(page.locator('#suggest .suggest-status-text')).toContainText('只在安装扩展后可用');

    await page.click('button[data-action="settings"]');
    await page.locator('.settings .nav-item', { hasText: '搜索' }).click();
    const tabRow = page.locator('.settings .row', { hasText: '搜索打开的标签页' });
    await expect(tabRow).toContainText('安装扩展后可用');
    await expect(tabRow.getByRole('button', { name: /授权/ })).toHaveCount(0);
  });

  test('授权后可用 tab 关键词跳到已打开的标签页', async ({ page }) => {
    await page.addInitScript(() => {
      const granted = new Set(['tabs']);
      window.chrome = window.chrome || {};
      window.chrome.permissions = {
        contains: ({ permissions }) => Promise.resolve(permissions.every((name) => granted.has(name))),
        request: ({ permissions }) => {
          permissions.forEach((name) => granted.add(name));
          return Promise.resolve(true);
        },
        remove: ({ permissions }) => {
          permissions.forEach((name) => granted.delete(name));
          return Promise.resolve(true);
        },
      };
      window.chrome.tabs = {
        query: () =>
          Promise.resolve([
            { title: 'Serein 使用文档', url: 'https://example.com/docs' },
            { title: '无关的页面', url: 'https://example.com/other' },
            { title: '扩展内部页', url: 'chrome://extensions' },
          ]),
      };
    });
    await page.route('https://example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>doc</title>ok' })
    );
    await gotoNewTab(page);

    await page.locator('button[data-action="settings"]').click();
    await page.locator('.settings .nav-item', { hasText: '搜索' }).click();
    const tabRow = page.locator('.settings .row', { hasText: '搜索打开的标签页' });
    await expect(tabRow).toContainText('已授权');
    await expect(tabRow.getByRole('button', { name: /撤销/ })).toHaveCount(1);
    await page.keyboard.press('Escape');

    await page.locator('#search-input').fill('tab 文档');
    const result = page.locator('#suggest .suggest-item', { hasText: 'Serein 使用文档' });
    await expect(result).toHaveCount(1);
    await result.click();
    await page.waitForURL('https://example.com/docs');
  });

  test('命令发现：输入「标签页」出现授权入口并提示', async ({ page }) => {
    await gotoNewTab(page);
    await page.locator('#search-input').fill('标签页');
    const command = page.locator('#suggest .suggest-item', { hasText: '搜索打开的标签页' });
    await expect(command).toHaveCount(1);
    await command.click();
    await expect(page.locator('.toast-text').last()).toContainText('只在安装扩展后可用');
  });
});

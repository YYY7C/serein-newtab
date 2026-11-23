import { test, expect } from '@playwright/test';
import { gotoNewTab, mockWeather } from './helpers.mjs';

test.describe('zip 备份', () => {
  test.beforeEach(async ({ page }) => {
    await mockWeather(page);
  });

  test('图片与状态可完整导出并恢复', async ({ page }) => {
    await gotoNewTab(page);

    const result = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      const data = await import('/assets/js/data.js');
      const { files } = await import('/assets/js/storage.js');
      const { readZip } = await import('/assets/js/zip.js');

      const original = JSON.parse(localStorage.getItem('serein.state.v1'));
      const iconBytes = new Uint8Array(200).map((_, i) => (i * 7) & 255);
      const wallBytes = new Uint8Array(600).map((_, i) => (i * 13 + 3) & 255);
      const fontBytes = new Uint8Array(300).map((_, i) => (i * 5 + 1) & 255);
      await files.put('icon:test-icon', new Blob([iconBytes], { type: 'image/png' }));
      await files.put('wallpaper:test-wall', new Blob([wallBytes], { type: 'image/jpeg' }));
      await files.put('font:test-font', new Blob([fontBytes], { type: 'font/woff2' }));
      await files.put('misc:skip', new Blob([new Uint8Array([1])]));

      store.update((state) => {
        state.notes = 'round-trip';
        state.config.accent = '#0ea5e9';
      }, 'all');
      store.addShortcut({
        title: '__pw_backup__',
        url: 'https://example.com/backup',
        iconType: 'auto',
        iconValue: '',
      });
      store.flushNow();

      const backup = await data.buildBackup();
      const entries = await readZip(backup.blob);
      const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));

      // 破坏现场
      await files.remove('icon:test-icon');
      await files.remove('wallpaper:test-wall');
      await files.remove('font:test-font');
      store.update((state) => {
        state.notes = 'broken';
        state.config.accent = '#000000';
      }, 'all');
      store.flushNow();

      const imported = await data.importState(
        new File([backup.blob], 'backup.zip', { type: 'application/zip' })
      );
      const icon = await files.get('icon:test-icon');
      const wall = await files.get('wallpaper:test-wall');
      const font = await files.get('font:test-font');
      const iconData = icon ? new Uint8Array(await icon.arrayBuffer()) : null;
      const wallData = wall ? new Uint8Array(await wall.arrayBuffer()) : null;
      const fontData = font ? new Uint8Array(await font.arrayBuffer()) : null;

      let corruptError = '';
      const beforeCorrupt = store.state.notes;
      const broken = new Uint8Array(await backup.blob.arrayBuffer());
      broken[broken.length - 200] ^= 0xff;
      try {
        await data.importState(new File([broken], 'broken.zip', { type: 'application/zip' }));
      } catch (error) {
        corruptError = String(error.message || error);
      }

      // 清理测试数据，恢复原始状态
      store.replaceState(original);
      await files.remove('icon:test-icon');
      await files.remove('wallpaper:test-wall');
      await files.remove('font:test-font');
      await files.remove('misc:skip');
      store.flushNow();

      return {
        entryNames: [...entries.keys()],
        format: manifest._format,
        assetKeys: manifest.assets.map((item) => item.key),
        skippedMisc: manifest.assets.some((item) => item.key === 'misc:skip'),
        imported,
        restoredNotes: manifest.state.notes,
        iconSame:
          !!iconData && iconData.length === iconBytes.length && iconData.every((v, i) => v === iconBytes[i]),
        wallSame:
          !!wallData && wallData.length === wallBytes.length && wallData.every((v, i) => v === wallBytes[i]),
        fontSame:
          !!fontData && fontData.length === fontBytes.length && fontData.every((v, i) => v === fontBytes[i]),
        iconType: icon?.type,
        wallType: wall?.type,
        fontType: font?.type,
        corruptError,
        corruptUntouched: beforeCorrupt === 'round-trip',
      };
    });

    expect(result.entryNames).toContain('manifest.json');
    expect(result.format).toBe('serein-backup');
    expect(result.assetKeys.sort()).toEqual(['font:test-font', 'icon:test-icon', 'wallpaper:test-wall']);
    expect(result.skippedMisc).toBe(false);
    expect(result.imported).toMatchObject({ count: 16, assets: 3, format: 'zip' });
    expect(result.iconSame).toBe(true);
    expect(result.wallSame).toBe(true);
    expect(result.fontSame).toBe(true);
    expect(result.iconType).toBe('image/png');
    expect(result.wallType).toBe('image/jpeg');
    expect(result.fontType).toBe('font/woff2');
    expect(result.corruptError.length).toBeGreaterThan(0);
    expect(result.corruptUntouched).toBe(true);
  });

  test('旧版 JSON 备份仍可导入', async ({ page }) => {
    await gotoNewTab(page);
    const count = await page.evaluate(async () => {
      const store = await import('/assets/js/store.js');
      const data = await import('/assets/js/data.js');
      // 首次启动的种子状态可能还没落盘，直接取内存快照
      const state = JSON.parse(JSON.stringify(store.state));
      const file = new File([JSON.stringify({ _format: 'serein-export', state })], 'old.json', {
        type: 'application/json',
      });
      const result = await data.importState(file);
      return result;
    });
    expect(count).toMatchObject({ count: 15, assets: 0, format: 'json' });
  });
});

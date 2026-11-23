/* Serein · 数据导入 / 导出 / 重置 */

import * as store from './store.js';
import { files, assetUsage, clearLocal, clearChromeMirror, requestPersistentStorage } from './storage.js';
import { APP, STYLES } from './defaults.js';
import { clamp, isUsableUrl } from './util.js';
import { createZip, readZip } from './zip.js';

const ASSET_KEY = /^(?:font|icon|wallpaper):[\w-]{1,80}$/;

/* --------------------------------------------------------------- 导出 */

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 大文件可能还在写盘：撤销 URL 留出足够时间
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * 组装完整备份（不触发下载）：WebDAV 同步与自动化测试都复用这一份。
 * 图片按原样存储（本身已压缩），manifest 走 deflate。
 */
export async function buildBackup() {
  const payload = {
    _format: 'serein-backup',
    _version: APP.version,
    _exportedAt: new Date().toISOString(),
    state: store.state,
    assets: [],
  };
  const entries = [];
  let index = 0;

  const keys = await files.keys();
  for (const key of keys) {
    if (!ASSET_KEY.test(key)) continue;
    const value = await files.get(key);
    if (!(value instanceof Blob)) continue;
    const name = `assets/${index}`;
    index += 1;
    entries.push({ name, data: new Uint8Array(await value.arrayBuffer()), store: true });
    payload.assets.push({ key, name, type: value.type || 'application/octet-stream' });
  }

  entries.unshift({
    name: 'manifest.json',
    data: new TextEncoder().encode(JSON.stringify(payload)),
  });

  const blob = await createZip(entries);
  return { blob, payload, assetCount: payload.assets.length };
}

/** 导出完整备份：manifest.json + IndexedDB 里的壁纸/自定义图标 */
export async function exportState() {
  const { blob, assetCount } = await buildBackup();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadBlob(`serein-backup-${stamp}.zip`, blob);
  return { assetCount, bytes: blob.size };
}

/* --------------------------------------------------------------- 主题 */

const ACCENT_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** 只导出外观，不包含快捷方式、壁纸文件和数据；适合分享配色/排版 */
export function buildTheme() {
  const config = store.state.config;
  const bg = config.background;
  return {
    _format: 'serein-theme',
    _version: APP.version,
    _exportedAt: new Date().toISOString(),
    theme: {
      style: config.style,
      accent: config.accent,
      glass: config.glass,
      radius: config.radius,
      fontScale: config.fontScale,
      animations: config.animations,
      performance: config.performance,
      customCss: config.customCss,
      background: {
        tone: bg.tone,
        blur: bg.blur,
        brightness: bg.brightness,
        saturate: bg.saturate,
        vignette: bg.vignette,
        veilByStyle: { ...bg.veilByStyle },
      },
    },
  };
}

export function exportTheme() {
  const payload = buildTheme();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`serein-theme-${stamp}.json`, blob);
  return { bytes: blob.size };
}

function sanitizeTheme(input) {
  if (!input || typeof input !== 'object') throw new Error('主题文件结构无法识别');
  if (input._format && input._format !== 'serein-theme') throw new Error('不是 Serein 主题文件');
  const theme = input.theme && typeof input.theme === 'object' ? input.theme : input;
  const bg = theme.background && typeof theme.background === 'object' ? theme.background : {};
  const number = (value, min, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : null;
  };
  const veil = {};
  if (bg.veilByStyle && typeof bg.veilByStyle === 'object') {
    for (const style of STYLES) {
      const value = Number(bg.veilByStyle[style.id]);
      if (Number.isFinite(value)) veil[style.id] = Math.round(clamp(value, 0, 100));
    }
  }
  return {
    style: STYLES.some((style) => style.id === theme.style) ? theme.style : null,
    accent: typeof theme.accent === 'string' && ACCENT_RE.test(theme.accent) ? theme.accent : null,
    glass: number(theme.glass, 0, 40),
    radius: number(theme.radius, 0, 36),
    fontScale: number(theme.fontScale, 0.8, 1.4),
    animations: typeof theme.animations === 'boolean' ? theme.animations : null,
    performance: typeof theme.performance === 'boolean' ? theme.performance : null,
    customCss: typeof theme.customCss === 'string' ? theme.customCss.slice(0, 20000) : null,
    background: {
      tone: ['auto', 'dark', 'light'].includes(bg.tone) ? bg.tone : null,
      blur: number(bg.blur, 0, 30),
      brightness: number(bg.brightness, 30, 150),
      saturate: number(bg.saturate, 0, 200),
      vignette: typeof bg.vignette === 'boolean' ? bg.vignette : null,
      veilByStyle: veil,
    },
  };
}

export async function importTheme(file) {
  if (!file || file.size > 1024 * 1024) throw new Error('主题文件超过 1 MB');
  let parsed;
  try {
    parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('主题文件不是合法的 JSON');
  }
  const theme = sanitizeTheme(parsed);
  store.update((state) => {
    const config = state.config;
    const bg = config.background;
    if (theme.style) config.style = theme.style;
    if (theme.accent) config.accent = theme.accent;
    if (theme.glass != null) config.glass = theme.glass;
    if (theme.radius != null) config.radius = theme.radius;
    if (theme.fontScale != null) config.fontScale = theme.fontScale;
    if (theme.animations != null) config.animations = theme.animations;
    if (theme.performance != null) config.performance = theme.performance;
    if (theme.customCss != null) config.customCss = theme.customCss;
    if (theme.background.tone) bg.tone = theme.background.tone;
    if (theme.background.blur != null) bg.blur = theme.background.blur;
    if (theme.background.brightness != null) bg.brightness = theme.background.brightness;
    if (theme.background.saturate != null) bg.saturate = theme.background.saturate;
    if (theme.background.vignette != null) bg.vignette = theme.background.vignette;
    bg.veilByStyle = { ...bg.veilByStyle, ...theme.background.veilByStyle };
  }, 'config');
  return { style: theme.style || store.state.config.style };
}

/* --------------------------------------------------------------- 导入 */

const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_BYTES = 64 * 1024 * 1024;

/** 校验并清洗快捷方式；不合格的备份直接拒绝，避免误清空现有数据 */
function sanitizeIncoming(incoming) {
  if (!incoming || typeof incoming !== 'object') throw new Error('文件结构无法识别');
  if (!Array.isArray(incoming.shortcuts)) throw new Error('缺少 shortcuts 字段，可能不是 Serein 的备份');

  const shortcuts = incoming.shortcuts.filter(
    (item) => item && typeof item.url === 'string' && isUsableUrl(item.url)
  );
  // 空快捷方式列表本身是合法备份（用户可能删光了）；但「原先有、却全部无效」
  // 或只有一句空 shortcuts 的文件仍应拒绝，免得误清空数据。
  if (!shortcuts.length && (incoming.shortcuts.length || (!incoming.meta && !incoming.config))) {
    throw new Error('备份里没有有效的快捷方式');
  }
  return shortcuts;
}

export async function importState(file) {
  const isZip = /\.zip$/i.test(file.name || '') || file.type === 'application/zip';
  return isZip ? importZip(file) : importJson(file);
}

async function importJson(file) {
  // 旧版 JSON 备份不含图片；仍然保留兼容，换机后需要重新上传壁纸/图标
  if (file.size > MAX_JSON_BYTES) throw new Error('备份文件超过 8 MB，可能不是 Serein 的配置');
  // Windows 记事本等编辑器可能给 UTF-8 文件加 BOM，JSON.parse 会因此失败
  const text = (await file.text()).replace(/^\uFEFF/, '');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }

  const incoming = parsed?.state || parsed;
  const shortcuts = sanitizeIncoming(incoming);
  store.replaceState({ ...incoming, shortcuts });
  return { count: shortcuts.length, assets: 0, format: 'json' };
}

async function importZip(file) {
  if (file.size > MAX_ZIP_BYTES) throw new Error('备份文件超过 64 MB');
  const entries = await readZip(file);
  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) throw new Error('备份里缺少 manifest.json');

  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error('manifest.json 不是合法的 JSON');
  }
  if (parsed?._format !== 'serein-backup') throw new Error('不是 Serein 的备份文件');

  const incoming = parsed.state;
  const shortcuts = sanitizeIncoming(incoming);
  const assets = Array.isArray(parsed.assets) ? parsed.assets : [];

  // 先写图片再替换状态：任何一张写失败都直接中止，现有数据保持不动
  let restored = 0;
  for (const asset of assets) {
    if (!asset || typeof asset.key !== 'string' || !ASSET_KEY.test(asset.key)) continue;
    const bytes = entries.get(asset.name);
    if (!bytes) continue;
    const blob = new Blob([bytes], { type: typeof asset.type === 'string' ? asset.type : '' });
    const result = await files.put(asset.key, blob);
    if (result == null) throw new Error('图片写入失败，可能是存储空间不足');
    restored += 1;
  }

  store.replaceState({ ...incoming, shortcuts });
  return { count: shortcuts.length, assets: restored, format: 'zip' };
}

/* --------------------------------------------------------------- 重置 */

export async function resetAll({ keepAssets = false } = {}) {
  store.resetState();
  clearLocal();
  clearChromeMirror();
  if (!keepAssets) await files.clear();
}

/* --------------------------------------------------------------- 用量 */

export async function usageReport() {
  const json = JSON.stringify(store.state);
  const assets = await assetUsage();
  return {
    configBytes: new Blob([json]).size,
    assetCount: assets.count,
    assetBytes: assets.bytes,
  };
}

export { requestPersistentStorage };

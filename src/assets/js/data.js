/* Lumen · 数据导入 / 导出 / 重置 */

import * as store from './store.js';
import { files, assetUsage, clearLocal, clearChromeMirror, requestPersistentStorage } from './storage.js';
import { APP } from './defaults.js';
import { normalizeUrl, isSafeUrl } from './util.js';

/* --------------------------------------------------------------- 导出 */

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportState() {
  const payload = {
    _format: 'lumen-export',
    _version: APP.version,
    _exportedAt: new Date().toISOString(),
    state: store.state,
  };
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  download(`lumen-backup-${stamp}.json`, JSON.stringify(payload, null, 2));
}

/* --------------------------------------------------------------- 导入 */

export async function importState(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }

  const incoming = parsed?.state || parsed;
  if (!incoming || typeof incoming !== 'object') throw new Error('文件结构无法识别');
  if (!Array.isArray(incoming.shortcuts)) throw new Error('缺少 shortcuts 字段，可能不是 Lumen 的备份');

  // 清洗：剔除不安全 URL
  const shortcuts = incoming.shortcuts.filter((item) => item && isSafeUrl(normalizeUrl(item.url)));
  if (!shortcuts.length) throw new Error('备份里没有有效的快捷方式');

  store.replaceState({ ...incoming, shortcuts });
  return { count: shortcuts.length };
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

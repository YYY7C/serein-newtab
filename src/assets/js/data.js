/* Serein · 数据导入 / 导出 / 重置 */

import * as store from './store.js';
import { files, assetUsage, clearLocal, clearChromeMirror, requestPersistentStorage } from './storage.js';
import { APP } from './defaults.js';
import { isUsableUrl } from './util.js';

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
    _format: 'serein-export',
    _version: APP.version,
    _exportedAt: new Date().toISOString(),
    state: store.state,
  };
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  download(`serein-backup-${stamp}.json`, JSON.stringify(payload, null, 2));
}

/* --------------------------------------------------------------- 导入 */

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export async function importState(file) {
  // 正常备份（不含上传图片）远小于 8 MB；挡住误选的超大文件，避免一次 JSON.parse 卡死新标签页
  if (file.size > MAX_IMPORT_BYTES) throw new Error('备份文件超过 8 MB，可能不是 Serein 的配置');
  // Windows 记事本等编辑器可能给 UTF-8 文件加 BOM，JSON.parse 会因此失败
  const text = (await file.text()).replace(/^\uFEFF/, '');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }

  const incoming = parsed?.state || parsed;
  if (!incoming || typeof incoming !== 'object') throw new Error('文件结构无法识别');
  if (!Array.isArray(incoming.shortcuts)) throw new Error('缺少 shortcuts 字段，可能不是 Serein 的备份');

  // 清洗：剔除不安全 URL 和非字符串 URL（后者只会在计数里造成虚高）
  const shortcuts = incoming.shortcuts.filter(
    (item) => item && typeof item.url === 'string' && isUsableUrl(item.url)
  );
  // 空快捷方式列表本身是合法备份（用户可能删光了）；但「原先有、却全部无效」
  // 或只有一句空 shortcuts 的文件仍应拒绝，免得误清空数据。
  if (!shortcuts.length && (incoming.shortcuts.length || (!incoming.meta && !incoming.config))) {
    throw new Error('备份里没有有效的快捷方式');
  }
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

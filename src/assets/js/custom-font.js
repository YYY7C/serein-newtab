/* Serein · 自定义字体
 *
 * 字体文件存在 IndexedDB（font:<id>），这里只负责注册 FontFace 并切换 --font-sans。
 * 加载失败时静默退回内置字体栈，不让一次坏文件影响首屏。
 */

import { files } from './storage.js';

const FAMILY = 'Serein Custom Font';
let loadedKey = '';
let loadedFace = null;
let seq = 0;

export async function applyCustomFont(state) {
  const font = state?.config?.customFont;
  const key = font?.id || '';
  const token = ++seq;

  if (!key) {
    reset();
    return false;
  }
  if (key === loadedKey && loadedFace) return true;

  let blob = null;
  try {
    blob = await files.get(`font:${key}`);
  } catch {
    blob = null;
  }
  if (token !== seq) return false;
  if (!(blob instanceof Blob)) {
    reset();
    return false;
  }

  const FontFaceCtor = globalThis.FontFace;
  if (typeof FontFaceCtor !== 'function') return false;

  try {
    const face = new FontFaceCtor(FAMILY, await blob.arrayBuffer(), { display: 'swap' });
    await face.load();
    if (token !== seq) return false;
    if (loadedFace) document.fonts.delete(loadedFace);
    document.fonts.add(face);
    loadedFace = face;
    loadedKey = key;
    document.documentElement.style.setProperty('--font-sans', `'${FAMILY}', var(--font-sans-base)`);
    return true;
  } catch {
    reset();
    return false;
  }
}

/** 先验证再落盘：损坏的字体文件不该写进 IndexedDB 和配置 */
export async function canLoadFontFile(file) {
  const FontFaceCtor = globalThis.FontFace;
  if (typeof FontFaceCtor !== 'function') return true;
  try {
    const face = new FontFaceCtor('Serein Probe', await file.arrayBuffer(), { display: 'swap' });
    await face.load();
    return true;
  } catch {
    return false;
  }
}

function reset() {
  if (loadedFace) document.fonts.delete(loadedFace);
  loadedFace = null;
  loadedKey = '';
  document.documentElement.style.removeProperty('--font-sans');
}

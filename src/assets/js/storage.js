/* Lumen · 持久化层
 *
 * 三条通道，各自负责合适的负载：
 *  1. localStorage  —— 全部结构化配置（同步读取，保证新标签页 0ms 首屏骨架）
 *  2. IndexedDB     —— 二进制资产（上传的壁纸、自定义图标），避免把 base64 塞进 JSON
 *  3. chrome.storage.local —— 兜底镜像，浏览器清理 localStorage 时可恢复
 *
 * 全部为本地存储：无账号、无云端、不发起任何上传。
 */

const STATE_KEY = 'lumen.state.v1';
const MIRROR_KEY = 'lumen.mirror.v1';
const MIRROR_INTERVAL = 5 * 60 * 1000; // 镜像最多 5 分钟写一次，避免无谓 IO

/* ------------------------------------------------------------ localStorage */

export function readLocal() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[lumen/storage] 读取失败', err);
    return null;
  }
}

export function writeLocal(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('[lumen/storage] 写入失败（可能超出配额）', err);
    return false;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* 忽略 */
  }
}

/* ------------------------------------------------------ chrome.storage 镜像 */

let lastMirrorAt = 0;

export function mirrorToChrome(state, force = false) {
  const now = Date.now();
  if (!force && now - lastMirrorAt < MIRROR_INTERVAL) return;
  lastMirrorAt = now;
  try {
    chrome?.storage?.local?.set?.({ [MIRROR_KEY]: state });
  } catch {
    /* 非扩展环境（本地调试）忽略 */
  }
}

export function readChromeMirror() {
  return new Promise((resolve) => {
    try {
      chrome?.storage?.local?.get?.(MIRROR_KEY, (result) => resolve(result?.[MIRROR_KEY] || null));
    } catch {
      resolve(null);
    }
  });
}

export function clearChromeMirror() {
  try {
    chrome?.storage?.local?.remove?.(MIRROR_KEY);
  } catch {
    /* 忽略 */
  }
}

/* --------------------------------------------------------------- IndexedDB */

const DB_NAME = 'lumen-assets';
const DB_VERSION = 1;
const STORE = 'files';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('[lumen/storage] IndexedDB 不可用', request.error);
      resolve(null);
    };
  });
  return dbPromise;
}

function tx(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let transaction;
        try {
          transaction = db.transaction(STORE, mode);
        } catch {
          resolve(null);
          return;
        }
        const store = transaction.objectStore(STORE);
        let result = null;
        try {
          const request = run(store);
          if (request) request.onsuccess = () => { result = request.result; };
        } catch (err) {
          console.warn('[lumen/storage] 事务失败', err);
        }
        transaction.oncomplete = () => resolve(result ?? null);
        transaction.onerror = () => resolve(result ?? null);
        transaction.onabort = () => resolve(result ?? null);
      })
  );
}

export const files = {
  put(key, value) {
    return tx('readwrite', (store) => store.put(value, key));
  },
  get(key) {
    return tx('readonly', (store) => store.get(key));
  },
  remove(key) {
    return tx('readwrite', (store) => store.delete(key));
  },
  keys() {
    return tx('readonly', (store) => store.getAllKeys()).then((keys) => keys || []);
  },
  clear() {
    return tx('readwrite', (store) => store.clear());
  },
};

/** 统计 IndexedDB 中所有资产的体积（用于设置页的存储面板） */
export async function assetUsage() {
  const keys = await files.keys();
  let total = 0;
  for (const key of keys) {
    const value = await files.get(key);
    if (value instanceof Blob) total += value.size;
    else if (typeof value === 'string') total += value.length;
  }
  return { count: keys.length, bytes: total };
}

/* ---------------------------------------------------------- 大对象 URL 管理 */

const objectUrls = new Set();

export function trackObjectUrl(url) {
  if (url && url.startsWith('blob:')) objectUrls.add(url);
  return url;
}

export function revokeObjectUrl(url) {
  if (url && objectUrls.has(url)) {
    URL.revokeObjectURL(url);
    objectUrls.delete(url);
  }
}

export function revokeAllObjectUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.clear();
}

/** 请求浏览器不要回收本站点数据（壁纸/图标很占空间时很关键） */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate || { usage: 0, quota: 0 };
  } catch {
    return { usage: 0, quota: 0 };
  }
}

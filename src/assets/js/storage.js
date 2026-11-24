/* Serein · 持久化层
 *
 * 三条通道，各自负责合适的负载：
 *  1. localStorage  —— 全部结构化配置（同步读取，保证新标签页 0ms 首屏骨架）
 *  2. IndexedDB     —— 二进制资产（上传的壁纸、自定义图标），避免把 base64 塞进 JSON
 *  3. chrome.storage.local —— 兜底镜像，浏览器清理 localStorage 时可恢复
 *
 * 全部为本地存储：无账号、无云端、不发起任何上传。
 */

const STATE_KEY = 'serein.state.v1';
const MIRROR_KEY = 'serein.mirror.v1';
/** 改名（Lumen → Serein）前的旧键：只用于一次性搬迁，搬完即删 */
const LEGACY_STATE_KEY = 'lumen.state.v1';
const LEGACY_MIRROR_KEY = 'lumen.mirror.v1';
const MIRROR_INTERVAL = 5 * 60 * 1000; // 镜像最多 5 分钟写一次，避免无谓 IO
const STATE_CHANNEL = 'serein.state';

/** 同一扩展的其它标签页：storage 事件跨标签，BroadcastChannel 更快，两者互为兜底 */
let stateChannel = null;
try {
  stateChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(STATE_CHANNEL) : null;
} catch {
  stateChannel = null;
}

export function broadcastState(state) {
  try {
    stateChannel?.postMessage({ type: 'state', state });
  } catch {
    /* 非扩展环境或已关闭，忽略 */
  }
}

export function watchExternalState(onState) {
  const onStorage = (event) => {
    if (event.key !== STATE_KEY || !event.newValue) return;
    try {
      onState(JSON.parse(event.newValue));
    } catch (err) {
      console.warn('[serein/storage] 外部状态无法解析，已忽略', err);
    }
  };
  window.addEventListener('storage', onStorage);
  const onMessage = (event) => {
    if (event.data?.type === 'state' && event.data.state) onState(event.data.state);
  };
  stateChannel?.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener('storage', onStorage);
    stateChannel?.removeEventListener('message', onMessage);
  };
}

/* ------------------------------------------------------------ localStorage */

export function readLocal() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn('[serein/storage] 读取失败', err);
    return null;
  }
  return adoptLegacyState();
}

/** 把旧键上的配置搬到新键：返回解析后的状态，搬迁失败也照样让页面用上旧数据 */
function adoptLegacyState() {
  let raw = null;
  try {
    raw = localStorage.getItem(LEGACY_STATE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[serein/storage] 旧配置损坏，未搬迁', err);
    return null;
  }
  try {
    localStorage.setItem(STATE_KEY, raw);
    localStorage.removeItem(LEGACY_STATE_KEY);
  } catch (err) {
    // 写入失败（配额/隐私模式）：旧键保留，下次启动再试
    console.warn('[serein/storage] 旧配置搬迁失败，本次仍用旧数据', err);
  }
  return parsed;
}

export function writeLocal(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('[serein/storage] 写入失败（可能超出配额）', err);
    return false;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(LEGACY_STATE_KEY);
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
    const local = globalThis.chrome?.storage?.local;
    if (!local?.get) {
      resolve(null);
      return;
    }
    try {
      local.get([MIRROR_KEY, LEGACY_MIRROR_KEY], (result) => {
        if (globalThis.chrome?.runtime?.lastError) {
          resolve(null);
          return;
        }
        const fresh = result?.[MIRROR_KEY];
        if (fresh) {
          resolve(fresh);
          return;
        }
        const legacy = result?.[LEGACY_MIRROR_KEY];
        if (!legacy || typeof legacy !== 'object') {
          resolve(null);
          return;
        }
        // 旧镜像只搬一次：写到新键后清掉旧键，失败也无所谓（下次还能再读到）
        try {
          local.set?.({ [MIRROR_KEY]: legacy }, () => local.remove?.(LEGACY_MIRROR_KEY));
        } catch {
          /* 忽略 */
        }
        resolve(legacy);
      });
    } catch {
      resolve(null);
    }
  });
}

export function clearChromeMirror() {
  try {
    chrome?.storage?.local?.remove?.([MIRROR_KEY, LEGACY_MIRROR_KEY]);
  } catch {
    /* 忽略 */
  }
}

/* --------------------------------------------------------------- IndexedDB */

const DB_NAME = 'serein-assets';
/** 改名前的旧库：上传的壁纸/图标搬进新库后删掉旧库 */
const LEGACY_DB_NAME = 'lumen-assets';
const DB_VERSION = 1;
const STORE = 'files';

let dbPromise = null;
let legacyAssetsPromise = null;

/**
 * 把旧库（Lumen）的资产一次性搬进新库。
 * 新库已经有数据就认为搬过了，绝不覆盖；旧库只在全部写入成功后删除，
 * 中途失败会留着，下次启动重试。
 */
function adoptLegacyAssets(db) {
  if (!legacyAssetsPromise) {
    legacyAssetsPromise = copyLegacyDb(db).catch((err) => {
      console.warn('[serein/storage] 旧资产搬迁失败', err);
      return false;
    });
  }
  return legacyAssetsPromise;
}

async function copyLegacyDb(db) {
  if (typeof indexedDB.databases !== 'function') return false;
  let names;
  try {
    names = (await indexedDB.databases()).map((entry) => entry.name);
  } catch {
    return false;
  }
  if (!names.includes(LEGACY_DB_NAME)) return false;
  if ((await countStore(db)) > 0) return false;

  const entries = await readLegacyEntries();
  if (!entries || !entries.length) return false;
  if (!(await writeEntries(db, entries))) return false;
  if ((await countStore(db)) < entries.length) return false;
  try {
    indexedDB.deleteDatabase(LEGACY_DB_NAME);
  } catch {
    /* 删不掉就留着，反正新库已经有数据 */
  }
  return true;
}

function countStore(db) {
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).count();
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

function openLegacyDb() {
  return new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(LEGACY_DB_NAME);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      // 正常不会走到这里（调用前已确认库存在）；万一发生就中止，别留下空库
      try {
        request.transaction.abort();
      } catch {
        /* 忽略 */
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readLegacyEntries() {
  return openLegacyDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      const done = (value) => {
        try {
          db.close();
        } catch {
          /* 忽略 */
        }
        resolve(value);
      };
      try {
        const store = db.transaction(STORE, 'readonly').objectStore(STORE);
        const keysRequest = store.getAllKeys();
        keysRequest.onerror = () => done(null);
        keysRequest.onsuccess = () => {
          const keys = keysRequest.result || [];
          if (!keys.length) {
            done([]);
            return;
          }
          const valuesRequest = store.getAll();
          valuesRequest.onerror = () => done(null);
          valuesRequest.onsuccess = () => {
            const values = valuesRequest.result || [];
            done(keys.map((key, index) => [key, values[index]]));
          };
        };
      } catch {
        done(null);
      }
    });
  });
}

function writeEntries(db, entries) {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      for (const [key, value] of entries) store.put(value, key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function openDb() {
  if (dbPromise) return dbPromise;
  const promise = new Promise((resolve) => {
    let request;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      resolve(null);
    };
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      fail();
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        // onblocked 已经让本次调用失败；迟到的成功连接直接关掉，别泄漏
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      // 先把旧库资产搬完再交连接：否则首屏可能读到空库，壁纸/图标全丢
      adoptLegacyAssets(db).then(
        () => resolve(db),
        () => resolve(db)
      );
    };
    request.onerror = () => {
      console.warn('[serein/storage] IndexedDB 不可用', request.error);
      fail();
    };
    request.onblocked = () => fail();
  });
  dbPromise = promise;
  // 失败后允许下一次调用重试：onblocked/临时错误过去后数据库往往还能打开
  promise.then((db) => {
    if (!db && dbPromise === promise) dbPromise = null;
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
          // 连接可能已被浏览器关闭（休眠恢复/内存回收），下次调用重新打开
          dbPromise = null;
          resolve(null);
          return;
        }
        const store = transaction.objectStore(STORE);
        let result = null;
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        try {
          const request = run(store);
          if (request) {
            request.onsuccess = () => {
              result = request.result;
            };
            request.onerror = () => finish(null);
          }
        } catch (err) {
          console.warn('[serein/storage] 事务失败', err);
          finish(null);
          try {
            transaction.abort();
          } catch {
            /* 忽略 */
          }
          return;
        }
        transaction.oncomplete = () => finish(result ?? null);
        // 事务被中止时，即便请求已经拿到结果也不能当成写入成功
        transaction.onerror = () => finish(null);
        transaction.onabort = () => finish(null);
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

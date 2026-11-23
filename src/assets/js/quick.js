/* Serein · 命令面板的快捷动作与可选权限数据源
 *
 * 这里只做「取数据 / 改数据」这几件小事，渲染仍交给 search.js。
 * 标签页、书签、历史都属于可选权限：没授权时面板给出入口，不静默失败。
 */

import * as store from './store.js';

const PALETTE_PERMISSIONS = {
  tabs: { permission: 'tabs', label: '标签页' },
  bookmarks: { permission: 'bookmarks', label: '书签' },
  history: { permission: 'history', label: '历史' },
};

export const palettePermission = (kind) => PALETTE_PERMISSIONS[kind] || null;

export const hasPermissionApi = () =>
  typeof chrome !== 'undefined' && Boolean(chrome?.permissions?.contains);

export async function permissionGranted(kind) {
  const entry = palettePermission(kind);
  if (!entry || !hasPermissionApi()) return false;
  try {
    return await chrome.permissions.contains({ permissions: [entry.permission] });
  } catch {
    return false;
  }
}

export function requestPermission(kind) {
  const entry = palettePermission(kind);
  if (!entry || !hasPermissionApi() || !chrome?.permissions?.request) return Promise.resolve(false);
  // 必须在点击手势里直接调用：先 await contains 再 request 会丢失用户激活
  return chrome.permissions
    .request({ permissions: [entry.permission] })
    .then((granted) => Boolean(granted))
    .catch(() => false);
}

export async function revokePermission(kind) {
  const entry = palettePermission(kind);
  if (!entry || !hasPermissionApi() || !chrome?.permissions?.remove) return false;
  try {
    return await chrome.permissions.remove({ permissions: [entry.permission] });
  } catch {
    return false;
  }
}

/** 统一大小写与空白：中文标题里大小写敏感没有意义 */
const hit = (haystack, needle) => String(haystack || '').toLowerCase().includes(needle);

function normalizeResults(items, limit) {
  const seen = new Set();
  const list = [];
  for (const item of items) {
    const url = String(item?.url || '');
    if (!/^https?:\/\//i.test(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      title: String(item.title || item.url).trim().slice(0, 120) || url,
      url,
    });
    if (list.length >= limit) break;
  }
  return list;
}

export async function searchOpenTabs(query) {
  if (!permissionGrantedOrApi('tabs')) return { status: 'unavailable', items: [] };
  if (!(await permissionGranted('tabs'))) return { status: 'denied', items: [] };
  try {
    const tabs = await chrome.tabs.query({});
    const needle = String(query || '').toLowerCase();
    const items = tabs
      .filter((tab) => tab.url && tab.title)
      .filter((tab) => !needle || hit(tab.title, needle) || hit(tab.url, needle))
      .map((tab) => ({ title: tab.title, url: tab.url }));
    return { status: 'ready', items: normalizeResults(items, 8) };
  } catch {
    return { status: 'error', items: [] };
  }
}

export async function searchBookmarks(query) {
  if (!permissionGrantedOrApi('bookmarks')) return { status: 'unavailable', items: [] };
  if (!(await permissionGranted('bookmarks'))) return { status: 'denied', items: [] };
  try {
    const nodes = await chrome.bookmarks.search(String(query || ''));
    const items = nodes.filter((node) => node.url).map((node) => ({ title: node.title, url: node.url }));
    return { status: 'ready', items: normalizeResults(items, 8) };
  } catch {
    return { status: 'error', items: [] };
  }
}

export async function searchHistory(query) {
  if (!permissionGrantedOrApi('history')) return { status: 'unavailable', items: [] };
  if (!(await permissionGranted('history'))) return { status: 'denied', items: [] };
  try {
    const entries = await chrome.history.search({ text: String(query || ''), maxResults: 20, startTime: 0 });
    const items = entries.map((entry) => ({ title: entry.title, url: entry.url }));
    return { status: 'ready', items: normalizeResults(items, 8) };
  } catch {
    return { status: 'error', items: [] };
  }
}

const QUICK_ACTIONS = {
  tabs: { title: '打开的标签页', load: searchOpenTabs },
  bookmarks: { title: '书签', load: searchBookmarks },
  history: { title: '浏览历史', load: searchHistory },
};

export const quickSource = (kind) => QUICK_ACTIONS[kind] || null;

export function addTodo(text) {
  return store.addTodo(text);
}

export function appendNote(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const current = String(store.state.notes || '');
  const next = current ? `${current.replace(/\s+$/, '')}\n${value}` : value;
  store.setNotes(next.slice(-20000));
  return true;
}

export async function copyText(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    /* 页面没有焦点或权限时退回 execCommand */
  }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 本地预览（http）没有扩展权限 API：把它和「用户拒绝授权」区分开 */
function permissionGrantedOrApi(kind) {
  return hasPermissionApi() && Boolean(palettePermission(kind));
}

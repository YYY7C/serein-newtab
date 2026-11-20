/* Serein · 状态容器
 *
 * 一个极简的「单一状态树 + 订阅」实现，替代 Pinia/Vuex。
 * 变更通过 commit(scope) 广播，各视图按 scope 决定是否重绘。
 *
 * scope: all | config | shortcuts | groups | todos | notes | weather
 */

import { files, readLocal, readChromeMirror, writeLocal, mirrorToChrome } from './storage.js';
import { createDefaultState, migrate } from './defaults.js';
import { uid, normalizeUrl, isUsableUrl } from './util.js';

const listeners = new Set();
let saveTimer = 0;
let pendingScope = null;

/** 启动瞬间 localStorage 是否已有数据——决定需不需要走镜像兜底 */
const bootSnapshot = readLocal();

function migrateBootState(raw) {
  try {
    return migrate(raw || null);
  } catch (err) {
    // 极端损坏（例如超深嵌套）不能让整个新标签页白屏
    console.warn('[serein/store] 配置迁移失败，先使用默认配置', err);
    return createDefaultState();
  }
}

export const state = migrateBootState(bootSnapshot);

/* ------------------------------------------------------------- 读取订阅 */

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* 删除/替换图标后回收 IndexedDB 里的旧文件。
 * 删除有 6 秒撤销窗口，所以延迟清理；撤销时取消，
 * 并在真正删除前再检查一次最新落盘状态（另一个新标签页可能已保存新引用）。 */
const iconCleanupTimers = new Map();

function iconReferenced(fileId) {
  const check = (snapshot) =>
    Array.isArray(snapshot?.shortcuts) &&
    snapshot.shortcuts.some((item) => item.iconType === 'file' && item.iconValue === fileId);
  return check(state) || check(readLocal());
}

function scheduleIconCleanup(fileId, delay = 6500) {
  if (!fileId) return;
  clearTimeout(iconCleanupTimers.get(fileId));
  const timer = setTimeout(() => {
    iconCleanupTimers.delete(fileId);
    if (!iconReferenced(fileId)) files.remove(`icon:${fileId}`);
  }, delay);
  iconCleanupTimers.set(fileId, timer);
}

function cancelIconCleanup(fileId) {
  if (!fileId) return;
  clearTimeout(iconCleanupTimers.get(fileId));
  iconCleanupTimers.delete(fileId);
}

function emit(scope) {
  for (const fn of Array.from(listeners)) {
    try {
      fn(scope, state);
    } catch (err) {
      console.error('[serein/store] 订阅者异常', err);
    }
  }
}

/* ------------------------------------------------------------- 写入提交 */

function flush(forceMirror = false) {
  saveTimer = 0;
  const ok = writeLocal(state);
  if (ok) mirrorToChrome(state, forceMirror);
  if (!ok) emit('storage-error');
  return ok;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 180);
}

/** 立即落盘（关闭页面前调用）：同时强制刷新镜像，防止刚改完就关窗丢副本 */
export function flushNow() {
  clearTimeout(saveTimer);
  return flush(true);
}

/**
 * localStorage 被清空时（清理浏览数据 / 隐私模式退出）从 chrome.storage.local 恢复。
 * 只在「本次启动时 localStorage 就是空的」情况下执行，避免覆盖用户当前数据。
 */
export async function restoreFromMirror() {
  const hasBootData =
    bootSnapshot &&
    typeof bootSnapshot === 'object' &&
    !Array.isArray(bootSnapshot) &&
    Object.keys(bootSnapshot).length > 0 &&
    // 只在看起来真的是 Serein 状态时才阻止镜像恢复；`{foo:1}` 这类脏对象要让位给镜像
    Boolean(
      bootSnapshot.config ||
        bootSnapshot.meta ||
        Array.isArray(bootSnapshot.shortcuts) ||
        Array.isArray(bootSnapshot.groups) ||
        Array.isArray(bootSnapshot.todos) ||
        typeof bootSnapshot.notes === 'string' ||
        bootSnapshot.weather
    );
  if (hasBootData) return false;
  const mirror = await readChromeMirror();
  if (!mirror || typeof mirror !== 'object' || Array.isArray(mirror) || !Object.keys(mirror).length) return false;

  let next;
  try {
    next = migrate(mirror);
  } catch (err) {
    console.warn('[serein/store] 镜像配置损坏，已忽略', err);
    return false;
  }
  // 原地替换，保持所有已持有的 state 引用继续有效
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, next);

  writeLocal(state);
  emit('all');
  return true;
}

export function commit(scope = 'all') {
  state.meta.updatedAt = Date.now();
  scheduleSave();
  pendingScope = scope;
  emit(scope);
}

/** 只落盘、不广播：用于壁纸缓存等纯内部字段，避免触发整页重建 */
export function persist() {
  state.meta.updatedAt = Date.now();
  scheduleSave();
}

/** 修改后提交 */
export function update(mutator, scope = 'all') {
  mutator(state);
  commit(scope);
}

export const config = () => state.config;

/** 浅合并 config 顶层字段后提交 */
export function patchConfig(partial, scope = 'config') {
  Object.assign(state.config, partial);
  commit(scope);
}

/* --------------------------------------------------------------- 快捷方式 */

/** 不展开数组：上万个书签也不会触发 Math.max(...args) 的参数上限 */
function maxOrder(items) {
  let max = -Infinity;
  for (const item of items) {
    const order = Number(item?.order);
    if (Number.isFinite(order) && order > max) max = order;
  }
  return max;
}

const nextOrder = (list) => {
  const max = maxOrder(list);
  return max === -Infinity ? 0 : max + 10;
};

/** 主面板（快捷方式 + 文件夹）共用的 order 空间 */
const nextRootOrder = () => {
  const roots = [...state.shortcuts.filter((item) => !item.groupId), ...state.groups];
  const max = maxOrder(roots);
  return max === -Infinity ? 0 : max + 10;
};

export function addShortcut(data) {
  if (!data || typeof data !== 'object') return null;
  const url = normalizeUrl(data.url);
  if (!url || !isUsableUrl(url)) return null;
  const groupId = data.groupId && state.groups.some((group) => group.id === data.groupId) ? data.groupId : null;
  const item = {
    id: uid('s_'),
    title: String(data.title || '').trim().slice(0, 80) || '未命名',
    url,
    iconType: ['auto', 'favicon', 'emoji', 'url', 'file', 'text'].includes(data.iconType)
      ? data.iconType
      : 'auto',
    iconValue: typeof data.iconValue === 'string' ? data.iconValue.slice(0, 2048) : '',
    groupId,
    order: nextOrder(state.shortcuts),
    createdAt: Date.now(),
  };
  state.shortcuts.push(item);
  commit('shortcuts');
  return item;
}

export function updateShortcut(id, patch) {
  const item = state.shortcuts.find((s) => s.id === id);
  if (!item || !patch || typeof patch !== 'object') return null;
  const previousFileId = item.iconType === 'file' ? item.iconValue : '';
  const next = { ...patch };
  delete next.id;
  if (next.url !== undefined) {
    const url = normalizeUrl(next.url);
    if (!url || !isUsableUrl(url)) return null;
    next.url = url;
  }
  if (next.groupId !== undefined) {
    next.groupId = next.groupId && state.groups.some((group) => group.id === next.groupId) ? next.groupId : null;
  }
  if (next.title !== undefined) {
    next.title = String(next.title || '').trim().slice(0, 80) || '未命名';
  }
  if (next.iconType !== undefined && !['auto', 'favicon', 'emoji', 'url', 'file', 'text'].includes(next.iconType)) {
    next.iconType = 'auto';
    next.iconValue = '';
  }
  if (next.iconValue !== undefined) {
    next.iconValue = typeof next.iconValue === 'string' ? next.iconValue.slice(0, 2048) : '';
  }
  Object.assign(item, next);
  if (previousFileId && !(item.iconType === 'file' && item.iconValue === previousFileId)) {
    // 编辑没有撤销入口，但要等这次 commit 落盘后再回收：
    // 提前删文件会让「落盘失败后回退到旧状态」的新标签页破图。
    scheduleIconCleanup(previousFileId, 600);
  }
  commit('shortcuts');
  return item;
}

export function removeShortcut(id) {
  const index = state.shortcuts.findIndex((s) => s.id === id);
  if (index < 0) return false;
  const [removed] = state.shortcuts.splice(index, 1);
  if (removed.iconType === 'file' && removed.iconValue) scheduleIconCleanup(removed.iconValue);
  commit('shortcuts');
  return true;
}

/** 撤销删除：把原始对象放回去，order 保持不变，位置也就回来了 */
export function restoreShortcut(item) {
  if (!item || state.shortcuts.some((s) => s.id === item.id)) return;
  const groupId = item.groupId && state.groups.some((group) => group.id === item.groupId) ? item.groupId : null;
  if (item.iconType === 'file' && item.iconValue) cancelIconCleanup(item.iconValue);
  state.shortcuts.push({ ...item, groupId });
  commit('shortcuts');
}

export function moveShortcutToGroup(id, groupId) {
  const item = state.shortcuts.find((s) => s.id === id);
  if (!item) return false;
  if (groupId && !state.groups.some((group) => group.id === groupId)) return false;
  item.groupId = groupId || null;
  const siblings = state.shortcuts.filter((s) => s.groupId === item.groupId && s.id !== id);
  item.order = nextOrder(siblings);
  commit('shortcuts');
  return true;
}

/**
 * 批量导入到一个新文件夹：只提交一次，避免几十个书签触发几十轮网格重建。
 * @param {string} title
 * @param {Array<{title:string,url:string}>} entries
 */
export function importShortcuts(title, entries) {
  const list = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (!entry) return null;
      const url = normalizeUrl(entry.url);
      if (!url || !isUsableUrl(url)) return null;
      return { ...entry, url };
    })
    .filter(Boolean);
  if (!list.length) return null;

  const group = {
    id: uid('g_'),
    title: String(title || '书签导入').trim().slice(0, 40) || '书签导入',
    order: nextRootOrder(),
    createdAt: Date.now(),
  };
  state.groups.push(group);

  list.forEach((entry, index) => {
    state.shortcuts.push({
      id: uid('s_'),
      title: (String(entry.title || '').trim().slice(0, 80)) || '未命名',
      url: entry.url,
      iconType: 'auto',
      iconValue: '',
      groupId: group.id,
      order: index * 10,
      createdAt: Date.now() + index,
    });
  });

  commit('all');
  return { group, count: list.length };
}

/** 用一组 id 的顺序重排（自动重新编号，间隔 10 便于后续插入） */
export function applyOrder(ids) {
  const index = new Map(ids.map((id, i) => [id, i]));
  for (const item of state.shortcuts) {
    if (index.has(item.id)) item.order = index.get(item.id) * 10;
  }
  for (const group of state.groups) {
    if (index.has(group.id)) group.order = index.get(group.id) * 10;
  }
  commit('shortcuts');
}

/** 主网格里显示的全部条目（快捷方式 + 文件夹），按 order 排序 */
export function rootItems() {
  const shortcuts = state.shortcuts
    .filter((s) => !s.groupId)
    .map((item) => ({ kind: 'shortcut', id: item.id, order: item.order, item }));
  const groups = state.groups.map((item) => ({ kind: 'group', id: item.id, order: item.order, item }));
  return [...shortcuts, ...groups].sort((a, b) => a.order - b.order);
}

export function groupItems(groupId) {
  return state.shortcuts.filter((s) => s.groupId === groupId).sort((a, b) => a.order - b.order);
}

/* ----------------------------------------------------------------- 文件夹 */

export function addGroup(title = '新建文件夹') {
  const group = {
    id: uid('g_'),
    title: String(title || '新建文件夹').trim().slice(0, 40) || '新建文件夹',
    order: nextRootOrder(),
    createdAt: Date.now(),
  };
  state.groups.push(group);
  commit('groups');
  return group;
}

export function renameGroup(id, title) {
  const group = state.groups.find((g) => g.id === id);
  if (!group) return;
  group.title = String(title || '').trim().slice(0, 40) || '文件夹';
  commit('groups');
}

export function removeGroup(id, { keepItems = true } = {}) {
  const index = state.groups.findIndex((g) => g.id === id);
  if (index < 0) return;
  state.groups.splice(index, 1);
  if (keepItems) {
    let order = nextRootOrder();
    for (const item of state.shortcuts.filter((s) => s.groupId === id)) {
      item.groupId = null;
      item.order = order;
      order += 10;
    }
  } else {
    const removed = state.shortcuts.filter((s) => s.groupId === id);
    state.shortcuts = state.shortcuts.filter((s) => s.groupId !== id);
    for (const item of removed) {
      if (item.iconType === 'file' && item.iconValue) scheduleIconCleanup(item.iconValue);
    }
  }
  commit('all');
}

/** 撤销「删除文件夹」/「解散文件夹」
 * reassign=true 时把仍在主面板的图标重新放回文件夹（解散场景）
 */
export function restoreGroup(group, items = [], { reassign = false } = {}) {
  if (!group || state.groups.some((g) => g.id === group.id)) return;
  state.groups.push({ ...group });
  for (const item of items) {
    const existing = state.shortcuts.find((s) => s.id === item.id);
    if (existing) {
      // 解散撤销只收回仍留在主面板的图标；用户如果在撤销前把它移进别的文件夹，
      // 或已经删除，就不应该被更早的「解散」操作覆盖/复活。
      if (reassign && !existing.groupId) {
        if (item.iconType === 'file' && item.iconValue) cancelIconCleanup(item.iconValue);
        existing.groupId = group.id;
        existing.order = item.order;
      }
    } else if (!reassign) {
      // 删除文件夹时内容是一起删掉的，撤销需要原样放回
      if (item.iconType === 'file' && item.iconValue) cancelIconCleanup(item.iconValue);
      state.shortcuts.push({ ...item });
    }
  }
  commit('all');
}

/* ------------------------------------------------------------------- 待办 */

export function addTodo(text) {
  const value = String(text || '').trim().slice(0, 500);
  if (!value) return null;
  const todo = { id: uid('t_'), text: value, done: false, createdAt: Date.now() };
  state.todos.push(todo);
  commit('todos');
  return todo;
}

export function toggleTodo(id) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  todo.done = !todo.done;
  commit('todos');
}

export function removeTodo(id) {
  state.todos = state.todos.filter((t) => t.id !== id);
  commit('todos');
}

export function clearDoneTodos() {
  state.todos = state.todos.filter((t) => !t.done);
  commit('todos');
}

/* ------------------------------------------------------------------- 便签 */

export function setNotes(text) {
  state.notes = String(text || '').slice(0, 20000);
  commit('notes');
}

/* ----------------------------------------------------------------- 天气 */

export function setWeather(patch) {
  if (!patch || typeof patch !== 'object') return;
  Object.assign(state.weather, patch);
  commit('weather');
}

/* --------------------------------------------------------------- 整体替换 */

export function replaceState(next) {
  const migrated = migrate(next);
  const keys = ['meta', 'config', 'groups', 'shortcuts', 'todos', 'notes', 'weather'];
  for (const key of keys) state[key] = migrated[key];
  commit('all');
  flushNow();
}

export function resetState() {
  const fresh = createDefaultState();
  const keys = ['meta', 'config', 'groups', 'shortcuts', 'todos', 'notes', 'weather'];
  for (const key of keys) state[key] = fresh[key];
  commit('all');
  flushNow();
}

/* 关闭页面前确保落盘 */
window.addEventListener('pagehide', flushNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushNow();
});

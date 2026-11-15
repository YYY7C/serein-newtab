/* Lumen · 状态容器
 *
 * 一个极简的「单一状态树 + 订阅」实现，替代 Pinia/Vuex。
 * 变更通过 commit(scope) 广播，各视图按 scope 决定是否重绘。
 *
 * scope: all | config | shortcuts | groups | todos | notes | weather
 */

import { readLocal, readChromeMirror, writeLocal, mirrorToChrome } from './storage.js';
import { createDefaultState, migrate } from './defaults.js';
import { uid } from './util.js';

const listeners = new Set();
let saveTimer = 0;
let pendingScope = null;

/** 启动瞬间 localStorage 是否已有数据——决定需不需要走镜像兜底 */
const bootSnapshot = readLocal();

export const state = migrate(bootSnapshot || null);

/* ------------------------------------------------------------- 读取订阅 */

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(scope) {
  for (const fn of Array.from(listeners)) {
    try {
      fn(scope, state);
    } catch (err) {
      console.error('[lumen/store] 订阅者异常', err);
    }
  }
}

/* ------------------------------------------------------------- 写入提交 */

function flush(forceMirror = false) {
  saveTimer = 0;
  const ok = writeLocal(state);
  if (ok) mirrorToChrome(state, forceMirror);
  if (!ok) emit('storage-error');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 180);
}

/** 立即落盘（关闭页面前调用）：同时强制刷新镜像，防止刚改完就关窗丢副本 */
export function flushNow() {
  clearTimeout(saveTimer);
  flush(true);
}

/**
 * localStorage 被清空时（清理浏览数据 / 隐私模式退出）从 chrome.storage.local 恢复。
 * 只在「本次启动时 localStorage 就是空的」情况下执行，避免覆盖用户当前数据。
 */
export async function restoreFromMirror() {
  if (bootSnapshot) return false;
  const mirror = await readChromeMirror();
  if (!mirror || typeof mirror !== 'object') return false;

  const next = migrate(mirror);
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

const nextOrder = (list) => (list.length ? Math.max(...list.map((i) => i.order || 0)) + 10 : 0);

export function addShortcut(data) {
  const item = {
    id: uid('s_'),
    title: (data.title || '').trim().slice(0, 80) || '未命名',
    url: data.url,
    iconType: data.iconType || 'auto',
    iconValue: data.iconValue || '',
    groupId: data.groupId || null,
    order: nextOrder(state.shortcuts),
    createdAt: Date.now(),
  };
  state.shortcuts.push(item);
  commit('shortcuts');
  return item;
}

export function updateShortcut(id, patch) {
  const item = state.shortcuts.find((s) => s.id === id);
  if (!item) return null;
  Object.assign(item, patch);
  commit('shortcuts');
  return item;
}

export function removeShortcut(id) {
  const index = state.shortcuts.findIndex((s) => s.id === id);
  if (index < 0) return false;
  state.shortcuts.splice(index, 1);
  commit('shortcuts');
  return true;
}

/** 撤销删除：把原始对象放回去，order 保持不变，位置也就回来了 */
export function restoreShortcut(item) {
  if (!item || state.shortcuts.some((s) => s.id === item.id)) return;
  state.shortcuts.push({ ...item });
  commit('shortcuts');
}

export function moveShortcutToGroup(id, groupId) {
  const item = state.shortcuts.find((s) => s.id === id);
  if (!item) return false;
  item.groupId = groupId || null;
  const siblings = state.shortcuts.filter((s) => s.groupId === item.groupId && s.id !== id);
  item.order = nextOrder(siblings);
  commit('shortcuts');
  return true;
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
    title: String(title).slice(0, 40) || '新建文件夹',
    order: nextOrder(state.groups),
    createdAt: Date.now(),
  };
  state.groups.push(group);
  commit('groups');
  return group;
}

export function renameGroup(id, title) {
  const group = state.groups.find((g) => g.id === id);
  if (!group) return;
  group.title = String(title).slice(0, 40) || '文件夹';
  commit('groups');
}

export function removeGroup(id, { keepItems = true } = {}) {
  const index = state.groups.findIndex((g) => g.id === id);
  if (index < 0) return;
  state.groups.splice(index, 1);
  if (keepItems) {
    for (const item of state.shortcuts.filter((s) => s.groupId === id)) {
      item.groupId = null;
      item.order = nextOrder(state.shortcuts);
    }
  } else {
    state.shortcuts = state.shortcuts.filter((s) => s.groupId !== id);
  }
  commit('groups');
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
      if (reassign) {
        existing.groupId = group.id;
        existing.order = item.order;
      }
    } else {
      state.shortcuts.push({ ...item });
    }
  }
  commit('shortcuts');
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

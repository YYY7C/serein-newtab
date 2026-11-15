/* Lumen · 快捷方式网格
 *
 * 承载体：主网格（快捷方式 + 文件夹混合排序）、文件夹面板、拖拽排序、右键菜单。
 * 排序策略：所有条目共享一个 order 数值空间（间隔 10），排序后重新编号，
 * 因此「快捷方式」和「文件夹」可以任意交错。
 */

import { h, clear, $, svgIcon, bus, hostOf } from './util.js';
import * as store from './store.js';
import { resolveIcon } from './icons.js';
import { files, trackObjectUrl } from './storage.js';
import { openMenu } from './menu.js';

/* 编辑弹窗按需加载：首屏只有网格，不需要这 20 KB */
let modalsPromise = null;
const modals = () => (modalsPromise ||= import('./modals.js'));

let gridEl = null;
let firstRender = true;
let gridSignature = '';
let dragPayload = null;
const fileIconCache = new Map();

/* --------------------------------------------------------------- 图标 */

async function fileIconUrl(fileId) {
  if (fileIconCache.has(fileId)) return fileIconCache.get(fileId);
  const blob = await files.get(`icon:${fileId}`);
  if (!blob) return null;
  const url = trackObjectUrl(URL.createObjectURL(blob));
  fileIconCache.set(fileId, url);
  return url;
}

const iconStyle = () => store.state.config.layout.iconStyle || 'brand';

/** 字符徽标：品牌色渐变 + 字符 */
function monoNode(descriptor) {
  const mono = h('span', {
    class: `tile-mono${descriptor.emoji ? ' is-emoji' : ''}`,
    text: descriptor.text,
  });
  if (!descriptor.emoji) {
    mono.style.setProperty('--c1', descriptor.from);
    mono.style.setProperty('--c2', descriptor.to);
    if (descriptor.fg) mono.style.color = descriptor.fg;
  }
  return mono;
}

/**
 * @param {object} item 快捷方式
 */
function buildIcon(item) {
  const descriptor = resolveIcon(item, { iconStyle: iconStyle() });
  const box = h('div', { class: 'tile-icon' });

  if (descriptor.emoji) {
    box.appendChild(monoNode(descriptor));
    box.style.background = 'var(--glass-bg)';
    return box;
  }

  // 内置矢量品牌图标：本地文件，不会闪字符，也不依赖网络
  if (descriptor.brand) {
    box.classList.add('is-brand');
    attachImage(box, descriptor.src, {
      onError: () => {
        box.classList.remove('is-brand');
        box.appendChild(monoNode(descriptor));
      },
    });
    return box;
  }

  box.appendChild(monoNode(descriptor));

  if (descriptor.pendingFileId) {
    fileIconUrl(descriptor.pendingFileId).then((url) => {
      if (!url || !box.isConnected) return;
      attachImage(box, url, { cover: true });
    });
  } else if (descriptor.src) {
    attachImage(box, descriptor.src);
  }

  return box;
}

function attachImage(box, src, { cover = false, onError = null } = {}) {
  const img = h('img', {
    class: `tile-img${cover ? ' is-cover' : ''}`,
    src,
    alt: '',
    loading: 'lazy',
    decoding: 'async',
    draggable: 'false',
  });
  img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  img.addEventListener(
    'error',
    () => {
      img.remove();
      onError?.();
    },
    { once: true }
  );
  box.appendChild(img);
}

/** 文件夹磁贴内部的 2×2 缩略 */
function buildFolderMini(groupId) {
  const items = store.groupItems(groupId).slice(0, 4);
  const mini = h('div', { class: 'folder-mini' });
  for (let index = 0; index < 4; index += 1) {
    const item = items[index];
    if (!item) {
      mini.appendChild(h('span', { class: 'empty' }));
      continue;
    }
    const descriptor = resolveIcon(item, { iconStyle: iconStyle() });
    const cell = h('span', { class: descriptor.brand ? 'is-brand' : '', text: descriptor.brand ? '' : descriptor.text });
    if (!descriptor.brand) {
      cell.style.setProperty('--c1', descriptor.from);
      cell.style.setProperty('--c2', descriptor.to);
    }
    if (descriptor.emoji) cell.style.background = 'var(--glass-bg)';
    if (descriptor.src) {
      const img = h('img', { src: descriptor.src, alt: '', loading: 'lazy', draggable: 'false' });
      img.addEventListener(
        'load',
        () => {
          if (!descriptor.brand) {
            cell.textContent = '';
            cell.style.background = 'transparent';
          }
          cell.appendChild(img);
        },
        { once: true }
      );
      img.addEventListener(
        'error',
        () => {
          img.remove();
          cell.classList.remove('is-brand');
          if (descriptor.brand) cell.textContent = descriptor.text;
        },
        { once: true }
      );
    }
    mini.appendChild(cell);
  }
  return mini;
}

/* --------------------------------------------------------------- 磁贴 */

function buildShortcutTile(item, index) {
  const tile = h('div', {
    class: 'tile',
    'data-kind': 'shortcut',
    'data-id': item.id,
    'data-host': hostOf(item.url),
    draggable: 'true',
    tabindex: '0',
    role: 'link',
    title: `${item.title}\n${item.url}`,
    style: { '--i': String(index) },
  });

  tile.appendChild(buildIcon(item));
  tile.appendChild(h('div', { class: 'tile-label', text: item.title }));

  tile.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    openShortcut(item.url);
  });

  tile.addEventListener('auxclick', (event) => {
    if (event.button === 1) {
      event.preventDefault();
      window.open(item.url, '_blank', 'noopener');
    }
  });

  tile.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openShortcutMenu(item, event);
  });

  tile.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openShortcut(item.url);
    } else if (event.key === 'F2') {
      event.preventDefault();
      editShortcut(item);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteShortcut(item);
    }
  });

  return tile;
}

function buildFolderTile(group, index) {
  const count = store.groupItems(group.id).length;
  const tile = h('div', {
    class: 'tile',
    'data-kind': 'group',
    'data-id': group.id,
    'data-host': count > 0 ? `${count} 项` : '空',
    draggable: 'true',
    tabindex: '0',
    role: 'button',
    title: group.title,
    style: { '--i': String(index) },
  });

  const icon = h('div', { class: 'tile-icon' });
  icon.appendChild(buildFolderMini(group.id));

  tile.appendChild(icon);
  // 角标挂在 tile 上而不是 icon 内，避免被 .tile-icon 的 overflow:hidden 裁掉
  if (count > 0) tile.appendChild(h('span', { class: 'folder-badge', text: String(count) }));
  tile.appendChild(h('div', { class: 'tile-label', text: group.title }));

  tile.addEventListener('click', () => openFolder(group.id));
  tile.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openFolderMenu(group, event);
  });
  tile.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFolder(group.id);
    } else if (event.key === 'F2') {
      event.preventDefault();
      renameFolder(group);
    }
  });

  return tile;
}

function buildAddTile(index) {
  const tile = h('button', {
    class: 'tile tile--add',
    type: 'button',
    'data-kind': 'add',
    'data-host': '',
    title: '添加内容',
    style: { '--i': String(index) },
  });
  tile.appendChild(h('div', { class: 'tile-icon', html: svgIcon('plus', 24) }));
  tile.appendChild(h('div', { class: 'tile-label', text: '添加' }));

  tile.addEventListener('click', (event) => {
    const rect = tile.getBoundingClientRect();
    openMenu(
      [
        { label: '添加快捷方式', icon: 'plus', onClick: () => addShortcut() },
        { label: '新建文件夹', icon: 'folder-plus', onClick: () => createFolder() },
        { type: 'sep' },
        { label: '从书签导入', icon: 'bookmark', onClick: () => bus.emit('importBookmarks') },
        { label: '更换壁纸', icon: 'image', onClick: () => bus.emit('openSettings', { tab: 'wallpaper' }) },
        { label: '打开设置', icon: 'settings', shortcut: 'Ctrl+,', onClick: () => bus.emit('openSettings', {}) },
      ],
      { x: rect.left, y: rect.bottom + 8 }
    );
  });

  return tile;
}

/* --------------------------------------------------------------- 渲染 */

export function initTiles() {
  gridEl = $('#grid');
  attachGridEvents();
  renderGrid();
  store.subscribe((scope) => {
    if (scope === 'shortcuts' || scope === 'groups' || scope === 'config' || scope === 'all') renderGrid();
  });
  window.addEventListener('resize', () => { /* 网格自适应由 CSS 处理 */ });
}

export function renderGrid() {
  if (!gridEl) return;

  const items = store.rootItems();
  // 只有「影响磁贴外观」的数据变化才重绘。
  // 拖动设置里的滑块会高频 commit('config')，这里挡掉绝大多数无意义的重建。
  const signature = [
    store.state.config.layout.iconStyle || 'brand',
    items.map((entry) => `${entry.kind}:${entry.id}:${entry.order}`).join(','),
    store.state.shortcuts.map((s) => `${s.id}:${s.groupId || ''}:${s.order}:${s.title}:${s.url}`).join(','),
    store.state.groups.map((g) => `${g.id}:${g.title}`).join(','),
  ].join('|');
  if (signature === gridSignature && gridEl.childElementCount) return;
  gridSignature = signature;

  clear(gridEl);

  if (!items.length) {
    gridEl.appendChild(
      h(
        'div',
        { class: 'grid-empty' },
        h('div', { class: 'grid-empty-title', text: '从一个图标开始' }),
        h('div', {
          class: 'grid-empty-text',
          text: '点下面的「+」添加第一个网站；右键空白处也能新建文件夹或更换壁纸。',
        })
      )
    );
  }

  items.forEach((entry, index) => {
    gridEl.appendChild(
      entry.kind === 'group' ? buildFolderTile(entry.item, index) : buildShortcutTile(entry.item, index)
    );
  });

  gridEl.appendChild(buildAddTile(items.length));

  if (firstRender) {
    gridEl.classList.add('grid--enter');
    firstRender = false;
    setTimeout(() => gridEl.classList.remove('grid--enter'), items.length * 26 + 700);
  }
}

/* --------------------------------------------------------------- 打开 */

function openShortcut(url) {
  if (!url) return;
  const inNewTab = store.state.config.behavior.shortcutsInNewTab !== false;
  if (inNewTab) {
    const opened = window.open(url, '_blank', 'noopener');
    if (!opened) location.href = url;
  } else {
    location.href = url;
  }
}

/* --------------------------------------------------------------- 操作 */

export async function addShortcut(groupId = null) {
  const { shortcutEditor } = await modals();
  const result = await shortcutEditor({
    groups: store.state.groups,
    defaultGroupId: groupId,
  });
  if (!result) return;
  store.addShortcut(result);
}

async function editShortcut(item) {
  const { shortcutEditor } = await modals();
  const result = await shortcutEditor({
    shortcut: item,
    groups: store.state.groups,
  });
  if (!result) return;
  store.updateShortcut(item.id, result);
}

async function deleteShortcut(item) {
  if (store.state.config.behavior.confirmDelete) {
    const { confirmDialog } = await modals();
    const ok = await confirmDialog({
      title: '删除快捷方式',
      message: `确定要删除「${item.title}」吗？删除后 6 秒内可以撤销。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
  }
  const snapshot = { ...item };
  store.removeShortcut(item.id);
  bus.emit('toast', {
    text: `已删除「${item.title}」`,
    action: { label: '撤销', onClick: () => store.restoreShortcut(snapshot) },
  });
}

export async function createFolder(itemId = null) {
  const { promptDialog } = await modals();
  const title = await promptDialog({
    title: '新建文件夹',
    label: '文件夹名称',
    value: '新建文件夹',
    confirmText: '创建',
  });
  if (!title) return;
  const group = store.addGroup(title);
  if (itemId) store.moveShortcutToGroup(itemId, group.id);
  bus.emit('toast', { text: `已创建「${group.title}」` });
}

async function renameFolder(group) {
  const { promptDialog } = await modals();
  const title = await promptDialog({
    title: '重命名文件夹',
    label: '文件夹名称',
    value: group.title,
    confirmText: '保存',
  });
  if (!title) return;
  store.renameGroup(group.id, title);
}

/* --------------------------------------------------------------- 菜单 */

function openShortcutMenu(item, event) {
  const groups = store.state.groups;
  const moveItems = groups
    .filter((group) => group.id !== item.groupId)
    .map((group) => ({
      label: group.title,
      icon: 'folder',
      onClick: () => {
        store.moveShortcutToGroup(item.id, group.id);
        bus.emit('toast', { text: `已移动到「${group.title}」` });
      },
    }));

  const entries = [
    { label: '打开', icon: 'external', onClick: () => openShortcut(item.url) },
    { type: 'sep' },
    { label: '编辑…', icon: 'edit', shortcut: 'F2', onClick: () => editShortcut(item) },
  ];

  if (item.groupId) {
    entries.push({
      label: '移出文件夹',
      icon: 'arrowLeft',
      onClick: () => store.moveShortcutToGroup(item.id, null),
    });
  }

  if (moveItems.length) {
    entries.push({
      label: '移动到文件夹',
      icon: 'folder',
      onClick: () => {
        const rect = event.currentTarget.getBoundingClientRect();
        openMenu([{ type: 'label', label: '移动到' }, ...moveItems], {
          x: Math.min(rect.right + 6, window.innerWidth - 230),
          y: rect.top,
        });
      },
    });
  }

  entries.push({ label: '新建文件夹并移入', icon: 'folder-plus', onClick: () => createFolder(item.id) });
  entries.push({ type: 'sep' });
  entries.push({ label: '删除', icon: 'trash', danger: true, onClick: () => deleteShortcut(item) });

  openMenu(entries, { x: event.clientX, y: event.clientY });
}

function openFolderMenu(group, event) {
  openMenu(
    [
      { label: '打开文件夹', icon: 'folder', onClick: () => openFolder(group.id) },
      { label: '重命名…', icon: 'edit', onClick: () => renameFolder(group) },
      { type: 'sep' },
      {
        label: '解散（图标移出）',
        icon: 'folder',
        onClick: () => {
          const snapshot = { ...group };
          const nested = store.groupItems(group.id).map((item) => ({ ...item }));
          store.removeGroup(group.id, { keepItems: true });
          bus.emit('toast', {
            text: '文件夹已解散，图标已移回主面板',
            action: { label: '撤销', onClick: () => store.restoreGroup(snapshot, nested, { reassign: true }) },
          });
        },
      },
      {
        label: '删除文件夹及其内容',
        icon: 'trash',
        danger: true,
        onClick: async () => {
          const { confirmDialog } = await modals();
          const items = store.groupItems(group.id).map((item) => ({ ...item }));
          const ok = await confirmDialog({
            title: '删除文件夹',
            message: `「${group.title}」及其中的 ${items.length} 个图标都会被删除，删除后 6 秒内可以撤销。`,
            confirmText: '删除',
            danger: true,
          });
          if (!ok) return;
          const snapshot = { ...group };
          store.removeGroup(group.id, { keepItems: false });
          bus.emit('toast', {
            text: `已删除「${group.title}」`,
            action: { label: '撤销', onClick: () => store.restoreGroup(snapshot, items) },
          });
        },
      },
    ],
    { x: event.clientX, y: event.clientY }
  );
}

function openCanvasMenu(event) {
  openMenu(
    [
      { label: '添加快捷方式', icon: 'plus', onClick: () => addShortcut() },
      { label: '新建文件夹', icon: 'folder-plus', onClick: () => createFolder() },
      { type: 'sep' },
      { label: '更换壁纸', icon: 'image', onClick: () => bus.emit('openSettings', { tab: 'wallpaper' }) },
      { label: '调整布局', icon: 'grid', onClick: () => bus.emit('openSettings', { tab: 'layout' }) },
      { label: '设置', icon: 'settings', shortcut: 'Ctrl+,', onClick: () => bus.emit('openSettings', {}) },
    ],
    { x: event.clientX, y: event.clientY }
  );
}

/* --------------------------------------------------------------- 文件夹 */

async function openFolder(groupId) {
  const group = store.state.groups.find((g) => g.id === groupId);
  if (!group) return;

  const { openModal, shortcutEditor, promptDialog } = await modals();
  const grid = h('div', { class: 'folder-grid' });
  let modal = null;

  const paint = () => {
    clear(grid);
    const items = store.groupItems(groupId);
    items.forEach((item, index) => grid.appendChild(buildShortcutTile(item, index)));
    const addTile = h('button', {
      class: 'tile tile--add',
      type: 'button',
      title: '添加到文件夹',
      onclick: async () => {
        const result = await shortcutEditor({ groups: store.state.groups, defaultGroupId: groupId });
        if (result) {
          const created = store.addShortcut(result);
          store.moveShortcutToGroup(created.id, groupId);
          paint();
        }
      },
    });
    addTile.appendChild(h('div', { class: 'tile-icon', html: svgIcon('plus', 22) }));
    addTile.appendChild(h('div', { class: 'tile-label', text: '添加' }));
    grid.appendChild(addTile);
  };

  paint();

  modal = openModal({
    title: group.title,
    wide: true,
    body: grid,
    footer: [
      h('button', {
        class: 'btn is-ghost',
        type: 'button',
        text: '重命名',
        onclick: async () => {
          const title = await promptDialog({
            title: '重命名文件夹',
            label: '文件夹名称',
            value: group.title,
            confirmText: '保存',
          });
          if (!title) return;
          store.renameGroup(groupId, title);
          const heading = modal.card.querySelector('.modal-title');
          if (heading) heading.textContent = title;
        },
      }),
      h('span', { style: { flex: '1' } }),
      h('button', { class: 'btn is-primary', type: 'button', text: '完成', onclick: () => modal.close() }),
    ],
  });

  // 文件夹内重排（拖拽）
  attachFolderDnd(grid, groupId, paint);

  // 数据变化时同步刷新
  const unsubscribe = store.subscribe((scope) => {
    if (scope === 'shortcuts' || scope === 'all') {
      if (!modal.card.isConnected) {
        unsubscribe();
        return;
      }
      paint();
    }
  });
}

function attachFolderDnd(container, groupId, repaint) {
  container.addEventListener('dragstart', (event) => {
    const tile = event.target.closest('.tile[data-kind="shortcut"]');
    if (!tile) return;
    dragPayload = { kind: 'shortcut', id: tile.dataset.id, groupId };
    tile.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tile.dataset.id);
  });

  container.addEventListener('dragover', (event) => {
    if (!dragPayload) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.target.closest('.tile[data-kind="shortcut"]');
    if (target && target.dataset.id !== dragPayload.id) {
      markDropTarget(target, event, false);
    }
  });

  container.addEventListener('dragleave', (event) => {
    if (!container.contains(event.relatedTarget)) clearDropMarks(container);
  });

  container.addEventListener('drop', (event) => {
    if (!dragPayload) return;
    event.preventDefault();
    const target = event.target.closest('.tile[data-kind="shortcut"]');
    if (target && target.dataset.id !== dragPayload.id) {
      const position = dropPosition(target, event);
      const ids = store.groupItems(groupId).map((item) => item.id).filter((id) => id !== dragPayload.id);
      let index = ids.indexOf(target.dataset.id);
      if (index < 0) index = ids.length;
      if (position === 'after') index += 1;
      ids.splice(index, 0, dragPayload.id);
      store.applyOrder(ids);
      repaint();
    }
    dragPayload = null;
    clearDropMarks(container);
  });

  container.addEventListener('dragend', () => {
    dragPayload = null;
    clearDropMarks(container);
    document.querySelectorAll('.tile.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
  });
}

/* --------------------------------------------------------------- 拖拽 */

function dropPosition(target, event) {
  const rect = target.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

function markDropTarget(target, event, allowInto) {
  clearDropMarks(target.parentElement);
  if (allowInto) {
    target.classList.add('drop-into');
    return;
  }
  target.classList.add(dropPosition(target, event) === 'before' ? 'drop-before' : 'drop-after');
}

function clearDropMarks(root) {
  const scope = root || document;
  scope.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((node) => {
    node.classList.remove('drop-before', 'drop-after', 'drop-into');
  });
}

function attachGridEvents() {
  // 空白处右键：整个主内容区都算空白，而不只是网格内部——
  // 否则在页面右侧/下方留白处右键会掉回浏览器原生菜单，与提示不符。
  const canvas = document.getElementById('content') || gridEl;
  canvas.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.tile, .search-wrap, input, textarea, a, button')) return;
    event.preventDefault();
    openCanvasMenu(event);
  });

  gridEl.addEventListener('dragstart', (event) => {
    const tile = event.target.closest('.tile');
    if (!tile || tile.dataset.kind === 'add') {
      event.preventDefault();
      return;
    }
    dragPayload = { kind: tile.dataset.kind, id: tile.dataset.id };
    tile.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tile.dataset.id);
    gridEl.classList.add('is-dragover');
  });

  gridEl.addEventListener('dragover', (event) => {
    if (!dragPayload) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const target = event.target.closest('.tile');
    if (!target || target.dataset.kind === 'add') {
      clearDropMarks(gridEl);
      return;
    }
    if (target.dataset.id === dragPayload.id) {
      clearDropMarks(gridEl);
      return;
    }

    if (dragPayload.kind === 'shortcut' && target.dataset.kind === 'group') {
      markDropTarget(target, event, true);
      return;
    }
    markDropTarget(target, event, false);
  });

  gridEl.addEventListener('dragleave', (event) => {
    if (!gridEl.contains(event.relatedTarget)) clearDropMarks(gridEl);
  });

  gridEl.addEventListener('drop', (event) => {
    if (!dragPayload) return;
    event.preventDefault();

    const target = event.target.closest('.tile');
    if (target && target.dataset.kind !== 'add' && target.dataset.id !== dragPayload.id) {
      // 拖进文件夹
      if (dragPayload.kind === 'shortcut' && target.dataset.kind === 'group') {
        store.moveShortcutToGroup(dragPayload.id, target.dataset.id);
      } else if (target.dataset.kind === 'shortcut' || target.dataset.kind === 'group') {
        const position = dropPosition(target, event);

        // 从文件夹里拖回主面板
        if (dragPayload.kind === 'shortcut') {
          const item = store.state.shortcuts.find((s) => s.id === dragPayload.id);
          if (item && item.groupId) {
            item.groupId = null;
            store.commit('shortcuts');
          }
        }

        const ordered = store.rootItems().map((entry) => entry.id).filter((id) => id !== dragPayload.id);
        let index = ordered.indexOf(target.dataset.id);
        if (index < 0) index = ordered.length;
        if (position === 'after') index += 1;
        ordered.splice(index, 0, dragPayload.id);
        store.applyOrder(ordered);
      }
    }

    dragPayload = null;
    gridEl.classList.remove('is-dragover');
    clearDropMarks(gridEl);
    document.querySelectorAll('.tile.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
  });

  gridEl.addEventListener('dragend', () => {
    dragPayload = null;
    gridEl.classList.remove('is-dragover');
    clearDropMarks(gridEl);
    document.querySelectorAll('.tile.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
  });

  // 方向键在磁贴之间移动焦点
  gridEl.addEventListener('keydown', (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(event.key)) return;
    const tiles = Array.from(gridEl.querySelectorAll('.tile'));
    const current = document.activeElement;
    const index = tiles.indexOf(current);
    if (index < 0) return;
    event.preventDefault();

    const columns = store.state.config.layout.columns;
    let next = index;
    if (event.key === 'ArrowLeft') next = index - 1;
    if (event.key === 'ArrowRight') next = index + 1;
    if (event.key === 'ArrowUp') next = index - columns;
    if (event.key === 'ArrowDown') next = index + columns;

    if (next >= 0 && next < tiles.length) tiles[next].focus();
  });
}

export { openCanvasMenu };

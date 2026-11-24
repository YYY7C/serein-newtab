/* Serein · 快捷方式网格
 *
 * 承载体：主网格（快捷方式 + 文件夹混合排序）、文件夹面板、拖拽排序、右键菜单。
 * 排序策略：所有条目共享一个 order 数值空间（间隔 10），排序后重新编号，
 * 因此「快捷方式」和「文件夹」可以任意交错。
 */

import { h, clear, $, svgIcon, bus, hostOf, isUsableUrl } from './util.js';
import * as store from './store.js';
import { resolveIcon, isFaviconPlaceholder, isKnownPlaceholder } from './icons.js';
import { files, trackObjectUrl } from './storage.js';
import { openMenu } from './menu.js';
import { t } from './i18n.js';

/* 编辑弹窗按需加载：首屏只有网格，不需要这 20 KB */
let modalsPromise = null;
const modals = () => (modalsPromise ||= import('./modals.js'));

let gridEl = null;
let firstRender = true;
let gridSignature = '';
let gridIconStyle = '';
let dragPayload = null;
let activeFolderId = null;
const fileIconCache = new Map();
// 大批量导入时不要排一条几十秒的入场队列：前 24 个错峰，其余紧随其后
const ENTER_STAGGER_LIMIT = 24;
const staggerDelay = (index) => Math.min(index, ENTER_STAGGER_LIMIT);

/* --------------------------------------------------------------- 图标 */

function fileIconUrl(fileId) {
  // 缓存 Promise 而不是最终 URL：主网格的文件夹缩略和文件夹弹窗可能同时请求同一张图
  if (fileIconCache.has(fileId)) return fileIconCache.get(fileId);
  const promise = (async () => {
    try {
      const blob = await files.get(`icon:${fileId}`);
      if (!(blob instanceof Blob)) return null;
      return trackObjectUrl(URL.createObjectURL(blob));
    } catch {
      return null;
    }
  })();
  fileIconCache.set(fileId, promise);
  promise.then((url) => {
    if (!url && fileIconCache.get(fileId) === promise) fileIconCache.delete(fileId);
  });
  return promise;
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
    // 最多 4 个字：按长度收缩，避免「TEST」这种自定义文字被方形图标裁掉
    const length = Math.max(1, Array.from(descriptor.text || '').length);
    mono.style.setProperty('--mono-scale', String(Math.min(0.43, 0.9 / length)));
    if (descriptor.fg) mono.style.color = descriptor.fg;
  }
  return mono;
}

/**
 * @param {object} item 快捷方式
 */
function buildIcon(item) {
  const descriptor = resolveIcon(item, { iconStyle: iconStyle() });
  const box = h('div', { class: 'tile-icon', 'aria-hidden': 'true' });

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
      onDrop: () => {
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

function attachImage(box, src, { cover = false, onError = null, onDrop = null } = {}) {
  // 已经确认是通用占位图：直接跳过，字符徽标原地留着
  if (isKnownPlaceholder(src)) {
    onDrop?.();
    return;
  }
  const img = h('img', {
    class: `tile-img${cover ? ' is-cover' : ''}`,
    src,
    alt: '',
    loading: 'lazy',
    decoding: 'async',
    draggable: 'false',
  });
  const reveal = () => {
    isFaviconPlaceholder(img).then((placeholder) => {
      if (placeholder) {
        // `_favicon` 的灰地球占位图等于「没有图标」：移除图片，露出兜底字符
        img.remove();
        onDrop?.();
        return;
      }
      img.classList.add('is-loaded');
      // 图标加载成功后清掉兜底字符，但保留品牌色渐变底：
      // 透明底的站点图标会露出这层颜色，而不是变成一块空白。
      const mono = box.querySelector('.tile-mono');
      if (mono) mono.textContent = '';
    });
  };
  img.addEventListener('load', reveal, { once: true });
  img.addEventListener(
    'error',
    () => {
      img.remove();
      onError?.();
    },
    { once: true }
  );
  box.appendChild(img);
  if (img.complete && img.naturalWidth > 0) reveal();
}

/** 文件夹磁贴内部的 2×2 缩略 */
function buildFolderMini(groupId) {
  const items = store.groupItems(groupId).slice(0, 4);
  const mini = h('div', { class: 'folder-mini', 'aria-hidden': 'true' });
  for (let index = 0; index < 4; index += 1) {
    const item = items[index];
    if (!item) {
      mini.appendChild(h('span', { class: 'empty' }));
      continue;
    }
    mini.appendChild(buildMiniIcon(item));
  }
  return mini;
}

/**
 * 2×2 缩略里的单个图标。
 * 不能给这里的图片加 `loading="lazy"`：图片挂进 DOM 前是游离节点，
 * 懒加载永远不会开始，文件夹里的品牌图标就会一直空白。
 */
function buildMiniIcon(item) {
  const descriptor = resolveIcon(item, { iconStyle: iconStyle() });
  const cell = h('span', { class: descriptor.brand ? 'is-brand' : '' });
  // 2×2 的一格只有二十几像素，最多显示两个字；更长的自定义文字留给主磁贴。
  // 表情已经是一个 grapheme，不能再按 UTF-16 切片。
  const miniText = descriptor.emoji
    ? descriptor.text
    : Array.from(descriptor.text || '').slice(0, 2).join('');
  // 即使品牌图还在加载，也先铺好兜底色：noir 的 2×2 背景依赖 --c1，
  // 未定义时 color-mix() 会整条声明失效。
  cell.style.setProperty('--c1', descriptor.from);
  cell.style.setProperty('--c2', descriptor.to);
  if (descriptor.fg) cell.style.color = descriptor.fg;

  const showFallback = () => {
    cell.classList.remove('is-brand');
    cell.textContent = miniText;
  };

  if (descriptor.emoji) {
    cell.textContent = miniText;
    cell.style.background = 'var(--glass-bg)';
    return cell;
  }

  if (!descriptor.brand) {
    cell.textContent = miniText;
  }

  const attach = (src, { cover = false, isBrand = descriptor.brand } = {}) => {
    if (!src || isKnownPlaceholder(src)) return;
    const img = h('img', {
      class: cover ? 'is-cover' : '',
      src,
      alt: '',
      // 图片先挂进 DOM 再懒加载：游离的 lazy 图片永远不会开始请求。
      // 这样屏幕外的文件夹磁贴不会各自抢跑 4 个图片请求。
      loading: 'lazy',
      decoding: 'async',
      draggable: 'false',
    });
    const reveal = () => {
      isFaviconPlaceholder(img).then((placeholder) => {
        if (placeholder) {
          img.remove();
          if (isBrand) showFallback();
          return;
        }
        // 图片可能在 cell 挂进 DOM 之前就完成（缓存命中）；这里不要用 isConnected 拦截，
        // 否则迟到的 load 已经不会再触发，兜底文字会一直压在透明图标下面。
        if (!isBrand) {
          Array.from(cell.childNodes).forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) child.remove();
          });
        }
      });
    };
    img.addEventListener('load', reveal, { once: true });
    img.addEventListener(
      'error',
      () => {
        img.remove();
        if (isBrand) showFallback();
      },
      { once: true }
    );
    cell.appendChild(img);
    if (img.complete && img.naturalWidth > 0) reveal();
  };

  if (descriptor.pendingFileId) {
    fileIconUrl(descriptor.pendingFileId).then((url) => {
      if (!url || !cell.isConnected) return;
      attach(url, { cover: true, isBrand: false });
    });
  } else if (descriptor.src) {
    attach(descriptor.src, { cover: descriptor.brand });
  }

  return cell;
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
    style: { '--i': String(staggerDelay(index)) },
  });

  tile.appendChild(buildIcon(item));
  tile.appendChild(h('div', { class: 'tile-label', text: item.title }));

  tile.addEventListener('click', (event) => {
    // 个别浏览器/辅助技术会补发 button=1/2 的 click；中键已由 auxclick 处理
    if (event.defaultPrevented || event.button !== 0) return;
    // Ctrl/Cmd 在浏览器里是「后台新标签页」，Shift 是「前台新标签页」
    if (event.ctrlKey || event.metaKey) {
      openInBackgroundTab(item.url);
      return;
    }
    if (event.shiftKey) {
      openInNewTab(item.url);
      return;
    }
    openShortcut(item.url);
  });

  tile.addEventListener('auxclick', (event) => {
    if (event.button === 1) {
      event.preventDefault();
      openInBackgroundTab(item.url);
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
  const tile = h('div', {
    class: 'tile',
    'data-kind': 'group',
    'data-id': group.id,
    'data-host': '',
    draggable: 'true',
    tabindex: '0',
    role: 'button',
    title: group.title,
    style: { '--i': String(staggerDelay(index)) },
  });

  const icon = h('div', { class: 'tile-icon', 'aria-hidden': 'true' });
  icon.appendChild(buildFolderMini(group.id));

  tile.appendChild(icon);
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
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteFolder(group);
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
    title: t('添加内容'),
    style: { '--i': String(staggerDelay(index)) },
  });
  tile.appendChild(h('div', { class: 'tile-icon', 'aria-hidden': 'true', html: svgIcon('plus', 24) }));
  tile.appendChild(h('div', { class: 'tile-label', text: t('添加') }));

  tile.addEventListener('click', () => {
    const rect = tile.getBoundingClientRect();
    openMenu(
      [
        { label: t('添加快捷方式'), icon: 'plus', onClick: () => addShortcut() },
        { label: t('新建文件夹'), icon: 'folder-plus', onClick: () => createFolder() },
        { type: 'sep' },
        { label: t('从书签导入'), icon: 'bookmark', onClick: () => bus.emit('openSettings', { tab: 'shortcuts' }) },
        { label: t('更换壁纸'), icon: 'image', onClick: () => bus.emit('openSettings', { tab: 'wallpaper' }) },
        { label: t('打开设置'), icon: 'settings', shortcut: 'Ctrl+,', onClick: () => bus.emit('openSettings', {}) },
      ],
      { x: rect.left, y: rect.bottom + 8 }
    );
  });

  tile.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    tile.focus({ preventScroll: true });
    openCanvasMenu(event);
  });

  return tile;
}

/* --------------------------------------------------------------- 渲染 */

export function initTiles() {
  gridEl = $('#grid');
  gridIconStyle = store.state.config.layout.iconStyle || 'brand';
  attachGridEvents();
  renderGrid();
  store.subscribe((scope) => {
    if (scope === 'shortcuts' || scope === 'groups' || scope === 'all') {
      gridIconStyle = store.state.config.layout.iconStyle || 'brand';
      renderGrid();
    } else if (scope === 'config') {
      // 滑块/壁纸等高频 config 变更与网格无关，先比一个廉价字段再决定是否重建
      const nextIconStyle = store.state.config.layout.iconStyle || 'brand';
      if (nextIconStyle === gridIconStyle) return;
      gridIconStyle = nextIconStyle;
      renderGrid();
    }
  });
}

/** 语言切换后强制重建网格（「添加」磁贴与空状态文案） */
export function refreshTilesLocale() {
  if (!gridEl) return;
  gridSignature = '';
  renderGrid();
}

export function renderGrid() {
  if (!gridEl) return;

  const items = store.rootItems();
  // 只有「影响磁贴外观」的数据变化才重绘。
  // 拖动设置里的滑块会高频 commit('config')，这里挡掉绝大多数无意义的重建。
  const signature = [
    store.state.config.layout.iconStyle || 'brand',
    items.map((entry) => `${entry.kind}:${entry.id}:${entry.order}`).join(','),
    store.state.shortcuts
      .map(
        (s) =>
          `${s.id}:${s.groupId || ''}:${s.order}:${s.title}:${s.url}:${s.iconType || 'auto'}:${s.iconValue || ''}`
      )
      .join(','),
    store.state.groups.map((g) => `${g.id}:${g.title}`).join(','),
  ].join('|');
  if (signature === gridSignature && gridEl.childElementCount) return;
  gridSignature = signature;

  const activeTile = gridEl.contains(document.activeElement) ? document.activeElement : null;
  const activeKind = activeTile?.dataset.kind;
  const activeId = activeTile?.dataset.id;
  clear(gridEl);
  // 一次性插入：逐个 append 会触发 N 次布局，网格越大越明显
  const fragment = document.createDocumentFragment();

  if (!items.length) {
    gridEl.appendChild(
      h(
        'div',
        { class: 'grid-empty' },
        h('div', { class: 'grid-empty-title', text: t('从一个图标开始') }),
        h('div', {
          class: 'grid-empty-text',
          text: t('点下面的「+」添加第一个网站；右键空白处也能新建文件夹或更换壁纸。'),
        })
      )
    );
  }

  items.forEach((entry, index) => {
    fragment.appendChild(
      entry.kind === 'group' ? buildFolderTile(entry.item, index) : buildShortcutTile(entry.item, index)
    );
  });

  fragment.appendChild(buildAddTile(items.length));
  gridEl.appendChild(fragment);

  if (activeKind === 'add') {
    gridEl.querySelector('.tile--add')?.focus({ preventScroll: true });
  } else if (activeId && activeKind) {
    const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(activeId) : activeId.replace(/"/g, '\\"');
    gridEl.querySelector(`[data-kind="${activeKind}"][data-id="${escapedId}"]`)?.focus({ preventScroll: true });
  }

  if (firstRender) {
    gridEl.classList.add('grid--enter');
    firstRender = false;
    setTimeout(
      () => gridEl.classList.remove('grid--enter'),
      (Math.min(items.length, ENTER_STAGGER_LIMIT) + 1) * 26 + 700
    );
  }
}

/* --------------------------------------------------------------- 打开 */

function focusGridTile(kind, id) {
  if (!gridEl || !id) return;
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : String(id).replace(/"/g, '\\"');
  gridEl.querySelector(`[data-kind="${kind}"][data-id="${escaped}"]`)?.focus({ preventScroll: true });
}

function focusShortcutTile(item, id = item?.id) {
  const scope = document.querySelector('.modal.is-open .folder-grid') || gridEl;
  const escaped =
    id && typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : String(id || '').replace(/"/g, '\\"');
  const exact = id ? scope?.querySelector(`[data-kind="shortcut"][data-id="${escaped}"]`) : null;
  (exact || scope?.querySelector('.tile:not(.tile--add)') || scope?.querySelector('.tile--add'))?.focus?.({
    preventScroll: true,
  });
}

function focusFirstGridTile() {
  (gridEl?.querySelector('.tile') || gridEl?.querySelector('.tile--add'))?.focus({ preventScroll: true });
}

function openInNewTab(url) {
  if (!url || !isUsableUrl(url)) return;
  // 注意：带 noopener 特性时 window.open 会返回 null，不能用返回值判断是否被拦截，
  // 否则会在新标签页已经打开的情况下又把当前页导航走。
  const opened = window.open(url, '_blank');
  if (opened) {
    try {
      opened.opener = null;
    } catch {
      /* 跨域窗口不允许写 opener 时忽略 */
    }
  } else {
    location.href = url;
  }
}

function openInBackgroundTab(url) {
  if (!url || !isUsableUrl(url)) return;
  try {
    if (globalThis.chrome?.tabs?.create) {
      chrome.tabs.create({ url, active: false }, () => {
        // 个别 URL（如 chrome://）会被拒绝；此时再回退到普通新标签页
        if (globalThis.chrome?.runtime?.lastError) openInNewTab(url);
      });
      return;
    }
  } catch {
    /* 非扩展环境忽略，走下面的回退 */
  }
  openInNewTab(url);
}

function openShortcut(url) {
  if (!url || !isUsableUrl(url)) return;
  const inNewTab = store.state.config.behavior.shortcutsInNewTab !== false;
  if (inNewTab) {
    openInNewTab(url);
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
  const item = store.addShortcut(result);
  if (item) focusShortcutTile(item);
}

async function editShortcut(item) {
  const { shortcutEditor } = await modals();
  const result = await shortcutEditor({
    shortcut: item,
    groups: store.state.groups,
  });
  if (!result) return;
  const updated = store.updateShortcut(item.id, result);
  if (updated) focusShortcutTile(updated);
}

async function deleteShortcut(item) {
  if (store.state.config.behavior.confirmDelete) {
    const { confirmDialog } = await modals();
    const ok = await confirmDialog({
      title: t('删除快捷方式'),
      message: t('确定要删除「{title}」吗？删除后 6 秒内可以撤销。', { title: item.title }),
      confirmText: t('删除'),
      danger: true,
    });
    if (!ok) return;
  }
  const snapshot = { ...(store.state.shortcuts.find((entry) => entry.id === item.id) || item) };
  if (!store.removeShortcut(item.id)) return;
  focusShortcutTile(item);
  bus.emit('toast', {
    text: t('已删除「{title}」', { title: item.title }),
    action: {
      label: t('撤销'),
      onClick: () => {
        store.restoreShortcut(snapshot);
        focusShortcutTile(snapshot);
      },
    },
  });
}

export async function createFolder(itemId = null) {
  const { promptDialog } = await modals();
  const title = await promptDialog({
    title: t('新建文件夹'),
    label: t('文件夹名称'),
    value: t('新建文件夹'),
    confirmText: t('创建'),
  });
  if (!title) return;
  const group = store.addGroup(title);
  if (itemId) store.moveShortcutToGroup(itemId, group.id);
  if (document.querySelector('.modal.is-open .folder-grid')) focusShortcutTile({});
  else focusGridTile('group', group.id);
  bus.emit('toast', { text: t('已创建「{title}」', { title: group.title }) });
}

async function renameFolder(group) {
  const { promptDialog } = await modals();
  const title = await promptDialog({
    title: t('重命名文件夹'),
    label: t('文件夹名称'),
    value: group.title,
    confirmText: t('保存'),
  });
  if (!title) return;
  store.renameGroup(group.id, title);
  focusGridTile('group', group.id);
}

async function deleteFolder(group) {
  const { confirmDialog } = await modals();
  const initialItems = store.groupItems(group.id);
  const ok = await confirmDialog({
    title: t('删除文件夹'),
    message: t('「{title}」及其中的 {n} 个图标都会被删除，删除后 6 秒内可以撤销。', {
      title: group.title,
      n: initialItems.length,
    }),
    confirmText: t('删除'),
    danger: true,
  });
  if (!ok) return;
  // 确认框打开期间可能有别的撤销/导入改动，真正删除前再取一次最新快照
  const items = store.groupItems(group.id).map((item) => ({ ...item }));
  const snapshot = { ...group };
  store.removeGroup(group.id, { keepItems: false });
  focusFirstGridTile();
  bus.emit('toast', {
    text: t('已删除「{title}」', { title: group.title }),
    action: {
      label: t('撤销'),
      onClick: () => {
        store.restoreGroup(snapshot, items);
        focusGridTile('group', snapshot.id);
      },
    },
  });
}

/* --------------------------------------------------------------- 菜单 */

function openShortcutMenu(item, event) {
  // 右键不一定会移动焦点：先聚焦触发磁贴，菜单关闭时才能把焦点还回来。
  event.currentTarget.focus?.({ preventScroll: true });
  // 菜单项稍后才执行，届时 event.currentTarget 已经为 null；
  // 在这里把锚点位置取出来，供「移动到文件夹」子菜单定位。
  const anchorRect = event.currentTarget.getBoundingClientRect();
  const groups = store.state.groups;
  const moveItems = groups
    .filter((group) => group.id !== item.groupId)
    .map((group) => ({
      label: group.title,
      icon: 'folder',
      onClick: () => {
        store.moveShortcutToGroup(item.id, group.id);
        if (document.querySelector('.modal.is-open .folder-grid')) focusShortcutTile(item);
        else focusGridTile('group', group.id);
        bus.emit('toast', { text: t('已移动到「{title}」', { title: group.title }) });
      },
    }));

  const entries = [
    { label: t('打开'), icon: 'external', onClick: () => openShortcut(item.url) },
    { type: 'sep' },
    { label: t('编辑…'), icon: 'edit', shortcut: 'F2', onClick: () => editShortcut(item) },
  ];

  if (item.groupId) {
    entries.push({
      label: t('移出文件夹'),
      icon: 'arrowLeft',
      onClick: () => {
        store.moveShortcutToGroup(item.id, null);
        focusShortcutTile(item);
      },
    });
  }

  if (moveItems.length) {
    entries.push({
      label: t('移动到文件夹'),
      icon: 'folder',
      onClick: () => {
        openMenu([{ type: 'label', label: t('移动到') }, ...moveItems], {
          x: Math.min(anchorRect.right + 6, window.innerWidth - 230),
          y: anchorRect.top,
        });
      },
    });
  }

  entries.push({ label: t('新建文件夹并移入'), icon: 'folder-plus', onClick: () => createFolder(item.id) });
  entries.push({ type: 'sep' });
  entries.push({ label: t('删除'), icon: 'trash', danger: true, onClick: () => deleteShortcut(item) });

  openMenu(entries, { x: event.clientX, y: event.clientY });
}

function openFolderMenu(group, event) {
  event.currentTarget.focus?.({ preventScroll: true });
  openMenu(
    [
      { label: t('打开文件夹'), icon: 'folder', onClick: () => openFolder(group.id) },
      { label: t('重命名…'), icon: 'edit', onClick: () => renameFolder(group) },
      { type: 'sep' },
      {
        label: t('解散（图标移出）'),
        icon: 'folder',
        onClick: () => {
          const snapshot = { ...group };
          const nested = store.groupItems(group.id).map((item) => ({ ...item }));
          store.removeGroup(group.id, { keepItems: true });
          focusFirstGridTile();
          bus.emit('toast', {
            text: t('文件夹已解散，图标已移回主面板'),
            action: {
              label: t('撤销'),
              onClick: () => {
                store.restoreGroup(snapshot, nested, { reassign: true });
                focusGridTile('group', snapshot.id);
              },
            },
          });
        },
      },
      {
        label: t('删除文件夹及其内容'),
        icon: 'trash',
        danger: true,
        onClick: () => deleteFolder(group),
      },
    ],
    { x: event.clientX, y: event.clientY }
  );
}

function openCanvasMenu(event) {
  openMenu(
    [
      { label: t('添加快捷方式'), icon: 'plus', onClick: () => addShortcut() },
      { label: t('新建文件夹'), icon: 'folder-plus', onClick: () => createFolder() },
      { type: 'sep' },
      { label: t('更换壁纸'), icon: 'image', onClick: () => bus.emit('openSettings', { tab: 'wallpaper' }) },
      { label: t('调整布局'), icon: 'grid', onClick: () => bus.emit('openSettings', { tab: 'layout' }) },
      { label: t('设置'), icon: 'settings', shortcut: 'Ctrl+,', onClick: () => bus.emit('openSettings', {}) },
    ],
    { x: event.clientX, y: event.clientY }
  );
}

/* --------------------------------------------------------------- 文件夹 */

async function openFolder(groupId) {
  const group = store.state.groups.find((g) => g.id === groupId);
  if (!group || activeFolderId) return;
  // 双击文件夹会触发两次 click；在弹窗关闭前只允许一个文件夹场景
  activeFolderId = groupId;

  let modalApi;
  try {
    modalApi = await modals();
  } catch (err) {
    activeFolderId = null;
    throw err;
  }
  if (!store.state.groups.some((g) => g.id === groupId)) {
    activeFolderId = null;
    return;
  }
  const { openModal, shortcutEditor, promptDialog } = modalApi;
  const grid = h('div', { class: 'folder-grid' });
  let modal = null;
  let unsubscribe = null;

  const paint = () => {
    const active = grid.contains(document.activeElement) ? document.activeElement : null;
    const activeKind = active?.dataset.kind;
    const activeId = active?.dataset.id;
    clear(grid);
    const items = store.groupItems(groupId);
    items.forEach((item, index) => grid.appendChild(buildShortcutTile(item, index)));
    const addTile = h('button', {
      class: 'tile tile--add',
      type: 'button',
      'data-kind': 'add',
      title: t('添加到文件夹'),
      onclick: async () => {
        const result = await shortcutEditor({ groups: store.state.groups, defaultGroupId: groupId });
        // 编辑器默认就带上 defaultGroupId，addShortcut 会直接放进当前文件夹
        if (result) {
          const added = store.addShortcut(result);
          if (added) focusShortcutTile(added);
        }
      },
    });
    addTile.appendChild(h('div', { class: 'tile-icon', html: svgIcon('plus', 22) }));
    addTile.appendChild(h('div', { class: 'tile-label', text: t('添加') }));
    grid.appendChild(addTile);
    if (activeKind === 'add') {
      addTile.focus({ preventScroll: true });
    } else if (activeKind === 'shortcut' && activeId) {
      const escaped =
        typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(activeId) : String(activeId).replace(/"/g, '\\"');
      const target =
        grid.querySelector(`[data-kind="shortcut"][data-id="${escaped}"]`) ||
        grid.querySelector('.tile') ||
        addTile;
      target.focus({ preventScroll: true });
    }
  };

  paint();

  modal = openModal({
    title: group.title,
    wide: true,
    body: grid,
    restoreFocus: () => {
      // 文件夹里的编辑/删除会重建主网格，原来的磁贴节点已经失效；
      // 关闭时按 groupId 找当前节点，找不到就退回第一个磁贴/添加按钮。
      const escaped =
        typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(groupId) : String(groupId).replace(/"/g, '\\"');
      return (
        gridEl?.querySelector(`[data-kind="group"][data-id="${escaped}"]`) ||
        gridEl?.querySelector('.tile') ||
        gridEl?.querySelector('.tile--add') ||
        null
      );
    },
    onClose: () => {
      activeFolderId = null;
      unsubscribe?.();
      unsubscribe = null;
      // 拖拽途中用 Esc 关掉文件夹时，别把 dragPayload 留在全局污染下一次拖拽
      dragPayload = null;
      document.body.classList.remove('is-folder-dragging');
      clearDropMarks(document);
      document.querySelectorAll('.tile.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
    },
    footer: [
      h('button', {
        class: 'btn is-ghost',
        type: 'button',
        text: t('重命名'),
        style: { marginRight: 'auto' },
        onclick: async () => {
          const title = await promptDialog({
            title: t('重命名文件夹'),
            label: t('文件夹名称'),
            value: group.title,
            confirmText: t('保存'),
          });
          if (!title) return;
          store.renameGroup(groupId, title);
          const finalTitle = store.state.groups.find((g) => g.id === groupId)?.title || t('文件夹');
          const heading = modal.card.querySelector('.modal-title');
          if (heading) heading.textContent = finalTitle;
          modal.card.setAttribute('aria-label', finalTitle);
        },
      }),
      h('button', { class: 'btn is-primary', type: 'button', text: t('完成'), onclick: () => modal.close() }),
    ],
  });

  // 文件夹内重排（拖拽）
  attachFolderDnd(grid, groupId);
  grid.addEventListener('keydown', (event) => moveTileFocus(grid, event));
  // 打开文件夹后默认落在第一个条目上，键盘用户不用先绕过标题栏和底部按钮
  setTimeout(() => {
    if (!modal.card.isConnected || !modal.card.closest('.modal.is-open') || grid.contains(document.activeElement)) return;
    if (document.activeElement === modal.card.querySelector('.btn.is-primary')) {
      (grid.querySelector('.tile') || grid.querySelector('.tile--add'))?.focus({ preventScroll: true });
    }
  }, 110);

  // 数据变化时同步刷新
  unsubscribe = store.subscribe((scope) => {
    if (scope === 'shortcuts' || scope === 'all') {
      if (!modal.card.isConnected) {
        unsubscribe?.();
        unsubscribe = null;
        return;
      }
      paint();
    }
  });
}

function hasOpenOverlay() {
  return Boolean(document.querySelector('.modal.is-open') || document.querySelector('.settings.is-open'));
}

function setStageInert(inert) {
  const stage = document.querySelector('.stage');
  if (stage) stage.inert = inert;
}

function attachFolderDnd(container, groupId) {
  container.addEventListener('dragstart', (event) => {
    const tile = event.target.closest('.tile[data-kind="shortcut"]');
    if (!tile) return;
    document.body.classList.add('is-folder-dragging');
    setStageInert(false);
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
    const target = event.target.closest('.tile');
    const ids = store.groupItems(groupId).map((item) => item.id).filter((id) => id !== dragPayload.id);
    if (target?.dataset.kind === 'add') {
      ids.push(dragPayload.id);
      store.applyOrder(ids);
    } else if (target?.dataset.kind === 'shortcut' && target.dataset.id !== dragPayload.id) {
      const position = dropPosition(target, event);
      let index = ids.indexOf(target.dataset.id);
      if (index < 0) index = ids.length;
      if (position === 'after') index += 1;
      ids.splice(index, 0, dragPayload.id);
      store.applyOrder(ids);
    }
    dragPayload = null;
    document.body.classList.remove('is-folder-dragging');
    setStageInert(hasOpenOverlay());
    clearDropMarks(container);
  });

  container.addEventListener('dragend', () => {
    dragPayload = null;
    document.body.classList.remove('is-folder-dragging');
    setStageInert(hasOpenOverlay());
    clearDropMarks(container);
    document.querySelectorAll('.tile.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
  });
}

/* --------------------------------------------------------------- 拖拽 */

function dropPosition(target, event) {
  const rect = target.getBoundingClientRect();
  // 文字列表风格里每一行都是全宽横条，按上下半区判断才符合直觉。
  // 不用 getComputedStyle：dragover 触发频率很高，避免反复强制样式计算。
  const isListRow =
    target.parentElement?.classList.contains('grid') &&
    ['editorial', 'terminal'].includes(document.documentElement.dataset.style);
  if (isListRow) {
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  }
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

// 只记住当前高亮的节点：dragover 每秒触发几十次，不能每次都扫描整个网格。
let dropMarkNode = null;

function markDropTarget(target, event, allowInto) {
  if (dropMarkNode && dropMarkNode !== target) {
    dropMarkNode.classList.remove('drop-before', 'drop-after', 'drop-into');
  }
  dropMarkNode = target;
  const position = allowInto ? '' : dropPosition(target, event);
  target.classList.toggle('drop-into', allowInto);
  target.classList.toggle('drop-before', position === 'before');
  target.classList.toggle('drop-after', position === 'after');
}

function clearDropMarks(root) {
  if (dropMarkNode && (!root || root === document || root.contains(dropMarkNode))) {
    dropMarkNode.classList.remove('drop-before', 'drop-after', 'drop-into');
    dropMarkNode = null;
  }
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
      // 从文件夹拖出来时落在「原来的文件夹」上等于取消，不该把它移到末尾
      if (target.dataset.id === dragPayload.groupId) {
        clearDropMarks(gridEl);
        return;
      }
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
    if (!target) {
      // 从文件夹拖到网格空白处 = 移出文件夹
      if (dragPayload.kind === 'shortcut') {
        const item = store.state.shortcuts.find((s) => s.id === dragPayload.id);
        if (item?.groupId) store.moveShortcutToGroup(item.id, null);
      }
    } else if (target.dataset.kind === 'add') {
      // 拖到末尾的「+」= 放到列表最后（而不是无反应）
      if (dragPayload.kind === 'shortcut') {
        const item = store.state.shortcuts.find((s) => s.id === dragPayload.id);
        if (item?.groupId) item.groupId = null;
      }
      const ordered = store
        .rootItems()
        .map((entry) => entry.id)
        .filter((id) => id !== dragPayload.id);
      ordered.push(dragPayload.id);
      store.applyOrder(ordered);
    } else if (target.dataset.id !== dragPayload.id) {
      // 拖进文件夹
      if (dragPayload.kind === 'shortcut' && target.dataset.kind === 'group') {
        if (target.dataset.id !== dragPayload.groupId) {
          store.moveShortcutToGroup(dragPayload.id, target.dataset.id);
        }
      } else if (target.dataset.kind === 'shortcut' || target.dataset.kind === 'group') {
        const position = dropPosition(target, event);

        // 从文件夹里拖回主面板：先改 groupId，下面的 applyOrder 会一次性提交，
        // 避免中途重绘把拖动源和目标节点替换掉。
        if (dragPayload.kind === 'shortcut') {
          const item = store.state.shortcuts.find((s) => s.id === dragPayload.id);
          if (item && item.groupId) item.groupId = null;
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
    document.body.classList.remove('is-folder-dragging');
    setStageInert(hasOpenOverlay());
    gridEl.classList.remove('is-dragover');
    clearDropMarks(gridEl);
    document.querySelectorAll('.tile.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
  });

  gridEl.addEventListener('dragend', () => {
    dragPayload = null;
    document.body.classList.remove('is-folder-dragging');
    setStageInert(hasOpenOverlay());
    gridEl.classList.remove('is-dragover');
    clearDropMarks(gridEl);
    document.querySelectorAll('.tile.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
  });

  // 网格两侧的 dock 留白也算「主面板」：从文件夹拖出来放在这里即移出
  const dock = gridEl.parentElement;
  if (dock) {
    dock.addEventListener('dragover', (event) => {
      if (!dragPayload || event.target.closest('#grid')) return;
      event.preventDefault();
      clearDropMarks(gridEl);
      gridEl.classList.remove('is-dragover');
    });
    dock.addEventListener('drop', (event) => {
      if (!dragPayload || event.target.closest('#grid')) return;
      event.preventDefault();
      if (dragPayload.kind === 'shortcut') {
        const item = store.state.shortcuts.find((s) => s.id === dragPayload.id);
        if (item?.groupId) store.moveShortcutToGroup(item.id, null);
      }
      dragPayload = null;
      document.body.classList.remove('is-folder-dragging');
      setStageInert(hasOpenOverlay());
      gridEl.classList.remove('is-dragover');
      clearDropMarks(gridEl);
      document.querySelectorAll('.tile.is-dragging').forEach((node) => node.classList.remove('is-dragging'));
    });
  }

  // 方向键在磁贴之间移动焦点
  gridEl.addEventListener('keydown', (event) => moveTileFocus(gridEl, event));
}

/** 主网格与文件夹网格共用：按当前实际列数做二维焦点移动 */
function moveTileFocus(container, event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  if (!keys.includes(event.key)) return;
  const tiles = Array.from(container.querySelectorAll('.tile'));
  const current = document.activeElement;
  const index = tiles.indexOf(current);
  if (index < 0) return;
  event.preventDefault();

  const columns = (() => {
    // 用首行的实际排列数，而不是配置列数：文字列表是单列，
    // 文件夹弹窗是 flex 换行，都跟 --grid-cols 无关。
    if (!tiles.length) return 1;
    const firstTop = tiles[0].offsetTop;
    return Math.max(1, tiles.filter((tile) => tile.offsetTop === firstTop).length);
  })();
  let next = index;
  if (event.key === 'ArrowLeft') next = index - 1;
  if (event.key === 'ArrowRight') next = index + 1;
  if (event.key === 'ArrowUp') next = index - columns;
  if (event.key === 'ArrowDown') next = index + columns;

  if (next >= 0 && next < tiles.length) tiles[next].focus();
}

export { openCanvasMenu };

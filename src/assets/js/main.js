/* Lumen · 启动入口
 *
 * 顺序刻意如此：先落主题变量与壁纸（首屏立刻有正确的底色与文字对比），
 * 再挂各功能模块，最后做一次持久化存储请求。
 */

import { $, h, clear, svgIcon, bus } from './util.js';
import * as store from './store.js';
import { applyConfig } from './theme.js';
import { initBackground, applyBackground, cycleBing } from './wallpaper.js';
import { initClock, refreshClock } from './clock.js';
import { initSearch } from './search.js';
import { initTiles } from './tiles.js';
import { initWidgets } from './widgets.js';
import { requestPersistentStorage } from './storage.js';

/* --------------------------------------------------------------- 提示条 */

const toastRoot = $('#toast-root');

function showToast({ text, error = false, action = null }) {
  if (!toastRoot || !text) return;
  const node = h(
    'div',
    { class: `toast${action ? ' has-action' : ''}` },
    h('span', { class: error ? 'dot-err' : 'dot-ok' }),
    h('span', { class: 'toast-text', text })
  );
  if (action) {
    node.appendChild(
      h('button', {
        class: 'toast-action',
        type: 'button',
        text: action.label || '撤销',
        onclick: () => {
          action.onClick?.();
          node.remove();
        },
      })
    );
  }
  toastRoot.appendChild(node);
  const life = action ? 6000 : 2200;
  setTimeout(() => {
    if (!node.isConnected) return;
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 260);
  }, life);

  while (toastRoot.children.length > 3) toastRoot.firstElementChild.remove();
}

bus.on('toast', showToast);

/* ------------------------------------------------------------- 设置面板
 * 设置面板 + 各类弹窗合计约 60 KB，首屏用不到，
 * 改成首次打开时才拉取，减少新标签页的启动解析量。
 */

let settingsModule = null;

async function openSettings(tab) {
  try {
    settingsModule ||= await import('./settings.js');
    settingsModule.open(tab);
  } catch (err) {
    console.error('[lumen] 设置面板加载失败', err);
    showToast({ text: '设置面板加载失败，请刷新页面', error: true });
  }
}

bus.on('openSettings', (payload) => openSettings(payload?.tab));
document.addEventListener('lumen:open-settings', () => openSettings());

/* --------------------------------------------------------------- 顶栏 */

let topbarSignature = '';

function renderTopbar() {
  const config = store.state.config;
  const right = $('#topbar-right');
  if (!right) return;
  // 拖设置里的滑块会高频 commit('config')：顶栏只跟这几个字段有关，别每次都重建 DOM
  const signature = `${config.background.type}|${config.sidebar}`;
  if (signature === topbarSignature) return;
  topbarSignature = signature;
  clear(right);

  if (config.background.type === 'bing') {
    right.appendChild(
      h('button', {
        class: 'icon-btn glass',
        type: 'button',
        title: '换一张壁纸',
        'aria-label': '换一张壁纸',
        html: svgIcon('image', 17),
        onclick: async () => {
          await cycleBing(store.state, 1);
          store.commit('config');
          showToast({ text: '已切换壁纸' });
        },
      })
    );
  }

  right.appendChild(
    h('button', {
      class: `icon-btn glass${config.sidebar === 'hidden' ? '' : ' is-active'}`,
      type: 'button',
      title: config.sidebar === 'hidden' ? '显示小组件' : '隐藏小组件',
      'aria-label': config.sidebar === 'hidden' ? '显示小组件' : '隐藏小组件',
      'aria-pressed': config.sidebar === 'hidden' ? 'false' : 'true',
      html: svgIcon('sidebar', 17),
      onclick: () => {
        if (config.sidebar === 'hidden') {
          config.sidebar = config.lastSidebar || 'right';
        } else {
          config.lastSidebar = config.sidebar;
          config.sidebar = 'hidden';
        }
        store.commit('config');
      },
    })
  );

  right.appendChild(
    h('button', {
      class: 'icon-btn glass',
      type: 'button',
      title: '设置 (Ctrl+,)',
      'aria-label': '打开设置',
      html: svgIcon('settings', 17),
      onclick: () => bus.emit('openSettings', {}),
    })
  );
}

/* --------------------------------------------------------------- 启动 */

function boot() {
  applyConfig(store.state);
  initBackground(store);

  initClock(store);
  initSearch();
  initTiles();
  initWidgets();

  renderTopbar();

  store.subscribe((scope) => {
    if (scope === 'config' || scope === 'all') {
      applyConfig(store.state);
      renderTopbar();
    }
  });

  // 壁纸相关字段变动时重绘背景（设置页里已经直接调用，这里兜住其他入口）
  document.addEventListener('lumen:reapply-wallpaper', () => applyBackground(store.state));

  requestPersistentStorage();

  // localStorage 被清空后，用 chrome.storage.local 的镜像把配置找回来
  store.restoreFromMirror().then((restored) => {
    if (!restored) return;
    refreshClock();
    showToast({ text: '检测到本地缓存被清理，已从镜像恢复你的配置' });
  });

  if (!sessionStorage.getItem('lumen:greeted')) {
    sessionStorage.setItem('lumen:greeted', '1');
    setTimeout(() => showToast({ text: '右键图标或空白处，随时编辑' }), 900);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

/* Serein · 启动入口
 *
 * 顺序刻意如此：先落主题变量与壁纸（首屏立刻有正确的底色与文字对比），
 * 再挂各功能模块，最后做一次持久化存储请求。
 */

import { $, h, clear, svgIcon, bus, debounce } from './util.js';
import * as store from './store.js';
import { t, resolveLocale, setLocale, onLocaleChange } from './i18n.js';
import { applyConfig, syncDensity } from './theme.js';
import { initBackground, applyBackground, applyBackgroundLook, cycleBing } from './wallpaper.js';
import { initClock, refreshClock } from './clock.js';
import { initSearch, refreshSearchLocale } from './search.js';
import { initTiles, refreshTilesLocale } from './tiles.js';
import { initWidgets, refreshWidgetsLocale } from './widgets.js';
import { requestPersistentStorage } from './storage.js';
import { applyCustomFont } from './custom-font.js';

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
        text: action.label || t('撤销'),
        onclick: () => {
          try {
            action.onClick?.();
          } finally {
            node.remove();
          }
        },
      })
    );
  }
  toastRoot.appendChild(node);
  const life = action ? 6000 : 2200;
  setTimeout(() => {
    if (!node.isConnected) return;
    node.inert = true;
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
    console.error('[serein] 设置面板加载失败', err);
    showToast({ text: t('设置面板加载失败，请刷新页面'), error: true });
  }
}

bus.on('openSettings', (payload) => openSettings(payload?.tab));
document.addEventListener('serein:open-settings', () => openSettings());

/* --------------------------------------------------------------- 顶栏 */

let topbarSignature = '';
let settingsButton = null;

function updateSettingsButtonLabels() {
  if (!settingsButton) return;
  settingsButton.title = t('设置 (Ctrl+,)');
  settingsButton.setAttribute('aria-label', t('打开设置'));
}

function getSettingsButton() {
  if (!settingsButton) {
    settingsButton = h('button', {
      class: 'icon-btn glass',
      type: 'button',
      'data-action': 'settings',
      html: svgIcon('settings', 17),
      onclick: () => bus.emit('openSettings', {}),
    });
    updateSettingsButtonLabels();
  }
  return settingsButton;
}

function renderTopbar(force = false) {
  const config = store.state.config;
  const widgets = config.widgets;
  const hasWidgets = Boolean(
    config.layout.showWeather ||
      widgets.todo ||
      widgets.notes ||
      widgets.bookmarks ||
      widgets.topSites ||
      widgets.pomodoro ||
      widgets.worldClock ||
      widgets.countdown
  );
  const right = $('#topbar-right');
  if (!right) return;
  // 拖设置里的滑块会高频 commit('config')：顶栏只跟这几个字段有关，别每次都重建 DOM
  const signature = `${config.background.type}|${config.sidebar}|${hasWidgets ? '1' : '0'}`;
  if (!force && signature === topbarSignature) return;
  topbarSignature = signature;
  const focusedAction = right.contains(document.activeElement) ? document.activeElement.dataset.action || null : null;
  clear(right);

  if (config.background.type === 'bing') {
    right.appendChild(
      h('button', {
        class: 'icon-btn glass',
        type: 'button',
        'data-action': 'bing',
        title: t('换一张壁纸'),
        'aria-label': t('换一张壁纸'),
        html: svgIcon('image', 17),
        onclick: async () => {
          await cycleBing(store.state, 1);
          store.commit('config');
          showToast({ text: t('已切换壁纸') });
        },
      })
    );
  }

  if (hasWidgets) {
    right.appendChild(
      h('button', {
        class: `icon-btn glass${config.sidebar === 'hidden' ? '' : ' is-active'}`,
        type: 'button',
        'data-action': 'sidebar',
        title: config.sidebar === 'hidden' ? t('显示小组件') : t('隐藏小组件'),
        'aria-label': t('小组件'),
        'aria-pressed': config.sidebar === 'hidden' ? 'false' : 'true',
        html: svgIcon('sidebar', 17),
        onclick: () => {
          // 直接读 store.state.config：导入/重置/镜像恢复会整体替换 config 对象，
          // 闭包里捕获的旧对象会导致按钮点了没反应。
          const current = store.state.config;
          if (current.sidebar === 'hidden') {
            current.sidebar = current.lastSidebar || 'right';
          } else {
            current.lastSidebar = current.sidebar;
            current.sidebar = 'hidden';
          }
          store.commit('config');
        },
      })
    );
  }

  // 顶栏其它按钮可能因壁纸/小组件变化重建，但设置按钮保持同一个节点：
  // 设置面板关闭时要能把焦点还给真正的触发按钮，而不是一个已被替换的旧节点。
  right.appendChild(getSettingsButton());

  if (focusedAction) {
    right.querySelector(`[data-action="${focusedAction}"]`)?.focus({ preventScroll: true });
  }
}

/* --------------------------------------------------------------- 启动 */

function applyStaticLabels() {
  document.querySelector('.dock')?.setAttribute('aria-label', t('快捷方式'));
  document.getElementById('sidebar')?.setAttribute('aria-label', t('小组件'));
}

function boot() {
  // 先落语言：后续所有模块创建 DOM 时拿到的就是正确的语言
  setLocale(resolveLocale(store.state.config.language));
  applyStaticLabels();
  applyConfig(store.state);
  applyCustomFont(store.state);
  initBackground(store);

  initClock(store);
  initSearch();
  initTiles();
  initWidgets();

  renderTopbar();
  syncDensity(store.state);

  let densityTimer = 0;
  const scheduleDensity = () => {
    clearTimeout(densityTimer);
    densityTimer = setTimeout(() => syncDensity(store.state), 180);
  };
  window.addEventListener('resize', debounce(scheduleDensity, 150));

  store.subscribe((scope) => {
    if (scope === 'storage-error') {
      showToast({ text: t('本地存储写入失败，请检查剩余空间'), error: true });
      return;
    }
    if (scope === 'config' || scope === 'all') {
      applyConfig(store.state);
      applyCustomFont(store.state);
      // 风格变化会改变遮罩强度与滤镜：无论从设置页、导入还是其它入口改 config，都同步一次
      applyBackgroundLook(store.state);
      renderTopbar();
    }
    // 网格/侧栏/天气变化都会改变内容高度：稳定后重新判断是否需要紧凑密度
    scheduleDensity();
  });

  // 采纳了其它标签页的状态：主题已由 emit('all') 落好，壁纸与时钟要单独补一次
  window.addEventListener('serein:state-adopted', () => {
    applyBackground(store.state);
    refreshClock();
    // 另一个标签页把语言改成了别的值
    setLocale(resolveLocale(store.state.config.language));
  });

  // 语言切换：就地重绘所有由脚本生成的文案，不刷新页面
  onLocaleChange(() => {
    applyStaticLabels();
    updateSettingsButtonLabels();
    renderTopbar(true);
    refreshClock();
    refreshSearchLocale();
    refreshTilesLocale();
    refreshWidgetsLocale();
    scheduleDensity();
  });

  // 壁纸相关字段变动时重绘背景（设置页里已经直接调用，这里兜住其他入口）
  requestPersistentStorage();

  // 首次启动：延迟到首屏稳定后再问城市，避免和动画/密度切换抢布局
  const skipOnboarding = new URLSearchParams(location.search).has('no-onboard');
  if (!store.state.meta.onboarded && !skipOnboarding) {
    setTimeout(() => {
      import('./onboarding.js')
        .then((module) => module.showOnboarding())
        .catch((err) => console.warn('[serein] 引导加载失败', err));
    }, 700);
  }

  // localStorage 被清空后，用 chrome.storage.local 的镜像把配置找回来
  store.restoreFromMirror().then(async (restored) => {
    if (!restored) return;
    await applyBackground(store.state);
    refreshClock();
    showToast({ text: t('检测到本地缓存被清理，已从镜像恢复你的配置') });
  });

  if (!sessionStorage.getItem('serein:greeted')) {
    sessionStorage.setItem('serein:greeted', '1');
    setTimeout(() => showToast({ text: t('右键图标或空白处，随时编辑') }), 900);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

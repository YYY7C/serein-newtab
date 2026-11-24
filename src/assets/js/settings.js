/* Serein · 设置面板
 *
 * 全屏浮层 + 左侧分区导航。所有改动即时生效，无需「保存」按钮。
 */

import {
  h,
  clear,
  svgIcon,
  bus,
  debounce,
  relativeTime,
  formatBytes,
  normalizeUrl,
  isUsableUrl,
  prettyHost,
  readableTextOn,
} from './util.js';
import * as store from './store.js';
import { makeSwitch, makeSegmented, makeRange, makeStepper, shortcutEditor, confirmDialog, openModal } from './modals.js';
import {
  GRADIENTS,
  APP,
  STYLES,
  styleById,
  engineName,
  engineLetter,
  RECENT_SEARCH_LIMIT,
  enginesFor,
  sanitizeCustomEngine,
  CUSTOM_ENGINE_LIMIT,
  CUSTOM_ENGINE_NAME_MAX,
  WALLPAPER_POOL_LIMIT,
} from './defaults.js';
import { t, resolveLocale, setLocale, onLocaleChange } from './i18n.js';
import {
  applyBackground,
  applyBackgroundLook,
  cycleBing,
  fetchBingGallery,
  saveLocalWallpaper,
  dropLocalWallpaper,
  rotateWallpaperNow,
  styleVeilPercent,
  STYLE_VEIL,
} from './wallpaper.js';
import { files } from './storage.js';
import { applyConfig, applyCustomCss, dockWidth, CUSTOM_CSS_MAX } from './theme.js';
import { applyCustomFont, canLoadFontFile } from './custom-font.js';
import { exportState, importState, exportTheme, importTheme, resetAll, usageReport } from './data.js';
import {
  hasPermissionApi,
  permissionGranted,
  requestPermission as requestOptionalPermission,
  revokePermission,
} from './quick.js';
import { refreshClock } from './clock.js';
import { resolveIcon, previewFileIcon } from './icons.js';

const SECTIONS = [
  { id: 'appearance', label: '外观', icon: 'palette' },
  { id: 'wallpaper', label: '壁纸', icon: 'image' },
  { id: 'layout', label: '布局', icon: 'grid' },
  { id: 'shortcuts', label: '快捷方式', icon: 'folder' },
  { id: 'widgets', label: '小组件', icon: 'layout' },
  { id: 'search', label: '搜索', icon: 'search' },
  { id: 'data', label: '数据', icon: 'database' },
  { id: 'about', label: '关于', icon: 'info' },
];

const ACCENTS = [
  '#6c8cff', '#7c8cff', '#7c5cff', '#a855f7', '#ec4899',
  '#f43f5e', '#b33a2b', '#f97316', '#f59e0b', '#22c55e',
  '#7ee787', '#14b8a6', '#0ea5e9', '#64748b', '#e2e8f0',
];

let root = null;
let panel = null;
let navEl = null;
let bodyEl = null;
let activeTab = 'appearance';
let isOpen = false;
let lastFocus = null;
// 壁纸可能很大，用户能在上传途中再次选图；只允许最后一次选择生效
let wallpaperUploadSeq = 0;
let fontUploadSeq = 0;
let wallpaperPoolUrls = [];

function releaseWallpaperPoolUrls() {
  for (const url of wallpaperPoolUrls) URL.revokeObjectURL(url);
  wallpaperPoolUrls = [];
}
let closeSeq = 0;
// 读权限 + 遍历书签树是异步的，连点两次会导入两个同名文件夹
let bookmarkImporting = false;

/* --------------------------------------------------------------- 基座 */

export function initSettings() {
  const scrim = h('div', { class: 'scrim' });

  navEl = h('nav', { class: 'settings-nav' });
  bodyEl = h('div', { class: 'settings-body scroll' });

  panel = h(
    'div',
    { class: 'settings-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('设置') },
    navEl,
    bodyEl
  );
  root = h('div', { class: 'settings' }, scrim, panel);
  document.body.appendChild(root);

  buildNav();

  // 其它标签页改了配置（例如换壁纸/改布局）：设置面板开着时同步重建当前分区
  window.addEventListener('serein:state-adopted', () => {
    if (isOpen) selectSection(activeTab);
  });

  // 语言切换可能发生在当前分区的控件里：等事件栈退出后再重建，
  // 避免把正在处理点击的按钮从 DOM 里摘掉。
  onLocaleChange(() => {
    if (!root) return;
    queueMicrotask(() => {
      if (!root) return;
      buildNav();
      panel.setAttribute('aria-label', t('设置'));
      if (isOpen) selectSection(activeTab);
    });
  });

  scrim.addEventListener('click', close);
  panel.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    // 设置本身也是模态场景：Tab 到首/尾时循环，别把焦点放回已 inert 的页面或浏览器地址栏
    if (event.key !== 'Tab' || document.querySelector('.modal.is-open')) return;
    const focusables = Array.from(
      panel.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
    ).filter((node) => node.getClientRects().length > 0);
    if (!focusables.length) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key !== 'Escape' || !isOpen) return;
    // 上层还有弹窗时交给弹窗自己处理
    if (document.querySelector('.modal.is-open')) return;
    close();
  });

  return root;
}

function buildNav() {
  clear(navEl);
  navEl.appendChild(
    h(
      'div',
      { class: 'settings-brand' },
      h('div', { class: 'logo', html: svgIcon('sparkle', 16) }),
      h('div', {}, h('div', { class: 'name', text: APP.name }), h('div', { class: 'ver', text: `v${APP.version}` }))
    )
  );

  for (const section of SECTIONS) {
    navEl.appendChild(
      h(
        'button',
        {
          class: `nav-item${section.id === activeTab ? ' is-active' : ''}`,
          type: 'button',
          'data-tab': section.id,
          'aria-current': section.id === activeTab ? 'page' : null,
          onclick: () => selectSection(section.id),
        },
        h('span', { html: svgIcon(section.icon, 16) }),
        h('span', { text: t(section.label) })
      )
    );
  }

  navEl.appendChild(h('div', { class: 'nav-spacer' }));
}

export function open(tab = 'appearance') {
  if (document.querySelector('.modal.is-open')) return;
  if (!root) initSettings();
  activeTab = SECTIONS.some((section) => section.id === tab) ? tab : 'appearance';
  if (!isOpen) lastFocus = document.activeElement;
  isOpen = true;
  closeSeq += 1;
  // 让页面本体退到后面：设置是「换个场景」而不是「在页面上盖一张纸」，
  // 否则面板和快捷方式/小组件会看起来叠在一起。
  document.documentElement.dataset.overlay = 'settings';
  root.inert = false;
  root.classList.remove('is-closing');
  if (panel) panel.inert = false;
  root.setAttribute('aria-hidden', 'false');
  root.classList.add('is-open');
  const scrim = root.querySelector('.scrim');
  scrim.classList.add('is-open');
  const stage = document.querySelector('.stage');
  if (stage) stage.inert = true;
  selectSection(activeTab);
  // 键盘用户进入设置后从当前分区开始，而不是继续停留在背后的页面
  setTimeout(() => {
    if (!isOpen || document.querySelector('.modal.is-open')) return;
    const active = document.activeElement;
    if (active && active !== document.body && root.contains(active)) return;
    navEl.querySelector('.nav-item.is-active')?.focus({ preventScroll: true });
  }, 40);
}

export function close() {
  if (!root || !isOpen) return;
  isOpen = false;
  releaseWallpaperPoolUrls();
  const seq = ++closeSeq;
  delete document.documentElement.dataset.overlay;
  root.classList.remove('is-open');
  // 淡出时面板本身不再可操作，但整个浮层继续拦截鼠标，防止点穿
  root.classList.add('is-closing');
  if (panel) panel.inert = true;
  root.querySelector('.scrim')?.classList.remove('is-open');

  const modalOpen = Boolean(document.querySelector('.modal.is-open'));
  const stage = document.querySelector('.stage');
  if (stage) stage.inert = modalOpen;
  if (!modalOpen) {
    const stored = lastFocus;
    lastFocus = null;
    const target =
      stored && stored !== document.body && stored.isConnected && stored.getClientRects().length
        ? stored
        : document.querySelector('#topbar-right [data-action="settings"]');
    if (target?.isConnected && target.getClientRects().length) target.focus?.({ preventScroll: true });
  }
  if (root.contains(document.activeElement)) document.activeElement.blur?.();
  root.setAttribute('aria-hidden', 'true');
  // 动画结束后再脱离可访问树；这期间面板已 inert，Tab 进不去
  setTimeout(() => {
    if (isOpen || seq !== closeSeq) return;
    if (panel) panel.inert = false;
    root.classList.remove('is-closing');
    root.inert = true;
  }, 320);
}

function selectSection(id) {
  activeTab = id;
  Array.from(navEl.querySelectorAll('.nav-item')).forEach((node) => {
    const active = node.dataset.tab === id;
    node.classList.toggle('is-active', active);
    if (active) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  });
  bodyEl.scrollTop = 0;
  clear(bodyEl);
  const built = SECTIONS.find((section) => section.id === id);
  bodyEl.appendChild(buildHeader(built));
  bodyEl.appendChild(BUILDERS[id]());
  bodyEl.scrollTop = 0;
}

function buildHeader(section) {
  return h(
    'div',
    { class: 'settings-header' },
    h(
      'div',
      {},
      h('h1', { class: 'settings-title', text: t(section.label) }),
      h('p', { class: 'settings-desc', text: t(HEADERS[section.id] || '') })
    ),
    h('button', {
      class: 'settings-close',
      type: 'button',
      'aria-label': t('关闭设置'),
      html: svgIcon('close', 16),
      onclick: close,
    })
  );
}

const HEADERS = {
  appearance: '调整配色、圆角与质感。所有改动即时生效，可以边拖边看。',
  wallpaper: '渐变完全离线、无版权风险；必应每日壁纸来自公开接口，仅作桌面欣赏。',
  layout: '控制密度与信息层次。图标大小和列数会影响一屏能放多少内容。',
  shortcuts: '管理图标与文件夹。也可以直接在桌面右键图标进行编辑。',
  widgets: '侧边栏小组件。关掉不需要的可以让首屏更干净。',
  search: '只影响本页的搜索跳转，不会修改浏览器默认搜索引擎；最近搜索也只保存在本机。',
  data: '全部数据保存在本机，没有账号、没有云端同步。',
  about: '权限、网络请求与快捷键一览。',
};

/* ------------------------------------------------------------- 小工具 */

function group(title, ...rows) {
  const box = h('div', { class: 'group' });
  if (title) box.appendChild(h('div', { class: 'group-title', text: title }));
  box.appendChild(h('div', { class: 'rows' }, ...rows.flat()));
  return box;
}

function row(name, hint, control, { stacked = false } = {}) {
  const hintNode = hint
    ? typeof hint === 'string'
      ? h('div', { class: 'hint', text: hint })
      : h('div', { class: 'hint' }, hint)
    : null;
  let controlNode = null;
  if (control) {
    controlNode = h('div', { class: 'row-control' }, control);
    // 行标题就是控件最自然的名字：开关、滑块、色块和文本框默认都没有可访问名称。
    controlNode
      .querySelectorAll('.switch, input[type=range], input[type=color], input[type=text], input[type=number], select')
      .forEach((node) => {
        if (!node.getAttribute('aria-label')) node.setAttribute('aria-label', name);
      });
    controlNode.querySelectorAll('.seg').forEach((node) => {
      if (!node.getAttribute('aria-label')) node.setAttribute('aria-label', name);
    });
  }
  return h(
    'div',
    { class: `row${stacked ? ' is-stacked' : ''}` },
    h('div', { class: 'row-label' }, h('div', { class: 'name', text: name }), hintNode),
    controlNode
  );
}

const persist = debounce(() => store.commit('config'), 180);

function touch({ render = false } = {}) {
  applyConfig(store.state);
  persist();
  if (render) refreshClock();
}

/** 需要立刻确认落盘的操作（上传字体/壁纸、删除资产）：跳过 180ms 防抖 */
function touchNow({ render = false } = {}) {
  applyConfig(store.state);
  store.commit('config');
  if (render) refreshClock();
}

/* --------------------------------------------------------------- 外观 */

function buildAppearance() {
  const config = store.state.config;
  const bg = config.background;

  /* ---- 视觉风格选择器 ---- */
  const styleDesc = h('div', { class: 'field-hint', style: { marginTop: '10px' }, text: t(styleById(config.style).desc) });
  const styleGrid = h('div', { class: 'style-grid' });

  for (const preset of STYLES) {
    styleGrid.appendChild(
      h(
        'button',
        {
          class: `style-card${config.style === preset.id ? ' is-active' : ''}`,
          type: 'button',
          'data-style-id': preset.id,
          'aria-pressed': String(config.style === preset.id),
          title: t(preset.desc),
          onclick: () => {
            config.style = preset.id;
            config.accent = preset.accent;
            applyConfig(store.state);
            applyBackground(store.state);
            refreshClock();
            store.commit('config');
            selectSection('appearance');
            // 重建分区后把焦点放回当前选中的风格，键盘用户不会掉回页面根部
            bodyEl.querySelector('.style-card.is-active')?.focus({ preventScroll: true });
          },
        },
        h('span', {
          class: `style-thumb is-${preset.form}`,
          style: { background: preset.thumb, color: preset.tone === 'light' ? '#191713' : '#ffffff' },
        }),
        h(
          'div',
          { class: 'style-meta' },
          h(
            'div',
            { class: 'style-name' },
            h('span', { text: t(preset.name) }),
            h('span', { class: `style-form is-${preset.form}`, text: t(preset.form === 'list' ? '列表' : '网格') })
          )
        )
      )
    );
  }

  return h(
    'div',
    {},
    group(
      t('语言'),
      row(
        t('界面语言'),
        t('切换后立即生效；自动会跟随浏览器语言'),
        makeSegmented(
          [
            { value: 'auto', label: t('自动（跟随浏览器）') },
            { value: 'zh-CN', label: '简体中文' },
            { value: 'en', label: 'English' },
          ],
          config.language || 'auto',
          (value) => {
            config.language = value;
            touchNow();
            setLocale(resolveLocale(value));
            bus.emit('toast', { text: t('界面语言已切换') });
          }
        )
      )
    ),
    group(t('视觉风格'), h('div', { style: { padding: '13px 15px' } }, styleGrid, styleDesc)),
    group(
      t('色彩'),
      row(
        t('强调色'),
        t('用于开关、焦点环与高亮状态'),
        h(
          'div',
          { class: 'color-dots' },
          ...ACCENTS.map((color) =>
            h('button', {
              class: `color-dot${config.accent === color ? ' is-active' : ''}`,
              type: 'button',
              title: color,
              'aria-label': t('强调色 {color}', { color }),
              'aria-pressed': String(config.accent === color),
              style: { background: color },
              onclick: (event) => {
                config.accent = color;
                Array.from(event.currentTarget.parentElement.children).forEach((node) => {
                  node.classList.remove('is-active');
                  if (node.matches?.('.color-dot')) node.setAttribute('aria-pressed', 'false');
                });
                event.currentTarget.classList.add('is-active');
                event.currentTarget.setAttribute('aria-pressed', 'true');
                touch();
              },
            })
          ),
          h(
            'label',
            { class: 'color-picker', title: t('自定义颜色') },
            h('span', { html: svgIcon('plus', 13) }),
            h('input', {
              type: 'color',
              value: config.accent,
              oninput: (event) => {
                config.accent = event.target.value;
                event.target
                  .closest('.color-dots')
                  ?.querySelectorAll('.color-dot')
                  .forEach((node) => {
                    node.classList.remove('is-active');
                    node.setAttribute('aria-pressed', 'false');
                  });
                touch();
              },
            })
          )
        )
      ),
      row(
        t('文字色调'),
        t('浅色壁纸上自动用深色文字；也可以手动锁定'),
        makeSegmented(
          [
            { value: 'auto', label: t('自动') },
            { value: 'dark', label: t('浅色文字') },
            { value: 'light', label: t('深色文字') },
          ],
          bg.tone || 'auto',
          (value) => {
            bg.tone = value;
            touch();
            applyBackground(store.state);
          }
        )
      )
    ),
    group(
      t('质感'),
      row(
        t('毛玻璃模糊'),
        t('数值越大越朦胧，性能开销也越高'),
        makeRange({
          min: 0,
          max: 40,
          value: config.glass,
          format: (value) => `${value}px`,
          onInput: (value) => {
            config.glass = value;
            touch();
          },
        })
      ),
      row(
        t('圆角'),
        t('0 为直角，36 接近胶囊'),
        makeRange({
          min: 0,
          max: 36,
          value: config.radius,
          format: (value) => `${value}px`,
          onInput: (value) => {
            config.radius = value;
            touch();
          },
        })
      ),
      row(
        t('界面缩放'),
        t('放大或缩小主界面的文字与控件'),
        makeRange({
          min: 0.8,
          max: 1.4,
          step: 0.05,
          value: config.fontScale,
          format: (value) => `${Math.round(value * 100)}%`,
          onInput: (value) => {
            config.fontScale = value;
            touch();
          },
        })
      )
    ),
    group(
      t('图标'),
      row(
        t('图标样式'),
        t('内置矢量图标离线可用、任意尺寸清晰；网站图标取自 Chrome 本地缓存'),
        makeSegmented(
          [
            { value: 'brand', label: t('品牌图标') },
            { value: 'favicon', label: t('网站图标') },
          ],
          config.layout.iconStyle || 'brand',
          (value) => {
            config.layout.iconStyle = value;
            touch();
          }
        )
      )
    ),
    group(
      t('效果'),
      row(
        t('动效'),
        t('关闭后所有过渡动画立即完成'),
        makeSwitch(config.animations !== false, (value) => {
          config.animations = value;
          touch();
        })
      ),
      row(
        t('性能模式'),
        t('关闭毛玻璃与壁纸漂移动画，减少合成开销；显卡驱动异常、页面卡顿时使用'),
        makeSwitch(config.performance === true, (value) => {
          config.performance = value;
          touch();
        })
      )
    ),
    group(
      t('自定义字体'),
      (() => {
        const current = config.customFont || { id: '', name: '' };
        const status = h('div', {
          class: 'field-hint',
          text: current.id
            ? t('当前：{name}', { name: current.name || t('自定义字体') })
            : t('当前：系统字体'),
        });
        const picker = h('input', {
          type: 'file',
          accept: '.woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf',
          style: { display: 'none' },
          onchange: async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (!/\.(woff2?|ttf|otf)$/i.test(file.name) && !/^font\//i.test(file.type)) {
              bus.emit('toast', { text: t('请选择 WOFF2 / WOFF / TTF / OTF 字体文件'), error: true });
              return;
            }
            if (file.size > 8 * 1024 * 1024) {
              bus.emit('toast', { text: t('字体文件超过 8 MB，请先压缩或裁剪字形'), error: true });
              return;
            }
            // 先让浏览器解析一遍：坏文件/伪装扩展名直接拒绝，不要先落盘再失败
            if (!(await canLoadFontFile(file))) {
              bus.emit('toast', { text: t('这个字体文件无法解析，请换一个文件'), error: true });
              return;
            }
            const seq = ++fontUploadSeq;
            const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            if (!(await files.put(`font:${id}`, file))) {
              bus.emit('toast', { text: t('字体保存失败，请检查浏览器存储空间'), error: true });
              return;
            }
            if (seq !== fontUploadSeq) {
              files.remove(`font:${id}`);
              return;
            }
            const previous = config.customFont || { id: '', name: '' };
            config.customFont = { id, name: file.name.slice(0, 60) };
            const applied = await applyCustomFont(store.state);
            if (!applied) {
              config.customFont = previous;
              await applyCustomFont(store.state);
              await files.remove(`font:${id}`);
              bus.emit('toast', { text: t('字体加载失败，已保留原字体'), error: true });
              return;
            }
            touchNow();
            if (!store.flushNow()) {
              config.customFont = previous;
              await applyCustomFont(store.state);
              await files.remove(`font:${id}`);
              bus.emit('toast', { text: t('字体保存失败：本地存储写入异常'), error: true });
              return;
            }
            if (previous.id) await files.remove(`font:${previous.id}`);
            selectSection('appearance');
            bus.emit('toast', { text: t('已应用自定义字体') });
          },
        });
        return row(
          t('字体'),
          status,
          h(
            'div',
            { class: 'btn-row' },
            h('button', {
              class: 'btn',
              type: 'button',
              html: `${svgIcon('upload', 14)}<span>${current.id ? t('更换字体') : t('选择字体')}</span>`,
              onclick: () => picker.click(),
            }),
            current.id
              ? h('button', {
                  class: 'btn is-ghost',
                  type: 'button',
                  text: t('恢复系统字体'),
                  onclick: async () => {
                    const previous = config.customFont;
                    config.customFont = { id: '', name: '' };
                    await applyCustomFont(store.state);
                    touchNow();
                    if (!store.flushNow()) {
                      config.customFont = previous;
                      await applyCustomFont(store.state);
                      touchNow();
                      bus.emit('toast', { text: t('恢复系统字体失败：本地存储写入异常'), error: true });
                      return;
                    }
                    if (previous.id) await files.remove(`font:${previous.id}`);
                    selectSection('appearance');
                  },
                })
              : null,
            picker
          )
        );
      })()
    ),
    group(
      t('主题预设'),
      (() => {
        const themeInput = h('input', {
          type: 'file',
          accept: '.json,application/json',
          style: { display: 'none' },
          onchange: async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            try {
              await importTheme(file);
              if (isOpen && activeTab === 'appearance') selectSection('appearance');
              bus.emit('toast', { text: t('主题已应用') });
            } catch (err) {
              bus.emit('toast', { text: err.message || t('主题导入失败'), error: true });
            }
          },
        });
        return row(
          t('分享外观'),
          t('只导出风格、配色、圆角、滤镜与自定义 CSS，不含快捷方式和个人数据'),
          h(
            'div',
            { class: 'btn-row' },
            h('button', {
              class: 'btn',
              type: 'button',
              html: `${svgIcon('download', 14)}<span>${t('导出主题')}</span>`,
              onclick: () => {
                exportTheme();
                bus.emit('toast', { text: t('主题已导出') });
              },
            }),
            h('button', {
              class: 'btn is-ghost',
              type: 'button',
              html: `${svgIcon('upload', 14)}<span>${t('导入主题')}</span>`,
              onclick: () => themeInput.click(),
            }),
            themeInput
          )
        );
      })()
    ),
    group(
      t('自定义 CSS'),
      row(
        t('高级样式'),
        t('立即生效并随配置一起备份。@import 会被移除；选择器写法可参考浏览器开发者工具。'),
        h(
          'div',
          { class: 'custom-css-editor' },
          (() => {
            const area = h('textarea', {
              class: 'text-input custom-css-input',
              maxlength: String(CUSTOM_CSS_MAX),
              spellcheck: 'false',
              placeholder: t('/* 例如 */\n.clock-time { letter-spacing: 0.02em; }'),
              'aria-label': t('自定义 CSS'),
            });
            area.value = config.customCss || '';
            const count = h('span', {
              class: 'field-hint custom-css-count',
              text: `${area.value.length} / ${CUSTOM_CSS_MAX}`,
            });
            const clear = h('button', {
              class: 'btn is-ghost',
              type: 'button',
              text: t('清空'),
              disabled: !area.value.trim(),
            });
            // 20k 字符的样式表每敲一个字就重新解析会明显掉帧（实测 100–200ms），
            // 这里等输入停顿再应用；计数与落盘仍然是即时的。
            const applyCssSoon = debounce((text) => applyCustomCss(text), 160);
            let pending = false;
            area.addEventListener('input', () => {
              config.customCss = area.value;
              pending = true;
              applyCssSoon(area.value);
              persist();
              count.textContent = `${area.value.length} / ${CUSTOM_CSS_MAX}`;
              clear.disabled = !area.value.trim();
            });
            area.addEventListener('blur', () => {
              if (!pending) return;
              pending = false;
              applyCssSoon.cancel();
              applyCustomCss(area.value);
            });
            clear.addEventListener('click', () => {
              pending = false;
              applyCssSoon.cancel();
              config.customCss = '';
              applyCustomCss('');
              touch();
              selectSection('appearance');
            });
            return [area, h('div', { class: 'custom-css-foot' }, count, clear)];
          })()
        ),
        { stacked: true }
      )
    )
  );
}

/* --------------------------------------------------------------- 壁纸 */

function buildWallpaper() {
  releaseWallpaperPoolUrls();
  const config = store.state.config;
  const bg = config.background;

  const gallery = h('div', { class: 'swatch-grid', role: 'group', 'aria-label': t('渐变预设') });
  for (const preset of GRADIENTS) {
    gallery.appendChild(
      h(
        'button',
        {
          class: `swatch${bg.gradient === preset.id && bg.type === 'gradient' ? ' is-active' : ''}${preset.tone === 'light' ? ' is-light' : ''}`,
          type: 'button',
          title: t(preset.name),
          'aria-pressed': String(bg.gradient === preset.id && bg.type === 'gradient'),
          style: { backgroundImage: preset.css },
          'data-id': preset.id,
          onclick: (event) => {
            bg.type = 'gradient';
            bg.gradient = preset.id;
            Array.from(gallery.children).forEach((node) => {
              node.classList.remove('is-active');
              node.setAttribute('aria-pressed', 'false');
            });
            event.currentTarget.classList.add('is-active');
            event.currentTarget.setAttribute('aria-pressed', 'true');
            applyBackground(store.state);
            touch();
          },
        },
        h('span', { text: t(preset.name) })
      )
    );
  }

  const typeControl = makeSegmented(
    [
      { value: 'gradient', label: t('渐变') },
      { value: 'bing', label: t('必应') },
      { value: 'url', label: t('图片') },
      { value: 'file', label: t('本地') },
      { value: 'color', label: t('纯色') },
    ],
    bg.type,
    (value) => {
      bg.type = value;
      applyBackground(store.state);
      touch();
      selectSection('wallpaper');
      bodyEl.querySelector('.wallpaper-type button.is-active')?.focus({ preventScroll: true });
    }
  );
  typeControl.classList.add('wallpaper-type');

  const sourceRows = [];

  if (bg.type === 'bing') {
    const gallery = h('div', { class: 'bing-gallery' });
    const hint = h('div', { class: 'field-hint', text: t('正在获取最近 8 天…') });
    // 换图后版权说明也要跟着变，否则会一直停在打开面板时那张
    const currentLabel = h('span', {
    text: bg.bing?.copyright || t('每天更新一张，来自 cn.bing.com 公开接口'),
  });

    const paint = () => {
      currentLabel.textContent = bg.bing?.copyright || t('每天更新一张，来自 cn.bing.com 公开接口');
      Array.from(gallery.children).forEach((node) => {
        const active = Number(node.dataset.idx) === (bg.bing?.idx ?? 0);
        node.classList.toggle('is-active', active);
        node.setAttribute('aria-pressed', String(active));
      });
    };

    fetchBingGallery(8)
      .then((items) => {
        clear(gallery);
        if (!items.length) {
          hint.textContent = t('没有取到壁纸，请检查网络后重试');
          return;
        }
        hint.textContent = t('最近 {n} 天 · 点击任意一张即刻应用', { n: items.length });
        for (const item of items) {
          gallery.appendChild(
            h(
              'button',
              {
                class: 'bing-item',
                type: 'button',
                title: item.copyright || item.title,
                'aria-pressed': String(Number(item.idx) === (bg.bing?.idx ?? 0)),
                'data-idx': String(item.idx),
                style: { backgroundImage: `url("${item.thumb}")` },
                onclick: async () => {
                  bg.type = 'bing';
                  bg.bing = {
                    ...(bg.bing || {}),
                    idx: item.idx,
                    date: '',
                    url: '',
                    copyright: item.copyright,
                    title: item.title,
                  };
                  await applyBackground(store.state);
                  touch();
                  paint();
                },
              },
              h('span', { class: 'bing-item__date', text: item.idx === 0 ? t('今天') : item.date })
            )
          );
        }
        paint();
      })
      .catch(() => {
        hint.textContent = t('获取失败，请检查网络后重试');
      });

    sourceRows.push(
      row(
        t('必应每日壁纸'),
        currentLabel,
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            html: `${svgIcon('refresh', 14)}<span>${t('随机一张')}</span>`,
            onclick: async () => {
              // 1..7 的随机步长 = 随机换到另外 7 天中的一张，不会原地不动
              await cycleBing(store.state, 1 + Math.floor(Math.random() * 7));
              touch();
              paint();
            },
          }
        )
      ),
      row(
        t('历史壁纸'),
        t('必应保留最近 8 天，挑一张喜欢的固定下来'),
        h('div', {}, gallery, hint),
        { stacked: true }
      )
    );
  }

  if (bg.type === 'url') {
    // 地址先立即写回 state（关窗时 pagehide 能落盘），只把「真正加载图片」防抖
    const applyUrl = debounce(() => {
      // 用户可能已在 400ms 内切到渐变/必应；不要再按旧输入重载一次壁纸
      if (store.state.config.background.type !== 'url') return;
      applyBackground(store.state);
      touch();
    }, 400);
    const input = h('input', {
      class: 'text-input',
      type: 'text',
      value: bg.url,
      maxlength: '2048',
      placeholder: 'https://example.com/wallpaper.jpg',
      oninput: (event) => {
        // 允许直接粘贴 example.com/a.jpg，而不是必须手打 https://
        bg.url = normalizeUrl(event.target.value.trim());
        applyUrl();
      },
    });
    sourceRows.push(
      row(t('图片地址'), t('支持任意可在浏览器中打开的图片链接'), input, { stacked: true })
    );
  }

  if (bg.type === 'file') {
    const poolGrid = h('div', { class: 'wallpaper-pool', role: 'group', 'aria-label': t('本地壁纸') });
    const poolHint = h('div', { class: 'field-hint' });
    const maxSize = 24 * 1024 * 1024;

    const paintPool = () => {
      clear(poolGrid);
      releaseWallpaperPoolUrls();
      const pool = Array.isArray(bg.pool) ? bg.pool : [];
      poolHint.textContent = pool.length
        ? t('{n} / {max} 张 · 点击缩略图立即应用', { n: pool.length, max: WALLPAPER_POOL_LIMIT })
        : t('还没有本地壁纸；一次可以选择多张');
      if (!pool.length) {
        poolGrid.appendChild(
          h('div', {
            class: 'wallpaper-pool-empty',
            text: t('支持 JPG / PNG / WebP，单张不超过 24 MB'),
          })
        );
        return;
      }
      for (const entry of pool) {
        const thumb = h('button', {
          class: 'pool-thumb',
          type: 'button',
          'aria-label': t('应用壁纸 {name}', { name: entry.name }),
          'aria-pressed': String(bg.fileId === entry.id),
          title: entry.name,
          onclick: () => {
            bg.fileId = entry.id;
            bg.rotatedAt = Date.now();
            applyBackground(store.state);
            touch();
            paintPool();
          },
        });
        const fallback = h('span', {
          class: 'pool-fallback',
          text: Array.from(entry.name || t('图'))[0],
        });
        thumb.appendChild(fallback);
        files
          .get(`wallpaper:${entry.id}`)
          .then((blob) => {
            if (!blob || !thumb.isConnected) return;
            const url = URL.createObjectURL(blob);
            wallpaperPoolUrls.push(url);
            const img = h('img', { src: url, alt: '', decoding: 'async' });
            img.addEventListener('load', () => fallback.remove(), { once: true });
            img.addEventListener('error', () => img.remove(), { once: true });
            thumb.prepend(img);
          })
          .catch(() => {});

        poolGrid.appendChild(
          h(
            'div',
            { class: `pool-item${bg.fileId === entry.id ? ' is-active' : ''}` },
            thumb,
            h(
              'div',
              { class: 'pool-meta' },
              h('span', { class: 'pool-name', text: entry.name, title: entry.name }),
              h('button', {
                class: 'pool-remove',
                type: 'button',
                text: t('删除'),
                'aria-label': t('删除壁纸 {name}', { name: entry.name }),
                onclick: () => removeFromPool(entry),
              })
            )
          )
        );
      }
    };

    const removeFromPool = async (entry, { refresh = true } = {}) => {
      const snapshot = { pool: bg.pool.map((item) => ({ ...item })), fileId: bg.fileId, type: bg.type };
      bg.pool = bg.pool.filter((item) => item.id !== entry.id);
      if (bg.fileId === entry.id) bg.fileId = bg.pool[0]?.id || '';
      if (!bg.pool.length) bg.type = 'gradient';
      touchNow();
      if (!store.flushNow()) {
        Object.assign(bg, snapshot);
        applyBackground(store.state);
        touchNow();
        bus.emit('toast', { text: t('删除失败：本地存储写入异常'), error: true });
        return;
      }
      await dropLocalWallpaper(entry.id);
      await applyBackground(store.state);
      if (!bg.pool.length || refresh) {
        selectSection('wallpaper');
        return;
      }
      paintPool();
    };

    const fileInput = h('input', {
      type: 'file',
      accept: 'image/*',
      multiple: true,
      style: { display: 'none' },
      onchange: async (event) => {
        const chosen = Array.from(event.target.files || []);
        event.target.value = '';
        if (!chosen.length) return;
        const room = WALLPAPER_POOL_LIMIT - bg.pool.length;
        if (room <= 0) {
          bus.emit('toast', {
            text: t('最多保存 {max} 张本地壁纸', { max: WALLPAPER_POOL_LIMIT }),
            error: true,
          });
          return;
        }
        const batch = chosen.slice(0, room);
        if (chosen.length > room) {
          bus.emit('toast', { text: t('壁纸池已满，本次只添加前 {n} 张', { n: room }), error: true });
        }
        const seq = ++wallpaperUploadSeq;
        const snapshot = { pool: bg.pool.map((item) => ({ ...item })), fileId: bg.fileId, type: bg.type };
        const added = [];
        for (const file of batch) {
          if (!file.type.startsWith('image/')) {
            bus.emit('toast', { text: t('已跳过非图片文件：{name}', { name: file.name }), error: true });
            continue;
          }
          if (file.size > maxSize) {
            bus.emit('toast', {
              text: t('已跳过超过 24 MB 的文件：{name}', { name: file.name }),
              error: true,
            });
            continue;
          }
          const id = await saveLocalWallpaper(file).catch(() => '');
          if (!id) {
            bus.emit('toast', { text: t('壁纸保存失败，请检查浏览器存储空间'), error: true });
            break;
          }
          if (seq !== wallpaperUploadSeq || store.state.config.background !== bg) {
            files.remove(`wallpaper:${id}`);
            break;
          }
          added.push({
            id,
            name: String(file.name || t('本地壁纸')).slice(0, 40),
            addedAt: Date.now(),
          });
        }
        if (!added.length) return;
        bg.pool = [...bg.pool, ...added];
        if (!bg.fileId) bg.fileId = added[0].id;
        bg.type = 'file';
        await applyBackground(store.state);
        touchNow();
        if (!store.flushNow()) {
          Object.assign(bg, snapshot);
          await applyBackground(store.state);
          touchNow();
          for (const item of added) await files.remove(`wallpaper:${item.id}`);
          bus.emit('toast', { text: t('保存失败：本地存储写入异常'), error: true });
          return;
        }
        // 保存大图可能耗时，用户可能已经切到别的分区；不要强行把他拽回壁纸页
        if (isOpen && activeTab === 'wallpaper') {
          selectSection('wallpaper');
          navEl.querySelector('.nav-item.is-active')?.focus({ preventScroll: true });
        }
        bus.emit('toast', { text: t('已添加 {n} 张本地壁纸', { n: added.length }) });
      },
    });

    paintPool();
    sourceRows.push(
      row(
        t('本地壁纸池'),
        poolHint,
        h(
          'div',
          { class: 'btn-row' },
          h('button', {
            class: 'btn',
            type: 'button',
            html: `${svgIcon('upload', 14)}<span>${t('添加图片')}</span>`,
            disabled: bg.pool.length >= WALLPAPER_POOL_LIMIT,
            onclick: () => fileInput.click(),
          }),
          h('button', {
            class: 'btn is-ghost',
            type: 'button',
            text: t('全部删除'),
            disabled: !bg.pool.length,
            onclick: async () => {
              const entries = [...bg.pool];
              for (const entry of entries) await removeFromPool(entry, { refresh: false });
              if (isOpen && activeTab === 'wallpaper') {
                selectSection('wallpaper');
                navEl.querySelector('.nav-item.is-active')?.focus({ preventScroll: true });
              }
            },
          }),
          fileInput
        )
      ),
      row(t('壁纸'), t('点击缩略图切换当前壁纸'), h('div', {}, poolGrid), { stacked: true })
    );
  }

  if (bg.type === 'color') {
    sourceRows.push(
      row(
        t('纯色背景'),
        t('最省资源的选择'),
        h('input', {
          type: 'color',
          value: bg.color,
          style: { width: '44px', height: '30px', border: 'none', background: 'none', cursor: 'pointer' },
          oninput: (event) => {
            bg.color = event.target.value;
            applyBackground(store.state);
            touch();
          },
        })
      )
    );
  }

  /* 遮罩强度按风格记忆：白纸/暗色材质各有自己的白雾或黑雾底线，
     用户在这里调低就能透出更多壁纸，其它风格保留各自的值。 */
  const styleId = config.style;
  const styleLabel = t(styleById(styleId).name);
  const veilInactive = styleId === 'editorial' || styleId === 'terminal';
  const veilDefault = STYLE_VEIL[styleId] ?? 0;
  const veilHint = veilInactive
    ? t('「{style}」用整页实底铺满，遮罩不参与渲染', { style: styleLabel })
    : t('「{style}」默认 {value}%，各风格分别记忆；调低可透出更多壁纸', {
        style: styleLabel,
        value: veilDefault,
      });
  const veilRange = makeRange({
    min: 0,
    max: 100,
    value: styleVeilPercent(bg, styleId),
    format: (value) => `${value}%`,
    onInput: (value) => {
      bg.veilByStyle = { ...bg.veilByStyle, [styleId]: value };
      applyBackgroundLook(store.state);
      touch();
    },
  });
  const veilReset = h('button', {
    class: 'btn',
    type: 'button',
    'aria-label': t('恢复当前风格的默认遮罩强度'),
    title: t('恢复当前风格的默认遮罩强度'),
    html: `${svgIcon('refresh', 13)}<span>${t('默认')}</span>`,
    onclick: () => {
      const next = { ...bg.veilByStyle };
      delete next[styleId];
      bg.veilByStyle = next;
      veilRange.querySelector('input').value = String(veilDefault);
      veilRange.querySelector('.value').textContent = `${veilDefault}%`;
      applyBackgroundLook(store.state);
      touch();
    },
  });
  if (veilInactive) {
    // 这两个风格用整页实底，遮罩被 CSS 隐藏；留着可点只会让人以为没生效
    veilRange.querySelector('input').disabled = true;
    veilReset.disabled = true;
  }

  const rotationRows = [];
  if (bg.type === 'file' || bg.type === 'bing' || bg.type === 'gradient') {
    const poolSize = Array.isArray(bg.pool) ? bg.pool.length : 0;
    const canRotate = bg.type === 'file' ? poolSize > 1 : true;
    const rotationHint =
      bg.type === 'file'
        ? canRotate
          ? t('在 {n} 张本地壁纸间按顺序切换；新标签页模式每个新标签页换一张', { n: poolSize })
          : t('壁纸池里至少要有 2 张才能轮换')
        : bg.type === 'bing'
          ? t('在必应最近 8 天里切换；新标签页模式每个新标签页换一张')
          : t('在全部渐变预设间循环');
    rotationRows.push(
      row(
        t('轮换时机'),
        rotationHint,
        makeSegmented(
          [
            { value: 'off', label: t('关闭') },
            { value: 'newtab', label: t('每个新标签页') },
            { value: 'hour', label: t('每小时') },
            { value: 'day', label: t('每天') },
          ],
          bg.rotation || 'off',
          (value) => {
            bg.rotation = value;
            bg.rotatedAt = 0;
            touch();
          }
        )
      ),
      row(
        t('立即更换'),
        canRotate ? t('从当前来源里换到下一张，并重置轮换计时') : t('先往壁纸池里再加一张'),
        h('button', {
          class: 'btn',
          type: 'button',
          text: t('换一张'),
          disabled: !canRotate,
          onclick: async () => {
            if (!rotateWallpaperNow(store.state)) return;
            await applyBackground(store.state);
            touch();
            selectSection('wallpaper');
            navEl.querySelector('.nav-item.is-active')?.focus({ preventScroll: true });
          },
        })
      )
    );
  }

  return h(
    'div',
    {},
    group(t('来源'), row(t('壁纸类型'), t('切换后立即应用'), typeControl), ...sourceRows),
    rotationRows.length ? group(t('轮换'), ...rotationRows) : null,
    bg.type === 'gradient' ? group(t('渐变预设'), gallery) : null,
    group(
      t('调整'),
      row(
        t('模糊'),
        t('大数值会同时放大画面以消除边缘'),
        makeRange({
          min: 0,
          max: 30,
          value: bg.blur,
          format: (value) => `${value}px`,
          onInput: (value) => {
            bg.blur = value;
            applyBackgroundLook(store.state);
            touch();
          },
        })
      ),
      row(
        t('亮度'),
        '',
        makeRange({
          min: 30,
          max: 150,
          value: bg.brightness,
          format: (value) => `${value}%`,
          onInput: (value) => {
            bg.brightness = value;
            applyBackgroundLook(store.state);
            touch();
          },
        })
      ),
      row(
        t('饱和度'),
        '',
        makeRange({
          min: 0,
          max: 200,
          value: bg.saturate,
          format: (value) => `${value}%`,
          onInput: (value) => {
            bg.saturate = value;
            applyBackgroundLook(store.state);
            touch();
          },
        })
      ),
      row(
        t('风格遮罩'),
        veilHint,
        [veilRange, veilReset]
      ),
      row(
        t('暗角'),
        t('四周轻微压暗，让中心内容更聚焦'),
        makeSwitch(bg.vignette !== false, (value) => {
          bg.vignette = value;
          applyBackgroundLook(store.state);
          touch();
        })
      )
    )
  );
}

/* --------------------------------------------------------------- 布局 */

function buildLayout() {
  const config = store.state.config;
  const layout = config.layout;
  const currentStyle = styleById(config.style);
  const isList = currentStyle.form === 'list';

  const applyStyle = (id) => {
    const preset = styleById(id);
    config.style = preset.id;
    config.accent = preset.accent;
    applyConfig(store.state);
    applyBackground(store.state);
    refreshClock();
    store.commit('config');
    selectSection('layout');
    bodyEl.querySelector('.group .row .btn')?.focus({ preventScroll: true });
  };

  const nameInput = h('input', {
    class: 'text-input',
    type: 'text',
    value: layout.name || '',
    placeholder: t('留空则只显示问候语'),
    maxlength: '16',
    style: { width: '180px' },
    oninput: (event) => {
      layout.name = event.target.value;
      touch({ render: true });
    },
  });

  /* 列数：滑块给感觉，步进器给精确值。默认值就是当前生效的列数，
     所以打开设置不会看到任何跳变。 */
  const columnsHint = h('span');
  const columnsRange = makeRange({
    min: 3,
    max: 14,
    value: layout.columns,
    format: (value) => t('{value} 列', { value }),
    onInput: (value) => setColumns(value, 'slider'),
  });
  const columnsStepper = makeStepper({
    min: 3,
    max: 14,
    value: layout.columns,
    label: t('每行列数'),
    onChange: (value) => setColumns(value, 'stepper'),
  });

  function describeColumns(value) {
    if (isList) return t('文字列表不按列排布，切成图标网格后才生效');
    return t('当前 {value} 列 · 内容宽约 {width}px', {
      value,
      width: dockWidth({ ...layout, columns: value }),
    });
  }

  function setColumns(raw, source) {
    const value = Math.min(14, Math.max(3, Math.round(Number(raw) || 3)));
    layout.columns = value;
    if (source !== 'slider') {
      columnsRange.querySelector('input').value = String(value);
      columnsRange.querySelector('.value').textContent = t('{value} 列', { value });
    }
    columnsStepper.setValue(value);
    columnsHint.textContent = describeColumns(value);
    touch();
  }

  columnsHint.textContent = describeColumns(layout.columns);

  return h(
    'div',
    {},
    group(
      t('排列'),
      row(
        t('快捷方式形态'),
        isList
          ? t('当前「{style}」是文字列表，列数与图标大小不生效', { style: t(currentStyle.name) })
          : t('当前「{style}」是图标网格，按 {columns} 列排列', {
              style: t(currentStyle.name),
              columns: layout.columns,
            }),
        h('button', {
          class: 'btn',
          type: 'button',
          html: `${svgIcon(isList ? 'grid' : 'list', 14)}<span>${
            isList ? t('换成图标网格') : t('换成文字列表')
          }</span>`,
          onclick: () => applyStyle(isList ? 'noir' : 'editorial'),
        })
      ),
      row(
        t('每行列数'),
        columnsHint,
        [columnsStepper, columnsRange]
      ),
      row(
        t('图标大小'),
        '',
        makeRange({
          min: 44,
          max: 96,
          step: 2,
          value: layout.iconSize,
          format: (value) => `${value}px`,
          onInput: (value) => {
            layout.iconSize = value;
            columnsHint.textContent = describeColumns(layout.columns);
            touch();
          },
        })
      ),
      row(
        t('列间距'),
        t('决定内容总宽：网格与搜索框同宽，改这一项两者一起变'),
        makeRange({
          min: 4,
          max: 64,
          value: layout.gap,
          format: (value) => `${value}px`,
          onInput: (value) => {
            layout.gap = value;
            columnsHint.textContent = describeColumns(layout.columns);
            touch();
          },
        })
      ),
      row(
        t('行间距'),
        t('行与行之间的垂直留白，与列间距互不影响'),
        makeRange({
          min: 4,
          max: 64,
          value: layout.gapY,
          format: (value) => `${value}px`,
          onInput: (value) => {
            layout.gapY = value;
            touch();
          },
        })
      ),
      row(
        t('内容垂直居中'),
        t('关闭后内容从上方开始排列'),
        makeSwitch(layout.verticalCenter !== false, (value) => {
          layout.verticalCenter = value;
          touch();
        })
      )
    ),
    group(
      t('首屏元素'),
      row(t('时钟'), '', makeSwitch(layout.showClock, (value) => { layout.showClock = value; touch({ render: true }); })),
      row(t('日期'), '', makeSwitch(layout.showDate, (value) => { layout.showDate = value; touch({ render: true }); })),
      row(t('农历与节日'), '', makeSwitch(layout.showLunar, (value) => { layout.showLunar = value; touch({ render: true }); })),
      row(t('问候语'), '', makeSwitch(layout.showGreeting, (value) => { layout.showGreeting = value; touch({ render: true }); })),
      row(t('搜索框'), '', makeSwitch(layout.showSearch, (value) => { layout.showSearch = value; touch(); })),
      row(t('操作提示'), '', makeSwitch(layout.showHint !== false, (value) => { layout.showHint = value; touch(); })),
      row(t('天气'), '', makeSwitch(layout.showWeather, (value) => { layout.showWeather = value; touch(); }))
    ),
    group(
      t('时间'),
      row(t('24 小时制'), '', makeSwitch(layout.clock24, (value) => { layout.clock24 = value; touch({ render: true }); })),
      row(t('显示秒'), '', makeSwitch(layout.showSeconds, (value) => { layout.showSeconds = value; touch({ render: true }); })),
      row(t('称呼'), t('例如「小明」，会出现在问候语后面'), nameInput)
    ),
    group(
      t('侧边栏'),
      row(
        t('位置'),
        '',
        makeSegmented(
          [
            { value: 'right', label: t('右侧') },
            { value: 'left', label: t('左侧') },
            { value: 'hidden', label: t('隐藏') },
          ],
          config.sidebar,
          (value) => {
            if (value === 'hidden' && config.sidebar !== 'hidden') config.lastSidebar = config.sidebar;
            config.sidebar = value;
            touch();
          }
        )
      )
    )
  );
}

/* ----------------------------------------------------------- 快捷方式 */

/** 列表里的小图标：优先用内置品牌图标，和主面板保持一致 */
function favNode(item) {
  const descriptor = resolveIcon(item, { iconStyle: store.state.config.layout.iconStyle || 'brand' });
  const node = h('span', {
    class: `link-fav${descriptor.brand ? ' is-brand' : ''}`,
    text: descriptor.brand ? '' : descriptor.text,
    'aria-hidden': 'true',
  });
  if (!descriptor.brand) {
    node.style.background = `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`;
    if (descriptor.fg) node.style.color = descriptor.fg;
  }
  if (descriptor.pendingFileId) {
    previewFileIcon(descriptor.pendingFileId)
      .then((url) => {
        if (!url || !node.isConnected) return;
        const img = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
        img.addEventListener(
          'load',
          () => {
            Array.from(node.childNodes).forEach((child) => {
              if (child !== img) child.remove();
            });
          },
          { once: true }
        );
        img.addEventListener(
          'error',
          () => {
            img.remove();
            node.textContent = descriptor.text;
          },
          { once: true }
        );
        node.appendChild(img);
      })
      .catch(() => {});
  } else if (descriptor.src) {
    const img = h('img', { src: descriptor.src, alt: '', loading: 'lazy', decoding: 'async' });
    img.addEventListener(
      'load',
      () => {
        Array.from(node.childNodes).forEach((child) => {
          if (child !== img) child.remove();
        });
      },
      { once: true }
    );
    img.addEventListener(
      'error',
      () => {
        img.remove();
        node.classList.remove('is-brand');
        node.style.background = `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`;
        node.style.color = descriptor.fg;
        node.textContent = descriptor.text;
      },
      { once: true }
    );
    node.appendChild(img);
  }
  return node;
}

function buildShortcuts() {
  const config = store.state.config;
  const behavior = config.behavior;

  const list = h('div', { class: 'link-list', style: { maxHeight: '320px' } });
  const countTitle = h('div', {
    class: 'group-title',
    text: t('快捷方式 · {count}', { count: store.state.shortcuts.length }),
  });
  let pendingFocus = null;
  const paint = () => {
    const scrollTop = list.scrollTop;
    clear(list);
    countTitle.textContent = t('快捷方式 · {count}', { count: store.state.shortcuts.length });
    const items = [...store.state.shortcuts].sort((a, b) => a.order - b.order);
    const groupName = (id) => store.state.groups.find((group) => group.id === id)?.title;

    if (!items.length) {
      list.appendChild(h('div', { class: 'empty-state', text: t('还没有快捷方式') }));
    }

    for (const item of items) {
      const folder = item.groupId ? groupName(item.groupId) : '';
      list.appendChild(
        h(
          'div',
          { class: 'link-row', style: { cursor: 'default' } },
          favNode(item),
          h('span', { class: 'name', text: item.title, title: item.title }),
          folder ? h('span', { class: 'suggest-hint', text: folder }) : null,
          h('button', {
            class: 'card-action',
            type: 'button',
            title: t('编辑'),
            'aria-label': t('编辑{title}', { title: item.title }),
            'data-item-id': item.id,
            'data-item-action': 'edit',
            html: svgIcon('edit', 13),
            onclick: async () => {
              const result = await shortcutEditor({ shortcut: item, groups: store.state.groups });
              if (!result) return;
              pendingFocus = { id: item.id, action: 'edit' };
              store.updateShortcut(item.id, result);
              paint();
            },
          }),
          h('button', {
            class: 'card-action',
            type: 'button',
            title: t('删除'),
            'aria-label': t('删除{title}', { title: item.title }),
            'data-item-id': item.id,
            'data-item-action': 'delete',
            html: svgIcon('trash', 13),
            onclick: async () => {
              if (behavior.confirmDelete) {
                const ok = await confirmDialog({
                  title: t('删除快捷方式'),
                  message: t('确定删除「{title}」吗？', { title: item.title }),
                  confirmText: t('删除'),
                  danger: true,
                });
                if (!ok) return;
              }
              const sorted = [...store.state.shortcuts].sort((a, b) => a.order - b.order);
              const index = sorted.findIndex((entry) => entry.id === item.id);
              const neighbor = sorted[index + 1] || sorted[index - 1];
              pendingFocus = neighbor ? { id: neighbor.id, action: 'edit' } : null;
              const snapshot = { ...item };
              store.removeShortcut(item.id);
              paint();
              if (!neighbor) {
                // 删掉最后一条时列表里已经没有可聚焦的行，把焦点交给导入按钮
                bodyEl.querySelector('.group .row .btn')?.focus({ preventScroll: true });
              }
              bus.emit('toast', {
                text: t('已删除「{title}」', { title: item.title }),
                action: {
                  label: t('撤销'),
                  onClick: () => {
                    store.restoreShortcut(snapshot);
                    if (list.isConnected) {
                      pendingFocus = { id: snapshot.id, action: 'edit' };
                      paint();
                    } else if (root && isOpen && activeTab === 'shortcuts') {
                      // 撤销时用户可能已经切走/重开了设置页，旧列表节点不能再用
                      selectSection('shortcuts');
                      const escaped =
                        typeof CSS !== 'undefined' && CSS.escape
                          ? CSS.escape(snapshot.id)
                          : String(snapshot.id).replace(/"/g, '\\"');
                      bodyEl
                        .querySelector(`[data-item-id="${escaped}"][data-item-action="edit"]`)
                        ?.focus({ preventScroll: true });
                    }
                  },
                },
              });
            },
          })
        )
      );
    }

    if (pendingFocus) {
      const escaped =
        typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(pendingFocus.id) : pendingFocus.id.replace(/"/g, '\\"');
      list
        .querySelector(`[data-item-id="${escaped}"][data-item-action="${pendingFocus.action}"]`)
        ?.focus({ preventScroll: true });
      pendingFocus = null;
    }
    list.scrollTop = scrollTop;
  };
  paint();

  return h(
    'div',
    {},
    group(
      t('行为'),
      row(
        t('打开方式'),
        '',
        makeSegmented(
          [
            { value: 'new', label: t('新标签页') },
            { value: 'same', label: t('当前标签页') },
          ],
          behavior.shortcutsInNewTab ? 'new' : 'same',
          (value) => {
            behavior.shortcutsInNewTab = value === 'new';
            touch();
          }
        )
      ),
      row(
        t('删除前确认'),
        t('关闭后按 Delete 会直接删除'),
        makeSwitch(behavior.confirmDelete, (value) => {
          behavior.confirmDelete = value;
          touch();
        })
      )
    ),
    group(
      t('导入'),
      row(
        t('从浏览器书签导入'),
        t('会把「书签栏」下的条目导入到一个新文件夹，重复执行会再次导入'),
        h('button', {
          class: 'btn',
          type: 'button',
          html: `${svgIcon('bookmark', 14)}<span>${t('开始导入')}</span>`,
          onclick: () => importBookmarks(),
        })
      )
    ),
    h('div', { class: 'group' }, countTitle, h('div', { class: 'rows' }, list))
  );
}

async function requestPermission(name) {
  return new Promise((resolve) => {
    try {
      chrome.permissions.request({ permissions: [name] }, (granted) => {
        if (globalThis.chrome?.runtime?.lastError) {
          resolve(false);
          return;
        }
        resolve(Boolean(granted));
      });
    } catch {
      resolve(false);
    }
  });
}

function getBookmarkTree() {
  return new Promise((resolve) => {
    try {
      chrome.bookmarks.getTree((tree) => {
        if (globalThis.chrome?.runtime?.lastError) {
          resolve([]);
          return;
        }
        resolve(tree || []);
      });
    } catch {
      resolve([]);
    }
  });
}

async function importBookmarks() {
  if (bookmarkImporting) return;
  bookmarkImporting = true;
  try {
    await runBookmarkImport();
  } catch (err) {
    console.error('[serein/settings] bookmark import failed', err);
    bus.emit('toast', { text: t('书签导入失败，请重试'), error: true });
  } finally {
    bookmarkImporting = false;
  }
}

async function runBookmarkImport() {
  const granted = await requestPermission('bookmarks');
  if (!granted) {
    bus.emit('toast', { text: t('未获得书签权限'), error: true });
    return;
  }

  const tree = await getBookmarkTree();
  const rootChildren = Array.isArray(tree?.[0]?.children) ? tree[0].children : [];
  const bar = rootChildren.find((node) => node?.id === '1') || rootChildren[0];
  const collected = [];

  const walk = (nodes, depth) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (collected.length >= 60) return;
      if (!node || typeof node !== 'object') continue;
      if (typeof node.url === 'string' && node.url) {
        const url = normalizeUrl(node.url);
        if (url && isUsableUrl(url)) collected.push({ title: node.title || url, url });
      } else if (Array.isArray(node.children) && depth < 2) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(bar?.children || [], 0);

  if (!collected.length) {
    bus.emit('toast', { text: t('没有找到可导入的书签'), error: true });
    return;
  }

  const imported = store.importShortcuts(t('书签导入'), collected);
  bus.emit('toast', { text: t('已导入 {count} 个书签', { count: imported?.count || 0 }) });
  if (root && isOpen) {
    selectSection('shortcuts');
    // 「开始导入」按钮刚被重建掉了，把焦点交给新列表的第一个操作
    bodyEl.querySelector('.link-list .card-action')?.focus({ preventScroll: true });
  }
}

/* --------------------------------------------------------------- 小组件 */

function buildWidgets() {
  const widgets = store.state.config.widgets;
  const items = [
    ['todo', t('待办'), t('简单的勾选清单，数据本地保存')],
    ['notes', t('便签'), t('随手记，自动保存')],
    ['bookmarks', t('书签'), t('需要单独授权读取浏览器书签')],
    ['topSites', t('常去网站'), t('需要授权读取浏览记录中的高频站点')],
    ['pomodoro', t('专注计时'), t('25 分钟专注 + 5 分钟休息，状态跨标签页同步')],
    ['worldClock', t('世界时钟'), t('最多 6 个城市，点击卡片右上角选择')],
    ['countdown', t('倒计时'), t('为截止日期保留一个醒目的位置')],
  ];

  return group(
    t('侧边栏小组件'),
    ...items.map(([key, name, hint]) =>
      row(
        name,
        hint,
        makeSwitch(widgets[key], (value) => {
          widgets[key] = value;
          touch();
        })
      )
    )
  );
}

/* --------------------------------------------------------------- 搜索 */

function engineEditor(engine = null) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const nameInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: engine?.name || '',
      placeholder: t('例如：Perplexity'),
      maxlength: String(CUSTOM_ENGINE_NAME_MAX),
      'aria-label': t('引擎名称'),
      autocomplete: 'off',
    });
    const urlInput = h('input', {
      class: 'text-input',
      type: 'text',
      value: engine?.url || '',
      placeholder: 'https://www.perplexity.ai/search?q=%s',
      maxlength: '500',
      spellcheck: 'false',
      'aria-label': t('搜索地址模板'),
      autocomplete: 'off',
    });
    const error = h('div', { class: 'field-error', role: 'alert', hidden: true });
    const showError = (text) => {
      error.textContent = text;
      error.hidden = false;
    };

    const body = h(
      'div',
      {},
      h('div', { class: 'field' }, h('label', { text: t('名称') }), nameInput),
      h(
        'div',
        { class: 'field' },
        h('label', { text: t('搜索地址模板') }),
        urlInput,
        h(
          'div',
          { class: 'field-hint' },
          t('用 '),
          h('code', { text: '%s' }),
          t(' 代表搜索词，例如 '),
          h('code', { text: 'https://www.google.com/search?q=%s' })
        )
      ),
      error
    );

    let modal = null;
    const submit = () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      if (!name) {
        showError(t('请填写名称'));
        nameInput.focus();
        return;
      }
      if (!url.includes('%s')) {
        showError(t('搜索地址必须包含 %s 占位符'));
        urlInput.focus();
        return;
      }
      const next = sanitizeCustomEngine({ id: engine?.id, name, url });
      if (!next) {
        showError(t('只支持 http(s) 完整地址，且必须能被浏览器打开'));
        urlInput.focus();
        return;
      }
      finish(next);
      modal?.close();
    };
    const onKeydown = (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    };
    nameInput.addEventListener('keydown', onKeydown);
    urlInput.addEventListener('keydown', onKeydown);

    modal = openModal({
      title: engine ? t('编辑搜索引擎') : t('添加搜索引擎'),
      body,
      footer: [
        h('button', {
          class: 'btn',
          type: 'button',
          text: t('取消'),
          onclick: () => {
            finish(null);
            modal.close();
          },
        }),
        h('button', {
          class: 'btn is-primary',
          type: 'button',
          text: engine ? t('保存') : t('添加'),
          onclick: submit,
        }),
      ],
      onClose: () => finish(null),
    });

    setTimeout(() => {
      if (!nameInput.isConnected) return;
      nameInput.focus({ preventScroll: true });
      if (engine) nameInput.select();
    }, 60);
  });
}

function permissionRow(kind, name, hint) {
  const status = h('span', { class: 'field-hint', text: t('检测中…') });
  const actions = h('div', { class: 'btn-row' });
  const box = h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, status, actions);

  permissionGranted(kind).then((granted) => {
    if (!box.isConnected) return;
    clear(actions);
    if (!hasPermissionApi()) {
      status.textContent = t('安装扩展后可用');
      return;
    }
    if (granted) {
      status.textContent = t('已授权');
      actions.appendChild(
        h('button', {
          class: 'btn is-ghost',
          type: 'button',
          text: t('撤销'),
          'aria-label': t('撤销{name}权限', { name }),
          onclick: async () => {
            await revokePermission(kind);
            selectSection('search');
          },
        })
      );
    } else {
      status.textContent = t('未授权');
      actions.appendChild(
        h('button', {
          class: 'btn',
          type: 'button',
          text: t('授权'),
          'aria-label': t('授权{name}', { name }),
          onclick: async () => {
            // 直接调用 request，保留点击手势；授权后重建当前分区刷新状态
            const ok = await requestOptionalPermission(kind);
            bus.emit('toast', {
              text: ok ? t('已启用{name}搜索', { name }) : t('未获得权限'),
              error: !ok,
            });
            selectSection('search');
          },
        })
      );
    }
  });

  return row(name, hint, box);
}

function buildSearch() {
  const search = store.state.config.search;
  const recentCount = () => (Array.isArray(search.recent) ? search.recent.length : 0);
  const recentHint = h('span', {
    text: t('{n} 条，仅保存在本机；关掉上面的开关后不再新增', { n: recentCount() }),
  });
  const clearRecent = h('button', {
    class: 'btn',
    type: 'button',
    text: t('清除'),
    disabled: recentCount() === 0,
    onclick: () => {
      search.recent = [];
      recentHint.textContent = t('{n} 条，仅保存在本机；关掉上面的开关后不再新增', { n: 0 });
      clearRecent.disabled = true;
      touch();
    },
  });

  const allEngines = enginesFor(store.state.config);
  const engineGrid = h(
    'div',
    {
      class: 'swatch-grid',
      role: 'group',
      'aria-label': t('默认搜索引擎'),
      style: { gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' },
    },
    ...allEngines.map((engine) =>
      h(
        'button',
        {
          class: `btn${search.engine === engine.id ? ' is-primary' : ''}`,
          type: 'button',
          'data-engine-id': engine.id,
          'aria-pressed': String(search.engine === engine.id),
          style: { justifyContent: 'flex-start', height: '38px' },
          onclick: () => {
            search.engine = engine.id;
            touch();
            selectSection('search');
            bodyEl.querySelector('.swatch-grid .btn.is-primary')?.focus({ preventScroll: true });
          },
        },
        h('span', {
          class: 'engine-badge',
          text: engineLetter(engine),
          style: {
            background: engine.color,
            color: readableTextOn(engine.color),
            width: '20px',
            height: '20px',
            fontSize: '10px',
            borderRadius: '6px',
          },
        }),
        h('span', { text: engineName(engine) })
      )
    )
  );

  const customList = Array.isArray(search.engines) ? search.engines : [];
  const saveEngines = (next) => {
    search.engines = next;
    touch();
    selectSection('search');
  };
  const editEngine = async (engine) => {
    const draft = await engineEditor(engine);
    if (!draft) return;
    const duplicate = customList.some(
      (item) => item.id !== engine.id && item.url.toLowerCase() === draft.url.toLowerCase()
    );
    if (duplicate) {
      bus.emit('toast', { text: t('这个搜索地址已经添加过了'), error: true });
      return;
    }
    saveEngines(customList.map((item) => (item.id === engine.id ? { ...item, ...draft, id: item.id } : item)));
  };
  const addEngine = async () => {
    if (customList.length >= CUSTOM_ENGINE_LIMIT) {
      bus.emit('toast', { text: t('最多添加 {max} 个自定义引擎', { max: CUSTOM_ENGINE_LIMIT }), error: true });
      return;
    }
    const draft = await engineEditor();
    if (!draft) return;
    if (customList.some((item) => item.url.toLowerCase() === draft.url.toLowerCase())) {
      bus.emit('toast', { text: t('这个搜索地址已经添加过了'), error: true });
      return;
    }
    saveEngines([...customList, draft]);
  };
  const removeEngine = async (engine) => {
    const ok = await confirmDialog({
      title: t('删除搜索引擎'),
      message: t('确定删除「{name}」吗？如果它是当前默认引擎，会切回百度。', {
        name: engineName(engine),
      }),
      confirmText: t('删除'),
      danger: true,
    });
    if (!ok) return;
    if (search.engine === engine.id) search.engine = 'baidu';
    saveEngines(customList.filter((item) => item.id !== engine.id));
  };

  const customRows = customList.map((engine) =>
    row(
      engine.name,
      prettyHost(engine.url),
      h(
        'div',
        { class: 'btn-row' },
        h('button', {
          class: 'btn is-ghost',
          type: 'button',
          text: t('编辑'),
          'aria-label': t('编辑 {name}', { name: engine.name }),
          onclick: () => editEngine(engine),
        }),
        h('button', {
          class: 'btn is-ghost',
          type: 'button',
          text: t('删除'),
          'aria-label': t('删除 {name}', { name: engine.name }),
          onclick: () => removeEngine(engine),
        })
      )
    )
  );
  if (!customRows.length) {
    customRows.push(
      row(t('还没有自定义引擎'), t('可以接入公司内网搜索、垂直站点或自建搜索服务'), null)
    );
  }
  customRows.push(
    row(
      t('添加搜索引擎'),
      t('{n} / {max}；只影响本页搜索，不会改动浏览器默认引擎', {
        n: customList.length,
        max: CUSTOM_ENGINE_LIMIT,
      }),
      h('button', {
        class: 'btn is-primary',
        type: 'button',
        text: t('添加引擎'),
        disabled: customList.length >= CUSTOM_ENGINE_LIMIT,
        onclick: addEngine,
      })
    )
  );

  return h(
    'div',
    {},
    group(t('默认引擎'), engineGrid),
    group(t('自定义引擎'), ...customRows),
    group(
      t('命令面板'),
      permissionRow(
        'tabs',
        t('搜索打开的标签页'),
        t('在搜索框输入「tab 关键词」；需要 tabs 权限，可随时撤销')
      ),
      permissionRow(
        'bookmarks',
        t('搜索书签'),
        t('在搜索框输入「bookmark 关键词」；与书签小组件共用同一个可选权限')
      ),
      permissionRow(
        'history',
        t('搜索浏览历史'),
        t('在搜索框输入「history 关键词」；历史只在本机读取，不会上传')
      ),
      h(
        'div',
        { class: 'info-block' },
        t('命令面板还支持 '),
        h('code', { text: t('todo 买牛奶') }),
        t('、'),
        h('code', { text: t('note 记一句') }),
        t('、'),
        h('code', { text: t('copy 一段文字') }),
        t('，回车立即执行。')
      )
    ),
    group(
      t('联想与跳转'),
      row(
        t('搜索联想'),
        t('Google / 必应 / 百度 / 360 / DuckDuckGo / 哔哩哔哩支持；仅在你输入时请求对应接口'),
        makeSwitch(search.suggestions, (value) => {
          search.suggestions = value;
          touch();
        })
      ),
      row(
        t('记录最近搜索'),
        t('聚焦搜索框时显示最近 {max} 条关键词；只保存在本机，不会上传', {
          max: RECENT_SEARCH_LIMIT,
        }),
        makeSwitch(search.history, (value) => {
          search.history = value;
          touch();
        })
      ),
      row(t('最近搜索记录'), recentHint, clearRecent),
      row(
        t('在新标签页打开结果'),
        t('关闭后直接在当前新标签页里跳转'),
        makeSwitch(search.openInNewTab, (value) => {
          search.openInNewTab = value;
          touch();
        })
      )
    ),
    group(
      t('说明'),
      h(
        'div',
        { class: 'info-block' },
        'Serein ',
        h('strong', { text: t('不会') }),
        t(
          ' 修改浏览器的默认搜索引擎。这里的引擎只决定你在本页输入内容后跳转到哪个搜索地址 —— 这是刻意设计：修改默认搜索引擎会触发应用商店的额外审核。'
        )
      )
    )
  );
}

/* --------------------------------------------------------------- 数据 */

function buildData() {
  const meter = h('i', { style: { width: '0%' } });
  const usageText = h('div', { class: 'field-hint', style: { marginTop: '8px' }, text: t('统计中…') });

  usageReport().then((report) => {
    const total = report.configBytes + report.assetBytes;
    const pct = Math.min(100, (total / (5 * 1024 * 1024)) * 100);
    meter.style.width = `${Math.max(2, pct)}%`;
    usageText.textContent = t('配置 {config} · 资产 {count} 个 / {assets} · 更新于 {time}', {
      config: formatBytes(report.configBytes),
      count: report.assetCount,
      assets: formatBytes(report.assetBytes),
      time: relativeTime(store.state.meta.updatedAt),
    });
  });

  const importInput = h('input', {
    type: 'file',
    accept: 'application/zip,.zip,application/json,.json',
    style: { display: 'none' },
    onchange: async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const result = await importState(file);
        applyBackground(store.state);
        refreshClock();
        bus.emit('toast', {
          text: result.assets
            ? t('已导入 {count} 个快捷方式、{assets} 张图片', {
                count: result.count,
                assets: result.assets,
              })
            : t('已导入 {count} 个快捷方式（旧格式备份不含图片）', { count: result.count }),
        });
        if (isOpen) {
          selectSection('data');
          navEl.querySelector('.nav-item.is-active')?.focus({ preventScroll: true });
        }
      } catch (err) {
        bus.emit('toast', { text: t('导入失败：{message}', { message: err.message }), error: true });
      }
      event.target.value = '';
    },
  });

  return h(
    'div',
    {},
    group(
      t('备份'),
      row(
        t('导出配置'),
        t('生成 zip 备份：配置、快捷方式、待办、最近搜索，以及上传的壁纸、图标和字体'),
        h('button', {
          class: 'btn',
          type: 'button',
          html: `${svgIcon('download', 14)}<span>${t('导出')}</span>`,
          onclick: async () => {
            try {
              const result = await exportState();
              bus.emit('toast', {
                text: t('已导出备份（含 {count} 张图片，{size}）', {
                  count: result.assetCount,
                  size: formatBytes(result.bytes),
                }),
              });
            } catch (err) {
              bus.emit('toast', { text: t('导出失败：{message}', { message: err.message }), error: true });
            }
          },
        })
      ),
      row(
        t('导入配置'),
        t('支持新的 zip 备份（含图片）与旧版 JSON 备份；会覆盖现有配置、快捷方式、待办与便签'),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center' } },
          h('button', {
            class: 'btn',
            type: 'button',
            html: `${svgIcon('upload', 14)}<span>${t('选择文件')}</span>`,
            onclick: () => importInput.click(),
          }),
          importInput
        )
      )
    ),
    group(
      t('存储'),
      row(t('本地占用'), '', h('div', { style: { width: '100%', maxWidth: '260px' } }, h('div', { class: 'meter' }, meter), usageText), {
        stacked: true,
      })
    ),
    group(
      t('危险操作'),
      row(
        t('恢复默认设置'),
        t('会清空快捷方式、待办、便签与上传的图片'),
        h('button', {
          class: 'btn is-danger',
          type: 'button',
          text: t('重置'),
          onclick: async () => {
            const ok = await confirmDialog({
              title: t('恢复默认设置'),
              message: t('所有自定义内容都会被删除，且无法恢复。确定继续吗？'),
              confirmText: t('确认重置'),
              danger: true,
            });
            if (!ok) return;
            await resetAll();
            bus.emit('toast', { text: t('已恢复默认设置') });
            setTimeout(() => location.reload(), 400);
          },
        })
      )
    ),
    group(
      t('隐私'),
      h(
        'div',
        { class: 'info-block' },
        h('strong', { text: t('没有账号，没有云端，没有联盟链接。') }),
        t(' 所有配置存在浏览器本地（localStorage + IndexedDB）；图标链接绝不会被改写为推广链接；扩展不会上传任何浏览数据。')
      )
    )
  );
}

/* --------------------------------------------------------------- 关于 */

const PERMISSIONS = [
  ['storage', '保存配置到本机'],
  ['unlimitedStorage', '保存较大尺寸的本地壁纸'],
  ['favicon', '读取站点图标的本地缓存（不联网、不上传）'],
  ['bookmarks（可选）', '导入书签、显示书签组件、命令面板搜索书签'],
  ['topSites（可选）', '显示「常去网站」组件'],
  ['tabs（可选）', '命令面板搜索已打开的标签页（只读标题与地址）'],
  ['history（可选）', '命令面板搜索浏览历史（只读本机记录）'],
];

const NETWORK = [
  ['cn.bing.com', '必应每日壁纸'],
  ['api.bing.com', '必应搜索联想'],
  ['suggestion.baidu.com', '百度搜索联想'],
  ['sug.so.360.cn', '360 搜索联想'],
  ['suggestqueries.google.com', 'Google 搜索联想'],
  ['duckduckgo.com', 'DuckDuckGo 搜索联想'],
  ['s.search.bilibili.com', '哔哩哔哩搜索联想'],
  ['api.open-meteo.com', '天气数据'],
  ['geocoding-api.open-meteo.com', '城市搜索'],
];

function buildAbout() {
  const table = (rows, headers) =>
    h(
      'table',
      { class: 'perm-table' },
      h('thead', {}, h('tr', {}, ...headers.map((text) => h('th', { text: t(text) })))),
      h(
        'tbody',
        {},
        ...rows.map((cells) => h('tr', {}, ...cells.map((text) => h('td', { text: t(text) }))))
      )
    );

  return h(
    'div',
    {},
    group(
      t('版本'),
      row(
        `${APP.name} ${t(APP.subtitle)}`,
        t('v{version} · 数据格式 v{schema} · 零依赖纯前端实现', {
          version: APP.version,
          schema: APP.schema,
        }),
        h('button', {
          class: 'btn',
          type: 'button',
          html: `${svgIcon('keyboard', 14)}<span>${t('快捷键')}</span>`,
          onclick: () => showShortcuts(),
        })
      )
    ),
    group(
      t('权限清单'),
      h(
        'div',
        { class: 'info-block' },
        t(
          '常驻 3 个基础权限（下表前三项）与 9 个固定服务域名（见「网络请求」）；没有 <all_urls>，没有远程代码。'
        )
      ),
      h(
        'div',
        { class: 'info-block', style: { padding: '4px 0', background: 'transparent', border: 'none' } },
        table(PERMISSIONS, [t('权限'), t('用途说明')])
      )
    ),
    group(
      t('网络请求'),
      h(
        'div',
        { class: 'info-block', style: { padding: '4px 0', background: 'transparent', border: 'none' } },
        table(NETWORK, [t('域名'), t('用途')])
      )
    ),
    group(
      t('许可与致谢'),
      h(
        'div',
        { class: 'info-block' },
        t('本项目以 CC BY-NC-SA 4.0 发布：禁止商业使用；二次开发须以相同许可分发并保留署名。'),
        h('br'),
        h('br'),
        t('本扩展为净室实现，未包含任何 GPL / AGPL 项目的代码。'),
        h('br'),
        h('br'),
        t('天气数据由 '),
        h('strong', { text: 'Open-Meteo' }),
        t(' 提供（免费层仅限非商业用途）；每日壁纸来自 '),
        h('strong', { text: t('必应') }),
        t(' 公开接口，版权归原作者，仅用于个人桌面欣赏。'),
        h('br'),
        h('br'),
        t('第三方数据与素材仍受各自许可约束；品牌标识不随本项目许可授权。')
      )
    )
  );
}

function showShortcuts() {
  const isMac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
  const mod = isMac ? '⌘' : 'Ctrl';
  const rows = [
    [`${mod} + K`, t('聚焦搜索框')],
    ['/', t('聚焦搜索框（非输入状态）')],
    [`${mod} + ,`, t('打开设置')],
    ['Esc', t('关闭浮层 / 收起联想（搜索框里再按一次清空）')],
    ['↑ ↓', t('在搜索结果间移动')],
    ['Tab', t('收起联想并离开搜索框')],
    ['← → ↑ ↓', t('在图标间移动焦点')],
    ['Enter', t('打开选中的图标')],
    ['F2', t('编辑选中的图标')],
    ['Delete', t('删除选中的图标')],
    [t('中键 / ') + mod + t(' + 点击'), t('在后台新标签页打开')],
    [t('Shift + 点击'), t('在前台新标签页打开')],
  ];

  const body = h(
    'div',
    { class: 'kbd-list', style: { flexDirection: 'column', gap: '9px' } },
    ...rows.map(([key, desc]) =>
      h('div', { style: { justifyContent: 'space-between', width: '100%' } }, h('kbd', { text: key }), h('span', { text: desc }))
    )
  );

  openModal({ title: t('快捷键'), body, footer: [] });
}

/* --------------------------------------------------------------- 注册 */

const BUILDERS = {
  appearance: buildAppearance,
  wallpaper: buildWallpaper,
  layout: buildLayout,
  shortcuts: buildShortcuts,
  widgets: buildWidgets,
  search: buildSearch,
  data: buildData,
  about: buildAbout,
};

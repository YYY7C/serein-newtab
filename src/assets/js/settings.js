/* Serein · 设置面板
 *
 * 全屏浮层 + 左侧分区导航。所有改动即时生效，无需「保存」按钮。
 */

import { h, clear, svgIcon, bus, debounce, relativeTime, formatBytes, normalizeUrl, isUsableUrl } from './util.js';
import * as store from './store.js';
import { makeSwitch, makeSegmented, makeRange, makeStepper, shortcutEditor, confirmDialog, openModal } from './modals.js';
import { GRADIENTS, ENGINES, engineById, APP, STYLES, styleById, RECENT_SEARCH_LIMIT } from './defaults.js';
import { applyBackground, applyBackgroundLook, cycleBing, fetchBingGallery, saveLocalWallpaper, styleVeilPercent, STYLE_VEIL } from './wallpaper.js';
import { applyConfig, dockWidth } from './theme.js';
import { exportState, importState, resetAll, usageReport } from './data.js';
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
let closeSeq = 0;
// 读权限 + 遍历书签树是异步的，连点两次会导入两个同名文件夹
let bookmarkImporting = false;

/* --------------------------------------------------------------- 基座 */

export function initSettings() {
  const scrim = h('div', { class: 'scrim' });

  navEl = h('nav', { class: 'settings-nav' });
  bodyEl = h('div', { class: 'settings-body scroll' });

  panel = h('div', { class: 'settings-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '设置' }, navEl, bodyEl);
  root = h('div', { class: 'settings' }, scrim, panel);
  document.body.appendChild(root);

  buildNav();

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
        h('span', { text: section.label })
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
      h('h1', { class: 'settings-title', text: section.label }),
      h('p', { class: 'settings-desc', text: HEADERS[section.id] || '' })
    ),
    h('button', {
      class: 'settings-close',
      type: 'button',
      'aria-label': '关闭设置',
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

/* --------------------------------------------------------------- 外观 */

function buildAppearance() {
  const config = store.state.config;
  const bg = config.background;

  /* ---- 视觉风格选择器 ---- */
  const styleDesc = h('div', { class: 'field-hint', style: { marginTop: '10px' }, text: styleById(config.style).desc });
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
          title: preset.desc,
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
            h('span', { text: preset.name }),
            h('span', { class: `style-form is-${preset.form}`, text: preset.form === 'list' ? '列表' : '网格' })
          )
        )
      )
    );
  }

  return h(
    'div',
    {},
    group('视觉风格', h('div', { style: { padding: '13px 15px' } }, styleGrid, styleDesc)),
    group(
      '色彩',
      row(
        '强调色',
        '用于开关、焦点环与高亮状态',
        h(
          'div',
          { class: 'color-dots' },
          ...ACCENTS.map((color) =>
            h('button', {
              class: `color-dot${config.accent === color ? ' is-active' : ''}`,
              type: 'button',
              title: color,
              'aria-label': `强调色 ${color}`,
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
            { class: 'color-picker', title: '自定义颜色' },
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
        '文字色调',
        '浅色壁纸上自动用深色文字；也可以手动锁定',
        makeSegmented(
          [
            { value: 'auto', label: '自动' },
            { value: 'dark', label: '浅色文字' },
            { value: 'light', label: '深色文字' },
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
      '质感',
      row(
        '毛玻璃模糊',
        '数值越大越朦胧，性能开销也越高',
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
        '圆角',
        '0 为直角，36 接近胶囊',
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
        '界面缩放',
        '放大或缩小主界面的文字与控件',
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
      '图标',
      row(
        '图标样式',
        '内置矢量图标离线可用、任意尺寸清晰；网站图标取自 Chrome 本地缓存',
        makeSegmented(
          [
            { value: 'brand', label: '品牌图标' },
            { value: 'favicon', label: '网站图标' },
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
      '效果',
      row(
        '动效',
        '关闭后所有过渡动画立即完成',
        makeSwitch(config.animations !== false, (value) => {
          config.animations = value;
          touch();
        })
      ),
      row(
        '性能模式',
        '关闭毛玻璃与壁纸漂移动画，减少合成开销；显卡驱动异常、页面卡顿时使用',
        makeSwitch(config.performance === true, (value) => {
          config.performance = value;
          touch();
        })
      )
    )
  );
}

/* --------------------------------------------------------------- 壁纸 */

function buildWallpaper() {
  const config = store.state.config;
  const bg = config.background;

  const gallery = h('div', { class: 'swatch-grid', role: 'group', 'aria-label': '渐变预设' });
  for (const preset of GRADIENTS) {
    gallery.appendChild(
      h(
        'button',
        {
          class: `swatch${bg.gradient === preset.id && bg.type === 'gradient' ? ' is-active' : ''}${preset.tone === 'light' ? ' is-light' : ''}`,
          type: 'button',
          title: preset.name,
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
        h('span', { text: preset.name })
      )
    );
  }

  const typeControl = makeSegmented(
    [
      { value: 'gradient', label: '渐变' },
      { value: 'bing', label: '必应' },
      { value: 'url', label: '图片' },
      { value: 'file', label: '本地' },
      { value: 'color', label: '纯色' },
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
    const hint = h('div', { class: 'field-hint', text: '正在获取最近 8 天…' });
    // 换图后版权说明也要跟着变，否则会一直停在打开面板时那张
    const currentLabel = h('span', { text: bg.bing?.copyright || '每天更新一张，来自 cn.bing.com 公开接口' });

    const paint = () => {
      currentLabel.textContent = bg.bing?.copyright || '每天更新一张，来自 cn.bing.com 公开接口';
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
          hint.textContent = '没有取到壁纸，请检查网络后重试';
          return;
        }
        hint.textContent = `最近 ${items.length} 天 · 点击任意一张即刻应用`;
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
              h('span', { class: 'bing-item__date', text: item.idx === 0 ? '今天' : item.date })
            )
          );
        }
        paint();
      })
      .catch(() => {
        hint.textContent = '获取失败，请检查网络后重试';
      });

    sourceRows.push(
      row(
        '必应每日壁纸',
        currentLabel,
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            html: `${svgIcon('refresh', 14)}<span>随机一张</span>`,
            onclick: async () => {
              // 1..7 的随机步长 = 随机换到另外 7 天中的一张，不会原地不动
              await cycleBing(store.state, 1 + Math.floor(Math.random() * 7));
              touch();
              paint();
            },
          }
        )
      ),
      row('历史壁纸', '必应保留最近 8 天，挑一张喜欢的固定下来', h('div', {}, gallery, hint), { stacked: true })
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
    sourceRows.push(row('图片地址', '支持任意可在浏览器中打开的图片链接', input, { stacked: true }));
  }

  if (bg.type === 'file') {
    const fileInput = h('input', {
      type: 'file',
      accept: 'image/*',
      style: { display: 'none' },
      onchange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          bus.emit('toast', { text: '请选择图片文件', error: true });
          event.target.value = '';
          return;
        }
        if (file.size > 24 * 1024 * 1024) {
          bus.emit('toast', { text: '图片超过 24 MB，请压缩后再试', error: true });
          event.target.value = '';
          return;
        }
        const seq = ++wallpaperUploadSeq;
        const id = await saveLocalWallpaper(file).catch(() => '');
        if (!id) {
          if (seq === wallpaperUploadSeq) {
            bus.emit('toast', { text: '壁纸保存失败，请检查浏览器存储空间', error: true });
            event.target.value = '';
          }
          return;
        }
        // 用户在上传途中又选了另一张：丢弃这次迟到的结果
        if (seq !== wallpaperUploadSeq || store.state.config.background !== bg) {
          const { files } = await import('./storage.js');
          files.remove(`wallpaper:${id}`);
          if (seq === wallpaperUploadSeq) event.target.value = '';
          return;
        }
        const oldFileId = bg.fileId;
        bg.fileId = id;
        applyBackground(store.state);
        touch();
        // 先把新 fileId 同步落盘，确认成功后再删除旧文件；
        // 否则崩溃/配额失败时会出现「状态指向旧文件，但旧文件已经被删掉」。
        const persisted = store.flushNow();
        if (!persisted) {
          // 落盘失败：回退到旧壁纸并清掉刚落盘的新文件，
          // 否则刷新后会回到旧状态，新文件还会变成无人引用的孤儿。
          bg.fileId = oldFileId;
          applyBackground(store.state);
          const { files: assetFiles } = await import('./storage.js');
          assetFiles.remove(`wallpaper:${id}`);
          event.target.value = '';
          return;
        }
        if (oldFileId && oldFileId !== id) {
          const { files } = await import('./storage.js');
          files.remove(`wallpaper:${oldFileId}`);
        }
        event.target.value = '';
        // 保存大图可能耗时，用户可能已经切到别的分区；不要强行把他拽回壁纸页
        if (isOpen && activeTab === 'wallpaper') {
          selectSection('wallpaper');
          // 原来的上传按钮已被重建，键盘焦点先回到当前分区导航
          navEl.querySelector('.nav-item.is-active')?.focus({ preventScroll: true });
        }
        bus.emit('toast', { text: '已应用本地壁纸' });
      },
    });
    sourceRows.push(
      row(
        '本地上传',
        bg.fileId ? '已保存到浏览器 IndexedDB，可离线使用' : '支持 JPG / PNG / WebP，建议不超过 24 MB',
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center' } },
          h('button', {
            class: 'btn',
            type: 'button',
            html: `${svgIcon('upload', 14)}<span>${bg.fileId ? '更换图片' : '选择图片'}</span>`,
            onclick: () => fileInput.click(),
          }),
          fileInput
        )
      )
    );
  }

  if (bg.type === 'color') {
    sourceRows.push(
      row(
        '纯色背景',
        '最省资源的选择',
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
  const styleName = styleById(styleId).name;
  const veilInactive = styleId === 'editorial' || styleId === 'terminal';
  const veilDefault = STYLE_VEIL[styleId] ?? 0;
  const veilHint = veilInactive
    ? `「${styleName}」用整页实底铺满，遮罩不参与渲染`
    : `「${styleName}」默认 ${veilDefault}%，各风格分别记忆；调低可透出更多壁纸`;
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
    'aria-label': '恢复当前风格的默认遮罩强度',
    title: '恢复当前风格的默认遮罩强度',
    html: `${svgIcon('refresh', 13)}<span>默认</span>`,
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

  return h(
    'div',
    {},
    group('来源', row('壁纸类型', '切换后立即应用', typeControl), ...sourceRows),
    bg.type === 'gradient' ? group('渐变预设', gallery) : null,
    group(
      '调整',
      row(
        '模糊',
        '大数值会同时放大画面以消除边缘',
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
        '亮度',
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
        '饱和度',
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
        '风格遮罩',
        veilHint,
        [veilRange, veilReset]
      ),
      row(
        '暗角',
        '四周轻微压暗，让中心内容更聚焦',
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
    placeholder: '留空则只显示问候语',
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
    format: (value) => `${value} 列`,
    onInput: (value) => setColumns(value, 'slider'),
  });
  const columnsStepper = makeStepper({
    min: 3,
    max: 14,
    value: layout.columns,
    label: '每行列数',
    onChange: (value) => setColumns(value, 'stepper'),
  });

  function describeColumns(value) {
    if (isList) return '文字列表不按列排布，切成图标网格后才生效';
    return `当前 ${value} 列 · 内容宽约 ${dockWidth({ ...layout, columns: value })}px`;
  }

  function setColumns(raw, source) {
    const value = Math.min(14, Math.max(3, Math.round(Number(raw) || 3)));
    layout.columns = value;
    if (source !== 'slider') {
      columnsRange.querySelector('input').value = String(value);
      columnsRange.querySelector('.value').textContent = `${value} 列`;
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
      '排列',
      row(
        '快捷方式形态',
        isList
          ? `当前「${currentStyle.name}」是文字列表，列数与图标大小不生效`
          : `当前「${currentStyle.name}」是图标网格，按 ${layout.columns} 列排列`,
        h('button', {
          class: 'btn',
          type: 'button',
          html: `${svgIcon(isList ? 'grid' : 'list', 14)}<span>${isList ? '换成图标网格' : '换成文字列表'}</span>`,
          onclick: () => applyStyle(isList ? 'noir' : 'editorial'),
        })
      ),
      row(
        '每行列数',
        columnsHint,
        [columnsStepper, columnsRange]
      ),
      row(
        '图标大小',
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
        '列间距',
        '决定内容总宽：网格与搜索框同宽，改这一项两者一起变',
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
        '行间距',
        '行与行之间的垂直留白，与列间距互不影响',
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
        '内容垂直居中',
        '关闭后内容从上方开始排列',
        makeSwitch(layout.verticalCenter !== false, (value) => {
          layout.verticalCenter = value;
          touch();
        })
      )
    ),
    group(
      '首屏元素',
      row('时钟', '', makeSwitch(layout.showClock, (value) => { layout.showClock = value; touch({ render: true }); })),
      row('日期', '', makeSwitch(layout.showDate, (value) => { layout.showDate = value; touch({ render: true }); })),
      row('农历与节日', '', makeSwitch(layout.showLunar, (value) => { layout.showLunar = value; touch({ render: true }); })),
      row('问候语', '', makeSwitch(layout.showGreeting, (value) => { layout.showGreeting = value; touch({ render: true }); })),
      row('搜索框', '', makeSwitch(layout.showSearch, (value) => { layout.showSearch = value; touch(); })),
      row('操作提示', '', makeSwitch(layout.showHint !== false, (value) => { layout.showHint = value; touch(); })),
      row('天气', '', makeSwitch(layout.showWeather, (value) => { layout.showWeather = value; touch(); }))
    ),
    group(
      '时间',
      row('24 小时制', '', makeSwitch(layout.clock24, (value) => { layout.clock24 = value; touch({ render: true }); })),
      row('显示秒', '', makeSwitch(layout.showSeconds, (value) => { layout.showSeconds = value; touch({ render: true }); })),
      row('称呼', '例如「小明」，会出现在问候语后面', nameInput)
    ),
    group(
      '侧边栏',
      row(
        '位置',
        '',
        makeSegmented(
          [
            { value: 'right', label: '右侧' },
            { value: 'left', label: '左侧' },
            { value: 'hidden', label: '隐藏' },
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
  const countTitle = h('div', { class: 'group-title', text: `快捷方式 · ${store.state.shortcuts.length}` });
  let pendingFocus = null;
  const paint = () => {
    const scrollTop = list.scrollTop;
    clear(list);
    countTitle.textContent = `快捷方式 · ${store.state.shortcuts.length}`;
    const items = [...store.state.shortcuts].sort((a, b) => a.order - b.order);
    const groupName = (id) => store.state.groups.find((group) => group.id === id)?.title;

    if (!items.length) {
      list.appendChild(h('div', { class: 'empty-state', text: '还没有快捷方式' }));
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
            title: '编辑',
            'aria-label': `编辑${item.title}`,
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
            title: '删除',
            'aria-label': `删除${item.title}`,
            'data-item-id': item.id,
            'data-item-action': 'delete',
            html: svgIcon('trash', 13),
            onclick: async () => {
              if (behavior.confirmDelete) {
                const ok = await confirmDialog({
                  title: '删除快捷方式',
                  message: `确定删除「${item.title}」吗？`,
                  confirmText: '删除',
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
                text: `已删除「${item.title}」`,
                action: {
                  label: '撤销',
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
      '行为',
      row(
        '打开方式',
        '',
        makeSegmented(
          [
            { value: 'new', label: '新标签页' },
            { value: 'same', label: '当前标签页' },
          ],
          behavior.shortcutsInNewTab ? 'new' : 'same',
          (value) => {
            behavior.shortcutsInNewTab = value === 'new';
            touch();
          }
        )
      ),
      row(
        '删除前确认',
        '关闭后按 Delete 会直接删除',
        makeSwitch(behavior.confirmDelete, (value) => {
          behavior.confirmDelete = value;
          touch();
        })
      )
    ),
    group(
      '导入',
      row(
        '从浏览器书签导入',
        '会把「书签栏」下的条目导入到一个新文件夹，重复执行会再次导入',
        h('button', {
          class: 'btn',
          type: 'button',
          html: `${svgIcon('bookmark', 14)}<span>开始导入</span>`,
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
    console.error('[serein/settings] 书签导入失败', err);
    bus.emit('toast', { text: '书签导入失败，请重试', error: true });
  } finally {
    bookmarkImporting = false;
  }
}

async function runBookmarkImport() {
  const granted = await requestPermission('bookmarks');
  if (!granted) {
    bus.emit('toast', { text: '未获得书签权限', error: true });
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
    bus.emit('toast', { text: '没有找到可导入的书签', error: true });
    return;
  }

  const imported = store.importShortcuts('书签导入', collected);
  bus.emit('toast', { text: `已导入 ${imported?.count || 0} 个书签` });
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
    ['todo', '待办', '简单的勾选清单，数据本地保存'],
    ['notes', '便签', '随手记，自动保存'],
    ['bookmarks', '书签', '需要单独授权读取浏览器书签'],
    ['topSites', '常去网站', '需要授权读取浏览记录中的高频站点'],
  ];

  return group(
    '侧边栏小组件',
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

function buildSearch() {
  const search = store.state.config.search;
  const recentCount = () => (Array.isArray(search.recent) ? search.recent.length : 0);
  const recentHint = h('span', {
    text: `${recentCount()} 条，仅保存在本机；关掉上面的开关后不再新增`,
  });
  const clearRecent = h('button', {
    class: 'btn',
    type: 'button',
    text: '清除',
    disabled: recentCount() === 0,
    onclick: () => {
      search.recent = [];
      recentHint.textContent = '0 条，仅保存在本机；关掉上面的开关后不再新增';
      clearRecent.disabled = true;
      touch();
    },
  });

  const engineGrid = h(
    'div',
    {
      class: 'swatch-grid',
      role: 'group',
      'aria-label': '默认搜索引擎',
      style: { gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' },
    },
    ...ENGINES.map((engine) =>
      h(
        'button',
        {
          class: `btn${search.engine === engine.id ? ' is-primary' : ''}`,
          type: 'button',
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
          text: engine.letter,
          style: { background: engine.color, width: '20px', height: '20px', fontSize: '10px', borderRadius: '6px' },
        }),
        h('span', { text: engine.name })
      )
    )
  );

  return h(
    'div',
    {},
    group('默认引擎', engineGrid),
    group(
      '联想与跳转',
      row(
        '搜索联想',
        'Google / 必应 / 百度 / 360 / DuckDuckGo / 哔哩哔哩支持；仅在你输入时请求对应接口',
        makeSwitch(search.suggestions, (value) => {
          search.suggestions = value;
          touch();
        })
      ),
      row(
        '记录最近搜索',
        `聚焦搜索框时显示最近 ${RECENT_SEARCH_LIMIT} 条关键词；只保存在本机，不会上传`,
        makeSwitch(search.history, (value) => {
          search.history = value;
          touch();
        })
      ),
      row('最近搜索记录', recentHint, clearRecent),
      row(
        '在新标签页打开结果',
        '关闭后直接在当前新标签页里跳转',
        makeSwitch(search.openInNewTab, (value) => {
          search.openInNewTab = value;
          touch();
        })
      )
    ),
    group(
      '说明',
      h(
        'div',
        { class: 'info-block' },
        'Serein ',
        h('strong', { text: '不会' }),
        ' 修改浏览器的默认搜索引擎。这里的引擎只决定你在本页输入内容后跳转到哪个搜索地址 —— 这是刻意设计：修改默认搜索引擎会触发应用商店的额外审核。'
      )
    )
  );
}

/* --------------------------------------------------------------- 数据 */

function buildData() {
  const meter = h('i', { style: { width: '0%' } });
  const usageText = h('div', { class: 'field-hint', style: { marginTop: '8px' }, text: '统计中…' });

  usageReport().then((report) => {
    const total = report.configBytes + report.assetBytes;
    const pct = Math.min(100, (total / (5 * 1024 * 1024)) * 100);
    meter.style.width = `${Math.max(2, pct)}%`;
    usageText.textContent = `配置 ${formatBytes(report.configBytes)} · 资产 ${report.assetCount} 个 / ${formatBytes(
      report.assetBytes
    )} · 更新于 ${relativeTime(store.state.meta.updatedAt)}`;
  });

  const importInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    style: { display: 'none' },
    onchange: async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const result = await importState(file);
        applyBackground(store.state);
        refreshClock();
        bus.emit('toast', { text: `已导入 ${result.count} 个快捷方式` });
        if (isOpen) {
          selectSection('data');
          navEl.querySelector('.nav-item.is-active')?.focus({ preventScroll: true });
        }
      } catch (err) {
        bus.emit('toast', { text: `导入失败：${err.message}`, error: true });
      }
      event.target.value = '';
    },
  });

  return h(
    'div',
    {},
    group(
      '备份',
      row(
        '导出配置',
        '生成 JSON 备份（含配置、快捷方式、待办与最近搜索，不含上传的图片文件）',
        h('button', {
          class: 'btn',
          type: 'button',
          html: `${svgIcon('download', 14)}<span>导出</span>`,
          onclick: () => {
            exportState();
            bus.emit('toast', { text: '已生成备份文件' });
          },
        })
      ),
      row(
        '导入配置',
        '会覆盖配置、快捷方式、待办与便签（上传的图片文件不在 JSON 里），请先导出备份',
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center' } },
          h('button', {
            class: 'btn',
            type: 'button',
            html: `${svgIcon('upload', 14)}<span>选择文件</span>`,
            onclick: () => importInput.click(),
          }),
          importInput
        )
      )
    ),
    group(
      '存储',
      row('本地占用', '', h('div', { style: { width: '100%', maxWidth: '260px' } }, h('div', { class: 'meter' }, meter), usageText), {
        stacked: true,
      })
    ),
    group(
      '危险操作',
      row(
        '恢复默认设置',
        '会清空快捷方式、待办、便签与上传的图片',
        h('button', {
          class: 'btn is-danger',
          type: 'button',
          text: '重置',
          onclick: async () => {
            const ok = await confirmDialog({
              title: '恢复默认设置',
              message: '所有自定义内容都会被删除，且无法恢复。确定继续吗？',
              confirmText: '确认重置',
              danger: true,
            });
            if (!ok) return;
            await resetAll();
            bus.emit('toast', { text: '已恢复默认设置' });
            setTimeout(() => location.reload(), 400);
          },
        })
      )
    ),
    group(
      '隐私',
      h(
        'div',
        { class: 'info-block' },
        h('strong', { text: '没有账号，没有云端，没有联盟链接。' }),
        ' 所有配置存在浏览器本地（localStorage + IndexedDB）；图标链接绝不会被改写为推广链接；扩展不会上传任何浏览数据。'
      )
    )
  );
}

/* --------------------------------------------------------------- 关于 */

const PERMISSIONS = [
  ['storage', '保存配置到本机'],
  ['unlimitedStorage', '保存较大尺寸的本地壁纸'],
  ['favicon', '读取站点图标的本地缓存（不联网、不上传）'],
  ['bookmarks（可选）', '导入书签、显示书签组件'],
  ['topSites（可选）', '显示「常去网站」组件'],
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
      h('thead', {}, h('tr', {}, ...headers.map((text) => h('th', { text })))),
      h(
        'tbody',
        {},
        ...rows.map((cells) => h('tr', {}, ...cells.map((text) => h('td', { text }))))
      )
    );

  return h(
    'div',
    {},
    group(
      '版本',
      row(
        `${APP.name} ${APP.subtitle}`,
        `v${APP.version} · 数据格式 v${APP.schema} · 零依赖纯前端实现`,
        h('button', {
          class: 'btn',
          type: 'button',
          html: `${svgIcon('keyboard', 14)}<span>快捷键</span>`,
          onclick: () => showShortcuts(),
        })
      )
    ),
    group('权限清单', h('div', { class: 'info-block', style: { padding: '4px 0', background: 'transparent', border: 'none' } }, table(PERMISSIONS, ['权限', '用途说明']))),
    group('网络请求', h('div', { class: 'info-block', style: { padding: '4px 0', background: 'transparent', border: 'none' } }, table(NETWORK, ['域名', '用途']))),
    group(
      '许可与致谢',
      h(
        'div',
        { class: 'info-block' },
        '本扩展为净室实现，未包含任何 GPL / AGPL 项目的代码。',
        h('br'),
        h('br'),
        '天气数据由 ',
        h('strong', { text: 'Open-Meteo' }),
        ' 提供（免费层仅限非商业用途）；每日壁纸来自 ',
        h('strong', { text: '必应' }),
        ' 公开接口，版权归原作者，仅用于个人桌面欣赏。',
        h('br'),
        h('br'),
        '如果你想商用：请替换天气源为 QWeather 等服务，并把壁纸改为完全自有的素材。'
      )
    )
  );
}

function showShortcuts() {
  const isMac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
  const mod = isMac ? '⌘' : 'Ctrl';
  const rows = [
    [`${mod} + K`, '聚焦搜索框'],
    ['/', '聚焦搜索框（非输入状态）'],
    [`${mod} + ,`, '打开设置'],
    ['Esc', '关闭浮层 / 收起联想（搜索框里再按一次清空）'],
    ['↑ ↓', '在搜索结果间移动'],
    ['Tab', '收起联想并离开搜索框'],
    ['← → ↑ ↓', '在图标间移动焦点'],
    ['Enter', '打开选中的图标'],
    ['F2', '编辑选中的图标'],
    ['Delete', '删除选中的图标'],
    ['中键 / ' + mod + ' + 点击', '在后台新标签页打开'],
    ['Shift + 点击', '在前台新标签页打开'],
  ];

  const body = h(
    'div',
    { class: 'kbd-list', style: { flexDirection: 'column', gap: '9px' } },
    ...rows.map(([key, desc]) =>
      h('div', { style: { justifyContent: 'space-between', width: '100%' } }, h('kbd', { text: key }), h('span', { text: desc }))
    )
  );

  openModal({ title: '快捷键', body, footer: [] });
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

export const isSettingsOpen = () => isOpen;

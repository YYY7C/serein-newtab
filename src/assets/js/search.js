/* Serein · 搜索框
 *
 * 能力：多引擎切换 / 网址直开 / 本地快捷方式匹配 / 命令直达 / 最近搜索 / 远程联想 / 键盘导航。
 * 注意：扩展从不修改浏览器的默认搜索引擎（那样会触发商店审核问题），
 * 这里的引擎只决定「本页提交后跳到哪个地址」。
 */

import { $, h, clear, svgIcon, debounce, normalizeUrl, isSafeUrl, bus, hostOf } from './util.js';
import { ENGINES, engineById, RECENT_SEARCH_LIMIT, RECENT_SEARCH_MAX_LENGTH } from './defaults.js';
import * as store from './store.js';
import { openMenu, closeMenu, isMenuOpen } from './menu.js';
import { resolveIcon, brandSlugFor, brandLogoUrl, previewFileIcon, isFaviconPlaceholder } from './icons.js';

let els = null;
let rows = [];
let activeIndex = -1;
let abortController = null;
let latestQuery = '';
let paintedEngineId = '';
let hintBuilt = false;
let blurTimer = 0;
let suggestSeq = 0;
let suggestEpoch = 0;
let suggestLoading = false;
let suggestError = false;
let composing = false;

const IS_MAC = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
/** 联想接口超过这个时间没回来就放弃：断网/被墙时不能让骨架屏一直转 */
const SUGGEST_TIMEOUT = 4000;

/* --------------------------------------------------------------- 命令 */

/** 搜索结果里的「命令」组：把手边常用的动作直接变成一句话 */
const COMMANDS = [
  {
    label: '添加快捷方式',
    keywords: 'add shortcut 添加 新建 图标',
    icon: 'plus',
    run: () => import('./tiles.js').then((m) => m.addShortcut()),
  },
  {
    label: '新建文件夹',
    keywords: 'folder 文件夹 分组',
    icon: 'folder-plus',
    run: () => import('./tiles.js').then((m) => m.createFolder()),
  },
  {
    label: '打开设置',
    keywords: 'settings 设置 偏好',
    icon: 'settings',
    run: () => bus.emit('openSettings', {}),
  },
  {
    label: '更换壁纸',
    keywords: 'wallpaper 壁纸 背景 图',
    icon: 'image',
    run: () => bus.emit('openSettings', { tab: 'wallpaper' }),
  },
  {
    label: '调整布局与列数',
    keywords: 'layout 布局 列 图标大小 密度',
    icon: 'grid',
    run: () => bus.emit('openSettings', { tab: 'layout' }),
  },
  {
    label: '切换视觉风格',
    keywords: 'style theme 风格 主题 外观',
    icon: 'palette',
    run: () => bus.emit('openSettings', { tab: 'appearance' }),
  },
  {
    label: '导入 / 导出数据',
    keywords: 'data export import 备份 数据',
    icon: 'database',
    run: () => bus.emit('openSettings', { tab: 'data' }),
  },
  {
    label: '查看快捷键与权限',
    keywords: 'help 帮助 快捷键 about 关于',
    icon: 'keyboard',
    run: () => bus.emit('openSettings', { tab: 'about' }),
  },
];

function matchCommands(query) {
  const lower = query.toLowerCase();
  return COMMANDS.filter(
    (command) => command.label.toLowerCase().includes(lower) || command.keywords.includes(lower)
  ).slice(0, 3);
}

/* --------------------------------------------------------------- 判定 */

function looksLikeUrl(text) {
  const value = text.trim();
  if (!value || /\s/.test(value)) return false;
  if (!isSafeUrl(normalizeUrl(value))) return false;
  // 带 // 的协议或明确的外部协议；普通的 word:word 仍当搜索词
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return true;
  if (/^(mailto|tel|magnet):/i.test(value)) return isSafeUrl(normalizeUrl(value));
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(value)) return true;
  if (/^[^\s/]+\.[\p{L}][\p{L}\p{N}-]{1,}(?:[/?#].*|:\d+.*)?$/u.test(value)) {
    // example..com 或未补全的邮箱不该生成一个打不开的网址行
    try {
      return Boolean(new URL(normalizeUrl(value)).hostname);
    } catch {
      return false;
    }
  }
  return false;
}

/* --------------------------------------------------------------- 初始化 */

export function initSearch() {
  els = {
    form: $('#search-form'),
    input: $('#search-input'),
    engineBtn: $('#engine-btn'),
    submit: $('#search-submit'),
    clear: $('#search-clear'),
    suggest: $('#suggest'),
    wrap: $('#search-wrap'),
    hint: $('#search-hint'),
  };

  els.submit.innerHTML = svgIcon('search', 19);
  els.clear.innerHTML = svgIcon('close', 15);
  els.suggest.inert = true;
  els.suggest.setAttribute('aria-busy', 'false');
  els.input.setAttribute('role', 'combobox');
  els.input.setAttribute('aria-autocomplete', 'list');
  els.input.setAttribute('aria-controls', 'suggest');
  els.input.setAttribute('aria-expanded', 'false');
  els.input.setAttribute('enterkeyhint', 'search');
  paintEngine();
  paintHint();
  syncInputState();

  els.wrap.hidden = store.state.config.layout.showSearch === false;

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    // 点搜索按钮 = 搜索输入框里的原文，不沿用鼠标悬停/方向键选中的联想项
    submitQuery();
  });

  els.input.addEventListener('input', onInput);
  // 中文输入法拼写过程中不要把拼音串当成搜索词：等组合结束再统一渲染一次
  els.input.addEventListener('compositionstart', () => {
    composing = true;
  });
  els.input.addEventListener('compositionend', () => {
    composing = false;
    onInput();
  });
  // 已聚焦时再点一下输入框：Esc 关掉面板后还能靠点击把它唤回来
  els.input.addEventListener('click', () => {
    if (els.suggest.classList.contains('is-open')) return;
    revealPanel();
  });
  els.input.addEventListener('focus', () => {
    clearTimeout(blurTimer);
    els.wrap.classList.add('is-focused');
    syncInputState();
    revealPanel();
  });
  els.input.addEventListener('blur', () => {
    els.wrap.classList.remove('is-focused');
    composing = false;
    clearTimeout(blurTimer);
    // 鼠标还停在联想面板上（比如拖滚动条）时不要收起；点击别处则照常关闭
    blurTimer = setTimeout(() => {
      if (els.wrap.matches(':hover') || els.suggest.matches(':hover')) return;
      closeSuggest();
    }, 140);
  });

  els.input.addEventListener('keydown', onKeydown);

  // 点「清空」和联想项时不要让输入框先失焦：否则 blur 定时器会关掉列表，慢一点点击就点不中。
  els.clear.addEventListener('mousedown', (event) => event.preventDefault());
  els.clear.addEventListener('click', () => {
    els.input.value = '';
    latestQuery = '';
    syncInputState();
    els.input.focus({ preventScroll: true });
    if (recentQueries().length) renderSuggestions([], { idle: true });
    else closeSuggest();
  });

  els.suggest.addEventListener('mousedown', (event) => {
    clearTimeout(blurTimer);
    if (event.target.closest?.('.suggest-item, .suggest-action')) event.preventDefault();
  });
  // 点击搜索框以外的区域立刻收起；点击联想列表的滚动条时不会因误判而关闭。
  document.addEventListener('mousedown', (event) => {
    if (!els.wrap.contains(event.target) && !els.suggest.contains(event.target)) closeSuggest();
  });
  // 切到别的窗口/标签页时收起浮层，回来不会看到一份过期的联想
  window.addEventListener('blur', closeSuggest);
  // 视口变矮（改窗口大小、手机弹出键盘）时重新收紧面板高度
  const refit = () => {
    if (els.suggest.classList.contains('is-open')) fitPanelHeight();
  };
  window.addEventListener('resize', refit);
  window.visualViewport?.addEventListener('resize', refit);

  els.engineBtn.addEventListener('click', (event) => {
    closeSuggest();
    const rect = els.engineBtn.getBoundingClientRect();
    openMenu(
      ENGINES.map((engine) => ({
        label: engine.name,
        icon: store.state.config.search.engine === engine.id ? 'check' : undefined,
        onClick: () => {
          store.patchConfig({ search: { ...store.state.config.search, engine: engine.id } });
          paintEngine();
          // 换完引擎立刻把焦点送回输入框，用户可以直接继续打字
          els.input.focus({ preventScroll: true });
        },
      })),
      {
        x: rect.left,
        y: rect.bottom + 8,
        onClose: () => els.engineBtn.setAttribute('aria-expanded', 'false'),
      }
    );
    els.engineBtn.setAttribute('aria-expanded', 'true');
    event.stopPropagation();
  });

  document.addEventListener('keydown', globalHotkeys);

  store.subscribe((scope) => {
    if (scope === 'config' || scope === 'all') {
      const config = store.state.config;
      // 引擎/可见性变化时，旧引擎的迟到联想结果不能再弹回来
      if (paintedEngineId && config.search.engine !== paintedEngineId) closeSuggest();
      const visible = config.layout.showSearch !== false;
      if (!visible && els.wrap.contains(document.activeElement)) {
        closeSuggest();
        els.input.blur();
      }
      els.wrap.hidden = !visible;
      paintEngine();
      paintHint();
      if (!config.search.suggestions && els.suggest.classList.contains('is-open')) closeSuggest();
      // 关掉最近搜索开关后，空输入时不应再展示旧记录
      if (!config.search.history && !els.input.value.trim() && els.suggest.classList.contains('is-open')) {
        closeSuggest();
      }
    }
  });
}

function syncInputState() {
  if (!els) return;
  const hasText = Boolean(els.input.value);
  els.submit.classList.toggle('is-ready', hasText);
  els.clear.hidden = !hasText;
}

/** 把面板按当前输入重新打开：有词就画本地结果并请求联想，没词就展示最近搜索 */
function revealPanel() {
  const query = els.input.value.trim();
  if (query) {
    suggestError = false;
    renderSuggestions();
    if (!looksLikeUrl(query)) requestSuggest(query);
  } else if (recentQueries().length) {
    renderSuggestions([], { idle: true });
  }
}

function paintEngine() {
  if (!els) return;
  const engine = engineById(store.state.config.search.engine);
  if (paintedEngineId === engine.id && els.engineBtn.childElementCount) return;
  paintedEngineId = engine.id;
  clear(els.engineBtn);
  const slug = brandSlugFor(hostOf(engine.url));
  const badge = h('span', {
    class: `engine-badge${engine.letter.length > 2 ? ' is-compact' : ''}${slug ? ' is-brand' : ''}`,
    'aria-hidden': 'true',
  });
  // 品牌 logo 在某些风格里会被换回字母徽标（如终端），把首字母留在属性上给 CSS 用
  badge.dataset.letter = engine.letter;
  if (slug) {
    const img = h('img', { src: brandLogoUrl(slug), alt: '', decoding: 'async' });
    img.addEventListener(
      'error',
      () => {
        img.remove();
        badge.classList.remove('is-brand');
        badge.textContent = engine.letter;
        badge.style.background = `linear-gradient(140deg, ${engine.color}, ${shade(engine.color, -0.22)})`;
      },
      { once: true }
    );
    badge.appendChild(img);
  } else {
    badge.textContent = engine.letter;
    badge.style.background = `linear-gradient(140deg, ${engine.color}, ${shade(engine.color, -0.22)})`;
  }
  els.engineBtn.appendChild(badge);
  els.engineBtn.appendChild(h('span', { text: engine.name }));
  els.engineBtn.appendChild(h('span', { html: svgIcon('chevron-down', 13), style: { opacity: '.55' } }));
  els.engineBtn.setAttribute('aria-label', `切换搜索引擎，当前${engine.name}`);
}

function shade(hex, amount) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const mix = (channel) => Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function paintHint() {
  if (!hintBuilt) {
    const key = IS_MAC ? '⌘' : 'Ctrl';
    els.hint.innerHTML =
      `<span><kbd>${key}</kbd> + <kbd>K</kbd> 聚焦搜索</span>` +
      `<span>输入「设置」「壁纸」直达命令</span>` +
      `<span><kbd>?</kbd> 快捷键</span>`;
    hintBuilt = true;
  }
  els.hint.hidden = store.state.config.layout.showHint === false;
}

/* --------------------------------------------------------------- 输入 */

const requestSuggest = debounce(async (query) => {
  const engine = engineById(store.state.config.search.engine);
  // 失焦/关闭后不要再发请求；本地结果在 onInput 里已经画过，不必重绘
  if (
    !query ||
    document.activeElement !== els.input ||
    !engine.suggest ||
    !store.state.config.search.suggestions
  ) {
    if (suggestLoading) {
      suggestLoading = false;
      renderSuggestions([], { keepActive: activeIndex >= 0 });
    }
    return;
  }

  abortController?.abort();
  abortController = new AbortController();
  const epoch = suggestEpoch;
  suggestLoading = true;
  suggestError = false;
  // 先放骨架屏，网络慢时用户能看出「正在联想」而不是列表卡住
  renderSuggestions([], { keepActive: activeIndex >= 0 });

  try {
    const list = await fetchSuggestions(engine.suggest, query, abortController.signal);
    if (latestQuery !== query || epoch !== suggestEpoch) return;
    suggestLoading = false;
    // 用户可能在 170ms 内已经用方向键选中了本地行：重绘后保留索引
    renderSuggestions(list, { keepActive: activeIndex >= 0 });
  } catch (err) {
    // 主动中止（改词/失焦/超时/关闭）不应该再把旧结果画回来
    if (err.name === 'AbortError') return;
    if (latestQuery !== query || epoch !== suggestEpoch) return;
    suggestLoading = false;
    suggestError = true;
    // 失败时回到本地结果，并把「联想不可用」明确写出来，避免看起来像闪了一下就没了
    renderSuggestions([], { keepActive: activeIndex >= 0 });
    console.warn('[serein/search] 联想失败', err);
  }
}, 170);

function onInput() {
  // 输入法组合期间 input 事件带的是拼音：先不画结果，等 compositionend 再处理
  if (composing) return;
  const query = els.input.value.trim();
  latestQuery = query;
  activeIndex = -1;
  suggestError = false;
  syncInputState();

  if (!query) {
    suggestEpoch += 1;
    requestSuggest.cancel();
    abortController?.abort();
    abortController = null;
    suggestLoading = false;
    // 清空后如果右键/键盘还停在输入框里，直接展示「最近搜索」比一片空白更有用
    if (document.activeElement === els.input && recentQueries().length) {
      renderSuggestions([], { idle: true });
    } else {
      closeSuggest();
    }
    return;
  }

  renderSuggestions();
  if (looksLikeUrl(query)) {
    // 已经识别成网址时不需要再把整条 URL 发给搜索联想接口
    suggestEpoch += 1;
    requestSuggest.cancel();
    abortController?.abort();
    abortController = null;
    suggestLoading = false;
    return;
  }
  requestSuggest(query);
}

function onKeydown(event) {
  // 中文输入法确认候选词时的 Enter / Escape 不能当成搜索操作
  if (event.isComposing || event.keyCode === 229) return;
  const panelOpen = els.suggest.classList.contains('is-open');
  if (event.key === 'ArrowDown' && !panelOpen) {
    // 面板被 Esc 收起后，↓ 应该重新打开它，而不是毫无反应
    event.preventDefault();
    revealPanel();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveActive(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveActive(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    commitCurrent();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    // 第一下 Esc 只收起联想，第二下才清空输入，避免误删已经打了一半的词
    if (panelOpen) {
      closeSuggest();
    } else if (els.input.value) {
      els.input.value = '';
      latestQuery = '';
      syncInputState();
      closeSuggest();
    } else {
      els.input.blur();
    }
  } else if (event.key === 'Tab' && panelOpen) {
    // 联想列表打开时 Tab 不能把用户困在候选行里：收起列表，按自然方向
    // 去搜索引擎按钮或搜索按钮，再按一次 Tab 就能离开搜索框。
    event.preventDefault();
    closeSuggest();
    const next = event.shiftKey ? els.engineBtn : els.submit;
    if (next && next.getClientRects().length) {
      next.focus({ preventScroll: true });
    } else if (!event.shiftKey) {
      // 文字列表风格隐藏了搜索按钮，Tab 的自然落点是第一个图标
      document.querySelector('#grid .tile, #grid .tile--add')?.focus({ preventScroll: true });
    }
  }
}

function moveActive(delta) {
  if (!rows.length) return;
  if (activeIndex < 0) {
    // 还没选中任何一行时，↓ / Tab 从第一行开始，↑ / Shift+Tab 从最后一行开始
    activeIndex = delta > 0 ? 0 : rows.length - 1;
  } else {
    activeIndex = (activeIndex + delta + rows.length) % rows.length;
  }
  paintActive();
}

function paintActive() {
  rows.forEach((row, index) => {
    const active = index === activeIndex;
    row.el.classList.toggle('is-active', active);
    row.el.setAttribute('aria-selected', String(active));
  });
  if (activeIndex >= 0 && rows[activeIndex]) {
    els.input.setAttribute('aria-activedescendant', rows[activeIndex].el.id);
    scrollRowIntoView(rows[activeIndex].el);
  } else {
    els.input.removeAttribute('aria-activedescendant');
  }
}

/* 手动滚动面板而不是 scrollIntoView：后者还会把整个新标签页带着滚一下 */
function scrollRowIntoView(el) {
  const pad = 6;
  const top = el.offsetTop - pad;
  const bottom = el.offsetTop + el.offsetHeight + pad;
  if (top < els.suggest.scrollTop) {
    els.suggest.scrollTop = top;
  } else if (bottom > els.suggest.scrollTop + els.suggest.clientHeight) {
    els.suggest.scrollTop = bottom - els.suggest.clientHeight;
  }
}

/* --------------------------------------------------------------- 提交 */

function commitCurrent() {
  if (activeIndex >= 0 && rows[activeIndex]) {
    const row = rows[activeIndex];
    closeSuggest();
    row.run();
    return;
  }
  submitQuery();
}

function submitQuery() {
  const query = els.input.value.trim();
  if (!query) return;
  closeSuggest();
  if (looksLikeUrl(query)) {
    navigate(normalizeUrl(query));
  } else {
    searchWith(query);
  }
}

function navigate(url) {
  if (!url || !isSafeUrl(url)) return;
  if (store.state.config.search.openInNewTab) {
    // noopener 会让 window.open 返回 null，不能据此回退当前页
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
  } else {
    location.href = url;
  }
}

function searchWith(query) {
  const engine = engineById(store.state.config.search.engine);
  rememberQuery(query);
  navigate(engine.url.replace('%s', encodeURIComponent(query)));
}

/* ----------------------------------------------------------- 最近搜索 */

function recentQueries() {
  const config = store.state.config.search;
  if (config.history === false) return [];
  const raw = Array.isArray(config.recent) ? config.recent : [];
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const text = item.trim().slice(0, RECENT_SEARCH_MAX_LENGTH);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(text);
    if (list.length >= RECENT_SEARCH_LIMIT) break;
  }
  return list;
}

function rememberQuery(query) {
  if (store.state.config.search.history === false) return;
  const text = String(query || '').trim().slice(0, RECENT_SEARCH_MAX_LENGTH);
  if (!text || looksLikeUrl(text)) return;
  const lower = text.toLowerCase();
  const recent = [text, ...recentQueries().filter((item) => item.toLowerCase() !== lower)].slice(
    0,
    RECENT_SEARCH_LIMIT
  );
  // 用独立 scope 落盘：只是记一条历史，没必要触发 applyConfig / 侧栏与顶栏重建
  store.update((state) => {
    state.config.search.recent = recent;
  }, 'search-history');
}

function forgetRecent() {
  const raw = store.state.config.search.recent;
  if (!Array.isArray(raw) || !raw.length) return;
  store.update((state) => {
    state.config.search.recent = [];
  }, 'search-history');
}

/* --------------------------------------------------------------- 渲染 */

function buildSuggestionText(text, query) {
  const span = h('span', { class: 'suggest-text' });
  const needle = String(query || '');
  if (!needle) {
    span.textContent = text;
    return span;
  }
  const haystack = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let index = haystack.indexOf(lowerNeedle);
  if (index < 0) {
    span.textContent = text;
    return span;
  }
  let cursor = 0;
  let guard = 0;
  while (index >= 0 && guard < 12) {
    if (index > cursor) span.appendChild(document.createTextNode(text.slice(cursor, index)));
    span.appendChild(h('mark', { class: 'suggest-match', text: text.slice(index, index + needle.length) }));
    cursor = index + needle.length;
    index = haystack.indexOf(lowerNeedle, cursor);
    guard += 1;
  }
  if (cursor < text.length) span.appendChild(document.createTextNode(text.slice(cursor)));
  return span;
}

function buildRow(config) {
  const el = h(
    'button',
    {
      class: `suggest-item${config.primary ? ' is-primary' : ''}`,
      type: 'button',
      role: 'option',
      id: `suggest-opt-${++suggestSeq}`,
      'aria-selected': 'false',
      onclick: () => {
        closeSuggest();
        config.run();
      },
      onmouseenter: () => {
        const index = rows.findIndex((row) => row.el === el);
        if (index < 0) return;
        activeIndex = index;
        paintActive();
      },
    },
    config.thumb || h('span', { class: 'suggest-icon', html: svgIcon(config.icon || 'search', 16) }),
    buildSuggestionText(config.text, config.query),
    config.hint ? h('span', { class: 'suggest-hint', text: config.hint }) : null
  );
  return { el, run: config.run, text: config.text, kind: config.kind || 'item' };
}

function appendGroup(title, configs, { action = null } = {}) {
  if (!configs.length) return;
  const group = h('div', {
    class: 'suggest-group',
    role: 'group',
    'aria-label': title || undefined,
  });
  if (title || action) {
    group.appendChild(
      h(
        'div',
        { class: 'suggest-group-label' },
        title ? h('span', { class: 'suggest-group-title', text: title, 'aria-hidden': 'true' }) : null,
        action
      )
    );
  }
  for (const config of configs) {
    const row = buildRow(config);
    group.appendChild(row.el);
    rows.push(row);
  }
  els.suggest.appendChild(group);
}

function buildRecentAction() {
  return h('button', {
    class: 'suggest-action',
    type: 'button',
    text: '清除',
    'aria-label': '清除最近搜索',
    onclick: (event) => {
      event.stopPropagation();
      forgetRecent();
      renderSuggestions([], { keepActive: true, idle: !els.input.value.trim() });
      els.input.focus({ preventScroll: true });
    },
  });
}

function appendSkeleton(engine) {
  els.suggest.appendChild(
    h(
      'div',
      { class: 'suggest-group is-skeleton', 'aria-hidden': 'true' },
      h(
        'div',
        { class: 'suggest-group-label' },
        h('span', { class: 'suggest-group-title', text: `${engine.name} 联想` }),
        h('span', { class: 'suggest-loading-dots', text: '···' })
      ),
      ...[0, 1].map(() =>
        h(
          'div',
          { class: 'suggest-skeleton' },
          h('span', { class: 'suggest-skeleton-icon' }),
          h('span', { class: 'suggest-skeleton-bar' })
        )
      )
    )
  );
}

/** 联想接口挂掉/断网时给一行明确状态：否则用户只会看到候选「闪了一下就没了」 */
function appendSuggestStatus(engine, query) {
  const status = h(
    'div',
    { class: 'suggest-status', role: 'status' },
    h('span', { class: 'suggest-icon', html: svgIcon('info', 15) }),
    h('span', { class: 'suggest-status-text', text: `${engine.name}联想暂不可用，可直接搜索` }),
    h('button', {
      class: 'suggest-action',
      type: 'button',
      text: '重试',
      'aria-label': '重新获取搜索联想',
      onclick: (event) => {
        event.stopPropagation();
        requestSuggest(query);
      },
    })
  );
  els.suggest.appendChild(status);
}

function appendFoot() {
  if (!rows.length) return;
  els.suggest.appendChild(
    h(
      'div',
      { class: 'suggest-foot', 'aria-hidden': 'true' },
      h('span', { class: 'suggest-foot-item' }, h('kbd', { text: '↑ ↓' }), h('span', { text: '选择' })),
      h('span', { class: 'suggest-foot-item' }, h('kbd', { text: 'Enter' }), h('span', { text: '打开' })),
      h('span', { class: 'suggest-foot-item' }, h('kbd', { text: 'Esc' }), h('span', { text: '关闭' }))
    )
  );
}

function openPanel() {
  fitPanelHeight();
  els.suggest.classList.add('is-open');
  els.suggest.inert = false;
  els.suggest.setAttribute('aria-busy', String(suggestLoading));
  els.wrap.classList.add('is-open');
  els.input.setAttribute('aria-expanded', 'true');
}

/** 下拉不能长出视口：按搜索框下方的真实空间收紧高度，太矮时改为面板内滚动 */
function fitPanelHeight() {
  if (!els?.suggest) return;
  // 面板是 .search 的子元素，与 CSS 的 top: calc(100% + 8px) 对齐
  const formRect = els.form.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportBottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
  const top = formRect.bottom + 8;
  const available = Math.floor(viewportBottom - top - 12);
  els.suggest.style.maxHeight = `${Math.min(440, Math.max(168, available))}px`;
}

function buildShortcutThumb(item) {
  const descriptor = resolveIcon(item, { iconStyle: store.state.config.layout.iconStyle || 'brand' });
  const thumb = h('span', {
    class: `suggest-thumb${descriptor.brand ? ' is-brand' : ''}`,
    text: descriptor.brand ? '' : descriptor.text,
    'aria-hidden': 'true',
  });
  if (!descriptor.brand) {
    thumb.style.background = `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`;
    thumb.style.color = descriptor.fg;
  }
  if (descriptor.pendingFileId) {
    previewFileIcon(descriptor.pendingFileId)
      .then((url) => {
        if (!url || !thumb.isConnected) return;
        const img = h('img', { src: url, alt: '', decoding: 'async' });
        img.addEventListener(
          'load',
          () => {
            Array.from(thumb.childNodes).forEach((child) => {
              if (child !== img) child.remove();
            });
          },
          { once: true }
        );
        img.addEventListener(
          'error',
          () => {
            img.remove();
            thumb.textContent = descriptor.text;
          },
          { once: true }
        );
        thumb.appendChild(img);
      })
      .catch(() => {});
  } else if (descriptor.src) {
    const img = h('img', { src: descriptor.src, alt: '', decoding: 'async' });
    img.addEventListener(
      'load',
      () => {
        // `_favicon` 的灰地球占位图 = 没有图标：保留字符，丢弃图片
        isFaviconPlaceholder(img).then((placeholder) => {
          if (placeholder) {
            img.remove();
            thumb.classList.remove('is-brand');
            thumb.style.background = `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`;
            thumb.style.color = descriptor.fg;
            thumb.textContent = descriptor.text;
            return;
          }
          Array.from(thumb.childNodes).forEach((child) => {
            if (child !== img) child.remove();
          });
        });
      },
      { once: true }
    );
    img.addEventListener(
      'error',
      () => {
        img.remove();
        thumb.classList.remove('is-brand');
        thumb.style.background = `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`;
        thumb.style.color = descriptor.fg;
        thumb.textContent = descriptor.text;
      },
      { once: true }
    );
    thumb.appendChild(img);
  }
  return thumb;
}

function renderSuggestions(remote = [], { keepActive = false, idle = false } = {}) {
  // 拼音组合过程中输入框显示的是候选串：此时任何重绘都会把旧结果和新串拼在一起
  if (composing) return;
  // 输入框失焦（例如用户已经点去别处/打开菜单）后，迟到的联想结果不应再弹回来。
  // 鼠标仍停在面板上时放行：拖滚动条也会让输入框失焦，但列表不该因此消失。
  if (document.activeElement !== els.input && !els.suggest.matches(':hover')) {
    closeSuggest();
    return;
  }
  const query = idle ? '' : els.input.value.trim();
  if (!query && !idle) {
    closeSuggest();
    return;
  }
  const previousActive = keepActive ? activeIndex : -1;
  clear(els.suggest);
  rows = [];
  if (!keepActive) {
    activeIndex = -1;
    els.input.removeAttribute('aria-activedescendant');
  }

  const engine = engineById(store.state.config.search.engine);
  const historyOn = store.state.config.search.history !== false;

  // 输入框为空且聚焦：只展示最近搜索
  if (!query) {
    const recent = historyOn ? recentQueries() : [];
    if (!recent.length) {
      closeSuggest();
      return;
    }
    appendGroup(
      '最近搜索',
      recent.map((text) => ({
        icon: 'history',
        text,
        run: () => {
          els.input.value = text;
          syncInputState();
          closeSuggest();
          searchWith(text);
        },
      })),
      { action: buildRecentAction() }
    );
    openPanel();
    appendFoot();
    return;
  }

  const lower = query.toLowerCase();
  const isUrl = looksLikeUrl(query);
  // 远程联想常会把本地已经出现的条目再吐一遍，记下已出现的文字用于去重
  const claimed = new Set();

  // 1) 网址直开
  if (isUrl) {
    const url = normalizeUrl(query);
    appendGroup('打开网址', [
      {
        icon: 'external',
        text: url.replace(/^https?:\/\//, ''),
        hint: 'Enter',
        primary: true,
        kind: 'url',
        run: () => navigate(url),
      },
    ]);
  }

  // 2) 命令
  const commands = matchCommands(query);
  commands.forEach((command) => claimed.add(command.label.toLowerCase()));
  appendGroup(
    '命令',
    commands.map((command) => ({
      icon: command.icon,
      text: command.label,
      query,
      hint: '命令',
      run: () => {
        els.input.value = '';
        syncInputState();
        closeSuggest();
        command.run();
      },
    }))
  );

  // 3) 本地快捷方式（包含文件夹里的条目）
  if (!isUrl) {
    const groupTitles = new Map(store.state.groups.map((group) => [group.id, group.title]));
    const matches = store.state.shortcuts
      .filter((item) => item.title.toLowerCase().includes(lower) || item.url.toLowerCase().includes(lower))
      .slice(0, 4);
    matches.forEach((item) => claimed.add(item.title.toLowerCase()));
    appendGroup(
      '快捷方式',
      matches.map((item) => ({
        thumb: buildShortcutThumb(item),
        text: item.title,
        query,
        hint: item.groupId ? groupTitles.get(item.groupId) || '文件夹' : '',
        run: () => navigate(item.url),
      }))
    );
  }

  // 4) 最近搜索里与当前输入匹配的条目
  if (historyOn && !isUrl) {
    const recentMatches = recentQueries()
      .filter((item) => item.toLowerCase() !== lower && item.toLowerCase().includes(lower))
      .slice(0, 3);
    recentMatches.forEach((text) => claimed.add(text.toLowerCase()));
    appendGroup(
      '最近搜索',
      recentMatches.map((text) => ({
        icon: 'history',
        text,
        query,
        run: () => {
          els.input.value = text;
          syncInputState();
          closeSuggest();
          searchWith(text);
        },
      }))
    );
  }

  // 5) 远程联想
  const seen = new Set();
  const remoteRows = [];
  for (const item of remote.slice(0, 12)) {
    if (typeof item !== 'string') continue;
    const text = item.trim().slice(0, 200);
    if (!text) continue;
    const key = text.toLowerCase();
    if (key === lower || seen.has(key) || claimed.has(key)) continue;
    seen.add(key);
    remoteRows.push({
      icon: 'search',
      text,
      query,
      run: () => searchWith(text),
      kind: 'search',
    });
    if (remoteRows.length >= 8) break;
  }
  appendGroup(`${engine.name} 联想`, remoteRows);

  // 6) 联想请求还在路上：先占两行骨架，避免看起来像没反应
  if (
    !isUrl &&
    !remoteRows.length &&
    suggestLoading &&
    engine.suggest &&
    store.state.config.search.suggestions
  ) {
    appendSkeleton(engine);
  }

  // 6.5) 联想请求失败：写明状态并提供重试，别让候选无声消失
  if (
    !isUrl &&
    !remoteRows.length &&
    !suggestLoading &&
    suggestError &&
    engine.suggest &&
    store.state.config.search.suggestions
  ) {
    appendSuggestStatus(engine, query);
  }

  // 7) 兜底：直接搜索（始终留在最后，方向键可以稳定地找到它）
  if (!isUrl) {
    const exactSearch = rows.some((row) => row.kind === 'search' && row.text === query);
    if (!exactSearch) {
      appendGroup(null, [
        {
          icon: 'search',
          text: `用${engine.name}搜索「${query}」`,
          query,
          hint: 'Enter',
          kind: 'search',
          primary: rows.length === 0,
          run: () => searchWith(query),
        },
      ]);
    }
  }

  if (!rows.length) {
    closeSuggest();
    return;
  }

  openPanel();
  if (previousActive >= 0) {
    activeIndex = Math.min(previousActive, rows.length - 1);
    paintActive();
  }
  appendFoot();
}

function closeSuggest() {
  suggestEpoch += 1;
  requestSuggest.cancel();
  abortController?.abort();
  abortController = null;
  suggestLoading = false;
  els.suggest?.classList.remove('is-open');
  if (els.suggest) {
    els.suggest.inert = true;
    els.suggest.setAttribute('aria-busy', 'false');
    els.suggest.scrollTop = 0;
  }
  els.wrap?.classList.remove('is-open');
  els.input?.setAttribute('aria-expanded', 'false');
  els.input?.removeAttribute('aria-activedescendant');
  rows = [];
  activeIndex = -1;
}

/* --------------------------------------------------------------- 联想 */

async function fetchSuggestions(kind, query, signal) {
  switch (kind) {
    case 'bing':
      return parseOsjson(await fetchJson(`https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`, signal));
    case 'google':
      return parseOsjson(
        await fetchJson(
          `https://suggestqueries.google.com/complete/search?client=firefox&hl=zh-CN&q=${encodeURIComponent(query)}`,
          signal
        )
      );
    case 'duckduckgo':
      return parseOsjson(
        await fetchJson(`https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`, signal)
      );
    case 'baidu':
      return parseBaidu(await fetchText(`https://suggestion.baidu.com/su?p=3&ie=UTF-8&wd=${encodeURIComponent(query)}`, signal));
    case '360':
      return parse360(await fetchText(`https://sug.so.360.cn/suggest?word=${encodeURIComponent(query)}&encodein=utf-8&encodeout=utf-8`, signal));
    case 'bilibili':
      return parseBilibili(
        await fetchJson(`https://s.search.bilibili.com/main/suggest?term=${encodeURIComponent(query)}`, signal)
      );
    default:
      return [];
  }
}

/** 带超时的 fetch：断网/接口被墙时联想最多等 4 秒，然后回到本地结果 */
async function fetchWithTimeout(url, signal) {
  const controller = new AbortController();
  let timedOut = false;
  const relay = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', relay, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SUGGEST_TIMEOUT);
  try {
    return await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch (err) {
    // 超时和「用户改词/关闭面板导致的中止」都会冒 AbortError：
    // 前者必须走失败分支收掉骨架屏，后者应保持安静。
    if (timedOut) {
      const timeout = new Error('suggest timeout');
      timeout.name = 'TimeoutError';
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

async function fetchJson(url, signal) {
  const response = await fetchWithTimeout(url, signal);
  if (!response.ok) return null;
  const text = await response.text();
  try {
    // 少数联想接口会带 XSSI 前缀，直接 JSON.parse 会失败
    return JSON.parse(text.trim().replace(/^\)\]\}'[^\n]*\n?/, ''));
  } catch {
    return null;
  }
}

async function fetchText(url, signal) {
  const response = await fetchWithTimeout(url, signal);
  if (!response.ok) return [];
  const buffer = await response.arrayBuffer();
  return decodeBuffer(buffer, response.headers.get('content-type'));
}

function decodeBuffer(buffer, contentType) {
  const declared = /charset=([\w-]+)/i.exec(contentType || '')?.[1]?.toLowerCase();
  const tryDecode = (label) => {
    try {
      return new TextDecoder(label).decode(buffer);
    } catch {
      return null;
    }
  };
  if (declared && declared !== 'utf-8' && declared !== 'utf8') {
    const decoded = tryDecode(declared);
    if (decoded) return decoded;
  }
  const utf8 = tryDecode('utf-8') || '';
  if (utf8.includes('\ufffd')) return tryDecode('gb18030') || tryDecode('gbk') || utf8;
  return utf8;
}

/** Bing / Google(firefox client) / DuckDuckGo 都是 [query, [suggestions]] 结构 */
function parseOsjson(data) {
  if (!Array.isArray(data)) return [];
  const list = Array.isArray(data[1]) ? data[1] : [];
  return list.filter((item) => typeof item === 'string');
}

function extractQuotedArray(text) {
  const match = /s\s*:\s*\[([\s\S]*?)\]/.exec(String(text || ''));
  if (!match) return [];
  const found = match[1].match(/"((?:[^"\\]|\\.)*)"/g) || [];
  return found.map((raw) => raw.slice(1, -1).replace(/\\"/g, '"'));
}

function parseBilibili(data) {
  const tags = data?.result?.tag;
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => (typeof tag?.value === 'string' ? tag.value : typeof tag?.term === 'string' ? tag.term : ''))
    .filter(Boolean);
}

const parseBaidu = extractQuotedArray;
const parse360 = extractQuotedArray;

/* --------------------------------------------------------------- 快捷键 */

function globalHotkeys(event) {
  const isMeta = IS_MAC ? event.metaKey : event.ctrlKey;
  const overlayOpen =
    document.documentElement.dataset.overlay === 'settings' || Boolean(document.querySelector('.modal.is-open'));

  if (isMeta && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    closeMenu();
    if (!overlayOpen) focusSearch();
    return;
  }
  if (isMeta && event.key === ',') {
    event.preventDefault();
    closeMenu();
    if (!document.querySelector('.modal.is-open') && document.documentElement.dataset.overlay !== 'settings') {
      document.dispatchEvent(new CustomEvent('serein:open-settings'));
    }
    return;
  }
  if (overlayOpen || isMenuOpen()) return;
  if (event.key === '/' && !isTypingTarget(event.target)) {
    event.preventDefault();
    focusSearch();
    return;
  }
  if (event.key === '?' && !isTypingTarget(event.target)) {
    event.preventDefault();
    bus.emit('openSettings', { tab: 'about' });
  }
}

export function focusSearch() {
  if (!els || els.wrap.hidden) return;
  els.input.focus();
  els.input.select();
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export { looksLikeUrl };

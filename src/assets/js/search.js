/* Lumen · 搜索框
 *
 * 能力：多引擎切换 / 网址直开 / 本地快捷方式匹配 / 远程联想 / 键盘导航。
 * 注意：扩展从不修改浏览器的默认搜索引擎（那样会触发商店审核问题），
 * 这里的引擎只决定「本页提交后跳到哪个地址」。
 */

import { $, h, clear, svgIcon, debounce, normalizeUrl, isSafeUrl, bus, hostOf } from './util.js';
import { ENGINES, engineById } from './defaults.js';
import * as store from './store.js';
import { openMenu, closeMenu, isMenuOpen } from './menu.js';
import { resolveIcon, brandSlugFor, brandLogoUrl, previewFileIcon } from './icons.js';

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

const IS_MAC = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

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
    suggest: $('#suggest'),
    wrap: $('#search-wrap'),
    hint: $('#search-hint'),
  };

  els.submit.innerHTML = svgIcon('search', 19);
  els.suggest.inert = true;
  els.input.setAttribute('role', 'combobox');
  els.input.setAttribute('aria-autocomplete', 'list');
  els.input.setAttribute('aria-controls', 'suggest');
  els.input.setAttribute('aria-expanded', 'false');
  paintEngine();
  paintHint();

  els.wrap.hidden = store.state.config.layout.showSearch === false;

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    // 点搜索按钮 = 搜索输入框里的原文，不沿用鼠标悬停/方向键选中的联想项
    submitQuery();
  });

  els.input.addEventListener('input', onInput);
  els.input.addEventListener('focus', () => {
    clearTimeout(blurTimer);
    els.wrap.classList.add('is-focused');
  });
  els.input.addEventListener('blur', () => {
    els.wrap.classList.remove('is-focused');
    clearTimeout(blurTimer);
    blurTimer = setTimeout(closeSuggest, 120);
  });

  els.input.addEventListener('keydown', onKeydown);

  // 联想项点击时不要让输入框先失焦：否则 blur 定时器会关掉列表，慢一点点击就点不中。
  els.suggest.addEventListener('mousedown', (event) => {
    clearTimeout(blurTimer);
    if (event.target.closest?.('.suggest-item')) event.preventDefault();
  });
  // 点击搜索框以外的区域立刻收起；点击联想列表的滚动条时不会因失焦被误关。
  document.addEventListener('mousedown', (event) => {
    if (!els.wrap.contains(event.target) && !els.suggest.contains(event.target)) closeSuggest();
  });

  els.engineBtn.addEventListener('click', (event) => {
    const rect = els.engineBtn.getBoundingClientRect();
    openMenu(
      ENGINES.map((engine) => ({
        label: engine.name,
        icon: store.state.config.search.engine === engine.id ? 'check' : undefined,
        onClick: () => {
          store.patchConfig({ search: { ...store.state.config.search, engine: engine.id } });
          paintEngine();
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
    }
  });
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
  // 本地结果在 onInput 里已经画过。没有远程源时不要再重绘一次，
  // 否则 170ms 后重建列表会把用户刚用方向键选中的行清掉。
  if (!query || !engine.suggest || !store.state.config.search.suggestions) return;

  abortController?.abort();
  abortController = new AbortController();
  const epoch = suggestEpoch;

  try {
    const list = await fetchSuggestions(engine.suggest, query, abortController.signal);
    if (latestQuery !== query || epoch !== suggestEpoch) return;
    // 远程没有结果时保留 onInput 已经画好的本地列表，别重置键盘选中项
    if (!list.length) return;
    // 用户可能在 170ms 内已经用方向键选中了本地行：重绘后保留索引
    renderSuggestions(list, { keepActive: activeIndex >= 0 });
  } catch (err) {
    // 主动中止（改词/失焦/关闭）不应该再把旧结果画回来
    if (err.name === 'AbortError') return;
    if (latestQuery !== query || epoch !== suggestEpoch) return;
    // 失败时保留已经渲染好的本地结果与当前选中项，不要无谓重绘
    console.warn('[lumen/search] 联想失败', err);
  }
}, 170);

function onInput() {
  const query = els.input.value.trim();
  latestQuery = query;
  activeIndex = -1;

  if (!query) {
    closeSuggest();
    return;
  }

  renderSuggestions();
  if (looksLikeUrl(query)) {
    // 已经识别成网址时不需要再把整条 URL 发给搜索联想接口
    suggestEpoch += 1;
    requestSuggest.cancel();
    abortController?.abort();
    abortController = null;
    return;
  }
  requestSuggest(query);
}

function onKeydown(event) {
  // 中文输入法确认候选词时的 Enter / Escape 不能当成搜索操作
  if (event.isComposing || event.keyCode === 229) return;
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
    if (els.input.value) {
      els.input.value = '';
      closeSuggest();
    } else {
      els.input.blur();
    }
  } else if (event.key === 'Tab' && els.suggest.classList.contains('is-open')) {
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
    rows[activeIndex].el.scrollIntoView({ block: 'nearest' });
  } else {
    els.input.removeAttribute('aria-activedescendant');
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
  navigate(engine.url.replace('%s', encodeURIComponent(query)));
}

/* --------------------------------------------------------------- 渲染 */

function buildRow(config) {
  const el = h(
    'button',
    {
      class: 'suggest-item',
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
        activeIndex = index;
        paintActive();
      },
    },
    config.thumb || h('span', { html: svgIcon(config.icon || 'search', 16) }),
    h('span', { class: 'suggest-text', text: config.text }),
    config.hint ? h('span', { class: 'suggest-hint', text: config.hint }) : null
  );
  return { el, run: config.run };
}

function renderSuggestions(remote = [], { keepActive = false } = {}) {
  // 输入框失焦（例如用户已经点去别处/打开菜单）后，迟到的联想结果不应再弹回来。
  if (document.activeElement !== els.input) {
    closeSuggest();
    return;
  }
  const query = els.input.value.trim();
  const previousActive = keepActive ? activeIndex : -1;
  clear(els.suggest);
  rows = [];
  if (!keepActive) {
    activeIndex = -1;
    els.input.removeAttribute('aria-activedescendant');
  }

  if (!query) {
    closeSuggest();
    return;
  }

  const engine = engineById(store.state.config.search.engine);

  // 1) 网址直开
  if (looksLikeUrl(query)) {
    const url = normalizeUrl(query);
    els.suggest.appendChild(h('div', { class: 'suggest-group-label', text: '打开网址' }));
    const row = buildRow({
      icon: 'external',
      text: url.replace(/^https?:\/\//, ''),
      hint: 'Enter',
      run: () => navigate(url),
    });
    els.suggest.appendChild(row.el);
    rows.push(row);
  }

  // 2) 命令
  const commands = matchCommands(query);
  if (commands.length) {
    els.suggest.appendChild(h('div', { class: 'suggest-group-label', text: '命令' }));
    for (const command of commands) {
      const row = buildRow({
        icon: command.icon,
        text: command.label,
        hint: '命令',
        run: () => {
          els.input.value = '';
          closeSuggest();
          command.run();
        },
      });
      els.suggest.appendChild(row.el);
      rows.push(row);
    }
  }

  // 3) 本地快捷方式（包含文件夹里的条目）
  const lower = query.toLowerCase();
  const groupTitles = new Map(store.state.groups.map((group) => [group.id, group.title]));
  const matches = store.state.shortcuts
    .filter((item) => item.title.toLowerCase().includes(lower) || item.url.toLowerCase().includes(lower))
    .slice(0, 4);

  if (matches.length) {
    els.suggest.appendChild(h('div', { class: 'suggest-group-label', text: '快捷方式' }));
    for (const item of matches) {
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
            thumb.classList.remove('is-brand');
            thumb.style.background = `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`;
            thumb.style.color = descriptor.fg;
            thumb.textContent = descriptor.text;
          },
          { once: true }
        );
        thumb.appendChild(img);
      }
      const row = buildRow({
        thumb,
        text: item.title,
        hint: item.groupId ? groupTitles.get(item.groupId) || '文件夹' : '',
        run: () => navigate(item.url),
      });
      els.suggest.appendChild(row.el);
      rows.push(row);
    }
  }

  // 3) 远程联想
  if (remote.length) {
    els.suggest.appendChild(h('div', { class: 'suggest-group-label', text: `${engine.name} 联想` }));
    for (const item of remote.slice(0, 8)) {
      if (typeof item !== 'string') continue;
      const text = item.trim().slice(0, 200);
      if (!text) continue;
      const row = buildRow({
        icon: 'search',
        text,
        run: () => searchWith(text),
      });
      els.suggest.appendChild(row.el);
      rows.push(row);
    }
  }

  // 4) 兜底：直接搜索
  if (!rows.length) {
    const row = buildRow({
      icon: 'search',
      text: `用${engine.name}搜索「${query}」`,
      hint: 'Enter',
      run: () => searchWith(query),
    });
    els.suggest.appendChild(row.el);
    rows.push(row);
  }

  els.suggest.classList.add('is-open');
  els.suggest.inert = false;
  els.input.setAttribute('aria-expanded', 'true');
  if (previousActive >= 0 && rows.length) {
    activeIndex = Math.min(previousActive, rows.length - 1);
    paintActive();
  }
}

function closeSuggest() {
  suggestEpoch += 1;
  requestSuggest.cancel();
  abortController?.abort();
  abortController = null;
  els.suggest?.classList.remove('is-open');
  if (els.suggest) els.suggest.inert = true;
  els.input?.setAttribute('aria-expanded', 'false');
  els.input?.removeAttribute('aria-activedescendant');
  rows = [];
  activeIndex = -1;
}

/* --------------------------------------------------------------- 联想 */

async function fetchSuggestions(kind, query, signal) {
  switch (kind) {
    case 'bing':
      return parseBing(await fetchJson(`https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`, signal));
    case 'baidu':
      return parseBaidu(await fetchText(`https://suggestion.baidu.com/su?p=3&ie=UTF-8&wd=${encodeURIComponent(query)}`, signal));
    case '360':
      return parse360(await fetchText(`https://sug.so.360.cn/suggest?word=${encodeURIComponent(query)}&encodein=utf-8&encodeout=utf-8`, signal));
    default:
      return [];
  }
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) return null;
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchText(url, signal) {
  const response = await fetch(url, { signal, credentials: 'omit' });
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

function parseBing(data) {
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
      document.dispatchEvent(new CustomEvent('lumen:open-settings'));
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

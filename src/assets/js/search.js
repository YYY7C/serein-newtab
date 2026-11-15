/* Lumen · 搜索框
 *
 * 能力：多引擎切换 / 网址直开 / 本地快捷方式匹配 / 远程联想 / 键盘导航。
 * 注意：扩展从不修改浏览器的默认搜索引擎（那样会触发商店审核问题），
 * 这里的引擎只决定「本页提交后跳到哪个地址」。
 */

import { $, h, clear, svgIcon, debounce, normalizeUrl, bus, hostOf } from './util.js';
import { ENGINES, engineById } from './defaults.js';
import * as store from './store.js';
import { openMenu } from './menu.js';
import { resolveIcon, brandSlugFor, brandLogoUrl } from './icons.js';

let els = null;
let rows = [];
let activeIndex = -1;
let abortController = null;
let latestQuery = '';

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
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return true;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(value)) return true;
  if (/^[^\s/]+\.[a-z]{2,}(\/.*)?$/i.test(value)) return true;
  // 中文域名 / 带端口
  if (/^[^\s/]+\.[a-z]{2,}:\d+/.test(value)) return true;
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
  paintEngine();
  paintHint();

  els.wrap.hidden = store.state.config.layout.showSearch === false;

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    commitCurrent();
  });

  els.input.addEventListener('input', onInput);
  els.input.addEventListener('focus', () => els.wrap.classList.add('is-focused'));
  els.input.addEventListener('blur', () => {
    els.wrap.classList.remove('is-focused');
    setTimeout(closeSuggest, 120);
  });

  els.input.addEventListener('keydown', onKeydown);

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
      { x: rect.left, y: rect.bottom + 8 }
    );
    event.stopPropagation();
  });

  document.addEventListener('keydown', globalHotkeys);

  store.subscribe((scope) => {
    if (scope === 'config' || scope === 'all') {
      paintEngine();
      els.wrap.hidden = store.state.config.layout.showSearch === false;
    }
  });
}

function paintEngine() {
  if (!els) return;
  const engine = engineById(store.state.config.search.engine);
  clear(els.engineBtn);
  const slug = brandSlugFor(hostOf(engine.url));
  const badge = h('span', {
    class: `engine-badge${engine.letter.length > 2 ? ' is-compact' : ''}${slug ? ' is-brand' : ''}`,
  });
  if (slug) {
    badge.appendChild(h('img', { src: brandLogoUrl(slug), alt: '', decoding: 'async' }));
  } else {
    badge.textContent = engine.letter;
    badge.style.background = `linear-gradient(140deg, ${engine.color}, ${shade(engine.color, -0.22)})`;
  }
  els.engineBtn.appendChild(badge);
  els.engineBtn.appendChild(h('span', { text: engine.name }));
  els.engineBtn.appendChild(h('span', { html: svgIcon('chevron-down', 13), style: { opacity: '.55' } }));
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
  const key = IS_MAC ? '⌘' : 'Ctrl';
  els.hint.innerHTML =
    `<span><kbd>${key}</kbd> + <kbd>K</kbd> 聚焦搜索</span>` +
    `<span>输入「设置」「壁纸」直达命令</span>` +
    `<span><kbd>?</kbd> 快捷键</span>`;
  els.hint.hidden = store.state.config.layout.showHint === false;
}

/* --------------------------------------------------------------- 输入 */

const requestSuggest = debounce(async (query) => {
  const engine = engineById(store.state.config.search.engine);
  if (!query || !engine.suggest || !store.state.config.search.suggestions) {
    renderSuggestions();
    return;
  }

  abortController?.abort();
  abortController = new AbortController();

  try {
    const list = await fetchSuggestions(engine.suggest, query, abortController.signal);
    if (latestQuery !== query) return;
    renderSuggestions(list);
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[lumen/search] 联想失败', err);
    renderSuggestions();
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
  requestSuggest(query);
}

function onKeydown(event) {
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
    event.preventDefault();
    moveActive(event.shiftKey ? -1 : 1);
  }
}

function moveActive(delta) {
  if (!rows.length) return;
  activeIndex = (activeIndex + delta + rows.length + 1) % (rows.length + 1) - 1;
  paintActive();
}

function paintActive() {
  rows.forEach((row, index) => row.el.classList.toggle('is-active', index === activeIndex));
  if (activeIndex >= 0 && rows[activeIndex]) {
    rows[activeIndex].el.scrollIntoView({ block: 'nearest' });
  }
}

/* --------------------------------------------------------------- 提交 */

function commitCurrent() {
  if (activeIndex >= 0 && rows[activeIndex]) {
    rows[activeIndex].run();
    return;
  }

  const query = els.input.value.trim();
  if (!query) return;
  if (looksLikeUrl(query)) {
    navigate(normalizeUrl(query));
  } else {
    searchWith(query);
  }
}

function navigate(url) {
  if (store.state.config.search.openInNewTab) window.open(url, '_blank', 'noopener');
  else location.href = url;
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
      onclick: () => config.run(),
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

function renderSuggestions(remote = []) {
  const query = els.input.value.trim();
  clear(els.suggest);
  rows = [];
  activeIndex = -1;

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

  // 3) 本地快捷方式
  const lower = query.toLowerCase();
  const matches = store.state.shortcuts
    .filter((item) => !item.groupId)
    .filter((item) => item.title.toLowerCase().includes(lower) || item.url.toLowerCase().includes(lower))
    .slice(0, 4);

  if (matches.length) {
    els.suggest.appendChild(h('div', { class: 'suggest-group-label', text: '快捷方式' }));    for (const item of matches) {
      const descriptor = resolveIcon(item, { iconStyle: store.state.config.layout.iconStyle || 'brand' });
      const thumb = h('span', {
        class: `suggest-thumb${descriptor.brand ? ' is-brand' : ''}`,
        text: descriptor.brand ? '' : descriptor.text,
      });
      if (!descriptor.brand) thumb.style.background = `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`;
      if (descriptor.src) {
        const img = h('img', { src: descriptor.src, alt: '', loading: 'lazy', decoding: 'async' });
        img.addEventListener(
          'load',
          () => {
            if (!descriptor.brand) {
              thumb.textContent = '';
              thumb.style.background = 'transparent';
            }
            thumb.appendChild(img);
          },
          { once: true }
        );
        img.addEventListener('error', () => img.remove(), { once: true });
      }
      const row = buildRow({
        thumb,
        text: item.title,
        hint: item.groupId ? '文件夹' : '',
        run: () => navigate(item.url),
      });
      els.suggest.appendChild(row.el);
      rows.push(row);
    }
  }

  // 3) 远程联想
  if (remote.length) {
    els.suggest.appendChild(h('div', { class: 'suggest-group-label', text: `${engine.name} 联想` }));
    for (const text of remote.slice(0, 8)) {
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
}

function closeSuggest() {
  els.suggest?.classList.remove('is-open');
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

  if (isMeta && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    focusSearch();
    return;
  }
  if (isMeta && event.key === ',') {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('lumen:open-settings'));
    return;
  }
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

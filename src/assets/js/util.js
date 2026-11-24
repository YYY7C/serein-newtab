/* Serein · 基础工具层
 * 无任何第三方依赖：DOM 构造、事件总线、URL 归一化、颜色推导、图标片段。
 */

import { t } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ------------------------------------------------------------------ id */

export function uid(prefix = '') {
  return prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
}

/* ------------------------------------------------------------------ DOM */

function appendChildren(node, children) {
  for (const child of children.flat(6)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * 轻量 hyperscript。
 * h('div', { class: 'x', onclick: fn, html: '<b>y</b>' }, 'child')
 */
export function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') node.className = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'style' && typeof value === 'object') {
        for (const [prop, val] of Object.entries(value)) {
          if (prop.startsWith('--')) node.style.setProperty(prop, val);
          else node.style[prop] = val;
        }
      }
      else if (key === 'dataset' && typeof value === 'object') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else node.setAttribute(key, value === true ? '' : String(value));
    }
  } else if (attrs !== null && attrs !== undefined) {
    children.unshift(attrs);
  }
  appendChildren(node, children);
  return node;
}

export const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
};

/* ------------------------------------------------------------- 事件总线 */

export const bus = (() => {
  const map = new Map();
  return {
    on(evt, fn) {
      if (!map.has(evt)) map.set(evt, new Set());
      map.get(evt).add(fn);
      return () => map.get(evt)?.delete(fn);
    },
    emit(evt, payload) {
      const set = map.get(evt);
      if (!set) return;
      for (const fn of Array.from(set)) {
        try {
          fn(payload);
        } catch (err) {
          console.error('[serein/bus]', evt, err);
        }
      }
    },
  };
})();

/* --------------------------------------------------------------- 调度 */

export function debounce(fn, ms = 200) {
  let timer = 0;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function raf2(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/* --------------------------------------------------------------- 数值 */

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function relativeTime(ts) {
  if (!ts) return t('从未');
  const diff = Date.now() - ts;
  if (diff < 60_000) return t('刚刚');
  if (diff < 3_600_000) return t('{n} 分钟前', { n: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t('{n} 小时前', { n: Math.floor(diff / 3_600_000) });
  return t('{n} 天前', { n: Math.floor(diff / 86_400_000) });
}

/* --------------------------------------------------------------- 字符串 */

export function escapeHtml(input) {
  return String(input).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
// 冒号后必须是端口数字：否则 `com.app://custom` 会被误当成域名补成 https。
// 允许 Unicode 标签，中文域名也能被补全为 https。
const HOSTLIKE_RE = /^[\p{L}\p{M}\p{N}_-]+(?:\.[\p{L}\p{M}\p{N}_-]+)+(?:[/?#].*|:\d+.*)?$/u;
const LOCALHOST_RE = /^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i;

/** 把用户输入补全成可用 URL；无法识别时原样返回（例如 chrome:// 或 javascript:） */
export function normalizeUrl(input) {
  let raw = String(input ?? '').trim();
  if (!raw) return '';
  // localhost:3000 会被误判为 scheme，必须先处理；
  // example.com:8080 同理（点号在 scheme 字符集里，不能只看冒号）。
  if (LOCALHOST_RE.test(raw)) return 'http://' + raw;
  if (raw.startsWith('//')) return raw.length > 2 ? 'https:' + raw : '';
  if (HOSTLIKE_RE.test(raw)) return 'https://' + raw;
  if (SCHEME_RE.test(raw)) return raw;
  return raw;
}

export function isSafeUrl(url) {
  // 浏览器会忽略 URL 协议里的制表符/换行符，做安全检查前先同样剥掉，
  // 否则 `java\nscript:` 能绕过前缀匹配。
  const normalized = normalizeUrl(url);
  // eslint-disable-next-line no-control-regex -- 安全检查需要匹配控制字符
  const value = normalized.toLowerCase().replace(/[\u0000-\u0020\u007f]+/g, '');
  if (!value) return false;
  if (/^(javascript|data|vbscript|file):/.test(value)) return false;
  // http(s) 必须是 // 形式并能解析出主机名；`https:`、`https://` 或含空格的残片都不算
  if (/^https?:/.test(value)) {
    if (!/^https?:\/\//.test(value)) return false;
    try {
      return Boolean(new URL(normalized).hostname);
    } catch {
      return false;
    }
  }
  return true;
}

/** 快捷方式地址：安全且具备可导航形状（协议或可补全的域名），不接受「随便一句话」 */
export function isUsableUrl(input) {
  const url = normalizeUrl(input);
  if (!url || !isSafeUrl(url)) return false;
  const match = SCHEME_RE.exec(url);
  if (!match) return false;
  // `example.com:abc` / `localhost:abc` 会被 SCHEME_RE 误当成自定义协议；
  // 真正带点号的自定义协议只接受显式的 scheme:// 形式。
  const scheme = match[0].slice(0, -1).toLowerCase();
  if ((scheme === 'localhost' || scheme.includes('.')) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    return false;
  }
  return true;
}

/**
 * 图片地址：壁纸/自定义图标只接受 http(s) 与 data:image。
 * 不允许 data:text/html、file: 或带控制字符的地址进入 CSS。
 */
export function isSafeImageUrl(input) {
  const value = String(input ?? '').trim();
  if (!value) return false;
  // eslint-disable-next-line no-control-regex -- 拒绝带控制字符的图片地址
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^data:/i.test(value)) {
    return /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(value);
  }
  const normalized = normalizeUrl(value);
  // 允许扩展自身资源（图标编辑器的预览测试也走这个分支）；
  // chrome-extension:// 页面资源只能被本扩展显式声明暴露，图片上下文不会执行脚本。
  if (!/^(?:https?|chrome-extension):\/\//i.test(normalized)) return false;
  try {
    return Boolean(new URL(normalized).hostname);
  } catch {
    return false;
  }
}

/**
 * 选一个能在给定背景色上保持可读的前景色。
 * 强调色和品牌色都可能很亮（亮绿、粉色），白字会掉到 2–3:1。
 */
export function readableTextOn(input) {
  const value = String(input ?? '').trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) return '#ffffff';
  let hex = match[1];
  if (hex.length === 3) hex = hex.split('').map((char) => char + char).join('');
  const channel = (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255;
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance =
    0.2126 * linear(channel(0)) + 0.7152 * linear(channel(2)) + 0.0722 * linear(channel(4));
  // 0.18 附近是白字与深色字的对比度交点，两侧都能过 AA
  return luminance > 0.18 ? '#0a0c10' : '#ffffff';
}

export function hostOf(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function prettyHost(url) {
  const host = hostOf(url);
  return host || String(url || '').slice(0, 40);
}

/* --------------------------------------------------------------- 颜色 */

export function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function hsl(hue, sat, light) {
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/** HSL -> #rrggbb：图标兜底色要继续参与 shade()/亮度计算，必须是可解析的 hex */
function hslToHex(hue, sat, light) {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, sat)) / 100;
  const l = Math.min(100, Math.max(0, light)) / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * 用领域名推导一组和谐的品牌感配色。
 * 同一域名永远得到同一颜色，保证刷新后视觉稳定。
 */
export function domainPalette(seed) {
  const hash = hashString(String(seed || 'serein'));
  const hue = hash % 360;
  const hue2 = (hue + 26 + (hash % 18)) % 360;
  return {
    hue,
    from: hslToHex(hue, 68, 58),
    to: hslToHex(hue2, 72, 44),
    solid: hslToHex(hue, 62, 50),
  };
}

export function hexToRgb(hex) {
  const value = String(hex).replace('#', '').trim();
  // 支持 #RGB / #RGBA / #RRGGBB / #RRGGBBAA；alpha 不参与图标底色的明暗计算
  const full =
    value.length === 3 || value.length === 4
      ? value
          .slice(0, 3)
          .split('')
          .map((c) => c + c)
          .join('')
      : value.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return { r: 128, g: 128, b: 128 };
  const num = Number.parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* --------------------------------------------------------- 内联图标 */

/* 24x24 线性图标，手绘路径，描边统一走 currentColor */
const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.2 14.6a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.56 1.03Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L20 20"/>',
  palette: '<path d="M12 21a9 9 0 1 1 9-9c0 2.2-1.8 3-3.4 3H16a2 2 0 0 0-1.4 3.4A1.9 1.9 0 0 1 12 21Z"/><circle cx="7.6" cy="12" r="1.1"/><circle cx="9.8" cy="8" r="1.1"/><circle cx="14.4" cy="7.6" r="1.1"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  layout: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 9.5h17M9.5 9.5V20.5"/>',
  list: '<path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
  folder: '<path d="M3.5 8.2A2.7 2.7 0 0 1 6.2 5.5h3l2 2.4h6.6a2.7 2.7 0 0 1 2.7 2.7v6.7a2.7 2.7 0 0 1-2.7 2.7H6.2a2.7 2.7 0 0 1-2.7-2.7Z"/>',
  'folder-plus': '<path d="M3.5 8.2A2.7 2.7 0 0 1 6.2 5.5h3l2 2.4h6.6a2.7 2.7 0 0 1 2.7 2.7v6.7a2.7 2.7 0 0 1-2.7 2.7H6.2a2.7 2.7 0 0 1-2.7-2.7Z"/><path d="M12 11.6v5.2M9.4 14.2h5.2"/>',
  trash: '<path d="M4 7h16M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7"/><path d="M6.3 7l.8 12a2 2 0 0 0 2 1.9h5.8a2 2 0 0 0 2-1.9l.8-12"/><path d="M10.4 11v6M13.6 11v6"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L17 5a2.1 2.1 0 0 0-3 0L3.5 15.5Z"/><path d="m14 6 4 4"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10.5 13.5"/><path d="M18.5 14.5V18a2.5 2.5 0 0 1-2.5 2.5H5.5A2.5 2.5 0 0 1 3 18V7.5A2.5 2.5 0 0 1 5.5 5H9"/>',
  more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
  moon: '<path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.7 8.7 0 1 0 10.8 10.8Z"/>',
  refresh: '<path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1"/><path d="M20.5 4.2v5.2h-5.2"/>',
  download: '<path d="M12 3.5v11"/><path d="m7.6 10.4 4.4 4.4 4.4-4.4"/><path d="M4.5 19.5h15"/>',
  upload: '<path d="M12 20.5v-11"/><path d="m7.6 13.6 4.4-4.4 4.4 4.4"/><path d="M4.5 4.5h15"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6"/><path d="M4.5 12v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 10.8v5.4M12 7.9v.2"/>',
  'list-checks': '<path d="M4 7.5 6 9.5 9 6"/><path d="M4 15.5 6 17.5 9 14"/><path d="M12 8h8M12 16h8"/>',
  note: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h6.2L20 9.3v9.2A2.5 2.5 0 0 1 17.5 21h-10A2.5 2.5 0 0 1 5 18.5Z"/><path d="M13.4 3v6.2H20"/><path d="M8.6 13.5h6.8M8.6 17h4.6"/>',
  bookmark: '<path d="M6.5 4.5h11a1 1 0 0 1 1 1v15l-6.5-4.6-6.5 4.6v-15a1 1 0 0 1 1-1Z"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.4 8.6-2 4.8-4.8 2 2-4.8Z"/>',
  weather: '<path d="M7.2 17.5a4 4 0 0 1-.4-8 5.4 5.4 0 0 1 10.3 1.1 3.4 3.4 0 0 1-.3 6.9Z"/>',
  chevron: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  'chevron-down': '<path d="m5.5 9 6.5 6.5L18.5 9"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3.1"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/>',
  keyboard: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M15 4.5v15"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  arrowLeft: '<path d="M20 12H4.5"/><path d="m10.5 5.5-6.5 6.5 6.5 6.5"/>',
  history: '<path d="M3.6 12a8.4 8.4 0 1 0 2.5-6"/><path d="M3.5 4.3v5.2h5.2"/><path d="M12 8.2v4.3l2.9 1.7"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.4"/><path d="M15.5 8.5v-2A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2"/>',
  sparkle: '<path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7Z"/><path d="M18.4 15.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',
  timer: '<circle cx="12" cy="13.2" r="7.8"/><path d="M12 9.2v4l2.6 1.6"/><path d="M9 2.5h6M12 2.5v2.7"/>',
};

export function svgIcon(name, size = 20, extraClass = '') {
  const body = PATHS[name] || PATHS.info;
  return (
    `<svg class="ico ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${body}</svg>`
  );
}

/** 返回真实 SVG 元素，方便和其他 DOM 组合 */
export function iconEl(name, size = 20, extraClass = '') {
  const wrap = document.createElement('span');
  wrap.className = 'ico-wrap';
  wrap.innerHTML = svgIcon(name, size, extraClass);
  return wrap.firstElementChild;
}

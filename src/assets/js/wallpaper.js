/* Serein · 壁纸与主题
 *
 * 负责三件事：
 *   1. 解析 background 配置 -> 真实可渲染的层（渐变 / 图片 / 必应每日 / 纯色）
 *   2. 把 blur / brightness / saturate 与逐风格遮罩强度落到 CSS 变量与内联样式
 *   3. 自动判定文字色调（tone），让浅色壁纸上也能看清
 */

import { $, normalizeUrl, isSafeImageUrl } from './util.js';
import { files, trackObjectUrl, revokeObjectUrl } from './storage.js';
import { gradientById } from './defaults.js';
import { styleTone } from './theme.js';
import * as store from './store.js';

const BING_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=%IDX%&n=1&mkt=zh-CN';
const BING_CDN = 'https://cn.bing.com';

let mediaEl;
let veilEl;
let vignetteEl;
let currentObjectUrl = null;
let currentFileId = null;
let currentImageSrc = '';
let backgroundToken = 0;
const toneCache = new Map();

export function initBackground(store) {
  mediaEl = $('#bg-media');
  veilEl = $('#bg-veil');
  vignetteEl = $('#bg-vignette');
  return applyBackground(store.state);
}

function releaseCurrentFile() {
  if (currentObjectUrl) {
    toneCache.delete(currentObjectUrl);
    revokeObjectUrl(currentObjectUrl);
  }
  currentObjectUrl = null;
  currentFileId = null;
  currentImageSrc = '';
}

/* --------------------------------------------------------------- 应用 */

export async function applyBackground(state) {
  const bg = state.config.background;
  const token = ++backgroundToken;
  const fallbackCss = gradientById(bg.gradient).css;
  let layer = null;
  // 固定明暗的风格/手动色调不用等图片/接口，先把文字色切过去
  setForcedTone(bg);

  if (bg.type !== 'file') releaseCurrentFile();

  switch (bg.type) {
    case 'color': {
      mediaEl.style.backgroundImage = 'none';
      mediaEl.style.backgroundColor = bg.color || '#0a1024';
      mediaEl.classList.remove('is-slow');
      mediaEl.classList.add('is-ready');
      currentImageSrc = '';
      layer = { tone: luminanceTone(bg.color), kind: 'color' };
      break;
    }
    case 'gradient': {
      const preset = gradientById(bg.gradient);
      mediaEl.style.backgroundImage = preset.css;
      mediaEl.style.backgroundColor = 'transparent';
      mediaEl.classList.remove('is-slow');
      mediaEl.classList.add('is-ready');
      currentImageSrc = '';
      layer = { tone: preset.tone, kind: 'gradient' };
      break;
    }
    case 'bing': {
      // 本地壁纸刚被释放/首次打开时先铺渐变，别让网络请求期间只剩底色
      if (!currentImageSrc) setGradientFallback(bg);
      layer = await applyBing(bg, token, fallbackCss);
      if (token !== backgroundToken) return;
      break;
    }
    case 'url': {
      const src = bg.url ? normalizeUrl(bg.url) : '';
      if (src && isSafeImageUrl(src)) {
        setImage(src, true, fallbackCss);
        layer = { tone: null, kind: 'image' };
      } else {
        layer = setGradientFallback(bg);
      }
      break;
    }
    case 'file': {
      if (!bg.fileId) {
        releaseCurrentFile();
        layer = setGradientFallback(bg);
      } else {
        layer = await applyLocalFile(bg.fileId, token, fallbackCss);
        if (token !== backgroundToken) return;
        if (!layer) layer = setGradientFallback(bg);
      }
      break;
    }
    default:
      layer = setGradientFallback(bg);
      break;
  }

  applyFilters(bg);
  applyTone(bg, layer?.tone ?? null);
  applyVignette(bg);
}

/**
 * 只改滤镜/暗角，不重新解析壁纸来源。
 * 拖亮度/模糊滑块时不应重复请求必应接口或重新读 IndexedDB 里的本地壁纸。
 */
export function applyBackgroundLook(state) {
  const bg = state.config.background;
  applyFilters(bg);
  applyVignette(bg);
}

function applyVignette(bg) {
  if (bg.vignette) vignetteEl.classList.add('is-on');
  else vignetteEl.classList.remove('is-on');
}

function setImage(src, cover = true, fallbackCss = '') {
  if (!src) return;
  mediaEl.style.backgroundColor = 'transparent';
  if (src !== currentImageSrc) {
    currentImageSrc = src;
    const escaped = String(src).replace(/\\/g, '\\\\').replace(/"/g, '%22');
    mediaEl.style.backgroundImage = `url("${escaped}")${fallbackCss ? `, ${fallbackCss}` : ''}`;
    // 只有真正换图才强制一次样式计算；调亮度/模糊时不再触发同步布局
    void mediaEl.offsetWidth;
    mediaEl.classList.add('is-ready');
  }
  mediaEl.style.backgroundSize = 'cover';
  if (cover) mediaEl.classList.add('is-slow');
  else mediaEl.classList.remove('is-slow');
}

/** 图片类来源缺失/失败时，退回当前渐变预设，而不是留在上一张壁纸上 */
function setGradientFallback(bg) {
  const preset = gradientById(bg.gradient);
  mediaEl.style.backgroundImage = preset.css;
  mediaEl.style.backgroundColor = 'transparent';
  mediaEl.classList.remove('is-slow');
  mediaEl.classList.add('is-ready');
  currentImageSrc = '';
  return { tone: preset.tone, kind: 'gradient', fallback: true };
}

/** 每种风格的默认遮罩强度（%）：材质/纸面型风格要靠它压住壁纸，保证表面干净；
 *  原色与玻璃则完全不压。设置页可逐风格覆盖，值存在 background.veilByStyle。
 *  白纸只压到 75%，保留约 1/4 的壁纸，做成一层暖灰纸纹而不是一片白。 */
export const STYLE_VEIL = { glass: 0, native: 0, noir: 80, paper: 75, editorial: 93, terminal: 94 };

/** 当前风格实际生效的遮罩强度（0–100）：用户覆盖优先，否则用该风格的预设值 */
export function styleVeilPercent(bg, style) {
  const override = bg?.veilByStyle?.[style];
  if (typeof override === 'number' && Number.isFinite(override)) {
    return Math.min(100, Math.max(0, Math.round(override)));
  }
  return STYLE_VEIL[style] ?? 0;
}

/** 透出来的壁纸还要褪色：白纸上是「印在纸上的照片」，不是彩色幻灯片 */
const STYLE_SATURATE = { paper: 0.45 };

function applyFilters(bg) {
  const style = document.documentElement.dataset.style || 'glass';
  const baseSaturate = Number.isFinite(Number(bg.saturate)) ? Number(bg.saturate) : 100;
  const saturate = Math.max(0, baseSaturate) * (STYLE_SATURATE[style] ?? 1);

  const filters = [];
  if (bg.blur > 0) filters.push(`blur(${bg.blur}px)`);
  filters.push(`brightness(${bg.brightness}%)`);
  filters.push(`saturate(${Math.round(saturate)}%)`);
  mediaEl.style.filter = filters.join(' ');
  mediaEl.style.transform = bg.blur > 0 ? 'scale(1.09)' : '';

  veilEl.style.opacity = String(styleVeilPercent(bg, style) / 100);
}

/* ------------------------------------------------------------------ 必应 */

async function applyBing(bg, token, fallbackCss = '') {
  // 必须用本地日期：必应按用户所在时区换图，UTC 日期会在每天 0–8 点间误判
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const cached = bg.bing || {};

  // 同一天、同一 idx，直接复用
  if (cached.url && cached.date === today && cached.idx === (bg.bing?.idx ?? 0)) {
    setImage(cached.url, true, fallbackCss);
    return { tone: null, kind: 'image' };
  }

  try {
    const response = await fetch(BING_API.replace('%IDX%', String(bg.bing?.idx ?? 0)), {
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (token !== backgroundToken) return null;
    const image = data?.images?.[0];
    if (!image || typeof image.urlbase !== 'string' || !image.urlbase) throw new Error('响应缺少 urlbase');

    const url = `${BING_CDN}${image.urlbase}_1920x1080.jpg`;
    setImage(url, true, fallbackCss);

    // 写回缓存（不触发整体 commit，避免循环）
    bg.bing = {
      idx: bg.bing?.idx ?? 0,
      date: today,
      url,
      copyright: typeof image.copyright === 'string' ? image.copyright.slice(0, 200) : '',
      title: typeof image.title === 'string' ? image.title.slice(0, 200) : '',
    };
    // 把当日地址写回状态，避免每次打开新标签页都重新请求同一个接口。
    // 只落盘不广播：壁纸缓存变化不需要重建任何视图。
    store.persist();
    return { tone: null, kind: 'image' };
  } catch (err) {
    if (token !== backgroundToken) return null;
    console.warn('[serein/bg] 必应壁纸获取失败，回落缓存或渐变', err);
    // 离线/接口故障时优先显示昨天缓存的图；图片本身失败时仍有渐变兜底
    if (cached.url) {
      setImage(cached.url, true, fallbackCss);
      return { tone: null, kind: 'image' };
    }
    return setGradientFallback(bg);
  }
}

/** 手动换一张（idx 0..7） */
export async function cycleBing(state, delta = 1) {
  const bg = state.config.background;
  const next = (((bg.bing?.idx ?? 0) + delta) % 8 + 8) % 8;
  bg.bing = { ...(bg.bing || {}), idx: next, date: '' };
  await applyBackground(state);
  return next;
}

/**
 * 最近 N 天的必应壁纸（idx 0 = 今天，往回数）。
 * 缩略图用 _400x240.jpg 变体，一张约 30 KB。
 * 设置页反复进出时复用同一次请求，避免重复拉取 8 张缩略图。
 */
let galleryCache = null;
let galleryCachedAt = 0;

export async function fetchBingGallery(count = 8) {
  if (galleryCache && Date.now() - galleryCachedAt < 10 * 60 * 1000) return galleryCache;
  const response = await fetch(
    `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${count}&mkt=zh-CN`,
    { credentials: 'omit', cache: 'no-store' }
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const images = Array.isArray(data?.images) ? data.images : [];
  const list = images
    .map((image, idx) => {
      if (!image || typeof image.urlbase !== 'string' || !image.urlbase) return null;
      const raw = String(image.fullstartdate || '');
      const date = raw.length === 8 ? `${Number(raw.slice(4, 6))}/${Number(raw.slice(6, 8))}` : '';
      return {
        idx,
        url: `${BING_CDN}${image.urlbase}_1920x1080.jpg`,
        thumb: `${BING_CDN}${image.urlbase}_400x240.jpg`,
        copyright: typeof image.copyright === 'string' ? image.copyright : '',
        title: typeof image.title === 'string' ? image.title : '',
        date,
      };
    })
    .filter(Boolean);
  galleryCache = list;
  galleryCachedAt = Date.now();
  return list;
}

/* ------------------------------------------------------------------ 本地 */

async function applyLocalFile(fileId, token, fallbackCss = '') {
  if (!fileId) {
    releaseCurrentFile();
    return null;
  }
  if (fileId === currentFileId && currentObjectUrl) {
    setImage(currentObjectUrl, true, fallbackCss);
    return { tone: null, kind: 'image' };
  }

  let blob;
  try {
    blob = await files.get(`wallpaper:${fileId}`);
  } catch {
    blob = null;
  }
  if (token !== backgroundToken) return null;
  if (!(blob instanceof Blob)) {
    releaseCurrentFile();
    return null;
  }

  releaseCurrentFile();
  currentFileId = fileId;
  currentObjectUrl = trackObjectUrl(URL.createObjectURL(blob));
  setImage(currentObjectUrl, true, fallbackCss);
  return { tone: null, kind: 'image' };
}

export async function saveLocalWallpaper(file) {
  const id = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const result = await files.put(`wallpaper:${id}`, file);
  if (!result) throw new Error('壁纸保存失败');
  return id;
}

export async function dropLocalWallpaper(fileId) {
  if (fileId) await files.remove(`wallpaper:${fileId}`);
}

/* ------------------------------------------------------------------ 色调 */

function luminanceTone(color) {
  const raw = String(color || '').trim();
  let r;
  let g;
  let b;
  if (raw.startsWith('#')) {
    let hex = raw.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).split('').map((c) => c + c).join('');
    if (hex.length === 8) hex = hex.slice(0, 6);
    if (!/^[0-9a-f]{6}$/i.test(hex)) return 'dark';
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
  } else {
    const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(raw);
    if (!match) return 'dark';
    r = Number(match[1]) / 255;
    g = Number(match[2]) / 255;
    b = Number(match[3]) / 255;
  }
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? 'light' : 'dark';
}

function isLightColor(hex) {
  return luminanceTone(hex) === 'light';
}

let toneObserverToken = 0;

/**
 * 图片类壁纸需要采样才能知道明暗。
 * 用 canvas 读一次低分辨率缩略图 —— 失败就保持当前色调，不影响可用性。
 */
async function sampleImageTone(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      // 超时后取消这次离屏解码/请求，别让它在后台继续占带宽和内存
      img.onload = null;
      img.onerror = null;
      img.src = '';
      resolve(null);
    }, 2500);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 24, 24);
        const { data } = ctx.getImageData(0, 0, 24, 24);
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          total += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        const avg = total / (data.length / 4);
        resolve(avg > 0.58 ? 'light' : 'dark');
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

function setForcedTone(bg) {
  const root = document.documentElement;
  // 用户手动锁定的色调优先级最高
  if (bg.tone === 'dark' || bg.tone === 'light') {
    root.dataset.tone = bg.tone;
    return true;
  }
  // 纸面/终端这类「固定明暗」的风格不采样壁纸：
  // 既省掉一次离屏 canvas 解码，也避免首屏色调跳变。
  const forced = styleTone(root.dataset.style || 'glass');
  if (forced) {
    root.dataset.tone = forced;
    return true;
  }
  return false;
}

async function applyTone(bg, known) {
  const token = ++toneObserverToken;
  const root = document.documentElement;
  if (setForcedTone(bg)) return;

  let tone = known;

  if (!tone) {
    // 图片类：尝试采样（同一张图只解码一次）。直接使用记录下来的 src，
    // 不再从 style.backgroundImage 反解析（URL 里带引号/括号时会解析错）。
    const src = currentImageSrc;
    if (src) {
      if (toneCache.has(src)) {
        tone = toneCache.get(src);
      } else {
        tone = await sampleImageTone(src);
        if (tone) {
          if (toneCache.size > 16) toneCache.delete(toneCache.keys().next().value);
          toneCache.set(src, tone);
        }
      }
    }
    if (token !== toneObserverToken) return;
  }

  if (!tone) {
    // 采样失败：优先跟随系统主题猜测；纯色背景则用背景色计算。
    // 图片层会把 backgroundColor 设为 transparent，不能拿它当有效颜色。
    tone = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const color = mediaEl.style.backgroundColor;
    if (color && color !== 'transparent' && !/^rgba?\(.*,\s*0\)$/.test(color)) {
      tone = luminanceTone(color);
    }
  }

  root.dataset.tone = tone;
}

/* --------------------------------------------------------------- 主题色 */

export function applyAccent(hex) {
  const root = document.documentElement;
  root.style.setProperty('--accent', hex || '#6c8cff');
}

export { isLightColor };

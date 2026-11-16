/* Lumen · 壁纸与主题
 *
 * 负责三件事：
 *   1. 解析 background 配置 -> 真实可渲染的层（渐变 / 图片 / 必应每日 / 纯色）
 *   2. 把 blur / brightness / saturate / veil 落到 CSS 变量与内联样式
 *   3. 自动判定文字色调（tone），让浅色壁纸上也能看清
 */

import { $ } from './util.js';
import { files, trackObjectUrl, revokeObjectUrl } from './storage.js';
import { gradientById } from './defaults.js';
import { styleTone } from './theme.js';

const BING_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=%IDX%&n=1&mkt=zh-CN';
const BING_CDN = 'https://cn.bing.com';

let mediaEl;
let veilEl;
let vignetteEl;
let currentObjectUrl = null;

export function initBackground(store) {
  mediaEl = $('#bg-media');
  veilEl = $('#bg-veil');
  vignetteEl = $('#bg-vignette');
  return applyBackground(store.state);
}

/* --------------------------------------------------------------- 应用 */

export async function applyBackground(state) {
  const bg = state.config.background;
  let layer = null;

  switch (bg.type) {
    case 'color': {
      mediaEl.style.backgroundImage = 'none';
      mediaEl.style.backgroundColor = bg.color || '#0a1024';
      mediaEl.classList.remove('is-slow');
      mediaEl.classList.add('is-ready');
      layer = { tone: luminanceTone(bg.color), kind: 'color' };
      break;
    }
    case 'gradient': {
      const preset = gradientById(bg.gradient);
      mediaEl.style.backgroundImage = preset.css;
      mediaEl.style.backgroundColor = 'transparent';
      mediaEl.classList.remove('is-slow');
      mediaEl.classList.add('is-ready');
      layer = { tone: preset.tone, kind: 'gradient' };
      break;
    }
    case 'bing': {
      layer = await applyBing(bg);
      break;
    }
    case 'url': {
      if (bg.url) {
        setImage(bg.url, true);
        layer = { tone: null, kind: 'image' };
      }
      break;
    }
    case 'file': {
      layer = await applyLocalFile(bg.fileId);
      break;
    }
    default:
      break;
  }

  applyFilters(bg);
  applyTone(bg, layer?.tone ?? null);

  if (state.config.background.vignette) vignetteEl.classList.add('is-on');
  else vignetteEl.classList.remove('is-on');
}

function setImage(src, cover = true) {
  if (!src) return;
  mediaEl.style.backgroundColor = 'transparent';
  mediaEl.style.backgroundImage = `url("${String(src).replace(/"/g, '%22')}")`;
  mediaEl.style.backgroundSize = 'cover';
  void mediaEl.offsetWidth;
  mediaEl.classList.add('is-ready');
  if (cover) mediaEl.classList.add('is-slow');
}

/** 背景遮罩下限：列表型/材质型风格需要压住壁纸，保证表面干净；原色风格则完全不压 */
const STYLE_VEIL = { glass: 0, native: 0, noir: 0.8, paper: 0.93, editorial: 0.93, terminal: 0.94 };

function applyFilters(bg) {
  const filters = [];
  if (bg.blur > 0) filters.push(`blur(${bg.blur}px)`);
  filters.push(`brightness(${bg.brightness}%)`);
  filters.push(`saturate(${bg.saturate}%)`);
  mediaEl.style.filter = filters.join(' ');
  mediaEl.style.transform = bg.blur > 0 ? 'scale(1.09)' : '';

  const style = document.documentElement.dataset.style || 'glass';
  const floor = STYLE_VEIL[style] ?? 0;
  veilEl.style.opacity = String(Math.max(Math.max(0, bg.veil) / 100, floor));
}

/* ------------------------------------------------------------------ 必应 */

async function applyBing(bg) {
  const today = new Date().toISOString().slice(0, 10);
  const cached = bg.bing || {};

  // 同一天、同一 idx，直接复用
  if (cached.url && cached.date === today && cached.idx === (bg.bing?.idx ?? 0)) {
    setImage(cached.url);
    return { tone: null, kind: 'image' };
  }

  try {
    const response = await fetch(BING_API.replace('%IDX%', String(bg.bing?.idx ?? 0)), {
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const image = data?.images?.[0];
    if (!image?.urlbase) throw new Error('响应缺少 urlbase');

    const url = `${BING_CDN}${image.urlbase}_1920x1080.jpg`;
    setImage(url);

    // 写回缓存（不触发整体 commit，避免循环）
    bg.bing = {
      idx: bg.bing?.idx ?? 0,
      date: today,
      url,
      copyright: image.copyright || '',
      title: image.title || '',
    };
    return { tone: null, kind: 'image' };
  } catch (err) {
    console.warn('[lumen/bg] 必应壁纸获取失败，回落渐变', err);
    const preset = gradientById(bg.gradient || 'aurora');
    mediaEl.style.backgroundImage = preset.css;
    mediaEl.style.backgroundColor = 'transparent';
    mediaEl.classList.remove('is-slow');
    mediaEl.classList.add('is-ready');
    return { tone: preset.tone, kind: 'gradient', fallback: true };
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
 */
export async function fetchBingGallery(count = 8) {
  const response = await fetch(
    `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${count}&mkt=zh-CN`,
    { credentials: 'omit', cache: 'no-store' }
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const images = Array.isArray(data?.images) ? data.images : [];
  return images.map((image, idx) => {
    const raw = String(image.fullstartdate || '');
    const date = raw.length === 8 ? `${Number(raw.slice(4, 6))}/${Number(raw.slice(6, 8))}` : '';
    return {
      idx,
      url: `${BING_CDN}${image.urlbase}_1920x1080.jpg`,
      thumb: `${BING_CDN}${image.urlbase}_400x240.jpg`,
      copyright: image.copyright || '',
      title: image.title || '',
      date,
    };
  });
}

/* ------------------------------------------------------------------ 本地 */

async function applyLocalFile(fileId) {
  if (!fileId) return null;
  const blob = await files.get(`wallpaper:${fileId}`);
  if (!blob) return null;
  if (currentObjectUrl) revokeObjectUrl(currentObjectUrl);
  currentObjectUrl = trackObjectUrl(URL.createObjectURL(blob));
  setImage(currentObjectUrl);
  return { tone: null, kind: 'image' };
}

export async function saveLocalWallpaper(file) {
  const id = `w${Date.now().toString(36)}`;
  await files.put(`wallpaper:${id}`, file);
  return id;
}

export async function dropLocalWallpaper(fileId) {
  if (fileId) await files.remove(`wallpaper:${fileId}`);
}

/* ------------------------------------------------------------------ 色调 */

function luminanceTone(color) {
  const hex = String(color).replace('#', '');
  if (hex.length !== 6) return 'dark';
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
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
    const timer = setTimeout(() => resolve(null), 2500);
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

async function applyTone(bg, known) {
  const token = ++toneObserverToken;
  const root = document.documentElement;

  // 用户手动锁定的色调优先级最高
  if (bg.tone === 'dark' || bg.tone === 'light') {
    root.dataset.tone = bg.tone;
    return;
  }

  // 纸面/终端这类「固定明暗」的风格不采样壁纸：
  // 既省掉一次离屏 canvas 解码，也避免首屏色调跳变。
  const forced = styleTone(root.dataset.style || 'glass');
  if (forced) {
    root.dataset.tone = forced;
    return;
  }

  let tone = known;

  if (!tone) {
    // 图片类：尝试采样
    const match = /url\("?(.*?)"?\)/.exec(mediaEl.style.backgroundImage || '');
    if (match && match[1]) tone = await sampleImageTone(match[1]);
    if (token !== toneObserverToken) return;
  }

  if (!tone) {
    // 采样失败：优先跟随系统主题猜测
    tone = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (mediaEl.style.backgroundColor) tone = luminanceTone(mediaEl.style.backgroundColor);
  }

  root.dataset.tone = tone;
}

/* --------------------------------------------------------------- 主题色 */

export function applyAccent(hex) {
  const root = document.documentElement;
  root.style.setProperty('--accent', hex || '#6c8cff');
}

export { isLightColor };

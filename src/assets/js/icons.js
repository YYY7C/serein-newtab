/* Serein · 图标解析
 *
 * 解析顺序（每一级失败自动降级）：
 *   1. 用户自定义（emoji / 文字 / 图片 URL / 本地上传）
 *   2. 内置矢量品牌图标（assets/brand/*.svg，离线、任意尺寸清晰）
 *   3. chrome 内置 favicon 服务  chrome-extension://<id>/_favicon/?pageUrl=…
 *   4. 品牌色字符徽标（同一域名永远同一配色，视觉稳定）
 *
 * 徽标不是妥协——它是「图片加载失败/离线」时的确定性美学保底。
 */

import { domainPalette, hostOf, normalizeUrl, hexToRgb, isSafeImageUrl } from './util.js';
import { brandLogoUrl, brandSlugFor } from './brands.js';
import { isEnglish } from './i18n.js';

/* ------------------------------------------------------------ 品牌配色 */

const BRAND = {
  'baidu.com': ['#2932E1', '百'],
  'bilibili.com': ['#FB7299', '哔'],
  'zhihu.com': ['#0084FF', '知'],
  'weibo.com': ['#E6162D', '微'],
  'weibo.cn': ['#E6162D', '微'],
  'taobao.com': ['#FF5000', '淘'],
  'tmall.com': ['#FF0036', '猫'],
  'jd.com': ['#E1251B', '京'],
  '1688.com': ['#FF6A00', '1688'],
  'pinduoduo.com': ['#E22E1F', '拼'],
  'xiaohongshu.com': ['#FF2442', '小'],
  'douban.com': ['#2E963D', '豆'],
  'sspai.com': ['#D71A1B', '少'],
  'yuque.com': ['#00B96B', '语'],
  'notion.so': ['#16181D', 'N'],
  'feishu.cn': ['#3370FF', '飞'],
  'larksuite.com': ['#3370FF', '飞'],
  'dingtalk.com': ['#0089FF', '钉'],
  'deepseek.com': ['#4D6BFE', 'D'],
  'chatgpt.com': ['#10A37F', 'AI'],
  'openai.com': ['#10A37F', 'AI'],
  'claude.ai': ['#D97757', 'C'],
  'gemini.google.com': ['#4285F4', '✦'],
  'github.com': ['#24292F', 'G'],
  'gitlab.com': ['#FC6D26', 'G'],
  'gitee.com': ['#C71D23', 'G'],
  'stackoverflow.com': ['#F48024', 'SO'],
  'npmjs.com': ['#CB3837', 'npm'],
  'developer.mozilla.org': ['#16181D', 'MDN'],
  'youtube.com': ['#FF0000', '▶'],
  'netflix.com': ['#E50914', 'N'],
  'spotify.com': ['#1DB954', '♪'],
  'music.163.com': ['#C20C0C', '网'],
  'y.qq.com': ['#31C27C', 'Q'],
  'v.qq.com': ['#FF7F00', '腾'],
  'iqiyi.com': ['#00BE06', '爱'],
  'youku.com': ['#1FB2F5', '优'],
  'douyin.com': ['#16181D', '抖'],
  'kuaishou.com': ['#FF4906', '快'],
  'twitch.tv': ['#9146FF', 'T'],
  'x.com': ['#16181D', 'X'],
  'twitter.com': ['#16181D', 'X'],
  'facebook.com': ['#1877F2', 'f'],
  'instagram.com': ['#E1306C', 'IG'],
  'reddit.com': ['#FF4500', 'R'],
  'linkedin.com': ['#0A66C2', 'in'],
  'telegram.org': ['#2AABEE', '✈'],
  't.me': ['#2AABEE', '✈'],
  'discord.com': ['#5865F2', 'D'],
  'pinterest.com': ['#E60023', 'P'],
  'wikipedia.org': ['#16181D', 'W'],
  'google.com': ['#4285F4', 'G'],
  'mail.google.com': ['#EA4335', '邮'],
  'drive.google.com': ['#0F9D58', 'D'],
  'docs.google.com': ['#4285F4', 'D'],
  'translate.google.com': ['#4285F4', '译'],
  'microsoft.com': ['#0078D4', 'M'],
  'office.com': ['#D83B01', 'O'],
  'outlook.com': ['#0078D4', 'O'],
  'live.com': ['#0078D4', 'M'],
  'bing.com': ['#0C8484', '必'],
  'apple.com': ['#16181D', ''],
  'icloud.com': ['#3693F3', 'iC'],
  'aliyun.com': ['#FF6A00', '云'],
  'alipan.com': ['#614BFF', '盘'],
  'pan.baidu.com': ['#2932E1', '盘'],
  'cloud.189.cn': ['#0F62FE', '天'],
  'pan.xunlei.com': ['#1677FF', '雷'],
  'mail.qq.com': ['#1296DB', '邮'],
  'qq.com': ['#1296DB', 'Q'],
  'weixin.qq.com': ['#07C160', '微'],
  'wechat.com': ['#07C160', '微'],
  'mp.weixin.qq.com': ['#07C160', '公'],
  'wjx.cn': ['#4A90E2', '卷'],
  'juejin.cn': ['#1E80FF', '掘'],
  'csdn.net': ['#FC5531', 'C'],
  'cnblogs.com': ['#2E7FBF', '博'],
  'segmentfault.com': ['#009A61', '思'],
  'v2ex.com': ['#333333', 'V2'],
  'nodeseek.com': ['#4C6EF5', 'NS'],
  'linux.do': ['#E95420', 'L'],
  '36kr.com': ['#1B7EF2', '36'],
  'huxiu.com': ['#E60012', '虎'],
  'ithome.com': ['#C7000B', 'IT'],
  'ifanr.com': ['#FF4400', '爱'],
  'ctrip.com': ['#2577E3', '携'],
  '12306.cn': ['#3B99FC', '12306'],
  'amap.com': ['#00A0E9', '高'],
  'map.baidu.com': ['#2932E1', '图'],
  'meituan.com': ['#FFD100', '美'],
  'dianping.com': ['#FF6633', '评'],
  'ele.me': ['#0095FF', '饿'],
  'smzdm.com': ['#FF6B00', '什'],
  'figma.com': ['#F24E1E', 'F'],
  'canva.com': ['#00C4CC', 'C'],
  'trello.com': ['#0079BF', 'T'],
  'slack.com': ['#4A154B', 'S'],
  'zoom.us': ['#2D8CFF', 'Z'],
  'dropbox.com': ['#0061FF', 'D'],
  'airtable.com': ['#FCB400', 'A'],
  'vercel.com': ['#16181D', '▲'],
  'netlify.com': ['#00C7B7', 'N'],
  'cloudflare.com': ['#F38020', 'CF'],
  'aws.amazon.com': ['#FF9900', 'aws'],
  'docker.com': ['#2496ED', 'D'],
  'kubernetes.io': ['#326CE5', 'K8s'],
  'python.org': ['#3776AB', 'Py'],
  'nodejs.org': ['#339933', 'N'],
  'vuejs.org': ['#42B883', 'V'],
  'react.dev': ['#61DAFB', 'R'],
  'tailwindcss.com': ['#06B6D4', 'TW'],
  'vitejs.dev': ['#646CFF', 'V'],
  'rust-lang.org': ['#16181D', 'R'],
  'go.dev': ['#00ADD8', 'Go'],
  'hexo.io': ['#0E83CD', 'H'],
  'obsidian.md': ['#7C3AED', 'O'],
  'mi.com': ['#FF6900', '米'],
  'xiaomi.com': ['#FF6900', '米'],
  'huawei.com': ['#CF0A2C', '华'],
  'vivo.com': ['#415FFF', 'v'],
  'oppo.com': ['#00693E', 'O'],
  'nvidia.com': ['#76B900', 'N'],
  'intel.com': ['#0068B5', 'I'],
  'adobe.com': ['#FF0000', 'A'],
};

function matchBrand(host) {
  if (!host) return null;
  if (BRAND[host]) return BRAND[host];
  const parts = host.split('.');
  for (let i = 1; i < parts.length; i += 1) {
    const candidate = parts.slice(i).join('.');
    if (BRAND[candidate]) return BRAND[candidate];
  }
  return null;
}

/* --------------------------------------------------------------- 对比色 */

const graphemeSegmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function firstGrapheme(text) {
  const value = String(text ?? '');
  if (graphemeSegmenter) {
    for (const part of graphemeSegmenter.segment(value)) return part.segment;
    return '';
  }
  return Array.from(value)[0] || '';
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function readableOn(hex) {
  return relativeLuminance(hex) > 0.62 ? 'rgba(16,18,26,.92)' : '#ffffff';
}

function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (v) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/* ------------------------------------------------------------- 文字推导 */

function initialsOf(title, host) {
  const text = String(title || '').trim();
  if (text) {
    if (/^[\u4e00-\u9fa5]/.test(text)) return text.slice(0, 1);
    const latin = text.match(/[A-Za-z0-9]+/);
    if (latin) return latin[0].slice(0, 2);
    // 不能用 slice 切 UTF-16：emoji 标题会被截成半个代理项/半个 ZWJ 序列
    return firstGrapheme(text);
  }
  return (Array.from(host || '?')[0] || '?').toUpperCase();
}

/* ------------------------------------------------------------- favicon */

export const faviconSupported = (() => {
  try {
    return Boolean(chrome?.runtime?.getURL);
  } catch {
    return false;
  }
})();

const faviconCache = new Map();

export function faviconUrl(url, size = 128) {
  if (!faviconSupported) return '';
  const target = normalizeUrl(url);
  if (!target) return '';
  const cacheKey = `${target}|${size}`;
  if (faviconCache.has(cacheKey)) return faviconCache.get(cacheKey);
  let result = '';
  try {
    result = `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(target)}&size=${size}`;
  } catch {
    result = '';
  }
  faviconCache.set(cacheKey, result);
  return result;
}

/* ------------------------------------------------------------ 占位图识别 */

/**
 * chrome 的 `_favicon` 接口在拿不到真实 favicon 时，会返回同一张灰地球占位图。
 * 它渲染出来只是一个灰色疙瘩，用户读作「图标没渲染出来」。这里取一次那张占位图
 * 当参考签名，再把候选 favicon 缩到 16×16 与之比对：命中就当作「没有图标」，
 * 由调用方退回字符徽标。
 */
const PLACEHOLDER_PROBE_URL = 'https://serein-placeholder.invalid/';
const SIGNATURE_SIZE = 16;
/** 逐通道平均差（0–255）；同一张图缩放后差异为 0，留一点余量给合成器的小抖动 */
const SIGNATURE_TOLERANCE = 6;

const placeholderMemo = new Map();
const knownPlaceholders = new Set();

/** `_favicon` 接口的 URL 里一定带这一段；只有它返回的图才可能是那张通用占位图 */
const FAVICON_PATH_HINT = '/_favicon/';

/** 已确认是占位图的 src，可同步跳过 */
export function isKnownPlaceholder(src) {
  return Boolean(src) && knownPlaceholders.has(src);
}

function signatureOf(image) {
  if (typeof document === 'undefined' || !image?.naturalWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIGNATURE_SIZE;
  canvas.height = SIGNATURE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
  ctx.drawImage(image, 0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
  try {
    return ctx.getImageData(0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE).data;
  } catch {
    // 跨域污染（非扩展页面调试时可能出现）：放弃判断，按正常图标处理
    return null;
  }
}

function sameSignature(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff += Math.abs(a[i] - b[i]);
  return diff / a.length <= SIGNATURE_TOLERANCE;
}

let placeholderSignature = null;

function loadPlaceholderSignature() {
  if (placeholderSignature) return placeholderSignature;
  placeholderSignature = new Promise((resolve) => {
    const url = faviconUrl(PLACEHOLDER_PROBE_URL);
    if (!url) {
      resolve(null);
      return;
    }
    const probe = new Image();
    probe.decoding = 'async';
    probe.addEventListener('load', () => resolve(signatureOf(probe)), { once: true });
    probe.addEventListener('error', () => resolve(null), { once: true });
    probe.src = url;
  });
  return placeholderSignature;
}

/**
 * 判断一张已经 load 完成的图片是不是 `_favicon` 的通用占位图。
 * @param {HTMLImageElement} image
 * @returns {Promise<boolean>}
 */
export function isFaviconPlaceholder(image) {
  const src = image?.currentSrc || image?.src || '';
  // 本地品牌 SVG、用户自定义的 emoji/文字/图片都不可能是灰地球，省掉一次画布采样
  if (src && !src.includes(FAVICON_PATH_HINT)) return Promise.resolve(false);
  const own = signatureOf(image);
  if (!own) return Promise.resolve(false);
  if (!src) return loadPlaceholderSignature().then((ref) => sameSignature(own, ref));
  const cached = placeholderMemo.get(src);
  if (cached) return cached;
  const task = loadPlaceholderSignature().then((ref) => {
    // 参考图取不到时不记忆结论，下次还有机会重判
    if (!ref && placeholderMemo.get(src) === task) placeholderMemo.delete(src);
    const hit = sameSignature(own, ref);
    if (hit) knownPlaceholders.add(src);
    return hit;
  });
  placeholderMemo.set(src, task);
  return task;
}

/* ---------------------------------------------------------------- 解析 */

/**
 * @param {object} shortcut
 * @param {{useFavicon?: boolean, iconStyle?: 'brand'|'favicon'}} options
 *   iconStyle='brand' 时优先使用内置矢量品牌图标
 * @returns {{src: string|null, text: string, from: string, to: string, fg: string,
 *            emoji: boolean, brand: boolean}}
 */
export function resolveIcon(shortcut, { useFavicon = true, iconStyle = 'brand' } = {}) {
  const title = shortcut?.title || '';
  const url = shortcut?.url || '';
  const host = hostOf(url);
  const type = shortcut?.iconType || 'auto';
  const value = shortcut?.iconValue || '';

  const brand = matchBrand(host);
  const baseColor = brand ? brand[0] : domainPalette(host || title || 'serein').solid;
  // 英文界面不显示「百 / 哔 / 语」这类汉字徽标，退回标题或域名的拉丁缩写
  const brandText =
    brand && brand[1] && !(isEnglish() && /[\u3400-\u9fff]/.test(brand[1])) ? brand[1] : '';
  const text = brandText || initialsOf(title, host);

  const fallback = {
    src: null,
    text,
    from: shade(baseColor, 0.18),
    to: shade(baseColor, -0.18),
    fg: readableOn(baseColor),
    emoji: false,
    brand: false,
  };

  if (type === 'emoji' && value != null) {
    // 表情是一个整体字形（旗帜、肤色、ZWJ 家庭都不能拆），只显示第一个 grapheme
    const emoji = firstGrapheme(String(value).trim());
    if (emoji) return { ...fallback, text: emoji, from: 'transparent', to: 'transparent', fg: '', emoji: true };
  }
  if (type === 'text' && value != null) {
    const text = Array.from(String(value).trim()).slice(0, 4).join('');
    if (text) return { ...fallback, text };
  }
  if (type === 'url' && value) {
    const src = normalizeUrl(value);
    return isSafeImageUrl(src) ? { ...fallback, src } : fallback;
  }
  if (type === 'file' && value) return { ...fallback, src: null, pendingFileId: value };
  if (type === 'favicon') return { ...fallback, src: useFavicon ? faviconUrl(url) : null };

  // auto：先试内置品牌图标
  if (useFavicon && iconStyle !== 'favicon') {
    const slug = brandSlugFor(host);
    if (slug) return { ...fallback, src: brandLogoUrl(slug), brand: true };
  }

  return { ...fallback, src: useFavicon ? faviconUrl(url) : null };
}

/** 上传图标走 IndexedDB，需要异步取 Blob 再转成 objectURL */
export async function loadFileIcon(fileId) {
  try {
    const { files, trackObjectUrl } = await import('./storage.js');
    const blob = await files.get(`icon:${fileId}`);
    if (!(blob instanceof Blob)) return null;
    return trackObjectUrl(URL.createObjectURL(blob));
  } catch {
    return null;
  }
}

/**
 * 列表/联想等小尺寸预览用：同一文件只解码一次。
 * 这些 URL 生命周期与本页相同，不随弹窗关闭回收，避免列表反复刷新时泄漏。
 */
const previewFileIconCache = new Map();

export function previewFileIcon(fileId) {
  if (!previewFileIconCache.has(fileId)) {
    const promise = loadFileIcon(fileId)
      .then((url) => {
        if (!url) previewFileIconCache.delete(fileId);
        return url;
      })
      .catch(() => {
        previewFileIconCache.delete(fileId);
        return null;
      });
    previewFileIconCache.set(fileId, promise);
  }
  return previewFileIconCache.get(fileId);
}

export { brandSlugFor, brandLogoUrl };

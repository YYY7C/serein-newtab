/* Lumen · 图标解析
 *
 * 解析顺序（每一级失败自动降级）：
 *   1. 用户自定义（emoji / 文字 / 图片 URL / 本地上传）
 *   2. 内置矢量品牌图标（assets/brand/*.svg，离线、任意尺寸清晰）
 *   3. chrome 内置 favicon 服务  chrome-extension://<id>/_favicon/?pageUrl=…
 *   4. 品牌色字符徽标（同一域名永远同一配色，视觉稳定）
 *
 * 徽标不是妥协——它是「图片加载失败/离线」时的确定性美学保底。
 */

import { domainPalette, hostOf, normalizeUrl, hashString, hexToRgb } from './util.js';
import { brandLogoUrl, brandSlugFor } from './brands.js';

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
    return text.slice(0, 1);
  }
  return (host || '?').slice(0, 1).toUpperCase();
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
  const baseColor = brand ? brand[0] : domainPalette(host || title || 'lumen').solid;
  const text = brand && brand[1] ? brand[1] : initialsOf(title, host);

  const fallback = {
    src: null,
    text,
    from: shade(baseColor, 0.18),
    to: shade(baseColor, -0.18),
    fg: readableOn(baseColor),
    emoji: false,
    brand: false,
  };

  if (type === 'emoji' && value) return { ...fallback, text: value, from: 'transparent', to: 'transparent', fg: '', emoji: true };
  if (type === 'text' && value) return { ...fallback, text: value.slice(0, 4) };
  if (type === 'url' && value) return { ...fallback, src: value };
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
  const { files, trackObjectUrl } = await import('./storage.js');
  const blob = await files.get(`icon:${fileId}`);
  if (!blob) return null;
  return trackObjectUrl(URL.createObjectURL(blob));
}

/** 给缩略图预览用：返回一个稳定的小尺寸 favicon 地址 */
export function previewFavicon(url) {
  return faviconUrl(url, 64);
}

export { brandSlugFor, brandLogoUrl };

export function brandColorFor(url, title) {
  const host = hostOf(url);
  const brand = matchBrand(host);
  return brand ? brand[0] : domainPalette(host || title || 'lumen').solid;
}

export function stableHue(seed) {
  return hashString(String(seed || '')) % 360;
}

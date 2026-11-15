#!/usr/bin/env node
/* Lumen · 品牌图标生成器
 *
 * 作用：把 Simple Icons（CC0 1.0）的 24×24 单色字形，重新排进 48×48 的
 *       「白底方块 + 官方色字形」画布，得到一套视觉统一、任意尺寸都清晰的
 *       品牌图标。圆角由 CSS 裁切，所以这里只画直角方块。
 *
 * 用法：
 *   1) 先把需要的原始 SVG 下载到某个目录（文件名 = slug.svg）：
 *        curl -o icons/github.svg https://cdn.jsdelivr.net/npm/simple-icons@13/icons/github.svg
 *   2) node src/tools/build-brand-logos.mjs --src <该目录>
 *
 * 已有手绘的图标（GOOGLE / FIGMA 等）不会被覆盖。
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '../assets/brand');

/* 字形尺寸：48 画布中占 26，四周留 11 —— 接近 iOS 图标 55% 的观感比例 */
const GLYPH = 26;
const PAD = (48 - GLYPH) / 2;
const SCALE = GLYPH / 24;

/* 品牌官方色。用于给单色字形上色，与 favicon 的主体色一致。 */
export const BRAND_HEX = {
  baidu: '#2932E1',
  bilibili: '#FB7299',
  zhihu: '#0084FF',
  sinaweibo: '#E6162D',
  taobao: '#FF5000',
  xiaohongshu: '#FF2442',
  douban: '#2E963D',
  notion: '#16181D',
  openai: '#10A37F',
  anthropic: '#D97757',
  claude: '#D97757',
  googlegemini: '#4285F4',
  github: '#181717',
  gitlab: '#FC6D26',
  gitee: '#C71D23',
  stackoverflow: '#F48024',
  npm: '#CB3837',
  mdnwebdocs: '#16181D',
  youtube: '#FF0000',
  netflix: '#E50914',
  spotify: '#1DB954',
  neteasecloudmusic: '#C20C0C',
  tiktok: '#181717',
  kuaishou: '#FF4906',
  twitch: '#9146FF',
  x: '#16181D',
  facebook: '#0866FF',
  instagram: '#E1306C',
  reddit: '#FF4500',
  linkedin: '#0A66C2',
  telegram: '#26A5E4',
  discord: '#5865F2',
  pinterest: '#BD081C',
  wikipedia: '#16181D',
  google: '#4285F4',
  gmail: '#EA4335',
  googledrive: '#0F9D58',
  googledocs: '#4285F4',
  googletranslate: '#4285F4',
  apple: '#16181D',
  icloud: '#3693F3',
  alibabacloud: '#FF6A00',
  alipay: '#1677FF',
  wechat: '#07C160',
  figma: '#F24E1E',
  canva: '#00C4CC',
  trello: '#0052CC',
  slack: '#4A154B',
  zoom: '#0B5CFF',
  dropbox: '#0061FF',
  airtable: '#18BFFF',
  vercel: '#16181D',
  netlify: '#00C7B7',
  cloudflare: '#F38020',
  amazonwebservices: '#FF9900',
  docker: '#2496ED',
  kubernetes: '#326CE5',
  python: '#3776AB',
  nodedotjs: '#5FA04E',
  vuedotjs: '#4FC08D',
  react: '#087EA4',
  tailwindcss: '#06B6D4',
  vite: '#646CFF',
  rust: '#16181D',
  go: '#00ADD8',
  obsidian: '#7C3AED',
  meituan: '#FFD100',
  huggingface: '#FFD21E',
  perplexity: '#1FB8CD',
  linear: '#5E6AD2',
  juejin: '#1E80FF',
  csdn: '#FC5531',
  v2ex: '#16181D',
  firefox: '#FF7139',
};

/* 手绘 / 多色图标：生成器跳过，交由 assets/brand 下已提交的文件 */
const HAND_MADE = new Set([
  'google',
  'figma',
  'instagram',
  'microsoft',
  'jd',
  'tmall',
  'feishu',
  'yuque',
  'sspai',
  'deepseek',
  'douyin',
  'bing',
]);

/* --------------------------------------------------------------- 颜色 */

const hexToRgb = (hex) => {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const num = Number.parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};

const rgbToHex = ({ r, g, b }) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

const luminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const mix = (hex, target, amount) => {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
};

/** 太亮的品牌色（美团黄、HuggingFace 黄）压暗后才有对比度 */
const inkFor = (hex) => (luminance(hex) > 0.5 ? mix(hex, '#12141a', 0.42) : hex);

/* --------------------------------------------------------------- 解析 */

function extractBody(svg) {
  return svg
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();
}

function wrap(body, color) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">',
    '  <rect width="48" height="48" fill="#FFFFFF"/>',
    `  <g transform="translate(${PAD} ${PAD}) scale(${Number(SCALE.toFixed(4))})" fill="${color}">`,
    body
      .split('\n')
      .map((line) => '    ' + line.trim())
      .join('\n'),
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

/* ----------------------------------------------------------------- 主流程 */

const srcArgIndex = process.argv.indexOf('--src');
if (srcArgIndex < 0 || !process.argv[srcArgIndex + 1]) {
  console.error('用法: node src/tools/build-brand-logos.mjs --src <simple-icons 原始 SVG 目录>');
  process.exit(1);
}
const SRC_DIR = path.resolve(process.argv[srcArgIndex + 1]);
if (!existsSync(SRC_DIR)) {
  console.error(`目录不存在: ${SRC_DIR}`);
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

const files = (await readdir(SRC_DIR)).filter((name) => name.endsWith('.svg'));
let written = 0;
let skipped = 0;

for (const file of files.sort()) {
  const slug = path.basename(file, '.svg');
  if (HAND_MADE.has(slug)) {
    skipped += 1;
    continue;
  }
  if (!BRAND_HEX[slug]) {
    console.warn(`跳过 ${slug}：没有登记品牌色`);
    skipped += 1;
    continue;
  }
  const raw = await readFile(path.join(SRC_DIR, file), 'utf8');
  const body = extractBody(raw);
  if (!body) {
    console.warn(`跳过 ${slug}：解析不到图形`);
    skipped += 1;
    continue;
  }
  await writeFile(path.join(OUT_DIR, `${slug}.svg`), wrap(body, inkFor(BRAND_HEX[slug])), 'utf8');
  written += 1;
}

console.log(`已生成 ${written} 个品牌图标 -> ${path.relative(process.cwd(), OUT_DIR)}（跳过 ${skipped} 个）`);

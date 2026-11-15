#!/usr/bin/env node
/**
 * Lumen 图标生成器（零依赖）
 *
 * 用法：node tools/make-icons.js
 * 产物：assets/img/icon-16.png / 32 / 48 / 128
 *
 * 直接手写 PNG 编码，避免为了几张图片引入 sharp/canvas 之类的重依赖。
 * 图形用 SDF（有符号距离场）绘制，4× 超采样后盒式降采样得到抗锯齿边缘。
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'img');
const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 4;

const COLOR_FROM = [0x7f, 0x9b, 0xff];
const COLOR_TO = [0xa9, 0x7b, 0xff];

/* ------------------------------------------------------------ PNG 编码 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 每行前置 filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------- 绘制 */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** 圆角矩形有符号距离：内部为负 */
function sdRoundRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

const coverage = (distance, scale) => clamp(0.5 - distance * scale, 0, 1);

function lerpColor(t) {
  return [
    Math.round(COLOR_FROM[0] + (COLOR_TO[0] - COLOR_FROM[0]) * t),
    Math.round(COLOR_FROM[1] + (COLOR_TO[1] - COLOR_FROM[1]) * t),
    Math.round(COLOR_FROM[2] + (COLOR_TO[2] - COLOR_FROM[2]) * t),
  ];
}

/**
 * 渲染一张图标（返回 size×size 的 RGBA Buffer）
 * 形状：圆角方形底 + 白色 "L" + 右上角小光点
 */
function renderIcon(size) {
  const W = size * SUPERSAMPLE;

  // 累积缓冲（预乘 alpha，避免降采样时出现暗边）
  const acc = new Float64Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          // 归一化坐标 [0,1]，取子像素中心
          const nx = (x * SUPERSAMPLE + sx + 0.5) / W;
          const ny = (y * SUPERSAMPLE + sy + 0.5) / W;

          // ---- 底色：圆角方形（squircle 近似）
          const bgSdf = sdRoundRect(nx, ny, 0.5, 0.5, 0.5, 0.5, 0.235);
          const bgA = coverage(bgSdf, W);
          if (bgA <= 0) continue;

          // 对角渐变 + 左上高光
          const t = clamp((nx + ny) / 2, 0, 1);
          const [cr, cg, cb] = lerpColor(t);
          const highlight = 1 + 0.14 * (1 - t) - 0.06 * Math.max(0, (nx + ny) / 2 - 0.5);
          let pr = cr * highlight;
          let pg = cg * highlight;
          let pb = cb * highlight;

          // ---- 白色 "L"
          const barW = 0.0525;
          const stem = sdRoundRect(nx, ny, 0.365, 0.505, 0.058, 0.245, barW);
          const foot = sdRoundRect(nx, ny, 0.5325, 0.6725, 0.2255, 0.0775, barW);
          const lA = Math.max(coverage(stem, W), coverage(foot, W));

          if (lA > 0) {
            const white = 1;
            pr = pr * (1 - lA) + white * 255 * lA;
            pg = pg * (1 - lA) + white * 255 * lA;
            pb = pb * (1 - lA) + white * 255 * lA;
          }

          // ---- 右上角光点
          const dotX = 0.735;
          const dotY = 0.265;
          const dotSdf = Math.hypot(nx - dotX, ny - dotY) - 0.042;
          const dotA = coverage(dotSdf, W) * 0.9;
          if (dotA > 0) {
            pr = pr * (1 - dotA) + 235 * dotA;
            pg = pg * (1 - dotA) + 240 * dotA;
            pb = pb * (1 - dotA) + 255 * dotA;
          }

          // 合成到累积器
          r += pr;
          g += pg;
          b += pb;
          a += bgA;
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const alpha = a / samples;
      const idx = (y * size + x) * 4;
      if (alpha > 0) {
        acc[idx] = r / a;
        acc[idx + 1] = g / a;
        acc[idx + 2] = b / a;
      }
      acc[idx + 3] = alpha;
    }
  }

  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    out[i * 4] = clamp(Math.round(acc[i * 4]), 0, 255);
    out[i * 4 + 1] = clamp(Math.round(acc[i * 4 + 1]), 0, 255);
    out[i * 4 + 2] = clamp(Math.round(acc[i * 4 + 2]), 0, 255);
    out[i * 4 + 3] = clamp(Math.round(acc[i * 4 + 3] * 255), 0, 255);
  }
  return out;
}

/* ---------------------------------------------------------------- 主流程 */

mkdirSync(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const pixels = renderIcon(size);
  const buffer = encodePng(size, size, pixels);
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, buffer);
  const preview = Buffer.from(buffer).subarray(0, 8).toString('hex');
  console.log(`✓ icon-${size}.png  ${buffer.length} bytes  sig=${preview === '89504e470d0a1a0a' ? 'ok' : 'BAD'}`);
}

/* ------------------------------------------------------------ 纸张噪点 */

/**
 * 一张 96×96 的透明噪点平铺图。
 * 同时含亮/暗像素、alpha 很低，既能给浅色纸面加纹理，也能给深色表面加颗粒
 * —— 这是让界面「有手作感」而不再像矢量模板的最低成本手段。
 */
function renderNoise(size = 96, maxAlpha = 16) {
  const out = Buffer.alloc(size * size * 4);
  let seed = 0x2f6e2b1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < size * size; i += 1) {
    const light = rand() < 0.5;
    const alpha = Math.round(rand() * maxAlpha);
    out[i * 4] = light ? 255 : 0;
    out[i * 4 + 1] = light ? 255 : 0;
    out[i * 4 + 2] = light ? 255 : 0;
    out[i * 4 + 3] = alpha;
  }
  return out;
}

const noise = encodePng(96, 96, renderNoise());
writeFileSync(path.join(OUT_DIR, 'noise.png'), noise);
console.log(`✓ noise.png  ${noise.length} bytes`);

console.log('\n图标已生成到 assets/img/');

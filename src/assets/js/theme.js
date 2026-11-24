/* Serein · 配置 -> CSS 变量
 * 所有视觉参数集中在这里落到 :root，设置页与启动流程共用。
 */

import { clamp, readableTextOn } from './util.js';

/**
 * 每套风格对「形状」的约束，避免用户把直角风格拖成大圆角。
 * radius: 圆角倍率；blur: 毛玻璃倍率。
 */
const STYLE_SHAPE = {
  glass: { radius: 1, blur: 1 },
  noir: { radius: 0.5, blur: 0 },
  paper: { radius: 0.62, blur: 0 },
  native: { radius: 1.1, blur: 0.85 },
  editorial: { radius: 0.34, blur: 0 },
  terminal: { radius: 0, blur: 0 },
};

/**
 * 每套风格固定的明暗基调。null = 跟随壁纸自动判定。
 * 「白纸」永远是浅色纸面，壁纸再黑也不该把文字翻成白色。
 */
const STYLE_TONE = {
  paper: 'light',
  editorial: 'light',
  terminal: 'dark',
  noir: 'dark',
  native: null,
  glass: null,
};

export const styleTone = (id) => STYLE_TONE[id] ?? null;

/**
 * 网格总宽：设置页与首屏共用同一套算法，避免两处算出的数字对不上。
 * 与 --cell / --grid-gap 的定义保持一致。
 */
export function cellSize(iconSize) {
  return Math.round(iconSize + Math.max(16, iconSize * 0.2));
}

export function dockWidth(layout = {}) {
  const iconSize = clamp(layout.iconSize ?? 60, 40, 96);
  const columns = Math.round(clamp(layout.columns ?? 6, 3, 14));
  // 内容总宽只由列距决定，行距不参与
  const gap = clamp(layout.gap ?? 20, 4, 64);
  return Math.round(columns * cellSize(iconSize) + (columns - 1) * gap);
}

const COMPACT_SCALE = { icon: 0.86, gap: 0.72, gapY: 0.72 };

function gridMetrics(layout, compact) {
  const scale = compact ? COMPACT_SCALE : { icon: 1, gap: 1, gapY: 1 };
  const iconSize = Math.max(32, Math.round(clamp(layout.iconSize ?? 60, 40, 96) * scale.icon));
  const gap = Math.max(4, Math.round(clamp(layout.gap ?? 20, 4, 64) * scale.gap));
  const gapY = Math.max(4, Math.round(clamp(layout.gapY ?? Math.round((layout.gap ?? 20) * 0.9), 4, 64) * scale.gapY));
  const columns = Math.round(clamp(layout.columns ?? 6, 3, 14));
  const cell = cellSize(iconSize);
  return {
    iconSize,
    gap,
    gapY,
    columns,
    cell,
    width: Math.round(columns * cell + (columns - 1) * gap),
  };
}

export function applyConfig(state) {
  const config = state.config;
  const root = document.documentElement;
  const style = root.style;
  const shape = STYLE_SHAPE[config.style] || STYLE_SHAPE.glass;

  root.dataset.style = config.style || 'glass';

  /* 强调色 + 与之匹配的前景色（亮强调色用深色字，避免白字对比度不足） */
  const accent = config.accent || '#6c8cff';
  style.setProperty('--accent', accent);
  style.setProperty('--accent-fg', readableTextOn(accent));

  /* 毛玻璃（直角 / 纸质风格下自动归零） */
  const blur = config.performance ? 0 : clamp(config.glass ?? 18, 0, 40) * shape.blur;
  style.setProperty('--glass-blur', `${blur}px`);

  /* 圆角：以一个基准值派生整套阶梯，保证比例协调 */
  const radius = clamp(config.radius ?? 22, 0, 36) * shape.radius;
  style.setProperty('--radius-xs', `${Math.max(0, radius * 0.34)}px`);
  style.setProperty('--radius-sm', `${Math.max(0, radius * 0.54)}px`);
  style.setProperty('--radius-md', `${Math.max(0, radius * 0.8)}px`);
  style.setProperty('--radius-lg', `${radius}px`);
  style.setProperty('--radius-xl', `${radius * 1.36}px`);

  /* 网格：窗口高度不够时切到紧凑密度（列表型风格不缩列宽） */
  const layout = config.layout;
  const listMode = config.style === 'editorial' || config.style === 'terminal';
  const compact = root.dataset.density === 'compact' && !listMode;
  const metrics = gridMetrics(layout, compact);
  style.setProperty('--icon-size', `${metrics.iconSize}px`);
  style.setProperty('--grid-gap', `${metrics.gap}px`);
  style.setProperty('--grid-gap-y', `${metrics.gapY}px`);
  style.setProperty('--grid-cols', String(metrics.columns));
  style.setProperty('--cell', `${metrics.cell}px`);
  style.setProperty('--dock-w', `${listMode ? dockWidth(layout) : metrics.width}px`);
  const fontScale = clamp(config.fontScale ?? 1, 0.8, 1.4);
  style.setProperty('--font-scale', String(fontScale));
  // 只有非 1 时才给 stage 加 transform，避免默认状态下多一层合成层
  root.dataset.scale = fontScale === 1 ? '0' : '1';

  /* 行为开关 */
  root.dataset.perf = config.performance ? '1' : '0';
  root.dataset.anim = config.animations === false ? '0' : '1';
  /* 侧边栏位置：顶栏据此把右侧按钮贴到窗口右缘，或避开左侧栏 */
  root.dataset.sidebar = config.sidebar || 'right';

  /* 内容垂直居中 */
  const content = document.getElementById('content');
  if (content) content.classList.toggle('is-top', layout.verticalCenter === false);

  applyCustomCss(config.customCss);
}

/* ---------------------------------------------------------- 自定义 CSS */

export const CUSTOM_CSS_MAX = 20000;

/** @import 会引入远程样式并泄露访问意图；javascript: / expression 属于历史执行面 */
export function sanitizeCustomCss(input) {
  return String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .slice(0, CUSTOM_CSS_MAX)
    .replace(/@import[\s\S]*?;/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript\s*:/gi, '');
}

let customCssNode = null;

export function applyCustomCss(input) {
  const text = sanitizeCustomCss(input);
  if (!text.trim()) {
    customCssNode?.remove();
    customCssNode = null;
    return;
  }
  if (!customCssNode || !customCssNode.isConnected) {
    customCssNode = document.createElement('style');
    customCssNode.id = 'custom-css';
    document.head.appendChild(customCssNode);
  }
  if (customCssNode.textContent !== text) customCssNode.textContent = text;
}

/**
 * 按内容是否溢出切换 cozy / compact。
 * 先按常规密度测量，溢出才切紧凑；两者都溢出时保留 compact 并允许滚动。
 */
export function syncDensity(state) {
  const content = document.getElementById('content');
  const root = document.documentElement;
  if (!content) return root.dataset.density || 'cozy';

  root.dataset.density = 'cozy';
  applyConfig(state);
  void content.offsetHeight;
  const overflow = content.scrollHeight > content.clientHeight + 2;

  if (overflow) {
    root.dataset.density = 'compact';
    applyConfig(state);
    void content.offsetHeight;
  }
  return root.dataset.density;
}

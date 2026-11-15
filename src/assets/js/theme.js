/* Lumen · 配置 -> CSS 变量
 * 所有视觉参数集中在这里落到 :root，设置页与启动流程共用。
 */

import { clamp } from './util.js';

/**
 * 每套风格对「形状」的约束，避免用户把直角风格拖成大圆角。
 * radius: 圆角倍率；blur: 毛玻璃倍率。
 */
const STYLE_SHAPE = {
  glass: { radius: 1, blur: 1 },
  noir: { radius: 0.5, blur: 0 },
  editorial: { radius: 0.34, blur: 0 },
  terminal: { radius: 0, blur: 0 },
};

/**
 * 网格总宽：设置页与首屏共用同一套算法，避免两处算出的数字对不上。
 * 与 --cell / --grid-gap 的定义保持一致。
 */
export function dockWidth(layout = {}) {
  const iconSize = clamp(layout.iconSize ?? 60, 40, 96);
  const columns = clamp(layout.columns ?? 6, 3, 14);
  const gap = clamp(layout.gap ?? 20, 4, 48);
  const cell = Math.round(iconSize + Math.max(22, iconSize * 0.38));
  return Math.round(columns * cell + (columns - 1) * (gap * 0.55));
}

export function applyConfig(state) {
  const config = state.config;
  const root = document.documentElement;
  const style = root.style;
  const shape = STYLE_SHAPE[config.style] || STYLE_SHAPE.glass;

  root.dataset.style = config.style || 'glass';

  /* 强调色 */
  style.setProperty('--accent', config.accent || '#6c8cff');

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

  /* 网格 */
  const layout = config.layout;
  const iconSize = clamp(layout.iconSize ?? 60, 40, 96);
  const columns = clamp(layout.columns ?? 6, 3, 14);
  const gap = clamp(layout.gap ?? 20, 4, 48);
  const cell = Math.round(iconSize + Math.max(22, iconSize * 0.38));
  style.setProperty('--icon-size', `${iconSize}px`);
  style.setProperty('--grid-gap', `${gap}px`);
  style.setProperty('--grid-cols', String(columns));
  style.setProperty('--cell', `${cell}px`);
  style.setProperty('--dock-w', `${dockWidth(layout)}px`);
  style.setProperty('--font-scale', String(clamp(config.fontScale ?? 1, 0.8, 1.4)));

  /* 行为开关 */
  root.dataset.perf = config.performance ? '1' : '0';
  root.dataset.anim = config.animations === false ? '0' : '1';
  /* 侧边栏位置：顶栏据此把右侧按钮贴到窗口右缘，或避开左侧栏 */
  root.dataset.sidebar = config.sidebar || 'right';

  /* 内容垂直居中 */
  const content = document.getElementById('content');
  if (content) content.classList.toggle('is-top', layout.verticalCenter === false);
}

/** 列表型风格：图标以「编号 + 名称 + 域名」的文本行呈现 */
export const isListStyle = (id) => id === 'editorial' || id === 'terminal';

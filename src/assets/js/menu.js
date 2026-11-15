/* Lumen · 右键菜单 / 下拉菜单
 * 单例：同一时间只存在一个菜单，点击外部自动关闭。
 */

import { h, svgIcon, clear } from './util.js';

let node = null;
let closer = null;

function ensureNode() {
  if (node) return node;
  node = h('div', { class: 'menu', role: 'menu', 'aria-hidden': 'true' });
  document.body.appendChild(node);

  document.addEventListener('mousedown', onOutside, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', closeMenu, true);
  window.addEventListener('scroll', closeMenu, true);
  return node;
}

function onOutside(event) {
  if (!node || !node.classList.contains('is-open')) return;
  if (node.contains(event.target)) return;
  closeMenu();
}

function onKeydown(event) {
  if (event.key === 'Escape' && node?.classList.contains('is-open')) {
    event.stopPropagation();
    closeMenu();
  }
}

/**
 * @param {Array} items  [{ label, icon, shortcut, danger, onClick } | { type:'sep' } | { type:'label', label }]
 * @param {{x:number,y:number,anchor?:HTMLElement,align?:'left'|'right'}} position
 */
export function openMenu(items, position = {}) {
  const menu = ensureNode();
  clear(menu);

  for (const item of items) {
    if (!item) continue;
    if (item.type === 'sep') {
      menu.appendChild(h('div', { class: 'menu-sep' }));
      continue;
    }
    if (item.type === 'label') {
      menu.appendChild(h('div', { class: 'menu-label', text: item.label }));
      continue;
    }
    const button = h(
      'button',
      {
        class: `menu-item${item.danger ? ' is-danger' : ''}`,
        type: 'button',
        role: 'menuitem',
        onclick: (event) => {
          event.stopPropagation();
          closeMenu();
          item.onClick?.();
        },
      },
      item.icon ? h('span', { html: svgIcon(item.icon, 16) }) : null,
      h('span', { class: 'text-ellipsis', text: item.label }),
      item.shortcut ? h('span', { class: 'shortcut', text: item.shortcut }) : null
    );
    menu.appendChild(button);
  }

  menu.classList.add('is-open');
  menu.setAttribute('aria-hidden', 'false');

  // 先渲染再测量，保证尺寸准确
  menu.style.left = '0px';
  menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  const pad = 10;

  let x = position.x ?? 0;
  let y = position.y ?? 0;
  if (position.anchor) {
    const anchorRect = position.anchor.getBoundingClientRect();
    x = position.align === 'right' ? anchorRect.right - rect.width : anchorRect.left;
    y = anchorRect.bottom + 6;
  }

  x = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad));
  y = Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad));

  menu.style.left = `${Math.round(x)}px`;
  menu.style.top = `${Math.round(y)}px`;

  // 动画原点跟随实际方向
  menu.style.transformOrigin = y > window.innerHeight / 2 ? 'bottom left' : 'top left';

  return menu;
}

export function closeMenu() {
  if (!node) return;
  node.classList.remove('is-open');
  node.setAttribute('aria-hidden', 'true');
  if (closer) {
    closer();
    closer = null;
  }
}

export const isMenuOpen = () => Boolean(node?.classList.contains('is-open'));

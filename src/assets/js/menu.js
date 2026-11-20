/* Serein · 右键菜单 / 下拉菜单
 * 单例：同一时间只存在一个菜单，点击外部自动关闭。
 */

import { h, svgIcon, clear } from './util.js';

let node = null;
let closer = null;
let lastFocused = null;

function ensureNode() {
  if (node) return node;
  node = h('div', { class: 'menu', role: 'menu', 'aria-hidden': 'true' });
  node.inert = true;
  document.body.appendChild(node);

  document.addEventListener('mousedown', onOutside, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', closeMenu, true);
  window.addEventListener('scroll', onScroll, true);
  return node;
}

function onScroll(event) {
  if (!node || !node.classList.contains('is-open')) return;
  // 菜单自身内容过多时是可滚动的，滚它不能触发关闭
  if (event.target instanceof Node && node.contains(event.target)) return;
  closeMenu();
}

function onOutside(event) {
  if (!node || !node.classList.contains('is-open')) return;
  if (node.contains(event.target)) return;
  closeMenu();
}

function onKeydown(event) {
  if (!node || !node.classList.contains('is-open')) return;
  // 输入法组合期间的按键属于候选词操作，不要拿去关闭/导航菜单
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape') {
    event.stopPropagation();
    closeMenu();
    return;
  }
  // 菜单不是焦点陷阱：Tab 应该离开菜单，而不是在菜单项之间循环后仍留着浮层
  if (event.key === 'Tab') {
    closeMenu();
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = Array.from(node.querySelectorAll('.menu-item'));
  if (!items.length) return;
  event.preventDefault();
  event.stopPropagation();
  const current = items.indexOf(document.activeElement);
  let next = 0;
  if (event.key === 'End') next = items.length - 1;
  else if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
  else if (event.key === 'ArrowUp') next = current <= 0 ? items.length - 1 : current - 1;
  items[next].focus({ preventScroll: true });
}

/**
 * @param {Array} items  [{ label, icon, shortcut, danger, onClick } | { type:'sep' } | { type:'label', label }]
 * @param {{x:number,y:number,anchor?:HTMLElement,align?:'left'|'right'}} position
 */
export function openMenu(items, position = {}) {
  const menu = ensureNode();
  if (!menu.classList.contains('is-open')) {
    lastFocused = document.activeElement;
    closer = typeof position.onClose === 'function' ? position.onClose : null;
  }
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
        title: item.label,
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
  menu.inert = false;
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

  // 键盘用户打开菜单后直接从第一项开始，Esc 会把焦点还给触发元素
  menu.querySelector('.menu-item')?.focus({ preventScroll: true });

  return menu;
}

export function closeMenu() {
  if (!node) return;
  // 先把焦点移出菜单，再设 aria-hidden；否则浏览器会警告「焦点在 aria-hidden 元素里」
  if (node.contains(document.activeElement)) {
    const active = document.activeElement;
    active?.blur?.();
    if (lastFocused && lastFocused.isConnected && lastFocused.getClientRects().length && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
    }
  }
  node.classList.remove('is-open');
  // inert 同时阻止关闭后的菜单按钮被 Tab 聚焦；aria-hidden 只影响辅助技术。
  node.inert = true;
  node.setAttribute('aria-hidden', 'true');
  lastFocused = null;
  const done = closer;
  closer = null;
  try {
    done?.();
  } catch (err) {
    console.warn('[serein/menu] onClose 异常', err);
  }
}

export const isMenuOpen = () => Boolean(node?.classList.contains('is-open'));

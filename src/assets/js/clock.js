/* Lumen · 时钟与日期 */

import { $, svgIcon } from './util.js';
import { describeDate, WEEKDAYS } from './lunar.js';

let els = null;
let stateRef = null;
let timer = 0;
let lastRendered = '';

export function initClock(store) {
  stateRef = store.state;
  els = {
    hero: $('#hero'),
    greeting: $('#greeting'),
    time: $('#clock-time'),
    meridiem: $('#clock-meridiem'),
    seconds: $('#clock-seconds'),
    dateline: $('#dateline'),
  };

  paintStructure();
  tick(true);
  scheduleTick();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      tick();
      scheduleTick();
    }
  });

  return () => clearTimeout(timer);
}

/* --------------------------------------------------------------- 结构 */

function paintStructure() {
  const layout = stateRef.config.layout;
  els.hero.hidden = !(layout.showClock || layout.showDate || layout.showGreeting);
  els.greeting.hidden = !layout.showGreeting;
  els.time.hidden = !layout.showClock;
  els.dateline.hidden = !(layout.showDate || layout.showLunar);
  els.seconds.hidden = !layout.showSeconds;
  els.meridiem.hidden = layout.clock24;
}

/* --------------------------------------------------------------- 问候 */

function greetingFor(hour) {
  if (hour < 5) return { text: '夜深了', icon: 'moon' };
  if (hour < 9) return { text: '早安', icon: 'sun' };
  if (hour < 12) return { text: '上午好', icon: 'sun' };
  if (hour < 14) return { text: '中午好', icon: 'sun' };
  if (hour < 18) return { text: '下午好', icon: 'sun' };
  if (hour < 23) return { text: '晚上好', icon: 'moon' };
  return { text: '夜深了', icon: 'moon' };
}

/* --------------------------------------------------------------- 绘制 */

function pad(n) {
  return String(n).padStart(2, '0');
}

function tick(force = false) {
  if (!els) return;
  // 后台标签页不必每秒重绘；但首次绘制（force）必须落地，
  // 否则「后台打开的标签页」会一直停在 --:--
  if (document.hidden && !force) return;

  const now = new Date();
  const layout = stateRef.config.layout;
  const hh = now.getHours();
  const mm = now.getMinutes();
  const ss = now.getSeconds();

  let timeText;
  let meridiem = '';
  if (layout.clock24) {
    timeText = `${pad(hh)}:${pad(mm)}`;
  } else {
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    timeText = `${h12}:${pad(mm)}`;
    meridiem = hh < 12 ? 'AM' : 'PM';
  }

  if (layout.showClock && els.time.textContent !== timeText) els.time.textContent = timeText;
  if (!layout.clock24) els.meridiem.textContent = meridiem;
  if (layout.showSeconds) els.seconds.textContent = String(ss).padStart(2, '0');

  if (layout.showGreeting) {
    const greeting = greetingFor(hh);
    const name = (layout.name || '').trim();
    const text = name ? `${greeting.text}，${name}` : greeting.text;
    if (els.greeting.dataset.text !== text) {
      els.greeting.dataset.text = text;
      els.greeting.innerHTML = `${svgIcon(greeting.icon, 15)}<span>${text}</span>`;
    }
  }

  // 日期与农历一天只需重算一次
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (els.dateline.dataset.day !== dayKey) {
    els.dateline.dataset.day = dayKey;
    renderDateline(now, layout);
  }

  lastRendered = timeText;
}

function renderDateline(now, layout) {
  const parts = [];

  if (layout.showDate) {
    parts.push(`${now.getMonth() + 1}月${now.getDate()}日`);
    parts.push(WEEKDAYS[now.getDay()]);
  }

  if (layout.showLunar) {
    const info = describeDate(now);
    if (info && info.text) parts.push(info.text);
    if (info && info.festival) {
      els.dateline.innerHTML = '';
      parts.forEach((text, index) => {
        if (index > 0) els.dateline.appendChild(makeDot());
        els.dateline.appendChild(document.createTextNode(text));
      });
      els.dateline.appendChild(makeDot());
      const chip = document.createElement('span');
      chip.className = 'festival';
      chip.textContent = info.festival;
      els.dateline.appendChild(chip);
      return;
    }
  }

  els.dateline.innerHTML = '';
  parts.forEach((text, index) => {
    if (index > 0) els.dateline.appendChild(makeDot());
    els.dateline.appendChild(document.createTextNode(text));
  });
}

function makeDot() {
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

/* --------------------------------------------------------------- 调度 */

function scheduleTick() {
  clearTimeout(timer);
  const now = Date.now();
  const delay = 1000 - (now % 1000);
  timer = setTimeout(() => {
    tick();
    scheduleTick();
  }, delay + 8);
}

/** 配置变更后重新布局（例如关掉时钟） */
export function refreshClock() {
  paintStructure();
  els.dateline.dataset.day = '';
  tick(true);
}

export { greetingFor };

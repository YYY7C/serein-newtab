/* Serein · 时钟与日期 */

import { $, svgIcon } from './util.js';
import { describeDate, WEEKDAYS } from './lunar.js';

let els = null;
let stateRef = null;
let timer = 0;

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
    if (document.hidden) {
      // 后台标签页不再每秒唤醒计时器；重新可见时立刻补一帧
      clearTimeout(timer);
    } else {
      tick();
      scheduleTick();
    }
  });

  return () => clearTimeout(timer);
}

/* --------------------------------------------------------------- 结构 */

function paintStructure() {
  const layout = stateRef.config.layout;
  const showHero = layout.showClock || layout.showDate || layout.showGreeting;
  els.hero.hidden = !showHero;
  els.greeting.hidden = !layout.showGreeting;
  els.time.hidden = !layout.showClock;
  els.dateline.hidden = !(layout.showDate || layout.showLunar);
  // 秒与 AM/PM 依附于时钟本体：时钟关掉时它们不该单独留在页面上
  els.seconds.hidden = !layout.showClock || !layout.showSeconds;
  els.meridiem.hidden = layout.clock24 || !layout.showClock;
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

  if (layout.showClock && els.time.dataset.text !== timeText) {
    els.time.dataset.text = timeText;
    const [hourPart, minutePart] = timeText.split(':');
    // 冒号单独一层：细字重下才能单独缩小/抬高，不然整串数字会显得「掉下去」
    els.time.innerHTML = `<span class="clock-h">${hourPart}</span><span class="clock-sep">:</span><span class="clock-m">${minutePart}</span>`;
  }
  if (!layout.clock24) els.meridiem.textContent = meridiem;
  if (layout.showSeconds) els.seconds.textContent = String(ss).padStart(2, '0');

  if (layout.showGreeting) {
    const greeting = greetingFor(hh);
    const name = (layout.name || '').trim();
    const text = name ? `${greeting.text}，${name}` : greeting.text;
    if (els.greeting.dataset.text !== text) {
      els.greeting.dataset.text = text;
      // 称呼是用户输入，必须走 textContent，避免把名字当成 HTML 解析
      els.greeting.innerHTML = svgIcon(greeting.icon, 15);
      const label = document.createElement('span');
      label.textContent = text;
      els.greeting.appendChild(label);
    }
  }

  // 日期与农历一天只需重算一次
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (els.dateline.dataset.day !== dayKey) {
    els.dateline.dataset.day = dayKey;
    renderDateline(now, layout);
  }
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
      if (parts.length) els.dateline.appendChild(makeDot());
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
  const layout = stateRef.config.layout;
  const needsTick = layout.showClock || layout.showGreeting || layout.showDate || layout.showLunar;
  if (!needsTick || document.hidden) return;

  const now = new Date();
  // 不显示秒时，没必要每秒醒来：对齐到下一分钟即可
  const delay =
    layout.showClock && layout.showSeconds
      ? 1000 - (Date.now() % 1000) + 8
      : (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 12;

  timer = setTimeout(() => {
    tick();
    scheduleTick();
  }, delay);
}

/** 配置变更后重新布局（例如关掉时钟） */
export function refreshClock() {
  paintStructure();
  els.dateline.dataset.day = '';
  tick(true);
  scheduleTick();
}

export { greetingFor };

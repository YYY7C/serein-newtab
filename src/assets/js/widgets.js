/* Serein · 侧边小组件
 *
 * 设计原则：卡片只构建一次，之后原地更新 —— 这样在待办里打字、在便签里写字
 * 都不会因为其他状态变化而丢失焦点。
 */

import { $, h, clear, svgIcon, debounce, relativeTime, normalizeUrl, isUsableUrl, bus } from './util.js';
import * as store from './store.js';
import { weatherIconInline, weatherLabel, refreshWeather, searchCity, HOT_CITIES } from './weather.js';
import { faviconUrl, resolveIcon } from './icons.js';

let sidebarEl = null;
let signature = '';
let parts = {};
let weatherTimer = 0;

/* --------------------------------------------------------------- 初始化 */

export function initWidgets() {
  sidebarEl = $('#sidebar');
  rebuild();
  store.subscribe(onChange);
  startWeatherTimer();
  const refreshOnVisible = () => {
    // 标签页可能在后台待了几个小时：回到前台时若缓存过期就补一次
    if (!document.hidden && store.state.config.layout.showWeather) loadWeather(false);
  };
  document.addEventListener('visibilitychange', refreshOnVisible);
  return () => {
    clearInterval(weatherTimer);
    document.removeEventListener('visibilitychange', refreshOnVisible);
  };
}

function onChange(scope) {
  if (scope === 'all') rebuild(true);
  else if (scope === 'config') rebuild();
  else if (scope === 'weather') updateWeather();
  else if (scope === 'todos') renderTodoList();
}

function widgetConfig() {
  return store.state.config.widgets;
}

function makeSignature() {
  const widgets = widgetConfig();
  const layout = store.state.config.layout;
  return [widgets.todo, widgets.notes, widgets.bookmarks, widgets.topSites, layout.showWeather]
    .map((value) => (value ? '1' : '0'))
    .join('');
}

function rebuild(force = false) {
  const next = makeSignature();
  if (!force && next === signature) {
    updateSidebarVisibility();
    return;
  }
  signature = next;
  parts = {};
  clear(sidebarEl);

  if (store.state.config.layout.showWeather) {
    parts.weather = buildWeatherCard();
    sidebarEl.appendChild(parts.weather);
  }
  if (widgetConfig().todo) {
    parts.todo = buildTodoCard();
    sidebarEl.appendChild(parts.todo);
  }
  if (widgetConfig().notes) {
    parts.notes = buildNotesCard();
    sidebarEl.appendChild(parts.notes);
  }
  if (widgetConfig().bookmarks) {
    parts.bookmarks = buildLinksCard('bookmarks');
    sidebarEl.appendChild(parts.bookmarks);
  }
  if (widgetConfig().topSites) {
    parts.topSites = buildLinksCard('topSites');
    sidebarEl.appendChild(parts.topSites);
  }

  updateSidebarVisibility();
  if (store.state.config.layout.showWeather) loadWeather(false);
}

function updateSidebarVisibility() {
  const hasAny =
    store.state.config.layout.showWeather ||
    widgetConfig().todo ||
    widgetConfig().notes ||
    widgetConfig().bookmarks ||
    widgetConfig().topSites;
  const hidden = !hasAny || store.state.config.sidebar === 'hidden';
  sidebarEl.classList.toggle('is-hidden', hidden);
  // 侧栏只是宽度归零 + 透明；不 inert 的话，Tab 仍会钻进看不见的按钮
  if (hidden && sidebarEl.contains(document.activeElement)) document.activeElement.blur?.();
  sidebarEl.inert = hidden;
  sidebarEl.setAttribute('aria-hidden', String(hidden));
  sidebarEl.classList.toggle('is-left', store.state.config.sidebar === 'left');
}

/* --------------------------------------------------------------- 天气 */

function buildWeatherCard() {
  const card = h('div', { class: 'card' });
  const title = h('div', { class: 'card-title' }, h('span', { html: svgIcon('weather', 14) }), h('span', { text: '天气' }));
  const cityBtn = h('button', {
    class: 'weather-city',
    type: 'button',
    title: '切换城市',
    'aria-label': '切换城市',
    html: `${svgIcon('compass', 12)}<span>--</span>`,
    onclick: () => openCityPicker(),
  });
  const refreshBtn = h('button', {
    class: 'card-action',
    type: 'button',
    title: '刷新天气',
    'aria-label': '刷新天气',
    html: svgIcon('refresh', 14),
    onclick: () => loadWeather(true),
  });

  const head = h('div', { class: 'card-head' }, title, h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, cityBtn, refreshBtn));

  const body = h('div', { class: 'weather-body' }, h('div', { class: 'empty-state', text: '正在获取天气…' }));

  card.appendChild(head);
  card.appendChild(body);
  parts.weatherCity = cityBtn;
  parts.weatherBody = body;
  return card;
}

/** 缓存可能来自旧版本/手工导入：只把真正有限的数字显示出来，别渲染 undefined */
function weatherNumber(value, suffix = '') {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean' || typeof value === 'object') {
    return '—';
  }
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}${suffix}` : '—';
}

function updateWeather() {
  if (!parts.weatherBody) return;
  const { weather, config } = store.state;

  const citySpan = parts.weatherCity?.querySelector('span');
  if (citySpan) citySpan.textContent = weather.city || '选择城市';
  parts.weatherCity?.setAttribute('aria-label', `切换城市，当前${weather.city || '未选择'}`);

  clear(parts.weatherBody);
  const cache = weather.cache;

  if (!cache) {
    parts.weatherBody.appendChild(
      h('div', {
        class: 'empty-state',
        text: weather.error ? '天气获取失败，点击右上角重试' : '暂无天气数据',
      })
    );
    return;
  }

  const tempText = weatherNumber(cache.temp);
  const main = h(
    'div',
    { class: 'weather-main' },
    h('span', { html: weatherIconInline(cache.code, cache.isDay, 50), style: { display: 'grid', placeItems: 'center' } }),
    h(
      'div',
      { style: { minWidth: '0' } },
      h(
        'div',
        { class: 'weather-temp' },
        h('span', { text: tempText === '—' ? '--' : tempText }),
        h('sup', { text: '°C' })
      ),
      h(
        'div',
        { class: 'weather-meta' },
        h('span', { text: weatherLabel(cache.code) }),
        h('span', { text: `体感 ${weatherNumber(cache.feels, '°')}` }),
        h('span', { text: `湿度 ${weatherNumber(cache.humidity, '%')}` })
      )
    )
  );
  parts.weatherBody.appendChild(main);

  if (Array.isArray(cache.days) && cache.days.length) {
    const forecast = h('div', { class: 'forecast' });
    cache.days.slice(0, 7).forEach((day, index) => {
      if (!day || typeof day !== 'object') return;
      const date = day.iso ? new Date(`${day.iso}T00:00:00`) : null;
      const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
      const name = index === 0 ? '今天' : validDate ? `${validDate.getMonth() + 1}/${validDate.getDate()}` : '—';
      forecast.appendChild(
        h(
          'div',
          { class: 'forecast-day', title: weatherLabel(day.code) },
          h('span', { class: 'forecast-name', text: name }),
          h('span', { html: weatherIconInline(day.code, true, 20), style: { opacity: '.9' } }),
          h(
            'span',
            { class: 'forecast-temp' },
            h('span', { text: weatherNumber(day.max, '°') }),
            h('span', { text: `/${weatherNumber(day.min, '°')}` })
          )
        )
      );
    });
    parts.weatherBody.appendChild(forecast);
  }

  if (weather.updatedAt) {
    parts.weatherBody.appendChild(
      h('div', {
        class: 'field-hint',
        style: { marginTop: '8px', textAlign: 'right', fontSize: '10.5px' },
        text: `${relativeTime(weather.updatedAt)}更新 · Open-Meteo`,
      })
    );
  }
  void config;
}

async function loadWeather(force) {
  try {
    await refreshWeather(store.state, { force });
  } catch (err) {
    console.warn('[serein/widgets] 天气刷新异常', err);
  }
  updateWeather();
}

function startWeatherTimer() {
  clearInterval(weatherTimer);
  weatherTimer = setInterval(() => {
    if (document.hidden) return;
    if (!store.state.config.layout.showWeather) return;
    loadWeather(false);
  }, 20 * 60 * 1000);
}

/* ------------------------------------------------------------- 城市选择 */

async function openCityPicker() {
  const input = h('input', {
    class: 'text-input',
    type: 'text',
    placeholder: '搜索城市，例如：杭州',
    maxlength: '80',
    'aria-label': '搜索城市',
  });
  const results = h('div', { class: 'link-list', style: { maxHeight: '240px', marginTop: '10px' } });
  const hotRow = h('div', { class: 'btn-row', style: { marginTop: '12px' } });

  const pick = (city) => {
    store.setWeather({ city: city.name, lat: city.lat, lon: city.lon, updatedAt: 0, cache: null, error: '' });
    modal.close();
    loadWeather(true);
  };

  for (const city of HOT_CITIES) {
    hotRow.appendChild(h('button', { class: 'btn', type: 'button', text: city.name, onclick: () => pick(city) }));
  }

  let searchToken = 0;
  const runSearch = debounce(async () => {
    const keyword = input.value.trim();
    const token = ++searchToken;
    clear(results);
    if (!keyword) return;
    results.appendChild(h('div', { class: 'empty-state', text: '搜索中…' }));
    const list = await searchCity(keyword);
    if (token !== searchToken) return;
    clear(results);
    if (!list.length) {
      results.appendChild(h('div', { class: 'empty-state', text: '没有找到匹配的城市' }));
      return;
    }
    for (const city of list) {
      results.appendChild(
        h(
          'button',
          { class: 'link-row', type: 'button', onclick: () => pick(city) },
          h('span', { html: svgIcon('compass', 14) }),
          h('span', { class: 'name', text: city.name }),
          h('span', { class: 'suggest-hint', text: city.region })
        )
      );
    }
  }, 350);

  input.addEventListener('input', runSearch);

  const body = h(
    'div',
    {},
    h('div', { class: 'field' }, h('label', { text: '搜索城市' }), input),
    results,
    h('div', { class: 'group-title', style: { marginTop: '16px' }, text: '常用城市' }),
    hotRow
  );

  const modal = (await import('./modals.js')).openModal({ title: '选择城市', body, footer: [] });
  setTimeout(() => {
    // 用户可能在 80ms 内就关掉了弹窗
    if (input.isConnected && input.closest('.modal.is-open')) input.focus();
  }, 80);
}

/* --------------------------------------------------------------- 待办 */

function buildTodoCard() {
  const countBadge = h('span', { class: 'count', text: '0' });
  const title = h(
    'div',
    { class: 'card-title' },
    h('span', { html: svgIcon('list-checks', 14) }),
    h('span', { text: '待办' }),
    countBadge
  );
  const clearBtn = h('button', {
    class: 'card-action',
    type: 'button',
    title: '清除已完成',
    'aria-label': '清除已完成',
    html: svgIcon('trash', 14),
    onclick: () => store.clearDoneTodos(),
  });

  const input = h('input', { type: 'text', placeholder: '添加待办，回车确认', maxlength: '200', 'aria-label': '添加待办' });
  const addBtn = h('button', { type: 'button', title: '添加', 'aria-label': '添加待办', html: svgIcon('plus', 14) });

  const submit = () => {
    const value = input.value.trim();
    if (!value) return;
    store.addTodo(value);
    input.value = '';
  };

  addBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });

  const list = h('div', { class: 'todo-list' });

  const card = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-head' }, title, clearBtn),
    h('div', { class: 'todo-add' }, input, addBtn),
    list
  );

  parts.todoList = list;
  parts.todoCount = countBadge;
  parts.todoInput = input;
  renderTodoList();
  return card;
}

function renderTodoList() {
  if (!parts.todoList) return;
  const active = parts.todoList.contains(document.activeElement) ? document.activeElement : null;
  const activeItem = active?.closest?.('.todo-item');
  const activeId = activeItem?.dataset.todoId || '';
  const activeAction = active?.dataset.todoAction || '';
  const activeIndex = activeItem ? Array.from(parts.todoList.querySelectorAll('.todo-item')).indexOf(activeItem) : -1;
  const todos = store.state.todos;
  clear(parts.todoList);

  if (parts.todoCount) {
    const pending = todos.filter((todo) => !todo.done).length;
    parts.todoCount.textContent = String(pending);
  }

  if (!todos.length) {
    parts.todoList.appendChild(h('div', { class: 'empty-state', text: '还没有待办事项\n添加一条开始吧' }));
    // 删掉最后一条时也要把焦点交给输入框，不能直接 return 丢到页面根部
  }

  const sorted = [...todos].sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);

  for (const todo of sorted) {
    const row = h('div', {
      class: `todo-item${todo.done ? ' done' : ''}`,
      'data-todo-id': todo.id,
    });
    const check = h('button', {
      class: 'todo-check',
      type: 'button',
      'data-todo-action': 'toggle',
      'aria-label': todo.done ? '标记未完成' : '标记完成',
      html: svgIcon('check', 11),
      onclick: () => store.toggleTodo(todo.id),
    });
    const text = h('div', { class: 'todo-text', text: todo.text });
    const del = h('button', {
      class: 'todo-del',
      type: 'button',
      'data-todo-action': 'delete',
      'aria-label': '删除待办',
      html: svgIcon('close', 12),
      onclick: () => store.removeTodo(todo.id),
    });
    row.append(check, text, del);
    parts.todoList.appendChild(row);
  }

  // 勾选/删除会重建整张列表：把焦点还给同一个操作按钮，
  // 键盘用户才能连续勾选，而不是每点一次就被丢回页面根部。
  if (activeId && activeAction) {
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(activeId) : activeId.replace(/"/g, '\\"');
    const target = parts.todoList.querySelector(
      `[data-todo-id="${escaped}"] [data-todo-action="${activeAction}"]`
    );
    if (target) {
      target.focus({ preventScroll: true });
    } else if (activeAction === 'delete') {
      // 当前条被删掉：焦点落到原位置的下一项（没有就落到上一项/输入框）
      const checks = Array.from(parts.todoList.querySelectorAll('.todo-check'));
      const next = checks[Math.min(Math.max(activeIndex, 0), checks.length - 1)];
      (next || parts.todoInput)?.focus({ preventScroll: true });
    }
  }
}

/* --------------------------------------------------------------- 便签 */

function buildNotesCard() {
  const status = h('span', { class: 'field-hint', style: { marginTop: '0', fontSize: '10.5px' }, text: '' });
  const title = h(
    'div',
    { class: 'card-title' },
    h('span', { html: svgIcon('note', 14) }),
    h('span', { text: '便签' })
  );

  const area = h('textarea', {
    class: 'notes-area',
    placeholder: '随手记点什么…',
    maxlength: '20000',
    spellcheck: 'false',
    'aria-label': '便签',
  });
  area.value = store.state.notes || '';

  const markSaved = debounce(() => {
    status.textContent = '已保存';
    setTimeout(() => {
      if (status.textContent === '已保存') status.textContent = '';
    }, 1600);
  }, 500);

  area.addEventListener('input', () => {
    // 立即写入状态树：即使 500ms 内关闭标签页，pagehide 的 flushNow 也能落盘
    store.setNotes(area.value);
    status.textContent = '输入中…';
    markSaved();
  });

  return h(
    'div',
    { class: 'card is-notes' },
    h('div', { class: 'card-head' }, title, status),
    area
  );
}

/* ----------------------------------------------------- 书签 / 常去网站 */

function buildLinksCard(kind) {
  const isBookmarks = kind === 'bookmarks';
  const titleText = isBookmarks ? '书签' : '常去网站';
  const title = h(
    'div',
    { class: 'card-title' },
    h('span', { html: svgIcon(isBookmarks ? 'bookmark' : 'compass', 14) }),
    h('span', { text: titleText })
  );
  const body = h('div');
  let focusAfterGrant = false;

  const card = h('div', { class: 'card' }, h('div', { class: 'card-head' }, title), body);

  const render = async () => {
    clear(body);
    const list = h('div', { class: 'link-list' });

    const granted = await hasPermission(isBookmarks ? 'bookmarks' : 'topSites');
    if (!granted) {
      body.appendChild(
        h(
          'div',
          { class: 'empty-state' },
          h('div', { text: `需要授权才能读取${titleText}` }),
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              style: { marginTop: '10px' },
              text: '允许访问',
              onclick: async () => {
                const ok = await requestPermission(isBookmarks ? 'bookmarks' : 'topSites');
                if (!ok) {
                  bus.emit('toast', { text: `未获得${titleText}访问权限`, error: true });
                  return;
                }
                // 授权成功后按钮会被 render 清掉，把焦点交给新出现的第一个链接
                focusAfterGrant = true;
                await render();
              },
            }
          )
        )
      );
      return;
    }

    const items = isBookmarks ? await loadBookmarks() : await loadTopSites();

    if (!items.length) {
      body.appendChild(h('div', { class: 'empty-state', text: `暂无${titleText}` }));
      return;
    }

    for (const item of items) {
      const descriptor = resolveIcon(
        { title: item.title, url: item.url },
        { iconStyle: store.state.config.layout.iconStyle || 'brand' }
      );
      const initial = (Array.from(String(descriptor.text || item.title || '?').trim())[0] || '?').toUpperCase();
      const dirt = h('span', {
        class: 'link-fav',
        text: initial,
        'aria-hidden': 'true',
        style: {
          background: `linear-gradient(145deg, ${descriptor.from}, ${descriptor.to})`,
          color: descriptor.fg || '#fff',
        },
      });
      const src = faviconUrl(item.url, 32);
      if (src) {
        const img = h('img', { src, alt: '', loading: 'lazy' });
        img.addEventListener(
          'load',
          () => {
            // 保留下面的品牌色渐变：透明底的 favicon 不会变成一块空白
            Array.from(dirt.childNodes).forEach((child) => {
              if (child !== img) child.remove();
            });
          },
          { once: true }
        );
        img.addEventListener('error', () => img.remove(), { once: true });
        dirt.appendChild(img);
      }
      list.appendChild(
        h(
          'button',
          { class: 'link-row', type: 'button', title: item.url, onclick: () => window.open(item.url, '_blank', 'noopener') },
          dirt,
          h('span', { class: 'name', text: item.title })
        )
      );
    }
    body.appendChild(list);
    if (focusAfterGrant) {
      focusAfterGrant = false;
      const active = document.activeElement;
      if (card.isConnected && (!active || active === document.body)) {
        list.querySelector('.link-row')?.focus({ preventScroll: true });
      }
    }
  };

  render();
  return card;
}

function hasPermission(name) {
  return new Promise((resolve) => {
    try {
      if (!chrome?.permissions?.contains) {
        resolve(false);
        return;
      }
      chrome.permissions.contains({ permissions: [name] }, (result) => {
        if (globalThis.chrome?.runtime?.lastError) {
          resolve(false);
          return;
        }
        resolve(Boolean(result));
      });
    } catch {
      resolve(false);
    }
  });
}

function requestPermission(name) {
  return new Promise((resolve) => {
    try {
      chrome.permissions.request({ permissions: [name] }, (granted) => {
        if (globalThis.chrome?.runtime?.lastError) {
          resolve(false);
          return;
        }
        resolve(Boolean(granted));
      });
    } catch {
      resolve(false);
    }
  });
}

function loadBookmarks() {
  return new Promise((resolve) => {
    try {
      chrome.bookmarks.getTree((tree) => {
        if (globalThis.chrome?.runtime?.lastError) {
          resolve([]);
          return;
        }
        const collected = [];
        const walk = (nodes) => {
          if (!Array.isArray(nodes)) return;
          for (const node of nodes) {
            if (collected.length >= 24) return;
            if (!node || typeof node !== 'object') continue;
            if (node.url) {
              const url = normalizeUrl(node.url);
              if (url && isUsableUrl(url)) collected.push({ title: node.title || url, url });
            }
            if (Array.isArray(node.children)) walk(node.children);
          }
        };
        walk(tree);
        resolve(collected);
      });
    } catch {
      resolve([]);
    }
  });
}

function loadTopSites() {
  return new Promise((resolve) => {
    try {
      chrome.topSites.get((sites) => {
        if (globalThis.chrome?.runtime?.lastError) {
          resolve([]);
          return;
        }
        resolve(
          (Array.isArray(sites) ? sites : [])
            .map((site) => {
              if (!site || typeof site !== 'object') return null;
              const url = normalizeUrl(site.url);
              return url && isUsableUrl(url) ? { title: site.title || url, url } : null;
            })
            .filter(Boolean)
            .slice(0, 16)
        );
      });
    } catch {
      resolve([]);
    }
  });
}

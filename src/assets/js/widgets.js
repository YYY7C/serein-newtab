/* Lumen · 侧边小组件
 *
 * 设计原则：卡片只构建一次，之后原地更新 —— 这样在待办里打字、在便签里写字
 * 都不会因为其他状态变化而丢失焦点。
 */

import { $, h, clear, svgIcon, debounce, relativeTime } from './util.js';
import * as store from './store.js';
import { weatherIconInline, weatherLabel, refreshWeather, searchCity, HOT_CITIES } from './weather.js';
import { faviconUrl } from './icons.js';

let sidebarEl = null;
let signature = '';
let parts = {};
let weatherTimer = 0;

/* --------------------------------------------------------------- 初始化 */

export function initWidgets() {
  sidebarEl = $('#sidebar');
  rebuild();
  store.subscribe(onChange);
  document.addEventListener('lumen:refresh-weather', () => loadWeather(true));
  startWeatherTimer();
  return () => clearInterval(weatherTimer);
}

function onChange(scope) {
  if (scope === 'config' || scope === 'all') rebuild();
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

function rebuild() {
  const next = makeSignature();
  if (next === signature) {
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
  loadWeather(false);
}

function updateSidebarVisibility() {
  const hasAny =
    store.state.config.layout.showWeather ||
    widgetConfig().todo ||
    widgetConfig().notes ||
    widgetConfig().bookmarks ||
    widgetConfig().topSites;
  sidebarEl.classList.toggle('is-hidden', !hasAny || store.state.config.sidebar === 'hidden');
  sidebarEl.classList.toggle('is-left', store.state.config.sidebar === 'left');
}

/* --------------------------------------------------------------- 天气 */

function buildWeatherCard() {
  const card = h('div', { class: 'card' });
  const title = h('div', { class: 'card-title' }, h('span', { html: svgIcon('weather', 14) }), h('span', { text: '天气' }));
  const cityBtn = h('button', {
    class: 'weather-city',
    type: 'button',
    html: `${svgIcon('compass', 12)}<span>--</span>`,
    onclick: () => openCityPicker(),
  });
  const refreshBtn = h('button', {
    class: 'card-action',
    type: 'button',
    title: '刷新天气',
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

function updateWeather() {
  if (!parts.weatherBody) return;
  const { weather, config } = store.state;

  const citySpan = parts.weatherCity?.querySelector('span');
  if (citySpan) citySpan.textContent = weather.city || '选择城市';

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

  const main = h(
    'div',
    { class: 'weather-main' },
    h('span', { html: weatherIconInline(cache.code, cache.isDay, 50), style: { display: 'grid', placeItems: 'center' } }),
    h(
      'div',
      { style: { minWidth: '0' } },
      h('div', { class: 'weather-temp', html: `${cache.temp}<sup>°C</sup>` }),
      h(
        'div',
        { class: 'weather-meta' },
        h('span', { text: weatherLabel(cache.code) }),
        h('span', { text: `体感 ${cache.feels}°` }),
        h('span', { text: `湿度 ${cache.humidity}%` })
      )
    )
  );
  parts.weatherBody.appendChild(main);

  if (cache.days?.length) {
    const forecast = h('div', { class: 'forecast' });
    cache.days.forEach((day, index) => {
      const date = new Date(`${day.iso}T00:00:00`);
      const name = index === 0 ? '今天' : `${date.getMonth() + 1}/${date.getDate()}`;
      forecast.appendChild(
        h(
          'div',
          { class: 'forecast-day', title: weatherLabel(day.code) },
          h('span', { class: 'forecast-name', text: name }),
          h('span', { html: weatherIconInline(day.code, true, 20), style: { opacity: '.9' } }),
          h('span', { class: 'forecast-temp', html: `${day.max}°<span>/${day.min}°</span>` })
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
    console.warn('[lumen/widgets] 天气刷新异常', err);
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
  const input = h('input', { class: 'text-input', type: 'text', placeholder: '搜索城市，例如：杭州' });
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

  const runSearch = debounce(async () => {
    const keyword = input.value.trim();
    clear(results);
    if (!keyword) return;
    results.appendChild(h('div', { class: 'empty-state', text: '搜索中…' }));
    const list = await searchCity(keyword);
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
  setTimeout(() => input.focus(), 80);
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
    html: svgIcon('trash', 14),
    onclick: () => {
      store.clearDoneTodos();
      renderTodoList();
    },
  });

  const input = h('input', { type: 'text', placeholder: '添加待办，回车确认', maxlength: '200' });
  const addBtn = h('button', { type: 'button', title: '添加', html: svgIcon('plus', 14) });

  const submit = () => {
    const value = input.value.trim();
    if (!value) return;
    store.addTodo(value);
    input.value = '';
  };

  addBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => {
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
  const todos = store.state.todos;
  clear(parts.todoList);

  if (parts.todoCount) {
    const pending = todos.filter((todo) => !todo.done).length;
    parts.todoCount.textContent = String(pending);
  }

  if (!todos.length) {
    parts.todoList.appendChild(h('div', { class: 'empty-state', text: '还没有待办事项\n添加一条开始吧' }));
    return;
  }

  const sorted = [...todos].sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);

  for (const todo of sorted) {
    const row = h('div', { class: `todo-item${todo.done ? ' done' : ''}` });
    const check = h('button', {
      class: 'todo-check',
      type: 'button',
      'aria-label': todo.done ? '标记未完成' : '标记完成',
      html: svgIcon('check', 11),
      onclick: () => {
        store.toggleTodo(todo.id);
        renderTodoList();
      },
    });
    const text = h('div', { class: 'todo-text', text: todo.text });
    const del = h('button', {
      class: 'todo-del',
      type: 'button',
      'aria-label': '删除待办',
      html: svgIcon('close', 12),
      onclick: () => {
        store.removeTodo(todo.id);
        renderTodoList();
      },
    });
    row.append(check, text, del);
    parts.todoList.appendChild(row);
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
  });
  area.value = store.state.notes || '';

  const save = debounce(() => {
    store.setNotes(area.value);
    status.textContent = '已保存';
    setTimeout(() => {
      if (status.textContent === '已保存') status.textContent = '';
    }, 1600);
  }, 500);

  area.addEventListener('input', () => {
    status.textContent = '输入中…';
    save();
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
                if (ok) render();
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
      const dirt = h('span', { class: 'link-fav', text: item.title.slice(0, 1) });
      const src = faviconUrl(item.url, 32);
      if (src) {
        const img = h('img', { src, alt: '', loading: 'lazy' });
        img.addEventListener('load', () => {
          dirt.textContent = '';
          dirt.style.background = 'transparent';
          dirt.appendChild(img);
        });
        img.addEventListener('error', () => img.remove());
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
      chrome.permissions.contains({ permissions: [name] }, (result) => resolve(Boolean(result)));
    } catch {
      resolve(false);
    }
  });
}

function requestPermission(name) {
  return new Promise((resolve) => {
    try {
      chrome.permissions.request({ permissions: [name] }, (granted) => resolve(Boolean(granted)));
    } catch {
      resolve(false);
    }
  });
}

function loadBookmarks() {
  return new Promise((resolve) => {
    try {
      chrome.bookmarks.getTree((tree) => {
        const collected = [];
        const walk = (nodes) => {
          for (const node of nodes || []) {
            if (node.url) collected.push({ title: node.title || node.url, url: node.url });
            if (node.children) walk(node.children);
          }
        };
        walk(tree);
        resolve(collected.slice(0, 24));
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
        resolve((sites || []).slice(0, 16).map((site) => ({ title: site.title || site.url, url: site.url })));
      });
    } catch {
      resolve([]);
    }
  });
}

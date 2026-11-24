/* Serein · 侧边小组件
 *
 * 设计原则：卡片只构建一次，之后原地更新 —— 这样在待办里打字、在便签里写字
 * 都不会因为其他状态变化而丢失焦点。
 */

import { $, h, clear, uid, svgIcon, debounce, relativeTime, normalizeUrl, isUsableUrl, bus } from './util.js';
import * as store from './store.js';
import { weatherIconInline, weatherLabel, refreshWeather, searchCity, HOT_CITIES } from './weather.js';
import { faviconUrl, resolveIcon } from './icons.js';
import { t, isEnglish, formatDate } from './i18n.js';
import { lookupCityNames } from './city-search.js';

let sidebarEl = null;
let signature = '';
let parts = {};
let weatherTimer = 0;
let secondTimer = 0;
let slowTimer = 0;
let sidebarObserver = null;
let scrollStateFrame = 0;
let sidebarScrollHandler = null;
let sidebarRail = null;

/* --------------------------------------------------------------- 初始化 */

export function initWidgets() {
  sidebarEl = $('#sidebar');
  // 滚动指示条放在侧栏外面，避免原生滚动条挤占卡片宽度
  sidebarRail = h('div', { class: 'sidebar-scroll-rail', 'aria-hidden': 'true' }, h('i'));
  sidebarEl.after(sidebarRail);
  sidebarScrollHandler = () => scheduleSidebarScrollState();
  sidebarEl.addEventListener('scroll', sidebarScrollHandler, { passive: true });
  rebuild();
  store.subscribe(onChange);
  startWeatherTimer();
  const refreshOnVisible = () => {
    if (document.hidden) {
      // 后台标签页不每秒改 DOM：不做无意义的布局和绘制
      stopSideTimers();
      return;
    }
    // 标签页可能在后台待了几个小时：回到前台时若缓存过期就补一次
    if (store.state.config.layout.showWeather) loadWeather(false);
    repaintSide();
    startSideTimers();
  };
  document.addEventListener('visibilitychange', refreshOnVisible);
  return () => {
    clearInterval(weatherTimer);
    stopSideTimers();
    sidebarObserver?.disconnect();
    sidebarObserver = null;
    cancelAnimationFrame(scrollStateFrame);
    scrollStateFrame = 0;
    sidebarEl?.removeEventListener('scroll', sidebarScrollHandler);
    sidebarRail?.remove();
    sidebarRail = null;
    document.removeEventListener('visibilitychange', refreshOnVisible);
  };
}

/** 语言切换后重建整栏卡片（保留滚动位置） */
export function refreshWidgetsLocale() {
  if (!sidebarEl) return;
  rebuild(true);
}

function onChange(scope) {
  if (scope === 'all') rebuild(true);
  else if (scope === 'config') rebuild();
  else if (scope === 'weather') updateWeather();
  else if (scope === 'todos') renderTodoList();
  else if (scope === 'pomodoro') parts.pomodoro?.__paint?.();
  else if (scope === 'countdown') parts.countdown?.__paint?.();
  else if (scope === 'worldClocks') rebuild(true);
  else if (scope === 'notes') parts.notes?.__syncNotes?.();
}

function widgetConfig() {
  return store.state.config.widgets;
}

function makeSignature() {
  const widgets = widgetConfig();
  const layout = store.state.config.layout;
  return [
    widgets.todo,
    widgets.notes,
    widgets.bookmarks,
    widgets.topSites,
    widgets.pomodoro,
    widgets.worldClock,
    widgets.countdown,
    layout.showWeather,
  ]
    .map((value) => (value ? '1' : '0'))
    .join('');
}

/** 侧栏可见且页面在前台时，秒级/分钟级的刷新才有意义 */
function sidebarActive() {
  return Boolean(sidebarEl) && !document.hidden && !sidebarEl.classList.contains('is-hidden');
}

/* 侧栏滚动状态：底部渐隐提示「下面还有卡片」，滚到底后撤掉渐隐 */
function updateSidebarScrollState() {
  if (!sidebarEl) return;
  const max = sidebarEl.scrollHeight - sidebarEl.clientHeight;
  const scrollable = max > 1;
  const hidden = sidebarEl.classList.contains('is-hidden');
  sidebarEl.classList.toggle('is-scrollable', scrollable);
  sidebarEl.classList.toggle('is-scroll-end', !scrollable || sidebarEl.scrollTop >= max - 2);
  if (!sidebarRail) return;
  if (!scrollable || hidden) {
    sidebarRail.classList.remove('is-visible');
    return;
  }
  // 指示条的高度对应整个侧栏可视区，滑块按内容比例缩放
  const railHeight = sidebarRail.clientHeight;
  if (!railHeight) return;
  // 用指示条自身的可视高度算比例，和它实际能走的距离一致
  const thumb = Math.min(railHeight, Math.max(30, (railHeight / sidebarEl.scrollHeight) * railHeight));
  const y = max > 0 ? (sidebarEl.scrollTop / max) * (railHeight - thumb) : 0;
  sidebarRail.style.setProperty('--rail-thumb', `${Math.round(thumb)}px`);
  sidebarRail.style.setProperty('--rail-y', `${Math.round(y)}px`);
  sidebarRail.classList.add('is-visible');
}

function scheduleSidebarScrollState() {
  if (scrollStateFrame) return;
  scrollStateFrame = requestAnimationFrame(() => {
    scrollStateFrame = 0;
    updateSidebarScrollState();
  });
}

function observeSidebarContent() {
  if (typeof ResizeObserver === 'undefined' || !sidebarEl) return;
  sidebarObserver?.disconnect();
  sidebarObserver = new ResizeObserver(scheduleSidebarScrollState);
  sidebarObserver.observe(sidebarEl);
  for (const child of sidebarEl.children) sidebarObserver.observe(child);
}

function stopSideTimers() {
  clearInterval(secondTimer);
  clearInterval(slowTimer);
  secondTimer = 0;
  slowTimer = 0;
}

function startSideTimers() {
  stopSideTimers();
  if (!sidebarActive()) return;
  // 两个秒级组件共用一个 ticker：少一个定时器，也不会同一帧里连做两次布局
  if (parts.pomodoro || parts.countdown) {
    secondTimer = setInterval(() => {
      if (!sidebarActive()) return;
      parts.pomodoro?.__tick?.();
      parts.countdown?.__tick?.();
    }, 1000);
  }
  if (parts.worldClock) {
    slowTimer = setInterval(() => {
      if (sidebarActive()) parts.worldClock.__paint?.();
    }, 30 * 1000);
  }
}

function repaintSide() {
  parts.pomodoro?.__paint?.();
  parts.countdown?.__paint?.();
  parts.worldClock?.__paint?.();
}

function rebuild(force = false) {
  const next = makeSignature();
  if (!force && next === signature) {
    updateSidebarVisibility();
    return;
  }
  // 开关小组件/世界时钟变更会整栏重建：保留用户已经滚到的位置
  const scrollTop = sidebarEl.scrollTop;
  signature = next;
  parts = {};
  stopSideTimers();
  clear(sidebarEl);

  if (store.state.config.layout.showWeather) {
    parts.weather = buildWeatherCard();
    sidebarEl.appendChild(parts.weather);
  }
  if (widgetConfig().todo) {
    parts.todo = buildTodoCard();
    sidebarEl.appendChild(parts.todo);
  }
  if (widgetConfig().pomodoro) {
    parts.pomodoro = buildPomodoroCard();
    sidebarEl.appendChild(parts.pomodoro);
  }
  if (widgetConfig().countdown) {
    parts.countdown = buildCountdownCard();
    sidebarEl.appendChild(parts.countdown);
  }
  if (widgetConfig().worldClock) {
    parts.worldClock = buildWorldClockCard();
    sidebarEl.appendChild(parts.worldClock);
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

  if (scrollTop > 0) sidebarEl.scrollTop = scrollTop;
  observeSidebarContent();
  updateSidebarScrollState();
  updateSidebarVisibility();
  startSideTimers();
  if (store.state.config.layout.showWeather) loadWeather(false);
}

function updateSidebarVisibility() {
  const hasAny =
    store.state.config.layout.showWeather ||
    widgetConfig().todo ||
    widgetConfig().notes ||
    widgetConfig().bookmarks ||
    widgetConfig().topSites ||
    widgetConfig().pomodoro ||
    widgetConfig().worldClock ||
    widgetConfig().countdown;
  const hidden = !hasAny || store.state.config.sidebar === 'hidden';
  const wasHidden = sidebarEl.classList.contains('is-hidden');
  sidebarEl.classList.toggle('is-hidden', hidden);
  // 侧栏只是宽度归零 + 透明；不 inert 的话，Tab 仍会钻进看不见的按钮
  if (hidden && sidebarEl.contains(document.activeElement)) document.activeElement.blur?.();
  sidebarEl.inert = hidden;
  sidebarEl.setAttribute('aria-hidden', String(hidden));
  sidebarEl.classList.toggle('is-left', store.state.config.sidebar === 'left');
  if (hidden) {
    // 收起的侧栏没人看：不要再每秒改 DOM 触发布局
    stopSideTimers();
  } else if (wasHidden) {
    // 重新展开时立即补一帧，否则会停在收起前的时间
    repaintSide();
    startSideTimers();
  }
  scheduleSidebarScrollState();
}

/* --------------------------------------------------------------- 天气 */

function buildWeatherCard() {
  const card = h('div', { class: 'card' });
  const title = h(
    'div',
    { class: 'card-title' },
    h('span', { html: svgIcon('weather', 14) }),
    h('span', { text: t('天气') })
  );
  const cityName = h('span', { class: 'city-name', text: '--' });
  const cityBtn = h(
    'button',
    {
      class: 'weather-city',
      type: 'button',
      title: t('切换城市'),
      'aria-label': t('切换城市'),
      onclick: () => openCityPicker(),
    },
    h('span', { class: 'city-pin', html: svgIcon('compass', 12), 'aria-hidden': 'true' }),
    cityName,
    h('span', { class: 'city-caret', html: svgIcon('chevron-down', 10), 'aria-hidden': 'true' })
  );
  const refreshBtn = h('button', {
    class: 'card-action weather-refresh',
    type: 'button',
    title: t('刷新天气'),
    'aria-label': t('刷新天气'),
    html: svgIcon('refresh', 14),
    onclick: () => loadWeather(true),
  });

  const head = h(
    'div',
    { class: 'card-head' },
    title,
    h('div', { class: 'weather-actions' }, cityBtn, refreshBtn)
  );

  const body = h('div', { class: 'weather-body' }, h('div', { class: 'empty-state', text: t('正在获取天气…') }));

  card.appendChild(head);
  card.appendChild(body);
  parts.weatherCity = cityBtn;
  parts.weatherCityName = cityName;
  parts.weatherRefresh = refreshBtn;
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

/** 天气城市显示名：中文界面用中文规范名，英文界面优先用英文名 */
function weatherCityLabel(weather) {
  if (isEnglish()) return weather.cityEn || weather.city || '';
  return weather.city || weather.cityEn || '';
}

let cityLookupSeq = 0;

/** 老数据只有中文城市名：英文界面下按名字补一次英文名，查到后缓存进状态 */
function ensureWeatherCityEnglish() {
  if (!isEnglish()) return;
  const weather = store.state.weather;
  if (weather.cityEn || !weather.city) return;
  const seq = ++cityLookupSeq;
  lookupCityNames(weather.city)
    .then((found) => {
      if (seq !== cityLookupSeq || !found?.nameEn) return;
      if (store.state.weather.city !== weather.city) return;
      store.setWeather({ cityEn: found.nameEn });
    })
    .catch(() => {
      /* 城市库没加载出来就保持中文名，不影响天气 */
    });
}

function updateWeather() {
  if (!parts.weatherBody) return;
  const { weather, config } = store.state;
  ensureWeatherCityEnglish();
  const city = weatherCityLabel(weather);

  if (parts.weatherCityName) parts.weatherCityName.textContent = city || t('选择城市');
  parts.weatherCity?.setAttribute(
    'aria-label',
    city ? t('切换城市，当前 {city}', { city }) : t('选择城市')
  );
  parts.weatherCity?.setAttribute('title', city ? t('{city} · 点击切换城市', { city }) : t('选择城市'));

  clear(parts.weatherBody);
  const cache = weather.cache;

  if (!cache) {
    parts.weatherBody.appendChild(
      h('div', {
        class: 'empty-state',
        text: weather.error ? t('天气获取失败，点击右上角重试') : t('暂无天气数据'),
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
        h('span', { text: t('体感 {value}', { value: weatherNumber(cache.feels, '°') }) }),
        h('span', { text: t('湿度 {value}', { value: weatherNumber(cache.humidity, '%') }) })
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
      const name = index === 0
        ? t('今天')
        : validDate
          ? formatDate(validDate, { month: 'numeric', day: 'numeric' })
          : '—';
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
        text: t('{time}更新 · Open-Meteo', { time: relativeTime(weather.updatedAt) }),
      })
    );
  }
  void config;
  scheduleSidebarScrollState();
}

async function loadWeather(force) {
  const refreshBtn = parts.weatherRefresh;
  if (force && refreshBtn) {
    refreshBtn.classList.add('is-busy');
    refreshBtn.setAttribute('aria-busy', 'true');
  }
  try {
    await refreshWeather(store.state, { force });
  } catch (err) {
    console.warn('[serein/widgets] 天气刷新异常', err);
  } finally {
    if (force && refreshBtn) {
      refreshBtn.classList.remove('is-busy');
      refreshBtn.removeAttribute('aria-busy');
    }
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
  // 当前城市比较用中文规范名，显示用当前语言
  const currentCity = store.state.weather.city || '';
  const inputId = uid('city-input-');
  const listId = uid('city-results-');
  let modal = null;
  let searchToken = 0;
  let controller = null;
  let matches = [];
  let buttons = [];
  let activeIndex = -1;

  const input = h('input', {
    id: inputId,
    class: 'text-input city-input',
    type: 'text',
    placeholder: t('搜索城市，例如：厦门、Xiamen'),
    maxlength: '80',
    role: 'combobox',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': t('搜索城市'),
    'aria-autocomplete': 'list',
    'aria-controls': listId,
    'aria-expanded': 'false',
  });
  const clearBtn = h('button', {
    class: 'city-clear',
    type: 'button',
    title: t('清空搜索'),
    'aria-label': t('清空搜索'),
    html: svgIcon('close', 14),
    hidden: true,
  });
  const search = h('div', { class: 'city-search' }, input, clearBtn);
  const results = h('div', {
    id: listId,
    class: 'city-results',
    role: 'listbox',
    'aria-label': t('城市搜索结果'),
    hidden: true,
  });
  const hotTitle = h('div', { class: 'group-title city-hot-title', text: t('常用城市') });
  const hotRow = h('div', { class: 'city-hot' });
  const status = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });

  const pick = (city) => {
    if (!city) return;
    searchToken += 1;
    controller?.abort();
    store.setWeather({
      // 两种语言都保存，切换语言后天气卡片不用重新选城市
      city: city.nameZh || city.name,
      cityEn: city.nameEn || city.name,
      lat: city.lat,
      lon: city.lon,
      updatedAt: 0,
      cache: null,
      error: '',
    });
    modal?.close();
    loadWeather(true);
  };

  for (const city of HOT_CITIES) {
    const name = isEnglish() ? city.nameEn : city.name;
    hotRow.appendChild(
      h('button', {
        class: `btn city-hot-btn${city.name === currentCity ? ' is-current' : ''}`,
        type: 'button',
        text: name,
        'aria-current': city.name === currentCity ? 'true' : null,
        onclick: () => pick(city),
      })
    );
  }

  const setExpanded = (expanded) => input.setAttribute('aria-expanded', String(expanded));
  const updateClear = () => {
    clearBtn.hidden = !input.value.trim();
  };
  const showHot = (show) => {
    hotTitle.hidden = !show;
    hotRow.hidden = !show;
  };
  const clearActive = () => {
    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');
    for (const button of buttons) {
      button.classList.remove('is-active');
      button.setAttribute('aria-selected', 'false');
    }
  };
  const setActive = (index) => {
    if (!buttons.length) return;
    const next = ((index % buttons.length) + buttons.length) % buttons.length;
    activeIndex = next;
    buttons.forEach((button, i) => {
      const on = i === next;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-selected', String(on));
    });
    input.setAttribute('aria-activedescendant', buttons[next].id);
    buttons[next].scrollIntoView({ block: 'nearest' });
  };
  const reset = () => {
    clear(results);
    results.hidden = true;
    setExpanded(false);
    clearActive();
    matches = [];
    buttons = [];
    showHot(true);
    status.textContent = '';
  };
  const renderLoading = () => {
    clear(results);
    results.hidden = false;
    setExpanded(false);
    clearActive();
    matches = [];
    buttons = [];
    results.appendChild(
      h(
        'div',
        { class: 'city-loading' },
        h('span', { class: 'city-spinner', 'aria-hidden': 'true' }),
        h('span', { text: t('正在搜索城市…') })
      )
    );
    status.textContent = t('正在搜索城市');
  };
  const renderEmpty = (keyword) => {
    const cjk = /[\u3400-\u9fff]/.test(keyword);
    const shown = keyword.length > 28 ? `${keyword.slice(0, 28)}…` : keyword;
    clear(results);
    results.hidden = false;
    setExpanded(false);
    clearActive();
    matches = [];
    buttons = [];
    results.appendChild(
      h(
        'div',
        { class: 'city-empty' },
        h('div', { class: 'city-empty-title', text: t('没有找到「{query}」', { query: shown }) }),
        h('div', {
          class: 'city-empty-hint',
          text: cjk ? t('可以试试拼音或英文名，例如 Xiamen') : t('检查一下拼写，或直接输入中文城市名'),
        })
      )
    );
    status.textContent = t('没有找到匹配的城市');
  };
  const renderResults = (list) => {
    clear(results);
    results.hidden = false;
    setExpanded(true);
    clearActive();
    matches = list;
    buttons = [];
    list.forEach((city, index) => {
      const current = city.name === currentCity;
      const button = h(
        'button',
        {
          id: `${listId}-${index}`,
          class: 'city-result',
          type: 'button',
          role: 'option',
          tabindex: '-1',
          'aria-selected': 'false',
          onclick: () => pick(city),
        },
        h('span', { class: 'city-result-icon', html: svgIcon('compass', 15), 'aria-hidden': 'true' }),
        h(
          'span',
          { class: 'city-result-text' },
          h('span', { class: 'city-result-name', text: city.name }),
          city.region ? h('span', { class: 'city-result-region', text: city.region }) : null
        ),
        current ? h('span', { class: 'city-current', text: t('当前') }) : null
      );
      buttons.push(button);
      results.appendChild(button);
    });
    showHot(false);
    status.textContent = t('找到 {n} 个城市', { n: list.length });
    setActive(0);
  };

  const runSearch = debounce(async () => {
    const keyword = input.value.trim();
    updateClear();
    if (!keyword) {
      reset();
      return;
    }
    const token = ++searchToken;
    controller?.abort();
    controller = new AbortController();
    showHot(false);
    renderLoading();
    let list = [];
    try {
      list = await searchCity(keyword, { signal: controller.signal });
    } catch {
      list = [];
    }
    if (token !== searchToken) return;
    if (!list.length) {
      renderEmpty(keyword);
      // 没有结果时把常用城市放回来，至少还能一键选择
      showHot(true);
      return;
    }
    renderResults(list);
  }, 180);

  const clearSearch = () => {
    input.value = '';
    updateClear();
    runSearch.cancel();
    searchToken += 1;
    controller?.abort();
    reset();
    input.focus({ preventScroll: true });
  };

  input.addEventListener('input', () => {
    updateClear();
    if (!input.value.trim()) {
      runSearch.cancel();
      searchToken += 1;
      controller?.abort();
      controller = null;
      reset();
      return;
    }
    // 先清掉旧结果和旧请求，再防抖：否则旧关键词的结果/回车仍会落到新输入上
    searchToken += 1;
    controller?.abort();
    controller = null;
    showHot(false);
    renderLoading();
    runSearch();
  });
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!buttons.length) return;
      event.preventDefault();
      if (activeIndex < 0) setActive(event.key === 'ArrowDown' ? 0 : buttons.length - 1);
      else setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      if (!buttons.length) return;
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : buttons.length - 1);
      return;
    }
    if (event.key === 'Enter' && matches.length) {
      event.preventDefault();
      const index = activeIndex >= 0 ? activeIndex : 0;
      setActive(index);
      pick(matches[index]);
    }
  });
  clearBtn.addEventListener('click', clearSearch);

  const body = h(
    'div',
    { class: 'city-picker' },
    h(
      'div',
      { class: 'field' },
      h('label', { for: inputId, text: t('搜索城市') }),
      search,
      h('div', { class: 'field-hint', text: t('支持中文、拼音和英文；选择后会自动刷新天气。') })
    ),
    results,
    status,
    hotTitle,
    hotRow
  );

  const { openModal } = await import('./modals.js');
  modal = openModal({
    title: t('选择城市'),
    body,
    footer: [],
    onClose: () => {
      runSearch.cancel();
      searchToken += 1;
      controller?.abort();
      controller = null;
    },
  });
}

/* --------------------------------------------------------------- 专注 */

const POMO_SECONDS = { focus: 25 * 60, break: 5 * 60 };

const formatPomo = (seconds) => {
  const left = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
};

function pomodoroLeft(pomodoro) {
  if (pomodoro.running) return Math.max(0, Math.ceil((pomodoro.endsAt - Date.now()) / 1000));
  return Math.max(0, Number(pomodoro.remaining) || 0);
}

function finishPomodoro() {
  const pomodoro = store.state.pomodoro;
  const next = pomodoro.phase === 'focus' ? 'break' : 'focus';
  pomodoro.phase = next;
  pomodoro.remaining = POMO_SECONDS[next];
  pomodoro.endsAt = 0;
  pomodoro.running = false;
  store.commit('pomodoro');
  bus.emit('toast', {
    text: next === 'break' ? t('专注完成，休息 5 分钟') : t('休息结束，继续专注'),
  });
}

function buildPomodoroCard() {
  const card = h('div', { class: 'card is-pomodoro' });
  const reset = h('button', {
    class: 'card-action',
    type: 'button',
    title: t('重置'),
    'aria-label': t('重置专注计时'),
    html: svgIcon('refresh', 14),
    onclick: () => {
      const pomodoro = store.state.pomodoro;
      pomodoro.phase = 'focus';
      pomodoro.remaining = POMO_SECONDS.focus;
      pomodoro.endsAt = 0;
      pomodoro.running = false;
      store.commit('pomodoro');
    },
  });
  const phaseEl = h('div', { class: 'pomo-phase', text: t('专注') });
  const timeEl = h('div', { class: 'pomo-time', text: '25:00' });
  const bar = h('i');
  const toggle = h('button', {
    class: 'btn is-primary pomo-toggle',
    type: 'button',
    text: t('开始'),
    onclick: () => {
      const pomodoro = store.state.pomodoro;
      if (pomodoro.running) {
        pomodoro.remaining = pomodoroLeft(pomodoro);
        pomodoro.running = false;
        pomodoro.endsAt = 0;
      } else {
        const seconds = pomodoro.remaining > 0 ? pomodoro.remaining : POMO_SECONDS[pomodoro.phase];
        pomodoro.remaining = seconds;
        pomodoro.endsAt = Date.now() + seconds * 1000;
        pomodoro.running = true;
      }
      store.commit('pomodoro');
    },
  });

  const paint = () => {
    const pomodoro = store.state.pomodoro;
    const left = pomodoroLeft(pomodoro);
    const total = POMO_SECONDS[pomodoro.phase] || POMO_SECONDS.focus;
    phaseEl.textContent = pomodoro.phase === 'break' ? t('休息') : t('专注');
    timeEl.textContent = formatPomo(left);
    toggle.textContent = pomodoro.running ? t('暂停') : t('开始');
    toggle.setAttribute(
      'aria-label',
      pomodoro.running
        ? pomodoro.phase === 'break'
          ? t('暂停休息计时')
          : t('暂停专注计时')
        : pomodoro.phase === 'break'
          ? t('开始休息计时')
          : t('开始专注计时')
    );
    // 用 transform 而不是 width：进度条每秒推进时不会触发重排
    bar.style.transform = `scaleX(${Math.min(1, Math.max(0, 1 - left / total))})`;
    card.classList.toggle('is-break', pomodoro.phase === 'break');
    card.classList.toggle('is-running', pomodoro.running);
  };

  card.append(
    h(
      'div',
      { class: 'card-head' },
      h('div', { class: 'card-title' }, h('span', { html: svgIcon('timer', 14) }), h('span', { text: t('专注') })),
      reset
    ),
    h(
      'div',
      { class: 'pomo-body' },
      phaseEl,
      timeEl,
      h('div', { class: 'pomo-bar' }, bar),
      h('div', { class: 'pomo-actions' }, toggle)
    )
  );
  card.__paint = paint;
  card.__tick = () => {
    const pomodoro = store.state.pomodoro;
    if (!pomodoro.running) return;
    if (pomodoroLeft(pomodoro) <= 0) {
      finishPomodoro();
      return;
    }
    paint();
  };
  paint();
  return card;
}

/* ------------------------------------------------------------- 世界时钟 */

const WORLD_CITIES = [
  { tz: 'America/New_York', label: '纽约' },
  { tz: 'America/Los_Angeles', label: '洛杉矶' },
  { tz: 'America/Sao_Paulo', label: '圣保罗' },
  { tz: 'Europe/London', label: '伦敦' },
  { tz: 'Europe/Paris', label: '巴黎' },
  { tz: 'Europe/Berlin', label: '柏林' },
  { tz: 'Europe/Moscow', label: '莫斯科' },
  { tz: 'Asia/Dubai', label: '迪拜' },
  { tz: 'Asia/Singapore', label: '新加坡' },
  { tz: 'Asia/Tokyo', label: '东京' },
  { tz: 'Asia/Seoul', label: '首尔' },
  { tz: 'Australia/Sydney', label: '悉尼' },
];

const cityLabel = (tz) => {
  const known = WORLD_CITIES.find((city) => city.tz === tz);
  if (known) return t(known.label);
  return String(tz).split('/').pop().replace(/_/g, ' ');
};

function dateKeyInZone(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dayTag(zoneKey, localKey) {
  const asDay = (key) => {
    const [year, month, day] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const diff = Math.round((asDay(zoneKey) - asDay(localKey)) / 86400000);
  if (diff === 0) return t('今天');
  if (diff === 1) return t('明天');
  if (diff === -1) return t('昨天');
  return diff > 0 ? t('+{n} 天', { n: diff }) : t('-{n} 天', { n: Math.abs(diff) });
}

async function editWorldClocks() {
  const zones = Array.isArray(store.state.worldClocks) ? [...store.state.worldClocks] : [];
  const boxes = WORLD_CITIES.map((city) => {
    const input = h('input', {
      type: 'checkbox',
      value: city.tz,
      checked: zones.includes(city.tz),
      'aria-label': city.label,
    });
    return {
      city,
      input,
      row: h(
        'label',
        { class: 'world-city-option' },
        input,
        h('span', { text: t(city.label) }),
        h('span', { class: 'field-hint', text: city.tz })
      ),
    };
  });
  const syncLimit = () => {
    const count = boxes.filter((item) => item.input.checked).length;
    for (const item of boxes) item.input.disabled = !item.input.checked && count >= 6;
  };
  boxes.forEach((item) => item.input.addEventListener('change', syncLimit));
  syncLimit();

  const body = h(
    'div',
    {},
    h('div', { class: 'field-hint', text: t('最多选择 6 个城市，卡片每秒刷新一次。') }),
    h('div', { class: 'world-city-grid' }, ...boxes.map((item) => item.row))
  );
  const { openModal } = await import('./modals.js');
  const modal = openModal({
    title: t('选择世界时钟城市'),
    body,
    footer: [
      h('button', { class: 'btn', type: 'button', text: t('取消'), onclick: () => modal.close() }),
      h('button', {
        class: 'btn is-primary',
        type: 'button',
        text: t('保存'),
        onclick: () => {
          store.state.worldClocks = boxes.filter((item) => item.input.checked).map((item) => item.city.tz);
          modal.close();
          store.commit('worldClocks');
        },
      }),
    ],
  });
}

function buildWorldClockCard() {
  const list = h('div', { class: 'worldclock-list' });
  const edit = h('button', {
    class: 'card-action',
    type: 'button',
    title: t('选择城市'),
    'aria-label': t('选择世界时钟城市'),
    html: svgIcon('compass', 14),
    onclick: () => editWorldClocks(),
  });

  const paint = () => {
    clear(list);
    const zones = Array.isArray(store.state.worldClocks) ? store.state.worldClocks : [];
    if (!zones.length) {
      list.appendChild(
        h(
          'div',
          { class: 'empty-state' },
          h('div', { text: t('还没有添加城市') }),
          h('button', { class: 'btn is-ghost', type: 'button', text: t('选择城市'), onclick: () => editWorldClocks() })
        )
      );
      return;
    }
    const now = new Date();
    const localKey = dateKeyInZone(now, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    for (const zone of zones) {
      let time = '--:--';
      let zoneKey = localKey;
      try {
        time = new Intl.DateTimeFormat('zh-CN', {
          timeZone: zone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(now);
        zoneKey = dateKeyInZone(now, zone);
      } catch {
        /* 时区数据缺失时保留占位 */
      }
      list.appendChild(
        h(
          'div',
          { class: 'worldclock-row' },
          h('span', { class: 'worldclock-name', text: cityLabel(zone) }),
          h('span', { class: 'worldclock-day', text: dayTag(zoneKey, localKey) }),
          h('span', { class: 'worldclock-time', text: time })
        )
      );
    }
  };

  const card = h(
    'div',
    { class: 'card is-worldclock' },
    h(
      'div',
      { class: 'card-head' },
      h(
        'div',
        { class: 'card-title' },
        h('span', { html: svgIcon('compass', 14) }),
        h('span', { text: t('世界时钟') })
      ),
      edit
    ),
    list
  );
  card.__paint = paint;
  paint();
  return card;
}

/* --------------------------------------------------------------- 倒计时 */

function formatCountdown(target) {
  let left = Math.max(0, target - Date.now());
  const days = Math.floor(left / 86400000);
  left -= days * 86400000;
  const hours = Math.floor(left / 3600000);
  left -= hours * 3600000;
  const minutes = Math.floor(left / 60000);
  const seconds = Math.floor((left - minutes * 60000) / 1000);
  return { days, hours, minutes, seconds, done: target <= Date.now() };
}

function localDateTimeValue(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function editCountdown() {
  const current = store.state.countdown || { title: '', target: 0 };
  const titleInput = h('input', {
    class: 'text-input',
    type: 'text',
    maxlength: '60',
    value: current.title || '',
    placeholder: t('例如：项目截止'),
    'aria-label': t('倒计时名称'),
  });
  const dateInput = h('input', {
    class: 'text-input',
    type: 'datetime-local',
    value: localDateTimeValue(current.target > Date.now() ? current.target : Date.now() + 3600000),
    'aria-label': t('倒计时时间'),
  });
  const error = h('div', { class: 'field-error', role: 'alert', hidden: true });
  const body = h(
    'div',
    {},
    h('div', { class: 'field' }, h('label', { text: t('名称') }), titleInput),
    h('div', { class: 'field' }, h('label', { text: t('目标时间') }), dateInput),
    error
  );
  const { openModal } = await import('./modals.js');
  let modal = null;
  const save = () => {
    const target = new Date(dateInput.value).getTime();
    if (!Number.isFinite(target)) {
      error.textContent = t('请选择有效的日期与时间');
      error.hidden = false;
      return;
    }
    if (target <= Date.now()) {
      error.textContent = t('目标时间需要晚于现在');
      error.hidden = false;
      return;
    }
    const next = { title: titleInput.value.trim().slice(0, 60) || t('倒计时'), target };
    store.state.countdown = next;
    modal?.close();
    store.commit('countdown');
  };
  titleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  });
  dateInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  });
  modal = openModal({
    title: current.target ? t('编辑倒计时') : t('新建倒计时'),
    body,
    footer: [
      h('button', { class: 'btn', type: 'button', text: t('取消'), onclick: () => modal.close() }),
      h('button', { class: 'btn is-primary', type: 'button', text: t('保存'), onclick: save }),
    ],
  });
}

function buildCountdownCard() {
  const body = h('div', { class: 'countdown-body' });
  const edit = h('button', {
    class: 'card-action',
    type: 'button',
    title: t('编辑倒计时'),
    'aria-label': t('编辑倒计时'),
    html: svgIcon('edit', 14),
    onclick: () => editCountdown(),
  });
  const clearBtn = h('button', {
    class: 'card-action',
    type: 'button',
    title: t('清除倒计时'),
    'aria-label': t('清除倒计时'),
    html: svgIcon('close', 14),
    onclick: () => {
      store.state.countdown = { title: '', target: 0 };
      store.commit('countdown');
    },
  });

  const paint = () => {
    const countdown = store.state.countdown || { title: '', target: 0 };
    clear(body);
    card.dataset.done = '0';
    if (!countdown.target) {
      body.appendChild(
        h(
          'div',
          { class: 'empty-state' },
          h('div', { text: t('还没有倒计时') }),
          h('button', { class: 'btn is-ghost', type: 'button', text: t('设置一个'), onclick: () => editCountdown() })
        )
      );
      clearBtn.style.display = 'none';
      return;
    }
    clearBtn.style.display = '';
    const left = formatCountdown(countdown.target);
    card.dataset.done = left.done ? '1' : '0';
    body.appendChild(
      h(
        'div',
        { class: `countdown${left.done ? ' is-done' : ''}` },
        h('div', { class: 'countdown-title', text: countdown.title || t('倒计时') }),
        left.done
          ? h('div', { class: 'countdown-done', text: t('时间到了') })
          : h(
              'div',
              { class: 'countdown-grid' },
              ...[
                [left.days, '天'],
                [left.hours, '时'],
                [left.minutes, '分'],
                [left.seconds, '秒'],
              ].map(([value, unit]) =>
                h(
                  'div',
                  { class: 'countdown-cell' },
                  h('span', { class: 'countdown-value', text: String(value).padStart(2, '0') }),
                  h('span', { class: 'countdown-unit', text: t(unit) })
                )
              )
            ),
        h('div', {
          class: 'field-hint',
          text: formatDate(new Date(countdown.target), {
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }),
        })
      )
    );
  };

  const card = h(
    'div',
    { class: 'card is-countdown' },
    h(
      'div',
      { class: 'card-head' },
      h('div', { class: 'card-title' }, h('span', { html: svgIcon('timer', 14) }), h('span', { text: t('倒计时') })),
      h('div', { style: { display: 'flex', gap: '2px' } }, edit, clearBtn)
    ),
    body
  );
  card.__paint = paint;
  card.__tick = () => {
    const countdown = store.state.countdown || { target: 0 };
    if (!countdown.target) return;
    // 到期后不再每秒重绘，保持「时间到了」静态显示
    if (countdown.target <= Date.now() && card.dataset.done === '1') return;
    paint();
  };
  paint();
  return card;
}

/* --------------------------------------------------------------- 待办 */

function buildTodoCard() {
  const countBadge = h('span', { class: 'count', text: '0' });
  const title = h(
    'div',
    { class: 'card-title' },
    h('span', { html: svgIcon('list-checks', 14) }),
    h('span', { text: t('待办') }),
    countBadge
  );
  const clearBtn = h('button', {
    class: 'card-action',
    type: 'button',
    title: t('清除已完成'),
    'aria-label': t('清除已完成'),
    html: svgIcon('trash', 14),
    onclick: () => store.clearDoneTodos(),
  });

  const input = h('input', {
    type: 'text',
    placeholder: t('添加待办，回车确认'),
    maxlength: '200',
    'aria-label': t('添加待办'),
  });
  const addBtn = h('button', {
    type: 'button',
    title: t('添加'),
    'aria-label': t('添加待办'),
    html: svgIcon('plus', 14),
  });

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
  parts.todoClear = clearBtn;
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
    parts.todoCount.setAttribute('aria-label', t('{n} 项未完成', { n: pending }));
  }
  if (parts.todoClear) {
    const done = todos.filter((todo) => todo.done).length;
    parts.todoClear.disabled = done === 0;
    parts.todoClear.title = done ? t('清除已完成（{n}）', { n: done }) : t('没有已完成的待办');
    parts.todoClear.setAttribute(
      'aria-label',
      done ? t('清除已完成的 {n} 项待办', { n: done }) : t('没有已完成的待办')
    );
  }

  if (!todos.length) {
    parts.todoList.appendChild(h('div', { class: 'empty-state', text: t('还没有待办事项\n添加一条开始吧') }));
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
      'aria-label': todo.done ? t('标记未完成') : t('标记完成'),
      html: svgIcon('check', 11),
      onclick: () => store.toggleTodo(todo.id),
    });
    const text = h('div', { class: 'todo-text', text: todo.text });
    const del = h('button', {
      class: 'todo-del',
      type: 'button',
      'data-todo-action': 'delete',
      'aria-label': t('删除待办'),
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
  scheduleSidebarScrollState();
}

/* --------------------------------------------------------------- 便签 */

function buildNotesCard() {
  const status = h('span', { class: 'field-hint', style: { marginTop: '0', fontSize: '10.5px' }, text: '' });
  const title = h(
    'div',
    { class: 'card-title' },
    h('span', { html: svgIcon('note', 14) }),
    h('span', { text: t('便签') })
  );

  const area = h('textarea', {
    class: 'notes-area',
    placeholder: t('随手记点什么…'),
    maxlength: '20000',
    spellcheck: 'false',
    'aria-label': t('便签'),
  });
  area.value = store.state.notes || '';

  const markSaved = debounce(() => {
    status.textContent = t('已保存');
    setTimeout(() => {
      if (status.textContent === t('已保存')) status.textContent = '';
    }, 1600);
  }, 500);

  area.addEventListener('input', () => {
    // 立即写入状态树：即使 500ms 内关闭标签页，pagehide 的 flushNow 也能落盘
    store.setNotes(area.value);
    status.textContent = t('输入中…');
    markSaved();
  });

  const card = h(
    'div',
    { class: 'card is-notes' },
    h('div', { class: 'card-head' }, title, status),
    area
  );

  // 命令面板的「note …」、其它标签页的修改都走这里同步，避免便签区显示旧内容
  card.__syncNotes = () => {
    const next = store.state.notes || '';
    if (document.activeElement !== area && area.value !== next) area.value = next;
  };

  return card;
}

/* ----------------------------------------------------- 书签 / 常去网站 */

function buildLinksCard(kind) {
  const isBookmarks = kind === 'bookmarks';
  const titleText = isBookmarks ? t('书签') : t('常去网站');
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
          h('div', { text: t('需要授权才能读取{name}', { name: titleText }) }),
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              style: { marginTop: '10px' },
              text: t('允许访问'),
              onclick: async () => {
                const ok = await requestPermission(isBookmarks ? 'bookmarks' : 'topSites');
                if (!ok) {
                  bus.emit('toast', { text: t('未获得{name}访问权限', { name: titleText }), error: true });
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
      body.appendChild(h('div', { class: 'empty-state', text: t('暂无{name}', { name: titleText }) }));
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

/* Lumen · 天气
 *
 * 数据源：Open-Meteo（无需 API Key、跨域开放）。
 * 注意：其免费层仅供非商业用途；若将来商用需替换为 QWeather 等服务。
 */

import { setWeather } from './store.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const CACHE_MS = 20 * 60 * 1000;
let requestToken = 0;

/* ------------------------------------------------------------- 天气代码 */

const WMO = {
  0: ['晴', 'clear'],
  1: ['晴间少云', 'mostly-clear'],
  2: ['局部多云', 'partly'],
  3: ['阴', 'cloudy'],
  45: ['有雾', 'fog'],
  48: ['雾凇', 'fog'],
  51: ['小毛雨', 'drizzle'],
  53: ['毛毛雨', 'drizzle'],
  55: ['浓毛雨', 'drizzle'],
  56: ['冻毛雨', 'drizzle'],
  57: ['强冻毛雨', 'drizzle'],
  61: ['小雨', 'rain'],
  63: ['中雨', 'rain'],
  65: ['大雨', 'heavy-rain'],
  66: ['冻雨', 'rain'],
  67: ['强冻雨', 'heavy-rain'],
  71: ['小雪', 'snow'],
  73: ['中雪', 'snow'],
  75: ['大雪', 'heavy-snow'],
  77: ['雪粒', 'snow'],
  80: ['阵雨', 'rain'],
  81: ['强阵雨', 'rain'],
  82: ['暴雨', 'heavy-rain'],
  85: ['阵雪', 'snow'],
  86: ['强阵雪', 'heavy-snow'],
  95: ['雷阵雨', 'thunder'],
  96: ['雷阵雨伴冰雹', 'thunder'],
  99: ['强雷暴伴冰雹', 'thunder'],
};

const weatherEntry = (code) => (Object.hasOwn(WMO, code) ? WMO[code] : null);

export function weatherLabel(code) {
  return (weatherEntry(code) || ['未知', 'cloudy'])[0];
}

export function weatherKind(code) {
  return (weatherEntry(code) || ['未知', 'cloudy'])[1];
}

/* --------------------------------------------------------------- 图标 */

const S = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ` +
  `stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

const SUN_CORE = '<circle cx="12" cy="12" r="4.1" fill="currentColor" stroke="none"/>';
const SUN_RAYS =
  '<path d="M12 2.7v2M12 19.3v2M2.7 12h2M19.3 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>';

const CLOUD =
  '<path d="M7.2 18.4a4.05 4.05 0 0 1-.55-8.06 5.55 5.55 0 0 1 10.3-1.2 3.5 3.5 0 0 1 .35 6.96c-.16.02-.32.03-.48.03Z" fill="currentColor" fill-opacity=".14"/>';

function svgFor(kind, isDay) {
  switch (kind) {
    case 'clear':
    case 'mostly-clear':
      return isDay
        ? S(SUN_CORE + SUN_RAYS)
        : S('<path d="M20.4 14.7A8.4 8.4 0 0 1 9.3 3.6a8.5 8.5 0 1 0 11.1 11.1Z" fill="currentColor" fill-opacity=".9" stroke="none"/>');
    case 'partly':
      return isDay
        ? S(
            '<circle cx="8.6" cy="8.4" r="3.1" fill="currentColor" stroke="none"/>' +
              '<path d="M8.6 2.6v1.5M2.6 8.4H4M3.9 3.7 5 4.8M13.3 3.7 12.2 4.8" opacity=".75"/>' +
              '<path d="M9.6 18.9a3.5 3.5 0 0 1-.45-6.97 4.9 4.9 0 0 1 9.1-1.05 3.06 3.06 0 0 1 .3 6.1c-.14.01-.28.02-.42.02Z" fill="currentColor" fill-opacity=".18"/>'
          )
        : S(
            '<path d="M17.6 10.2A6.1 6.1 0 0 1 9.5 2a6.2 6.2 0 1 0 8.1 8.2Z" fill="currentColor" fill-opacity=".9" stroke="none"/>' +
              '<path d="M9.6 18.9a3.5 3.5 0 0 1-.45-6.97 4.9 4.9 0 0 1 9.1-1.05 3.06 3.06 0 0 1 .3 6.1c-.14.01-.28.02-.42.02Z" fill="currentColor" fill-opacity=".18"/>'
          );
    case 'cloudy':
      return S(
        '<path d="M6.6 19a3.9 3.9 0 0 1-.5-7.76 5.3 5.3 0 0 1 9.85-1.1A3.36 3.36 0 0 1 16.3 19Z" fill="currentColor" fill-opacity=".2"/>' +
          '<path d="M12.6 11.6a3.05 3.05 0 0 1 .4-5.98 4.15 4.15 0 0 1 7.7.86 2.63 2.63 0 0 1 .3 5.12" opacity=".55"/>'
      );
    case 'fog':
      return S(
        '<path d="M7.4 13.4a3.6 3.6 0 0 1-.46-7.16 4.9 4.9 0 0 1 9.1-1.02 3.1 3.1 0 0 1 .3 6.18" fill="currentColor" fill-opacity=".16"/>' +
          '<path d="M4 16.4h13M6.5 19.6h13M9 22.4h8" opacity=".65"/>'
      );
    case 'drizzle':
      return S(
        CLOUD +
          '<path d="M9 20.2v.9M12 20.6v.9M15 20.2v.9" opacity=".8"/>' +
          '<path d="M7.2 18.4a4.05 4.05 0 0 1-.55-8.06 5.55 5.55 0 0 1 10.3-1.2 3.5 3.5 0 0 1 .35 6.96Z"/>'
      );
    case 'rain':
      return S(
        CLOUD +
          '<path d="M8.4 19.4 7.4 22M12.4 19.4 11.4 22M16.4 19.4 15.4 22" opacity=".85"/>' +
          '<path d="M7.2 18.4a4.05 4.05 0 0 1-.55-8.06 5.55 5.55 0 0 1 10.3-1.2 3.5 3.5 0 0 1 .35 6.96Z"/>'
      );
    case 'heavy-rain':
      return S(
        CLOUD +
          '<path d="M7.2 19.2 6 22.2M10.2 19.2 9 22.2M13.2 19.2 12 22.2M16.2 19.2 15 22.2" opacity=".9"/>' +
          '<path d="M7.2 18.4a4.05 4.05 0 0 1-.55-8.06 5.55 5.55 0 0 1 10.3-1.2 3.5 3.5 0 0 1 .35 6.96Z"/>'
      );
    case 'snow':
    case 'heavy-snow':
      return S(
        CLOUD +
          '<path d="M8.4 19.6v2.4M7.3 20.8h2.2M11.9 20v2.4M10.8 21.2h2.2M15.4 19.6v2.4M14.3 20.8h2.2" opacity=".85"/>' +
          '<path d="M7.2 18.4a4.05 4.05 0 0 1-.55-8.06 5.55 5.55 0 0 1 10.3-1.2 3.5 3.5 0 0 1 .35 6.96Z"/>'
      );
    case 'thunder':
      return S(
        CLOUD +
          '<path d="m13.4 18-4 4.6h3l-1.2 3.2" opacity=".9"/>' +
          '<path d="M7.2 18.4a4.05 4.05 0 0 1-.55-8.06 5.55 5.55 0 0 1 10.3-1.2 3.5 3.5 0 0 1 .35 6.96Z"/>'
      );
    default:
      return S(CLOUD);
  }
}

export function weatherIconMarkup(code, isDay = true, size = 24) {
  const kind = weatherKind(code);
  return svgFor(kind, isDay).replace('<svg ', `<svg width="${size}" height="${size}" class="weather-glyph" `);
}

export function weatherIconInline(code, isDay = true, size = 22) {
  const kind = weatherKind(code);
  return svgFor(kind, isDay)
    .replace('<svg ', `<svg width="${size}" height="${size}" `)
    .replace('class="', 'style="');
}

/* ------------------------------------------------------------------ 获取 */

export async function refreshWeather(state, { force = false } = {}) {
  const weather = state.weather;
  const lat = Number(weather.lat);
  const lon = Number(weather.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  // 命中缓存时不要递增 token：否则会把正在进行中的手动刷新结果作废
  if (!force && weather.cache && Date.now() - weather.updatedAt < CACHE_MS) return weather.cache;
  const token = ++requestToken;
  const stillCurrent = () =>
    token === requestToken &&
    Number(state.weather.lat) === lat &&
    Number(state.weather.lon) === lon;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '5',
  });

  try {
    const response = await fetch(`${FORECAST_URL}?${params.toString()}`, { credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!stillCurrent()) return state.weather.cache || null;

    const cache = {
      temp: Math.round(data.current?.temperature_2m ?? 0),
      feels: Math.round(data.current?.apparent_temperature ?? 0),
      humidity: Math.round(data.current?.relative_humidity_2m ?? 0),
      wind: Math.round(data.current?.wind_speed_10m ?? 0),
      code: data.current?.weather_code ?? 0,
      isDay: data.current?.is_day !== 0,
      days: (Array.isArray(data.daily?.time) ? data.daily.time : []).map((iso, index) => ({
        iso,
        code: Array.isArray(data.daily?.weather_code) ? data.daily.weather_code[index] ?? 0 : 0,
        max: Math.round(
          (Array.isArray(data.daily?.temperature_2m_max) ? data.daily.temperature_2m_max[index] : 0) ?? 0
        ),
        min: Math.round(
          (Array.isArray(data.daily?.temperature_2m_min) ? data.daily.temperature_2m_min[index] : 0) ?? 0
        ),
      })),
    };

    setWeather({ cache, updatedAt: Date.now(), error: '' });
    return cache;
  } catch (err) {
    console.warn('[lumen/weather] 获取失败', err);
    if (stillCurrent()) setWeather({ error: String(err.message || err).slice(0, 200) });
    return state.weather.cache || null;
  }
}

/* -------------------------------------------------------------- 城市搜索 */

export async function searchCity(query) {
  const keyword = String(query || '').trim();
  if (!keyword) return [];
  const params = new URLSearchParams({
    name: keyword,
    count: '6',
    language: 'zh',
    format: 'json',
  });
  try {
    const response = await fetch(`${GEO_URL}?${params.toString()}`, { credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return (Array.isArray(data.results) ? data.results : [])
      .map((row) => {
        if (!row || typeof row.name !== 'string' || !row.name.trim()) return null;
        const lat = Number(row.latitude);
        const lon = Number(row.longitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
        return {
          name: row.name.trim().slice(0, 40),
          region: [row.admin1, row.country].filter((part) => typeof part === 'string' && part).join(' · ').slice(0, 80),
          lat,
          lon,
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.warn('[lumen/weather] 城市搜索失败', err);
    return [];
  }
}

/** 常用城市快捷键 */
export const HOT_CITIES = [
  { name: '北京', lat: 39.9042, lon: 116.4074 },
  { name: '上海', lat: 31.2304, lon: 121.4737 },
  { name: '广州', lat: 23.1291, lon: 113.2644 },
  { name: '深圳', lat: 22.5431, lon: 114.0579 },
  { name: '杭州', lat: 30.2741, lon: 120.1551 },
  { name: '成都', lat: 30.5728, lon: 104.0668 },
  { name: '武汉', lat: 30.5928, lon: 114.3055 },
  { name: '西安', lat: 34.3416, lon: 108.9398 },
  { name: '南京', lat: 32.0603, lon: 118.7969 },
  { name: '重庆', lat: 29.563, lon: 106.5516 },
];

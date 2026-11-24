/* Serein · 国际化
 *
 * 词条键就是中文原文：调用处写 t('天气')，英文词典负责翻译。
 * 这样不需要给上千条 UI 文案另起一套键名，漏翻时也能直接在界面上看出来。
 *
 * - t() 支持 {name} 占位符；英文词典的值可以是字符串，也可以是 (params) => string，
 *   后者用于单复数这类中文不区分、英文要区分的句子。
 * - 切换语言不刷新页面：setLocale() 更新 <html lang> 后通知订阅者重绘。
 * - 英文词典缺失的词条会记录在 missingI18nKeys() 里，测试据此拦截漏翻。
 */

import { EN } from './locales/en.js';

export const SUPPORTED_LOCALES = ['zh-CN', 'en'];

/** 语言偏好：auto 跟随浏览器，其余为明确选择 */
export const LANGUAGE_PREFERENCES = ['auto', 'zh-CN', 'en'];

const ZH_LANGUAGE = /^zh($|-)/i;

let current = 'zh-CN';
const listeners = new Set();
const missing = new Set();

function normalizeLocale(value) {
  return value === 'en' || value === 'zh-CN' ? value : '';
}

function browserLocales() {
  const list = Array.isArray(navigator?.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator?.language || ''];
  return list.filter((item) => typeof item === 'string' && item);
}

/** 把配置里的 auto/zh-CN/en 解析成实际语言 */
export function resolveLocale(preference = 'auto') {
  if (preference === 'en') return 'en';
  if (preference === 'zh-CN') return 'zh-CN';
  const langs = browserLocales();
  if (!langs.length) return 'zh-CN';
  // 繁体用户也先给简体：目前只有一套中文文案，总比英文更接近
  return langs.some((lang) => ZH_LANGUAGE.test(lang)) ? 'zh-CN' : 'en';
}

export const getLocale = () => current;
export const isEnglish = () => current === 'en';
/** 与当前语言匹配的 Intl 区域标签 */
export const intlLocale = () => (current === 'en' ? 'en-US' : 'zh-CN');

function interpolate(text, params) {
  if (!params) return text;
  return String(text).replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(params, key) ? String(params[key]) : match
  );
}

/** 记录漏翻词条：同一条只记一次，避免高频重绘把集合撑爆；纯 ASCII 键（权限名、域名）不需要翻译 */
function recordMissing(key) {
  if (!/[\u4e00-\u9fff]/.test(key)) return;
  if (!EN || !Object.hasOwn(EN, key)) missing.add(key);
}

/**
 * 翻译一条界面文案。
 * @param {string} key 中文原文（同时是词典键）
 * @param {Record<string, unknown>} [params] 占位符参数
 */
export function t(key, params) {
  if (typeof key !== 'string' || !key) return key;
  if (current !== 'en') return interpolate(key, params);
  if (!EN || !Object.hasOwn(EN, key)) {
    recordMissing(key);
    return interpolate(key, params);
  }
  const value = EN[key];
  if (typeof value === 'function') {
    try {
      return String(value(params || {}));
    } catch (err) {
      console.warn('[serein/i18n] 词条函数异常：', key, err);
      return interpolate(key, params);
    }
  }
  return interpolate(value, params);
}

/** 英文单复数：t() 的词典函数里用 */
export const plural = (count, one, other) => (Math.abs(Number(count)) === 1 ? one : other);

/** 仅用于测试/诊断：当前语言下所有缺失的英文词条 */
export const missingI18nKeys = () => [...missing];
export const clearMissingI18nKeys = () => missing.clear();

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyDocumentLocale() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = current;
  root.dataset.locale = current;
}

/** 切换语言并通知所有订阅者；语言不变时不触发重绘 */
export function setLocale(locale) {
  const next = normalizeLocale(locale);
  if (!next) return current;
  const changed = next !== current;
  current = next;
  applyDocumentLocale();
  if (!changed) return current;
  for (const fn of Array.from(listeners)) {
    try {
      fn(current);
    } catch (err) {
      console.error('[serein/i18n] 语言订阅者异常', err);
    }
  }
  return current;
}

/* ------------------------------------------------------------- Intl 辅助 */

export function formatDate(date, options) {
  try {
    return new Intl.DateTimeFormat(intlLocale(), options).format(date);
  } catch {
    return String(date);
  }
}

export function formatNumber(value, options) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  try {
    return new Intl.NumberFormat(intlLocale(), options).format(number);
  } catch {
    return String(number);
  }
}

/** 英文展示用：中文城市名到英文名的兜底查找由 city-search.js 负责 */
export function pickLocalized(locale, zh, en) {
  if (locale === 'en') return en || zh || '';
  return zh || en || '';
}

// 模块加载时先按浏览器语言落一次，保证 SSR/首个同步渲染也有正确方向。
applyDocumentLocale();
current = resolveLocale('auto');
applyDocumentLocale();

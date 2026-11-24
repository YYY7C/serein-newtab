/* Serein · 本地城市索引
 *
 * Open-Meteo 的地理编码只认拼音/英文主名：直接搜「厦门」会返回空。
 * 这里先用随扩展打包的中文城市库匹配（中文、繁体、别名、拼音、英文），
 * 命中后不再发网络请求；只有本地没有结果时才回落到远程搜索。
 *
 * 数据在第一次搜索时才动态加载，不影响新标签页的启动解析量。
 */

import { isEnglish } from './i18n.js';

const CJK = /[\u3400-\u9fff]/;
const SUFFIX =
  /(特别行政区|自治区|自治州|自治县|自治旗|特别市|地区|新区|林区|矿区|市辖区|街道|办事处|镇|乡|县|区|市|旗|盟)$/u;
/* CITY_ROWS 的拼音字段前两位固定是 GeoNames 主名 / ASCII 名，
   之后才是中文名读音；排序时前两位的可信度更高。 */

let rowsPromise = null;

function loadRows() {
  rowsPromise ||= import('./city-data.js')
    .then((module) => module.CITY_ROWS)
    .catch((err) => {
      console.warn('[serein/city] 城市库加载失败', err);
      return [];
    });
  return rowsPromise;
}

export const hasCjk = (value) => CJK.test(String(value || ''));

/** 中文去掉行政后缀；拉丁字母去掉空格、重音和标点 */
export function normalizeCityQuery(value) {
  const raw = String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  if (CJK.test(raw)) {
    const compact = raw.replace(/\s+/g, '');
    return compact.replace(SUFFIX, '') || compact;
  }
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

function scoreText(text, query) {
  if (!text) return 0;
  if (text === query) return 1000;
  if (text.startsWith(query)) return 700;
  if (text.includes(query)) return 320;
  return 0;
}

function scorePinyin(text, query, index) {
  if (!text) return 0;
  // 前两个是 GeoNames 主名/ASCII 名，可信度最高；后面是中文名读音，
  // 用来支持「dongjing」这类拼音查询，但排序要让位给真正的英文名。
  const primary = index < 2;
  if (text === query) return primary ? 1000 : 700;
  if (text.startsWith(query)) return primary ? 620 : 420;
  // 短查询不做子串匹配：HK 会命中 tas-hk-ent / bis-hk-ek
  if (query.length >= 4 && text.includes(query)) return primary ? 260 : 170;
  return 0;
}

function localizedRow(row) {
  const nameZh = row[0];
  const regionZh = row[1] || '';
  const nameEn = row[8] || nameZh;
  const regionEn = row[9] || regionZh;
  const english = isEnglish();
  return {
    name: english ? nameEn : nameZh,
    region: english ? regionEn : regionZh,
    // 两个名字都给调用方：天气状态需要同时保存，切换语言后不用重新选城市
    nameZh,
    nameEn,
    regionZh,
    regionEn,
    lat: Number(row[4]),
    lon: Number(row[5]),
  };
}

/**
 * 在本地城市库里搜索，按「精确程度 + 城市规模」排序。
 * 返回 { name, region, lat, lon } 与中英文规范名，供天气状态保存。
 */
export async function searchLocalCities(query, limit = 8) {
  const keyword = normalizeCityQuery(query);
  if (!keyword) return [];
  const cjkQuery = hasCjk(keyword);
  // 一两个字母会命中太多无关城市，等用户多打一个字符再搜
  if (!cjkQuery && keyword.length < 3) return [];

  const rows = await loadRows();
  if (!rows.length) return [];
  const matches = [];
  const seen = new Set();

  for (const row of rows) {
    const name = row[0];
    const region = row[1] || '';
    const aliases = row[2] ? row[2].split(',') : [];
    const pinyins = row[3] ? row[3].split(',') : [];
    const lat = Number(row[4]);
    const lon = Number(row[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    let score = 0;
    if (cjkQuery) {
      score = scoreText(name, keyword);
      if (!score || score < 1000) {
        for (const alias of aliases) {
          score = Math.max(score, scoreText(alias, keyword) - 100);
          if (score >= 1000) break;
        }
      }
    } else {
      for (let index = 0; index < pinyins.length; index += 1) {
        score = Math.max(score, scorePinyin(pinyins[index], keyword, index));
        if (score >= 1000) break;
      }
    }
    if (!score) continue;

    const key = `${name}|${region}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const population = Number(row[6]) || 0;
    const rank = Number(row[7]);
    const weight = Math.log10(Math.max(1, population)) * 8 + (rank <= 1 ? 24 : rank === 2 ? 10 : 0);
    matches.push({ row, score: score + weight });
  }

  matches.sort(
    (a, b) =>
      b.score - a.score ||
      (isEnglish() ? a.row[8].localeCompare(b.row[8]) : a.row[0].localeCompare(b.row[0], 'zh'))
  );
  return matches.slice(0, limit).map(({ row }) => localizedRow(row));
}

/**
 * 用已保存的中文城市名查英文名。老数据只有 city 字段，
 * 英文界面下靠它把「上海」显示成「Shanghai」，查到后由调用方缓存。
 */
export async function lookupCityNames(query) {
  const needle = String(query || '').trim();
  if (!needle) return null;
  const rows = await loadRows();
  const row =
    rows.find((item) => item[0] === needle) ||
    rows.find((item) => item[2] && item[2].split(',').includes(needle));
  return row ? localizedRow(row) : null;
}

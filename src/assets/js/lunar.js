/* Serein · 农历
 *
 * 纯前端、零依赖。核心是 1900–2100 的农历年编码表：
 *   位 0x0f        —— 闰月月份（0 表示无闰月）
 *   位 0x10000     —— 闰月是大月(30) 还是小月(29)
 *   位 0x8000..0x10 —— 正月到十二月各月是大月(1)还是小月(0)
 *
 * 为规避表格录入错误导致显示错误日期，模块初始化时会用一组已知春节日期做
 * 反向校验；校验失败则整体降级（隐藏农历），绝不输出可疑结果。
 */

const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6, // 1970-1979
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
  0x0d520, // 2100
];

const MIN_YEAR = 1900;
const MAX_YEAR = 2050;
const BASE_UTC = Date.UTC(1900, 0, 31); // 1900-01-31 = 农历 1900 年正月初一
const DAY_MS = 86400000;

const MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

const info = (year) => LUNAR_INFO[year - MIN_YEAR] ?? 0;
const leapMonth = (year) => info(year) & 0xf;
const leapDays = (year) => (leapMonth(year) ? (info(year) & 0x10000 ? 30 : 29) : 0);
const monthDays = (year, month) => (info(year) & (0x10000 >> month) ? 30 : 29);

function yearDays(year) {
  let sum = 348; // 12 * 29
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) if (info(year) & bit) sum += 1;
  return sum + leapDays(year);
}

/* ---------------------------------------------------------------- 转换 */

/** 公历 Date -> 农历 {year, month, day, isLeap} */
export function solarToLunar(date) {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  let offset = Math.floor((utc - BASE_UTC) / DAY_MS);
  if (offset < 0) return null;

  let year = MIN_YEAR;
  let span = 0;
  for (; year <= MAX_YEAR; year += 1) {
    span = yearDays(year);
    if (offset < span) break;
    offset -= span;
  }
  if (year > MAX_YEAR) return null;

  const leap = leapMonth(year);

  // 正月 -> 腊月，闰月插在对应月份之后
  const monthSeq = [];
  for (let m = 1; m <= 12; m += 1) {
    monthSeq.push({ month: m, isLeap: false, days: monthDays(year, m) });
    if (leap === m) monthSeq.push({ month: m, isLeap: true, days: leapDays(year) });
  }

  for (const entry of monthSeq) {
    if (offset < entry.days) {
      return { year, month: entry.month, day: offset + 1, isLeap: entry.isLeap, daysInMonth: entry.days };
    }
    offset -= entry.days;
  }
  return null;
}

/** 农历 -> 公历 Date（用于节日倒计时等场景） */
export function lunarToSolar(lunarYear, lunarMonth, lunarDay, isLeap = false) {
  let offset = 0;
  for (let y = MIN_YEAR; y < lunarYear; y += 1) offset += yearDays(y);

  const leap = leapMonth(lunarYear);
  for (let m = 1; m < lunarMonth; m += 1) {
    offset += monthDays(lunarYear, m);
    if (leap === m) offset += leapDays(lunarYear);
  }
  if (isLeap && leap === lunarMonth) offset += monthDays(lunarYear, lunarMonth);
  offset += lunarDay - 1;

  return new Date(BASE_UTC + offset * DAY_MS);
}

/* ------------------------------------------------------------ 自校验 */

const KNOWN_NEW_YEARS = {
  2000: '2000-02-05',
  2010: '2010-02-14',
  2020: '2020-01-25',
  2021: '2021-02-12',
  2022: '2022-02-01',
  2023: '2023-01-22',
  2024: '2024-02-10',
  2025: '2025-01-29',
  2026: '2026-02-17',
  2027: '2027-02-06',
  2028: '2028-01-26',
  2029: '2029-02-13',
  2030: '2030-02-03',
  2031: '2031-01-23',
  2032: '2032-02-11',
  2033: '2033-01-31',
  2034: '2034-02-19',
  2035: '2035-02-08',
};

function selfTest() {
  for (const [year, iso] of Object.entries(KNOWN_NEW_YEARS)) {
    const computed = lunarToSolar(Number(year), 1, 1);
    if (!computed) return false;
    const [y, m, d] = iso.split('-').map(Number);
    if (
      computed.getUTCFullYear() !== y ||
      computed.getUTCMonth() !== m - 1 ||
      computed.getUTCDate() !== d
    ) {
      console.warn('[serein/lunar] 农历表校验未通过，年份：', year, computed.toISOString().slice(0, 10), iso);
      return false;
    }
  }
  return true;
}

export const LUNAR_OK = selfTest();

/* -------------------------------------------------------------- 文本化 */

export function ganZhiYear(lunarYear) {
  const index = (lunarYear - 4) % 60;
  return TIANGAN[index % 10] + DIZHI[index % 12];
}

export function zodiacOf(lunarYear) {
  return ZODIAC[(lunarYear - 4) % 12];
}

export function lunarDayText(day) {
  return DAY_NAMES[day - 1] || String(day);
}

export function lunarMonthText(month, isLeap) {
  return (isLeap ? '闰' : '') + MONTH_NAMES[month - 1] + '月';
}

/* ---------------------------------------------------------------- 节日 */

const SOLAR_FESTIVALS = {
  '1-1': '元旦',
  '2-14': '情人节',
  '3-8': '妇女节',
  '3-12': '植树节',
  '4-1': '愚人节',
  '5-1': '劳动节',
  '5-4': '青年节',
  '6-1': '儿童节',
  '7-1': '建党节',
  '8-1': '建军节',
  '9-10': '教师节',
  '10-1': '国庆节',
  '12-24': '平安夜',
  '12-25': '圣诞节',
};

const LUNAR_FESTIVALS = {
  '1-1': '春节',
  '1-15': '元宵节',
  '2-2': '龙抬头',
  '5-5': '端午节',
  '7-7': '七夕',
  '7-15': '中元节',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八节',
};

/** 当天命中的节日名（公历优先，其次农历；除夕单独处理） */
export function festivalOf(date) {
  const solarKey = `${date.getMonth() + 1}-${date.getDate()}`;
  if (SOLAR_FESTIVALS[solarKey]) return SOLAR_FESTIVALS[solarKey];

  const lunar = solarToLunar(date);
  if (!lunar || lunar.isLeap) return '';

  // 除夕：下一天是正月初一
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const nextLunar = solarToLunar(tomorrow);
  if (nextLunar && nextLunar.month === 1 && nextLunar.day === 1) return '除夕';

  return LUNAR_FESTIVALS[`${lunar.month}-${lunar.day}`] || '';
}

/* ---------------------------------------------------------------- 输出 */

/**
 * 返回当天完整的农历描述。
 * @returns {{text: string, festival: string, ganZhi: string, zodiac: string} | null}
 */
export function describeDate(date = new Date()) {
  if (!LUNAR_OK) {
    return { text: '', festival: festivalOf(date), ganZhi: '', zodiac: '' };
  }
  const lunar = solarToLunar(date);
  if (!lunar) return null;

  const festival = festivalOf(date);
  const dayLabel = lunar.day === 1 ? lunarMonthText(lunar.month, lunar.isLeap) : lunarDayText(lunar.day);

  return {
    lunar,
    festival,
    ganZhi: ganZhiYear(lunar.year),
    zodiac: zodiacOf(lunar.year),
    text: `农历${lunarMonthText(lunar.month, lunar.isLeap)}${lunarDayText(lunar.day)}`,
    monthText: lunarMonthText(lunar.month, lunar.isLeap),
    dayText: dayLabel,
  };
}

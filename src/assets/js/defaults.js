/* Serein · 默认状态与常量
 * 数据模型一旦确定，其余模块只读它 + 通过 store 修改它。
 */

import { uid, normalizeUrl, isUsableUrl, isSafeImageUrl } from './util.js';

export const APP = {
  name: 'Serein',
  subtitle: '新标签页',
  version: '1.5.1',
  schema: 1,
};

/**
 * 默认值版本。默认网格或默认遮罩强度发生需要迁移的变化时 +1：
 * v2 把默认图标从 60px 放大到 72px、间距从 20px 放宽到 28px；
 * v3 把默认间距再从 28px 放宽到 36px，缓解图标之间的拥挤感；
 * v4 把默认间距从 36px 放宽到 48px，不再要求列数/图标大小也停在旧默认值；
 * v5 把材质型风格（暗色 / 白纸）的默认遮罩从 80% / 75% 调到 45%。
 */
const DEFAULTS_VERSION = 5;

/** 历史出现过的默认间距：迁移时只要还停在这些值上，就说明用户没自己调过 */
const LEGACY_GAPS = new Set([20, 28, 36]);
const DEFAULT_GAP = 48;
/** 行距默认比列距紧一点：标签本身已占掉一段纵向留白，两者视觉上才等距 */
const DEFAULT_GAP_Y = 43;

/* --------------------------------------------------------------- 壁纸预设 */

/**
 * 纯 CSS 渐变壁纸：无需网络、无版权风险、任何分辨率都不糊。
 * tone 决定默认文字色（dark = 浅色字，light = 深色字）。
 */
export const GRADIENTS = [
  {
    id: 'aurora',
    name: '极光',
    tone: 'dark',
    css:
      'radial-gradient(1100px 780px at 8% 6%, rgba(64,120,255,.55) 0%, rgba(64,120,255,0) 62%),' +
      'radial-gradient(980px 720px at 88% 12%, rgba(150,80,255,.48) 0%, rgba(150,80,255,0) 60%),' +
      'radial-gradient(1200px 900px at 72% 96%, rgba(0,190,170,.38) 0%, rgba(0,190,170,0) 62%),' +
      'linear-gradient(158deg, #060a16 0%, #0a1024 42%, #0b1526 100%)',
  },
  {
    id: 'dusk',
    name: '暮色',
    tone: 'dark',
    css:
      'radial-gradient(1000px 760px at 10% 90%, rgba(255,120,90,.42) 0%, rgba(255,120,90,0) 60%),' +
      'radial-gradient(1100px 800px at 84% 8%, rgba(140,70,220,.55) 0%, rgba(140,70,220,0) 62%),' +
      'radial-gradient(900px 700px at 55% 45%, rgba(255,80,140,.16) 0%, rgba(255,80,140,0) 60%),' +
      'linear-gradient(155deg, #170a24 0%, #241031 40%, #2b1226 72%, #190c1a 100%)',
  },
  {
    id: 'ocean',
    name: '深海',
    tone: 'dark',
    css:
      'radial-gradient(1000px 700px at 18% 12%, rgba(0,168,224,.42) 0%, rgba(0,168,224,0) 60%),' +
      'radial-gradient(980px 900px at 86% 88%, rgba(0,86,180,.55) 0%, rgba(0,86,180,0) 62%),' +
      'linear-gradient(160deg, #03101a 0%, #061a2c 45%, #03101c 100%)',
  },
  {
    id: 'cosmos',
    name: '星河',
    tone: 'dark',
    css:
      'radial-gradient(900px 700px at 24% 20%, rgba(92,80,224,.42) 0%, rgba(92,80,224,0) 60%),' +
      'radial-gradient(1000px 800px at 80% 82%, rgba(28,90,184,.38) 0%, rgba(28,90,184,0) 62%),' +
      'radial-gradient(600px 600px at 62% 44%, rgba(200,100,255,.16) 0%, rgba(200,100,255,0) 60%),' +
      'linear-gradient(160deg, #04050c 0%, #080a18 50%, #04060f 100%)',
  },
  {
    id: 'graphite',
    name: '墨玉',
    tone: 'dark',
    css:
      'radial-gradient(1000px 720px at 14% 10%, rgba(122,142,182,.26) 0%, rgba(122,142,182,0) 60%),' +
      'radial-gradient(920px 820px at 90% 92%, rgba(70,80,112,.34) 0%, rgba(70,80,112,0) 62%),' +
      'linear-gradient(160deg, #0d0f14 0%, #151821 48%, #0a0c11 100%)',
  },
  {
    id: 'ember',
    name: '余烬',
    tone: 'dark',
    css:
      'radial-gradient(1000px 760px at 16% 90%, rgba(255,110,50,.40) 0%, rgba(255,110,50,0) 60%),' +
      'radial-gradient(900px 700px at 86% 12%, rgba(200,40,80,.32) 0%, rgba(200,40,80,0) 62%),' +
      'linear-gradient(158deg, #150a08 0%, #24100c 50%, #140a0a 100%)',
  },
  {
    id: 'mint',
    name: '薄荷',
    tone: 'light',
    css:
      'radial-gradient(900px 700px at 10% 10%, rgba(110,235,196,.72) 0%, rgba(110,235,196,0) 62%),' +
      'radial-gradient(900px 800px at 90% 6%, rgba(158,200,255,.66) 0%, rgba(158,200,255,0) 60%),' +
      'radial-gradient(1000px 900px at 68% 96%, rgba(198,255,220,.8) 0%, rgba(198,255,220,0) 64%),' +
      'linear-gradient(160deg, #eefaf4 0%, #e6f4fb 50%, #f2fbf6 100%)',
  },
  {
    id: 'peach',
    name: '蜜桃',
    tone: 'light',
    css:
      'radial-gradient(900px 720px at 12% 88%, rgba(255,186,152,.85) 0%, rgba(255,186,152,0) 62%),' +
      'radial-gradient(900px 700px at 86% 10%, rgba(255,168,200,.7) 0%, rgba(255,168,200,0) 60%),' +
      'linear-gradient(160deg, #fff7f2 0%, #ffeff3 52%, #fff4ed 100%)',
  },
  {
    id: 'sand',
    name: '沙丘',
    tone: 'light',
    css:
      'radial-gradient(900px 700px at 18% 12%, rgba(255,232,182,.92) 0%, rgba(255,232,182,0) 62%),' +
      'radial-gradient(900px 800px at 86% 90%, rgba(206,220,255,.62) 0%, rgba(206,220,255,0) 62%),' +
      'linear-gradient(160deg, #fdf8ef 0%, #f6f1e7 55%, #fbf6ee 100%)',
  },
  {
    id: 'blossom',
    name: '樱雾',
    tone: 'light',
    css:
      'radial-gradient(900px 700px at 16% 10%, rgba(228,198,255,.85) 0%, rgba(228,198,255,0) 62%),' +
      'radial-gradient(900px 800px at 84% 90%, rgba(255,198,224,.8) 0%, rgba(255,198,224,0) 62%),' +
      'linear-gradient(160deg, #faf6ff 0%, #fdf3f9 55%, #f7f4ff 100%)',
  },
];

export const gradientById = (id) => GRADIENTS.find((g) => g.id === id) || GRADIENTS[0];

/* ------------------------------------------------------------- 视觉风格 */

/**
 * 六套表层语言。切风格会同时切换推荐强调色，之后仍可单独改。
 * thumb 用于设置页的迷你预览。
 */
export const STYLES = [
  {
    id: 'glass',
    name: '轻玻璃',
    form: 'grid',
    desc: '渐变壁纸 + 毛玻璃。壁纸完全可见，是最「现代」的一套。',
    accent: '#6c8cff',
    thumb: 'linear-gradient(150deg, #0a1024 0%, #1d2a58 48%, #0d5a52 100%)',
    tone: 'dark',
  },
  {
    id: 'noir',
    name: '暗色材质',
    form: 'grid',
    desc: '纯色深底 + 上打光。去掉模糊与光晕，图标底色压成深色调。',
    accent: '#7c8cff',
    thumb: 'linear-gradient(180deg, #17191d 0%, #101215 100%)',
    tone: 'dark',
  },
  {
    id: 'paper',
    name: '白纸',
    form: 'grid',
    desc: '暗色材质的纸面版：暖白底、发丝线、纸纹颗粒，数字改用衬线。',
    accent: '#b4552d',
    thumb: 'linear-gradient(180deg, #fdfbf6 0%, #eae4d8 100%)',
    tone: 'light',
  },
  {
    id: 'native',
    name: '原色',
    form: 'grid',
    desc: '壁纸按原样铺满，图标还原品牌色，文字对比随壁纸自动切换。',
    accent: '#3e7bfa',
    thumb: 'linear-gradient(140deg, #8fb6c8 0%, #4d7264 46%, #16241f 100%)',
    tone: 'auto',
  },
  {
    id: 'editorial',
    name: '编辑排版',
    form: 'list',
    desc: '纸色底 + 衬线数字 + 文字目录。最不像模板的一套。',
    accent: '#b33a2b',
    thumb: 'linear-gradient(180deg, #f6f2ea 0%, #e9e3d7 100%)',
    tone: 'light',
  },
  {
    id: 'terminal',
    name: '终端',
    form: 'list',
    desc: '等宽字体、直角、编号行。工具感最强。',
    accent: '#7ee787',
    thumb: 'linear-gradient(180deg, #0c0d10 0%, #060709 100%)',
    tone: 'dark',
  },
];

export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];

/* --------------------------------------------------------------- 搜索引擎 */

export const ENGINES = [
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s', color: '#2932E1', letter: '百', suggest: 'baidu' },
  { id: 'bing', name: '必应', url: 'https://cn.bing.com/search?q=%s', color: '#0C8484', letter: '必', suggest: 'bing' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', color: '#4285F4', letter: 'G', suggest: 'google' },
  { id: 'so360', name: '360 搜索', url: 'https://www.so.com/s?q=%s', color: '#19B955', letter: '360', suggest: '360' },
  { id: 'sogou', name: '搜狗', url: 'https://www.sogou.com/web?query=%s', color: '#FB6022', letter: '搜', suggest: null },
  { id: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', color: '#DE5833', letter: 'D', suggest: 'duckduckgo' },
  { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com/search?type=content&q=%s', color: '#0084FF', letter: '知', suggest: null },
  { id: 'bilibili', name: '哔哩哔哩', url: 'https://search.bilibili.com/all?keyword=%s', color: '#FB7299', letter: '哔', suggest: 'bilibili' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=%s', color: '#24292F', letter: 'G', suggest: null },
];

export const WALLPAPER_POOL_LIMIT = 20;
export const WALLPAPER_ROTATIONS = ['off', 'newtab', 'hour', 'day'];

export const CUSTOM_ENGINE_LIMIT = 12;
export const CUSTOM_ENGINE_NAME_MAX = 24;
export const CUSTOM_ENGINE_URL_MAX = 500;

const CUSTOM_ENGINE_COLORS = [
  '#6c8cff', '#7c5cff', '#a855f7', '#ec4899', '#f43f5e',
  '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#0ea5e9',
];

/** 内置引擎 id 固定，导入的备份不能借此覆盖内置项 */
export const isBuiltinEngine = (id) => ENGINES.some((engine) => engine.id === id);

export const customEngines = (config) =>
  Array.isArray(config?.search?.engines) ? config.search.engines : [];

export const enginesFor = (config) => [...ENGINES, ...customEngines(config)];

export const engineById = (id, config) =>
  enginesFor(config).find((engine) => engine.id === id) || ENGINES[0];

/**
 * 校验并清洗用户自定义的搜索引擎。
 * 地址必须是 http(s) 完整 URL 且含 %s 占位符；id 固定为 custom-*，避免冒充内置项。
 */
export function sanitizeCustomEngine(input) {
  if (!input || typeof input !== 'object') return null;
  const name = String(input.name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, CUSTOM_ENGINE_NAME_MAX);
  const rawUrl = String(input.url ?? '').trim().slice(0, CUSTOM_ENGINE_URL_MAX);
  if (!name || !rawUrl.includes('%s')) return null;
  const url = normalizeUrl(rawUrl);
  if (!/^https?:\/\//i.test(url) || !isUsableUrl(url)) return null;

  const id =
    typeof input.id === 'string' && /^custom-[a-z0-9-]{1,40}$/.test(input.id)
      ? input.id
      : `custom-${uid()}`;
  const color =
    CUSTOM_ENGINE_COLORS[
      Array.from(name).reduce((sum, char) => sum + (char.codePointAt(0) || 0), 0) % CUSTOM_ENGINE_COLORS.length
    ];

  return {
    id,
    name,
    url,
    custom: true,
    color,
    letter: Array.from(name)[0].toUpperCase(),
    suggest: null,
  };
}

/** 最近搜索最多留几条、单条最长多少字符（联想面板与配置迁移共用） */
export const RECENT_SEARCH_LIMIT = 8;
export const RECENT_SEARCH_MAX_LENGTH = 100;

/* ------------------------------------------------------------- 默认快捷方式 */

const SEED_SHORTCUTS = [
  { title: '百度', url: 'https://www.baidu.com/' },
  { title: '哔哩哔哩', url: 'https://www.bilibili.com/' },
  { title: '知乎', url: 'https://www.zhihu.com/' },
  { title: '微博', url: 'https://weibo.com/' },
  { title: '淘宝', url: 'https://www.taobao.com/' },
  { title: '京东', url: 'https://www.jd.com/' },
  { title: 'GitHub', url: 'https://github.com/' },
  { title: 'YouTube', url: 'https://www.youtube.com/' },
  { title: '小红书', url: 'https://www.xiaohongshu.com/' },
  { title: '豆瓣', url: 'https://www.douban.com/' },
  { title: '少数派', url: 'https://sspai.com/' },
];

const SEED_FOLDER_ITEMS = [
  { title: '语雀', url: 'https://www.yuque.com/' },
  { title: 'Notion', url: 'https://www.notion.so/' },
  { title: '飞书', url: 'https://www.feishu.cn/' },
  { title: 'DeepSeek', url: 'https://chat.deepseek.com/' },
];

const seedId = (key) => `seed-${key}`;

/* ------------------------------------------------------------------ 工厂 */

export function createDefaultState() {
  const folderId = 'seed-folder-tools';

  const shortcuts = SEED_SHORTCUTS.map((item, index) => ({
    id: seedId(`s${index}`),
    title: item.title,
    url: item.url,
    iconType: 'auto',
    iconValue: '',
    groupId: null,
    order: index * 10,
    createdAt: Date.now() + index,
  }));

  const folderItems = SEED_FOLDER_ITEMS.map((item, index) => ({
    id: seedId(`f${index}`),
    title: item.title,
    url: item.url,
    iconType: 'auto',
    iconValue: '',
    groupId: folderId,
    order: index * 10,
    createdAt: Date.now() + index,
  }));

  return {
    meta: {
      schema: APP.schema,
      defaultsVersion: DEFAULTS_VERSION,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      /** 单调递增的写入版本：多标签页并发时用来判断谁更新 */
      rev: 0,
      /** 检测到的并发写入次数（仅诊断用） */
      conflict: 0,
      /** 首次启动引导是否已完成 */
      onboarded: false,
      seeded: true,
    },
    config: {
      theme: 'auto',
      style: 'noir',
      accent: '#7c8cff',
      glass: 18,
      radius: 22,
      animations: true,
      performance: false,
      fontScale: 1,
      /** 用户自定义 CSS：落盘时保留原文，应用前统一清洗 @import 等 */
      customCss: '',
      /** 自定义字体：{ id, name }，文件存 IndexedDB 的 font:<id> */
      customFont: { id: '', name: '' },

      background: {
        type: 'gradient',
        gradient: 'aurora',
        url: '',
        fileId: '',
        color: '#0a1024',
        bing: { idx: 0, date: '', url: '', copyright: '' },
        blur: 0,
        brightness: 100,
        saturate: 100,
        /** 每种风格各自的遮罩强度（0–100），缺省时用该风格的预设值 */
        veilByStyle: {},
        vignette: true,
        tone: 'auto',
        /** 本地壁纸池：[{ id, name, addedAt }]，最多 20 张 */
        pool: [],
        /** 轮换时机：off / newtab / hour / day */
        rotation: 'off',
        rotatedAt: 0,
      },

      layout: {
        columns: 6,
        iconSize: 72,
        gap: DEFAULT_GAP,
        gapY: DEFAULT_GAP_Y,
        showClock: true,
        clock24: true,
        showSeconds: false,
        showDate: true,
        showLunar: true,
        showGreeting: true,
        name: '',
        showSearch: true,
        showWeather: true,
        showHint: true,
        verticalCenter: true,
        iconStyle: 'brand',
      },

      search: {
        engine: 'baidu',
        // 自定义引擎：{ id: 'custom-*', name, url（含 %s）, color, letter }
        engines: [],
        suggestions: true,
        openInNewTab: false,
        // 最近搜索只存在本机；关掉开关后不再记录，已有记录可在设置里清除
        history: true,
        recent: [],
      },

      behavior: {
        shortcutsInNewTab: true,
        openSettingsOnShiftTab: false,
        confirmDelete: true,
      },

      widgets: {
        todo: true,
        notes: true,
        bookmarks: false,
        topSites: false,
        pomodoro: false,
        worldClock: false,
        countdown: false,
      },

      sidebar: 'right',
      lastSidebar: 'right',
    },
    groups: [
      {
        id: folderId,
        title: '工具',
        order: (SEED_SHORTCUTS.length + 1) * 10,
        createdAt: Date.now(),
      },
    ],
    shortcuts: [...shortcuts, ...folderItems],
    todos: [
      { id: 'seed-todo-1', text: '右键点击图标可以编辑或分类', done: false, createdAt: Date.now() },
      { id: 'seed-todo-2', text: '把常用的图标拖进文件夹试试', done: false, createdAt: Date.now() + 1 },
    ],
    notes: '',
    worldClocks: ['America/New_York', 'Europe/London', 'Asia/Tokyo'],
    pomodoro: { phase: 'focus', remaining: 25 * 60, endsAt: 0, running: false },
    countdown: { title: '', target: 0 },
    weather: {
      city: '北京',
      lat: 39.9042,
      lon: 116.4074,
      updatedAt: 0,
      cache: null,
    },
  };
}

/* ------------------------------------------------------------------ 迁移 */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 布尔字段迁移：字符串 "false"/"0"/"off" 不能因为非 boolean 就被当成默认 true */
function toBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'off', 'no', ''].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

/** 数值迁移：null/空串/布尔值不是 0，不能让它们掉到 min 或意外合法 */
function toFiniteNumber(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'object') return NaN;
  if (typeof value === 'string' && value.trim() === '') return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** 深合并：默认值兜底新字段，用户值优先；类型不匹配时保留默认值 */
function deepMerge(base, override) {
  if (!isPlainObject(override)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined || UNSAFE_KEYS.has(key)) continue;
    const baseValue = base?.[key];
    if (isPlainObject(baseValue)) {
      out[key] = isPlainObject(value) ? deepMerge(baseValue, value) : baseValue;
    } else if (Array.isArray(baseValue)) {
      if (Array.isArray(value)) out[key] = value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return createDefaultState();
  const defaults = createDefaultState();
  const previousDefaults = Number(raw.meta?.defaultsVersion) || 1;
  const merged = deepMerge(defaults, raw);

  // ---------- 结构修复：保证关键数组/字段永远存在且类型正确
  if (!isPlainObject(merged.meta)) merged.meta = { ...defaults.meta };
  if (!isPlainObject(merged.config)) merged.config = { ...defaults.config };
  // 类型错误的数据数组应清空，而不是把默认种子又塞回用户数据里
  if (raw.groups !== undefined && !Array.isArray(raw.groups)) merged.groups = [];
  if (raw.shortcuts !== undefined && !Array.isArray(raw.shortcuts)) merged.shortcuts = [];
  if (raw.todos !== undefined && !Array.isArray(raw.todos)) merged.todos = [];
  merged.meta.schema = APP.schema;
  const metaCreated = toFiniteNumber(merged.meta.createdAt);
  const metaUpdated = toFiniteNumber(merged.meta.updatedAt);
  merged.meta.createdAt = Number.isFinite(metaCreated) ? metaCreated : Date.now();
  merged.meta.updatedAt = Number.isFinite(metaUpdated)
    ? Math.min(Date.now(), Math.max(0, metaUpdated))
    : Date.now();
  const metaRev = toFiniteNumber(merged.meta.rev);
  merged.meta.rev = Number.isFinite(metaRev) && metaRev >= 0 ? Math.trunc(metaRev) : 0;
  const metaConflict = toFiniteNumber(merged.meta.conflict);
  merged.meta.conflict =
    Number.isFinite(metaConflict) && metaConflict >= 0 ? Math.trunc(metaConflict) : 0;
  // 老用户升级时不应再看到首启引导；只有全新安装（migrate(null)）才保持 false
  if (typeof raw.meta?.onboarded !== 'boolean') {
    merged.meta.onboarded = Boolean(
      raw.meta || raw.config || (Array.isArray(raw.shortcuts) && raw.shortcuts.length)
    );
  }

  // 逐版迁移：只在字段还停在「历史默认值」时才升级，避免覆盖用户自己的排版
  if (previousDefaults < DEFAULTS_VERSION) {
    const layout = merged.config?.layout;
    // v2：图标 60 → 72（整张网格还是旧默认布局时才动）
    if (previousDefaults < 2 && layout && layout.columns === 6 && layout.iconSize === 60) {
      layout.iconSize = 72;
    }
    // v3/v4：间距只要还停在历史默认值上就抬到当前默认。
    // 不能再要求列数/图标大小一起匹配——用户只调过图标大小就被旧间距永久卡住，
    // 这正是「改了几次默认值还是觉得挤」的根因。
    if (layout && LEGACY_GAPS.has(Number(layout.gap))) {
      layout.gap = DEFAULT_GAP;
    }
  }
  merged.meta.defaultsVersion = Math.max(previousDefaults, DEFAULTS_VERSION);

  const seenGroupIds = new Set();
  merged.groups = (Array.isArray(merged.groups) ? merged.groups : [])
    .filter((g) => g && typeof g.id === 'string' && g.id)
    .map((g, index) => ({
      id: g.id,
      title: typeof g.title === 'string' && g.title.trim() ? g.title.trim().slice(0, 40) : '文件夹',
      order: Number.isFinite(g.order) ? g.order : index * 10,
      createdAt: toFiniteNumber(g.createdAt) || Date.now(),
    }))
    .filter((group) => {
      if (seenGroupIds.has(group.id)) return false;
      seenGroupIds.add(group.id);
      return true;
    });

  const groupIds = new Set(merged.groups.map((g) => g.id));

  const seenShortcutIds = new Set();
  merged.shortcuts = (Array.isArray(merged.shortcuts) ? merged.shortcuts : [])
    .map((item) => {
      if (!item || typeof item.url !== 'string') return null;
      const url = normalizeUrl(item.url);
      if (!url || !isUsableUrl(url)) return null;
      return { ...item, url };
    })
    .filter(Boolean)
    .map((s, index) => {
      let id = typeof s.id === 'string' && s.id ? s.id : uid(`s${index}_`);
      while (seenShortcutIds.has(id)) id = uid('s_');
      seenShortcutIds.add(id);
      return {
        id,
        title: typeof s.title === 'string' && s.title.trim() ? s.title.trim().slice(0, 80) : '未命名',
        url: s.url,
        iconType: ['auto', 'favicon', 'emoji', 'url', 'file', 'text'].includes(s.iconType) ? s.iconType : 'auto',
        iconValue: typeof s.iconValue === 'string' ? s.iconValue.slice(0, 2048) : '',
        groupId: s.groupId && groupIds.has(s.groupId) ? s.groupId : null,
        order: Number.isFinite(s.order) ? s.order : index * 10,
        createdAt: toFiniteNumber(s.createdAt) || Date.now(),
      };
    });

  const seenTodoIds = new Set();
  merged.todos = (Array.isArray(merged.todos) ? merged.todos : [])
    .filter((t) => t && typeof t.text === 'string' && t.text.trim())
    .map((t, index) => {
      let id = typeof t.id === 'string' && t.id ? t.id : uid(`t${index}_`);
      while (seenTodoIds.has(id)) id = uid('t_');
      seenTodoIds.add(id);
      return {
        id,
        text: t.text.slice(0, 500),
        done: toBoolean(t.done, false),
        createdAt: toFiniteNumber(t.createdAt) || Date.now(),
      };
    });

  merged.notes = typeof merged.notes === 'string' ? merged.notes : '';
  const rawWeather = isPlainObject(merged.weather) ? merged.weather : {};
  const weatherLat = toFiniteNumber(rawWeather.lat);
  const weatherLon = toFiniteNumber(rawWeather.lon);
  const weatherUpdated = toFiniteNumber(rawWeather.updatedAt);
  merged.weather = {
    city:
      typeof rawWeather.city === 'string' && rawWeather.city.trim()
        ? rawWeather.city.trim().slice(0, 40)
        : defaults.weather.city,
    lat: Number.isFinite(weatherLat) && weatherLat >= -90 && weatherLat <= 90 ? weatherLat : defaults.weather.lat,
    lon:
      Number.isFinite(weatherLon) && weatherLon >= -180 && weatherLon <= 180
        ? weatherLon
        : defaults.weather.lon,
    // 未来时间会让缓存永远“新鲜”，夹到当前时间以内
    updatedAt: Number.isFinite(weatherUpdated) ? Math.min(Date.now(), Math.max(0, weatherUpdated)) : 0,
    cache: isPlainObject(rawWeather.cache) ? rawWeather.cache : null,
    error: typeof rawWeather.error === 'string' ? rawWeather.error.slice(0, 200) : '',
  };

  // 图标来源只允许两个值，老数据/脏数据统一回落到内置品牌图标
  if (!['brand', 'favicon'].includes(merged.config?.layout?.iconStyle)) {
    merged.config.layout.iconStyle = 'brand';
  }

  // 数字字段兜底
  const numeric = [
    ['config', 'glass', 0, 40],
    ['config', 'radius', 0, 36],
    ['config', 'fontScale', 0.8, 1.4],
    ['config.layout', 'columns', 3, 14],
    ['config.layout', 'iconSize', 40, 96],
    ['config.layout', 'gap', 4, 64],
    ['config.layout', 'gapY', 4, 64],
    ['config.background', 'blur', 0, 30],
    ['config.background', 'brightness', 30, 150],
    ['config.background', 'saturate', 0, 200],
  ];
  for (const [path, key, min, max] of numeric) {
    const parts = path.split('.');
    let node = merged;
    let fallback = defaults;
    for (const part of parts) {
      if (!isPlainObject(node[part])) node[part] = {};
      node = node[part];
      fallback = isPlainObject(fallback?.[part]) ? fallback[part] : null;
    }
    const value = toFiniteNumber(node[key]);
    node[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback?.[key] ?? min;
  }
  // CSS grid-template-columns 的 repeat() 只接受整数，手工导入的 6.5 会让整个网格失效
  merged.config.layout.columns = Math.round(merged.config.layout.columns);
  // 行距是后加的独立字段：老数据没有它，就按当时的列距 × 0.9 换算，保持原有观感
  if (!Number.isFinite(toFiniteNumber(raw.config?.layout?.gapY))) {
    merged.config.layout.gapY = Math.round(merged.config.layout.gap * 0.9);
  }

  if (!STYLES.some((style) => style.id === merged.config.style)) merged.config.style = defaults.config.style;
  if (!['gradient', 'bing', 'url', 'file', 'color'].includes(merged.config.background.type)) {
    merged.config.background.type = 'gradient';
  }
  if (!GRADIENTS.some((gradient) => gradient.id === merged.config.background.gradient)) {
    merged.config.background.gradient = defaults.config.background.gradient;
  }
  if (!['auto', 'dark', 'light'].includes(merged.config.background.tone)) merged.config.background.tone = 'auto';
  {
    // 壁纸池来自导入文件：只认合法 id 与简短名字，避免把任意对象带进 IndexedDB key
    const rawPool = Array.isArray(raw.config?.background?.pool) ? raw.config.background.pool : [];
    const seen = new Set();
    const pool = [];
    for (const item of rawPool) {
      const id = String(item?.id ?? '').trim();
      if (!/^[a-z0-9_-]{6,64}$/i.test(id) || seen.has(id)) continue;
      seen.add(id);
      pool.push({
        id,
        name: String(item?.name ?? '本地壁纸').trim().slice(0, 40) || '本地壁纸',
        addedAt: Number.isFinite(Number(item?.addedAt)) ? Number(item.addedAt) : Date.now(),
      });
      if (pool.length >= WALLPAPER_POOL_LIMIT) break;
    }
    const legacyId = String(raw.config?.background?.fileId ?? '').trim();
    if (legacyId && /^[a-z0-9_-]{6,64}$/i.test(legacyId) && !seen.has(legacyId) && pool.length < WALLPAPER_POOL_LIMIT) {
      pool.unshift({ id: legacyId, name: '本地壁纸', addedAt: Date.now() });
      seen.add(legacyId);
    }
    merged.config.background.pool = pool;
    if (!pool.some((item) => item.id === merged.config.background.fileId)) {
      merged.config.background.fileId = pool[0]?.id || '';
    }
  }
  if (!WALLPAPER_ROTATIONS.includes(merged.config.background.rotation)) {
    merged.config.background.rotation = 'off';
  }
  merged.config.background.rotatedAt = Number.isFinite(toFiniteNumber(merged.config.background.rotatedAt))
    ? Math.max(0, Number(merged.config.background.rotatedAt))
    : 0;
  if (!['right', 'left', 'hidden'].includes(merged.config.sidebar)) merged.config.sidebar = defaults.config.sidebar;
  if (!['right', 'left'].includes(merged.config.lastSidebar)) merged.config.lastSidebar = 'right';
  {
    // 自定义引擎来自导入文件：只保留校验通过、id/地址不重复的前 N 个
    const rawEngines = Array.isArray(raw.config?.search?.engines) ? raw.config.search.engines : [];
    const seenIds = new Set();
    const seenUrls = new Set();
    const engines = [];
    for (const item of rawEngines) {
      const engine = sanitizeCustomEngine(item);
      if (!engine) continue;
      const urlKey = engine.url.toLowerCase();
      if (seenIds.has(engine.id) || seenUrls.has(urlKey)) continue;
      seenIds.add(engine.id);
      seenUrls.add(urlKey);
      engines.push(engine);
      if (engines.length >= CUSTOM_ENGINE_LIMIT) break;
    }
    merged.config.search.engines = engines;
  }
  if (!enginesFor(merged.config).some((engine) => engine.id === merged.config.search.engine)) {
    merged.config.search.engine = defaults.config.search.engine;
  }
  {
    // 最近搜索来自本机输入，导入的备份可能带脏数据：只保留「去空白、限长、去重」后的条目
    const rawRecent = Array.isArray(raw.config?.search?.recent) ? raw.config.search.recent : [];
    const seen = new Set();
    const recent = [];
    for (const item of rawRecent) {
      if (typeof item !== 'string') continue;
      const text = item.trim().slice(0, RECENT_SEARCH_MAX_LENGTH);
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recent.push(text);
      if (recent.length >= RECENT_SEARCH_LIMIT) break;
    }
    merged.config.search.recent = recent;
  }
  if (typeof merged.config.accent !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(merged.config.accent)) {
    merged.config.accent = defaults.config.accent;
  }
  merged.config.customCss =
    typeof merged.config.customCss === 'string' ? merged.config.customCss.slice(0, 20000) : '';
  {
    const rawFont = isPlainObject(raw.config?.customFont) ? raw.config.customFont : {};
    const id = typeof rawFont.id === 'string' ? rawFont.id.trim() : '';
    merged.config.customFont = {
      id: /^[a-z0-9_-]{6,64}$/i.test(id) ? id : '',
      name: typeof rawFont.name === 'string' ? rawFont.name.trim().slice(0, 60) : '',
    };
    if (!merged.config.customFont.id) merged.config.customFont.name = '';
  }
  if (
    typeof merged.config.background.color !== 'string' ||
    !/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(merged.config.background.color)
  ) {
    merged.config.background.color = defaults.config.background.color;
  }
  if (typeof merged.config.background.url === 'string' && isSafeImageUrl(merged.config.background.url)) {
    merged.config.background.url = normalizeUrl(merged.config.background.url);
  } else {
    merged.config.background.url = '';
  }
  if (typeof merged.config.background.fileId !== 'string') merged.config.background.fileId = '';
  {
    // 遮罩强度按风格分别记忆；旧版本只有一个全局 veil，迁移时落到当时的风格上
    const rawBg = isPlainObject(raw.config?.background) ? raw.config.background : {};
    const rawMap = isPlainObject(rawBg.veilByStyle) ? rawBg.veilByStyle : {};
    const legacyVeil = toFiniteNumber(rawBg.veil);
    const map = {};
    for (const style of STYLES) {
      const value = toFiniteNumber(rawMap[style.id]);
      if (Number.isFinite(value)) map[style.id] = Math.min(100, Math.max(0, Math.round(value)));
    }
    if (!Object.keys(map).length && Number.isFinite(legacyVeil) && legacyVeil > 0) {
      map[merged.config.style] = Math.min(100, Math.max(0, Math.round(legacyVeil)));
    }
    // v5：材质型风格换了默认值，同时清掉已保存的逐风格覆盖，让 45% 立即生效
    if (previousDefaults < 5) {
      delete map.noir;
      delete map.paper;
    }
    merged.config.background.veilByStyle = map;
    delete merged.config.background.veil;
  }
  {
    const rawBing = isPlainObject(merged.config.background.bing) ? merged.config.background.bing : {};
    const bingIdx = toFiniteNumber(rawBing.idx);
    const bingDate = typeof rawBing.date === 'string' ? rawBing.date.trim() : '';
    const bingUrl = typeof rawBing.url === 'string' ? rawBing.url.trim() : '';
    merged.config.background.bing = {
      idx: Number.isFinite(bingIdx) ? Math.min(7, Math.max(0, Math.trunc(bingIdx))) : 0,
      // 只接受必应缓存真正需要的形状，脏数据/备份里的怪东西直接丢弃
      date: /^\d{4}-\d{2}-\d{2}$/.test(bingDate) ? bingDate : '',
      url: /^https?:\/\//i.test(bingUrl) && isSafeImageUrl(bingUrl) ? bingUrl.slice(0, 2048) : '',
      copyright: typeof rawBing.copyright === 'string' ? rawBing.copyright.slice(0, 200) : '',
      title: typeof rawBing.title === 'string' ? rawBing.title.slice(0, 200) : '',
    };
  }
  merged.config.layout.name =
    typeof merged.config.layout.name === 'string' ? merged.config.layout.name.slice(0, 16) : '';
  merged.notes = merged.notes.slice(0, 20000);

  const booleanFields = [
    ['config', 'animations'],
    ['config', 'performance'],
    ['config.background', 'vignette'],
    ['config.layout', 'showClock'],
    ['config.layout', 'clock24'],
    ['config.layout', 'showSeconds'],
    ['config.layout', 'showDate'],
    ['config.layout', 'showLunar'],
    ['config.layout', 'showGreeting'],
    ['config.layout', 'showSearch'],
    ['config.layout', 'showWeather'],
    ['config.layout', 'showHint'],
    ['config.layout', 'verticalCenter'],
    ['config.search', 'suggestions'],
    ['config.search', 'openInNewTab'],
    ['config.search', 'history'],
    ['config.behavior', 'shortcutsInNewTab'],
    ['config.behavior', 'confirmDelete'],
    ['config.widgets', 'todo'],
    ['config.widgets', 'notes'],
    ['config.widgets', 'bookmarks'],
    ['config.widgets', 'topSites'],
    ['config.widgets', 'pomodoro'],
    ['config.widgets', 'worldClock'],
    ['config.widgets', 'countdown'],
  ];
  for (const [path, key] of booleanFields) {
    let node = merged;
    let fallback = defaults;
    for (const part of path.split('.')) {
      node = node[part];
      fallback = fallback[part];
    }
    node[key] = toBoolean(node[key], fallback[key]);
  }

  {
    // 老数据没有这个字段时保留默认三城；显式保存空数组才视为「用户清空」
    const rawZones = Array.isArray(raw.worldClocks) ? raw.worldClocks : defaults.worldClocks;
    const zones = [];
    for (const zone of rawZones) {
      if (typeof zone !== 'string' || zones.includes(zone)) continue;
      try {
        new Intl.DateTimeFormat('zh-CN', { timeZone: zone }).format(0);
      } catch {
        continue;
      }
      zones.push(zone);
      if (zones.length >= 6) break;
    }
    merged.worldClocks = zones;
  }
  {
    const rawPomodoro = isPlainObject(raw.pomodoro) ? raw.pomodoro : {};
    const phase = rawPomodoro.phase === 'break' ? 'break' : 'focus';
    const fallbackSeconds = phase === 'break' ? 5 * 60 : 25 * 60;
    const remaining = toFiniteNumber(rawPomodoro.remaining);
    const endsAt = toFiniteNumber(rawPomodoro.endsAt);
    merged.pomodoro = {
      phase,
      remaining: Number.isFinite(remaining)
        ? Math.min(3600, Math.max(0, Math.round(remaining)))
        : fallbackSeconds,
      endsAt: Number.isFinite(endsAt) ? Math.max(0, Math.round(endsAt)) : 0,
      running: rawPomodoro.running === true,
    };
    if (merged.pomodoro.running && merged.pomodoro.endsAt <= 0) merged.pomodoro.running = false;
  }
  {
    const rawCountdown = isPlainObject(raw.countdown) ? raw.countdown : {};
    const target = toFiniteNumber(rawCountdown.target);
    merged.countdown = {
      title: typeof rawCountdown.title === 'string' ? rawCountdown.title.trim().slice(0, 60) : '',
      target: Number.isFinite(target) ? Math.max(0, Math.trunc(target)) : 0,
    };
  }

  return merged;
}

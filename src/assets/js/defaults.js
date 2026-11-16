/* Lumen · 默认状态与常量
 * 数据模型一旦确定，其余模块只读它 + 通过 store 修改它。
 */

import { uid } from './util.js';

export const APP = {
  name: 'Lumen',
  subtitle: '新标签页',
  version: '1.1.0',
  schema: 1,
};

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
  { id: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', color: '#DE5833', letter: 'D', suggest: null },
  { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com/search?type=content&q=%s', color: '#0084FF', letter: '知', suggest: null },
  { id: 'bilibili', name: '哔哩哔哩', url: 'https://search.bilibili.com/all?keyword=%s', color: '#FB7299', letter: '哔', suggest: null },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q=%s', color: '#24292F', letter: 'G', suggest: null },
];

export const engineById = (id) => ENGINES.find((e) => e.id === id) || ENGINES[0];

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
      createdAt: Date.now(),
      updatedAt: Date.now(),
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
        veil: 0,
        vignette: true,
        tone: 'auto',
      },

      layout: {
        columns: 6,
        iconSize: 60,
        gap: 20,
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
        suggestions: true,
        openInNewTab: false,
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
      },

      sidebar: 'right',
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

/** 深合并：默认值兜底新字段，用户值优先；数组整体替换 */
function deepMerge(base, override) {
  if (!isPlainObject(override)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(base?.[key])) out[key] = deepMerge(base[key], value);
    else out[key] = value;
  }
  return out;
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return createDefaultState();
  const defaults = createDefaultState();
  const merged = deepMerge(defaults, raw);

  // ---------- 结构修复：保证关键数组/字段永远存在且类型正确
  merged.meta = merged.meta || defaults.meta;
  merged.meta.schema = APP.schema;

  merged.groups = (Array.isArray(merged.groups) ? merged.groups : [])
    .filter((g) => g && typeof g.id === 'string')
    .map((g, index) => ({
      id: g.id,
      title: typeof g.title === 'string' && g.title ? g.title : '文件夹',
      order: Number.isFinite(g.order) ? g.order : index * 10,
      createdAt: g.createdAt || Date.now(),
    }));

  const groupIds = new Set(merged.groups.map((g) => g.id));

  merged.shortcuts = (Array.isArray(merged.shortcuts) ? merged.shortcuts : [])
    .filter((s) => s && typeof s.url === 'string')
    .map((s, index) => ({
      id: typeof s.id === 'string' && s.id ? s.id : uid(`s${index}_`),
      title: typeof s.title === 'string' && s.title.trim() ? s.title.trim().slice(0, 80) : '未命名',
      url: s.url,
      iconType: ['auto', 'favicon', 'emoji', 'url', 'file', 'text'].includes(s.iconType) ? s.iconType : 'auto',
      iconValue: typeof s.iconValue === 'string' ? s.iconValue : '',
      groupId: s.groupId && groupIds.has(s.groupId) ? s.groupId : null,
      order: Number.isFinite(s.order) ? s.order : index * 10,
      createdAt: s.createdAt || Date.now(),
    }));

  merged.todos = (Array.isArray(merged.todos) ? merged.todos : [])
    .filter((t) => t && typeof t.text === 'string')
    .map((t, index) => ({
      id: typeof t.id === 'string' && t.id ? t.id : uid(`t${index}_`),
      text: t.text.slice(0, 500),
      done: Boolean(t.done),
      createdAt: t.createdAt || Date.now(),
    }));

  merged.notes = typeof merged.notes === 'string' ? merged.notes : '';
  merged.weather = merged.weather && typeof merged.weather === 'object' ? merged.weather : defaults.weather;

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
    ['config.layout', 'gap', 4, 48],
    ['config.background', 'blur', 0, 30],
    ['config.background', 'brightness', 30, 150],
    ['config.background', 'saturate', 0, 200],
    ['config.background', 'veil', 0, 90],
  ];
  for (const [path, key, min, max] of numeric) {
    const parts = path.split('.');
    let node = merged;
    for (const part of parts) {
      if (!isPlainObject(node[part])) node[part] = {};
      node = node[part];
    }
    const value = Number(node[key]);
    node[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : defaults.config[key] ?? min;
  }

  return merged;
}

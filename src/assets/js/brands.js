/* Lumen · 品牌图标索引
 *
 * host -> 内置矢量图标（assets/brand/<slug>.svg）。
 * 图标来源见 assets/brand/NOTICE.md；未收录的站点自动退回站点图标或字符徽标。
 *
 * 匹配规则：从完整 host 开始逐段剥离子域，命中即止。
 * 所以 `music.163.com` 能命中，`www.baidu.com` 也能落到 `baidu.com`。
 */

const BASE = new URL('../brand/', import.meta.url);

export const BRAND_LOGOS = {
  /* ---- 中文站点 ---- */
  'baidu.com': 'baidu',
  'bilibili.com': 'bilibili',
  'b23.tv': 'bilibili',
  'zhihu.com': 'zhihu',
  'weibo.com': 'sinaweibo',
  'weibo.cn': 'sinaweibo',
  'weixin.qq.com': 'wechat',
  'wechat.com': 'wechat',
  'taobao.com': 'taobao',
  'tmall.com': 'taobao',
  'jd.com': 'jd',
  '3.cn': 'jd',
  'xiaohongshu.com': 'xiaohongshu',
  'xhslink.com': 'xiaohongshu',
  'douban.com': 'douban',
  'douyin.com': 'douyin',
  'iesdouyin.com': 'douyin',
  'kuaishou.com': 'kuaishou',
  'juejin.cn': 'juejin',
  'csdn.net': 'csdn',
  'v2ex.com': 'v2ex',
  'meituan.com': 'meituan',
  'dianping.com': 'meituan',
  'alipay.com': 'alipay',
  'alibaba.com': 'alibabacloud',
  'aliyun.com': 'alibabacloud',
  '163.com': 'neteasecloudmusic',
  'music.163.com': 'neteasecloudmusic',
  'gitee.com': 'gitee',

  /* ---- 国际站点 ---- */
  'google.com': 'google',
  'gemini.google.com': 'googlegemini',
  'gmail.com': 'gmail',
  'mail.google.com': 'gmail',
  'drive.google.com': 'googledrive',
  'docs.google.com': 'googledocs',
  'translate.google.com': 'googletranslate',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'stackoverflow.com': 'stackoverflow',
  'npmjs.com': 'npm',
  'developer.mozilla.org': 'mdnwebdocs',
  'notion.so': 'notion',
  'figma.com': 'figma',
  'canva.com': 'canva',
  'trello.com': 'trello',
  'slack.com': 'slack',
  'zoom.us': 'zoom',
  'dropbox.com': 'dropbox',
  'airtable.com': 'airtable',
  'vercel.com': 'vercel',
  'netlify.com': 'netlify',
  'netlify.app': 'netlify',
  'cloudflare.com': 'cloudflare',
  'aws.amazon.com': 'amazonwebservices',
  'docker.com': 'docker',
  'kubernetes.io': 'kubernetes',
  'python.org': 'python',
  'nodejs.org': 'nodedotjs',
  'vuejs.org': 'vuedotjs',
  'react.dev': 'react',
  'tailwindcss.com': 'tailwindcss',
  'vitejs.dev': 'vite',
  'vite.dev': 'vite',
  'rust-lang.org': 'rust',
  'go.dev': 'go',
  'obsidian.md': 'obsidian',
  'huggingface.co': 'huggingface',
  'perplexity.ai': 'perplexity',
  'linear.app': 'linear',
  'chatgpt.com': 'openai',
  'openai.com': 'openai',
  'anthropic.com': 'anthropic',
  'claude.ai': 'claude',
  'deepseek.com': 'deepseek',
  'netflix.com': 'netflix',
  'spotify.com': 'spotify',
  'twitch.tv': 'twitch',
  'x.com': 'x',
  'twitter.com': 'x',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'instagram.com': 'instagram',
  'reddit.com': 'reddit',
  'linkedin.com': 'linkedin',
  'telegram.org': 'telegram',
  't.me': 'telegram',
  'discord.com': 'discord',
  'discord.gg': 'discord',
  'pinterest.com': 'pinterest',
  'wikipedia.org': 'wikipedia',
  'apple.com': 'apple',
  'icloud.com': 'icloud',
  'firefox.com': 'firefox',
  'mozilla.org': 'firefox',
  'microsoft.com': 'microsoft',
  'office.com': 'microsoft',
  'live.com': 'microsoft',
  'outlook.com': 'microsoft',
  'bing.com': 'bing',
  'tiktok.com': 'tiktok',
};

/** 逐段剥离子域，返回命中的 slug */
export function brandSlugFor(host) {
  if (!host) return null;
  const value = String(host).toLowerCase().replace(/^www\./, '');
  if (BRAND_LOGOS[value]) return BRAND_LOGOS[value];
  const parts = value.split('.');
  for (let i = 1; i < parts.length - 1; i += 1) {
    const candidate = parts.slice(i).join('.');
    if (BRAND_LOGOS[candidate]) return BRAND_LOGOS[candidate];
  }
  return null;
}

const urlCache = new Map();

export function brandLogoUrl(slug) {
  if (!slug) return '';
  if (urlCache.has(slug)) return urlCache.get(slug);
  const url = new URL(`${slug}.svg`, BASE).href;
  urlCache.set(slug, url);
  return url;
}

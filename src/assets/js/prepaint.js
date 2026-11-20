/* Serein · 首帧前置
 *
 * 必须是「经典脚本」且在样式表之前同步执行：
 * 扩展页的 CSP 禁止内联脚本，所以单独成文件。
 * 作用是把风格与色调在首次绘制前落到 <html> 上，
 * 避免白纸 / 终端这类固定明暗的风格先闪一下默认深色。
 */

try {
  // 首帧不能等存储迁移：新键没有就读改名前的旧键（Lumen）
  const raw = localStorage.getItem('serein.state.v1') || localStorage.getItem('lumen.state.v1');
  if (raw) {
    const state = JSON.parse(raw);
    const config = state && state.config;
    if (config) {
      const root = document.documentElement;
      if (config.style) root.dataset.style = config.style;
      if (config.sidebar) root.dataset.sidebar = config.sidebar;
      root.dataset.perf = config.performance ? '1' : '0';
      root.dataset.anim = config.animations === false ? '0' : '1';
      // 与 theme.js 的 STYLE_TONE 保持一致；此处必须独立，不能 import
      const tone = { paper: 'light', editorial: 'light', terminal: 'dark', noir: 'dark' }[config.style];
      if (tone) root.dataset.tone = tone;
      if (config.accent) root.style.setProperty('--accent', config.accent);
      const scale = Number(config.fontScale);
      if (Number.isFinite(scale) && scale > 0) {
        const fitted = Math.min(1.4, Math.max(0.8, scale));
        if (fitted !== 1) {
          root.style.setProperty('--font-scale', String(fitted));
          root.dataset.scale = '1';
        }
      }
    }
  }
} catch (err) {
  /* 数据坏了就交给主流程兜底 */
}

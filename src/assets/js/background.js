/* Serein · MV3 service worker
 * 工具栏图标点击 -> 打开新标签页（等价于用户按下 Ctrl+T 后跳转到覆盖页）。
 * 除此之外不注册任何监听器，保持 service worker 极简、可随时休眠。
 */
chrome.action.onClicked.addListener(function () {
  chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') });
});

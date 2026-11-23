# 隐私政策 / Privacy Policy

**Serein 新标签页**（浏览器扩展，以下简称「本扩展」）不收集、不上传、不出售任何用户数据。

最后更新：2026-11-23

---

## 一、我们不收集什么

- 没有账号系统，没有登录
- 没有服务器，没有云端同步
- 没有统计、埋点、崩溃上报或广告 SDK
- 不读取、不记录你的浏览历史（除非你在设置里主动开启「从书签导入」或「常去网站」小组件，见第三节）
- 不会把你的快捷方式链接改写成推广 / 联盟链接

## 二、数据存在哪里

全部保存在你自己的浏览器本地：

| 内容 | 存储位置 |
|---|---|
| 配置、快捷方式、文件夹、待办、便签、最近搜索词 | `localStorage`（键 `serein.state.v1`） |
| 你上传的壁纸、自定义图标 | IndexedDB（`serein-assets`） |
| 兜底镜像（防止缓存被清理丢配置） | `chrome.storage.local` |

卸载扩展或在扩展管理页清除数据，上述内容即被删除。设置里的「导出」会生成一个 zip 备份（含配置与图片），由你自己保管；备份过程不经过任何服务器。

## 三、可选权限

以下权限**默认不申请**，只有你主动点击对应功能时浏览器才会弹窗询问：

| 权限 | 触发时机 | 用途 |
|---|---|---|
| `bookmarks` | 设置 → 数据 → 从书签导入 | 读取本地书签，一次性导入为快捷方式 |
| `topSites` | 设置 → 小组件 → 常去网站 | 读取浏览器本地统计的常去站点，仅显示在侧栏 |

拒绝授权不影响其它功能，对应入口不会出现。

## 四、会发出的网络请求

只在对应功能被使用时请求，且不携带任何用户标识（无 Cookie、无账号、无设备 ID）：

| 域名 | 何时请求 | 传输内容 |
|---|---|---|
| `cn.bing.com` | 壁纸选择「必应每日」时 | 请求当日壁纸元数据与图片 |
| `api.bing.com` | 搜索联想开启且使用必应引擎时 | 输入的搜索词前缀 |
| `suggestion.baidu.com` | 搜索联想开启且使用百度引擎时 | 输入的搜索词前缀 |
| `sug.so.360.cn` | 搜索联想开启且使用 360 引擎时 | 输入的搜索词前缀 |
| `suggestqueries.google.com` | 搜索联想开启且使用 Google 引擎时 | 输入的搜索词前缀 |
| `duckduckgo.com` | 搜索联想开启且使用 DuckDuckGo 引擎时 | 输入的搜索词前缀 |
| `s.search.bilibili.com` | 搜索联想开启且使用哔哩哔哩引擎时 | 输入的搜索词前缀 |
| `api.open-meteo.com` | 天气小组件开启时 | 城市经纬度 |
| `geocoding-api.open-meteo.com` | 在城市选择器里搜索城市时 | 输入的城市名 |

搜索联想可以在设置里关闭；关闭后不会发出任何联想请求。「最近搜索」只保存在本机，可在设置中关闭记录或清除。

## 五、权限用途

| 权限 | 用途 |
|---|---|
| `storage` | 保存配置到本机 |
| `unlimitedStorage` | 保存你上传的壁纸与图标（IndexedDB 默认配额不够） |
| `favicon` | 通过浏览器内置的 `_favicon` 读取**本地缓存**的网站图标，不联网 |

## 六、第三方

- 天气数据由 [Open-Meteo](https://open-meteo.com/) 提供
- 每日壁纸来自必应公开接口，版权归原作者，仅供个人欣赏

本扩展与上述服务方没有数据合作，也不会向其提供任何用户信息。

## 七、儿童隐私

本扩展不面向儿童，也不收集任何个人信息。

## 八、变更

本政策如有变更，会更新本文件并修改上面的「最后更新」日期。

## 九、联系方式

有问题请开 issue：<https://github.com/YYY7C/serein-newtab/issues>

---

# Privacy Policy (English summary)

Serein New Tab is a browser extension that **collects no user data**. There is no account, no server, no analytics, and no cloud sync. Settings, shortcuts, todos and notes live in your browser's `localStorage`; uploaded wallpapers and icons live in IndexedDB. Optional permissions (`bookmarks`, `topSites`) are only requested when you explicitly use those features. Network requests are limited to the hosts listed above (Bing wallpaper/suggestions, Baidu/360/Google/DuckDuckGo/Bilibili suggestions, Open-Meteo weather), and never include identifiers. Recent search terms stay in local storage and can be turned off or cleared in Settings. Contact: the GitHub issues link above.

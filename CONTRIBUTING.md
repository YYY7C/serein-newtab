# 开发与贡献

Serein 是**零构建**的静态 MV3 扩展：没有打包步骤，`src/` 目录可以直接加载。

## 本地开发

```powershell
# 任选一种静态服务器
python -m http.server 8123 --directory src
# 或
npm run serve
```

然后打开 <http://127.0.0.1:8123/newtab.html>。

调试扩展本体：

1. `chrome://extensions`（Edge 是 `edge://extensions`）
2. 打开「开发者模式」
3. 「加载已解压的扩展程序」→ 选择 `src/`
4. 改完代码后在扩展卡片上点「重新加载」

> 本地 HTTP 预览没有扩展的 host 权限，搜索联想、必应壁纸、天气可能被 CORS 拦截；这是预期行为，请在扩展里验证联网功能。

## 代码约定

- 原生 ES Module，不引入运行时框架；不新增构建步骤。
- 仅使用标准 Web API 与 `chrome.*`；`chrome` 调用要能容忍本地预览时不存在。
- 视觉参数优先落到 `assets/css/tokens.css` 的 CSS 变量，再在 `assets/js/theme.js` 写变量。
- 所有用户数据只存本地：`localStorage`（结构化配置）、IndexedDB（二进制资产）。
- 新增网络请求必须同步更新 `manifest.json` 的 `host_permissions`、`PRIVACY.md` 与 README 的网络请求表。
- 提交前跑 `npm run lint` 与 `npm test`。

## 测试

```powershell
npm install
# 本地没有下载 Playwright 浏览器时，可复用系统 Edge：
$env:PW_CHANNEL = 'msedge'
npm test
```

CI 使用 Playwright 自带 Chromium。测试覆盖：

- 启动、种子网格、时钟
- 搜索/联想（mock 接口）、键盘
- 文件夹、弹窗栈
- 设置 8 个分区
- 六套风格冒烟与可访问性
- 多标签页并发写入
- zip 备份 round-trip

新增功能请同时补一条冒烟测试；修 UI 问题请附截图或复现步骤。

## 新增搜索引擎

1. 在 `assets/js/defaults.js` 的 `ENGINES` 里加一项（`id / name / url / suggest / color / letter`）。
2. 如果是联想接口，补 `fetchSuggestions` 的解析与 `manifest.json` 的 host 权限。
3. 同步 README 与 `PRIVACY.md`。

## 新增内置品牌图标

1. 放一个 48×48 的 `src/assets/brand/<slug>.svg`。
2. 在 `assets/js/brands.js` 登记域名 → slug。
3. 更新 `assets/brand/NOTICE.md` 的来源说明。
4. 只使用可再分发或自行绘制的图形；商标归品牌方所有。

## 提交信息

沿用仓库现有格式：

```
V1.3.2 一句话总结

M: 修改了什么
A: 新增了什么
D: 删除了什么
```

## PR 检查清单

- [ ] `npm run lint` 通过
- [ ] `npm test` 通过
- [ ] 新增/修改的 UI 在 1366×768 与 1920×1080 下无裁切
- [ ] 六套风格没有明显回归
- [ ] 涉及数据结构的改动带迁移，并且旧数据可正常打开
- [ ] 涉及网络请求的改动同步了权限与隐私文档

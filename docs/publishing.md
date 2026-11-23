# 发布到扩展商店

Serein 是零构建的静态 MV3 扩展，**上传的就是 `src/` 目录本身**，不需要 npm、不需要编译。

---

## 0. 先打包

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package.ps1
# -> dist/serein-newtab-v1.3.0.zip
```

脚本做三件事：把 `src/` 里所有文件按 `manifest.json` + `assets/` 的层级放进 zip 根目录、路径统一用 `/`、文件名带版本号。

上传前的自检：

- `manifest.json` 在 zip **根目录**（不是 `src/manifest.json`）
- 每次提交都递增 `manifest.json` 的 `version`（`1.3.0` → `1.3.1`）
- zip 里不带 `docs/`、`README.md`、`.git/`、`dist/`
- 图标 `assets/img/icon-128.png` 存在（商店图标直接取 manifest 里的这一张）

> 本项目已用 Chrome 158 与 Edge 157 的 `--pack-extension` 验证过 manifest 与权限声明，两站均能解析。

---

## 1. Chrome Web Store

### 1.1 注册开发者（一次性）

1. 打开 <https://chrome.google.com/webstore/devconsole>
2. 用 Google 账号登录，支付**一次性注册费 5 美元**（不可退，同一账号后续所有扩展通用）
3. 填写开发者邮箱并完成验证；建议开启两步验证（CWS 对发布者有此要求）
4. 同意开发者协议

### 1.2 上传

1. 点 **Add new item**
2. 选 `dist/serein-newtab-v1.3.0.zip` → **Upload**
3. manifest 或 zip 结构有问题会当场报错（最常见：zip 里多了 `src/` 一层）

### 1.3 填写商品页（Store listing）

| 字段 | 本项目填什么 |
|---|---|
| 名称 | 来自 manifest（`Serein 新标签页`），此处不可改 |
| 简短说明 | ≤ 132 字符，见 `docs/store-listing.md` |
| 详细说明 | 见 `docs/store-listing.md` |
| 分类 | Productivity（生产力工具） |
| 语言 | 中文（简体）、English |
| 商店图标 | 打包内的 `icon-128.png`（**建议**：96×96 内容 + 每边 16px 透明留白） |
| 截图 | 1–5 张，`1280×800` 或 `640×400`，用 `docs/store/screenshot-*.png` |
| 小宣传图 | `440×280`，可选但强烈建议（没有它会被排在有的后面） |
| 大宣传图 | `1400×560`，可选 |
| 官网 / 支持链接 | `https://github.com/YYY7C/serein-newtab` |

### 1.4 Privacy practices（隐私）

- **Single purpose**：一句话说明单一用途（见 `docs/store-listing.md`）
- **Permission justification**：`storage` / `unlimitedStorage` / `favicon` / 各 host 权限逐条填理由
- **Remote code**：选 **No**（MV3 不允许远程代码，本项目也没有）
- **Data usage**：所有数据类别都**不勾选**（本扩展不收集用户数据）
- 勾选三项认证（不出售数据、不用于无关用途、不违反有限使用政策）

### 1.5 提交与审核

- 可见性：先用 **Unlisted** 自测（只有拿到链接的人能装），确认没问题再切 **Public**
- 分发地区：全部（本项目没有地域限制）
- 提交后审核通常 **1–3 个工作日**；首次上架或权限变更会更久
- 被拒会邮件给出具体条款，改完重新提交即可，**不需要重新付费**

---

## 2. Microsoft Edge Add-ons

### 2.1 注册

1. 打开 <https://partner.microsoft.com/dashboard/microsoftedge/public/login>
2. 用个人 Microsoft 账号注册（**免费**，Edge 不收注册费）
3. 填写发布者名称、验证邮箱

### 2.2 新建扩展

1. **Create new extension** → 上传**同一个 zip**
2. Partner Center 会解析 manifest，自动填入名称与简短说明（来自 `manifest.description`）

### 2.3 Availability

- Visibility：**Public**（想先内测就选 Hidden，只有你自己能装）
- Markets：全部市场

### 2.4 Properties

- Category：Productivity
- 其余按实际情况填写（本项目不需要额外说明）

### 2.5 Privacy

| 区块 | 填什么 |
|---|---|
| Single Purpose | 见 `docs/store-listing.md` |
| Permission justification | 逐条填，同 Chrome |
| Are you using remote code? | **No, I am not using remote code** |
| Data usage | 所有类别不勾选，勾选三项认证 |
| Privacy policy URL | `https://github.com/YYY7C/serein-newtab/blob/main/PRIVACY.md` |

> Edge 要求：只要扩展会访问、传输或收集个人信息就必须提供隐私政策链接。本项目实际不收集，但**仍然建议填上**，能明显减少来回沟通。

### 2.6 Store listings

每个语言都要填：

| 字段 | 要求 |
|---|---|
| 描述 | **必填，250–10000 字符**（从 `docs/store-listing.md` 贴） |
| Extension logo | 必填，1:1，建议 `300×300`（用 `docs/store/logo-300.png`） |
| 截图 | 可选，最多 6 张，`1280×800` 或 `640×480` |
| 小宣传图 | `440×280` |
| 大宣传图 | `1400×560` |
| 搜索词 | 见 `docs/store-listing.md` |

### 2.7 提交

- **Certification notes**：写清楚怎么测，例如「打开新标签页即可看到全部功能，无需账号或 API Key；天气需要联网，断网时会显示占位而不是报错」
- 审核通常 **1–7 天**

---

## 3. 两个商店的差异

| | Chrome Web Store | Edge Add-ons |
|---|---|---|
| 注册费 | 一次性 5 美元 | 免费 |
| 账号 | Google | Microsoft |
| 上传物 | zip（同一份） | zip（同一份） |
| 截图尺寸 | 1280×800 或 640×400 | 1280×800 或 640×480 |
| 截图数量 | 1–5 张 | 最多 6 张（可选） |
| 描述来源 | 商店页手填 | 简短说明来自 manifest，详细描述商店页填（≥250 字符） |
| 隐私政策 | 填 URL（收集数据时必填） | 填 URL（建议始终提供） |
| 审核时长 | 1–3 个工作日 | 1–7 天 |

---

## 4. 本项目要特别解释的权限

| 权限 | 在商店里怎么解释 |
|---|---|
| `storage` | 保存快捷方式、布局、壁纸等配置到本机 |
| `unlimitedStorage` | 用户上传的壁纸与自定义图标存在 IndexedDB，默认配额不够 |
| `favicon` | 通过浏览器内置的 `_favicon` 读取**本地缓存**的网站图标，不发起网络请求 |
| `bookmarks`（可选） | 仅在用户点击「从书签导入」时申请 |
| `topSites`（可选） | 仅在用户开启「常去网站」小组件时申请 |
| `cn.bing.com` / `api.bing.com` | 必应每日壁纸与必应搜索联想 |
| `suggestion.baidu.com` / `sug.so.360.cn` | 百度 / 360 搜索联想 |
| `suggestqueries.google.com` | Google 搜索联想 |
| `duckduckgo.com` | DuckDuckGo 搜索联想 |
| `s.search.bilibili.com` | 哔哩哔哩搜索联想 |
| `api.open-meteo.com` / `geocoding-api.open-meteo.com` | 天气与城市搜索 |

`chrome_url_overrides.newtab` 不需要额外解释——它就是扩展的主功能。

---

## 5. 常见踩坑

| 现象 | 原因 |
|---|---|
| `Manifest file is missing or unreadable` | zip 里多了一层 `src/` |
| `Version is not incremented` | 上传的版本号 ≤ 已上架版本 |
| 截图被裁掉边 | 不是 16:10（1280×800 / 640×400） |
| Edge 报 `Description is too short` | 不足 250 字符 |
| 审核被拒：隐私政策打不开 | URL 用了私有仓库 / 未提交到 `main` |
| 图标在商店里显示偏大 | 128 图没有 16px 透明留白（仅影响观感） |
| 审核说「权限与功能不匹配」 | 某些 host 权限在做对应功能之前就声明了，需在 justification 里说清楚**哪个功能**用它 |

---

## 6. 更新版本

1. 改 `src/manifest.json` 的 `version`
2. 重新跑 `scripts/package.ps1`
3. 两个商店各自的开发者后台 → 上传新 zip → 提交审核

已安装用户会在浏览器检查更新时自动升级（Chrome 通常几小时内，Edge 视情况）。

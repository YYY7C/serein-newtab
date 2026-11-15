# Infinity 新标签页 (Pro) 开源平替 —— 技术预研报告

> **文档性质**：技术预研 / 调研报告（不含实现代码）
> **调研范围**：GitHub / GitLab 开源生态、Chrome & Edge 扩展平台约束、中文与国际商业竞品
> **目标形态**：Chrome / Edge 扩展（Manifest V3）
> **目标同步方案**：浏览器自带同步（`chrome.storage.sync`）
> **编写日期**：2026-11-15

---

## 目录

**第一部分：结论与需求**

- [0. 摘要（结论先行）](#0-摘要结论先行)
  - [0.1 一句话结论](#01-一句话结论)
  - [0.2 三条可行路线](#02-三条可行路线)
  - [0.3 五个必须先知道的"硬约束"](#03-五个必须先知道的硬约束)
  - [0.4 最小可行平替的核心 20%](#04-如果要最小可行平替核心-20-是什么)
- [1. 需求基线：Infinity 到底提供了什么](#1-需求基线infinity-到底提供了什么)

**第二部分：生态盘点**

- [2. 开源生态全景盘点](#2-开源生态全景盘点)
  - [2.1 调研方法论](#21-调研方法论可复现)
  - [2.2 生态观察](#22-生态观察为什么这个赛道多产但少精品)
  - [2.3 开源项目全量盘点（S/A/B/C 分级）](#23-开源项目全量盘点)
  - [2.4 商业竞品地形（中文市场重点）](#24-商业竞品地形中文市场重点)

**第三部分：深度剖析**

- [3. 重点项目源码级剖析](#3-重点项目源码级剖析)
  - [3.1 nightTab](#31-nighttab--功能最接近但架构最重)
  - [3.2 Tabliss](#32-tabliss--插件化小组件体系的教科书)
  - [3.3 Bonjourr](#33-bonjourr--同步方案设计的标杆)
  - [3.4 anori](#34-anori--工程化天花板也是现代新标签页该长成的样子)
  - [3.5 Lemon New Tab](#35-lemon-new-tab柠檬起始页--中文场景最完整的参考)
  - [3.6 light-tab-page](#36-light-tab-page--壁纸存储的最佳范式)
  - [3.7 Yet Another Speed Dial](#37-yet-another-speed-dial--把浏览器书签当数据库的范式)
  - [3.8 其他三个](#38-其他值得记住的三个)
  - [3.9 横向对比矩阵](#39-横向对比矩阵)
- [4. 可复用性评估：能不能"拿来就用"](#4-可复用性评估能不能拿来就用)

**第四部分：技术约束与设计**

- [5. MV3 平台约束与关键技术难点](#5-mv3-平台约束与关键技术难点)
  - [5.1 覆盖新标签页](#51-覆盖新标签页)
  - [5.2 权限策略](#52-权限策略最小权限--按需申请)
  - [5.3 `chrome.storage.sync` 真实容量与配额](#53-chromestoragesync--真实容量与配额实测推演)
  - [5.4 三条"同步"通道的对比与组合](#54-三条同步通道的对比与组合)
  - [5.5 图标与 Favicon](#55-图标与-favicon本赛道最容易翻车的地方)
  - [5.6 壁纸与大文件](#56-壁纸与大文件indexeddb--blob-url--cache-api)
  - [5.7 搜索联想](#57-搜索联想corshost_permissions-与静默失败)
  - [5.8 小组件数据](#58-小组件数据天气--农历--一言与离网可用)
  - [5.9 性能预算](#59-性能预算新标签页是按键级延迟敏感)
  - [5.10 上架合规风险](#510-上架合规风险本赛道最被低估的风险)
- [6. 数据模型与同步协议设计建议](#6-数据模型与同步协议设计建议)
- [7. 技术选型建议](#7-技术选型建议)

**第五部分：落地**

- [8. 实施路线图](#8-实施路线图)
- [9. 风险登记册](#9-风险登记册)

**第六部分：附录**

- [10. 附录](#10-附录)
  - [附录 A：开源项目完整索引](#附录-a开源项目完整索引含链接便于逐个复核)
  - [附录 B：关键 API / 配额速查](#附录-b关键-api--配额速查)
  - [附录 C：可直接照抄的清单](#附录-c可直接照抄的清单cheat-sheet)
  - [附录 D：明确未查证事项](#附录-d明确未查证--建议自行复核的事项)
  - [附录 E：参考资料](#附录-e参考资料)
  - [附录 F：外部依赖与合规总表](#附录-f外部依赖与合规总表按大陆可用--低合规风险--可闭源筛选)

---

## 0. 摘要（结论先行）

### 0.1 一句话结论

**存在大量高质量的开源「新标签页」项目，但没有一个能开箱即用地成为 Infinity 的完整平替。**

生态呈现明显的两极分化：

- 一类是**美学向起始页**（Tabliss、Bonjourr、tilde、mue）：视觉与动效优秀、工程规范好，但**没有"图标文件夹"这种信息架构**，也基本不做中文本地化；
- 另一类是**拨号盘 / 书签面板**（Yet Another Speed Dial、TabMark、Lemon New Tab、nightTab）：有分组、有大量快捷方式，但**缺少 Infinity 那种"图标 + 文件夹 + 便签待办 + 天气"的一体化仪表盘**；
- **nightTab 是唯一功能面接近 Infinity 的**，但它**零权限、纯本地、没有同步**（详见 §3.1）——它选择用"放弃系统集成与云同步"换取"零权限警告"。


### 0.2 三条可行路线

| 路线 | 做法 | 优点 | 致命问题 | 适用场景 |
| --- | --- | --- | --- | --- |
| **A. 直接 Fork 改造** | Fork `nightTab`（GPL-3.0）或 `anori`（AGPL-3.0） | 起步最快，功能覆盖度高 | **许可证传染**：GPL/AGPL 要求衍生作品同样开源。若将来想闭源分发、想上架商业版本，会被卡死。且这两个项目代码量已很大（nightTab 上百个组件目录），改造方需要先吃透别人的架构 | 只要自用 / 愿意开源 |
| **B. 白盒重写（推荐）** | 参考 `anori` 的插件化架构 + `nightTab` 的设置项设计 + `light-tab-page` 的壁纸缓存方案 + `TabMark` 的书签读取方案，自研一套 MIT 授权的干净实现 | 许可证自由、架构可控、代码量可控（MVP 约 6–10k 行）、可长期演进 | 需要 2–4 个月的实打实投入 | **绝大多数情况** |
| **C. 组合拼装** | 自己写"壳"（新标签页 + 图标网格 + 文件夹），把天气/待办等交给 iframe 小组件或第三方页面 | 最快出成果 | iframe 小组件受 `X-Frame-Options` 限制严重（BlueFatFish 的 README 已明确吐槽"不少站点发 X-Frame-Options，嵌不进去只能白屏"）；体验割裂 | 快速验证概念 |

### 0.3 五个必须先知道的"硬约束"

1. **`chrome.storage.sync` 只有 100 KB**，单条目上限 8 KB。这个容量决定了"同步"必须是**结构化小数据**，图片一律不能进去（详见 [§5.3](#53-chromestoragesync--真实容量与配额实测推演)）。
2. **`chrome.bookmarks` 是绕过 100 KB 限制的最佳通道**。浏览器的书签本身由 Chrome/Edge 同步，写进书签的数据不受扩展配额限制（`BookmarkTreeNode.syncing` 自 Chrome 134 起可直接判定）。Yet Another Speed Dial 正是靠这一招实现了"零成本跨设备同步"。
3. **一个扩展只能覆盖一个内置页**（`chrome_url_overrides` 只能选 `newtab` / `history` / `bookmarks` 之一），且**无痕窗口无法覆盖新标签页**。
4. **许可证**：本领域最活跃的几个项目 `nightTab` / `Tabliss` / `Bonjourr` / `Renewed Tab` 是 **GPL-3.0**，`anori` / `Lemon New Tab` 是 **AGPL-3.0**。只有 `light-tab-page`、`BlueFatFish`、`Sourcetab`、`mue`（BSD-3）是宽松许可。**"平替"如果要闭源或商业化，只有 B 路线可行。**
5. **上架合规**：Chrome 应用商店已出现"不得同时修改新标签页与搜索功能"的审核收紧（详见 §5.10），TabMark 作者已在 README 中公开说明该限制导致 Chrome 商店版本无法更新。

### 0.4 如果要"最小可行平替"，核心 20% 是什么

从 Infinity 官方功能页与用户评价中反复出现的诉求，真正决定"能不能替代"的只有 6 件事：

1. **图标网格 + 自定义图标/颜色/尺寸**（Infinity 的立身之本）
2. **图标文件夹**（官方单独一个演示区块，用户评价中高频提及"告别杂乱"）
3. **壁纸**（本地 + 在线 + 每日更新 + 模糊/压暗）
4. **一个能用的搜索框**（多引擎切换 + 联想）
5. **便签 / 待办**（Infinity 明确宣传"工作效率提升工具"）
6. **跨设备数据一致**（官方唯一付费感知点就是"云端备份"）

**天气**在 Infinity 的宣传里出现，但用户评价中权重低；**历史记录**同理。这两项可以放在 M3 之后。

---

## 1. 需求基线：Infinity 到底提供了什么

### 1.1 产品定位

- **中文名**：Infinity 新标签页（Chrome 商店条目名含 "Pro"）
- **官网**：`https://www.infinitytab.com/`（301 跳转至 `infinitytab.com`，提供 `/zh/` 中文版）
- **定位（官方原文）**：
  > "Infinity新标签页是全球最受欢迎的浏览器扩展程序之一，不仅能美化你的主页，还能有效提高生产力"
  > "Redefine your new tab"
- **形态**：纯浏览器扩展，通过 `chrome_url_overrides.newtab` 覆盖新标签页
- **变现**：以"云备份/多端同步"为卖点构建账号体系（详见 [§2.4.3](#243-商业模式真相不是订阅是联盟-cps)）

### 1.2 官方功能拆解

以下逐条来自官网首页区块（`infinitytab.com/zh/`），按官网展示顺序：

| # | 官方标题 | 官方描述关键词 | 技术含义 |
| --- | --- | --- | --- |
| 1 | 轻松管理常用网站 | 快速添加常用网站图标；**颜色、大小、布局均可自由定制** | 图标网格 + 单图标级样式覆盖（背景色、尺寸）+ 全局布局参数 |
| 2 | 图标文件夹 | 使用文件夹对图标**分组管理**，"**一键打开多个常用站点**" | 树形两级结构 + **文件夹批量打开**（这个功能很多开源项目没有） |
| 3 | 工作效率提升工具 | **笔记**和**待办事项**，"随手记录与管理各项任务" | 纯本地文本/任务列表，通常不需要后端 |
| 4 | 精选高清壁纸 | "**内置海量高清壁纸源**"，可**设置定时切换** | 壁纸 Provider 抽象 + 定时轮换（`chrome.alarms`） |
| 5 | 云端备份 | "云端备份实现**多端数据同步**" | 账号体系 + 自建后端 |
| 6 | 查看天气 | "随时查看天气近况" | 第三方天气 API |
| 7 | 书签管理 | "分类和管理你的书签" | `chrome.bookmarks` 读取 + 自有分组映射 |
| 8 | 历史记录 | "历史访问记录，一目了然" | `chrome.history`（需额外权限） |

### 1.3 用户真实评价中暴露的"刚需"

官网摘录的三条评价（本身带有宣传筛选，但仍有信息量）：

- *"用了好久了。界面简洁，网页刷新速度快。并且可以通过**自带的同步**进行数据同步，妈妈再也不担心我有 4 台电脑啦！"*
  → **多设备是核心痛点**；**"刷新速度快"被反复提及**。
- *"经历了 edge store 被攻陷的危机，也经历了其他大大小小的问题。但是唯一不变的是在 3 年里一直没改变的插件"*
  → **稳定性/长期可用性**是这类工具的生命线（对比：这个赛道上大量开源项目已经 2–3 年没更新）。
- *"极大地美化了新标签页——支持**常用网页的搜索**，**图标编辑功能**，对系统内存的**占用率也可以接受**"*
  → 图标编辑 + 内存占用是用户会主动打分的维度。

### 1.4 我们自己的需求假设（本报告据此评估）

根据你给出的约束，我把"平替"的目标锁定为：

| 维度 | 我们的取舍 | 对调研结论的影响 |
| --- | --- | --- |
| 平台 | Chrome / Edge，MV3 | 排除 MV2-only 的老项目；排除 Firefox-only、Safari-only |
| 同步 | `chrome.storage.sync` | 排除依赖自建后端才能用的方案（Renewed Tab 的同步要跑服务器）；重点关注"数据模型能否塞进 100 KB" |
| 数据主权 | 本地优先、无账号 | 排除 anori Plus / Infinity 这类订阅制核心能力 |
| 功能优先级 | 图标网格+文件夹 > 壁纸 > 搜索 > 便签待办 > 天气 | 决定了 §3 的深度剖析对象选择 |
| 交付形态 | 先"自用可跑"，再谈分发 | 但许可证仍按"未来可能分发"来评估，避免返工 |

> **关键提醒**：`chrome.storage.sync` 这个选择是整份预研里**约束最强的一条**，它直接决定了数据模型必须"小、可增量、可冲突消解"。§5.3 和 §6 会反复回到这一点。

---

## 2. 开源生态全景盘点

### 2.1 调研方法论（可复现）

> 本节说明"这些项目是怎么被找出来的"，便于后续你自己继续追踪。

采用的检索路径，按信噪比从高到低：

1. **GitHub Topics 页面**（比关键字搜索准确得多）：
   - `github.com/topics/new-tab-page`（275 个仓库）
   - `github.com/topics/newtab`（371 个）
   - `github.com/topics/startpage`（858 个）
   - `github.com/topics/speed-dial`（66 个）
   - 注意：`topics/speed-dial` 大量被 Android FAB 组件污染，需要人工过滤
2. **Awesome List**：`jnmcfly/awesome-startpage`（1.3k stars）—— 目前最完整的 startpage 索引，但**偏向极简/TUI 风格**，对本项目参考价值主要是"排除项"
3. **GitHub 仓库搜索**：`newtab in:name`、`<项目名> in:name`（后者用于精确定位单个项目）
4. **反查法**：从 awesome list 里的 Chrome 商店链接反查扩展 ID → 反查源码仓库
5. **中文侧关键词**：`新标签页 in:description`、`起始页 in:description` —— **注意这两个查询在 GitHub 搜索里会返回 1MB+ 的噪声结果**（大量把中文关键词堆在 description 里的非相关仓库），实际需要靠话题页 + 人工筛选

> **经验**：GitHub 的 `search_repositories` 对中文关键词几乎不可用；Topic 页 + 已知项目名反查才是正确姿势。

### 2.2 生态观察：为什么这个赛道"多产但少精品"

调研中一个有价值的定性判断：

1. **MVP 门槛极低，精品门槛极高**
   一个能跑的"新标签页"只需要 `chrome_url_overrides` + 一个 HTML + `localStorage`。这解释了为什么 Topic 下有几百个仓库、但 stars > 1000 的只有 5 个左右。

2. **头部项目的"技术债"集中在同一处：同步与迁移**
   - `nightTab`：仍在维护（v7.6.0，已升 MV3），但**刻意零权限**——没有 `storage` 权限、没有 bookmarks/history 集成，因此**它根本没有"同步"这个功能**，只有 JSON 导入导出。代价是约 90 个组件目录的历史包袱 + 全量重渲染。
   - `Tabliss`：`next.md` 里清晰列着 `handle conflicts` / `tombstone investigation` / `handle schemas` 三个未完成项 —— **这三项恰好就是"多设备同步"的三个必要件**。它的 `storage.sync` 同步在单设备上是对的，但多设备同时改同一 key 时**没有合并策略、没有墓碑、没有 schema 迁移**。
   - `Bonjourr`：是唯一把"同步"当成一等功能的项目（三档可选），说明**这个问题是可以被解决的**，只是需要专门设计。

3. **"功能最全"和"许可证最友好"基本不重叠**
   功能覆盖度最高的 `nightTab` / `anori` / `Lemon` 全是 copyleft；许可证宽松的 `light-tab-page`（无书签/无文件夹/无小组件）、`BlueFatFish`（无搜索框/无小组件）、`Sourcetab`（4 个小组件）功能都偏薄。**`mue`（BSD-3）是唯一例外**——它功能较全（小组件、书签、天气、便签），但生态偏冷。这是本次调研最重要的结构性发现。

4. **中文项目正在快速补位，但工程化程度参差**
   `Lemon New Tab`（柠檬起始页）在功能矩阵上已经非常接近 Infinity，且明确以"青柠起始页"为对标，README 里甚至有逐项功能对比表。但它自己在 README 里坦承"代码质量可能不高""包含大量 AI 生成代码，仅经过简单 Review"。

### 2.3 开源项目全量盘点

**分级说明**
- **S 级**：功能覆盖度接近 Infinity，值得作为主要参考/候选
- **A 级**：某一维度（架构 / 某功能 / 工程规范）有独特参考价值
- **B 级**：可用但定位不同（极简 / 特定风格）
- **C 级**：仅作生态填充参考

#### S 级（重点候选）

| 项目 | Stars | 语言 | 许可证 | MV3 | 一句话定位 | 关键能力 |
| --- | --- | --- | --- | --- | --- | --- |
| [zombieFox/nightTab](https://github.com/zombieFox/nightTab) | 2.1k | JS | **GPL-3.0** | ✅ | 中性风格新标签页，可自定义布局/样式/背景/书签 | **分组(Group)+图标+布局矩阵+主题引擎+自定义CSS**，功能最接近 Infinity |
| [joelshepherd/tabliss](https://github.com/joelshepherd/tabliss) | 2.8k | TS | **GPL-3.0** | ✅ | 漂亮的新标签页，多背景 + 多小组件 | **插件化小组件体系**（17 个 widget），`chrome.storage.sync` 同步 |
| [victrme/Bonjourr](https://github.com/victrme/Bonjourr) | 2.2k | TS | **GPL-3.0** | ✅ | iOS 风格极简起始页 | **同步方案最完整**（浏览器同步 / GitHub Gist / 远程 URL 三档） |
| [OlegWock/anori](https://github.com/OlegWock/anori) | 497 | TS | **AGPL-3.0** | ✅ | 用小组件自由拼装的新标签页 | **工程化天花板**：插件 SDK + Zod schema + HLC 混合逻辑时钟同步 + OPFS |
| [Redlnn/lemon-new-tab](https://github.com/Redlnn/lemon-new-tab) | 205 | TS/Vue | **AGPL-3.0** | ✅ | 「柠檬起始页」，明确对标青柠起始页 | **中文场景最完整**：Bing 每日壁纸 + 常访问 + 书签读写 + 分组分页 + 视频壁纸 + 农历 + 诗词 |
| [conceptualspace/yet-another-speed-dial](https://github.com/conceptualspace/yet-another-speed-dial) | 310 | JS | Fair-Source（自定义） | ✅ | 现代拨号盘 + 书签管理器 | **把 chrome.bookmarks 当数据库**：缩略图抓 og:image，书签同步交给浏览器 |
| [Alanrk/TabMark-Bookmark-New-Tab](https://github.com/Alanrk/TabMark-Bookmark-New-Tab) | 296 | JS | ⚠️ **无 LICENSE 文件** | ✅ | 把收藏夹变成新标签页 | 书签树 + 侧边栏（Alt+B）+ **书签文件夹一键全开** + 对比搜索；README 记录了商店审核受限 |

#### A 级（有独特参考价值）

| 项目 | Stars | 语言 | 许可证 | 独特价值 |
| --- | --- | --- | --- | --- |
| [devifish/light-tab-page](https://github.com/devifish/light-tab-page) | 191 | Vue 3 | **MIT** ✅ | **壁纸存储范式**：`localforage`(IndexedDB) 存 Blob + `URL.createObjectURL`；**设置导出/导入**实现干净（带 `_MARK_` 校验）；README 宣称加载 < 50ms |
| [mue/mue](https://github.com/mue/mue) | 771 | JS/React 19 | **BSD-3** ✅ | 许可证最友好的"功能齐全"项目；`blurhash` 壁纸占位（避免白屏闪烁）；Vite 7 + Bun 现代构建 |
| [Jestions-dev/BlueFatFish](https://github.com/Jestions-dev/BlueFatFish) | 504 | JS | **MIT** ✅ | **图标抓取三级降级**：`<link rel=icon>` → `/favicon.ico` → 主域名兜底 → 文字图标；壁纸支持"任意网页/B站/YouTube 自动转 iframe"；**`onMessageExternal` 对外 API 设计**（只允许 localhost 调用） |
| [dengxiwang/gotab-personal](https://github.com/dengxiwang/gotab-personal) | 310 | HTML | 未声明 | **自托管 + Docker 一键部署**路线：NAS/企业内网导航页，可作为"未来想自建后端"的参照 |
| [kubai087/lumno-extension](https://github.com/kubai087/lumno-extension) | 358 | TS | 未声明 | Spotlight 式命令面板 + 标签页/书签/历史模糊搜索（Raycast 风格），可作为**搜索框的进阶参考** |
| [the-wright-jamie/tab-nine](https://github.com/the-wright-jamie/tab-nine) | 153 | TS/React | MIT | 高度可定制，社区活跃（good-first-issue 友好），可作为**贡献流程/工程规范**参考 |
| [perfect-things/perfect-home](https://github.com/perfect-things/perfect-home) | 134 | Svelte | 未声明 | Svelte 技术栈，验证"轻量框架做新标签页"的可行性 |
| [snw-mint/fluent-new-tab](https://github.com/snw-mint/fluent-new-tab) | 66 | TS | 未声明 | Windows Fluent Design 2 风格，**Edge 用户审美偏好**参考 |
| [zombieFox/hexagonTab](https://github.com/zombieFox/hexagonTab) | 116 | JS | GPL-3.0 | 六边形网格布局（同作者，与 nightTab 共享设计语言） |
| [zombieFox/voltTab](https://github.com/zombieFox/voltTab) | 84 | CSS | GPL-3.0 | 同作者早期实验，**纯 CSS 主题**思路 |
| [Renewed Tab](https://gitlab.com/renewedtab/renewedtab) | — | TS/React | GPL-3.0 | **Web + 扩展双形态 + 自带 API 代理服务器**（解决 CORS；用 `favicon-api` 自托管图标） |
| [sourcetab/sourcetab](https://github.com/sourcetab/sourcetab) | — | TS | **MIT** ✅ | 小组件仪表盘（Link/Clock/Note/IFrame），Web/Chrome/Edge/Firefox 四端同源 |
| [widgetify-app/widgetify-extension](https://github.com/widgetify-app/widgetify-extension) | 201 | TS | 未声明 | 交互式小组件仪表盘，2025 年新项目，工程较新 |

#### B 级（极简 / 特定风格，作审美与"反面清单"参考）

| 项目 | Stars | 说明 |
| --- | --- | --- |
| [xvvvyz/tilde](https://github.com/xvvvyz/tilde) | 877 | 极简 HTML 起始页，UNLICENSE。**无扩展功能**，纯静态 |
| [migueravila/bento](https://github.com/migueravila/bento) | 2.2k | 极简 tile 起始页（**非扩展**，需配 New Tab Redirect） |
| [refact0r/re-start](https://github.com/refact0r/re-start) | 468 | TUI 风格，集成天气/Todoist |
| [the-glorious-startpage](https://github.com/manilarome/the-glorious-startpage) | — | "bloated and modern-looking"（作者自述），动态背景+天气 |
| [kholmogorov27/chevron](https://github.com/kholmogorov27/chevron) | 406 | 极简动画 + AI 集成 |
| [karakanb/devo](https://github.com/karakanb/devo) | 436 | GitHub Trending / HN / PH 信息流 |
| [thariqs/ai-newtab](https://github.com/ThariqS/ai-newtab) | 910 | 用 Claude 根据浏览历史生成新标签页（**隐私红线案例**） |
| [liminalpurr/jizhi](https://github.com/liminalpurr/jizhi) | 1131 | 中文古诗词 + p5.js 噪波动画，**中文审美参考** |
| [KorySchneider/tab](https://github.com/KorySchneider/tab) | 106 | 终端命令风格 |
| [fvrests/lavender](https://github.com/fvrests/lavender) | 51 | 粉彩风格 |
| [khmm12/minimal-chrome-tab](https://github.com/khmm12/minimal-chrome-tab) | 44 | SolidJS + PandaCSS，**资源占用导向** |
| [dmitthedazed/shimmer-tab](https://github.com/dmitthedazed/shimmer-tab) | 43 | Svelte，流动壁纸 + bangs 语法 |
| [Haojen/planet-tab](https://github.com/Haojen/planet-tab) | 99 | 3D 行星 + Vim key 支持 |
| [dengxiwang/funtabs](https://github.com/dengxiwang/funtabs) | 100 | React + Ant Design，中文向导航页 |
| [lucaseverett/easy-speed-dial](https://github.com/lucaseverett/easy-speed-dial) | 75 | TS + React，简单拨号盘 |
| [mo3shma/speedy-dial](https://github.com/mo3shma/speedy-dial) | 3 | MV3 + Liquid Glass / Material 3 双风格（**新项目，UI 参考**） |
| [thepropotato/open-slate](https://github.com/thepropotato/open-slate) | 3 | **18 个 widget + Cmd+K 命令面板 + 壁纸引擎**，权限按需申请（**架构理念参考**） |
| [海外/其他](https://github.com/topics/new-tab-page) | — | `hexagonTab`、`voltTab`、`pocketizer`、`markdown-new-tab` 等见 Topic 页 |

#### C 级 / 需排除

| 项目 | 排除原因 |
| --- | --- |
| `jimschubert/NewTab-Redirect`（561） | 只做"重定向到某个 URL"，无 UI |
| `cadeyrn/newtaboverride`（267） | Firefox 专用 |
| `darktrojan/newtabtools`（259） | **已归档（archived）** |
| `AstonJ/awesome-*` 类清单 | 非项目 |
| Android `FloatingActionButtonSpeedDial` 等 | 与浏览器无关（`speed-dial` topic 污染源） |

---


## 2.4 商业竞品地形（中文市场重点）

> 本节数据来自 Chrome 应用商店 / Edge 加载项详情页 / 产品官网 / 线上 JS bundle 的直接核验（2026-11-15 快照）。
> 标注：`[一手]` 官网·商店·源码直读；`[二手]` 用户评论或第三方；`未查证` 明确未核实。

### 2.4.1 玩家与体量

| 产品 | 定位 | 主体 | 用户量 | 评分 | 开源 |
| --- | --- | --- | --- | --- | --- |
| **Infinity 新标签页** | 老牌拨号盘 + 图标文件夹 | CQ Sentinel E-commerce（渝ICP备15002199号-10） | 40 万 | 4.5★ (11.8K) | ❌ |
| **Infinity 新标签页 (Pro)** | 同系列双线上架 | 同上 | 30 万 | **4.7★ (24.8K)** | ❌ |
| **iTab 新标签页** | 组件卡片首创者 | 西安新标签科技（陕ICP备2024024263号-2） | 30 万 | **3.1★ (5,867)** | ❌ |
| **WeTab** | 组件卡片（**与 Infinity 同团队**） | 同上（`infinitynewtab@gmail.com`） | 20 万 | **2.2★ (5,366)** | ❌ |
| **青柠起始页** | 极简**纯网页**起始页（非扩展） | 毛若昕 / 杨尚臻 · 热铁盒 retiehe（闽ICP备16025935号-2） | 未查证 | 不适用 | ❌ |
| 喵ingTab | 功能面最接近 Infinity 的新品 | 个人开发者 | **仅 4 人** | 5.0★ (1) | ❌ |
| Lemon New Tab | 本地优先、无账号 | Redlnn | 未查证 | **4.9★** | ✅ AGPL-3.0 |
| 轻标签页 | 极致轻量 | devifish | 未查证 | **4.9★** | ✅ **MIT** |
| TabMark | 书签 + AI 搜索 | Alanrk | 未查证 | 4.6★ | ⚠️ **无 LICENSE** |
| GoTab | **可 Docker 私有化部署** | dengxiwang | 未查证 | 未查证 | ⚠️ 未声明 |

### 2.4.2 关键情报：WeTab 与 Infinity 同源

三条独立证据：

1. WeTab 商店页的 **Developer Email 与 Infinity / Infinity Pro 一字不差**（`infinitynewtab@gmail.com`）；
2. Infinity 官网页眉公告原文：「📢 重磅回归！**WeTab 与 Infinity** 通过微软及安全团队代码审计，现已重新上架！」；
3. WeTab 商店描述自述「与 **Infinity New Tab**、iTab 等插件类似」。

**推论（对本项目极其重要）：**

- 该赛道头部玩家采用**双品牌矩阵**：Infinity 走"拨号盘 + 文件夹"，WeTab 走"组件卡片"，覆盖两种审美；
- **两家曾同时被下架，需通过微软安全团队代码审计才恢复**——这是该赛道最严重的一次信任事件；
- WeTab 2.2★ 的崩塌并未波及 Infinity 4.7★，因为**用户不知道两者同源**。

> **对开源平替的启示**：`"可审计（开源）+ 无隐藏同源关系 + 本地数据"` 是一套天然成立的叙事，而且是竞品**结构上无法复制**的。

### 2.4.3 商业模式真相：不是订阅，是联盟 CPS

| 产品 | 联盟分成 | 其他 |
| --- | --- | --- |
| **Infinity** | 隐私政策明列 **eBay / Amazon / Booking / AliExpress / 淘宝 / 京东**；并声明 "As an eBay Partner Network Affiliate, we earn from qualifying purchases" | Infinity AI **充值** |
| **iTab** | 隐私政策第 4 条标题即「**图标点击 CPS 广告**」，承认默认图标点击会产生广告收入 | AI 付费 |
| **WeTab** | 「部分搜索和图标链接包含**百度、京东、淘宝**等联属营销链接」 | WetabAI |
| **青柠** | ❌ 无联盟 | 捐赠制（"每月高昂的服务器费用，大部分由我们**从生活费中自费承担**"）+ 第三方 AI 工具**分成** |
| Lemon / 轻标签页 / TabMark / GoTab | ❌ | 捐赠 / CDN 赞助（腾讯 EdgeOne） / 赞赏码 |

**没有任何一家公开过 VIP 订阅价格**（Infinity `/pro` 返回 404）。这反证了：**这个品类的用户对付费极度不敏感，只能靠流量变现**。

> **本项目结论**：既然同步走 `chrome.storage.sync`（零后端成本），我们**根本不需要商业模式**。这反而是最大的自由度——可以做出"完全没有商业动机去篡改用户数据"的产品。

### 2.4.4 用户痛点实证（商店评论原声）

这些是可以直接写进 README 的"对标痛点"：

| 产品 | 痛点 | 用户原声 |
| --- | --- | --- |
| **iTab** | **篡改用户自定义图标 URL 为联盟链接** | *"Be careful. This extension tampers with your custom icon URL and replaces it with affiliate links. … The extension now appears at the top of every website."*（2 人标记有帮助） |
| **iTab** | 只支持中文（硬编码 `lang="zh"`） | *"界面很棒，但没有英文。整个界面硬编码中文"* |
| **Infinity** | **忘记密码 = 数据全灭，客服失联** | *"我用了很多年，某天被登出，账号密码都不工作，**丢掉了所有快捷方式且无法恢复备份**。点忘记密码，**验证码邮件始终收不到**。发邮件给开发者**无人回复**……试了 10–15 次"* |
| **Infinity** | 同步/图标长期故障 | *"Its been months now and **Icons still dont work**."* / *"**nothing is being read and syncing is failing**"* |
| **Infinity** | 缺暗色模式（尤其设置页） | *"唯一缺的是**暗色模式**，尤其设置界面。那一片白屏对深色主题用户太刺眼"* |
| **Infinity** | 不能上传动态壁纸 | *"最好用，但**不能上传动态壁纸**"* |
| **WeTab** | AI 组件依赖境外服务，国内直接报错 | *"ChatAI 出错了：This key is associated with a deactivated account."* |
| **WeTab** | 仅中文 + 体积 10.39 MiB（Infinity 的 2 倍） | 多条评论要求加英文 |

### 2.4.5 隐私姿态的矛盾点（最能打的差异化）

| 事实 | 证据 |
| --- | --- |
| Chrome 商店披露页写「**不会收集或使用你的数据**」 | Infinity 商店详情页 |
| 但隐私政策实际列明**服务端存储清单**：注册邮箱、头像、昵称、**非明文密码**、AI 输入与生成内容、自定义图标、自定义搜索引擎、**所在地区天气**、待办列表、**便签内容及其上传图片**、当前壁纸与**本地壁纸上传图**、其他设置项 | Infinity 隐私政策 |
| **手机号必填** | 「手机号码是履行法律法规及国家标准关于**网络实名制**要求的必要信息……可能无法为你提供部分功能」 |
| **青柠：加个快捷导航都要登录** | JS bundle 原文：`"捷径与账号云同步，请您先登录账号。"`、`"搜索引擎偏好设置与账号云同步，请您先登录账号。"` |
| **青柠有百度统计 + 自有埋点** | 页面加载 `hm.baidu.com/hm.js?df0646f4…`；实际请求 `POST api.limestart.cn/backend/counter-v2/event` |

> 💡 一句可以直接用作产品 slogan 的对照：
> **"你的快捷方式、便签、壁纸，永远只存在你两台电脑之间的浏览器同步里。没有我们的服务器，因为根本没有。"**

### 2.4.6 中文市场调研中"未能证实"的事项（避免误引）

| 项 | 结论 |
| --- | --- |
| **Tony Tab / 托尼新标签页** | Chrome 商店 3 种拼写检索、Edge 加载项检索**全部无结果**。疑似是 Infinity 官网页评价区用户署名「Tony Yu」被误记为产品名。**建议不作为竞品引用。** |
| **Vue Tab / 掬一捧 / Bilibili 相关新标签页** | 检索到的均为技术栈命名的个人小项目，**无成熟产品** |
| **Infinity / iTab / 青柠的具体会员价格** | 均未查到公开定价页（`/pro` 404、`/vip.html` 重定向、`/guide/` 403） |
| **百度浏览器自带新标签页现状** | 未核实，不作断言 |

### 2.4.7 一个直接相关的生态信号

调研中发现已有**专门的"Infinity 迁移"项目**：

> `IzzIsHOr/IzzI-Speed-Dial-Extension-for-Chrome` —
> *"**Imports from Infinity New Tab.** Speed dial for Chrome. Your own cropped icons, folders and pages, stored locally. **No telemetry, no icon CDN, no affiliate links.**"*

另有 `Boulea7/OpenInfinity`（TS，"open-source Chrome new tab for bookmarks, widgets, wallpapers"，但 star 极少）与 `qwert123q/tomorin-new-tab`（"inspired by Infinity New Tab"）。

> **这说明两件事**：① "想从 Infinity 迁出"的需求真实存在且被人识别；② 已经有人用了 `OpenInfinity` 这个名字，**命名需要避让**。

---

## 3. 重点项目源码级剖析

> 本章基于对仓库 `manifest` / `package.json` / 目录结构 / 核心模块源码的直接阅读，不是二手总结。

### 3.1 nightTab —— 功能最接近、但架构最"重"

**基本信息**

| 项 | 值 |
| --- | --- |
| 版本 | 7.6.0 |
| Manifest | **v3** |
| 构建 | Webpack（`webpack.common.js` / `.dev` / `.prod`）+ ESLint |
| 语言 | 纯 JavaScript（无 TS） |
| 许可证 | GPL-3.0 |

**Manifest 是本次调研中最"激进"的一份**（完整内容仅 12 行）：

```json
{
  "manifest_version": 3,
  "default_locale": "en_GB",
  "chrome_url_overrides": { "newtab": "index.html" }
}
```

**没有任何 `permissions`。** 这意味着：

- ✅ 安装时**零权限警告**，商店审核最容易过，用户信任度最高
- ❌ 无法使用 `chrome.storage`（所以它必须自己解决持久化）
- ❌ 无法读取书签/历史，所有"书签"都是**用户手工录入的自有数据**
- ❌ 无法做真正的跨设备同步（它的"导入/导出 JSON"就是全部）

> **这是本报告最重要的单点发现**：nightTab 用"零权限"换来了最低的审核摩擦，代价是彻底放弃系统数据集成与同步。Infinity 走的是相反的路（要书签、要历史、要账号）。

**架构：`src/component/` 下 ~90 个目录，每个目录 = 一个 UI 组件**

从目录名可以直接读出它的功能矩阵：

```
bookmark / bookmarkTile / bookmarkForm / bookmarkPreview / bookmarkPreset / bookmarkEmpty
group / groupArea / groupAndBookmark / groupForm / groupDefault / groupEmpty
header / headerItem / clock / date / greeting / transitional / search / suggest / searchEnginePreset
layout / body / edge / shade / shadeBar / theme / themePreset / customTheme / customThemeForm / presetThemeTile
toolbar / toolbarControl / menu / menuFrame / menuNav / menuContent / modal / alert / form / dropdown
importForm / keyboard / keyboardShortcut / pageLock / splash / update / updateLegacy / version / video / fontawesome
```

**它的设置状态模型（`src/component/state/index.js`）几乎是 Infinity 的完整镜像**，可以直接当作我们的"设置项清单"参考：

| 区块 | 字段（节选） | 说明 |
| --- | --- | --- |
| `layout` | `area.header.width/justify`、`area.bookmark.width/justify`、`alignment`（9 宫格：`top-left`…`bottom-right`）、`order`（`header-bookmark`/`bookmark-header`）、`direction`、`size`、`width`、`padding`、`gutter`、`breakpoint`、`scrollbar`、`title`、`favicon`、`overscroll` | **布局被参数化到极端**，9 宫格对齐 + 双区域宽度 + 间距/内边距 全可调 |
| `header` | `greeting`、`transitional`（时间与日期合体）、`clock`（时/分/秒/分隔符/AM-PM/24h/字号/换行）、`date`（日/月/年/序数/词长/格式）、`search`（宽度策略 auto/custom、引擎、自定义引擎{name,url,queryName}、字号、新标签打开） | 时钟/日期的**粒度细到"分隔符文本"** |
| `bookmark` | `size`、`url.show`、`line.show`、`shadow.show`、`hoverScale.show`、`orientation`(top/bottom)、`style`(**block / list**)、`newTab`、`edit`、`add` | 两种图标视图模式 |
| `group` | `area.justify`、`order`、`name.size`、`toolbar.size`、`edit`、`add` | 分组（=Infinity 的文件夹） |
| `toolbar` | `location`、`position`、`size`、`accent`、`add`、`edit`、`newLine` | 工具条可停靠 |
| `theme` | `color.range.primary`(h,s)、`contrast.start/end`、`shades`、`accent`(hsl/rgb/**random**/**cycle**{speed,step})、`font.display/ui`、`background`(type: **theme/color/gradient/image/video**，每种带 blur/grayscale/scale/accent/opacity/vignette)、`opacity`、`layout/header/bookmark` 分区块颜色、`style`(dark)、`radius`、`shadow`、`shade`、`custom`(自定义主题列表) | **主题引擎 = 色相范围 + 对比度区间 + 自动生成 14 级色阶**；强调色支持"随机"与"循环渐变" |
| `state.minMax` | 上述几乎每个数值都有 `{min, max}` | 滑杆的边界独立维护，说明作者刻意把"可调参数"当成一等公民 |

**数据结构（书签模型）**

从 `src/component/bookmark/index.js` 反推：

```
bookmark.all = [
  {  // 每个 group
    items: [ /* bookmark.link[] */ ],
    ...group 级 display / accent / color / border
  }
]

bookmark.link = {
  url, name?, display: {
    visual: { show, size, letter: {text}, icon: {prefix, name}, shadow },
    name:   { show, size, text },
    gutter, rotate, translate, alignment, direction, order
  },
  accent, color: {opacity}, border
}
```

编辑逻辑用"暂存对象"模式：`StagedBookmark` / `StagedGroup` 承载编辑态，提交时才 `bookmark.item.mod.add/edit/move/remove` 真正改写数组，并支持**批量传播（propagate）**——把当前图标的"显示样式 / 布局属性 / 主题色"一键应用到所有图标。**这个"批量应用样式"能力是 Infinity 有、而几乎所有开源项目都没有的**，强烈建议继承。

**排序**基于 `sortablejs` 拖拽 + 三种自动排序（按首字母 / 按图标名 / 按名称），排序算法在 `src/utility/sortArrayOfObject.js` 里按 `'display.visual.letter.text'` 这类**路径字符串**取值，简单够用。

**代码质量评价**

- 👍 组件化彻底，每个组件一个目录（`index.js` + `index.css`），可读性好
- 👍 纯手写 DOM（`node()` / `complexNode()` 工具函数），**没有框架依赖，运行时体积极小**
- 👎 存储用 `localStorage`（`initialBackground.js` / `data.save()`），**在 MV3 下不可靠**（清历史会丢、service worker 里根本拿不到）
- 👎 全量重渲染（`groupAndBookmark.render()` 在每次操作后整体重建），图标多时会有明显卡顿
- 👎 无 TS、无测试，`state` 是全局可变单例，改造时极易踩雷

**结论**：**功能清单是金矿，代码不是。** 建议把 `state/index.js` 当作需求规格书来读，实现自己写。

---

### 3.2 Tabliss —— 插件化小组件体系的教科书

**基本信息**

| 项 | 值 |
| --- | --- |
| 版本 | 2.6.0 |
| Manifest | **v3**，`permissions: ["storage"]` |
| 技术栈 | TypeScript + React + Webpack + Jest |
| 许可证 | GPL-3.0 |

**Manifest（完整）：**

```json
{
  "manifest_version": 3,
  "name": "Tabliss - A Beautiful New Tab",
  "description": "... does not require any permissions.",
  "chrome_url_overrides": { "newtab": "index.html" },
  "permissions": ["storage"]
}
```

注意描述里那句 *"does not require any permissions"* —— 只声明了 `storage`，而 `storage` 不触发用户可见警告。**这是"最小权限 + 有同步"的最优平衡点**，也是我们应该对标的基线。

**插件体系（`src/plugins/`）**

```
plugins/
├── backgrounds/   colour | giphy | gradient | image | unsplash
├── widgets/       css | github | greeting | ipInfo | joke | js | links | literatureClock
│                  message | nba | notes | quote | search | time | todo | weather | workHours
├── shared/
├── plugins.ts     → getConfig(key)
└── types.ts
```

每个插件是一个自包含目录，导出 `{ key, name, description, ... }` 配置对象 + 一个 React 组件 + 一个 `types.ts`（含 `defaultData`）。

**这个"背景/小组件 = 同一种插件"的抽象非常漂亮**：墙体（background）和小组件（widget）共享同一套 `BackgroundConfig | WidgetConfig` 接口，编辑器 UI 完全复用。

**状态与存储（`src/db/state.ts`）—— 本次调研中关于 `chrome.storage.sync` 最有价值的一段代码**

```ts
export interface State {
  background: BackgroundState;
  [key: `widget/${string}`]: WidgetState | null;   // 每个 widget 实例一个 key
  [key: `data/${string}`]: unknown;                // 插件自定义数据
  focus: boolean;
  locale: string;
  timeZone: string | null;
}

export const dbStorage =
  BUILD_TARGET === "web"
    ? Storage.indexeddb(db, "tabliss/config")
    : Storage.extension(db, "tabliss/config", "sync");      // ← 扩展走 sync

export const cacheStorage =
  BUILD_TARGET === "firefox"
    ? Storage.extension(cache, "tabliss/cache", "local")
    : Storage.indexeddb(cache, "tabliss/cache");            // ← 缓存走 IDB / local
}
```

**三点直接可复用的经验：**

1. **`state` 用"扁平 key 空间 + 类型前缀"**（`widget/xxx`、`data/xxx`），而不是嵌套对象。这天然适配 `chrome.storage` 的 key-value 模型，也让"只改一个 widget"只写一个 key。
2. **配置 → `storage.sync`，缓存 → `indexeddb`/`local`** 的**双通道分离**。缓存（如图片 URL、API 响应）绝不能进 sync，否则 100 KB 立刻爆。
3. **同一份代码用 `BUILD_TARGET` 编译成 web / chromium / firefox 三种目标**，web 版自动退化为 IndexedDB。这个多目标构建思路值得抄。

**存储实现（`src/lib/db/storage.ts`）**

```ts
// 拉取：把所有以 `name` 为前缀的 key 灌进内存 DB
await storageArea.get().then((stored) =>
  Object.keys(stored)
    .filter((key) => key.startsWith(name))
    .forEach((key) => DB.put(db, key.substring(name.length + 1), stored[key]))
);

// 推送：批量 set 更新 + 批量 remove 删除，防抖 flush
storageArea.set(updates).catch(...)
storageArea.remove(deletes).catch(...)
```

**优点**：`batch(flush, timeout = 0)` 把同一 tick 内的多次写入合并成**一次** `set()` —— 直接对应 §5.3 讲的"写操作配额"优化。
**缺点（也是它自己承认的）**：`src/lib/db/next.md` 里明确留了三个 TODO：

```markdown
- [ ] handle conflicts
- [ ] tombstone investigation
- [ ] (way later) handle schemas
```

> **这三项就是"多设备同步"的全部难点**。Tabliss 的结构在单设备上是对的，但两个设备同时改同一个 key 时**没有合并策略、没有墓碑（删除标记）、没有 schema 迁移**。我们自己做时必须补上（见 §6）。

`next.md` 里还有一条很有价值的想法：
`- [ ] possibly use a broadcastchannel to sync changes cross tabs?`
→ 说明"同一浏览器多标签页之间的状态同步"也是真实痛点（用户开 5 个新标签页 = 5 个独立实例）。

---

### 3.3 Bonjourr —— 同步方案设计的标杆

**基本信息**

| 项 | 值 |
| --- | --- |
| 版本 | 22.3.0（版本号进化到 22，说明迭代极其频繁） |
| Manifest | **v3**（Chromium 版）；`offline_enabled: true`；`background.service_worker` |
| 技术栈 | TypeScript + Deno（`deno.json` / `deno.lock`，注意：**用 Deno 做构建/测试**，不常见） |
| 许可证 | GPL-3.0 |

**Manifest 的权限设计值得逐行抄：**

```json
"permissions": ["storage"],
"optional_permissions": ["bookmarks", "topSites", "search"]
```

**必修项只有 `storage`**；书签、常访问、搜索引擎全部做成 **optional**，用 `chrome.permissions.request()` 在用户真正开启对应功能时才申请。这是 MV3 时代"既要功能、又要低安装摩擦"的标准答案（`anori` 用的是同一套策略，见 §3.4）。

**功能矩阵（`src/scripts/features/`）**

```
backgrounds/  clock/  contextmenu.ts  css.ts  csseditor.ts  fonts.ts  hide.ts
links/  move/  notes.ts  others.ts  pomodoro.ts  popup.ts  quotes.ts
searchbar.ts  supporters.ts  synchronization/  weather/
```

注意它**有 `pomodoro`（番茄钟）而 nightTab 没有**，且有 `csseditor`（内置 CSS 编辑器）与 `fonts`（自定义字体）—— 这是"极客向"和"大众向"的分野。

**同步架构（`src/scripts/storage.ts` + `features/synchronization/`）—— 全生态最完整**

```
StorageType = 'webext-sync' | 'webext-local' | 'localstorage'
```

| 模式 | 触发条件 | 数据落点 | 用途 |
| --- | --- | --- | --- |
| `webext-sync` | 有 `chrome.storage`（默认） | `chrome.storage.sync` | 标准浏览器同步 |
| `webext-local` | 用户把 `syncStorage` 开关关掉 | `chrome.storage.local` 下的单个 `syncStorage` 键 | **"我不想同步"的逃生舱**（避免 100 KB 配额与隐私顾虑） |
| `localstorage` | 非扩展环境（web 版） | `localStorage.bonjourr` | 网页版 |

**最精彩的是 `features/synchronization/` 里的三档同步：**

```ts
// index.ts
type SyncType = 'browser' | 'gist' | 'url' | 'off'

if (update.down) {
  if (local.syncType === 'gist') {
    const update = await retrieveGist(token, id);   // 从 GitHub Gist 拉
    storage.sync.set(update);
  }
  if (local.syncType === 'url') {
    const update = await receiveFromURL(local.distantUrl);  // 从任意 URL 拉（只读）
    storage.sync.set(update);
  }
}
if (update.up) {
  if (local.syncType === 'gist') {
    const id = await sendGist(token, local.gistId, data);   // 推到 GitHub Gist
  }
}
```

**这套设计的价值：**

1. **`browser`（`chrome.storage.sync`）做默认**，符合你选定的方案；
2. **`gist` 做"穷人的云同步"**：用户自备 GitHub Token，数据存在自己的 Gist 里 —— **零后端成本、零隐私风险、可版本回溯（Gist 有 history）**；
3. **`url` 做"只读下发"**：适合"团队统一配置"或"作者发布推荐配置"场景；
4. **`off` 做纯本地**。

> **强烈建议直接照搬这个三档模型**。它完美解决了"`chrome.storage.sync` 只有 100 KB + 中国大陆用户 Chrome 同步经常不可用"的双重困境：Gist 方案在墙内可通过 GitHub 镜像/代理使用，且用户能直观理解"我的数据在哪"。

**还有一个细节**：代码里有 `handleStoragePersistence()` → `navigator.storage.persist()`。这是在请求"持久化存储"，避免浏览器在磁盘紧张时把 IndexedDB 清掉。**如果你要存用户壁纸，这一步必须做**，否则用户某天开机发现壁纸没了。

**数据类型（`src/types/sync.ts`）** 是目前见到最完整的 `Sync` 契约，字段规模约 60+，覆盖：

```ts
advanced / showall / quicklinks / time / main / pagegap / pagewidth / linksrow
linkiconradius / linkstyle('large'|'medium'|'small'|'inline'|'text') / linknewtab
linktitles / linkbackgrounds / linkgroups{on,selected,groups[],pinned[],synced[]}
textShadow / cssHeight / review / announcements / supporters / css / lang / favicon / tabtitle
greeting / greetingsize / greetingsmode / greetingscustom{morning,afternoon,evening,night}
notes / hide / dark / dateformat / backgrounds{...} / clock{...} / analogstyle
worldclocks[] / weather{...} / searchbar{...} / quotes{...} / pomodoro{...} / font / move{...} / about
```

其中 **`linkstyle` 有 5 档（large/medium/small/inline/text）**、**`dark` 有 4 态（auto/system/enable/disable）**、**`dateformat` 有 3 态（auto/eu/us/cn）** —— 注意它专门给了 `cn` 一个日期格式档位，这是**中文日期习惯被单独建模**的例子，值得学习。

`LinkGroups` 尤其值得注意：

```ts
interface LinkGroups {
  on: boolean
  selected: string
  groups: string[]      // 全部分组
  pinned: string[]      // 固定的分组
  synced: string[]      // 参与同步的分组 ← 分组级同步开关！
}
```

**分组粒度的同步开关**（`synced[]`）—— 用户可以只同步"工作"分组，不同步"私人"分组。这是 Infinity 没有的能力。

---

### 3.4 anori —— 工程化天花板，也是"现代新标签页"该长成的样子

**基本信息**

| 项 | 值 |
| --- | --- |
| 版本 | 2.3.2 |
| Manifest | **v3**（Chromium）/ 自动降级为 **v2**（Firefox） |
| 技术栈 | TypeScript + React 19 + Rspack + PandaCSS + Biome + Vitest + Playwright |
| 包管理 | pnpm 10（`packageManager` 字段锁定版本） |
| 许可证 | **AGPL-3.0**（早于某个 commit 是 MIT） |
| 最低版本 | `minimum_chrome_version: "132"` |

**Manifest 是全生态最精细的一份（`build_helpers/manifest.ts` 里程序化生成）：**

```ts
permissions: [
  "alarms", "storage", "unlimitedStorage", "activeTab",
  "sessions", "contextMenus", "system.cpu", "system.memory",
],
optional_permissions: [
  "tabs", "favicon", "topSites", "bookmarks", "tabGroups",
  "declarativeNetRequestWithHostAccess", "browsingData",
],
optional_host_permissions: ["*://*/*"],
web_accessible_resources: [{ resources: ["/assets/*", "/chunks/*"], matches: ["<all_urls>"], use_dynamic_url: true }]
```

值得学的三个点：

1. **`unlimitedStorage`** 放必修项 —— 因为它要在本地存壁纸/图片/OPFS 文件。
2. **`system.cpu` / `system.memory`** 支撑了它的"系统负载"小组件（Firefox 无此 API，故在 Firefox 分支里被过滤掉）。
3. **`use_dynamic_url: true`** 于 `web_accessible_resources` —— 让扩展资源 URL 随机化，防止网站指纹识别已安装的扩展。**这是隐私向的细节加分项**，我们如果做 `_favicon` 外露应当同款处理。
4. **同一份 manifest 用函数生成，按 `targetBrowser` 打补丁**（`chrome` / `chrome-all-permissions` / `firefox`），Firefox 分支里手工做 `manifest_version = 2`、`action → browser_action`、`background.service_worker → background.scripts`、`web_accessible_resources` 结构降级。**如果你将来要支持 Firefox，这个 `generateManifest()` 就是模板。**

**插件（widget）清单（`src/plugins/`）**

```
anki / blueprint / bookmark / calendar / datetime / iframe / math / motivation
notes / picture / rss / system-status / tabs / tasks / top-sites / weather / test
```

对应 README 里的 19 个小组件，包括几个很有意思的：
- `motivation`：日/周/月/年进度、**人生进度**、年龄计时器、每日聚焦、天数计数器
- `tabs`：**最近关闭的标签页**（`chrome.sessions`）、**其他设备的标签页**（`chrome.sessions.getDevices`）、**标签暂存（tab stash）**
- `anki`：Anki 抽认卡集成
- `system-status`：CPU / 内存（Chrome only）

**`blueprint` 插件 = 一个完整的"小组件 SDK 骨架"（`src/plugins/blueprint/`）**

```
blueprint/
├── background.ts          # 后台任务入口
├── blueprint-plugin.ts    # 插件定义
├── messaging.ts           # 强类型消息通道
├── storage.ts             # widget 级存储
├── types.ts               # Zod schema
└── widgets/               # 该插件的多个 widget 变体
```

`types.ts` 展示了它的三层配置模型（**这是我见过最清晰的小组件配置分层**）：

```ts
// 1) 每个 widget 实例的配置（用户为这个卡片单独设置）
export const blueprintWidgetConfigSchema = z.object({
  title: z.string(),
  showIcon: z.boolean(),
});

// 2) 插件级配置（同一插件的所有 widget 共享，例如 API Key / 登录态）
export const blueprintPluginConfigSchema = z.object({
  apiKey: z.string(),
});

// 3) 强类型消息契约（前台 widget ↔ 后台 service worker）
export type BlueprintMessageHandlers = {
  fetchData: { args: { query: string }; result: { items: string[] } };
};

// 4) widget 级存储
export type BlueprintWidgetStore = { lastRefreshed: number | null };
```

> **这四层（widget 配置 / plugin 配置 / 消息契约 / widget 存储）就是"小组件系统"的最小完备集。** 如果我们自研，直接照这个分层建目录即可。

**同步架构（`src/cloud-integration/`）—— 目前最先进的实现**

目录结构：

```
anori-plus-settings.tsx      # Anori+ 订阅设置 UI
api-client.ts / auth.ts      # API 客户端 + 认证
device-id.ts / device-name.ts / device-registration.ts   # 设备注册（每个设备一个身份）
subscription-client.ts       # 订阅状态（WebSocket 实时推送）
sync-manager.ts              # 核心同步引擎
synced-tabs-subscription.ts  # "其他设备标签页"的实时订阅
```

`sync-manager.ts` 的技术要点（这是**分布式同步的教科书实现**）：

| 机制 | 实现 | 为什么需要 |
| --- | --- | --- |
| **HLC（混合逻辑时钟）** | `hlc: { pt: number, lc: number, node: string }`，`compareHlc()` 比较 | 跨设备的"谁更新"不能信系统时钟（时钟漂移/时区/手动改时间），HLC 是无中心因果序的标准解 |
| **逐 key LWW 合并** | `mergeByHlc()`：`compareHlc(record.hlc, existing.hlc) > 0` 才覆盖 | 冲突消解，粒度到单 key |
| **Outbox 模式** | 本地改动先进 outbox，`OUTBOX_FLUSH_DEBOUNCE_MS = 500` 防抖后批量推送 | 减少网络请求 + 保证不丢改动 |
| **增量同步 + 全量兜底** | `deltaSync({sinceSeq})`；捕获 `CommitLogPrunedError` 后降级为 `fullSync()` | 服务端 commit log 会被裁剪 |
| **多 scope 同步** | `profile`（绑定云配置）与 `user`（账号级全局）**独立路由、独立版本门控** | 一个 scope 出问题不会拖垮另一个 |
| **Schema 版本门控** | 三种状态：`remote > local`（暂停，只读不写）/ `remote < local`（触发云端迁移）/ `syncedVersion < local`（强制拉取，本地编辑进备份） | **多版本扩展共存**是真实场景（用户 A 没更新、用户 B 更新了） |
| **删除墓碑** | `RemoteCell.deleted: boolean`，`KvMutation.deleted` | 没有墓碑就无法区分"没同步到"和"被删了" |
| **大文件走独立通道** | `downloadFileBlobs()`：文件单独存 OPFS，同步时只传 `fileDownloadUrl`，本地已存在（`fileExists(path)`）则跳过 | 100 KB 的 KV 通道放不下任何二进制 |
| **更新前备份** | `capturePreUpdateBackup()` | 迁移失败可回滚 |

**对我们的启发（重要）**：

`chrome.storage.sync` **没有服务端 merge**，是纯 LWW per key。所以：

- **HLC 仍然值得用**（即使没有服务端），因为它让我们在**客户端之间**判断谁更新更可靠，并能写出确定性的合并函数；
- **墓碑必须有**；
- **"大文件走独立通道"是必须的**（换成 IndexedDB）。

但**不要**照抄它的复杂度：`SyncManager` 里 `profile/user` 双 scope、schema 升级竞态、WebSocket 订阅，这些是"有自建后端 + 有订阅付费"才需要的。我们要做的是它的**1/5**。

**许可证警告**：anori 是 **AGPL-3.0**。AGPL 对"网络服务"有额外条款，但浏览器扩展是**分发给用户的软件**，实际效果接近 GPL-3.0：**你分发的衍生版本必须提供完整源码**。如果你只是自己用，无所谓；一旦想上架商店闭源分发，不可行。

---

### 3.5 Lemon New Tab（柠檬起始页）—— 中文场景最完整的参考

**基本信息**

| 项 | 值 |
| --- | --- |
| Stars | 205 |
| 技术栈 | Vue 3 (TS) + Element Plus + **WXT** + Vite |
| 许可证 | **AGPL-3.0**（README 明确说明：v3.2.3 之前是 MIT，之后改为 AGPL） |
| 支持 | Chrome ≥116 / Edge ≥116 / Firefox ≥128 |

**为什么它重要**：它**明确对标「青柠起始页」**（limestart.cn，中文区最流行的闭源起始页之一），README 里直接贴了一张逐项功能对比表：

| 功能 | 柠檬起始页 | 青柠起始页 |
| --- | --- | --- |
| 最常访问网站 | ✅ | ❌ |
| 查找浏览器书签 | ✅ | ❌ |
| 自定义壁纸 | ✅ | ✅ |
| 动态主题色（莫奈取色） | ✅ | ❌ |
| 深色模式 | ✅ | ✅ |
| 视频壁纸 | ✅ | ✅ |
| 一言 | ✅ | ✅ |
| 自定义快速导航 | ✅ | ✅（需注册账号） |
| 自定义搜索引擎 | ✅ | ✅（需注册账号） |
| 便签 | ✅ | ✅ |
| **天气** | ❌ | ✅ |
| 个人项目推广 | ❌ | ✅ |

**这张表本身就是一份极好的"中文用户需求排序"**。注意作者吐槽的核心痛点（写在"为什么会有这个扩展"里）：

> - "青柠起始页是一个**每次打开都会进行一次 http 请求的网页**，准确来讲其实是导航页而不是起始页（非常不能理解为什么要放在服务器上）"
> - "**不是原生浏览器扩展**，不支持展示经常访问网站"
> - "**怎么会有新标签页添加个快速导航或者搜索引擎都要注册账号的**"

这三条精准命中了 Infinity / iTab / 青柠这类产品的通病：**重度云端化 → 首屏依赖网络 + 数据主权缺失 + 强制账号**。**这正是我们"平替"最应该打的差异化点。**

**`wxt.config.ts` —— 一份可直接抄的"中文扩展 manifest 清单"**

```ts
const baseManifest = {
  default_locale: 'en',
  host_permissions: [
    'https://www.bing.com/',        // Bing 每日壁纸
    'https://api.bing.com/',        // Bing 搜索建议
    'https://suggestion.baidu.com/',// 百度搜索建议
    'https://suggestqueries.google.com/', // Google 搜索建议
    'https://v2.jinrishici.com/',   // 今日诗词
    'https://v1.hitokoto.cn/',      // 一言
  ],
}

const chromeManifest = {
  permissions: ['topSites','storage','favicon','bookmarks','activeTab','tabs','scripting','alarms'],
  optional_permissions: ['webRequest','history'],
  optional_host_permissions: ['*://*/*'],
}
```

**这张 `permissions` 列表基本就是"Infinity 类产品"的最小权限集**：

| 权限 | 用途 | 是否可做成 optional |
| --- | --- | --- |
| `storage` | 配置持久化 | 否（必须） |
| `topSites` | "最常访问" | **是**（用户不开就不显示该区块） |
| `favicon` | `_favicon` API 取站点图标 | **是** |
| `bookmarks` | 读写浏览器书签 | **是** |
| `activeTab` | 当前标签页（如"添加到导航"右键菜单） | **是** |
| `tabs` | 标签页 URL/标题（书签匹配、标签管理） | **是** |
| `scripting` | 注入脚本取 `og:image` / `<link rel=icon>` | **是** |
| `alarms` | 壁纸定时切换、天气定时刷新 | **是**（MV3 里 service worker 会被杀，定时必须靠 alarms） |
| `history` | 历史记录 | **是** |

**它明确标注的已知问题也很有价值**：

> "部分 Windows 设备上的 Chromium 内核浏览器会在启动时卡死，**禁用 GPU 硬件加速**或者在 `chrome://flags/#use-angle` 把 **Choose ANGLE graphics backend** 改为 `OpenGL` 后可缓解"

→ **壁纸/视频壁纸 + CSS `backdrop-filter` 模糊的组合，会让部分显卡驱动崩**。这是我们必须提前设计的降级开关（见 §5.9）。

**开发方式**：`WXT` 框架（`entrypoints/` 目录 = `background` / `newtab` / `popup`，框架自动生成 manifest）。这是我们**推荐的技术栈之一**（见 §7）。

---

### 3.6 light-tab-page —— 壁纸存储的最佳范式

**基本信息**

| 项 | 值 |
| --- | --- |
| 技术栈 | Vue 3 + Pinia + Vue Router + Vite + Ant Design Vue |
| 许可证 | **MIT**（许可证最友好且质量可接受的一个） |
| 定位 | "轻量简洁"，明确砍掉一切非核心功能 |

**它明确不做的事**（README 特性列表）：只有深色模式、搜索引擎/建议、自定义搜索、高度可定制、Bing 每日壁纸、主题色切换、最近搜索/浏览导航。**没有书签、没有文件夹、没有天气、没有同步。**

**但它的壁纸实现（`src/store/setting.ts`）是全生态最干净的一版，建议直接抄思路：**

```ts
async uploadBackgroundImage(imageFile: File) {
  const id  = uuid()
  const url = URL.createObjectURL(imageFile)   // ① 立刻拿到可显示的 Blob URL
  const url_old = this.background.url

  await wallpaperStore.clear()                 // ② 只保留一张，先清旧的
  if (url_old && isObjectURL(url_old)) {
    URL.revokeObjectURL(url_old)               // ③ 关键：手动释放，否则内存泄漏
  }

  await wallpaperStore.setItem<Blob>(id, imageFile)  // ④ localforage(IndexedDB) 存原始 Blob
  copy({ id, url }, this.background)           // ⑤ 配置里只存 id + 临时 url
}

async reloadBackgroundImage() {
  const file = await wallpaperStore.getItem<Blob>(this.background.id)
  if (file && isImageFile(file)) {
    this.background.url = URL.createObjectURL(file)   // ⑥ 每次开新标签页重建 URL
  } else {
    this.background.id = null
    await wallpaperStore.removeItem(this.background.id) // ⑦ 数据坏了自动清理
  }
}
```

**七个步骤每一步都是必需的**。核心洞察：

> **Blob URL 的生命周期 = 当前页面会话。** 配置里**永远不要存 `blob:` URL**（刷新后失效），只存 **IndexedDB 里的 key**；每次新标签页打开时用 key 重新 `createObjectURL`。这是 MV3 新标签页最正确的壁纸方案。

**另外两个细节：**

1. **`loadWallpaperPalette()`**：`fromUrl(url)` 提取主色 → 写入 `theme.colorPalette`，实现"**跟着壁纸变主题色**"。这是 Infinity 有、Lemon 有（"莫奈取色"）、而多数开源项目没有的能力，**实现成本很低、观感收益极高**。
2. **导入/导出的校验**：

```ts
const BACKUP_FILE_MARK = "_MARK_"
// 导出
JSON.stringify({ [BACKUP_FILE_MARK]: npm_package_name, ...window.localStorage })
// 导入
if (data[BACKUP_FILE_MARK] !== npm_package_name) throw new Error("备份文件已损坏")
```

用包名做"文件指纹"，防止用户导入别的扩展的备份。**极简但有效**，可以升级成 `{ mark, schemaVersion, appId, exportedAt, data }`。

**它的一个明显缺陷**：设置全部塞在 `localStorage`（`window.localStorage` 直接被 spread 导出），**没有 `chrome.storage`**，所以：无同步、清浏览数据会丢、无法在 service worker 里访问。

---

### 3.7 Yet Another Speed Dial —— "把浏览器书签当数据库"的范式

**基本信息**

| 项 | 值 |
| --- | --- |
| Stars | 310 |
| 语言 | JavaScript |
| 许可证 | **Fair-Source**（自定义，见下文） |
| 支持 | Brave / Chrome / Edge / Firefox / Opera / Vivaldi |

**README 里的三句话，每一句都是一个架构决策：**

> - "**Automatically fetches site thumbnails using open graph standard**"
> - "**Uses the native bookmarks library so speed dials can be synced by the browser**"
> - "Lightning fast UI: no ads, trackers, or bs"

**这个项目的核心洞察：把 `chrome.bookmarks` 当成数据库，把"同步"外包给浏览器。**

代价与收益：

| | 用 `chrome.bookmarks` 当数据库 | 用 `chrome.storage.sync` 当数据库 |
| --- | --- | --- |
| 容量 | **几乎无上限**（受浏览器书签限制，实际上万级） | **100 KB 硬顶** |
| 同步 | **浏览器原生同步**（Chrome/Edge 账号同步，用户已经开好了） | 需要自己处理配额、分片、冲突 |
| 写操作 | **无速率限制**（官方文档：`MAX_WRITE_OPERATIONS_PER_HOUR` 已废弃，值为 1000000） | 1800 次/小时、120 次/分钟 |
| 用户可迁移 | ✅ 用户能在书签管理器里直接看到、导出、整理 | ❌ 数据是扩展私有的，卸载即丢 |
| 副作用 | ⚠️ **会污染用户的书签栏**（需要建一个专用文件夹，且用户可能误删/移动） | 无副作用 |
| 元数据 | 只能存 `title` / `url` / 顺序 —— **存不了自定义图标、颜色、尺寸** | 想存什么都行 |
| API 限制 | 不能改根目录、不能改 "Bookmarks Bar" / "Other Bookmarks" 两个特殊文件夹 | — |

> **结论：`chrome.bookmarks` 适合做"导航数据本体"，不适合做"呈现配置"。**
> 最佳组合是**混合方案**（见 §6.2）：
> - 导航的 **URL + 标题 + 顺序 + 分组结构** → 写进 `chrome.bookmarks` 的一个专用文件夹（享受浏览器同步）
> - **自定义图标 / 颜色 / 尺寸 / 布局 / 主题 / 壁纸引用** → 写进 `chrome.storage.sync`（体积小，100 KB 够）
> - **图标图片 / 壁纸** → IndexedDB（`chrome.storage.local` + `unlimitedStorage` 也可）

**缩略图方案（比 `captureVisibleTab` 高明得多）**

YASD 抓 **Open Graph 标准** 的 `og:image`，而不是截屏。对比：

| 方案 | 权限 | 效果 | 风险 |
| --- | --- | --- | --- |
| `chrome.tabs.captureVisibleTab` | 需 `<all_urls>` 或 `activeTab`，且必须由用户手势触发 | 真实截图，最直观 | **隐私敏感**（截图用户屏幕）、触发时机难、MV3 下易失败 |
| 抓 `og:image` | 需 `host_permissions` + `scripting`（或后台 `fetch` 页面 HTML） | 拿到"该站点的官方主图" | 部分站点无 og:image；`fetch` 整页 HTML 有流量/延迟成本 |
| 第三方缩略图服务 | 无（只需图片域名的 host 权限） | 零后端 | **依赖第三方**、隐私（把用户网址发给别人）、可能被墙 |
| **品牌矢量图标（Simple Icons / Iconify）** | 无（图标打包进扩展） | 最锐利、最一致、**离线可用** | 只覆盖知名站点，需要"域名→图标 slug"映射表 |

> **推荐：品牌矢量图标优先 → `_favicon` API 兜底 → OG image 可选 → 文字图标最终兜底。** 这条链路既离线可行，又不依赖第三方服务。

**Fair-Source 许可证**：这不是 OSI 认可的开源许可证。`topic` 里打了 `fair-source` 标签，通常意味着**限制商业使用 / 限制直接转售**。**若要参考它的代码，必须先读 LICENSE 原文；建议只看"思路"，不抄代码。**

---

### 3.8 其他值得记住的三个

**mue（BSD-3）** —— 许可证最友好的"功能齐全型"

- React 19 + Vite 7 + **Bun**，`blurhash` / `fast-blurhash` 用于壁纸加载时的渐变占位（**避免白屏闪烁，这个细节很值得学**）
- 有 `react-dnd`(kit) 拖拽排序、`react-clock` 时钟、`image-conversion` 图片压缩
- BSD-3 允许闭源商用（保留版权声明即可）——**如果你想"抄代码"而不是只抄思路，这是唯一可以安全抄功能代码的成熟项目**

**Sourcetab（MIT）** —— 小组件仪表盘的最小闭环

- 背景：纯色 / 线性渐变 / 上传或 URL 图片与视频 / 嵌入网站 / 嵌入 YouTube
- 小组件：Link / Clock / Note / IFrame
- 号召"Easy data management for backup and restoration"
- Web + Chrome + Edge + Firefox **四端同源**，MIT 许可

**Renewed Tab（GPL-3.0，托管在 GitLab）** —— "自建后端"路线

它的结构本身就是一份架构说明书：

```
src/app      React 应用（有扩展 API 时用扩展 API）
src/server   API / 代理服务器（解决 CORS）
src/webext   manifest + 包装
```

`config.json` 里可配：

- `WEBSITE_ICONS_URL` → 指向自建的 [favicon-api](https://github.com/vemetric/favicon-api) 实例（**自托管图标服务**，隐私友好）
- `ACCUWEATHER_API_KEY` / `UNSPLASH_ACCESS_KEY` / `OPEN_EXCHANGE_RATES_KEY` → 服务端持有 API Key

> **这个模式解决了"扩展不能藏 API Key"的根本问题**：把 Key 放在自己的服务器上，扩展只调自己的 API。但代价是**你必须跑一个服务器**（Free/自用版不建议）。

---

### 3.9 横向对比矩阵

**功能覆盖度**（✅ 原生支持 / 🟡 需插件或部分支持 / ❌ 无）

| 能力 | nightTab | Tabliss | Bonjourr | anori | Lemon | light-tab | YASD | TabMark | 我们目标 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 图标网格 | ✅ | 🟡(links widget) | ✅ | ✅ | ✅ | ✅(topSites) | ✅ | ✅ | ✅ |
| **图标文件夹/分组** | ✅ | ❌ | 🟡(linkgroups) | ✅(folders) | ✅ | ❌ | ✅ | ✅ | ✅ |
| 自定义图标 | 🟡(FontAwesome) | ❌ | ✅ | ✅(Iconify) | ✅ | ❌ | ✅ | 🟡 | ✅ |
| 单图标颜色/尺寸 | ✅ | ❌ | 🟡 | ✅ | ✅ | 🟡 | 🟡 | ❌ | ✅ |
| 拖拽排序 | ✅(sortablejs) | 🟡 | ✅ | ✅(dnd-kit) | ✅ | ❌ | ✅ | ✅ | ✅ |
| **文件夹一键全开** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| 壁纸-本地图 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 壁纸-视频 | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | 🟡 |
| 壁纸-每日更新 | ❌ | ✅(Unsplash) | ✅ | 🟡 | ✅(Bing) | ✅(Bing) | ❌ | ❌ | ✅ |
| 壁纸-模糊/压暗 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| 壁纸取色→主题 | 🟡(accent) | ❌ | 🟡 | 🟡 | ✅(莫奈) | ✅(palette) | ❌ | ❌ | ✅ |
| 搜索-多引擎 | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ❌ | ✅ | ✅ |
| 搜索-联想 | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | 🟡 | ✅ |
| 天气 | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | 🟡 |
| 便签 | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 待办 | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 番茄钟 | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 |
| 时钟/日期 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| 农历 | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | 🟡 |
| 诗词/一言 | ❌ | ✅(quote) | ✅(hitokoto) | ❌ | ✅ | ❌ | ❌ | ❌ | 🟡 |
| 读浏览器书签 | ❌ | ❌ | 🟡(optional) | ✅ | ✅ | ❌ | ✅ | ✅ | 🟡 |
| 历史记录 | ❌ | ❌ | ❌ | 🟡 | 🟡 | ✅(最近搜索) | ❌ | ✅ | 🟡 |
| **跨设备同步** | ❌(仅JSON导入导出) | ✅(storage.sync) | ✅(3 档) | ✅(付费云) | ❌(仅导入导出) | ❌ | ✅(借书签) | 🟡 | ✅ |
| 深色模式 | ✅(全主题化) | 🟡 | ✅(4 态) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| 自定义 CSS | ✅(customTheme) | ✅(css widget) | ✅(csseditor) | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 |
| 多语言 | ✅(i18n) | ✅ | ✅ | ✅(i18next) | ✅ | ✅ | ✅ | 🟡 | ✅ |
| 数据导入导出 | ✅ | ❌ | ✅ | ✅(jszip) | ✅ | ✅ | 🟡 | 🟡 | ✅ |
| 离线可用 | ✅ | ✅ | ✅(`offline_enabled`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**工程维度对比**

| 维度 | nightTab | Tabliss | Bonjourr | anori | Lemon | light-tab | YASD |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 语言 | JS | TS | TS | TS | TS | TS | JS |
| 框架 | 无 | React | 无 | React 19 | Vue 3 | Vue 3 | 无 |
| 构建 | Webpack | Webpack | Deno | Rspack | WXT+Vite | Vite | — |
| 组件数/模块数 | ~90 目录 | ~40 | ~25 | ~30 | — | ~15 | ~10 |
| 测试 | ❌ | Jest | ✅ | Vitest+Playwright | ❌ | ❌ | ❌ |
| Lint/格式化 | ESLint | Prettier | — | Biome | — | — | ESLint |
| 类型安全 | ❌ | ✅ | ✅ | ✅ + **Zod 运行时校验** | ✅ | ✅ | ❌ |
| 最近活跃 | ✅ | ✅ | ✅(最勤) | ✅ | ✅ | 2025-06 | 2026-10 |
| Open Issues | 113 | **308** | 127 | — | — | — | — |
| **许可证** | GPL-3.0 | GPL-3.0 | GPL-3.0 | **AGPL-3.0** | **AGPL-3.0** | **MIT** ✅ | Fair-Source ⚠️ |
| 可抄代码？ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ 需读原文 |
| 可抄架构？ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> 注：`Tabliss` 的 308 个 open issues 本身就是"维护疲劳"的量化信号。

---

## 4. 可复用性评估：能不能"拿来就用"

### 4.1 硬约束：许可证（这一节可能决定整个项目走向）

**已核实的许可证矩阵**（均直接读取仓库 LICENSE 文件，非二手信息）：

| 项目 | 许可证 | 闭源分发 | 修改后闭源 | 可抄代码 | 备注 |
| --- | --- | --- | --- | --- | --- |
| **nightTab** | **GPL-3.0** | ⚠️ 可以分发，但**必须开源** | ❌ 不可 | ❌ | 强 copyleft |
| **Tabliss** | **GPL-3.0** | ⚠️ 同上 | ❌ | ❌ | |
| **Bonjourr** | **GPL-3.0** | ⚠️ 同上 | ❌ | ❌ | |
| **Renewed Tab** | **GPL-3.0** | ⚠️ 同上 | ❌ | ❌ | |
| **hexagonTab / voltTab** | GPL-3.0 | ⚠️ 同上 | ❌ | ❌ | 同作者 |
| **anori** | **AGPL-3.0** | ⚠️ 同上 | ❌ | ❌ | AGPL 额外覆盖"网络服务"场景 |
| **Lemon New Tab** | **AGPL-3.0** | ⚠️ 同上 | ❌ | ❌ | v3.2.3 起从 MIT 切换 |
| **Yet Another Speed Dial** | Fair-Source（自定义） | ⚠️ **需读原文** | ⚠️ | ⚠️ | 非 OSI 开源，通常限制商业使用/转售 |
| **mue** | **BSD-3-Clause** | ✅ **可以** | ✅ **可以** | ✅ **可以**（保留版权声明） | 唯一可安全抄代码的成熟项目 |
| **light-tab-page** | **MIT** | ✅ **可以** | ✅ **可以** | ✅ **可以** | 功能薄，但壁纸实现值得抄 |
| **BlueFatFish** | **MIT（仅代码）** | ✅ | ✅ | ✅ | **表情素材不可商用/再许可**（版权归 B 站 UP「赤风RED」） |
| **Sourcetab** | **MIT** | ✅ | ✅ | ✅ | 小组件闭环 |
| **tab-nine** | MIT | ✅ | ✅ | ✅ | |
| **TabMark** | **无 LICENSE 文件** | ❌ | ❌ | ❌ | **默认"保留所有权利"**，源码可见≠可复用 |
| **GoTab** | **未声明** | ❌ | ❌ | ❌ | 同上 |

### 4.2 三个结论

**结论 1：功能覆盖度最高的 6 个项目，全部是 copyleft。**

`nightTab` / `Tabliss` / `Bonjourr` / `anori` / `Lemon` / `Renewed Tab` —— 这个组合几乎穷尽了"接近 Infinity"的所有候选。**如果目标是闭源分发或商业化，这些代码一行都不能进你的仓库。**

**结论 2：许可证宽松的项目，功能都明显偏薄。**

`light-tab-page`（无书签/无文件夹/无小组件）、`BlueFatFish`（无搜索框/无小组件）、`Sourcetab`（4 个小组件）、`mue`（唯一例外，功能较全但生态偏冷）。

**结论 3：所以只有"参考设计、重写实现"这一条路。**

| 可借鉴的 | 不可借鉴的 |
| --- | --- |
| ✅ **架构思路**（插件化、分层、状态模型）—— 思想不受版权保护 | ❌ 具体代码实现（函数体、组件代码） |
| ✅ **设置项清单**（nightTab 的 `state` 字段表）—— 功能需求本身不受保护 | ❌ 复制文件、复制 CSS |
| ✅ **数据结构设计**（Tabliss 的扁平 key 空间） | ❌ 复制 LICENSE 之外的资源文件（图标、字体、图片） |
| ✅ **已知坑**（GPU 卡死、X-Frame-Options、CSP） | ❌ 使用其品牌名/Logo |

> ⚠️ **法务提醒（非法律意见）**：以上为工程视角的理解。"功能相似"在多数司法辖区不构成侵权，"表达相似"（代码/UI 美术）才构成。但**GPL 的传染性非常明确**：只要链接/包含 GPL 代码并分发，整个作品必须 GPL。**建议：立项即确定"净室实现"（clean-room），只看行为与文档、不看源码细节。**

### 4.3 结论矩阵：我建议怎么做

| 你的目标 | 推荐路线 | 首选参考 |
| --- | --- | --- |
| **只要自己/家人用，能跑就行** | Fork **nightTab**，改中文和默认配置 | nightTab（功能最全，改最省事） |
| **想长期维护、未来可能分发** | **白盒重写**（推荐） | anori 的架构 + nightTab 的功能清单 + Bonjourr 的同步三档 |
| **想最快看到"像 Infinity"的效果** | Fork **Lemon New Tab**，补天气 + 待办 | Lemon（中文场景最全，但 AGPL） |
| **完全不想写前端** | 用 **Lemon / light-tab-page** 直接用，接受功能缺口 | — |

---

## 5. MV3 平台约束与关键技术难点

> 本章是"踩坑清单"。每一条都是**已经有人踩过**的（有源码或 issue 为证）。

### 5.1 覆盖新标签页

```json
{ "chrome_url_overrides": { "newtab": "index.html" } }
```

**四条铁律：**

| 规则 | 官方原文 / 后果 |
| --- | --- |
| **一个扩展只能覆盖一个内置页** | "an extension can contain an override for any of the following pages, but **each extension can only override one page**"（`bookmarks` / `history` / `newtab` 三选一） |
| **无痕窗口无法覆盖新标签页** | "In incognito windows, **extensions can't override New Tab pages**." |
| **新标签页会被抢先获得地址栏焦点** | "new tabs give keyboard focus to the address bar first. **Don't rely on keyboard focus defaulting to other parts of the page.**" → 想做"打开即输入搜索"必须 `autofocus` + 处理焦点被抢 |
| **页面要快、要小、要给 title** | "Users expect built-in browser pages to open instantly. … avoid accessing database resources synchronously." |

**性能红线**：用户在按 `Ctrl+T` 后**期望 0 延迟**。任何同步 XHR、同步 localStorage 大对象读取、首屏阻塞的网络请求都会立刻被感知。

**已知的真实性能事故**：Lemon New Tab 在 README「已知问题」中记录：

> "部分 Windows 设备上的 Chromium 内核浏览器会在**启动时卡死**，**禁用 GPU 硬件加速**或者在 `chrome://flags/#use-angle` 页面将 **Choose ANGLE graphics backend** 更改为 `OpenGL` 后可缓解"

→ 根因是**视频壁纸 + `backdrop-filter` 模糊 + 部分 Intel 核显驱动**的组合。**必须提供"性能模式"开关**（关闭毛玻璃/视频壁纸/动画）。

### 5.2 权限策略：最小权限 + 按需申请

**推荐的 manifest 骨架**（综合 Bonjourr 与 anori 的最优实践）：

```json
{
  "manifest_version": 3,
  "minimum_chrome_version": "116",
  "chrome_url_overrides": { "newtab": "index.html" },
  "offline_enabled": true,
  "background": { "service_worker": "background.js" },
  "permissions": ["storage", "alarms", "unlimitedStorage"],
  "optional_permissions": [
    "bookmarks", "topSites", "favicon", "history", "tabs", "scripting", "sessions", "search"
  ],
  "optional_host_permissions": [
    "https://cn.bing.com/*",
    "https://api.open-meteo.com/*",
    "https://suggestion.baidu.com/*",
    "https://api.bing.com/*"
  ]
}
```

**为什么这样做：**

| 决策 | 理由 |
| --- | --- |
| `storage` + `alarms` + `unlimitedStorage` 必修 | 三者**都不触发用户可见的权限警告**（`unlimitedStorage` 亦无警告），安装体验干净 |
| `bookmarks` / `topSites` / `favicon` / `history` 全 optional | 安装时零摩擦；用户开启"显示书签/常访问"时才弹窗。Bonjourr 与 anori 都这么做 |
| `host_permissions` 用 `optional_host_permissions` | MV3 下主机权限可在运行时申请；`*://*/*` 会触发"读取所有网站数据"的强警告，**能不用就不用** |
| **不要** `management` / `<all_urls>` content script | TabMark 因全域 host + 双 content script + `management` + `history` 导致权限面过大，是审核重点 |

**注意一个已在官方文档标注的坑**：

> `"favicon"` 权限会**触发警告**，除非与已有权限（如 `"tabs"`）一同声明 —— "The `favicon` permission triggers a warning unless paired with an existing permission (such as `tabs`)". 

→ 如果要静默拿 favicon，要么同时要 `tabs`（也是警告级），要么改用**自建图标方案**（见 §5.5）。

### 5.3 `chrome.storage.sync` —— 真实容量与配额（实测推演）

**官方硬指标（Chrome 142 文档原文）：**

| 常量 | 值 | 含义 |
| --- | --- | --- |
| `QUOTA_BYTES` | **102,400**（100 KB） | 总量上限。计费方式："the JSON stringification of every value **plus every key's length**" |
| `QUOTA_BYTES_PER_ITEM` | **8,192**（8 KB） | 单条上限（同样含 key 长度） |
| `MAX_ITEMS` | **512** | 条目数上限 |
| `MAX_WRITE_OPERATIONS_PER_MINUTE` | **120** | 每分钟写操作（`set`/`remove`/`clear` 计 1 次） |
| `MAX_WRITE_OPERATIONS_PER_HOUR` | **1,800** | 每小时 = 平均 1 次 / 2 秒 |

补充（文档同页）：

- `MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE` **已废弃**（"The storage.sync API no longer has a sustained write operation quota."）→ **长时写到限流仍是 1800/h 这个瓶颈**。
- 超限行为：**"Updates that would cause this limit to be exceeded fail immediately"**，回调里设 `runtime.lastError`，promise 版直接 reject。**不会排队、不会合并、不会重试。**
- `chrome.storage.local` 是 **10 MB**（Chrome 113 及以前是 5 MB），可用 `unlimitedStorage` 突破。
- `chrome.storage.session` 是 **10 MB**，只存内存，浏览器重启即清空 —— **适合放"本标签页的临时 UI 状态"**。

**推演 1：到底能存多少快捷方式？**

先看一条最小化的记录：

```json
{"id":"9f2a1c","n":"GitHub","u":"https://github.com/","i":"si:github","c":"#181717"}
```

≈ 88 字节。加上 key（如 `"b/9f2a1c/"` = 9 字节）≈ **97 字节**。

| 存储策略 | 单条记录大小 | 可用容量（预留 15 KB 给设置） | 可存快捷方式数 |
| --- | --- | --- | --- |
| 只存 URL/名称/图标 slug/颜色 | ~97 B | 85 KB | **≈ 900 个** |
| 加上尺寸/位置/圆角等展示字段 | ~160 B | 85 KB | **≈ 530 个** |
| 加上自定义图标 **base64 PNG**（32×32，~1.5 KB） | ~1.6 KB | 85 KB | **≈ 53 个** ❌ |
| 加上自定义壁纸（一张 1920×1080 JPEG ~300 KB） | — | — | **1 张都放不下** ❌ |

> ⚠️ **这条推演是全报告最实用的结论之一**：只要**不把图片塞进 sync**，100 KB 完全够一个重度用户（500+ 快捷方式）。一旦塞图片，立刻崩塌。
> **铁律：`chrome.storage.sync` 里只放"结构化小数据 + 引用（id/hash）"；图片一律进 IndexedDB。**

**推演 2：写操作配额怎么不被撞爆？**

用户拖拽整理 20 个图标 → 每个图标一次写 → 20 次 `set()` → 瞬间用掉 1/6 的分钟配额，连续整理几次就 `MAX_WRITE_OPERATIONS_PER_MINUTE` 超限，**而且失败是静默的**（只有 `runtime.lastError`）。

**解法（Tabliss 已实现，直接抄）：**

```ts
// 同一 tick 内的多次改动合并成一次 set()
const batch = (flush, timeout = 0) => {
  const changes = new Map();
  let timer = null;
  const run = () => { flush(changes); changes.clear(); timer = null; };
  window.addEventListener("beforeunload", () => { if (timer) { clearTimeout(timer); run(); } });  // 关页面前强制 flush
  return ([key, val]) => {
    changes.set(key, val);
    if (!timer) timer = setTimeout(run, timeout);
  };
};
```

**再叠加我们的改进：**

1. 把防抖从 `0ms` 改成 **800–1500ms**（新标签页场景下用户不会 1 秒内完成 5 次操作的心理预期）；
2. **一次 `set({k1:v1, k2:v2, ...})` 只算 1 次写操作**（官方按"操作次数"计，不按键数）→ 批量提交是最高杠杆的优化；
3. 在 service worker 里再包一层：**失败（`runtime.lastError`）时退避重试 + 计入本地 outbox**，防止"用户以为保存了其实没保存"；
4. 用 `chrome.storage.sync.getBytesInUse()` 在设置页显示"已用 x / 100 KB"进度条 —— **把配额透明化给用户**，这是竞品完全没做的体验点。

**推演 3：分片策略的陷阱**

很多人第一反应是"把整个 DB 序列化成 JSON，切成 4 KB 一片存进 `sh/0000..sh/0024`"。**这是错的**：

- 好处：紧凑，能塞更多数据；
- 致命问题：**任何一次改动都要重写全部 25 片** → ① 一次 `set()` 传 25 个 key 虽只算 1 次操作，但**网络上要传 100 KB**；② **设备 A 改了图标 1，设备 B 同时改了图标 2，两边都重写全部分片 → B 覆盖 A，静默丢失**。

**正确做法是"实体级分片"**（详见 §6.3）：

| 粒度 | 冲突概率 | 条目数压力 |
| --- | --- | --- |
| 全量单条 | — | ❌ 必然超 8 KB |
| 整体切 N 片 | ❌ **极高**（每次改动全量重写） | ✅ |
| **每个实体一个 key（`b/<id>`、`g/<id>`）** | ✅ **极低**（只冲突真正同时被改的那一个） | ⚠️ 受 512 上限约束 |
| 混合：实体级 + 大集合单独存 | ✅ | ✅ **推荐** |

### 5.4 三条"同步"通道的对比与组合

| 通道 | 容量 | 依赖 | 中国大陆可用性 | 数据主权 | 适合存什么 |
| --- | --- | --- | --- | --- | --- |
| **`chrome.storage.sync`** | 100 KB | Chrome 账号同步（需登录 + 开启"扩展"同步项） | ⚠️ **依赖 Google 账号，国内基本不可用**；Edge 侧需 Edge 账号且需开启扩展同步（**需实测**） | 中（存在 Google/Microsoft 服务器） | 设置、快捷方式元数据、分组结构 |
| **`chrome.bookmarks`** | 接近无限 | 浏览器书签同步 | ✅ **Chrome/Edge 登录后即可，国内 Edge 可用** | 中 | URL + 标题 + 顺序 + 分组（**不含样式**） |
| **GitHub Gist** | 单文件 ~1 MB（免费） | GitHub Token | ⚠️ 需能访问 GitHub（可走镜像） | ✅ **用户自己的仓库** | 全量设置备份、跨设备拉取 |
| **WebDAV（用户自建）** | 用户定 | 坚果云 / Nextcloud / 群晖 | ✅ | ✅ **完全自有** | 全量备份 + 壁纸 |
| **自建后端** | 无限 | 需要运维 | ✅ | ✅ | 全部（但不推荐，见 §0.2） |

**本项目的推荐组合（三层）：**

```
Layer 1（默认，零配置）  chrome.storage.sync   →  自动、无感、跨设备
Layer 2（可选，一键开启） chrome.bookmarks      →  把"导航本体"放进书签，借浏览器同步
Layer 3（可选，手动）     Gist / 导出 JSON 文件  →  兜底、迁移、归档
```

> **注意**：`chrome.storage.sync` 在国内 Chrome 上大概率不可用（用户无法登录 Google 账号）。这不是技术问题而是**生态现实**。所以：
> - **MVP 必须保证"同步失败时功能完全正常"**（纯本地可用）；
> - **设置页必须在开启同步前检测并提示**：`chrome.storage.sync.getBytesInUse()` 能调用但`onChanged` 永不触发 = 同步很可能未生效；
> - **必须提供手动导出/导入**，这是最后一道保险。

### 5.5 图标与 Favicon（本赛道最容易翻车的地方）

**五种获取方式对比：**

| 方案 | 实现 | 权限 | 优点 | 缺点 |
| --- | --- | --- | --- | --- |
| **A. 品牌矢量图标**（Simple Icons / Iconify） | 打包进扩展，按域名查表 | **无** | 离线、锐利、风格统一、**最快** | 只覆盖知名站点；需维护"域名 → slug"映射 |
| **B. `_favicon` API** | `chrome-extension://<id>/_favicon/?pageUrl=<url>&size=32` | `favicon`（有警告） | 用 Chrome 自己的 favicon 库，覆盖广 | Chrome only；**只对用户访问过的站点有效**；尺寸/质量不可控 |
| **C. 三级抓取兜底** | `<link rel=icon>` → `/favicon.ico` → 主域名 | `host_permissions` + `scripting`（或后台 fetch） | 覆盖最广（BlueFatFish 方案） | 慢（首屏不能等）；有跨域与反爬 |
| **D. 第三方 favicon 服务** | `google.com/s2/favicons`、DuckDuckGo、favicon-api | `host_permissions` | 零后端、快 | **隐私**（把用户网址发给第三方）；**国内 Google 不可用** |
| **E. 文字图标兜底** | 取域名首字母 + 哈希配色 | 无 | **永不失败** | 不好看 |

**推荐链路（综合 A→B→C→E，D 仅作可选）：**

```
1. 先查内置品牌图标表（Simple Icons / Iconify）        → 命中即用，0ms，离线
2. 用户曾上传/自定义过图标                              → 用 IndexedDB 缓存的图
3. 后台异步：_favicon（若用户授予 favicon 权限）         → 命中后缓存进 IndexedDB
4. 后台异步：三级抓取（<link rel=icon> → /favicon.ico）  → 命中后缓存
5. 最终兜底：文字图标（首字 / 首两字，哈希取色）          → 永不空白
```

**关键工程细节（BlueFatFish 已验证）：**

> "自动抓图标**首次需要联网，抓完就缓存**。"

→ **图标必须是"先渲染、后补图"的异步流水线**，绝不能阻塞首屏。首屏用文字图标/占位色块，抓到图后淡入替换（配 `transition` 就不会闪烁）。

**一个被低估的方案**：`Simple Icons` 有 3000+ 品牌 SVG，且**可以通过 `slug` 直接用**。做一个"域名 → slug"的映射表（只需覆盖 Top 500 站点），就能让 90% 的图标**零成本、零网络、矢量级清晰**。这是比抓 favicon 高一个档次的方案。

**许可证注意**：Simple Icons 是 **CC0 1.0**（图标本身）+ MIT（代码）；Iconify 里的图标集合**各自有不同的许可证**（有些是 CC-BY-NC 等），批量打包前需逐个核对。

### 5.6 壁纸与大文件（IndexedDB / Blob URL / Cache API）

**核心事实：Blob URL 的生命周期 = 当前页面会话。** 一旦新标签页关闭，`blob:chrome-extension://.../xxxx` 即失效。

**因此配置里绝不能存 `blob:` 字符串**，只能存 IndexedDB 的 key，每次打开页面重建 URL。light-tab-page 的完整流程（§3.6 已列）就是标准答案：

```
上传 → uuid() → createObjectURL → 清旧（revokeObjectURL）→ 存 Blob 进 IndexedDB → 配置只存 {id}
打开 → 读配置 id → IndexedDB 取 Blob → createObjectURL → 渲染
```

**四种存储位置对比：**

| 位置 | 容量 | 读取速度 | 适用 | 注意 |
| --- | --- | --- | --- | --- |
| **IndexedDB**（Blob） | 受磁盘配额（可 `navigator.storage.persist()` 申请持久化） | 快 | ✅ **壁纸/图标首选** | **必须申请持久化**，否则可能被清 |
| **OPFS**（anori 用） | 同上 | 更快（同步 API in worker） | 大文件、需要随机读写 | 兼容性较新，实现复杂 |
| `chrome.storage.local` + `unlimitedStorage` | 10 MB → 无限 | 慢（整个字符串读进内存） | 小图标 | base64 编码膨胀 ~33% |
| **Cache API**（`caches.open`） | 受磁盘配额 | 快 | ✅ **远程壁纸缓存首选** | 可直接 `match(request)`，天然支持 HTTP 语义 |

**推荐的壁纸管线：**

```
远程壁纸（Bing 每日一图）
  → fetch → Cache API 存原始响应（按日期/URL 做 key）
  → 首屏：先显示上次缓存的图（0 网络）
  → 后台：有新图则下载完成后替换（淡入）

本地壁纸
  → 用户选择 File → 可选：canvas 压缩到目标分辨率 + WebP
  → 存 Blob 进 IndexedDB
  → 首屏：createObjectURL

视频壁纸（可选，默认关）
  → 同样存 Blob → <video autoplay muted loop playsinline>
  → 必须提供"性能模式"直接禁用
```

**必须做的两件事：**

1. `navigator.storage.persist()`（Bonjourr 已做）—— 防止用户壁纸被浏览器清理；
2. `URL.revokeObjectURL()`（light-tab-page 已做）—— 防止内存泄漏。**每开一次新标签页泄漏一张 4K 壁纸 = 几百 MB。**

### 5.7 搜索联想（CORS、host_permissions 与"静默失败"）

**好消息**：扩展页面（非 content script）只要声明了对应 `host_permissions`，**fetch 不受 CORS 限制**（扩展拥有跨域特权）。所以不需要服务端代理。

**坏消息**：中国网络环境下，各引擎的联想接口表现差异极大。

**国内实测可用的联想端点（来自 light-tab-page 与 Lemon 的实际实现）：**

| 引擎 | 端点 | 返回格式 | 解析难度 |
| --- | --- | --- | --- |
| **Bing（推荐）** | `https://api.bing.com/osjson.aspx?query=<kw>` 或 `https://api.bing.com/qsonhs.aspx?type=json&q=<kw>` | JSON 数组 `["hello",["hello windows",…],[],[],{…}]` | ✅ 直接取 |
| **百度** | `https://suggestion.baidu.com/su?wd=<kw>&cb=cb`（可加 `ie=UTF-8`） | **JS 文本**，形如 `cb({q:"hello",p:false,s:["hello",…]});` | ⚠️ 需 `text()` 解析后再正则取数组（light-tab-page 用 `/.*?s:(\[.*?\]).*?/`）；**若不加 `ie=UTF-8` 默认返回 GB18030，必须 `new TextDecoder('gb18030')`** |
| **360** | `https://sug.so.360.cn/suggest?word=<kw>&encodein=utf-8&encodeout=utf-8` | 标准 JSON | ✅ 直接取（国内备选最省事） |
| Yandex | `https://suggest.yandex.com/suggest-ff.cgi?part=<kw>` | JSON `["hello",["hello",…]]` | ✅ 直接取 |
| Google | `https://suggestqueries.google.com/complete/search?client=firefox&q=` | JSON / JSONP | ❌ **国内超时**（light-tab-page 已 `catch` 后返回 `[]`，表现为"静默无联想"） |
| DuckDuckGo | `https://duckduckgo.com/ac/?q=&type=list` | JSON | ❌ 国内不可用 |

**一个实测出来的坑**：`api.bing.com` 的建议接口**对 User-Agent 敏感** —— 用 `curl` 默认 UA 请求会返回 **204 No Content**，带浏览器 UA 才返回 200。浏览器里 `fetch` 天然携带 Chrome UA，所以**在扩展里没问题**，但如果你写脚本自测，会误判为"接口挂了"。

**必须处理的三个细节：**

1. **防抖**：输入停止 150–300ms 后再请求，且**取消上一个未完成请求**（`AbortController`）；
2. **失败必须静默降级**：联想失败不能影响搜索本身（这是所有成熟项目的做法）；
3. **键盘导航**：`↑` `↓` `Enter` `Esc`，且**不要抢 Tab 键**（Tab 用于切引擎）。

**还有一个 MV3 特有的坑**：联想请求该发在哪？

- 发在**新标签页**（扩展页面）→ ✅ 最简单，有 host 权限即可；
- 发在 **service worker** → 也能发，但要考虑 SW 被挂起（请求会被中断）；
- **不要**发在 content script —— 官方明确："Cross-origin requests are always treated as such in content scripts, **even if the extension has host permissions**"（content script 里 CORS **永远生效**，host 权限帮不上忙），而且还要处理页面的 CSP。

> **结论：联想直接在新标签页里 fetch，不要绕 service worker。**

### 5.8 小组件数据（天气 / 农历 / 一言）与"离网可用"

| 数据 | 推荐源 | 需要 Key？ | 国内可达 | **商用许可** | 备注 |
| --- | --- | --- | --- | --- | --- |
| **天气** | **Open-Meteo**（`api.open-meteo.com`） | ❌ **免费无 Key** | ✅ | ⚠️ **免费层仅限非商用**（含广告/订阅即算商用），商用需订阅 `customer-api.open-meteo.com` | **青柠起始页线上实测就用它**（bundle 内 `weatherDataByOpenMeteo`）；额度 <10,000/天、5,000/小时、600/分钟 |
| 天气（商用备选） | 和风天气 QWeather | ✅ 需 Key | ✅ 国内最稳 | ✅ 可商用，但**必须显著署名**"天气服务由和风天气驱动"+ 超链 | 0–50,000 次/月 = ¥0；**⚠️ 关键变化：2026 起每账号有独立 API Host（如 `xxxx.xy.qweatherapi.com`），公共域逐步停服** → `host_permissions` 无法写死，必须 `optional_host_permissions` + 让用户填自己的 Host |
| 天气（商用备选） | WeatherAPI.com | ✅ 需 Key | ✅ | ✅ 官方写明"free covers light use, **including commercial apps**" | 100,000 次/月 |
| 天气（商用备选） | 心知天气 | ✅ | ✅ | ⚠️ 免费版仅个人 | 免费 10 万次/月、1 次/秒、370 城市 |
| **每日壁纸** | `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=<N>&mkt=zh-CN` | ❌ 无 Key | ✅ **最稳** | ⚠️ **返回体自带 "此图片不能下载用作壁纸……仅限用作桌面壁纸"**，且 `copyright` 多为 Shutterstock 版权图 | **务必用 `cn.bing.com` 而非 `www.bing.com`**（少一次 302）；图片 CDN 有 `Access-Control-Allow-Origin: *` 和 8 天缓存 |
| **一言** | `https://v1.hitokoto.cn/?c=d&encode=json` | ❌ | ✅ | ⚠️ 公益项目，**QPS 2**，大流量需事先授权 | Lemon / Bonjourr 都用 |
| **今日诗词** | `https://v2.jinrishici.com/one.json`（首次需 `POST /token` 取 Token） | ❌ | ✅ | ❌ **明确"本接口不开放商用"，免费仅限非盈利** | 单 IP 5 秒 25 次；不支持服务端调用；会写 Cookie |
| **农历** | `lunar-javascript`（MIT）纯计算 | — | — | ✅ | 纯本地，零网络 |
| **节假日** | `chinese-days`（MIT）打包数据 | — | — | ✅ | 每年发一版，彻底摆脱外部依赖 |

**Bing 壁纸分辨率后缀（同一张图，实测字节数）** —— 用于选择"下载多大"：

| 后缀 | 字节数 | 尺寸 |
| --- | --- | --- |
| `_UHD.jpg` | 3.7 MB | 3840×2160 |
| `_1920x1080.jpg` | 331 KB | 1920×1080 ← **推荐默认** |
| `_1366x768.jpg` | 171 KB | 1366×768 |
| `_1080x1920.jpg` | 334 KB | 1080×1920（竖屏） |
| `_800x600.jpg` | 115 KB | 800×600 |

> **建议**：默认取 `_1920x1080`，在设置里允许用户选 4K。别默认下 3.7 MB 的 UHD——每日一图场景一天一次，但用户可能在弱网下打开第一个标签页。

**关键设计原则（从 Lemon 的隐私政策学到）：**

> Lemon 明确列出**默认开启的联网项**：今日诗词、一言、搜索联想。
> 并声明 "**开发者不运营用于接收扩展用户个人数据的专用后端服务**。"

→ **我们的设置页应该有一节"网络请求"，逐条列出会访问哪些域名、为什么、如何关闭，以及该数据源的许可约束。** 这是"本地优先"叙事的必要凭证，成本极低。

**天气的一个隐藏问题**：`geolocation` 在扩展里需要用户授权，而很多用户会拒绝。**因此必须提供"手动选择城市（内置城市列表 + 经纬度）"作为主路径，定位只作为加速项。**

**另一个隐藏问题（Key 安全）**：**任何写进扩展的 API Key 都是公开的**（包可下载、`storage.local` 可读）。只有三条路：

1. **用无 Key 服务**（Open-Meteo / Bing / hitokoto）← **推荐**
2. **BYOK**：用户自己填 Key，存 `storage.local`，UI 明确告知
3. **自建代理**（Cloudflare Worker 等）做限流 + 隐藏 Key —— MV3 **禁止远程代码，但明确允许调用远程服务**

### 5.9 性能预算（新标签页是"按键级"延迟敏感）

竞品的自我基准：Light Tab Page 宣称 **"加载迅速 (< 50ms)"**。这是一个很有参考价值的行业标尺。

| 指标 | 目标 | 手段 |
| --- | --- | --- |
| 首屏可见（文字图标 + 背影色） | **< 100 ms** | 同步读 `storage.local` 缓存 → 立即渲染骨架；**不等网络** |
| 首屏完整（真实图标/壁纸） | < 500 ms | 图标异步补图 + 壁纸用上次缓存 |
| JS bundle（gzip） | < 150 KB | 不引入大 UI 框架或做按需引入 |
| 首屏请求数 | **0**（理想） | 全部走本地数据；网络请求一律异步且在首屏之后 |
| 内存（常驻） | < 60 MB | 单张壁纸 + 无视频 |

**具体优化清单（按性价比排序）：**

1. **先渲染，后补图**（文字图标占位）—— 收益最大；
2. **配置双读**：`localStorage` 同步读（几百字节，0ms）出骨架 → `chrome.storage` 异步读覆盖。**这是唯一能同时做到"零闪烁"和"有同步"的技巧**；
3. **壁纸用 `background-image` + 上次缓存**，不要 `<img>` 等 onload；
4. **避免 `backdrop-filter`**（毛玻璃）在壁纸上的大面积使用 —— 它是 GPU 杀手，也是 Lemon 记录的那起"启动卡死"的元凶之一；
5. **图标用内联 SVG / `mask-image`**，不要 500 个 `<img>`；
6. **虚拟滚动**（如果支持 500+ 图标）；
7. **懒加载非首屏分组**。

### 5.10 上架合规风险（本赛道最被低估的风险）

#### （1）"新标签页 + 搜索"双改限制 —— 已有实证

TabMark 作者在 README 中公开写明：

> "由于 **chrome 商店新的条款要求，拓展不允许同时修改新标签页和搜索功能**，故 chrome 商店版本**暂时无法更新**"
> Chromium 商店版：1.243（实际为 1.241，**为 1.242 版本回滚**）

**推论：**

- 如果我们在新标签页里提供"搜索框"，**绝不能用 `chrome_settings_overrides.search_provider` 修改默认搜索引擎**。搜索框只做"输入 → `window.open(url)`"，**不碰 `search_provider`**。
- **不申请 `search` 权限**（除非做"搜索引擎选择器"这种必须能力，且能说明用途）。
- 这条限制对我们是**天然利好**：我们本来就不想改用户的搜索引擎。

#### （2）单一用途原则（Single Purpose）

Chrome Web Store 要求扩展有"单一且明确的用途"。我们的用途是**"替换新标签页"**，这是清晰的。危险的是**往里面塞太多东西**：

- ❌ 同时做"新标签页 + 密码管理 + 广告拦截" → 必被拒
- ✅ "新标签页（含快捷方式、壁纸、待办、天气）" → 属于同一用途的合理延伸
- ⚠️ **要避免**：`management` 权限（管理其他扩展）、`<all_urls>` content script（在任意网站注入）

TabMark 的权限面（`management` + `history` + `tabGroups` + `<all_urls>` × 2 content script）就是"权限过度"的典型，也是它审核受阻的可能原因之一。

#### （3）隐私披露的一致性

Infinity 的教训（§2.4.5）：商店披露页写"不收集"，隐私政策却列了一长串服务端存储项。**我们做本地优先，反而不存在这个问题——但依然必须写好隐私政策**：

- 明确列出**每一个联网域名**及用途；
- 明确声明"**不运营任何接收用户数据的后端**"；
- 如果用了 `topSites` / `bookmarks` / `history`，明确说明"仅本地读取、不上传"。

#### （4）MV3 技术合规

- ❌ **禁止远程代码**：不能 `fetch` 一个 JS 文件再 `eval`/`new Function`。所有代码必须打包。
  → **对"小组件市场""自定义 JS 小组件"这类功能是致命的**（Tabliss 有个 `js` widget，仅在 web build 里启用，扩展 build 不包含 —— 这就是规避方式）。
- ❌ 不能用 `eval` / 内联脚本（CSP 默认 `script-src 'self'`）。
- ⚠️ `webRequest` 阻塞式在 MV3 已不可用于扩展（Chrome），只能用 `declarativeNetRequest`。**我们不需要。**

#### （5）无痕模式

扩展**无法覆盖无痕窗口的新标签页**。需要在文档/设置页明确告知，避免用户以为是 bug。

#### （6）更新与 ID 一致性

BlueFatFish 的 README 提到一个很实际的坑：

> "商店版、crx、解压加载三者的**扩展 ID 各不相同，配置互不相通**（一边的标签不会自动出现在另一边）"

→ 开发期用 `key` 字段固定扩展 ID，避免每次重载后数据"消失"。

---

## 6. 数据模型与同步协议设计建议

> 本章是"预研 → 可以动手"的桥。所有设计都围绕一个约束：**100 KB + 512 条目 + 每 2 秒最多 1 次写**。

### 6.1 五条设计原则

| # | 原则 | 理由 |
| --- | --- | --- |
| 1 | **元数据与二进制彻底分离** | 二进制（图标图、壁纸）→ IndexedDB；`storage.sync` 只存 id 引用。§5.3 推演 1 已证明不这样必崩 |
| 2 | **实体级分片，不做整库序列化** | 整库分片会让"改一个图标"变成"重写 100 KB"，且冲突概率极高。§5.3 推演 3 |
| 3 | **配置与数据分离** | `cfg`（设置，单条 < 8 KB）与 `b/*`（实体）分开，改设置不动数据 |
| 4 | **删除必须有墓碑** | `chrome.storage.sync` 的 `remove()` 在另一台设备看来和"从未存在"无法区分，会导致"删了又回来" |
| 5 | **单设备单写者（single-writer per device）** | 每个设备只写自己的"变更日志"，避免多设备互相覆盖（见 §6.4 的 LWW+Lamport 方案） |

### 6.2 存储分层

```
┌─────────────────────────────────────────────────────────────┐
│ chrome.storage.sync  (100 KB / 512 items / 8 KB per item)    │
│  ├── cfg                    全局设置（单条 JSON，< 8 KB）      │
│  ├── meta                   图元信息 {schemaVersion, rev}     │
│  ├── b/<id>                 快捷方式（每个一条，~100-160 B）    │
│  ├── g/<id>                 分组（每个一条）                   │
│  ├── n/<id>                 便签（每个一条）                   │
│  ├── t/<id>                 待办（每个一条）                   │
│  └── ts/<id>                墓碑 {d:1, ts}                    │
├─────────────────────────────────────────────────────────────┤
│ chrome.storage.local  (10 MB, 可 unlimitedStorage)            │
│  ├── cache/*                非关键的派生缓存（天气上次结果等）   │
│  └── ui/*                   跨标签页 UI 状态                  │
├─────────────────────────────────────────────────────────────┤
│ IndexedDB                                                    │
│  ├── assets  (Blob)         自定义图标 / 抓到的 favicon / 壁纸  │
│  └── thumbs  (Blob)         og:image 缩略图（可选）            │
├─────────────────────────────────────────────────────────────┤
│ Cache API                                                    │
│  └── 远程壁纸 / 远程图片（HTTP 语义缓存，天然带过期）           │
├─────────────────────────────────────────────────────────────┤
│ chrome.storage.session  (10 MB, 内存)                         │
│  └── 当前标签页的临时状态（搜索框内容、打开的文件夹）           │
└─────────────────────────────────────────────────────────────┘
```

> **为什么 `localStorage` 也要用？** §5.9 提到的"同步读骨架"技巧需要**同步 API**。`localStorage.getItem('skeleton')` 是唯一能 0ms 返回的手段（几百字节）。它只作为"渲染加速缓存"，**不作为真相来源**。

### 6.3 核心数据模型（建议契约）

```ts
// ── 顶层元信息 ─────────────────────────────────────────────
interface Meta {
  schemaVersion: number;      // 结构版本，用于迁移
  rev: number;                // Lamport 计数器，全局单调
  updatedAt: number;          // epoch ms，仅用于展示
  deviceId: string;           // 写入者标识（见 §6.4）
}

// ── 快捷方式 ───────────────────────────────────────────────
interface Shortcut {
  id: string;                 // nanoid(8)，短、够用
  url: string;
  title: string;
  // 图标：三选一，永远不存二进制
  icon?:
    | { kind: 'brand'; slug: string }        // Simple Icons slug，如 'github'
    | { kind: 'asset'; assetId: string }     // IndexedDB 里的自定义上传图
    | { kind: 'text'; text: string; color: string };  // 文字兜底
  // 呈现覆盖（可选，全部有默认值，不写就不占空间）
  style?: {
    bg?: string;              // 背景色 '#181717' 或 'transparent'
    size?: number;            // 图标尺寸倍率 0.75 | 1 | 1.25
    radius?: number;
    label?: 'always' | 'hover' | 'never';
  };
  groupId?: string;           // 所属分组
  order: number;              // 排序（整数，留间隔便于插入）
  createdAt: number;
  rev: number;                // 该实体的 Lamport 版本
  deleted?: true;             // 墓碑
}

// ── 分组（= Infinity 的"图标文件夹"）───────────────────────
interface Group {
  id: string;
  name: string;
  icon?: string;              // emoji 或 brand slug
  parentId?: string;          // 支持一级嵌套（不建议更深）
  order: number;
  openAllInNewWindow?: boolean;  // ★ Infinity 的"一键打开多个常用站点"
  rev: number;
  deleted?: true;
}

// ── 全局设置 ───────────────────────────────────────────────
interface Config {
  version: number;
  locale: 'auto' | 'zh-CN' | 'zh-TW' | 'en';
  theme: {
    mode: 'auto' | 'light' | 'dark';
    accent: string | 'fromWallpaper';   // ★ 壁纸取色
    radius: number;
  };
  layout: {
    columns: number;
    iconSize: number;
    gap: number;
    align: 'left' | 'center';
    showLabels: boolean;
  };
  background: {
    type: 'none' | 'color' | 'image' | 'bingDaily' | 'url' | 'video';
    color?: string;
    assetId?: string;         // IndexedDB 引用
    url?: string;
    blur: number;             // 0-40
    dim: number;              // 0-100
    refresh: 'never' | 'daily' | 'hourly';
  };
  search: {
    engine: string;           // 引擎 id
    engines: SearchEngine[];
    suggestions: boolean;
    openInNewTab: boolean;
  };
  widgets: {
    clock: { on: boolean; style: 'digital' | 'flip'; seconds: boolean };
    weather: { on: boolean; lat?: number; lon?: number; city?: string; unit: 'c' | 'f' };
    notes: { on: boolean; align: string };
    todo: { on: boolean };
    quote: { on: boolean; source: 'hitokoto' | 'jinrishici' | 'off' };
  };
  privacy: {
    networking: Record<string, boolean>;  // 'bingWallpaper' | 'suggestion' | 'weather' | 'quote'
  };
  performance: {
    mode: 'quality' | 'balanced' | 'fast';  // ★ GPU 兜底
    animations: boolean;
    lazyWallpaper: boolean;
  };
}

// ── 同步元信息（local only，不参与同步）────────────────────
interface SyncState {
  deviceId: string;
  lastSyncedRev: number;
  outbox: Array<{ key: string; value: unknown; rev: number }>;
  conflictLog: Array<{ key: string; at: number; local: unknown; remote: unknown }>;
}
```

### 6.4 同步协议（在 `chrome.storage.sync` 上模拟一个可用的 CRDT）

`chrome.storage.sync` 只在"条目"粒度做 last-write-wins，**没有服务端合并**。我们能做的：

```
写入路径：
  UI 变更
    → 内存 state 立即更新（乐观 UI）
    → rev = max(本地 rev, 全局 rev) + 1
    → 写入本地 IndexedDB 的 outbox（持久化，断电不丢）
    → 防抖 800~1500ms
    → 一次 set({ 'b/xx': {...}, 'meta': {...} })   ← 批量，只算 1 次写操作
    → 成功后出队；失败则退避重试（1s/4s/15s/60s）

监听路径：
  chrome.storage.onChanged (area === 'sync')
    → 逐个 key 判断
        · 来自自己（deviceId === meta.deviceId 且 rev 已被自己写过）→ 忽略
        · 对方 rev > 我方 rev → 采纳
        · 对方 rev < 我方 rev → 忽略（下次我方写入时会覆盖回去）
        · rev 相同但内容不同 → 冲突：保留两方到 conflictLog，采纳"修改时间更晚"的
    → 更新内存 state，重建 UI
```

**关键决策与理由：**

| 决策 | 替代方案 | 为什么这样选 |
| --- | --- | --- |
| **每个实体一个 key** | 整库分片 | 冲突面积从"全库"缩到"单条"；写入量从 100 KB 降到 ~150 B |
| **Lamport 计数器（`rev`）而非时间戳** | `Date.now()` | 设备时钟不可信（用户改时间、时区、休眠）。Lamport 保证"因果关系上更晚的 rev 更大" |
| **墓碑（`deleted: true`）+ 延迟 GC** | 直接 `remove()` | `remove()` 在另一台设备看来等于"不存在"，同步后会"复活"。墓碑至少保留 90 天再 GC |
| **outbox 持久化在 IndexedDB** | 只放内存 | MV3 的 service worker 随时会被杀；新标签页关闭也会丢内存 |
| **批量 `set()`** | 逐条 `set()` | 官方按"操作次数"计费，一次 `set(dict)` 无论多少 key 都是 1 次 |
| **800ms+ 防抖** | 立即写 | 1800 次/小时是硬顶，拖拽整理一次就 20+ 次 |
| **不做三路合并（3-way merge）** | 引入 merge 逻辑 | 成本极高、收益极低。图标排序类数据的 LWW 完全够用 |

**为什么不用真正的 CRDT（如 Yjs / Automerge）？**

- 体积：`yjs` 压缩后 ~40 KB gzip，**占掉我们整个 bundle 预算的 1/4**；
- 收益：对"图标列表/待办"这类数据，**LWW + 墓碑已能覆盖 99% 的实际冲突**；
- 例外：**便签（Notes）是长文本**，如果用户真的在两台设备同时编辑同一便签，LWW 会丢字数。
  → 折中方案：**便签按"段落/块"分 key**（`n/<id>/<blockIdx>`），把冲突粒度降到段落级。这是性价比最高的做法。

### 6.5 Schema 版本迁移

这是**所有开源项目都做不好**的地方（Tabliss 的 `next.md` 里 "handle schemas" 至今未勾选）。我们需要：

```
meta.schemaVersion = N

打开页面：
  if (N > CURRENT) {
     只读模式：提示"另一台设备使用了更新版本，请更新扩展"      ← ★ 向前兼容，绝不降级写入
     return
  }
  if (N < CURRENT) {
     清理 outbox（避免推旧结构）→ 备份当前数据到 IndexedDB('migrations/N')
     逐级执行 migrate_1_2(), migrate_2_3() ...
     写 meta.schemaVersion = CURRENT
     失败 → 回滚备份 + 提示用户导出数据
  }
```

**三条硬性要求：**

1. **迁移函数必须幂等**（重复执行结果一致）—— 因为多设备可能各自迁移一遍；
2. **迁移前必须备份**（anori 的 `capturePreUpdateBackup()` 就是干这个的）；
3. **旧版本必须能"只读"打开新数据**，而不是崩溃或清空。

### 6.6 容量预算表（用于设计评审）

| 项目 | 单条大小 | 典型数量 | 小计 |
| --- | --- | --- | --- |
| `cfg` | 2–6 KB | 1 | 6 KB |
| `meta` | ~120 B | 1 | 0.1 KB |
| 分组 `g/*` | ~90 B | 10 | 0.9 KB |
| 快捷方式 `b/*` | ~120 B | 200 | 24 KB |
| 便签块 `n/*` | ~200 B | 20 | 4 KB |
| 待办 `t/*` | ~130 B | 50 | 6.5 KB |
| 墓碑 `ts/*` | ~60 B | 100（历史累积） | 6 KB |
| **合计** | | | **≈ 48 KB / 100 KB** |

→ **重度用户（500 快捷方式 + 200 待办）约 85 KB，仍在安全线内。**
→ **预警线设在 70 KB**：超过时自动触发"墓碑 GC"，并在设置页提示"本地数据较多，建议改用导出文件备份"。

### 6.7 与竞品同步能力的对比（我们的设计目标）

| 能力 | Infinity | Tabliss | Bonjourr | anori | **我们的设计** |
| --- | --- | --- | --- | --- | --- |
| 自动同步 | ✅（需账号） | ✅（`storage.sync`） | ✅（3 档可选） | ✅（付费） | ✅（`storage.sync`） |
| 无需账号 | ❌ | ✅ | ✅ | ⚠️（免费版无） | ✅ |
| 冲突处理 | 服务端 | ❌ | ❌ | ✅ HLC | ✅ Lamport + LWW + 墓碑 |
| 删除不复活 | 服务端 | ❌ | ❌ | ✅ | ✅ 墓碑 |
| 容量上限 | 无限（云端） | 100 KB | 100 KB | 无限 | 100 KB（**已预算，够用**） |
| 大文件 | 云端 | ❌ | ❌ | OPFS | IndexedDB（本地，不同步） |
| 手动导出/导入 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 可自建后端 | ❌ | ❌ | ✅（Gist / URL） | ❌ | 🟡（M3 可选：Gist） |

---

## 7. 技术选型建议

### 7.1 三个候选方案

| 方案 | 栈 | 优点 | 缺点 | 适合 |
| --- | --- | --- | --- | --- |
| **A. 无框架 + Vite** | TS + Vanilla + Vite | 体积最小（可 < 60 KB gzip）；启动最快；零框架升级负担 | 状态管理要自己写；500 个图标时容易写成命令式烂摊子 | 极致性能导向 |
| **B. WXT + Vue 3**（推荐） | TS + Vue 3 + Pinia + WXT + Vite | WXT 自动处理 manifest/多浏览器/HMR，开发体验最好；Vue 的模板对"列表 + 拖拽"很顺手；Lemon 已验证可行 | 体积中等（Vue ~35 KB gzip）；Element Plus 偏重（可用 Naive UI 或纯 CSS 替代） | **综合最优** |
| **C. WXT + React** | TS + React 19 + jotai + WXT | 生态最大；`dnd-kit` 拖拽体验最好 | 体积最大；Concurrent 特性在新标签页这种"一次性渲染"场景收益低 | 团队熟 React |

> **我的建议：B（WXT + Vue 3）**。理由：
> 1. `WXT` 直接解决 MV3 里最琐碎的部分（`entrypoints/` 约定、manifest 生成、多浏览器打包、HMR 不丢扩展 ID）；
> 2. Vue 的 `v-for` + `TransitionGroup` 做图标网格拖拽比 React 少一半样板代码；
> 3. 如果团队更熟 React，选 C 也完全没问题，只在拖拽库上用 `dnd-kit`（`nightTab` 用 `sortablejs`，`anori` 用 `dnd-kit`，后者对触摸/键盘可达性更好）。

### 7.2 具体依赖清单建议

| 用途 | 推荐 | 许可证 | gzip 体积 | 备注 |
| --- | --- | --- | --- | --- |
| 扩展框架 | **WXT** | MIT | — | 替代手写 manifest |
| UI 框架 | **Vue 3** | MIT | ~35 KB | |
| 状态 | **Pinia** 或自写 `reactive` store | MIT | ~5 KB | 数据量小，Pinia 足够 |
| 拖拽 | **`@dnd-kit`**（React）/ **`vuedraggable`**（Vue） | MIT | ~12 KB | 需要支持触屏与键盘 |
| 图标（品牌） | **`simple-icons`**（按需，只 import 用到的；或用 `cdn.simpleicons.org` 运行时取） | **CC0-1.0**（已核实 GitHub API `spdx=CC0-1.0`） | 单图标 ~0.5 KB（整包 15.37 MB，**不可全量引入**） | 只打包 Top 200–300；**无 `domain` 字段**，需自建 `域名→slug` 映射 |
| 图标（UI 界面） | **`lucide`**（ISC）或 **`@tabler/icons`**（MIT） | ISC / MIT | ~2 KB/个 | tree-shaking 友好；lucide 2052 个、tabler 6545 个 |
| 日期/农历 | **`lunar-javascript`**（MIT，0.49 MB）或 **`solarlunar`**（ISC，0.25 MB） | MIT / ISC | 动态 import 后不影响首屏 | 需要农历时才引入 |
| 节假日 | **`chinese-days`**（MIT，0.61 MB） | MIT | 打包数据，无需网络 | 每年更新一版 |
| 城市数据 | 自建精简城市表（省市区 + 经纬度） | — | ~50 KB | 天气"手动选城市"必需 |
| ID | **`nanoid`**（或自写 8 位 base62） | MIT | ~0.3 KB | **不要用 `crypto.randomUUID()`**（36 字符太占 sync 空间） |
| 校验 | **`zod`**（可选） | MIT | ~14 KB | 若追求体积可只对 `cfg` 做手动校验 |
| 壁纸取色 | 自写（`canvas` 降采样 + 中位切分）或 `fast-average-color` | MIT | ~3 KB | 别引入完整的 color-thief |
| CSS | 原生 CSS + `:root` 变量 | — | 0 | **不需要 Tailwind**（原子类在新标签页里收益低、产物体积大） |

**明确不要引入的：**

- ❌ `moment`（150 KB+，用 `Intl.DateTimeFormat`）
- ❌ `lodash` 全量（按需 `lodash-es` 单函数）
- ❌ 完整 UI 组件库（Ant Design Vue / Element Plus 全量 > 300 KB）
- ❌ `yjs` / `automerge`（§6.4 已论述）
- ❌ 任何 CDN 资源（MV3 禁止远程代码，且违背离线可用）

**两个"看起来能用、实际有坑"的图标库：**

| 库 | 问题 |
| --- | --- |
| **Remix Icon** | ⚠️ **2026-01 起从 Apache-2.0 改为自定义 "Remix Icon License v1.0"**：禁止单独售卖图标、禁止做竞争性图标库、禁止当 logo。**且 npm 元数据仍写 Apache-2.0（元数据滞后），极易误判。** |
| **`@icon-park/svg`（字节 IconPark）** | ⚠️ **上游仓库已 archived**（GitHub API `archived=true`），维护有风险 |

另外提醒：`@iconify/json` 全量包解包后是 **670 MB**（200+ 图标集、30 万+ 图标），**绝对不能整包引入**；要用就按集装 `@iconify-json/<set>`，并逐个核对该集的 `license` 字段（在 `https://api.iconify.design/collections` 里可查）。

### 7.3 构建与工程配置

| 项 | 建议 |
| --- | --- |
| 包管理 | **pnpm** |
| 构建 | **Vite**（WXT 内置） |
| 类型 | `strict: true` + `noUncheckedIndexedAccess` |
| Lint/Format | **Biome**（一个工具搞定两者，比 ESLint+Prettier 快一个数量级，anori 在用） |
| 测试 | **Vitest**（覆盖：数据迁移、冲突消解、URL 解析、容量预算） |
| E2E | **Playwright**（WXT 支持 `--load-extension` 启动真实 Chrome） |
| CI | GitHub Actions：`typecheck` → `lint` → `test` → `build` → 产物 zip |
| 版本 | `semver`，`meta.schemaVersion` 与 `package.json.version` **解耦**（前者只在结构变化时 +1） |
| 固定扩展 ID | manifest 里加 `"key"` 字段（开发期尤其重要，见 §5.10(6)） |

---

## 8. 实施路线图

> 原则：**每个里程碑都是一个"可以每天用"的状态**，而不是"做完了才能用"。

### M0 —— 脚手架与骨架（1 周）

| 交付 | 验收标准 |
| --- | --- |
| WXT 项目 + MV3 manifest（最小权限） | `chrome://extensions` 加载成功，`Ctrl+T` 出现自定义页 |
| 存储层（`storage.sync` / `local` / IndexedDB 三通道封装） | 单测：写入、读取、配额超限抛错可捕获 |
| 数据模型 + `Config` 默认值 + Zig-zag 版本号 | 单测：`defaults` 能深合并到任意旧版本 |
| 首屏渲染骨架（同步读 `localStorage`） | 首屏可见 < 100ms（Performance 面板实测） |

### M1 —— 核心：图标网格 + 分组（2–3 周）★ 这是"能不能替代"的分水岭

| 交付 | 验收标准 |
| --- | --- |
| 图标网格（响应式列数、尺寸、圆角、拖拽排序） | 200 个图标时拖拽流畅（60fps） |
| **分组（文件夹）**：创建/重命名/拖入/打开/删除 | 拖拽创建文件夹成功 |
| **"一键打开分组内全部"**（Infinity 的招牌能力） | 需要 `tabs` 权限；无权限时降级为逐个 `window.open` |
| 自定义图标：品牌 slug 选择器 + 上传图片 + 文字图标 | 上传的图片进 IndexedDB，`storage.sync` 只存 `assetId` |
| Favicon 链路：品牌表 → `_favicon` → 三级抓取 → 文字 | 首屏不因抓图而阻塞 |
| 右键菜单：编辑/删除/复制链接/移动到分组 | — |

### M2 —— 外观：壁纸 + 主题 + 搜索（2 周）

| 交付 | 验收标准 |
| --- | --- |
| 壁纸：纯色 / 本地图 / 视频（默认关）/ Bing 每日 / 自定义 URL | 本地壁纸存 IndexedDB，Blob URL 正确 revoke；申请 `storage.persist()` |
| 模糊 / 压暗 / 每 24h 刷新（`chrome.alarms`） | 断网时显示缓存壁纸 |
| **壁纸取色 → 主题色**（"莫奈取色"） | 换壁纸后强调色跟随，1s 内完成 |
| 搜索框：多引擎 + 联想（Bing/百度）+ 键盘导航 | Google 联想失败时**静默降级为无联想**，不报错 |
| 时钟 / 日期（含农历，动态 import） | 农历模块不影响首屏 |
| 深色模式（含设置页！） | Infinity 用户明确吐槽的点 |

### M3 —— 效率：便签 + 待办 + 同步（2–3 周）

| 交付 | 验收标准 |
| --- | --- |
| 便签（分块存储，支持 Markdown 纯文本） | 两设备同时编辑不同块不丢字 |
| 待办（勾选、排序、归档） | 100 条待办下操作无卡顿 |
| **同步引擎**：Lamport + LWW + 墓碑 + outbox + 批量写 | 单测：模拟两设备交替写入，最终状态一致（属性测试） |
| **设置页同步状态面板**：已用 x/100 KB 进度条、上次同步时间、冲突记录 | 超 70 KB 给出提示 |
| 手动导出 / 导入 JSON（带 `appId` + `schemaVersion` + `exportedAt`） | 可导入旧版本文件并自动迁移 |
| 隐私设置区：逐个域名开关联网能力 | 关闭后**真正不发出请求**（DevTools 验证） |

### M4 —— 打磨与可选增强（2 周+，按需）

| 交付 | 说明 |
| --- | --- |
| 天气（Open-Meteo + 手动选城市为主、定位为辅） | 中文城市表内置 |
| 迁移工具：**从 Infinity / iTab 导入** | 已有 `IzzIsHOr` 的先例证明需求真实 |
| Gist 同步（Bonjourr 式第三档） | 可选，给"Chrome 同步不可用"的用户 |
| 性能模式开关（关毛玻璃/视频/动画） | 应对 §5.1 的 GPU 卡死 |
| 多语言（zh-CN / zh-TW / en） | 用 `_locales` + `i18n` |
| Playwright E2E + 商店截图/banner | 上架准备 |

### 估算

| 里程碑 | 人周（单人，熟悉前端） | 关键风险 |
| --- | --- | --- |
| M0 | 1 | 低 |
| M1 | 2–3 | **中**：拖拽 + 文件夹的交互细节多 |
| M2 | 2 | 中：壁纸性能、取色算法 |
| M3 | 2–3 | **高**：同步引擎的正确性 |
| M4 | 2+ | 低（可选） |
| **合计到"可日常使用"（M0–M3）** | **7–9 人周** | |
| **合计到"可发布"（M0–M4）** | **9–12 人周** | |

> 对比参考：`nightTab` 有 ~90 个组件目录，`anori` 有 ~30 个插件 + 完整云同步。**我们刻意只做 Infinity 的 80%，代码量应在 6–10k 行（不含依赖）。**

---

## 9. 风险登记册

| # | 风险 | 可能性 | 影响 | 缓解措施 |
| --- | --- | --- | --- | --- |
| R1 | **`chrome.storage.sync` 在用户环境不可用**（国内 Chrome 无法登录 Google 账号） | **高** | 高 | ① 同步失败必须完全不影响本地功能；② 提供"同步健康检测"（写入后监听 `onChanged`，超时未触发则提示）；③ 提供导出/导入作为兜底；④ M3 后加 Gist 档 |
| R2 | **100 KB 配额被撑爆** | 中 | 高 | ① 铁律：二进制不进 sync；② 实时 `getBytesInUse()` 显示；③ 70 KB 预警 + 墓碑 GC；④ 分片在实体级 |
| R3 | **多设备冲突导致数据丢失** | 中 | **高** | ① Lamport + LWW + 墓碑；② outbox 持久化；③ `conflictLog` 保留最近 20 条供用户查看；④ 属性测试覆盖 |
| R4 | **GPL/AGPL 许可证污染** | 中 | **致命** | ① 立项即定"净室实现"；② 仓库加 `LICENSE`（MIT/Apache-2.0）；③ code review 时禁止粘贴外部代码；④ 不引入 GPL 依赖 |
| R5 | **新标签页首屏卡顿/GPU 崩溃**（Lemon 已发生） | 中 | 高 | ① 性能模式开关；② 默认不启用视频壁纸与大面积 `backdrop-filter`；③ 首屏同步骨架；④ 提供 `?safe=1` 诊断入口 |
| R6 | **Chrome 商店审核：新标签页+搜索双改** | 中 | 高 | ① **绝不申请 `search` 权限、绝不改 `search_provider`**；② 搜索框只做 `window.open`；③ 权限面保持最小（不要 `management`、不要 `<all_urls>` content script） |
| R7 | **图标抓取失败导致"一片空白"** | 高 | 中 | ① 五级降级链路（品牌表 → 自定义 → `_favicon` → 抓取 → 文字）；② 文字图标永不失败；③ 抓取异步不阻塞 |
| R8 | **国内网络端点失效**（Bing 壁纸接口变动、百度联想改格式） | 中 | 中 | ① 所有 Provider 抽象成可插拔接口；② 失败静默降级；③ 保留"自定义 URL"逃生舱；④ 版本更新可热替换 provider 配置 |
| R9 | **用户壁纸被浏览器清理** | 中 | 中 | `navigator.storage.persist()` + 提醒用户"删浏览器数据会丢壁纸" |
| R10 | **上游数据格式迁移失败** | 低 | 高 | 迁移前备份 + 失败回滚 + 只读模式兜底 + Vitest 覆盖每个迁移路径 |
| R11 | **维护疲劳**（本赛道通病） | 中 | 中 | ① 代码量控制在 10k 行内；② 依赖最小化（拒绝重型 UI 库）；③ 功能用插件化组织，新增不影响核心 |
| R12 | **重名/商标**（`OpenInfinity` 已被占用） | 低 | 中 | 立项时先做商店与 GitHub 名称检索，避开 Infinity 字样 |
| R13 | **数据源许可陷阱**：Pexels 明文禁止"把其内容做成壁纸类应用"；Open-Meteo / 今日诗词免费层禁止商用；Bing 壁纸 JSON 自带"仅限用作桌面壁纸" | **中高** | 中 | ① 壁纸只用 **Bing + 用户自备**，**不用 Pexels**；② 商用前把 Open-Meteo 换成 QWeather/WeatherAPI；③ 商用前把今日诗词改为本地句子包；④ 设置页"关于"区集中声明署名 |
| R14 | **API Key 泄露**（扩展包可下载） | 高 | 中 | 默认只接**无 Key**服务；需 Key 的能力走 **BYOK**（用户自填，明示风险）；或自建 Worker 代理 |
| R15 | **`favicon` 权限触发安装警告** | 中 | 中 | 官文明确：`favicon` 会告警除非同时声明 `tabs`。若追求零警告，**改用内置品牌图标 + 三级抓取**，不申请 `favicon` |

---

## 10. 附录

### 附录 A：开源项目完整索引（含链接，便于逐个复核）

**主力候选**

| 项目 | 链接 | Stars | 许可证 | MV3 |
| --- | --- | --- | --- | --- |
| nightTab | https://github.com/zombieFox/nightTab | 2.1k | GPL-3.0 | ✅ |
| Tabliss | https://github.com/joelshepherd/tabliss | 2.8k | GPL-3.0 | ✅ |
| Bonjourr | https://github.com/victrme/Bonjourr | 2.2k | GPL-3.0 | ✅ |
| anori | https://github.com/OlegWock/anori | 497 | AGPL-3.0 | ✅ |
| Lemon New Tab | https://github.com/Redlnn/lemon-new-tab | 205 | AGPL-3.0 | ✅ |
| Yet Another Speed Dial | https://github.com/conceptualspace/yet-another-speed-dial | 310 | Fair-Source | ✅ |
| TabMark | https://github.com/Alanrk/TabMark-Bookmark-New-Tab | 296 | 无 LICENSE | ✅ |
| light-tab-page | https://github.com/devifish/light-tab-page | 191 | **MIT** | ✅ |
| mue | https://github.com/mue/mue | 771 | **BSD-3** | ✅ |
| BlueFatFish | https://github.com/Jestions-dev/BlueFatFish | 504 | **MIT** | ✅ |
| Sourcetab | https://github.com/sourcetab/sourcetab | — | **MIT** | ✅ |
| Renewed Tab | https://gitlab.com/renewedtab/renewedtab | — | GPL-3.0 | ✅ |

**功能/风格参考**

| 项目 | 链接 | 参考价值 |
| --- | --- | --- |
| hexagonTab | https://github.com/zombieFox/hexagonTab | 六边形布局 |
| voltTab | https://github.com/zombieFox/voltTab | 纯 CSS 主题 |
| lumno-extension | https://github.com/kubai087/lumno-extension | 命令面板 / 模糊搜索 |
| tab-nine | https://github.com/the-wright-jamie/tab-nine | React 工程规范 |
| perfect-home | https://github.com/perfect-things/perfect-home | Svelte 栈 |
| fluent-new-tab | https://github.com/snw-mint/fluent-new-tab | Fluent Design 2 |
| widgetify-extension | https://github.com/widgetify-app/widgetify-extension | 小组件仪表盘（2025 新品） |
| open-slate | https://github.com/thepropotato/open-slate | 18 widgets + Cmd+K + 按需权限 |
| gotab-personal | https://github.com/dengxiwang/gotab-personal | 自托管 / Docker |
| funtabs | https://github.com/dengxiwang/funtabs | React + AntD 中文导航页 |
| planet-tab | https://github.com/Haojen/planet-tab | 3D 视觉 + Vim key |
| jizhi | https://github.com/liminalpurr/jizhi | 中文古诗词审美 |
| tilde | https://github.com/xvvvyz/tilde | 极简（无扩展） |
| bento | https://github.com/migueravila/bento | Tile 布局（无扩展） |
| re-start | https://github.com/refact0r/re-start | TUI 风格 |
| awesome-startpage | https://github.com/jnmcfly/awesome-startpage | 全量清单（1.3k★） |
| IzzI Speed Dial | https://github.com/IzzIsHOr/IzzI-Speed-Dial-Extension-for-Chrome | **Infinity 迁移 + 去联盟链接**（先例） |

### 附录 B：关键 API / 配额速查

```
chrome.storage.sync
  QUOTA_BYTES                    = 102,400   (100 KB)
  QUOTA_BYTES_PER_ITEM           = 8,192     (8 KB)
  MAX_ITEMS                      = 512
  MAX_WRITE_OPERATIONS_PER_MINUTE= 120
  MAX_WRITE_OPERATIONS_PER_HOUR  = 1,800

chrome.storage.local
  QUOTA_BYTES = 10,485,760 (10 MB)，unlimitedStorage 可突破

chrome.storage.session
  QUOTA_BYTES = 10,485,760 (10 MB)，仅内存

chrome.bookmarks
  MAX_WRITE_OPERATIONS_PER_HOUR  = 已废弃（不再限速）
  BookmarkTreeNode.syncing        = Chrome 134+
  BookmarkTreeNode.dateLastUsed   = Chrome 114+
  不能修改根目录 / "Bookmarks Bar" / "Other Bookmarks"

chrome_url_overrides
  只能选 bookmarks | history | newtab 之一
  无痕窗口不可覆盖

favicon
  chrome-extension://<EXT_ID>/_favicon/?pageUrl=<URL>&size=<N>
  需 "favicon" 权限（会触发警告，除非同时声明 "tabs"）
  Chrome 104+

国内可用端点
  每日壁纸  https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN
  Bing 联想 https://api.bing.com/qsonhs.aspx?type=json&q=<kw>
  百度联想  https://suggestion.baidu.com/su?p=3&ie=UTF-8&cb=&wd=<kw>   （返回 JS 文本）
  天气      https://api.open-meteo.com/v1/forecast?latitude=&longitude=&current=temperature_2m
  一言      https://v1.hitokoto.cn/
  今日诗词  https://v2.jinrishici.com/
```

### 附录 C：可直接照抄的清单（Cheat Sheet）

**睡前就能定下来的 12 条决策：**

1. 栈：**WXT + Vue 3 + TS + Pinia + Vite + Biome + Vitest**
2. 许可证：**MIT**（净室实现，不引入任何 GPL/AGPL 代码）
3. `storage.sync` 只存元数据（`~100-160 B/条`），二进制进 IndexedDB
4. 分片在**实体级**（`b/<id>`、`g/<id>`），不做整库分片
5. 团队策略：**Lamport `rev` + LWW + 墓碑 `deleted: true`（90 天 GC）**
6. 写入：**outbox（IndexedDB 持久化）→ 800ms 防抖 → 批量 `set(dict)` → 失败退避重试**
7. `cfg` 单条，硬性 < 8 KB；`meta.schemaVersion` 独立于 `package.json.version`
8. 图标链路：**Simple Icons → 自定义(IndexedDB) → `_favicon` → 三级抓取 → 文字图标**
9. 壁纸链路：**Cache API（远程）/ IndexedDB（本地）→ Blob URL → `revokeObjectURL` + `storage.persist()`**
10. 首屏：**同步读 `localStorage` 骨架（0ms）→ 异步读 `storage.sync` 覆盖**
11. 权限：必修只有 `storage` / `alarms` / `unlimitedStorage`；其余全 `optional`
12. **绝不**申请 `search`、**绝不**改 `search_provider`、**绝不**用 `management` 与 `<all_urls>` content script

**三个"一定要做"的体验细节：**

- 设置页有**同步状态面板**（已用 x/100 KB、上次同步、冲突记录）
- 设置页有**网络请求清单**（每个域名 + 用途 + 开关）
- 设置页有**性能模式**（关毛玻璃/视频/动画）—— 这是应对 L3 级 GPU 崩溃的唯一手段

### 附录 D：明确未查证 / 建议自行复核的事项

| 项 | 状态 | 建议 |
| --- | --- | --- |
| **Edge 上 `chrome.storage.sync` 是否真的跨设备同步** | **未查证（需实测）** | 装一个最小扩展，在两台登录同一 Edge 账号的设备上写入并观察 `onChanged`。**如果 Edge 不支持，同步方案需改为"仅 Chrome + Gist 兜底"** |
| Infinity / iTab / WeTab / 青柠的具体会员价格 | 未查到公开定价 | 装扩展后进设置页看会员入口；或查 App 内充值档位 |
| Tony Tab / 托尼新标签页 | 三种拼写全无结果，**恐不存在** | 向需求方确认名称来源（疑为 Infinity 评价区用户「Tony Yu」误记） |
| Iconify 各图标集合的具体许可证 | 未逐项核对 | 打包前用 `iconify` 的 metadata 逐集合核验，避免引入 CC-BY-NC |
| `Sourcetab` 的 star 数 | 未取到 | 直接访问仓库页 |
| 各产品是否依赖 Google Fonts / Unsplash | 仅核验了 Lemon（本地打包）与青柠（`font-src 'self'`） | 若要对标，可对 iTab / Infinity 的线上 bundle 做同法检查 |

### 附录 E：参考资料

**官方文档**

- Chrome 扩展 Storage API 与配额：https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome 扩展 Bookmarks API：https://developer.chrome.com/docs/extensions/reference/api/bookmarks
- 覆盖浏览器内置页：https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages
- MV3 中的 Favicon：https://developer.chrome.com/docs/extensions/how-to/ui/favicons
- Chrome Web Store 开发者计划政策：https://developer.chrome.com/docs/webstore/program-policies
- 误导/意外行为政策：https://developer.chrome.com/docs/webstore/program-policies/unexpected-behavior
- Microsoft Edge 扩展支持的 API 列表：https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support

**产品站点**

- Infinity 新标签页（中文）：https://www.infinitytab.com/zh/
- 青柠起始页：https://limestart.cn/
- Lemon New Tab 文档：https://lemon.redlnn.top

### 附录 F：外部依赖与合规总表（按"大陆可用 + 低合规风险 + 可闭源"筛选）

#### F.1 推荐组合

| 能力 | 推荐 | 零 Key | 大陆可达 | 商用 | 关键约束 |
| --- | --- | --- | --- | --- | --- |
| **每日壁纸** | `cn.bing.com/HPImageArchive.aspx` | ✅ | ✅ | ⚠️ | JSON 自带"仅限用作桌面壁纸"；图多来自 Shutterstock；**图片 CDN 有 `ACAO:*` + 8 天缓存** |
| **本地壁纸** | 用户上传 → IndexedDB | ✅ | ✅ | ✅ | 需 `navigator.storage.persist()` |
| **天气** | Open-Meteo | ✅ | ✅ | ❌ **非商用** | 商用换 QWeather / WeatherAPI |
| **站点图标** | `chrome._favicon` → `cdn.simpleicons.org` → 文字 | ✅ | ✅ | ✅ | `_favicon` 需 `favicon` 权限（有警告） |
| **UI 图标** | Lucide(ISC) / Tabler(MIT) | ✅ | ✅ | ✅ | 避免 Remix Icon、IconPark |
| **搜索联想** | Bing `osjson.aspx` + 百度 `su` + 360 `sug.so.360.cn` | ✅ | ✅ | ✅ | 百度可能 GB18030；**JSONP 不能用 `<script>`，只能 `text()` 解析** |
| **农历** | `lunar-javascript` | ✅ | ✅ 纯本地 | ✅ | — |
| **节假日** | `chinese-days`（打包） | ✅ | ✅ 纯本地 | ✅ | 每年更新 |
| **一言** | hitokoto | ✅ | ✅ | ⚠️ | QPS 2；大流量需授权 |
| **诗词** | 今日诗词（或本地句子包） | ✅ | ✅ | ❌ **非商用** | 首次需 `/token` |
| **汇率** | `open.er-api.com/v6/latest/CNY` | ✅ | ✅ | ⚠️ **必须署名** "Rates By Exchange Rate API" | 每日更新 |
| **A 股行情** | `qt.gtimg.cn/q=sh000001` | ✅ | ✅ | 未查证 | **GBK 编码**；有 `ACAO:*` |
| **RSS** | 自解析 XML（`fetch` + `DOMParser`） | ✅ | ✅ | ✅ | 需把域名加进 `optional_host_permissions` |

#### F.2 明确不要用的

| 源/库 | 原因 |
| --- | --- |
| **Pexels API** | 其文档**明确禁止** "making Pexels content available as a **wallpaper app**" —— **壁纸类新标签页直接命中红线** |
| **Pixabay API** | 禁止永久热链（须先下载）；响应必须缓存 24 小时；条款更繁琐 |
| **Unsplash Source 端点** | `source.unsplash.com` **已下线**（实测 503）；API 版必须热链 + 署名 + Production 需申请 |
| **Google s2 favicons / DuckDuckGo icons** | 大陆不可用；且属非官方接口 |
| **新浪行情 `hq.sinajs.cn`** | 无 `Referer` 返回 `Forbidden`，而浏览器 `fetch` **不能设置 Referer**（forbidden header）→ 默认不可用 |
| **Remix Icon** | 许可证已于 2026-01 变更，且 npm 元数据滞后 |
| **IconPark** | 上游仓库 archived |
| **`@iconify/json` 全量** | 解包 670 MB |
| **Google Fonts / 任何字体 CDN** | 大陆不稳；且所有可用竞品（Lemon、light-tab-page、青柠）**都本地打包/子集化字体** |
| **任何 JSONP `<script src>`** | MV3 禁止远程脚本；只能 `fetch` + 文本解析 |

#### F.3 许可证速查（对"闭源分发 + 二次修改"）

| 许可证 | 闭源分发 | 修改后闭源 | 义务要点 |
| --- | --- | --- | --- |
| MIT | ✅ | ✅ | 保留版权与许可声明 |
| Apache-2.0 | ✅ | ✅ | 保留 NOTICE；**声明修改过的文件** |
| BSD-3-Clause | ✅ | ✅ | 保留声明；**不得用原作者名背书** |
| MPL-2.0 | ✅ | ✅（**改过的 MPL 文件**须以 MPL 公开） | 文件级 copyleft |
| **GPL-3.0** | ❌ | ❌ | 整部作品传染，分发时须提供源码 |
| **AGPL-3.0** | ❌ | ❌ | GPL 全部义务 + §13 网络交互条款 |

**关于 AGPL 对浏览器扩展的实际含义（本赛道的核心问题）：**

1. 分发扩展**本身就是分发**，§4–§6 的源码提供义务已成立 —— **与有没有后端无关**；
2. §13 对纯客户端扩展通常不构成**额外**触发点（用户不构成 "remote network interaction"），但若后端也基于该代码，后端须向使用者提供源码；
3. **"闭源 + AGPL 基础项目" = 不可能合规**。只有三条出路：整体 AGPL 开源 / **净室重写** / 取得**商业 dual license**；
4. **商店合规 ≠ 许可证合规** —— Chrome Web Store 不检查开源许可证，风险由你承担。

> 这正是本报告反复强调"只能参考设计、不能复制代码"的法律依据。

---

## 结语：一句话回答你的问题

**"有没有相关的开源项目？"——有，而且不少；"有没有能直接当平替用的？"——没有。**

真正值得做的事，是**把 nightTab 的功能清单当需求规格、把 anori 的插件分层当架构模板、把 Bonjourr 的三档同步当同步设计、把 light-tab-page 的 Blob 壁纸当实现范式、把 Yet Another Speed Dial 的"书签当数据库"当容量解法**，然后用 MIT 许可净室重写一遍。

而这套东西真正能赢过 Infinity 的地方，不在功能多少，而在三句话：

> **你的图标 URL 永远不会被我们改写成联盟链接。**
> **你的数据永远不需要经过我们的服务器。**
> **断网也照样能开。**

---

*报告完。如需下一步，我可以基于本文档 §6 的数据模型与 §8 的路线图，直接产出 M0/M1 的工程骨架。*

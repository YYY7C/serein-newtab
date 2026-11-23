# 安全策略

## 报告漏洞

请不要在公开 issue 里披露可利用细节。优先使用 GitHub 的私密漏洞报告：

<https://github.com/YYY7C/serein-newtab/security/advisories/new>

如果无法使用该入口，可以开一个不含复现细节的 issue，说明「需要私下联系」。

请尽量提供：

- 受影响的版本（设置 → 关于，或 `manifest.json` 的 `version`）
- 浏览器与版本
- 复现步骤或概念验证
- 影响范围（数据泄露、权限提升、持久化 XSS 等）

## 范围

Serein 是纯前端 MV3 扩展，没有服务器。重点关注：

- 扩展页内的注入（快捷方式标题/URL、导入的备份、自定义图标）
- 权限边界（`host_permissions`、可选权限）
- 备份 zip 解析
- IndexedDB / localStorage 的数据完整性
- 供应链：开发依赖（`package.json`）与打包脚本

## 不在范围

- 需要用户先安装恶意扩展/修改系统才能触发的本地攻击
- 第三方服务（必应、Open-Meteo、搜索联想）自身的漏洞
- 浏览器平台限制（例如无痕窗口不能覆盖新标签页）

## 处理方式

会在确认后尽快修复，并在 CHANGELOG 中注明。没有赏金计划。

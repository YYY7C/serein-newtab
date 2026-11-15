# 品牌图标来源与使用说明

`src/assets/brand/` 下是 Lumen 内置的站点图标。它们只用于「在快捷方式上标明这是哪个网站」，
不表示与该品牌存在任何关联、赞助或背书。

## 来源

| 类别 | 图标 | 来源 / 许可 |
| --- | --- | --- |
| 单色字形 | baidu、bilibili、zhihu、github、youtube 等约 70 个 | 取自 [Simple Icons](https://simpleicons.org)，该图标集以 **CC0 1.0** 释出；本项目把它们重新排进 48×48 的白底方块，并按各品牌官方色上色 |
| 多色 / 手绘 | `google`、`figma`、`instagram`、`microsoft`、`bing`、`jd`、`douyin`、`deepseek` | 本项目按品牌公开标识自行绘制的简化几何图形 |

## 商标

所有品牌名称、标识与商标归各自所有者所有。这里的图形仅作为「指向该站点的书签」使用，
属于指明来源的合理使用。若你是权利方并希望移除某个图形，提一个 issue 即可，我们会尽快删除。

## 重新生成

```bash
# 1) 下载 Simple Icons 原始 SVG（文件名 = slug.svg）到任意目录
# 2) 重新生成
node src/tools/build-brand-logos.mjs --src <该目录>
```

生成器只覆盖单色字形；上表中「多色 / 手绘」的图标是手写的，生成器会跳过，不会被覆盖。

## 未收录的站点

没有内置图标的站点会自动退回 Chrome 本地缓存的站点图标（`favicon` 权限），
再退回按域名生成的品牌色字符徽标，因此离线也不会出现空白方块。

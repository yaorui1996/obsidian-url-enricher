# URL Enricher (fork)

**English** | [中文](#中文)

Fork of [mattmarotta/obsidian-url-enricher](https://github.com/mattmarotta/obsidian-url-enricher) — an Obsidian plugin that shows title, description, and favicon previews for URLs in your notes without changing the markdown underneath.

- Upstream documentation: [README.upstream.md](./README.upstream.md) · [Upstream changelog](./CHANGELOG.md)

## Fork features

### Favicon preview style

A third preview style, `Favicon`, that looks like the inline style (favicon + pill background + plugin font) but shows the **URL text as written** instead of a fetched page title:

- **No page fetches** — the linked page is never requested; no metadata (title/description) is fetched at all. Only the Google favicon service is contacted for the icon (cached for 30 days)
- **Text is the URL itself** — the preview shows the exact URL from your markdown, never replaced by fetched content
- Like the inline style, the URL is revealed as raw text while the caret is inside it
- Set it globally in the plugin settings (Preview style → `Favicon`), or per note via frontmatter:

```yaml
---
preview-style: favicon
---
```

---

## 中文

**Fork 自 [mattmarotta/obsidian-url-enricher](https://github.com/mattmarotta/obsidian-url-enricher)** —— 一个不改 markdown 源码、在笔记内渲染 URL 标题/描述/favicon 预览的 Obsidian 插件。

- 上游文档：[README.upstream.md](./README.upstream.md) · [上游更新日志](./CHANGELOG.md)

## Fork 新增功能

### Favicon 预览模式

新增第三种预览风格 `Favicon`，视觉上和 inline 一样（图标 + 胶囊底色 + 插件字体），但显示的是 **URL 原文**而不是抓取的页面标题：

- **不抓取网页** —— 完全不请求链接页面，不获取标题/描述元数据。只有 favicon 图标走 Google favicon 服务（缓存 30 天）
- **文字就是 URL 本身** —— 预览里显示的正是 markdown 里写的那个 URL，永远不会被替换成抓取来的内容
- 和 inline 一样：光标移进 URL 时会露出原始文本方便编辑
- 全局设置：插件设置里 Preview style 选 `Favicon`；或按笔记用 frontmatter 覆盖：

```yaml
---
preview-style: favicon
---
```

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
- **Works in Reading view too** — a markdown post processor renders the same pill in Reading view (Live Preview stays non-destructive; Reading view replaces the rendered link element with the pill, the markdown file is still never modified). inline/card styles remain Live-Preview-only
- Set it globally in the plugin settings (Preview style → `Favicon`), or per note via frontmatter:

```yaml
---
preview-style: favicon
---
```

### fetch-title CLI (URL → preview text, outside Obsidian)

The plugin's title-resolution pipeline is also packaged as a standalone Node CLI, so external tools (e.g. openclaw) can ask "what text would the plugin display for this URL?" without running Obsidian:

```powershell
npm run build                                            # produces dist/fetch-title.cjs
npm run fetch-title -- https://obsidian.md               # JSON: {url, title, description, siteName, error}
npm run fetch-title -- --plain https://obsidian.md       # title text only
npm run fetch-title -- --timeout 5000 https://github.com # custom timeout (ms)
```

Same pipeline as the inline preview: fetch page → parse og:/twitter:/`<title>`/JSON-LD → domain-specific handlers (Twitter/Wikipedia/Reddit/…) → hostname fallback. One process per invocation, results printed as JSON lines.

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
- **阅读模式同样生效** —— 通过 markdown post processor 在阅读视图渲染同样的胶囊（Live Preview 本就不改源码；阅读视图只是把渲染出来的链接元素替换成胶囊，markdown 文件依旧永不被修改）。inline/card 仍仅限 Live Preview
- 全局设置：插件设置里 Preview style 选 `Favicon`；或按笔记用 frontmatter 覆盖：

```yaml
---
preview-style: favicon
---
```

### fetch-title CLI（URL → 替换文字，Obsidian 之外可用）

插件的标题解析管线同时打包成了独立的 Node CLI，让外部工具（如 openclaw）不跑 Obsidian 也能问"这个 URL 插件会显示什么文字"：

```powershell
npm run build                                            # 产出 dist/fetch-title.cjs
npm run fetch-title -- https://obsidian.md               # JSON: {url, title, description, siteName, error}
npm run fetch-title -- --plain https://obsidian.md       # 只输出标题文本
npm run fetch-title -- --timeout 5000 https://github.com # 自定义超时（毫秒）
```

与 inline 预览同一套管线：抓页面 → 解析 og:/twitter:/`<title>`/JSON-LD → 站点特化 handler（Twitter/Wikipedia/Reddit 等）→ 域名兜底。每次调用一个进程，结果按行输出 JSON。

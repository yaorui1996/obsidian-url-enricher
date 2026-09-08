# URL Enricher (fork)

**English** | [中文](#中文)

Fork of [mattmarotta/obsidian-url-enricher](https://github.com/mattmarotta/obsidian-url-enricher) — an Obsidian plugin that shows title, description, and favicon previews for URLs in your notes without changing the markdown underneath.

- Upstream documentation: [README.upstream.md](./README.upstream.md) · [Upstream changelog](./CHANGELOG.md)

## Fork features

### Favicon preview style

A third preview style, `Favicon`, that renders each link as an **inline pill: the site favicon icon + the link's own 文字 label**, with the URL kept as the click target. It is the least invasive style: the label and destination stay exactly as you wrote them, the markdown `[text](url)` is never modified, no page is fetched, and the only outbound call is the Google favicon service (cached for 30 days):

- **A pill around your own text** — `[文档](https://example.com)` renders as `(icon) 文档` inside a pill (favicon + the label you wrote); the URL is the link target, unchanged
- **Editing-friendly** — while the caret is inside the link, the pill yields so Obsidian's Live Preview shows the raw `[text](url)` for editing; it returns once you move the caret away
- **No page fetches** — no metadata (title/description) is fetched at all; only the Google favicon service is contacted for the icon
- **Works in Reading view too** — a markdown post processor renders the same pill in Reading view (Live Preview and Reading view are both non-destructive; the markdown file is never modified). inline/card styles remain Live-Preview-only
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
npm run fetch-title -- https://obsidian.md               # JSON: {url, title, description, siteName, error, isAttachment}
npm run fetch-title -- --plain https://obsidian.md       # title text only
npm run fetch-title -- --timeout 5000 https://github.com # custom timeout (ms)
```

Same pipeline as the inline preview: fetch page → parse og:/twitter:/`<title>`/JSON-LD → domain-specific handlers (Twitter/Wikipedia/Reddit/…) → hostname fallback. One process per invocation, results printed as JSON lines.

### Attachment URL exclusion

Not every URL is a web page — notes often link to files (pdf, zip, images, …). Those would normally get a fetch (or a favicon call for a plain file), which is noise. Now URLs whose last segment looks like a filename — has an extension and isn't a web-page suffix (`.html`/`.php`/…) — are **skipped entirely**: no preview pill, no fetch, and Obsidian's native link handling is left untouched. Applies to all three preview styles, in both Live Preview and Reading view.

- **Static detection, no request** — the judgment is purely from the URL text (last path segment with a non-web extension), so no request is made just to decide
- **Works everywhere** — favicon, inline, and card styles, in Live Preview and Reading view; the fetch-title CLI flags them too (`isAttachment: true`)
- **Extra skip rules** — the settings tab (Attachment handling) accepts a comma/newline-separated list of substrings; any URL containing one (e.g. `/d/picgo/`, `alist.yaorui.top`) is also skipped, on top of the filename heuristic

---

## 中文

**Fork 自 [mattmarotta/obsidian-url-enricher](https://github.com/mattmarotta/obsidian-url-enricher)** —— 一个不改 markdown 源码、在笔记内渲染 URL 标题/描述/favicon 预览的 Obsidian 插件。

- 上游文档：[README.upstream.md](./README.upstream.md) · [上游更新日志](./CHANGELOG.md)

## Fork 新增功能

### Favicon 预览模式

新增第三种预览风格 `Favicon`，把每个链接渲染成**行内胶囊：站点 favicon 图标 + 链接自己的文字标签**，URL 仍是跳转目标。这是改动最小的风格：文字和目标保持你写的原样，`[文字](URL)` 源码一字不改，不抓页面，唯一外呼是 Google favicon 服务（缓存 30 天）：

- **胶囊包住你自己的文字** —— `[文档](https://example.com)` 渲染成胶囊 `(icon) 文档`（favicon + 你写的文字）；URL 作为链接目标不变
- **编辑友好** —— 光标落在链接内时，胶囊让位，Obsidian Live Preview 显示原始 `[文字](URL)` 供修改；光标移开后胶囊自动回来
- **不抓取网页** —— 完全不请求链接页面，不获取标题/描述元数据。只有 favicon 图标走 Google favicon 服务
- **阅读模式同样生效** —— 通过 markdown post processor 在阅读视图渲染同样的胶囊（Live Preview 和阅读视图都不改源码，markdown 文件永不被修改）。inline/card 仍仅限 Live Preview
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
npm run fetch-title -- https://obsidian.md               # JSON: {url, title, description, siteName, error, isAttachment}
npm run fetch-title -- --plain https://obsidian.md       # 只输出标题文本
npm run fetch-title -- --timeout 5000 https://github.com # 自定义超时（毫秒）
```

与 inline 预览同一套管线：抓页面 → 解析 og:/twitter:/`<title>`/JSON-LD → 站点特化 handler（Twitter/Wikipedia/Reddit 等）→ 域名兜底。每次调用一个进程，结果按行输出 JSON。

### 附件 URL 排除

不是每个 URL 都是网页——笔记里常引用文件（pdf / zip / 图片……）。这类链接原本也会去抓页面/Favicon，属于噪音。现在末段像文件名（带扩展名、且非网页后缀如 `.html`/`.php`）的 URL 会被**整段跳过**：不渲染胶囊、不发请求，Obsidian 对它的原生处理原样保留。三种预览风格都生效，Live Preview 和阅读视图都覆盖。

- **静态判定、不访问 URL** —— 只凭 URL 文本判断（末段路径带非网页扩展名），不需要为判断而去请求目标站
- **到处都生效** —— favicon / inline / card 三种风格，Live Preview 与阅读视图；fetch-title CLI 也会标记它们（`isAttachment: true`）
- **额外排除规则** —— 设置面板（Attachment handling）可填逗号/换行分隔的子串列表，URL 含其中任一子串（如 `/d/picgo/`、`alist.yaorui.top`）也一并跳过，与文件名启发式叠加

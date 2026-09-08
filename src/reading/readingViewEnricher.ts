import type {
	MarkdownPostProcessor,
	MarkdownPostProcessorContext
} from "obsidian";
import type { InlineLinkPreviewSettings } from "../settings";
import type { LinkPreviewService } from "../services/linkPreviewService";
import type { LinkMetadata } from "../services/types";
import { UrlPreviewWidget } from "../decorators/PreviewWidget";
import { calculateMaxLength, processMetadata } from "../decorators/DecorationBuilder";
import { parsePageConfigFromFrontmatter } from "../decorators/FrontmatterParser";
import { URL_IN_TEXT_REGEX, isAttachmentUrl, matchesAnyRule } from "../utils/url";

/**
 * Reading view (preview mode) support for the favicon preview style.
 *
 * Live Preview renders via a CodeMirror ViewPlugin, which never runs in
 * Reading view. This post processor brings the favicon mode there: same pill
 * (favicon icon + inline styling + the link's own 文字 label), same no-fetch
 * contract - only the Google favicon service may be contacted.
 *
 * inline/card stay Live-Preview-only: they depend on async metadata fetches,
 * while this pipeline is a synchronous DOM pass.
 */

/** Elements whose subtree must never be enriched */
const SKIP_TAGS = new Set(["CODE", "PRE", "SCRIPT", "STYLE"]);

/** Marker class carried by every enriched pill (idempotency) */
const ENRICHED_MARKER = "url-preview";

function shouldSkip(element: HTMLElement | null): boolean {
	while (element) {
		if (SKIP_TAGS.has(element.tagName)) {
			return true;
		}

		// The pill's text is the run's own label/URL, so a second pass would
		// enrich the same URL again without this marker check.
		if (element.classList.contains(ENRICHED_MARKER)) {
			return true;
		}
		element = element.parentElement;
	}
	return false;
}

/**
 * Build the favicon pill for one URL - the Reading view counterpart of the
 * favicon branch in DecorationBuilder.processUrlMatch. The pill shows the
 * link's own text (`label`, falling back to the URL for bare links) plus the
 * site icon; the URL remains the click target and the source `[text](url)` is
 * never modified. No page is fetched, only the Google favicon service.
 */
function buildPreviewElement(
	url: string,
	label: string,
	service: LinkPreviewService,
	settings: InlineLinkPreviewSettings,
	pageConfig: ReturnType<typeof parsePageConfigFromFrontmatter>
): HTMLElement | null {
	// Skip attachment files (URL's last segment looks like a filename) and any
	// URL matching a user-configured skip rule - they keep Obsidian's native
	// rendering, no pill is added.
	if (isAttachmentUrl(url) || matchesAnyRule(url, settings.attachmentSkipRules)) {
		return null;
	}

	const previewStyle = pageConfig.previewStyle ?? settings.previewStyle;
	if (previewStyle !== "favicon") {
		return null;
	}

	const maxCardLength = pageConfig.maxCardLength ?? settings.maxCardLength;
	const maxInlineLength = pageConfig.maxInlineLength ?? settings.maxInlineLength;
	const inlineColorMode = pageConfig.inlineColorMode ?? settings.inlineColorMode;
	const cardColorMode = pageConfig.cardColorMode ?? settings.cardColorMode;
	const keepEmoji = settings.keepEmoji;

	const faviconUrl = service.getFaviconIconUrl(url);
	if (!faviconUrl) {
		return null;
	}
	const limit = calculateMaxLength(previewStyle, maxCardLength, maxInlineLength);

	const metadata: LinkMetadata = {
		title: label.trim() ? label : url,
		description: null,
		favicon: faviconUrl
	};
	const processed = processMetadata(metadata, url, label, {
		previewStyle,
		maxCardLength,
		maxInlineLength,
		showFavicon: true,
		includeDescription: false,
		keepEmoji
	});

	const widget = new UrlPreviewWidget(
		url,
		processed.title,
		processed.description,
		processed.faviconUrl,
		false,
		"inline",
		limit,
		processed.siteName,
		processed.error,
		inlineColorMode,
		cardColorMode
	);
	return widget.toDOM();
}

/** Replace an external-link anchor with its favicon pill, keeping the URL live */
function enrichAnchor(
	anchor: HTMLAnchorElement,
	service: LinkPreviewService,
	settings: InlineLinkPreviewSettings,
	pageConfig: ReturnType<typeof parsePageConfigFromFrontmatter>
): void {
	const href = anchor.getAttribute("href");
	if (!href || !/^https?:\/\//i.test(href)) {
		return;
	}
	// For a markdown link the anchor's own text is the 文字 label; for a bare
	// auto-linked URL it is the URL itself - either way it is the passed label.
	const label = anchor.textContent ?? "";
	const preview = buildPreviewElement(href, label, service, settings, pageConfig);
	if (!preview) {
		return;
	}
	anchor.replaceWith(preview);
}

/**
 * Fallback pass for bare URLs that Obsidian did not auto-link: splice a favicon
 * pill in place of each URL text, keeping the URL text as the pill's label (the
 * URL was not a link, so its text is preserved and only the style is added).
 */
function enrichTextNode(
	textNode: Text,
	service: LinkPreviewService,
	settings: InlineLinkPreviewSettings,
	pageConfig: ReturnType<typeof parsePageConfigFromFrontmatter>
): void {
	const text = textNode.textContent ?? "";
	if (!text) {
		return;
	}

	// Copy with fresh state: the exported constant carries the `g` flag, so
	// its lastIndex would leak between calls if used directly.
	const urlRegex = new RegExp(URL_IN_TEXT_REGEX.source, "gi");

	type Segment = { text: string } | { pill: HTMLElement };
	const segments: Segment[] = [];
	let lastIndex = 0;
	let found = false;

	for (const match of text.matchAll(urlRegex)) {
		const matchIndex = match.index ?? 0;
		const url = match[0];

		const pill = buildPreviewElement(url, url, service, settings, pageConfig);
		if (!pill) {
			continue;
		}

		if (matchIndex > lastIndex) {
			segments.push({ text: text.slice(lastIndex, matchIndex) });
		}

		segments.push({ pill });

		lastIndex = matchIndex + url.length;
		found = true;
	}

	if (!found) {
		return;
	}

	if (lastIndex < text.length) {
		segments.push({ text: text.slice(lastIndex) });
	}

	const parent = textNode.parentElement;
	if (!parent) {
		return;
	}

	// Splice segment-by-segment before the text node, then drop it - no
	// fragment needed, and every inserted node stays in the parent's document.
	for (const segment of segments) {
		if ("pill" in segment) {
			parent.insertBefore(segment.pill, textNode);
		} else {
			parent.insertBefore(textNode.ownerDocument.createTextNode(segment.text), textNode);
		}
	}
	parent.removeChild(textNode);
}

/**
 * Create the Reading view post processor for the favicon preview style.
 *
 * URL discovery is two-pass, mirroring what the Live Preview decorator sees:
 * 1. anchors - Obsidian renders markdown links, autolinks and `[[url]]`
 *    wikilinks as external <a> elements in Reading view
 * 2. text nodes - defensive fallback for bare URLs that were not auto-linked
 */
export function createReadingViewPostProcessor(
	service: LinkPreviewService,
	getSettings: () => InlineLinkPreviewSettings
): MarkdownPostProcessor {
	return (element: HTMLElement, context: MarkdownPostProcessorContext): void => {
		const settings = getSettings();

		// Merge frontmatter overrides over global settings (frontmatter wins),
		// same precedence as DecorationBuilder's pageConfig ?? globalSettings.
		// The API types frontmatter loosely; guard before handing it over.
		const rawFrontmatter: unknown = context.frontmatter;
		const frontmatter =
			typeof rawFrontmatter === "object" && rawFrontmatter !== null
				? (rawFrontmatter as Record<string, unknown>)
				: undefined;
		const pageConfig = parsePageConfigFromFrontmatter(frontmatter);
		const previewStyle = pageConfig.previewStyle ?? settings.previewStyle;

		// Only the favicon style renders in Reading view; inline/card remain
		// Live-Preview-only and leave the native link rendering untouched.
		if (previewStyle !== "favicon") {
			return;
		}

		// Opt-in mode: no plugin-relevant frontmatter key -> do nothing,
		// matching DecorationBuilder's requireFrontmatter gate.
		if (settings.requireFrontmatter && Object.keys(pageConfig).length === 0) {
			return;
		}

		// Pass 1: external link anchors
		const anchors = Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href^="http://"], a[href^="https://"]'));
		for (const anchor of anchors) {
			if (!shouldSkip(anchor)) {
				enrichAnchor(anchor, service, settings, pageConfig);
			}
		}

		// Pass 2: bare URLs in text nodes that Obsidian left unlinked.
		// Skip text inside anchors (the anchor pass owns those - splicing here
		// would nest a pill inside a link) and inside SVG (e.g. mermaid
		// diagrams, where HTML fragments don't belong).
		const walker = activeDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		let current = walker.nextNode();
		while (current) {
			const parent = current.parentElement;
			if (
				parent &&
				current.textContent &&
				!shouldSkip(parent) &&
				!parent.closest("a, svg")
			) {
				textNodes.push(current as Text);
			}
			current = walker.nextNode();
		}
		for (const textNode of textNodes) {
			enrichTextNode(textNode, service, settings, pageConfig);
		}
	};
}

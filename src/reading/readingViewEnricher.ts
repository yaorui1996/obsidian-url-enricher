import type {
	MarkdownPostProcessor,
	MarkdownPostProcessorContext
} from "obsidian";
import type { InlineLinkPreviewSettings } from "../settings";
import type { LinkPreviewService } from "../services/linkPreviewService";
import type { LinkMetadata } from "../services/types";
import { UrlPreviewWidget } from "../decorators/PreviewWidget";
import { processMetadata, calculateMaxLength } from "../decorators/DecorationBuilder";
import { parsePageConfigFromFrontmatter } from "../decorators/FrontmatterParser";
import { URL_IN_TEXT_REGEX, isAttachmentUrl, matchesAnyRule } from "../utils/url";

/**
 * Reading view (preview mode) support for the favicon preview style.
 *
 * Live Preview renders via a CodeMirror ViewPlugin, which never runs in
 * Reading view. This post processor brings the favicon mode there: same pill
 * (favicon icon + inline styling), same URL-as-text rule, same no-fetch
 * contract - only the Google favicon service may be contacted.
 *
 * inline/card stay Live-Preview-only: they depend on async metadata fetches,
 * while this pipeline is a synchronous DOM pass.
 */

/** Elements whose subtree must never be enriched */
const SKIP_TAGS = new Set(["CODE", "PRE", "SCRIPT", "STYLE"]);

/** Marker class used to detect already-enriched containers (idempotency) */
const ENRICHED_MARKER = "url-preview";

function shouldSkip(element: HTMLElement | null): boolean {
	while (element) {
		if (SKIP_TAGS.has(element.tagName)) {
			return true;
		}

		// The pill's text is the URL itself - without this check the
		// processor would wrap already-enriched previews a second time.
		if (element.classList.contains(ENRICHED_MARKER)) {
			return true;
		}
		element = element.parentElement;
	}
	return false;
}

/**
 * Build the preview pill for one URL - the Reading view counterpart of the
 * favicon branch in DecorationBuilder's processUrlMatch (same metadata
 * synthesis, same settings flags, same widget, rendered via toDOM()).
 */
function buildPreviewElement(
	url: string,
	service: LinkPreviewService,
	settings: InlineLinkPreviewSettings,
	pageConfig: ReturnType<typeof parsePageConfigFromFrontmatter>
): HTMLElement | null {
	// Skip attachment files (URL's last segment looks like a filename) and any
	// URL matching a user-configured skip rule - they keep Obsidian's native
	// rendering instead of a preview pill.
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

	// title = URL as written; description dropped; favicon resolved
	// synchronously from the persistent cache (never fetches the page).
	const metadata: LinkMetadata = {
		title: url,
		description: null,
		favicon: service.getFaviconIconUrl(url)
	};

	const processed = processMetadata(metadata, url, undefined, {
		previewStyle,
		maxCardLength,
		maxInlineLength,
		// The mode exists to show the icon - ignore the showFavicon setting,
		// matching the Live Preview favicon branch.
		showFavicon: true,
		includeDescription: false,
		keepEmoji: settings.keepEmoji
	});

	const widget = new UrlPreviewWidget(
		url,
		processed.title,
		null,
		processed.faviconUrl,
		false,
		"inline",
		calculateMaxLength(previewStyle, maxCardLength, maxInlineLength),
		processed.siteName,
		processed.error,
		inlineColorMode,
		cardColorMode
	);
	return widget.toDOM();
}

/** Replace an external-link anchor with the preview pill */
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
	const preview = buildPreviewElement(href, service, settings, pageConfig);
	if (!preview) {
		return;
	}
	anchor.replaceWith(preview);
}

/**
 * Fallback pass for bare URLs that Obsidian did not auto-link: split the text
 * node around each match and splice in preview pills.
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

	type Segment = { text: string } | { preview: HTMLElement };
	const segments: Segment[] = [];
	let lastIndex = 0;
	let found = false;

	for (const match of text.matchAll(urlRegex)) {
		const matchIndex = match.index ?? 0;
		const url = match[0];

		const preview = buildPreviewElement(url, service, settings, pageConfig);
		if (!preview) {
			continue;
		}

		if (matchIndex > lastIndex) {
			segments.push({ text: text.slice(lastIndex, matchIndex) });
		}
		segments.push({ preview });
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
		if ("preview" in segment) {
			parent.insertBefore(segment.preview, textNode);
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

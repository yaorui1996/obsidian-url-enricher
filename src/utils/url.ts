const SINGLE_URL_REGEX = /^https?:\/\/[^\s]+$/i;
const WRAPPED_URL_REGEX = /^<\s*(https?:\/\/[^\s>]+)\s*>$/i;

export const URL_IN_TEXT_REGEX = /https?:\/\/[^\s<>\])"']+/gi;

const REDDIT_HOST_REGEX = /^(?:www\.|new\.|np\.)?reddit\.com$/i;

/**
 * Rewrite a URL to an equivalent host that serves scrapable metadata.
 *
 * www.reddit.com answers non-browser requests with an 8KB JavaScript
 * proof-of-work interstitial whose <title> is just "Reddit", so every Reddit
 * preview came out as a bare "Reddit". old.reddit.com serves the same content
 * with full Open Graph tags and no challenge.
 *
 * This only affects the URL we FETCH - the original URL is still what gets
 * cached, displayed, and opened on click.
 *
 * @param rawUrl - The URL as written in the document
 * @returns The URL to fetch metadata from (unchanged for non-rewritten hosts)
 */
export function rewriteUrlForFetch(rawUrl: string): string {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return rawUrl;
	}

	if (REDDIT_HOST_REGEX.test(parsed.hostname)) {
		parsed.hostname = "old.reddit.com";
		return parsed.toString();
	}

	return rawUrl;
}

export function extractSingleUrl(text: string): string | null {
	if (!text) {
		return null;
	}

	const trimmed = text.trim();
	if (!trimmed) {
		return null;
	}

	const wrappedMatch = trimmed.match(WRAPPED_URL_REGEX);
	if (wrappedMatch) {
		return wrappedMatch[1];
	}

	if (SINGLE_URL_REGEX.test(trimmed)) {
		return trimmed;
	}

	return null;
}

export function looksLikeUrl(text: string): boolean {
	return SINGLE_URL_REGEX.test(text.trim());
}

/**
 * Derive a display title from a URL: the hostname without a leading "www.",
 * falling back to the raw URL when it can't be parsed. This is the plugin's
 * last-resort title, both in the decoration pipeline and in fetchTitle().
 */
export function deriveTitleFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, "") || url;
	} catch {
		return url;
	}
}

/**
 * File extensions that look like files but are actually served as web pages
 * or resources. A URL ending in one of these is NOT an attachment - it's the
 * web page itself, so it still deserves a preview.
 */
const WEB_PAGE_EXTENSIONS = new Set([
	"html",
	"htm",
	"php",
	"asp",
	"aspx",
	"jsp",
	"xml",
	"rss",
	"js",
	"css",
]);

/**
 * True for URLs that a code host renders as a web page rather than serving the
 * raw file. github.com/owner/repo/blob/main/README.md ends in .md, which the
 * extension heuristic would call an attachment, but GitHub renders that blob as
 * a page. Only the raw forms (raw.githubusercontent.com/..., github.com/.../raw/...)
 * actually deliver the file, and those never contain /blob/ so they stay
 * attachments. GitLab likewise renders /-/blob/.
 */
export function isRenderedBlobUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}

	const host = parsed.hostname.replace(/^www\./, "");
	const path = parsed.pathname;

	return (
		(host === "github.com" && path.includes("/blob/")) ||
		(host === "gitlab.com" && path.includes("/-/blob/"))
	);
}

/**
 * Decide whether a URL points at an attachment file rather than a web page.
 *
 * Judgment is purely static - no request is made - so the favicon style (which
 * never fetches the target page) still works. The rule is "the last path
 * segment looks like a filename": it has an extension, and that extension is
 * not a known web-page suffix. This catches https://alist.yaorui.top/d/picgo/test.pdf
 * while leaving /blog and /about.html (both pages) alone.
 *
 * A rendered blob view on a code host (github.com/.../blob/main/README.md)
 * counts as a page, not an attachment, even though it ends in .md.
 *
 * query/hash are ignored (URL.pathname excludes them), so
 * .../test.pdf?token=abc still resolves.
 */
export function isAttachmentUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return false;
	}

	// Code hosts render /blob/ ... into a page even when it ends in a file
	// extension, so never treat those as attachments.
	if (isRenderedBlobUrl(url)) {
		return false;
	}

	const segments = parsed.pathname.split("/").filter(Boolean);
	const lastSegment = segments[segments.length - 1] ?? "";
	if (!lastSegment || !lastSegment.includes(".")) {
		return false;
	}

	const extension = lastSegment.slice(lastSegment.lastIndexOf(".") + 1).toLowerCase();
	if (!extension) {
		return false;
	}

	return !WEB_PAGE_EXTENSIONS.has(extension);
}

/**
 * True when the URL contains any of the given comma/newline-separated rules
 * as a substring. Used for user-configured skip rules (e.g. "/d/picgo/").
 */
export function matchesAnyRule(url: string, rules: string[] | undefined): boolean {
	if (!rules || rules.length === 0) {
		return false;
	}
	return rules.some((rule) => {
		const trimmed = (rule ?? "").trim();
		return trimmed.length > 0 && url.includes(trimmed);
	});
}

const WHITESPACE_ONLY_REGEX = /^\s*$/;

export interface UrlListEntry {
	url: string;
	start: number;
	end: number;
}

export function extractUrlList(text: string): UrlListEntry[] | null {
	if (typeof text !== "string") {
		return [];
	}

	const pattern = new RegExp(URL_IN_TEXT_REGEX.source, "gi");
	const entries: UrlListEntry[] = [];
	let cursor = 0;

	for (const match of text.matchAll(pattern)) {
		const matchIndex = match.index ?? 0;
		const url = match[0];

		if (matchIndex > 0) {
			const before = text[matchIndex - 1] ?? "";
			const after = text[matchIndex + url.length] ?? "";
			if (before === "(" && after === ")" && matchIndex >= 2 && text[matchIndex - 2] === "]") {
				continue;
			}
		}

		let segmentStart = matchIndex;
		let allowNonWhitespacePrefix = false;

		let searchIndex = matchIndex;
		while (searchIndex > cursor) {
			const candidate = text[searchIndex - 1];
			if (candidate === "<") {
				segmentStart = searchIndex - 1;
				break;
			}
			if (candidate === "[") {
				segmentStart = searchIndex - 1;
				allowNonWhitespacePrefix = true;
				break;
			}
			if (!/\s/.test(candidate)) {
				break;
			}
			searchIndex -= 1;
		}

		const leading = text.slice(cursor, segmentStart);
		if (!allowNonWhitespacePrefix && !WHITESPACE_ONLY_REGEX.test(leading)) {
			return null;
		}

		const urlEnd = matchIndex + url.length;
		let segmentEnd = urlEnd;

		let lookahead = segmentEnd;
		while (lookahead < text.length && /\s/.test(text[lookahead])) {
			lookahead += 1;
		}

		if (lookahead < text.length && text[lookahead] === ">") {
			segmentEnd = lookahead + 1;
		} else if (allowNonWhitespacePrefix) {
			let closeIndex = lookahead;
			while (closeIndex < text.length && text[closeIndex] !== ")") {
				if (text[closeIndex] === "\n") {
					break;
				}
				closeIndex += 1;
			}
			if (closeIndex < text.length && text[closeIndex] === ")") {
				segmentEnd = closeIndex + 1;
			}
		} else {
			segmentEnd = urlEnd;
		}

		entries.push({
			url,
			start: segmentStart,
			end: segmentEnd,
		});

		cursor = segmentEnd;
	}

	const trailing = text.slice(cursor);
	if (!WHITESPACE_ONLY_REGEX.test(trailing)) {
		return null;
	}

	return entries;
}

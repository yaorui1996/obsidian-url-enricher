import type { PreviewStyle, PreviewColorMode } from "../settings";
import {
	CARD_LENGTH_MIN,
	CARD_LENGTH_MAX,
	INLINE_LENGTH_MIN,
	INLINE_LENGTH_MAX,
} from "../constants";

/**
 * Page-level configuration that can override global settings via frontmatter
 */
export interface PageConfig {
	previewStyle?: PreviewStyle;
	maxCardLength?: number;
	maxInlineLength?: number;
	showFavicon?: boolean;
	includeDescription?: boolean;
	inlineColorMode?: PreviewColorMode;
	cardColorMode?: PreviewColorMode;
}

/**
 * Parse frontmatter from the document to extract page-level preview configuration
 * Frontmatter must start on line 1 with --- and end with ---
 */
export function parsePageConfig(text: string): PageConfig {
	const config: PageConfig = {};

	// Check if document starts with frontmatter
	if (!text.startsWith('---')) {
		return config;
	}

	// Find the closing ---
	const lines = text.split('\n');
	let endIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === '---') {
			endIndex = i;
			break;
		}
	}

	if (endIndex === -1) {
		return config;
	}

	// Parse frontmatter lines
	const frontmatter = lines.slice(1, endIndex);

	for (const line of frontmatter) {
		// Preview style
		const styleMatch = line.match(/^preview-style:\s*(.+)$/i);
		if (styleMatch) {
			const value = styleMatch[1].trim().toLowerCase();
			if (value === 'inline' || value === 'card' || value === 'favicon') {
				config.previewStyle = value;
			}
		}

		// Max card length
		const maxCardMatch = line.match(/^max-card-length:\s*(\d+)$/i);
		if (maxCardMatch) {
			const value = parseInt(maxCardMatch[1], 10);
			if (value >= CARD_LENGTH_MIN && value <= CARD_LENGTH_MAX) {
				config.maxCardLength = value;
			}
		}

		// Max inline length
		const maxInlineMatch = line.match(/^max-inline-length:\s*(\d+)$/i);
		if (maxInlineMatch) {
			const value = parseInt(maxInlineMatch[1], 10);
			if (value >= INLINE_LENGTH_MIN && value <= INLINE_LENGTH_MAX) {
				config.maxInlineLength = value;
			}
		}

		// Show favicon
		const faviconMatch = line.match(/^show-favicon:\s*(.+)$/i);
		if (faviconMatch) {
			const value = faviconMatch[1].trim().toLowerCase();
			if (value === 'true' || value === 'false') {
				config.showFavicon = value === 'true';
			}
		}

		// Include description
		const descMatch = line.match(/^include-description:\s*(.+)$/i);
		if (descMatch) {
			const value = descMatch[1].trim().toLowerCase();
			if (value === 'true' || value === 'false') {
				config.includeDescription = value === 'true';
			}
		}

		// Inline color mode
		const inlineColorMatch = line.match(/^inline-color-mode:\s*(.+)$/i);
		if (inlineColorMatch) {
			const value = inlineColorMatch[1].trim().toLowerCase();
			if (value === 'none' || value === 'subtle') {
				config.inlineColorMode = value;
			}
		}

		// Card color mode
		const cardColorMatch = line.match(/^card-color-mode:\s*(.+)$/i);
		if (cardColorMatch) {
			const value = cardColorMatch[1].trim().toLowerCase();
			if (value === 'none' || value === 'subtle') {
				config.cardColorMode = value;
			}
		}
	}

	return config;
}

/**
 * Check if document has any frontmatter properties defined
 * @param text - Document text to check for frontmatter
 * @returns true if page has frontmatter with at least one property, false otherwise
 */
export function hasFrontmatter(text: string): boolean {
	const config = parsePageConfig(text);
	return Object.keys(config).length > 0;
}

/**
 * Parse page-level preview config from Obsidian's parsed frontmatter object
 * (as provided to MarkdownPostProcessorContext.frontmatter in Reading view,
 * where there is no document text to run parsePageConfig on).
 *
 * Reuses parsePageConfig as the single source of validation truth by
 * synthesizing a `---\nkey: value\n---` document from the known keys and
 * letting the existing regex/range checks accept or reject each value.
 */
export function parsePageConfigFromFrontmatter(
	frontmatter: Record<string, unknown> | undefined | null
): PageConfig {
	if (!frontmatter) {
		return {};
	}

	const KNOWN_KEYS = [
		"preview-style",
		"max-card-length",
		"max-inline-length",
		"show-favicon",
		"include-description",
		"inline-color-mode",
		"card-color-mode",
	] as const;

	const lines: string[] = [];
	for (const key of KNOWN_KEYS) {
		const value = frontmatter[key];
		// Frontmatter values relevant here are scalars; skip anything else
		// (arrays/objects) rather than stringifying them blind.
		if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
			continue;
		}
		lines.push(`${key}: ${value}`);
	}

	if (lines.length === 0) {
		return {};
	}

	return parsePageConfig(`---\n${lines.join("\n")}\n---`);
}

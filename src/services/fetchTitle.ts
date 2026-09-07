/**
 * fetchTitle - Standalone "URL → preview text" extractor
 *
 * Packages the plugin's inline-preview title logic (requestUrl → HtmlParser →
 * metadataHandlers → title fallback chain) as a plain async function that runs
 * anywhere fetch runs - no Obsidian, no CodeMirror. Used by the fetch-title
 * CLI (see scripts/fetch-title.mjs) so external tools like openclaw can ask
 * "what text would the plugin display for this URL?".
 */

import type { RequestUrlParam } from "obsidian";
import { LinkPreviewService } from "./linkPreviewService";
import type { LinkMetadata } from "./types";
import type { InlineLinkPreviewSettings } from "../settings";
import { DEFAULT_SETTINGS } from "../settings";
import { deriveTitleFromUrl } from "../utils/url";
import type { RequestExecutor } from "./MetadataFetcher";

export interface FetchTitleResult {
	/** The URL as passed in */
	url: string;
	/** The title the plugin would display (never empty - falls back to the hostname) */
	title: string;
	/** Page description, when the page declares one */
	description: string | null;
	/** Site name from og:site_name / application-name */
	siteName: string | null;
	/** "HTTP 404" / "network:..." when the fetch failed, null on success */
	error: string | null;
}

export interface FetchTitleOptions {
	/** Request timeout in milliseconds (default: 7000, same as the plugin default) */
	timeoutMs?: number;
	/** Flag HTTP >= 400 responses as errors (default: true, same as the plugin default) */
	showHttpErrorWarnings?: boolean;
	/** Override the HTTP executor; defaults to global fetch wrapped in the RequestUrlResponse shape */
	requestExecutor?: RequestExecutor;
}

/**
 * Build a fetch-based executor that mirrors Obsidian's RequestUrlResponse,
 * so the whole pipeline (fetcher, handlers, validator) runs unmodified.
 */
function createFetchExecutor(): RequestExecutor {
	return async (request: RequestUrlParam) => {
		// Global fetch, not obsidian's requestUrl: fetchTitle runs outside
		// Obsidian too (the fetch-title CLI), where requestUrl doesn't exist.
		// The no-restricted-globals warning for `fetch` is suppressed for this
		// file in eslint.config.js - that is the whole point of this executor.
		const response = await fetch(request.url, {
			method: request.method ?? "GET",
			headers: request.headers,
		});

		// The body can only be consumed once - read it as text and derive the
		// other RequestUrlResponse fields from that single read.
		const text = await response.text();
		let json: unknown = null;
		try {
			json = JSON.parse(text);
		} catch {
			// Non-JSON body - obsidian's requestUrl would throw on .json too
		}
		const arrayBuffer: ArrayBuffer = new TextEncoder().encode(text).buffer;

		const headers: Record<string, string> = {};
		response.headers.forEach((value, key) => {
			headers[key] = value;
		});

		return {
			status: response.status,
			headers,
			arrayBuffer,
			json,
			text,
		};
	};
}

function buildSettings(options: FetchTitleOptions): InlineLinkPreviewSettings {
	return {
		...DEFAULT_SETTINGS,
		requestTimeoutMs: options.timeoutMs ?? DEFAULT_SETTINGS.requestTimeoutMs,
		showHttpErrorWarnings: options.showHttpErrorWarnings ?? true,
	};
}

/**
 * Fetch a URL and resolve the title text the plugin's inline preview would show.
 *
 * Title resolution matches the decoration pipeline: fetched page title, with
 * domain-derived fallback when the page offers nothing usable.
 */
export async function fetchTitle(url: string, options: FetchTitleOptions = {}): Promise<FetchTitleResult> {
	const service = new LinkPreviewService(
		{ requestTimeoutMs: options.timeoutMs ?? DEFAULT_SETTINGS.requestTimeoutMs },
		buildSettings(options),
		undefined,
		options.requestExecutor ?? createFetchExecutor()
	);

	let metadata: LinkMetadata;
	try {
		metadata = await service.getMetadata(url);
	} catch (error: unknown) {
		// getMetadata only rejects on unexpected bugs; surface it as a network error
		const message = error instanceof Error ? error.message : String(error);
		return {
			url,
			title: deriveTitleFromUrl(url),
			description: null,
			siteName: null,
			error: `network:${message}`,
		};
	}

	const title = metadata.title?.trim() ? metadata.title : deriveTitleFromUrl(url);
	return {
		url,
		title,
		description: metadata.description ?? null,
		siteName: metadata.siteName ?? null,
		error: metadata.error ?? null,
	};
}

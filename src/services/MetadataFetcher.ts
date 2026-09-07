import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
import type { RequestUrlResponseLike } from "./types";

/**
 * Executor abstraction so the fetch pipeline can run outside Obsidian
 * (e.g. the fetch-title CLI in plain Node) by injecting a fetch-based
 * implementation; the default keeps using Obsidian's requestUrl.
 */
export type RequestExecutor = (request: RequestUrlParam) => Promise<RequestUrlResponseLike>;

/**
 * Options for HTTP request timeout
 */
export interface FetcherOptions {
	requestTimeoutMs: number;
}

/**
 * MetadataFetcher - Handles HTTP requests with timeout support
 */
export class MetadataFetcher {
	constructor(
		private options: FetcherOptions,
		private requestExecutor: RequestExecutor = (request) => requestUrl(request)
	) {}

	updateOptions(options: Partial<FetcherOptions>): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Build standard request headers for fetching web pages
	 */
	buildRequestHeaders(): Record<string, string> {
		return {
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
		};
	}

	/**
	 * Fetch a URL with timeout support
	 */
	async fetchUrl(url: string): Promise<RequestUrlResponse> {
		const headers = this.buildRequestHeaders();
		const requestPromise = this.requestExecutor({ url, headers });

		if (this.options.requestTimeoutMs <= 0) {
			return await requestPromise;
		}

		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		try {
			const timeoutPromise = new Promise<never>((_, reject) => {
				timeoutId = globalThis.setTimeout(() => {
					reject(new Error("Request timed out"));
				}, this.options.requestTimeoutMs);
			});

			const response = await Promise.race([requestPromise, timeoutPromise]);
			return response;
		} finally {
			if (timeoutId !== null) {
				globalThis.clearTimeout(timeoutId);
			}
		}
	}

	/**
	 * Perform a custom request with timeout support
	 */
	async performRequest(request: RequestUrlParam): Promise<RequestUrlResponse> {
		const headers = {
			...this.buildRequestHeaders(),
			...(request.headers ?? {}),
		};

		const requestWithHeaders = { ...request, headers };
		const requestPromise = this.requestExecutor(requestWithHeaders);

		if (this.options.requestTimeoutMs <= 0) {
			return await requestPromise;
		}

		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		try {
			const timeoutPromise = new Promise<never>((_, reject) => {
				timeoutId = globalThis.setTimeout(() => {
					reject(new Error("Request timed out"));
				}, this.options.requestTimeoutMs);
			});

			const response = await Promise.race([requestPromise, timeoutPromise]);
			return response;
		} finally {
			if (timeoutId !== null) {
				globalThis.clearTimeout(timeoutId);
			}
		}
	}

	/**
	 * Extract a header value from the response (case-insensitive)
	 */
	getHeader(response: RequestUrlResponse, header: string): string | undefined {
		const headers = response.headers ?? {};
		const direct = headers[header];
		if (direct) {
			return direct;
		}
		const lower = header.toLowerCase();
		for (const [key, value] of Object.entries(headers)) {
			if (key.toLowerCase() === lower) {
				return value;
			}
		}
		return undefined;
	}
}

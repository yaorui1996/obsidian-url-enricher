import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchTitle } from "../../src/services/fetchTitle";
import type { RequestExecutor } from "../../src/services/MetadataFetcher";
import type { RequestUrlParam } from "obsidian";

/**
 * Minimal fetch executor: maps a URL pattern to a canned response body.
 * Keeps fetchTitle tests hermetic - no network, no DOMParser variance.
 */
function makeExecutor(routes: Record<string, { status?: number; body: string; contentType?: string }>): RequestExecutor {
	return async (request: RequestUrlParam) => {
		const route = routes[request.url];
		if (!route) {
			throw new Error(`no route for ${request.url}`);
		}
		return {
			status: route.status ?? 200,
			headers: { "content-type": route.contentType ?? "text/html; charset=utf-8" },
			arrayBuffer: new TextEncoder().encode(route.body).buffer as ArrayBuffer,
			json: null,
			text: route.body,
		};
	};
}

describe("fetchTitle", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("extracts og:title, og:description and og:site_name", async () => {
		const executor = makeExecutor({
			"https://example.com": {
				body: `<html><head>
					<meta property="og:title" content="My Page Title">
					<meta property="og:description" content="A fine page.">
					<meta property="og:site_name" content="Example">
				</head><body>hello</body></html>`,
			},
		});

		const result = await fetchTitle("https://example.com", { requestExecutor: executor });
		expect(result).toEqual({
			url: "https://example.com",
			title: "My Page Title",
			description: "A fine page.",
			siteName: "Example",
			error: null,
		});
	});

	it("falls back to <title> when Open Graph tags are absent", async () => {
		const executor = makeExecutor({
			"https://example.com/plain": {
				body: "<html><head><title>Just A Title</title></head></html>",
			},
		});

		const result = await fetchTitle("https://example.com/plain", { requestExecutor: executor });
		expect(result.title).toBe("Just A Title");
		expect(result.description).toBeNull();
		expect(result.error).toBeNull();
	});

	it("flags HTTP 404 as an error and falls back to the hostname title", async () => {
		const executor = makeExecutor({
			"https://example.com/missing": {
				status: 404,
				body: "not found",
			},
		});

		const result = await fetchTitle("https://example.com/missing", { requestExecutor: executor });
		expect(result.error).toBe("http:HTTP 404");
		expect(result.title).toBe("example.com");
	});

	it("falls back to hostname title for non-HTML content", async () => {
		const executor = makeExecutor({
			"https://example.com/doc.pdf": {
				body: "%PDF-1.4 fake",
				contentType: "application/pdf",
			},
		});

		const result = await fetchTitle("https://example.com/doc.pdf", { requestExecutor: executor });
		expect(result.error).toBeNull();
		expect(result.title).toBe("example.com");
	});

	it("surfaces network failures as error with hostname title", async () => {
		const executor: RequestExecutor = async () => {
			throw new Error("ECONNREFUSED");
		};

		const result = await fetchTitle("https://down.example.com/x", { requestExecutor: executor });
		expect(result.error).toBe("network:ECONNREFUSED");
		expect(result.title).toBe("down.example.com");
	});

	it("does not flag HTTP errors when showHttpErrorWarnings is off", async () => {
		const executor = makeExecutor({
			"https://example.com/gone": {
				status: 404,
				body: "<html><head><title>Soft Landing</title></head></html>",
			},
		});

		const result = await fetchTitle("https://example.com/gone", {
			requestExecutor: executor,
			showHttpErrorWarnings: false,
		});
		expect(result.error).toBeNull();
		expect(result.title).toBe("Soft Landing");
	});
});
